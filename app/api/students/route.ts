// app/api/students/route.ts
// Server-side, role-scoped access to the `students` table.
//
// Why this exists: the browser used to call `supabase.from('students')`
// directly with the anon key. Any authenticated (or, depending on the
// anon key's grants, even unauthenticated) browser session could read
// every student's name, DOB, phone, email, and medical data — a student
// logged into their own portal received the ENTIRE table and only
// filtered to their own row client-side. This route replaces every one of
// those direct reads/writes with a request that's scoped server-side,
// using the service-role key (supabaseAdmin), based on the caller's real
// NextAuth session:
//   - staff roles (admin/instructor/super_admin/operations) get the full
//     list, matching the existing RoleGate on /dashboard/students
//   - the 'student' role gets ONLY their own record
//
// This on its own does not stop someone from calling Supabase's REST API
// directly with the anon key — that requires Row Level Security to be
// enabled on the `students` table in Supabase (see the accompanying test
// plan / README note). This route is what makes it safe to lock that down:
// once RLS blocks the anon key, the app keeps working because all reads
// now go through here using the service-role key, which RLS doesn't apply to.

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { requireSession, requireRole, STUDENT_STAFF_ROLES, STUDENT_CREATION_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { generatePassword } from '@/lib/password';
import { sendWelcomeEmailServer } from '@/lib/email';

export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;

  const role = session.user.role;

  // Staff roles: full roster (same population the /dashboard/students page
  // has always shown to these roles).
  if (role && STUDENT_STAFF_ROLES.includes(role)) {
    const { data, error: dbError } = await supabaseAdmin
      .from('students')
      .select('*')
      .order('created_at', { ascending: true });

    if (dbError) {
      console.error('Error loading students:', dbError);
      return NextResponse.json({ error: 'Failed to load students.' }, { status: 500 });
    }
    return NextResponse.json({ students: data || [] });
  }

  // 'student' role: only their own record — never anyone else's.
  if (role === 'student') {
    const studentId = session.user.studentId;
    if (!studentId) {
      return NextResponse.json({ students: [] });
    }
    const { data, error: dbError } = await supabaseAdmin
      .from('students')
      .select('*')
      .eq('id', studentId)
      .limit(1);

    if (dbError) {
      console.error('Error loading own student record:', dbError);
      return NextResponse.json({ error: 'Failed to load student record.' }, { status: 500 });
    }
    return NextResponse.json({ students: data || [] });
  }

  // Any other role (e.g. maintenance) has no legitimate reason to read
  // student records.
  return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
}

// Creating a student creates TWO rows as one unit: the `students` training
// profile, and a `users` login (role='student') linked to it via
// `users.student_id`. These used to be two entirely separate flows — this
// one (POST /api/students) only ever wrote `students`, while creating a
// login was a different form (Setup Wizard → User Management) that only
// ever wrote `users` and never set `student_id`. A student created through
// either old path alone ended up with either a working login and no
// findable training profile, or a training profile with no way to log in.
// See lib/api-auth.ts's STUDENT_CREATION_ROLES comment for why this is
// scoped to admin/super_admin even though STUDENT_STAFF_ROLES (broader) can
// still view/edit existing students.
export async function POST(request: Request) {
  const { error } = await requireRole(STUDENT_CREATION_ROLES);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const {
    enrollmentId, name, initials, trainingStage, totalHours,
    medicalExpiry, email, phone, dateOfBirth, joinedDate, status,
  } = body as Record<string, unknown>;

  if (!name || !initials) {
    return NextResponse.json({ error: 'name and initials are required.' }, { status: 400 });
  }

  const trimmedEmail = typeof email === 'string' ? email.trim() : '';
  if (!trimmedEmail) {
    return NextResponse.json(
      { error: 'Email is required — it becomes the student\'s login.' },
      { status: 400 }
    );
  }

  // Fail fast with a clear message rather than letting a unique-constraint
  // error surface from the insert below.
  //
  // One wrinkle: deleting a student (DELETE /api/students/[id]) does NOT
  // remove their users row — it deactivates it and clears student_id, on
  // purpose, so login_audit history for that account stays intact (and so
  // the delete itself doesn't trip the same users_student_id_fkey
  // violation this soft-delete was built to avoid). That means the email
  // is still sitting in `users`, just deactivated and unlinked. Re-adding
  // a student with that same email — a normal thing to do, e.g.
  // re-enrolling someone — must NOT be treated the same as "someone else
  // is already using this email"; it should reactivate that old login
  // instead of bouncing the admin with a false-positive conflict.
  const { data: existingUser } = await supabaseAdmin
    .from('users')
    .select('id, role, is_active, student_id')
    .eq('email', trimmedEmail)
    .maybeSingle();

  const reactivatingUserId =
    existingUser && !existingUser.is_active && existingUser.role === 'student' && !existingUser.student_id
      ? existingUser.id
      : null;

  if (existingUser && !reactivatingUserId) {
    return NextResponse.json(
      { error: `A user with email ${trimmedEmail} already exists.` },
      { status: 409 }
    );
  }

  // 1. Create the training profile first, so we have an id to link the
  //    login to.
  const { data: student, error: studentError } = await supabaseAdmin
    .from('students')
    .insert({
      enrollment_id: enrollmentId,
      name,
      initials,
      training_stage: trainingStage,
      total_hours: totalHours,
      medical_expiry: medicalExpiry,
      email: trimmedEmail,
      phone,
      date_of_birth: dateOfBirth,
      joined_date: joinedDate,
      status,
    })
    .select()
    .single();

  if (studentError) {
    console.error('Error creating student:', studentError);
    return NextResponse.json({ error: 'Failed to create student.' }, { status: 500 });
  }

  // 2. Create (or reactivate) the login, linked back to the profile via
  //    student_id. A fresh password is issued either way — reactivating a
  //    deactivated login doesn't mean the old password should still work.
  const password = generatePassword();
  const hash = await bcrypt.hash(password, 10);

  const { error: userError } = reactivatingUserId
    ? await supabaseAdmin
        .from('users')
        .update({
          password_hash: hash,
          name,
          student_id: student.id,
          is_active: true,
          force_password_reset: true,
        })
        .eq('id', reactivatingUserId)
    : await supabaseAdmin.from('users').insert({
        email: trimmedEmail,
        password_hash: hash,
        name,
        role: 'student',
        student_id: student.id,
        is_active: true,
        force_password_reset: true,
      });

  if (userError) {
    console.error('Error creating student login:', userError);
    // Don't leave an orphaned training profile with no way to log in —
    // exactly the split this route exists to prevent.
    await supabaseAdmin.from('students').delete().eq('id', student.id);
    return NextResponse.json(
      { error: 'Failed to create student login; the training profile was rolled back.' },
      { status: 500 }
    );
  }

  const emailResult = await sendWelcomeEmailServer(trimmedEmail, name as string, password, 'student');

  return NextResponse.json({
    student,
    emailSent: emailResult.success,
    emailMessage: emailResult.message,
    // Only returned so the admin can copy it if the email failed — same
    // pattern as /api/admin/users.
    password: emailResult.success ? undefined : password,
  });
}

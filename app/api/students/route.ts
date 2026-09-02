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
//   - 'safety_officer' and 'maintenance' get a scoped, non-PII projection
//     (name, status, SPL number, no DOB/phone/email/medical) — enough to
//     resolve "which student is this" for a display join without exposing
//     the full record. safety_officer: the Breath Analyser Register's
//     "Select student" dropdown (see BA_TEST_WRITE_ROLES in
//     lib/permissions.ts). maintenance: flight records always show
//     studentName (see mapFlightRecordRows in lib/hooks/useFlightRecords.ts)
//     and maintenance can view flight records, so it needs this too even
//     though it has no roster-browsing UI of its own (2026-09-02).
//   - the 'student' role gets ONLY their own record
//
// See lib/permissions.ts's STUDENT_ROSTER_VIEW_ROLES for the roles that
// have an actual student-roster UI surface (the two Dashboard widgets) —
// keep that in sync with the staff/student branches below. maintenance is
// deliberately NOT in that constant: it gets non-403 data from this route
// (the scoped branch above), but has no roster-browsing widget that should
// light up for it — the two are independent, don't conflate them.
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
import { provisionRequirementsForStudent } from '@/lib/requirements-provisioning';

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

  // 'safety_officer' and 'maintenance': the same scoped, non-PII projection
  // — no DOB/phone/email/medical the way the staff branch above hands over.
  // safety_officer needs it for the Breath Analyser Register's "Select
  // student" dropdown. maintenance needs it for a different reason: it's in
  // FLIGHT_RECORDS_VIEW_ROLES, and every flight record display joins in
  // studentName (see mapFlightRecordRows in lib/hooks/useFlightRecords.ts,
  // which calls fetchStudents() directly, unconditionally, for every
  // flight-records reader) — without this branch that join 403'd for
  // maintenance on every page that shows flight records (found 2026-09-02).
  // lib/hooks/useStudents.ts's mapper already defaults every field not
  // selected here to '' /undefined, so this reuses the same fetcher/hook/
  // type as every other role — no client-side changes needed for either use.
  if (role === 'safety_officer' || role === 'maintenance') {
    const { data, error: dbError } = await supabaseAdmin
      .from('students')
      .select('id, name, initials, status, spl_number, enrollment_id, training_stage, total_hours')
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

// Creating a student writes THREE things as one unit: the `students`
// training profile, a `users` login (role='student') linked to it via
// `users.student_id`, and per-student `training_requirements` rows copied
// from that program's templates (see lib/requirements-provisioning.ts). The
// first two used to be two entirely separate flows — this one
// (POST /api/students) only ever wrote `students`, while creating a login
// was a different form (Setup Wizard → User Management) that only ever
// wrote `users` and never set `student_id`. A student created through
// either old path alone ended up with either a working login and no
// findable training profile, or a training profile with no way to log in.
// The requirements step was missing entirely until later — every student
// created before that fix has an empty Requirements Checklist until synced
// (Admin Setup -> Requirements -> "Sync to Students").
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
    medicalExpiry, email, phone, dateOfBirth, joinedDate, status, splNumber,
    splExpiryDate, splIssueDate, medicalIssueDate,
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
      // medical_expiry and date_of_birth are `date` columns — Postgres
      // rejects '' as an invalid date literal (unlike spl_number, a text
      // column, which tolerates it). `|| null` avoids that here, same
      // convention already used for the spl_* date fields below.
      medical_expiry: medicalExpiry || null,
      email: trimmedEmail,
      phone,
      date_of_birth: dateOfBirth || null,
      joined_date: joinedDate,
      status,
      spl_number: splNumber || null,
      spl_expiry_date: splExpiryDate || null,
      spl_issue_date: splIssueDate || null,
      // Medical (DGCA Class 1) issue date (2026-08-25) — paired with
      // medical_expiry above. See add-medical-issue-date.sql.
      medical_issue_date: medicalIssueDate || null,
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

  // 3. Provision this student's per-row training requirements by copying
  //    the template rows (student_id IS NULL, Admin Setup -> Requirements)
  //    for their program. Best-effort: a student with a working login and
  //    training profile but a requirements hiccup (e.g. no templates exist
  //    yet for their program) is recoverable via Admin Setup ->
  //    Requirements -> "Sync to Students" — rolling back the whole
  //    creation over this would not be, and is not warranted the way the
  //    login-creation failure above is.
  const provisionResult = await provisionRequirementsForStudent(
    student.id,
    trainingStage as string | undefined
  );
  if (provisionResult.error) {
    console.warn(`Requirements not fully provisioned for new student ${student.id}:`, provisionResult.error);
  }

  return NextResponse.json({
    student,
    emailSent: emailResult.success,
    emailMessage: emailResult.message,
    // Only returned so the admin can copy it if the email failed — same
    // pattern as /api/admin/users.
    password: emailResult.success ? undefined : password,
    requirementsProvisioned: provisionResult.provisioned,
    requirementsWarning: provisionResult.error,
  });
}

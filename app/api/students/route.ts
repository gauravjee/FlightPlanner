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
import { requireSession, requireRole, STUDENT_STAFF_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

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

export async function POST(request: Request) {
  const { error } = await requireRole(STUDENT_STAFF_ROLES);
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

  const { data, error: dbError } = await supabaseAdmin
    .from('students')
    .insert({
      enrollment_id: enrollmentId,
      name,
      initials,
      training_stage: trainingStage,
      total_hours: totalHours,
      medical_expiry: medicalExpiry,
      email,
      phone,
      date_of_birth: dateOfBirth,
      joined_date: joinedDate,
      status,
    })
    .select()
    .single();

  if (dbError) {
    console.error('Error creating student:', dbError);
    return NextResponse.json({ error: 'Failed to create student.' }, { status: 500 });
  }

  return NextResponse.json({ student: data });
}

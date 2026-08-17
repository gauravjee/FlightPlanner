// app/api/students/[id]/route.ts
// Staff-only update/delete for a single student record.
//
// Column updates are whitelisted here (rather than trusting whatever keys
// the client sends) so this endpoint can't be used to write to arbitrary
// columns even if a future caller sends an unexpected field.
//
// FIX (2026-08-17, per-user permission override round): PATCH/DELETE here
// were still gated to the broader STUDENT_STAFF_ROLES (which includes
// operations) instead of the narrower STUDENT_WRITE_ROLES the 2026-08-17
// role/tab matrix introduced to make operations view-only for Students —
// this route was missed when that matrix patch touched every OTHER write
// route. StudentCard.tsx's Edit/Remove buttons were correctly hidden from
// operations client-side, but operations could still have called this API
// directly and it would have gone through. Now uses requireModuleAccess,
// which is STUDENT_WRITE_ROLES-equivalent by default and additionally
// honors a super_admin-granted per-user override for operations/
// instructor/maintenance users (see lib/permissions.ts).
import { NextResponse } from 'next/server';
import { requireModuleAccess } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

type RouteContext = { params: Promise<{ id: string }> };

// camelCase (client) -> snake_case (db column) for every field the app is
// allowed to update on a student record.
const FIELD_MAP: Record<string, string> = {
  name: 'name',
  initials: 'initials',
  trainingStage: 'training_stage',
  totalHours: 'total_hours',
  medicalExpiry: 'medical_expiry',
  email: 'email',
  phone: 'phone',
  status: 'status',
  dateOfBirth: 'date_of_birth',
  joinedDate: 'joined_date',
  firstSoloDate: 'first_solo_date',
  assignedInstructorId: 'assigned_instructor_id',
};

export async function PATCH(request: Request, context: RouteContext) {
  const { error } = await requireModuleAccess('students', 'full');
  if (error) return error;

  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const dbUpdates: Record<string, unknown> = {};
  for (const [clientKey, dbKey] of Object.entries(FIELD_MAP)) {
    if (body[clientKey] !== undefined) {
      // assignedInstructorId can legitimately be cleared to null.
      dbUpdates[dbKey] = clientKey === 'assignedInstructorId'
        ? (body[clientKey] ? String(body[clientKey]) : null)
        : body[clientKey];
    }
  }

  if (Object.keys(dbUpdates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  const { error: dbError } = await supabaseAdmin
    .from('students')
    .update(dbUpdates)
    .eq('id', id);

  if (dbError) {
    console.error('Error updating student:', dbError);
    return NextResponse.json({ error: 'Failed to update student.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { error } = await requireModuleAccess('students', 'full');
  if (error) return error;

  const { id } = await context.params;

  // Unlink and deactivate any login tied to this profile FIRST, before
  // touching the students row. users.student_id has a foreign key back to
  // students.id, so deleting the student while a users row still
  // references it fails with a 23503 foreign-key-violation ("students" is
  // still referenced from table "users") — that's the bug this reordering
  // fixes. Clearing student_id is what actually satisfies the constraint;
  // is_active=false on top of that makes sure the login can't be used
  // again even though its link to a training profile is now gone.
  const { error: userDeactivateError } = await supabaseAdmin
    .from('users')
    .update({ is_active: false, student_id: null })
    .eq('student_id', id);

  if (userDeactivateError) {
    console.error('Error deactivating student login before profile delete:', userDeactivateError);
    return NextResponse.json({ error: 'Failed to delete student.' }, { status: 500 });
  }

  const { error: dbError } = await supabaseAdmin
    .from('students')
    .delete()
    .eq('id', id);

  if (dbError) {
    console.error('Error deleting student:', dbError);
    return NextResponse.json({ error: 'Failed to delete student.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

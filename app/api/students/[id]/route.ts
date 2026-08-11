// app/api/students/[id]/route.ts
// Staff-only update/delete for a single student record.
//
// Column updates are whitelisted here (rather than trusting whatever keys
// the client sends) so this endpoint can't be used to write to arbitrary
// columns even if a future caller sends an unexpected field.

import { NextResponse } from 'next/server';
import { requireRole, STUDENT_STAFF_ROLES } from '@/lib/api-auth';
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
  const { error } = await requireRole(STUDENT_STAFF_ROLES);
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
  const { error } = await requireRole(STUDENT_STAFF_ROLES);
  if (error) return error;

  const { id } = await context.params;

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

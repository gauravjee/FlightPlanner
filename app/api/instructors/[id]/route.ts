// app/api/instructors/[id]/route.ts
// Server-side, role-scoped update/delete for a single instructor record —
// including canSelfBook, the per-instructor Schedule self-booking flag a
// super_admin grants from the Instructors tab (see
// add-instructor-self-booking-permission.sql and
// lib/api-auth.ts's requireScheduleCreateAccess()).

import { NextResponse } from 'next/server';
import { requireRole, INSTRUCTORS_WRITE_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

type RouteContext = { params: Promise<{ id: string }> };

const FIELD_MAP: Record<string, string> = {
  name: 'name',
  initials: 'initials',
  licenseNumber: 'license_number',
  ratings: 'ratings',
  maxDailyHours: 'max_daily_hours',
  email: 'email',
  phone: 'phone',
  status: 'status',
  canSelfBook: 'can_self_book',
};

export async function PATCH(request: Request, context: RouteContext) {
  const { error } = await requireRole(INSTRUCTORS_WRITE_ROLES);
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
      dbUpdates[dbKey] = body[clientKey];
    }
  }

  if (Object.keys(dbUpdates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  const { error: dbError } = await supabaseAdmin.from('instructors').update(dbUpdates).eq('id', id);

  if (dbError) {
    console.error('Error updating instructor:', dbError);
    return NextResponse.json({ error: 'Failed to update instructor.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { error } = await requireRole(INSTRUCTORS_WRITE_ROLES);
  if (error) return error;

  const { id } = await context.params;

  const { error: dbError } = await supabaseAdmin.from('instructors').delete().eq('id', id);

  if (dbError) {
    console.error('Error deleting instructor:', dbError);
    return NextResponse.json({ error: 'Failed to delete instructor.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

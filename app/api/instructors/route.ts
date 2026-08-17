// app/api/instructors/route.ts
// Server-side, role-scoped create for the `instructors` table (the
// full roster — separate from an individual instructor's own "My
// Students" page). Per the 2026-08-17 role/tab matrix, only admin/
// super_admin manage the roster itself.

import { NextResponse } from 'next/server';
import { requireRole, INSTRUCTORS_WRITE_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: Request) {
  const { error } = await requireRole(INSTRUCTORS_WRITE_ROLES);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { name, initials, licenseNumber, ratings, maxDailyHours, email, phone, status } =
    body as Record<string, unknown>;

  if (!name || !initials) {
    return NextResponse.json({ error: 'name and initials are required.' }, { status: 400 });
  }

  const { data, error: dbError } = await supabaseAdmin
    .from('instructors')
    .insert({
      name, initials,
      license_number: licenseNumber,
      ratings,
      max_daily_hours: maxDailyHours,
      email, phone, status,
      // can_self_book intentionally omitted — defaults to false (see
      // add-instructor-self-booking-permission.sql). Granted afterward by
      // a super_admin via PATCH, never at creation time.
    })
    .select()
    .single();

  if (dbError) {
    console.error('Error creating instructor:', dbError);
    return NextResponse.json({ error: 'Failed to create instructor.' }, { status: 500 });
  }

  return NextResponse.json({ instructor: data });
}

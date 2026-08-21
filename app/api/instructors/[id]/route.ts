// app/api/instructors/[id]/route.ts
// Server-side, role-scoped update/delete for a single instructor record —
// including canSelfBook, the per-instructor Schedule self-booking flag a
// super_admin grants from the Instructors tab (see
// add-instructor-self-booking-permission.sql and
// lib/api-auth.ts's requireScheduleCreateAccess()).

import { NextResponse } from 'next/server';
import { requireModuleAccess } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

type RouteContext = { params: Promise<{ id: string }> };

const FIELD_MAP: Record<string, string> = {
  name: 'name',
  initials: 'initials',
  licenseNumber: 'license_number',
  licenseExpiryDate: 'license_expiry_date',
  licenseIssueDate: 'license_issue_date',
  ratings: 'ratings',
  maxDailyHours: 'max_daily_hours',
  email: 'email',
  phone: 'phone',
  status: 'status',
  canSelfBook: 'can_self_book',
};

export async function PATCH(request: Request, context: RouteContext) {
  const { session, error } = await requireModuleAccess('instructors', 'full');
  if (error) return error;

  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // 2026-08-20: licenseNumber (CPL number) can't be cleared to blank on
  // edit either — same reasoning as the POST route's check. A field that's
  // simply not sent (undefined) is untouched as normal; only an explicit
  // blank/whitespace-only value is rejected.
  if (body.licenseNumber !== undefined && (typeof body.licenseNumber !== 'string' || !body.licenseNumber.trim())) {
    return NextResponse.json({ error: 'CPL license number cannot be blank.' }, { status: 400 });
  }

  const dbUpdates: Record<string, unknown> = {};
  for (const [clientKey, dbKey] of Object.entries(FIELD_MAP)) {
    if (body[clientKey] !== undefined) {
      dbUpdates[dbKey] = body[clientKey];
    }
  }

  // license_expiry_date/license_issue_date are `date` columns — Postgres
  // rejects '' as an invalid date literal, unlike license_number (text)
  // which tolerates it. Clearing either date in the form sends '', which
  // needs to become null here rather than being passed straight through.
  if (dbUpdates.license_expiry_date === '') {
    dbUpdates.license_expiry_date = null;
  }
  if (dbUpdates.license_issue_date === '') {
    dbUpdates.license_issue_date = null;
  }

  // canSelfBook stays super_admin-only regardless of module access —
  // Full Access to the Instructors module (whether from a role default or
  // a per-user override) is about roster management, not about granting
  // someone else Schedule self-booking. Silently drop it rather than 403
  // the whole request, same as the field just wasn't sent.
  if (session.user.role !== 'super_admin') {
    delete dbUpdates.can_self_book;
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
  const { error } = await requireModuleAccess('instructors', 'full');
  if (error) return error;

  const { id } = await context.params;

  const { error: dbError } = await supabaseAdmin.from('instructors').delete().eq('id', id);

  if (dbError) {
    console.error('Error deleting instructor:', dbError);
    return NextResponse.json({ error: 'Failed to delete instructor.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

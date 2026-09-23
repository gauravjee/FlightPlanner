// app/api/instructors/[id]/route.ts
// Server-side, role-scoped update/delete for a single instructor record —
// including canSelfBook, the per-instructor Schedule self-booking flag a
// super_admin grants from the Instructors tab (see
// add-instructor-self-booking-permission.sql and
// lib/api-auth.ts's requireScheduleCreateAccess()).

import { NextResponse } from 'next/server';
import { requireModuleAccess } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { todayIST } from '@/lib/ist';

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
  employmentStatus: 'employment_status', // 2026-09-23, add-instructor-employment-status.sql
  lastWorkingDate: 'last_working_date', // 2026-09-24, add-instructor-last-working-date.sql
  joiningDate: 'joining_date', // 2026-09-24, add-staff-joining-date.sql
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
  if (dbUpdates.joining_date === '') dbUpdates.joining_date = null;
  if (dbUpdates.joining_date && !/^\d{4}-\d{2}-\d{2}$/.test(String(dbUpdates.joining_date))) {
    return NextResponse.json({ error: 'Joining date must be a date.' }, { status: 400 });
  }

  // canSelfBook stays super_admin-only regardless of module access —
  // Full Access to the Instructors module (whether from a role default or
  // a per-user override) is about roster management, not about granting
  // someone else Schedule self-booking. Silently drop it rather than 403
  // the whole request, same as the field just wasn't sent.
  if (session.user.role !== 'super_admin') {
    delete dbUpdates.can_self_book;
  }

  // 2026-09-23: employment status (Active/Inactive) — admin/super_admin only,
  // even for someone granted Full Access to Instructors by override: marking
  // an instructor Inactive pulls them out of booking and student assignment,
  // which is a management decision, not roster upkeep. Dropped silently like
  // can_self_book above; an unknown value is rejected.
  if (!['admin', 'super_admin'].includes(session.user.role ?? '')) {
    delete dbUpdates.employment_status;
    delete dbUpdates.last_working_date;
  } else if (dbUpdates.employment_status !== undefined && !['ACTIVE', 'INACTIVE'].includes(String(dbUpdates.employment_status))) {
    return NextResponse.json({ error: 'Employment status must be ACTIVE or INACTIVE.' }, { status: 400 });
  } else if (dbUpdates.employment_status === 'ACTIVE') {
    dbUpdates.last_working_date = null; // back at work: no last day
  } else if ((dbUpdates.employment_status === 'INACTIVE' || dbUpdates.last_working_date !== undefined)
    && !/^\d{4}-\d{2}-\d{2}$/.test(String(dbUpdates.last_working_date ?? ''))) {
    // 2026-09-24: reports use it to decide which periods still show them.
    return NextResponse.json({ error: 'Pick the last working day for an Inactive instructor.' }, { status: 400 });
  } else if (dbUpdates.last_working_date && String(dbUpdates.last_working_date) > todayIST()) {
    // Operator 2026-09-24: no future last days — mark them Inactive on or after it.
    return NextResponse.json({ error: "The last working day can't be in the future. Mark them Inactive on or after their last day." }, { status: 400 });
  }
  if (dbUpdates.joining_date && dbUpdates.last_working_date && String(dbUpdates.last_working_date) < String(dbUpdates.joining_date)) {
    return NextResponse.json({ error: "The last working day can't be before the joining date." }, { status: 400 });
  }

  if (Object.keys(dbUpdates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  const { data: rows, error: dbError } = await supabaseAdmin.from('instructors').update(dbUpdates).eq('id', id).select('id');

  if (dbError) {
    console.error('Error updating instructor:', dbError);
    return NextResponse.json({ error: 'Failed to update instructor.' }, { status: 500 });
  }

  if (!rows?.length) {
    return NextResponse.json({ error: 'Instructor not found.' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { error } = await requireModuleAccess('instructors', 'full');
  if (error) return error;

  const { id } = await context.params;

  const { data: rows, error: dbError } = await supabaseAdmin.from('instructors').delete().eq('id', id).select('id');

  if (dbError) {
    console.error('Error deleting instructor:', dbError);
    return NextResponse.json({ error: 'Failed to delete instructor.' }, { status: 500 });
  }

  if (!rows?.length) {
    return NextResponse.json({ error: 'Instructor not found.' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

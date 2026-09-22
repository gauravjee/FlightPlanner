// app/api/availability/route.ts
// Server-side, role-scoped create for the `availability` table (instructor/
// student leave & unavailability records).
//
// 2026-09-18 (RLS exposure remediation, see
// claude/rls-exposure-2026-09-18.md): lib/hooks/useAvailability.ts's
// addAvailability()/updateAvailability()/removeAvailability() used to write
// straight to Supabase with the anon key and no server-side role check at
// all. Gated to AVAILABILITY_VIEW_ROLES — per lib/permissions.ts's own
// comment there, this table has no separate write-only role set: admin/
// instructor/super_admin/operations can all view AND manage every leave
// record (no "own record only" restriction in the existing UI either — see
// app/dashboard/availability/page.tsx, which wraps the whole page,
// including the Add/Edit/Delete controls, in one RoleGate).
//
// createdBy is a free-text field the form lets the user type their own name
// into (not derived from the session) — a pre-existing data-integrity quirk.
// 2026-09-21: still true for admin/super_admin, but an instructor's record now
// always takes their session name.
//
// 2026-09-21 (leave ownership + approval): admin/super_admin create records
// for anyone (default APPROVED, as before). An instructor may only create
// leave for themselves and it always starts PENDING until an approver
// approves it. Operations is view-only here now.
//
// GET added 2026-09-18 (RLS remediation Step 3 — see
// claude/rls-remediation-progress-2026-09-18.md): reads used to be direct
// client-side `supabase.from('availability')` calls (anon key) from two
// places — useAvailability.ts's fetchAvailability() (full list, enrichment
// stays client-side) and its checkAvailability() helper (a filtered
// point-in-time query). Both now hit this one GET, unfiltered — checkAvailability
// filters the same result client-side instead of a separate server query;
// this table is small (leave records), so there's no real cost to that.
//
// Self-review fix, same day: initially gated to `requireSession()` only
// (matching the other reads moved this pass), but that's broader than the
// existing access model — AVAILABILITY_VIEW_ROLES already excludes student
// from the Availability *page*, and checkAvailability() is only ever
// exercised by a booking flow staff/instructors can reach (students can't
// create bookings — POST /api/scheduled-flights is 403 for them). No
// legitimate caller needs a broader grant than the page itself has, so this
// now matches AVAILABILITY_VIEW_ROLES exactly instead of "any logged-in
// user" — closes an unnecessary leak of every instructor/student leave
// reason to a session that can't even see the Availability page.

import { NextResponse } from 'next/server';
import { requireRole, getOwnInstructorId, AVAILABILITY_VIEW_ROLES, AVAILABILITY_APPROVER_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET() {
  const { error } = await requireRole(AVAILABILITY_VIEW_ROLES);
  if (error) return error;

  const { data, error: dbError } = await supabaseAdmin
    .from('availability')
    .select('*')
    .order('start_date', { ascending: true });

  if (dbError) {
    console.error('Error loading availability:', dbError);
    return NextResponse.json({ error: 'Failed to load availability.' }, { status: 500 });
  }

  return NextResponse.json({ records: data });
}

export async function POST(request: Request) {
  const { session, error } = await requireRole(AVAILABILITY_VIEW_ROLES);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { personType, personId, leaveType, startDate, endDate, startTime, endTime, reason, status, createdBy } =
    body as Record<string, unknown>;

  if (!personType || !personId || !leaveType || !startDate || !endDate) {
    return NextResponse.json(
      { error: 'personType, personId, leaveType, startDate and endDate are required.' },
      { status: 400 }
    );
  }

  let newStatus = status || 'APPROVED';
  let newCreatedBy = createdBy || null;
  if (!AVAILABILITY_APPROVER_ROLES.includes(session.user.role ?? '')) {
    const ownId = session.user.role === 'instructor' ? await getOwnInstructorId(session.user.email) : null;
    if (!ownId || personType !== 'instructor' || String(personId) !== ownId) {
      return NextResponse.json({ error: 'You can only add leave for yourself.' }, { status: 403 });
    }
    newStatus = 'PENDING';
    newCreatedBy = session.user.name || session.user.email || null;
  }

  const { data, error: dbError } = await supabaseAdmin
    .from('availability')
    .insert({
      person_type: personType, person_id: personId, leave_type: leaveType,
      start_date: startDate, end_date: endDate,
      start_time: startTime || null, end_time: endTime || null,
      reason: reason || null, status: newStatus, created_by: newCreatedBy,
    })
    .select()
    .single();

  if (dbError) {
    console.error('Error creating availability record:', dbError);
    return NextResponse.json({ error: 'Failed to create leave record.' }, { status: 500 });
  }

  return NextResponse.json({ record: data });
}

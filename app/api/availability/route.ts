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
import { cancelFlightsDuringLeave } from '@/lib/leave';

// 2026-09-23: resolves "who am I" for the self-service ownership checks
// below, for either self-service person type. Instructors have no cached id
// on the session (see getOwnInstructorId's own comment) so still need the
// email lookup; a student's id is already on the JWT (session.user.studentId,
// same field the self-booking flow in scheduled-flights/route.ts uses).
async function getOwnSelfServiceId(role: string | undefined, session: { user: { email?: string | null; studentId?: string | null } }): Promise<string | null> {
  if (role === 'instructor') return getOwnInstructorId(session.user.email);
  if (role === 'student') return session.user.studentId ?? null;
  return null;
}

export async function GET() {
  const { session, error } = await requireRole(AVAILABILITY_VIEW_ROLES);
  if (error) return error;

  let query = supabaseAdmin.from('availability').select('*').order('start_date', { ascending: true });

  // 2026-09-23: a student only ever sees their own leave requests — unlike
  // instructor/admin/operations/super_admin, who share one staff-wide leave
  // calendar (existing behavior, unchanged). Scoped server-side, not just
  // hidden in the UI, since this is the same GET the student's own client
  // calls.
  if (session.user.role === 'student') {
    const ownId = session.user.studentId;
    if (!ownId) return NextResponse.json({ records: [] });
    query = query.eq('person_type', 'student').eq('person_id', ownId);
  }

  const { data, error: dbError } = await query;

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
  // 2026-09-23: operations can enter leave on anyone's behalf (e.g. an
  // instructor's emergency leave), but it starts PENDING and only admin/
  // super_admin can approve it — nobody approves their own entry. Needs
  // add-availability-needs-admin-approval.sql.
  const needsAdminApproval = session.user.role === 'operations';
  if (needsAdminApproval) {
    newStatus = 'PENDING';
    newCreatedBy = session.user.name || session.user.email || null;
  }
  if (!AVAILABILITY_APPROVER_ROLES.includes(session.user.role ?? '')) {
    // 2026-09-23: was instructor-only ('student' added, same self-service
    // shape) — a non-approver may only ever file leave for themselves,
    // matching their own role's person type.
    const ownId = await getOwnSelfServiceId(session.user.role, session);
    const selfServiceType = session.user.role === 'instructor' ? 'instructor' : session.user.role === 'student' ? 'student' : null;
    if (!ownId || personType !== selfServiceType || String(personId) !== ownId) {
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
      ...(needsAdminApproval ? { needs_admin_approval: true } : {}),
    })
    .select()
    .single();

  if (dbError) {
    console.error('Error creating availability record:', dbError);
    return NextResponse.json({ error: 'Failed to create leave record.' }, { status: 500 });
  }

  // 2026-09-23: an approver adding leave directly (status APPROVED from the
  // start, never passing through PENDING) must cancel bookings in the range
  // too — otherwise the most common way staff record leave skips it. The
  // inserted row carries the leave's time window, so partial-day leave only
  // cancels overlapping flights. `autoCancel` tells the page what happened.
  const autoCancel = newStatus === 'APPROVED' ? await cancelFlightsDuringLeave(data) : undefined;

  return NextResponse.json({ record: data, autoCancel });
}

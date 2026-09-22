// app/api/scheduled-flights/[id]/route.ts
// Server-side, role-scoped update for a single `scheduled_flights` row —
// covers the drag-and-drop reschedule (ScheduleBoard.tsx), status
// transitions / check-in / check-out (DebriefForm.tsx), and cancel
// (FlightDetailModal.tsx). See app/api/scheduled-flights/route.ts for the
// create-side counterpart and lib/permissions.ts's SCHEDULE_MANAGE_ROLES
// comment for why this is gated to staff roles rather than
// SCHEDULE_VIEW_ROLES.
//
// FIELD_MAP is the union of every field the old client-side
// cancelFlight()/updateScheduledFlight() (lib/hooks/useScheduledFlights.ts)
// used to write directly — this route doesn't expand what's editable, just
// closes how it's reached. Scheduling validation (FTO-closed-day, aircraft
// conflict/buffer checks) stays client-side, unchanged — same precedent as
// the create route: that's data-integrity validation, not an authorization
// boundary.

import { NextResponse } from 'next/server';
import { requireRole, SCHEDULE_MANAGE_ROLES, SCHEDULE_APPROVER_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

type RouteContext = { params: Promise<{ id: string }> };

const FIELD_MAP: Record<string, string> = {
  status: 'status',
  cancellationReason: 'cancellation_reason',
  aircraftId: 'aircraft_id',
  instructorId: 'instructor_id',
  studentId: 'student_id',
  startTime: 'start_time',
  endTime: 'end_time',
  sortieType: 'sortie_type',
  exercise: 'exercise',
  notes: 'notes',
  weatherBriefed: 'weather_briefed',
  notamBriefed: 'notam_briefed',
  logbookPending: 'logbook_pending',
  pendingDebrief: 'pending_debrief',
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // 2026-09-22: approve/reject a student's self-booked PENDING_APPROVAL
  // request — narrower role set (SCHEDULE_APPROVER_ROLES, no instructor)
  // than every other write on this route, so checked and returned before
  // the general requireRole(SCHEDULE_MANAGE_ROLES) below.
  if (body.resolve !== undefined) {
    const { error: approverError } = await requireRole(SCHEDULE_APPROVER_ROLES);
    if (approverError) return approverError;

    if (body.resolve !== 'approve' && body.resolve !== 'reject') {
      return NextResponse.json({ error: "resolve must be 'approve' or 'reject'." }, { status: 400 });
    }
    const resolved = body.resolve === 'approve'
      ? { status: 'SCHEDULED' }
      : { status: 'CANCELLED', cancellation_reason: 'REJECTED' };

    const { data: rows, error: dbError } = await supabaseAdmin
      .from('scheduled_flights').update(resolved)
      .eq('id', id).eq('status', 'PENDING_APPROVAL').select('id');
    if (dbError) {
      console.error('Error resolving booking request:', dbError);
      return NextResponse.json({ error: 'Failed to resolve the request.' }, { status: 500 });
    }
    if (!rows?.length) {
      return NextResponse.json({ error: 'No booking request waiting for approval at this id.' }, { status: 409 });
    }
    return NextResponse.json({ success: true });
  }

  const { error } = await requireRole(SCHEDULE_MANAGE_ROLES);
  if (error) return error;

  const dbUpdates: Record<string, unknown> = {};
  for (const [clientKey, dbKey] of Object.entries(FIELD_MAP)) {
    if (body[clientKey] !== undefined) {
      dbUpdates[dbKey] = body[clientKey];
    }
  }

  if (Object.keys(dbUpdates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  const { data: rows, error: dbError } = await supabaseAdmin.from('scheduled_flights').update(dbUpdates).eq('id', id).select('id');

  if (dbError) {
    console.error('Error updating scheduled flight:', dbError);
    return NextResponse.json({ error: dbError.message || 'Failed to update the flight.' }, { status: 500 });
  }

  if (!rows?.length) {
    return NextResponse.json({ error: 'Scheduled flight not found.' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

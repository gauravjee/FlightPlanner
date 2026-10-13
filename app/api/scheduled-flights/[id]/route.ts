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
import { requireRole, SCHEDULE_MANAGE_ROLES, SCHEDULE_APPROVER_ROLES, ROSTER_OVERRIDE_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { studentBookingRefusal } from '@/lib/student-server';
import { flightHoursFromTimes } from '@/lib/flight-classification';
import { dailyLimitRefusal } from '@/lib/daily-limit';
import { isOnApprovedLeave } from '@/lib/leave';
import { MIN_FLIGHT_DURATION_MIN } from '@/lib/store';
import { rosterRefusal } from '@/lib/roster-server';
import { instructorLeftBefore } from '@/lib/staff-server';

type RouteContext = { params: Promise<{ id: string }> };

const FIELD_MAP: Record<string, string> = {
  status: 'status',
  cancellationReason: 'cancellation_reason',
  cancellationNote: 'cancellation_note', // 2026-09-23, add-cancellation-reasons-and-note.sql
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

    // 2026-09-24 (B2 review fix): approving a request re-checks that the
    // instructor is still active and not past their last working day — the
    // request may have been made before either changed.
    if (body.resolve === 'approve') {
      const { data: req } = await supabaseAdmin.from('scheduled_flights')
        .select('instructor_id, start_time').eq('id', id).maybeSingle();
      if (req?.instructor_id) {
        const { data: instr } = await supabaseAdmin.from('instructors').select('employment_status').eq('id', String(req.instructor_id)).maybeSingle();
        if (instr?.employment_status === 'INACTIVE') {
          return NextResponse.json({ error: 'This instructor is no longer active — reject the request or move it to another instructor.' }, { status: 403 });
        }
        const lastDay = await instructorLeftBefore(String(req.instructor_id), String(req.start_time));
        if (lastDay) {
          return NextResponse.json({ error: `This instructor's last working day is ${lastDay} — reject the request or move it to another instructor.` }, { status: 403 });
        }
      }
    }

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

  const { session, error } = await requireRole(SCHEDULE_MANAGE_ROLES);
  if (error) return error;

  const dbUpdates: Record<string, unknown> = {};
  for (const [clientKey, dbKey] of Object.entries(FIELD_MAP)) {
    if (body[clientKey] !== undefined) {
      dbUpdates[dbKey] = body[clientKey];
    }
  }
  if (dbUpdates.instructor_id === '') dbUpdates.instructor_id = null; // solo; never '' (fk-design-2026-10-08)

  if (Object.keys(dbUpdates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  // 2026-09-23: instructor guards on edits/reschedules (incl. drag-and-drop).
  // Both only act on what actually CHANGES — BookingForm's edit always
  // re-sends the current instructorId, and a notes-only edit of an existing
  // booking must still save even if its instructor has since left or its day
  // is already at the limit.
  if (['instructor_id', 'student_id', 'start_time', 'end_time', 'status'].some(k => dbUpdates[k] !== undefined)) {
    const { data: current } = await supabaseAdmin.from('scheduled_flights')
      .select('instructor_id, student_id, start_time, end_time, status').eq('id', id).maybeSingle();
    if (current) {
      const next = {
        instructor: String(dbUpdates.instructor_id ?? current.instructor_id ?? ''),
        student: String(dbUpdates.student_id ?? current.student_id ?? ''),
        start: String(dbUpdates.start_time ?? current.start_time),
        end: String(dbUpdates.end_time ?? current.end_time),
        status: String(dbUpdates.status ?? current.status),
      };
      const instructorChanged = next.instructor !== String(current.instructor_id ?? '');

      // 2026-09-23: same minimum the booking form enforces, only when the
      // times change (an older short flight can still get a notes edit).
      if (dbUpdates.start_time !== undefined || dbUpdates.end_time !== undefined) {
        const durationMin = (new Date(next.end).getTime() - new Date(next.start).getTime()) / 60_000;
        if (!(durationMin >= MIN_FLIGHT_DURATION_MIN)) {
          return NextResponse.json({ error: `A flight must be at least ${MIN_FLIGHT_DURATION_MIN} minutes long.` }, { status: 400 });
        }
      }

      // Moving a booking onto an Inactive instructor is refused, same as
      // creating one (app/api/scheduled-flights/route.ts).
      if (instructorChanged && next.instructor) {
        const { data: instr } = await supabaseAdmin.from('instructors').select('employment_status').eq('id', next.instructor).maybeSingle();
        if (instr?.employment_status === 'INACTIVE') {
          return NextResponse.json({ error: 'This instructor is no longer active and can\'t be booked.' }, { status: 403 });
        }
      }
      // Daily flying limit — HARD block, every role (lib/daily-limit.ts).
      // Checked when hours move onto someone's day: a different instructor,
      // different times, or a cancelled flight coming back. The flight's own
      // old slot is excluded so it isn't counted twice.
      const addsHours = instructorChanged
        || new Date(next.start).getTime() !== new Date(current.start_time).getTime()
        || new Date(next.end).getTime() !== new Date(current.end_time).getTime()
        || (current.status === 'CANCELLED' && next.status !== 'CANCELLED');

      // 2026-09-24 (B2 S3b + review fix): nor put after their last working day
      // (17:00 IST that day) — a move, a different instructor, or a cancelled
      // flight coming back.
      if (addsHours && next.instructor && next.status !== 'CANCELLED') {
        const lastDay = await instructorLeftBefore(next.instructor, next.start);
        if (lastDay) {
          return NextResponse.json({ error: `This instructor's last working day is ${lastDay} — they can't be booked after 17:00 that day.` }, { status: 403 });
        }
      }

      // Approved leave — HARD block, every role (2026-09-23 operator
      // decision). Same "only what changes" rule: a different person, new
      // times, or a cancelled flight coming back.
      const studentChanged = next.student !== String(current.student_id ?? '');
      if ((addsHours || studentChanged) && next.status !== 'CANCELLED') {
        if (next.instructor && await isOnApprovedLeave('instructor', next.instructor, next.start, next.end)) {
          return NextResponse.json({ error: 'This instructor has approved leave at this time and can\'t be booked.' }, { status: 403 });
        }
        if (next.student && await isOnApprovedLeave('student', next.student, next.start, next.end)) {
          return NextResponse.json({ error: 'This student has approved leave at this time and can\'t be booked.' }, { status: 403 });
        }
        // B4: only an Active student can be booked or moved.
        const refusal = next.student ? await studentBookingRefusal(next.student, next.start) : null;
        if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
      }
      if (addsHours && next.instructor && next.status !== 'CANCELLED') {
        const refusal = await dailyLimitRefusal(next.instructor, next.start, next.end, id);
        if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });

        // 2026-09-23 (roster step 3): same duty-hours rule as creating a
        // flight — only admin/super_admin may override, and the flag follows
        // where the flight now sits (cleared when a move brings it inside).
        const outside = await rosterRefusal(next.instructor, next.start, next.end);
        if (outside) {
          if (!ROSTER_OVERRIDE_ROLES.includes(session.user.role ?? '')) {
            return NextResponse.json({ error: outside }, { status: 403 });
          }
          if (body.rosterOverride !== true) {
            return NextResponse.json({ error: `${outside} Tick "Override roster" to book anyway.` }, { status: 403 });
          }
        }
        dbUpdates.roster_override = !!outside;
      }
    }
  }

  // Operator, 10 Oct: a checkout with the logbook left pending moves the aircraft's Hobbs here, server-side,
  // from this booking's own debrief; the client no longer sends a reading to the aircraft.
  let advanceTo: { aircraftId: string; end: number } | null = null;
  if (body.logbookPending === true) {
    const pd = (body.pendingDebrief ?? {}) as Record<string, unknown>;
    const start = Number(pd.hobbsStart);
    const end = Number(pd.hobbsEnd);
    const { data: bk } = await supabaseAdmin.from('scheduled_flights').select('aircraft_id, status').eq('id', id).maybeSingle();
    if (!bk) return NextResponse.json({ error: 'Scheduled flight not found.' }, { status: 404 });
    if (bk.status === 'COMPLETED') return NextResponse.json({ error: 'This flight is already checked out.' }, { status: 409 });
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return NextResponse.json({ error: 'Hobbs End must be greater than Hobbs Start.' }, { status: 400 });
    }
    const { data: ac } = await supabaseAdmin.from('aircraft').select('registration, hobbs_time').eq('id', bk.aircraft_id).maybeSingle();
    if (ac && Math.round(start * 10) < Math.round(Number(ac.hobbs_time) * 10)) {
      return NextResponse.json({ error: `Hobbs Start (${start}) can't be below ${ac.registration}'s current reading (${ac.hobbs_time}).` }, { status: 400 });
    }
    const flown = flightHoursFromTimes(pd.departureTime as string, pd.arrivalTime as string);
    if (end - start > flown + 1) {
      return NextResponse.json({ error: `Hobbs shows ${(end - start).toFixed(1)} h but the flight times give ${flown} h. Check the readings.` }, { status: 400 });
    }
    advanceTo = { aircraftId: String(bk.aircraft_id), end };
  }

  const { data: rows, error: dbError } = await supabaseAdmin.from('scheduled_flights').update(dbUpdates).eq('id', id).select('id');

  if (dbError) {
    console.error('Error updating scheduled flight:', dbError);
    return NextResponse.json({ error: dbError.message || 'Failed to update the flight.' }, { status: 500 });
  }

  if (!rows?.length) {
    return NextResponse.json({ error: 'Scheduled flight not found.' }, { status: 404 });
  }

  if (advanceTo) {
    const { error: acError } = await supabaseAdmin.from('aircraft').update({ hobbs_time: advanceTo.end })
      .eq('id', advanceTo.aircraftId).lt('hobbs_time', advanceTo.end); // only ever forward
    if (acError) console.error('Error advancing aircraft Hobbs at checkout:', acError);
  }

  return NextResponse.json({ success: true });
}

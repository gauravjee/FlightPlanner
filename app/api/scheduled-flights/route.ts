// app/api/scheduled-flights/route.ts
// Server-side authorization gate + create for a brand-new `scheduled_flights`
// row (booking). Enforces WHO may create a new booking at all — see
// lib/api-auth.ts's requireScheduleCreateAccess() / SCHEDULE_CREATE_ROLES:
// admin/super_admin/operations always can; an `instructor` only if their own
// instructors.can_self_book flag is on (Instructors tab, super_admin-only).
//
// Scope note: FTO-closed-day and aircraft-conflict/buffer checking (see
// lib/store.ts's bookFlight) stay client-side, unchanged — those are
// scheduling/data-integrity validation, not an authorization boundary, and
// porting that whole engine (turnaround buffers, fuel-based buffer sizing,
// holiday/weekly-off-day rules) server-side is a separate, much larger
// piece of work than "can this person create a booking at all." This route
// exists specifically to close the security gap: without it, an instructor
// without the self-book flag could still call Supabase directly with the
// anon key and insert a row, since the browser previously wrote to
// scheduled_flights with no server-side check whatsoever.

import { NextResponse } from 'next/server';
import { requireScheduleCreateAccess, requireSession, ROSTER_OVERRIDE_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
// 2026-09-23 (leave/vacation enforcement): only used in the student
// self-booking branch below — every other caller here is staff booking
// someone else, and BookingForm.tsx's leave check is advisory for staff
// (same as every other scheduling validation they can see and override). A
// self-booking student has no such override, so this is the real gate.
import { isOnApprovedLeave } from '@/lib/leave';
import { dailyLimitRefusal } from '@/lib/daily-limit';
import { MIN_FLIGHT_DURATION_MIN } from '@/lib/store';
import { rosterRefusal } from '@/lib/roster-server';
import { instructorLeftBefore } from '@/lib/staff-server';

// GET added 2026-09-18 (RLS remediation Step 3 — see
// claude/rls-remediation-progress-2026-09-18.md): reads used to be direct
// client-side `supabase.from('scheduled_flights')` calls (anon key) from
// three places — fetchScheduledFlights() (full list), checkConflicts()
// (aircraft + time-window filter, used live while booking/dragging a
// flight), and useHolidays.ts's countScheduleConflictsOnDate() (a day-range
// filter, no aircraft). One GET covers all three via optional query params
// instead of always pulling the full table — this table only grows, and
// checkConflicts runs interactively, so keeping the filter server-side
// (matching exactly what the old direct queries did) avoids a regression
// there. `excludeId` (a booking editing itself) stays a client-side
// post-filter, same as the original code already did.
// `requireSession()` only — no role restriction beyond "logged in," same
// reasoning as every other read moved this pass.
export async function GET(request: Request) {
  const { error } = await requireSession();
  if (error) return error;

  const url = new URL(request.url);
  const aircraftId = url.searchParams.get('aircraftId');
  const startTimeLt = url.searchParams.get('startTimeLt');
  const endTimeGt = url.searchParams.get('endTimeGt');
  const startTimeGte = url.searchParams.get('startTimeGte');
  const startTimeLte = url.searchParams.get('startTimeLte');
  const excludeCancelled = url.searchParams.get('excludeCancelled') === 'true';

  let query = supabaseAdmin.from('scheduled_flights').select('*');
  if (aircraftId) query = query.eq('aircraft_id', aircraftId);
  if (startTimeLt) query = query.lt('start_time', startTimeLt);
  if (endTimeGt) query = query.gt('end_time', endTimeGt);
  if (startTimeGte) query = query.gte('start_time', startTimeGte);
  if (startTimeLte) query = query.lte('start_time', startTimeLte);
  if (excludeCancelled) query = query.neq('status', 'CANCELLED');
  // Only the unfiltered full-list case (fetchScheduledFlights) needs a
  // stable order for display; the two filtered cases just consume the set.
  if (!aircraftId && !startTimeGte) query = query.order('start_time', { ascending: true });

  const { data, error: dbError } = await query;

  if (dbError) {
    console.error('Error loading scheduled flights:', dbError);
    return NextResponse.json({ error: 'Failed to load scheduled flights.' }, { status: 500 });
  }

  return NextResponse.json({ flights: data });
}

export async function POST(request: Request) {
  const { session, error } = await requireScheduleCreateAccess();
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  let {
    instructorId, studentId, status,
  } = body as Record<string, unknown>;
  const {
    aircraftId, startTime, endTime, sortieType, exercise, weatherBriefed, notamBriefed, notes,
  } = body as Record<string, unknown>;

  if (!aircraftId || !startTime || !endTime) {
    return NextResponse.json({ error: 'aircraftId, startTime, and endTime are required.' }, { status: 400 });
  }

  // 2026-09-23: same minimum the booking form enforces — a direct request
  // could otherwise save a zero-length, backwards or unparseable flight.
  const durationMin = (new Date(String(endTime)).getTime() - new Date(String(startTime)).getTime()) / 60_000;
  if (!(durationMin >= MIN_FLIGHT_DURATION_MIN)) {
    return NextResponse.json({ error: `A flight must be at least ${MIN_FLIGHT_DURATION_MIN} minutes long.` }, { status: 400 });
  }

  // 2026-09-22 (student self-booking): everything the client sent for
  // studentId/instructorId/status is untrusted here specifically because
  // requireScheduleCreateAccess() just let a STUDENT through — every other
  // role that passes that gate (admin/super_admin/operations always;
  // instructor only with can_self_book) is staff booking on someone else's
  // behalf, which is the existing, unrestricted behavior. A self-booking
  // student can only ever create a PENDING_APPROVAL request for themselves.
  let pendingApproval = false;
  let rosterOverride = false; // set below when admin/super_admin books outside the roster
  if (session.user.role === 'student') {
    if (!session.user.studentId) {
      return NextResponse.json({ error: 'No student profile is linked to this account.' }, { status: 403 });
    }
    studentId = session.user.studentId;
    pendingApproval = true;
    status = 'PENDING_APPROVAL';

    if (sortieType === 'MAINTENANCE') {
      return NextResponse.json({ error: 'Students cannot book a maintenance flight.' }, { status: 403 });
    }

    if (await isOnApprovedLeave('student', String(studentId), String(startTime), String(endTime))) {
      return NextResponse.json({ error: 'You have approved leave covering this time and cannot book a flight.' }, { status: 403 });
    }

    if (sortieType === 'SOLO') {
      // Same rule BookingForm.tsx's handleSubmit already enforces
      // client-side (any incomplete requirement flagged blocks_solo) —
      // duplicated here because this is now a self-serve path a student
      // reaches without a staff member in the loop until the approval step.
      const { data: blockingReqs } = await supabaseAdmin
        .from('training_requirements')
        .select('requirement_name')
        .eq('student_id', studentId)
        .eq('blocks_solo', true)
        .eq('is_completed', false)
        .limit(1);
      if (blockingReqs?.length) {
        return NextResponse.json(
          { error: `Not released for solo — missing: ${blockingReqs[0].requirement_name}.` },
          { status: 403 }
        );
      }
    } else {
      // Dual: a student cannot pick who instructs them — always their own
      // assigned instructor.
      const { data: student } = await supabaseAdmin
        .from('students')
        .select('assigned_instructor_id')
        .eq('id', studentId)
        .maybeSingle();
      if (!student?.assigned_instructor_id) {
        return NextResponse.json(
          { error: 'You have no assigned instructor yet — ask the office to book a dual flight for you.' },
          { status: 403 }
        );
      }
      instructorId = student.assigned_instructor_id;
      if (await isOnApprovedLeave('instructor', String(instructorId), String(startTime), String(endTime))) {
        return NextResponse.json({ error: 'Your instructor has approved leave covering this time — booking not allowed.' }, { status: 403 });
      }
    }
  }

  // 2026-09-23: approved leave is a HARD block for every role, no override
  // (operator decision) — staff used to get only a warning. The student
  // self-booking branch above already checked both people.
  if (session.user.role !== 'student') {
    if (instructorId && await isOnApprovedLeave('instructor', String(instructorId), String(startTime), String(endTime))) {
      return NextResponse.json({ error: 'This instructor has approved leave at this time and can\'t be booked.' }, { status: 403 });
    }
    if (studentId && await isOnApprovedLeave('student', String(studentId), String(startTime), String(endTime))) {
      return NextResponse.json({ error: 'This student has approved leave at this time and can\'t be booked.' }, { status: 403 });
    }
  }

  // 2026-09-23: an Inactive (left/retired) instructor can't be booked, by
  // anyone — the booking form hides them, this stops a direct request or a
  // student whose assigned instructor has since left.
  if (instructorId) {
    const { data: instr } = await supabaseAdmin.from('instructors').select('employment_status').eq('id', String(instructorId)).maybeSingle();
    if (instr?.employment_status === 'INACTIVE') {
      return NextResponse.json({
        error: session.user.role === 'student'
          ? 'Your assigned instructor is no longer active — ask the office to reassign you.'
          : 'This instructor is no longer active and can\'t be booked.',
      }, { status: 403 });
    }
    // 2026-09-24 (B2 S3b): nor after their last working day (17:00 IST that day), by anyone.
    const lastDay = await instructorLeftBefore(String(instructorId), String(startTime));
    if (lastDay) {
      return NextResponse.json({ error: `This instructor's last working day is ${lastDay} — they can't be booked after 17:00 that day.` }, { status: 403 });
    }

    // 2026-09-23: daily flying limit — HARD block for every role, no
    // override (lib/daily-limit.ts). Solo flights have no instructor and
    // skip this whole block.
    const refusal = await dailyLimitRefusal(String(instructorId), String(startTime), String(endTime));
    if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });

    // 2026-09-23 (roster step 3): outside the instructor's duty hours is
    // blocked; only admin/super_admin may override, and the flight is marked.
    const outside = await rosterRefusal(String(instructorId), String(startTime), String(endTime));
    if (outside) {
      if (!ROSTER_OVERRIDE_ROLES.includes(session.user.role ?? '')) {
        return NextResponse.json({ error: outside }, { status: 403 });
      }
      if (body.rosterOverride !== true) {
        return NextResponse.json({ error: `${outside} Tick "Override roster" to book anyway.` }, { status: 403 });
      }
      rosterOverride = true;
    }
  }

  const { error: dbError } = await supabaseAdmin.from('scheduled_flights').insert({
    aircraft_id: aircraftId,
    instructor_id: instructorId || null, // never '' (the column becomes bigint, fk-design-2026-10-08)
    student_id: studentId || null,
    start_time: startTime,
    end_time: endTime,
    sortie_type: sortieType,
    exercise: exercise || '',
    status: status || 'SCHEDULED',
    weather_briefed: weatherBriefed || false,
    notam_briefed: notamBriefed || false,
    notes: notes || '',
    roster_override: rosterOverride,
  });

  if (dbError) {
    console.error('Error creating scheduled flight:', dbError);
    return NextResponse.json({ error: 'Failed to book flight.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, pendingApproval });
}

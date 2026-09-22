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
import { requireScheduleCreateAccess, requireSession } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

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

  // 2026-09-22 (student self-booking): everything the client sent for
  // studentId/instructorId/status is untrusted here specifically because
  // requireScheduleCreateAccess() just let a STUDENT through — every other
  // role that passes that gate (admin/super_admin/operations always;
  // instructor only with can_self_book) is staff booking on someone else's
  // behalf, which is the existing, unrestricted behavior. A self-booking
  // student can only ever create a PENDING_APPROVAL request for themselves.
  let pendingApproval = false;
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
    }
  }

  const { error: dbError } = await supabaseAdmin.from('scheduled_flights').insert({
    aircraft_id: aircraftId,
    instructor_id: instructorId,
    student_id: studentId || null,
    start_time: startTime,
    end_time: endTime,
    sortie_type: sortieType,
    exercise: exercise || '',
    status: status || 'SCHEDULED',
    weather_briefed: weatherBriefed || false,
    notam_briefed: notamBriefed || false,
    notes: notes || '',
  });

  if (dbError) {
    console.error('Error creating scheduled flight:', dbError);
    return NextResponse.json({ error: 'Failed to book flight.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, pendingApproval });
}

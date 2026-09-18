// app/api/flight-records/route.ts
// Server-side, role-scoped read/create for the `flight_records` table (the
// digital logbook).
//
// GET added 2026-09-11: lib/hooks/useFlightRecords.ts used to query
// `flight_records` straight from the browser with the public anon key —
// every field of every student's logbook (instructor notes, performance
// ratings, PICUS hours), unfiltered, shipped to any signed-in session
// including a student's own. This route closes that: a `student` session
// always gets only their own records (any `?studentId` is ignored — same
// IDOR-safe pattern as GET /api/students), and requires being signed in at
// all, which the anon key alone never did. Every other role keeps exactly
// the "all records" access it already had via the app's UI (the staff
// logbook page and the Dashboard's Student Progress widget together cover
// every non-student role) — nothing tightened there, just moved
// server-side. See enable-rls-flight-records.sql: once this is the only
// path to the table (it now is — the other three `.from('flight_records')`
// call sites already use supabaseAdmin), RLS can close the table to the
// anon key entirely, the same two-step sequence enable-rls-users-
// students.sql used for `users`/`students`.
//
// POST: flight records are add-only from the UI today (no edit/delete
// anywhere in lib/store.ts or FlightRecordForm.tsx). Per the 2026-08-17
// role/tab matrix, operations isn't on this tab at all; maintenance can
// view the logbook but not log a flight.
//
// Also performs the side effects lib/store.ts's addFlightRecord used to do
// as extra client-side calls: crediting the student's total hours (and
// first-solo date, the first time), and advancing the aircraft's hobbs
// time. Done here, server-side, via supabaseAdmin directly, so they aren't
// separately gated by STUDENT_WRITE_ROLES / AIRCRAFT_WRITE_ROLES — these
// are a system-internal consequence of logging a flight, not a separate
// "edit a student" or "edit an aircraft" action, and FLIGHT_RECORDS_WRITE_
// ROLES is already the right authority to allow them.

import { NextResponse } from 'next/server';
import { requireSession, requireModuleAccess } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { flightHoursFromTimes } from '@/lib/flight-classification';

export async function GET(request: Request) {
  const { session, error } = await requireSession();
  if (error) return error;

  const role = session.user.role;
  const { searchParams } = new URL(request.url);
  // A student can only ever see their own records — any ?studentId is
  // ignored for this role. Every other role may pass one to scope the
  // query (e.g. a future "this student's logbook" view for staff); with
  // none, staff get the same "most recent 100 across everyone" the direct
  // client used to return unconditionally.
  const studentId = role === 'student' ? session.user.studentId : searchParams.get('studentId');

  if (role === 'student' && !studentId) {
    return NextResponse.json({ records: [] });
  }

  let query = supabaseAdmin.from('flight_records').select('*').order('flight_date', { ascending: false });
  query = studentId ? query.eq('student_id', studentId) : query.limit(100);

  const { data, error: dbError } = await query;
  if (dbError) {
    console.error('Error loading flight records:', dbError);
    return NextResponse.json({ error: 'Failed to load flight records.' }, { status: 500 });
  }

  return NextResponse.json({ records: data || [] });
}

export async function POST(request: Request) {
  const { error } = await requireModuleAccess('flightRecords', 'full');
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const {
    studentId, aircraftId, instructorId, flightDate, departureTime, arrivalTime,
    hobbsStart, hobbsEnd, landings, flightType, sortieType, exercise, maneuvers,
    instructorNotes, studentPerformance, weatherConditions,
    picusHours,
  } = body as Record<string, unknown>;

  if (!studentId || !aircraftId) {
    return NextResponse.json({ error: 'studentId and aircraftId are required.' }, { status: 400 });
  }

  // 2026-09-18 (P0 #3, hobbs integrity — audit finding C2): hobbs_time used
  // to be overwritten below with whatever the client sent, completely
  // unvalidated — FlightRecordForm initialised Hobbs End at 0, the field
  // wasn't required, and nothing server-side checked it either. A submitted
  // flight with Hobbs End left at 0 silently reset the airframe's real hobbs
  // reading to 0, and every hour-based maintenance interval then computed
  // from that zero anchor. This is the one place that writes aircraft.
  // hobbs_time for a flight, so it's the authoritative check — the form's
  // own (also newly-added) client-side guard is a courtesy, not the gate.
  const hobbsStartNum = Number(hobbsStart);
  const hobbsEndNum = Number(hobbsEnd);
  if (!Number.isFinite(hobbsStartNum) || hobbsStartNum < 0 || !Number.isFinite(hobbsEndNum) || hobbsEndNum <= hobbsStartNum) {
    return NextResponse.json({ error: 'Hobbs Start and Hobbs End must be valid numbers, with Hobbs End greater than Hobbs Start.' }, { status: 400 });
  }

  // 2026-09-18 (P0 #1, flight-hours integrity): computed here, server-side,
  // from the submitted departure/arrival times — not trusted from the
  // client's own `totalHours`, which FlightRecordForm.tsx used to compute
  // with a second, independently-drifted copy of this arithmetic (one that
  // clamped a midnight-crossing sortie to 0 instead of wrapping it). This is
  // now the single source of truth for this flight's duration: it's what
  // gets persisted on the row (previously never written on insert at all —
  // every reader fell back to recomputing it from these same two time
  // strings, with no midnight guard, which is how a −22.3h sortie reached
  // the logbook, Progress totals, PIC/solo sums and the DGCA PDF) and what
  // credits the student's cumulative hours below, instead of whatever
  // number the client happened to send.
  const totalHours = flightHoursFromTimes(departureTime as string, arrivalTime as string);

  const { error: dbError } = await supabaseAdmin.from('flight_records').insert({
    student_id: studentId,
    aircraft_id: aircraftId,
    instructor_id: instructorId,
    flight_date: flightDate,
    departure_time: departureTime,
    arrival_time: arrivalTime,
    hobbs_start: hobbsStartNum,
    hobbs_end: hobbsEndNum,
    landings,
    flight_type: flightType,
    sortie_type: sortieType,
    exercise: exercise || null,
    maneuvers,
    instructor_notes: instructorNotes,
    student_performance: studentPerformance,
    weather_conditions: weatherConditions,
    total_hours: totalHours,
    // 2026-09-10: DGCA PICUS on a dual sortie. `?? null` rather than
    // `|| null` so a deliberate 0 is stored as 0 — see add-picus-hours.sql
    // for why NULL and 0 are different facts here. Only ever set on DUAL;
    // the forms don't offer it on a solo sortie, where the student is
    // commander for the whole flight by definition.
    //
    // 2026-09-18: clamped here against the server-computed totalHours
    // (Math.min, floored at 0 for a garbled negative input) — previously
    // only the form clamped this client-side, so a request built by hand
    // (or a form with a stale totalHours) could store a PICUS figure
    // exceeding the flight's own duration with nothing to catch it.
    picus_hours: flightType === 'SOLO' ? null : (picusHours != null ? Math.max(0, Math.min(Number(picusHours), totalHours)) : null),
  });

  if (dbError) {
    console.error('Error creating flight record:', dbError);
    return NextResponse.json({ error: 'Failed to save flight record.' }, { status: 500 });
  }

  // Credit the student: total hours always, first-solo date only the first
  // time (never overwrite an existing one).
  //
  // 2026-09-18 (P0 #5, audit finding C4 — "concurrent flight logs silently
  // lose hours"): used to be a plain read-modify-write (SELECT total_hours,
  // add this flight's hours in JS, UPDATE) — two flights logged for the
  // same student seconds apart both read the same starting value, and
  // whichever UPDATE landed second overwrote the first's credit instead of
  // compounding it. No error, just a silently wrong total. Replaced with a
  // single atomic UPDATE done inside Postgres (add-atomic-student-hours-
  // increment.sql) — Postgres's normal row lock serializes concurrent calls
  // for the same student, so they now compound correctly. The first-solo-
  // date "only if not already set" logic moved into the same statement for
  // the same reason (COALESCE), rather than staying a separate
  // read-then-conditionally-write step.
  const isSolo = flightType === 'SOLO' || sortieType === 'SOLO';
  const { error: studentError } = await supabaseAdmin.rpc('increment_student_hours', {
    p_student_id: studentId,
    p_hours: totalHours,
    p_first_solo_date: isSolo ? flightDate : null,
  });
  if (studentError) {
    console.error('Error crediting student after flight record:', studentError);
  }

  // Advance the aircraft's hobbs time. hobbsEndNum, not the raw hobbsEnd —
  // validated above to be a positive number greater than Hobbs Start.
  const { error: aircraftError } = await supabaseAdmin
    .from('aircraft')
    .update({ hobbs_time: hobbsEndNum })
    .eq('id', aircraftId);
  if (aircraftError) {
    console.error('Error advancing aircraft hobbs time after flight record:', aircraftError);
  }

  return NextResponse.json({ success: true });
}

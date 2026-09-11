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
    instructorNotes, studentPerformance, weatherConditions, totalHours,
    picusHours,
  } = body as Record<string, unknown>;

  if (!studentId || !aircraftId) {
    return NextResponse.json({ error: 'studentId and aircraftId are required.' }, { status: 400 });
  }

  const { error: dbError } = await supabaseAdmin.from('flight_records').insert({
    student_id: studentId,
    aircraft_id: aircraftId,
    instructor_id: instructorId,
    flight_date: flightDate,
    departure_time: departureTime,
    arrival_time: arrivalTime,
    hobbs_start: hobbsStart,
    hobbs_end: hobbsEnd,
    landings,
    flight_type: flightType,
    sortie_type: sortieType,
    exercise: exercise || null,
    maneuvers,
    instructor_notes: instructorNotes,
    student_performance: studentPerformance,
    weather_conditions: weatherConditions,
    // 2026-09-10: DGCA PICUS on a dual sortie. `?? null` rather than
    // `|| null` so a deliberate 0 is stored as 0 — see add-picus-hours.sql
    // for why NULL and 0 are different facts here. Only ever set on DUAL;
    // the forms don't offer it on a solo sortie, where the student is
    // commander for the whole flight by definition.
    picus_hours: flightType === 'SOLO' ? null : (picusHours ?? null),
  });

  if (dbError) {
    console.error('Error creating flight record:', dbError);
    return NextResponse.json({ error: 'Failed to save flight record.' }, { status: 500 });
  }

  // Credit the student: total hours always, first-solo date only the first
  // time (never overwrite an existing one).
  const { data: student } = await supabaseAdmin
    .from('students')
    .select('total_hours, first_solo_date')
    .eq('id', studentId)
    .single();

  const studentUpdates: Record<string, unknown> = {
    total_hours: (student?.total_hours || 0) + (Number(totalHours) || 0),
  };
  const isSolo = flightType === 'SOLO' || sortieType === 'SOLO';
  if (isSolo && student && !student.first_solo_date) {
    studentUpdates.first_solo_date = flightDate;
  }

  const { error: studentError } = await supabaseAdmin
    .from('students')
    .update(studentUpdates)
    .eq('id', studentId);
  if (studentError) {
    console.error('Error crediting student after flight record:', studentError);
  }

  // Advance the aircraft's hobbs time.
  const { error: aircraftError } = await supabaseAdmin
    .from('aircraft')
    .update({ hobbs_time: hobbsEnd })
    .eq('id', aircraftId);
  if (aircraftError) {
    console.error('Error advancing aircraft hobbs time after flight record:', aircraftError);
  }

  return NextResponse.json({ success: true });
}

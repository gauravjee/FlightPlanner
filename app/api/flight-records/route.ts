// app/api/flight-records/route.ts
// Server-side, role-scoped create for the `flight_records` table (the
// digital logbook). Flight records are add-only from the UI today (no
// edit/delete anywhere in lib/store.ts or FlightRecordForm.tsx) — this
// route only needs POST. Per the 2026-08-17 role/tab matrix, operations
// isn't on this tab at all; maintenance can view the logbook but not log a
// flight.
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
import { requireModuleAccess } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

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

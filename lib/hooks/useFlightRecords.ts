// lib/hooks/useFlightRecords.ts
// ---------------------------------------------------------------------------
// SWR migration, Stage 4 (2026-08-29) — flight records / digital logbook.
// See the approved SWR migration plan (Project doc) for the full
// architecture and staging rationale.
//
// Deliberately KEEPS the studentName/aircraftReg/instructorName join baked
// into the fetcher's rows, rather than moving it to a render-time selector
// the way Stage 3 did for Students' assignedInstructorName. This is the
// same judgment call the plan's Architecture section already documents for
// Availability's personName/personInitials (Stage 2): the risk a baked-in
// join is meant to avoid is a LOCAL-SPLICE write not recomputing it (that
// was the actual Stage 3 bug — reassign an instructor, the splice never
// touches the name). Flight records have no local-splice write at all —
// addFlightRecord() below always revalidates the whole list from the server
// (the POST doesn't even return the new row's id, so there's nothing to
// splice), and flight records are add-only in the UI (no edit), so a fresh
// fetch always recomputes the join correctly. Given the very large number
// of read call sites that already consume record.studentName/aircraftReg/
// instructorName directly (Flights, Progress, Student Dashboard, Instructor
// Dashboard, Debrief), moving this to a selector would mean touching every
// one of them for no correctness gain over keeping the join here.
// ---------------------------------------------------------------------------

'use client';

import useSWR, { mutate } from 'swr';
import type { FlightRecord } from '@/types';
import { supabase } from '@/lib/supabase';
import { flightHoursFromTimes } from '@/lib/flight-classification';
import { fetchAircraft, aircraftKey } from './useAircraft';
import { fetchInstructors } from './useInstructors';
import { fetchStudents, studentsKey } from './useStudents';

export const flightRecordsKey = ['flightRecords'] as const;
// Not consumed by any current call site (see useStudentFlightRecords below)
// but kept array-shaped and parameterized the same way for consistency, and
// so a future consumer doesn't collide with the all-records cache entry.
export const studentFlightRecordsKey = (studentId: string) => ['flightRecords', 'student', studentId] as const;

// ---------------------------------------------------------------------------
// Row mapping — shared by both fetchers below, same logic
// loadFlightRecords()/loadStudentFlightRecords() used, just relocated. Joins
// aircraft/instructors/students for display fields (see the file header for
// why this join stays baked in here rather than moving to a selector).
// ---------------------------------------------------------------------------
async function mapFlightRecordRows(data: Record<string, unknown>[]): Promise<FlightRecord[]> {
  const [aircraft, instructors, students] = await Promise.all([
    fetchAircraft(),
    fetchInstructors(),
    fetchStudents(),
  ]);

  return data.map((row: Record<string, unknown>) => {
    const student = students.find(s => String(s.id) === String(row.student_id));
    const ac = aircraft.find(a => String(a.id) === String(row.aircraft_id));
    const inst = instructors.find(i => i.id === String(row.instructor_id));
    const calcHours = (): number => {
      if (row.total_hours) return row.total_hours as number;
      return flightHoursFromTimes(row.departure_time as string, row.arrival_time as string);
    };
    return {
      id: String(row.id), studentId: String(row.student_id), aircraftId: String(row.aircraft_id),
      instructorId: String(row.instructor_id), flightDate: row.flight_date as string,
      departureTime: row.departure_time as string, arrivalTime: row.arrival_time as string,
      hobbsStart: row.hobbs_start as number, hobbsEnd: row.hobbs_end as number,
      totalHours: calcHours(), landings: row.landings as number,
      flightType: row.flight_type as string, sortieType: row.sortie_type as string,
      exercise: (row.exercise as string) || undefined,
      maneuvers: row.maneuvers as string, instructorNotes: row.instructor_notes as string,
      studentPerformance: row.student_performance as number, weatherConditions: row.weather_conditions as string,
      studentName: student?.name || 'Unknown', aircraftReg: ac?.registration || 'Unknown', instructorName: inst?.name || 'Unknown',
    };
  });
}

// Top 100 most recent flight records, across all students — what the
// Flights (logbook) page, Progress page, Instructor Dashboard, and Student
// Dashboard all read via useFlightRecords() below.
export async function fetchFlightRecords(): Promise<FlightRecord[]> {
  const { data, error } = await supabase
    .from('flight_records')
    .select('*')
    .order('flight_date', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error loading flight records:', error);
    throw error;
  }

  return mapFlightRecordRows(data || []);
}

// Every flight record for one student, unfiltered by the 100-row cap above.
// Ported from the store's loadStudentFlightRecords() for interface
// completeness, but — like Stage 3's assignInstructor() — it has no callers
// anywhere in the app today (confirmed via grep, before and after this
// migration); every current consumer filters the all-records cache from
// useFlightRecords() client-side instead. Flagged here so it isn't mistaken
// for missed work.
export async function fetchStudentFlightRecords(studentId: string): Promise<FlightRecord[]> {
  const { data, error } = await supabase
    .from('flight_records')
    .select('*')
    .eq('student_id', studentId)
    .order('flight_date', { ascending: false });

  if (error) {
    console.error('Error loading student flight records:', error);
    throw error;
  }

  return mapFlightRecordRows(data || []);
}

export function useFlightRecords() {
  const { data, error, isLoading, mutate: boundMutate } = useSWR<FlightRecord[]>(
    flightRecordsKey,
    () => fetchFlightRecords()
  );

  return {
    flightRecords: data ?? [],
    isLoading,
    error,
    mutate: boundMutate,
  };
}

// See fetchStudentFlightRecords' own comment — currently unused, ported for
// interface completeness.
export function useStudentFlightRecords(studentId: string) {
  const { data, error, isLoading, mutate: boundMutate } = useSWR<FlightRecord[]>(
    studentFlightRecordsKey(studentId),
    () => fetchStudentFlightRecords(studentId)
  );

  return {
    flightRecords: data ?? [],
    isLoading,
    error,
    mutate: boundMutate,
  };
}

// ---------------------------------------------------------------------------
// Write — insert plus every side effect it used to do as separate
// client-side calls (crediting the student's total hours + first-solo date,
// advancing the aircraft's hobbs time) now all happen server-side in one
// request — see app/api/flight-records/route.ts. Gated to
// FLIGHT_RECORDS_WRITE_ROLES (admin/instructor/super_admin).
//
// Revalidates all three affected caches rather than locally splicing any of
// them: aircraft's hobbs bump and the student's hours/solo-date bump are
// both server-derived (the client never sent them — the plan's own
// cache-update rule calls this the "revalidate, don't splice" case), and
// the flight record itself has no client-known id to splice with (the API
// route's response is just {success:true}, unchanged from before this
// migration) plus its display fields depend on the three-way join in
// mapFlightRecordRows() above.
// ---------------------------------------------------------------------------
export async function addFlightRecord(
  record: Omit<FlightRecord, 'id' | 'studentName' | 'aircraftReg' | 'instructorName'>
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch('/api/flight-records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
  const result = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error('Error adding flight record:', result.error);
    return { success: false, error: result.error || 'Failed to save flight record.' };
  }

  await mutate(aircraftKey);
  await mutate(studentsKey);
  await mutate(flightRecordsKey);

  return { success: true };
}

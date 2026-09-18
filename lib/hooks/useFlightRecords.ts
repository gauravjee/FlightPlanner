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
import { flightHoursFromTimes } from '@/lib/flight-classification';
import { fetchAircraft, aircraftKey } from './useAircraft';
import { fetchInstructors } from './useInstructors';
import { fetchStudents, studentsKey } from './useStudents';

export const flightRecordsKey = ['flightRecords'] as const;
// Not consumed by any current call site (see useStudentFlightRecords below)
// but kept array-shaped and parameterized the same way for consistency, and
// so a future consumer doesn't collide with the all-records cache entry.
export const studentFlightRecordsKey = (studentId: string) => ['flightRecords', 'student', studentId] as const;
// 2026-09-18 (P0 #6 follow-up — Instructor Dashboard "My Students" table
// had the same truncated-cache bug as the Progress page, but for several
// students at once). Sorted + joined the same way
// trainingRequirementsForStudentsKey does, so the same set of student ids
// in a different order still hits the same cache entry.
export const flightRecordsForStudentsKey = (studentIds: string[]) =>
  ['flightRecords', 'multi', [...studentIds].sort().join(',')] as const;

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
      // Nullish check, not truthiness: a recorded 0 is meaningful (marked
      // student-PIC, no PIC time flown) and must survive as 0, not become
      // undefined. See add-picus-hours.sql.
      picusHours: row.picus_hours != null ? Number(row.picus_hours) : undefined,
      studentName: student?.name || 'Unknown', aircraftReg: ac?.registration || 'Unknown', instructorName: inst?.name || 'Unknown',
    };
  });
}

// Top 100 most recent flight records, across all students — what the
// Flights (logbook) page, Progress page, Instructor Dashboard, and Student
// Dashboard all read via useFlightRecords() below.
//
// Goes through GET /api/flight-records (2026-09-11) rather than a direct
// Supabase client call — see that route's header for why: it's the only
// way a signed-in `student` session gets scoped to their own records
// instead of everyone's.
export async function fetchFlightRecords(): Promise<FlightRecord[]> {
  const res = await fetch('/api/flight-records');
  if (!res.ok) {
    console.error('Error loading flight records:', res.status);
    throw new Error('Failed to load flight records.');
  }
  const { records } = await res.json();
  return mapFlightRecordRows(records || []);
}

// Every flight record for one student, unfiltered by the 100-row cap above.
// Ported from the store's loadStudentFlightRecords() for interface
// completeness; sat unused for a while (every consumer filtered the
// all-records cache from useFlightRecords() client-side instead) until the
// 2026-09-18 audit named that exact gap twice — the Flights page's logbook
// export (P0 #2, C5) and useStudentFlightRecords() above (P0 #6, C3) both
// call this now.
export async function fetchStudentFlightRecords(studentId: string): Promise<FlightRecord[]> {
  const res = await fetch(`/api/flight-records?studentId=${encodeURIComponent(studentId)}`);
  if (!res.ok) {
    console.error('Error loading student flight records:', res.status);
    throw new Error('Failed to load student flight records.');
  }
  const { records } = await res.json();
  return mapFlightRecordRows(records || []);
}

// 2026-09-18 (P0 #6 follow-up, audit finding C3's exact pattern, second
// occurrence): app/dashboard/instructor/page.tsx's "My Students" progress
// table filtered useFlightRecords()'s fleet-wide 100-row cache down to
// each assigned student in turn — same bug the Progress page had, just
// computing several students' totals in one pass instead of one selected
// student's. Same `.in()` shape GET /api/training-requirements already
// uses for exactly this "an instructor's several assigned students at
// once" need (see useTrainingRequirementsForStudents below in the sibling
// file) — GET /api/flight-records now accepts the equivalent `?studentIds`.
export async function fetchFlightRecordsForStudents(studentIds: string[]): Promise<FlightRecord[]> {
  if (studentIds.length === 0) return [];
  const res = await fetch(`/api/flight-records?studentIds=${encodeURIComponent(studentIds.join(','))}`);
  if (!res.ok) {
    console.error('Error loading flight records for students:', res.status);
    throw new Error('Failed to load flight records.');
  }
  const { records } = await res.json();
  return mapFlightRecordRows(records || []);
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

// 2026-09-18 (P0 #6, audit finding C3 — "Progress page computes regulatory
// totals from a truncated list"): this used to be unused, ported only "for
// interface completeness" — every consumer instead filtered the fleet-wide
// 100-row cache from useFlightRecords() down to one student client-side.
// That's fine for staff whose own view of "recent" is fleet-wide, but wrong
// for a specific student's totals: a student with 60 flights, 12 of which
// fall in the last 100 school-wide rows, showed 12 flights' worth of hours
// on the Progress page — a different, smaller number than that same
// student's own session saw (GET /api/flight-records scopes a `student`
// role to their own records with no cap; it only caps the "everyone"
// query staff make). Now wired into the Progress page below. Skips the
// fetch entirely when studentId is falsy — same `key ? realKey : null`
// convention as useTrainingRequirements — so selecting "no student yet"
// doesn't fire a request for the (differently-shaped, capped) all-students
// list.
export function useStudentFlightRecords(studentId: string | null | undefined) {
  const { data, error, isLoading, mutate: boundMutate } = useSWR<FlightRecord[]>(
    studentId ? studentFlightRecordsKey(studentId) : null,
    () => fetchStudentFlightRecords(studentId as string)
  );

  return {
    flightRecords: data ?? [],
    isLoading,
    error,
    mutate: boundMutate,
  };
}

export function useFlightRecordsForStudents(studentIds: string[]) {
  const { data, error, isLoading, mutate: boundMutate } = useSWR<FlightRecord[]>(
    studentIds.length > 0 ? flightRecordsForStudentsKey(studentIds) : null,
    () => fetchFlightRecordsForStudents(studentIds)
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

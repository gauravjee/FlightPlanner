// lib/hooks/useStudents.ts
// ---------------------------------------------------------------------------
// SWR migration, Stage 3 (2026-08-28) — see the approved SWR migration plan
// (Project doc: claude/swr-migration-plan-2026-08-28.md) for the
// architecture and staging rationale.
//
// Two things make Students different from Stage 1 (Aircraft) and Stage 2
// (Instructors/Availability):
//
// 1. The fetcher goes through `/api/students`, not a direct Supabase call —
//    that route scopes the result by role server-side (staff get everyone,
//    a logged-in 'student' only ever gets their own record). See
//    app/api/students/route.ts's own comment for why (an earlier security
//    round: the browser used to read the `students` table directly with
//    the anon key).
//
// 2. Unlike Availability's personName/personInitials (Stage 2, kept baked
//    into the cached row), the assigned instructor's name/initials are
//    deliberately NOT resolved in this fetcher. The old store's
//    loadStudents() did resolve them at fetch time, baking another
//    domain's data into the cached row — exactly the kind of thing that
//    can go stale independently once two domains are cached separately
//    (e.g. rename an instructor and every already-fetched student's
//    baked-in name is now wrong until students happens to refetch). Call
//    sites that need the display name join it themselves at render time
//    via withInstructorNames() below, combining useStudents() with
//    useInstructors() — both already-fresh SWR caches, so the join is
//    always correct without either cache needing to know about the other.
// ---------------------------------------------------------------------------

'use client';

import useSWR, { mutate } from 'swr';
import type { Instructor, StudentRecord } from '@/types';

export const studentsKey = ['students'] as const;

export async function fetchStudents(): Promise<StudentRecord[]> {
  // Routed through /api/students (not a direct Supabase call) so the
  // server can scope the result by role — see the file header above.
  const res = await fetch('/api/students');
  if (!res.ok) {
    console.error('Error loading students:', await res.text().catch(() => res.statusText));
    throw new Error('Failed to load students.');
  }
  const json = await res.json();
  const data: Record<string, unknown>[] = json.students || [];

  return data.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    enrollmentId: row.enrollment_id as string,
    name: row.name as string,
    initials: row.initials as string,
    trainingStage: row.training_stage as string,
    totalHours: row.total_hours as number,
    // '|| ''' matters here: medical_expiry can be null in the DB for a
    // student who never had one set. StudentRecord.medicalExpiry is typed
    // as a required (non-optional) string, so '' — not undefined — is the
    // right fallback to satisfy that type; a raw null fed into
    // StudentFormModal's controlled <input value={form.medicalExpiry}>
    // triggers React's "value prop on input should not be null" warning
    // (found via testing, 2026-08-25).
    medicalExpiry: (row.medical_expiry as string) || '',
    email: (row.email as string) || '',
    phone: (row.phone as string) || '',
    dateOfBirth: (row.date_of_birth as string) || '',
    joinedDate: (row.joined_date as string) || '',
    status: row.status as string,
    firstSoloDate: (row.first_solo_date as string) || undefined,
    assignedInstructorId: (row.assigned_instructor_id as string) || undefined,
    // Deliberately NOT resolved here — see the file header above. Left
    // undefined; withInstructorNames() below fills these in at render time
    // for call sites that display them.
    assignedInstructorName: undefined,
    assignedInstructorInitials: undefined,
    splNumber: (row.spl_number as string) || undefined,
    splExpiryDate: (row.spl_expiry_date as string) || undefined,
    splIssueDate: (row.spl_issue_date as string) || undefined,
    medicalIssueDate: (row.medical_issue_date as string) || undefined,
  }));
}

export function useStudents() {
  const { data, error, isLoading, mutate: boundMutate } = useSWR<StudentRecord[]>(
    studentsKey,
    () => fetchStudents()
  );

  return {
    students: data ?? [],
    isLoading,
    error,
    mutate: boundMutate,
  };
}

// Convenience selector — replaces the store's getStudentById(id). Not a
// hook itself; call sites already holding a students array from
// useStudents() pass it in directly.
export function getStudentById(students: StudentRecord[], id: string): StudentRecord | undefined {
  return students.find(s => s.id === id);
}

// Render-time join that replaces the old fetch-time enrichment — see the
// file header above for why. Pass useStudents()'s list and
// useInstructors()'s list; returns new StudentRecord objects with
// assignedInstructorName/assignedInstructorInitials filled in wherever
// assignedInstructorId matches a currently-known instructor.
export function withInstructorNames(students: StudentRecord[], instructors: Instructor[]): StudentRecord[] {
  return students.map(s => {
    if (!s.assignedInstructorId) return s;
    const instructor = instructors.find(i => i.id === s.assignedInstructorId);
    return {
      ...s,
      assignedInstructorName: instructor?.name,
      assignedInstructorInitials: instructor?.initials,
    };
  });
}

// ---------------------------------------------------------------------------
// Writes — plain exported async functions, same shape and same
// failure-handling decisions as the original store actions.
// ---------------------------------------------------------------------------

// Creating a student also creates their login (see app/api/students POST),
// so the caller needs to know whether the welcome email went out — the
// return value surfaces that instead of just success/failure, same as the
// original store action.
export async function addStudent(student: Omit<StudentRecord, 'id'>): Promise<{
  success: boolean;
  error?: string;
  emailSent?: boolean;
  emailMessage?: string;
  password?: string;
}> {
  const res = await fetch('/api/students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(student),
  });
  const result = await res.json().catch(() => ({}));
  if (res.ok) {
    const created = result.student;
    // The payload sent IS the new record (server only adds an id here —
    // instructor name isn't baked into cached rows anymore, so there's
    // nothing server-derived to wait for), so a local splice is correct
    // per the migration plan's cache-update rule.
    const newStudent: StudentRecord = { ...student, id: String(created.id) };
    mutate<StudentRecord[]>(studentsKey, (current = []) => [...current, newStudent], { revalidate: false });
    return {
      success: true,
      emailSent: result.emailSent,
      emailMessage: result.emailMessage,
      password: result.password,
    };
  } else {
    console.error('Error adding student:', result.error);
    return { success: false, error: result.error || 'Failed to add student.' };
  }
}

// 2026-08-20: returns whether the save succeeded (used by the SPL-number
// capture modal in RequirementsChecklist.tsx to avoid marking the SPL
// requirement complete if the number itself failed to save) — most callers
// just await it without reading the return value, so this stays
// backward-compatible with the original store action's signature.
export async function updateStudent(id: string, updates: Partial<StudentRecord>): Promise<boolean> {
  const res = await fetch(`/api/students/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (res.ok) {
    mutate<StudentRecord[]>(
      studentsKey,
      (current = []) => current.map(s => (s.id === id ? { ...s, ...updates } : s)),
      { revalidate: false }
    );
    return true;
  }
  console.error('Error updating student:', await res.text());
  return false;
}

export async function removeStudent(id: string): Promise<void> {
  const res = await fetch(`/api/students/${id}`, { method: 'DELETE' });
  if (res.ok) {
    mutate<StudentRecord[]>(studentsKey, (current = []) => current.filter(s => s.id !== id), { revalidate: false });
  } else {
    console.error('Error removing student:', await res.text());
  }
}

// 2026-08-28: ported from lib/store.ts as-is for interface completeness,
// but note it currently has no callers anywhere in the app (confirmed via
// grep) — it was already dead code before this migration. The reload the
// original version did after updateStudent() (to pick up the freshly
// resolved instructor name) is no longer needed: assignedInstructorName
// isn't baked into the cache anymore, so withInstructorNames() above
// always recomputes it fresh from whatever's currently in both caches.
export async function assignInstructor(studentId: string, instructorId: string): Promise<void> {
  // `|| null` (not `undefined`) so an empty instructorId still reaches the
  // server as an explicit "clear the assignment" — updateStudent only
  // includes a field in the PATCH body when it's !== undefined.
  await updateStudent(studentId, { assignedInstructorId: instructorId || null } as unknown as Partial<StudentRecord>);
}

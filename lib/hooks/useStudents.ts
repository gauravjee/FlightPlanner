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
import type { Instructor, StudentRecord, StudentCourse } from '@/types';
import { notify } from '@/lib/notify';

export const studentsKey = ['students'] as const;

// ---------------------------------------------------------------------------
// In-flight dedupe (item 81, 2026-09-05).
//
// THE BUG: the Dashboard issued TWO GET /api/students per load. Only one came
// from useStudents/SWR. The other came from fetchFlightRecords ->
// mapFlightRecordRows, which calls fetchStudents() DIRECTLY to bake the
// studentName join into its rows (a deliberate, documented decision — see the
// header of useFlightRecords.ts). SWR cannot dedupe that: it never sees the
// call. Found by logging a stack trace inside the fetcher; three rounds of
// reasoning about SWR keys had blamed the wrong thing entirely.
//
// ⚠️ THIS IS NOT A DATA CACHE, and the distinction matters. `inFlightStudents`
// holds a PROMISE and is cleared the instant that promise settles, so it can
// only merge callers that overlap in time — it can never hand anyone a stale
// list. That is the exact opposite of the module-level Maps removed from
// lib/weather.ts earlier the same day (item 71), which held RESOLVED data for
// 29 minutes and thereby made the Refresh Weather button a silent no-op.
// Anything that outlives its own request is a cache, and a cache belongs in
// SWR or the database — not in a fetcher.
let inFlightStudents: Promise<StudentRecord[]> | null = null;

export function fetchStudents(): Promise<StudentRecord[]> {
  inFlightStudents ??= fetchStudentsUncached().finally(() => { inFlightStudents = null; });
  return inFlightStudents;
}

async function fetchStudentsUncached(): Promise<StudentRecord[]> {
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
    assignedInstructorId: row.assigned_instructor_id ? String(row.assigned_instructor_id) : undefined,
    // Deliberately NOT resolved here — see the file header above. Left
    // undefined; withInstructorNames() below fills these in at render time
    // for call sites that display them.
    assignedInstructorName: undefined,
    assignedInstructorInitials: undefined,
    splNumber: (row.spl_number as string) || undefined,
    splExpiryDate: (row.spl_expiry_date as string) || undefined,
    splIssueDate: (row.spl_issue_date as string) || undefined,
    medicalIssueDate: (row.medical_issue_date as string) || undefined,
    address: (row.address as string) || '',
    nationality: (row.nationality as string) || '',
    emergencyContactName: (row.emergency_contact_name as string) || '',
    emergencyContactRelation: (row.emergency_contact_relation as string) || '',
    emergencyContactPhone: (row.emergency_contact_phone as string) || '',
    bloodGroup: (row.blood_group as string) || '',
    statusChangedAt: (row.status_changed_at as string) || undefined,
    statusReason: (row.status_reason as string) || undefined,
    documentsMasked: (row.documents_masked as StudentRecord['documentsMasked']) ?? null,
  }));
}

// `enabled` (2026-08-29, E2E testing round): defaults to true, so every
// existing call site is unchanged. Pass false to skip the fetch entirely
// (SWR's own conditional-key idiom — a null key never fires) rather than
// letting it run and fail: some Dashboard widgets (StudentProgressWidget,
// NotificationWidget) render for every role with no RoleGate, and calling
// this unconditionally meant a doomed request + console error for any role
// GET /api/students 403s for (e.g. maintenance) — see
// lib/permissions.ts's STUDENT_ROSTER_VIEW_ROLES for the roles that should
// pass true here.
export function useStudents(enabled: boolean = true) {
  const { data, error, isLoading, mutate: boundMutate } = useSWR<StudentRecord[]>(
    enabled ? studentsKey : null,
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
    // The payload sent IS the new record, except for what the server adds:
    // the id and (2026-09-24) the enrollment number, issued server-side by
    // next_enrollment_id() — the form sends none. A local splice is still
    // correct per the migration plan's cache-update rule.
    const newStudent: StudentRecord = { ...student, id: String(created.id), enrollmentId: String(created.enrollment_id ?? '') };
    delete (newStudent as unknown as Record<string, unknown>).idDocuments; // B3: never keep typed ID numbers in the client cache
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
  // 13 Oct: show the server's reason instead of failing silently.
  notify((await res.json().catch(() => ({}))).error || 'Failed to update student.');
  return false;
}

// ---------------------------------------------------------------------------
// B3/B4 (13 Oct): course history, status and ID documents. Each goes to its own
// endpoint under /api/students/[id]; failures return the server's message.
// ---------------------------------------------------------------------------
type Result<T = Record<string, unknown>> = { error?: string } & Partial<T>;

async function send<T>(url: string, method: string, body?: unknown): Promise<Result<T>> {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return res.ok ? json : { ...json, error: json.error || 'Something went wrong.' };
}

export const studentCoursesKey = (studentId: string) => ['students', 'courses', studentId] as const;

export function useStudentCourses(studentId: string | null) {
  const { data } = useSWR<StudentCourse[]>(studentId ? studentCoursesKey(studentId) : null, async () => {
    const json = await send<{ courses: Record<string, unknown>[] }>(`/api/students/${studentId}/courses`, 'GET');
    if (json.error) throw new Error(json.error);
    return (json.courses ?? []).map(c => {
      const tp = (Array.isArray(c.training_programs) ? c.training_programs[0] : c.training_programs) as { program_code?: string; program_name?: string } | null;
      return {
        id: c.id as number, programId: c.program_id as number,
        programCode: tp?.program_code ?? '', programName: tp?.program_name ?? '',
        startDate: c.start_date as string, endDate: (c.end_date as string) ?? null,
        outcome: c.outcome as StudentCourse['outcome'], note: (c.note as string) ?? null,
      };
    });
  });
  return data ?? [];
}

async function refreshStudent(studentId: string) {
  await mutate(studentsKey);
  await mutate(studentCoursesKey(studentId));
}

export async function startNextCourse(studentId: string, body: { programId: number; startDate: string; endDate?: string; outcome?: string; note?: string }) {
  const r = await send<{ requirementsWarning?: string }>(`/api/students/${studentId}/courses`, 'POST', body);
  if (!r.error) await refreshStudent(studentId);
  return r;
}

export async function editStudentCourse(studentId: string, body: { courseId: number; startDate?: string; endDate?: string; outcome?: string }) {
  const r = await send(`/api/students/${studentId}/courses`, 'PATCH', body);
  if (!r.error) await refreshStudent(studentId);
  return r;
}

export async function changeStudentStatus(studentId: string, body: { status: string; reason?: string; disableLogin?: boolean }) {
  const r = await send<{ cancelled: { id: number; start: string }[]; loginDisabled: boolean; bookings: { id: number; start: string }[] }>(`/api/students/${studentId}/status`, 'POST', body);
  if (!r.error || r.bookings) await mutate(studentsKey);
  return r;
}

export type StudentIdDocuments = { aadhaar?: string; passportNumber?: string; passportIssueDate?: string; passportIssuePlace?: string };

/** Full ID numbers; the server logs every call as a VIEW. */
export async function fetchStudentDocuments(studentId: string) {
  return send<{ idDocuments: StudentIdDocuments }>(`/api/students/${studentId}/documents`, 'GET');
}

export async function saveStudentDocuments(studentId: string, idDocuments: StudentIdDocuments) {
  const r = await send(`/api/students/${studentId}`, 'PATCH', { idDocuments });
  if (!r.error) await mutate(studentsKey);
  return r;
}

export async function removeStudent(id: string): Promise<void> {
  const res = await fetch(`/api/students/${id}`, { method: 'DELETE' });
  if (res.ok) {
    mutate<StudentRecord[]>(studentsKey, (current = []) => current.filter(s => s.id !== id), { revalidate: false });
  } else {
    // e.g. 409 "has history" (fk-design-2026-10-08): tell the user, don't fail silently.
    notify((await res.json().catch(() => ({}))).error || 'Failed to delete student.');
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

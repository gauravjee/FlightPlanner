// lib/hooks/useAvailability.ts
// ---------------------------------------------------------------------------
// SWR migration, Stage 2 (2026-08-28) — see the approved SWR migration plan
// (docs/ swr-migration-plan / Project doc). Second domain of Stage 2,
// alongside useInstructors.ts.
//
// Key shape: array-based (['availability']), same reasoning as
// aircraftKey/instructorsKey.
//
// Enrichment note: each row's personName/personInitials is joined
// client-side against Instructors (migrated Stage 2) and Students (migrated
// Stage 3, 2026-08-28) — both now read via their own fetch<Domain>()
// exports rather than the Zustand store. (Between Stage 2 and Stage 3 this
// read Students via a one-shot useFlightStore.getState().students snapshot,
// since Students hadn't been extracted into its own fetcher yet — swapped
// for fetchStudents() now that it has.)
// ---------------------------------------------------------------------------

'use client';

import useSWR, { mutate } from 'swr';
import { fetchInstructors } from './useInstructors';
import { fetchStudents } from './useStudents';
import type { AvailabilityRecord } from '@/types';

export const availabilityKey = ['availability'] as const;

// 2026-09-18 (RLS remediation Step 3): was a direct client-side
// `supabase.from('availability')` call (anon key) — now goes through
// GET /api/availability (service-role, session-gated) so the table's RLS
// policy can be locked down. See claude/rls-remediation-progress-2026-09-18.md.
export async function fetchAvailability(): Promise<AvailabilityRecord[]> {
  const res = await fetch('/api/availability');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('Error loading availability:', err.error || res.statusText);
    throw new Error(err.error || 'Failed to load availability.');
  }
  const { records: data } = await res.json();

  const instructors = await fetchInstructors();
  const students = await fetchStudents();

  return (data || []).map((row: Record<string, unknown>) => {
    const person = row.person_type === 'instructor'
      ? instructors.find(i => i.id === String(row.person_id))
      : students.find(s => s.id === String(row.person_id));
    return {
      id: String(row.id), personType: row.person_type as 'instructor' | 'student',
      personId: String(row.person_id), leaveType: row.leave_type as string,
      startDate: row.start_date as string, endDate: row.end_date as string,
      startTime: (row.start_time as string) || undefined, endTime: (row.end_time as string) || undefined,
      reason: row.reason as string, status: row.status as string, createdBy: row.created_by as string,
      personName: person?.name || 'Unknown', personInitials: person?.initials || '??',
    };
  });
}

export function useAvailability() {
  const { data, error, isLoading, mutate: boundMutate } = useSWR<AvailabilityRecord[]>(
    availabilityKey,
    () => fetchAvailability()
  );

  return {
    availabilityRecords: data ?? [],
    isLoading,
    error,
    mutate: boundMutate,
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

// 2026-09-18 (RLS exposure remediation, see
// claude/rls-exposure-2026-09-18.md): these three writes used to go
// straight to Supabase with the anon key and no server-side role check at
// all. Now routed through /api/availability (POST) and
// /api/availability/[id] (PATCH/DELETE), both gated to
// AVAILABILITY_VIEW_ROLES — see those routes' own header comments.
//
// The original store action inserted, then did a full get().loadAvailability()
// reload rather than a local splice — the personName/personInitials join
// isn't something this write function can cheaply reproduce itself. Revalidate
// from the server (matches the migration plan's cache-update rule: the
// enrichment is derived beyond what the client sent, so re-fetch rather than
// locally splice) — this preserves the exact prior behavior.
export async function addAvailability(
  record: Omit<AvailabilityRecord, 'id' | 'personName' | 'personInitials'>
): Promise<void> {
  const res = await fetch('/api/availability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
  if (!res.ok) {
    const result = await res.json().catch(() => ({}));
    console.error('Error adding availability:', result.error || res.statusText);
    return;
  }
  await mutate(availabilityKey);
}

export async function updateAvailability(id: string, updates: Partial<AvailabilityRecord>): Promise<void> {
  const res = await fetch(`/api/availability/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const result = await res.json().catch(() => ({}));
    console.error('Error updating availability:', result.error || res.statusText);
    return;
  }
  mutate<AvailabilityRecord[]>(
    availabilityKey,
    (current = []) => current.map(a => (a.id === id ? { ...a, ...updates } : a)),
    { revalidate: false }
  );
}

export async function removeAvailability(id: string): Promise<void> {
  const res = await fetch(`/api/availability/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const result = await res.json().catch(() => ({}));
    console.error('Error removing availability:', result.error || res.statusText);
    return;
  }
  mutate<AvailabilityRecord[]>(availabilityKey, (current = []) => current.filter(a => a.id !== id), { revalidate: false });
}

// Not tied to the cached list at all — a fresh point-in-time query, same as
// the original store action. Colocated here as the availability domain's
// own helper rather than left in lib/store.ts.
//
// 2026-09-18 (RLS remediation Step 3): the original query filtered
// person_type/person_id/date-range/status server-side in Postgres via the
// anon key. GET /api/availability doesn't take filter params (this table is
// small — leave records — so there's no real cost to filtering the full
// list here instead of adding query-param plumbing for one caller). Same
// fail-open behavior on a fetch error as the original: an empty/failed
// result reads as "no conflicting leave found," not "assume unavailable."
export async function checkAvailability(personType: string, personId: string, date: string): Promise<boolean> {
  const res = await fetch('/api/availability');
  if (!res.ok) return true;
  const { records: data } = await res.json().catch(() => ({ records: [] }));
  const conflicts = (data || []).filter((row: Record<string, unknown>) =>
    row.person_type === personType && String(row.person_id) === String(personId) &&
    (row.start_date as string) <= date && (row.end_date as string) >= date &&
    row.status === 'APPROVED'
  );
  return conflicts.length === 0;
}

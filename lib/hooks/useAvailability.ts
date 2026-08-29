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
import { supabase } from '@/lib/supabase';
import { fetchInstructors } from './useInstructors';
import { fetchStudents } from './useStudents';
import type { AvailabilityRecord } from '@/types';

export const availabilityKey = ['availability'] as const;

export async function fetchAvailability(): Promise<AvailabilityRecord[]> {
  const { data, error } = await supabase.from('availability').select('*').order('start_date', { ascending: true });

  if (error) {
    console.error('Error loading availability:', error);
    throw error;
  }

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

// The original store action inserted, then did a full get().loadAvailability()
// reload rather than a local splice — the personName/personInitials join
// isn't something this write function can cheaply reproduce itself. Revalidate
// from the server (matches the migration plan's cache-update rule: the
// enrichment is derived beyond what the client sent, so re-fetch rather than
// locally splice) — this preserves the exact prior behavior.
export async function addAvailability(
  record: Omit<AvailabilityRecord, 'id' | 'personName' | 'personInitials'>
): Promise<void> {
  const { error } = await supabase.from('availability').insert({
    person_type: record.personType, person_id: record.personId, leave_type: record.leaveType,
    start_date: record.startDate, end_date: record.endDate,
    start_time: record.startTime || null, end_time: record.endTime || null,
    reason: record.reason, status: record.status || 'APPROVED', created_by: record.createdBy,
  });
  if (error) {
    console.error('Error adding availability:', error);
    return;
  }
  await mutate(availabilityKey);
}

export async function updateAvailability(id: string, updates: Partial<AvailabilityRecord>): Promise<void> {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.leaveType !== undefined) dbUpdates.leave_type = updates.leaveType;
  if (updates.startDate !== undefined) dbUpdates.start_date = updates.startDate;
  if (updates.endDate !== undefined) dbUpdates.end_date = updates.endDate;
  if (updates.reason !== undefined) dbUpdates.reason = updates.reason;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  const { error } = await supabase.from('availability').update(dbUpdates).eq('id', id);
  if (error) {
    console.error('Error updating availability:', error);
    return;
  }
  mutate<AvailabilityRecord[]>(
    availabilityKey,
    (current = []) => current.map(a => (a.id === id ? { ...a, ...updates } : a)),
    { revalidate: false }
  );
}

export async function removeAvailability(id: string): Promise<void> {
  const { error } = await supabase.from('availability').delete().eq('id', id);
  if (error) {
    console.error('Error removing availability:', error);
    return;
  }
  mutate<AvailabilityRecord[]>(availabilityKey, (current = []) => current.filter(a => a.id !== id), { revalidate: false });
}

// Not tied to the cached list at all — a fresh point-in-time query, same as
// the original store action. Colocated here as the availability domain's
// own helper rather than left in lib/store.ts.
export async function checkAvailability(personType: string, personId: string, date: string): Promise<boolean> {
  const { data } = await supabase.from('availability').select('*')
    .eq('person_type', personType).eq('person_id', personId)
    .lte('start_date', date).gte('end_date', date).eq('status', 'APPROVED').limit(1);
  return !data || data.length === 0;
}

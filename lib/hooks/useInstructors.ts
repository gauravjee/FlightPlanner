// lib/hooks/useInstructors.ts
// ---------------------------------------------------------------------------
// SWR migration, Stage 2 (2026-08-28) — see the approved SWR migration plan
// (docs/ swr-migration-plan / Project doc) for the architecture and staging
// rationale. Second domain migrated off lib/store.ts, alongside
// useAvailability.ts — both small, flat, standard CRUD, no dependency on
// each other, proving the Stage 1 pattern generalizes.
//
// Key shape: array-based (['instructors']), same reasoning as aircraftKey —
// leaves room for a future ['instructors', locationId] once multi-airport
// work lands.
// ---------------------------------------------------------------------------

'use client';

import useSWR, { mutate } from 'swr';
import { supabase } from '@/lib/supabase';
import type { Instructor } from '@/types';

export const instructorsKey = ['instructors'] as const;

// ---------------------------------------------------------------------------
// Fetcher — same Supabase query and row-mapping loadInstructors() used, just
// relocated. Exported (not just used internally) because a handful of
// not-yet-migrated domains (loadStudents, loadFlightRecords,
// loadStudentFlightRecords, loadScheduledFlights, loadAvailability — see
// lib/store.ts) still need instructor data for their own client-side name-
// joins and now call this directly instead of reading a store field that no
// longer exists, exactly as fetchAircraft() was used in Stage 1.
// ---------------------------------------------------------------------------
export async function fetchInstructors(): Promise<Instructor[]> {
  const { data, error } = await supabase.from('instructors').select('*').order('name', { ascending: true });

  if (error) {
    console.error('Error loading instructors:', error);
    throw error;
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id), name: row.name as string, initials: row.initials as string,
    licenseNumber: row.license_number as string, ratings: row.ratings as string,
    maxDailyHours: row.max_daily_hours as number, email: (row.email as string) || '',
    phone: (row.phone as string) || '', status: row.status as Instructor['status'],
    // Defaults to false if the migration hasn't been run yet in Supabase
    // (add-instructor-self-booking-permission.sql) — column missing/null
    // both read as "can't self-book," the safe side.
    canSelfBook: Boolean(row.can_self_book),
    licenseExpiryDate: (row.license_expiry_date as string) || undefined,
    licenseIssueDate: (row.license_issue_date as string) || undefined,
  }));
}

export function useInstructors() {
  const { data, error, isLoading, mutate: boundMutate } = useSWR<Instructor[]>(
    instructorsKey,
    () => fetchInstructors()
  );

  return {
    instructors: data ?? [],
    isLoading,
    error,
    mutate: boundMutate,
  };
}

// Convenience selector — replaces the store's getInstructorById(id). Not a
// hook itself; call sites already holding an instructors array from
// useInstructors() pass it in directly.
export function getInstructorById(instructors: Instructor[], id: string): Instructor | undefined {
  return instructors.find(i => i.id === id);
}

// ---------------------------------------------------------------------------
// Writes — plain exported async functions, same shape and same
// failure-handling decision as useAircraft.ts: console.error only on
// failure, no throw, no return value, matching every confirmed call site's
// existing fire-and-forget usage.
// ---------------------------------------------------------------------------

export async function addInstructor(instructor: Omit<Instructor, 'id'>): Promise<void> {
  const res = await fetch('/api/instructors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(instructor),
  });
  const result = await res.json().catch(() => ({}));
  if (res.ok) {
    const newInstructor: Instructor = { ...instructor, id: String(result.instructor.id) };
    mutate<Instructor[]>(instructorsKey, (current = []) => [...current, newInstructor], { revalidate: false });
  } else {
    console.error('Error adding instructor:', result.error);
  }
}

export async function updateInstructor(id: string, updates: Partial<Instructor>): Promise<void> {
  const res = await fetch(`/api/instructors/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (res.ok) {
    mutate<Instructor[]>(
      instructorsKey,
      (current = []) => current.map(i => (i.id === id ? { ...i, ...updates } : i)),
      { revalidate: false }
    );
  } else {
    console.error('Error updating instructor:', await res.text());
  }
}

export async function removeInstructor(id: string): Promise<void> {
  const res = await fetch(`/api/instructors/${id}`, { method: 'DELETE' });
  if (res.ok) {
    mutate<Instructor[]>(instructorsKey, (current = []) => current.filter(i => i.id !== id), { revalidate: false });
  } else {
    console.error('Error removing instructor:', await res.text());
  }
}

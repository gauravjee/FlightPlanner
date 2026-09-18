// lib/hooks/useExercises.ts
// ---------------------------------------------------------------------------
// SWR migration, Stage 8 (2026-09-02) — Exercises (training exercise
// reference list: short code + full name, used by the Exercise dropdown on
// BookingForm/FlightRecordForm and ScheduleBoard's legend). See the approved
// SWR migration plan (Project doc: claude/swr-migration-plan-2026-08-28.md).
//
// Read-only from this app's own client code — there's no write function
// here, matching the old store (it never had one either). Exercises are
// actually managed via Admin Setup -> Exercises (ExercisesTab.tsx), which
// has always had its own independent local state (now also server-side —
// see that file), and writes through the shared role-gated
// `/api/admin/config/exercises` route — none of that goes through this
// file. What DOES change here: ExercisesTab.tsx's writes never invalidated
// the store's copy of `exercises` (the one BookingForm/FlightRecordForm/
// ScheduleBoard/the Flights page all read), so an edit there was invisible
// to every other page until an unrelated remount happened to refetch — the
// exact cache-invalidation gap Stage 6 found and fixed for
// AircraftMaintenanceScheduleTab. Fixed here the same way: ExercisesTab.tsx
// now calls `mutate(exercisesKey)` after each successful write, alongside
// its own local list refresh.
//
// 2026-09-18 (RLS remediation, Batch 2 — see
// claude/data-access-security-mapping.md): was a direct client-side
// `supabase.from('exercises')` call (anon key) — now goes through
// GET /api/admin/config/exercises (service-role, session-gated), filtered
// to is_active=true server-side the same way the old query was.
// ---------------------------------------------------------------------------

'use client';

import useSWR from 'swr';

export interface Exercise {
  exercise_name: string;
  short_code: string;
  full_description: string;
}

export const exercisesKey = ['exercises'] as const;

export async function fetchExercises(): Promise<Exercise[]> {
  const res = await fetch('/api/admin/config/exercises?orderBy=sort_order&filterColumn=is_active&filterValue=true');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('Error loading exercises:', err.error || res.statusText);
    throw new Error(err.error || 'Failed to load exercises.');
  }
  const { rows } = await res.json();
  return (rows || []).map((row: Record<string, unknown>) => ({
    exercise_name: row.exercise_name as string,
    short_code: row.short_code as string,
    full_description: row.full_description as string,
  }));
}

export function useExercises() {
  const { data, error, isLoading, mutate: boundMutate } = useSWR<Exercise[]>(
    exercisesKey,
    () => fetchExercises()
  );

  return {
    exercises: data ?? [],
    isLoading,
    error,
    mutate: boundMutate,
  };
}

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
// has always had its own independent local state + its own direct
// `supabase.from('exercises')` read, and writes through the shared
// role-gated `/api/admin/config/exercises` route — none of that goes
// through this file. What DOES change here: ExercisesTab.tsx's writes never
// invalidated the store's copy of `exercises` (the one BookingForm/
// FlightRecordForm/ScheduleBoard/the Flights page all read), so an edit
// there was invisible to every other page until an unrelated remount
// happened to refetch — the exact cache-invalidation gap Stage 6 found and
// fixed for AircraftMaintenanceScheduleTab. Fixed here the same way:
// ExercisesTab.tsx now calls `mutate(exercisesKey)` after each successful
// write, alongside its own local list refresh.
// ---------------------------------------------------------------------------

'use client';

import useSWR from 'swr';
import { supabase } from '@/lib/supabase';

export interface Exercise {
  exercise_name: string;
  short_code: string;
  full_description: string;
}

export const exercisesKey = ['exercises'] as const;

export async function fetchExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('exercise_name, short_code, full_description')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Error loading exercises:', error);
    throw error;
  }

  return data || [];
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

// lib/hooks/useSortieTypes.ts
// ---------------------------------------------------------------------------
// SWR migration, Stage 8 (2026-09-02) — Sortie Types (DUAL/SOLO/MAINTENANCE
// etc. reference list, used by FlightRecordForm's "Sortie Type" dropdown and
// the Flights logbook page). See the approved SWR migration plan (Project
// doc: claude/swr-migration-plan-2026-08-28.md).
//
// Same shape as useExercises.ts (see that file's header for the full
// reasoning) — read-only here, no write function, matching the old store.
// Managed via Admin Setup -> Sortie Types (SortieTypesTab.tsx), which keeps
// its own independent local state + its own direct
// `supabase.from('sortie_types')` read, and writes through the shared
// role-gated `/api/admin/config/sortie-types` route. Same cache-
// invalidation gap as Exercises existed here too — SortieTypesTab.tsx now
// calls `mutate(sortieTypesKey)` after each successful write.
// ---------------------------------------------------------------------------

'use client';

import useSWR from 'swr';
import { supabase } from '@/lib/supabase';

export interface SortieType {
  id: number;
  type_name: string;
  type_code: string;
  requires_instructor: boolean;
  requires_student: boolean;
}

export const sortieTypesKey = ['sortieTypes'] as const;

export async function fetchSortieTypes(): Promise<SortieType[]> {
  const { data, error } = await supabase
    .from('sortie_types')
    .select('id, type_name, type_code, requires_instructor, requires_student')
    .eq('is_active', true)
    .order('id', { ascending: true });

  if (error) {
    console.error('Error loading sortie types:', error);
    throw error;
  }

  return data || [];
}

export function useSortieTypes() {
  const { data, error, isLoading, mutate: boundMutate } = useSWR<SortieType[]>(
    sortieTypesKey,
    () => fetchSortieTypes()
  );

  return {
    sortieTypes: data ?? [],
    isLoading,
    error,
    mutate: boundMutate,
  };
}

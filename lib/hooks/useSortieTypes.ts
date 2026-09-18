// lib/hooks/useSortieTypes.ts
// ---------------------------------------------------------------------------
// SWR migration, Stage 8 (2026-09-02) — Sortie Types (DUAL/SOLO/MAINTENANCE
// etc. reference list, used by FlightRecordForm's "Sortie Type" dropdown and
// the Flights logbook page). See the approved SWR migration plan (Project
// doc: claude/swr-migration-plan-2026-08-28.md).
//
// Same shape as useExercises.ts (see that file's header for the full
// reasoning) — read-only here, no write function, matching the old store.
// Managed via Admin Setup -> Sortie Types (SortieTypesTab.tsx, via
// ConfigTable.tsx), which keeps its own independent local state, and writes
// through the shared role-gated `/api/admin/config/sortie-types` route.
// Same cache-invalidation gap as Exercises existed here too —
// SortieTypesTab.tsx calls `mutate(sortieTypesKey)` after each successful
// write.
//
// 2026-09-18 (RLS remediation, Batch 2 — see
// claude/data-access-security-mapping.md): was a direct client-side
// `supabase.from('sortie_types')` call (anon key) — now goes through
// GET /api/admin/config/sortie-types (service-role, session-gated),
// filtered to is_active=true server-side the same way the old query was.
// ---------------------------------------------------------------------------

'use client';

import useSWR from 'swr';

export interface SortieType {
  id: number;
  type_name: string;
  type_code: string;
  requires_instructor: boolean;
  requires_student: boolean;
}

export const sortieTypesKey = ['sortieTypes'] as const;

export async function fetchSortieTypes(): Promise<SortieType[]> {
  const res = await fetch('/api/admin/config/sortie-types?orderBy=id&filterColumn=is_active&filterValue=true');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('Error loading sortie types:', err.error || res.statusText);
    throw new Error(err.error || 'Failed to load sortie types.');
  }
  const { rows } = await res.json();
  return (rows || []).map((row: Record<string, unknown>) => ({
    id: row.id as number,
    type_name: row.type_name as string,
    type_code: row.type_code as string,
    requires_instructor: row.requires_instructor as boolean,
    requires_student: row.requires_student as boolean,
  }));
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

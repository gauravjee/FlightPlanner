// lib/hooks/useBases.ts — the school's bases (multi-base, claude/multi-base-design-2026-10-15.md).
'use client';

import useSWR from 'swr';
import type { BaseRow } from '@/lib/bases';

export const basesKey = '/api/admin/config/bases?orderBy=id';

async function fetchBases(url: string): Promise<BaseRow[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load bases.');
  return (await res.json()).rows ?? [];
}

export function useBases() {
  const { data = [], isLoading, mutate } = useSWR(basesKey, fetchBases);
  const activeBases = data.filter(b => b.is_active);
  // Base pickers only appear once there is a second active base; with one base they would change nothing.
  return { bases: data, activeBases, multiBase: activeBases.length > 1, isLoading, mutate };
}

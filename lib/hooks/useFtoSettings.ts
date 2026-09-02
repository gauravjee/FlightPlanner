// lib/hooks/useFtoSettings.ts
// ---------------------------------------------------------------------------
// SWR migration, Stage 8 (2026-09-02) — FTO Settings (school name, airport
// code, logo, time slots, turnaround buffer, weekly-off-day config, etc.
// — a flat key-value table read by nearly every scheduling surface). See
// the approved SWR migration plan (Project doc:
// claude/swr-migration-plan-2026-08-28.md).
//
// Read-only from this file's perspective, matching the old store (it never
// had a write action either — Admin Setup -> Settings, SettingsTab.tsx,
// writes on its own). Unlike Exercises/Sortie Types, SettingsTab.tsx writes
// straight to Supabase from the browser (`supabase.from('fto_settings')`
// .update()/.insert()) rather than through the shared role-gated
// `/api/admin/config/[table]` route those two use — that's a pre-existing
// gap (no server-side role check on this table), not something this
// migration changes; flagged in the migration plan doc as a follow-up, not
// fixed here to keep this stage a pure refactor. What DOES change:
// SettingsTab.tsx now calls `mutate(ftoSettingsKey)` after a successful
// save instead of the old store's `loadFTOSettings()`, so every consumer's
// cache refreshes together.
//
// getFtoSetting(settings, key) replaces the store's `getFTOSetting(key)`
// method (which read `get().ftoSettings[key] || ''`) — same fallback,
// now a plain selector taking the settings object explicitly, same shape
// as Stage 3's `getStudentById(students, id)`.
// ---------------------------------------------------------------------------

'use client';

import useSWR from 'swr';
import { supabase } from '@/lib/supabase';

export const ftoSettingsKey = ['ftoSettings'] as const;

export async function fetchFtoSettings(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('fto_settings').select('*');

  if (error) {
    console.error('Error loading FTO settings:', error);
    throw error;
  }

  const settings: Record<string, string> = {};
  (data || []).forEach((row: Record<string, unknown>) => {
    settings[row.setting_key as string] = row.setting_value as string;
  });
  return settings;
}

// `isLoading` is a drop-in replacement for the old store's
// `ftoSettingsLoaded` boolean, just inverted: SWR's `isLoading` is true only
// until the first fetch resolves (success OR error — same as the old
// store's own success/failure handling both flipping `ftoSettingsLoaded` to
// true), then stays false. So `!isLoading` === the old `ftoSettingsLoaded`.
export function useFtoSettings() {
  const { data, error, isLoading, mutate: boundMutate } = useSWR<Record<string, string>>(
    ftoSettingsKey,
    () => fetchFtoSettings()
  );

  return {
    ftoSettings: data ?? {},
    isLoading,
    error,
    mutate: boundMutate,
  };
}

export function getFtoSetting(settings: Record<string, string>, key: string): string {
  return settings[key] || '';
}

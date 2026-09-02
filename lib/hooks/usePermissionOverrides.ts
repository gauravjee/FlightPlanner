// lib/hooks/usePermissionOverrides.ts
// ---------------------------------------------------------------------------
// SWR migration, Stage 8 (2026-09-02) — My Permission Overrides (the
// signed-in user's own per-module access overrides, granted by a
// super_admin beyond their role's default — see lib/permissions.ts's
// MODULE_ACCESS/getModuleAccessLevel). See the approved SWR migration plan
// (Project doc: claude/swr-migration-plan-2026-08-28.md).
//
// Keyed by email so switching signed-in users mid-session (no full page
// reload) fetches fresh instead of reusing a stale cache entry — this
// replaces the old store's manual `permissionOverridesFor !== email` guard
// (see lib/useMyPermissionOverrides.ts's previous version) with SWR's own
// per-key caching: a different email is simply a different cache entry, no
// bookkeeping needed. `email: null | undefined` uses SWR's conditional-key
// idiom to skip the fetch entirely for a signed-out user, same as
// useStudents.ts's `enabled` parameter.
// ---------------------------------------------------------------------------

'use client';

import useSWR from 'swr';
import type { PermissionOverrides } from '@/lib/permissions';

export const permissionOverridesKey = (email: string) => ['permissionOverrides', email] as const;

export async function fetchPermissionOverrides(): Promise<PermissionOverrides> {
  const res = await fetch('/api/me/permissions');
  if (!res.ok) {
    // Matches the old store's behavior: a non-ok response (or a thrown
    // network error, caught below) resolves to an empty override set
    // rather than surfacing an error — no overrides just means "use the
    // role's own defaults," not a broken page.
    return {};
  }
  try {
    const { overrides } = await res.json();
    return overrides || {};
  } catch (err) {
    console.error('Error loading permission overrides:', err);
    return {};
  }
}

export function usePermissionOverrides(email: string | null | undefined) {
  const { data, error, isLoading, mutate: boundMutate } = useSWR<PermissionOverrides>(
    email ? permissionOverridesKey(email) : null,
    () => fetchPermissionOverrides()
  );

  return {
    permissionOverrides: data ?? {},
    isLoading,
    error,
    mutate: boundMutate,
  };
}

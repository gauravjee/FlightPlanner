// lib/useMyPermissionOverrides.ts
// Small client hook wrapping usePermissionOverrides (lib/hooks/
// usePermissionOverrides.ts, SWR migration Stage 8, 2026-09-02) — fetches
// once per signed-in user and shares the result across every component that
// calls it (RoleGate, Sidebar, each write-gated component), via SWR's own
// per-email cache key instead of the old store's manual
// permissionOverridesFor guard. See app/api/me/permissions/route.ts for the
// server side, and lib/permissions.ts's getModuleAccessLevel/canViewModule/
// canWriteModule for how the returned object combines with a user's role.
'use client';

import { useSession } from 'next-auth/react';
import { usePermissionOverrides } from '@/lib/hooks/usePermissionOverrides';
import type { PermissionOverrides } from '@/lib/permissions';

export function useMyPermissionOverrides(): PermissionOverrides {
  const { data: session, status } = useSession();
  const email = status === 'authenticated' ? session?.user?.email : undefined;
  const { permissionOverrides } = usePermissionOverrides(email);
  return permissionOverrides;
}

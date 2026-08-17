// lib/useMyPermissionOverrides.ts
// Small client hook wrapping the store's permissionOverrides — fetches
// once per signed-in user (guarded by permissionOverridesFor, see
// lib/store.ts) and shares the result across every component that calls
// it via the existing Zustand store, instead of RoleGate/Sidebar/each
// write-gated component issuing its own fetch. See
// app/api/me/permissions/route.ts for the server side, and
// lib/permissions.ts's getModuleAccessLevel/canViewModule/canWriteModule
// for how the returned object combines with a user's role.
'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useFlightStore } from '@/lib/store';
import type { PermissionOverrides } from '@/lib/permissions';

export function useMyPermissionOverrides(): PermissionOverrides {
  const { data: session, status } = useSession();
  const permissionOverrides = useFlightStore((s) => s.permissionOverrides);
  const permissionOverridesFor = useFlightStore((s) => s.permissionOverridesFor);
  const loadMyPermissionOverrides = useFlightStore((s) => s.loadMyPermissionOverrides);

  useEffect(() => {
    const email = session?.user?.email;
    if (status === 'authenticated' && email && permissionOverridesFor !== email) {
      loadMyPermissionOverrides(email);
    }
  }, [status, session, permissionOverridesFor, loadMyPermissionOverrides]);

  return (permissionOverrides || {}) as PermissionOverrides;
}

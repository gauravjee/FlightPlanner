// components/ui/RoleGate.tsx
// Restricts rendering to allowed roles; redirects others to a fallback page

'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Plane } from 'lucide-react';
import { canViewModule, type ModuleKey } from '@/lib/permissions';
import { useMyPermissionOverrides } from '@/lib/useMyPermissionOverrides';

interface Props {
  children: React.ReactNode;
  allowedRoles: string[];          // e.g. ['admin', 'instructor']
  fallback?: string;               // redirect if not allowed (default /unauthorized)
  // Optional — when set, access is decided by canViewModule() (role default
  // OR a super_admin-granted per-user override, see lib/permissions.ts)
  // instead of a flat allowedRoles.includes(role) check. Pass this on any
  // page whose module supports per-user overrides (2026-08-17, second
  // round) so a granted override actually unlocks the page, not just the
  // server-side write routes. allowedRoles is still required as a prop
  // (kept as the page's own documentation of its role-based default) but
  // is ignored in favor of the module check once moduleKey is present.
  moduleKey?: ModuleKey;
}

export default function RoleGate({ children, allowedRoles, fallback = '/unauthorized', moduleKey }: Props) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const overrides = useMyPermissionOverrides();

  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const allowed = moduleKey ? canViewModule(userRole, overrides, moduleKey) : allowedRoles.includes(userRole || '');

  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      if (!allowed) {
        router.push(fallback);
      }
    }
  }, [status, session, allowed, fallback, router]);

  // Show loading indicator while session is being fetched
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
        <div className="text-center">
          <div className="brand-mark w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Plane className="w-6 h-6" style={{ stroke: '#ffffff' }} />
          </div>
          <p className="text-secondary text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, nothing is rendered (ProtectedRoute will handle redirect)
  if (!session) return null;

  // User is allowed – render children
  return <>{children}</>;
}
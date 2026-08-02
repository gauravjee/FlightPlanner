// components/ui/RoleGate.tsx
// Restricts rendering to allowed roles; redirects others to a fallback page

'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface Props {
  children: React.ReactNode;
  allowedRoles: string[];          // e.g. ['admin', 'instructor']
  fallback?: string;               // redirect if not allowed (default /unauthorized)
}

export default function RoleGate({ children, allowedRoles, fallback = '/unauthorized' }: Props) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      const userRole = (session.user as any).role;
      if (!allowedRoles.includes(userRole)) {
        router.push(fallback);
      }
    }
  }, [status, session, allowedRoles, fallback, router]);

  // Show loading indicator while session is being fetched
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Loading...</p>
      </div>
    );
  }

  // If not authenticated, nothing is rendered (ProtectedRoute will handle redirect)
  if (!session) return null;

  // User is allowed – render children
  return <>{children}</>;
}
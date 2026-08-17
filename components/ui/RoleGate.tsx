// components/ui/RoleGate.tsx
// Restricts rendering to allowed roles; redirects others to a fallback page

'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Plane } from 'lucide-react';

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
// components/ui/ProtectedRoute.tsx
// Wraps dashboard pages to require authentication
// Redirects to /login if user is not signed in
'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Plane } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: Props) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // If not loading and not authenticated, redirect to login
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Show loading spinner while checking auth
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

  // If not authenticated, show nothing (will redirect)
  if (!session) {
    return null;
  }

  // Authenticated - render children
  return <>{children}</>;
}
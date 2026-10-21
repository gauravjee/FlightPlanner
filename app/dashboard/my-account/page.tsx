// app/dashboard/my-account/page.tsx — billing B1 (21 Oct): a student's own account, read-only.
'use client';

import { useSession } from 'next-auth/react';
import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import StudentAccountPanel from '@/components/billing/StudentAccountPanel';

export default function MyAccountPage() {
  useSetHeader({ title: 'My Account', subtitle: 'Your balance, payments and flight charges' });
  const { data: session } = useSession();
  const studentId = session?.user?.studentId;
  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={['student']}>
        <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
          <div className="max-w-4xl mx-auto px-4 py-6">
            <section className="surface-card p-5">
              {studentId ? <StudentAccountPanel studentId={studentId} />
                : <p className="text-secondary text-center py-8">No student profile is linked to this account.</p>}
            </section>
          </div>
        </main>
      </RoleGate>
    </ProtectedRoute>
  );
}

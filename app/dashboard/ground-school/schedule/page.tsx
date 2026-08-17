// app/dashboard/ground-school/schedule/page.tsx
// Ground School Schedule – now uses the full‑featured calendar component
'use client';

import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import GroundSchoolCalendar from '@/components/ground-school/GroundSchoolCalendar';

export default function SchedulePage() {
  useSetHeader({ title: 'Ground School Schedule', subtitle: 'Weekly / Monthly Calendar', backUrl: '/dashboard/ground-school' });

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={['admin', 'instructor', 'super_admin', 'operations']}>
        <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
          <div className="max-w-7xl mx-auto px-4 py-6">
            <GroundSchoolCalendar />
          </div>
        </main>
      </RoleGate>
    </ProtectedRoute>
  );
}
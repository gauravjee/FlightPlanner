// app/dashboard/schedule/page.tsx
'use client';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import { useSetHeader } from '@/components/ui/HeaderContext';
import ScheduleBoard from '@/components/schedule/ScheduleBoard';
import RoleGate from '@/components/ui/RoleGate';

export default function SchedulePage() {
  useSetHeader({ title: 'Flight Schedule', subtitle: 'Operations Board - Gantt View' });

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={['admin', 'instructor', 'super_admin', 'operations']}>
    <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <ScheduleBoard />
      </div>
    </main>
    </RoleGate>
    </ProtectedRoute>
  );
}
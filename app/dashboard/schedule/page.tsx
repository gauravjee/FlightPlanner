// app/dashboard/schedule/page.tsx
'use client';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import Header from '@/components/ui/Header';
import ScheduleBoard from '@/components/schedule/ScheduleBoard';
import RoleGate from '@/components/ui/RoleGate';

export default function SchedulePage() {
  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={['admin', 'instructor', 'super_admin', 'operations']}>
    <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      <Header title="Flight Schedule" subtitle="Operations Board - Gantt View" />

      <div className="max-w-7xl mx-auto px-4 py-6">
        <ScheduleBoard />
      </div>
    </main>
    </RoleGate>
    </ProtectedRoute>
  );
}
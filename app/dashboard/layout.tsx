// app/dashboard/layout.tsx
// Forces all dashboard pages to be dynamic (no static generation)
// This prevents SSR errors from Supabase client imports

import Sidebar from '@/components/ui/Sidebar';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Persistent left nav (see components/ui/Sidebar.tsx) added alongside
// {children} — every page's own Header, ProtectedRoute, and RoleGate are
// completely unchanged; this only adds cross-section navigation that
// didn't exist before. `lg:flex` only takes effect at the same breakpoint
// Sidebar renders at, so mobile/tablet-below-lg layouts are byte-for-byte
// what they were before this — Sidebar's own `hidden lg:flex` means it
// contributes nothing to the layout below that width.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lg:flex">
      <Sidebar />
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}
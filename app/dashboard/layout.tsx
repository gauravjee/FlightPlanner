// app/dashboard/layout.tsx
// Forces all dashboard pages to be dynamic (no static generation)
// This prevents SSR errors from Supabase client imports

import Sidebar from '@/components/ui/Sidebar';
import Header from '@/components/ui/Header';
import { HeaderProvider } from '@/components/ui/HeaderContext';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Persistent left nav (see components/ui/Sidebar.tsx) added alongside
// {children} — every page's own ProtectedRoute and RoleGate are completely
// unchanged; this only adds cross-section navigation that didn't exist
// before. `lg:flex` only takes effect at the same breakpoint Sidebar
// renders at, so mobile/tablet-below-lg layouts are byte-for-byte what they
// were before this — Sidebar's own `hidden lg:flex` means it contributes
// nothing to the layout below that width.
//
// Header is hoisted here too (see components/ui/HeaderContext.tsx) so it
// stays mounted across dashboard navigation instead of unmounting and
// remounting with every page — that remount was the header-flicker bug.
// Individual app/dashboard/**/page.tsx files no longer render <Header />
// themselves; they call useSetHeader({ title, subtitle, ... }) instead.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <HeaderProvider>
      <div className="lg:flex">
        <Sidebar />
        <div className="flex-1 min-w-0">
          <Header />
          {children}
        </div>
      </div>
    </HeaderProvider>
  );
}
// components/ui/Sidebar.tsx
// ---------------------------------------------------------------------------
// Persistent left-hand navigation for the dashboard shell (desktop/tablet
// widths only — see app/dashboard/layout.tsx). Purely additive: it doesn't
// replace or change anything Header.tsx already does (brand, live clock,
// user menu, theme toggle all stay exactly as they are on every page), and
// it doesn't change what any page allows — RoleGate on each destination
// page is still the actual access control; this only decides which links
// are worth showing someone, same as the existing role-filtered "Quick
// Actions" tile grid on app/dashboard/page.tsx (kept as-is; this doesn't
// replace it either).
//
// Why this exists: the app had no persistent navigation at all before this
// — app/dashboard/layout.tsx rendered nothing but {children}, so getting
// from one section to another meant going back to the dashboard home and
// clicking a tile. Modeled on the sidebar pattern from the Pushpak/
// FlightPlanner UI mockups reviewed 2026-08-17, but built entirely from
// this app's own existing design tokens (var(--surface), var(--border),
// var(--accent), etc.) rather than the mockup's separate color system, so
// it respects the dark/light theme toggle already shipped here instead of
// introducing a second, fixed-color visual language.
//
// Responsive behavior: hidden below the `lg` breakpoint (1024px) — mobile
// layouts are unaffected on purpose, since they were already deliberately
// tuned in the earlier redesign pass and this shouldn't eat into that
// screen space. Between `lg` and `xl` it's an icon-only rail (mirrors the
// mockup's tablet behavior); at `xl`+ it shows full labels.
// ---------------------------------------------------------------------------

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  LayoutDashboard, Calendar, Plane, Users, Fuel, FileText, Wrench,
  GraduationCap, UserRound, Umbrella, ChartColumnIncreasing, BookOpen,
  Settings,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  // Kept in sync with each destination page's own RoleGate allowedRoles —
  // this list is a convenience filter, not the access control itself.
  roles: string[];
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'instructor', 'super_admin', 'operations', 'maintenance'] },
  { href: '/dashboard/student', label: 'My Dashboard', icon: LayoutDashboard, roles: ['student'] },
  { href: '/dashboard/schedule', label: 'Schedule', icon: Calendar, roles: ['admin', 'instructor', 'super_admin', 'operations'] },
  { href: '/dashboard/flights', label: 'Flight Records', icon: FileText, roles: ['admin', 'instructor', 'super_admin'] },
  { href: '/dashboard/fuel', label: 'Fuel', icon: Fuel, roles: ['admin', 'instructor', 'super_admin', 'maintenance'] },
  { href: '/dashboard/maintenance', label: 'Maintenance', icon: Wrench, roles: ['admin', 'instructor', 'super_admin', 'maintenance'] },
  { href: '/dashboard/aircraft', label: 'Aircraft', icon: Plane, roles: ['admin', 'instructor', 'super_admin'] },
  { href: '/dashboard/students', label: 'Students', icon: Users, roles: ['admin', 'instructor', 'super_admin', 'operations'] },
  { href: '/dashboard/instructors', label: 'Instructors', icon: GraduationCap, roles: ['admin', 'instructor', 'super_admin'] },
  { href: '/dashboard/instructor', label: 'My Students', icon: UserRound, roles: ['instructor', 'admin', 'super_admin'] },
  { href: '/dashboard/availability', label: 'Availability', icon: Umbrella, roles: ['admin', 'instructor', 'super_admin'] },
  { href: '/dashboard/progress', label: 'Progress', icon: ChartColumnIncreasing, roles: ['admin', 'instructor', 'super_admin', 'student'] },
  { href: '/dashboard/ground-school', label: 'Ground School', icon: BookOpen, roles: ['admin', 'instructor', 'super_admin', 'student', 'operations'] },
  { href: '/dashboard/admin/setup', label: 'Admin Setup', icon: Settings, roles: ['super_admin'] },
];

export default function Sidebar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  // Nothing to show until we actually know who's logged in — avoids a
  // flash of an empty nav rail while the session is still resolving (same
  // "render nothing until ready" behavior ProtectedRoute already uses).
  if (status !== 'authenticated' || !session?.user) return null;

  const role = (session.user as { role?: string }).role;
  const items = NAV_ITEMS.filter((item) => role && item.roles.includes(role));

  if (items.length === 0) return null;

  return (
    <aside
      className="hidden lg:flex lg:flex-col lg:w-16 xl:w-56 shrink-0 h-screen sticky top-0 overflow-y-auto"
      style={{ borderRight: '1px solid var(--border)', backgroundColor: 'var(--surface)' }}
    >
      <nav className="flex-1 py-4 px-2 xl:px-3 space-y-1">
        {items.map((item) => {
          // '/dashboard' would otherwise prefix-match every nested route
          // (including itself as a substring of '/dashboard/schedule' etc.)
          // — exact match for the two dashboard-home entries, prefix match
          // for everything else so a sub-page still highlights its section.
          const isHome = item.href === '/dashboard' || item.href === '/dashboard/student';
          const active = isHome ? pathname === item.href : pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className="flex items-center gap-3 rounded-lg px-2.5 xl:px-3 py-2.5 text-sm font-medium transition-colors justify-center xl:justify-start hover:bg-[var(--surface-muted)]"
              style={
                active
                  ? { backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }
                  : { color: 'var(--text-secondary)' }
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="hidden xl:inline truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

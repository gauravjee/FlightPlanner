// components/ui/Sidebar.tsx
// ---------------------------------------------------------------------------
// Persistent left-hand navigation for the dashboard shell (desktop/tablet
// widths only — see app/dashboard/layout.tsx). Purely additive: it doesn't
// replace or change anything Header.tsx already does (brand, live clock,
// user menu, theme toggle all stay exactly as they are on every page), and
// it doesn't change what any page allows — RoleGate on each destination
// page is still the actual access control; this only decides which links
// are worth showing someone.
//
// 2026-08-25: the Dashboard's role-filtered "Quick Actions" tile grid
// (app/dashboard/page.tsx) was removed per explicit user request, now that
// this sidebar covers the same navigation — this is the only navigation
// surface for jumping between modules going forward.
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
  Settings, ClipboardList, Wind, ShieldAlert, TriangleAlert, Hourglass,
} from 'lucide-react';
import { canViewModule, type ModuleKey } from '@/lib/permissions';
import { useMyPermissionOverrides } from '@/lib/useMyPermissionOverrides';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  // Kept in sync with each destination page's own RoleGate allowedRoles —
  // this list is a convenience filter, not the access control itself.
  roles: string[];
  // Optional — for the six modules that support a per-user permission
  // override (2026-08-17, second round), a user whose role isn't in
  // `roles` above still sees this item if they've been granted an
  // override for this module (see lib/permissions.ts's canViewModule).
  moduleKey?: ModuleKey;
}

// Kept as literal arrays (not imported from lib/api-auth.ts) deliberately —
// that module pulls in supabaseAdmin, a server-only client that throws if it
// ever ends up in client-side code, and this file is 'use client'. These are
// hand-synced to the matching *_VIEW_ROLES constants there; see the
// 2026-08-17 role/tab matrix for the source of truth these mirror.
const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'instructor', 'super_admin', 'operations', 'maintenance', 'safety_officer'] },
  { href: '/dashboard/student', label: 'My Dashboard', icon: LayoutDashboard, roles: ['student'] },
  { href: '/dashboard/schedule', label: 'Schedule', icon: Calendar, roles: ['admin', 'instructor', 'super_admin', 'operations', 'student'] },
  { href: '/dashboard/flights', label: 'Flight Records', icon: FileText, roles: ['admin', 'instructor', 'super_admin', 'maintenance'], moduleKey: 'flightRecords' },
  { href: '/dashboard/fuel', label: 'Fuel', icon: Fuel, roles: ['admin', 'instructor', 'super_admin', 'maintenance', 'operations'], moduleKey: 'fuel' },
  { href: '/dashboard/maintenance', label: 'Maintenance', icon: Wrench, roles: ['admin', 'instructor', 'super_admin', 'maintenance', 'operations'], moduleKey: 'maintenance' },
  { href: '/dashboard/aircraft', label: 'Aircraft', icon: Plane, roles: ['admin', 'instructor', 'super_admin', 'maintenance', 'operations'], moduleKey: 'aircraft' },
  { href: '/dashboard/students', label: 'Students', icon: Users, roles: ['admin', 'instructor', 'super_admin', 'operations'], moduleKey: 'students' },
  { href: '/dashboard/instructors', label: 'Instructors', icon: GraduationCap, roles: ['admin', 'super_admin', 'operations', 'instructor'], moduleKey: 'instructors' },
  // 2026-08-25: per explicit user request, scoped to 'instructor' only —
  // this is a personalized "my assigned students" view (see the page's own
  // instructorId-scoped filtering), not a general roster; admin/super_admin
  // already have the full roster via "Instructors" and "Students" above.
  { href: '/dashboard/instructor', label: 'My Students', icon: UserRound, roles: ['instructor'] },
  { href: '/dashboard/availability', label: 'Availability', icon: Umbrella, roles: ['admin', 'instructor', 'super_admin', 'operations'] },
  { href: '/dashboard/progress', label: 'Progress', icon: ChartColumnIncreasing, roles: ['admin', 'instructor', 'super_admin', 'student', 'operations'] },
  { href: '/dashboard/ground-school', label: 'Ground School', icon: BookOpen, roles: ['admin', 'instructor', 'super_admin', 'student', 'operations'] },
  // BA Test Register (2026-08-20, session 3) — was previously reachable
  // only via a card on the Reports landing page; the user asked for a
  // direct top-level link too, since it's a form staff fill in daily, not
  // just a report to browse. Placed directly ABOVE "Reports" per explicit
  // user request (session 4) — was originally added below it. Roles
  // hand-synced to lib/permissions.ts's BA_TEST_VIEW_ROLES (=
  // REPORTS_VIEW_ROLES) — the page's own RoleGate is still the real access
  // control, same convention as every other nav item.
  //
  // 2026-08-29: this href nests under '/dashboard/reports' at the URL
  // level, so the plain prefix-match below used to also highlight
  // "Reports" whenever this page was open. An earlier session's comment
  // here called that "intentional structure, not a bug" — the user
  // corrected that: BA Test Register was deliberately promoted to its own
  // equal-weight top-level item (placed *above* Reports, per their own
  // request), not a child of it, so it shouldn't double-highlight the
  // Reports item. See NAV_ACTIVE_EXCLUDED_CHILD_PREFIXES below for the fix —
  // sibling sub-pages that still only live under the Reports landing page
  // (breath-analysis, daily-flying — no nav item of their own) are
  // deliberately unaffected and still light up "Reports" as before.
  { href: '/dashboard/reports/breath-analyser', label: 'BA Test Register', icon: Wind, roles: ['admin', 'instructor', 'super_admin', 'operations', 'maintenance', 'safety_officer'] },
  // Safety Management workflow (2026-08-31) — view roles hand-synced to
  // lib/permissions.ts's INCIDENT_REPORT_ROLES (= REPORTS_VIEW_ROLES);
  // triage actions inside the page are further gated to
  // INCIDENT_MANAGE_ROLES, enforced server-side.
  { href: '/dashboard/safety', label: 'Safety', icon: ShieldAlert, roles: ['admin', 'instructor', 'super_admin', 'operations', 'maintenance', 'safety_officer'] },
  // Pilot-facing squawk reporting (2026-08-31) — roles hand-synced to
  // lib/permissions.ts's SQUAWK_REPORT_ROLES. Deliberately separate from
  // "Maintenance" above, which students can't see at all.
  { href: '/dashboard/report-defect', label: 'Report a Defect', icon: TriangleAlert, roles: ['instructor', 'student'] },
  // Lightweight, non-regulatory instructor duty-hours view (2026-08-31) —
  // see that page's own header comment for why this isn't a DGCA
  // compliance claim. Roles hand-synced to that page's own VIEW_ROLES.
  { href: '/dashboard/duty-hours', label: 'Duty Hours', icon: Hourglass, roles: ['admin', 'super_admin', 'operations', 'instructor'] },
  // roles here hand-synced to lib/permissions.ts's REPORTS_VIEW_ROLES —
  // instructor/maintenance can see a generated report but only
  // admin/super_admin/operations can generate/save one (see
  // REPORTS_WRITE_ROLES, enforced in the Reports pages themselves).
  // safety_officer (2026-08-20) added so that role can reach the Breath
  // Analysis Report (see BA_TEST_WRITE_ROLES/BA_TEST_VIEW_ROLES).
  { href: '/dashboard/reports', label: 'Reports', icon: ClipboardList, roles: ['admin', 'instructor', 'super_admin', 'operations', 'maintenance', 'safety_officer'] },
  { href: '/dashboard/admin/setup', label: 'Admin Setup', icon: Settings, roles: ['super_admin'] },
];

// 2026-08-29: sub-paths that have been promoted to their own top-level nav
// item (see that item's own comment above for why) even though they still
// nest under a *different* item's href at the URL level — those sub-paths
// should light up only their own promoted item, not double-highlight the
// item they happen to nest under. Keyed by the parent item's href; each
// value is a list of child path prefixes to exclude from that parent's own
// prefix-match below. Currently just the one case (BA Test Register vs.
// Reports); add here rather than hand-rolling another one-off exception if
// a future nav item needs the same treatment.
const NAV_ACTIVE_EXCLUDED_CHILD_PREFIXES: Record<string, string[]> = {
  '/dashboard/reports': ['/dashboard/reports/breath-analyser'],
};

export default function Sidebar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  // Called unconditionally, before the early return below, per rules of
  // hooks — harmless no-op fetch for roles that can never have an
  // override (the hook still only fires the request once per session).
  const overrides = useMyPermissionOverrides();

  // Nothing to show until we actually know who's logged in — avoids a
  // flash of an empty nav rail while the session is still resolving (same
  // "render nothing until ready" behavior ProtectedRoute already uses).
  if (status !== 'authenticated' || !session?.user) return null;

  const role = (session.user as { role?: string }).role;
  const items = NAV_ITEMS.filter((item) =>
    !!role && (item.roles.includes(role) || (item.moduleKey ? canViewModule(role, overrides, item.moduleKey) : false))
  );

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
          //
          // Plain startsWith() on its own is also wrong for two sibling
          // routes whose paths share a prefix at the segment level, not
          // just textually — '/dashboard/instructors' (Instructors roster)
          // starts with the string '/dashboard/instructor' (My Students),
          // so visiting the roster page lit up both nav items. Matching
          // against the href plus a trailing '/' (or an exact match) keeps
          // '/dashboard/instructor/123' correctly under "My Students"
          // while no longer bleeding into "Instructors".
          const isHome = item.href === '/dashboard' || item.href === '/dashboard/student';
          const excludedChildPrefixes = NAV_ACTIVE_EXCLUDED_CHILD_PREFIXES[item.href];
          const isExcludedChild = !!excludedChildPrefixes && !!pathname &&
            excludedChildPrefixes.some(prefix => pathname === prefix || pathname.startsWith(prefix + '/'));
          const active = isHome
            ? pathname === item.href
            : !isExcludedChild && (pathname === item.href || !!pathname?.startsWith(item.href + '/'));
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

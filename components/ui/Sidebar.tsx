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
// 2026-10-23 (UI plan Phase 1, claude/ui-improvement-plan-2026-10-23.md): the
// flat list became groups with submenus (operator: "menu and submenu"). A
// group with one visible item shows as a plain link. Widths: below lg the
// mobile drawer (Header.tsx) shows the same tree; lg–xl is an icon rail whose
// group icons open a fly-out; xl+ is the full tree. Who sees what is unchanged:
// every item keeps the roles of its page's RoleGate.
// ---------------------------------------------------------------------------

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  LayoutDashboard, Calendar, Users, Wrench, GraduationCap, ClipboardList, Settings,
  ShieldAlert, Wallet, CircleHelp, ChevronDown, ChevronRight, type LucideIcon,
} from 'lucide-react';
import {
  canViewModule, type ModuleKey, REPORTS_VIEW_ROLES, BA_TEST_VIEW_ROLES, BILLING_REPORT_ROLES,
} from '@/lib/permissions';
import { useMyPermissionOverrides } from '@/lib/useMyPermissionOverrides';

export interface NavItem {
  href: string;
  label: string;
  // Kept in sync with each destination page's own RoleGate allowedRoles —
  // this list is a convenience filter, not the access control itself.
  roles: string[];
  // A user whose role isn't in `roles` still sees the item if granted a
  // per-user override for this module (lib/permissions.ts's canViewModule).
  moduleKey?: ModuleKey;
  // Admin Setup sections: the ?tab= values this item stands for (first = the one it opens).
  tabs?: string[];
}
export interface NavGroup { label: string; icon: LucideIcon; items: NavItem[] }

const STAFF_HOME = ['admin', 'instructor', 'super_admin', 'operations', 'maintenance', 'safety_officer'];
const ALL_ROLES = [...STAFF_HOME, 'student', 'accounts'];
const setup = (label: string, tabs: string[]): NavItem => ({ href: `/dashboard/admin/setup?tab=${tabs[0]}`, label, roles: ['super_admin'], tabs });

// Roles hand-synced to each page's RoleGate (see lib/permissions.ts).
const NAV_GROUPS: NavGroup[] = [
  { label: 'Dashboard', icon: LayoutDashboard, items: [
    { href: '/dashboard', label: 'Dashboard', roles: STAFF_HOME },
    { href: '/dashboard/student', label: 'My Dashboard', roles: ['student'] },
  ] },
  { label: 'Flying', icon: Calendar, items: [
    { href: '/dashboard/schedule', label: 'Schedule', roles: ['admin', 'instructor', 'super_admin', 'operations', 'student'] },
    { href: '/dashboard/flights', label: 'Flight Records', roles: ['admin', 'instructor', 'super_admin', 'maintenance', 'accounts'], moduleKey: 'flightRecords' },
    { href: '/dashboard/availability', label: 'Availability & Leave', roles: ['admin', 'instructor', 'super_admin', 'operations', 'student'] },
    { href: '/dashboard/roster', label: 'Duty Roster', roles: ['admin', 'super_admin', 'operations', 'instructor'] },
    { href: '/dashboard/duty-hours', label: 'Duty Hours', roles: ['admin', 'super_admin', 'operations', 'instructor'] },
  ] },
  { label: 'Training', icon: GraduationCap, items: [
    { href: '/dashboard/students', label: 'Students', roles: ['admin', 'instructor', 'super_admin', 'operations'], moduleKey: 'students' },
    { href: '/dashboard/instructor', label: 'My Students', roles: ['instructor'] },
    { href: '/dashboard/progress', label: 'Progress', roles: ['admin', 'instructor', 'super_admin', 'student', 'operations'] },
    { href: '/dashboard/ground-school', label: 'Ground School', roles: ['admin', 'instructor', 'super_admin', 'student', 'operations'] },
  ] },
  { label: 'Fleet & Engineering', icon: Wrench, items: [
    { href: '/dashboard/aircraft', label: 'Aircraft', roles: ['admin', 'instructor', 'super_admin', 'maintenance', 'operations'], moduleKey: 'aircraft' },
    { href: '/dashboard/maintenance', label: 'Maintenance', roles: ['admin', 'instructor', 'super_admin', 'maintenance', 'operations'], moduleKey: 'maintenance' },
    { href: '/dashboard/fuel', label: 'Fuel', roles: ['admin', 'instructor', 'super_admin', 'maintenance', 'operations'], moduleKey: 'fuel' },
    { href: '/dashboard/report-defect', label: 'Report a Defect', roles: ['instructor', 'student'] },
  ] },
  { label: 'Safety & Compliance', icon: ShieldAlert, items: [
    { href: '/dashboard/safety', label: 'Safety Incidents', roles: ['admin', 'instructor', 'super_admin', 'operations', 'maintenance', 'safety_officer'] },
    { href: '/dashboard/reports/breath-analyser', label: 'BA Test Register', roles: BA_TEST_VIEW_ROLES },
    { href: '/dashboard/reports/daily-flying', label: 'Daily Flying Report', roles: REPORTS_VIEW_ROLES },
    { href: '/dashboard/reports/audit-pack', label: 'DGCA Audit Pack', roles: REPORTS_VIEW_ROLES },
    { href: '/dashboard/reports/maintenance-log', label: 'Maintenance Log', roles: REPORTS_VIEW_ROLES },
    { href: '/dashboard/reports/breath-analysis', label: 'Breath Analysis Report', roles: BA_TEST_VIEW_ROLES },
  ] },
  { label: 'Finance', icon: Wallet, items: [
    { href: '/dashboard/accounts', label: 'Accounts', roles: ['admin', 'super_admin', 'operations', 'accounts'] },
    { href: '/dashboard/my-account', label: 'My Account', roles: ['student'] },
    { href: '/dashboard/reports/statements', label: 'Statements', roles: ['student', ...BILLING_REPORT_ROLES] },
    { href: '/dashboard/reports/reconciliation', label: 'Billing Reconciliation', roles: BILLING_REPORT_ROLES },
  ] },
  { label: 'People', icon: Users, items: [
    { href: '/dashboard/instructors', label: 'Instructors', roles: ['admin', 'super_admin', 'operations', 'instructor'], moduleKey: 'instructors' },
    { href: '/dashboard/staff', label: 'Staff', roles: ['admin', 'super_admin'] },
  ] },
  { label: 'Reports', icon: ClipboardList, items: [
    { href: '/dashboard/reports', label: 'Reports', roles: ALL_ROLES },
  ] },
  { label: 'Admin Setup', icon: Settings, items: [
    setup('School setup', ['settings', 'bases', 'holidays']),
    setup('Fleet setup', ['aircraft', 'maintenance-schedule', 'ames']),
    setup('Training setup', ['programs', 'sorties', 'exercises', 'requirements', 'groundschool', 'roles']),
    setup('Users', ['users']),
    setup('Billing setup', ['billing']),
  ] },
  { label: 'Help', icon: CircleHelp, items: [
    { href: '/dashboard/help', label: 'Help', roles: ALL_ROLES },
  ] },
];

// Shared by the desktop rail/tree and the mobile drawer (Header.tsx), so they can't drift.
export function useVisibleNavGroups(): NavGroup[] {
  const { data: session, status } = useSession();
  // Called before the early return, per rules of hooks.
  const overrides = useMyPermissionOverrides();
  // Nothing until we know who's logged in — avoids a flash of an empty nav.
  if (status !== 'authenticated' || !session?.user) return [];
  const role = (session.user as { role?: string }).role ?? '';
  return NAV_GROUPS
    .map(g => ({ ...g, items: g.items.filter(i => i.roles.includes(role) || (i.moduleKey ? canViewModule(role, overrides, i.moduleKey) : false)) }))
    .filter(g => g.items.length > 0);
}

const pathOf = (href: string) => href.split('?')[0];

/** The one item to highlight: the longest href matching the URL (so BA Test Register under /reports wins over Reports). */
function useActiveHref(groups: NavGroup[]): string | null {
  const pathname = usePathname() ?? '';
  const tab = useSearchParams()?.get('tab') ?? 'settings';
  let best: NavItem | null = null;
  for (const item of groups.flatMap(g => g.items)) {
    const p = pathOf(item.href);
    const isHome = p === '/dashboard' || p === '/dashboard/student';
    const hit = isHome ? pathname === p : pathname === p || pathname.startsWith(p + '/');
    if (!hit || (item.tabs && !item.tabs.includes(tab))) continue;
    if (!best || p.length > pathOf(best.href).length) best = item;
  }
  return best?.href ?? null;
}

const activeStyle = { backgroundImage: 'linear-gradient(135deg, var(--accent-fill), var(--accent-fill-strong))', color: 'var(--on-accent)' };
// Hover uses the accent tint: --surface-muted was almost the same as the menu background (operator, 23 Oct).
const rowClass = 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-[var(--accent-soft)]';

/** The grouped menu: a plain link for one-item groups, a collapsible group otherwise. The active page's group opens itself. */
export function NavTree({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname() ?? '';
  const activeHref = useActiveHref(groups);
  const activeGroup = groups.find(g => g.items.some(i => i.href === activeHref))?.label;
  // One group open at a time (operator, 23 Oct): the current page's group, or the one clicked on this page ('' = none).
  // Changing page resets it, so the menu stays short.
  const [picked, setPicked] = useState({ path: '', label: '' });
  const openGroup = picked.path === pathname ? picked.label : activeGroup;
  const isOpen = (label: string) => label === openGroup;
  const toggle = (label: string) => setPicked(p => {
    const cur = p.path === pathname ? p.label : activeGroup; // functional: quick clicks must not undo each other
    return { path: pathname, label: cur === label ? '' : label };
  });

  return (
    <div className="space-y-0.5">
      {groups.map(g => {
        const Icon = g.icon;
        if (g.items.length === 1) {
          const item = g.items[0];
          const active = item.href === activeHref;
          return (
            <Link key={g.label} href={item.href} onClick={onNavigate} aria-current={active ? 'page' : undefined}
              className={rowClass} style={active ? activeStyle : { color: 'var(--text-secondary)' }}>
              <Icon className="w-4 h-4 shrink-0" />{item.label}
            </Link>
          );
        }
        const open = isOpen(g.label);
        const Chevron = open ? ChevronDown : ChevronRight;
        return (
          <div key={g.label}>
            <button type="button" onClick={() => toggle(g.label)} aria-expanded={open}
              className={`${rowClass} w-full cursor-pointer`}
              style={{ color: g.label === activeGroup ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
              <Icon className="w-4 h-4 shrink-0" style={g.label === activeGroup ? { color: 'var(--accent)' } : undefined} />
              <span className="flex-1 text-left">{g.label}</span>
              <Chevron className="w-3.5 h-3.5 shrink-0 text-tertiary" />
            </button>
            {open && (
              <div className="mt-0.5 mb-1 space-y-0.5">
                {g.items.map(item => {
                  const active = item.href === activeHref;
                  return (
                    <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? 'page' : undefined}
                      className="block rounded-lg pl-10 pr-3 py-1.5 text-sm transition-colors hover:bg-[var(--accent-soft)]"
                      style={active ? { ...activeStyle, fontWeight: 600 } : { color: 'var(--text-secondary)' }}>
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** lg–xl: one icon per group; clicking or hovering opens a fly-out listing the group's pages by name. */
function NavRail({ groups }: { groups: NavGroup[] }) {
  const activeHref = useActiveHref(groups);
  const [flyout, setFlyout] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      {groups.map(g => {
        const Icon = g.icon;
        const active = g.items.some(i => i.href === activeHref);
        const style = active ? activeStyle : { color: 'var(--text-secondary)' };
        if (g.items.length === 1) {
          return (
            <Link key={g.label} href={g.items[0].href} title={g.items[0].label} aria-label={g.items[0].label}
              aria-current={active ? 'page' : undefined}
              className="flex items-center justify-center rounded-lg h-10 w-10 mx-auto transition-colors hover:bg-[var(--accent-soft)]" style={style}>
              <Icon className="w-4 h-4" />
            </Link>
          );
        }
        const open = flyout === g.label;
        return (
          <div key={g.label} className="relative" onMouseEnter={() => setFlyout(g.label)} onMouseLeave={() => setFlyout(null)}
            onKeyDown={e => { if (e.key === 'Escape') setFlyout(null); }}
            onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFlyout(null); }}>
            {/* Click only opens: hover has usually opened it already, and a toggle would close it on the same click. */}
            <button type="button" aria-label={g.label} aria-expanded={open} onClick={() => setFlyout(g.label)}
              className="flex items-center justify-center rounded-lg h-10 w-10 mx-auto cursor-pointer transition-colors hover:bg-[var(--accent-soft)]" style={style}>
              <Icon className="w-4 h-4" />
            </button>
            {open && (
              // pl-2 bridges the gap to the rail so the pointer can travel into the fly-out without closing it.
              <div className="absolute left-full top-0 z-40 pl-2">
                <div className="w-56 rounded-lg shadow-lg py-1.5" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <p className="px-3 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-tertiary">{g.label}</p>
                  {g.items.map(item => {
                    const on = item.href === activeHref;
                    return (
                      <Link key={item.href} href={item.href} onClick={() => setFlyout(null)} aria-current={on ? 'page' : undefined}
                        className="block mx-1.5 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-[var(--accent-soft)]"
                        style={on ? { ...activeStyle, fontWeight: 600 } : { color: 'var(--text-secondary)' }}>
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Sidebar() {
  const groups = useVisibleNavGroups();
  if (groups.length === 0) return null;
  return (
    <aside
      aria-label="Main menu"
      className="hidden lg:flex lg:flex-col lg:w-16 xl:w-60 shrink-0 h-screen sticky top-0 lg:overflow-visible xl:overflow-y-auto z-[45]"
      style={{ borderRight: '1px solid var(--border)', backgroundColor: 'var(--surface)' }}
    >
      <nav className="flex-1 py-4 px-2 xl:px-3">
        <div className="xl:hidden"><NavRail groups={groups} /></div>
        <div className="hidden xl:block"><NavTree groups={groups} /></div>
      </nav>
    </aside>
  );
}

// components/ui/Header.tsx
// Shared header component with live IST clock, optional action button, and user menu
'use client';

import { useState, useEffect, useRef, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import Image from 'next/image';
import { signOut, useSession } from 'next-auth/react';
import { ArrowLeft, Plane, Wrench, Crown, GraduationCap, ClipboardList, UserRound, KeyRound, LogOut, LayoutDashboard, ShieldCheck, Menu, X } from 'lucide-react';
import { useFtoSettings } from '@/lib/hooks/useFtoSettings';
import { getLocationDisplay } from '@/lib/location';
import ThemeToggle from './ThemeToggle';
import { useHeaderConfig } from './HeaderContext';
import { useVisibleNavItems, type NavItem } from './Sidebar';
import { useEscapeToClose } from '@/lib/useEscapeToClose';

// ============================================================
// LIVE CLOCK COMPONENT
// ============================================================
function LiveClock() {
  const [time, setTime] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);

  // SSR-hydration-safe client-mount pattern: render a static placeholder
  // until mounted (so server and first client render match), then switch
  // to the live, ticking clock. There's no effect-free way to do this —
  // it's a documented false positive for this rule, not something to
  // restructure around. See https://github.com/facebook/react/issues/34743.
  /* eslint-disable react-hooks/set-state-in-effect -- the disable has to
     wrap the whole effect body: eslint-disable-next-line only covers the
     `useEffect(() => {` line itself, not the setState calls inside it. */
  useEffect(() => {
    setMounted(true);
    setTime(new Date());
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!mounted || !time) {
    return (
      <div className="text-right">
        <p className="text-base font-semibold font-mono tracking-wider">
          --:--
          <span className="text-secondary text-xs ml-1 font-normal">IST</span>
        </p>
        <p className="text-tertiary text-xs hidden sm:block">Loading...</p>
      </div>
    );
  }

  return (
    <div className="text-right">
      <p className="text-base font-semibold font-mono tracking-wider">
        {time.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Kolkata',
          hour12: false,
        })}
        <span className="text-secondary text-xs ml-1 font-normal">IST</span>
      </p>
      <p className="text-tertiary text-xs hidden sm:block">
        {time.toLocaleDateString('en-IN', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          timeZone: 'Asia/Kolkata',
        })}
      </p>
    </div>
  );
}

// ============================================================
// ROLE ICON — small helper so both the full and condensed user
// menu variants below stay in sync on which icon means what.
// ============================================================
function RoleIcon({ role, className }: { role?: string; className?: string }) {
  if (role === 'super_admin' || role === 'maintenance') return <Wrench className={className} />;
  if (role === 'admin') return <Crown className={className} />;
  if (role === 'instructor') return <GraduationCap className={className} />;
  if (role === 'operations') return <ClipboardList className={className} />;
  if (role === 'safety_officer') return <ShieldCheck className={className} />;
  return <UserRound className={className} />;
}

// ============================================================
// MOBILE NAV LINKS — Dashboard / Setup
// ============================================================
// Sidebar.tsx (app/dashboard/layout.tsx) covers this same navigation from
// lg (1024px) up, so these are hidden there to stop the header repeating
// what the sidebar already offers — that duplication (two "Dashboard"
// links, two ways to reach Setup, all crammed alongside the clock, the
// theme toggle and the full user menu in one row) was a big part of why
// the header felt cluttered. Below lg, where Sidebar renders nothing at
// all, these stay exactly as they always were — no loss of access on
// phone/narrow-tablet widths.
function MobileNavLinks({ role }: { role?: string }) {
  const dashboardUrl = role === 'student' ? '/dashboard/student' :
                       role === 'instructor' ? '/dashboard/instructor' : '/dashboard';
  return (
    <div className="flex lg:hidden items-center gap-3">
      <Link href={dashboardUrl} className="text-secondary hover:text-accent transition" aria-label="Dashboard">
        <LayoutDashboard className="w-4 h-4" />
      </Link>
      {role === 'super_admin' && (
        <Link href="/dashboard/admin/setup" className="text-secondary hover:text-accent transition" aria-label="Admin Setup">
          <Wrench className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}

// ============================================================
// MOBILE NAV DRAWER — 2026-09-23 UI audit finding: Sidebar.tsx (the full
// 13-item nav) is `hidden lg:flex`, and below that width the only nav was
// MobileNavLinks' two icon shortcuts above — Fuel, Maintenance, Instructors,
// Safety, Duty Hours, Reports etc. were simply unreachable on phone/tablet
// except by guessing a URL. This reuses Sidebar's own role-filtered item
// list (useVisibleNavItems) so it can never drift from what the desktop
// rail shows.
// ============================================================
function MobileNavDrawer() {
  const [open, setOpen] = useState(false);
  const items = useVisibleNavItems();

  if (items.length === 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex lg:hidden text-secondary hover:text-accent transition"
        aria-label="Open navigation menu"
      >
        <Menu className="w-5 h-5" />
      </button>
      {/* Mounted only while open, like every other modal in this app — so
          useEscapeToClose (below) registers/unregisters with the drawer's
          own open/close lifecycle instead of this always-mounted parent's. */}
      {open && <MobileNavPanel items={items} onClose={() => setOpen(false)} />}
    </>
  );
}

// Split out of MobileNavDrawer so useEscapeToClose — the same shared hook
// every other modal/dialog in this app already uses (see
// lib/useEscapeToClose.ts) — only registers while the drawer is actually
// open. Calling it unconditionally in MobileNavDrawer itself would register
// it for that component's whole (always-mounted) lifetime, letting an
// Escape press it shouldn't own take priority over whatever modal a page is
// actually showing.
function MobileNavPanel({ items, onClose }: { items: NavItem[]; onClose: () => void }) {
  useEscapeToClose(onClose);

  if (typeof document === 'undefined') return null;

  return createPortal(
    // Portaled straight to <body>: the <header> this button lives in has
    // `backdrop-blur-sm`, and a `backdrop-filter` on an ancestor makes
    // that ancestor the containing block for a `fixed`-positioned
    // descendant (same rule as `filter`/`transform`) — so without the
    // portal, `fixed inset-0` here would resolve against the header's
    // own ~60px box instead of the viewport, which is exactly the
    // "drawer looks cut off at the header" bug seen live 2026-09-23.
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
      />
      <nav
        className="absolute left-0 top-0 h-full w-64 max-w-[80vw] overflow-y-auto py-4 px-2"
        style={{ backgroundColor: 'var(--surface)', borderRight: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between px-2 pb-3 mb-1 border-b divider">
          <span className="text-sm font-semibold">Menu</span>
          <button onClick={onClose} aria-label="Close navigation menu" className="text-secondary hover:text-accent transition">
            <X className="w-5 h-5" />
          </button>
        </div>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--surface-muted)]"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>,
    document.body
  );
}

// ============================================================
// USER MENU – single avatar that opens a small dropdown with
// account info, Change Password, and Logout. Previously this was two
// entirely separate blocks of markup (one for md+, one for mobile) that
// each spelled out name, a Dashboard link, a Setup link, Change Password,
// and Logout as five-plus separate inline elements — one avatar with a
// dropdown is the same functionality (minus the two links Sidebar/
// MobileNavLinks above already cover) in a fraction of the header's width.
// ============================================================
function UserMenu() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!session?.user) return null;

  const role = (session.user as { role?: string }).role;

  return (
    <>
      <MobileNavLinks role={role} />
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-full pl-1 pr-1 md:pr-2.5 py-1 transition cursor-pointer hover:bg-[var(--surface-muted)]"
          aria-label="Account menu"
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0"
            style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <RoleIcon role={role} className="w-3.5 h-3.5" />
          </div>
          <span className="hidden lg:inline text-xs text-secondary max-w-[110px] truncate">{session.user.name}</span>
        </button>

        {open && (
          <div
            className="absolute right-0 top-full mt-2 w-52 rounded-lg shadow-lg z-30 py-1 overflow-hidden"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="px-3 py-2.5 border-b divider">
              <p className="text-sm font-medium truncate">{session.user.name}</p>
              <p className="text-xs text-tertiary capitalize">{role?.replace(/_/g, ' ')}</p>
            </div>
            <Link
              href="/change-password"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2.5 text-sm text-secondary hover:bg-[var(--surface-muted)] transition"
            >
              <KeyRound className="w-3.5 h-3.5" /> Change Password
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-[var(--surface-muted)] transition cursor-pointer"
              style={{ color: 'var(--danger)' }}
            >
              <LogOut className="w-3.5 h-3.5" /> Logout
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ============================================================
// SHARED HEADER COMPONENT
// ============================================================
interface HeaderProps {
  // All optional now: app/dashboard/** pages no longer pass these at all —
  // they call useSetHeader() instead and Header reads the result from
  // HeaderContext (see below). Pages outside app/dashboard/layout.tsx's
  // scope (app/change-password, /login, etc.) still pass these directly;
  // any prop passed explicitly wins over context.
  title?: string;
  subtitle?: string;
  backUrl?: string;
  action?: ReactNode;
}

// Sidebar.tsx's own nav links already reach these exact destinations at
// `lg`+ (1024px) — a "Back" link pointing at the same place is pure
// duplication at that width, so it's hidden there (and left exactly as it
// always was below `lg`, where Sidebar doesn't render). Any backUrl NOT in
// this list — e.g. '/', which nothing in Sidebar points to — keeps Back
// visible at every width.
const BACK_URLS_COVERED_BY_SIDEBAR = ['/dashboard', '/dashboard/student', '/dashboard/ground-school'];

export default function Header(props: HeaderProps = {}) {
  const headerConfig = useHeaderConfig();
  const { data: session, status } = useSession();
  // FTO Settings is SWR-migrated (Stage 8, 2026-09-02) — fetch-on-mount,
  // shared across every page via the same cache, so the old defensive
  // per-page load effect this header used to need (landing directly on a
  // non-dashboard page used to leave ftoSettings empty here — silently
  // falling back to the default icon and a hardcoded "VOBL - Bangalore"
  // airport label) is no longer necessary: this hook fetches itself
  // regardless of which page renders first.
  const { ftoSettings } = useFtoSettings();

  const title = props.title ?? headerConfig.title;
  const subtitle = props.subtitle ?? headerConfig.subtitle;
  const backUrl = props.backUrl ?? headerConfig.backUrl ?? '/dashboard';
  const action = props.action ?? headerConfig.action;
  const backCoveredBySidebar = BACK_URLS_COVERED_BY_SIDEBAR.includes(backUrl);

  // Mirrors Sidebar.tsx's own guard: render nothing until we actually know
  // someone's logged in. Previously unnecessary here since Header only ever
  // mounted from inside a page's own <ProtectedRoute>; now that Header also
  // lives in app/dashboard/layout.tsx (outside any single page's
  // ProtectedRoute), it needs to gate itself the same way.
  if (status !== 'authenticated' || !session?.user) return null;

  return (
    // relative z-40 (2026-09-24): backdrop-blur makes the header its own
    // stacking context, which trapped the account menu's z-30 inside it — any
    // positioned element further down the page (e.g. the Staff table) painted
    // over the open menu and swallowed clicks on Logout. Modals and the mobile
    // drawer are z-50, so they still cover the header.
    <header className="relative z-40 border-b divider backdrop-blur-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--surface) 85%, transparent)' }}>
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          {/* Left section */}
          <div className="flex items-center gap-3 min-w-0">
            <MobileNavDrawer />
            <Link
              href={backUrl}
              className={`text-secondary hover:text-accent transition flex items-center gap-1 text-sm flex-shrink-0 ${backCoveredBySidebar ? 'lg:hidden' : ''}`}
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </Link>
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Logo - Custom from FTO Settings or Default */}
              {ftoSettings?.logo_url && ftoSettings?.show_logo === 'true' ? (
                <Image
                  src={ftoSettings.logo_url}
                  alt="FTO Logo"
                  width={120}
                  height={32}
                  unoptimized
                  className="h-8 w-auto object-contain flex-shrink-0"
                />
              ) : (
                <div className="brand-mark w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Plane className="w-4 h-4" style={{ stroke: '#ffffff' }} />
                </div>
              )}
              {/* Hidden fallback for broken logo */}
              <div id="header-logo-fallback" style={{ display: 'none' }} className="brand-mark w-8 h-8 rounded-lg flex-shrink-0">
                <Plane className="w-4 h-4" style={{ stroke: '#ffffff' }} />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold truncate">{title}</h1>
                {subtitle && (
                  <p className="text-tertiary text-xs hidden sm:block truncate">{subtitle}</p>
                )}
              </div>
            </div>
          </div>

          {/* Right section */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {action && action}
            <ThemeToggle />
            <UserMenu />
            {/* 2026-09-23 UI audit finding #5: this used to show from md
                (768px) up, so on tablet widths (768-1023, below the lg
                breakpoint where the hamburger/mobile-drawer nav is still in
                play) the clock+location block, the account name span, and
                the theme toggle all competed with the title for space, and
                the title — the only element with `truncate` — absorbed the
                entire squeeze (down to "F.." for "FlightPro Manager").
                Deferred to lg to match the same "below-desktop is compact
                mode" threshold MobileNavDrawer/MobileNavLinks already use. */}
            <div className="hidden lg:flex items-center gap-3 border-l divider pl-3">
              <LiveClock />
              <div className="text-right">
                <p className="text-tertiary text-xs">
                  {getLocationDisplay(ftoSettings?.airport_code || '', ftoSettings?.location_name || '')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

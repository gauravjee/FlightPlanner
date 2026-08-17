// components/ui/Header.tsx
// Shared header component with live IST clock, optional action button, and user menu
'use client';

import { useState, useEffect, ReactNode } from 'react';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { ArrowLeft, Plane, Wrench, Crown, GraduationCap, ClipboardList, UserRound, KeyRound, LogOut } from 'lucide-react';
import { useFlightStore } from '@/lib/store';
import { getLocationDisplay } from '@/lib/location';
import ThemeToggle from './ThemeToggle';

// ============================================================
// LIVE CLOCK COMPONENT
// ============================================================
function LiveClock() {
  const [time, setTime] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTime(new Date());
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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
function RoleIcon({ role, className }: { role: string; className?: string }) {
  if (role === 'super_admin' || role === 'maintenance') return <Wrench className={className} />;
  if (role === 'admin') return <Crown className={className} />;
  if (role === 'instructor') return <GraduationCap className={className} />;
  if (role === 'operations') return <ClipboardList className={className} />;
  return <UserRound className={className} />;
}

// ============================================================
// USER MENU – shows logged‑in user and logout button
// ============================================================
function UserMenu() {
  const { data: session } = useSession();

  if (!session?.user) return null;

  const role = (session.user as any).role;
  const dashboardUrl = role === 'student' ? '/dashboard/student' :
                       role === 'instructor' ? '/dashboard/instructor' : '/dashboard';

  return (
    <>
      {/* Full version — enough room to show labels */}
      <div className="hidden md:flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-secondary">
          <RoleIcon role={role} className="w-3.5 h-3.5" />
          <span>{session.user.name}</span>
        </div>
        <Link href={dashboardUrl} className="text-xs text-accent hover:opacity-80">
          Dashboard
        </Link>
        {role === 'super_admin' && (
          <Link href="/dashboard/admin/setup" className="text-xs text-secondary hover:text-accent flex items-center gap-1">
            <Wrench className="w-3.5 h-3.5" /> Setup
          </Link>
        )}
        <Link href="/change-password" className="text-xs text-secondary hover:opacity-80 transition flex items-center gap-1">
          <KeyRound className="w-3.5 h-3.5" /> Change PW
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="badge badge-danger hover:opacity-80 transition cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5 mr-1" /> Logout
        </button>
      </div>

      {/* Condensed version — icon-only, for narrow screens */}
      <div className="flex md:hidden items-center gap-3">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold surface-muted text-secondary"
          title={session.user.name || ''}
        >
          <RoleIcon role={role} className="w-3.5 h-3.5" />
        </div>
        <Link href="/change-password" className="text-secondary" aria-label="Change password">
          <KeyRound className="w-4 h-4" />
        </Link>
        <button onClick={() => signOut({ callbackUrl: '/login' })} aria-label="Logout" style={{ color: 'var(--danger)' }}>
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </>
  );
}

// ============================================================
// SHARED HEADER COMPONENT
// ============================================================
interface HeaderProps {
  title: string;
  subtitle?: string;
  backUrl?: string;
  action?: ReactNode;
}

export default function Header({ title, subtitle, backUrl = '/dashboard', action }: HeaderProps) {
  const store = useFlightStore();
  const ftoSettings = store.ftoSettings;

  // Defensive load — this header renders on every dashboard page, but only
  // the main dashboard page (app/dashboard/page.tsx) previously called
  // loadFTOSettings(). Landing directly on any other page (bookmark, deep
  // link, refresh) meant ftoSettings was still empty here: this affected
  // both the custom-logo lookup just below (silently fell back to the
  // default icon) and the airport label further down (bug fix: used to
  // just hardcode "VOBL - Bangalore" regardless of this at all).
  useEffect(() => {
    if (Object.keys(ftoSettings).length === 0) store.loadFTOSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ftoSettings]);

  return (
    <header className="border-b divider backdrop-blur-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--surface) 85%, transparent)' }}>
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          {/* Left section */}
          <div className="flex items-center gap-3 min-w-0">
            <Link href={backUrl} className="text-secondary hover:text-accent transition flex items-center gap-1 text-sm flex-shrink-0">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </Link>
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Logo - Custom from FTO Settings or Default */}
              {ftoSettings?.logo_url && ftoSettings?.show_logo === 'true' ? (
                <img
                  src={ftoSettings.logo_url}
                  alt="FTO Logo"
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
            <div className="hidden md:flex items-center gap-3 border-l divider pl-3">
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

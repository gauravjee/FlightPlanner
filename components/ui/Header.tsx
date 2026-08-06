// components/ui/Header.tsx
// Shared header component with live IST clock, optional action button, and user menu
'use client';

import { useState, useEffect, ReactNode } from 'react';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { useFlightStore } from '@/lib/store';


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
        <p className="text-lg font-bold text-white font-mono tracking-wider">
          --:--:--
          <span className="text-xs text-slate-400 ml-1 font-normal">IST</span>
        </p>
        <p className="text-xs text-slate-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="text-right">
      <p className="text-lg font-bold text-white font-mono tracking-wider">
        {time.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'Asia/Kolkata',
          hour12: false,
        })}
        <span className="text-xs text-slate-400 ml-1 font-normal">IST</span>
      </p>
      <p className="text-xs text-slate-500">
        {time.toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'Asia/Kolkata',
        })}
      </p>
    </div>
  );
}

// ============================================================
// USER MENU – shows logged‑in user and logout button
// ============================================================
function UserMenu() {
  const { data: session } = useSession();

  if (!session?.user) return null;

  const role = (session.user as any).role;
  const dashboardUrl = role === 'student' ? '/dashboard/student' : '/dashboard';

  return (
    <div className="flex items-center space-x-2">
      <div className="text-right hidden md:block">
        <p className="text-xs text-slate-400">
          {role === 'super_admin' ? '🔧' : role === 'admin' ? '👑' : role === 'instructor' ? '👨‍🏫' : '👨‍✈️'}{' '}
          {session.user.name}
        </p>
      </div>
      <Link href={dashboardUrl} className="text-xs text-blue-400 hover:text-blue-300">
        Dashboard
      </Link>
      {/* Super Admin Setup Link */}
      {role === 'super_admin' && (
        <Link href="/dashboard/admin/setup" className="text-xs text-yellow-400 hover:text-yellow-300">
          🔧 Setup
        </Link>
      )}
      <button
        onClick={() => signOut({ callbackUrl: '/login' })}
        className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs hover:bg-red-500/30 transition cursor-pointer"
      >
        🚪 Logout
      </button>
    </div>
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
    return (
    <header className="border-b border-slate-700 bg-slate-800/50 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Left section */}
          <div className="flex items-center space-x-4">
            <Link href={backUrl} className="text-slate-400 hover:text-white transition text-sm">
              ← Back
            </Link>
            <div className="flex items-center space-x-3">
              

              {/* Logo - Custom from FTO Settings or Default */}
              {ftoSettings?.logo_url && ftoSettings?.show_logo === 'true' ? (
                <img 
                  src={ftoSettings.logo_url} 
                  alt="FTO Logo" 
                  className="h-8 w-auto object-contain"
                />
              ) : (
                <span className="text-2xl">✈️</span>
              )}
              {/* Hidden fallback for broken logo */}
              <span id="header-logo-fallback" style={{ display: 'none' }} className="text-2xl">✈️</span>
              <div>
                <h1 className="text-xl font-bold text-white">{title}</h1>
                {subtitle && (
                  <p className="text-xs text-slate-400">{subtitle}</p>
                )}
              </div>
            </div>
          </div>

          {/* Right section */}
          <div className="flex items-center space-x-4">
            {action && action}
            <UserMenu />
            <div className="flex items-center space-x-4">
              <LiveClock />
              <div className="text-right">
                <p className="text-xs text-slate-500">VOBL - Bangalore</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
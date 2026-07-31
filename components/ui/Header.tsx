// components/ui/Header.tsx
// Shared header component with live IST clock and optional action button
// Used on all dashboard pages for consistent navigation
'use client';

import { useState, useEffect, ReactNode } from 'react';
import Link from 'next/link';

// ============================================================
// LIVE CLOCK COMPONENT
// Shows current time in IST, updates every second
// ============================================================
function LiveClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    // Update clock every second
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer); // Cleanup on unmount
  }, []);

  return (
    <div className="text-right">
      {/* Time in 24-hour format (aviation standard) */}
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
      {/* Current date */}
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
// SHARED HEADER COMPONENT
// Props:
//   title      - Page title (e.g., "Aircraft Fleet")
//   subtitle   - Optional subtitle below title
//   backUrl    - URL for the back button (default: /dashboard)
//   action     - Optional action button/component on the right
// ============================================================
interface HeaderProps {
  title: string;
  subtitle?: string;
  backUrl?: string;
  action?: ReactNode;  // Optional action button (Add, Book, Log, etc.)
}

export default function Header({ title, subtitle, backUrl = '/dashboard', action }: HeaderProps) {
  return (
    <header className="border-b border-slate-700 bg-slate-800/50 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          
          {/* ===== LEFT SECTION: Back button + Icon + Title ===== */}
          <div className="flex items-center space-x-4">
            <Link href={backUrl} className="text-slate-400 hover:text-white transition text-sm">
              ← Back
            </Link>
            <div className="flex items-center space-x-3">
              <span className="text-2xl">✈️</span>
              <div>
                <h1 className="text-xl font-bold text-white">{title}</h1>
                {subtitle && (
                  <p className="text-xs text-slate-400">{subtitle}</p>
                )}
              </div>
            </div>
          </div>
          
          {/* ===== RIGHT SECTION: Action Button + Live Clock + Airport ===== */}
          <div className="flex items-center space-x-4">
            {/* Optional action button (Add Aircraft, Book Slot, Log Fuel, etc.) */}
            {action && action}
            
            {/* Live clock and airport */}
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
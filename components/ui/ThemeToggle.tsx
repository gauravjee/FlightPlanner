// components/ui/ThemeToggle.tsx
// Dark/light theme switch. Dark ("Aviation Instrument") is the default —
// light exists specifically for outdoor/field use (instructors and
// maintenance crew checking the app in direct sunlight, where the
// translucent dark cards are hard to read), not as a generic preference
// toggle. See lib/store.ts for how the choice is persisted.
'use client';

import { useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useFlightStore } from '@/lib/store';

export default function ThemeToggle() {
  const theme = useFlightStore(state => state.theme);
  const setTheme = useFlightStore(state => state.setTheme);
  const toggleTheme = useFlightStore(state => state.toggleTheme);

  // The store's initial value is a fixed guess ('dark') so server and
  // client render the same thing on first paint. The inline script in
  // app/layout.tsx already set the correct data-theme attribute on <html>
  // before this ever rendered — this effect just brings the store's state
  // (and therefore this toggle's icon) in line with whatever that script
  // decided, without touching the DOM attribute again.
  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme');
    if (current === 'light' || current === 'dark') {
      if (current !== theme) setTheme(current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLight = theme === 'light';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
      title={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
      className="relative w-11 h-6 rounded-full flex items-center px-0.5 transition-colors cursor-pointer"
      style={{ backgroundColor: isLight ? 'var(--border)' : 'var(--surface-muted)' }}
    >
      <span
        className="w-[18px] h-[18px] rounded-full flex items-center justify-center shadow transition-transform"
        style={{
          backgroundColor: isLight ? 'var(--accent)' : '#ffffff',
          transform: isLight ? 'translateX(0)' : 'translateX(20px)',
        }}
      >
        {isLight ? (
          <Sun className="w-3 h-3" style={{ stroke: '#ffffff' }} />
        ) : (
          <Moon className="w-3 h-3" style={{ stroke: '#0a0e14' }} />
        )}
      </span>
    </button>
  );
}

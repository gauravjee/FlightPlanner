// components/ui/ThemeToggle.tsx
// Dark/light theme switch. Dark ("Aviation Instrument") is the default —
// light exists specifically for outdoor/field use (instructors and
// maintenance crew checking the app in direct sunlight, where the
// translucent dark cards are hard to read), not as a generic preference
// toggle.
//
// The theme lives in exactly two places, neither of them React state:
// the `data-theme` attribute on <html> (what the CSS actually reads) and
// the 'fp-theme' localStorage key (what survives a reload). The inline
// script in app/layout.tsx sets the attribute before first paint so the
// page never flashes the wrong theme; this component is the only thing
// that ever changes it afterwards.
//
// Until 2026-09-03 the value was also mirrored into the Zustand store,
// which meant a third copy that had to be re-synced from the DOM in a
// mount effect. useSyncExternalStore reads the attribute directly instead
// — React's own primitive for subscribing to a mutable external source.
// It is SSR-safe (getServerSnapshot returns the same 'dark' default the
// inline script falls back to) and needs no mount effect, so there's no
// setState-in-effect to lint around.
'use client';

import { useSyncExternalStore } from 'react';
import { Sun, Moon } from 'lucide-react';

type Theme = 'dark' | 'light';

// The <html> attribute is only ever written here and by layout.tsx's
// pre-paint script, but observing it keeps this honest if anything else
// (a devtools poke, a future settings page) changes it.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

const getTheme = (): Theme =>
  document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => 'dark' as Theme);

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      window.localStorage.setItem('fp-theme', next);
    } catch {
      // Private mode / storage disabled — the theme still applies for this
      // page view, it just won't survive a reload. Not worth failing over.
    }
  };

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

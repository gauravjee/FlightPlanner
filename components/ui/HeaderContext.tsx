// components/ui/HeaderContext.tsx
// ---------------------------------------------------------------------------
// Lets app/dashboard/** pages configure the persistent <Header /> (title,
// subtitle, backUrl, action) without each one instantiating its own Header
// element.
//
// Why this exists: every app/dashboard/**/page.tsx used to render its own
// <Header title=... /> directly in its JSX. Since app/dashboard/layout.tsx
// only rendered {children}, Next.js fully unmounted the previous page's
// Header instance and mounted a brand-new one on every navigation — visible
// as a flicker (LiveClock resetting to "Loading...", the user menu's
// dropdown state resetting, the whole bar repainting) even though
// Sidebar.tsx, which IS hoisted into layout.tsx, stayed perfectly stable
// across the same navigation.
//
// Fix: Header now lives in app/dashboard/layout.tsx exactly like Sidebar,
// so it never unmounts while navigating between dashboard pages. Each page
// instead calls useSetHeader({ title, subtitle, backUrl, action }) once on
// mount to tell the persistent Header what to display.
//
// Pages OUTSIDE app/dashboard/layout.tsx's scope (app/change-password,
// /login, /reset-password, /unauthorized, root /) are untouched by this —
// they keep instantiating <Header title=.../> directly as a fully
// self-contained element. Header.tsx still supports that: explicit props
// always win over context (see Header.tsx).
//
// Split into two contexts on purpose:
//  - HeaderConfigContext's value (the config object) changes every time a
//    page calls useSetHeader — Header.tsx is the only consumer, so it's the
//    only component that re-renders when the title/subtitle/action change.
//  - HeaderSetterContext's value is the raw setState function returned by
//    useState, which React guarantees is referentially stable across
//    re-renders. Pages consume THIS one (via useSetHeader), so calling
//    setConfig never re-renders the page that called it. That matters
//    because several pages pass `action` as inline JSX — a new object every
//    render. If pages subscribed to the config value too, updating it would
//    re-render the page, which would recreate `action`, re-fire the sync
//    effect below, and update the config again — an infinite render loop.
// ---------------------------------------------------------------------------

'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useState, ReactNode } from 'react';

export interface HeaderConfig {
  title: string;
  subtitle?: string;
  backUrl?: string;
  action?: ReactNode;
}

const DEFAULT_HEADER: HeaderConfig = { title: 'FlightPro Manager' };

const HeaderConfigContext = createContext<HeaderConfig>(DEFAULT_HEADER);
const HeaderSetterContext = createContext<(config: HeaderConfig) => void>(() => {});

// useLayoutEffect fires before the browser paints, so the header's content
// updates in the same frame the new page's own content appears (no stale
// title/subtitle visible for a frame). It's a no-op (with a console warning)
// during SSR, so fall back to useEffect there — this only matters for
// client-side navigation after hydration anyway.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function HeaderProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<HeaderConfig>(DEFAULT_HEADER);
  return (
    <HeaderSetterContext.Provider value={setConfig}>
      <HeaderConfigContext.Provider value={config}>
        {children}
      </HeaderConfigContext.Provider>
    </HeaderSetterContext.Provider>
  );
}

// Used internally by Header.tsx to read the active page's config when it's
// rendered without explicit props (the persistent dashboard-layout usage).
export function useHeaderConfig(): HeaderConfig {
  return useContext(HeaderConfigContext);
}

// Called by each dashboard page, once, to configure the persistent Header
// instead of rendering its own <Header title=... /> element. Re-registers
// whenever title/subtitle/backUrl/action change (e.g. once async data like
// a student's name finishes loading).
export function useSetHeader(config: HeaderConfig) {
  const setConfig = useContext(HeaderSetterContext);
  const { title, subtitle, backUrl, action } = config;
  useIsomorphicLayoutEffect(() => {
    setConfig({ title, subtitle, backUrl, action });
    // No cleanup/reset on unmount: the next page's own useSetHeader call
    // fires in the same navigation commit, so the header updates in place
    // rather than flashing back to the default title first.
  }, [setConfig, title, subtitle, backUrl, action]);
}

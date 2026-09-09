// components/ui/AuthProvider.tsx
'use client';

import { SessionProvider } from 'next-auth/react';
import { SWRConfig } from 'swr';

// SWR global config (2026-08-28, start of the SWR migration — see
// docs/ swr-migration plan / lib/hooks/*.ts). This is the ONE place that
// sets defaults for every domain hook in lib/hooks/ — individual hooks
// should not override these unless a specific domain genuinely needs to
// (e.g. a future polling domain passing its own refreshInterval).
//
// Tuned for an internal, role-gated single-tenant dashboard, not a public
// site — SWR's out-of-the-box defaults assume the latter:
//   - revalidateOnFocus: false — matches the app's existing behavior
//     (nothing today re-fetches when a staff member tabs back in), and
//     avoids surprise network chatter on what may be a school's slow/
//     metered connection.
//   - revalidateOnReconnect: true (SWR's own default, kept explicit here
//     so it's not silently relying on a future SWR version's default) —
//     a genuinely useful safety net for a dropped wifi / sleeping laptop.
//   - dedupingInterval: 5000 (SWR's own default, kept explicit) — helps
//     with the "every page revisit re-fetches everything" finding in the
//     2026-08-28 performance audit.
//     ⚠️ CORRECTED 2026-09-05: this previously claimed "two mounts of the
//     same key within 5s share one request." That is NOT what it does. SWR
//     clears a key's dedup entry when the request SETTLES, so the interval
//     only collapses requests that overlap IN FLIGHT. A component mounting
//     after an earlier fetch resolved starts a new request no matter how
//     recent it was. Relying on the wrong reading of this hid a genuine
//     double-fetch on the Dashboard for a week (item 81) — if two mounts
//     must share a fetch, they have to subscribe in the same commit.
//   - errorRetryCount: 3 — cap retries so a broken API route doesn't retry
//     forever in the background on a page someone's since navigated away
//     from.
const swrConfig = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 5000,
  errorRetryCount: 3,
};

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SWRConfig value={swrConfig}>{children}</SWRConfig>
    </SessionProvider>
  );
}

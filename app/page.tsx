// ============================================================
// app/page.tsx - ROOT REDIRECT
// ============================================================
// This used to be a marketing/demo landing page with hardcoded fake stats
// (5/7 Active Aircraft, 12 Today's Flights, etc.) that never reflected real
// data and wasn't wired into the app's design tokens at all — reviewed
// 2026-08-17 and confirmed stale. Since this is an internal FTO operations
// tool rather than a public product, root '/' has no real content of its
// own to show: it just sends everyone straight to /login, which already
// handles getting an authenticated user to the right dashboard.
// ============================================================

import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/login');
}

// lib/auth-client.ts
// Browser-safe login helper. This is intentionally split from lib/auth.ts,
// which is server-only (it uses supabaseAdmin / the service-role key) —
// the login page is a client component, and that module hard-crashes if
// ever evaluated in a browser bundle, precisely to catch that class of
// mistake loudly instead of silently.
//
// 2026-09-18 (RLS remediation, Batch 5): this used to insert into
// `login_audit` directly from the browser with the anon key — that table
// had no RLS at all, so the same key could also read the whole audit trail
// (timestamps, emails, statuses), not just write to it. Now goes through
// POST /api/auth/login-audit, service-role only. No import from either
// supabase client remains in this file.

export async function logLoginAttempt(email: string, status: 'SUCCESS' | 'FAILED') {
  try {
    await fetch('/api/auth/login-audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, status }),
    });
  } catch {
    // Best-effort audit log — a network hiccup here must never block the
    // login flow itself (matches the old direct insert, whose error was
    // likewise never surfaced to the caller).
  }
}

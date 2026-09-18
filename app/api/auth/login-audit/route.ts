// app/api/auth/login-audit/route.ts
// Records a single login attempt (success or failure) to `login_audit`.
//
// 2026-09-18 (RLS remediation, Batch 5): this insert used to run directly
// from the browser with the anon key (lib/auth-client.ts) — login_audit
// had no RLS at all, so the same anon key could also read the whole trail
// (timestamps, emails, statuses), not just write to it. Moved here,
// service-role only.
//
// Deliberately NOT behind requireSession(): a FAILED login attempt has no
// session to require — this route IS the auth boundary for this table,
// not an addition on top of one. It accepts only the two fields the UI has
// ever sent (email, status) and writes nothing else, so it can't be used
// to touch any other row or column.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { email, status } = body as { email?: unknown; status?: unknown };
  if (typeof email !== 'string' || !email || (status !== 'SUCCESS' && status !== 'FAILED')) {
    return NextResponse.json({ error: 'Invalid audit payload.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('login_audit').insert({
    user_email: email,
    login_status: status,
  });
  if (error) {
    console.error('Error writing login_audit:', error);
    return NextResponse.json({ error: 'Failed to record login attempt.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

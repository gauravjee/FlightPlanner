// app/api/auth/login-audit/route.ts
// RETIRED 2026-09-21 (P1 rate limiting). login_audit is now written only by
// the server, inside NextAuth's authorize() (lib/auth-options.ts).
//
// This route used to let the browser record login attempts. It was
// unauthenticated by necessity, which is harmless for a plain audit log but
// not once failed attempts drive an account lockout: anyone could POST
// {email, status:'FAILED'} five times and lock that user out without ever
// attempting a login. It now only answers 410 so any stale browser bundle
// fails quietly (lib/auth-client.ts swallows the response).
//
// Safe to delete this file and lib/auth-client.ts — nothing imports them.

import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: 'Gone.' }, { status: 410 });
}

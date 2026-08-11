// app/api/auth/reset-password/verify/route.ts
// Checks whether a password reset token (from the emailed reset link) is
// still valid, WITHOUT marking it as used and without requiring the caller
// to be logged in. Used by app/reset-password/page.tsx on page load to
// decide whether to show the "token reset" or "forced reset" form.
//
// Marking the token used happens in /api/auth/reset-password, and only
// after the password has actually been changed — verifying a token here no
// longer burns it, so a page refresh (or a slow network) can't lock a user
// out of their own reset link.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: Request) {
  let token: string | undefined;

  try {
    const body = await request.json();
    token = body.token;
  } catch {
    return NextResponse.json({ valid: false }, { status: 400 });
  }

  if (!token) {
    return NextResponse.json({ valid: false }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('password_reset_tokens')
    .select('id, expires_at, used, users!inner(email)')
    .eq('token', token)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .single<{ id: string; expires_at: string; used: boolean; users: { email: string } | { email: string }[] }>();

  if (error || !data) {
    return NextResponse.json({ valid: false });
  }

  const email = Array.isArray(data.users) ? data.users[0]?.email : data.users?.email;

  return NextResponse.json({ valid: true, email });
}

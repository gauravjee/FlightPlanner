// app/api/auth/reset-password/route.ts
// Server-side password reset for both flows previously handled client-side
// in app/reset-password/page.tsx:
//
//   1. TOKEN RESET — body: { token, newPassword }
//      The token proves identity (it came from an emailed link), so no
//      session is required. Claimed in password_reset_tokens with ONE
//      atomic conditional update (used=false -> true), so two concurrent
//      requests can't both redeem it. If the password update then fails,
//      the claim is released so the user can retry with the same link.
//
//   2. FORCED RESET — body: { oldPassword, newPassword }
//      Used right after a first-time login when force_password_reset is
//      set. The user's identity comes from the NextAuth session (they're
//      already logged in at this point in the flow) — never from a
//      client-supplied email — so this can't be used to reset someone
//      else's password.
//
// In both cases the password hash is read, compared, and rewritten
// entirely on the server; it's never sent to the browser.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import bcrypt from 'bcryptjs';
import { authOptions } from '@/lib/auth-options';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: Request) {
  let body: { token?: string; oldPassword?: string; newPassword?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { token, oldPassword, newPassword } = body;

  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json(
      { error: 'Password must be at least 8 characters for security.' },
      { status: 400 }
    );
  }

  let userId: string;
  let tokenRowId: string | null = null;

  // Undo the token claim after a failed password update, so a transient
  // error doesn't burn the user's reset link. Best-effort by design.
  const releaseToken = async () => {
    if (!tokenRowId) return;
    const { error } = await supabaseAdmin
      .from('password_reset_tokens')
      .update({ used: false })
      .eq('id', tokenRowId);
    if (error) console.error('Could not release reset token:', tokenRowId, error);
  };

  try {
    if (token) {
      // ============================================================
      // TOKEN-BASED RESET
      // ============================================================
      // 2026-09-21 (P1): claim-then-change instead of check-then-change-
      // then-invalidate. The old flow read the token, changed the password,
      // and only then marked the token used with an unchecked write — a
      // failed write left the link reusable, and two simultaneous requests
      // could both pass the read. The conditional update below succeeds for
      // exactly one caller; `.select()` proves a row was really claimed.
      const { data: claimed, error: claimError } = await supabaseAdmin
        .from('password_reset_tokens')
        .update({ used: true })
        .eq('token', token)
        .eq('used', false)
        .gt('expires_at', new Date().toISOString())
        .select('id, user_id');

      if (claimError) {
        console.error('Error claiming reset token:', claimError);
        return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
      }

      if (!claimed || claimed.length !== 1) {
        return NextResponse.json(
          { error: 'Invalid or expired reset link. Please request a new one from the login page.' },
          { status: 400 }
        );
      }

      userId = claimed[0].user_id;
      tokenRowId = claimed[0].id;
    } else {
      // ============================================================
      // FORCED RESET (authenticated session required)
      // ============================================================
      const session = await getServerSession(authOptions);
      if (!session?.user?.email) {
        return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
      }

      if (!oldPassword) {
        return NextResponse.json({ error: 'Current password is required.' }, { status: 400 });
      }

      const { data: user, error: fetchError } = await supabaseAdmin
        .from('users')
        .select('id, password_hash')
        .eq('email', session.user.email)
        .single();

      if (fetchError || !user) {
        return NextResponse.json({ error: 'User not found.' }, { status: 404 });
      }

      const isValid = await bcrypt.compare(oldPassword, user.password_hash);
      if (!isValid) {
        return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 });
      }

      userId = user.id;
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    // 2026-09-18 (P0 #8, audit finding H5 — "password change can report
    // success while the old password still works"): `.update()` alone
    // reports success even when the `.eq('id', ...)` matches zero rows —
    // Postgres has nothing to update, so there's no error, just a no-op.
    // `.select()` forces the matched-and-updated rows back so that case is
    // detectable instead of silently reported as success. Same convention
    // already applied to every other Supabase update/delete in this
    // engagement that matters (see handoff doc §8).
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        password_hash: newHash,
        force_password_reset: false,
      })
      .eq('id', userId)
      .select('id');

    if (updateError) {
      console.error('Error updating password:', updateError);
      await releaseToken();
      return NextResponse.json(
        { error: 'Error updating password. Please try again.' },
        { status: 500 }
      );
    }

    if (!updated || updated.length === 0) {
      console.error('Password update matched no rows for user id:', userId);
      await releaseToken();
      return NextResponse.json(
        { error: 'Error updating password. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Reset password error:', error);
    await releaseToken();
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}

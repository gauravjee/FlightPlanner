// app/api/auth/reset-password/route.ts
// Server-side password reset for both flows previously handled client-side
// in app/reset-password/page.tsx:
//
//   1. TOKEN RESET — body: { token, newPassword }
//      The token proves identity (it came from an emailed link), so no
//      session is required. Looked up in password_reset_tokens; marked
//      used only after the password update succeeds.
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

  try {
    if (token) {
      // ============================================================
      // TOKEN-BASED RESET
      // ============================================================
      const { data, error } = await supabaseAdmin
        .from('password_reset_tokens')
        .select('id, user_id, expires_at, used')
        .eq('token', token)
        .eq('used', false)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: 'Invalid or expired reset link. Please request a new one from the login page.' },
          { status: 400 }
        );
      }

      userId = data.user_id;
      tokenRowId = data.id;
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

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        password_hash: newHash,
        force_password_reset: false,
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating password:', updateError);
      return NextResponse.json(
        { error: 'Error updating password. Please try again.' },
        { status: 500 }
      );
    }

    // Only invalidate the reset token once the password has actually changed.
    if (tokenRowId) {
      await supabaseAdmin
        .from('password_reset_tokens')
        .update({ used: true })
        .eq('id', tokenRowId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}

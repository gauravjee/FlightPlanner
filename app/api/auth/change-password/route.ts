// app/api/auth/change-password/route.ts
// Server-side password change for an already-logged-in user.
// ============================================================
// This replaces the old client-side flow in app/change-password/page.tsx,
// which fetched the user's row (including password_hash) into the browser
// and did the bcrypt compare there. That meant every password hash was
// visible to the network tab / anyone with the anon key. Here the hash
// never leaves the server.
//
// The user's identity comes from the NextAuth session — never from a
// client-supplied email — so there's no way to change someone else's
// password by tampering with the request body.
// ============================================================

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import bcrypt from 'bcryptjs';
import { authOptions } from '@/lib/auth-options';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  let currentPassword: string | undefined;
  let newPassword: string | undefined;

  try {
    const body = await request.json();
    currentPassword = body.currentPassword;
    newPassword = body.newPassword;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: 'Current and new password are required.' },
      { status: 400 }
    );
  }

  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: 'New password must be at least 8 characters.' },
      { status: 400 }
    );
  }

  if (newPassword === currentPassword) {
    return NextResponse.json(
      { error: 'New password must be different from current password.' },
      { status: 400 }
    );
  }

  try {
    const { data: user, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, password_hash')
      .eq('email', session.user.email)
      .single();

    if (fetchError || !user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Current password is incorrect.' },
        { status: 401 }
      );
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        password_hash: newHash,
        force_password_reset: false,
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating password:', updateError);
      return NextResponse.json(
        { error: 'Error updating password. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}

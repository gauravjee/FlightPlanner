// lib/auth.ts
// SERVER-ONLY. Verifies user credentials against the Supabase users table.
// Returns user data including role, studentId, and whether a forced
// password reset is pending.
//
// This runs only inside NextAuth's authorize() callback — server-side —
// so it uses supabaseAdmin (service-role key) rather than the anon-key
// client. That matters now that Row Level Security is enabled on `users`:
// with the anon key this login check would fail for everyone.
//
// IMPORTANT: do not import this file (or anything that imports
// supabaseAdmin) from a 'use client' component. supabase-admin.ts
// hard-crashes if it's ever evaluated in a browser bundle, specifically to
// catch that mistake immediately (this bit us once already — see
// lib/auth-client.ts for the browser-safe login helpers that used to live
// in this file).

import { supabaseAdmin } from './supabase-admin';
import bcrypt from 'bcryptjs';

export async function verifyCredentials(email: string, password: string) {
  // Fetch user by email (only active accounts)
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('email', email)
    .eq('is_active', true)
    .single();

  if (error || !data) return null;

  // Compare the provided password with the stored hash
  const isValid = await bcrypt.compare(password, data.password_hash);
  if (!isValid) return null;

  // Return user object – role, studentId, and forcePasswordReset will be
  // threaded through the JWT/session by NextAuth's callbacks (see
  // lib/auth-options.ts) so the login page can read forcePasswordReset
  // from the session instead of making its own client-side DB call.
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    role: data.role,                    // 'admin' | 'instructor' | 'student' | ...
    studentId: data.student_id || null, // null for non‑students
    forcePasswordReset: data.force_password_reset === true,
  };
}

// ---------------------------------------------------------------------------
// Login rate limiting (2026-09-21, P1).
//
// Looks at the latest attempts in `login_audit` per email — no new table,
// dependency or infrastructure. Both helpers run only inside authorize()
// (lib/auth-options.ts), so the audit trail is now written by the server
// alone; the old browser-side writer (POST /api/auth/login-audit) was
// retired because anyone could call it to forge FAILED rows for an email
// and thereby lock that account out.
//
// ponytail: per-email, one count query per login. Add per-IP limiting or an
// edge/Redis limiter if distributed guessing across many emails shows up.
// ---------------------------------------------------------------------------
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

/**
 * True when `email`'s last MAX_FAILED_LOGINS attempts inside the 15-minute
 * window were all failures. A SUCCESS in between breaks the streak, so a real
 * user who mistypes now and then is never locked out; only 5 failures in a
 * row are. Attempts made while locked write no row, so the lock lifts on its
 * own once the oldest of the 5 leaves the window. Fails open on a DB error.
 */
export async function isLockedOut(email: string): Promise<boolean> {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from('login_audit')
    .select('login_status')
    .eq('user_email', email)
    .gte('attempted_at', since)
    .order('attempted_at', { ascending: false })
    .limit(MAX_FAILED_LOGINS);

  if (error) {
    // Availability over strictness: a broken audit table must not lock
    // everybody out of the app. Logged so it is visible in Vercel Logs.
    console.error('login_audit lockout check failed (failing open):', error);
    return false;
  }
  return (data?.length ?? 0) >= MAX_FAILED_LOGINS && data!.every(r => r.login_status === 'FAILED');
}

export async function recordLoginAttempt(
  email: string,
  status: 'SUCCESS' | 'FAILED',
  ip: string,
  userAgent: string
) {
  const { error } = await supabaseAdmin.from('login_audit').insert({
    user_email: email,
    login_status: status,
    ip_address: ip,
    user_agent: userAgent,
  });
  if (error) console.error('Error writing login_audit:', error);
}
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
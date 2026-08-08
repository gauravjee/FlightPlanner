// lib/auth.ts
// Verifies user credentials against the Supabase users table
// Returns user data including role and studentId (if applicable)

import { supabase } from './supabase';
import bcrypt from 'bcryptjs';

/**
 * 
 * Auditing login attempts
 * 
 */

export async function logLoginAttempt(email: string, status: 'SUCCESS' | 'FAILED') {
  await supabase.from('login_audit').insert({
    user_email: email,
    login_status: status,
  });
}

/**
 * Check if a user is required to reset their password
 * Used during login to redirect to the reset password page
 * @param email - User's email address
 * @returns true if password reset is required, false otherwise
 */
export async function checkForcePasswordReset(email: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('users')
    .select('force_password_reset')
    .eq('email', email)
    .single();

  if (error || !data) return false;
  return data.force_password_reset === true;
}

export async function verifyCredentials(email: string, password: string) {
  // Fetch user by email (only active accounts)
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .eq('is_active', true)
    .single();

  if (error || !data) return null;

  // Compare the provided password with the stored hash
  const isValid = await bcrypt.compare(password, data.password_hash);
  if (!isValid) return null;

  // Return user object – role and studentId will be used by NextAuth callbacks
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    role: data.role,                   // 'admin' | 'instructor' | 'student'
    studentId: data.student_id || null, // null for non‑students
  };
}
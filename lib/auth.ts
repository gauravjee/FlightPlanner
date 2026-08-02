// lib/auth.ts
// Verifies user credentials against the Supabase users table
// Returns user data including role and studentId (if applicable)

import { supabase } from './supabase';
import bcrypt from 'bcryptjs';

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
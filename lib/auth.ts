// lib/auth.ts
// Authentication configuration using NextAuth.js with Supabase
import { supabase } from './supabase';
import bcrypt from 'bcryptjs';

/**
 * Verify user credentials against database
 */
export async function verifyCredentials(email: string, password: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    return null;
  }

  const isValid = await bcrypt.compare(password, data.password_hash);
  
  if (!isValid) {
    return null;
  }

  return {
    id: data.id,
    email: data.email,
    name: data.name,
    role: data.role,
  };
}

/**
 * Create a new user (for admin setup)
 */
export async function createUser(
  email: string,
  password: string,
  name: string,
  role: string = 'instructor'
) {
  const passwordHash = await bcrypt.hash(password, 10);
  
  const { data, error } = await supabase
    .from('users')
    .insert({
      email,
      password_hash: passwordHash,
      name,
      role,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
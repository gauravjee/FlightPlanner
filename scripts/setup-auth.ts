// scripts/setup-auth.ts
// Run this script ONCE to create initial admin and instructor accounts
// Usage: npx tsx scripts/setup-auth.ts
//
// Generates a random password per account instead of reusing a fixed one —
// a fixed default password committed to a public repo is effectively a
// public credential for every deployment that runs this script and forgets
// to rotate it. Each generated password is printed once; force_password_reset
// is also set so whoever logs in with it is required to pick their own.

import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import crypto from 'crypto';

// Get current file directory (ES module equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Prefer the service role key so this setup script isn't limited by
// whatever RLS policies apply to the anon key; fall back to the anon key
// for backwards compatibility with existing setups.
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Generate a random password using a charset that avoids visually
 * ambiguous characters (I, l, 1, 0, O).
 */
function generatePassword(length = 14): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  return Array.from(crypto.randomBytes(length))
    .map((byte) => chars[byte % chars.length])
    .join('');
}

async function createAccount(email: string, name: string, role: string) {
  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 10);

  const { error } = await supabase.from('users').insert({
    email,
    password_hash: passwordHash,
    name,
    role,
    is_active: true,
    force_password_reset: true, // must be changed on first login
  });

  if (error) {
    console.error(`❌ Failed to create ${email}:`, error.message);
    return;
  }

  console.log(`✅ ${role} created: ${email} / ${password}`);
}

async function setupAuth() {
  console.log('🔐 Setting up authentication...\n');

  // Check if users table exists
  const { error: tableError } = await supabase.from('users').select('count').limit(1);

  if (tableError) {
    console.log('❌ Users table not found. Create it in Supabase SQL Editor first.');
    return;
  }

  // Check if admin already exists
  const { data: existing } = await supabase
    .from('users')
    .select('email')
    .eq('email', 'admin@flightpro.com')
    .single();

  if (existing) {
    console.log('⚠️  A user with email admin@flightpro.com already exists.');
    console.log(
      '   This script does not know (and cannot recover) its password. ' +
      'Use the "Force PW Reset" action in User Management, or the forgot-password ' +
      'flow, to issue a new one.\n'
    );
    return;
  }

  await createAccount('admin@flightpro.com', 'Admin User', 'admin');
  await createAccount('instructor@flightpro.com', 'Sarah Mitchell', 'instructor');

  console.log('\n🎉 Setup complete!');
  console.log('📝 Save the passwords printed above now — they will not be shown again.');
  console.log('   Login at http://localhost:3000/login\n');
}

setupAuth().catch(console.error);

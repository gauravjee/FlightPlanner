// scripts/setup-auth.ts
// Run this script ONCE to create initial admin and instructor accounts
// Usage: npx ts-node scripts/setup-auth.ts

import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Get current file directory (ES module equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

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
    console.log('⚠️  Users already exist.\n');
    console.log('📝 Login: admin@flightpro.com / FlightPro@2024\n');
    return;
  }

  // Create admin
  const adminHash = await bcrypt.hash('FlightPro@2024', 10);
  await supabase.from('users').insert({
    email: 'admin@flightpro.com',
    password_hash: adminHash,
    name: 'Admin User',
    role: 'admin',
    is_active: true,
  });
  console.log('✅ Admin created');

  // Create instructor
  const instructorHash = await bcrypt.hash('FlightPro@2024', 10);
  await supabase.from('users').insert({
    email: 'instructor@flightpro.com',
    password_hash: instructorHash,
    name: 'Sarah Mitchell',
    role: 'instructor',
    is_active: true,
  });
  console.log('✅ Instructor created\n');

  console.log('🎉 Setup complete!\n');
  console.log('📝 Login at http://localhost:3000/login');
  console.log('   Admin:      admin@flightpro.com / FlightPro@2024');
  console.log('   Instructor: instructor@flightpro.com / FlightPro@2024\n');
}

setupAuth().catch(console.error);
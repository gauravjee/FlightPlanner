// lib/supabase-admin.ts
// Server-only Supabase client for privileged operations: password verification
// and updates, admin user management, and anything else that must not be
// reachable using the public anon key.
//
// Do NOT import this from a 'use client' component or any code that ends up
// in the browser bundle — it is only safe to use inside API routes / Server
// Actions / other server-only code.

import { createClient } from '@supabase/supabase-js';

if (typeof window !== 'undefined') {
  throw new Error(
    'lib/supabase-admin.ts was imported from client code. This client is ' +
    'server-only — use lib/supabase.ts (or lib/supabase-client.ts) in the browser instead.'
  );
}

const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!serviceKey) {
  // We still fall back to the anon key so the app doesn't hard-crash if this
  // env var hasn't been configured yet, but that means these server routes
  // are subject to the exact same Row Level Security policies as the browser
  // — i.e. no extra protection. Set SUPABASE_SERVICE_KEY in your environment
  // (Supabase project settings → API → service_role key) to fix this.
  console.warn(
    '⚠️ SUPABASE_SERVICE_KEY is not set. Falling back to the anon key for ' +
    'server-side operations in lib/supabase-admin.ts — this provides no more ' +
    'protection than a direct client-side call. Set SUPABASE_SERVICE_KEY.'
  );
}

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  serviceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

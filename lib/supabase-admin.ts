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
  // ⚠️ 2026-09-10: this used to fall back to the ANON KEY so the app wouldn't
  // hard-crash on a missing env var. That fallback is removed, and the reason
  // matters more than the code.
  //
  // Every route in app/api/ that does a privileged read or write imports this
  // client — students, admin config, requirements, maintenance records,
  // safety incidents, NOTAM, the daily flying report. With the anon key they
  // all still "work": no errors, no 500s, queries return successfully. They
  // just return whatever Row Level Security lets an ANONYMOUS caller see,
  // which for tables like users/students is nothing at all.
  //
  // So the failure mode was an app that looks healthy and quietly serves
  // filtered or empty data from routes whose entire job is to bypass RLS
  // after a role check. That is far worse than an outage: it is a security
  // control that reports success while doing nothing. The cron route
  // (app/api/cron/check-notifications/route.ts) hit exactly this and now
  // refuses to run without the key — see its comment for the same reasoning.
  //
  // Deliberately NOT throwing at module load: these modules are imported
  // during `next build`, and a build-time env gap would fail the deploy
  // rather than surface the problem. Constructing with an EMPTY key instead
  // means every query fails loudly with an auth error at the moment it runs,
  // which is exactly when someone can act on it — and it can never
  // masquerade as an anonymous caller.
  console.error(
    '🚨 SUPABASE_SERVICE_KEY is not set. lib/supabase-admin.ts is being ' +
    'constructed WITHOUT a key, so every privileged server query will fail ' +
    'with an auth error. This is deliberate: the previous behaviour fell ' +
    'back to the anon key, which made role-checked routes silently return ' +
    'RLS-filtered (usually empty) data while appearing to succeed. Set ' +
    'SUPABASE_SERVICE_KEY (Supabase project settings → API → service_role key).'
  );
}

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  serviceKey || '',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

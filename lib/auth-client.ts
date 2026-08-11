// lib/auth-client.ts
// Browser-safe login helpers. This is intentionally split from lib/auth.ts,
// which is server-only (it uses supabaseAdmin / the service-role key).
//
// This file must only ever import the anon-key client (lib/supabase.ts) —
// never lib/supabase-admin.ts, and never anything (like lib/auth.ts) that
// itself imports supabase-admin.ts. That module hard-crashes if evaluated
// in a browser bundle, precisely to catch this class of mistake loudly
// instead of silently — which is exactly what happened when
// logLoginAttempt/checkForcePasswordReset briefly lived in lib/auth.ts
// after it switched to supabaseAdmin: the login page (a client component)
// imported them and the whole page crashed on load.
//
// `login_audit` isn't behind Row Level Security (out of scope for the
// users/students access-control pass), so writing to it via the anon key
// from the browser is unchanged from how this app has always worked.

import { supabase } from './supabase';

export async function logLoginAttempt(email: string, status: 'SUCCESS' | 'FAILED') {
  await supabase.from('login_audit').insert({
    user_email: email,
    login_status: status,
  });
}

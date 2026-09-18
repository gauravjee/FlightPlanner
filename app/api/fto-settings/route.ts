// app/api/fto-settings/route.ts
// Server-side read for the `fto_settings` table.
//
// 2026-09-18 (RLS remediation Step 3 — see
// claude/rls-remediation-progress-2026-09-18.md): reads used to be direct
// client-side `supabase.from('fto_settings').select('*')` calls (anon key)
// from two places — useFtoSettings.ts's fetchFtoSettings() (read by nearly
// every scheduling surface) and SettingsTab.tsx's own duplicate fetch
// (which should really just use the hook, but that's a separate cleanup —
// not changed here, just pointed at this route instead of Supabase
// directly). Both now hit this one GET.
//
// Writes already go through /api/admin/config/fto-settings, gated to
// ADMIN_SETUP_WRITE_ROLES (super_admin) — see that route. This one is
// deliberately NOT gated that narrowly: settings are read by every
// logged-in role today via the anon key with zero restriction (school
// name, timezone, booking window, weekly-off days, etc. — nothing
// sensitive), so `requireSession()` only, matching every other read moved
// this pass.

import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const { data, error: dbError } = await supabaseAdmin
    .from('fto_settings')
    .select('*')
    .order('id', { ascending: true });

  if (dbError) {
    console.error('Error loading FTO settings:', dbError);
    return NextResponse.json({ error: 'Failed to load settings.' }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}

// app/api/me/permissions/route.ts
// Returns the CURRENT signed-in user's own permission_overrides, and
// nothing else about the users table (that broader listing stays
// super_admin-only — see app/api/admin/users/route.ts). Any authenticated
// user can call this for themselves; it's how the client learns about a
// per-user override a super_admin has granted them (see
// lib/permissions.ts's MODULE_ACCESS / OVERRIDE_ELIGIBLE_ROLES) so
// RoleGate/Sidebar/write-gated UI controls can reflect it, in addition to
// the server-side enforcement in lib/api-auth.ts's requireModuleAccess().

import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;

  if (!session.user.email) {
    return NextResponse.json({ overrides: {} });
  }

  const { data, error: dbError } = await supabaseAdmin
    .from('users')
    .select('permission_overrides')
    .eq('email', session.user.email)
    .maybeSingle();

  if (dbError) {
    console.error('Error loading own permission overrides:', dbError);
    return NextResponse.json({ overrides: {} });
  }

  return NextResponse.json({ overrides: data?.permission_overrides || {} });
}

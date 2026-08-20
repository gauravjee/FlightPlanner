// app/api/safety-officers/route.ts
// Minimal roster lookup: active users with role='safety_officer', for the
// Breath Analyser Register's Safety Officer picker (app/dashboard/reports/
// breath-analyser/page.tsx). Deliberately narrow — id/name/email only, no
// password hash or anything else the full user-management listing
// (app/api/admin/users/route.ts) returns, and that broader route stays
// super_admin-only, whereas this one is usable by anyone who can fill out
// a BA test (BA_TEST_WRITE_ROLES), since they're the ones who need this
// dropdown populated.
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { BA_TEST_WRITE_ROLES } from '@/lib/permissions';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET() {
  const { error } = await requireRole(BA_TEST_WRITE_ROLES);
  if (error) return error;

  const { data, error: dbError } = await supabaseAdmin
    .from('users')
    .select('id, name, email')
    .eq('role', 'safety_officer')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (dbError) {
    console.error('Error loading safety officers:', dbError);
    return NextResponse.json({ error: 'Failed to load safety officers.' }, { status: 500 });
  }

  const safetyOfficers = (data || []).map(row => ({
    id: String(row.id),
    name: row.name as string,
    email: row.email as string,
  }));

  return NextResponse.json({ safetyOfficers });
}

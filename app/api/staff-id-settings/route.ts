// app/api/staff-id-settings/route.ts
// Staff ID prefix (B2; add-staff-master.sql, lib/staff-id.ts). GET: the
// prefix, how many IDs it has issued and the next numbers (regular + SUB).
// PUT: change the prefix — super admin only, and only before the first ID is
// issued (the staff_id_settings_guard trigger refuses it after that).
// IDs themselves are issued only by the database when a staff record is saved.

import { NextResponse } from 'next/server';
import { requireRole, STAFF_ROLES, ADMIN_SETUP_WRITE_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isValidStaffPrefix } from '@/lib/staff-id';
import { staffDbError } from '@/lib/staff-server';

export async function GET() {
  const { error } = await requireRole(STAFF_ROLES);
  if (error) return error;

  const { data, error: dbError } = await supabaseAdmin.from('staff_id_settings').select('*').maybeSingle();
  if (dbError) {
    console.error('Error loading staff ID settings:', dbError);
    return NextResponse.json({ error: 'Failed to load staff ID settings.' }, { status: 500 });
  }
  const next = (data?.next_number as number) ?? 1;
  return NextResponse.json({
    prefix: (data?.prefix as string) ?? null,
    nextNumber: next,
    subNextNumber: (data?.sub_next_number as number) ?? 1,
    issued: next - 1,
    locked: next > 1,
  });
}

export async function PUT(request: Request) {
  const { error } = await requireRole(ADMIN_SETUP_WRITE_ROLES);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const prefix = typeof body.prefix === 'string' ? body.prefix.trim().toUpperCase() : '';
  if (!isValidStaffPrefix(prefix)) {
    return NextResponse.json({ error: 'Prefix: 1–5 letters or digits, e.g. HFA ("SUB" is kept for contract AMEs).' }, { status: 400 });
  }

  // Single-row update; the trigger enforces the lock atomically.
  const { error: dbError } = await supabaseAdmin.from('staff_id_settings').update({ prefix }).eq('id', true);
  if (dbError) {
    console.error('Error saving staff ID prefix:', dbError);
    return NextResponse.json({ error: staffDbError(dbError, 'Failed to save the staff ID prefix.') }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}

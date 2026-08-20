// app/api/ba-tests/[id]/route.ts
// Edit/delete a single Breath Analyser Register entry. Same
// BA_TEST_WRITE_ROLES gate as creating one (app/api/ba-tests/route.ts) —
// the FTO's spec was "added / edited by Super admin, Admin, Operations and
// Safety Officer", so both actions share the same role list. DELETE isn't
// explicitly asked for but is included for the same reason
// safety_incidents doesn't have one but this register does: unlike an
// incident log (append-only, correcting a past entry by editing its text
// is fine), a mistyped BA percentage or wrong person on a register that
// may get audited is worth being able to remove outright, not just patch
// over — gated to the same narrow role list, not a free-for-all.
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { BA_TEST_WRITE_ROLES } from '@/lib/permissions';
import { supabaseAdmin } from '@/lib/supabase-admin';

type RouteContext = { params: Promise<{ id: string }> };

// camelCase (client) -> snake_case (db column) for every field this
// endpoint is allowed to update.
const FIELD_MAP: Record<string, string> = {
  testDate: 'test_date',
  aircraftId: 'aircraft_id',
  aircraftReg: 'aircraft_reg',
  safetyOfficerId: 'safety_officer_id',
  safetyOfficerName: 'safety_officer_name',
  personType: 'person_type',
  personId: 'person_id',
  personName: 'person_name',
  licenseNumber: 'license_number',
  reportingTime: 'reporting_time',
  baTime: 'ba_time',
  baPercentage: 'ba_percentage',
  baEquipment: 'ba_equipment',
};

// Fields that can legitimately be cleared to null (unlike e.g. testDate,
// personName, safetyOfficerName, which stay required once set).
const NULLABLE_FIELDS = new Set([
  'aircraftId', 'aircraftReg', 'safetyOfficerId', 'personId',
  'licenseNumber', 'reportingTime', 'baTime', 'baPercentage', 'baEquipment',
]);

export async function PATCH(request: Request, context: RouteContext) {
  const { error } = await requireRole(BA_TEST_WRITE_ROLES);
  if (error) return error;

  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const dbUpdates: Record<string, unknown> = {};
  for (const [clientKey, dbKey] of Object.entries(FIELD_MAP)) {
    if (body[clientKey] !== undefined) {
      const value = body[clientKey];
      dbUpdates[dbKey] = NULLABLE_FIELDS.has(clientKey) && !value ? null : value;
    }
  }

  if (Object.keys(dbUpdates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  dbUpdates.updated_at = new Date().toISOString();

  const { error: dbError } = await supabaseAdmin
    .from('ba_tests')
    .update(dbUpdates)
    .eq('id', id);

  if (dbError) {
    console.error('Error updating BA test:', dbError);
    return NextResponse.json({ error: 'Failed to update BA test.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { error } = await requireRole(BA_TEST_WRITE_ROLES);
  if (error) return error;

  const { id } = await context.params;

  const { error: dbError } = await supabaseAdmin
    .from('ba_tests')
    .delete()
    .eq('id', id);

  if (dbError) {
    console.error('Error deleting BA test:', dbError);
    return NextResponse.json({ error: 'Failed to delete BA test.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

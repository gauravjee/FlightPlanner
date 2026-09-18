// app/api/aircraft/[id]/route.ts
// Server-side, role-scoped update/delete for a single aircraft record.
// See app/api/aircraft/route.ts for why this exists.
//
// NOTE: components/maintenance/*'s "auto-clear aircraft status back to
// ACTIVE when the last active maintenance record on it completes" side
// effect is handled INSIDE app/api/maintenance-records/[id]/route.ts
// directly (via supabaseAdmin), not by calling this endpoint — a
// `maintenance`-role user is allowed to complete a maintenance record but
// is NOT in AIRCRAFT_WRITE_ROLES, so routing that side effect through here
// would 403 for exactly the role that triggers it most often.

import { NextResponse } from 'next/server';
import { requireModuleAccess, requireRole, FLIGHT_RECORDS_WRITE_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

type RouteContext = { params: Promise<{ id: string }> };

const FIELD_MAP: Record<string, string> = {
  registration: 'registration',
  type: 'type',
  model: 'model',
  year: 'year',
  hobbsTime: 'hobbs_time',
  fuelCapacity: 'fuel_capacity',
  currentFuel: 'current_fuel',
  status: 'status',
  nextMaintenance: 'next_maintenance',
  fuelBurnRateLph: 'fuel_burn_rate_lph',
  isSimulator: 'is_simulator',
  logBookSerialNo: 'log_book_serial_no',
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // Debrief fuel/Hobbs update (DebriefForm.tsx, 2026-09-18 RLS exposure
  // remediation — see claude/rls-exposure-2026-09-18.md) is a narrower
  // write than full aircraft management: any instructor can debrief a
  // flight and must be able to record the fuel burned + Hobbs advanced,
  // but instructors are view-only on the Aircraft module otherwise
  // (AIRCRAFT_WRITE_ROLES is admin/super_admin only — see
  // lib/permissions.ts). So this route accepts EITHER full aircraft access
  // (any field in FIELD_MAP) OR flight-records-write access
  // (FLIGHT_RECORDS_WRITE_ROLES), the latter scoped to ONLY
  // currentFuel/hobbsTime — checked against the raw body keys, before
  // FIELD_MAP filtering, so a request smuggling any other field never
  // reaches the narrower path.
  const bodyKeys = Object.keys(body);
  const isDebriefFuelUpdate = bodyKeys.length > 0 && bodyKeys.every(k => k === 'currentFuel' || k === 'hobbsTime');

  const fullAccess = await requireModuleAccess('aircraft', 'full');
  if (fullAccess.error) {
    if (!isDebriefFuelUpdate) return fullAccess.error;
    const debriefAccess = await requireRole(FLIGHT_RECORDS_WRITE_ROLES);
    if (debriefAccess.error) return debriefAccess.error;
  }

  const dbUpdates: Record<string, unknown> = {};
  for (const [clientKey, dbKey] of Object.entries(FIELD_MAP)) {
    if (body[clientKey] !== undefined) {
      dbUpdates[dbKey] = body[clientKey];
    }
  }

  if (Object.keys(dbUpdates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  const { error: dbError } = await supabaseAdmin.from('aircraft').update(dbUpdates).eq('id', id);

  if (dbError) {
    console.error('Error updating aircraft:', dbError);
    return NextResponse.json({ error: 'Failed to update aircraft.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { error } = await requireModuleAccess('aircraft', 'full');
  if (error) return error;

  const { id } = await context.params;

  const { error: dbError } = await supabaseAdmin.from('aircraft').delete().eq('id', id);

  if (dbError) {
    console.error('Error deleting aircraft:', dbError);
    return NextResponse.json({ error: 'Failed to delete aircraft.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

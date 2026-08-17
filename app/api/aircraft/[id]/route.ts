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
import { requireModuleAccess } from '@/lib/api-auth';
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
};

export async function PATCH(request: Request, context: RouteContext) {
  const { error } = await requireModuleAccess('aircraft', 'full');
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

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

  // 2026-09-18 (P0 #3, hobbs integrity — audit findings C2/F2): this is the
  // actual writer of aircraft.hobbs_time — both the full Aircraft edit form
  // and DebriefForm's narrower fuel/Hobbs update go through here — and it
  // never validated it; any value in the body, including 0, a non-numeric
  // string, or a negative number, was written as-is. The client-side fixes
  // (AircraftFormModal no longer turns a cleared field into 0; the
  // flight-records route validates its own Hobbs End) don't cover a request
  // built directly against this route. Only rejects an outright invalid
  // value here — doesn't forbid a deliberate, correctly-typed 0, since a
  // brand-new aircraft legitimately starts at hobbsTime 0.
  if (body.hobbsTime !== undefined) {
    const n = Number(body.hobbsTime);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: 'Hobbs Time must be a valid, non-negative number.' }, { status: 400 });
    }
    // The narrow debrief path (DebriefForm.tsx) can only ever advance the
    // meter — a flight burns Hobbs time, it doesn't reduce it. DebriefForm's
    // own Hobbs End field has the exact same "clear it, save without
    // retyping" failure mode FlightRecordForm's did (parseFloat('') || 0),
    // and unlike a logged flight, an unchecked "auto-create logbook entry"
    // debrief reaches this write directly with nothing else validating it —
    // the flight-records POST route's own Hobbs End check never runs for
    // that case. So this path specifically also requires the new reading to
    // be strictly greater than what's already on file. A full aircraft edit
    // (AIRCRAFT_WRITE_ROLES) is unaffected and may still correct the value
    // downward — that's a deliberate admin action, not a cleared field.
    if (isDebriefFuelUpdate) {
      const { data: current } = await supabaseAdmin.from('aircraft').select('hobbs_time').eq('id', id).single();
      if (current && n <= Number(current.hobbs_time)) {
        return NextResponse.json({ error: 'Hobbs Time must be greater than the aircraft\'s current reading.' }, { status: 400 });
      }
    }
    body.hobbsTime = n;
  }
  if (body.fuelCapacity !== undefined) {
    const n = Number(body.fuelCapacity);
    // 2026-09-18: 50L, matching AircraftFormModal's min={50} — not an
    // arbitrary "must be positive" floor. Per the operator: this is the
    // minimum dispatch fuel policy (a sortie can't be released if the
    // post-flight fuel position would be at or under this), so a real
    // fuelCapacity has to sit above it or the policy has nothing to check
    // against. Kept in sync with the client rather than left looser.
    if (!Number.isFinite(n) || n < 50) {
      return NextResponse.json({ error: 'Fuel Capacity must be a valid number of at least 50L.' }, { status: 400 });
    }
    body.fuelCapacity = n;
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

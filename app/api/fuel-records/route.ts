// app/api/fuel-records/route.ts
// Server-side, role-scoped create for the `fuel_records` table.
//
// Fuel logs are add-only from the UI today (no edit/delete anywhere in
// lib/store.ts or FuelLogForm.tsx) — this route only needs POST. Per the
// 2026-08-17 role/tab matrix, maintenance keeps full read/write (their tab
// is literally "Maintenance & Fuel"); instructor/operations can view fuel
// logs but not add one.
//
// Also performs the aircraft.current_fuel side effect that store.ts's
// addFuelRecord used to do as a second client-side Supabase call — done
// here, server-side, so it isn't gated separately by AIRCRAFT_WRITE_ROLES
// (a `maintenance`-role user can log fuel but isn't allowed to edit
// aircraft directly; this is a system-internal consequence of logging
// fuel, not a separate "edit aircraft" action).

import { NextResponse } from 'next/server';
import { requireModuleAccess } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: Request) {
  const { error } = await requireModuleAccess('fuel', 'full');
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const {
    aircraftId, fuelAddedLiters, fuelCostPerLiter, fuelLevelBefore,
    fuelLevelAfter, fuelType, refueledBy, notes,
  } = body as Record<string, unknown>;

  if (!aircraftId) {
    return NextResponse.json({ error: 'aircraftId is required.' }, { status: 400 });
  }

  const { error: dbError } = await supabaseAdmin.from('fuel_records').insert({
    aircraft_id: aircraftId,
    fuel_added_liters: fuelAddedLiters,
    fuel_cost_per_liter: fuelCostPerLiter,
    fuel_level_before: fuelLevelBefore,
    fuel_level_after: fuelLevelAfter,
    fuel_type: fuelType,
    refueled_by: refueledBy,
    notes,
  });

  if (dbError) {
    console.error('Error creating fuel record:', dbError);
    return NextResponse.json({ error: 'Failed to log refueling.' }, { status: 500 });
  }

  const { error: aircraftError } = await supabaseAdmin
    .from('aircraft')
    .update({ current_fuel: fuelLevelAfter })
    .eq('id', aircraftId);

  if (aircraftError) {
    // The fuel record itself is already saved — don't fail the whole
    // request over the aircraft-side sync, just surface it so the caller
    // knows the aircraft's current_fuel may be stale until fixed manually.
    console.error('Error syncing aircraft current_fuel after fuel record:', aircraftError);
    return NextResponse.json({ success: true, aircraftSyncWarning: aircraftError.message });
  }

  return NextResponse.json({ success: true });
}

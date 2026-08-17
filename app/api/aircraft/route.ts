// app/api/aircraft/route.ts
// Server-side, role-scoped create for the `aircraft` table.
//
// Why this exists: the browser used to call `supabase.from('aircraft')`
// directly with the anon key for every add/edit/delete — anyone whose role
// got them onto the Aircraft page could write to the fleet, no matter
// whether they were only meant to view it (2026-08-17 role/tab matrix:
// instructor/maintenance/operations are all view-only here; only
// admin/super_admin can add, edit, or remove an aircraft). Reads stay as
// direct client-side Supabase calls (unchanged) — this route only covers
// the write path, same scope as the students API before it.

import { NextResponse } from 'next/server';
import { requireModuleAccess } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: Request) {
  const { error } = await requireModuleAccess('aircraft', 'full');
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const {
    registration, type, model, year, hobbsTime, fuelCapacity,
    currentFuel, status, nextMaintenance, fuelBurnRateLph,
  } = body as Record<string, unknown>;

  if (!registration || !type || !model) {
    return NextResponse.json({ error: 'registration, type, and model are required.' }, { status: 400 });
  }

  const { data, error: dbError } = await supabaseAdmin
    .from('aircraft')
    .insert({
      registration, type, model, year,
      hobbs_time: hobbsTime,
      fuel_capacity: fuelCapacity,
      current_fuel: currentFuel,
      status,
      next_maintenance: nextMaintenance,
      fuel_burn_rate_lph: fuelBurnRateLph ?? null,
    })
    .select()
    .single();

  if (dbError) {
    console.error('Error creating aircraft:', dbError);
    return NextResponse.json({ error: 'Failed to create aircraft.' }, { status: 500 });
  }

  return NextResponse.json({ aircraft: data });
}

// app/api/aircraft/route.ts
// Server-side, role-scoped create for the `aircraft` table.
//
// Why this exists: the browser used to call `supabase.from('aircraft')`
// directly with the anon key for every add/edit/delete — anyone whose role
// got them onto the Aircraft page could write to the fleet, no matter
// whether they were only meant to view it (2026-08-17 role/tab matrix:
// instructor/maintenance/operations are all view-only here; only
// admin/super_admin can add, edit, or remove an aircraft).
//
// GET added 2026-09-18 (RLS remediation Step 3 — see
// claude/rls-remediation-progress-2026-09-18.md): reads used to be a direct
// client-side `supabase.from('aircraft').select('*')` call (anon key), which
// is what made it safe to enable RLS with zero policies here — same
// treatment flight_records/users/students already got. `requireSession()`
// only (no role restriction) because every logged-in role could already
// read the full fleet via the anon key with zero gating; this doesn't
// narrow that, it just moves the same access behind a real session check.

import { NextResponse } from 'next/server';
import { requireModuleAccess, requireSession } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const { data, error: dbError } = await supabaseAdmin
    .from('aircraft')
    .select('*')
    .order('created_at', { ascending: true });

  if (dbError) {
    console.error('Error loading aircraft:', dbError);
    return NextResponse.json({ error: 'Failed to load aircraft.' }, { status: 500 });
  }

  return NextResponse.json({ aircraft: data });
}

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
    currentFuel, status, nextMaintenance, fuelBurnRateLph, isSimulator,
    logBookSerialNo,
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
      is_simulator: isSimulator ?? false,
      // Optional placeholder — see add-logbook-and-camo-refs.sql.
      log_book_serial_no: logBookSerialNo || null,
    })
    .select()
    .single();

  if (dbError) {
    console.error('Error creating aircraft:', dbError);
    return NextResponse.json({ error: 'Failed to create aircraft.' }, { status: 500 });
  }

  return NextResponse.json({ aircraft: data });
}

// lib/hooks/useFuelRecords.ts
// ---------------------------------------------------------------------------
// SWR migration, Stage 4 (2026-08-29) — fuel management / refueling log.
// See the approved SWR migration plan (Project doc) for the full
// architecture and staging rationale.
//
// Same deliberate choice as useFlightRecords.ts (this same stage): the
// aircraftReg/aircraftType join stays baked into the fetcher's rows rather
// than moving to a render-time selector. addFuelRecord() below always
// revalidates from the server (the POST doesn't return the new row's id, so
// there's nothing to splice), and fuel records are add-only in the UI (no
// edit) — so a fresh fetch always recomputes the join correctly, the same
// reasoning the plan's Architecture section already applies to Availability
// (Stage 2). See useFlightRecords.ts's header comment for the fuller
// version of this reasoning.
// ---------------------------------------------------------------------------

'use client';

import useSWR, { mutate } from 'swr';
import type { FuelRecord } from '@/types';
import { supabase } from '@/lib/supabase';
import { fetchAircraft, aircraftKey } from './useAircraft';

export const fuelRecordsKey = ['fuelRecords'] as const;

// Most recent 50 refueling records, same limit loadFuelRecords() used.
export async function fetchFuelRecords(): Promise<FuelRecord[]> {
  const { data, error } = await supabase
    .from('fuel_records')
    .select('*')
    .order('refueling_date', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error loading fuel records:', error);
    throw error;
  }

  const aircraftList = await fetchAircraft();

  return (data || []).map((row: Record<string, unknown>) => {
    const ac = aircraftList.find(a => String(a.id) === String(row.aircraft_id));
    return {
      id: String(row.id), aircraftId: String(row.aircraft_id),
      refuelingDate: row.refueling_date as string, fuelAddedLiters: row.fuel_added_liters as number,
      fuelCostPerLiter: row.fuel_cost_per_liter as number,
      totalCost: (row.fuel_added_liters as number) * (row.fuel_cost_per_liter as number),
      fuelLevelBefore: row.fuel_level_before as number, fuelLevelAfter: row.fuel_level_after as number,
      fuelType: row.fuel_type as string, refueledBy: row.refueled_by as string, notes: row.notes as string,
      aircraftReg: ac?.registration || 'Unknown', aircraftType: ac?.type || '',
    };
  });
}

export function useFuelRecords() {
  const { data, error, isLoading, mutate: boundMutate } = useSWR<FuelRecord[]>(
    fuelRecordsKey,
    () => fetchFuelRecords()
  );

  return {
    fuelRecords: data ?? [],
    isLoading,
    error,
    mutate: boundMutate,
  };
}

// Convenience selector — replaces the store's getFuelRecordsForAircraft(id).
// Like fetchStudentFlightRecords in useFlightRecords.ts, this has no
// callers anywhere in the app today (confirmed via grep) — ported for
// interface completeness and flagged here so it isn't mistaken for missed
// work.
export function getFuelRecordsForAircraft(fuelRecords: FuelRecord[], aircraftId: string): FuelRecord[] {
  return fuelRecords.filter(r => r.aircraftId === aircraftId);
}

// ---------------------------------------------------------------------------
// Write — insert plus the aircraft.current_fuel side effect now happen
// server-side in one request — see app/api/fuel-records/route.ts. Gated to
// FUEL_WRITE_ROLES (admin/super_admin/maintenance).
//
// Revalidates both affected caches rather than locally splicing either:
// aircraft.current_fuel is server-derived (client never sent it), and the
// fuel record itself has no client-known id to splice with (the API
// route's response is just {success:true} / {success:true,
// aircraftSyncWarning}, unchanged from before this migration).
// ---------------------------------------------------------------------------
export async function addFuelRecord(
  record: Omit<FuelRecord, 'id' | 'totalCost' | 'aircraftReg' | 'aircraftType'>
): Promise<void> {
  const res = await fetch('/api/fuel-records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
  if (res.ok) {
    await mutate(aircraftKey);
    await mutate(fuelRecordsKey);
  } else {
    console.error('Error adding fuel record:', await res.text());
  }
}

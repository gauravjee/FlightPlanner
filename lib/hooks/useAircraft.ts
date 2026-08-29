// lib/hooks/useAircraft.ts
// ---------------------------------------------------------------------------
// SWR migration, Stage 1 (2026-08-28) — see the approved SWR migration plan
// (docs/ swr-migration-plan / Project doc) for the full architecture and
// staging rationale. This is the first domain migrated off lib/store.ts's
// hand-rolled loadAircraft()/addAircraft()/updateAircraft()/removeAircraft(),
// and the template every later stage's hook file copies.
//
// Aircraft was picked to go first because it's self-contained — no
// cross-domain reads/enrichment (contrast Students, which needs instructor
// names, or ScheduledFlights, which needs both) — so it proves the pattern
// cleanly before betting the whole migration on it.
//
// Key shape: array-based (['aircraft']) even though nothing needs a second
// element today. That's deliberate — the upcoming multi-airport/multi-city
// roadmap work can extend this to ['aircraft', locationId] later without
// rewriting every call site that imports aircraftKey.
// ---------------------------------------------------------------------------

'use client';

import useSWR, { mutate } from 'swr';
import { supabase } from '@/lib/supabase';
import type { Aircraft } from '@/types';

export const aircraftKey = ['aircraft'] as const;

// ---------------------------------------------------------------------------
// Fetcher — same Supabase query and row-mapping loadAircraft() used, just
// relocated. One deliberate behavior change from the old store action: this
// throws on a Supabase error instead of only console.error-ing and leaving
// the data silently empty. That's the correct SWR idiom — a thrown error
// surfaces via the hook's own `error` return value so a page can actually
// show "failed to load" instead of quietly rendering an empty fleet list.
// (Write-path failures below are a separate decision — see the note there.)
// ---------------------------------------------------------------------------
export async function fetchAircraft(): Promise<Aircraft[]> {
  const { data, error } = await supabase
    .from('aircraft')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error loading aircraft:', error);
    throw error;
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    registration: row.registration as string,
    type: row.type as string,
    model: row.model as string,
    year: row.year as number,
    hobbsTime: row.hobbs_time as number,
    fuelCapacity: row.fuel_capacity as number,
    currentFuel: row.current_fuel as number,
    status: row.status as Aircraft['status'],
    nextMaintenance: row.next_maintenance as string,
    fuelBurnRateLph: row.fuel_burn_rate_lph != null ? (row.fuel_burn_rate_lph as number) : undefined,
    isSimulator: !!row.is_simulator,
  }));
}

// ---------------------------------------------------------------------------
// Read hook — replaces `const { aircraft, loadingAircraft } = useFlightStore()`
// + a `useEffect(() => { loadAircraft(); }, [loadAircraft])`. SWR handles the
// fetch-on-mount, the cross-component cache sharing (two components reading
// useAircraft() at once share one request/cache entry), and the dedup that
// was the actual point of this migration — a page revisited within
// AuthProvider's 5s dedupingInterval fires zero new network requests.
// ---------------------------------------------------------------------------
export function useAircraft() {
  const { data, error, isLoading, mutate: boundMutate } = useSWR<Aircraft[]>(
    aircraftKey,
    () => fetchAircraft()
  );

  return {
    aircraft: data ?? [],
    isLoading,
    error,
    mutate: boundMutate,
  };
}

// Convenience selector — replaces the store's getAircraftById(id). Not a
// hook itself (no subscription); call sites already holding an aircraft
// array from useAircraft() pass it in directly.
export function getAircraftById(aircraft: Aircraft[], id: string): Aircraft | undefined {
  return aircraft.find(a => a.id === id);
}

// ---------------------------------------------------------------------------
// Writes — plain exported async functions (not returned from the hook),
// matching the plan's architecture: any component can call these without
// needing to be the one that rendered useAircraft(). Each does the same
// API call lib/store.ts's action did, then splices the result into SWR's
// cache with a local mutate({revalidate:false}) — the write payload is
// already the full new/updated record, so there's nothing to revalidate
// from the server. This exactly mirrors the old set()-splice behavior, so
// the UX is unchanged: edit closes, list updates instantly, no reload.
//
// Failure handling deliberately preserves today's exact behavior — console
// .error only, no throw, no return value — rather than adopting the
// throw-on-failure shape used elsewhere as an example pattern. The
// confirmed call site (app/dashboard/aircraft/page.tsx's handleSave/
// handleDelete) calls these fire-and-forget with no await/try-catch;
// introducing throw semantics here would silently produce an unhandled
// promise rejection there unless the call site were also updated, which is
// out of scope for a caching-layer swap. Revisit if/when a call site is
// changed to actually handle write errors.
// ---------------------------------------------------------------------------

export async function addAircraft(aircraft: Omit<Aircraft, 'id'>): Promise<void> {
  const res = await fetch('/api/aircraft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(aircraft),
  });
  const result = await res.json().catch(() => ({}));
  if (res.ok) {
    const newAircraft: Aircraft = { ...aircraft, id: String(result.aircraft.id) };
    mutate<Aircraft[]>(aircraftKey, (current = []) => [...current, newAircraft], { revalidate: false });
  } else {
    console.error('Error adding aircraft:', result.error);
  }
}

export async function updateAircraft(id: string, updates: Partial<Aircraft>): Promise<void> {
  const res = await fetch(`/api/aircraft/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (res.ok) {
    mutate<Aircraft[]>(
      aircraftKey,
      (current = []) => current.map(a => (a.id === id ? { ...a, ...updates } : a)),
      { revalidate: false }
    );
  } else {
    console.error('Error updating aircraft:', await res.text());
  }
}

export async function removeAircraft(id: string): Promise<void> {
  const res = await fetch(`/api/aircraft/${id}`, { method: 'DELETE' });
  if (res.ok) {
    mutate<Aircraft[]>(aircraftKey, (current = []) => current.filter(a => a.id !== id), { revalidate: false });
  } else {
    console.error('Error removing aircraft:', await res.text());
  }
}

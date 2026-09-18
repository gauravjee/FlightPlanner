// lib/hooks/useHolidays.ts
// ---------------------------------------------------------------------------
// SWR migration, Stage 7 (2026-09-02) — Holiday Calendar. See the approved
// SWR migration plan (Project doc: claude/swr-migration-plan-2026-08-28.md)
// for the full architecture and staging rationale.
//
// findHolidayForDate/getSchedulingBlockReason (plus the weekly-off-day
// helpers getSchedulingBlockReason also depends on) stay in lib/store.ts —
// per the plan's own precedent (Stage 6: single-caller domain logic moves
// into the hook file, genuinely shared helpers don't), these are pure
// functions called directly by BookingForm, ScheduleBoard,
// GroundSchoolCalendar, and useScheduledFlights.ts's own bookFlight/
// updateScheduledFlight, and getSchedulingBlockReason also cross-depends on
// ftoSettings (Stage 8, not yet migrated) — moving them here would just add
// an import cycle back to store.ts for no benefit. Only this domain's
// actual state (holidays, loadingHolidays) and actions move.
//
// countScheduleConflictsOnDate, by contrast, DOES move — it has exactly one
// caller each, both below (addHoliday/addHolidaysBulk), the same
// "single-caller helper moves with its caller" call Stage 6 made for
// computeMaintenanceDueItems.
// ---------------------------------------------------------------------------

'use client';

import useSWR, { mutate } from 'swr';
import type { Holiday } from '@/types';

export const holidaysKey = ['holidays'] as const;

// 2026-09-18 (RLS remediation, Batch 2/3 — see
// claude/data-access-security-mapping.md): was a direct client-side
// `supabase.from('holidays')` call (anon key) — now goes through
// GET /api/admin/config/holidays (service-role, session-gated). `holidays`
// has RLS off entirely today (not even an empty-policy deny-all), so this
// is what makes it safe to finally enable RLS there with zero policies —
// same treatment every other table in this remediation got.
export async function fetchHolidays(): Promise<Holiday[]> {
  const res = await fetch('/api/admin/config/holidays?orderBy=holiday_date');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('Error loading holidays:', err.error || res.statusText);
    throw new Error(err.error || 'Failed to load holidays.');
  }
  const { rows: data } = await res.json();

  return (data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    holidayName: row.holiday_name as string,
    date: row.holiday_date as string,
    isRecurring: !!row.is_recurring,
    notes: (row.notes as string) || '',
  }));
}

export function useHolidays() {
  const { data, error, isLoading, mutate: boundMutate } = useSWR<Holiday[]>(
    holidaysKey,
    () => fetchHolidays()
  );

  return {
    holidays: data ?? [],
    isLoading,
    error,
    mutate: boundMutate,
  };
}

// ---------------------------------------------------------------------------
// Writes — plain exported async functions, same shape/failure-handling as
// the original store actions.
// ---------------------------------------------------------------------------

// Ported from lib/store.ts as-is — counts flights/ground-school classes
// already scheduled on a date so addHoliday/addHolidaysBulk can flag them
// for manual review (nothing is auto-touched).
// 2026-09-18 (RLS remediation Step 3): the scheduled_flights half of this
// used to be a direct client-side `supabase.from('scheduled_flights')`
// COUNT query (anon key) — now goes through GET /api/scheduled-flights
// with the day-range as query params (that route doesn't have a
// count-only mode, so this takes the row array's length instead — this
// only runs when adding a holiday, an infrequent admin action, so there's
// no real cost to that).
//
// 2026-09-18 (RLS remediation, Batch 3 — see
// claude/data-access-security-mapping.md): the ground_school_classes half
// was a direct client-side `supabase.from('ground_school_classes')` COUNT
// query (anon key) — now goes through GET /api/ground-school/classes's
// `countOnly` mode.
async function countScheduleConflictsOnDate(dateStr: string): Promise<{ conflictingFlights: number; conflictingClasses: number }> {
  const dayStart = `${dateStr}T00:00:00+05:30`;
  const dayEnd = `${dateStr}T23:59:59.999+05:30`;
  const [flightsRes, classesRes] = await Promise.all([
    fetch(`/api/scheduled-flights?startTimeGte=${encodeURIComponent(dayStart)}&startTimeLte=${encodeURIComponent(dayEnd)}&excludeCancelled=true`)
      .then(res => res.ok ? res.json() : { flights: [] }).catch(() => ({ flights: [] })),
    fetch(`/api/ground-school/classes?countOnly=true&dateEq=${encodeURIComponent(dateStr)}&statusNeq=CANCELLED`)
      .then(res => res.ok ? res.json() : { count: 0 }).catch(() => ({ count: 0 })),
  ]);
  return { conflictingFlights: (flightsRes.flights || []).length, conflictingClasses: classesRes.count || 0 };
}

// 2026-08-21 (security hardening round): holiday-calendar writes go through
// the shared, role-checked config route (Admin Setup is super_admin-only)
// rather than straight to Supabase from the browser — see
// app/api/admin/config/[table]/route.ts.
export async function addHoliday(holiday: Omit<Holiday, 'id'>): Promise<{
  success: boolean; message: string; conflictingFlights?: number; conflictingClasses?: number;
}> {
  const res = await fetch('/api/admin/config/holidays', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      holiday_name: holiday.holidayName,
      holiday_date: holiday.date,
      is_recurring: holiday.isRecurring,
      notes: holiday.notes || '',
    }),
  });
  if (!res.ok) {
    console.error('Error adding holiday:', await res.text());
    return { success: false, message: '❌ Failed to add holiday.' };
  }
  // The route's response is just {success:true} — no id back to splice
  // with, so revalidate from the server instead (the plan's "server round
  // trip, no local echo" case — same treatment addFlightRecord gave this
  // in Stage 4).
  await mutate(holidaysKey);
  const { conflictingFlights, conflictingClasses } = await countScheduleConflictsOnDate(holiday.date);
  const conflictNote = (conflictingFlights + conflictingClasses) > 0
    ? ` ⚠️ ${conflictingFlights} flight(s) and ${conflictingClasses} ground-school class(es) already scheduled on this date — please review manually, nothing was changed.`
    : '';
  return { success: true, message: `✅ Holiday added.${conflictNote}`, conflictingFlights, conflictingClasses };
}

// "Append + skip duplicates" — a row is a duplicate if a holiday already
// exists (in the DB, or earlier in this same CSV batch) with the same
// date + isRecurring combination. Existing holidays are never overwritten.
export async function addHolidaysBulk(holidaysToAdd: Omit<Holiday, 'id'>[]): Promise<{
  added: number; skipped: number; skippedNames: string[];
  conflictingFlights: number; conflictingClasses: number;
}> {
  // No synchronous "read current SWR cache" API here, so pull the current
  // list fresh for the dedup set — same data the old store's
  // get().holidays read directly out of its own state.
  const existing = await fetchHolidays();
  const seen = new Set(existing.map(h => `${h.date}|${h.isRecurring}`));
  let added = 0, skipped = 0;
  const skippedNames: string[] = [];
  let conflictingFlights = 0, conflictingClasses = 0;
  for (const h of holidaysToAdd) {
    const key = `${h.date}|${h.isRecurring}`;
    if (seen.has(key)) { skipped++; skippedNames.push(h.holidayName); continue; }
    seen.add(key);
    const res = await fetch('/api/admin/config/holidays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        holiday_name: h.holidayName,
        holiday_date: h.date,
        is_recurring: h.isRecurring,
        notes: h.notes || '',
      }),
    });
    if (!res.ok) { skipped++; skippedNames.push(h.holidayName); continue; }
    added++;
    const conflicts = await countScheduleConflictsOnDate(h.date);
    conflictingFlights += conflicts.conflictingFlights;
    conflictingClasses += conflicts.conflictingClasses;
  }
  if (added > 0) await mutate(holidaysKey);
  return { added, skipped, skippedNames, conflictingFlights, conflictingClasses };
}

export async function removeHoliday(id: string): Promise<void> {
  const res = await fetch(`/api/admin/config/holidays?id=${id}`, { method: 'DELETE' });
  if (res.ok) {
    mutate<Holiday[]>(holidaysKey, (current = []) => current.filter(h => h.id !== id), { revalidate: false });
  } else {
    console.error('Error removing holiday:', await res.text());
  }
}

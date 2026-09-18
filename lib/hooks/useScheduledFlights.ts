// lib/hooks/useScheduledFlights.ts
// ---------------------------------------------------------------------------
// SWR migration, Stage 5 (2026-09-01) — see the approved SWR migration plan
// (Project doc: claude/swr-migration-plan-2026-08-28.md) for the full
// architecture and staging rationale. This is the highest call-site-fan-out
// domain migrated so far, and the one with real write complexity:
// bookFlight()'s server-side conflict check + insert has no client-known id
// to splice with, so it revalidates from the server instead (the plan's own
// "server derived it, don't locally splice" rule) — the second (after Flight
// Records/Fuel Records in Stage 4) domain in this migration to need that
// path.
//
// Cross-domain name enrichment (aircraftReg/studentName/instructorName)
// follows the STUDENTS precedent (Stage 3), not the Availability/Flight-
// Records one: fetchScheduledFlights() below returns ONLY this domain's own
// columns. withScheduledFlightNames(), a render-time selector, joins in
// aircraft/student/instructor names at the point of use instead. This
// matters more here than anywhere else in the migration so far: unlike
// Flight Records (add-only, always revalidates), cancelFlight() and
// updateScheduledFlight() below both locally splice the cache on every
// write — including drag-and-drop reassigning a flight to a different
// aircraft. A name baked in at fetch time would go stale on exactly that
// kind of write (the OLD aircraft's registration staying attached to the
// row) until the next full refetch — the same bug class Stage 3 fixed for
// Students' assignedInstructorName. A render-time selector recomputes from
// whatever's currently in all four caches on every render, so it can't go
// stale on its own. See the migration plan's "Render-time join selectors"
// Architecture note.
//
// `duration` IS still computed in the fetcher below, unlike the three name
// fields — it's derived purely from this domain's own startTime/endTime,
// not a cross-domain join, so there's nothing for it to go stale against.
// ---------------------------------------------------------------------------

'use client';

import useSWR, { mutate } from 'swr';
import {
  getSchedulingBlockReason, parseWeeklyOffDays, parsePartialWeeklyOffRule,
  getAircraftBufferMinutes, parseTurnaroundBufferSetting, getProjectedFuelAfter,
  FUELING_BUFFER_MIN, LOW_FUEL_THRESHOLD_L,
} from '@/lib/store';
import { fetchAircraft } from './useAircraft';
import { fetchHolidays } from './useHolidays';
import { fetchFtoSettings } from './useFtoSettings';
import type { Aircraft, Instructor, ScheduledFlight, StudentRecord, TimeConflict } from '@/types';

export const scheduledFlightsKey = ['scheduledFlights'] as const;

// ---------------------------------------------------------------------------
// Fetcher — same row-mapping loadScheduledFlights() (lib/store.ts) used,
// minus the aircraft/student/instructor name join — see the file header
// above for why that moved to withScheduledFlightNames() below.
//
// 2026-09-18 (RLS remediation Step 3): was a direct client-side
// `supabase.from('scheduled_flights')` call (anon key) — now goes through
// GET /api/scheduled-flights (service-role, session-gated) so the table's
// RLS policy can be locked down. See
// claude/rls-remediation-progress-2026-09-18.md.
// ---------------------------------------------------------------------------
export async function fetchScheduledFlights(): Promise<ScheduledFlight[]> {
  const res = await fetch('/api/scheduled-flights');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('Error loading scheduled flights:', err.error || res.statusText);
    throw new Error(err.error || 'Failed to load scheduled flights.');
  }
  const { flights: data } = await res.json();

  return (data || []).map((row: Record<string, unknown>) => {
    const startTime = new Date(row.start_time as string);
    const endTime = new Date(row.end_time as string);
    return {
      id: String(row.id),
      aircraftId: String(row.aircraft_id),
      instructorId: String(row.instructor_id),
      studentId: row.student_id ? String(row.student_id) : undefined,
      startTime: row.start_time as string,
      endTime: row.end_time as string,
      sortieType: row.sortie_type as string,
      status: row.status as string,
      exercise: (row.exercise as string) || '',
      weatherBriefed: row.weather_briefed as boolean,
      notamBriefed: row.notam_briefed as boolean,
      notes: row.notes as string,
      duration: Math.round((endTime.getTime() - startTime.getTime()) / 360000) / 10,
      logbookPending: !!row.logbook_pending,
      pendingDebrief: (row.pending_debrief as Record<string, unknown> | null) ?? null,
      cancellationReason: (row.cancellation_reason as string | null) ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Read hook — replaces `const { scheduledFlights, loadingSchedule } =
// useFlightStore()` + each call site's own `useEffect(() =>
// loadScheduledFlights(), ...)`. SWR handles fetch-on-mount and cross-
// component cache sharing, same as every earlier stage.
// ---------------------------------------------------------------------------
export function useScheduledFlights() {
  const { data, error, isLoading, mutate: boundMutate } = useSWR<ScheduledFlight[]>(
    scheduledFlightsKey,
    () => fetchScheduledFlights()
  );

  return {
    scheduledFlights: data ?? [],
    isLoading,
    error,
    mutate: boundMutate,
  };
}

// ---------------------------------------------------------------------------
// Render-time join selector — see the file header for why this isn't baked
// into the fetcher. Call once per consuming page/component with whatever's
// currently in the aircraft/student/instructor caches (all three already
// migrated, Stages 1-3), same shape as useStudents.ts's withInstructorNames.
// A flight whose aircraft/student/instructor can't be found (deleted, or
// that cache not yet loaded) falls back to the same 'Unknown'/'None'
// placeholders the old baked-in fetcher used, so no display code downstream
// needs to change.
// ---------------------------------------------------------------------------
export function withScheduledFlightNames(
  flights: ScheduledFlight[],
  aircraft: Aircraft[],
  students: StudentRecord[],
  instructors: Instructor[]
): ScheduledFlight[] {
  return flights.map(f => {
    const ac = aircraft.find(a => String(a.id) === String(f.aircraftId));
    const student = f.studentId ? students.find(s => String(s.id) === String(f.studentId)) : undefined;
    const inst = instructors.find(i => String(i.id) === String(f.instructorId));
    return {
      ...f,
      aircraftReg: ac?.registration || 'Unknown',
      studentName: student?.name || 'None',
      instructorName: inst?.name || 'Unknown',
    };
  });
}

// ---------------------------------------------------------------------------
// Writes — plain exported async functions, same shape and same
// failure-handling decisions as the original store actions. Holidays
// (Stage 7) and FTO Settings (Stage 8) are both SWR-migrated now
// (2026-09-02) — read via fetchHolidays()/fetchFtoSettings() below instead
// of the old useFlightStore.getState() interim snapshot pattern
// (useAvailability.ts used the same interim pattern for Students, between
// Stage 2 and Stage 3).
// ---------------------------------------------------------------------------

// Ported as-is from lib/store.ts's checkConflicts — buffer is per-aircraft,
// not a flat constant, and asymmetric: the gap required BEFORE this flight
// depends on the aircraft's fuel level right now, the gap required AFTER it
// depends on the fuel level projected at the end of THIS flight. See
// getAircraftBufferMinutes/getProjectedFuelAfter in lib/store.ts.
export async function checkConflicts(
  aircraftId: string,
  startTime: string,
  endTime: string,
  excludeId?: string
): Promise<TimeConflict> {
  const bufferAircraft = (await fetchAircraft()).find(a => String(a.id) === String(aircraftId));
  const turnaroundMin = parseTurnaroundBufferSetting((await fetchFtoSettings())['buffer_minutes']);
  const durationMin = Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000);
  const bufferBeforeMin = getAircraftBufferMinutes(bufferAircraft?.currentFuel, turnaroundMin);
  const projectedFuelAfter = getProjectedFuelAfter(bufferAircraft, durationMin);
  const bufferAfterMin = getAircraftBufferMinutes(projectedFuelAfter, turnaroundMin);
  const bufferedStart = new Date(startTime); bufferedStart.setMinutes(bufferedStart.getMinutes() - bufferBeforeMin);
  const bufferedEnd = new Date(endTime); bufferedEnd.setMinutes(bufferedEnd.getMinutes() + bufferAfterMin);
  // 2026-09-18 (RLS remediation Step 3): was a direct client-side
  // `supabase.from('scheduled_flights')` query (anon key) — now goes
  // through GET /api/scheduled-flights with the same filters as query
  // params (aircraft + time window + excludeCancelled), so the table's RLS
  // policy can be locked down. `excludeId` stays a client-side post-filter,
  // same as the original code already did (it was never in the SQL query).
  const params = new URLSearchParams({
    aircraftId, startTimeLt: bufferedEnd.toISOString(), endTimeGt: bufferedStart.toISOString(),
    excludeCancelled: 'true',
  });
  const res = await fetch(`/api/scheduled-flights?${params}`);
  if (!res.ok) return { hasConflict: false, conflictingFlights: [] };
  const { flights: data } = await res.json().catch(() => ({ flights: [] as Record<string, unknown>[] }));
  const conflicts: Record<string, unknown>[] = excludeId
    ? (data || []).filter((f: Record<string, unknown>) => String(f.id) !== String(excludeId))
    : (data || []);
  return {
    hasConflict: conflicts.length > 0,
    conflictingFlights: conflicts.map((row: Record<string, unknown>) => ({
      id: String(row.id), aircraftId: String(row.aircraft_id), instructorId: String(row.instructor_id),
      startTime: row.start_time as string, endTime: row.end_time as string,
      sortieType: row.sortie_type as string, status: row.status as string,
      weatherBriefed: false, notamBriefed: false, notes: '', exercise: '',
    })),
  };
}

// Conflict/holiday/weekly-off checks stay client-side (scheduling
// validation, not an authorization boundary — see app/api/scheduled-
// flights/route.ts's own scope note). The actual insert, and WHO is
// allowed to create a new booking at all, goes through that route.
export async function bookFlight(
  booking: Omit<ScheduledFlight, 'id' | 'aircraftReg' | 'studentName' | 'instructorName' | 'duration'>
): Promise<{ success: boolean; message: string }> {
  const bookingDateStr = new Date(booking.startTime).toLocaleDateString('en-CA');
  const [holidays, ftoSettings] = await Promise.all([fetchHolidays(), fetchFtoSettings()]);
  const blockReason = getSchedulingBlockReason(
    bookingDateStr, holidays,
    parseWeeklyOffDays(ftoSettings['weekly_off_days']),
    parsePartialWeeklyOffRule(ftoSettings['partial_weekly_off_days'])
  );
  if (blockReason) {
    return { success: false, message: `❌ FTO is closed (${blockReason.label}) — cannot book flights on this date.` };
  }
  const conflict = await checkConflicts(booking.aircraftId, booking.startTime, booking.endTime);
  if (conflict.hasConflict) {
    const conflictAircraft = (await fetchAircraft()).find(a => String(a.id) === String(booking.aircraftId));
    const turnaroundMin = parseTurnaroundBufferSetting(ftoSettings['buffer_minutes']);
    const durationMin = Math.round((new Date(booking.endTime).getTime() - new Date(booking.startTime).getTime()) / 60000);
    const bufferBeforeMin = getAircraftBufferMinutes(conflictAircraft?.currentFuel, turnaroundMin);
    const projectedFuelAfter = getProjectedFuelAfter(conflictAircraft, durationMin);
    const bufferAfterMin = getAircraftBufferMinutes(projectedFuelAfter, turnaroundMin);
    const bufferDesc = bufferBeforeMin === bufferAfterMin
      ? `a ${bufferBeforeMin}-min buffer before/after`
      : `a ${bufferBeforeMin}-min buffer before and ${bufferAfterMin}-min buffer after`;
    const lowFuelNote = (bufferBeforeMin > turnaroundMin || bufferAfterMin > turnaroundMin)
      ? ` (includes a mandatory ${FUELING_BUFFER_MIN}-min refuel window — fuel is at or below ${LOW_FUEL_THRESHOLD_L}L)`
      : '';
    return { success: false, message: `⚠️ Time conflict — this aircraft needs ${bufferDesc} existing flights${lowFuelNote}.` };
  }
  const res = await fetch('/api/scheduled-flights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      aircraftId: booking.aircraftId, instructorId: booking.instructorId,
      studentId: booking.studentId || null, startTime: booking.startTime, endTime: booking.endTime,
      sortieType: booking.sortieType, exercise: booking.exercise || '',
      status: booking.status || 'SCHEDULED',
      weatherBriefed: booking.weatherBriefed || false, notamBriefed: booking.notamBriefed || false,
      notes: booking.notes || '',
    }),
  });
  if (res.ok) {
    // The route's response is just {success:true} — no id/row back to
    // splice locally with, so revalidate from the server instead (the
    // plan's "server derived it, don't locally splice" case — same
    // treatment addFlightRecord() gave this in Stage 4).
    await mutate(scheduledFlightsKey);
    return { success: true, message: '✅ Flight booked!' };
  }
  const result = await res.json().catch(() => ({}));
  if (res.status === 403) {
    return { success: false, message: `🔒 ${result.error || 'Not authorized to create a new booking.'}` };
  }
  return { success: false, message: '❌ Failed to book flight.' };
}

// Soft-cancel — sets status='CANCELLED' + cancellation_reason and keeps the
// row (so the Daily Flying Report can count Weather vs. Maintenance vs.
// Other cancellations), rather than a hard DELETE. The write payload here
// IS the new state (client knows exactly what changed), so this splices
// locally rather than revalidating — the plan's other cache-update case.
//
// 2026-09-18 (RLS exposure remediation, see
// claude/rls-exposure-2026-09-18.md): routed through
// /api/scheduled-flights/[id] (PATCH), gated to SCHEDULE_MANAGE_ROLES —
// see that route and lib/permissions.ts for why (this used to have no role
// check at all, client or server).
export async function cancelFlight(id: string, reason?: 'WEATHER' | 'MAINTENANCE' | 'OTHER'): Promise<void> {
  const res = await fetch(`/api/scheduled-flights/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'CANCELLED', cancellationReason: reason ?? null }),
  });
  if (res.ok) {
    mutate<ScheduledFlight[]>(
      scheduledFlightsKey,
      (current = []) => current.map(f => (f.id === id ? { ...f, status: 'CANCELLED' } : f)),
      { revalidate: false }
    );
  } else {
    const result = await res.json().catch(() => ({}));
    console.error('Error cancelling flight:', result.error || res.statusText);
  }
}

// 2026-09-12: return type changed from Promise<void> to Promise<{success,
// error?}> — same shape as addFlightRecord()/bookFlight() elsewhere in this
// file. Previously a rejected write here (DB error of any kind) was
// completely silent: no throw, no console.error, nothing — the caller had
// no way to know the flight's status was never actually persisted, and a
// hard reload would keep showing the stale pre-update status forever with
// no clue why. DebriefForm.tsx is the first caller to actually check this;
// existing fire-and-forget callers (ScheduleBoard's drag-and-drop
// reschedule) are unaffected since they never used the old void return.
export async function updateScheduledFlight(id: string, updates: Partial<ScheduledFlight>): Promise<{ success: boolean; error?: string }> {
  // Secondary safety net — BookingForm's validateDate() is the primary
  // client-side gate for the edit-submit path, but this guards the write
  // path too in case a new startTime ever reaches it another way (e.g.
  // ScheduleBoard's drag-and-drop reschedule).
  if (updates.startTime !== undefined) {
    const newDateStr = new Date(updates.startTime).toLocaleDateString('en-CA');
    const [holidays, ftoSettings] = await Promise.all([fetchHolidays(), fetchFtoSettings()]);
    const blockReason = getSchedulingBlockReason(
      newDateStr, holidays,
      parseWeeklyOffDays(ftoSettings['weekly_off_days']),
      parsePartialWeeklyOffRule(ftoSettings['partial_weekly_off_days'])
    );
    if (blockReason) {
      const message = `Cannot reschedule to ${newDateStr} — FTO is closed (${blockReason.label}).`;
      console.error(`❌ Flight ${id}: ${message}`);
      return { success: false, error: message };
    }
  }
  // 2026-09-18 (RLS exposure remediation, see
  // claude/rls-exposure-2026-09-18.md): routed through
  // /api/scheduled-flights/[id] (PATCH), gated to SCHEDULE_MANAGE_ROLES —
  // that route's FIELD_MAP whitelists exactly the fields this function
  // used to write directly (see its own header comment), so `updates` can
  // be sent as-is instead of building a separate dbUpdates object here.
  const res = await fetch(`/api/scheduled-flights/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const result = await res.json().catch(() => ({}));
    console.error(`Error updating scheduled flight ${id}:`, result.error || res.statusText);
    return { success: false, error: result.error || 'Failed to update the flight.' };
  }
  mutate<ScheduledFlight[]>(
    scheduledFlightsKey,
    (current = []) => current.map(f => (f.id === id ? { ...f, ...updates } : f)),
    { revalidate: false }
  );
  return { success: true };
}

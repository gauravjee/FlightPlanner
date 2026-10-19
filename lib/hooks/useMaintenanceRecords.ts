// lib/hooks/useMaintenanceRecords.ts
// ---------------------------------------------------------------------------
// SWR migration, Stage 6 (2026-09-01) — Maintenance Records + Maintenance
// Schedule Templates. See the approved SWR migration plan (Project doc:
// claude/swr-migration-plan-2026-08-28.md) for the full architecture and
// staging rationale.
//
// Uses the render-time join selector pattern (withMaintenanceRecordNames
// below), NOT Stage 4's baked-in-at-fetch-time exception. The deciding
// factor is the same one the plan's Architecture section documents: does
// this domain's own writes ever locally splice? updateMaintenanceRecord
// below does (a partial merge into the existing cached row, same shape as
// the old store's local `set()` call) — a name baked in at fetch time
// would never get recomputed by that splice if the underlying aircraft's
// registration/type ever changed independently, the exact bug class Stage
// 3 (Students) fixed. addMaintenanceRecord, by contrast, always revalidates
// the whole list from the server, same as Flight/Fuel Records (Stage 4) —
// but the ONE local-splice write is what settles it for the aircraft join
// on this domain as a whole.
//
// Maintenance Schedule Templates stay read-only from this file's
// perspective, same as they were in the old store: writes go through
// AircraftMaintenanceScheduleTab.tsx's own fetch calls to
// /api/admin/config/aircraft-maintenance-schedule (same pattern every other
// admin config-CRUD tab uses), which should call
// `mutate(maintenanceScheduleTemplatesKey)` after each write instead of the
// old store's loadMaintenanceScheduleTemplates() call.
// ---------------------------------------------------------------------------

'use client';

import useSWR, { mutate } from 'swr';
import { aircraftKey } from './useAircraft';
import type { Aircraft, MaintenanceRecord, MaintenanceScheduleTemplate } from '@/types';

export const maintenanceRecordsKey = ['maintenanceRecords'] as const;
export const maintenanceScheduleTemplatesKey = ['maintenanceScheduleTemplates'] as const;

// ---------------------------------------------------------------------------
// Maintenance Records
// ---------------------------------------------------------------------------

// 2026-09-18 (RLS remediation, Batch 2 — see
// claude/data-access-security-mapping.md): was a direct client-side
// `supabase.from('maintenance_records')` call (anon key) — now goes through
// GET /api/maintenance-records (service-role, session-gated).
export async function fetchMaintenanceRecords(): Promise<MaintenanceRecord[]> {
  const res = await fetch('/api/maintenance-records');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('Error loading maintenance records:', err.error || res.statusText);
    throw new Error(err.error || 'Failed to load maintenance records.');
  }
  const { records: data } = await res.json();

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const now = new Date();

  return (data || []).map((row: Record<string, unknown>): MaintenanceRecord => {
    const maintenanceEnd = (row.maintenance_end as string) || null;
    const isActive = row.status === 'SCHEDULED' || row.status === 'IN_PROGRESS';
    // Prefer the precise maintenanceEnd for overdue/days-until-due when it's
    // set (exact moment, not just a day) — falls back to the original
    // whole-day scheduledDate comparison for legacy/simple records that
    // never got a precise window. Ported as-is from the old store's
    // loadMaintenanceRecords().
    let isOverdue: boolean; let daysUntilDue: number;
    if (maintenanceEnd) {
      const end = new Date(maintenanceEnd);
      isOverdue = isActive && end < now;
      daysUntilDue = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    } else {
      const scheduledDate = new Date(row.scheduled_date as string);
      daysUntilDue = Math.ceil((scheduledDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      isOverdue = isActive && daysUntilDue < 0;
    }

    return {
      id: String(row.id), aircraftId: String(row.aircraft_id),
      maintenanceType: row.maintenance_type as string, description: row.description as string,
      scheduledDate: row.scheduled_date as string, completedDate: row.completed_date as string || null,
      status: row.status as MaintenanceRecord['status'], cost: row.cost as number,
      performedBy: row.performed_by as string, notes: row.notes as string,
      maintenanceStart: (row.maintenance_start as string) || null,
      maintenanceEnd,
      hobbsAtCompletion: (row.hobbs_at_completion as number) ?? null,
      reportedBy: (row.reported_by as string) || null,
      isSquawk: Boolean(row.is_squawk),
      ticketNumber: (row.ticket_number as string) || null,
      isBaseline: Boolean(row.is_baseline),
      partsUsed: (row.parts_used as string) || null,
      ameName: (row.ame_name as string) || null,
      ameLicenseNo: (row.ame_license_no as string) || null,
      crsReference: (row.crs_reference as string) || null,
      assignedAmeId: (row.assigned_ame_id as number) ?? null,
      // Deliberately NOT resolved here — see the file header above.
      // withMaintenanceRecordNames() below fills these in at render time.
      aircraftReg: undefined, aircraftType: undefined,
      isOverdue, daysUntilDue,
    };
  });
}

export function useMaintenanceRecords() {
  const { data, error, isLoading, mutate: boundMutate } = useSWR<MaintenanceRecord[]>(
    maintenanceRecordsKey,
    () => fetchMaintenanceRecords()
  );

  return {
    maintenanceRecords: data ?? [],
    isLoading,
    error,
    mutate: boundMutate,
  };
}

// Render-time join, same shape as useStudents.ts's withInstructorNames() /
// useScheduledFlights.ts's withScheduledFlightNames() — see the file header
// for why this stays a selector rather than baked into the fetcher.
export function withMaintenanceRecordNames(records: MaintenanceRecord[], aircraft: Aircraft[]): MaintenanceRecord[] {
  return records.map(r => {
    const ac = aircraft.find(a => String(a.id) === String(r.aircraftId));
    return { ...r, aircraftReg: ac?.registration || 'Unknown', aircraftType: ac?.type || '' };
  });
}

// Convenience selector — replaces the store's getMaintenanceForAircraft(id).
export function getMaintenanceForAircraft(records: MaintenanceRecord[], aircraftId: string): MaintenanceRecord[] {
  return records.filter(m => m.aircraftId === aircraftId);
}

// Writes go through app/api/maintenance-records/** — gated to
// MAINTENANCE_WRITE_ROLES (admin/super_admin/maintenance; instructor/
// operations can view but not log maintenance, per the 2026-08-17 role/tab
// matrix). See lib/api-auth.ts.
//
// Revalidates rather than splicing: the POST body omits id/aircraftReg/
// aircraftType/isOverdue/daysUntilDue/ticketNumber, all of which are
// either server-assigned or computed by the fetcher above from fields the
// client didn't send — same "server derived it, don't locally splice" case
// the migration plan's cache-update rule calls out. (The server does hand
// the new ticketNumber straight back in the response — see
// app/api/maintenance-records/route.ts — but the revalidate-on-success
// below already picks it up from the refetched list, so there's no need
// to thread it through the return value here too.)
// Return type carries the outcome (2026-09-18, P0 #4): used to be
// Promise<void> with failures only console.error'd, so every caller's UI
// (form close, success message) proceeded regardless of whether the save
// actually happened — a live bug the moment the server started rejecting
// COMPLETED records missing AME/CRS certification. Callers now await this
// and check `success` before closing/reporting success.
export async function addMaintenanceRecord(
  record: Omit<MaintenanceRecord, 'id' | 'aircraftReg' | 'aircraftType' | 'isOverdue' | 'daysUntilDue' | 'ticketNumber'>
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch('/api/maintenance-records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Error adding maintenance record:', result.error);
    return { success: false, error: result.error || 'Failed to add maintenance record.' };
  }
  await mutate(maintenanceRecordsKey);
  return { success: true };
}

// The "auto-clear the aircraft's status back to ACTIVE once its last active
// maintenance record completes/cancels" side effect happens server-side,
// inside app/api/maintenance-records/[id]/route.ts's PATCH handler — see
// that route's own comment for why (a `maintenance`-role user triggers this
// often and would 403 against the admin-only aircraft route otherwise).
//
// Locally splices `updates` into the cached row, same as the old store's
// `set()` call — and, same as that old code, does NOT recompute
// isOverdue/daysUntilDue from the merged result (e.g. the +4h/+1d
// quick-extend buttons push maintenanceEnd forward without re-deriving
// isOverdue). Ported as-is: a pre-existing gap, not something introduced or
// fixed by this migration — out of scope here, same as Stage 5's own
// "reapplied cleanly, whatever else changed in that file wasn't
// investigated further" scoping call.
export async function updateMaintenanceRecord(id: string, updates: Partial<MaintenanceRecord>): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`/api/maintenance-records/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const result = await res.json().catch(() => ({}));
  if (res.ok) {
    // The splice is optimistic only — it must revalidate (item 66).
    // isOverdue and daysUntilDue are DERIVED in fetchMaintenanceRecords from
    // maintenanceEnd/scheduledDate/status; a partial merge copies the new
    // field but leaves the derived ones at their old values. That is why
    // "+4h"/"+1d" appeared to do nothing: the end time moved, but the red row
    // and the OVERDUE badge — the only parts anyone actually looks at — were
    // computed at fetch time and stayed put. Completing an overdue record had
    // the same tell. Recomputing them here would mean a second copy of that
    // derivation to keep in sync, so let the server round-trip own it.
    mutate<MaintenanceRecord[]>(
      maintenanceRecordsKey,
      (current = []) => current.map(m => (m.id === id ? { ...m, ...updates } : m)),
      { revalidate: true }
    );
    // The aircraft-status side effect happened server-side above (if
    // applicable) — revalidate the SWR aircraft cache so any mounted
    // useAircraft() consumer's copy of that status reflects it instead of
    // going stale until the next full page load.
    if (updates.status === 'COMPLETED' || updates.status === 'CANCELLED') {
      await mutate(aircraftKey);
    }
    return { success: true };
  }
  console.error('Error updating maintenance record:', result.error);
  return { success: false, error: result.error || 'Failed to update maintenance record.' };
}

export async function removeMaintenanceRecord(id: string): Promise<void> {
  const res = await fetch(`/api/maintenance-records/${id}`, { method: 'DELETE' });
  if (res.ok) {
    mutate<MaintenanceRecord[]>(maintenanceRecordsKey, (current = []) => current.filter(m => m.id !== id), { revalidate: false });
  } else {
    console.error('Error removing maintenance record:', await res.text());
  }
}

// ---------------------------------------------------------------------------
// Maintenance Schedule Templates — read-only from this file's perspective,
// see the file header above.
// ---------------------------------------------------------------------------

// 2026-09-18 (RLS remediation, Batch 2/3 — see
// claude/data-access-security-mapping.md): was a direct client-side
// `supabase.from('aircraft_maintenance_schedule_templates')` call (anon
// key) — now goes through the shared, already-role-gated-for-writes
// GET /api/admin/config/aircraft-maintenance-schedule (service-role,
// session-gated for reads). This table has RLS off entirely today, same as
// `holidays` — this is what makes it safe to enable it with zero policies.
export async function fetchMaintenanceScheduleTemplates(): Promise<MaintenanceScheduleTemplate[]> {
  const res = await fetch('/api/admin/config/aircraft-maintenance-schedule');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('Error loading maintenance schedule templates:', err.error || res.statusText);
    throw new Error(err.error || 'Failed to load maintenance schedule templates.');
  }
  const { rows: data } = await res.json();
  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as number,
    aircraftModel: row.aircraft_model as string,
    itemName: row.item_name as string,
    intervalType: row.interval_type as MaintenanceScheduleTemplate['intervalType'],
    intervalValue: row.interval_value as number,
    notes: (row.notes as string) || null,
    isActive: row.is_active as boolean,
    engineType: (row.engine_type as string) || null,
  }));
}

export function useMaintenanceScheduleTemplates() {
  const { data, error, isLoading, mutate: boundMutate } = useSWR<MaintenanceScheduleTemplate[]>(
    maintenanceScheduleTemplatesKey,
    () => fetchMaintenanceScheduleTemplates()
  );

  return {
    maintenanceScheduleTemplates: data ?? [],
    isLoading,
    error,
    mutate: boundMutate,
  };
}

// computeMaintenanceDueItems / getMaintenanceDueItems moved to lib/maintenance-due.ts (19 Oct) so the
// booking routes can use them server-side; re-exported here for the existing client callers.
export { computeMaintenanceDueItems, getMaintenanceDueItems } from '@/lib/maintenance-due';

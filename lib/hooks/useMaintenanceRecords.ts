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
import { supabase } from '@/lib/supabase';
import { aircraftKey } from './useAircraft';
import type { Aircraft, MaintenanceDueItem, MaintenanceRecord, MaintenanceScheduleTemplate } from '@/types';
import { toDateStr } from '@/lib/ist';

export const maintenanceRecordsKey = ['maintenanceRecords'] as const;
export const maintenanceScheduleTemplatesKey = ['maintenanceScheduleTemplates'] as const;

// ---------------------------------------------------------------------------
// Maintenance Records
// ---------------------------------------------------------------------------

export async function fetchMaintenanceRecords(): Promise<MaintenanceRecord[]> {
  const { data, error } = await supabase.from('maintenance_records').select('*').order('scheduled_date', { ascending: true });
  if (error) {
    console.error('Error loading maintenance records:', error);
    throw error;
  }

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
export async function addMaintenanceRecord(
  record: Omit<MaintenanceRecord, 'id' | 'aircraftReg' | 'aircraftType' | 'isOverdue' | 'daysUntilDue' | 'ticketNumber'>
): Promise<void> {
  const res = await fetch('/api/maintenance-records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
  if (res.ok) {
    await mutate(maintenanceRecordsKey);
  } else {
    console.error('Error adding maintenance record:', await res.text());
  }
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
export async function updateMaintenanceRecord(id: string, updates: Partial<MaintenanceRecord>): Promise<void> {
  const res = await fetch(`/api/maintenance-records/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (res.ok) {
    mutate<MaintenanceRecord[]>(
      maintenanceRecordsKey,
      (current = []) => current.map(m => (m.id === id ? { ...m, ...updates } : m)),
      { revalidate: false }
    );
    // The aircraft-status side effect happened server-side above (if
    // applicable) — revalidate the SWR aircraft cache so any mounted
    // useAircraft() consumer's copy of that status reflects it instead of
    // going stale until the next full page load.
    if (updates.status === 'COMPLETED' || updates.status === 'CANCELLED') {
      await mutate(aircraftKey);
    }
  } else {
    console.error('Error updating maintenance record:', await res.text());
  }
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

export async function fetchMaintenanceScheduleTemplates(): Promise<MaintenanceScheduleTemplate[]> {
  const { data, error } = await supabase.from('aircraft_maintenance_schedule_templates').select('*');
  if (error) {
    console.error('Error loading maintenance schedule templates:', error);
    throw error;
  }
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

// ---------------------------------------------------------------------------
// computeMaintenanceDueItems + its private helpers — moved here as-is from
// lib/store.ts. Unlike the scheduling helpers useScheduledFlights.ts imports
// (getSchedulingBlockReason etc., genuinely shared with BookingForm's
// client-side validation), this pure function has exactly one caller
// (getMaintenanceDueItems below, itself only called from
// MaintenanceDueSection.tsx) — fully domain-specific, so it moves with the
// domain rather than staying behind in store.ts.
// ---------------------------------------------------------------------------

// Widens/narrows the "due soon" warning window based on the item's own
// interval, floored/capped so both short and long intervals get a sensible
// window (a 50-hr item gets a 10-hr warning; a 2000-hr item gets the same
// 25-hr cap as before).
function dueSoonHobbsWindow(intervalHours: number): number {
  return Math.max(5, Math.min(25, intervalHours * 0.2));
}
function dueSoonCalendarWindowDays(intervalMonths: number): number {
  return Math.max(7, Math.min(30, intervalMonths * 30 * 0.2));
}

// Case/whitespace-insensitive match so a maintenance record logged via the
// standard "Log Maintenance" form's fixed Type dropdown (e.g. "Oil Change")
// still matches a template item_name seeded with the same intent, even if
// casing ever drifts between the two.
function normalizeItemName(name: string): string {
  return name.trim().toLowerCase();
}

function addMonthsToDateStr(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return toDateStr(d);
}

// Pure function: given one aircraft's active template items and its
// completed/baseline maintenance history, work out due/overdue status for
// each item. Mirrors the getSchedulingBlockReason pure-function pattern —
// callable directly from a component/test without going through a hook.
//
// `records` should be every maintenance_records row for this aircraft (any
// status is fine — only COMPLETED rows, which is what a baseline row is
// also stored as, are used as the "last known service" anchor).
export function computeMaintenanceDueItems(
  aircraftId: string,
  currentHobbs: number,
  templates: MaintenanceScheduleTemplate[],
  records: MaintenanceRecord[]
): MaintenanceDueItem[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = toDateStr(today);
  const completed = records
    .filter(r => r.aircraftId === aircraftId && r.status === 'COMPLETED' && r.completedDate)
    .sort((a, b) => (a.completedDate! < b.completedDate! ? 1 : -1)); // newest first

  return templates
    .filter(t => t.isActive)
    .map((template): MaintenanceDueItem => {
      // Most recent COMPLETED record whose description/maintenanceType
      // matches this item's name — a lightweight text match rather than a
      // foreign key, consistent with maintenance_records having no
      // template_id column in Phase 1 (records aren't required to
      // originate from a template item at all). Case/whitespace-insensitive
      // — see normalizeItemName().
      const targetName = normalizeItemName(template.itemName);
      const last = completed.find(r =>
        normalizeItemName(r.maintenanceType || '') === targetName || normalizeItemName(r.description || '') === targetName
      );

      const lastHobbs = last?.hobbsAtCompletion ?? null;
      const lastDate = last?.completedDate ?? null;

      if (template.intervalType === 'HOBBS_HOURS') {
        if (lastHobbs == null) {
          return { template, aircraftId, lastHobbs, lastDate, dueAtHobbs: null, dueAtDate: null, status: 'NO_BASELINE' };
        }
        const dueAtHobbs = lastHobbs + template.intervalValue;
        const remaining = dueAtHobbs - currentHobbs;
        const status: MaintenanceDueItem['status'] = remaining < 0 ? 'OVERDUE' : remaining <= dueSoonHobbsWindow(template.intervalValue) ? 'DUE_SOON' : 'OK';
        return { template, aircraftId, lastHobbs, lastDate, dueAtHobbs, dueAtDate: null, status };
      } else {
        if (lastDate == null) {
          return { template, aircraftId, lastHobbs, lastDate, dueAtHobbs: null, dueAtDate: null, status: 'NO_BASELINE' };
        }
        const dueAtDate = addMonthsToDateStr(lastDate, template.intervalValue);
        const daysRemaining = Math.ceil((new Date(dueAtDate + 'T00:00:00').getTime() - new Date(todayStr + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24));
        const status: MaintenanceDueItem['status'] = daysRemaining < 0 ? 'OVERDUE' : daysRemaining <= dueSoonCalendarWindowDays(template.intervalValue) ? 'DUE_SOON' : 'OK';
        return { template, aircraftId, lastHobbs, lastDate, dueAtHobbs: null, dueAtDate, status };
      }
    });
}

// Replaces the store's getMaintenanceDueItems(aircraft) method — takes
// templates/records as explicit params now instead of reading them from
// get(), same adjustment Stage 1 made to this function's own aircraft
// parameter (takes the record itself; every call site already has it in
// hand from iterating useAircraft()'s own list).
export function getMaintenanceDueItems(
  aircraft: Pick<Aircraft, 'id' | 'model' | 'hobbsTime'>,
  templates: MaintenanceScheduleTemplate[],
  records: MaintenanceRecord[]
): MaintenanceDueItem[] {
  const templatesForModel = templates.filter(t => t.aircraftModel === aircraft.model);
  return computeMaintenanceDueItems(aircraft.id, aircraft.hobbsTime, templatesForModel, records);
}

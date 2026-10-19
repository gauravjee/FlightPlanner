// lib/maintenance-due.ts
// Pure maintenance due-status helpers, moved out of lib/hooks/useMaintenanceRecords.ts (a 'use client'
// file) on 19 Oct so the booking routes can check overdue blocking items server-side (lib/maintenance-block.ts).

import type { Aircraft, MaintenanceDueItem, MaintenanceRecord, MaintenanceScheduleTemplate } from '@/types';
import { toDateStr } from '@/lib/ist';

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
  records: Pick<MaintenanceRecord, 'aircraftId' | 'status' | 'completedDate' | 'maintenanceType' | 'description' | 'hobbsAtCompletion'>[]
): MaintenanceDueItem[] {
  // shortcut: "today" is the runtime's date, so on the (UTC) server a calendar item turns overdue up to 5.5 h after IST midnight; fine for a booking block.
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

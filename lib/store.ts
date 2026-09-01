// ============================================================
// lib/store.ts - CENTRAL STATE MANAGEMENT (ZUSTAND STORE)
// ============================================================
// This file is the brain of the FlightPro application. It:
// 1. Stores ALL application data (11 modules) from Supabase
// 2. Provides full CRUD functions for each module
// 3. Manages UI state (selected items, loading indicators, hover)
// 4. Maps database columns (snake_case) to TypeScript (camelCase)
// 5. Handles conflict detection for flight scheduling
// 6. Calculates derived values (overdue, costs, flight hours)
// 7. Fetches LIVE weather from FAA API
// 8. Fetches LIVE NOTAMs from FAA API
// 9. Loads FTO settings (school name, logo, timezone, etc.)
//
// MODULES:
//   1. Aircraft Fleet        - Registration, type, fuel, status, maintenance
//   2. Student Records       - Enrollment, training stage, medical expiry
//   3. Flight Records        - Digital logbook with maneuvers and performance
//   4. Fuel Management       - Refueling log with cost tracking
//   5. Schedule/Booking      - Flight slot booking with conflict detection
//   6. Maintenance           - Records with overdue alerts
//   7. Instructors           - Name, license, ratings, daily hour limits
//   8. Weather               - LIVE METAR/TAF from FAA (free)
//   9. NOTAMs                - LIVE NOTAMs from FAA (free)
//  10. Availability/Leave    - Instructor & student leave tracking
//  11. Training Requirements - Checklist for student milestones
//  12. FTO Settings          - School name, logo, timezone, time slots
//
// HOW TO USE:
//   import { useFlightStore } from '@/lib/store';
//   const { students, ftoSettings } = useFlightStore();
//   Aircraft moved to lib/hooks/useAircraft.ts (SWR migration, Stage 1,
//   2026-08-28) — import { useAircraft } from '@/lib/hooks/useAircraft'.
//   Instructors moved to lib/hooks/useInstructors.ts and Availability to
//   lib/hooks/useAvailability.ts (SWR migration, Stage 2, 2026-08-28).
//   Students moved to lib/hooks/useStudents.ts (SWR migration, Stage 3,
//   2026-08-28) — the instructor-name join students used to carry
//   pre-baked now lives in that file's withInstructorNames() selector.
//   Flight Records moved to lib/hooks/useFlightRecords.ts and Fuel Records
//   to lib/hooks/useFuelRecords.ts (SWR migration, Stage 4, 2026-08-29) —
//   unlike Students, both keep their aircraft/instructor/student name
//   joins baked into the fetcher rather than a render-time selector (see
//   that file's own header comment for why — matches the Availability
//   precedent, not the Students one).
// ============================================================

'use client';

import { create } from 'zustand';
import {
  Aircraft, FlightSlot,
  WeatherData, GeneralWeatherData, NOTAM,
  MaintenanceRecord,
  TrainingRequirement, Holiday,
  MaintenanceScheduleTemplate, MaintenanceDueItem
} from '@/types';
import { supabase } from './supabase';
// SWR migration, Stage 1 (2026-08-28): aircraft moved out of this store's
// own state into lib/hooks/useAircraft.ts. loadMaintenanceRecords below
// (the remaining not-yet-migrated loader that needs an aircraft
// name-join) calls fetchAircraft() directly for a fresh read instead of
// reading this store's own (now-removed) `aircraft` state.
// updateMaintenanceRecord still revalidates aircraftKey directly after a
// server-derived aircraft change (status reset) — the "server derived
// something the client didn't send, so revalidate rather than locally
// splice" case the migration plan calls out. (Flight Records', Fuel
// Records', and Scheduled Flights' own equivalent aircraftKey/fetchAircraft
// uses — hobbs bump, current_fuel bump, checkConflicts/bookFlight's
// fuel-buffer calc — moved out of this file along with those domains in
// Stages 4 and 5; see lib/hooks/useFlightRecords.ts / useFuelRecords.ts /
// useScheduledFlights.ts.)
import { fetchAircraft, aircraftKey } from './hooks/useAircraft';
// SWR migration, Stage 2 (2026-08-28): instructors and availability moved
// out of this store's own state into lib/hooks/useInstructors.ts and
// lib/hooks/useAvailability.ts. (The one not-yet-migrated loader that used
// to call fetchInstructors() directly for a name-join —
// loadScheduledFlights — moved out along with the rest of that domain in
// Stage 5; see lib/hooks/useScheduledFlights.ts.)
// SWR migration, Stage 3 (2026-08-28): students moved out of this store's
// own state into lib/hooks/useStudents.ts. (loadScheduledFlights, the
// remaining not-yet-migrated loader that called fetchStudents() directly
// for a student name-join, moved out along with the rest of that domain in
// Stage 5; see lib/hooks/useScheduledFlights.ts. Flight Records' own
// equivalent — loadFlightRecords/loadStudentFlightRecords' fetchStudents()
// call, and addFlightRecord's studentsKey revalidation for the
// server-derived hours/solo-date bump — moved out of this file along with
// that domain in Stage 4; see lib/hooks/useFlightRecords.ts.)
import { mutate } from 'swr';

// ============================================================
// SCHEDULING RULES — booking-duration, turnaround & fuel-burn constants
// ============================================================
// Shared by BookingForm's client-side validation and the dashboard's
// "Available Slots" tile (the store's own conflict check — checkConflicts/
// bookFlight — moved to lib/hooks/useScheduledFlights.ts in Stage 5):
//   - A flight must be at least MIN_FLIGHT_DURATION_MIN long, in
//     FLIGHT_DURATION_INCREMENT_MIN steps (45, 60, 75, 90 minutes, ...).
//   - Every aircraft needs a turnaround gap of clear time immediately
//     before and after each flight (crew/passenger changeover, walk-around,
//     etc). This is the FTO's own configurable `buffer_minutes` setting
//     (Settings -> Time & Scheduling -> "Buffer Between Flights") — that
//     setting already existed in the Settings UI but nothing actually read
//     it anywhere in the app; every conflict check silently used a
//     hardcoded 30 minutes instead. Now wired up for real, defaulting to
//     DEFAULT_TURNAROUND_BUFFER_MIN if the FTO hasn't set it explicitly.
//   - If an aircraft's fuel is at or below LOW_FUEL_THRESHOLD_L — either
//     right now, or projected to be after a given flight — an additional
//     FUELING_BUFFER_MIN is required on top of the turnaround gap, a
//     mandatory refuel window before it can fly again.
export const DEFAULT_TURNAROUND_BUFFER_MIN = 15;
export const MIN_FLIGHT_DURATION_MIN = 45;
export const FLIGHT_DURATION_INCREMENT_MIN = 15;
export const LOW_FUEL_THRESHOLD_L = 50;
export const FUELING_BUFFER_MIN = 15;

// Total buffer (minutes) required immediately before/after a flight, given
// the fuel level (in liters) to evaluate against — the FTO's configured
// turnaround gap (or DEFAULT_TURNAROUND_BUFFER_MIN if unset), plus a
// mandatory refuel window on top of it when that fuel level is at or below
// the low-fuel threshold. Callers pass whichever fuel level is relevant:
// an aircraft's current reading for the gap *before* a flight, or a
// projected post-flight level (see getProjectedFuelAfter) for the gap
// *after* one.
export function getAircraftBufferMinutes(
  fuelLevelL: number | undefined,
  turnaroundMin: number = DEFAULT_TURNAROUND_BUFFER_MIN
): number {
  const base = Number.isFinite(turnaroundMin) ? turnaroundMin : DEFAULT_TURNAROUND_BUFFER_MIN;
  const lowFuel = typeof fuelLevelL === 'number' && Number.isFinite(fuelLevelL) && fuelLevelL <= LOW_FUEL_THRESHOLD_L;
  return base + (lowFuel ? FUELING_BUFFER_MIN : 0);
}

// Parses the FTO's `buffer_minutes` setting string into a number, falling
// back to DEFAULT_TURNAROUND_BUFFER_MIN when unset/invalid. Centralized here
// so every call site (store, BookingForm, dashboard) parses it the same way.
export function parseTurnaroundBufferSetting(raw: string | undefined): number {
  const n = parseInt(raw ?? '', 10);
  return Number.isFinite(n) ? n : DEFAULT_TURNAROUND_BUFFER_MIN;
}

// ============================================================
// FUEL BURN RATE — estimating consumption from flight duration
// ============================================================
// 2026-08-19: previously keyed by the specific model code that `type` used
// to hold (e.g. 'C172S': 32, 'DA42': 28) — now that `type` holds just the
// engine category ('Single Engine' | 'Multi Engine', see
// restructure-aircraft-type-model.sql), this is a coarser 2-bucket
// default. Every EXISTING aircraft had its prior effective rate frozen
// into its own fuel_burn_rate_lph column by that same migration, so this
// coarser default only actually applies to aircraft added AFTER that
// migration ran and left blank — existing aircraft are unaffected. As
// before, this is only an editable starting default (Aircraft Setup ->
// "Fuel Burn Rate") — every FTO should verify/adjust per aircraft. For
// scheduling/planning only, never for real inflight fuel decisions.
export const FUEL_BURN_RATE_BY_TYPE_LPH: Record<string, number> = {
  'Single Engine': 32,
  'Multi Engine': 50,
};
// Fallback when an aircraft's type isn't in the table above (e.g. blank)
// and it has no rate of its own set.
export const DEFAULT_FUEL_BURN_RATE_LPH = 30;

// 2026-08-27: which engine category (Type) each Model belongs to — used by
// AircraftFormModal.tsx/AircraftSetupTab.tsx to filter the Model dropdown
// down to only models matching whichever Type is selected, so picking
// "Single Engine" then a twin-engine Model (or vice versa) can't happen by
// manual-entry mistake.
//
// Previously a hardcoded MODEL_ENGINE_TYPE map here — replaced with this
// derivation from the DB-backed engine_type column (see
// add-schedule-template-engine-type.sql) so a newly-added model's engine
// type is set the same way everything else about that model already is:
// via Admin Setup -> Aircraft Maintenance Schedule, no code change or
// deploy needed. The Aircraft Model list itself has been DB-driven since
// Phase 1 (SELECT DISTINCT aircraft_model) — this closes the one remaining
// piece that still required editing code.
//
// Takes the raw {aircraft_model, engine_type} rows a caller already has
// (AircraftFormModal.tsx/AircraftSetupTab.tsx each do their own lightweight
// supabase select, same pattern as the existing Model-options query — not
// routed through the full Zustand store, to keep those reads cheap and
// independent). A model with no engine_type set on any of its rows is
// simply absent from the returned map — the caller's own filter logic
// treats "not in the map" as "unknown, show for either Type," same
// fallback behavior the old hardcoded map had for anything it didn't list.
export function deriveModelEngineTypeMap(
  rows: { aircraft_model: string; engine_type: string | null }[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of rows) {
    if (row.engine_type && !map[row.aircraft_model]) {
      map[row.aircraft_model] = row.engine_type;
    }
  }
  return map;
}

// The fuel-burn rate (L/hr) to use for this aircraft: its own configured
// rate if set, else the engine-category default, else the flat fallback.
export function getAircraftFuelBurnRate(
  aircraft: Pick<Aircraft, 'type' | 'fuelBurnRateLph'> | undefined
): number {
  if (aircraft?.fuelBurnRateLph != null && Number.isFinite(aircraft.fuelBurnRateLph) && aircraft.fuelBurnRateLph > 0) {
    return aircraft.fuelBurnRateLph;
  }
  const typeDefault = aircraft?.type ? FUEL_BURN_RATE_BY_TYPE_LPH[aircraft.type] : undefined;
  return typeDefault ?? DEFAULT_FUEL_BURN_RATE_LPH;
}

// Projected fuel remaining (liters) after flying `durationMin` minutes on
// this aircraft, starting from its current recorded fuel level. This is a
// single-flight projection from the live `currentFuel` snapshot — it does
// NOT simulate fuel draining across an entire day of other bookings, since
// the app has no per-flight historical fuel record to simulate from.
// Never negative.
export function getProjectedFuelAfter(
  aircraft: Pick<Aircraft, 'currentFuel' | 'type' | 'fuelBurnRateLph'> | undefined,
  durationMin: number
): number {
  if (!aircraft) return 0;
  const burnRate = getAircraftFuelBurnRate(aircraft);
  return Math.max(0, aircraft.currentFuel - burnRate * (durationMin / 60));
}

// ============================================================
// HOLIDAYS — FTO-wide blackout dates that block booking/scheduling
// ============================================================
// Shared by BookingForm (validateDate), ScheduleBoard (grid-click block +
// banner), and GroundSchoolCalendar (openNewClass), plus
// useScheduledFlights.ts's own bookFlight/updateScheduledFlight, so every
// scheduling path agrees on which dates the FTO is closed. See the Holiday
// type in types/index.ts for the one-time-vs-recurring distinction.

// Does `dateStr` ('YYYY-MM-DD') fall on a holiday? Checks recurring
// holidays by month/day only (so a national holiday entered once keeps
// blocking that date every future year) and one-time holidays by exact
// date. Returns the matching Holiday, or null if the date is clear.
export function findHolidayForDate(dateStr: string, holidays: Holiday[]): Holiday | null {
  if (!dateStr) return null;
  const monthDay = dateStr.slice(5); // 'MM-DD'
  return holidays.find(h => (h.isRecurring ? h.date.slice(5) === monthDay : h.date === dateStr)) ?? null;
}

// "Flag for manual review, don't touch" support for addHoliday/addHolidaysBulk:
// counts already-scheduled, non-cancelled flights and ground-school classes
// that fall on `dateStr` ('YYYY-MM-DD'), using the same +05:30 day-bounds
// convention as ScheduleBoard, so admins get a heads-up without anything
// being auto-modified or auto-cancelled.
async function countScheduleConflictsOnDate(dateStr: string): Promise<{ conflictingFlights: number; conflictingClasses: number }> {
  const dayStart = `${dateStr}T00:00:00+05:30`;
  const dayEnd = `${dateStr}T23:59:59.999+05:30`;
  const [flightsRes, classesRes] = await Promise.all([
    supabase.from('scheduled_flights').select('id', { count: 'exact', head: true })
      .gte('start_time', dayStart).lte('start_time', dayEnd).neq('status', 'CANCELLED'),
    supabase.from('ground_school_classes').select('id', { count: 'exact', head: true })
      .eq('class_date', dateStr).neq('status', 'CANCELLED'),
  ]);
  return {
    conflictingFlights: flightsRes.count || 0,
    conflictingClasses: classesRes.count || 0,
  };
}

// ============================================================
// WEEKLY OFF DAY — FTO-wide recurring weekly closure (Settings -> Time &
// Scheduling -> "Weekly Off Day(s)"), stored as the `weekly_off_days`
// fto_settings key: a comma-separated list of day-of-week numbers
// (0=Sunday..6=Saturday), e.g. "0" for Sundays-only or "0,6" for
// Sunday+Saturday. Empty/unset means no weekly off day.
//
// PARTIAL WEEKLY OFF DAY (2026-08-25) — a second, independent rule for the
// "every 2nd/4th Saturday" or "1st/3rd/5th Saturday" pattern some FTOs use
// on top of (or instead of) a full weekly off day. Stored as a separate
// `partial_weekly_off_days` fto_settings key, JSON-encoded:
// {"day": 6, "occurrences": [2, 4]} — day is 0=Sunday..6=Saturday,
// occurrences are which occurrence(s) of that weekday in the month
// (1st..5th) are closed. Deliberately scoped to ONE day at a time (per
// user confirmation) — a day already in the full `weekly_off_days` set
// should not also carry a partial rule (enforced in the Settings UI, not
// here, since this file has no UI concerns). Empty/unset/malformed means
// no partial rule.
// ============================================================
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'];

export interface PartialWeeklyOffRule {
  day: number;            // 0=Sunday..6=Saturday
  occurrences: number[];  // which occurrence(s) of that weekday in the month (1-5) are off
}

// Parses the `weekly_off_days` fto_settings value into day-of-week numbers.
export function parseWeeklyOffDays(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n >= 0 && n <= 6);
}

// Parses the `partial_weekly_off_days` fto_settings value (JSON) into a
// PartialWeeklyOffRule, or null if unset/empty/malformed — malformed is
// treated the same as unset rather than throwing, since a bad value here
// should never break scheduling app-wide.
export function parsePartialWeeklyOffRule(raw: string | undefined): PartialWeeklyOffRule | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed && typeof parsed.day === 'number' && parsed.day >= 0 && parsed.day <= 6 &&
      Array.isArray(parsed.occurrences) &&
      parsed.occurrences.length > 0 &&
      parsed.occurrences.every((o: unknown) => typeof o === 'number' && o >= 1 && o <= 5)
    ) {
      return { day: parsed.day, occurrences: [...new Set<number>(parsed.occurrences)].sort((a, b) => a - b) };
    }
  } catch {
    // malformed JSON in the DB — treat as "no partial rule" rather than crash
  }
  return null;
}

// Is `dateStr` ('YYYY-MM-DD') a day of the week the FTO is closed every week?
export function isWeeklyOffDay(dateStr: string, weeklyOffDays: number[]): boolean {
  if (!dateStr || weeklyOffDays.length === 0) return false;
  const day = new Date(dateStr + 'T00:00:00').getDay();
  return weeklyOffDays.includes(day);
}

// Which occurrence (1st..5th) of its weekday `dateStr` falls on within its
// month — e.g. the 1st-7th of the month is always the 1st occurrence of
// whatever weekday it is, the 8th-14th the 2nd, etc.
export function weekdayOccurrenceInMonth(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  return Math.ceil(d.getDate() / 7);
}

// Is `dateStr` closed under the partial (occurrence-based) weekly-off
// rule? False if no rule is set, the date isn't the rule's weekday, or
// it's a non-matching occurrence (e.g. the 1st/3rd/5th when only 2nd/4th
// are configured). A month with only 4 occurrences of a weekday simply
// never matches an occurrences:[5] rule that month — no special-casing
// needed, the comparison just never hits.
export function isPartialWeeklyOffDay(dateStr: string, rule: PartialWeeklyOffRule | null): boolean {
  if (!dateStr || !rule) return false;
  const d = new Date(dateStr + 'T00:00:00');
  if (d.getDay() !== rule.day) return false;
  return rule.occurrences.includes(weekdayOccurrenceInMonth(dateStr));
}

// Combined "is this date blocked for scheduling, and why" check, used by
// BookingForm/ScheduleBoard/GroundSchoolCalendar and
// useScheduledFlights.ts's own bookFlight/updateScheduledFlight so every
// path agrees. Priority order:
// holiday (most specific) -> full weekly off -> partial weekly off.
// `partialRule` defaults to null so any not-yet-updated caller keeps
// working exactly as before. Returns null if the date is open.
export function getSchedulingBlockReason(
  dateStr: string,
  holidays: Holiday[],
  weeklyOffDays: number[],
  partialRule: PartialWeeklyOffRule | null = null
): { type: 'holiday' | 'weekly_off'; label: string } | null {
  const holiday = findHolidayForDate(dateStr, holidays);
  if (holiday) return { type: 'holiday', label: holiday.holidayName };
  if (isWeeklyOffDay(dateStr, weeklyOffDays)) {
    const day = new Date(dateStr + 'T00:00:00').getDay();
    return { type: 'weekly_off', label: `Weekly off (${DAY_NAMES[day]})` };
  }
  if (isPartialWeeklyOffDay(dateStr, partialRule)) {
    const occurrence = weekdayOccurrenceInMonth(dateStr);
    const ordinal = ORDINALS[occurrence - 1] || `${occurrence}th`;
    return { type: 'weekly_off', label: `Weekly off (${ordinal} ${DAY_NAMES[partialRule!.day]})` };
  }
  return null;
}

// ============================================================
// AIRCRAFT MAINTENANCE SCHEDULE — Phase 1 (2026-08-26)
// ============================================================
// Warnings + staff-confirmed record creation only — see
// add-aircraft-maintenance-schedule.sql's header for full scope, and the
// handoff doc's "Aircraft Maintenance Schedule" section for the confirmed
// design (Phase 2 hard-blocking is deliberately deferred, not built here).
//
// "Due soon" windows — how close to due before an OK item flips to
// DUE_SOON. 2026-08-26: changed from flat constants to a percentage of the
// item's own interval (capped) after adding short-interval items like a
// 50-hour Oil Change alongside the original long-interval ones (2000-hour
// TBO) — a flat 25-hour window meant a 50-hour oil change spent HALF its
// life showing DUE_SOON, which is noise, not a warning. 20% of the
// interval, floored/capped so both short and long intervals get a
// sensible window (a 50-hr item gets a 10-hr warning; a 2000-hr item gets
// the same 25-hr cap as before).
function dueSoonHobbsWindow(intervalHours: number): number {
  return Math.max(5, Math.min(25, intervalHours * 0.2));
}
function dueSoonCalendarWindowDays(intervalMonths: number): number {
  return Math.max(7, Math.min(30, intervalMonths * 30 * 0.2));
}

// Loose match for tying a logged maintenance_records row back to a
// schedule template item by name — case/whitespace-insensitive so a
// record logged via the standard "Log Maintenance" form's fixed Type
// dropdown (e.g. "Oil Change") still matches a template item_name seeded
// with the same intent, even if casing ever drifts between the two.
function normalizeItemName(name: string): string {
  return name.trim().toLowerCase();
}

function addMonthsToDateStr(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

// Pure function: given one aircraft's active template items and its
// completed/baseline maintenance history, work out due/overdue status for
// each item. Mirrors the getSchedulingBlockReason pure-function pattern —
// callable from the store itself and, if ever needed, directly from a
// component/test without going through Zustand.
//
// `records` should be every maintenance_records row for this aircraft
// (any status is fine — only COMPLETED rows, which is what a baseline row
// is also stored as, are used as the "last known service" anchor).
export function computeMaintenanceDueItems(
  aircraftId: string,
  currentHobbs: number,
  templates: MaintenanceScheduleTemplate[],
  records: MaintenanceRecord[]
): MaintenanceDueItem[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];
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

// ============================================================
// TYPE DEFINITION
// ============================================================
interface FlightStore {
  // ==========================================
  // DATA COLLECTIONS
  // ==========================================
  maintenanceRecords: MaintenanceRecord[];
  // 2026-08-26: Aircraft Maintenance Schedule, Phase 1 — active + inactive
  // template rows (see AircraftMaintenanceScheduleTab.tsx). Used with
  // computeMaintenanceDueItems() to work out due/overdue status per
  // aircraft.
  maintenanceScheduleTemplates: MaintenanceScheduleTemplate[];
  notams: NOTAM[];
  weather: WeatherData;
  // General (non-aviation) weather for a configured lat/long — only used
  // when there's no ICAO/reference station to source real METAR/TAF from.
  // null until fetchGeneralWeather() has been called at least once.
  generalWeather: GeneralWeatherData | null;
  trainingRequirements: TrainingRequirement[];
  ftoSettings: Record<string, string>;      // FTO settings as key-value pairs
  // True once loadFTOSettings() has resolved at least once (success or
  // failure). Distinguishes "still loading, don't know yet" from "loaded,
  // and genuinely has no airport_code set" — needed so the weather widget
  // doesn't flash a wrong state before settings arrive. Starts false.
  ftoSettingsLoaded: boolean;
  exercises: { exercise_name: string; short_code: string; full_description: string }[];
  // requires_instructor / requires_student are used to derive whether a
  // sortie counts as SOLO or DUAL (see addFlightRecord / FlightRecordForm),
  // now that Flight Type is no longer a separate field.
  sortieTypes: { id: number; type_name: string; type_code: string; requires_instructor: boolean; requires_student: boolean }[];
  // FTO-wide blackout dates — flights/ground-school classes cannot be
  // scheduled on these (see findHolidayForDate above). Managed via Admin
  // Setup -> Holiday Calendar.
  holidays: Holiday[];
  loadingHolidays: boolean;


  // ==========================================
  // UI STATE
  // ==========================================
  // Dark/light theme. Persisted to localStorage; the actual DOM attribute
  // (data-theme on <html>) is set both by an inline anti-flash script in
  // app/layout.tsx on first paint and here on every change, so the two
  // stay in sync regardless of which one ran first.
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  toggleTheme: () => void;
  selectedSlot: FlightSlot | null;
  hoveredSlot: string | null;
  loadingMaintenance: boolean;
  loadingNotams: boolean;
  loadingRequirements: boolean;

  // ==========================================
  // 0. MY PERMISSION OVERRIDES
  // ==========================================
  // The CURRENT signed-in user's own per-user permission overrides (see
  // lib/permissions.ts's MODULE_ACCESS/getModuleAccessLevel) — null until
  // loaded, then an object (possibly empty) once it has been. Used by
  // RoleGate/Sidebar and the write-gated components to combine with the
  // session's role, so a super_admin-granted override actually shows up in
  // the UI, not just in server-side enforcement. permissionOverridesFor
  // tracks which signed-in user's email this was loaded for, so switching
  // users mid-session (without a full page reload) triggers a re-fetch
  // instead of showing the previous user's overrides.
  permissionOverrides: Record<string, 'view' | 'full'> | null;
  permissionOverridesFor: string | null;
  loadMyPermissionOverrides: (email: string) => Promise<void>;

  // ==========================================
  // 1. AIRCRAFT ACTIONS
  // ==========================================
  // Migrated to lib/hooks/useAircraft.ts (SWR migration, Stage 1,
  // 2026-08-28) — see useAircraft()/addAircraft()/updateAircraft()/
  // removeAircraft()/getAircraftById() there.

  // 2. STUDENT ACTIONS — moved to lib/hooks/useStudents.ts (SWR migration,
  // Stage 3, 2026-08-28). useStudents(), addStudent(), updateStudent(),
  // removeStudent(), getStudentById(), assignInstructor(),
  // withInstructorNames() (the render-time instructor-name join selector).

  // 3. FLIGHT RECORD ACTIONS — moved to lib/hooks/useFlightRecords.ts (SWR
  // migration, Stage 4, 2026-08-29). useFlightRecords(), addFlightRecord(),
  // useStudentFlightRecords()/fetchStudentFlightRecords() (ported, unused).

  // 4. FUEL MANAGEMENT ACTIONS — moved to lib/hooks/useFuelRecords.ts (SWR
  // migration, Stage 4, 2026-08-29). useFuelRecords(), addFuelRecord(),
  // getFuelRecordsForAircraft() (ported selector, unused).

  // 5. SCHEDULE / BOOKING ACTIONS — moved to lib/hooks/useScheduledFlights.ts
  // (SWR migration, Stage 5, 2026-09-01). useScheduledFlights(),
  // withScheduledFlightNames() (render-time join selector), bookFlight(),
  // checkConflicts(), cancelFlight(), updateScheduledFlight().

  // ==========================================
  // 6. MAINTENANCE ACTIONS
  // ==========================================
  loadMaintenanceRecords: () => Promise<void>;
  addMaintenanceRecord: (record: Omit<MaintenanceRecord, 'id' | 'aircraftReg' | 'aircraftType' | 'isOverdue' | 'daysUntilDue'>) => Promise<void>;
  updateMaintenanceRecord: (id: string, updates: Partial<MaintenanceRecord>) => Promise<void>;
  removeMaintenanceRecord: (id: string) => Promise<void>;
  getMaintenanceForAircraft: (aircraftId: string) => MaintenanceRecord[];
  // 2026-08-26: Aircraft Maintenance Schedule, Phase 1.
  loadMaintenanceScheduleTemplates: () => Promise<void>;
  // 2026-08-28 (SWR migration, Stage 1): takes the aircraft record itself
  // rather than an id to look up — every call site already has it in hand
  // (it's iterating useAircraft()'s own list), and this store no longer
  // holds an aircraft copy of its own to look the id up in.
  getMaintenanceDueItems: (aircraft: Pick<Aircraft, 'id' | 'model' | 'hobbsTime'>) => MaintenanceDueItem[];

  // 7. INSTRUCTOR ACTIONS — moved to lib/hooks/useInstructors.ts (SWR
  // migration, Stage 2, 2026-08-28). useInstructors(), addInstructor(),
  // updateInstructor(), removeInstructor(), getInstructorById().

  // ==========================================
  // 8. WEATHER ACTIONS
  // ==========================================
  fetchWeather: (station?: string) => Promise<void>;
  fetchGeneralWeather: (lat: number, lon: number) => Promise<void>;

  // ==========================================
  // 9. NOTAM ACTIONS
  // ==========================================
  loadNOTAMs: (station?: string) => Promise<void>;

  // 10. AVAILABILITY / LEAVE ACTIONS — moved to lib/hooks/useAvailability.ts
  // (SWR migration, Stage 2, 2026-08-28). useAvailability(), addAvailability(),
  // updateAvailability(), removeAvailability(), checkAvailability().
  loadExercises: () => Promise<void>;
  loadSortieTypes: () => Promise<void>;
  // ==========================================
  // 11. TRAINING REQUIREMENTS ACTIONS
  // ==========================================
  loadTrainingRequirements: (studentId?: string) => Promise<void>;
  // 2026-08-19: for pages that legitimately need several specific students'
  // requirements at once (e.g. the Instructor Dashboard's per-student
  // progress list) — NOT for "give me everything." Replaces
  // trainingRequirements with just this set, same replace-whole-array
  // semantics as loadTrainingRequirements. See app/dashboard/instructor/page.tsx.
  loadTrainingRequirementsForStudents: (studentIds: string[]) => Promise<void>;
  toggleRequirement: (id: string, isCompleted: boolean) => Promise<void>;
  addRequirement: (requirement: Omit<TrainingRequirement, 'id'>) => Promise<void>;
  removeRequirement: (id: string) => Promise<void>;
  getRequirementsForStudent: (studentId: string) => TrainingRequirement[];

  // ==========================================
  // 12. FTO SETTINGS ACTIONS
  // ==========================================
  loadFTOSettings: () => Promise<void>;
  getFTOSetting: (key: string) => string;

  // ==========================================
  // 13. HOLIDAYS ACTIONS
  // ==========================================
  loadHolidays: () => Promise<void>;
  // "Flag for manual review, don't touch" — returns how many already-scheduled
  // flights/ground-school classes (non-cancelled) fall on the new holiday's
  // date, so the calling UI can warn the admin. Nothing is auto-modified.
  addHoliday: (holiday: Omit<Holiday, 'id'>) => Promise<{ success: boolean; message: string; conflictingFlights?: number; conflictingClasses?: number }>;
  addHolidaysBulk: (holidays: Omit<Holiday, 'id'>[]) => Promise<{
    added: number; skipped: number; skippedNames: string[];
    conflictingFlights: number; conflictingClasses: number;
  }>;
  removeHoliday: (id: string) => Promise<void>;

  // ==========================================
  // UI ACTIONS
  // ==========================================
  
  setSelectedSlot: (slot: FlightSlot | null) => void;
  setHoveredSlot: (id: string | null) => void;
}

// Shared row -> TrainingRequirement mapper, used by both
// loadTrainingRequirements (one student, or — historically — everything)
// and loadTrainingRequirementsForStudents (an explicit set of students).
// Factored out so the two can't drift apart on field mapping.
function mapTrainingRequirementRow(row: Record<string, unknown>): TrainingRequirement {
  return {
    id: String(row.id), studentId: String(row.student_id),
    templateId: row.template_id != null ? String(row.template_id) : undefined,
    requirementName: row.requirement_name as string, requirementCategory: row.requirement_category as string,
    isCompleted: row.is_completed as boolean, completedDate: row.completed_date as string || undefined,
    completedBy: row.completed_by as string || undefined, notes: row.notes as string || undefined,
    sortOrder: row.sort_order as number, validityYears: row.validity_years as number || undefined,
    requiredBeforeHours: row.required_before_hours as number || undefined,
    blocksSolo: row.blocks_solo as boolean, blocksAllFlights: row.blocks_all_flights as boolean,
    programCode: row.program_code as string,
  };
}

// ============================================================
// STORE CREATION
// ============================================================
export const useFlightStore = create<FlightStore>((set, get) => ({
  // ==========================================
  // INITIAL STATE
  // ==========================================
  maintenanceRecords: [],
  maintenanceScheduleTemplates: [],
  notams: [],
  exercises: [],
  sortieTypes: [],
  holidays: [],
  loadingHolidays: false,
  weather: {
    metar: 'Loading weather...',
    taf: 'Loading forecast...',
    temperature: 0, dewpoint: 0,
    windDirection: 0, windSpeed: 0,
    visibility: 0, ceiling: 0,
    qnh: 0, altimeter: 0,
    flightRules: 'VFR',
    warnings: [],
    time: '', station: 'VOBL',
    isLoading: true, error: null,
  },
  generalWeather: null,
  trainingRequirements: [],
  ftoSettings: {},          // Start empty, loaded from database
  ftoSettingsLoaded: false,
  // Real default lives in the inline script in app/layout.tsx (reads
  // localStorage, falls back to 'dark') which sets data-theme before this
  // store even initializes — 'dark' here is just a same-guess placeholder
  // so the store's own value doesn't briefly disagree with the DOM.
  theme: 'dark',
  setTheme: (theme) => {
    if (typeof window !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      window.localStorage.setItem('fp-theme', theme);
    }
    set({ theme });
  },
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },
  selectedSlot: null,
  hoveredSlot: null,
  loadingMaintenance: false,
  loadingNotams: false,
  loadingRequirements: false,

  // ============================================================
  // 0. MY PERMISSION OVERRIDES
  // ============================================================
  permissionOverrides: null,
  permissionOverridesFor: null,
  loadMyPermissionOverrides: async (email) => {
    try {
      const res = await fetch('/api/me/permissions');
      if (res.ok) {
        const { overrides } = await res.json();
        set({ permissionOverrides: overrides || {}, permissionOverridesFor: email });
      } else {
        set({ permissionOverrides: {}, permissionOverridesFor: email });
      }
    } catch (err) {
      console.error('Error loading permission overrides:', err);
      set({ permissionOverrides: {}, permissionOverridesFor: email });
    }
  },

  // ============================================================
  // 1. AIRCRAFT FUNCTIONS
  // ============================================================
  // Migrated to lib/hooks/useAircraft.ts (SWR migration, Stage 1,
  // 2026-08-28). Not-yet-migrated domains below that need aircraft data
  // call the exported fetchAircraft()/mutate(aircraftKey) from that file
  // directly — see the import comment at the top of this file.

  // 2. STUDENT FUNCTIONS — moved to lib/hooks/useStudents.ts (SWR
  // migration, Stage 3, 2026-08-28).

  // 3. FLIGHT RECORDS / LOGBOOK FUNCTIONS — moved to
  // lib/hooks/useFlightRecords.ts (SWR migration, Stage 4, 2026-08-29).

  // 4. FUEL MANAGEMENT FUNCTIONS — moved to lib/hooks/useFuelRecords.ts
  // (SWR migration, Stage 4, 2026-08-29).

  // ============================================================
  // 5. SCHEDULED FLIGHTS / BOOKING FUNCTIONS — moved to
  // lib/hooks/useScheduledFlights.ts (SWR migration, Stage 5, 2026-09-01).
  // useScheduledFlights(), withScheduledFlightNames() (render-time join
  // selector — replaces the fetch-time enrichment this used to do),
  // bookFlight(), checkConflicts(), cancelFlight(), updateScheduledFlight().
  // ============================================================

  // ============================================================
  // 6. MAINTENANCE FUNCTIONS
  // ============================================================
  loadMaintenanceRecords: async () => {
    set({ loadingMaintenance: true });
    const { data, error } = await supabase.from('maintenance_records').select('*').order('scheduled_date', { ascending: true });
    if (data && !error) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const now = new Date();
      // 2026-08-28 (SWR migration, Stage 1): aircraft is no longer part of
      // this store's own state — fetch it directly for this client-side
      // name-join, the same pattern lib/hooks/useFlightRecords.ts's
      // fetcher now uses since Stage 4.
      const aircraftList = await fetchAircraft();
      set({
        maintenanceRecords: data.map((row: Record<string, unknown>) => {
          const ac = aircraftList.find(a => String(a.id) === String(row.aircraft_id));
          const maintenanceEnd = (row.maintenance_end as string) || null;
          const isActive = row.status === 'SCHEDULED' || row.status === 'IN_PROGRESS';
          // Prefer the precise maintenanceEnd for overdue/days-until-due when
          // it's set (exact moment, not just a day) — falls back to the
          // original whole-day scheduledDate comparison for legacy/simple
          // records that never got a precise window.
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
            aircraftReg: ac?.registration || 'Unknown', aircraftType: ac?.type || '',
            isOverdue, daysUntilDue,
          };
        }),
        loadingMaintenance: false,
      });
    } else { console.error('Error loading maintenance records:', error); set({ loadingMaintenance: false }); }
  },

  // Writes go through app/api/maintenance-records/** now instead of
  // straight to Supabase — gated to MAINTENANCE_WRITE_ROLES (admin/
  // super_admin/maintenance; instructor/operations can view but not log
  // maintenance, per the 2026-08-17 role/tab matrix). See lib/api-auth.ts.
  addMaintenanceRecord: async (record) => {
    const res = await fetch('/api/maintenance-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    if (res.ok) await get().loadMaintenanceRecords();
    else console.error('Error adding maintenance record:', await res.text());
  },

  // The "auto-clear the aircraft's status back to ACTIVE once its last
  // active maintenance record completes/cancels" side effect (see the long
  // comment that used to live here) now happens server-side, inside
  // app/api/maintenance-records/[id]/route.ts's PATCH handler — via
  // supabaseAdmin directly on the aircraft row, NOT by calling
  // updateAircraft/app/api/aircraft/[id] from here, since that route is
  // gated to AIRCRAFT_WRITE_ROLES (admin/super_admin only) and would 403
  // for the `maintenance`-role user who triggers this side effect most
  // often. See that route's own comment for the full explanation.
  updateMaintenanceRecord: async (id, updates) => {
    const res = await fetch(`/api/maintenance-records/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      set(state => ({ maintenanceRecords: state.maintenanceRecords.map(m => m.id === id ? { ...m, ...updates } : m) }));
      // The aircraft-status side effect happened server-side above (if
      // applicable) — revalidate the SWR aircraft cache so any mounted
      // useAircraft() consumer's copy of that status reflects it instead
      // of going stale until the next full page load.
      if (updates.status === 'COMPLETED' || updates.status === 'CANCELLED') {
        await mutate(aircraftKey);
      }
    } else {
      console.error('Error updating maintenance record:', await res.text());
    }
  },

  removeMaintenanceRecord: async (id) => {
    const res = await fetch(`/api/maintenance-records/${id}`, { method: 'DELETE' });
    if (res.ok) set(state => ({ maintenanceRecords: state.maintenanceRecords.filter(m => m.id !== id) }));
    else console.error('Error removing maintenance record:', await res.text());
  },

  getMaintenanceForAircraft: (aircraftId) => get().maintenanceRecords.filter(m => m.aircraftId === aircraftId),

  // 2026-08-26: Aircraft Maintenance Schedule, Phase 1. Read-only —
  // writes go through AircraftMaintenanceScheduleTab.tsx's own fetch calls
  // to app/api/admin/config/aircraft-maintenance-schedule, same as every
  // other config-CRUD tab; this just keeps the shared store's copy in
  // sync so getMaintenanceDueItems() below has fresh data.
  loadMaintenanceScheduleTemplates: async () => {
    const { data, error } = await supabase.from('aircraft_maintenance_schedule_templates').select('*');
    if (error) { console.error('Error loading maintenance schedule templates:', error); return; }
    set({
      maintenanceScheduleTemplates: (data || []).map((row: Record<string, unknown>) => ({
        id: row.id as number,
        aircraftModel: row.aircraft_model as string,
        itemName: row.item_name as string,
        intervalType: row.interval_type as MaintenanceScheduleTemplate['intervalType'],
        intervalValue: row.interval_value as number,
        notes: (row.notes as string) || null,
        isActive: row.is_active as boolean,
        engineType: (row.engine_type as string) || null,
      })),
    });
  },

  // 2026-08-28 (SWR migration, Stage 1): takes the aircraft record itself
  // now instead of an id — see the interface comment above.
  getMaintenanceDueItems: (aircraft) => {
    const templatesForModel = get().maintenanceScheduleTemplates.filter(t => t.aircraftModel === aircraft.model);
    return computeMaintenanceDueItems(aircraft.id, aircraft.hobbsTime, templatesForModel, get().maintenanceRecords);
  },

  // 7. INSTRUCTOR FUNCTIONS — moved to lib/hooks/useInstructors.ts (SWR
  // migration, Stage 2, 2026-08-28).
  // assignInstructor — moved to lib/hooks/useStudents.ts (SWR migration,
  // Stage 3, 2026-08-28). Was already dead code (no callers) before this
  // migration; ported for interface completeness.


  // ============================================================
  // 8. WEATHER FUNCTIONS (LIVE FAA API)
  // ============================================================
  fetchWeather: async (station = 'VOBL') => {
    const { fetchWeather } = await import('./weather');
    const data = await fetchWeather(station);
    set({ weather: data });
  },

  // General (non-aviation) weather by lat/long — used only as a fallback
  // for schools with no ICAO/reference station configured. See
  // GeneralWeatherData for why this is kept separate from `weather`.
  fetchGeneralWeather: async (lat: number, lon: number) => {
    const { fetchGeneralWeather } = await import('./weather');
    const data = await fetchGeneralWeather(lat, lon);
    set({ generalWeather: data });
  },

  // ============================================================
  // 9. NOTAM FUNCTIONS (LIVE FAA API)
  // ============================================================
  loadNOTAMs: async (station = 'VOBL') => {
    set({ loadingNotams: true });
    const { fetchNOTAMs } = await import('./notam');
    const data = await fetchNOTAMs(station);
    set({ notams: data, loadingNotams: false });
  },

  // 10. AVAILABILITY / LEAVE FUNCTIONS — moved to lib/hooks/useAvailability.ts
  // (SWR migration, Stage 2, 2026-08-28).

  // ============================================================
  // 11. TRAINING REQUIREMENTS FUNCTIONS
  // ============================================================
  loadTrainingRequirements: async (studentId?: string) => {
    set({ loadingRequirements: true });
    let query = supabase.from('training_requirements').select('*').order('sort_order', { ascending: true });
    if (studentId) query = query.eq('student_id', studentId);
    const { data, error } = await query;
    if (data && !error) {
      set({
        trainingRequirements: data.map(mapTrainingRequirementRow),
        loadingRequirements: false,
      });
    } else { console.error('Error loading training requirements:', error); set({ loadingRequirements: false }); }
  },

  // 2026-08-19: added alongside the training_requirements/
  // training_requirement_templates split (see
  // split-training-requirement-templates.sql) to fix
  // app/dashboard/instructor/page.tsx calling loadTrainingRequirements()
  // with NO student filter at all — which pulled every student's
  // requirements (completion status, audit trail) school-wide into any
  // instructor's browser just to build a progress list for their own
  // assigned students. This scopes the query to exactly the students
  // asked for via .in(), instead of "everything" or "exactly one."
  loadTrainingRequirementsForStudents: async (studentIds: string[]) => {
    if (studentIds.length === 0) {
      set({ trainingRequirements: [] });
      return;
    }
    set({ loadingRequirements: true });
    const { data, error } = await supabase
      .from('training_requirements')
      .select('*')
      .in('student_id', studentIds)
      .order('sort_order', { ascending: true });
    if (data && !error) {
      set({
        trainingRequirements: data.map(mapTrainingRequirementRow),
        loadingRequirements: false,
      });
    } else { console.error('Error loading training requirements for students:', error); set({ loadingRequirements: false }); }
  },

  // Routes through a server-side API route (requireRole-gated to
  // REQUIREMENTS_WRITE_ROLES, completedBy derived from the verified
  // session) instead of writing to Supabase directly from the client — see
  // app/api/admin/requirements/toggle/route.ts. Previously this took a
  // completedBy argument from the caller and wrote it straight to Supabase;
  // that meant both "who's allowed to toggle a requirement" and "who gets
  // credited for it" were enforced client-side only, and a modified client
  // could claim to be anyone. 2026-08-19 hardening: the caller no longer
  // supplies completedBy at all — the server is the only source of truth
  // for it now, read back from the API response below.
  toggleRequirement: async (id, isCompleted) => {
    const res = await fetch('/api/admin/requirements/toggle', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isCompleted }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.error('Error toggling training requirement:', errBody.error || res.statusText);
      return;
    }
    const { completedBy } = await res.json();
    set(state => ({
      trainingRequirements: state.trainingRequirements.map(r =>
        r.id === id ? { ...r, isCompleted, completedDate: isCompleted ? new Date().toISOString().split('T')[0] : undefined, completedBy: isCompleted ? completedBy : undefined } : r
      )
    }));
  },

  addRequirement: async (requirement) => {
    // student_id is required (2026-08-19: training_requirements now only
    // ever holds real per-student assignments — see
    // split-training-requirement-templates.sql). template_id is optional;
    // this action has no current callers that set it, so a row added this
    // way just isn't linked back to a template, same as before the split.
    const { data, error } = await supabase.from('training_requirements').insert({
      student_id: requirement.studentId, template_id: requirement.templateId || null,
      requirement_name: requirement.requirementName,
      requirement_category: requirement.requirementCategory, is_completed: false,
      sort_order: requirement.sortOrder || 99, notes: requirement.notes || '',
      validity_years: requirement.validityYears, required_before_hours: requirement.requiredBeforeHours,
      blocks_solo: requirement.blocksSolo || false, blocks_all_flights: requirement.blocksAllFlights || false,
      program_code: requirement.programCode,
    }).select().single();
    if (data && !error) {
      set(state => ({
        trainingRequirements: [...state.trainingRequirements, { ...requirement, id: String(data.id), isCompleted: false }]
      }));
    }
  },

  removeRequirement: async (id) => {
    await supabase.from('training_requirements').delete().eq('id', id);
    set(state => ({ trainingRequirements: state.trainingRequirements.filter(r => r.id !== id) }));
  },

  getRequirementsForStudent: (studentId) => get().trainingRequirements.filter(r => r.studentId === studentId),

  // ============================================================
  // 12. FTO SETTINGS FUNCTIONS
  // ============================================================

  /**
   * Load all FTO settings from the database
   * Stores as key-value pairs for easy access throughout the app
   * Settings include: school_name, logo_url, timezone, time slots, buffer
   */
  loadFTOSettings: async () => {
    console.log('📋 Loading FTO settings...');
    const { data, error } = await supabase
      .from('fto_settings')
      .select('*');

    if (data && !error) {
      const settings: Record<string, string> = {};
      data.forEach((row: Record<string, unknown>) => {
        settings[row.setting_key as string] = row.setting_value as string;
      });
      console.log('✅ FTO settings loaded:', Object.keys(settings).length, 'settings');
      set({ ftoSettings: settings, ftoSettingsLoaded: true });
    } else {
      console.error('❌ Error loading FTO settings:', error);
      // Still flip this to true on failure — otherwise a school with real
      // DB trouble would leave dependents (like the weather widget) stuck
      // showing "loading" forever instead of falling back sensibly.
      set({ ftoSettingsLoaded: true });
    }
  },

  /**
   * Get a specific FTO setting by key
   * @param key - The setting key (e.g., 'school_name', 'logo_url', 'timezone')
   * @returns The setting value or empty string if not found
   */
  getFTOSetting: (key: string) => {
    return get().ftoSettings[key] || '';
  },

    // ============================================================
  // EXERCISES FUNCTIONS (from database)
  // ============================================================
  /**
   * Load all active exercises from the database
   * Used by ScheduleBoard for short code lookup and legend display
   * Managed via Super Admin Setup Wizard
   */
  loadExercises: async () => {
    const { data, error } = await supabase
      .from('exercises')
      .select('exercise_name, short_code, full_description')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    
    if (data && !error) {
      set({ exercises: data });
    } else {
      console.error('Error loading exercises:', error);
    }
  },

  // ============================================================
  // SORTIE TYPES (from database)
  // ============================================================
  /**
   * Load all active sortie types from the database.
   * Managed via Admin Setup → Sortie Types. Used by FlightRecordForm's
   * "Sortie Type" dropdown, which used to be a hardcoded list unrelated
   * to whatever an admin actually configured there.
   */
  loadSortieTypes: async () => {
    const { data, error } = await supabase
      .from('sortie_types')
      .select('id, type_name, type_code, requires_instructor, requires_student')
      .eq('is_active', true)
      .order('id', { ascending: true });

    if (data && !error) {
      set({ sortieTypes: data });
    } else {
      console.error('Error loading sortie types:', error);
    }
  },

  // ============================================================
  // 13. HOLIDAYS FUNCTIONS
  // ============================================================
  // FTO-wide blackout dates — see the Holiday type in types/index.ts and the
  // findHolidayForDate/getSchedulingBlockReason helpers above this store.
  // Managed via Admin Setup -> Holiday Calendar.
  loadHolidays: async () => {
    set({ loadingHolidays: true });
    const { data, error } = await supabase.from('holidays').select('*').order('holiday_date', { ascending: true });
    if (data && !error) {
      set({
        holidays: data.map((row: Record<string, unknown>) => ({
          id: String(row.id),
          holidayName: row.holiday_name as string,
          date: row.holiday_date as string,
          isRecurring: !!row.is_recurring,
          notes: (row.notes as string) || '',
        })),
        loadingHolidays: false,
      });
    } else {
      console.error('Error loading holidays:', error);
      set({ loadingHolidays: false });
    }
  },

  // 2026-08-21 (security hardening round): holiday-calendar writes used to
  // go straight to Supabase from the browser — one of the direct-write-
  // bypass instances named in the whole-frontend security review. Now
  // routed through the shared, role-checked config route (Admin Setup is
  // super_admin-only) instead — see app/api/admin/config/[table]/route.ts.
  addHoliday: async (holiday) => {
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
    await get().loadHolidays();
    const { conflictingFlights, conflictingClasses } = await countScheduleConflictsOnDate(holiday.date);
    const conflictNote = (conflictingFlights + conflictingClasses) > 0
      ? ` ⚠️ ${conflictingFlights} flight(s) and ${conflictingClasses} ground-school class(es) already scheduled on this date — please review manually, nothing was changed.`
      : '';
    return { success: true, message: `✅ Holiday added.${conflictNote}`, conflictingFlights, conflictingClasses };
  },

  // "Append + skip duplicates" — a row is a duplicate if a holiday already
  // exists (in the DB, or earlier in this same CSV batch) with the same
  // date + isRecurring combination. Existing holidays are never overwritten.
  addHolidaysBulk: async (holidaysToAdd) => {
    const seen = new Set(get().holidays.map(h => `${h.date}|${h.isRecurring}`));
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
    if (added > 0) await get().loadHolidays();
    return { added, skipped, skippedNames, conflictingFlights, conflictingClasses };
  },

  removeHoliday: async (id) => {
    const res = await fetch(`/api/admin/config/holidays?id=${id}`, { method: 'DELETE' });
    if (res.ok) set(state => ({ holidays: state.holidays.filter(h => h.id !== id) }));
  },

  // ============================================================
  // UI STATE FUNCTIONS
  // ============================================================
  setSelectedSlot: (slot) => set({ selectedSlot: slot }),
  setHoveredSlot: (id) => set({ hoveredSlot: id }),
}));
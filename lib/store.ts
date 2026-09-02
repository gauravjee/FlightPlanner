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
//   Scheduled Flights moved to lib/hooks/useScheduledFlights.ts (SWR
//   migration, Stage 5, 2026-09-01).
//   Maintenance Records + Maintenance Schedule Templates moved to
//   lib/hooks/useMaintenanceRecords.ts (SWR migration, Stage 6, 2026-09-01)
//   — computeMaintenanceDueItems()/getMaintenanceDueItems() moved there too.
//   Holidays moved to lib/hooks/useHolidays.ts (SWR migration, Stage 7,
//   2026-09-02) — findHolidayForDate()/getSchedulingBlockReason() (and the
//   weekly-off-day helpers the latter depends on) stay in this file, still
//   genuinely shared pure functions.
//   FTO Settings moved to lib/hooks/useFtoSettings.ts, Exercises to
//   lib/hooks/useExercises.ts, Sortie Types to lib/hooks/useSortieTypes.ts,
//   and My Permission Overrides to lib/hooks/usePermissionOverrides.ts (SWR
//   migration, Stage 8, 2026-09-02) — Training Requirements is Stage 8's
//   one remaining domain, not yet migrated.
// ============================================================

'use client';

import { create } from 'zustand';
import {
  Aircraft, FlightSlot,
  WeatherData, GeneralWeatherData, NOTAM,
  TrainingRequirement, Holiday,
} from '@/types';
import { supabase } from './supabase';
// SWR migration, Stage 1 (2026-08-28): aircraft moved out of this store's
// own state into lib/hooks/useAircraft.ts.
// SWR migration, Stage 2 (2026-08-28): instructors and availability moved
// out of this store's own state into lib/hooks/useInstructors.ts and
// lib/hooks/useAvailability.ts.
// SWR migration, Stage 3 (2026-08-28): students moved out of this store's
// own state into lib/hooks/useStudents.ts.
// SWR migration, Stage 4 (2026-08-29): flight records and fuel records
// moved out into lib/hooks/useFlightRecords.ts / useFuelRecords.ts.
// SWR migration, Stage 5 (2026-09-01): scheduled flights moved out into
// lib/hooks/useScheduledFlights.ts.
// SWR migration, Stage 6 (2026-09-01): maintenance records and maintenance
// schedule templates — the store's last not-yet-migrated domains that
// still called fetchAircraft()/mutate(aircraftKey) directly for a name-join
// and a server-derived-status revalidation — moved out into
// lib/hooks/useMaintenanceRecords.ts, along with those two imports. This
// store no longer imports fetchAircraft/aircraftKey/mutate at all; nothing
// left here needs them.

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

// (countScheduleConflictsOnDate — the addHoliday/addHolidaysBulk "flag for
// manual review" helper — moved to lib/hooks/useHolidays.ts, Stage 7 of the
// SWR migration (2026-09-02): it had exactly one caller each, both of which
// moved there too, same "single-caller helper moves with its caller" call
// Stage 6 made for computeMaintenanceDueItems.)

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
// AIRCRAFT MAINTENANCE SCHEDULE — moved to lib/hooks/useMaintenanceRecords.ts
// (SWR migration, Stage 6, 2026-09-01). dueSoonHobbsWindow(),
// dueSoonCalendarWindowDays(), normalizeItemName(), addMonthsToDateStr(),
// and computeMaintenanceDueItems() all live there now — this was the one
// pure-function group in this file with exactly one caller
// (getMaintenanceDueItems, only ever called from MaintenanceDueSection.tsx),
// unlike getSchedulingBlockReason/getAircraftBufferMinutes/
// getProjectedFuelAfter above, which stay here because BookingForm.tsx's
// own client-side validation genuinely shares them.
// ============================================================

// ============================================================
// TYPE DEFINITION
// ============================================================
interface FlightStore {
  // ==========================================
  // DATA COLLECTIONS
  // ==========================================
  notams: NOTAM[];
  weather: WeatherData;
  // General (non-aviation) weather for a configured lat/long — only used
  // when there's no ICAO/reference station to source real METAR/TAF from.
  // null until fetchGeneralWeather() has been called at least once.
  generalWeather: GeneralWeatherData | null;
  trainingRequirements: TrainingRequirement[];
  // (ftoSettings/ftoSettingsLoaded moved to lib/hooks/useFtoSettings.ts,
  // exercises moved to lib/hooks/useExercises.ts, sortieTypes moved to
  // lib/hooks/useSortieTypes.ts — all Stage 8 of the SWR migration,
  // 2026-09-02. holidays/loadingHolidays moved to lib/hooks/useHolidays.ts,
  // Stage 7, 2026-09-02.)


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
  loadingNotams: boolean;
  loadingRequirements: boolean;

  // (0. MY PERMISSION OVERRIDES — permissionOverrides/permissionOverridesFor/
  // loadMyPermissionOverrides moved to lib/hooks/usePermissionOverrides.ts,
  // Stage 8 of the SWR migration, 2026-09-02 — see
  // lib/useMyPermissionOverrides.ts, the wrapper RoleGate/Sidebar actually
  // call.)

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

  // 6. MAINTENANCE ACTIONS — moved to lib/hooks/useMaintenanceRecords.ts
  // (SWR migration, Stage 6, 2026-09-01). useMaintenanceRecords(),
  // useMaintenanceScheduleTemplates(), withMaintenanceRecordNames()
  // (render-time join selector), addMaintenanceRecord(),
  // updateMaintenanceRecord(), removeMaintenanceRecord(),
  // getMaintenanceForAircraft(), getMaintenanceDueItems().

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

  // (EXERCISES/SORTIE TYPES ACTIONS — loadExercises/loadSortieTypes moved to
  // lib/hooks/useExercises.ts and lib/hooks/useSortieTypes.ts, Stage 8 of
  // the SWR migration, 2026-09-02.)
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

  // (12. FTO SETTINGS ACTIONS — loadFTOSettings/getFTOSetting moved to
  // lib/hooks/useFtoSettings.ts, Stage 8 of the SWR migration, 2026-09-02.)

  // (13. HOLIDAYS ACTIONS — loadHolidays/addHoliday/addHolidaysBulk/
  // removeHoliday moved to lib/hooks/useHolidays.ts, Stage 7 of the SWR
  // migration, 2026-09-02.)

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
  notams: [],
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
  loadingNotams: false,
  loadingRequirements: false,

  // (0. MY PERMISSION OVERRIDES — permissionOverrides/permissionOverridesFor/
  // loadMyPermissionOverrides moved to lib/hooks/usePermissionOverrides.ts,
  // Stage 8 of the SWR migration, 2026-09-02.)

  // ============================================================
  // 1. AIRCRAFT FUNCTIONS
  // ============================================================
  // Migrated to lib/hooks/useAircraft.ts (SWR migration, Stage 1,
  // 2026-08-28).

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
  // 6. MAINTENANCE FUNCTIONS — moved to lib/hooks/useMaintenanceRecords.ts
  // (SWR migration, Stage 6, 2026-09-01). useMaintenanceRecords(),
  // useMaintenanceScheduleTemplates(), withMaintenanceRecordNames()
  // (render-time join selector — replaces the fetch-time aircraftReg/
  // aircraftType enrichment this used to do), addMaintenanceRecord(),
  // updateMaintenanceRecord(), removeMaintenanceRecord(),
  // getMaintenanceForAircraft(), getMaintenanceDueItems().
  // ============================================================

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

  // (12. FTO SETTINGS FUNCTIONS — loadFTOSettings/getFTOSetting moved to
  // lib/hooks/useFtoSettings.ts, Stage 8 of the SWR migration, 2026-09-02.)

  // (EXERCISES FUNCTIONS — loadExercises moved to lib/hooks/useExercises.ts,
  // Stage 8, 2026-09-02.)

  // (SORTIE TYPES FUNCTIONS — loadSortieTypes moved to
  // lib/hooks/useSortieTypes.ts, Stage 8, 2026-09-02.)

  // (13. HOLIDAYS FUNCTIONS — loadHolidays/addHoliday/addHolidaysBulk/
  // removeHoliday moved to lib/hooks/useHolidays.ts, Stage 7 of the SWR
  // migration, 2026-09-02. findHolidayForDate/getSchedulingBlockReason stay
  // above this store — see their own comments for why.)

  // ============================================================
  // UI STATE FUNCTIONS
  // ============================================================
  setSelectedSlot: (slot) => set({ selectedSlot: slot }),
  setHoveredSlot: (id) => set({ hoveredSlot: id }),
}));
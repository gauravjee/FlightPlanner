// ============================================================
// lib/store.ts — weather, NOTAMs, UI state + shared scheduling helpers
// ============================================================
// What's left in this Zustand store after the SWR migration (Stages 0-8,
// 2026-08-28 .. 2026-09-02, see claude/swr-migration-plan doc):
//   - weather / generalWeather / NOTAMs — live external APIs, never
//     migrated: no Supabase table to key an SWR cache off.
//   - theme, selectedSlot, hoveredSlot — small UI state.
//
// Every data domain now lives in its own SWR hook file:
//   aircraft            -> lib/hooks/useAircraft.ts
//   students            -> lib/hooks/useStudents.ts
//   instructors         -> lib/hooks/useInstructors.ts
//   availability/leave  -> lib/hooks/useAvailability.ts
//   flight/fuel records -> lib/hooks/useFlightRecords.ts, useFuelRecords.ts
//   scheduled flights   -> lib/hooks/useScheduledFlights.ts
//   maintenance         -> lib/hooks/useMaintenanceRecords.ts
//   holidays            -> lib/hooks/useHolidays.ts
//   FTO settings etc.   -> lib/hooks/useFtoSettings.ts, useExercises.ts,
//                          useSortieTypes.ts, usePermissionOverrides.ts,
//                          useTrainingRequirements.ts
//
// The pure helpers below stay in this file (rather than moving with their
// domain) because more than one caller genuinely shares them: BookingForm's
// own client-side validation, the dashboard's "Available Slots" tile, and
// useScheduledFlights.ts all call getSchedulingBlockReason /
// getAircraftBufferMinutes / getProjectedFuelAfter. A helper with exactly
// one caller moved to that caller's file instead.
// ============================================================
'use client';

import { create } from 'zustand';
import {
  Aircraft, FlightSlot,
  WeatherData, GeneralWeatherData, NOTAM,
  Holiday,
} from '@/types';
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

  // ==========================================
  // WEATHER ACTIONS (live FAA API)
  // ==========================================
  fetchWeather: (station?: string) => Promise<void>;
  fetchGeneralWeather: (lat: number, lon: number) => Promise<void>;

  // ==========================================
  // NOTAM ACTIONS (live FAA API)
  // ==========================================
  loadNOTAMs: (station?: string) => Promise<void>;

  // ==========================================
  // UI ACTIONS
  // ==========================================
  setSelectedSlot: (slot: FlightSlot | null) => void;
  setHoveredSlot: (id: string | null) => void;
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

  // ============================================================
  // WEATHER FUNCTIONS (LIVE FAA API)
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
  // NOTAM FUNCTIONS (LIVE FAA API)
  // ============================================================
  loadNOTAMs: async (station = 'VOBL') => {
    set({ loadingNotams: true });
    const { fetchNOTAMs } = await import('./notam');
    const data = await fetchNOTAMs(station);
    set({ notams: data, loadingNotams: false });
  },

  // ============================================================
  // UI STATE FUNCTIONS
  // ============================================================
  setSelectedSlot: (slot) => set({ selectedSlot: slot }),
  setHoveredSlot: (id) => set({ hoveredSlot: id }),
}));
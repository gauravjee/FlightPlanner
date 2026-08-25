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
//   const { aircraft, loadAircraft, ftoSettings } = useFlightStore();
// ============================================================

'use client';

import { create } from 'zustand';
import {
  Aircraft, Instructor, StudentRecord, FlightSlot,
  WeatherData, GeneralWeatherData, NOTAM, FuelRecord, FlightRecord,
  ScheduledFlight, TimeConflict, MaintenanceRecord,
  AvailabilityRecord, TrainingRequirement, Holiday
} from '@/types';
import { supabase } from './supabase';
import { flightHoursFromTimes } from './flight-classification';

// ============================================================
// SCHEDULING RULES — booking-duration, turnaround & fuel-burn constants
// ============================================================
// Shared by the store's own conflict check (checkConflicts/bookFlight),
// BookingForm's client-side validation, and the dashboard's "Available
// Slots" tile, so all three always agree on what counts as a bookable gap:
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
// banner), and GroundSchoolCalendar (openNewClass), plus the store's own
// bookFlight/updateScheduledFlight, so every scheduling path agrees on
// which dates the FTO is closed. See the Holiday type in types/index.ts
// for the one-time-vs-recurring distinction.

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
// ============================================================
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Parses the `weekly_off_days` fto_settings value into day-of-week numbers.
export function parseWeeklyOffDays(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n >= 0 && n <= 6);
}

// Is `dateStr` ('YYYY-MM-DD') a day of the week the FTO is closed every week?
export function isWeeklyOffDay(dateStr: string, weeklyOffDays: number[]): boolean {
  if (!dateStr || weeklyOffDays.length === 0) return false;
  const day = new Date(dateStr + 'T00:00:00').getDay();
  return weeklyOffDays.includes(day);
}

// Combined "is this date blocked for scheduling, and why" check, used by
// BookingForm/ScheduleBoard/GroundSchoolCalendar and the store's own
// bookFlight/updateScheduledFlight so every path agrees. Holidays take
// priority for the message (more specific); falls back to the weekly-off
// rule. Returns null if the date is open.
export function getSchedulingBlockReason(
  dateStr: string,
  holidays: Holiday[],
  weeklyOffDays: number[]
): { type: 'holiday' | 'weekly_off'; label: string } | null {
  const holiday = findHolidayForDate(dateStr, holidays);
  if (holiday) return { type: 'holiday', label: holiday.holidayName };
  if (isWeeklyOffDay(dateStr, weeklyOffDays)) {
    const day = new Date(dateStr + 'T00:00:00').getDay();
    return { type: 'weekly_off', label: `Weekly off (${DAY_NAMES[day]})` };
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
  aircraft: Aircraft[];
  students: StudentRecord[];
  flightRecords: FlightRecord[];
  fuelRecords: FuelRecord[];
  scheduledFlights: ScheduledFlight[];
  maintenanceRecords: MaintenanceRecord[];
  instructors: Instructor[];
  notams: NOTAM[];
  weather: WeatherData;
  // General (non-aviation) weather for a configured lat/long — only used
  // when there's no ICAO/reference station to source real METAR/TAF from.
  // null until fetchGeneralWeather() has been called at least once.
  generalWeather: GeneralWeatherData | null;
  availabilityRecords: AvailabilityRecord[];
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
  loadingAircraft: boolean;
  loadingStudents: boolean;
  loadingFlights: boolean;
  loadingFuel: boolean;
  loadingSchedule: boolean;
  loadingMaintenance: boolean;
  loadingInstructors: boolean;
  loadingNotams: boolean;
  loadingAvailability: boolean;
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
  loadAircraft: () => Promise<void>;
  addAircraft: (aircraft: Omit<Aircraft, 'id'>) => Promise<void>;
  updateAircraft: (id: string, updates: Partial<Aircraft>) => Promise<void>;
  removeAircraft: (id: string) => Promise<void>;
  getAircraftById: (id: string) => Aircraft | undefined;

  // ==========================================
  // 2. STUDENT ACTIONS
  // ==========================================
  loadStudents: () => Promise<void>;
  // Creating a student also creates their login (see app/api/students POST),
  // so the caller needs to know whether the welcome email went out — the
  // return value surfaces that instead of just success/failure.
  addStudent: (student: Omit<StudentRecord, 'id'>) => Promise<{
    success: boolean;
    error?: string;
    emailSent?: boolean;
    emailMessage?: string;
    password?: string;
  }>;
  // 2026-08-20: returns whether the save succeeded (used by the SPL-number
  // capture modal in RequirementsChecklist.tsx to avoid marking the SPL
  // requirement complete if the number itself failed to save) — the one
  // pre-existing caller (app/dashboard/students/page.tsx) just awaits it
  // without reading the return value, so this stays backward-compatible.
  updateStudent: (id: string, updates: Partial<StudentRecord>) => Promise<boolean>;
  removeStudent: (id: string) => Promise<void>;
  getStudentById: (id: string) => StudentRecord | undefined;
  assignInstructor: (studentId: string, instructorId: string) => Promise<void>;

  // ==========================================
  // 3. FLIGHT RECORD ACTIONS
  // ==========================================
  loadFlightRecords: () => Promise<void>;
  loadStudentFlightRecords: (studentId: string) => Promise<void>;
  // Returns success/error instead of void so the form knows whether to
  // close (save actually went through) or stay open with the error shown —
  // previously a failed insert closed the form silently, same as it never
  // happened.
  addFlightRecord: (record: Omit<FlightRecord, 'id' | 'studentName' | 'aircraftReg' | 'instructorName'>) => Promise<{ success: boolean; error?: string }>;

  // ==========================================
  // 4. FUEL MANAGEMENT ACTIONS
  // ==========================================
  loadFuelRecords: () => Promise<void>;
  addFuelRecord: (record: Omit<FuelRecord, 'id' | 'totalCost' | 'aircraftReg' | 'aircraftType'>) => Promise<void>;
  getFuelRecordsForAircraft: (aircraftId: string) => FuelRecord[];

  // ==========================================
  // 5. SCHEDULE / BOOKING ACTIONS
  // ==========================================
  loadScheduledFlights: () => Promise<void>;
  bookFlight: (booking: Omit<ScheduledFlight, 'id' | 'aircraftReg' | 'studentName' | 'instructorName' | 'duration'>) => Promise<{success: boolean; message: string}>;
  checkConflicts: (aircraftId: string, startTime: string, endTime: string, excludeId?: string) => Promise<TimeConflict>;
  cancelFlight: (id: string, reason?: 'WEATHER' | 'MAINTENANCE' | 'OTHER') => Promise<void>;
  updateScheduledFlight: (id: string, updates: Partial<ScheduledFlight>) => Promise<void>;

  // ==========================================
  // 6. MAINTENANCE ACTIONS
  // ==========================================
  loadMaintenanceRecords: () => Promise<void>;
  addMaintenanceRecord: (record: Omit<MaintenanceRecord, 'id' | 'aircraftReg' | 'aircraftType' | 'isOverdue' | 'daysUntilDue'>) => Promise<void>;
  updateMaintenanceRecord: (id: string, updates: Partial<MaintenanceRecord>) => Promise<void>;
  removeMaintenanceRecord: (id: string) => Promise<void>;
  getMaintenanceForAircraft: (aircraftId: string) => MaintenanceRecord[];

  // ==========================================
  // 7. INSTRUCTOR ACTIONS
  // ==========================================
  loadInstructors: () => Promise<void>;
  addInstructor: (instructor: Omit<Instructor, 'id'>) => Promise<void>;
  updateInstructor: (id: string, updates: Partial<Instructor>) => Promise<void>;
  removeInstructor: (id: string) => Promise<void>;

  // ==========================================
  // 8. WEATHER ACTIONS
  // ==========================================
  fetchWeather: (station?: string) => Promise<void>;
  fetchGeneralWeather: (lat: number, lon: number) => Promise<void>;

  // ==========================================
  // 9. NOTAM ACTIONS
  // ==========================================
  loadNOTAMs: (station?: string) => Promise<void>;

  // ==========================================
  // 10. AVAILABILITY / LEAVE ACTIONS
  // ==========================================
  loadAvailability: () => Promise<void>;
  addAvailability: (record: Omit<AvailabilityRecord, 'id' | 'personName' | 'personInitials'>) => Promise<void>;
  updateAvailability: (id: string, updates: Partial<AvailabilityRecord>) => Promise<void>;
  removeAvailability: (id: string) => Promise<void>;
  checkAvailability: (personType: string, personId: string, date: string) => Promise<boolean>;
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
  getInstructorById: (id: string) => Instructor | undefined;
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
  aircraft: [],
  students: [],
  flightRecords: [],
  fuelRecords: [],
  scheduledFlights: [],
  maintenanceRecords: [],
  instructors: [],
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
  availabilityRecords: [],
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
  loadingAircraft: false,
  loadingStudents: false,
  loadingFlights: false,
  loadingFuel: false,
  loadingSchedule: false,
  loadingMaintenance: false,
  loadingInstructors: false,
  loadingNotams: false,
  loadingAvailability: false,
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
  loadAircraft: async () => {
    set({ loadingAircraft: true });
    const { data, error } = await supabase.from('aircraft').select('*').order('created_at', { ascending: true });
    if (data && !error) {
      set({
        aircraft: data.map((row: Record<string, unknown>) => ({
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
        })),
        loadingAircraft: false,
      });
    } else { console.error('Error loading aircraft:', error); set({ loadingAircraft: false }); }
  },

  // Writes go through app/api/aircraft/** now instead of straight to
  // Supabase — that route enforces AIRCRAFT_WRITE_ROLES (admin/super_admin
  // only, per the 2026-08-17 role/tab matrix: instructor/maintenance/
  // operations can all see the fleet but are view-only here). See
  // lib/api-auth.ts.
  addAircraft: async (aircraft) => {
    const res = await fetch('/api/aircraft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(aircraft),
    });
    const result = await res.json().catch(() => ({}));
    if (res.ok) {
      set(state => ({ aircraft: [...state.aircraft, { ...aircraft, id: String(result.aircraft.id) }] }));
    } else {
      console.error('Error adding aircraft:', result.error);
    }
  },

  updateAircraft: async (id, updates) => {
    const res = await fetch(`/api/aircraft/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) set(state => ({ aircraft: state.aircraft.map(a => a.id === id ? { ...a, ...updates } : a) }));
    else console.error('Error updating aircraft:', await res.text());
  },

  removeAircraft: async (id) => {
    const res = await fetch(`/api/aircraft/${id}`, { method: 'DELETE' });
    if (res.ok) set(state => ({ aircraft: state.aircraft.filter(a => a.id !== id) }));
    else console.error('Error removing aircraft:', await res.text());
  },

  getAircraftById: (id) => get().aircraft.find(a => a.id === id),

  // ============================================================
  // 2. STUDENT FUNCTIONS
  // ============================================================
    loadStudents: async () => {
    set({ loadingStudents: true });
    // Routed through /api/students (not a direct Supabase call) so the
    // server can scope the result by role: staff get everyone, a logged-in
    // 'student' only ever gets their own record. See app/api/students/route.ts.
    let data: Record<string, unknown>[] | null = null;
    try {
      const res = await fetch('/api/students');
      if (res.ok) {
        const json = await res.json();
        data = json.students;
      }
    } catch (err) {
      console.error('Error loading students:', err);
    }
    if (data) {
      // Get instructors list for name lookup
      const instructorsList = get().instructors;

      // Enrich students with assigned instructor names
      const enriched = data.map((row: Record<string, unknown>) => {
        const instructorId = row.assigned_instructor_id as string;
        const instructor = instructorId ? instructorsList.find(i => String(i.id) === String(instructorId)) : undefined;
        return {
          id: String(row.id),
          enrollmentId: row.enrollment_id as string,
          name: row.name as string,
          initials: row.initials as string,
          trainingStage: row.training_stage as string,
          totalHours: row.total_hours as number,
          medicalExpiry: row.medical_expiry as string,
          email: (row.email as string) || '',
          phone: (row.phone as string) || '',
          dateOfBirth: (row.date_of_birth as string) || '',
          joinedDate: (row.joined_date as string) || '',
          status: row.status as string,
          firstSoloDate: row.first_solo_date as string || undefined,
          assignedInstructorId: instructorId || undefined,
          assignedInstructorName: instructor?.name || undefined,        // ← LOOKED UP
          assignedInstructorInitials: instructor?.initials || undefined, // ← LOOKED UP
          splNumber: (row.spl_number as string) || undefined,
          splExpiryDate: (row.spl_expiry_date as string) || undefined,
          splIssueDate: (row.spl_issue_date as string) || undefined,
          medicalIssueDate: (row.medical_issue_date as string) || undefined,
        };
      });
      
      set({
        students: enriched,
        loadingStudents: false,
      });
    } else { set({ loadingStudents: false }); }
  },

  addStudent: async (student) => {
    const res = await fetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(student),
    });
    const result = await res.json().catch(() => ({}));
    if (res.ok) {
      const created = result.student;
      set(state => ({ students: [...state.students, { ...student, id: String(created.id) }] }));
      return {
        success: true,
        emailSent: result.emailSent,
        emailMessage: result.emailMessage,
        password: result.password,
      };
    } else {
      console.error('Error adding student:', result.error);
      return { success: false, error: result.error || 'Failed to add student.' };
    }
  },

  updateStudent: async (id, updates) => {
    const res = await fetch(`/api/students/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      set(state => ({ students: state.students.map(s => s.id === id ? { ...s, ...updates } : s) }));
      return true;
    }
    console.error('Error updating student:', await res.text());
    return false;
  },

  removeStudent: async (id) => {
    const res = await fetch(`/api/students/${id}`, { method: 'DELETE' });
    if (res.ok) set(state => ({ students: state.students.filter(s => s.id !== id) }));
    else console.error('Error removing student:', await res.text());
  },

  getStudentById: (id) => get().students.find(s => s.id === id),


  // ============================================================
  // 3. FLIGHT RECORDS / LOGBOOK FUNCTIONS
  // ============================================================
  loadFlightRecords: async () => {
    set({ loadingFlights: true });
    const { data, error } = await supabase.from('flight_records').select('*').order('flight_date', { ascending: false }).limit(100);
    if (data && !error) {
      const students = get().students; const aircraft = get().aircraft; const instructors = get().instructors;
      set({
        flightRecords: data.map((row: Record<string, unknown>) => {
          const student = students.find(s => String(s.id) === String(row.student_id));
          const ac = aircraft.find(a => String(a.id) === String(row.aircraft_id));
          const inst = instructors.find(i => i.id === String(row.instructor_id));
          const calcHours = (): number => {
            if (row.total_hours) return row.total_hours as number;
            return flightHoursFromTimes(row.departure_time as string, row.arrival_time as string);
          };
          return {
            id: String(row.id), studentId: String(row.student_id), aircraftId: String(row.aircraft_id),
            instructorId: String(row.instructor_id), flightDate: row.flight_date as string,
            departureTime: row.departure_time as string, arrivalTime: row.arrival_time as string,
            hobbsStart: row.hobbs_start as number, hobbsEnd: row.hobbs_end as number,
            totalHours: calcHours(), landings: row.landings as number,
            flightType: row.flight_type as string, sortieType: row.sortie_type as string,
            exercise: (row.exercise as string) || undefined,
            maneuvers: row.maneuvers as string, instructorNotes: row.instructor_notes as string,
            studentPerformance: row.student_performance as number, weatherConditions: row.weather_conditions as string,
            studentName: student?.name || 'Unknown', aircraftReg: ac?.registration || 'Unknown', instructorName: inst?.name || 'Unknown',
          };
        }),
        loadingFlights: false,
      });
    } else { console.error('Error loading flight records:', error); set({ loadingFlights: false }); }
  },

  loadStudentFlightRecords: async (studentId: string) => {
    set({ loadingFlights: true });
    const { data, error } = await supabase.from('flight_records').select('*').eq('student_id', studentId).order('flight_date', { ascending: false });
    if (data && !error) {
      const students = get().students; const aircraft = get().aircraft; const instructors = get().instructors;
      set({
        flightRecords: data.map((row: Record<string, unknown>) => {
          const student = students.find(s => String(s.id) === String(row.student_id));
          const ac = aircraft.find(a => String(a.id) === String(row.aircraft_id));
          const inst = instructors.find(i => i.id === String(row.instructor_id));
          const calcHours = (): number => {
            if (row.total_hours) return row.total_hours as number;
            return flightHoursFromTimes(row.departure_time as string, row.arrival_time as string);
          };
          return {
            id: String(row.id), studentId: String(row.student_id), aircraftId: String(row.aircraft_id),
            instructorId: String(row.instructor_id), flightDate: row.flight_date as string,
            departureTime: row.departure_time as string, arrivalTime: row.arrival_time as string,
            hobbsStart: row.hobbs_start as number, hobbsEnd: row.hobbs_end as number,
            totalHours: calcHours(), landings: row.landings as number,
            flightType: row.flight_type as string, sortieType: row.sortie_type as string,
            exercise: (row.exercise as string) || undefined,
            maneuvers: row.maneuvers as string, instructorNotes: row.instructor_notes as string,
            studentPerformance: row.student_performance as number, weatherConditions: row.weather_conditions as string,
            studentName: student?.name || 'Unknown', aircraftReg: ac?.registration || 'Unknown', instructorName: inst?.name || 'Unknown',
          };
        }),
        loadingFlights: false,
      });
    } else { console.error('Error loading student flight records:', error); set({ loadingFlights: false }); }
  },

  // Insert plus every side effect it used to do as separate client-side
  // calls (crediting the student's total hours + first-solo date, advancing
  // the aircraft's hobbs time) now all happen server-side in one request —
  // see app/api/flight-records/route.ts. Gated to FLIGHT_RECORDS_WRITE_ROLES
  // (admin/instructor/super_admin — operations isn't on this tab at all,
  // maintenance is view-only, per the 2026-08-17 role/tab matrix).
  addFlightRecord: async (record) => {
    const res = await fetch('/api/flight-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    const result = await res.json().catch(() => ({}));

    if (!res.ok) {
      // This used to be swallowed by an `if (!error)` guard with no else —
      // the form still called onClose() as if the save worked, so a failed
      // insert (e.g. a check-constraint violation) looked identical to a
      // successful one. Surface the real error so it's visible in the
      // console and can be shown to whoever's using the form.
      console.error('Error adding flight record:', result.error);
      return { success: false, error: result.error || 'Failed to save flight record.' };
    }

    // Reload data to reflect the record itself plus every side effect the
    // API route just performed (student hours/solo date, aircraft hobbs).
    await get().loadAircraft();
    await get().loadStudents();
    await get().loadFlightRecords();

    return { success: true };
  },

  // ============================================================
  // 4. FUEL MANAGEMENT FUNCTIONS
  // ============================================================
  loadFuelRecords: async () => {
    set({ loadingFuel: true });
    const { data, error } = await supabase.from('fuel_records').select('*').order('refueling_date', { ascending: false }).limit(50);
    if (data && !error) {
      const aircraftList = get().aircraft;
      set({
        fuelRecords: data.map((row: Record<string, unknown>) => {
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
        }),
        loadingFuel: false,
      });
    } else { console.error('Error loading fuel records:', error); set({ loadingFuel: false }); }
  },

  // Insert plus the aircraft.current_fuel side effect now happen server-side
  // in one request — see app/api/fuel-records/route.ts. Gated to
  // FUEL_WRITE_ROLES (admin/super_admin/maintenance — instructor/operations
  // can view fuel logs but not add one, per the 2026-08-17 role/tab matrix).
  addFuelRecord: async (record) => {
    const res = await fetch('/api/fuel-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    if (res.ok) {
      await get().loadAircraft();
      await get().loadFuelRecords();
    } else {
      console.error('Error adding fuel record:', await res.text());
    }
  },

  getFuelRecordsForAircraft: (aircraftId) => get().fuelRecords.filter(r => r.aircraftId === aircraftId),

  // ============================================================
  // 5. SCHEDULED FLIGHTS / BOOKING FUNCTIONS
  // ============================================================
  loadScheduledFlights: async () => {
    set({ loadingSchedule: true });
    const { data, error } = await supabase.from('scheduled_flights').select('*').order('start_time', { ascending: true });
    if (data && !error) {
      const aircraftList = get().aircraft; const studentsList = get().students; const instructorsList = get().instructors;
      set({
        scheduledFlights: data.map((row: Record<string, unknown>) => {
          const ac = aircraftList.find(a => String(a.id) === String(row.aircraft_id));
          const student = studentsList.find(s => String(s.id) === String(row.student_id));
          const inst = instructorsList.find(i => i.id === String(row.instructor_id));
          const startTime = new Date(row.start_time as string); const endTime = new Date(row.end_time as string);
          return {
            id: String(row.id), aircraftId: String(row.aircraft_id), instructorId: String(row.instructor_id),
            studentId: row.student_id ? String(row.student_id) : undefined,
            startTime: row.start_time as string, endTime: row.end_time as string,
            sortieType: row.sortie_type as string, status: row.status as string,
            exercise: (row.exercise as string) || '',
            weatherBriefed: row.weather_briefed as boolean, notamBriefed: row.notam_briefed as boolean,
            notes: row.notes as string, aircraftReg: ac?.registration || 'Unknown',
            studentName: student?.name || 'None', instructorName: inst?.name || 'Unknown',
            duration: Math.round((endTime.getTime() - startTime.getTime()) / 360000) / 10,
            logbookPending: !!row.logbook_pending,
            pendingDebrief: (row.pending_debrief as Record<string, unknown> | null) ?? null,
            cancellationReason: (row.cancellation_reason as string | null) ?? null,
          };
        }),
        loadingSchedule: false,
      });
    } else { console.error('Error loading scheduled flights:', error); set({ loadingSchedule: false }); }
  },

  checkConflicts: async (aircraftId, startTime, endTime, excludeId?) => {
    // Buffer is per-aircraft, not a flat constant — and asymmetric: the gap
    // required BEFORE this flight depends on the aircraft's fuel level right
    // now, while the gap required AFTER it depends on the fuel level
    // projected at the end of THIS flight (see getProjectedFuelAfter). Both
    // start from the FTO's configured turnaround gap (Settings ->
    // buffer_minutes), plus a mandatory extra refuel window whenever the
    // relevant fuel level is at or below the low-fuel threshold. See
    // getAircraftBufferMinutes.
    const bufferAircraft = get().aircraft.find(a => String(a.id) === String(aircraftId));
    const turnaroundMin = parseTurnaroundBufferSetting(get().ftoSettings['buffer_minutes']);
    const durationMin = Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000);
    const bufferBeforeMin = getAircraftBufferMinutes(bufferAircraft?.currentFuel, turnaroundMin);
    const projectedFuelAfter = getProjectedFuelAfter(bufferAircraft, durationMin);
    const bufferAfterMin = getAircraftBufferMinutes(projectedFuelAfter, turnaroundMin);
    const bufferedStart = new Date(startTime); bufferedStart.setMinutes(bufferedStart.getMinutes() - bufferBeforeMin);
    const bufferedEnd = new Date(endTime); bufferedEnd.setMinutes(bufferedEnd.getMinutes() + bufferAfterMin);
    let query = supabase.from('scheduled_flights').select('*')
      .eq('aircraft_id', aircraftId)
      .lt('start_time', bufferedEnd.toISOString())
      .gt('end_time', bufferedStart.toISOString())
      // A cancelled flight used to be hard-deleted, so it could never
      // reach this query. Now that cancelFlight() soft-cancels (see
      // below), a cancelled row stays in the table — it must not count
      // as still occupying the aircraft, or every cancellation would
      // permanently and falsely block that time slot forever after.
      .neq('status', 'CANCELLED');
    if (excludeId) query = query.neq('id', excludeId);
    const { data, error } = await query;
    if (error) return { hasConflict: false, conflictingFlights: [] };
    const conflicts = excludeId ? (data || []).filter(f => String(f.id) !== String(excludeId)) : (data || []);
    return {
      hasConflict: conflicts.length > 0,
      conflictingFlights: conflicts.map(row => ({
        id: String(row.id), aircraftId: String(row.aircraft_id), instructorId: String(row.instructor_id),
        startTime: row.start_time as string, endTime: row.end_time as string,
        sortieType: row.sortie_type as string, status: row.status as string,
        weatherBriefed: false, notamBriefed: false, notes: '', exercise: '',
      })),
    };
  },

  bookFlight: async (booking) => {
    const bookingDateStr = new Date(booking.startTime).toLocaleDateString('en-CA');
    const blockReason = getSchedulingBlockReason(bookingDateStr, get().holidays, parseWeeklyOffDays(get().ftoSettings['weekly_off_days']));
    if (blockReason) {
      return { success: false, message: `❌ FTO is closed (${blockReason.label}) — cannot book flights on this date.` };
    }
    const conflict = await get().checkConflicts(booking.aircraftId, booking.startTime, booking.endTime);
    if (conflict.hasConflict) {
      const conflictAircraft = get().aircraft.find(a => String(a.id) === String(booking.aircraftId));
      const turnaroundMin = parseTurnaroundBufferSetting(get().ftoSettings['buffer_minutes']);
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
    // Conflict/holiday/weekly-off checks above stay client-side (scheduling
    // validation, not an authorization boundary — see
    // app/api/scheduled-flights/route.ts's own scope note). The actual
    // insert, and WHO is allowed to create a new booking at all, goes
    // through that route: admin/super_admin/operations always can; an
    // instructor only if their own can_self_book flag is on (Instructors
    // tab, super_admin-grantable) — see requireScheduleCreateAccess() in
    // lib/api-auth.ts.
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
    if (res.ok) { await get().loadScheduledFlights(); return { success: true, message: '✅ Flight booked!' }; }
    const result = await res.json().catch(() => ({}));
    if (res.status === 403) {
      return { success: false, message: `🔒 ${result.error || 'Not authorized to create a new booking.'}` };
    }
    return { success: false, message: '❌ Failed to book flight.' };
  },

  // Soft-cancel — used to be a hard DELETE, which meant a cancelled
  // booking left no trace at all (no count, no reason, nothing the Daily
  // Flying Report could ever total up). Now sets status='CANCELLED' +
  // cancellation_reason and keeps the row. The CANCELLED status is
  // already handled everywhere else that reads scheduledFlights
  // (dashboard widgets, MaintenanceForm's conflict check, checkConflicts
  // above) — this was the one place that never actually produced it.
  // Local state keeps the row (mapped, not filtered out) so consumers
  // that want to show cancelled flights (e.g. a day's full history) can,
  // while every place that means "still active" already excludes
  // CANCELLED explicitly (see ScheduleBoard.tsx, BookingForm.tsx).
  cancelFlight: async (id, reason) => {
    const { error } = await supabase.from('scheduled_flights')
      .update({ status: 'CANCELLED', cancellation_reason: reason ?? null })
      .eq('id', id);
    if (!error) {
      set(state => ({
        scheduledFlights: state.scheduledFlights.map(f =>
          f.id === id ? { ...f, status: 'CANCELLED' } : f
        ),
      }));
    }
  },

  updateScheduledFlight: async (id, updates) => {
    // Secondary safety net — BookingForm's validateDate() is the primary
    // client-side gate for the edit-submit path, but this guards the
    // authoritative store action too in case a new startTime ever reaches
    // it another way. Silently refuses (no partial update) rather than
    // throwing, since this action's return type is void.
    if (updates.startTime !== undefined) {
      const newDateStr = new Date(updates.startTime).toLocaleDateString('en-CA');
      const blockReason = getSchedulingBlockReason(newDateStr, get().holidays, parseWeeklyOffDays(get().ftoSettings['weekly_off_days']));
      if (blockReason) {
        console.error(`❌ Cannot reschedule flight ${id} to ${newDateStr} — FTO is closed (${blockReason.label}).`);
        return;
      }
    }
    const dbUpdates: Record<string, unknown> = {};
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.aircraftId !== undefined) dbUpdates.aircraft_id = updates.aircraftId;
    if (updates.instructorId !== undefined) dbUpdates.instructor_id = updates.instructorId;
    if (updates.studentId !== undefined) dbUpdates.student_id = updates.studentId;
    if (updates.startTime !== undefined) dbUpdates.start_time = updates.startTime;
    if (updates.endTime !== undefined) dbUpdates.end_time = updates.endTime;
    if (updates.sortieType !== undefined) dbUpdates.sortie_type = updates.sortieType;
    if (updates.exercise !== undefined) dbUpdates.exercise = updates.exercise;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
    if (updates.weatherBriefed !== undefined) dbUpdates.weather_briefed = updates.weatherBriefed;
    if (updates.notamBriefed !== undefined) dbUpdates.notam_briefed = updates.notamBriefed;
    if (updates.logbookPending !== undefined) dbUpdates.logbook_pending = updates.logbookPending;
    if (updates.pendingDebrief !== undefined) dbUpdates.pending_debrief = updates.pendingDebrief;
    const { error } = await supabase.from('scheduled_flights').update(dbUpdates).eq('id', id);
    if (!error) {
      set(state => ({
        scheduledFlights: state.scheduledFlights.map(f => f.id === id ? { ...f, ...updates } : f)
      }));
    }
  },

  // ============================================================
  // 6. MAINTENANCE FUNCTIONS
  // ============================================================
  loadMaintenanceRecords: async () => {
    set({ loadingMaintenance: true });
    const { data, error } = await supabase.from('maintenance_records').select('*').order('scheduled_date', { ascending: true });
    if (data && !error) {
      const aircraftList = get().aircraft; const today = new Date(); today.setHours(0, 0, 0, 0);
      const now = new Date();
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
      // applicable) — reload aircraft so the client's own copy of that
      // status reflects it instead of going stale until the next full page load.
      if (updates.status === 'COMPLETED' || updates.status === 'CANCELLED') {
        await get().loadAircraft();
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

  // ============================================================
  // 7. INSTRUCTOR FUNCTIONS
  // ============================================================
  loadInstructors: async () => {
    set({ loadingInstructors: true });
    const { data, error } = await supabase.from('instructors').select('*').order('name', { ascending: true });
    if (data && !error) {
      set({
        instructors: data.map((row: Record<string, unknown>) => ({
          id: String(row.id), name: row.name as string, initials: row.initials as string,
          licenseNumber: row.license_number as string, ratings: row.ratings as string,
          maxDailyHours: row.max_daily_hours as number, email: (row.email as string) || '',
          phone: (row.phone as string) || '', status: row.status as Instructor['status'],
          // Defaults to false if the migration hasn't been run yet in
          // Supabase (add-instructor-self-booking-permission.sql) — column
          // missing/null both read as "can't self-book," the safe side.
          canSelfBook: Boolean(row.can_self_book),
          licenseExpiryDate: (row.license_expiry_date as string) || undefined,
          licenseIssueDate: (row.license_issue_date as string) || undefined,
        })),
        loadingInstructors: false,
      });
    } else { console.error('Error loading instructors:', error); set({ loadingInstructors: false }); }
  },

  // Writes go through app/api/instructors/** now instead of straight to
  // Supabase — gated to INSTRUCTORS_WRITE_ROLES (admin/super_admin only;
  // operations can view the roster, per the 2026-08-17 role/tab matrix —
  // note this roster is separate from an instructor's own "My Students"
  // page, which instructor still has). See lib/api-auth.ts.
  addInstructor: async (instructor) => {
    const res = await fetch('/api/instructors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(instructor),
    });
    const result = await res.json().catch(() => ({}));
    if (res.ok) {
      set(state => ({ instructors: [...state.instructors, { ...instructor, id: String(result.instructor.id) }] }));
    } else {
      console.error('Error adding instructor:', result.error);
    }
  },

  updateInstructor: async (id, updates) => {
    const res = await fetch(`/api/instructors/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) set(state => ({ instructors: state.instructors.map(i => i.id === id ? { ...i, ...updates } : i) }));
    else console.error('Error updating instructor:', await res.text());
  },

  removeInstructor: async (id) => {
    const res = await fetch(`/api/instructors/${id}`, { method: 'DELETE' });
    if (res.ok) set(state => ({ instructors: state.instructors.filter(i => i.id !== id) }));
    else console.error('Error removing instructor:', await res.text());
  },


  //============================================================
   // 3. FLIGHT RECORDS / LOGBOOK FUNCTIONS
  // ============================================================
  assignInstructor: async (studentId, instructorId) => {
  // `|| null` (not `undefined`) so an empty instructorId still reaches the
  // server as an explicit "clear the assignment" — updateStudent only
  // includes a field in the PATCH body when it's !== undefined.
  await get().updateStudent(
    studentId,
    { assignedInstructorId: instructorId || null } as unknown as Partial<StudentRecord>
  );
  await get().loadStudents();
},


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

  // ============================================================
  // 10. AVAILABILITY / LEAVE FUNCTIONS
  // ============================================================
  loadAvailability: async () => {
    set({ loadingAvailability: true });
    const { data, error } = await supabase.from('availability').select('*').order('start_date', { ascending: true });
    if (data && !error) {
      const instructors = get().instructors; const students = get().students;
      set({
        availabilityRecords: data.map((row: Record<string, unknown>) => {
          const person = row.person_type === 'instructor'
            ? instructors.find(i => i.id === String(row.person_id))
            : students.find(s => s.id === String(row.person_id));
          return {
            id: String(row.id), personType: row.person_type as 'instructor' | 'student',
            personId: String(row.person_id), leaveType: row.leave_type as string,
            startDate: row.start_date as string, endDate: row.end_date as string,
            startTime: (row.start_time as string) || undefined, endTime: (row.end_time as string) || undefined,
            reason: row.reason as string, status: row.status as string, createdBy: row.created_by as string,
            personName: person?.name || 'Unknown', personInitials: person?.initials || '??',
          };
        }),
        loadingAvailability: false,
      });
    } else { console.error('Error loading availability:', error); set({ loadingAvailability: false }); }
  },

  addAvailability: async (record) => {
    const { error } = await supabase.from('availability').insert({
      person_type: record.personType, person_id: record.personId, leave_type: record.leaveType,
      start_date: record.startDate, end_date: record.endDate,
      start_time: record.startTime || null, end_time: record.endTime || null,
      reason: record.reason, status: record.status || 'APPROVED', created_by: record.createdBy,
    });
    if (!error) await get().loadAvailability();
  },

  updateAvailability: async (id, updates) => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.leaveType !== undefined) dbUpdates.leave_type = updates.leaveType;
    if (updates.startDate !== undefined) dbUpdates.start_date = updates.startDate;
    if (updates.endDate !== undefined) dbUpdates.end_date = updates.endDate;
    if (updates.reason !== undefined) dbUpdates.reason = updates.reason;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    const { error } = await supabase.from('availability').update(dbUpdates).eq('id', id);
    if (!error) set(state => ({ availabilityRecords: state.availabilityRecords.map(a => a.id === id ? { ...a, ...updates } : a) }));
  },

  removeAvailability: async (id) => {
    const { error } = await supabase.from('availability').delete().eq('id', id);
    if (!error) set(state => ({ availabilityRecords: state.availabilityRecords.filter(a => a.id !== id) }));
  },

  checkAvailability: async (personType: string, personId: string, date: string) => {
    const { data } = await supabase.from('availability').select('*')
      .eq('person_type', personType).eq('person_id', personId)
      .lte('start_date', date).gte('end_date', date).eq('status', 'APPROVED').limit(1);
    return !data || data.length === 0;
  },

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
  getInstructorById: (id) => get().instructors.find(i => i.id === id),
}));
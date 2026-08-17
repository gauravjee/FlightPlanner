// types/index.ts
export interface Aircraft {
  id: string;
  registration: string;
  type: string;
  model: string;
  year: number;
  hobbsTime: number;
  fuelCapacity: number;
  currentFuel: number;
  status: 'ACTIVE' | 'MAINTENANCE' | 'GROUNDED';
  nextMaintenance: string;
  // Average cruise fuel burn (liters/hour) for THIS aircraft, if the FTO has
  // set one — overrides the type-average default from
  // FUEL_BURN_RATE_BY_TYPE_LPH (see lib/store.ts). Optional/undefined means
  // "use the type default".
  fuelBurnRateLph?: number;
}


export interface Student {
  id: string;
  name: string;
  initials: string;
  enrollmentId: string;
  trainingStage: string;
  totalHours: number;
  medicalExpiry: string;
}

export interface FlightSlot {
  id: string;
  aircraftId: string;
  instructorId: string;
  studentId?: string;
  startTime: string;
  endTime: string;
  sortieType: SortieType;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  weatherBriefed: boolean;
  notamBriefed: boolean;
}

export type SortieType = 
  | 'CIRCUIT_SOLO'
  | 'CIRCUIT_DUAL'
  | 'NAVIGATION'
  | 'INSTRUMENT'
  | 'STALL_RECOVERY'
  | 'EMERGENCY_PROCEDURES'
  | 'CHECK_RIDE'
  | 'CROSS_COUNTRY'
  | 'NIGHT_FLIGHT'
  | 'SOLO_CONSOLIDATION';

export interface WeatherData {
  metar: string;
  taf: string;
  temperature: number;
  windDirection: number;
  windSpeed: number;
  visibility: number;
  ceiling: number;
  qnh: number;
  flightRules: string;
  warnings: string[];
}

// NOTAM from FAA API via our proxy
export interface NOTAM {
  id: string;
  notamNumber: string;          // The NOTAM identification number
  airportCode: string;
  text: string;                 // Full NOTAM text
  priority: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  category: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

export interface FuelRecord {
  id: string;
  aircraftId: string;
  refuelingDate: string;
  fuelAddedLiters: number;
  fuelCostPerLiter: number;
  totalCost: number;
  fuelLevelBefore: number;
  fuelLevelAfter: number;
  fuelType: string;
  refueledBy: string;
  notes: string;
  aircraftReg?: string;
  aircraftType?: string;
}

export interface FuelStats {
  totalFuelAdded: number;
  totalCost: number;
  averageCostPerLiter: number;
  recordCount: number;
}

// Fuel record 
export interface FuelRecord {
  id: string;
  aircraftId: string;
  refuelingDate: string;
  fuelAddedLiters: number;
  fuelCostPerLiter: number;
  totalCost: number;
  fuelLevelBefore: number;
  fuelLevelAfter: number;
  fuelType: string;
  refueledBy: string;
  notes: string;
  aircraftReg?: string;
  aircraftType?: string;
}

// Flight record for digital logbook
export interface FlightRecord {
  id: string;
  studentId: string;
  aircraftId: string;
  instructorId: string;
  flightDate: string;
  departureTime: string;
  arrivalTime: string;
  hobbsStart: number;
  hobbsEnd: number;
  totalHours: number;
  landings: number;
  flightType: string;
  sortieType: string;
  exercise?: string;
  maneuvers: string;
  instructorNotes: string;
  studentPerformance: number;
  weatherConditions: string;
  studentName?: string;
  aircraftReg?: string;
  instructorName?: string;
}

// Scheduled flight for booking system
export interface ScheduledFlight {
  id: string;
  aircraftId: string;
  instructorId: string;
  studentId?: string;
  startTime: string;
  endTime: string;
  sortieType: string;
  status: string;
  exercise?: string;  
  weatherBriefed: boolean;
  notamBriefed: boolean;
  notes: string;
  // Set true when a Debrief was completed with "auto-create logbook entry"
  // unchecked — the flight is COMPLETED and aircraft state (fuel/Hobbs) was
  // already updated, but no flight_records row exists yet and the
  // student's hours/first-solo-date haven't been credited. Surfaced as a
  // "Logbook Pending" badge (FlightDetailModal) and a resolvable list on
  // the Flights page, which flips this back to false once a matching
  // flight record is logged. See DebriefForm.tsx / FlightRecordForm.tsx.
  logbookPending?: boolean;
  // The debrief data captured at check-out time (hobbs/fuel/landings/
  // maneuvers/notes/performance/weather) when logbookPending was set —
  // kept so the eventual Log Flight entry can be pre-filled instead of
  // re-entered from scratch. null/undefined once resolved or if the
  // flight was never left pending.
  pendingDebrief?: Record<string, unknown> | null;
  // Display fields (looked up)
  aircraftReg?: string;
  studentName?: string;
  instructorName?: string;
  duration?: number;
}

// Conflict check result
export interface TimeConflict {
  hasConflict: boolean;
  conflictingFlights: ScheduledFlight[];
}

// Maintenance record for tracking aircraft maintenance
export interface MaintenanceRecord {
  id: string;
  aircraftId: string;
  maintenanceType: string;
  description: string;
  scheduledDate: string;
  completedDate: string | null;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  cost: number;
  performedBy: string;
  notes: string;
  // Optional precise maintenance window (ISO timestamps, may span multiple
  // days — e.g. a 3-day propeller overhaul). scheduledDate above is left
  // untouched for the existing list/overdue-by-day display; these are what
  // the schedule board actually blocks against when present.
  //   Both null            -> legacy/simple: blocks the whole scheduledDate day.
  //   Start set, end null  -> open-ended (emergency / in-progress, finish
  //                           time not known yet) — blocks from start onward
  //                           indefinitely until completed or an end is set.
  //   Both set             -> blocks exactly that window, across as many
  //                           days as it spans.
  maintenanceStart?: string | null;  // ISO timestamp
  maintenanceEnd?: string | null;    // ISO timestamp
  // Display fields (looked up from aircraft table)
  aircraftReg?: string;
  aircraftType?: string;
  // Calculated fields
  isOverdue?: boolean;
  daysUntilDue?: number;
}

// Instructor record from database
export interface Instructor {
  id: string;
  name: string;
  initials: string;
  licenseNumber: string;
  ratings: string;        // Comma-separated from DB (e.g., "CFI, CFII, MEI")
  maxDailyHours: number;
  email: string;
  phone: string;
  status: 'AVAILABLE' | 'FLYING' | 'OFF_DUTY';
}

// Weather data from AVWX API
export interface WeatherData {
  metar: string;           // Raw METAR string
  taf: string;             // Raw TAF string
  temperature: number;     // Celsius
  windDirection: number;   // Degrees
  windSpeed: number;       // Knots
  visibility: number;      // Meters
  ceiling: number;         // Feet (lowest cloud base)
  qnh: number;             // hPa
  flightRules: string;     // VFR, MVFR, IFR, LIFR
  warnings: string[];      // Weather warnings
  dewpoint: number;        // Celsius
  altimeter: number;       // inHg
  time: string;            // Observation time
  station: string;         // ICAO station code
  isLoading: boolean;      // Loading state
  error: string | null;    // Error message if API fails
}

// General (non-aviation) weather for a school's configured lat/long,
// used only when there's no ICAO/reference station configured to source
// real METAR/TAF from. Deliberately a separate shape from WeatherData:
// there is no METAR/TAF or official VFR/MVFR/IFR flight-category rating
// for an arbitrary coordinate, so this must never be presented as if it
// were aviation weather.
export interface GeneralWeatherData {
  temperature: number;      // Celsius
  dewpoint: number;         // Celsius
  windDirection: number;    // Degrees
  windSpeed: number;        // Knots (converted from the source API's km/h)
  pressure: number;         // hPa, surface pressure (NOT an altimeter/QNH setting)
  cloudCover: number;       // Percent
  conditionText: string;    // Human-readable description derived from a WMO weather code
  time: string;             // Observation time (ISO)
  isLoading: boolean;
  error: string | null;
}

// Student record from database
export interface StudentRecord {
  id: string;
  enrollmentId: string;
  name: string;
  initials: string;
  trainingStage: string;
  totalHours: number;
  medicalExpiry: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  joinedDate?: string;
  status: string;
  firstSoloDate?: string;   // Date of first solo flight (for celebration)
  assignedInstructorId?: string;       // UUID of assigned instructor
  assignedInstructorName?: string;     // Display name (looked up)
  assignedInstructorInitials?: string; // Display initials (looked up)
}

// Availability / Leave record
export interface AvailabilityRecord {
  id: string;
  personType: 'instructor' | 'student';
  personId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  reason: string;
  status: string;
  createdBy: string;
  personName?: string;      // For display
  personInitials?: string;  // For display
}

// Training requirement checklist item
// (Previously declared twice — TS interface merging made the second,
// more complete declaration effectively win at compile time, but that
// was unintentional duplication rather than a deliberate split; merged
// into one canonical declaration.)
export interface TrainingRequirement {
  id: string;
  studentId: string;
  requirementName: string;
  requirementCategory: string;
  isCompleted: boolean;
  completedDate?: string;
  completedBy?: string;
  notes?: string;
  sortOrder: number;
  validityYears?: number;
  requiredBeforeHours?: number;
  blocksSolo?: boolean;
  blocksAllFlights?: boolean;
  programCode?: string;
}

// Ground school subject
export interface GroundSchoolSubject {
  id: string;
  subjectName: string;
  subjectCode: string;
  validityYears?: number;
  requiredBeforeHours?: number;
  isMandatory: boolean;
  sortOrder: number;
  isActive: boolean;
}

// Ground school class
export interface GroundSchoolClass {
  id: string;
  subjectId: string;
  instructorId: string;
  classDate: string;
  startTime?: string;
  endTime?: string;
  topic: string;
  notes: string;
  status: string;
  subjectName?: string;
  instructorName?: string;
  enrolledCount?: number;
}

// Holiday / blackout date — flight bookings and ground-school classes
// cannot be scheduled on these dates (see findHolidayForDate in
// lib/store.ts, used by BookingForm, ScheduleBoard, and
// GroundSchoolCalendar). A holiday is either:
//   - a one-time date (isRecurring: false) — matched by the exact
//     'YYYY-MM-DD' value, or
//   - a recurring annual holiday (isRecurring: true) — matched by
//     month/day only, so e.g. a national holiday entered once continues
//     to block that same calendar date every future year without needing
//     to be re-added. The year portion of `date` for a recurring holiday
//     is just where it was first entered; it's ignored for matching.
export interface Holiday {
  id: string;
  holidayName: string;
  date: string;          // 'YYYY-MM-DD'
  isRecurring: boolean;
  notes?: string;
}

// Student enrollment
export interface GroundSchoolEnrollment {
  id: string;
  classId: string;
  studentId: string;
  attendanceStatus: string;
  examDate?: string;
  examScore?: number;
  examResult?: string;
  attempts: number;
  examiner: string;
  notes: string;
  studentName?: string;
  studentInitials?: string;
}
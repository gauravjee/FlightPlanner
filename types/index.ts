// types/index.ts
export interface Aircraft {
  id: string;
  registration: string;
  // 2026-08-19: engine category — 'Single Engine' | 'Multi Engine'. Used to
  // be a hardcoded specific-model code (e.g. 'C172S', 'PA44') until that
  // was found to be conflating "which airframe" with "engine count", which
  // blocked auto-totaling CPL's Multi Engine Hours requirement from real
  // flight records the same way Solo/Cross-Country/Instrument/Night
  // already do. The specific model now lives in `model` below. See
  // restructure-aircraft-type-model.sql and lib/flight-classification.ts's
  // isMultiEngineFlight().
  type: string;
  // Specific model/variant, e.g. "Cessna 172", "Piper PA-34 Seneca". 2026-08-26:
  // now offered as a dropdown sourced from distinct
  // aircraft_maintenance_schedule_templates.aircraft_model values, with an
  // "Other" free-text fallback for models with no maintenance template yet
  // — see AircraftFormModal.tsx / AircraftSetupTab.tsx. Selecting a
  // templated model is what makes maintenance-due tracking (Phase 1) work
  // for that aircraft; free-text "Other" entries just display, same as
  // before.
  model: string;
  year: number;
  hobbsTime: number;
  fuelCapacity: number;
  currentFuel: number;
  status: 'ACTIVE' | 'MAINTENANCE' | 'GROUNDED';
  nextMaintenance: string;
  // Average cruise fuel burn (liters/hour) for THIS aircraft, if the FTO has
  // set one — overrides the engine-category default from
  // FUEL_BURN_RATE_BY_TYPE_LPH (see lib/store.ts). Optional/undefined means
  // "use the type default".
  fuelBurnRateLph?: number;
  // 2026-08-19: true if this row represents a flight simulator/training
  // device rather than a real aircraft. Any flight logged against it
  // counts toward a student's Simulator Hours — see
  // isSimulatorFlight() in lib/flight-classification.ts.
  isSimulator?: boolean;
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
  // Nullable because real NOTAMs often carry no usable time: a permanent
  // NOTAM's item C) is 'PERM', not a timestamp (35 of VOBL's 101 live NOTAMs
  // on 2026-09-05). Substituting "now" for those — the old behaviour — made a
  // third of the list look expired. null means "no expiry stated"; render it
  // as PERM/— rather than as a date.
  startTime: string | null;
  endTime: string | null;
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
  // Why this booking was cancelled — 'WEATHER' | 'MAINTENANCE' | 'OTHER',
  // set by cancelFlight() (lib/store.ts). null/undefined for a flight
  // that isn't cancelled, or was cancelled before this field existed.
  // Feeds the Daily Flying Report's cancellation-by-reason counts.
  cancellationReason?: string | null;
  // Display fields (looked up)
  aircraftReg?: string;
  studentName?: string;
  instructorName?: string;
  duration?: number;
}

// Safety incident — started as a minimal log (2026-08-18), not the full
// DGCA-format Incident Report (a separate, larger, not-yet-built report).
// 2026-08-31: extended into a workflow — a 5x5 ICAO Doc 9859 risk matrix,
// corrective-action tracking, and an open/in-progress/closed status — per
// explicit user decision. See add-safety-incident-workflow.sql and
// app/api/safety-incidents/[id]/route.ts.
export interface SafetyIncident {
  id: string;
  incidentDate: string;   // 'YYYY-MM-DD'
  incidentTime?: string;  // free-text, e.g. '14:30' — not enforced HH:MM
  aircraftId?: string;
  aircraftReg?: string;
  studentId?: string;
  studentName?: string;
  instructorId?: string;
  instructorName?: string;
  description: string;
  severity: 'MINOR' | 'MAJOR' | 'CRITICAL';
  reportedBy?: string;
  createdAt?: string;
  // ICAO Doc 9859 5x5 risk matrix — both undefined/null until a manager
  // triages the incident (see INCIDENT_MANAGE_ROLES).
  riskSeverity?: number | null;    // 1-5
  riskLikelihood?: number | null;  // 1-5
  riskScore?: number | null;       // riskSeverity * riskLikelihood, 1-25
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  correctiveAction?: string | null;
  assignedTo?: string | null;
  closedBy?: string | null;
  closedAt?: string | null;
  // 2026-08-31 enhancement — see SAFETY_INCIDENT_CATEGORIES/
  // INCIDENT_RESOLVE_ROLES in lib/permissions.ts.
  incidentNumber?: string | null;  // 'INC-2026-001', assigned on report
  category?: string;               // one of SAFETY_INCIDENT_CATEGORIES
  resolutionNote?: string | null;  // set by Maintenance's narrow resolve action
  resolvedBy?: string | null;
  resolvedAt?: string | null;
}

// Breath Analyser (BA) test — one row per person tested, per the FTO's
// prescribed register format (CAR Section 5, Series F, Part III). The
// Reports page's "Breath Analyser Register" card. See
// app/api/ba-tests/route.ts and add-ba-test-and-license-numbers.sql.
// person/licenseNumber are denormalized at entry time (same convention as
// SafetyIncident's studentId/studentName pair above) — a later edit to
// someone's profile doesn't rewrite a past BA test record.
export interface BATest {
  id: string;
  testDate: string;        // 'YYYY-MM-DD'
  aircraftId?: string;
  aircraftReg?: string;
  safetyOfficerId?: string;
  safetyOfficerName: string;
  personType: 'STUDENT' | 'INSTRUCTOR';
  personId?: string;
  personName: string;
  licenseNumber?: string;  // SPL No (student) or CPL No (instructor)
  reportingTime?: string;  // free-text, e.g. '06:30' — not enforced HH:MM
  baTime?: string;
  baPercentage?: number;
  baEquipment?: string;
  recordedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

// One row of the Daily Flying Report's flight table — a flattened,
// report-shaped view of a completed/scheduled flight for one day, not the
// same shape as FlightRecord/ScheduledFlight (this is what actually gets
// frozen into daily_flying_reports.rows once generated).
export interface DailyFlyingReportRow {
  aircraft: string;
  student: string;
  instructor: string;
  sortie: string;
  start: string;
  end: string;
  hours: number;
  type: 'DUAL' | 'SOLO' | string;
  exercise: string;
  remarks: string;
}

export interface DailyFlyingReportStats {
  totalAircraftHours: number;
  totalStudentHours: number;
  totalInstructorHours: number;
  dualHours: number;
  soloHours: number;
  crossCountryHours: number;
  nightHours: number;
  aircraftGrounded: number;
  flightsCancelled: number;
  weatherCancellations: number;
  maintenanceCancellations: number;
  otherCancellations: number;
  safetyIncidents: number;
}

// A saved Daily Flying Report snapshot (daily_flying_reports table) — see
// add-reports-module.sql for why this is stored rather than always
// recomputed live.
export interface DailyFlyingReport {
  id: string;
  reportDate: string;
  airportCode?: string;
  rows: DailyFlyingReportRow[];
  stats: DailyFlyingReportStats;
  remarks: string;
  generatedBy?: string;
  generatedAt: string;
  updatedAt?: string;
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
  // 2026-08-26: aircraft hobbs reading at the time this record was
  // completed, or (for a baseline row entered when enabling schedule
  // tracking on an aircraft) the hobbs reading at the last known service.
  // Anchors future HOBBS_HOURS due-calculations — see
  // computeMaintenanceDueItems() in lib/hooks/useMaintenanceRecords.ts.
  // Undefined/null on records that predate this feature or on
  // CALENDAR_MONTHS-only items.
  hobbsAtCompletion?: number | null;
  // 2026-08-31: pilot-facing squawk reporting — see
  // add-squawk-reporting.sql and app/api/maintenance-records/route.ts.
  // reportedBy is the pilot who filed it (denormalized name/email, null
  // for ordinary staff-logged records); isSquawk marks it as such for
  // badging/filtering separately from routine maintenance.
  reportedBy?: string | null;
  isSquawk?: boolean;
  // 2026-09-05: DGCA maintenance log fields (item 42) — see
  // add-dgca-maintenance-log-fields.sql. Only meaningful on a COMPLETED
  // record: they describe the work as certified, not the work as planned.
  // Airframe hours deliberately reuse hobbsAtCompletion above rather than
  // adding a second hours field.
  partsUsed?: string | null;
  // True for a synthetic "Set Baseline" row (Maintenance Due panel) that
  // exists only to anchor an item's due clock — no work was performed and
  // nobody certified anything, so it is EXCLUDED from the DGCA Maintenance
  // Log report. A structural marker, deliberately not a description-string
  // match — see add-dgca-maintenance-log-fields.sql.
  isBaseline?: boolean;
  ameName?: string | null;
  ameLicenseNo?: string | null;
  crsReference?: string | null;
  // 2026-09-03: year-scoped ticket number assigned on insert — RMT-<year>-NNN
  // for a staff-logged record, IMT-<year>-NNN for a pilot-filed squawk
  // (isSquawk). See add-maintenance-ticket-numbering.sql and
  // nextTicketNumber() in app/api/maintenance-records/route.ts. Null on
  // records that predate this feature.
  ticketNumber?: string | null;
  // Display fields (looked up from aircraft table)
  aircraftReg?: string;
  aircraftType?: string;
  // Calculated fields
  isOverdue?: boolean;
  daysUntilDue?: number;
}

// 2026-08-26: Aircraft Maintenance Schedule — Phase 1 (warnings + staff-
// confirmed record creation only; see add-aircraft-maintenance-schedule.sql
// and the handoff doc's "Aircraft Maintenance Schedule" section for full
// design/scope, including the deliberately-deferred Phase 2 hard-block).
export interface MaintenanceScheduleTemplate {
  id: number;
  aircraftModel: string;
  itemName: string;
  intervalType: 'HOBBS_HOURS' | 'CALENDAR_MONTHS';
  intervalValue: number;
  notes: string | null;
  isActive: boolean;
  // 2026-08-27: which Aircraft Type ('Single Engine' | 'Multi Engine') this
  // model belongs to — see add-schedule-template-engine-type.sql. Null for
  // a model that predates this column and hasn't been set yet; treated as
  // "unknown, don't filter" by the Model dropdown.
  engineType: string | null;
}

// Computed (not stored) — one per active template item applicable to a
// given aircraft, produced by computeMaintenanceDueItems() in
// lib/hooks/useMaintenanceRecords.ts.
export interface MaintenanceDueItem {
  template: MaintenanceScheduleTemplate;
  aircraftId: string;
  // Latest known baseline for this item: either the most recent COMPLETED
  // maintenance_records row referencing it, or a manually-entered baseline
  // row if the aircraft has no history yet. Null if neither exists — i.e.
  // schedule tracking has not been enabled/baselined for this item yet.
  lastHobbs: number | null;
  lastDate: string | null;
  // HOBBS_HOURS: lastHobbs + intervalValue. CALENDAR_MONTHS: lastDate +
  // intervalValue months. Null if no baseline is set yet.
  dueAtHobbs: number | null;
  dueAtDate: string | null;
  status: 'NO_BASELINE' | 'OK' | 'DUE_SOON' | 'OVERDUE';
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
  // Whether this instructor can create their own new Schedule bookings —
  // false by default, granted per instructor by a super_admin (Instructors
  // tab). See add-instructor-self-booking-permission.sql and
  // requireScheduleCreateAccess() in lib/api-auth.ts. Doesn't affect
  // viewing the Schedule or editing/debriefing/cancelling flights already
  // assigned to them.
  canSelfBook?: boolean;
  // CPL (Commercial Pilot License) expiry date (2026-08-20) — paired with
  // licenseNumber above. Nullable: not every instructor record has this
  // filled in yet. See add-license-expiry-dates.sql.
  licenseExpiryDate?: string;
  // CPL issue date (2026-08-20, second round) — paired with licenseNumber
  // above, alongside licenseExpiryDate. Nullable, same reasoning. See
  // add-license-issue-dates.sql.
  licenseIssueDate?: string;
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
  // Student Pilot License number (2026-08-20) — shown as the "License
  // Number" on the Breath Analyser Register when this student is the
  // person tested. See add-ba-test-and-license-numbers.sql.
  splNumber?: string;
  // SPL expiry date (2026-08-20) — paired with splNumber above. See
  // add-license-expiry-dates.sql.
  splExpiryDate?: string;
  // SPL issue date (2026-08-20, second round) — paired with splNumber
  // above, alongside splExpiryDate. See add-license-issue-dates.sql.
  splIssueDate?: string;
  // Medical (DGCA Class 1) certificate issue date (2026-08-25) — paired
  // with medicalExpiry above. Used to auto-calculate medicalExpiry: 12
  // months from issue if the student was under 40 on the issue date, 6
  // months if 40 or older, minus 1 day (validity is inclusive of the
  // issue date — same convention as splExpiryDate/licenseExpiryDate). See
  // add-medical-issue-date.sql.
  medicalIssueDate?: string;
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
  // 2026-08-19: which training_requirement_templates row this was
  // provisioned from, if any — see split-training-requirement-templates.sql.
  // Undefined for rows added directly to a student with no template.
  templateId?: string;
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
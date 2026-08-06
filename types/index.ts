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
}

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
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

export interface Instructor {
  id: string;
  name: string;
  initials: string;
  licenseNumber: string;
  ratings: string[];
  maxDailyHours: number;
  status: 'AVAILABLE' | 'FLYING' | 'OFF_DUTY';
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

export interface NOTAM {
  id: string;
  number: string;
  text: string;
  startTime: string;
  endTime: string;
  priority: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  category: string;
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
  ratings: string;
  maxDailyHours: number;
  email: string;
  phone: string;
  status: 'AVAILABLE' | 'FLYING' | 'OFF_DUTY';
}
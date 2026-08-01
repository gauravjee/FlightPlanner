// ============================================================
// lib/store.ts - CENTRAL STATE MANAGEMENT (ZUSTAND STORE)
// ============================================================
// This file is the brain of the FlightPro application. It:
// 1. Stores ALL application data (8 modules) from Supabase
// 2. Provides full CRUD functions for each module
// 3. Manages UI state (selected items, loading indicators, hover)
// 4. Maps database columns (snake_case) to TypeScript (camelCase)
// 5. Handles conflict detection for flight scheduling
// 6. Calculates derived values (overdue, costs, flight hours)
// 7. Fetches REAL weather data from AVWX API
//
// MODULES (all from Supabase):
//   1. Aircraft Fleet      - Registration, type, fuel, status, maintenance dates
//   2. Student Records     - Enrollment, training stage, medical expiry, hours
//   3. Flight Records      - Digital logbook with maneuvers and performance
//   4. Fuel Management     - Refueling log with cost tracking
//   5. Schedule/Booking    - Flight slot booking with time conflict detection
//   6. Maintenance         - Scheduled/completed records with overdue alerts
//   7. Instructors         - Name, license, ratings, daily hour limits
//   8. Weather             - LIVE METAR/TAF from AVWX API (with fallback)
//
// HOW TO USE IN COMPONENTS:
//   import { useFlightStore } from '@/lib/store';
//   const { aircraft, loadAircraft, fetchWeather } = useFlightStore();
// ============================================================

'use client';

import { create } from 'zustand';
import { 
  Aircraft, Instructor, StudentRecord, FlightSlot, 
  WeatherData, NOTAM, FuelRecord, FlightRecord, 
  ScheduledFlight, TimeConflict, MaintenanceRecord 
} from '@/types';
import { generateSchedule, notamData } from './data';
import { supabase } from './supabase';

// ============================================================
// TYPE DEFINITION
// ============================================================
interface FlightStore {
  // Data Collections (from Supabase)
  aircraft: Aircraft[];
  students: StudentRecord[];
  flightRecords: FlightRecord[];
  fuelRecords: FuelRecord[];
  scheduledFlights: ScheduledFlight[];
  maintenanceRecords: MaintenanceRecord[];
  instructors: Instructor[];
  
  // Live Data
  weather: WeatherData;      // LIVE weather from AVWX API (with fallback)
  notams: NOTAM[];           // Active NOTAMs (mock for now)
  schedule: FlightSlot[];    // Today's schedule (generated)
  
  // UI State
  selectedSlot: FlightSlot | null;
  hoveredSlot: string | null;
  loadingAircraft: boolean;
  loadingStudents: boolean;
  loadingFlights: boolean;
  loadingFuel: boolean;
  loadingSchedule: boolean;
  loadingMaintenance: boolean;
  loadingInstructors: boolean;
  
  // Aircraft Actions
  loadAircraft: () => Promise<void>;
  addAircraft: (aircraft: Omit<Aircraft, 'id'>) => Promise<void>;
  updateAircraft: (id: string, updates: Partial<Aircraft>) => Promise<void>;
  removeAircraft: (id: string) => Promise<void>;
  getAircraftById: (id: string) => Aircraft | undefined;
  getSlotsForAircraft: (aircraftId: string) => FlightSlot[];
  
  // Student Actions
  loadStudents: () => Promise<void>;
  addStudent: (student: Omit<StudentRecord, 'id'>) => Promise<void>;
  updateStudent: (id: string, updates: Partial<StudentRecord>) => Promise<void>;
  removeStudent: (id: string) => Promise<void>;
  getStudentById: (id: string) => StudentRecord | undefined;
  
  // Flight Record Actions
  loadFlightRecords: () => Promise<void>;
  loadStudentFlightRecords: (studentId: string) => Promise<void>;
  addFlightRecord: (record: Omit<FlightRecord, 'id' | 'studentName' | 'aircraftReg' | 'instructorName'>) => Promise<void>;
  
  // Fuel Actions
  loadFuelRecords: () => Promise<void>;
  addFuelRecord: (record: Omit<FuelRecord, 'id' | 'totalCost' | 'aircraftReg' | 'aircraftType'>) => Promise<void>;
  getFuelRecordsForAircraft: (aircraftId: string) => FuelRecord[];
  
  // Schedule/Booking Actions
  loadScheduledFlights: () => Promise<void>;
  bookFlight: (booking: Omit<ScheduledFlight, 'id' | 'aircraftReg' | 'studentName' | 'instructorName' | 'duration'>) => Promise<{success: boolean; message: string}>;
  checkConflicts: (aircraftId: string, startTime: string, endTime: string, excludeId?: string) => Promise<TimeConflict>;
  cancelFlight: (id: string) => Promise<void>;
  
  // Maintenance Actions
  loadMaintenanceRecords: () => Promise<void>;
  addMaintenanceRecord: (record: Omit<MaintenanceRecord, 'id' | 'aircraftReg' | 'aircraftType' | 'isOverdue' | 'daysUntilDue'>) => Promise<void>;
  updateMaintenanceRecord: (id: string, updates: Partial<MaintenanceRecord>) => Promise<void>;
  removeMaintenanceRecord: (id: string) => Promise<void>;
  getMaintenanceForAircraft: (aircraftId: string) => MaintenanceRecord[];
  
  // Instructor Actions
  loadInstructors: () => Promise<void>;
  addInstructor: (instructor: Omit<Instructor, 'id'>) => Promise<void>;
  updateInstructor: (id: string, updates: Partial<Instructor>) => Promise<void>;
  removeInstructor: (id: string) => Promise<void>;
  
  // Weather Actions
  fetchWeather: (station?: string) => Promise<void>;  // Fetch LIVE weather from AVWX API
  
  // UI Actions
  setSelectedSlot: (slot: FlightSlot | null) => void;
  setHoveredSlot: (id: string | null) => void;
  getInstructorById: (id: string) => Instructor | undefined;
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
  
  // Weather starts as loading - will be replaced by live API data
  weather: {
    metar: 'Loading weather data...',
    taf: 'Loading forecast...',
    temperature: 0,
    dewpoint: 0,
    windDirection: 0,
    windSpeed: 0,
    visibility: 0,
    ceiling: 0,
    qnh: 0,
    altimeter: 0,
    flightRules: 'VFR',
    warnings: [],
    time: '',
    station: 'VOBL',
    isLoading: true,
    error: null,
  },
  
  notams: notamData,
  schedule: generateSchedule(),
  
  selectedSlot: null,
  hoveredSlot: null,
  loadingAircraft: false,
  loadingStudents: false,
  loadingFlights: false,
  loadingFuel: false,
  loadingSchedule: false,
  loadingMaintenance: false,
  loadingInstructors: false,
  
  // ============================================================
  // 1. AIRCRAFT FUNCTIONS
  // ============================================================
  
  /**
   * Load all aircraft from Supabase
   * Maps: hobbs_time→hobbsTime, fuel_capacity→fuelCapacity, current_fuel→currentFuel
   */
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
        })),
        loadingAircraft: false,
      });
    } else {
      console.error('Error loading aircraft:', error);
      set({ loadingAircraft: false });
    }
  },
  
  /**
   * Add new aircraft to Supabase and local state
   */
  addAircraft: async (aircraft) => {
    const { data, error } = await supabase.from('aircraft').insert({
      registration: aircraft.registration, type: aircraft.type, model: aircraft.model,
      year: aircraft.year, hobbs_time: aircraft.hobbsTime, fuel_capacity: aircraft.fuelCapacity,
      current_fuel: aircraft.currentFuel, status: aircraft.status, next_maintenance: aircraft.nextMaintenance,
    }).select().single();
    if (data && !error) {
      set(state => ({ aircraft: [...state.aircraft, { ...aircraft, id: String(data.id) }] }));
    }
  },
  
  /**
   * Update aircraft - only sends changed fields to database
   */
  updateAircraft: async (id, updates) => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.registration !== undefined) dbUpdates.registration = updates.registration;
    if (updates.type !== undefined) dbUpdates.type = updates.type;
    if (updates.model !== undefined) dbUpdates.model = updates.model;
    if (updates.year !== undefined) dbUpdates.year = updates.year;
    if (updates.hobbsTime !== undefined) dbUpdates.hobbs_time = updates.hobbsTime;
    if (updates.fuelCapacity !== undefined) dbUpdates.fuel_capacity = updates.fuelCapacity;
    if (updates.currentFuel !== undefined) dbUpdates.current_fuel = updates.currentFuel;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.nextMaintenance !== undefined) dbUpdates.next_maintenance = updates.nextMaintenance;
    const { error } = await supabase.from('aircraft').update(dbUpdates).eq('id', id);
    if (!error) {
      set(state => ({ aircraft: state.aircraft.map(a => a.id === id ? { ...a, ...updates } : a) }));
    }
  },
  
  /**
   * Delete aircraft from Supabase and local state
   */
  removeAircraft: async (id) => {
    const { error } = await supabase.from('aircraft').delete().eq('id', id);
    if (!error) set(state => ({ aircraft: state.aircraft.filter(a => a.id !== id) }));
  },
  
  getAircraftById: (id) => get().aircraft.find(a => a.id === id),
  getSlotsForAircraft: (aircraftId) => get().schedule.filter(s => s.aircraftId === aircraftId),
  
  // ============================================================
  // 2. STUDENT FUNCTIONS
  // ============================================================
  
  /**
   * Load all students from Supabase
   */
  loadStudents: async () => {
    set({ loadingStudents: true });
    const { data, error } = await supabase.from('students').select('*').order('created_at', { ascending: true });
    if (data && !error) {
      set({
        students: data.map((row: Record<string, unknown>) => ({
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
        })),
        loadingStudents: false,
      });
    } else {
      console.error('Error loading students:', error);
      set({ loadingStudents: false });
    }
  },
  
  /**
   * Add new student to Supabase
   */
  addStudent: async (student) => {
    const { data, error } = await supabase.from('students').insert({
      enrollment_id: student.enrollmentId, name: student.name, initials: student.initials,
      training_stage: student.trainingStage, total_hours: student.totalHours,
      medical_expiry: student.medicalExpiry, email: student.email, phone: student.phone,
      date_of_birth: student.dateOfBirth, joined_date: student.joinedDate, status: student.status,
    }).select().single();
    if (data && !error) {
      set(state => ({ students: [...state.students, { ...student, id: String(data.id) }] }));
    }
  },
  
  /**
   * Update student - only sends changed fields
   */
  updateStudent: async (id, updates) => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.initials !== undefined) dbUpdates.initials = updates.initials;
    if (updates.trainingStage !== undefined) dbUpdates.training_stage = updates.trainingStage;
    if (updates.totalHours !== undefined) dbUpdates.total_hours = updates.totalHours;
    if (updates.medicalExpiry !== undefined) dbUpdates.medical_expiry = updates.medicalExpiry;
    if (updates.email !== undefined) dbUpdates.email = updates.email;
    if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    const { error } = await supabase.from('students').update(dbUpdates).eq('id', id);
    if (!error) {
      set(state => ({ students: state.students.map(s => s.id === id ? { ...s, ...updates } : s) }));
    }
  },
  
  /**
   * Delete student from Supabase
   */
  removeStudent: async (id) => {
    const { error } = await supabase.from('students').delete().eq('id', id);
    if (!error) set(state => ({ students: state.students.filter(s => s.id !== id) }));
  },
  
  getStudentById: (id) => get().students.find(s => s.id === id),
  
  // ============================================================
  // 3. FLIGHT RECORDS / LOGBOOK FUNCTIONS
  // ============================================================
  
  /**
   * Load all flight records with student/aircraft/instructor names
   * Calculates total hours from departure/arrival times if not stored
   */
  loadFlightRecords: async () => {
    set({ loadingFlights: true });
    const { data, error } = await supabase.from('flight_records').select('*').order('flight_date', { ascending: false }).limit(100);
    if (data && !error) {
      const students = get().students;
      const aircraft = get().aircraft;
      const instructors = get().instructors;
      set({
        flightRecords: data.map((row: Record<string, unknown>) => {
          const student = students.find(s => String(s.id) === String(row.student_id));
          const ac = aircraft.find(a => String(a.id) === String(row.aircraft_id));
          const inst = instructors.find(i => i.id === String(row.instructor_id));
          const calcHours = (): number => {
            if (row.total_hours) return row.total_hours as number;
            const arr = row.arrival_time as string; const dep = row.departure_time as string;
            if (!arr || !dep) return 0;
            const [ah, am] = arr.split(':').map(Number); const [dh, dm] = dep.split(':').map(Number);
            return Math.round(((ah * 60 + am) - (dh * 60 + dm)) / 6) / 10;
          };
          return {
            id: String(row.id), studentId: String(row.student_id), aircraftId: String(row.aircraft_id),
            instructorId: String(row.instructor_id), flightDate: row.flight_date as string,
            departureTime: row.departure_time as string, arrivalTime: row.arrival_time as string,
            hobbsStart: row.hobbs_start as number, hobbsEnd: row.hobbs_end as number,
            totalHours: calcHours(), landings: row.landings as number,
            flightType: row.flight_type as string, sortieType: row.sortie_type as string,
            maneuvers: row.maneuvers as string, instructorNotes: row.instructor_notes as string,
            studentPerformance: row.student_performance as number, weatherConditions: row.weather_conditions as string,
            studentName: student?.name || 'Unknown', aircraftReg: ac?.registration || 'Unknown', instructorName: inst?.name || 'Unknown',
          };
        }),
        loadingFlights: false,
      });
    } else {
      console.error('Error loading flight records:', error);
      set({ loadingFlights: false });
    }
  },
  
  /**
   * Load flight records for a specific student (individual logbook)
   */
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
            const arr = row.arrival_time as string; const dep = row.departure_time as string;
            if (!arr || !dep) return 0;
            const [ah, am] = arr.split(':').map(Number); const [dh, dm] = dep.split(':').map(Number);
            return Math.round(((ah * 60 + am) - (dh * 60 + dm)) / 6) / 10;
          };
          return {
            id: String(row.id), studentId: String(row.student_id), aircraftId: String(row.aircraft_id),
            instructorId: String(row.instructor_id), flightDate: row.flight_date as string,
            departureTime: row.departure_time as string, arrivalTime: row.arrival_time as string,
            hobbsStart: row.hobbs_start as number, hobbsEnd: row.hobbs_end as number,
            totalHours: calcHours(), landings: row.landings as number,
            flightType: row.flight_type as string, sortieType: row.sortie_type as string,
            maneuvers: row.maneuvers as string, instructorNotes: row.instructor_notes as string,
            studentPerformance: row.student_performance as number, weatherConditions: row.weather_conditions as string,
            studentName: student?.name || 'Unknown', aircraftReg: ac?.registration || 'Unknown', instructorName: inst?.name || 'Unknown',
          };
        }),
        loadingFlights: false,
      });
    } else {
      console.error('Error loading student flight records:', error);
      set({ loadingFlights: false });
    }
  },
  
  /**
   * Add flight record and update student's total hours
   */
  addFlightRecord: async (record) => {
    const { error } = await supabase.from('flight_records').insert({
      student_id: record.studentId, aircraft_id: record.aircraftId, instructor_id: record.instructorId,
      flight_date: record.flightDate, departure_time: record.departureTime, arrival_time: record.arrivalTime,
      hobbs_start: record.hobbsStart, hobbs_end: record.hobbsEnd, landings: record.landings,
      flight_type: record.flightType, sortie_type: record.sortieType, maneuvers: record.maneuvers,
      instructor_notes: record.instructorNotes, student_performance: record.studentPerformance,
      weather_conditions: record.weatherConditions,
    });
    if (!error) {
      const student = get().students.find(s => s.id === record.studentId);
      const newTotalHours = (student?.totalHours || 0) + record.totalHours;
      await supabase.from('students').update({ total_hours: newTotalHours }).eq('id', record.studentId);
      await get().loadStudents();
      await get().loadFlightRecords();
    }
  },
  
  // ============================================================
  // 4. FUEL MANAGEMENT FUNCTIONS
  // ============================================================
  
  /**
   * Load fuel records with aircraft registration lookup
   */
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
    } else {
      console.error('Error loading fuel records:', error);
      set({ loadingFuel: false });
    }
  },
  
  /**
   * Log refueling and update aircraft fuel level
   */
  addFuelRecord: async (record) => {
    const { error } = await supabase.from('fuel_records').insert({
      aircraft_id: record.aircraftId, fuel_added_liters: record.fuelAddedLiters,
      fuel_cost_per_liter: record.fuelCostPerLiter, fuel_level_before: record.fuelLevelBefore,
      fuel_level_after: record.fuelLevelAfter, fuel_type: record.fuelType,
      refueled_by: record.refueledBy, notes: record.notes,
    });
    if (!error) {
      await supabase.from('aircraft').update({ current_fuel: record.fuelLevelAfter }).eq('id', record.aircraftId);
      await get().loadAircraft();
      await get().loadFuelRecords();
    }
  },
  
  getFuelRecordsForAircraft: (aircraftId) => get().fuelRecords.filter(r => r.aircraftId === aircraftId),
  
  // ============================================================
  // 5. SCHEDULED FLIGHTS / BOOKING FUNCTIONS
  // ============================================================
  
  /**
   * Load scheduled flights with names and calculated duration
   */
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
            weatherBriefed: row.weather_briefed as boolean, notamBriefed: row.notam_briefed as boolean,
            notes: row.notes as string, aircraftReg: ac?.registration || 'Unknown',
            studentName: student?.name || 'None', instructorName: inst?.name || 'Unknown',
            duration: Math.round((endTime.getTime() - startTime.getTime()) / 360000) / 10,
          };
        }),
        loadingSchedule: false,
      });
    } else {
      console.error('Error loading scheduled flights:', error);
      set({ loadingSchedule: false });
    }
  },
  
  /**
   * Check for time conflicts on same aircraft
   */
  checkConflicts: async (aircraftId, startTime, endTime, excludeId?) => {
    let query = supabase.from('scheduled_flights').select('*')
      .eq('aircraft_id', aircraftId).neq('status', 'CANCELLED')
      .lt('start_time', endTime).gt('end_time', startTime);
    if (excludeId) query = query.neq('id', excludeId);
    const { data, error } = await query;
    if (error) return { hasConflict: false, conflictingFlights: [] };
    return {
      hasConflict: (data?.length || 0) > 0,
      conflictingFlights: (data || []).map(row => ({
        id: String(row.id), aircraftId: String(row.aircraft_id), instructorId: String(row.instructor_id),
        startTime: row.start_time as string, endTime: row.end_time as string,
        sortieType: row.sortie_type as string, status: row.status as string,
        weatherBriefed: false, notamBriefed: false, notes: '',
      })),
    };
  },
  
  /**
   * Book a new flight slot with conflict detection
   */
  bookFlight: async (booking) => {
    const conflict = await get().checkConflicts(booking.aircraftId, booking.startTime, booking.endTime);
    if (conflict.hasConflict) {
      const cf = conflict.conflictingFlights[0];
      const conflictStart = new Date(cf.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const conflictEnd = new Date(cf.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return { success: false, message: `⚠️ Time conflict! Already booked ${conflictStart} to ${conflictEnd} (${cf.sortieType.replace(/_/g, ' ')}).` };
    }
    const { error } = await supabase.from('scheduled_flights').insert({
      aircraft_id: booking.aircraftId, instructor_id: booking.instructorId,
      student_id: booking.studentId || null, start_time: booking.startTime, end_time: booking.endTime,
      sortie_type: booking.sortieType, status: booking.status || 'SCHEDULED',
      weather_briefed: booking.weatherBriefed || false, notam_briefed: booking.notamBriefed || false,
      notes: booking.notes || '',
    });
    if (!error) { await get().loadScheduledFlights(); return { success: true, message: '✅ Flight booked!' }; }
    return { success: false, message: '❌ Failed to book flight.' };
  },
  
  /**
   * Cancel a flight (soft delete)
   */
  cancelFlight: async (id) => {
    const { error } = await supabase.from('scheduled_flights').update({ status: 'CANCELLED' }).eq('id', id);
    if (!error) set(state => ({ scheduledFlights: state.scheduledFlights.map(f => f.id === id ? { ...f, status: 'CANCELLED' } : f) }));
  },
  
  // ============================================================
  // 6. MAINTENANCE FUNCTIONS
  // ============================================================
  
  /**
   * Load maintenance records with overdue calculation
   */
  loadMaintenanceRecords: async () => {
    set({ loadingMaintenance: true });
    const { data, error } = await supabase.from('maintenance_records').select('*').order('scheduled_date', { ascending: true });
    if (data && !error) {
      const aircraftList = get().aircraft; const today = new Date(); today.setHours(0, 0, 0, 0);
      set({
        maintenanceRecords: data.map((row: Record<string, unknown>) => {
          const ac = aircraftList.find(a => String(a.id) === String(row.aircraft_id));
          const scheduledDate = new Date(row.scheduled_date as string);
          const daysUntilDue = Math.ceil((scheduledDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          return {
            id: String(row.id), aircraftId: String(row.aircraft_id),
            maintenanceType: row.maintenance_type as string, description: row.description as string,
            scheduledDate: row.scheduled_date as string, completedDate: row.completed_date as string || null,
            status: row.status as MaintenanceRecord['status'], cost: row.cost as number,
            performedBy: row.performed_by as string, notes: row.notes as string,
            aircraftReg: ac?.registration || 'Unknown', aircraftType: ac?.type || '',
            isOverdue: daysUntilDue < 0 && row.status !== 'COMPLETED' && row.status !== 'CANCELLED', daysUntilDue,
          };
        }),
        loadingMaintenance: false,
      });
    } else {
      console.error('Error loading maintenance records:', error);
      set({ loadingMaintenance: false });
    }
  },
  
  /**
   * Add maintenance record
   */
  addMaintenanceRecord: async (record) => {
    const { error } = await supabase.from('maintenance_records').insert({
      aircraft_id: record.aircraftId, maintenance_type: record.maintenanceType,
      description: record.description, scheduled_date: record.scheduledDate,
      completed_date: record.completedDate, status: record.status, cost: record.cost,
      performed_by: record.performedBy, notes: record.notes,
    });
    if (!error) await get().loadMaintenanceRecords();
  },
  
  /**
   * Update maintenance record (mark complete, etc.)
   */
  updateMaintenanceRecord: async (id, updates) => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.completedDate !== undefined) dbUpdates.completed_date = updates.completedDate;
    if (updates.cost !== undefined) dbUpdates.cost = updates.cost;
    if (updates.performedBy !== undefined) dbUpdates.performed_by = updates.performedBy;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.scheduledDate !== undefined) dbUpdates.scheduled_date = updates.scheduledDate;
    const { error } = await supabase.from('maintenance_records').update(dbUpdates).eq('id', id);
    if (!error) {
      set(state => ({ maintenanceRecords: state.maintenanceRecords.map(m => m.id === id ? { ...m, ...updates } : m) }));
    }
  },
  
  /**
   * Delete maintenance record
   */
  removeMaintenanceRecord: async (id) => {
    const { error } = await supabase.from('maintenance_records').delete().eq('id', id);
    if (!error) set(state => ({ maintenanceRecords: state.maintenanceRecords.filter(m => m.id !== id) }));
  },
  
  getMaintenanceForAircraft: (aircraftId) => get().maintenanceRecords.filter(m => m.aircraftId === aircraftId),
  
  // ============================================================
  // 7. INSTRUCTOR FUNCTIONS
  // ============================================================
  
  /**
   * Load instructors from Supabase
   */
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
        })),
        loadingInstructors: false,
      });
    } else {
      console.error('Error loading instructors:', error);
      set({ loadingInstructors: false });
    }
  },
  
  /**
   * Add new instructor
   */
  addInstructor: async (instructor) => {
    const { data, error } = await supabase.from('instructors').insert({
      name: instructor.name, initials: instructor.initials, license_number: instructor.licenseNumber,
      ratings: instructor.ratings, max_daily_hours: instructor.maxDailyHours,
      email: instructor.email, phone: instructor.phone, status: instructor.status,
    }).select().single();
    if (data && !error) {
      set(state => ({ instructors: [...state.instructors, { ...instructor, id: String(data.id) }] }));
    }
  },
  
  /**
   * Update instructor
   */
  updateInstructor: async (id, updates) => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.initials !== undefined) dbUpdates.initials = updates.initials;
    if (updates.licenseNumber !== undefined) dbUpdates.license_number = updates.licenseNumber;
    if (updates.ratings !== undefined) dbUpdates.ratings = updates.ratings;
    if (updates.maxDailyHours !== undefined) dbUpdates.max_daily_hours = updates.maxDailyHours;
    if (updates.email !== undefined) dbUpdates.email = updates.email;
    if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    const { error } = await supabase.from('instructors').update(dbUpdates).eq('id', id);
    if (!error) {
      set(state => ({ instructors: state.instructors.map(i => i.id === id ? { ...i, ...updates } : i) }));
    }
  },
  
  /**
   * Remove instructor
   */
  removeInstructor: async (id) => {
    const { error } = await supabase.from('instructors').delete().eq('id', id);
    if (!error) set(state => ({ instructors: state.instructors.filter(i => i.id !== id) }));
  },
  
  // ============================================================
  // 8. WEATHER - LIVE DATA FROM AVWX API
  // ============================================================
  
  /**
   * Fetch real-time weather data from AVWX API
   * Includes 5-minute caching and automatic fallback to mock data
   * @param station - ICAO airport code (default: 'VOBL' for Bangalore)
   */
  fetchWeather: async (station = 'VOBL') => {
    // Dynamic import to avoid circular dependency
    const { fetchWeather } = await import('./weather');
    const data = await fetchWeather(station);
    set({ weather: data });
  },
  
  // ============================================================
  // UI STATE FUNCTIONS
  // ============================================================
  
  setSelectedSlot: (slot) => set({ selectedSlot: slot }),
  setHoveredSlot: (id) => set({ hoveredSlot: id }),
  getInstructorById: (id) => get().instructors.find(i => i.id === id),
}));
// ============================================================
// lib/store.ts - CENTRAL STATE MANAGEMENT (ZUSTAND STORE)
// ============================================================
// This file is the brain of the FlightPro application. It:
// 1. Stores ALL application data (aircraft, students, flights, fuel, schedule, maintenance)
// 2. Provides functions to load/save data from Supabase database
// 3. Manages UI state (selected items, loading indicators, hover states)
// 4. Maps database column names (snake_case) to TypeScript properties (camelCase)
// 5. Handles conflict detection for flight scheduling
//
// HOW TO USE IN COMPONENTS:
//   import { useFlightStore } from '@/lib/store';
//   const { aircraft, loadAircraft } = useFlightStore();
// ============================================================

'use client';  // Required for Next.js client components using React hooks

import { create } from 'zustand';
import { Aircraft, Instructor, StudentRecord, FlightSlot, WeatherData, NOTAM, FuelRecord, FlightRecord, ScheduledFlight, TimeConflict, MaintenanceRecord } from '@/types';
import { instructorData, generateSchedule, weatherData, notamData } from './data';
import { supabase } from './supabase';

// ============================================================
// TYPE DEFINITION - All state properties and actions
// ============================================================
interface FlightStore {
  // ----- DATA COLLECTIONS (persisted in Supabase) -----
  aircraft: Aircraft[];                    // Fleet data from aircraft table
  students: StudentRecord[];               // Student records from students table
  flightRecords: FlightRecord[];           // Flight logbook from flight_records table
  fuelRecords: FuelRecord[];               // Refueling history from fuel_records table
  scheduledFlights: ScheduledFlight[];     // Booked flight slots from scheduled_flights table
  maintenanceRecords: MaintenanceRecord[]; // Maintenance records from maintenance_records table
  
  // ----- MOCK/STATIC DATA (not yet in database) -----
  instructors: Instructor[];               // Instructor list (mock data)
  schedule: FlightSlot[];                  // Today's schedule (generated mock)
  weather: WeatherData;                    // Current weather (mock data)
  notams: NOTAM[];                         // Active NOTAMs (mock data)
  
  // ----- UI STATE (temporary, not persisted to DB) -----
  selectedSlot: FlightSlot | null;         // Currently clicked flight block (for detail modal)
  hoveredSlot: string | null;              // Currently hovered flight block ID (for highlight effect)
  loadingAircraft: boolean;                // Show spinner while loading aircraft
  loadingStudents: boolean;                // Show spinner while loading students
  loadingFlights: boolean;                 // Show spinner while loading flight records
  loadingFuel: boolean;                    // Show spinner while loading fuel records
  loadingSchedule: boolean;                // Show spinner while loading scheduled flights
  loadingMaintenance: boolean;             // Show spinner while loading maintenance records
  
  // ==========================================
  // AIRCRAFT ACTIONS (CRUD operations)
  // ==========================================
  loadAircraft: () => Promise<void>;
  addAircraft: (aircraft: Omit<Aircraft, 'id'>) => Promise<void>;
  updateAircraft: (id: string, updates: Partial<Aircraft>) => Promise<void>;
  removeAircraft: (id: string) => Promise<void>;
  getAircraftById: (id: string) => Aircraft | undefined;
  getSlotsForAircraft: (aircraftId: string) => FlightSlot[];
  
  // ==========================================
  // STUDENT ACTIONS (CRUD operations)
  // ==========================================
  loadStudents: () => Promise<void>;
  addStudent: (student: Omit<StudentRecord, 'id'>) => Promise<void>;
  updateStudent: (id: string, updates: Partial<StudentRecord>) => Promise<void>;
  removeStudent: (id: string) => Promise<void>;
  getStudentById: (id: string) => StudentRecord | undefined;
  
  // ==========================================
  // FLIGHT RECORD / LOGBOOK ACTIONS
  // ==========================================
  loadFlightRecords: () => Promise<void>;
  loadStudentFlightRecords: (studentId: string) => Promise<void>;
  addFlightRecord: (record: Omit<FlightRecord, 'id' | 'totalHours' | 'studentName' | 'aircraftReg' | 'instructorName'>) => Promise<void>;
  
  // ==========================================
  // FUEL MANAGEMENT ACTIONS
  // ==========================================
  loadFuelRecords: () => Promise<void>;
  addFuelRecord: (record: Omit<FuelRecord, 'id' | 'totalCost' | 'aircraftReg' | 'aircraftType'>) => Promise<void>;
  getFuelRecordsForAircraft: (aircraftId: string) => FuelRecord[];
  
  // ==========================================
  // SCHEDULED FLIGHTS / BOOKING ACTIONS
  // ==========================================
  loadScheduledFlights: () => Promise<void>;
  bookFlight: (booking: Omit<ScheduledFlight, 'id' | 'aircraftReg' | 'studentName' | 'instructorName' | 'duration'>) => Promise<{success: boolean; message: string}>;
  checkConflicts: (aircraftId: string, startTime: string, endTime: string, excludeId?: string) => Promise<TimeConflict>;
  cancelFlight: (id: string) => Promise<void>;
  
  // ==========================================
  // MAINTENANCE ACTIONS
  // ==========================================
  loadMaintenanceRecords: () => Promise<void>;
  addMaintenanceRecord: (record: Omit<MaintenanceRecord, 'id' | 'aircraftReg' | 'aircraftType' | 'isOverdue' | 'daysUntilDue'>) => Promise<void>;
  updateMaintenanceRecord: (id: string, updates: Partial<MaintenanceRecord>) => Promise<void>;
  removeMaintenanceRecord: (id: string) => Promise<void>;
  getMaintenanceForAircraft: (aircraftId: string) => MaintenanceRecord[];
  
  // ==========================================
  // UI STATE ACTIONS
  // ==========================================
  setSelectedSlot: (slot: FlightSlot | null) => void;
  setHoveredSlot: (id: string | null) => void;
  getInstructorById: (id: string) => Instructor | undefined;
}

// ============================================================
// STORE CREATION - Where all state and actions are defined
// ============================================================
export const useFlightStore = create<FlightStore>((set, get) => ({
  // ==========================================
  // INITIAL STATE - Starting values when app loads
  // ==========================================
  aircraft: [],               // Empty array - loaded from Supabase on page mount
  students: [],               // Empty array - loaded from Supabase on page mount
  flightRecords: [],          // Empty array - loaded from Supabase on page mount
  fuelRecords: [],            // Empty array - loaded from Supabase on page mount
  scheduledFlights: [],       // Empty array - loaded from Supabase on page mount
  maintenanceRecords: [],     // Empty array - loaded from Supabase on page mount
  instructors: instructorData, // Pre-loaded from mock data file (lib/data.ts)
  schedule: generateSchedule(), // Generated fresh each time store initializes
  weather: weatherData,       // Mock weather data (will be replaced with API)
  notams: notamData,          // Mock NOTAM data (will be replaced with API)
  selectedSlot: null,         // No flight selected initially
  hoveredSlot: null,          // Nothing being hovered
  loadingAircraft: false,     // Not loading yet
  loadingStudents: false,
  loadingFlights: false,
  loadingFuel: false,
  loadingSchedule: false,
  loadingMaintenance: false,
  
  // ============================================================
  // AIRCRAFT FUNCTIONS
  // ============================================================
  
  /**
   * LOAD AIRCRAFT FROM DATABASE
   * Fetches all rows from 'aircraft' table, ordered by creation date.
   * Maps snake_case column names to camelCase TypeScript properties:
   *   hobbs_time      → hobbsTime
   *   fuel_capacity   → fuelCapacity
   *   current_fuel    → currentFuel
   *   next_maintenance → nextMaintenance
   */
  loadAircraft: async () => {
    set({ loadingAircraft: true });  // Show loading spinner in UI
    
    const { data, error } = await supabase
      .from('aircraft')
      .select('*')
      .order('created_at', { ascending: true });  // Oldest aircraft first
    
    if (data && !error) {
      set({
        aircraft: data.map((row: Record<string, unknown>) => ({
          id: String(row.id),                          // Convert BIGINT to string for consistency
          registration: row.registration as string,
          type: row.type as string,
          model: row.model as string,
          year: row.year as number,
          hobbsTime: row.hobbs_time as number,         // snake_case → camelCase
          fuelCapacity: row.fuel_capacity as number,
          currentFuel: row.current_fuel as number,
          status: row.status as Aircraft['status'],     // Type-safe status
          nextMaintenance: row.next_maintenance as string,
        })),
        loadingAircraft: false,  // Hide spinner
      });
    } else {
      console.error('Error loading aircraft:', error);
      set({ loadingAircraft: false });
    }
  },
  
  /**
   * ADD NEW AIRCRAFT
   * Inserts into Supabase, then adds to local state immediately.
   * Uses Omit<Aircraft, 'id'> because Supabase auto-generates the ID.
   */
  addAircraft: async (aircraft) => {
    const { data, error } = await supabase
      .from('aircraft')
      .insert({
        registration: aircraft.registration,
        type: aircraft.type,
        model: aircraft.model,
        year: aircraft.year,
        hobbs_time: aircraft.hobbsTime,        // camelCase → snake_case for DB
        fuel_capacity: aircraft.fuelCapacity,
        current_fuel: aircraft.currentFuel,
        status: aircraft.status,
        next_maintenance: aircraft.nextMaintenance,
      })
      .select()     // Return the inserted row
      .single();    // Expect exactly one row
    
    if (data && !error) {
      set(state => ({
        aircraft: [...state.aircraft, { ...aircraft, id: String(data.id) }]
      }));
    }
  },
  
  /**
   * UPDATE AIRCRAFT
   * Only sends fields that were actually changed (partial update).
   * Builds dbUpdates object dynamically to avoid overwriting with undefined.
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
    
    const { error } = await supabase
      .from('aircraft')
      .update(dbUpdates)
      .eq('id', id);  // WHERE id = ?
    
    if (!error) {
      set(state => ({
        aircraft: state.aircraft.map(a => 
          a.id === id ? { ...a, ...updates } : a  // Merge old + new
        )
      }));
    }
  },
  
  /**
   * REMOVE AIRCRAFT
   * Deletes from Supabase, then filters out of local state.
   */
  removeAircraft: async (id) => {
    const { error } = await supabase
      .from('aircraft')
      .delete()
      .eq('id', id);
    
    if (!error) {
      set(state => ({
        aircraft: state.aircraft.filter(a => a.id !== id)
      }));
    }
  },
  
  /** Find aircraft by ID in local state (synchronous - no DB call needed) */
  getAircraftById: (id) => get().aircraft.find(a => a.id === id),
  
  /** Get all schedule slots assigned to a specific aircraft (for Gantt chart rendering) */
  getSlotsForAircraft: (aircraftId) => 
    get().schedule.filter(s => s.aircraftId === aircraftId),
  
  // ============================================================
  // STUDENT FUNCTIONS
  // ============================================================
  
  /**
   * LOAD STUDENTS FROM DATABASE
   * Maps database snake_case columns to TypeScript camelCase properties.
   * Handles optional fields (email, phone, dateOfBirth) with fallback to empty string.
   */
  loadStudents: async () => {
    set({ loadingStudents: true });
    
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (data && !error) {
      set({
        students: data.map((row: Record<string, unknown>) => ({
          id: String(row.id),
          enrollmentId: row.enrollment_id as string,      // snake_case → camelCase
          name: row.name as string,
          initials: row.initials as string,
          trainingStage: row.training_stage as string,
          totalHours: row.total_hours as number,
          medicalExpiry: row.medical_expiry as string,
          email: (row.email as string) || '',              // Handle NULL values
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
  
  /** ADD NEW STUDENT - Inserts into Supabase, adds to local state on success */
  addStudent: async (student) => {
    const { data, error } = await supabase
      .from('students')
      .insert({
        enrollment_id: student.enrollmentId,      // camelCase → snake_case for DB
        name: student.name,
        initials: student.initials,
        training_stage: student.trainingStage,
        total_hours: student.totalHours,
        medical_expiry: student.medicalExpiry,
        email: student.email,
        phone: student.phone,
        date_of_birth: student.dateOfBirth,
        joined_date: student.joinedDate,
        status: student.status,
      })
      .select()
      .single();
    
    if (data && !error) {
      set(state => ({
        students: [...state.students, { ...student, id: String(data.id) }]
      }));
    }
  },
  
  /** UPDATE STUDENT - Only sends changed fields to database */
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
    
    const { error } = await supabase
      .from('students')
      .update(dbUpdates)
      .eq('id', id);
    
    if (!error) {
      set(state => ({
        students: state.students.map(s => s.id === id ? { ...s, ...updates } : s)
      }));
    }
  },
  
  /** REMOVE STUDENT - Deletes from Supabase, removes from local state */
  removeStudent: async (id) => {
    const { error } = await supabase.from('students').delete().eq('id', id);
    if (!error) {
      set(state => ({ students: state.students.filter(s => s.id !== id) }));
    }
  },
  
  getStudentById: (id) => get().students.find(s => s.id === id),
  
  // ============================================================
  // FLIGHT RECORDS / LOGBOOK FUNCTIONS
  // ============================================================
  
  /**
   * LOAD ALL FLIGHT RECORDS
   * Fetches flight history with student, aircraft, and instructor names.
   * If total_hours is NULL in DB, calculates it from departure/arrival times.
   */
  loadFlightRecords: async () => {
    set({ loadingFlights: true });
    
    const { data, error } = await supabase
      .from('flight_records')
      .select('*')
      .order('flight_date', { ascending: false })  // Most recent flights first
      .limit(100);
    
    if (data && !error) {
      const students = get().students;
      const aircraft = get().aircraft;
      const instructors = get().instructors;
      
      set({
        flightRecords: data.map((row: Record<string, unknown>) => {
          const student = students.find(s => String(s.id) === String(row.student_id));
          const ac = aircraft.find(a => String(a.id) === String(row.aircraft_id));
          const inst = instructors.find(i => i.id === String(row.instructor_id));
          
          // Calculate hours if not stored in DB
          const calcHours = (): number => {
            if (row.total_hours) return row.total_hours as number;
            const arr = row.arrival_time as string;
            const dep = row.departure_time as string;
            if (!arr || !dep) return 0;
            const [ah, am] = arr.split(':').map(Number);
            const [dh, dm] = dep.split(':').map(Number);
            return Math.round(((ah * 60 + am) - (dh * 60 + dm)) / 6) / 10;
          };
          
          return {
            id: String(row.id),
            studentId: String(row.student_id),
            aircraftId: String(row.aircraft_id),
            instructorId: String(row.instructor_id),
            flightDate: row.flight_date as string,
            departureTime: row.departure_time as string,
            arrivalTime: row.arrival_time as string,
            hobbsStart: row.hobbs_start as number,
            hobbsEnd: row.hobbs_end as number,
            totalHours: calcHours(),
            landings: row.landings as number,
            flightType: row.flight_type as string,
            sortieType: row.sortie_type as string,
            maneuvers: row.maneuvers as string,
            instructorNotes: row.instructor_notes as string,
            studentPerformance: row.student_performance as number,
            weatherConditions: row.weather_conditions as string,
            studentName: student?.name || 'Unknown',
            aircraftReg: ac?.registration || 'Unknown',
            instructorName: inst?.name || 'Unknown',
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
   * LOAD FLIGHT RECORDS FOR ONE STUDENT
   * Same as loadFlightRecords but filters by student_id.
   */
  loadStudentFlightRecords: async (studentId: string) => {
    set({ loadingFlights: true });
    
    const { data, error } = await supabase
      .from('flight_records')
      .select('*')
      .eq('student_id', studentId)
      .order('flight_date', { ascending: false });
    
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
            const arr = row.arrival_time as string;
            const dep = row.departure_time as string;
            if (!arr || !dep) return 0;
            const [ah, am] = arr.split(':').map(Number);
            const [dh, dm] = dep.split(':').map(Number);
            return Math.round(((ah * 60 + am) - (dh * 60 + dm)) / 6) / 10;
          };
          
          return {
            id: String(row.id),
            studentId: String(row.student_id),
            aircraftId: String(row.aircraft_id),
            instructorId: String(row.instructor_id),
            flightDate: row.flight_date as string,
            departureTime: row.departure_time as string,
            arrivalTime: row.arrival_time as string,
            hobbsStart: row.hobbs_start as number,
            hobbsEnd: row.hobbs_end as number,
            totalHours: calcHours(),
            landings: row.landings as number,
            flightType: row.flight_type as string,
            sortieType: row.sortie_type as string,
            maneuvers: row.maneuvers as string,
            instructorNotes: row.instructor_notes as string,
            studentPerformance: row.student_performance as number,
            weatherConditions: row.weather_conditions as string,
            studentName: student?.name || 'Unknown',
            aircraftReg: ac?.registration || 'Unknown',
            instructorName: inst?.name || 'Unknown',
          };
        }),
        loadingFlights: false,
      });
    } else {
      set({ loadingFlights: false });
    }
  },
  
  /**
   * ADD NEW FLIGHT RECORD TO LOGBOOK
   * 1. Inserts flight into flight_records table
   * 2. Calculates new total hours for the student
   * 3. Updates student's total_hours in students table
   * 4. Reloads both students and flight records
   */
  addFlightRecord: async (record) => {
    const { error } = await supabase
      .from('flight_records')
      .insert({
        student_id: record.studentId,
        aircraft_id: record.aircraftId,
        instructor_id: record.instructorId,
        flight_date: record.flightDate,
        departure_time: record.departureTime,
        arrival_time: record.arrivalTime,
        hobbs_start: record.hobbsStart,
        hobbs_end: record.hobbsEnd,
        landings: record.landings,
        flight_type: record.flightType,
        sortie_type: record.sortieType,
        maneuvers: record.maneuvers,
        instructor_notes: record.instructorNotes,
        student_performance: record.studentPerformance,
        weather_conditions: record.weatherConditions,
      });
    
    if (!error) {
      const student = get().students.find(s => s.id === record.studentId);
      const newTotalHours = (student?.totalHours || 0) + record.totalHours;
      
      await supabase
        .from('students')
        .update({ total_hours: newTotalHours })
        .eq('id', record.studentId);
      
      await get().loadStudents();
      await get().loadFlightRecords();
    }
  },
  
  // ============================================================
  // FUEL MANAGEMENT FUNCTIONS
  // ============================================================
  
  /**
   * LOAD FUEL RECORDS
   * Fetches refueling history, matches aircraft IDs to show registration numbers.
   * Calculates total cost as fuel_added_liters × fuel_cost_per_liter.
   */
  loadFuelRecords: async () => {
    set({ loadingFuel: true });
    
    const { data, error } = await supabase
      .from('fuel_records')
      .select('*')
      .order('refueling_date', { ascending: false })
      .limit(50);
    
    if (data && !error) {
      const aircraftList = get().aircraft;
      
      set({
        fuelRecords: data.map((row: Record<string, unknown>) => {
          const ac = aircraftList.find(a => String(a.id) === String(row.aircraft_id));
          return {
            id: String(row.id),
            aircraftId: String(row.aircraft_id),
            refuelingDate: row.refueling_date as string,
            fuelAddedLiters: row.fuel_added_liters as number,
            fuelCostPerLiter: row.fuel_cost_per_liter as number,
            totalCost: (row.fuel_added_liters as number) * (row.fuel_cost_per_liter as number),
            fuelLevelBefore: row.fuel_level_before as number,
            fuelLevelAfter: row.fuel_level_after as number,
            fuelType: row.fuel_type as string,
            refueledBy: row.refueled_by as string,
            notes: row.notes as string,
            aircraftReg: ac?.registration || 'Unknown',
            aircraftType: ac?.type || '',
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
   * LOG NEW REFUELING
   * 1. Inserts record into fuel_records table
   * 2. Updates aircraft's current_fuel to the new level
   * 3. Reloads both aircraft and fuel data
   */
  addFuelRecord: async (record) => {
    const { error } = await supabase
      .from('fuel_records')
      .insert({
        aircraft_id: record.aircraftId,
        fuel_added_liters: record.fuelAddedLiters,
        fuel_cost_per_liter: record.fuelCostPerLiter,
        fuel_level_before: record.fuelLevelBefore,
        fuel_level_after: record.fuelLevelAfter,
        fuel_type: record.fuelType,
        refueled_by: record.refueledBy,
        notes: record.notes,
      });
    
    if (!error) {
      await supabase
        .from('aircraft')
        .update({ current_fuel: record.fuelLevelAfter })
        .eq('id', record.aircraftId);
      
      await get().loadAircraft();
      await get().loadFuelRecords();
    }
  },
  
  getFuelRecordsForAircraft: (aircraftId) => 
    get().fuelRecords.filter(r => r.aircraftId === aircraftId),
  
  // ============================================================
  // SCHEDULED FLIGHTS / BOOKING FUNCTIONS
  // ============================================================
  
  /**
   * LOAD SCHEDULED FLIGHTS
   * Fetches all booked slots. Matches IDs to show aircraft registration,
   * student name, and instructor name. Calculates duration.
   */
  loadScheduledFlights: async () => {
    set({ loadingSchedule: true });
    
    const { data, error } = await supabase
      .from('scheduled_flights')
      .select('*')
      .order('start_time', { ascending: true });
    
    if (data && !error) {
      const aircraftList = get().aircraft;
      const studentsList = get().students;
      const instructorsList = get().instructors;
      
      set({
        scheduledFlights: data.map((row: Record<string, unknown>) => {
          const ac = aircraftList.find(a => String(a.id) === String(row.aircraft_id));
          const student = studentsList.find(s => String(s.id) === String(row.student_id));
          const inst = instructorsList.find(i => i.id === String(row.instructor_id));
          
          const startTime = new Date(row.start_time as string);
          const endTime = new Date(row.end_time as string);
          const duration = (endTime.getTime() - startTime.getTime()) / 3600000;
          
          return {
            id: String(row.id),
            aircraftId: String(row.aircraft_id),
            instructorId: String(row.instructor_id),
            studentId: row.student_id ? String(row.student_id) : undefined,
            startTime: row.start_time as string,
            endTime: row.end_time as string,
            sortieType: row.sortie_type as string,
            status: row.status as string,
            weatherBriefed: row.weather_briefed as boolean,
            notamBriefed: row.notam_briefed as boolean,
            notes: row.notes as string,
            aircraftReg: ac?.registration || 'Unknown',
            studentName: student?.name || 'None',
            instructorName: inst?.name || 'Unknown',
            duration: Math.round(duration * 10) / 10,
          };
        }),
        loadingSchedule: false,
      });
    } else {
      console.error('Error loading schedule:', error);
      set({ loadingSchedule: false });
    }
  },
  
  /**
   * CHECK FOR TIME CONFLICTS
   * Queries scheduled_flights for overlapping bookings on the same aircraft.
   * A conflict exists when: existing.start < new.end AND existing.end > new.start
   */
  checkConflicts: async (aircraftId: string, startTime: string, endTime: string, excludeId?: string) => {
    let query = supabase
      .from('scheduled_flights')
      .select('*')
      .eq('aircraft_id', aircraftId)
      .neq('status', 'CANCELLED')
      .lt('start_time', endTime)
      .gt('end_time', startTime);
    
    if (excludeId) {
      query = query.neq('id', excludeId);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error checking conflicts:', error);
      return { hasConflict: false, conflictingFlights: [] };
    }
    
    return {
      hasConflict: (data?.length || 0) > 0,
      conflictingFlights: (data || []).map(row => ({
        id: String(row.id),
        aircraftId: String(row.aircraft_id),
        instructorId: String(row.instructor_id),
        startTime: row.start_time as string,
        endTime: row.end_time as string,
        sortieType: row.sortie_type as string,
        status: row.status as string,
        weatherBriefed: false,
        notamBriefed: false,
        notes: '',
      })),
    };
  },
  
  /**
   * BOOK A NEW FLIGHT SLOT
   * 1. Checks for time conflicts first
   * 2. If conflict exists, returns error message
   * 3. If clear, saves to scheduled_flights table
   * 4. Reloads schedule to show new booking
   */
  bookFlight: async (booking) => {
    const conflict = await get().checkConflicts(booking.aircraftId, booking.startTime, booking.endTime);
    
    if (conflict.hasConflict) {
      const cf = conflict.conflictingFlights[0];
      const conflictStart = new Date(cf.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const conflictEnd = new Date(cf.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return {
        success: false,
        message: `⚠️ Time conflict! Already booked ${conflictStart} to ${conflictEnd} (${cf.sortieType.replace(/_/g, ' ')}).`,
      };
    }
    
    const { error } = await supabase.from('scheduled_flights').insert({
      aircraft_id: booking.aircraftId,
      instructor_id: booking.instructorId,
      student_id: booking.studentId || null,
      start_time: booking.startTime,
      end_time: booking.endTime,
      sortie_type: booking.sortieType,
      status: booking.status || 'SCHEDULED',
      weather_briefed: booking.weatherBriefed || false,
      notam_briefed: booking.notamBriefed || false,
      notes: booking.notes || '',
    });
    
    if (!error) {
      await get().loadScheduledFlights();
      return { success: true, message: '✅ Flight booked successfully!' };
    }
    
    return { success: false, message: '❌ Failed to book flight.' };
  },
  
  /**
   * CANCEL A SCHEDULED FLIGHT
   * Sets status to 'CANCELLED' instead of deleting (preserves history).
   */
  cancelFlight: async (id) => {
    const { error } = await supabase
      .from('scheduled_flights')
      .update({ status: 'CANCELLED' })
      .eq('id', id);
    
    if (!error) {
      set(state => ({
        scheduledFlights: state.scheduledFlights.map(f =>
          f.id === id ? { ...f, status: 'CANCELLED' } : f
        )
      }));
    }
  },
  
  // ============================================================
  // MAINTENANCE RECORDS FUNCTIONS
  // ============================================================
  
  /**
   * LOAD MAINTENANCE RECORDS
   * Fetches all maintenance records, matches aircraft registration.
   * Calculates overdue status and days until due for each record.
   */
  loadMaintenanceRecords: async () => {
    set({ loadingMaintenance: true });
    
    const { data, error } = await supabase
      .from('maintenance_records')
      .select('*')
      .order('scheduled_date', { ascending: true });
    
    if (data && !error) {
      const aircraftList = get().aircraft;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      set({
        maintenanceRecords: data.map((row: Record<string, unknown>) => {
          const ac = aircraftList.find(a => String(a.id) === String(row.aircraft_id));
          const scheduledDate = new Date(row.scheduled_date as string);
          const daysUntilDue = Math.ceil((scheduledDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          
          return {
            id: String(row.id),
            aircraftId: String(row.aircraft_id),
            maintenanceType: row.maintenance_type as string,
            description: row.description as string,
            scheduledDate: row.scheduled_date as string,
            completedDate: row.completed_date as string || null,
            status: row.status as MaintenanceRecord['status'],
            cost: row.cost as number,
            performedBy: row.performed_by as string,
            notes: row.notes as string,
            aircraftReg: ac?.registration || 'Unknown',
            aircraftType: ac?.type || '',
            isOverdue: daysUntilDue < 0 && row.status !== 'COMPLETED' && row.status !== 'CANCELLED',
            daysUntilDue,
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
   * ADD MAINTENANCE RECORD
   * Inserts new maintenance record into database.
   */
  addMaintenanceRecord: async (record) => {
    const { error } = await supabase
      .from('maintenance_records')
      .insert({
        aircraft_id: record.aircraftId,
        maintenance_type: record.maintenanceType,
        description: record.description,
        scheduled_date: record.scheduledDate,
        completed_date: record.completedDate,
        status: record.status,
        cost: record.cost,
        performed_by: record.performedBy,
        notes: record.notes,
      });
    
    if (!error) {
      await get().loadMaintenanceRecords();
    }
  },
  
  /**
   * UPDATE MAINTENANCE RECORD
   * Used to mark as complete, update status, change dates, etc.
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
    
    const { error } = await supabase
      .from('maintenance_records')
      .update(dbUpdates)
      .eq('id', id);
    
    if (!error) {
      set(state => ({
        maintenanceRecords: state.maintenanceRecords.map(m =>
          m.id === id ? { ...m, ...updates } : m
        )
      }));
    }
  },
  
  /**
   * DELETE MAINTENANCE RECORD
   * Removes from database and local state.
   */
  removeMaintenanceRecord: async (id) => {
    const { error } = await supabase
      .from('maintenance_records')
      .delete()
      .eq('id', id);
    
    if (!error) {
      set(state => ({
        maintenanceRecords: state.maintenanceRecords.filter(m => m.id !== id)
      }));
    }
  },
  
  /**
   * Get maintenance records for a specific aircraft
   */
  getMaintenanceForAircraft: (aircraftId) =>
    get().maintenanceRecords.filter(m => m.aircraftId === aircraftId),
  
  // ============================================================
  // UI STATE FUNCTIONS
  // ============================================================
  
  /** Open flight detail modal (pass slot) or close it (pass null) */
  setSelectedSlot: (slot) => set({ selectedSlot: slot }),
  
  /** Track hover state for Gantt chart animation */
  setHoveredSlot: (id) => set({ hoveredSlot: id }),
  
  /** Find instructor by ID in local mock data */
  getInstructorById: (id) => get().instructors.find(i => i.id === id),
}));
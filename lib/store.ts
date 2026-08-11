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
  WeatherData, NOTAM, FuelRecord, FlightRecord, 
  ScheduledFlight, TimeConflict, MaintenanceRecord,
  AvailabilityRecord, TrainingRequirement
} from '@/types';
import { generateSchedule } from './data';
import { supabase } from './supabase';

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
  schedule: FlightSlot[];
  availabilityRecords: AvailabilityRecord[];
  trainingRequirements: TrainingRequirement[];
  ftoSettings: Record<string, string>;      // FTO settings as key-value pairs
  exercises: { exercise_name: string; short_code: string; full_description: string }[];
  

  // ==========================================
  // UI STATE
  // ==========================================
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
  addStudent: (student: Omit<StudentRecord, 'id'>) => Promise<void>;
  updateStudent: (id: string, updates: Partial<StudentRecord>) => Promise<void>;
  removeStudent: (id: string) => Promise<void>;
  getStudentById: (id: string) => StudentRecord | undefined;
  assignInstructor: (studentId: string, instructorId: string) => Promise<void>;

  // ==========================================
  // 3. FLIGHT RECORD ACTIONS
  // ==========================================
  loadFlightRecords: () => Promise<void>;
  loadStudentFlightRecords: (studentId: string) => Promise<void>;
  addFlightRecord: (record: Omit<FlightRecord, 'id' | 'studentName' | 'aircraftReg' | 'instructorName'>) => Promise<void>;

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
  cancelFlight: (id: string) => Promise<void>;
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
  // ==========================================
  // 11. TRAINING REQUIREMENTS ACTIONS
  // ==========================================
  loadTrainingRequirements: (studentId?: string) => Promise<void>;
  toggleRequirement: (id: string, isCompleted: boolean, completedBy?: string) => Promise<void>;
  addRequirement: (requirement: Omit<TrainingRequirement, 'id'>) => Promise<void>;
  removeRequirement: (id: string) => Promise<void>;
  getRequirementsForStudent: (studentId: string) => TrainingRequirement[];

  // ==========================================
  // 12. FTO SETTINGS ACTIONS
  // ==========================================
  loadFTOSettings: () => Promise<void>;
  getFTOSetting: (key: string) => string;

  // ==========================================
  // UI ACTIONS
  // ==========================================
  
  setSelectedSlot: (slot: FlightSlot | null) => void;
  setHoveredSlot: (id: string | null) => void;
  getInstructorById: (id: string) => Instructor | undefined;
  getSlotsForAircraft: (aircraftId: string) => FlightSlot[];
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
  schedule: generateSchedule(),
  availabilityRecords: [],
  trainingRequirements: [],
  ftoSettings: {},          // Start empty, loaded from database
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
        })),
        loadingAircraft: false,
      });
    } else { console.error('Error loading aircraft:', error); set({ loadingAircraft: false }); }
  },

  addAircraft: async (aircraft) => {
    const { data, error } = await supabase.from('aircraft').insert({
      registration: aircraft.registration, type: aircraft.type, model: aircraft.model,
      year: aircraft.year, hobbs_time: aircraft.hobbsTime, fuel_capacity: aircraft.fuelCapacity,
      current_fuel: aircraft.currentFuel, status: aircraft.status, next_maintenance: aircraft.nextMaintenance,
    }).select().single();
    if (data && !error) set(state => ({ aircraft: [...state.aircraft, { ...aircraft, id: String(data.id) }] }));
  },

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
    if (!error) set(state => ({ aircraft: state.aircraft.map(a => a.id === id ? { ...a, ...updates } : a) }));
  },

  removeAircraft: async (id) => {
    const { error } = await supabase.from('aircraft').delete().eq('id', id);
    if (!error) set(state => ({ aircraft: state.aircraft.filter(a => a.id !== id) }));
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
    if (res.ok) {
      const { student: created } = await res.json();
      set(state => ({ students: [...state.students, { ...student, id: String(created.id) }] }));
    } else {
      console.error('Error adding student:', await res.text());
    }
  },

  updateStudent: async (id, updates) => {
    const res = await fetch(`/api/students/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) set(state => ({ students: state.students.map(s => s.id === id ? { ...s, ...updates } : s) }));
    else console.error('Error updating student:', await res.text());
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
    } else { console.error('Error loading student flight records:', error); set({ loadingFlights: false }); }
  },

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
      // ============================================================
      // FIRST SOLO CELEBRATION CHECK
      // ============================================================
      // If this is a SOLO flight, check if it's the student's first solo
      // If so, record the date in the students table for celebration display
      if (record.flightType === 'SOLO' || record.sortieType === 'SOLO') {
        const student = get().students.find(s => s.id === record.studentId);
        if (student && !student.firstSoloDate) {
          // Update the student's first solo date via the students API
          // (routed through the server — see app/api/students/[id]/route.ts)
          // rather than writing to the `students` table directly from the browser.
          await get().updateStudent(record.studentId, { firstSoloDate: record.flightDate });
        }
      }

      // Update total hours
      const student = get().students.find(s => s.id === record.studentId);
      const newTotalHours = (student?.totalHours || 0) + record.totalHours;
      await get().updateStudent(record.studentId, { totalHours: newTotalHours });

      // Reload data to reflect all changes
      await get().loadStudents();
      await get().loadFlightRecords();
    }
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
            exercise: (row as any).exercise || '',
            weatherBriefed: row.weather_briefed as boolean, notamBriefed: row.notam_briefed as boolean,
            notes: row.notes as string, aircraftReg: ac?.registration || 'Unknown',
            studentName: student?.name || 'None', instructorName: inst?.name || 'Unknown',
            duration: Math.round((endTime.getTime() - startTime.getTime()) / 360000) / 10,
          };
        }),
        loadingSchedule: false,
      });
    } else { console.error('Error loading scheduled flights:', error); set({ loadingSchedule: false }); }
  },

  checkConflicts: async (aircraftId, startTime, endTime, excludeId?) => {
    const bufferedStart = new Date(startTime); bufferedStart.setMinutes(bufferedStart.getMinutes() - 30);
    const bufferedEnd = new Date(endTime); bufferedEnd.setMinutes(bufferedEnd.getMinutes() + 30);
    let query = supabase.from('scheduled_flights').select('*')
      .eq('aircraft_id', aircraftId)
      .lt('start_time', bufferedEnd.toISOString())
      .gt('end_time', bufferedStart.toISOString());
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
    const conflict = await get().checkConflicts(booking.aircraftId, booking.startTime, booking.endTime);
    if (conflict.hasConflict) {
      return { success: false, message: '⚠️ Time conflict with 30‑min buffer.' };
    }
    const { error } = await supabase.from('scheduled_flights').insert({
      aircraft_id: booking.aircraftId, instructor_id: booking.instructorId,
      student_id: booking.studentId || null, start_time: booking.startTime, end_time: booking.endTime,
      sortie_type: booking.sortieType, exercise: (booking as any).exercise || '',
      status: booking.status || 'SCHEDULED',
      weather_briefed: booking.weatherBriefed || false, notam_briefed: booking.notamBriefed || false,
      notes: booking.notes || '',
    });
    if (!error) { await get().loadScheduledFlights(); return { success: true, message: '✅ Flight booked!' }; }
    return { success: false, message: '❌ Failed to book flight.' };
  },

  cancelFlight: async (id) => {
    const { error } = await supabase.from('scheduled_flights').delete().eq('id', id);
    if (!error) set(state => ({ scheduledFlights: state.scheduledFlights.filter(f => f.id !== id) }));
  },

  updateScheduledFlight: async (id, updates) => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.aircraftId !== undefined) dbUpdates.aircraft_id = updates.aircraftId;
    if (updates.instructorId !== undefined) dbUpdates.instructor_id = updates.instructorId;
    if (updates.studentId !== undefined) dbUpdates.student_id = updates.studentId;
    if (updates.startTime !== undefined) dbUpdates.start_time = updates.startTime;
    if (updates.endTime !== undefined) dbUpdates.end_time = updates.endTime;
    if (updates.sortieType !== undefined) dbUpdates.sortie_type = updates.sortieType;
    if ((updates as any).exercise !== undefined) dbUpdates.exercise = (updates as any).exercise;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
    if (updates.weatherBriefed !== undefined) dbUpdates.weather_briefed = updates.weatherBriefed;
    if (updates.notamBriefed !== undefined) dbUpdates.notam_briefed = updates.notamBriefed;
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
    } else { console.error('Error loading maintenance records:', error); set({ loadingMaintenance: false }); }
  },

  addMaintenanceRecord: async (record) => {
    const { error } = await supabase.from('maintenance_records').insert({
      aircraft_id: record.aircraftId, maintenance_type: record.maintenanceType,
      description: record.description, scheduled_date: record.scheduledDate,
      completed_date: record.completedDate, status: record.status, cost: record.cost,
      performed_by: record.performedBy, notes: record.notes,
    });
    if (!error) await get().loadMaintenanceRecords();
  },

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
    if (!error) set(state => ({ maintenanceRecords: state.maintenanceRecords.map(m => m.id === id ? { ...m, ...updates } : m) }));
  },

  removeMaintenanceRecord: async (id) => {
    const { error } = await supabase.from('maintenance_records').delete().eq('id', id);
    if (!error) set(state => ({ maintenanceRecords: state.maintenanceRecords.filter(m => m.id !== id) }));
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
        })),
        loadingInstructors: false,
      });
    } else { console.error('Error loading instructors:', error); set({ loadingInstructors: false }); }
  },

  addInstructor: async (instructor) => {
    const { data, error } = await supabase.from('instructors').insert({
      name: instructor.name, initials: instructor.initials, license_number: instructor.licenseNumber,
      ratings: instructor.ratings, max_daily_hours: instructor.maxDailyHours,
      email: instructor.email, phone: instructor.phone, status: instructor.status,
    }).select().single();
    if (data && !error) set(state => ({ instructors: [...state.instructors, { ...instructor, id: String(data.id) }] }));
  },

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
    if (!error) set(state => ({ instructors: state.instructors.map(i => i.id === id ? { ...i, ...updates } : i) }));
  },

  removeInstructor: async (id) => {
    const { error } = await supabase.from('instructors').delete().eq('id', id);
    if (!error) set(state => ({ instructors: state.instructors.filter(i => i.id !== id) }));
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
        trainingRequirements: data.map((row: Record<string, unknown>) => ({
          id: String(row.id), studentId: String(row.student_id),
          requirementName: row.requirement_name as string, requirementCategory: row.requirement_category as string,
          isCompleted: row.is_completed as boolean, completedDate: row.completed_date as string || undefined,
          completedBy: row.completed_by as string || undefined, notes: row.notes as string || undefined,
          sortOrder: row.sort_order as number, validityYears: row.validity_years as number || undefined,
          requiredBeforeHours: row.required_before_hours as number || undefined,
          blocksSolo: row.blocks_solo as boolean, blocksAllFlights: row.blocks_all_flights as boolean,
          programCode: row.program_code as string,
        })),
        loadingRequirements: false,
      });
    } else { console.error('Error loading training requirements:', error); set({ loadingRequirements: false }); }
  },

  toggleRequirement: async (id, isCompleted, completedBy) => {
    const updates: Record<string, unknown> = { is_completed: isCompleted };
    if (isCompleted) { updates.completed_date = new Date().toISOString().split('T')[0]; if (completedBy) updates.completed_by = completedBy; }
    else { updates.completed_date = null; updates.completed_by = null; }
    await supabase.from('training_requirements').update(updates).eq('id', id);
    set(state => ({
      trainingRequirements: state.trainingRequirements.map(r =>
        r.id === id ? { ...r, isCompleted, completedDate: isCompleted ? new Date().toISOString().split('T')[0] : undefined, completedBy: isCompleted ? completedBy : undefined } : r
      )
    }));
  },

  addRequirement: async (requirement) => {
    const { data, error } = await supabase.from('training_requirements').insert({
      student_id: requirement.studentId || null, requirement_name: requirement.requirementName,
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
      set({ ftoSettings: settings });
    } else {
      console.error('❌ Error loading FTO settings:', error);
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
  // UI STATE FUNCTIONS
  // ============================================================
  setSelectedSlot: (slot) => set({ selectedSlot: slot }),
  setHoveredSlot: (id) => set({ hoveredSlot: id }),
  getInstructorById: (id) => get().instructors.find(i => i.id === id),
  getSlotsForAircraft: (aircraftId) => get().schedule.filter(s => s.aircraftId === aircraftId),
}));
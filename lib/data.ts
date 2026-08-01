// lib/data.ts
import { Aircraft, Instructor, Student, FlightSlot, WeatherData, NOTAM } from '@/types';

export const aircraftData: Aircraft[] = [
  { id: 'ac1', registration: 'N123AB', type: 'C172S', model: 'Cessna 172S Skyhawk G1000', year: 2020, hobbsTime: 1245.3, fuelCapacity: 250, currentFuel: 212, status: 'ACTIVE', nextMaintenance: '2024-02-15' },
  { id: 'ac2', registration: 'N456CD', type: 'PA28', model: 'Piper PA28-161 Warrior III', year: 2019, hobbsTime: 2890.5, fuelCapacity: 200, currentFuel: 180, status: 'MAINTENANCE', nextMaintenance: '2024-01-15' },
  { id: 'ac3', registration: 'N789EF', type: 'DA40', model: 'Diamond DA40 NG', year: 2022, hobbsTime: 567.8, fuelCapacity: 180, currentFuel: 95, status: 'ACTIVE', nextMaintenance: '2024-03-20' },
  { id: 'ac4', registration: 'N111AA', type: 'C152', model: 'Cessna 152 Aerobat', year: 2018, hobbsTime: 3567.2, fuelCapacity: 150, currentFuel: 120, status: 'ACTIVE', nextMaintenance: '2024-04-10' },
  { id: 'ac5', registration: 'N222BB', type: 'C172S', model: 'Cessna 172S Skyhawk', year: 2021, hobbsTime: 890.1, fuelCapacity: 250, currentFuel: 200, status: 'ACTIVE', nextMaintenance: '2024-05-01' },
];

export const instructorData: Instructor[] = [
  { id: 'inst1', name: 'Sarah Mitchell', initials: 'SM', licenseNumber: 'CFI-12345', ratings: 'CFI, CFII, MEI', maxDailyHours: 8, email: 'sarah@flightpro.com', phone: '', status: 'AVAILABLE' },
  { id: 'inst2', name: 'Michael Kim', initials: 'MK', licenseNumber: 'CFI-12346', ratings: 'CFI, CFII', maxDailyHours: 8, email: 'michael@flightpro.com', phone: '', status: 'AVAILABLE' },
  { id: 'inst3', name: 'Robert Chen', initials: 'RC', licenseNumber: 'CFI-12347', ratings: 'CFI, MEI', maxDailyHours: 8, email: 'robert@flightpro.com', phone: '', status: 'AVAILABLE' },
  { id: 'inst4', name: 'Anna Baker', initials: 'AB', licenseNumber: 'CFI-12348', ratings: 'CFI', maxDailyHours: 6, email: 'anna@flightpro.com', phone: '', status: 'AVAILABLE' },
];

export const studentData: Student[] = [
  { id: 'stu1', name: 'John Doe', initials: 'JD', enrollmentId: 'STU-001', trainingStage: 'PPL Phase 2', totalHours: 24.5, medicalExpiry: '2024-12-31' },
  { id: 'stu2', name: 'Emma Wilson', initials: 'EW', enrollmentId: 'STU-002', trainingStage: 'IR', totalHours: 85.0, medicalExpiry: '2025-06-15' },
  { id: 'stu3', name: 'Mike Brown', initials: 'MB', enrollmentId: 'STU-003', trainingStage: 'PPL Phase 1', totalHours: 14.0, medicalExpiry: '2024-11-30' },
  { id: 'stu4', name: 'Alex Kumar', initials: 'AK', enrollmentId: 'STU-004', trainingStage: 'CPL', totalHours: 150.0, medicalExpiry: '2025-01-15' },
  { id: 'stu5', name: 'Priya Joshi', initials: 'PJ', enrollmentId: 'STU-005', trainingStage: 'PPL Phase 1', totalHours: 8.0, medicalExpiry: '2025-03-20' },
];

export function generateSchedule(): FlightSlot[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const makeSlot = (id: string, acId: string, instId: string, stuId: string | undefined, startH: number, startM: number, endH: number, endM: number, sortie: FlightSlot['sortieType'], status: FlightSlot['status'] = 'SCHEDULED'): FlightSlot => {
    const start = new Date(today); start.setHours(startH, startM, 0, 0);
    const end = new Date(today); end.setHours(endH, endM, 0, 0);
    return { id, aircraftId: acId, instructorId: instId, studentId: stuId, startTime: start.toISOString(), endTime: end.toISOString(), sortieType: sortie, status, weatherBriefed: Math.random() > 0.3, notamBriefed: Math.random() > 0.3 };
  };
  return [
    makeSlot('slot1', 'ac3', 'inst1', undefined, 6, 0, 8, 0, 'CHECK_RIDE'),
    makeSlot('slot2', 'ac1', 'inst1', 'stu1', 8, 0, 10, 0, 'CIRCUIT_SOLO', 'IN_PROGRESS'),
    makeSlot('slot3', 'ac1', 'inst2', 'stu2', 10, 30, 13, 0, 'STALL_RECOVERY'),
    makeSlot('slot4', 'ac1', 'inst1', 'stu3', 13, 30, 16, 0, 'CROSS_COUNTRY'),
    makeSlot('slot5', 'ac4', 'inst3', 'stu4', 8, 0, 10, 30, 'NAVIGATION'),
    makeSlot('slot6', 'ac4', 'inst4', 'stu5', 11, 0, 13, 0, 'CIRCUIT_DUAL'),
    makeSlot('slot7', 'ac5', 'inst2', 'stu1', 7, 0, 9, 0, 'SOLO_CONSOLIDATION'),
    makeSlot('slot8', 'ac5', 'inst3', 'stu2', 9, 30, 12, 0, 'INSTRUMENT'),
    makeSlot('slot9', 'ac3', 'inst2', 'stu3', 8, 30, 10, 0, 'EMERGENCY_PROCEDURES'),
    makeSlot('slot10', 'ac3', 'inst4', 'stu4', 10, 30, 13, 30, 'NIGHT_FLIGHT'),
  ];
}

export const weatherData: WeatherData = { metar: 'VOBL 150730Z 27005KT 8000 FEW020 SCT100 22/15 Q1013 NOSIG', taf: 'VOBL 150600Z 1506/1606 27008KT 8000 FEW020 SCT100 TEMPO 1512/1518 5000 TSRA', temperature: 22, windDirection: 270, windSpeed: 5, visibility: 8000, ceiling: 2000, qnh: 1013, flightRules: 'VFR', warnings: [] };
export const notamData: NOTAM[] = [
  { id: 'n1', number: 'A1234/24', text: 'TWY B CLOSED. Use TWY A.', startTime: '2024-01-15T07:00', endTime: '2024-01-15T18:00', priority: 'HIGH', category: 'RUNWAY' },
  { id: 'n2', number: 'A1235/24', text: 'Bird activity vicinity AD.', startTime: '2024-01-15T00:00', endTime: '2024-01-15T23:59', priority: 'MODERATE', category: 'OTHER' },
  { id: 'n3', number: 'A1236/24', text: 'NDB BL 342kHz U/S.', startTime: '2024-01-15T06:00', endTime: '2024-01-16T06:00', priority: 'LOW', category: 'NAVIGATION' },
];
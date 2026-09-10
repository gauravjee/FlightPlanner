// lib/flight-hours.test.ts
// Run: npx tsx lib/flight-hours.test.ts   (no test framework needed)
//
// Covers the solo-vs-PICUS split — the part that decides whether a CPL
// candidate's command time is counted correctly.

import assert from 'node:assert/strict';
import { picHoursFor, totalPicHours, totalSoloHours } from './flight-hours';
import type { FlightRecord } from '../types';

const f = (over: Partial<FlightRecord>): FlightRecord => ({
  id: '1', studentId: 's', aircraftId: 'a', instructorId: 'i',
  flightDate: '2026-09-10', departureTime: '09:00', arrivalTime: '10:00',
  hobbsStart: 0, hobbsEnd: 1, totalHours: 1, landings: 1,
  flightType: 'DUAL', sortieType: 'NAVIGATION', maneuvers: '',
  instructorNotes: '', studentPerformance: 0, weatherConditions: '',
  ...over,
});

// Solo: the whole flight is command time, derived not stored.
assert.equal(picHoursFor(f({ flightType: 'SOLO', totalHours: 1.5 })), 1.5);
// A solo row must ignore any stray picusHours rather than double-count it.
assert.equal(picHoursFor(f({ flightType: 'SOLO', totalHours: 1.5, picusHours: 1.5 })), 1.5);

// Dual: nothing unless the instructor marked it.
assert.equal(picHoursFor(f({ totalHours: 2 })), 0, 'unmarked dual credits no PIC');
assert.equal(picHoursFor(f({ totalHours: 2, picusHours: 1.2 })), 1.2);
// 0 is a real recorded value, not "unset" — it just credits nothing.
assert.equal(picHoursFor(f({ totalHours: 2, picusHours: 0 })), 0);
// Clamp: never credit more command time than the aircraft was airborne.
assert.equal(picHoursFor(f({ totalHours: 1, picusHours: 5 })), 1, 'clamped to flight duration');

// The headline case: solo + PICUS, and solo reported separately.
const set = [
  f({ flightType: 'SOLO', totalHours: 2 }),
  f({ totalHours: 3, picusHours: 1.5 }),
  f({ totalHours: 1 }),
];
assert.equal(totalPicHours(set), 3.5, '2 solo + 1.5 PICUS');
assert.equal(totalSoloHours(set), 2, 'solo excludes PICUS');

console.log('flight-hours: all assertions passed');

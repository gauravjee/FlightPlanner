// lib/instructor-status.test.ts
// Run: npx tsx lib/instructor-status.test.ts   (no test framework needed)
//
// Covers the daily flying limit (a hard block) and the computed status.

import assert from 'node:assert/strict';
import { computeInstructorStatus, dayHours, effectiveDailyLimit, exceedsDailyLimit, type FlightLike } from './instructor-status';

// Effective limit: lower of the two; bad values ignored; never vanishes.
assert.equal(effectiveDailyLimit(8, 7), 7);
assert.equal(effectiveDailyLimit(5, '7'), 5);
assert.equal(effectiveDailyLimit(0, 7), 7);
assert.equal(effectiveDailyLimit(undefined, 'abc'), 7);
assert.equal(effectiveDailyLimit(6, undefined), 6);

// 29 Sep 2026, IST. 04:30Z = 10:00 IST.
const f = (id: number, start: string, end: string, status = 'SCHEDULED', instructorId = '6'): FlightLike =>
  ({ id, instructorId, startTime: start, endTime: end, status });
const day: FlightLike[] = [
  f(1, '2026-09-29T01:30:00Z', '2026-09-29T03:30:00Z', 'COMPLETED'),   // 07:00-09:00 IST, 2h flown
  f(2, '2026-09-29T04:30:00Z', '2026-09-29T06:30:00Z'),                // 10:00-12:00 IST, 2h booked
  f(3, '2026-09-29T07:30:00Z', '2026-09-29T09:30:00Z', 'CANCELLED'),   // cancelled: frees 2h
  f(4, '2026-09-29T08:30:00Z', '2026-09-29T09:30:00Z', 'PENDING_APPROVAL'), // 1h, holds its slot
  f(5, '2026-09-29T04:30:00Z', '2026-09-29T06:30:00Z', 'SCHEDULED', '7'),   // other instructor
  f(6, '2026-09-28T04:30:00Z', '2026-09-28T09:30:00Z'),                // other day
];

// Booked + flown + pending count; cancelled, other instructors, other days don't.
assert.equal(dayHours(day, '6', '2026-09-29'), 5);
assert.equal(dayHours(day, '6', '2026-09-29', 2), 3); // editing flight 2 doesn't double-count it

// Limit 7: 5h used, +2h = 7h lands exactly on the limit (allowed); +2.5h doesn't.
assert.equal(exceedsDailyLimit(day, '6', '2026-09-29T10:30:00Z', '2026-09-29T12:30:00Z', 7).exceeded, false);
assert.equal(exceedsDailyLimit(day, '6', '2026-09-29T10:30:00Z', '2026-09-29T13:00:00Z', 7).exceeded, true);
// Moving flight 2 to a longer slot is checked without counting its old slot.
assert.deepEqual(exceedsDailyLimit(day, '6', '2026-09-29T04:30:00Z', '2026-09-29T08:30:00Z', 7, 2), { exceeded: false, used: 3, after: 7 });

// Computed status — priority order.
const now = new Date('2026-09-29T05:00:00Z'); // 10:30 IST
const base = { instructorId: '6', now, flights: [] as FlightLike[], leaves: [], limit: 7, openStart: '06:00', openEnd: '20:00' };
assert.equal(computeInstructorStatus(base), 'AVAILABLE');
assert.equal(computeInstructorStatus({ ...base, flights: [f(9, '2026-09-29T04:30:00Z', '2026-09-29T06:30:00Z', 'IN_PROGRESS')] }), 'FLYING');
assert.equal(computeInstructorStatus({ ...base, limit: 2, flights: [f(9, '2026-09-29T01:30:00Z', '2026-09-29T03:30:00Z', 'COMPLETED')] }), 'LIMIT_REACHED');
assert.equal(computeInstructorStatus({ ...base, offDutyDate: '2026-09-29' }), 'OFF_DUTY');
assert.equal(computeInstructorStatus({ ...base, offDutyDate: '2026-09-28' }), 'AVAILABLE'); // yesterday's override expired
assert.equal(computeInstructorStatus({ ...base, now: new Date('2026-09-29T15:00:00Z') }), 'OFF_DUTY'); // 20:30 IST, after opening hours
const leave = { person_type: 'instructor', person_id: '6', status: 'APPROVED', start_date: '2026-09-29', end_date: '2026-09-29', start_time: '10:00:00', end_time: '11:00:00' };
assert.equal(computeInstructorStatus({ ...base, leaves: [leave] }), 'ON_LEAVE'); // 10:30 inside 10:00-11:00
assert.equal(computeInstructorStatus({ ...base, leaves: [{ ...leave, start_time: '12:00:00', end_time: '13:00:00' }] }), 'AVAILABLE');
assert.equal(computeInstructorStatus({ ...base, leaves: [{ ...leave, status: 'PENDING' }] }), 'AVAILABLE');
// Leave outranks everything, including flying.
assert.equal(computeInstructorStatus({ ...base, leaves: [leave], flights: [f(9, '2026-09-29T04:30:00Z', '2026-09-29T06:30:00Z', 'IN_PROGRESS')] }), 'ON_LEAVE');

// 2026-09-23: with a roster duty window (10:30 IST now), it replaces the
// off-duty-today and opening-hours checks; limit/flying/leave still win.
assert.equal(computeInstructorStatus({ ...base, duty: { start: '06:00', end: '14:00' } }), 'AVAILABLE');
assert.equal(computeInstructorStatus({ ...base, duty: { start: '12:00', end: '20:00' } }), 'OFF_DUTY'); // shift starts later
assert.equal(computeInstructorStatus({ ...base, duty: null }), 'OFF_DUTY');                              // day off
assert.equal(computeInstructorStatus({ ...base, duty: null, limit: 2, flights: [f(9, '2026-09-29T01:30:00Z', '2026-09-29T03:30:00Z', 'COMPLETED')] }), 'LIMIT_REACHED');

console.log('instructor-status: all checks passed');

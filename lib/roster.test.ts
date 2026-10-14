// lib/roster.test.ts
// Run: npx tsx lib/roster.test.ts   (no test framework needed)
//
// Covers the duty-roster rule: which window applies, and whether a flight fits.

import assert from 'node:assert/strict';
import { dutyWindow, flightFitsDuty, onDutyAt, describeWindow, weekdayOf, rosterOverlap, type WeeklyRow, type RosterException } from './roster';

// 27 Sep 2026 is a Sunday, 28 Sep a Monday.
assert.equal(weekdayOf('2026-09-27'), 0);
assert.equal(weekdayOf('2026-09-28'), 1);

const weekly: WeeklyRow[] = [
  { instructorId: '6', weekday: 1, startTime: '06:00:00', endTime: '14:00:00' }, // Mon (DB 'HH:MM:SS')
  { instructorId: '6', weekday: 2, startTime: null, endTime: null },             // Tue off
  { instructorId: '6', weekday: 3, startTime: '12:00', endTime: '20:00' },       // Wed
];
const exceptions: RosterException[] = [
  { instructorId: '6', date: '2026-09-30', startTime: '08:00', endTime: '10:00' }, // a Wed, shorter
  { instructorId: '6', date: '2026-10-05', startTime: null, endTime: null },       // a Mon, off
];
const base = { weekly, exceptions, openStart: '06:00', openEnd: '20:00' };
const w = (instructorId: string, date: string, offDutyDate?: string | null) => dutyWindow({ ...base, instructorId, date, offDutyDate });

// Weekly pattern; seconds from the DB are trimmed.
assert.deepEqual(w('6', '2026-09-28'), { window: { start: '06:00', end: '14:00' }, source: 'weekly' });
// Rostered instructor: a day marked off, and a day with no row at all, are both off.
assert.deepEqual(w('6', '2026-09-29'), { window: null, source: 'weekly' });
assert.deepEqual(w('6', '2026-10-01'), { window: null, source: 'weekly' }); // Thu, no row
// Exception beats the weekly pattern — shorter hours, or a day off.
assert.deepEqual(w('6', '2026-09-30'), { window: { start: '08:00', end: '10:00' }, source: 'exception' });
assert.deepEqual(w('6', '2026-10-05'), { window: null, source: 'exception' });
// "Off duty today" beats everything.
assert.deepEqual(w('6', '2026-09-28', '2026-09-28'), { window: null, source: 'off-duty-today' });
assert.deepEqual(w('6', '2026-09-28', '2026-09-27'), { window: { start: '06:00', end: '14:00' }, source: 'weekly' }); // yesterday's mark expired
// No roster at all -> opening hours; no opening hours either -> whole day.
assert.deepEqual(w('7', '2026-09-28'), { window: { start: '06:00', end: '20:00' }, source: 'opening-hours' });
assert.deepEqual(dutyWindow({ instructorId: '7', date: '2026-09-28', weekly, exceptions }), { window: { start: '00:00', end: '24:00' }, source: 'opening-hours' });
// ids compare as strings (DB bigint vs session string).
assert.equal(dutyWindow({ ...base, instructorId: 6 as unknown as string, date: '2026-09-28' }).source, 'weekly');

// Does a flight fit? Mon 06:00-14:00 IST. 00:30Z = 06:00 IST, 08:30Z = 14:00 IST.
const mon = { start: '06:00', end: '14:00' };
assert.equal(flightFitsDuty(mon, '2026-09-28T00:30:00Z', '2026-09-28T01:30:00Z'), true);   // 06:00-07:00, starts on the edge
assert.equal(flightFitsDuty(mon, '2026-09-28T07:30:00Z', '2026-09-28T08:30:00Z'), true);   // 13:00-14:00, ends on the edge
assert.equal(flightFitsDuty(mon, '2026-09-28T07:45:00Z', '2026-09-28T08:45:00Z'), false);  // 13:15-14:15, runs over
assert.equal(flightFitsDuty(mon, '2026-09-28T00:15:00Z', '2026-09-28T01:15:00Z'), false);  // 05:45 start, too early
assert.equal(flightFitsDuty(null, '2026-09-28T01:30:00Z', '2026-09-28T02:30:00Z'), false); // off
// Past midnight never fits one day's shift; ending exactly at midnight fits a 24:00 window.
const allDay = { start: '00:00', end: '24:00' };
assert.equal(flightFitsDuty(allDay, '2026-09-28T17:30:00Z', '2026-09-28T18:30:00Z'), true);  // 23:00-00:00 IST
assert.equal(flightFitsDuty(allDay, '2026-09-28T18:00:00Z', '2026-09-28T19:00:00Z'), false); // 23:30-00:30 IST

// Status helper and label.
assert.equal(onDutyAt(mon, '06:00'), true);
assert.equal(onDutyAt(mon, '13:59'), true);
assert.equal(onDutyAt(mon, '14:00'), false);
assert.equal(onDutyAt(null, '10:00'), false);
assert.equal(describeWindow(mon), '06:00–14:00');
assert.equal(describeWindow(null), 'Off');

// Multi-base M4a: rows without a base are Base 1, so everything above is unchanged.
const mb: WeeklyRow[] = [
  { instructorId: '8', weekday: 1, startTime: '06:00', endTime: '12:00', baseId: 1 }, // Mon B1
  { instructorId: '8', weekday: 1, startTime: '13:00', endTime: '18:00', baseId: 2 }, // Mon B2
];
const mbEx: RosterException[] = [{ instructorId: '8', date: '2026-09-29', startTime: '09:00', endTime: '11:00', baseId: 2 }]; // Tue at B2
const at = (baseId: number, date: string) => dutyWindow({ instructorId: '8', date, weekly: mb, exceptions: mbEx, baseId, openStart: '06:00', openEnd: '20:00' });
assert.deepEqual(at(1, '2026-09-28'), { window: { start: '06:00', end: '12:00' }, source: 'weekly' });
assert.deepEqual(at(2, '2026-09-28'), { window: { start: '13:00', end: '18:00' }, source: 'weekly' });
assert.deepEqual(at(3, '2026-09-28'), { window: null, source: 'other-base' });          // not rostered at base 3
assert.deepEqual(at(2, '2026-09-29'), { window: { start: '09:00', end: '11:00' }, source: 'exception' });
assert.equal(dutyWindow({ instructorId: '6', date: '2026-09-28', weekly, exceptions, baseId: 2 }).source, 'other-base');
// No weekly anywhere, a change at base 2 that day -> off at base 1 that day, opening hours other days.
const only2: RosterException[] = [{ instructorId: '9', date: '2026-09-28', startTime: '09:00', endTime: '11:00', baseId: 2 }];
assert.equal(dutyWindow({ instructorId: '9', date: '2026-09-28', weekly: [], exceptions: only2 }).source, 'other-base');
assert.equal(dutyWindow({ instructorId: '9', date: '2026-09-29', weekly: [], exceptions: only2 }).source, 'opening-hours');

// Q9 no-overlap.
const ov = (w: WeeklyRow[], e: RosterException[] = []) => rosterOverlap({ instructorId: '8', weekly: w, exceptions: e, fromDate: '2026-09-01' });
assert.equal(ov(mb), null);                                            // 06-12 and 13-18: fine
assert.equal(ov([mb[0], { ...mb[1], startTime: '12:00' }]), null);     // touching is fine
assert.match(ov([mb[0], { ...mb[1], startTime: '11:00' }]) ?? '', /^Mon: Base 1 06:00–12:00 overlaps Base 2 11:00–18:00/);
assert.equal(ov(weekly), null);                                        // one base: never an overlap
// A one-off change that day clashes with the other base's weekly hours (29 Sep is a Tue; make B1 Tue 08-12).
const tue: WeeklyRow = { instructorId: '8', weekday: 2, startTime: '08:00', endTime: '12:00', baseId: 1 };
assert.match(ov([...mb, tue], mbEx) ?? '', /^2026-09-29: Base 1 08:00–12:00 overlaps Base 2 09:00–11:00/);
assert.equal(ov([...mb, tue], [...mbEx, { instructorId: '8', date: '2026-09-29', startTime: null, endTime: null, baseId: 1 }]), null); // B1 off that day
assert.equal(rosterOverlap({ instructorId: '8', weekly: [...mb, tue], exceptions: mbEx, fromDate: '2026-09-30' }), null); // past dates ignored
assert.match(rosterOverlap({ instructorId: '8', weekly: [mb[0], { ...mb[1], startTime: '11:00' }], exceptions: [], fromDate: '2026-09-01', baseName: b => (b === 1 ? 'Shirpur' : 'B2') }) ?? '', /^Mon: Shirpur .* overlaps B2 /);

console.log('roster: all checks passed');

// lib/duty-roster-report.test.ts
// Run: npx tsx lib/duty-roster-report.test.ts   (no test framework needed)

import assert from 'node:assert/strict';
import { buildRosterReport, mondayOf, dayLabel, formatHours, daysInclusive, MAX_REPORT_DAYS } from './duty-roster-report';

assert.equal(mondayOf('2026-09-23'), '2026-09-21'); // Wed -> Mon
assert.equal(mondayOf('2026-09-27'), '2026-09-21'); // Sun belongs to the week before
assert.equal(mondayOf('2026-09-28'), '2026-09-28');
assert.equal(dayLabel('2026-09-28'), 'Mon 28 Sep');
assert.equal(formatHours(3.5), '3.5h');
assert.equal(formatHours(7), '7h');
// Range length counts both ends: 1 Oct to 29 Dec is exactly the 90-day limit.
assert.equal(daysInclusive('2026-10-01', '2026-10-01'), 1);
assert.equal(daysInclusive('2026-10-01', '2026-10-31'), 31);
assert.equal(daysInclusive('2026-10-01', '2026-12-29'), MAX_REPORT_DAYS);
assert.equal(daysInclusive('2026-10-01', '2026-12-30'), MAX_REPORT_DAYS + 1);

// Week of Mon 28 Sep 2026. Instructor 6 rostered Mon-Sat 06:00-14:00, Sun off.
const weekly = [1, 2, 3, 4, 5, 6].map(d => ({ instructorId: '6', weekday: d, startTime: '06:00', endTime: '14:00' }))
  .concat([{ instructorId: '6', weekday: 0, startTime: null as unknown as string, endTime: null as unknown as string }]);
const r = buildRosterReport({
  from: '2026-09-28', to: '2026-10-04',
  instructors: [
    { id: '6', name: 'Dummy Instructor', initials: 'DI', offDutyDate: '2026-10-02' }, // off duty Fri
    { id: '7', name: 'New Instructor', initials: 'NI' },                              // no roster
  ],
  weekly,
  exceptions: [{ instructorId: '6', date: '2026-09-29', startTime: '08:00', endTime: '10:00', note: 'Checkride' }],
  leaves: [{ personId: '6', start_date: '2026-09-30', end_date: '2026-09-30', start_time: '10:00:00', end_time: '12:00:00' }],
  flights: [
    { id: 1, instructorId: '6', startTime: '2026-09-28T03:30:00Z', endTime: '2026-09-28T05:00:00Z', status: 'SCHEDULED' },  // Mon 09:00-10:30 IST
    { id: 2, instructorId: '6', startTime: '2026-09-28T06:30:00Z', endTime: '2026-09-28T08:30:00Z', status: 'COMPLETED' },  // Mon 12:00-14:00
    { id: 3, instructorId: '6', startTime: '2026-09-28T09:30:00Z', endTime: '2026-09-28T10:30:00Z', status: 'CANCELLED' },  // doesn't count
  ],
  openStart: '06:00', openEnd: '20:00',
  closedReason: d => (d === '2026-10-04' ? 'Weekly off (Sunday)' : d === '2026-10-02' ? 'Gandhi Jayanti' : null),
});

assert.deepEqual(r.days.map(d => d.date), ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
const di = r.rows[0].cells;
assert.deepEqual(di[0], { kind: 'duty', text: '06:00–14:00 · 3.5h booked', changed: false, booked: 3.5 });
assert.deepEqual(di[1], { kind: 'duty', text: '08:00–10:00*', changed: true, booked: 0 });          // one-off change
assert.deepEqual(di[2], { kind: 'leave', text: '06:00–14:00 · Leave 10:00–12:00', changed: false, booked: 0 }); // part-day leave
assert.equal(di[3].text, '06:00–14:00');
assert.equal(di[4].text, 'Closed');                                                               // holiday beats off-duty-today
assert.equal(di[6].text, 'Closed');
// Rostered: Mon 8 + Tue 2 + Wed 6 (8 minus the 2h leave) + Thu 8 + Sat 8 = 32; closed days don't count.
assert.equal(r.rows[0].rosteredHours, 32);
assert.equal(r.rows[0].bookedHours, 3.5);
assert.deepEqual(r.notes, ['Tue 29 Sep, Dummy Instructor: one-off change — Checkride']);
// No roster -> opening hours every open day.
assert.equal(r.rows[1].cells[0].text, '06:00–20:00');
assert.equal(r.rows[1].rosteredHours, 14 * 5);

// Full-day leave: no hours at all.
const full = buildRosterReport({
  from: '2026-09-28', to: '2026-10-04', instructors: [{ id: '6', name: 'D', initials: 'D' }], weekly, exceptions: [],
  leaves: [{ personId: '6', start_date: '2026-09-28', end_date: '2026-09-28' }], flights: [], closedReason: () => null,
});
assert.equal(full.rows[0].cells[0].text, 'Leave');
assert.equal(full.rows[0].rosteredHours, 8 * 5); // Tue-Sat only

// Any range, not just a week: a whole month gives one entry per day.
const month = buildRosterReport({
  from: '2026-10-01', to: '2026-10-31', instructors: [{ id: '6', name: 'D', initials: 'D' }], weekly, exceptions: [],
  leaves: [], flights: [], closedReason: d => (d === '2026-10-02' ? 'Holiday' : null),
});
assert.equal(month.days.length, 31);
assert.equal(month.rows[0].cells.length, 31);
assert.equal(month.days[1].closed, 'Holiday');

console.log('duty-roster-report: all checks passed');

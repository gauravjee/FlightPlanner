// lib/leave-window.test.ts
// Run: npx tsx lib/leave-window.test.ts   (no test framework needed)
//
// Covers the rule that decides whether approved leave cancels / blocks a
// flight — partial-day leave must only hit flights inside its window.

import assert from 'node:assert/strict';
import { leaveCovers, toIST } from './leave-window';

const fullDay = { start_date: '2026-09-29', end_date: '2026-10-01' };
const morning = { start_date: '2026-09-29', end_date: '2026-09-29', start_time: '08:00:00', end_time: '10:00:00' };
const fromNoon = { start_date: '2026-09-29', end_date: '2026-09-30', start_time: '12:00:00', end_time: null };

// Full-day leave: any time on any day in range, nothing outside it.
assert.equal(leaveCovers(fullDay, '2026-09-30', '06:00', '07:00'), true);
assert.equal(leaveCovers(fullDay, '2026-10-01'), true);
assert.equal(leaveCovers(fullDay, '2026-09-28', '10:00', '11:00'), false);
assert.equal(leaveCovers(fullDay, '2026-10-02', '10:00', '11:00'), false);

// Partial-day leave: only flights overlapping 08:00-10:00.
assert.equal(leaveCovers(morning, '2026-09-29', '09:00', '10:30'), true);   // overlaps the end
assert.equal(leaveCovers(morning, '2026-09-29', '07:00', '08:30'), true);   // overlaps the start
assert.equal(leaveCovers(morning, '2026-09-29', '14:00', '15:00'), false);  // the bug this fixes
assert.equal(leaveCovers(morning, '2026-09-29', '10:00', '11:00'), false);  // starts as leave ends
assert.equal(leaveCovers(morning, '2026-09-29', '07:00', '08:00'), false);  // ends as leave starts
assert.equal(leaveCovers(morning, '2026-09-29'), true);                     // date-only question

// Missing end_time = end of day, every day of the range.
assert.equal(leaveCovers(fromNoon, '2026-09-30', '18:00', '19:00'), true);
assert.equal(leaveCovers(fromNoon, '2026-09-30', '09:00', '10:00'), false);

// IST conversion: 04:30Z is 10:00 IST same day; 20:00Z is 01:30 IST next day.
assert.deepEqual(toIST('2026-09-29T04:30:00.000Z'), { date: '2026-09-29', time: '10:00' });
assert.deepEqual(toIST('2026-09-29T20:00:00+00:00'), { date: '2026-09-30', time: '01:30' });

console.log('leave-window: all checks passed');

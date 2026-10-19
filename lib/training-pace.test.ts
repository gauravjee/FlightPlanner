// lib/training-pace.test.ts
// Run: npx tsx lib/training-pace.test.ts   (no test framework needed)
//
// Covers the cases where a projection can mislead: no target, a stalled
// student who used to fly, a future-dated row, and a crawl that would
// otherwise print a date in the 2040s.

import assert from 'node:assert/strict';
import { paceFor, paceLabel, PACE_WINDOW_DAYS, planFor, planLabel } from './training-pace';

const NOW = '2026-09-11';
const f = (flightDate: string, totalHours: number) => ({ flightDate, totalHours });

// No target configured → null, never 0. Same convention as requirementPercent.
assert.equal(paceFor([f('2026-09-01', 2)], 10, null, NOW), null, 'null target');
assert.equal(paceFor([f('2026-09-01', 2)], 10, 0, NOW), null, 'zero target');

// Target already met — no projection, and it must not go negative.
const done = paceFor([f('2026-09-01', 2)], 205, 200, NOW)!;
assert.equal(done.status, 'complete');
assert.equal(done.remainingHours, 0, 'never negative');
assert.equal(done.projectedDate, null);

// Steady flying: 8h over the 8-week window = 1h/week, 10h to go = 10 weeks.
const steady = paceFor(
  [f('2026-09-01', 4), f('2026-08-20', 4)],
  90, 100, NOW,
)!;
assert.equal(steady.status, 'flying');
assert.equal(steady.hoursPerWeek, 1);
assert.equal(steady.remainingHours, 10);
assert.equal(steady.weeksRemaining, 10);
assert.equal(steady.projectedDate, '2026-11-20', '10 weeks past 11 Sept');
assert.equal(steady.flightsInWindow, 2, 'sample size is reported');

// Flew hard, then stopped. THE case worth surfacing: hours exist, rate is 0.
const stalled = paceFor([f('2026-01-15', 40)], 40, 100, NOW)!;
assert.equal(stalled.status, 'stalled');
assert.equal(stalled.hoursPerWeek, 0);
assert.equal(stalled.weeksRemaining, null);
assert.equal(stalled.lastFlightDate, '2026-01-15', 'last flight still reported');

// Never flown at all.
const never = paceFor([], 0, 100, NOW)!;
assert.equal(never.status, 'stalled');
assert.equal(never.lastFlightDate, null);

// A future-dated row is bad data, not a prediction — excluded from the rate.
const future = paceFor([f('2027-01-01', 50)], 10, 100, NOW)!;
assert.equal(future.status, 'stalled', 'future flight does not create a rate');
assert.equal(future.lastFlightDate, null, 'and does not count as last flown');

// Exactly on the window boundary is OUTSIDE it (window is exclusive at the
// old end), so a single flight that old leaves the student stalled.
const boundary = new Date('2026-09-11T00:00:00');
boundary.setDate(boundary.getDate() - PACE_WINDOW_DAYS);
const onEdge = paceFor([f(boundary.toLocaleDateString('en-CA'), 5)], 5, 100, NOW)!;
assert.equal(onEdge.status, 'stalled', 'window edge excluded');

// A crawl must not print a confident date decades out.
const crawl = paceFor([f('2026-09-10', 0.1)], 1, 200, NOW)!;
assert.equal(crawl.farOff, true);
assert.equal(crawl.projectedDate, null, 'no date when far off');
assert.match(paceLabel(crawl), /over 2 years/);

// Labels carry the sample size, so nobody reads 1 flight as a trend.
assert.match(paceLabel(steady), /1\.0h\/week/);
assert.match(paceLabel(steady), /2 flights in 8w/);
assert.match(paceLabel(stalled), /last flew 2026-01-15/);
assert.equal(paceLabel(done), 'Target met');
assert.equal(paceLabel(never), 'No flights recorded yet');

// Singular/plural, because "1 weeks" in a student-facing card looks broken.
const oneWeek = paceFor([f('2026-09-01', 8)], 99, 100, NOW)!;
assert.match(paceLabel(oneWeek), /~1 week /, 'singular week');
assert.match(paceLabel(paceFor([f('2026-09-01', 1)], 0, 100, NOW)!), /flight in 8w/, 'singular flight');

// ---- plan vs actual (19 Oct) ----
// 40h target over 10 months from 1 Jan 2026; on 11 Sep about 8.3 of 10 months have passed (~33.2h expected).
const plan = (actual: number, asOf = NOW) => planFor(actual, 40, '2026-01-01', 10, asOf);
assert.equal(plan(33)!.status, 'on_track');
assert.ok(Math.abs(plan(33)!.expectedHours - 33.2) < 0.2, 'linear expectation');
assert.equal(plan(20)!.status, 'behind');
assert.match(planLabel(plan(20)!), /^13\.\dh behind plan/);
assert.equal(plan(39)!.status, 'ahead');
assert.equal(plan(30, '2026-12-01')!.status, 'overdue', 'past the planned end, target not met');
assert.match(planLabel(plan(30, '2026-12-01')!), /Planned end 2026-11-01 has passed — 10\.0h still to fly/);
assert.equal(plan(0, '2025-12-01')!.expectedHours, 0, 'before the start nothing is expected');
assert.equal(plan(40), null, 'target met');
assert.equal(planFor(10, 40, null, 10, NOW), null, 'no course start');
assert.equal(planFor(10, 40, '2026-01-01', null, NOW), null, 'no course length');
assert.equal(planFor(10, 0, '2026-01-01', 10, NOW), null, 'no target');

console.log('training-pace: all assertions passed');

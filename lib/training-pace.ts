// lib/training-pace.ts
// ---------------------------------------------------------------------------
// 2026-09-11: "will this student finish, and roughly when" — projected from
// the rate they are ACTUALLY flying, not from a plan.
//
// WHY A PROJECTION AND NOT PACE-VS-PLAN. FlightLogger's Student Progression
// module compares required pace against actual pace. FPM cannot do that
// today and the competitive analysis was wrong to call it "a computed view
// over data we already have":
//
//   • training_programs has hour minimums but NO course duration — nothing
//     says a PPL should take nine months.
//   • students.joinedDate is optional, and is currently null on every row.
//
// Without a duration or a target date there is no required pace to compare
// against. So this measures the one thing the data does support: how fast
// the student is actually flying, and what that implies for the target.
// Plan-based pace is a later addition — see the handoff — and when it
// arrives it should sit ALONGSIDE this, not replace it: "behind plan" and
// "not flying at all" are different problems with different fixes.
//
// WHAT IT IS HONEST ABOUT. A trailing-window rate is a weak estimator on
// small samples, and flight training is lumpy — weather, unserviceable
// aircraft, exams. Every return value carries the window and the number of
// flights it saw so the UI can say "based on 3 flights" rather than
// implying a precision that is not there.
// ---------------------------------------------------------------------------

import type { FlightRecord } from '@/types';

/** Trailing window, in days, that the rate is measured over. */
export const PACE_WINDOW_DAYS = 56; // 8 weeks

/**
 * Beyond this many weeks the projection stops meaning anything — at a
 * crawl the arithmetic will happily return a date in the 2040s. Callers
 * should show the `farOff` flag rather than the date.
 */
const FAR_OFF_WEEKS = 104; // 2 years

export type PaceStatus =
  /** Target already met. */
  | 'complete'
  /** Nothing flown in the window — no rate to project from. */
  | 'stalled'
  /** Flying, with a projection. */
  | 'flying';

export interface Pace {
  status: PaceStatus;
  /** Hours flown per week across the window. 0 when stalled. */
  hoursPerWeek: number;
  /** Flights seen in the window — the sample size behind hoursPerWeek. */
  flightsInWindow: number;
  /** Days the rate was measured over. */
  windowDays: number;
  /** Hours still to fly. 0 when complete. */
  remainingHours: number;
  /** Weeks to the target at the current rate. null when stalled/complete. */
  weeksRemaining: number | null;
  /** ISO date the target is projected to be met. null when stalled/complete/farOff. */
  projectedDate: string | null;
  /** True when the projection is further out than FAR_OFF_WEEKS. */
  farOff: boolean;
  /** ISO date of the most recent flight of any age, or null if never flown. */
  lastFlightDate: string | null;
}

function toISO(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

/**
 * Project progress toward an hours target from recent flying rate.
 *
 * Returns `null` when there is no target to measure against — same
 * convention as requirementPercent() in lib/training-programs.ts, and for
 * the same reason: "no requirement configured" and "no progress" must not
 * render the same.
 *
 * @param flights      This student's flight records. Order does not matter.
 * @param actualHours  Hours flown so far, as the caller already computes it.
 * @param targetHours  The programme's required hours, or null/0 if unset.
 * @param asOf         ISO date to measure from. Defaults to today.
 */
export function paceFor(
  flights: Pick<FlightRecord, 'flightDate' | 'totalHours'>[],
  actualHours: number,
  targetHours: number | null | undefined,
  asOf: string = toISO(new Date()),
): Pace | null {
  if (targetHours == null || !(targetHours > 0)) return null;

  const end = new Date(asOf + 'T00:00:00');
  const start = new Date(end);
  start.setDate(start.getDate() - PACE_WINDOW_DAYS);
  const startISO = toISO(start);

  // A flight dated in the future is bad data, not a prediction — excluded
  // from the rate so one fat-fingered date cannot inflate it.
  const dated = flights.filter(f => f.flightDate && f.flightDate <= asOf);
  const inWindow = dated.filter(f => f.flightDate > startISO);

  const lastFlightDate = dated.length
    ? dated.reduce((max, f) => (f.flightDate > max ? f.flightDate : max), dated[0].flightDate)
    : null;

  const remainingHours = Math.max(0, targetHours - actualHours);
  const hoursInWindow = inWindow.reduce((s, f) => s + (f.totalHours || 0), 0);
  const hoursPerWeek = hoursInWindow / (PACE_WINDOW_DAYS / 7);

  const base = {
    flightsInWindow: inWindow.length,
    windowDays: PACE_WINDOW_DAYS,
    remainingHours,
    lastFlightDate,
  };

  if (remainingHours === 0) {
    return { ...base, status: 'complete', hoursPerWeek, weeksRemaining: null, projectedDate: null, farOff: false };
  }

  // Not "no flights ever" — no flights IN THE WINDOW. A student who flew
  // hard until three months ago and has since stopped is stalled, and that
  // is exactly the case worth surfacing.
  if (hoursPerWeek <= 0) {
    return { ...base, status: 'stalled', hoursPerWeek: 0, weeksRemaining: null, projectedDate: null, farOff: false };
  }

  const weeksRemaining = remainingHours / hoursPerWeek;
  const farOff = weeksRemaining > FAR_OFF_WEEKS;

  let projectedDate: string | null = null;
  if (!farOff) {
    const d = new Date(end);
    d.setDate(d.getDate() + Math.ceil(weeksRemaining * 7));
    projectedDate = toISO(d);
  }

  return { ...base, status: 'flying', hoursPerWeek, weeksRemaining, projectedDate, farOff };
}

/** One-line summary for a progress card. Keep the caveat attached to the number. */
export function paceLabel(p: Pace): string {
  if (p.status === 'complete') return 'Target met';
  if (p.status === 'stalled') {
    return p.lastFlightDate
      ? `No flying in ${p.windowDays / 7} weeks — last flew ${p.lastFlightDate}`
      : 'No flights recorded yet';
  }
  const rate = `${p.hoursPerWeek.toFixed(1)}h/week`;
  const sample = `${p.flightsInWindow} flight${p.flightsInWindow === 1 ? '' : 's'} in ${p.windowDays / 7}w`;
  if (p.farOff) return `${rate} — over 2 years to target at this rate (${sample})`;
  const weeks = Math.ceil(p.weeksRemaining as number);
  return `${rate} — ~${weeks} week${weeks === 1 ? '' : 's'} to target (${sample})`;
}

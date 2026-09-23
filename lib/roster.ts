// lib/roster.ts
// Pure duty-roster rule (2026-09-23), shared by the browser (Duty Roster
// page, BookingForm, Instructors status) and the server (booking routes).
// Only imports lib/leave-window.ts (pure), so it's safe on both sides.
// Design + operator decisions: claude/duty-roster-design-2026-09-23.md.
//
// An instructor's duty window on an IST date — first match wins:
//   1. "Off duty today" (instructors.off_duty_date) on that date -> off
//   2. a one-off exception for that date -> its hours, or off
//   3. a weekly pattern (any rows at all) -> that weekday's hours, or off
//   4. no roster at all -> the FTO's opening hours (as before the roster)
// Times are IST wall-clock 'HH:MM', compared as strings; '24:00' = midnight.

import { toIST } from './leave-window';

export type WeeklyRow = { instructorId: string; weekday: number; startTime: string | null; endTime: string | null };
export type RosterException = { instructorId: string; date: string; startTime: string | null; endTime: string | null };
export type DutySource = 'off-duty-today' | 'exception' | 'weekly' | 'opening-hours';
export type DutyWindow = { start: string; end: string } | null; // null = off
export type DutyResult = { window: DutyWindow; source: DutySource };

export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : null);
const span = (start?: string | null, end?: string | null): DutyWindow => {
  const s = hhmm(start), e = hhmm(end);
  return s && e && e > s ? { start: s, end: e } : null;
};

/** 0 = Sunday … 6 = Saturday, for a 'YYYY-MM-DD' calendar date. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function dutyWindow(args: {
  instructorId: string;
  date: string;
  weekly: WeeklyRow[];
  exceptions: RosterException[];
  offDutyDate?: string | null;
  openStart?: string;
  openEnd?: string;
}): DutyResult {
  const id = String(args.instructorId);
  if (args.offDutyDate === args.date) return { window: null, source: 'off-duty-today' };

  const ex = args.exceptions.find(e => String(e.instructorId) === id && e.date === args.date);
  if (ex) return { window: span(ex.startTime, ex.endTime), source: 'exception' };

  const mine = args.weekly.filter(w => String(w.instructorId) === id);
  if (mine.length) {
    const w = mine.find(r => Number(r.weekday) === weekdayOf(args.date));
    return { window: w ? span(w.startTime, w.endTime) : null, source: 'weekly' };
  }

  // No roster: opening hours; if those aren't set either, the whole day —
  // the roster must never block anyone who hasn't been rostered.
  return { window: span(args.openStart, args.openEnd) ?? { start: '00:00', end: '24:00' }, source: 'opening-hours' };
}

/** True when a flight starts and ends inside the duty window (IST). */
export function flightFitsDuty(window: DutyWindow, startIso: string, endIso: string): boolean {
  if (!window) return false;
  const s = toIST(startIso), e = toIST(endIso);
  const endTime = e.date === s.date ? e.time
    : e.date === nextDay(s.date) && e.time === '00:00' ? '24:00'
    : null; // runs past midnight — never inside one day's shift
  return endTime !== null && s.time >= window.start && endTime <= window.end;
}

/** On duty at this IST wall-clock time? */
export function onDutyAt(window: DutyWindow, time: string): boolean {
  return !!window && time >= window.start && time < window.end;
}

/** 'Off' or '06:00–14:00' — for messages and the calendar. */
export function describeWindow(window: DutyWindow): string {
  return window ? `${window.start}–${window.end}` : 'Off';
}

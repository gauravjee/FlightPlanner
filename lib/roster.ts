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
//
// Multi-base M4a (15 Oct): the roster is per base. Steps 2-3 read only the
// asked base's rows (a row with no baseId is Base 1, the column default).
// Rostered at another base but not this one -> off here ('other-base').

import { toIST } from './leave-window';

export type WeeklyRow = { instructorId: string; weekday: number; startTime: string | null; endTime: string | null; baseId?: number };
export type RosterException = { instructorId: string; date: string; startTime: string | null; endTime: string | null; baseId?: number };
export type DutySource = 'off-duty-today' | 'exception' | 'weekly' | 'other-base' | 'opening-hours';

/** A roster row's base; rows saved before multi-base have none and are Base 1. */
export const rowBase = (r: { baseId?: number | null }): number => Number(r.baseId ?? 1);
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
  baseId?: number; // the base asked about; missing = Base 1
}): DutyResult {
  const id = String(args.instructorId);
  const base = args.baseId ?? 1;
  if (args.offDutyDate === args.date) return { window: null, source: 'off-duty-today' };

  const sameDay = args.exceptions.filter(e => String(e.instructorId) === id && e.date === args.date);
  const ex = sameDay.find(e => rowBase(e) === base);
  if (ex) return { window: span(ex.startTime, ex.endTime), source: 'exception' };

  const mine = args.weekly.filter(w => String(w.instructorId) === id);
  const here = mine.filter(w => rowBase(w) === base);
  if (here.length) {
    const w = here.find(r => Number(r.weekday) === weekdayOf(args.date));
    return { window: w ? span(w.startTime, w.endTime) : null, source: 'weekly' };
  }
  // Rostered elsewhere (a weekly pattern, or a change that day) but not here.
  if (mine.length || sameDay.length) return { window: null, source: 'other-base' };

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

/** Plain-words reason a duty window applies, for refusal messages. */
export function dutySourceNote(source: DutySource): string {
  return source === 'off-duty-today' ? ' (marked off duty today)' : source === 'exception' ? ' (one-off change)'
    : source === 'other-base' ? ' (rostered at another base)' : '';
}

/** 'Off' or '06:00–14:00' — for messages and the calendar. */
export function describeWindow(window: DutyWindow): string {
  return window ? `${window.start}–${window.end}` : 'Off';
}

/**
 * Q9 (operator, 15 Oct): one instructor's duty at two bases may not overlap on the same day.
 * Checks the weekly patterns weekday by weekday, then every date from `fromDate` on that has a
 * one-off change, using the hours that actually apply that day. Returns a refusal or null.
 */
export function rosterOverlap(args: {
  instructorId: string;
  weekly: WeeklyRow[];
  exceptions: RosterException[];
  fromDate: string;
  baseName?: (baseId: number) => string;
}): string | null {
  const id = String(args.instructorId);
  const weekly = args.weekly.filter(w => String(w.instructorId) === id);
  const exceptions = args.exceptions.filter(e => String(e.instructorId) === id);
  const bases = [...new Set([...weekly, ...exceptions].map(rowBase))].sort((a, b) => a - b);
  if (bases.length < 2) return null;
  const name = args.baseName ?? (b => `Base ${b}`);

  const clash = (label: string, windows: [number, DutyWindow][]) => {
    for (let i = 0; i < windows.length; i++) {
      for (let j = i + 1; j < windows.length; j++) {
        const [b1, w1] = windows[i], [b2, w2] = windows[j];
        if (w1 && w2 && w1.start < w2.end && w2.start < w1.end) {
          return `${label}: ${name(b1)} ${describeWindow(w1)} overlaps ${name(b2)} ${describeWindow(w2)}. An instructor can't be on duty at two bases at once.`;
        }
      }
    }
    return null;
  };

  for (let day = 0; day < 7; day++) {
    const msg = clash(WEEKDAY_NAMES[day], bases.map(b => {
      const r = weekly.find(w => rowBase(w) === b && Number(w.weekday) === day);
      return [b, r ? span(r.startTime, r.endTime) : null];
    }));
    if (msg) return msg;
  }
  const dates = [...new Set(exceptions.filter(e => e.date >= args.fromDate).map(e => e.date))].sort();
  for (const date of dates) {
    const msg = clash(date, bases.map(b => [b, dutyWindow({ instructorId: id, date, weekly, exceptions, baseId: b }).window]));
    if (msg) return msg;
  }
  return null;
}

// lib/leave-window.ts
// Pure "does this leave cover this flight?" rule (2026-09-23), shared by the
// browser (useAvailability.checkAvailability, BookingForm, ScheduleBoard) and
// the server (lib/leave.ts). No imports beyond lib/ist.ts, so it's safe on
// both sides.
//
// Leave can be full-day (no times) or partial-day (start_time/end_time, e.g.
// 08:00-10:00). Partial-day leave covers only its window, on every day of its
// date range. A missing end_time means end of day — same as the Availability
// page's "EOD". All times are IST wall-clock 'HH:MM', compared as strings.

import { IST_TIMEZONE } from './ist';

export type LeaveWindow = {
  start_date: string;
  end_date: string;
  start_time?: string | null;
  end_time?: string | null;
};

/** IST calendar date ('YYYY-MM-DD') and wall-clock time ('HH:MM') of a timestamp. */
export function toIST(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE }),
    time: d.toLocaleTimeString('en-GB', { timeZone: IST_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false }),
  };
}

/**
 * True when `leave` covers a flight on `date` running `start`-`end` (IST
 * 'HH:MM'). Omit start/end to ask "any part of this date" (e.g. a date-only
 * check). Overlap is half-open: a flight ending exactly when leave starts
 * does not clash.
 */
export function leaveCovers(leave: LeaveWindow, date: string, start = '00:00', end = '24:00'): boolean {
  if (leave.start_date > date || leave.end_date < date) return false;
  const leaveStart = leave.start_time?.slice(0, 5) || '00:00';
  const leaveEnd = leave.end_time?.slice(0, 5) || '24:00';
  return start < leaveEnd && end > leaveStart;
}

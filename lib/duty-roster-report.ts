// lib/duty-roster-report.ts
// Weekly Duty Roster report (2026-09-23) — pure builder shared by the report
// page and its PDF (lib/pdf.ts generateWeeklyDutyRoster), so both show the
// same thing. Duty hours come from lib/roster.ts (the rule bookings use);
// booked hours from lib/instructor-status.ts dayHours (booked + flown, not
// cancelled — the same count the daily limit uses). Operator decisions
// 2026-09-23: show booked hours per day; school-closed days read "Closed".

import { dutyWindow, type WeeklyRow, type RosterException } from './roster';
import { dayHours, type FlightLike } from './instructor-status';
import { leaveCovers, type LeaveWindow } from './leave-window';

export type CellKind = 'duty' | 'off' | 'leave' | 'closed';
export type RosterCell = { kind: CellKind; text: string; changed: boolean; booked: number };
export type RosterReportRow = {
  name: string; initials: string; cells: RosterCell[]; rosteredHours: number; bookedHours: number;
  // Summary counts (2026-09-23). Every day is exactly one of: on duty, rostered
  // day off, full-day leave, closed. Part-day leave counts ½ leave day and the
  // day still counts as on duty (or off, if the roster had them off).
  dutyDays: number; daysOff: number; leaveDays: number; closedDays: number; changedDays: number;
  dailyLimit: number | null; // the daily flying limit that applies (null if not supplied)
};
export type RosterReport = { days: { date: string; closed: string | null }[]; rows: RosterReportRow[]; notes: string[] };

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `date` ('YYYY-MM-DD'). */
export function mondayOf(date: string): string {
  return shiftDate(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
}

/** Number of calendar days from `from` to `to`, counting both ends. */
export function daysInclusive(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Longest custom range allowed (operator decision 2026-09-23), both ends counted. */
export const MAX_REPORT_DAYS = 90;

/**
 * Flying-limit use = booked hours ÷ (daily flying limit × days on duty), as a
 * whole percent; null when there's nothing to divide by. Operator decision
 * 2026-09-23 — no colour coding (low use has many causes).
 */
export function flyingLimitUse(booked: number, possibleHours: number): number | null {
  return possibleHours > 0 ? Math.round((booked / possibleHours) * 100) : null;
}

/** Totals across the rows, for the Summary's Total row. */
export function summaryTotals(rows: RosterReportRow[]) {
  const sum = (f: (r: RosterReportRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  const booked = sum(r => r.bookedHours);
  return {
    dutyDays: sum(r => r.dutyDays), daysOff: sum(r => r.daysOff), leaveDays: sum(r => r.leaveDays),
    closedDays: sum(r => r.closedDays), changedDays: sum(r => r.changedDays),
    rosteredHours: sum(r => r.rosteredHours), bookedHours: booked,
    use: flyingLimitUse(booked, sum(r => (r.dailyLimit ?? 0) * r.dutyDays)),
  };
}

/** 'Mon 28 Sep' */
export function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${DAY[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** 3.5 -> '3.5h', 7 -> '7h' */
export const formatHours = (h: number) => `${Number(h.toFixed(1))}h`;

export function buildRosterReport(args: {
  from: string; // first day, 'YYYY-MM-DD'
  to: string;   // last day, inclusive

  instructors: { id: string; name: string; initials: string; offDutyDate?: string | null; dailyLimit?: number }[];
  weekly: WeeklyRow[];
  exceptions: (RosterException & { note?: string })[];
  leaves: (LeaveWindow & { personId: string })[]; // approved instructor leave only
  flights: FlightLike[];
  openStart?: string;
  openEnd?: string;
  closedReason: (date: string) => string | null;
}): RosterReport {
  const days = Array.from({ length: Math.max(0, daysInclusive(args.from, args.to)) }, (_, i) => {
    const date = shiftDate(args.from, i);
    return { date, closed: args.closedReason(date) };
  });
  const notes: string[] = [];

  const rows = args.instructors.map(instr => {
    let rosteredHours = 0, bookedHours = 0, dutyDays = 0, daysOff = 0, leaveDays = 0, closedDays = 0, changedDays = 0;
    const cells = days.map(({ date, closed }): RosterCell => {
      const booked = dayHours(args.flights, instr.id, date);
      bookedHours += booked;
      const bookedText = booked > 0 ? ` · ${formatHours(booked)} booked` : '';
      if (closed) { closedDays++; return { kind: 'closed', text: `Closed${bookedText}`, changed: false, booked }; }

      const leave = args.leaves.find(l => String(l.personId) === String(instr.id) && leaveCovers(l, date));
      if (leave && !leave.start_time) { leaveDays++; return { kind: 'leave', text: `Leave${bookedText}`, changed: false, booked }; }

      const r = dutyWindow({
        instructorId: instr.id, date, weekly: args.weekly, exceptions: args.exceptions,
        offDutyDate: instr.offDutyDate, openStart: args.openStart, openEnd: args.openEnd,
      });
      const changed = r.source === 'exception' || r.source === 'off-duty-today';
      if (changed) {
        changedDays++;
        const ex = args.exceptions.find(e => String(e.instructorId) === String(instr.id) && e.date === date);
        const what = r.source === 'off-duty-today' ? 'marked off duty that day' : 'one-off change';
        notes.push(`${dayLabel(date)}, ${instr.name}: ${what}${ex?.note ? ` — ${ex.note}` : ''}`);
      }
      const mark = changed ? '*' : '';
      // 2026-09-23: part-day leave — the rest of the shift still counts;
      // only the overlap with the leave window comes off the rostered total.
      if (leave) {
        const ls = leave.start_time!.slice(0, 5), le = (leave.end_time || '24:00').slice(0, 5);
        leaveDays += 0.5;
        if (r.window) dutyDays++; else daysOff++;
        if (r.window) {
          const overlap = Math.max(0, Math.min(minutes(r.window.end), minutes(le)) - Math.max(minutes(r.window.start), minutes(ls)));
          rosteredHours += (minutes(r.window.end) - minutes(r.window.start) - overlap) / 60;
        }
        const shift = r.window ? `${r.window.start}–${r.window.end}` : 'Off';
        return { kind: 'leave', text: `${shift}${mark} · Leave ${ls}–${le}${bookedText}`, changed, booked };
      }
      if (!r.window) { daysOff++; return { kind: 'off', text: `Off${mark}${bookedText}`, changed, booked }; }
      dutyDays++;
      rosteredHours += (minutes(r.window.end) - minutes(r.window.start)) / 60;
      return { kind: 'duty', text: `${r.window.start}–${r.window.end}${mark}${bookedText}`, changed, booked };
    });
    return {
      name: instr.name, initials: instr.initials, cells, rosteredHours, bookedHours,
      dutyDays, daysOff, leaveDays, closedDays, changedDays, dailyLimit: instr.dailyLimit ?? null,
    };
  });

  return { days, rows, notes };
}


// lib/instructor-status.ts
// Pure instructor-status and daily-flying-limit rules (2026-09-23), shared by
// the browser (Instructors page, Duty Hours, BookingForm) and the server
// (lib/daily-limit.ts). No imports beyond pure lib files, safe on both sides.
// Plan + operator decisions: claude/instructor-status-plan-2026-09-23.md.

import { leaveCovers, toIST, type LeaveWindow } from './leave-window';

export type ComputedStatus = 'ON_LEAVE' | 'FLYING' | 'LIMIT_REACHED' | 'OFF_DUTY' | 'AVAILABLE';

export const STATUS_LABELS: Record<ComputedStatus, string> = {
  ON_LEAVE: 'On leave',
  FLYING: 'Flying',
  LIMIT_REACHED: 'Limit reached',
  OFF_DUTY: 'Off duty',
  AVAILABLE: 'Available',
};

/** Starting value for the school-wide ceiling (fto_settings `instructor_daily_limit_hours`). */
export const DEFAULT_SCHOOL_DAILY_LIMIT_HOURS = 7;

/**
 * The limit that applies: the lower of the instructor's own Max Daily Hours
 * and the school-wide ceiling. A missing/zero/unparseable value on either
 * side is ignored (the other one applies); if both are unusable, the default
 * ceiling applies — the limit is a hard rule, so it never silently vanishes.
 */
export function effectiveDailyLimit(instructorMax: unknown, schoolCeiling: unknown): number {
  const valid = [Number(instructorMax), Number(schoolCeiling)].filter(n => Number.isFinite(n) && n > 0);
  return valid.length ? Math.min(...valid) : DEFAULT_SCHOOL_DAILY_LIMIT_HOURS;
}

export type FlightLike = { id?: string | number; instructorId: string; startTime: string; endTime: string; status: string };

/**
 * Hours an instructor has on an IST calendar date: every non-cancelled
 * flight (scheduled, pending approval, in progress, completed — booked +
 * flown). Cancelled flights free their hours. `excludeId` leaves out the
 * flight being edited so it isn't counted twice.
 */
export function dayHours(flights: FlightLike[], instructorId: string, date: string, excludeId?: string | number): number {
  return flights
    .filter(f => f.status !== 'CANCELLED'
      && String(f.instructorId) === String(instructorId)
      && (excludeId === undefined || String(f.id) !== String(excludeId))
      && toIST(f.startTime).date === date)
    .reduce((sum, f) => sum + (new Date(f.endTime).getTime() - new Date(f.startTime).getTime()) / 3_600_000, 0);
}

/** Would adding `startIso`–`endIso` take the instructor past `limit` that day? */
export function exceedsDailyLimit(
  flights: FlightLike[], instructorId: string, startIso: string, endIso: string, limit: number, excludeId?: string | number
): { exceeded: boolean; used: number; after: number } {
  const used = dayHours(flights, instructorId, toIST(startIso).date, excludeId);
  const after = used + (new Date(endIso).getTime() - new Date(startIso).getTime()) / 3_600_000;
  // 1e-9 tolerance: 7 x 1h bookings must land exactly on 7h, not 7.0000001h.
  return { exceeded: after > limit + 1e-9, used, after };
}

/**
 * Status right now, in priority order: On leave > Flying > Limit reached >
 * Off duty > Available. `offDutyDate` is the one-day "off duty today"
 * override (YYYY-MM-DD); `openStart`/`openEnd` are the FTO's opening hours
 * ('HH:MM', Settings -> Daily Time Slots). Duty roster slots in here later.
 */
export function computeInstructorStatus(args: {
  instructorId: string;
  now: Date;
  flights: FlightLike[];
  leaves: (LeaveWindow & { person_type?: string; personType?: string; person_id?: string | number; personId?: string; status: string })[];
  limit: number;
  offDutyDate?: string | null;
  openStart?: string;
  openEnd?: string;
}): ComputedStatus {
  const { date, time } = toIST(args.now.toISOString());
  const mine = (type?: string, id?: string | number) => type === 'instructor' && String(id) === String(args.instructorId);

  if (args.leaves.some(l => l.status === 'APPROVED'
    && mine(l.person_type ?? l.personType, l.person_id ?? l.personId)
    && leaveCovers(l, date, time, time === '23:59' ? '24:00' : nextMinute(time)))) return 'ON_LEAVE';

  if (args.flights.some(f => f.status === 'IN_PROGRESS' && String(f.instructorId) === String(args.instructorId))) return 'FLYING';

  if (dayHours(args.flights, args.instructorId, date) >= args.limit - 1e-9) return 'LIMIT_REACHED';

  if (args.offDutyDate === date) return 'OFF_DUTY';
  if (args.openStart && args.openEnd && (time < args.openStart || time >= args.openEnd)) return 'OFF_DUTY';

  return 'AVAILABLE';
}

// 'HH:MM' one minute later — a zero-length window would never overlap anything.
function nextMinute(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const t = h * 60 + m + 1;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

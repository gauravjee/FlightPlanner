// lib/leave.ts
// Server-only leave helpers shared by the availability and scheduled-flights
// routes (2026-09-23). Imports supabase-admin, so never import this from a
// 'use client' file — the client-side equivalent of isOnApprovedLeave is
// checkAvailability() in lib/hooks/useAvailability.ts. The coverage rule
// itself (full-day vs partial-day, IST) lives in lib/leave-window.ts so both
// sides use the same one.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { IST_OFFSET } from '@/lib/ist';
import { leaveCovers, toIST, type LeaveWindow } from '@/lib/leave-window';

export type AutoCancelResult = { cancelled: { id: string; startTime: string }[]; error?: string };

/**
 * Soft-cancel (status + reason, never a delete — same as every other
 * cancellation in this app) a person's still-pending bookings that the leave
 * covers, so the slot frees up for someone else. Partial-day leave only
 * cancels flights overlapping its time window (lib/leave-window.ts).
 *
 * Idempotent: already-cancelled flights don't match the status filter, so
 * callers can run this whenever a record ends up APPROVED.
 *
 * Only SCHEDULED / PENDING_APPROVAL are touched — never COMPLETED (already
 * flew; cancelling it would silently wipe logged hours) or IN_PROGRESS
 * (someone may be airborne).
 *
 * Returns what it cancelled (or why it couldn't) so the approver is told —
 * this used to only log a warning, which is how a DB constraint rejecting
 * every auto-cancel went unnoticed until the schema was read.
 */
export async function cancelFlightsDuringLeave(
  leave: LeaveWindow & { person_type: string; person_id: string | number }
): Promise<AutoCancelResult> {
  const column = leave.person_type === 'instructor' ? 'instructor_id' : 'student_id';
  // IST day boundaries: [start_date 00:00 IST, day after end_date 00:00 IST).
  const dayAfterEnd = new Date(`${leave.end_date}T00:00:00Z`);
  dayAfterEnd.setUTCDate(dayAfterEnd.getUTCDate() + 1);

  const { data: candidates, error: loadError } = await supabaseAdmin
    .from('scheduled_flights')
    .select('id, start_time, end_time')
    .eq(column, String(leave.person_id))
    .gte('start_time', `${leave.start_date}T00:00:00${IST_OFFSET}`)
    .lt('start_time', `${dayAfterEnd.toISOString().slice(0, 10)}T00:00:00${IST_OFFSET}`)
    .in('status', ['SCHEDULED', 'PENDING_APPROVAL']);
  if (loadError) {
    console.warn('⚠️ Could not load bookings for approved leave:', loadError);
    return { cancelled: [], error: loadError.message };
  }

  const covered = (candidates ?? []).filter(f => {
    const start = toIST(f.start_time as string);
    return leaveCovers(leave, start.date, start.time, toIST(f.end_time as string).time);
  });
  if (!covered.length) return { cancelled: [] };

  // .select() returns only the rows the update actually changed — a flight
  // checked in or cancelled between the load above and this update isn't
  // touched (status filter) and so isn't reported to the approver either.
  const { data: changed, error } = await supabaseAdmin
    .from('scheduled_flights')
    .update({ status: 'CANCELLED', cancellation_reason: 'ON_LEAVE' })
    .in('id', covered.map(f => f.id))
    .in('status', ['SCHEDULED', 'PENDING_APPROVAL'])
    .select('id, start_time');
  if (error) {
    console.warn('⚠️ Could not auto-cancel bookings for approved leave:', error);
    return { cancelled: [], error: error.message };
  }
  return { cancelled: (changed ?? []).map(f => ({ id: String(f.id), startTime: f.start_time as string })) };
}

/** True when the person has APPROVED leave covering any part of this flight (IST). */
export async function isOnApprovedLeave(
  personType: 'instructor' | 'student', personId: string, startIso: string, endIso: string
): Promise<boolean> {
  const start = toIST(startIso);
  const { data } = await supabaseAdmin
    .from('availability')
    .select('start_date, end_date, start_time, end_time')
    .eq('person_type', personType)
    .eq('person_id', personId)
    .eq('status', 'APPROVED')
    .lte('start_date', start.date)
    .gte('end_date', start.date);
  return (data ?? []).some(l => leaveCovers(l, start.date, start.time, toIST(endIso).time));
}

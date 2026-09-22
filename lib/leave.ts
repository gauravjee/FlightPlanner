// lib/leave.ts
// Server-only leave helpers shared by the availability and scheduled-flights
// routes (2026-09-23). Imports supabase-admin, so never import this from a
// 'use client' file — the client-side equivalent of isOnApprovedLeave is
// checkAvailability() in lib/hooks/useAvailability.ts.

import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Soft-cancel (status + reason, never a delete — same as every other
 * cancellation in this app) a person's still-pending bookings that start on
 * any day in [startDate, endDate], so the slot frees up for someone else.
 *
 * Idempotent: already-cancelled flights don't match the status filter, so
 * callers can run this whenever a record ends up APPROVED without first
 * working out whether anything actually changed.
 *
 * Only SCHEDULED / PENDING_APPROVAL are touched — never COMPLETED (already
 * flew; cancelling it would silently wipe logged hours) or IN_PROGRESS
 * (someone may be airborne). A backdated or same-day approval must not
 * reach those.
 *
 * ponytail: day boundaries are UTC. Fine while flying is 06:00-20:00 IST
 * (00:30-14:30 UTC, same calendar date); needs an IST-aware range if the
 * operating window ever starts before 05:30 IST.
 */
export async function cancelFlightsDuringLeave(personType: string, personId: string, startDate: string, endDate: string) {
  const column = personType === 'instructor' ? 'instructor_id' : 'student_id';
  const rangeEnd = new Date(`${endDate}T00:00:00Z`);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
  const { error } = await supabaseAdmin
    .from('scheduled_flights')
    .update({ status: 'CANCELLED', cancellation_reason: 'ON_LEAVE' })
    .eq(column, personId)
    .gte('start_time', `${startDate}T00:00:00Z`)
    .lt('start_time', rangeEnd.toISOString())
    .in('status', ['SCHEDULED', 'PENDING_APPROVAL']);
  if (error) {
    // Non-fatal: the leave is approved either way — a stale booking left
    // behind is a smaller problem than the approval itself failing.
    console.warn('⚠️ Could not auto-cancel bookings for approved leave:', error);
  }
}

/** True when the person has APPROVED leave covering `date` (YYYY-MM-DD). */
export async function isOnApprovedLeave(personType: 'instructor' | 'student', personId: string, date: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('availability')
    .select('id')
    .eq('person_type', personType)
    .eq('person_id', personId)
    .eq('status', 'APPROVED')
    .lte('start_date', date)
    .gte('end_date', date)
    .limit(1);
  return !!data?.length;
}

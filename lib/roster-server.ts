// lib/roster-server.ts
// Server-only duty-roster check (2026-09-23, roster step 3). Used by POST
// /api/scheduled-flights and PATCH /api/scheduled-flights/[id]. Imports
// supabase-admin, so never import this from a 'use client' file; the rule
// itself is lib/roster.ts, so the booking form shows exactly what the server
// enforces. Design: claude/duty-roster-design-2026-09-23.md.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { toIST } from '@/lib/leave-window';
import { dutyWindow, flightFitsDuty, describeWindow, dutySourceNote } from '@/lib/roster';

/**
 * Returns a user-facing refusal if the flight falls outside the instructor's
 * duty window that IST day, or null if it fits. Fails CLOSED: if the roster
 * can't be loaded, the booking is refused rather than let through unchecked.
 */
// Multi-base M4a: the duty window at `baseId` (the flight's base; Base 1 until bookings carry one in M4b).
// Opening hours come from that base's row (Base 1's is kept identical to FTO Settings).
export async function rosterRefusal(instructorId: string, startIso: string, endIso: string, baseId = 1): Promise<string | null> {
  const date = toIST(startIso).date;
  const [instr, weekly, exceptions, base] = await Promise.all([
    supabaseAdmin.from('instructors').select('name, off_duty_date').eq('id', instructorId).maybeSingle(),
    supabaseAdmin.from('instructor_roster').select('base_id, weekday, start_time, end_time').eq('instructor_id', instructorId),
    supabaseAdmin.from('instructor_roster_exceptions').select('base_id, start_time, end_time').eq('instructor_id', instructorId).eq('date', date),
    supabaseAdmin.from('bases').select('time_slot_start, time_slot_end').eq('id', baseId).maybeSingle(),
  ]);
  if (instr.error || weekly.error || exceptions.error || base.error) {
    console.error('❌ Roster check failed:', instr.error || weekly.error || exceptions.error || base.error);
    return "Couldn't check the instructor's duty roster — please try again.";
  }

  const result = dutyWindow({
    instructorId, date, baseId,
    weekly: (weekly.data ?? []).map(r => ({ instructorId, baseId: Number(r.base_id ?? 1), weekday: Number(r.weekday), startTime: r.start_time as string | null, endTime: r.end_time as string | null })),
    exceptions: (exceptions.data ?? []).map(r => ({ instructorId, date, baseId: Number(r.base_id ?? 1), startTime: r.start_time as string | null, endTime: r.end_time as string | null })),
    offDutyDate: (instr.data?.off_duty_date as string | null) ?? null,
    openStart: (base.data?.time_slot_start as string | undefined) ?? undefined, openEnd: (base.data?.time_slot_end as string | undefined) ?? undefined,
  });
  if (flightFitsDuty(result.window, startIso, endIso)) return null;
  return `${instr.data?.name ?? 'This instructor'} isn't on duty then — duty hours on ${date}: ${describeWindow(result.window)}${dutySourceNote(result.source)}.`;
}

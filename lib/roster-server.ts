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
export async function rosterRefusal(instructorId: string, startIso: string, endIso: string): Promise<string | null> {
  const date = toIST(startIso).date;
  const [instr, weekly, exception, settings] = await Promise.all([
    supabaseAdmin.from('instructors').select('name, off_duty_date').eq('id', instructorId).maybeSingle(),
    supabaseAdmin.from('instructor_roster').select('weekday, start_time, end_time').eq('instructor_id', instructorId),
    supabaseAdmin.from('instructor_roster_exceptions').select('start_time, end_time').eq('instructor_id', instructorId).eq('date', date).maybeSingle(),
    supabaseAdmin.from('fto_settings').select('setting_key, setting_value').in('setting_key', ['time_slot_start', 'time_slot_end']),
  ]);
  if (instr.error || weekly.error || exception.error || settings.error) {
    console.error('❌ Roster check failed:', instr.error || weekly.error || exception.error || settings.error);
    return "Couldn't check the instructor's duty roster — please try again.";
  }

  const setting = (k: string) => settings.data?.find(s => s.setting_key === k)?.setting_value as string | undefined;
  const result = dutyWindow({
    instructorId, date,
    weekly: (weekly.data ?? []).map(r => ({ instructorId, weekday: Number(r.weekday), startTime: r.start_time as string | null, endTime: r.end_time as string | null })),
    exceptions: exception.data ? [{ instructorId, date, startTime: exception.data.start_time as string | null, endTime: exception.data.end_time as string | null }] : [],
    offDutyDate: (instr.data?.off_duty_date as string | null) ?? null,
    openStart: setting('time_slot_start'), openEnd: setting('time_slot_end'),
  });
  if (flightFitsDuty(result.window, startIso, endIso)) return null;
  return `${instr.data?.name ?? 'This instructor'} isn't on duty then — duty hours on ${date}: ${describeWindow(result.window)}${dutySourceNote(result.source)}.`;
}

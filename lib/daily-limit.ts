// lib/daily-limit.ts
// Server-only daily flying limit check (2026-09-23) — a HARD block for every
// role, no override (operator decision; claude/instructor-status-plan-
// 2026-09-23.md). Used by POST /api/scheduled-flights and PATCH
// /api/scheduled-flights/[id]. Imports supabase-admin, so never import this
// from a 'use client' file; the rule itself is in lib/instructor-status.ts
// so the booking form shows exactly what the server enforces.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { IST_OFFSET } from '@/lib/ist';
import { toIST } from '@/lib/leave-window';
import { effectiveDailyLimit, exceedsDailyLimit } from '@/lib/instructor-status';

/**
 * Returns a user-facing refusal message if putting `startIso`–`endIso` on
 * this instructor's day would take them past their effective daily limit,
 * or null if it fits. `excludeFlightId` is the flight being edited (so its
 * old slot isn't counted twice). Fails CLOSED: if the day can't be loaded,
 * the booking is refused rather than let through unchecked.
 */
export async function dailyLimitRefusal(
  instructorId: string, startIso: string, endIso: string, excludeFlightId?: string | number
): Promise<string | null> {
  const date = toIST(startIso).date;
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);

  const [instrRes, settingRes, flightsRes] = await Promise.all([
    supabaseAdmin.from('instructors').select('name, max_daily_hours').eq('id', instructorId).maybeSingle(),
    supabaseAdmin.from('fto_settings').select('setting_value').eq('setting_key', 'instructor_daily_limit_hours').limit(1).maybeSingle(),
    supabaseAdmin.from('scheduled_flights').select('id, instructor_id, start_time, end_time, status')
      .eq('instructor_id', instructorId)
      .gte('start_time', `${date}T00:00:00${IST_OFFSET}`)
      .lt('start_time', `${next.toISOString().slice(0, 10)}T00:00:00${IST_OFFSET}`)
      .neq('status', 'CANCELLED'),
  ]);
  if (instrRes.error || settingRes.error || flightsRes.error) {
    console.error('❌ Daily limit check failed:', instrRes.error || settingRes.error || flightsRes.error);
    return "Couldn't check the instructor's daily flying limit — please try again.";
  }

  const limit = effectiveDailyLimit(instrRes.data?.max_daily_hours, settingRes.data?.setting_value);
  const flights = (flightsRes.data ?? []).map(f => ({
    id: f.id as number, instructorId: String(f.instructor_id), startTime: f.start_time as string,
    endTime: f.end_time as string, status: f.status as string,
  }));
  const r = exceedsDailyLimit(flights, instructorId, startIso, endIso, limit, excludeFlightId);
  if (!r.exceeded) return null;
  return `${instrRes.data?.name ?? 'This instructor'} would have ${r.after.toFixed(1)}h on ${date} — over the ${limit}h daily flying limit (${r.used.toFixed(1)}h already booked or flown).`;
}

// app/api/scheduled-flights/route.ts
// Server-side authorization gate + create for a brand-new `scheduled_flights`
// row (booking). Enforces WHO may create a new booking at all — see
// lib/api-auth.ts's requireScheduleCreateAccess() / SCHEDULE_CREATE_ROLES:
// admin/super_admin/operations always can; an `instructor` only if their own
// instructors.can_self_book flag is on (Instructors tab, super_admin-only).
//
// Scope note: FTO-closed-day and aircraft-conflict/buffer checking (see
// lib/store.ts's bookFlight) stay client-side, unchanged — those are
// scheduling/data-integrity validation, not an authorization boundary, and
// porting that whole engine (turnaround buffers, fuel-based buffer sizing,
// holiday/weekly-off-day rules) server-side is a separate, much larger
// piece of work than "can this person create a booking at all." This route
// exists specifically to close the security gap: without it, an instructor
// without the self-book flag could still call Supabase directly with the
// anon key and insert a row, since the browser previously wrote to
// scheduled_flights with no server-side check whatsoever.

import { NextResponse } from 'next/server';
import { requireScheduleCreateAccess, requireSession } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

// GET added 2026-09-18 (RLS remediation Step 3 — see
// claude/rls-remediation-progress-2026-09-18.md): reads used to be direct
// client-side `supabase.from('scheduled_flights')` calls (anon key) from
// three places — fetchScheduledFlights() (full list), checkConflicts()
// (aircraft + time-window filter, used live while booking/dragging a
// flight), and useHolidays.ts's countScheduleConflictsOnDate() (a day-range
// filter, no aircraft). One GET covers all three via optional query params
// instead of always pulling the full table — this table only grows, and
// checkConflicts runs interactively, so keeping the filter server-side
// (matching exactly what the old direct queries did) avoids a regression
// there. `excludeId` (a booking editing itself) stays a client-side
// post-filter, same as the original code already did.
// `requireSession()` only — no role restriction beyond "logged in," same
// reasoning as every other read moved this pass.
export async function GET(request: Request) {
  const { error } = await requireSession();
  if (error) return error;

  const url = new URL(request.url);
  const aircraftId = url.searchParams.get('aircraftId');
  const startTimeLt = url.searchParams.get('startTimeLt');
  const endTimeGt = url.searchParams.get('endTimeGt');
  const startTimeGte = url.searchParams.get('startTimeGte');
  const startTimeLte = url.searchParams.get('startTimeLte');
  const excludeCancelled = url.searchParams.get('excludeCancelled') === 'true';

  let query = supabaseAdmin.from('scheduled_flights').select('*');
  if (aircraftId) query = query.eq('aircraft_id', aircraftId);
  if (startTimeLt) query = query.lt('start_time', startTimeLt);
  if (endTimeGt) query = query.gt('end_time', endTimeGt);
  if (startTimeGte) query = query.gte('start_time', startTimeGte);
  if (startTimeLte) query = query.lte('start_time', startTimeLte);
  if (excludeCancelled) query = query.neq('status', 'CANCELLED');
  // Only the unfiltered full-list case (fetchScheduledFlights) needs a
  // stable order for display; the two filtered cases just consume the set.
  if (!aircraftId && !startTimeGte) query = query.order('start_time', { ascending: true });

  const { data, error: dbError } = await query;

  if (dbError) {
    console.error('Error loading scheduled flights:', dbError);
    return NextResponse.json({ error: 'Failed to load scheduled flights.' }, { status: 500 });
  }

  return NextResponse.json({ flights: data });
}

export async function POST(request: Request) {
  const { error } = await requireScheduleCreateAccess();
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const {
    aircraftId, instructorId, studentId, startTime, endTime, sortieType,
    exercise, status, weatherBriefed, notamBriefed, notes,
  } = body as Record<string, unknown>;

  if (!aircraftId || !startTime || !endTime) {
    return NextResponse.json({ error: 'aircraftId, startTime, and endTime are required.' }, { status: 400 });
  }

  const { error: dbError } = await supabaseAdmin.from('scheduled_flights').insert({
    aircraft_id: aircraftId,
    instructor_id: instructorId,
    student_id: studentId || null,
    start_time: startTime,
    end_time: endTime,
    sortie_type: sortieType,
    exercise: exercise || '',
    status: status || 'SCHEDULED',
    weather_briefed: weatherBriefed || false,
    notam_briefed: notamBriefed || false,
    notes: notes || '',
  });

  if (dbError) {
    console.error('Error creating scheduled flight:', dbError);
    return NextResponse.json({ error: 'Failed to book flight.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

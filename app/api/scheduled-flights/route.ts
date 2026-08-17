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
import { requireScheduleCreateAccess } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

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

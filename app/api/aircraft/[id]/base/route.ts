// app/api/aircraft/[id]/base/route.ts — multi-base M2: move an aircraft to another base.
// The only way an aircraft's base changes (the plain aircraft PATCH can't); every move is logged in
// aircraft_base_moves. Admin, super admin and operations (operator, 15 Oct).

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { AIRCRAFT_MOVE_ROLES } from '@/lib/permissions';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { toIST } from '@/lib/leave-window';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { session, error } = await requireRole(AIRCRAFT_MOVE_ROLES);
  if (error) return error;
  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const toBaseId = Number(body.toBaseId);
  const note = typeof body.note === 'string' ? body.note.trim() || null : null;
  if (!Number.isInteger(toBaseId) || toBaseId < 1) return NextResponse.json({ error: 'Pick a base.' }, { status: 400 });

  const [{ data: aircraft }, { data: base }] = await Promise.all([
    supabaseAdmin.from('aircraft').select('id, registration, current_base_id').eq('id', id).maybeSingle(),
    supabaseAdmin.from('bases').select('id, name, is_active').eq('id', toBaseId).maybeSingle(),
  ]);
  if (!aircraft) return NextResponse.json({ error: 'Aircraft not found.' }, { status: 404 });
  if (!base || !base.is_active) return NextResponse.json({ error: 'That base does not exist or is inactive.' }, { status: 400 });
  if (aircraft.current_base_id === toBaseId) return NextResponse.json({ error: `${aircraft.registration} is already at ${base.name}.` }, { status: 400 });

  // Upcoming bookings were made at the current base (their roster, hours and holidays); moving the aircraft
  // would strand them there, so they must be moved or cancelled first.
  const { data: upcoming, error: upcomingError } = await supabaseAdmin.from('scheduled_flights').select('id, start_time')
    .eq('aircraft_id', aircraft.id).neq('status', 'CANCELLED').gt('end_time', new Date().toISOString())
    .order('start_time').limit(5);
  if (upcomingError) {
    console.error('Error checking upcoming bookings:', upcomingError.code);
    return NextResponse.json({ error: 'Failed to check the aircraft\'s bookings.' }, { status: 500 });
  }
  if (upcoming?.length) {
    const list = upcoming.map(f => { const t = toIST(String(f.start_time)); return `#${f.id} (${t.date} ${t.time})`; }).join(', ');
    return NextResponse.json({
      error: `${aircraft.registration} has upcoming bookings: ${list}${upcoming.length === 5 ? ' and maybe more' : ''}. Move or cancel them before moving the aircraft.`,
    }, { status: 409 });
  }

  // One transaction (add-move-aircraft-base-fn.sql): the move and its log row save together or not at all.
  // Guarded on the base we read, so two people moving the same aircraft at once can't both succeed.
  const { data: actor } = await supabaseAdmin.from('users').select('id').eq('email', session.user.email ?? '').maybeSingle();
  const { data: moved, error: moveError } = await supabaseAdmin.rpc('move_aircraft_base', {
    p_aircraft_id: aircraft.id, p_from_base_id: aircraft.current_base_id, p_to_base_id: toBaseId,
    p_moved_by: actor?.id ?? null, p_note: note,
  });
  if (moveError) {
    console.error('Error moving aircraft:', moveError.code);
    return NextResponse.json({ error: 'Failed to move the aircraft.' }, { status: 500 });
  }
  if (!moved) return NextResponse.json({ error: 'The aircraft was just moved by someone else. Reload and try again.' }, { status: 409 });

  return NextResponse.json({ success: true, registration: aircraft.registration, base: base.name });
}

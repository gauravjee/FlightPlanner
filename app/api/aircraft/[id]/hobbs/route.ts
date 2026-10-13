// app/api/aircraft/[id]/hobbs/route.ts
// Admin-only correction of an aircraft's Hobbs reading alone (no flights change), e.g. a misread or an
// engine ground run. One transaction inside set_aircraft_hobbs (add-aircraft-hobbs-correction.sql), audited.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { session, error } = await requireRole(['admin', 'super_admin']);
  if (error) return error;
  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const hobbsTime = Number(body.hobbsTime);
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!Number.isFinite(hobbsTime) || hobbsTime < 0) {
    return NextResponse.json({ error: 'Enter a valid Hobbs reading.' }, { status: 400 });
  }
  if (!reason) return NextResponse.json({ error: 'A reason is required.' }, { status: 400 });

  const { data, error: dbError } = await supabaseAdmin.rpc('set_aircraft_hobbs', {
    p_aircraft: id,
    p_new: hobbsTime,
    p_reason: reason,
    p_by: session.user.email ?? 'unknown',
  });

  if (dbError) {
    if (dbError.code === '22P02') return NextResponse.json({ error: 'Aircraft not found.' }, { status: 404 });
    // The function's own refusals are prefixed "HOBBS: " and are safe to show as-is.
    if (dbError.message?.startsWith('HOBBS: ')) {
      return NextResponse.json({ error: dbError.message.slice(7) }, { status: 409 });
    }
    console.error('Error correcting aircraft Hobbs:', dbError);
    return NextResponse.json({ error: 'Failed to correct the Hobbs reading.' }, { status: 500 });
  }
  return NextResponse.json({ result: data });
}

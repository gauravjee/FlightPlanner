// app/api/flight-records/[id]/route.ts
// Admin-only Hobbs End correction with cascade (claude/hobbs-correction-design-2026-10-10.md).
// The whole change runs in one DB transaction inside correct_hobbs_end (add-hobbs-corrections.sql).
// Body: { hobbsEnd, reason, dryRun? }. dryRun returns what would shift without changing anything.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { session, error } = await requireRole(['admin', 'super_admin']);
  if (error) return error;
  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const hobbsEnd = Number(body.hobbsEnd);
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!Number.isFinite(hobbsEnd) || hobbsEnd <= 0) {
    return NextResponse.json({ error: 'Enter a valid Hobbs End.' }, { status: 400 });
  }
  if (!reason) return NextResponse.json({ error: 'A reason is required.' }, { status: 400 });

  const { data, error: dbError } = await supabaseAdmin.rpc('correct_hobbs_end', {
    p_record: id,
    p_new: hobbsEnd,
    p_reason: reason,
    p_by: session.user.email ?? 'unknown',
    p_dry_run: body.dryRun === true,
  });

  if (dbError) {
    if (dbError.code === '22P02') return NextResponse.json({ error: 'Flight record not found.' }, { status: 404 });
    // The function's own refusals are prefixed "HOBBS: " and are safe to show as-is.
    if (dbError.message?.startsWith('HOBBS: ')) {
      return NextResponse.json({ error: dbError.message.slice(7) }, { status: 409 });
    }
    console.error('Error correcting Hobbs End:', dbError);
    return NextResponse.json({ error: 'Failed to correct Hobbs End.' }, { status: 500 });
  }
  return NextResponse.json({ result: data });
}

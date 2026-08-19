// app/api/admin/requirements/toggle/route.ts
// ---------------------------------------------------------------------------
// PATCH { id: string, isCompleted: boolean }
//
// Toggles a single training_requirements row's completion status — the only
// write path for the Requirements Checklist (components/dashboard/
// RequirementsChecklist.tsx), used for every requirement, including the
// safety-sensitive "Solo Release" item that gates Dual/Solo bookings of
// certain exercises (see BookingForm.tsx's SOLO_RELEASE_EXERCISE_CODES).
//
// This used to be a direct browser-to-Supabase write (lib/store.ts's
// toggleRequirement calling supabase.from('training_requirements').update()
// straight from client code), which had two real gaps:
//   1. "Who's allowed to do this" was UI-only — RequirementsChecklist.tsx's
//      canEdit check could be bypassed by anyone who could reach the
//      Supabase REST API directly with the anon key.
//   2. completedBy (the audit trail's "who granted this") was passed in
//      from the CLIENT and written verbatim — a modified/compromised client
//      could claim to be anyone.
// Both are fixed here: requireRole enforces REQUIREMENTS_WRITE_ROLES
// server-side (2026-08-19: admin/instructor/super_admin, same as the prior
// UI check), and completedBy is always derived from the verified session —
// never trusted from the request body.
// ---------------------------------------------------------------------------

import { NextResponse } from 'next/server';
import { requireRole, REQUIREMENTS_WRITE_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function PATCH(request: Request) {
  const { session, error } = await requireRole(REQUIREMENTS_WRITE_ROLES);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id : undefined;
  const isCompleted = typeof body.isCompleted === 'boolean' ? body.isCompleted : undefined;
  if (!id || isCompleted === undefined) {
    return NextResponse.json({ error: 'id and isCompleted are required.' }, { status: 400 });
  }

  // Always the verified signed-in user — same name-then-email fallback
  // pattern used elsewhere (e.g. app/api/safety-incidents/route.ts).
  const completedBy = session.user.name || session.user.email || 'Unknown';

  const updates: Record<string, unknown> = { is_completed: isCompleted };
  if (isCompleted) {
    updates.completed_date = new Date().toISOString().split('T')[0];
    updates.completed_by = completedBy;
  } else {
    updates.completed_date = null;
    updates.completed_by = null;
  }

  const { data, error: dbError } = await supabaseAdmin
    .from('training_requirements')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (dbError) {
    console.error('Error toggling training requirement:', dbError);
    return NextResponse.json({ error: 'Failed to update requirement.' }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Requirement not found.' }, { status: 404 });
  }

  return NextResponse.json({
    requirement: data,
    completedBy: isCompleted ? completedBy : null,
  });
}

// app/api/availability/[id]/route.ts
// Server-side, role-scoped update/delete for a single `availability` row.
// See app/api/availability/route.ts for why this exists and the role
// reasoning.
//
// FIELD_MAP intentionally matches the exact set the old client-side
// updateAvailability() wrote (lib/hooks/useAvailability.ts) — leaveType/
// startDate/endDate/reason/status only. startTime/endTime/personType/
// personId/createdBy were never editable via the old direct-Supabase write
// either (the edit form doesn't send them as an update), so this route
// doesn't expand what's possible to change, just closes how it's reached.

import { NextResponse } from 'next/server';
import { requireRole, AVAILABILITY_VIEW_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

type RouteContext = { params: Promise<{ id: string }> };

const FIELD_MAP: Record<string, string> = {
  leaveType: 'leave_type',
  startDate: 'start_date',
  endDate: 'end_date',
  reason: 'reason',
  status: 'status',
};

export async function PATCH(request: Request, context: RouteContext) {
  const { error } = await requireRole(AVAILABILITY_VIEW_ROLES);
  if (error) return error;

  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const dbUpdates: Record<string, unknown> = {};
  for (const [clientKey, dbKey] of Object.entries(FIELD_MAP)) {
    if (body[clientKey] !== undefined) {
      dbUpdates[dbKey] = body[clientKey];
    }
  }

  if (Object.keys(dbUpdates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  const { error: dbError } = await supabaseAdmin.from('availability').update(dbUpdates).eq('id', id);

  if (dbError) {
    console.error('Error updating availability record:', dbError);
    return NextResponse.json({ error: 'Failed to update leave record.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { error } = await requireRole(AVAILABILITY_VIEW_ROLES);
  if (error) return error;

  const { id } = await context.params;

  const { error: dbError } = await supabaseAdmin.from('availability').delete().eq('id', id);

  if (dbError) {
    console.error('Error deleting availability record:', dbError);
    return NextResponse.json({ error: 'Failed to delete leave record.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

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
//
// 2026-09-21 (leave ownership + approval):
//  - admin/super_admin: edit or delete any record directly, and approve/
//    reject a waiting request with PATCH { resolve: 'approve' | 'reject' }.
//  - instructor: only their OWN records (instructors.email = session email).
//    A PENDING/CANCELLED record is edited or deleted directly. An APPROVED
//    one is left untouched (still in force) and the requested edit/delete is
//    parked in availability.pending_change until an approver decides.
//    `status` is never writable by an instructor.
//  - operations (and anyone else in AVAILABILITY_VIEW_ROLES): view-only.
// Needs add-availability-pending-change.sql applied (adds pending_change).

import { NextResponse } from 'next/server';
import { requireRole, getOwnInstructorId, AVAILABILITY_VIEW_ROLES, AVAILABILITY_APPROVER_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

type RouteContext = { params: Promise<{ id: string }> };

const FIELD_MAP: Record<string, string> = {
  leaveType: 'leave_type',
  startDate: 'start_date',
  endDate: 'end_date',
  reason: 'reason',
  status: 'status',
};

const notFound = () => NextResponse.json({ error: 'Leave record not found.' }, { status: 404 });
const stale = () =>
  NextResponse.json({ error: 'This record just changed. Reload and try again.' }, { status: 409 });

async function loadRow(id: string) {
  return supabaseAdmin.from('availability').select('*').eq('id', id).maybeSingle();
}

export async function PATCH(request: Request, context: RouteContext) {
  const { session, error } = await requireRole(AVAILABILITY_VIEW_ROLES);
  if (error) return error;
  const isApprover = AVAILABILITY_APPROVER_ROLES.includes(session.user.role ?? '');

  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { data: row, error: loadError } = await loadRow(id);
  if (loadError) {
    console.error('Error loading availability record:', loadError);
    return NextResponse.json({ error: 'Failed to load leave record.' }, { status: 500 });
  }
  if (!row) return notFound();

  // ---- approve / reject a waiting change or delete request ----
  if (body.resolve !== undefined) {
    if (!isApprover) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
    const pc = row.pending_change as { action?: string; changes?: Record<string, unknown> } | null;
    if (!pc) return NextResponse.json({ error: 'No change is waiting for approval.' }, { status: 409 });

    let result;
    if (body.resolve === 'reject') {
      result = await supabaseAdmin.from('availability').update({ pending_change: null }).eq('id', id).not('pending_change', 'is', null).select('id');
    } else if (body.resolve === 'approve' && pc.action === 'DELETE') {
      result = await supabaseAdmin.from('availability').delete().eq('id', id).not('pending_change', 'is', null).select('id');
    } else if (body.resolve === 'approve' && pc.action === 'UPDATE') {
      const applied: Record<string, unknown> = { pending_change: null };
      for (const [clientKey, dbKey] of Object.entries(FIELD_MAP)) {
        if (clientKey !== 'status' && pc.changes?.[clientKey] !== undefined) applied[dbKey] = pc.changes[clientKey];
      }
      result = await supabaseAdmin.from('availability').update(applied).eq('id', id).not('pending_change', 'is', null).select('id');
    } else {
      return NextResponse.json({ error: "resolve must be 'approve' or 'reject'." }, { status: 400 });
    }
    if (result.error) {
      console.error('Error resolving availability request:', result.error);
      return NextResponse.json({ error: 'Failed to resolve the request.' }, { status: 500 });
    }
    if (!result.data?.length) return stale();
    return NextResponse.json({ success: true });
  }

  const dbUpdates: Record<string, unknown> = {};
  const changes: Record<string, unknown> = {};
  for (const [clientKey, dbKey] of Object.entries(FIELD_MAP)) {
    if (clientKey === 'status' && !isApprover) continue; // approval status is approver-only
    if (body[clientKey] !== undefined) {
      dbUpdates[dbKey] = body[clientKey];
      changes[clientKey] = body[clientKey];
    }
  }

  if (Object.keys(dbUpdates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  if (isApprover) {
    if (row.pending_change) {
      return NextResponse.json({ error: 'Approve or reject the waiting request first.' }, { status: 409 });
    }
    const { data: rows, error: dbError } = await supabaseAdmin.from('availability').update(dbUpdates).eq('id', id).is('pending_change', null).select('id');
    if (dbError) {
      console.error('Error updating availability record:', dbError);
      return NextResponse.json({ error: 'Failed to update leave record.' }, { status: 500 });
    }
    if (!rows?.length) return stale();
    return NextResponse.json({ success: true });
  }

  // ---- instructor: own record only ----
  const ownId = session.user.role === 'instructor' ? await getOwnInstructorId(session.user.email) : null;
  if (!ownId || row.person_type !== 'instructor' || String(row.person_id) !== ownId) {
    return NextResponse.json({ error: 'You can only change your own leave records.' }, { status: 403 });
  }
  if (row.pending_change) {
    return NextResponse.json({ error: 'This record already has a change waiting for approval.' }, { status: 409 });
  }

  if (row.status === 'APPROVED') {
    const pending = {
      action: 'UPDATE', changes,
      requestedBy: session.user.name || session.user.email, requestedAt: new Date().toISOString(),
    };
    const { data: rows, error: dbError } = await supabaseAdmin
      .from('availability').update({ pending_change: pending })
      .eq('id', id).eq('status', 'APPROVED').is('pending_change', null).select('id');
    if (dbError) {
      console.error('Error requesting availability change:', dbError);
      return NextResponse.json({ error: 'Failed to request the change.' }, { status: 500 });
    }
    if (!rows?.length) return stale();
    return NextResponse.json({ success: true, pendingApproval: true });
  }

  const { data: rows, error: dbError } = await supabaseAdmin
    .from('availability').update(dbUpdates).eq('id', id).neq('status', 'APPROVED').is('pending_change', null).select('id');
  if (dbError) {
    console.error('Error updating availability record:', dbError);
    return NextResponse.json({ error: 'Failed to update leave record.' }, { status: 500 });
  }
  if (!rows?.length) return stale();
  return NextResponse.json({ success: true });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { session, error } = await requireRole(AVAILABILITY_VIEW_ROLES);
  if (error) return error;
  const isApprover = AVAILABILITY_APPROVER_ROLES.includes(session.user.role ?? '');

  const { id } = await context.params;

  const { data: row, error: loadError } = await loadRow(id);
  if (loadError) {
    console.error('Error loading availability record:', loadError);
    return NextResponse.json({ error: 'Failed to load leave record.' }, { status: 500 });
  }
  if (!row) return notFound();

  if (!isApprover) {
    const ownId = session.user.role === 'instructor' ? await getOwnInstructorId(session.user.email) : null;
    if (!ownId || row.person_type !== 'instructor' || String(row.person_id) !== ownId) {
      return NextResponse.json({ error: 'You can only delete your own leave records.' }, { status: 403 });
    }
    if (row.pending_change) {
      return NextResponse.json({ error: 'This record already has a change waiting for approval.' }, { status: 409 });
    }
    if (row.status === 'APPROVED') {
      const pending = { action: 'DELETE', requestedBy: session.user.name || session.user.email, requestedAt: new Date().toISOString() };
      const { data: rows, error: dbError } = await supabaseAdmin
        .from('availability').update({ pending_change: pending })
        .eq('id', id).eq('status', 'APPROVED').is('pending_change', null).select('id');
      if (dbError) {
        console.error('Error requesting availability delete:', dbError);
        return NextResponse.json({ error: 'Failed to request the delete.' }, { status: 500 });
      }
      if (!rows?.length) return stale();
      return NextResponse.json({ success: true, pendingApproval: true });
    }
  }

  // Approver (any record), or an instructor deleting their own non-approved one.
  let q = supabaseAdmin.from('availability').delete().eq('id', id);
  if (!isApprover) q = q.neq('status', 'APPROVED').is('pending_change', null);
  const { data: rows, error: dbError } = await q.select('id');

  if (dbError) {
    console.error('Error deleting availability record:', dbError);
    return NextResponse.json({ error: 'Failed to delete leave record.' }, { status: 500 });
  }

  if (!rows?.length) return isApprover ? notFound() : stale();

  return NextResponse.json({ success: true });
}

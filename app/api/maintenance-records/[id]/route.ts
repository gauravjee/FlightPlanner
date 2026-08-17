// app/api/maintenance-records/[id]/route.ts
// Server-side, role-scoped update/delete for a single maintenance record.
//
// Also performs the "auto-clear the aircraft's status back to ACTIVE when
// its last active (SCHEDULED/IN_PROGRESS) maintenance record completes or
// is cancelled" side effect that lib/store.ts's updateMaintenanceRecord
// used to do via a second client-side call to updateAircraft. Done here,
// server-side, via supabaseAdmin directly on the aircraft row — NOT by
// calling app/api/aircraft/[id]'s PATCH, since that's gated to
// AIRCRAFT_WRITE_ROLES (admin/super_admin only) and would 403 for the
// `maintenance`-role user who triggers this side effect most often.

import { NextResponse } from 'next/server';
import { requireRole, MAINTENANCE_WRITE_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

type RouteContext = { params: Promise<{ id: string }> };

const FIELD_MAP: Record<string, string> = {
  status: 'status',
  completedDate: 'completed_date',
  cost: 'cost',
  performedBy: 'performed_by',
  notes: 'notes',
  description: 'description',
  scheduledDate: 'scheduled_date',
  maintenanceStart: 'maintenance_start',
  maintenanceEnd: 'maintenance_end',
};

export async function PATCH(request: Request, context: RouteContext) {
  const { error } = await requireRole(MAINTENANCE_WRITE_ROLES);
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

  // Need the aircraft_id up front (for the status side effect below),
  // regardless of whether this particular update touches status.
  const { data: record, error: recordError } = await supabaseAdmin
    .from('maintenance_records')
    .select('aircraft_id')
    .eq('id', id)
    .single();

  if (recordError || !record) {
    console.error('Error loading maintenance record before update:', recordError);
    return NextResponse.json({ error: 'Maintenance record not found.' }, { status: 404 });
  }

  const { error: dbError } = await supabaseAdmin
    .from('maintenance_records')
    .update(dbUpdates)
    .eq('id', id);

  if (dbError) {
    console.error('Error updating maintenance record:', dbError);
    return NextResponse.json({ error: 'Failed to update maintenance record.' }, { status: 500 });
  }

  // Side effect: if this update just finished/cancelled the record, and no
  // OTHER active (SCHEDULED/IN_PROGRESS) record remains for the same
  // aircraft, and the aircraft is currently marked MAINTENANCE, clear it
  // back to ACTIVE — mirrors the client-side logic this route replaces.
  const newStatus = dbUpdates.status;
  if (newStatus === 'COMPLETED' || newStatus === 'CANCELLED') {
    const { data: otherActive } = await supabaseAdmin
      .from('maintenance_records')
      .select('id')
      .eq('aircraft_id', record.aircraft_id)
      .neq('id', id)
      .in('status', ['SCHEDULED', 'IN_PROGRESS'])
      .limit(1);

    if (!otherActive || otherActive.length === 0) {
      const { data: aircraft } = await supabaseAdmin
        .from('aircraft')
        .select('status')
        .eq('id', record.aircraft_id)
        .single();

      if (aircraft?.status === 'MAINTENANCE') {
        const { error: aircraftError } = await supabaseAdmin
          .from('aircraft')
          .update({ status: 'ACTIVE' })
          .eq('id', record.aircraft_id);
        if (aircraftError) {
          console.error('Error clearing aircraft status after maintenance completion:', aircraftError);
        }
      }
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { error } = await requireRole(MAINTENANCE_WRITE_ROLES);
  if (error) return error;

  const { id } = await context.params;

  const { error: dbError } = await supabaseAdmin.from('maintenance_records').delete().eq('id', id);

  if (dbError) {
    console.error('Error deleting maintenance record:', dbError);
    return NextResponse.json({ error: 'Failed to delete maintenance record.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

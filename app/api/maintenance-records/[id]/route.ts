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
import { requireModuleAccess } from '@/lib/api-auth';
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
  // 2026-08-26: aircraft maintenance schedule, Phase 1 — see
  // add-aircraft-maintenance-schedule.sql.
  hobbsAtCompletion: 'hobbs_at_completion',
  // 2026-09-05: DGCA maintenance log (item 42) — see
  // add-dgca-maintenance-log-fields.sql.
  partsUsed: 'parts_used',
  ameName: 'ame_name',
  ameLicenseNo: 'ame_license_no',
  crsReference: 'crs_reference',
};

export async function PATCH(request: Request, context: RouteContext) {
  const { error } = await requireModuleAccess('maintenance', 'full');
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
  // regardless of whether this particular update touches status — and,
  // 2026-09-18 (P0 #4), the current certification fields too: this route
  // gets partial bodies from three different callers (the full form sends
  // everything, the "Log Completion" modal and the one-click "Complete"
  // button send only a few keys each), so whether a record is EFFECTIVELY
  // certified after this update has to be computed by merging this body
  // over the existing row, not by looking at the body alone.
  const { data: record, error: recordError } = await supabaseAdmin
    .from('maintenance_records')
    .select('aircraft_id, status, is_baseline, ame_name, ame_license_no, crs_reference')
    .eq('id', id)
    .single();

  if (recordError || !record) {
    console.error('Error loading maintenance record before update:', recordError);
    return NextResponse.json({ error: 'Maintenance record not found.' }, { status: 404 });
  }

  // is_baseline isn't in FIELD_MAP (it's set once, at creation, never via
  // PATCH), so it always comes from the existing row here.
  const effectiveStatus = dbUpdates.status ?? record.status;
  const effectiveIsBaseline = record.is_baseline;
  if (effectiveStatus === 'COMPLETED' && !effectiveIsBaseline) {
    const effectiveAmeName = dbUpdates.ame_name !== undefined ? dbUpdates.ame_name : record.ame_name;
    const effectiveAmeLicenseNo = dbUpdates.ame_license_no !== undefined ? dbUpdates.ame_license_no : record.ame_license_no;
    const effectiveCrsReference = dbUpdates.crs_reference !== undefined ? dbUpdates.crs_reference : record.crs_reference;
    const missing = ![effectiveAmeName, effectiveAmeLicenseNo, effectiveCrsReference]
      .every(v => typeof v === 'string' && v.trim());
    if (missing) {
      return NextResponse.json({ error: 'AME name, AME licence number, and CRS reference are required to mark maintenance COMPLETED.' }, { status: 400 });
    }
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
  const { error } = await requireModuleAccess('maintenance', 'full');
  if (error) return error;

  const { id } = await context.params;

  const { data: rows, error: dbError } = await supabaseAdmin.from('maintenance_records').delete().eq('id', id).select('id');

  if (dbError) {
    console.error('Error deleting maintenance record:', dbError);
    return NextResponse.json({ error: 'Failed to delete maintenance record.' }, { status: 500 });
  }

  if (!rows?.length) {
    return NextResponse.json({ error: 'Maintenance record not found.' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

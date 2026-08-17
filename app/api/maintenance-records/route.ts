// app/api/maintenance-records/route.ts
// Server-side, role-scoped create for the `maintenance_records` table.
// See app/api/maintenance-records/[id]/route.ts for update/delete and the
// aircraft-status side effect.

import { NextResponse } from 'next/server';
import { requireRole, MAINTENANCE_WRITE_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: Request) {
  const { error } = await requireRole(MAINTENANCE_WRITE_ROLES);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const {
    aircraftId, maintenanceType, description, scheduledDate, completedDate,
    status, cost, performedBy, notes, maintenanceStart, maintenanceEnd,
  } = body as Record<string, unknown>;

  if (!aircraftId || !maintenanceType) {
    return NextResponse.json({ error: 'aircraftId and maintenanceType are required.' }, { status: 400 });
  }

  const { error: dbError } = await supabaseAdmin.from('maintenance_records').insert({
    aircraft_id: aircraftId,
    maintenance_type: maintenanceType,
    description,
    scheduled_date: scheduledDate,
    completed_date: completedDate,
    status,
    cost,
    performed_by: performedBy,
    notes,
    maintenance_start: maintenanceStart ?? null,
    maintenance_end: maintenanceEnd ?? null,
  });

  if (dbError) {
    console.error('Error creating maintenance record:', dbError);
    return NextResponse.json({ error: 'Failed to log maintenance.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// app/api/maintenance-records/route.ts
// Server-side, role-scoped create for the `maintenance_records` table.
// See app/api/maintenance-records/[id]/route.ts for update/delete and the
// aircraft-status side effect.
//
// 2026-08-31: also accepts a pilot-filed "squawk" — instructor/student
// (SQUAWK_REPORT_ROLES) can create a record too, without full maintenance
// write access, via a restricted field set forced server-side regardless
// of what the client sends (status/cost/performedBy/completion fields are
// not theirs to set). See add-squawk-reporting.sql and
// claude/flightlogger-competitive-comparison-2026-08-31.md, gap #2.
//
// 2026-09-03: every record created here also gets a year-scoped ticket
// number — RMT-<year>-NNN for a staff-logged record, IMT-<year>-NNN for a
// pilot-filed squawk (is_squawk) — see add-maintenance-ticket-numbering.sql
// and nextTicketNumber() below. Mirrors nextIncidentNumber() in
// app/api/safety-incidents/route.ts exactly, just with two independent
// counters (one per prefix) sharing the one ticket_number column instead
// of one.

import { NextResponse } from 'next/server';
import { requireModuleAccess, requireRole } from '@/lib/api-auth';
import { SQUAWK_REPORT_ROLES } from '@/lib/permissions';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Computed here rather than a DB sequence, matching this table's existing
// app-owned-denormalized-column convention (is_squawk, reported_by) and the
// identical approach already used for safety_incidents.incident_number.
// Traffic on this table is low, so a plain "max + 1" query per prefix is
// enough; the unique index on ticket_number is the backstop, and the
// caller retries once on a collision.
// ponytail: read-then-insert race window; upgrade to a DB sequence/advisory
// lock if this FTO ever logs concurrent maintenance records in the same
// request tick.
async function nextTicketNumber(prefix: 'RMT' | 'IMT', year: number): Promise<string> {
  const numPrefix = `${prefix}-${year}-`;
  const { data } = await supabaseAdmin
    .from('maintenance_records')
    .select('ticket_number')
    .like('ticket_number', `${numPrefix}%`)
    .order('ticket_number', { ascending: false })
    .limit(1);
  const last = data?.[0]?.ticket_number as string | undefined;
  const lastSeq = last ? parseInt(last.slice(numPrefix.length), 10) || 0 : 0;
  return `${numPrefix}${String(lastSeq + 1).padStart(3, '0')}`;
}

export async function POST(request: Request) {
  // Full staff write access (default MAINTENANCE_WRITE_ROLES, or a granted
  // per-user override) tried first; only falls back to the restricted
  // squawk path if that fails, so an instructor/operations/maintenance
  // user with a full override still gets the full form's fields honored.
  const full = await requireModuleAccess('maintenance', 'full');
  let session = full.session;
  let restricted = false;

  if (full.error) {
    const squawk = await requireRole(SQUAWK_REPORT_ROLES);
    if (squawk.error) return full.error;
    session = squawk.session;
    restricted = true;
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { aircraftId, description, notes } = body as Record<string, unknown>;
  let {
    maintenanceType, scheduledDate, completedDate, status, cost, performedBy,
    maintenanceStart, maintenanceEnd, hobbsAtCompletion,
  } = body as Record<string, unknown>;

  if (!aircraftId) {
    return NextResponse.json({ error: 'aircraftId is required.' }, { status: 400 });
  }

  if (restricted) {
    if (!description || typeof description !== 'string' || !description.trim()) {
      return NextResponse.json({ error: 'A description of the defect is required.' }, { status: 400 });
    }
    // A pilot reports what's wrong — everything else about the record
    // (categorization, cost, who'll fix it, when) is staff's to fill in
    // later via the normal Maintenance page, not something a squawk
    // submission can set.
    maintenanceType = 'Squawk / Pilot Report';
    scheduledDate = scheduledDate || new Date().toISOString().slice(0, 10);
    status = 'SCHEDULED';
    completedDate = null;
    cost = 0;
    performedBy = null;
    maintenanceStart = null;
    maintenanceEnd = null;
    hobbsAtCompletion = null;
  } else if (!maintenanceType) {
    return NextResponse.json({ error: 'aircraftId and maintenanceType are required.' }, { status: 400 });
  }

  const insertRow = {
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
    // 2026-08-26: aircraft maintenance schedule, Phase 1 — anchors future
    // HOBBS_HOURS due-calculations. See add-aircraft-maintenance-schedule.sql.
    hobbs_at_completion: hobbsAtCompletion ?? null,
    reported_by: restricted ? (session?.user.name || session?.user.email || 'Unknown') : null,
    is_squawk: restricted,
  };

  const prefix: 'RMT' | 'IMT' = restricted ? 'IMT' : 'RMT';
  const year = new Date((scheduledDate as string) || new Date().toISOString().slice(0, 10)).getUTCFullYear();

  let ticketNumber = await nextTicketNumber(prefix, year);
  let { error: dbError } = await supabaseAdmin.from('maintenance_records')
    .insert({ ...insertRow, ticket_number: ticketNumber });

  // Unique-violation retry: two records for the same year/prefix landed
  // between the read and the insert. Recompute once and try again — same
  // backstop as nextIncidentNumber()'s caller.
  if (dbError?.code === '23505') {
    ticketNumber = await nextTicketNumber(prefix, year);
    ({ error: dbError } = await supabaseAdmin.from('maintenance_records')
      .insert({ ...insertRow, ticket_number: ticketNumber }));
  }

  if (dbError) {
    console.error('Error creating maintenance record:', dbError);
    return NextResponse.json({ error: 'Failed to log maintenance.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, ticketNumber });
}

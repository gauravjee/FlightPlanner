// app/api/safety-incidents/route.ts
// Safety incident log (2026-08-18) — see add-reports-module.sql for the
// `safety_incidents` table and lib/permissions.ts's INCIDENT_REPORT_ROLES.
// Not the full DGCA-format Incident Report (a separate, larger, not-yet-
// built report) — this exists so the Daily Flying Report's "Safety
// incidents" count has real data instead of a hand-typed number, and so an
// incident isn't lost between the moment it happens and whenever a fuller
// report gets built.
//
// 2026-08-31: extended into a workflow (5x5 risk matrix, corrective
// action, open/in-progress/closed status) — see
// add-safety-incident-workflow.sql. GET/POST here are unchanged (still
// just the initial report); triaging an incident after it's logged is
// PATCH app/api/safety-incidents/[id]/route.ts, gated to the narrower
// INCIDENT_MANAGE_ROLES.
//
// Both listing and creating use the same (deliberately broad)
// INCIDENT_REPORT_ROLES — anyone who can report an incident can also see
// what's already been logged; splitting those into narrower/wider sets
// would mean someone could file a report they can't then see themselves.
//
// 2026-08-31: reporting now also assigns a year-scoped incident number and
// a structured category (technical categories auto-suggest Maintenance as
// assignee) — see add-safety-incident-numbering-and-maintenance-routing.sql
// and lib/permissions.ts's SAFETY_INCIDENT_CATEGORIES.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { INCIDENT_REPORT_ROLES, SAFETY_INCIDENT_CATEGORIES, TECHNICAL_INCIDENT_CATEGORIES } from '@/lib/permissions';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Computed here rather than a DB sequence, matching this table's existing
// app-owned-denormalized-column convention (risk_score). Traffic on this
// table is low (a handful of incidents per year for one FTO), so a plain
// "max + 1" query is enough; the unique index on incident_number is the
// backstop, and the caller retries once on a collision.
// ponytail: read-then-insert race window; upgrade to a DB sequence/advisory
// lock if this FTO ever logs concurrent incidents in the same request tick.
async function nextIncidentNumber(year: number): Promise<string> {
  const prefix = `INC-${year}-`;
  const { data } = await supabaseAdmin
    .from('safety_incidents')
    .select('incident_number')
    .like('incident_number', `${prefix}%`)
    .order('incident_number', { ascending: false })
    .limit(1);
  const last = data?.[0]?.incident_number as string | undefined;
  const lastSeq = last ? parseInt(last.slice(prefix.length), 10) || 0 : 0;
  return `${prefix}${String(lastSeq + 1).padStart(3, '0')}`;
}

export async function GET(request: Request) {
  const { error } = await requireRole(INCIDENT_REPORT_ROLES);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  let query = supabaseAdmin.from('safety_incidents').select('*').order('incident_date', { ascending: false });
  if (date) query = query.eq('incident_date', date);
  if (from) query = query.gte('incident_date', from);
  if (to) query = query.lte('incident_date', to);

  const { data, error: dbError } = await query;
  if (dbError) {
    console.error('Error loading safety incidents:', dbError);
    return NextResponse.json({ error: 'Failed to load safety incidents.' }, { status: 500 });
  }

  const incidents = (data || []).map(row => ({
    id: String(row.id),
    incidentDate: row.incident_date,
    incidentTime: row.incident_time || '',
    aircraftId: row.aircraft_id || undefined,
    aircraftReg: row.aircraft_reg || undefined,
    studentId: row.student_id || undefined,
    studentName: row.student_name || undefined,
    instructorId: row.instructor_id || undefined,
    instructorName: row.instructor_name || undefined,
    description: row.description,
    severity: row.severity,
    reportedBy: row.reported_by || undefined,
    createdAt: row.created_at,
    riskSeverity: row.risk_severity ?? null,
    riskLikelihood: row.risk_likelihood ?? null,
    riskScore: row.risk_score ?? null,
    status: row.status || 'OPEN',
    correctiveAction: row.corrective_action ?? null,
    assignedTo: row.assigned_to ?? null,
    closedBy: row.closed_by ?? null,
    closedAt: row.closed_at ?? null,
    incidentNumber: row.incident_number ?? null,
    category: row.category || 'OTHER',
    resolutionNote: row.resolution_note ?? null,
    resolvedBy: row.resolved_by ?? null,
    resolvedAt: row.resolved_at ?? null,
  }));

  return NextResponse.json({ incidents });
}

export async function POST(request: Request) {
  const { session, error } = await requireRole(INCIDENT_REPORT_ROLES);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const {
    incidentDate, incidentTime, aircraftId, aircraftReg, studentId, studentName,
    instructorId, instructorName, description, severity, category,
  } = body as Record<string, unknown>;

  if (!incidentDate || typeof incidentDate !== 'string') {
    return NextResponse.json({ error: 'incidentDate is required.' }, { status: 400 });
  }
  if (!description || typeof description !== 'string' || !description.trim()) {
    return NextResponse.json({ error: 'A description is required.' }, { status: 400 });
  }
  const allowedSeverity = ['MINOR', 'MAJOR', 'CRITICAL'];
  const safeSeverity = typeof severity === 'string' && allowedSeverity.includes(severity) ? severity : 'MINOR';
  const allowedCategories = SAFETY_INCIDENT_CATEGORIES.map(c => c.value);
  const safeCategory = typeof category === 'string' && allowedCategories.includes(category as typeof allowedCategories[number]) ? category : 'OTHER';
  // Technical categories auto-suggest Maintenance as the assignee — still
  // just a starting point, changeable by whoever triages the incident.
  const autoAssign = TECHNICAL_INCIDENT_CATEGORIES.includes(safeCategory) ? 'Maintenance' : null;

  const year = new Date(incidentDate).getUTCFullYear();
  const insertRow = {
    incident_date: incidentDate,
    incident_time: incidentTime || null,
    aircraft_id: aircraftId || null,
    aircraft_reg: aircraftReg || null,
    student_id: studentId || null,
    student_name: studentName || null,
    instructor_id: instructorId || null,
    instructor_name: instructorName || null,
    description: description.trim(),
    severity: safeSeverity,
    category: safeCategory,
    assigned_to: autoAssign,
    reported_by: session.user.name || session.user.email || 'Unknown',
  };

  let incidentNumber = await nextIncidentNumber(year);
  let { data, error: dbError } = await supabaseAdmin.from('safety_incidents')
    .insert({ ...insertRow, incident_number: incidentNumber }).select().single();

  // Unique-violation retry: two reports for the same year landed between
  // the read and the insert. Recompute once and try again.
  if (dbError?.code === '23505') {
    incidentNumber = await nextIncidentNumber(year);
    ({ data, error: dbError } = await supabaseAdmin.from('safety_incidents')
      .insert({ ...insertRow, incident_number: incidentNumber }).select().single());
  }

  if (dbError) {
    console.error('Error logging safety incident:', dbError);
    return NextResponse.json({ error: 'Failed to log incident.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: String(data.id), incidentNumber });
}

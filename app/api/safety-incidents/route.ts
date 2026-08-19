// app/api/safety-incidents/route.ts
// Minimal safety incident log (2026-08-18) — see add-reports-module.sql
// for the `safety_incidents` table and lib/permissions.ts's
// INCIDENT_REPORT_ROLES. Not the full DGCA-format Incident Report (a
// separate, larger, not-yet-built report) — this exists so the Daily
// Flying Report's "Safety incidents" count has real data instead of a
// hand-typed number, and so an incident isn't lost between the moment it
// happens and whenever a fuller report gets built.
//
// Both listing and creating use the same (deliberately broad)
// INCIDENT_REPORT_ROLES — anyone who can report an incident can also see
// what's already been logged; splitting those into narrower/wider sets
// would mean someone could file a report they can't then see themselves.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { INCIDENT_REPORT_ROLES } from '@/lib/permissions';
import { supabaseAdmin } from '@/lib/supabase-admin';

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
    instructorId, instructorName, description, severity,
  } = body as Record<string, unknown>;

  if (!incidentDate || typeof incidentDate !== 'string') {
    return NextResponse.json({ error: 'incidentDate is required.' }, { status: 400 });
  }
  if (!description || typeof description !== 'string' || !description.trim()) {
    return NextResponse.json({ error: 'A description is required.' }, { status: 400 });
  }
  const allowedSeverity = ['MINOR', 'MAJOR', 'CRITICAL'];
  const safeSeverity = typeof severity === 'string' && allowedSeverity.includes(severity) ? severity : 'MINOR';

  const { data, error: dbError } = await supabaseAdmin.from('safety_incidents').insert({
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
    reported_by: session.user.name || session.user.email || 'Unknown',
  }).select().single();

  if (dbError) {
    console.error('Error logging safety incident:', dbError);
    return NextResponse.json({ error: 'Failed to log incident.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: String(data.id) });
}

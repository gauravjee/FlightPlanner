// app/api/ba-tests/route.ts
// Server-side, role-scoped access to the `ba_tests` table — the Breath
// Analyser Register (2026-08-20). See add-ba-test-and-license-numbers.sql
// for the table, and lib/permissions.ts's BA_TEST_VIEW_ROLES/
// BA_TEST_WRITE_ROLES for who can see vs. add/edit an entry.
//
// Modeled directly on app/api/safety-incidents/route.ts — same shape
// (date-filterable GET, role-checked POST that derives `recordedBy`
// server-side rather than trusting whatever the client sends), built this
// way from the start rather than a direct-from-browser Supabase call, per
// the lesson from the 2026-08-19 post-commit frontend review (most of
// Admin Setup still writes straight to Supabase with only a client-side
// role check — this table doesn't repeat that gap).

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { BA_TEST_VIEW_ROLES, BA_TEST_WRITE_ROLES } from '@/lib/permissions';
import { supabaseAdmin } from '@/lib/supabase-admin';

function mapRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    testDate: row.test_date as string,
    aircraftId: (row.aircraft_id as string) || undefined,
    aircraftReg: (row.aircraft_reg as string) || undefined,
    safetyOfficerId: (row.safety_officer_id as string) || undefined,
    safetyOfficerName: row.safety_officer_name as string,
    personType: row.person_type as 'STUDENT' | 'INSTRUCTOR',
    personId: (row.person_id as string) || undefined,
    personName: row.person_name as string,
    licenseNumber: (row.license_number as string) || undefined,
    reportingTime: (row.reporting_time as string) || undefined,
    baTime: (row.ba_time as string) || undefined,
    baPercentage: row.ba_percentage != null ? Number(row.ba_percentage) : undefined,
    baEquipment: (row.ba_equipment as string) || undefined,
    recordedBy: (row.recorded_by as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function GET(request: Request) {
  const { error } = await requireRole(BA_TEST_VIEW_ROLES);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  let query = supabaseAdmin.from('ba_tests').select('*').order('test_date', { ascending: false }).order('created_at', { ascending: true });
  if (date) query = query.eq('test_date', date);
  if (from) query = query.gte('test_date', from);
  if (to) query = query.lte('test_date', to);

  const { data, error: dbError } = await query;
  if (dbError) {
    console.error('Error loading BA tests:', dbError);
    return NextResponse.json({ error: 'Failed to load BA tests.' }, { status: 500 });
  }

  return NextResponse.json({ baTests: (data || []).map(mapRow) });
}

export async function POST(request: Request) {
  const { session, error } = await requireRole(BA_TEST_WRITE_ROLES);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const {
    testDate, aircraftId, aircraftReg, safetyOfficerId, safetyOfficerName,
    personType, personId, personName, licenseNumber, reportingTime,
    baTime, baPercentage, baEquipment,
  } = body as Record<string, unknown>;

  if (!testDate || typeof testDate !== 'string') {
    return NextResponse.json({ error: 'testDate is required.' }, { status: 400 });
  }
  if (!safetyOfficerName || typeof safetyOfficerName !== 'string' || !safetyOfficerName.trim()) {
    return NextResponse.json({ error: 'A Safety Officer is required.' }, { status: 400 });
  }
  const allowedPersonType = ['STUDENT', 'INSTRUCTOR'];
  if (typeof personType !== 'string' || !allowedPersonType.includes(personType)) {
    return NextResponse.json({ error: 'personType must be STUDENT or INSTRUCTOR.' }, { status: 400 });
  }
  if (!personName || typeof personName !== 'string' || !personName.trim()) {
    return NextResponse.json({ error: 'A Name is required.' }, { status: 400 });
  }

  const { data, error: dbError } = await supabaseAdmin.from('ba_tests').insert({
    test_date: testDate,
    aircraft_id: aircraftId || null,
    aircraft_reg: aircraftReg || null,
    safety_officer_id: safetyOfficerId || null,
    safety_officer_name: safetyOfficerName.trim(),
    person_type: personType,
    person_id: personId || null,
    person_name: personName.trim(),
    license_number: licenseNumber || null,
    reporting_time: reportingTime || null,
    ba_time: baTime || null,
    ba_percentage: typeof baPercentage === 'number' ? baPercentage : (baPercentage ? Number(baPercentage) : null),
    ba_equipment: baEquipment || null,
    recorded_by: session.user.name || session.user.email || 'Unknown',
  }).select().single();

  if (dbError) {
    console.error('Error logging BA test:', dbError);
    return NextResponse.json({ error: 'Failed to log BA test.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, baTest: mapRow(data) });
}

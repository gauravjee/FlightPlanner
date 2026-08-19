// app/api/reports/daily-flying/route.ts
// The Daily Flying Report — the first report in the new Reports section
// (2026-08-18), built to the exact format the user specified: a per-flight
// table (Aircraft/Student/Instructor/Sortie/Start/End/Hours/Dual-Solo/
// Exercise/Remarks) plus a footer of day-level stats.
//
// GET  ?date=YYYY-MM-DD  -> the saved snapshot for that date, if one has
//                           been generated (see daily_flying_reports).
//                           { report: null } if nothing's been generated
//                           for that date yet.
// POST { date, remarks } -> computes the report FRESH from live data,
//                           upserts it into daily_flying_reports (one row
//                           per report_date — regenerating overwrites,
//                           see add-reports-module.sql for why), returns
//                           the saved snapshot. This is both "generate for
//                           the first time" and "regenerate/update
//                           remarks" — there's no separate endpoint for
//                           each.
//
// Row data comes from `flight_records` (actual completed/logged flights
// for the date), NOT `scheduled_flights` (bookings) — a Daily Flying
// Report is compiled from what actually flew, and flight_records already
// has the real Hobbs-derived hours, exercise, and instructor remarks that
// a booking alone doesn't have. Cancellation stats, by contrast, ARE
// scheduling-level (a booking that never became a flight) and so come
// from `scheduled_flights` where status=CANCELLED for the date.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { REPORTS_VIEW_ROLES, REPORTS_WRITE_ROLES } from '@/lib/permissions';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getLocationDisplay } from '@/lib/location';
import {
  isCrossCountrySortie, isNightSortie, flightHoursFromTimes,
} from '@/lib/flight-classification';

// India-only assumption, matching the rest of this app (BookingForm.tsx,
// ScheduleBoard.tsx already hardcode +05:30 for slot-time construction) —
// not a Multi-Airport-aware timezone lookup.
const IST_OFFSET = '+05:30';

async function computeReport(date: string) {
  const [
    { data: flightRows, error: flightErr },
    { data: aircraftRows },
    { data: studentRows },
    { data: instructorRows },
    { data: maintenanceRows },
    { data: cancelledRows },
    { data: incidentRows },
    { data: ftoSettingRows },
  ] = await Promise.all([
    supabaseAdmin.from('flight_records').select('*').eq('flight_date', date),
    supabaseAdmin.from('aircraft').select('id, registration'),
    supabaseAdmin.from('students').select('id, name'),
    supabaseAdmin.from('instructors').select('id, name'),
    supabaseAdmin.from('maintenance_records').select('aircraft_id, status, scheduled_date, maintenance_start, maintenance_end')
      .in('status', ['SCHEDULED', 'IN_PROGRESS']),
    supabaseAdmin.from('scheduled_flights').select('id, cancellation_reason, start_time')
      .eq('status', 'CANCELLED')
      .gte('start_time', `${date}T00:00:00${IST_OFFSET}`)
      .lt('start_time', `${date}T23:59:59.999${IST_OFFSET}`),
    supabaseAdmin.from('safety_incidents').select('id').eq('incident_date', date),
    supabaseAdmin.from('fto_settings').select('setting_key, setting_value')
      .in('setting_key', ['airport_code', 'location_name']),
  ]);

  if (flightErr) throw flightErr;

  const aircraftById = new Map((aircraftRows || []).map(a => [String(a.id), a.registration as string]));
  const studentById = new Map((studentRows || []).map(s => [String(s.id), s.name as string]));
  const instructorById = new Map((instructorRows || []).map(i => [String(i.id), i.name as string]));

  const rows = (flightRows || []).map(row => {
    const hours = (row.total_hours as number) || flightHoursFromTimes(row.departure_time as string, row.arrival_time as string);
    return {
      aircraft: aircraftById.get(String(row.aircraft_id)) || 'Unknown',
      student: studentById.get(String(row.student_id)) || 'Unknown',
      instructor: instructorById.get(String(row.instructor_id)) || 'Unknown',
      sortie: (row.sortie_type as string)?.replace(/_/g, ' ') || '',
      start: (row.departure_time as string) || '',
      end: (row.arrival_time as string) || '',
      hours,
      type: (row.flight_type as string) || '',
      exercise: (row.exercise as string) || '',
      remarks: (row.instructor_notes as string) || '',
      // Kept for stat computation below, not part of the printed row.
      _sortieTypeRaw: (row.sortie_type as string) || '',
      _flightType: (row.flight_type as string) || '',
    };
  });

  const sum = (pred: (r: typeof rows[number]) => boolean) =>
    Math.round(rows.filter(pred).reduce((s, r) => s + (r.hours || 0), 0) * 10) / 10;

  const dualHours = sum(r => r._flightType === 'DUAL');
  const soloHours = sum(r => r._flightType === 'SOLO');
  const totalAircraftHours = Math.round(rows.reduce((s, r) => s + (r.hours || 0), 0) * 10) / 10;

  // Aircraft "grounded" on this date — active (not completed/cancelled)
  // maintenance whose window overlaps the date. Uses maintenanceStart/End
  // when set (precise window, may span days), else treats scheduledDate
  // as blocking that single day — same interpretation ScheduleBoard/
  // MaintenanceForm already use for scheduling conflicts.
  const dayStart = new Date(`${date}T00:00:00${IST_OFFSET}`).getTime();
  const dayEnd = new Date(`${date}T23:59:59.999${IST_OFFSET}`).getTime();
  const groundedAircraftIds = new Set<string>();
  for (const m of maintenanceRows || []) {
    let winStart: number; let winEnd: number;
    if (m.maintenance_start) {
      winStart = new Date(m.maintenance_start as string).getTime();
      winEnd = m.maintenance_end ? new Date(m.maintenance_end as string).getTime() : Infinity;
    } else {
      winStart = new Date(`${m.scheduled_date}T00:00:00${IST_OFFSET}`).getTime();
      winEnd = new Date(`${m.scheduled_date}T23:59:59.999${IST_OFFSET}`).getTime();
    }
    if (winStart <= dayEnd && winEnd >= dayStart) groundedAircraftIds.add(String(m.aircraft_id));
  }

  const cancellations = cancelledRows || [];
  const weatherCancellations = cancellations.filter(c => c.cancellation_reason === 'WEATHER').length;
  const maintenanceCancellations = cancellations.filter(c => c.cancellation_reason === 'MAINTENANCE').length;
  const otherCancellations = cancellations.length - weatherCancellations - maintenanceCancellations;

  const settingsMap = new Map((ftoSettingRows || []).map(r => [r.setting_key as string, r.setting_value as string]));
  const airportDisplay = getLocationDisplay(settingsMap.get('airport_code') || '', settingsMap.get('location_name') || '');

  const stats = {
    totalAircraftHours,
    // Every flight_records row requires a student, so this equals
    // totalAircraftHours today — kept as its own stat (rather than
    // silently aliased) since the report format calls it out as a
    // distinct line, and a future flight type without a student
    // (e.g. a positioning/maintenance test flight) would make the two
    // diverge.
    totalStudentHours: sum(r => !!r.student && r.student !== 'Unknown'),
    // Instructor hours = time an instructor actually spent flying
    // (DUAL) — a solo flight's assigned instructor is the supervising/
    // authorizing one, not someone in the aircraft, so it isn't counted
    // as their flying time here. See lib/permissions.ts's REPORTS_*
    // comment for this same assumption flagged for review.
    totalInstructorHours: dualHours,
    dualHours,
    soloHours,
    crossCountryHours: sum(r => isCrossCountrySortie(r._sortieTypeRaw)),
    nightHours: sum(r => isNightSortie(r._sortieTypeRaw)),
    aircraftGrounded: groundedAircraftIds.size,
    flightsCancelled: cancellations.length,
    weatherCancellations,
    maintenanceCancellations,
    otherCancellations,
    safetyIncidents: (incidentRows || []).length,
  };

  // Built field-by-field rather than via destructure-and-discard
  // (`const { _sortieTypeRaw, _flightType, ...r } = row`) — that pattern
  // trips @typescript-eslint/no-unused-vars on the two discarded names
  // even though discarding is the point, since this project's eslint
  // config has no varsIgnorePattern for it. Explicit field list is a few
  // more lines but lint-clean and just as clear about what's printed.
  const printedRows = rows.map(r => ({
    aircraft: r.aircraft,
    student: r.student,
    instructor: r.instructor,
    sortie: r.sortie,
    start: r.start,
    end: r.end,
    hours: r.hours,
    type: r.type,
    exercise: r.exercise,
    remarks: r.remarks,
  }));

  return { rows: printedRows, stats, airportCode: airportDisplay };
}

export async function GET(request: Request) {
  const { error } = await requireRole(REPORTS_VIEW_ROLES);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  if (!date) return NextResponse.json({ error: 'date is required.' }, { status: 400 });

  const { data, error: dbError } = await supabaseAdmin
    .from('daily_flying_reports')
    .select('*')
    .eq('report_date', date)
    .maybeSingle();

  if (dbError) {
    console.error('Error loading daily flying report:', dbError);
    return NextResponse.json({ error: 'Failed to load report.' }, { status: 500 });
  }

  if (!data) return NextResponse.json({ report: null });

  return NextResponse.json({
    report: {
      id: String(data.id),
      reportDate: data.report_date,
      airportCode: data.airport_code || '',
      rows: data.rows || [],
      stats: data.stats || {},
      remarks: data.remarks || '',
      generatedBy: data.generated_by || '',
      generatedAt: data.generated_at,
      updatedAt: data.updated_at,
    },
  });
}

export async function POST(request: Request) {
  const { session, error } = await requireRole(REPORTS_WRITE_ROLES);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { date, remarks } = body as Record<string, unknown>;
  if (!date || typeof date !== 'string') {
    return NextResponse.json({ error: 'date is required.' }, { status: 400 });
  }

  let computed;
  try {
    computed = await computeReport(date);
  } catch (e) {
    console.error('Error computing daily flying report:', e);
    return NextResponse.json({ error: 'Failed to compute report.' }, { status: 500 });
  }

  const { data, error: upsertError } = await supabaseAdmin
    .from('daily_flying_reports')
    .upsert({
      report_date: date,
      airport_code: computed.airportCode,
      rows: computed.rows,
      stats: computed.stats,
      remarks: typeof remarks === 'string' ? remarks : '',
      generated_by: session.user.name || session.user.email || 'Unknown',
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'report_date' })
    .select()
    .single();

  if (upsertError) {
    console.error('Error saving daily flying report:', upsertError);
    return NextResponse.json({ error: 'Failed to save report.' }, { status: 500 });
  }

  return NextResponse.json({
    report: {
      id: String(data.id),
      reportDate: data.report_date,
      airportCode: data.airport_code || '',
      rows: data.rows || [],
      stats: data.stats || {},
      remarks: data.remarks || '',
      generatedBy: data.generated_by || '',
      generatedAt: data.generated_at,
      updatedAt: data.updated_at,
    },
  });
}

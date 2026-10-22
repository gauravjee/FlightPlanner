// app/api/billing/reconciliation/route.ts — billing B4b (22 Oct; claude/billing-design-2026-10-20.md, "B4 plan").
// GET ?from&to: every logbook flight in the period beside its charge (live charge, package hours, voided charges),
// with student and aircraft names. Totals by month / student / aircraft are worked out on the page. BILLING_REPORT_ROLES.
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { BILLING_REPORT_ROLES } from '@/lib/permissions';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { allRows, reportPeriod } from '@/lib/billing-server';
import { reconcile } from '@/lib/billing';

export async function GET(request: Request) {
  const { error } = await requireRole(BILLING_REPORT_ROLES);
  if (error) return error;
  const period = reportPeriod(new URL(request.url).searchParams);
  if (!period) return NextResponse.json({ error: 'Pick a valid period: From on or before To, at most 400 days.' }, { status: 400 });
  try {
    const [flights, charges, usage, { data: students }, { data: aircraft }] = await Promise.all([
      allRows(a => supabaseAdmin.from('flight_records').select('id, flight_date, student_id, aircraft_id, total_hours, flight_type')
        .gte('flight_date', period.from).lte('flight_date', period.to).order('flight_date').order('id').range(a, a + 999)),
      // A logbook charge is dated on its flight's date (chargeLogbookEntry), so the same period finds it.
      allRows(a => supabaseAdmin.from('ledger_entries').select('source_id, debit, hours, voided_at')
        .eq('source', 'LOGBOOK').gte('entry_date', period.from).lte('entry_date', period.to).order('id').range(a, a + 999)),
      allRows(a => supabaseAdmin.from('package_usage').select('flight_record_id, hours, flight_records!inner(flight_date)')
        .gte('flight_records.flight_date', period.from).lte('flight_records.flight_date', period.to).order('id').range(a, a + 999)),
      supabaseAdmin.from('students').select('id, name'),
      supabaseAdmin.from('aircraft').select('id, registration'),
    ]);
    const name = new Map((students ?? []).map(s => [String(s.id), s.name as string]));
    const reg = new Map((aircraft ?? []).map(a => [String(a.id), a.registration as string]));
    const rows = reconcile(flights, charges, usage).map(r => ({
      ...r, student: r.student_id ? name.get(String(r.student_id)) ?? 'Unknown' : '', aircraft: reg.get(String(r.aircraft_id)) ?? 'Unknown',
    }));
    return NextResponse.json({ ...period, rows });
  } catch (e) {
    console.error('Billing reconciliation failed:', e);
    return NextResponse.json({ error: 'Failed to build the reconciliation report.' }, { status: 500 });
  }
}

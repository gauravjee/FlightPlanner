// app/api/billing/statements/route.ts — billing B4b (22 Oct; claude/billing-design-2026-10-20.md, "B4 plan").
// GET ?from&to&studentId  individual statement: opening balance, the period's live entries with a running balance,
//                         closing balance. A student gets only their own (studentId ignored); staff: BILLING_REPORT_ROLES.
// GET ?from&to&all=1      consolidated: one row per student (opening, charges, payments / credits, closing) + totals.
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-auth';
import { BILLING_REPORT_ROLES } from '@/lib/permissions';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { allRows, reportPeriod } from '@/lib/billing-server';
import { statementOf, round2 } from '@/lib/billing';

export async function GET(request: Request) {
  const { session, error } = await requireSession();
  if (error) return error;
  const params = new URL(request.url).searchParams;
  const period = reportPeriod(params);
  if (!period) return NextResponse.json({ error: 'Pick a valid period: From on or before To, at most 400 days.' }, { status: 400 });
  const role = session.user.role ?? '';
  const student = role === 'student';
  if (!student && !BILLING_REPORT_ROLES.includes(role)) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });

  try {
    if (params.get('all') === '1' && !student) {
      const entries = await allRows(a => supabaseAdmin.from('ledger_entries').select('id, student_id, entry_date, debit, credit')
        .is('voided_at', null).lte('entry_date', period.to).order('id').range(a, a + 999));
      const { data: students } = await supabaseAdmin.from('students').select('id, name, enrollment_id, status').order('name');
      const rows = (students ?? []).map(s => {
        const st = statementOf(entries.filter(e => String(e.student_id) === String(s.id)), period.from, period.to);
        return { id: s.id, name: s.name, enrollmentId: s.enrollment_id, status: s.status, opening: st.opening, charges: st.charges, credits: st.credits, closing: st.closing };
      }).filter(r => r.opening || r.charges || r.credits);
      const sum = (k: 'opening' | 'charges' | 'credits' | 'closing') => round2(rows.reduce((t, r) => t + r[k], 0));
      return NextResponse.json({ ...period, rows, totals: { opening: sum('opening'), charges: sum('charges'), credits: sum('credits'), closing: sum('closing') } });
    }

    const studentId = student ? session.user.studentId : params.get('studentId');
    if (!studentId) return NextResponse.json({ error: student ? 'No student profile is linked to this account.' : 'Pick a student.' }, { status: 400 });
    const { data: s } = await supabaseAdmin.from('students').select('id, name, enrollment_id, address').eq('id', studentId).maybeSingle();
    if (!s) return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
    const entries = await allRows(a => supabaseAdmin.from('ledger_entries')
      .select('id, entry_date, kind, description, method, reference, debit, credit, voided_at')
      .eq('student_id', studentId).is('voided_at', null).lte('entry_date', period.to).order('id').range(a, a + 999));
    return NextResponse.json({ ...period, student: { id: s.id, name: s.name, enrollmentId: s.enrollment_id, address: s.address ?? '' }, ...statementOf(entries, period.from, period.to) });
  } catch (e) {
    console.error('Billing statement failed:', e);
    return NextResponse.json({ error: 'Failed to build the statement.' }, { status: 500 });
  }
}

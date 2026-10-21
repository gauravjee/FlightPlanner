// GET /api/billing/accounts — billing B1: every student with their balance and credit limit (Accounts page).
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { BILLING_VIEW_ROLES } from '@/lib/permissions';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { balances } from '@/lib/billing-server';
import { dueNow } from '@/lib/billing';
import { todayIST } from '@/lib/ist';

export async function GET() {
  const { error } = await requireRole(BILLING_VIEW_ROLES);
  if (error) return error;
  const { data: students, error: dbError } = await supabaseAdmin.from('students')
    .select('id, name, enrollment_id, status, training_stage, credit_limit').order('name');
  if (dbError) {
    console.error('Error loading students for accounts:', dbError.code);
    return NextResponse.json({ error: 'Failed to load accounts.' }, { status: 500 });
  }
  const bal = await balances();
  // B2: each active package's plan, for "due now" / overdue.
  const { data: active } = await supabaseAdmin.from('student_packages').select('id, student_id, name').eq('status', 'ACTIVE');
  const { data: plans } = active?.length
    ? await supabaseAdmin.from('package_instalments').select('student_package_id, due_date, amount').in('student_package_id', active.map(p => p.id))
    : { data: [] };
  const today = todayIST();
  return NextResponse.json({
    accounts: (students ?? []).map(s => {
      const balance = bal.get(String(s.id)) ?? 0;
      const sp = active?.find(p => String(p.student_id) === String(s.id));
      const due = dueNow(balance, sp ? (plans ?? []).filter(i => i.student_package_id === sp.id) : [], today);
      return {
        id: s.id, name: s.name, enrollmentId: s.enrollment_id, status: s.status, stage: s.training_stage,
        balance, creditLimit: Number(s.credit_limit ?? 0), packageName: sp?.name ?? null, dueNow: due.due, overdue: due.overdue,
      };
    }),
  });
}

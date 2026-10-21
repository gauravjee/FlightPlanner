// GET /api/billing/accounts — billing B1: every student with their balance and credit limit (Accounts page).
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { BILLING_VIEW_ROLES } from '@/lib/permissions';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { balances } from '@/lib/billing-server';

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
  return NextResponse.json({
    accounts: (students ?? []).map(s => ({
      id: s.id, name: s.name, enrollmentId: s.enrollment_id, status: s.status, stage: s.training_stage,
      balance: bal.get(String(s.id)) ?? 0, creditLimit: Number(s.credit_limit ?? 0),
    })),
  });
}

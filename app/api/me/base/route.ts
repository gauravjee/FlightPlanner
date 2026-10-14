// app/api/me/base/route.ts — multi-base M3: the signed-in user's own home base (staff or student
// record), so the header switcher can start there. Nothing else is returned.

import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;

  const { data: user } = await supabaseAdmin.from('users')
    .select('staff_member_id, student_id').eq('email', session.user.email ?? '').maybeSingle();
  let homeBaseId: number | null = null;
  if (user?.staff_member_id) {
    const { data } = await supabaseAdmin.from('staff_members').select('home_base_id').eq('id', user.staff_member_id).maybeSingle();
    homeBaseId = data?.home_base_id ?? null;
  } else if (user?.student_id) {
    const { data } = await supabaseAdmin.from('students').select('home_base_id').eq('id', user.student_id).maybeSingle();
    homeBaseId = data?.home_base_id ?? null;
  }
  return NextResponse.json({ homeBaseId });
}

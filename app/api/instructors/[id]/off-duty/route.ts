// app/api/instructors/[id]/off-duty/route.ts
// One-day "Off duty today" override for the computed instructor status
// (2026-09-23; claude/instructor-status-plan-2026-09-23.md, option (b)).
// POST { offDuty: true } stores today's IST date in instructors.off_duty_date,
// { offDuty: false } clears it. The status only reads Off duty while that
// date is today, so it expires at midnight with nothing to reset.
//
// A dedicated route rather than a field on PATCH /api/instructors/[id]:
// that route is gated to Full Access on the Instructors module (admin/
// super_admin by default), but marking someone off duty for the day is
// flight-line work operations does. Needs add-instructor-off-duty-date.sql.

import { NextResponse } from 'next/server';
import { requireRole, INSTRUCTOR_OFF_DUTY_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { todayIST } from '@/lib/ist';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { error } = await requireRole(INSTRUCTOR_OFF_DUTY_ROLES);
  if (error) return error;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (typeof body?.offDuty !== 'boolean') {
    return NextResponse.json({ error: 'offDuty (true/false) is required.' }, { status: 400 });
  }

  const offDutyDate = body.offDuty ? todayIST() : null;
  const { data: rows, error: dbError } = await supabaseAdmin
    .from('instructors').update({ off_duty_date: offDutyDate }).eq('id', id).select('id');
  if (dbError) {
    console.error('Error setting off duty:', dbError);
    return NextResponse.json({ error: 'Failed to update off-duty status.' }, { status: 500 });
  }
  if (!rows?.length) return NextResponse.json({ error: 'Instructor not found.' }, { status: 404 });

  return NextResponse.json({ success: true, offDutyDate });
}

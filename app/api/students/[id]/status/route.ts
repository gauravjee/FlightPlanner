// app/api/students/[id]/status/route.ts
// POST { status, reason?, disableLogin?, groundedUntil? }: B4 student status change. Admin / super admin only
// (operator, 13 Oct; claude/student-master-design-2026-10-13.md §4, Q1, Q2).
// - Suspended and Left need a reason; every change records who and when.
// - Graduated / Left: refused (409, with the list) while the student has future bookings.
// - Suspended: their future bookings are cancelled automatically ("Student suspended").
// - Grounded (operator, 14 Oct): a temporary suspension with an end date (groundedUntil, inclusive).
//   Bookings up to that date are cancelled, later ones stay; the daily cron returns them to Active
//   (app/api/cron/check-notifications). Re-grounding a grounded student changes the date.
// - Left: the login is disabled unless disableLogin is false (the form's tick box, ticked by default).
// Going back to Active is allowed and recorded; a disabled login is re-enabled in User Management.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { STUDENT_ADMIN_ROLES, STUDENT_STATUSES, groundedCancelBefore } from '@/lib/student-server';
import { todayIST } from '@/lib/ist';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { session, error } = await requireRole(STUDENT_ADMIN_ROLES);
  if (error) return error;
  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const status = String(body.status ?? '');
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!(STUDENT_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: 'Status must be Active, Grounded, Suspended, Graduated or Left.' }, { status: 400 });
  }
  if ((status === 'GROUNDED' || status === 'SUSPENDED' || status === 'LEFT') && !reason) {
    return NextResponse.json({ error: 'A reason is required for Grounded, Suspended and Left.' }, { status: 400 });
  }
  const groundedUntil = status === 'GROUNDED' ? String(body.groundedUntil ?? '') : null;
  if (groundedUntil !== null && !(/^\d{4}-\d{2}-\d{2}$/.test(groundedUntil) && groundedUntil >= todayIST())) {
    return NextResponse.json({ error: 'Grounded needs an end date, today or later.' }, { status: 400 });
  }

  const { data: student, error: loadError } = await supabaseAdmin.from('students').select('status').eq('id', id).maybeSingle();
  if (loadError && loadError.code !== '22P02') {
    console.error('Error loading student for status change:', loadError.code);
    return NextResponse.json({ error: 'Failed to change status.' }, { status: 500 });
  }
  if (!student) return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
  if (student.status === status && status !== 'GROUNDED') return NextResponse.json({ error: 'The student already has that status.' }, { status: 400 });

  // Future bookings: not yet flown and not cancelled.
  let futureQuery = supabaseAdmin.from('scheduled_flights').select('id, start_time')
    .eq('student_id', id).in('status', ['SCHEDULED', 'PENDING_APPROVAL']).gt('start_time', new Date().toISOString());
  if (groundedUntil) futureQuery = futureQuery.lt('start_time', groundedCancelBefore(groundedUntil)); // later bookings stay
  const { data: future, error: futureError } = await futureQuery.order('start_time');
  if (futureError) {
    console.error('Error loading future bookings for status change:', futureError.code);
    return NextResponse.json({ error: 'Failed to change status.' }, { status: 500 });
  }
  const bookings = (future ?? []).map(f => ({ id: f.id as number, start: f.start_time as string }));
  if ((status === 'GRADUATED' || status === 'LEFT') && bookings.length) {
    return NextResponse.json({ error: `Cancel this student's ${bookings.length} future booking(s) first.`, bookings }, { status: 409 });
  }

  const { data: actor } = await supabaseAdmin.from('users').select('id').eq('email', session.user.email ?? '').maybeSingle();
  const { error: updateError } = await supabaseAdmin.from('students').update({
    status,
    status_changed_at: new Date().toISOString(),
    status_changed_by: actor?.id ?? null,
    status_reason: reason || null,
    grounded_until: groundedUntil,
  }).eq('id', id);
  if (updateError) {
    console.error('Error changing student status:', updateError.code);
    return NextResponse.json({ error: 'Failed to change status.' }, { status: 500 });
  }

  let cancelled: typeof bookings = [];
  if ((status === 'SUSPENDED' || status === 'GROUNDED') && bookings.length) {
    const note = status === 'GROUNDED' ? `Student grounded until ${groundedUntil}: ${reason}` : `Student suspended: ${reason}`;
    const { error: cancelError } = await supabaseAdmin.from('scheduled_flights')
      .update({ status: 'CANCELLED', cancellation_reason: 'OTHER', cancellation_note: note })
      .in('id', bookings.map(b => b.id));
    if (cancelError) {
      console.error('Error cancelling a suspended or grounded student\'s bookings:', cancelError.code);
      return NextResponse.json({ error: `Status changed to ${status === 'GROUNDED' ? 'Grounded' : 'Suspended'}, but their bookings could not be cancelled. Cancel them on the schedule.`, bookings }, { status: 500 });
    }
    cancelled = bookings;
  }

  let loginDisabled = false;
  if (status === 'LEFT' && body.disableLogin !== false) {
    const { error: loginError } = await supabaseAdmin.from('users').update({ is_active: false }).eq('student_id', id);
    if (loginError) {
      console.error('Error disabling a leaving student\'s login:', loginError.code);
      return NextResponse.json({ error: 'Status changed to Left, but the login could not be disabled. Disable it in User Management.' }, { status: 500 });
    }
    loginDisabled = true;
  }

  return NextResponse.json({ success: true, cancelled, loginDisabled });
}

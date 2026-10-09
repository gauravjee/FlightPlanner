// app/api/cron/staff-leavers/route.ts
// B2 S3b (operator decision 2026-09-24): at 17:00 IST on a staff member's last
// working day, their instructor profile becomes Inactive, their AME entry
// inactive, and their login disabled. cron-job.org calls this daily at 17:00
// IST (?secret=CRON_SECRET). The login check (lib/auth.ts) and booking checks
// (instructorLeftBefore in lib/staff-server.ts) already apply the cutoff to the
// minute; this job updates the stored flags so every list shows the right
// status. Safe to run any number of times — it only touches people who have
// left and whose flags are still on. Changing a last working day to a later
// date afterwards does NOT switch anything back on (re-activate by hand).
// Same shared-secret check as /api/cron/check-notifications.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { hasLeft } from '@/lib/staff-id';
import { todayIST } from '@/lib/ist';

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const headerSecret = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const querySecret = new URL(request.url).searchParams.get('secret');
    if (headerSecret !== cronSecret && querySecret !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else {
    console.warn('⚠️ CRON_SECRET is not set — /api/cron/staff-leavers is unauthenticated. Set CRON_SECRET.');
  }

  const { data, error } = await supabaseAdmin.from('staff_members')
    .select('id, last_working_date').not('last_working_date', 'is', null).lte('last_working_date', todayIST());
  if (error) {
    console.error('staff-leavers: failed to load staff:', error.code);
    return NextResponse.json({ error: 'Failed to load staff.' }, { status: 500 });
  }
  const ids = (data ?? []).filter(s => hasLeft(s.last_working_date as string)).map(s => s.id as number);
  if (ids.length === 0) return NextResponse.json({ left: 0 });

  const [instr, ames, users] = await Promise.all([
    supabaseAdmin.from('instructors').update({ employment_status: 'INACTIVE' }).in('staff_member_id', ids).eq('employment_status', 'ACTIVE').select('id'),
    supabaseAdmin.from('ames').update({ is_active: false }).in('staff_member_id', ids).eq('is_active', true).select('id'),
    supabaseAdmin.from('users').update({ is_active: false }).in('staff_member_id', ids).eq('is_active', true).select('id'),
  ]);
  const failed = [instr, ames, users].find(r => r.error);
  if (failed) {
    console.error('staff-leavers: update failed:', failed.error!.code);
    return NextResponse.json({ error: 'Failed to update leavers.' }, { status: 500 });
  }
  // Operator, 8 Oct: students of an instructor who has just left are unassigned (flights keep the link).
  const leftInstructors = instr.data!.map(r => String(r.id));
  const unassigned = leftInstructors.length
    ? await supabaseAdmin.from('students').update({ assigned_instructor_id: null }).in('assigned_instructor_id', leftInstructors).select('id')
    : { data: [], error: null };
  if (unassigned.error) console.error('staff-leavers: unassigning students failed:', unassigned.error.code);
  const result = { left: ids.length, instructorsInactive: instr.data!.length, amesInactive: ames.data!.length, loginsDisabled: users.data!.length, studentsUnassigned: unassigned.data?.length ?? 0 };
  console.log('staff-leavers:', result);
  return NextResponse.json(result);
}

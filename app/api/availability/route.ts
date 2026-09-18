// app/api/availability/route.ts
// Server-side, role-scoped create for the `availability` table (instructor/
// student leave & unavailability records).
//
// 2026-09-18 (RLS exposure remediation, see
// claude/rls-exposure-2026-09-18.md): lib/hooks/useAvailability.ts's
// addAvailability()/updateAvailability()/removeAvailability() used to write
// straight to Supabase with the anon key and no server-side role check at
// all. Gated to AVAILABILITY_VIEW_ROLES — per lib/permissions.ts's own
// comment there, this table has no separate write-only role set: admin/
// instructor/super_admin/operations can all view AND manage every leave
// record (no "own record only" restriction in the existing UI either — see
// app/dashboard/availability/page.tsx, which wraps the whole page,
// including the Add/Edit/Delete controls, in one RoleGate).
//
// createdBy is a free-text field the form lets the user type their own name
// into (not derived from the session) — a pre-existing data-integrity quirk,
// unchanged here; fixing that is a product decision, not part of this
// remediation.

import { NextResponse } from 'next/server';
import { requireRole, AVAILABILITY_VIEW_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: Request) {
  const { error } = await requireRole(AVAILABILITY_VIEW_ROLES);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { personType, personId, leaveType, startDate, endDate, startTime, endTime, reason, status, createdBy } =
    body as Record<string, unknown>;

  if (!personType || !personId || !leaveType || !startDate || !endDate) {
    return NextResponse.json(
      { error: 'personType, personId, leaveType, startDate and endDate are required.' },
      { status: 400 }
    );
  }

  const { data, error: dbError } = await supabaseAdmin
    .from('availability')
    .insert({
      person_type: personType, person_id: personId, leave_type: leaveType,
      start_date: startDate, end_date: endDate,
      start_time: startTime || null, end_time: endTime || null,
      reason: reason || null, status: status || 'APPROVED', created_by: createdBy || null,
    })
    .select()
    .single();

  if (dbError) {
    console.error('Error creating availability record:', dbError);
    return NextResponse.json({ error: 'Failed to create leave record.' }, { status: 500 });
  }

  return NextResponse.json({ record: data });
}

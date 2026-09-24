// app/api/instructors/route.ts
// Server-side, role-scoped create for the `instructors` table (the
// full roster — separate from an individual instructor's own "My
// Students" page). Per the 2026-08-17 role/tab matrix, only admin/
// super_admin manage the roster itself.
//
// 2026-08-20: licenseNumber (the instructor's CPL number — reused directly
// as their CPL number for the Breath Analyser Register, see
// add-ba-test-and-license-numbers.sql) was already required client-side in
// InstructorFormModal.tsx (HTML `required` + a JS guard), but this route
// itself accepted a blank/missing value with no complaint — a client-only
// check isn't real protection in this app (same lesson as the Requirements
// Checklist toggle route and the SPL number check below). Enforced here too
// now, matching name/initials.
//
// GET added 2026-09-18 (RLS remediation, Batch 2 — see
// claude/data-access-security-mapping.md): reads used to be a direct
// client-side `supabase.from('instructors')` call (anon key) from
// useInstructors.ts's fetchInstructors() — the full roster, including CPL
// license numbers and contact info. `requireSession()` only, matching
// aircraft/fto-settings/fuel-records: every logged-in role could already
// read this via the anon key with zero gating (BookingForm, ScheduleBoard,
// and other non-admin surfaces all need the roster), so this closes the
// anon-key hole without narrowing who among logged-in users can see it.

import { NextResponse } from 'next/server';
import { requireModuleAccess, requireSession } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { resolveStaffLink, removeNewStaff } from '@/lib/staff-server';

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  // 2026-09-24 (B2 S3a): joining date and last working day come from the
  // linked staff record (the old instructor columns are the fallback for an
  // unlinked row). Only the staff ID and those two dates are read — never
  // personal fields, since every logged-in role can call this.
  const { data, error: dbError } = await supabaseAdmin
    .from('instructors')
    .select('*, staff:staff_members!instructors_staff_member_id_fkey(staff_id, joining_date, last_working_date)')
    .order('name', { ascending: true });

  if (dbError) {
    console.error('Error loading instructors:', dbError);
    return NextResponse.json({ error: 'Failed to load instructors.' }, { status: 500 });
  }

  const instructors = (data ?? []).map(({ staff, ...row }) => {
    const s = (Array.isArray(staff) ? staff[0] : staff) as { staff_id: string; joining_date: string; last_working_date: string | null } | null;
    return s
      ? { ...row, staff_id: s.staff_id, joining_date: s.joining_date, last_working_date: s.last_working_date }
      : { ...row, staff_id: null };
  });
  return NextResponse.json({ instructors });
}

export async function POST(request: Request) {
  const { error } = await requireModuleAccess('instructors', 'full');
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { name, initials, licenseNumber, licenseExpiryDate, licenseIssueDate, ratings, maxDailyHours, email, phone, status } =
    body as Record<string, unknown>;

  if (!name || !initials) {
    return NextResponse.json({ error: 'name and initials are required.' }, { status: 400 });
  }
  if (typeof licenseNumber !== 'string' || !licenseNumber.trim()) {
    return NextResponse.json({ error: 'CPL license number is required.' }, { status: 400 });
  }

  // 2026-09-24 (B2 S3a): the instructor profile belongs to a staff record —
  // an existing one without an instructor profile, or a new one created here.
  const link = await resolveStaffLink(body, String(name), 'instructors');
  if (link.error !== null) return NextResponse.json({ error: link.error }, { status: 400 });

  const { data, error: dbError } = await supabaseAdmin
    .from('instructors')
    .insert({
      staff_member_id: link.staffMemberId,
      name, initials,
      license_number: licenseNumber,
      // 2026-08-20: license_expiry_date/license_issue_date pair with
      // license_number above — optional (not every existing instructor
      // record will have these filled in immediately), unlike
      // license_number itself.
      license_expiry_date: licenseExpiryDate || null,
      license_issue_date: licenseIssueDate || null,
      ratings,
      max_daily_hours: maxDailyHours,
      email, phone, status,
      // can_self_book intentionally omitted — defaults to false (see
      // add-instructor-self-booking-permission.sql). Granted afterward by
      // a super_admin via PATCH, never at creation time.
    })
    .select()
    .single();

  if (dbError) {
    console.error('Error creating instructor:', dbError);
    if (link.created) await removeNewStaff(link.staffMemberId);
    return NextResponse.json({ error: 'Failed to create instructor.' }, { status: 500 });
  }

  return NextResponse.json({ instructor: data });
}

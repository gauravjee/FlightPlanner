// app/api/ground-school/enrollment/route.ts
// ---------------------------------------------------------------------------
// Server-side, role-scoped writes to `ground_school_enrollment`.
//
// WHY THIS EXISTS (2026-09-16). The 2026-08-24 whole-frontend review's
// security pass fixed four direct-write-bypass findings behind gated routes
// (the generic Admin Setup config route, the direct-exam route). Two more of
// the same shape were found alongside them, logged as item 39, and never
// actioned — they then dropped off the open-work tracker entirely. This is
// the first half of closing them.
//
// Before this route, `app/dashboard/ground-school/attendance/page.tsx` wrote
// to `ground_school_enrollment` straight from the browser with the public
// anon key: attendance status, five exam fields, adding a student to a class,
// and removing one. The page carries a RoleGate, but a RoleGate is a UI
// control — it decides what renders, not what the database accepts. Anyone
// with the anon key (it ships in the JS bundle, by design) could set any
// student's attendance or exam result on any class.
//
// ⚠️ THE FIELD WHITELIST IS THE POINT OF THE PATCH HANDLER, not decoration.
// The page's updateExam() passed an arbitrary column name straight through as
// `{ [field]: value }`. A route that forwarded that verbatim would be an
// arbitrary-column-write primitive on this table — strictly worse than the
// direct client write it replaced, because it would carry the service-role
// key. Only the five columns the UI actually edits are accepted; anything
// else is rejected by name.
//
// SCOPE, DELIBERATELY: this changes WHERE the check happens, not WHO passes
// it. GROUND_SCHOOL_WRITE_ROLES is exactly the role list the attendance
// page's RoleGate already used inline (admin/instructor/super_admin/
// operations), now a named constant both read from — so the page and the
// route cannot drift apart, the same reasoning MODULE_ACCESS documents for
// itself. Widening or narrowing who may mark attendance is a separate
// decision and is not made here.
//
// 2026-09-16 (follow-up): every mutation asks for the affected rows back with
// .select('id') and 404s when nothing matched. Supabase does NOT error on an
// update/delete that matches zero rows — it returns success. Without this the
// page would show a saved change that never happened: the same false-success
// shape as the DebriefForm bug (5dc2b43).
// ---------------------------------------------------------------------------

import { NextResponse } from 'next/server';
import { requireRole, GROUND_SCHOOL_WRITE_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * The only columns a client may set through this route, matching exactly what
 * the attendance page's controls edit. `class_id` and `student_id` are
 * deliberately absent: re-pointing an existing enrollment row at a different
 * student or class is not something any screen offers, and allowing it here
 * would let a caller rewrite one student's record onto another.
 */
const UPDATABLE_FIELDS = [
  'attendance_status',
  'exam_score',
  'exam_result',
  'examiner',
  'dgca_roll_number',
  'notes',
] as const;

type UpdatableField = (typeof UPDATABLE_FIELDS)[number];

function isUpdatableField(value: unknown): value is UpdatableField {
  return typeof value === 'string' && (UPDATABLE_FIELDS as readonly string[]).includes(value);
}

/** Add a student to a ground school class. */
export async function POST(request: Request) {
  const { error } = await requireRole(GROUND_SCHOOL_WRITE_ROLES);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const classId = typeof body.classId === 'number' ? body.classId : undefined;
  const studentId = typeof body.studentId === 'string' ? body.studentId : undefined;

  if (classId === undefined || !studentId) {
    return NextResponse.json({ error: 'classId and studentId are required.' }, { status: 400 });
  }

  const { data: inserted, error: dbError } = await supabaseAdmin
    .from('ground_school_enrollment')
    .insert({
      class_id: classId,
      student_id: studentId,
      attendance_status: 'PENDING',
    })
    .select('id');

  if (dbError || !inserted || inserted.length === 0) {
    console.error('Error enrolling student in ground school class:', dbError);
    return NextResponse.json({ error: 'Failed to add student to this class.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/** Update one whitelisted field on one enrollment row. */
export async function PATCH(request: Request) {
  const { error } = await requireRole(GROUND_SCHOOL_WRITE_ROLES);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const enrollmentId = typeof body.enrollmentId === 'number' ? body.enrollmentId : undefined;
  const { field, value } = body;

  if (enrollmentId === undefined) {
    return NextResponse.json({ error: 'enrollmentId is required.' }, { status: 400 });
  }
  if (!isUpdatableField(field)) {
    // Named explicitly rather than a generic 400: a rejected field here is
    // either a bug in a caller or an attempt to reach a column the UI never
    // edits, and both are worth seeing in a log.
    console.warn(`Rejected ground_school_enrollment write to non-whitelisted field: ${String(field)}`);
    return NextResponse.json({ error: 'That field cannot be updated.' }, { status: 400 });
  }
  // null is meaningful for every one of these columns (clearing a score, a
  // result, a roll number), so it is allowed — but an object or array is not
  // a value any of them takes.
  if (value !== null && typeof value !== 'string' && typeof value !== 'number') {
    return NextResponse.json({ error: 'Invalid value for this field.' }, { status: 400 });
  }

  // 2026-08-19 rule, preserved server-side: this subject's exam is conducted
  // by DGCA, not the FTO, so a PASS must be traceable to a real DGCA roll
  // number. The page already blocks this in the UI; enforcing it here too
  // means an untraceable pass cannot be written by any caller, not just by
  // one that happens to run the client-side check first.
  if (field === 'exam_result' && value === 'PASS') {
    const { data: row, error: lookupError } = await supabaseAdmin
      .from('ground_school_enrollment')
      .select('dgca_roll_number')
      .eq('id', enrollmentId)
      .maybeSingle();

    if (lookupError) {
      console.error('Error checking DGCA roll number before recording a pass:', lookupError);
      return NextResponse.json({ error: 'Could not verify the DGCA roll number.' }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: 'Enrollment record not found.' }, { status: 404 });
    }
    if (!String(row.dgca_roll_number ?? '').trim()) {
      return NextResponse.json(
        { error: 'Enter the DGCA roll number for this student before recording a pass — this exam is conducted by DGCA, not the FTO.' },
        { status: 400 },
      );
    }
  }

  const { data: updated, error: dbError } = await supabaseAdmin
    .from('ground_school_enrollment')
    .update({ [field]: value })
    .eq('id', enrollmentId)
    .select('id');

  if (dbError) {
    console.error('Error updating ground school enrollment:', dbError);
    return NextResponse.json({ error: 'Failed to save that change.' }, { status: 500 });
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'Enrollment record not found.' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

/** Remove a student from a ground school class. */
export async function DELETE(request: Request) {
  const { error } = await requireRole(GROUND_SCHOOL_WRITE_ROLES);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get('enrollmentId');
  const enrollmentId = raw !== null && raw.trim() !== '' ? Number(raw) : NaN;

  if (!Number.isFinite(enrollmentId)) {
    return NextResponse.json({ error: 'enrollmentId is required.' }, { status: 400 });
  }

  const { data: deleted, error: dbError } = await supabaseAdmin
    .from('ground_school_enrollment')
    .delete()
    .eq('id', enrollmentId)
    .select('id');

  if (dbError) {
    console.error('Error removing ground school enrollment:', dbError);
    return NextResponse.json({ error: 'Failed to remove that student.' }, { status: 500 });
  }
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: 'Enrollment record not found.' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

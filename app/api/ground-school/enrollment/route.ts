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
//
// 2026-09-18: the DGCA 70% pass mark is applied here. `exam_result` is derived
// from `exam_score` and written with it; it is no longer independently
// settable. See lib/dgca.ts and the UPDATABLE_FIELDS note below.
//
// ⚠️ A DGCA roll number is issued PER SITTING and is mandatory for every
// recorded score, pass or fail. This route enforces both directions: a score
// cannot be written without one, and one cannot be cleared off a row that has
// a score. NOTE: `attempts` is a counter on a single row, so re-sitting
// overwrites the previous attempt's roll number — only the latest sitting
// stays traceable. Keeping every sitting's number needs one row per attempt;
// see the ponytail comment on the attempts increment below.
//
// GET added 2026-09-18 (RLS remediation, Batch 4 — see
// claude/data-access-security-mapping.md): the 3 read call sites
// (`ground-school/page.tsx`'s school-wide progress widget,
// `ground-school/progress/page.tsx`'s per-student exam history,
// `attendance/page.tsx`'s per-class roster) were direct client-side
// `supabase.from('ground_school_enrollment')` calls (anon key) — a live
// IDOR, not just an anon-key exposure: this table holds individual DGCA
// roll numbers and exam scores, and every one of those reads pulled every
// student's rows unfiltered, with `selectedStudent`/`studentId` filtering
// applied only in the browser. `requireSession()` alone is NOT enough
// here, unlike the institution-wide config tables elsewhere in this
// remediation (aircraft, holidays, etc.) — those were already readable by
// literally anyone, logged in or not, so moving them behind a session
// check alone was a real narrowing. This table is per-person data, so it
// gets the `flight_records`/`training_requirements` treatment instead: a
// `student` session is hard-pinned to their own `studentId` no matter what
// `studentId`/`classId` is in the URL, and every other role must be one of
// GROUND_SCHOOL_WRITE_ROLES (the same staff list already gating writes on
// this table, and the same non-student roles both reading pages' own
// RoleGates allow) — not merely "any signed-in session" — before it can
// see another student's exam record, a whole class roster, or the
// school-wide aggregate.
import { NextResponse } from 'next/server';
import { requireRole, requireSession, GROUND_SCHOOL_WRITE_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { deriveExamResult, isValidExamScore } from '@/lib/dgca';

export async function GET(request: Request) {
  const { session, error } = await requireSession();
  if (error) return error;
  const role = session.user.role;

  // A student can only ever see their own enrollment rows — never another
  // student's, and never the whole table. Forced regardless of any
  // `studentId`/`classId` in the URL, same IDOR-safe pattern as
  // GET /api/flight-records.
  if (role === 'student') {
    if (!session.user.studentId) return NextResponse.json({ enrollments: [] });
    const { data, error: dbError } = await supabaseAdmin
      .from('ground_school_enrollment')
      .select('*')
      .eq('student_id', session.user.studentId)
      .order('class_id', { ascending: false });
    if (dbError) {
      console.error('Error loading ground school enrollment:', dbError);
      return NextResponse.json({ error: 'Failed to load enrollment records.' }, { status: 500 });
    }
    return NextResponse.json({ enrollments: data || [] });
  }

  if (!role || !GROUND_SCHOOL_WRITE_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get('studentId');
  const classId = searchParams.get('classId');

  let query = supabaseAdmin.from('ground_school_enrollment').select('*');
  if (studentId) query = query.eq('student_id', studentId).order('class_id', { ascending: false });
  else if (classId) query = query.eq('class_id', Number(classId));
  // else: no filter — the school-wide progress dashboard's aggregate view,
  // the same "everything" shape the direct anon-key query always returned
  // for this branch's roles.

  const { data, error: dbError } = await query;
  if (dbError) {
    console.error('Error loading ground school enrollment:', dbError);
    return NextResponse.json({ error: 'Failed to load enrollment records.' }, { status: 500 });
  }
  return NextResponse.json({ enrollments: data || [] });
}

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
  'examiner',
  'dgca_roll_number',
  'notes',
] as const;

// 2026-09-18: `exam_result` is NOT in that list any more, and its absence is
// deliberate. A DGCA pass is 70% (lib/dgca.ts); the result is therefore a
// function of the score, and the only way to guarantee the two never
// contradict each other is to make the result unsettable on its own. Writing
// `exam_score` derives and stores `exam_result` in the same update — see the
// exam-score branch in PATCH. The Pass/Fail dropdown is gone from the UI for
// the same reason.

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

  // Everything a plain field write stores. The exam-score branch below adds
  // the derived result and the attempt count to it.
  const patch: Record<string, unknown> = { [field]: value };
  let derivedResult: string | null = null;

  // Found live on 2026-09-18: the roll-number rule was only ever checked when
  // writing a score, so a pass could be made untraceable afterwards simply by
  // clearing the roll number on the saved row. Guarding the score write alone
  // secures the moment of the pass, not the pass itself.
  if (field === 'dgca_roll_number' && !String(value ?? '').trim()) {
    const { data: row, error: lookupError } = await supabaseAdmin
      .from('ground_school_enrollment')
      .select('exam_score')
      .eq('id', enrollmentId)
      .maybeSingle();

    if (lookupError) {
      console.error('Error reading enrollment before clearing a roll number:', lookupError);
      return NextResponse.json({ error: 'Could not verify the enrollment record.' }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: 'Enrollment record not found.' }, { status: 404 });
    }
    if (row.exam_score !== null && row.exam_score !== undefined) {
      return NextResponse.json(
        { error: 'This student has a recorded exam score, which cannot exist without a DGCA roll number. Clear the score first if it was entered in error.' },
        { status: 400 },
      );
    }
  }

  if (field === 'exam_score') {
    if (value !== null && !isValidExamScore(value)) {
      return NextResponse.json({ error: 'Enter a valid exam score (0-100).' }, { status: 400 });
    }

    const { data: row, error: lookupError } = await supabaseAdmin
      .from('ground_school_enrollment')
      .select('dgca_roll_number, attempts')
      .eq('id', enrollmentId)
      .maybeSingle();

    if (lookupError) {
      console.error('Error reading enrollment before recording a score:', lookupError);
      return NextResponse.json({ error: 'Could not verify the enrollment record.' }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: 'Enrollment record not found.' }, { status: 404 });
    }

    derivedResult = deriveExamResult(value as number | null);
    patch.exam_result = derivedResult;

    // 2026-09-18 (stated by the operator, correcting an earlier reading of
    // this rule): DGCA issues a roll number for EVERY sitting, pass or fail.
    // So a roll number is required for any score at all, not only a passing
    // one. An earlier version of this route exempted fails on the reasoning
    // that a failed sitting must still be storable — that reasoning was
    // wrong, because a failed sitting has a roll number too.
    if (value !== null && !String(row.dgca_roll_number ?? '').trim()) {
      return NextResponse.json(
        { error: 'Enter the DGCA roll number for this attempt before recording a score — this exam is conducted by DGCA, not the FTO, and every sitting has its own roll number.' },
        { status: 400 },
      );
    }

    // Each recorded score is one sitting. Clearing a score is a correction,
    // not a sitting, so it does not count.
    // ponytail: increments on every score write, so re-saving a corrected
    // score counts twice. The page only sends on a real change, which covers
    // the common case; move to one row per sitting if re-sits ever need
    // individual dates and scores kept.
    if (value !== null) {
      patch.attempts = (typeof row.attempts === 'number' ? row.attempts : 0) + 1;
    }
  }

  const { data: updated, error: dbError } = await supabaseAdmin
    .from('ground_school_enrollment')
    .update(patch)
    .eq('id', enrollmentId)
    .select('id');

  if (dbError) {
    console.error('Error updating ground school enrollment:', dbError);
    return NextResponse.json({ error: 'Failed to save that change.' }, { status: 500 });
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'Enrollment record not found.' }, { status: 404 });
  }

  // The page needs the derived result back: it decides from this whether the
  // pass also completes the matching Requirements Checklist item.
  return NextResponse.json({ success: true, examResult: derivedResult });
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

// app/api/ground-school/classes/route.ts
// ---------------------------------------------------------------------------
// Server-side, role-scoped writes to `ground_school_classes`.
//
// WHY THIS EXISTS (2026-09-17). components/ground-school/GroundSchoolCalendar
// .tsx — live at /dashboard/ground-school/schedule — created, updated and
// deleted classes straight from the browser on the public anon key. The
// component itself has no role check of any kind: no RoleGate, no useSession,
// no requireRole. Its only gate is the RoleGate on the page that renders it,
// and a RoleGate decides what renders, not what the database accepts.
//
// This is the same finding as the 2026-08-24 review's item 39, already closed
// for the attendance page (app/api/ground-school/enrollment/route.ts) — still
// open one component over, on the same tables.
//
// ⚠️ THE DELETE IS THE DANGEROUS ONE, AND IT IS NOT JUST A SCOPING PROBLEM.
// Removing a calendar entry also removed every `ground_school_enrollment` row
// for that class — which is where exam scores and DGCA roll numbers live. A
// mis-click on a calendar deleted exam records, and the confirmation text only
// said "and all enrollments". Under the current schema that is unrecoverable.
//
// So this route REFUSES to delete a class that has any enrollment carrying an
// exam score or result, and says which students are affected. Attendance-only
// enrollments are still removed with the class, which is the behaviour the
// screen has always had and is what makes sense for a cancelled class.
//
// That refusal is a deliberate behaviour change, not a port. It is flagged in
// the handoff for the operator to accept or reject. Once exams move to their
// own table (claude/ground-school-exam-attempts-design-2026-09-17.md) the
// hazard disappears on its own, because attempts will not be keyed on a class.
//
// ROLE SET. GROUND_SCHOOL_WRITE_ROLES — exactly the list the schedule page's
// RoleGate already used inline (admin/instructor/super_admin/operations).
// This moves WHERE the check happens, not WHO passes it.
// ---------------------------------------------------------------------------

import { NextResponse } from 'next/server';
import { requireRole, GROUND_SCHOOL_WRITE_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * The only columns a client may set, matching exactly what the calendar's
 * modal edits. `id` is deliberately absent: it identifies the row, it is not
 * a field, and accepting it would let a caller repoint an update.
 */
const WRITABLE_FIELDS = [
  'subject_id',
  'instructor_id',
  'class_date',
  'start_time',
  'end_time',
  'topic',
  'notes',
  'status',
] as const;

type ClassPayload = Record<string, unknown>;

/**
 * Keeps only whitelisted keys. The calendar posts `{...form}` wholesale, so
 * without this an extra key added to that form later would silently reach the
 * table with the service-role key behind it.
 */
function pickWritable(body: ClassPayload): { payload: ClassPayload; rejected: string[] } {
  const payload: ClassPayload = {};
  const rejected: string[] = [];
  for (const [key, value] of Object.entries(body)) {
    if ((WRITABLE_FIELDS as readonly string[]).includes(key)) payload[key] = value;
    else rejected.push(key);
  }
  return { payload, rejected };
}

/** Validation shared by create and update. Returns an error message, or null. */
function validate(payload: ClassPayload, requireAll: boolean): string | null {
  if (requireAll) {
    if (typeof payload.subject_id !== 'number' || payload.subject_id <= 0) return 'Select a subject.';
    if (typeof payload.instructor_id !== 'string' || !payload.instructor_id.trim()) return 'Select an instructor.';
    if (typeof payload.class_date !== 'string' || !payload.class_date.trim()) return 'Select a date.';
  }
  const start = payload.start_time;
  const end = payload.end_time;
  // Enforced server-side as well as in the modal: the times are plain
  // 'HH:MM' strings, so a lexicographic compare is the right compare.
  if (typeof start === 'string' && typeof end === 'string' && end <= start) {
    return 'End time must be after start time.';
  }
  return null;
}

async function readBody(request: Request): Promise<ClassPayload | null> {
  try {
    return (await request.json()) as ClassPayload;
  } catch {
    return null;
  }
}

/** Create a class. */
export async function POST(request: Request) {
  const { error } = await requireRole(GROUND_SCHOOL_WRITE_ROLES);
  if (error) return error;

  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });

  const { payload, rejected } = pickWritable(body);
  if (rejected.length) {
    console.warn(`Rejected non-whitelisted ground_school_classes field(s): ${rejected.join(', ')}`);
  }
  const invalid = validate(payload, true);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const { data, error: dbError } = await supabaseAdmin
    .from('ground_school_classes')
    .insert([payload])
    .select('id');

  if (dbError || !data || data.length === 0) {
    console.error('Error creating ground school class:', dbError);
    return NextResponse.json({ error: 'Failed to create the class.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: data[0].id });
}

/** Update a class. */
export async function PATCH(request: Request) {
  const { error } = await requireRole(GROUND_SCHOOL_WRITE_ROLES);
  if (error) return error;

  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });

  const classId = typeof body.classId === 'number' ? body.classId : undefined;
  if (classId === undefined) {
    return NextResponse.json({ error: 'classId is required.' }, { status: 400 });
  }

  const { payload, rejected } = pickWritable(body);
  // `classId` is the row selector, not a field — expected in the body and not
  // worth logging as a rejected write.
  const unexpected = rejected.filter((k) => k !== 'classId');
  if (unexpected.length) {
    console.warn(`Rejected non-whitelisted ground_school_classes field(s): ${unexpected.join(', ')}`);
  }
  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }
  const invalid = validate(payload, false);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  // .select('id') because a Supabase update matching zero rows is a success
  // with no rows — the false-success shape of the DebriefForm bug (5dc2b43).
  const { data, error: dbError } = await supabaseAdmin
    .from('ground_school_classes')
    .update(payload)
    .eq('id', classId)
    .select('id');

  if (dbError) {
    console.error('Error updating ground school class:', dbError);
    return NextResponse.json({ error: 'Failed to save the class.' }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Class not found.' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

/** Delete a class, and its attendance-only enrollments with it. */
export async function DELETE(request: Request) {
  const { error } = await requireRole(GROUND_SCHOOL_WRITE_ROLES);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get('classId');
  const classId = raw !== null && raw.trim() !== '' ? Number(raw) : NaN;

  if (!Number.isFinite(classId)) {
    return NextResponse.json({ error: 'classId is required.' }, { status: 400 });
  }

  // ⚠️ Read before destroying. Enrollment rows for this class hold exam
  // scores and DGCA roll numbers; those are regulatory records and deleting
  // a calendar entry is not consent to destroy them.
  const { data: enrolled, error: lookupError } = await supabaseAdmin
    .from('ground_school_enrollment')
    .select('id, student_id, exam_score, exam_result')
    .eq('class_id', classId);

  if (lookupError) {
    console.error('Error reading enrollments before deleting a class:', lookupError);
    return NextResponse.json({ error: 'Could not check this class for exam records.' }, { status: 500 });
  }

  const withExamData = (enrolled || []).filter(
    (e) => e.exam_score !== null || (e.exam_result !== null && e.exam_result !== ''),
  );

  if (withExamData.length > 0) {
    return NextResponse.json(
      {
        error:
          `This class has ${withExamData.length} recorded exam ` +
          `${withExamData.length === 1 ? 'result' : 'results'}, including DGCA roll numbers. ` +
          `Deleting it would destroy them. Clear the exam scores on the attendance screen first ` +
          `if they were entered in error.`,
        examRecordCount: withExamData.length,
      },
      { status: 409 },
    );
  }

  // Attendance-only rows go with the class: a cancelled class has no
  // attendance. Done first because of the foreign key.
  const { error: enrollmentError } = await supabaseAdmin
    .from('ground_school_enrollment')
    .delete()
    .eq('class_id', classId);

  if (enrollmentError) {
    console.error('Error removing enrollments for a deleted class:', enrollmentError);
    return NextResponse.json({ error: 'Failed to remove this class’s enrollments.' }, { status: 500 });
  }

  const { data: deleted, error: dbError } = await supabaseAdmin
    .from('ground_school_classes')
    .delete()
    .eq('id', classId)
    .select('id');

  if (dbError) {
    console.error('Error deleting ground school class:', dbError);
    return NextResponse.json({ error: 'Failed to delete the class.' }, { status: 500 });
  }
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: 'Class not found.' }, { status: 404 });
  }

  return NextResponse.json({ success: true, removedEnrollments: (enrolled || []).length });
}

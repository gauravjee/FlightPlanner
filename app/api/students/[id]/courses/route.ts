// app/api/students/[id]/courses/route.ts — B3 course history (student_courses).
// GET: the student's courses, newest first (staff; a student sees only their own).
// POST { programId, startDate, endDate?, outcome?, note? }: close the current course (if any)
//   with endDate + outcome (COMPLETED / DISCONTINUED) and start the next one. Keeps
//   students.training_stage = the current program code (16 files read it) and provisions
//   the new program's requirements.
// PATCH { courseId, startDate?, endDate?, outcome?, note? }: fix an entry (admin only).
//   The program of an entry can't change; the database refuses a second current course
//   or an end date before the start.

import { NextResponse } from 'next/server';
import { requireSession, requireRole, requireModuleAccess, STUDENT_STAFF_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { provisionRequirementsForStudent } from '@/lib/requirements-provisioning';
import { STUDENT_ADMIN_ROLES } from '@/lib/student-server';

type RouteContext = { params: Promise<{ id: string }> };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COURSE_SELECT = 'id, program_id, start_date, end_date, outcome, note, created_at, training_programs(program_code, program_name)';

function dbMessage(code: string | undefined, fallback: string): string {
  if (code === '23505') return 'This student already has a course in progress.';
  if (code === '23514') return 'Check the dates: the end date must be on or after the start, and only a course in progress has no end date.';
  return fallback;
}

/** students.training_stage follows the course in progress; unchanged when there's none. */
async function syncTrainingStage(studentId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('student_courses').select('training_programs(program_code)')
    .eq('student_id', studentId).eq('outcome', 'IN_PROGRESS').maybeSingle();
  const tp = data?.training_programs as { program_code?: string } | { program_code?: string }[] | null | undefined;
  const code = (Array.isArray(tp) ? tp[0] : tp)?.program_code ?? null;
  if (code) await supabaseAdmin.from('students').update({ training_stage: code }).eq('id', studentId);
  return code;
}

export async function GET(_request: Request, context: RouteContext) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { id } = await context.params;
  const role = session.user.role ?? '';
  const own = role === 'student' && session.user.studentId === id;
  if (!own && !STUDENT_STAFF_ROLES.includes(role)) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });

  const { data, error: dbError } = await supabaseAdmin.from('student_courses').select(COURSE_SELECT)
    .eq('student_id', id).order('start_date', { ascending: false });
  if (dbError) {
    console.error('Error loading student courses:', dbError.code);
    return NextResponse.json({ error: 'Failed to load courses.' }, { status: 500 });
  }
  return NextResponse.json({ courses: data ?? [] });
}

export async function POST(request: Request, context: RouteContext) {
  const { error } = await requireModuleAccess('students', 'full');
  if (error) return error;
  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const startDate = String(body.startDate ?? '');
  const endDate = String(body.endDate ?? '');
  const outcome = String(body.outcome ?? 'COMPLETED');
  const note = typeof body.note === 'string' ? body.note.trim() || null : null;
  if (!DATE_RE.test(startDate)) return NextResponse.json({ error: 'Enter the start date of the next course.' }, { status: 400 });

  const { data: program } = await supabaseAdmin.from('training_programs').select('id, program_code').eq('id', Number(body.programId)).maybeSingle();
  if (!program) return NextResponse.json({ error: 'Choose a training program.' }, { status: 400 });

  const { data: current, error: currentError } = await supabaseAdmin.from('student_courses').select('id, start_date')
    .eq('student_id', id).eq('outcome', 'IN_PROGRESS').maybeSingle();
  if (currentError && currentError.code !== '22P02') {
    console.error('Error loading the current course:', currentError.code);
    return NextResponse.json({ error: 'Failed to start the next course.' }, { status: 500 });
  }

  if (current) {
    if (!DATE_RE.test(endDate)) return NextResponse.json({ error: 'Enter the end date of the current course.' }, { status: 400 });
    if (outcome !== 'COMPLETED' && outcome !== 'DISCONTINUED') return NextResponse.json({ error: 'The current course must end as Completed or Discontinued.' }, { status: 400 });
    if (startDate < endDate) return NextResponse.json({ error: 'The next course can\'t start before the current one ends.' }, { status: 400 });
    const { error: closeError } = await supabaseAdmin.from('student_courses').update({ outcome, end_date: endDate }).eq('id', current.id);
    if (closeError) return NextResponse.json({ error: dbMessage(closeError.code, 'Failed to close the current course.') }, { status: 400 });
  }

  const { error: insertError } = await supabaseAdmin.from('student_courses').insert({ student_id: id, program_id: program.id, start_date: startDate, note });
  if (insertError) {
    // Put the current course back the way it was, so the student isn't left with none.
    if (current) await supabaseAdmin.from('student_courses').update({ outcome: 'IN_PROGRESS', end_date: null }).eq('id', current.id);
    if (insertError.code === '23503') return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
    return NextResponse.json({ error: dbMessage(insertError.code, 'Failed to start the next course.') }, { status: 400 });
  }

  await syncTrainingStage(id);
  const provision = await provisionRequirementsForStudent(id, program.program_code as string);
  return NextResponse.json({ success: true, requirementsProvisioned: provision.provisioned, requirementsWarning: provision.error });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { error } = await requireRole(STUDENT_ADMIN_ROLES);
  if (error) return error;
  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const updates: Record<string, unknown> = {};
  for (const [key, col] of [['startDate', 'start_date'], ['endDate', 'end_date']] as const) {
    if (body[key] === undefined) continue;
    const v = String(body[key] ?? '');
    if (v && !DATE_RE.test(v)) return NextResponse.json({ error: 'Dates must be YYYY-MM-DD.' }, { status: 400 });
    updates[col] = v || null;
  }
  if (body.outcome !== undefined) {
    if (!['IN_PROGRESS', 'COMPLETED', 'DISCONTINUED'].includes(String(body.outcome))) return NextResponse.json({ error: 'Outcome must be In progress, Completed or Discontinued.' }, { status: 400 });
    updates.outcome = body.outcome;
  }
  if (body.note !== undefined) updates.note = typeof body.note === 'string' ? body.note.trim() || null : null;
  if (!Object.keys(updates).length) return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });

  const { data: rows, error: dbError } = await supabaseAdmin.from('student_courses').update(updates)
    .eq('id', Number(body.courseId)).eq('student_id', id).select('id');
  if (dbError) return NextResponse.json({ error: dbMessage(dbError.code, 'Failed to save the course.') }, { status: 400 });
  if (!rows?.length) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });

  await syncTrainingStage(id);
  return NextResponse.json({ success: true });
}

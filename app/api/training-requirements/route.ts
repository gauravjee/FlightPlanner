// app/api/training-requirements/route.ts
// Server-side read for the `training_requirements` table.
//
// 2026-09-18 (RLS remediation Step 3 — see
// claude/rls-remediation-progress-2026-09-18.md): reads used to be direct
// client-side `supabase.from('training_requirements')` calls (anon key)
// from lib/hooks/useTrainingRequirements.ts's two fetchers —
// fetchTrainingRequirements(studentId?) (single student) and
// fetchTrainingRequirementsForStudents(studentIds[]) (an instructor's
// multi-student progress list). One GET covers both via optional query
// params: `studentId` -> one student, `studentIds` (comma-separated) ->
// `.in()` filter. One of the two is required — see the self-review fix
// below.
//
// Writes already go through /api/admin/requirements/toggle. `requireSession()`
// only — no role restriction beyond "logged in," same reasoning as every
// other read moved this pass.
//
// Self-review fix, same day: dropped the "no params -> full table" shape.
// It matched the old client call's signature, but every real caller
// (BookingForm.tsx, lib/ground-school-sync.ts, the useTrainingRequirements
// hook) always passes a studentId or studentIds — grepped, confirmed zero
// callers rely on the unscoped form. Serving it anyway meant any logged-in
// session (including a student) could pull every student's completion
// status, notes and audit trail school-wide with one unparameterized
// request — exactly the class of leak the 2026-08-19 fix (see the comment
// in useTrainingRequirements.ts) closed at the UI layer, just reopened one
// layer down. Now 400s instead of silently dumping everything.

import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: Request) {
  const { error } = await requireSession();
  if (error) return error;

  const url = new URL(request.url);
  const studentId = url.searchParams.get('studentId');
  const studentIds = url.searchParams.get('studentIds');

  if (!studentId && !studentIds) {
    return NextResponse.json(
      { error: 'studentId or studentIds is required.' },
      { status: 400 }
    );
  }

  let query = supabaseAdmin.from('training_requirements').select('*').order('sort_order', { ascending: true });
  if (studentId) {
    query = query.eq('student_id', studentId);
  } else if (studentIds) {
    query = query.in('student_id', studentIds.split(',').filter(Boolean));
  }

  const { data, error: dbError } = await query;

  if (dbError) {
    console.error('Error loading training requirements:', dbError);
    return NextResponse.json({ error: 'Failed to load training requirements.' }, { status: 500 });
  }

  return NextResponse.json({ requirements: data });
}

// app/api/training-requirements/route.ts
// Server-side read for the `training_requirements` table.
//
// 2026-09-18 (RLS remediation Step 3 — see
// claude/rls-remediation-progress-2026-09-18.md): reads used to be direct
// client-side `supabase.from('training_requirements')` calls (anon key)
// from lib/hooks/useTrainingRequirements.ts's two fetchers —
// fetchTrainingRequirements(studentId?) (single student, or the full table
// when no id given) and fetchTrainingRequirementsForStudents(studentIds[])
// (an instructor's multi-student progress list). One GET covers both via
// optional query params, same shape as the original calls: no params ->
// full table, `studentId` -> one student, `studentIds` (comma-separated)
// -> `.in()` filter.
//
// Writes already go through /api/admin/requirements/toggle. `requireSession()`
// only — no role restriction beyond "logged in," same reasoning as every
// other read moved this pass.

import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: Request) {
  const { error } = await requireSession();
  if (error) return error;

  const url = new URL(request.url);
  const studentId = url.searchParams.get('studentId');
  const studentIds = url.searchParams.get('studentIds');

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

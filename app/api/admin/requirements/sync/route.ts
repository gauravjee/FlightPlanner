// app/api/admin/requirements/sync/route.ts
// ---------------------------------------------------------------------------
// POST { programCode: string }
//
// Backfills/re-syncs training_requirements rows for every student currently
// on that program (matched by the leading token of their trainingStage —
// same convention used everywhere else in the app, see
// lib/requirements-provisioning.ts's resolveProgramCode). Inserts any
// template requirement (from training_requirement_templates — see
// split-training-requirement-templates.sql) a matching student doesn't
// already have; never touches or deletes an existing row.
//
// Two situations this is for:
//   1. Students who existed before requirement provisioning was wired into
//      student creation (e.g. dummy.student@flightpro.test, or anyone added
//      via a raw SQL script) — this backfills them.
//   2. A requirement template added to Admin Setup -> Requirements AFTER
//      some students on that program were already provisioned — those
//      students don't automatically pick up the new requirement, since
//      provisioning only ever runs once, at creation time. Re-running this
//      sync pushes it out to everyone on the program.
//
// Safe to run repeatedly for the same reason provisionRequirementsForStudent
// itself is idempotent: it matches existing rows by requirement_name before
// inserting, so re-running never creates duplicates.
// ---------------------------------------------------------------------------

import { NextResponse } from 'next/server';
import { requireRole, STUDENT_CREATION_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { provisionRequirementsForStudent, resolveProgramCode } from '@/lib/requirements-provisioning';

export async function POST(request: Request) {
  // Same role gate as creating a student/login (STUDENT_CREATION_ROLES) —
  // this is a bulk administrative write across many students' data, not a
  // routine edit.
  const { error } = await requireRole(STUDENT_CREATION_ROLES);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const programCode = typeof body.programCode === 'string' ? body.programCode.trim().toUpperCase() : undefined;
  if (!programCode) {
    return NextResponse.json({ error: 'programCode is required.' }, { status: 400 });
  }

  const { data: students, error: studentsError } = await supabaseAdmin
    .from('students')
    .select('id, name, training_stage');

  if (studentsError) {
    console.error('Error loading students for requirements sync:', studentsError);
    return NextResponse.json({ error: 'Failed to load students.' }, { status: 500 });
  }

  const matching = (students || []).filter(
    (s: Record<string, unknown>) => resolveProgramCode(s.training_stage as string | undefined) === programCode
  );

  let totalProvisioned = 0;
  const results: { studentId: unknown; name: unknown; provisioned: number; error?: string }[] = [];
  for (const s of matching) {
    const result = await provisionRequirementsForStudent(s.id as string, s.training_stage as string | undefined);
    totalProvisioned += result.provisioned;
    results.push({ studentId: s.id, name: s.name, provisioned: result.provisioned, error: result.error });
  }

  return NextResponse.json({
    programCode,
    studentsChecked: matching.length,
    totalProvisioned,
    results,
  });
}

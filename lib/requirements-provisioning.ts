// lib/requirements-provisioning.ts
// ---------------------------------------------------------------------------
// Shared server-side helper for keeping a student's `training_requirements`
// rows in sync with their training program's templates, now in their own
// `training_requirement_templates` table (managed in Admin Setup ->
// Requirements -> RequirementsTab.tsx) — see
// split-training-requirement-templates.sql. Previously templates were the
// student_id-IS-NULL rows of this same table; splitting them out means
// every row here is guaranteed a real per-student assignment.
//
// Why this exists: student creation (POST /api/students) always wrote the
// `students` row and the linked `users` login, but never copied the
// program's requirement templates into per-student rows. That meant every
// student ever created through the app's own UI ended up with an empty
// Requirements Checklist — RequirementsChecklist.tsx had nothing to render,
// and BookingForm.tsx's blocksSolo/blocksAllFlights enforcement had nothing
// to check, regardless of what an admin configured on the Requirements tab.
//
// Two callers use this:
//   - POST /api/students — provisions requirements at creation time for a
//     brand-new student.
//   - POST /api/admin/requirements/sync — Admin Setup -> Requirements ->
//     "Sync to Students" button. Backfills students who already existed
//     before this fix (e.g. dummy.student@flightpro.test, or anyone added
//     via a raw SQL script rather than the app's own form), AND re-syncs
//     anyone missing a requirement that was added to the template *after*
//     they were originally provisioned — there's no automatic propagation
//     of template edits to already-provisioned students, so re-running the
//     sync is the way to pick those up.
//
// 2026-08-19: newly-provisioned rows now carry a real template_id back to
// the template they came from (training_requirement_templates.id), instead
// of relying purely on name matching. requirement_name matching (case-
// insensitive) is still used to detect "does this student already have
// this one" so re-syncing stays idempotent — that check doesn't need the
// FK, just a good-enough duplicate guard.
// ---------------------------------------------------------------------------

import { supabaseAdmin } from '@/lib/supabase-admin';

// Same convention as app/dashboard/progress/page.tsx's matchedProgram:
// trainingStage values look like "CPL Phase 2" or "IR" — the leading token
// is the program code, matched case-insensitively against
// training_programs.program_code (and, here, training_requirements'
// template program_code).
export function resolveProgramCode(trainingStage: string | null | undefined): string | undefined {
  if (!trainingStage) return undefined;
  const code = trainingStage.trim().split(/\s+/)[0]?.toUpperCase();
  return code || undefined;
}

export interface ProvisionResult {
  provisioned: number;
  programCode: string | undefined;
  error?: string;
}

/**
 * Copies any requirement templates for `trainingStage`'s program that this
 * student doesn't already have into per-student rows. Safe to call
 * repeatedly — already-present requirements (matched by name) are skipped,
 * nothing is ever deleted or overwritten.
 */
export async function provisionRequirementsForStudent(
  studentId: string,
  trainingStage: string | null | undefined
): Promise<ProvisionResult> {
  const programCode = resolveProgramCode(trainingStage);
  if (!programCode) {
    return { provisioned: 0, programCode: undefined, error: 'No training stage set — cannot resolve a program.' };
  }

  const { data: templates, error: templateError } = await supabaseAdmin
    .from('training_requirement_templates')
    .select('*');

  if (templateError) {
    console.error('Error loading requirement templates:', templateError);
    return { provisioned: 0, programCode, error: templateError.message };
  }

  const matchingTemplates = (templates || []).filter(
    (t: Record<string, unknown>) => String(t.program_code || '').toUpperCase() === programCode
  );
  if (matchingTemplates.length === 0) {
    return {
      provisioned: 0,
      programCode,
      error: `No requirement templates defined for program "${programCode}" yet (Admin Setup -> Requirements).`,
    };
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('training_requirements')
    .select('requirement_name')
    .eq('student_id', studentId);

  if (existingError) {
    console.error('Error loading existing student requirements:', existingError);
    return { provisioned: 0, programCode, error: existingError.message };
  }

  const existingNames = new Set(
    (existing || []).map((r: Record<string, unknown>) => String(r.requirement_name || '').toLowerCase())
  );
  const toInsert = matchingTemplates
    .filter((t: Record<string, unknown>) => !existingNames.has(String(t.requirement_name || '').toLowerCase()))
    .map((t: Record<string, unknown>) => ({
      student_id: studentId,
      template_id: t.id,
      requirement_name: t.requirement_name,
      requirement_category: t.requirement_category,
      program_code: t.program_code,
      is_completed: false,
      sort_order: t.sort_order,
      validity_years: t.validity_years,
      required_before_hours: t.required_before_hours,
      blocks_solo: t.blocks_solo,
      blocks_all_flights: t.blocks_all_flights,
      notes: t.notes,
    }));

  if (toInsert.length === 0) {
    return { provisioned: 0, programCode };
  }

  const { error: insertError } = await supabaseAdmin.from('training_requirements').insert(toInsert);
  if (insertError) {
    console.error('Error provisioning student requirements:', insertError);
    return { provisioned: 0, programCode, error: insertError.message };
  }

  return { provisioned: toInsert.length, programCode };
}

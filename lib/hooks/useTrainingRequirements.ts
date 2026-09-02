// lib/hooks/useTrainingRequirements.ts
// ---------------------------------------------------------------------------
// SWR migration, Stage 8 (2026-09-02) — Training Requirements, the final
// domain of Stage 8 (and of the whole 9-stage migration). See the approved
// SWR migration plan (Project doc: claude/swr-migration-plan-2026-08-28.md)
// for the full architecture and staging rationale.
//
// Keyed per-student (or per-student-set), unlike most earlier domains, which
// were keyed as a single flat list. This directly replaces a whole class of
// "is this data stale / does it match the currently-selected student"
// guard variables the old store needed (reqsMatchSelectedStudent,
// soloReqsMatchSelectedStudent) — switching studentId just gets a different
// SWR cache entry, so there's nothing to guard.
//
// Two shapes of read exist because the app has two real needs: "this one
// student's requirements" (BookingForm, RequirementsChecklist, the Progress
// page) and "these several students' requirements at once" (the Instructor
// Dashboard's per-student progress list — see the 2026-08-19 comment
// preserved below on why that one is deliberately scoped, not "everything").
// ---------------------------------------------------------------------------

'use client';

import useSWR, { mutate } from 'swr';
import { supabase } from '@/lib/supabase';
import type { TrainingRequirement } from '@/types';

export const trainingRequirementsKey = (studentId: string) =>
  ['trainingRequirements', studentId] as const;

export const trainingRequirementsForStudentsKey = (studentIds: string[]) =>
  ['trainingRequirements', 'multi', [...studentIds].sort().join(',')] as const;

// Shared row -> TrainingRequirement mapper, used by both fetchers below.
// Factored out so the two can't drift apart on field mapping (ported as-is
// from lib/store.ts's old mapTrainingRequirementRow).
function mapTrainingRequirementRow(row: Record<string, unknown>): TrainingRequirement {
  return {
    id: String(row.id), studentId: String(row.student_id),
    templateId: row.template_id != null ? String(row.template_id) : undefined,
    requirementName: row.requirement_name as string, requirementCategory: row.requirement_category as string,
    isCompleted: row.is_completed as boolean, completedDate: row.completed_date as string || undefined,
    completedBy: row.completed_by as string || undefined, notes: row.notes as string || undefined,
    sortOrder: row.sort_order as number, validityYears: row.validity_years as number || undefined,
    requiredBeforeHours: row.required_before_hours as number || undefined,
    blocksSolo: row.blocks_solo as boolean, blocksAllFlights: row.blocks_all_flights as boolean,
    programCode: row.program_code as string,
  };
}

export async function fetchTrainingRequirements(studentId?: string): Promise<TrainingRequirement[]> {
  let query = supabase.from('training_requirements').select('*').order('sort_order', { ascending: true });
  if (studentId) query = query.eq('student_id', studentId);
  const { data, error } = await query;
  if (error) {
    console.error('Error loading training requirements:', error);
    throw error;
  }
  return (data || []).map(mapTrainingRequirementRow);
}

// 2026-08-19: added alongside the training_requirements/
// training_requirement_templates split (see
// split-training-requirement-templates.sql) to fix
// app/dashboard/instructor/page.tsx loading requirements with NO student
// filter at all — which pulled every student's requirements (completion
// status, audit trail) school-wide into any instructor's browser just to
// build a progress list for their own assigned students. This scopes the
// query to exactly the students asked for via .in(), instead of
// "everything" or "exactly one."
export async function fetchTrainingRequirementsForStudents(studentIds: string[]): Promise<TrainingRequirement[]> {
  if (studentIds.length === 0) return [];
  const { data, error } = await supabase
    .from('training_requirements')
    .select('*')
    .in('student_id', studentIds)
    .order('sort_order', { ascending: true });
  if (error) {
    console.error('Error loading training requirements for students:', error);
    throw error;
  }
  return (data || []).map(mapTrainingRequirementRow);
}

export function useTrainingRequirements(studentId: string | null | undefined) {
  const { data, error, isLoading, mutate: boundMutate } = useSWR<TrainingRequirement[]>(
    studentId ? trainingRequirementsKey(studentId) : null,
    () => fetchTrainingRequirements(studentId as string)
  );

  return {
    trainingRequirements: data ?? [],
    isLoading,
    error,
    mutate: boundMutate,
  };
}

export function useTrainingRequirementsForStudents(studentIds: string[]) {
  const { data, error, isLoading, mutate: boundMutate } = useSWR<TrainingRequirement[]>(
    studentIds.length > 0 ? trainingRequirementsForStudentsKey(studentIds) : null,
    () => fetchTrainingRequirementsForStudents(studentIds)
  );

  return {
    trainingRequirements: data ?? [],
    isLoading,
    error,
    mutate: boundMutate,
  };
}

// Render-time selector — same role as withScheduledFlightNames/
// withMaintenanceRecordNames in earlier stages, just filtering rather than
// joining names. Callers already reading from a per-student hook don't need
// this at all; it's for a caller sitting on a multi-student result (or the
// old store's flat array shape) that needs one student's slice.
export function getRequirementsForStudent(
  requirements: TrainingRequirement[],
  studentId: string
): TrainingRequirement[] {
  return requirements.filter((r) => r.studentId === studentId);
}

// ---------------------------------------------------------------------------
// Writes — plain exported async functions, same shape/failure-handling as
// the original store actions.
// ---------------------------------------------------------------------------

// Routes through a server-side API route (requireRole-gated to
// REQUIREMENTS_WRITE_ROLES, completedBy derived from the verified session)
// instead of writing to Supabase directly from the client — see
// app/api/admin/requirements/toggle/route.ts. The server is the only source
// of truth for completedBy, read back from the API response below.
//
// The toggled requirement could be sitting in a single-student cache entry
// (['trainingRequirements', studentId]) AND/OR a multi-student one
// (['trainingRequirements', 'multi', ...]) at the same time — e.g. a
// student's own BookingForm session and an instructor's dashboard both
// looking at this requirement via different keys. SWR's key-matcher mutate()
// form splices the update into every matching cache entry in one call,
// instead of picking (and possibly missing) just one key.
export async function toggleRequirement(id: string, isCompleted: boolean): Promise<void> {
  const res = await fetch('/api/admin/requirements/toggle', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, isCompleted }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    console.error('Error toggling training requirement:', errBody.error || res.statusText);
    return;
  }
  const { completedBy } = await res.json();

  await mutate(
    (key) => Array.isArray(key) && key[0] === 'trainingRequirements',
    (current?: TrainingRequirement[]) =>
      current?.map((r) =>
        r.id === id
          ? {
              ...r,
              isCompleted,
              completedDate: isCompleted ? new Date().toISOString().split('T')[0] : undefined,
              completedBy: isCompleted ? completedBy : undefined,
            }
          : r
      ),
    { revalidate: false }
  );
}

// Dead code as of this migration (zero callers anywhere in the app,
// confirmed by grep) — ported for interface completeness, same precedent as
// Stage 3's assignInstructor and Stage 4's loadStudentFlightRecords.
export async function addRequirement(requirement: Omit<TrainingRequirement, 'id'>): Promise<void> {
  // student_id is required (2026-08-19: training_requirements now only ever
  // holds real per-student assignments — see
  // split-training-requirement-templates.sql). template_id is optional; no
  // current caller sets it, so a row added this way just isn't linked back
  // to a template, same as before the split.
  const { data, error } = await supabase.from('training_requirements').insert({
    student_id: requirement.studentId, template_id: requirement.templateId || null,
    requirement_name: requirement.requirementName,
    requirement_category: requirement.requirementCategory, is_completed: false,
    sort_order: requirement.sortOrder || 99, notes: requirement.notes || '',
    validity_years: requirement.validityYears, required_before_hours: requirement.requiredBeforeHours,
    blocks_solo: requirement.blocksSolo || false, blocks_all_flights: requirement.blocksAllFlights || false,
    program_code: requirement.programCode,
  }).select().single();
  if (error || !data) {
    console.error('Error adding training requirement:', error);
    return;
  }
  const newReq: TrainingRequirement = { ...requirement, id: String(data.id), isCompleted: false };
  await mutate(
    (key) => Array.isArray(key) && key[0] === 'trainingRequirements',
    (current?: TrainingRequirement[]) => (current ? [...current, newReq] : current),
    { revalidate: false }
  );
}

// Dead code as of this migration (zero callers) — ported for interface
// completeness, same precedent as addRequirement above.
export async function removeRequirement(id: string): Promise<void> {
  await supabase.from('training_requirements').delete().eq('id', id);
  await mutate(
    (key) => Array.isArray(key) && key[0] === 'trainingRequirements',
    (current?: TrainingRequirement[]) => current?.filter((r) => r.id !== id),
    { revalidate: false }
  );
}

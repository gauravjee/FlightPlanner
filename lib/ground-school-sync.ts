// lib/ground-school-sync.ts
// ---------------------------------------------------------------------------
// Ground School ↔ Requirements Checklist Cross‑Sync Utility
// ---------------------------------------------------------------------------
// Purpose:
//   When an instructor checks/unchecks a ground school subject in the
//   Requirements Checklist (on /dashboard/progress), this utility
//   automatically creates or removes an EXEMPTED enrollment record in
//   the ground_school_enrollment table.
//
//   The requirement names in your database include validity suffixes like
//   "Air Regulations (valid 5 yrs)". This utility strips the suffix and
//   matches against the core subject name using includes().
// ---------------------------------------------------------------------------

import { supabase } from '@/lib/supabase-client';
import { useFlightStore } from '@/lib/store';

/**
 * Map of requirement name patterns → ground school subject names.
 * The keys are substrings that appear in the database requirement_name.
 * The values are the corresponding ground school subject names used in
 * the ground_school_subjects table and the notes field.
 */
const REQUIREMENT_TO_SUBJECT: Record<string, string> = {
  'Air Regulations': 'Air Regulations',
  'Air Navigation': 'Air Navigation',
  'Aviation Meteorology': 'Aviation Meteorology',
  'Technical General': 'Technical General',
  'Technical Specific': 'Technical Specific',
  'RTR(A)': 'RTR(A)',
};

/**
 * Extract the ground school subject name from a requirement name.
 * Handles suffixes like "(valid 5 yrs)", "(10 yrs / Lifetime)", etc.
 *
 * @param requirementName  Full requirement name from the database
 * @returns  Matching ground school subject name, or null if not a ground school subject
 */
function getGroundSchoolSubject(requirementName: string): string | null {
  for (const [pattern, subjectName] of Object.entries(REQUIREMENT_TO_SUBJECT)) {
    if (requirementName.includes(pattern)) {
      return subjectName;
    }
  }
  return null;
}

/**
 * Sync a ground school requirement's completion status to the
 * ground_school_enrollment table.
 *
 * @param studentId        UUID of the student
 * @param requirementName  Full requirement name from training_requirements table
 * @param completed        true = mark as exempted, false = remove exemption
 */
export async function syncGroundSchoolFromChecklist(
  studentId: string,
  requirementName: string,
  completed: boolean
): Promise<void> {
  // Extract the core ground school subject name using includes() matching
  const subjectName = getGroundSchoolSubject(requirementName);

  // If no match, this isn't a ground school subject — skip
  if (!subjectName) {
    console.log(`⏭️  Skipping "${requirementName}" — not a ground school subject`);
    return;
  }

  console.log(`🔄 Syncing "${requirementName}" → "${subjectName}", completed: ${completed}`);

  if (completed) {
    // Check if an EXEMPTED record already exists
    const { data: existing } = await supabase
      .from('ground_school_enrollment')
      .select('id')
      .eq('student_id', studentId)
      .eq('attendance_status', 'EXEMPTED')
      .eq('notes', `Requirements Checklist: ${subjectName}`);

    if (!existing || existing.length === 0) {
      const { error } = await supabase
        .from('ground_school_enrollment')
        .insert([
          {
            class_id: null,
            student_id: studentId,
            attendance_status: 'EXEMPTED',
            exam_score: 100,
            exam_result: 'PASS',
            exam_date: new Date().toISOString().split('T')[0],
            attempts: 1,
            examiner: 'Requirements Checklist',
            notes: `Requirements Checklist: ${subjectName}`,
          },
        ]);

      if (error) {
        console.error('Error creating EXEMPTED record:', error.message);
      } else {
        console.log(`✅ Created EXEMPTED record for "${subjectName}"`);
      }
    } else {
      console.log(`  Record already exists for "${subjectName}"`);
    }
  } else {
    const { error } = await supabase
      .from('ground_school_enrollment')
      .delete()
      .eq('student_id', studentId)
      .eq('attendance_status', 'EXEMPTED')
      .eq('notes', `Requirements Checklist: ${subjectName}`);

    if (error) {
      console.error('Error removing EXEMPTED record:', error.message);
    } else {
      console.log(`✅ Removed EXEMPTED record for "${subjectName}"`);
    }
  }
}

/**
 * The reverse direction of syncGroundSchoolFromChecklist above: when a
 * ground school exam is recorded as PASS, mark every matching Requirements
 * Checklist item for that student/subject as completed.
 *
 * Originally this logic only existed inline in the "Direct Exam Entry" flow
 * (Ground School Progress page), which meant the ordinary attendance-page
 * exam-recording flow — the one instructors actually use day to day — never
 * touched the Requirements Checklist at all. Centralized here so both call
 * sites (Direct Exam Entry and the attendance page) share one implementation
 * instead of drifting apart.
 *
 * Matching is intentionally one-directional (PASS -> completed only, never
 * un-completes on a later FAIL) to match the existing Direct Exam Entry
 * behavior — an instructor un-completing a checklist item is expected to go
 * through the Requirements Checklist itself, which already supports both
 * directions via syncGroundSchoolFromChecklist.
 *
 * @param studentId    UUID of the student
 * @param subjectName  Ground school subject name (e.g. "Air Regulations")
 * @param completedBy  Attribution shown on the requirement row
 * @returns             Number of requirement rows that were toggled to completed
 */
export async function syncRequirementsFromGroundSchoolPass(
  studentId: string,
  subjectName: string,
  completedBy: string
): Promise<number> {
  const { loadTrainingRequirements, toggleRequirement } = useFlightStore.getState();
  await loadTrainingRequirements(studentId);

  // Uses the same includes()-based name matching as the rest of this file —
  // requirement names carry suffixes like "Air Regulations (valid 5 yrs)".
  const currentReqs = useFlightStore.getState().trainingRequirements;
  const matchingReqs = currentReqs.filter(
    (r) => r.studentId === studentId && r.requirementName.includes(subjectName)
  );

  let toggledCount = 0;
  for (const req of matchingReqs) {
    if (!req.isCompleted) {
      await toggleRequirement(req.id, true, completedBy);
      toggledCount++;
    }
  }
  return toggledCount;
}
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

import { fetchTrainingRequirements, toggleRequirement } from '@/lib/hooks/useTrainingRequirements';

/**
 * Extract the ground school subject name from a requirement name.
 * Handles suffixes like "(valid 5 yrs)", "(10 yrs / Lifetime)", etc. by
 * matching requirementName against the live ground_school_subjects table
 * (Admin Setup -> Ground School) using includes(), rather than a hardcoded
 * requirement-name-pattern -> subject-name map.
 *
 * 2026-08-19: this used to be a fixed 6-entry table that had to be kept in
 * sync by hand with whatever Admin Setup's Ground School tab actually
 * showed — a subject renamed, added, or removed there would silently stop
 * (or wrongly start) matching here. Reading the subject names straight from
 * the database means this always agrees with Admin Setup.
 *
 * @param requirementName  Full requirement name from the database
 * @returns  Matching ground school subject name, or null if not a ground school subject
 */
// 2026-09-18 (RLS remediation, Batch 3 — see
// claude/data-access-security-mapping.md): was a direct client-side
// `supabase.from('ground_school_subjects')` call (anon key) — now goes
// through GET /api/admin/config/ground-school-subjects (service-role,
// session-gated).
export async function getGroundSchoolSubject(requirementName: string): Promise<string | null> {
  const res = await fetch('/api/admin/config/ground-school-subjects');
  if (!res.ok) {
    console.error('Error loading ground school subjects:', res.statusText);
    return null;
  }
  const { rows: data } = await res.json();

  for (const row of data || []) {
    const subjectName = row.subject_name as string | null;
    if (subjectName && requirementName.includes(subjectName)) {
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
 * @param examData         2026-08-19: this subject is examined by DGCA, not
 *                          the FTO — the student's actual DGCA roll number
 *                          and score, collected by the caller (see
 *                          RequirementsChecklist.tsx's DGCA modal) before
 *                          calling this with completed=true. Falls back to
 *                          a 100/no-roll-number placeholder if omitted, for
 *                          any caller that hasn't been updated to collect
 *                          it — but the one real caller in this app always
 *                          passes it now.
 */
export async function syncGroundSchoolFromChecklist(
  studentId: string,
  requirementName: string,
  completed: boolean,
  examData?: { rollNumber: string; score: number }
): Promise<void> {
  // Extract the core ground school subject name using includes() matching
  const subjectName = await getGroundSchoolSubject(requirementName);

  // If no match, this isn't a ground school subject — skip
  if (!subjectName) {
    console.log(`⏭️  Skipping "${requirementName}" — not a ground school subject`);
    return;
  }

  console.log(`🔄 Syncing "${requirementName}" → "${subjectName}", completed: ${completed}`);

  // 2026-09-16: this used to insert/delete `ground_school_enrollment` rows
  // straight from the browser with the public anon key and no role check of
  // any kind — the last of the 2026-08-24 review's item-39 direct-write
  // findings. Now goes through app/api/ground-school/checklist-sync/route.ts,
  // which enforces REQUIREMENTS_WRITE_ROLES server-side and keeps the
  // create-if-absent / delete-by-provenance behaviour byte-identical, so rows
  // written before this change are still matched by the same key.
  const res = await fetch('/api/ground-school/checklist-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId,
      subjectName,
      completed,
      examScore: examData?.score,
      rollNumber: examData?.rollNumber,
    }),
  });

  if (!res.ok) {
    // Logged rather than thrown, matching what this function did before: its
    // callers treat the checklist toggle itself as the operation that
    // mattered and this as a follow-on sync. A failure here now leaves a real
    // error in the console instead of vanishing entirely.
    const { error } = await res.json().catch(() => ({ error: '' }));
    console.error(`Error syncing ground school record for "${subjectName}":`, error || res.status);
    return;
  }

  const { action } = await res.json().catch(() => ({ action: 'unknown' }));
  console.log(`✅ Ground school record for "${subjectName}": ${action}`);
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
 * @returns             Number of requirement rows that were toggled to completed
 */
export async function syncRequirementsFromGroundSchoolPass(
  studentId: string,
  subjectName: string
): Promise<number> {
  // SWR migration, Stage 8 (2026-09-02): this is a plain (non-component,
  // non-hook) utility file, so it calls the hook file's exported fetcher/
  // write functions directly rather than going through a React hook — same
  // "one-shot fetch, bypass the cache" pattern used elsewhere for a
  // write-adjacent read (e.g. useHolidays.ts's fetchHolidays() inside
  // bookFlight). fetchTrainingRequirements(studentId) already scopes the
  // query server-side, so no client-side studentId re-filter is needed.
  //
  // Uses the same includes()-based name matching as the rest of this file —
  // requirement names carry suffixes like "Air Regulations (valid 5 yrs)".
  const currentReqs = await fetchTrainingRequirements(studentId);
  const matchingReqs = currentReqs.filter((r) => r.requirementName.includes(subjectName));

  // 2026-08-19: toggleRequirement no longer accepts a completedBy argument
  // at all — it's a server-side API route now (see
  // lib/hooks/useTrainingRequirements.ts and
  // app/api/admin/requirements/toggle/route.ts), and the server always
  // derives completedBy from the verified session making the request, i.e.
  // whichever instructor/admin is actually recording this exam pass. That
  // replaces the two callers' previous hardcoded placeholder strings
  // ('Ground School Module', 'Ground School Exam') with the real person's
  // name — an improvement, not just a mechanical signature change, since
  // "by Ground School Module" never read as a real audit attribution
  // anyway.
  let toggledCount = 0;
  for (const req of matchingReqs) {
    if (!req.isCompleted) {
      await toggleRequirement(req.id, true);
      toggledCount++;
    }
  }
  return toggledCount;
}
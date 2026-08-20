// lib/spl.ts
// ---------------------------------------------------------------------------
// Shared "is this the SPL requirement?" check, extracted 2026-08-20 so the
// match string lives in exactly one place. Before this, the same substring
// match ('Student Pilot License') was duplicated independently in
// BookingForm.tsx (blocks solo flights until SPL is complete) and would have
// been duplicated again in RequirementsChecklist.tsx (SPL-number capture
// modal) — the same "sibling entry points drift apart" pattern that's bitten
// this codebase repeatedly (exercise lists, stage lists, DGCA exam entry
// points, the aircraft Type dropdown). Import this instead of re-matching
// the string inline.
// ---------------------------------------------------------------------------

export const SPL_REQUIREMENT_NAME_MATCH = 'Student Pilot License';

export function isSPLRequirement(requirementName: string | null | undefined): boolean {
  return !!requirementName && requirementName.includes(SPL_REQUIREMENT_NAME_MATCH);
}

// lib/training-programs.ts
// ---------------------------------------------------------------------------
// Shared helper for resolving a student's `trainingStage` string to the
// admin-configured training_programs row (Admin Setup -> Training Programs)
// that best matches it. Used by both the full Progress page
// (app/dashboard/progress/page.tsx) and the Dashboard progress widget
// (components/dashboard/StudentProgressWidget.tsx) so the two can't
// silently drift apart on matching rules the way they'd already drifted on
// the built-in fallback amount (200h vs 40h) before this file existed.
//
// 2026-08-19: previously this only matched the LEADING WORD of a stage
// (e.g. "PPL" from "PPL Phase 1") against program_code — which meant every
// sub-stage of a program (PPL Phase 1, PPL Phase 2, ...) was forced to
// share one program row's targets, with no way to configure e.g. a lower
// interim hour target for Phase 1 vs the full target for Phase 2. Now tries
// an EXACT match against the full stage string first, so a school that
// wants per-phase targets can add rows named/coded exactly "PPL Phase 1"
// and "PPL Phase 2"; stages without their own specific row still fall back
// to the leading-word match against a general program row, unchanged.
// ---------------------------------------------------------------------------

interface ProgramLike {
  program_code: string;
  program_name?: string | null;
}

/**
 * Resolve the training_programs row that best matches a student's
 * trainingStage string.
 *
 * Matching priority:
 *  1. Exact match (case-insensitive, trimmed) against the full stage
 *     string, checked against both program_code and program_name — lets
 *     an admin configure a specific sub-stage like "PPL Phase 1" with its
 *     own targets, distinct from a general "PPL" row.
 *  2. Falls back to matching just the leading word of the stage (e.g.
 *     "PPL" from "PPL Phase 1") against program_code, so any stage
 *     without its own specific row still inherits sane program-level
 *     defaults instead of matching nothing at all.
 *
 * @param stage     A student's trainingStage value, e.g. "PPL Phase 1"
 * @param programs  The training_programs rows to search
 */
export function matchTrainingProgram<T extends ProgramLike>(
  stage: string | undefined,
  programs: T[]
): T | undefined {
  if (!stage) return undefined;
  const trimmed = stage.trim();
  if (!trimmed) return undefined;
  const upper = trimmed.toUpperCase();

  const exact = programs.find(p =>
    p.program_code?.trim().toUpperCase() === upper ||
    p.program_name?.trim().toUpperCase() === upper
  );
  if (exact) return exact;

  const leadingCode = trimmed.split(/\s+/)[0]?.toUpperCase();
  if (!leadingCode) return undefined;
  return programs.find(p => p.program_code?.trim().toUpperCase() === leadingCode);
}

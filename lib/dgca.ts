// lib/dgca.ts
// ---------------------------------------------------------------------------
// DGCA ground school exam rules.
//
// These exams are conducted by DGCA, not the FTO. The FTO records the outcome;
// it does not decide it. That is why the pass mark lives here as one constant
// used by both the UI and the API route rather than being typed into a form:
// a recorded result should be a function of the recorded score, with no way
// for the two to disagree.
//
// 2026-09-18 (stated by the operator): all subjects require a minimum of 70%.
// A student may sit a subject any number of times; the training requirement
// stays open until one of those attempts is a pass.
// ---------------------------------------------------------------------------

/** Minimum percentage for a DGCA ground school pass. */
export const DGCA_PASS_MARK = 70;

export type ExamResult = 'PASS' | 'FAIL';

/**
 * The result a score implies. Null score means no exam has been recorded yet,
 * which is NOT a fail — it is the absence of an attempt, and the requirement
 * stays open on it.
 */
export function deriveExamResult(score: number | null): ExamResult | null {
  if (score === null || Number.isNaN(score)) return null;
  return score >= DGCA_PASS_MARK ? 'PASS' : 'FAIL';
}

/** A score the DGCA could actually have awarded. */
export function isValidExamScore(score: unknown): score is number {
  return typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100;
}

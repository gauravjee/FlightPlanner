// lib/student-age.ts — DGCA minimum age for a student (operator, 14 Oct: 17 years).
// Checked on the joining date (today when there's none). Client-safe: the form uses it for the date picker's max.
export const MIN_STUDENT_AGE = 17;

/** The latest date of birth that is MIN_STUDENT_AGE on `asOf` ('YYYY-MM-DD'). */
export function latestStudentDob(asOf: string): string {
  const [y, m, d] = asOf.split('-');
  return `${Number(y) - MIN_STUDENT_AGE}-${m}-${m === '02' && d === '29' ? '28' : d}`;
}

/** The refusal message when `dob` is under the minimum age on `asOf`, or null. A blank DOB is allowed. */
export function studentAgeRefusal(dob: string | null | undefined, asOf: string): string | null {
  if (!dob) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return 'Date of birth must be a date.';
  return dob > latestStudentDob(asOf)
    ? `A student must be at least ${MIN_STUDENT_AGE} years old (DGCA) on the joining date (${asOf}). Check the date of birth.`
    : null;
}

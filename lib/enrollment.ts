// lib/enrollment.ts
// Auto-generated student enrollment numbers (2026-09-24, operator decisions):
// prefix + zero-padded number, no separator — 'HFA2026-27' + 1 (width 4)
// -> 'HFA2026-270001'. The width comes from how the starting number was
// typed in Admin Setup ('0001' and '1001' both mean 4 digits). Numbers are
// issued server-side by the next_enrollment_id() database function
// (add-enrollment-series.sql), which must format them the same way.
// Pure — safe on client and server.

/** Letters, digits, '-' and '/', starting with a letter or digit; up to 30 chars. */
export const ENROLLMENT_PREFIX_RE = /^[A-Za-z0-9][A-Za-z0-9/-]{0,29}$/;

/** '0001' -> { start: 1, width: 4 }; null unless 1–9 digits. */
export function parseStartNumber(value: string): { start: number; width: number } | null {
  const v = value.trim();
  return /^\d{1,9}$/.test(v) ? { start: Number(v), width: v.length } : null;
}

/** Never truncates: a number longer than the width is shown in full. */
export function formatEnrollmentId(prefix: string, n: number, width: number): string {
  return prefix + String(n).padStart(width, '0');
}

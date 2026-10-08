// lib/user-id.ts — B1 user ID login (2026-10-08; claude/user-id-login-design-2026-10-08.md).
// Users sign in with their email OR their user ID, in any letter case. The
// user ID starts as their staff ID / enrollment number and may be changed
// once to one they choose. Pure — safe on client and server.

/** A chosen user ID: 4–20 letters, digits, dot, underscore or hyphen. */
export const USER_ID_RE = /^[A-Za-z0-9._-]{4,20}$/;

/** What was typed at login is an email if it has an @ (user IDs never do). */
export const isEmailIdentifier = (s: string): boolean => s.includes('@');

/** Escapes a value for a PostgREST ilike pattern, so it matches exactly (case-insensitive). */
export const exactIlike = (s: string): string => s.replace(/[\\%_]/g, c => '\\' + c);

/**
 * Why a user ID someone chose can't be used, or null when its shape is fine.
 * Being free is checked separately (the database has the final say).
 * enrollmentPrefixes = every enrollment series prefix: any ID starting with
 * one is refused, so it can never clash with an enrollment number issued
 * later (new prefixes are checked against existing IDs in
 * app/api/enrollment-series). Staff-ID shapes are refused likewise.
 */
export function chosenUserIdProblem(id: string, enrollmentPrefixes: string[]): string | null {
  if (id.includes('@')) return "That's an email address, not a user ID.";
  if (!USER_ID_RE.test(id)) return 'Use 4 to 20 characters: letters, digits, dot, underscore or hyphen.';
  if (id.length === 15 && /^[a-z0-9]{1,5}e\d{9,13}$/i.test(id)) return 'That looks like a staff ID. Those are reserved.';
  const lower = id.toLowerCase();
  const prefix = enrollmentPrefixes.find(p => p && lower.startsWith(p.toLowerCase()));
  if (prefix) return `IDs starting with the enrollment prefix "${prefix}" are reserved.`;
  return null;
}

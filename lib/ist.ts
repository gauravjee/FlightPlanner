// lib/ist.ts
// ---------------------------------------------------------------------------
// Calendar-date helpers for an app that runs entirely in IST.
//
// THE BUG THIS EXISTS TO PREVENT (found 2026-09-03, see the handoff doc):
// `someDate.toISOString().split('T')[0]` reads a Date back in UTC. For any
// timezone AHEAD of UTC — IST is +05:30 — that silently returns the WRONG
// calendar day in two separate situations:
//
//   1. A Date built at local midnight (`new Date(y, m, d)`, or
//      `new Date('2026-09-04T00:00:00')`, or `d.setHours(0,0,0,0)`) is
//      18:30 UTC the PREVIOUS day. Always off by one, every hour of every
//      day. This is what broke maintenance due-dates and the ground-school
//      month calendar.
//   2. `new Date()` (now) is the previous UTC day between 00:00 and 05:30
//      IST. Wrong for five and a half hours daily — which is exactly when
//      an early-shift instructor logs a flight.
//
// `toLocaleDateString('en-CA')` formats as YYYY-MM-DD natively and reads
// the date's own local calendar fields, so it cannot drift. No manual
// zero-padding, no third-party date library.
// ---------------------------------------------------------------------------

// The FTO's timezone. Kept as a named constant rather than inlined so the
// `+05:30` literals scattered through the scheduling code have somewhere to
// converge if anyone ever consolidates them.
export const IST_OFFSET = '+05:30';
export const IST_TIMEZONE = 'Asia/Kolkata';

// 'YYYY-MM-DD' for a Date, read from ITS OWN local calendar fields.
// Use for any Date the app constructed locally — calendar cells, a date
// picker's value, a date built from a 'YYYY-MM-DD' string.
export function toDateStr(date: Date): string {
  return date.toLocaleDateString('en-CA');
}

// 'YYYY-MM-DD' for "today in India", regardless of where this runs.
//
// Client code could use toDateStr(new Date()) — the browser is already in
// IST for this FTO — but server routes CANNOT: Vercel runs in UTC, so
// "today" there is the previous day for the first 5.5 hours of every IST
// day. Pinning the timezone explicitly makes both cases correct and means
// a call site doesn't have to know where it executes.
export function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE });
}

// 'YYYY-MM-DD' for `days` from now, in India. Used for the form defaults
// that pre-fill a next-maintenance date.
export function daysFromTodayIST(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE });
}

// ---- Display (UI plan Step 3b, 23 Oct; operator: "23 Oct 2026" everywhere) ----
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
type DateInput = string | Date | null | undefined;

// The IST calendar day as 'YYYY-MM-DD'. A plain 'YYYY-MM-DD' string is already a calendar day and is kept as is
// (reading it as a Date would be UTC midnight). null for empty or unreadable input.
function istDay(v: DateInput): string | null {
  if (!v) return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE });
}

// "23 Oct 2026". Built by hand: en-GB now prints "Sept". Unreadable text is shown unchanged; empty gives ''.
export function formatDate(v: DateInput): string {
  const day = istDay(v);
  if (!day) return typeof v === 'string' ? v : '';
  const [y, m, d] = day.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

// "Friday, 23 Oct 2026" (or "Fri, 23 Oct 2026") for headings.
export function formatDayDate(v: DateInput, weekday: 'long' | 'short' = 'long'): string {
  const day = istDay(v);
  if (!day) return typeof v === 'string' ? v : '';
  return `${new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { weekday, timeZone: 'UTC' })}, ${formatDate(day)}`;
}

// "23 Oct 2026, 09:30 IST" for a timestamp.
export function formatDateTime(v: DateInput): string {
  const d = v instanceof Date ? v : v ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return typeof v === 'string' ? v : '';
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: IST_TIMEZONE });
  return `${formatDate(d)}, ${time} IST`;
}

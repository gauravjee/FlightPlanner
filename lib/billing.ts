// lib/billing.ts — billing phase B1 (21 Oct; claude/billing-design-2026-10-20.md).
// Pure helpers shared by the billing routes and screens: rate categories, pricing and balances.
// Money is kept in rupees with 2 decimals, rounded at each step the way an invoice would be.

export const BILLING_CATEGORIES = ['SINGLE_ENGINE', 'MULTI_ENGINE', 'SIMULATOR'] as const;
export type BillingCategory = (typeof BILLING_CATEGORIES)[number];
export const CATEGORY_LABEL: Record<BillingCategory, string> = {
  SINGLE_ENGINE: 'Single engine', MULTI_ENGINE: 'Multi engine', SIMULATOR: 'Simulator',
};
export const PAYMENT_METHODS = ['CASH', 'BANK', 'UPI', 'CARD', 'CHEQUE'] as const;

/** The rate category an aircraft is billed under (operator: per aircraft type, SE / ME / simulator). */
export function categoryFor(aircraft: { is_simulator?: boolean | null; type?: string | null }): BillingCategory {
  if (aircraft.is_simulator) return 'SIMULATOR';
  return aircraft.type === 'Multi Engine' ? 'MULTI_ENGINE' : 'SINGLE_ENGINE';
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Net, GST and total for some hours at an hourly rate. */
export function priceHours(hours: number, rate: number, gstRate: number) {
  const net = round2(hours * rate);
  const gst = round2((net * gstRate) / 100);
  return { net, gst, total: round2(net + gst) };
}

export interface LedgerLike { debit: number | string; credit: number | string; voided_at?: string | null }

/** Money on account: payments and credits minus charges, ignoring voided entries. Negative = the student owes. */
export function balanceOf(entries: LedgerLike[]): number {
  return round2(entries.filter(e => !e.voided_at).reduce((s, e) => s + Number(e.credit) - Number(e.debit), 0));
}

/** A positive amount with at most 2 decimals, below the column's limit; null when it isn't one. */
export function parseAmount(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.trim()) : typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n) || n <= 0 || n >= 1e10 || round2(n) !== n) return null;
  return n;
}

export const formatINR = (n: number) =>
  `${n < 0 ? '−' : ''}₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ---- B2 (21 Oct): packages and instalments ----
export const CATEGORY_HOURS_FIELD = { SINGLE_ENGINE: 'se_hours', MULTI_ENGINE: 'me_hours', SIMULATOR: 'sim_hours' } as const;

/** How many of a flight's hours come out of the package, and how many are charged at the hourly rate. */
export function splitHours(hours: number, packageHoursLeft: number) {
  const fromPackage = round2(Math.max(0, Math.min(hours, packageHoursLeft)));
  return { fromPackage, charged: round2(hours - fromPackage) };
}

export interface Instalment { due_date: string; amount: number | string }

/**
 * What a student owes right now: the part of a negative balance not covered by instalments that aren't due yet.
 * Overdue = something is owed now and an instalment date has already passed.
 */
export function dueNow(balance: number, instalments: Instalment[], today: string) {
  const notYetDue = round2(instalments.filter(i => i.due_date > today).reduce((s, i) => s + Number(i.amount), 0));
  const due = round2(Math.max(0, -balance - notYetDue));
  return { notYetDue, due, overdue: due > 0 && instalments.some(i => i.due_date < today) };
}

/** A plan of n monthly instalments from firstDate; the last one takes the rounding. */
export function monthlyPlan(total: number, n: number, firstDate: string): { due_date: string; amount: number }[] {
  const each = Math.floor((total / n) * 100) / 100;
  return Array.from({ length: n }, (_, i) => {
    // shortcut: a 29th–31st start can roll into the next month (31 Jan + 1 → 3 Mar); the rows are editable before saving.
    const d = new Date(firstDate + 'T00:00:00Z');
    d.setUTCMonth(d.getUTCMonth() + i);
    return { due_date: d.toISOString().slice(0, 10), amount: i === n - 1 ? round2(total - each * (n - 1)) : each };
  });
}

// ---- B4 (22 Oct): receipts, GST invoices and credit notes ----
/** GST state codes (the first 2 digits of a GSTIN), for the place of supply. */
export const GST_STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
  '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep',
  '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana',
  '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory',
};

const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** The GSTIN's 15th character, computed from the first 14 (GSTN's base-36 check digit). */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = GSTIN_CHARS.indexOf(first14[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36];
}

/** A valid GSTIN: state code, PAN, entity number, Z, and a check character that matches (catches typos). */
export const isGstin = (v: string) => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v) && v.slice(0, 2) in GST_STATES && gstinCheckChar(v) === v[14];

/** IGST when the student's state is known and differs from the school's (the GSTIN's state); else CGST + SGST. */
export const isInterState = (schoolGstin: string, studentState: string | null | undefined) => !!studentState && studentState !== schoolGstin.slice(0, 2);

// ---- B4b (22 Oct): statements and the reconciliation report ----
export type PeriodKind = 'weekly' | 'monthly' | 'annual';
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** The week (Mon–Sun), month or financial year (Apr–Mar) containing a date, as YYYY-MM-DD from / to. */
export function periodRange(kind: PeriodKind, date: string): { from: string; to: string } {
  const d = new Date(date + 'T00:00:00Z');
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  if (kind === 'weekly') {
    const from = new Date(d);
    from.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const to = new Date(from);
    to.setUTCDate(from.getUTCDate() + 6);
    return { from: isoDay(from), to: isoDay(to) };
  }
  if (kind === 'monthly') return { from: isoDay(new Date(Date.UTC(y, m, 1))), to: isoDay(new Date(Date.UTC(y, m + 1, 0))) };
  const fy = m < 3 ? y - 1 : y;
  return { from: `${fy}-04-01`, to: `${fy + 1}-03-31` };
}

export interface StatementEntry { id: number; entry_date: string; debit: number | string; credit: number | string; voided_at?: string | null; description?: string }
/** The IST calendar date of a timestamp. */
const istDate = (ts: string) => new Date(Date.parse(ts) + 330 * 60_000).toISOString().slice(0, 10);

/**
 * Opening balance before `from`, the period's lines (oldest first) with a running balance, and the totals.
 * A voided entry stays on its own date and is reversed on the day it was voided (operator, 22 Oct), so a statement
 * already issued for a past period never changes.
 */
export function statementOf<T extends StatementEntry>(entries: T[], from: string, to: string) {
  const events = entries.flatMap(e => (e.voided_at
    ? [e, { ...e, entry_date: istDate(e.voided_at), debit: e.credit, credit: e.debit, description: `Voided: ${e.description ?? ''}`, reversal: true }]
    : [e]) as (T & { reversal?: boolean })[])
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.id - b.id || Number(!!a.reversal) - Number(!!b.reversal));
  const opening = round2(events.filter(e => e.entry_date < from).reduce((s, e) => s + Number(e.credit) - Number(e.debit), 0));
  let running = opening, charges = 0, credits = 0;
  const lines = events.filter(e => e.entry_date >= from && e.entry_date <= to).map(e => {
    charges += Number(e.debit);
    credits += Number(e.credit);
    running = round2(running + Number(e.credit) - Number(e.debit));
    return { ...e, balance: running };
  });
  return { opening, lines, charges: round2(charges), credits: round2(credits), closing: running };
}

export interface ReconFlight { id: string; flight_date: string; student_id: string | null; aircraft_id: string | number; total_hours: number | string }
export interface ReconCharge { source_id: string | null; debit: number | string; hours: number | string | null; voided_at: string | null }
export type ReconStatus = 'CHARGED' | 'PACKAGE' | 'PACKAGE_AND_CHARGED' | 'NOT_CHARGED' | 'BEFORE_BILLING' | 'NO_STUDENT';
export const RECON_LABEL: Record<ReconStatus, string> = {
  CHARGED: 'Charged', PACKAGE: 'From package', PACKAGE_AND_CHARGED: 'Package + charged', NOT_CHARGED: 'Not charged',
  BEFORE_BILLING: 'Before billing', NO_STUDENT: 'No student',
};

/**
 * Each logbook flight beside its charge: live charge, package hours, voided charges, and a status. A flight with
 * nothing charged dated before billingStart (Admin Setup → Billing; '' = none) is "Before billing", not "Not charged".
 */
export function reconcile<F extends ReconFlight>(
  flights: F[], charges: ReconCharge[], usage: { flight_record_id: string; hours: number | string }[], billingStart = '',
) {
  return flights.map(f => {
    const mine = charges.filter(c => c.source_id === String(f.id));
    const live = mine.find(c => !c.voided_at);
    const packageHours = round2(Number(usage.find(u => String(u.flight_record_id) === String(f.id))?.hours ?? 0));
    const status: ReconStatus = !f.student_id ? 'NO_STUDENT'
      : live && packageHours ? 'PACKAGE_AND_CHARGED' : live ? 'CHARGED' : packageHours ? 'PACKAGE'
      : billingStart && f.flight_date < billingStart ? 'BEFORE_BILLING' : 'NOT_CHARGED';
    return {
      ...f, hours: round2(Number(f.total_hours)), packageHours, status,
      charged: live ? round2(Number(live.debit)) : 0, chargedHours: live ? round2(Number(live.hours ?? 0)) : 0,
      voidedCharges: mine.filter(c => c.voided_at).length,
    };
  });
}

/** Totals of reconciled rows grouped by a key (month, student, aircraft), sorted by key. */
export function reconTotals(rows: { hours: number; packageHours: number; charged: number }[], keyOf: (i: number) => string) {
  const by = new Map<string, { key: string; flights: number; hours: number; packageHours: number; charged: number }>();
  rows.forEach((r, i) => {
    const k = keyOf(i);
    const t = by.get(k) ?? { key: k, flights: 0, hours: 0, packageHours: 0, charged: 0 };
    by.set(k, { key: k, flights: t.flights + 1, hours: round2(t.hours + r.hours), packageHours: round2(t.packageHours + r.packageHours), charged: round2(t.charged + r.charged) });
  });
  return [...by.values()].sort((a, b) => a.key.localeCompare(b.key));
}


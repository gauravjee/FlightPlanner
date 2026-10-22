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

/** A well-formed GSTIN: state code, PAN, entity number, Z, check character. */
export const isGstin = (v: string) => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v) && v.slice(0, 2) in GST_STATES;

/** IGST when the student's state is known and differs from the school's (the GSTIN's state); else CGST + SGST. */
export const isInterState = (schoolGstin: string, studentState: string | null | undefined) => !!studentState && studentState !== schoolGstin.slice(0, 2);


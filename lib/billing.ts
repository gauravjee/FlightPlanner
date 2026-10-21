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

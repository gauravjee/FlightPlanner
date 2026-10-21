// lib/billing-server.ts — billing phase B1 (21 Oct; claude/billing-design-2026-10-20.md).
// Server-side billing: the rate a student pays, the charge for a logbook entry, balances, and the
// low-balance booking check. Billing never blocks the logbook: a failed charge is logged, not thrown.

import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  BILLING_CATEGORIES, CATEGORY_HOURS_FIELD, categoryFor, priceHours, balanceOf, round2, formatINR, splitHours, dueNow,
  type BillingCategory,
} from '@/lib/billing';
import { todayIST } from '@/lib/ist';

export interface EffectiveRate { category: BillingCategory; hourlyRate: number; gstRate: number; override: boolean }

/** The rate per category for one student: their own override if set, else the school rate. */
export async function ratesFor(studentId: string): Promise<EffectiveRate[]> {
  const [{ data: school }, { data: own }] = await Promise.all([
    supabaseAdmin.from('billing_rates').select('category, hourly_rate, gst_rate'),
    supabaseAdmin.from('student_rates').select('category, hourly_rate').eq('student_id', studentId),
  ]);
  return BILLING_CATEGORIES.map(category => {
    const s = school?.find(r => r.category === category);
    const o = own?.find(r => r.category === category);
    return {
      category,
      hourlyRate: Number(o?.hourly_rate ?? s?.hourly_rate ?? 0),
      gstRate: Number(s?.gst_rate ?? 0),
      override: !!o,
    };
  });
}

type ByCategory = Record<BillingCategory, number>;
export interface ActivePackage {
  id: number; name: string; agreedFee: number; gstRate: number; assignedAt: string; note: string | null;
  included: ByCategory; used: ByCategory; left: ByCategory;
  instalments: { id: number; due_date: string; amount: number }[];
}

/** B2: the student's active package with hours used / left per category and its instalment plan; null if none. */
export async function activePackage(studentId: string): Promise<ActivePackage | null> {
  const { data: sp } = await supabaseAdmin.from('student_packages').select('*').eq('student_id', studentId).eq('status', 'ACTIVE').maybeSingle();
  if (!sp) return null;
  const [{ data: usage }, { data: plan }] = await Promise.all([
    supabaseAdmin.from('package_usage').select('category, hours').eq('student_package_id', sp.id),
    supabaseAdmin.from('package_instalments').select('id, due_date, amount').eq('student_package_id', sp.id).order('due_date'),
  ]);
  const per = (f: (c: BillingCategory) => number) => Object.fromEntries(BILLING_CATEGORIES.map(c => [c, round2(f(c))])) as ByCategory;
  const included = per(c => Number(sp[CATEGORY_HOURS_FIELD[c]] ?? 0));
  const used = per(c => (usage ?? []).filter(u => u.category === c).reduce((s, u) => s + Number(u.hours), 0));
  return {
    id: Number(sp.id), name: sp.name, agreedFee: Number(sp.agreed_fee), gstRate: Number(sp.gst_rate), assignedAt: sp.assigned_at, note: sp.note ?? null,
    included, used, left: per(c => Math.max(0, included[c] - used[c])),
    instalments: (plan ?? []).map(i => ({ id: Number(i.id), due_date: i.due_date, amount: Number(i.amount) })),
  };
}

/**
 * Charge a student for a saved logbook entry. B2: hours of the flight's category come out of the active package first;
 * only the rest is charged at the hourly rate (logbook flight time × rate + GST). Idempotent per entry.
 */
export async function chargeLogbookEntry(recordId: string, by: string): Promise<void> {
  try {
    const { data: rec } = await supabaseAdmin.from('flight_records')
      .select('id, student_id, aircraft_id, total_hours, flight_date, flight_type').eq('id', recordId).maybeSingle();
    const hours = Number(rec?.total_hours ?? 0);
    if (!rec?.student_id || !(hours > 0)) return;
    const [{ data: usedRow }, { data: chargedRow }] = await Promise.all([
      supabaseAdmin.from('package_usage').select('id').eq('flight_record_id', recordId).maybeSingle(),
      supabaseAdmin.from('ledger_entries').select('id').eq('source', 'LOGBOOK').eq('source_id', recordId).is('voided_at', null).maybeSingle(),
    ]);
    if (usedRow || chargedRow) return; // already billed
    const { data: ac } = await supabaseAdmin.from('aircraft').select('registration, type, is_simulator').eq('id', rec.aircraft_id).maybeSingle();
    if (!ac) return;
    const category = categoryFor(ac);
    // shortcut: two entries saved at the same instant can both read the same hours left; fine at one school's volume.
    const pkg = await activePackage(String(rec.student_id));
    const { fromPackage, charged } = splitHours(hours, pkg?.left[category] ?? 0);
    if (pkg && fromPackage > 0) {
      const { error } = await supabaseAdmin.from('package_usage')
        .insert({ flight_record_id: recordId, student_package_id: pkg.id, category, hours: fromPackage });
      if (error) {
        if (error.code !== '23505') console.error('Billing: recording package hours failed:', error.code);
        return;
      }
    }
    if (!(charged > 0)) return;
    const rate = (await ratesFor(String(rec.student_id))).find(r => r.category === category)!;
    if (!(rate.hourlyRate > 0)) {
      console.warn(`Billing: no ${category} rate set — ${charged} h of logbook entry ${recordId} not charged.`);
      return;
    }
    const { gst, total } = priceHours(charged, rate.hourlyRate, rate.gstRate);
    const { error } = await supabaseAdmin.from('ledger_entries').insert({
      student_id: rec.student_id,
      entry_date: rec.flight_date,
      kind: 'CHARGE',
      source: 'LOGBOOK',
      source_id: String(rec.id),
      description: `${ac.registration} ${rec.flight_type ?? ''} flight, ${hours} h${fromPackage ? ` (${fromPackage} h from package)` : ''}`.replace(/\s+/g, ' '),
      hours: charged,
      rate: rate.hourlyRate,
      gst_rate: rate.gstRate,
      gst_amount: gst,
      debit: total,
      created_by: by,
    });
    // 23505: this entry is already charged (the unique index on source + source_id) — nothing to do.
    if (error && error.code !== '23505') console.error('Billing: charging logbook entry failed:', error.code);
  } catch (e) {
    console.error('Billing: charging logbook entry failed:', e);
  }
}

/** Balance per student id, for the given students (all with ledger entries when omitted). */
export async function balances(studentIds?: string[]): Promise<Map<string, number>> {
  // shortcut: sums every live ledger row in the app; move to a SQL view / RPC when the ledger reaches tens of thousands of rows.
  let q = supabaseAdmin.from('ledger_entries').select('student_id, debit, credit').is('voided_at', null);
  if (studentIds) q = q.in('student_id', studentIds);
  const { data } = await q;
  const by = new Map<string, { debit: number; credit: number }[]>();
  for (const r of data ?? []) {
    const list = by.get(String(r.student_id)) ?? [];
    list.push({ debit: Number(r.debit), credit: Number(r.credit) });
    by.set(String(r.student_id), list);
  }
  return new Map([...by].map(([id, rows]) => [id, balanceOf(rows)]));
}

const hoursBetween = (start: string, end: string) => Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000);

/**
 * Refusal when the booking-block setting is on and the student's balance plus credit limit doesn't cover
 * this booking plus their other bookings not yet charged. null = allowed.
 */
export async function bookingFundsRefusal(
  studentId: string, aircraftId: string, start: string, end: string, excludeBookingId?: string,
): Promise<string | null> {
  const { data: setting } = await supabaseAdmin.from('fto_settings').select('setting_value').eq('setting_key', 'billing_booking_block').maybeSingle();
  if (setting?.setting_value !== 'true') return null;

  const [rates, bal, pkg, { data: student }, { data: upcoming }, { data: fleet }] = await Promise.all([
    ratesFor(studentId),
    balances([studentId]),
    activePackage(studentId),
    supabaseAdmin.from('students').select('name, credit_limit').eq('id', studentId).maybeSingle(),
    // Booked or flown but not yet logbooked: not charged yet, so it still needs covering.
    supabaseAdmin.from('scheduled_flights').select('id, aircraft_id, start_time, end_time, status, logbook_pending')
      .eq('student_id', studentId).in('status', ['SCHEDULED', 'PENDING_APPROVAL', 'IN_PROGRESS', 'COMPLETED']),
    supabaseAdmin.from('aircraft').select('id, type, is_simulator'),
  ]);
  // B2: package hours left are used up by the earlier bookings first, then this one; only the rest costs money.
  const left: ByCategory = { ...(pkg?.left ?? { SINGLE_ENGINE: 0, MULTI_ENGINE: 0, SIMULATOR: 0 }) };
  const cost = (acId: string, s: string, e: string) => {
    const ac = fleet?.find(a => String(a.id) === String(acId));
    const category = categoryFor(ac ?? {});
    const r = rates.find(x => x.category === category)!;
    const { fromPackage, charged } = splitHours(round2(hoursBetween(s, e)), left[category]);
    left[category] = round2(left[category] - fromPackage);
    return priceHours(charged, r.hourlyRate, r.gstRate).total;
  };
  // A booking that ended over 2 days ago and was never checked out is stale, not a cost still to come.
  const staleBefore = Date.now() - 2 * 24 * 3_600_000;
  const otherCost = round2((upcoming ?? [])
    .filter(f => String(f.id) !== String(excludeBookingId ?? ''))
    .filter(f => (f.status === 'COMPLETED' ? f.logbook_pending : new Date(f.end_time).getTime() >= staleBefore))
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .reduce((s, f) => s + cost(String(f.aircraft_id), f.start_time, f.end_time), 0));
  const thisCost = cost(aircraftId, start, end);
  if (!(thisCost > 0)) return null; // covered by the package, or no rate configured for this aircraft
  const balance = bal.get(studentId) ?? 0;
  const creditLimit = Number(student?.credit_limit ?? 0);
  // B2: instalments not yet due don't count against the student.
  const notYetDue = pkg ? dueNow(balance, pkg.instalments, todayIST()).notYetDue : 0;
  if (round2(balance + creditLimit + notYetDue) >= round2(thisCost + otherCost)) return null;
  return `${student?.name ?? 'This student'}'s account doesn't cover this booking: balance ${formatINR(balance)}`
    + `${creditLimit ? ` + credit ${formatINR(creditLimit)}` : ''}${notYetDue ? ` + instalments not yet due ${formatINR(notYetDue)}` : ''}, needed ${formatINR(thisCost)}`
    + `${otherCost ? ` (plus ${formatINR(otherCost)} for bookings not yet charged)` : ''}.`
    + ' Record a payment, or ask an admin to add credit.';
}

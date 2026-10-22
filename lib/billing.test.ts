// lib/billing.test.ts
// Run: npx tsx lib/billing.test.ts
import assert from 'node:assert/strict';
import { categoryFor, priceHours, balanceOf, parseAmount, formatINR, splitHours, dueNow, monthlyPlan, isGstin, isInterState,
  periodRange, statementOf, reconcile, reconTotals } from './billing';

assert.equal(categoryFor({ is_simulator: true, type: 'Multi Engine' }), 'SIMULATOR', 'simulator flag wins');
assert.equal(categoryFor({ type: 'Multi Engine' }), 'MULTI_ENGINE');
assert.equal(categoryFor({ type: 'Single Engine' }), 'SINGLE_ENGINE');
assert.equal(categoryFor({ type: null }), 'SINGLE_ENGINE', 'unknown type bills as single engine');

assert.deepEqual(priceHours(1.3, 12500, 18), { net: 16250, gst: 2925, total: 19175 });
assert.deepEqual(priceHours(0.7, 9999.99, 18), { net: 6999.99, gst: 1260, total: 8259.99 });
assert.deepEqual(priceHours(2, 0, 18), { net: 0, gst: 0, total: 0 });

assert.equal(balanceOf([
  { debit: '19175.00', credit: '0' },
  { debit: 0, credit: 50000 },
  { debit: 500, credit: 0, voided_at: '2026-10-21T00:00:00Z' }, // voided: ignored
]), 30825);
assert.equal(balanceOf([]), 0);

assert.equal(parseAmount('1500.50'), 1500.5);
assert.equal(parseAmount(20000), 20000);
for (const bad of ['0', '-5', '1.234', 'abc', '', null, 1e10]) assert.equal(parseAmount(bad), null, `refuses ${bad}`);

assert.equal(formatINR(-125000.5), '−₹1,25,000.50', 'Indian grouping, sign in front');

// B2: package hours first, the rest hourly.
assert.deepEqual(splitHours(1.3, 10), { fromPackage: 1.3, charged: 0 });
assert.deepEqual(splitHours(1.3, 0.5), { fromPackage: 0.5, charged: 0.8 });
assert.deepEqual(splitHours(1.3, 0), { fromPackage: 0, charged: 1.3 });
assert.deepEqual(splitHours(1.3, -2), { fromPackage: 0, charged: 1.3 }, 'a negative remainder never adds hours');

// B2: due now / overdue. Package of 413000 charged; plan 213000 on 21 Oct, 200000 on 21 Nov.
const plan = [{ due_date: '2026-10-21', amount: 213000 }, { due_date: '2026-11-21', amount: '200000.00' }];
assert.deepEqual(dueNow(-413000, plan, '2026-10-21'), { notYetDue: 200000, due: 213000, overdue: false }, 'due today is not overdue');
assert.deepEqual(dueNow(-413000, plan, '2026-10-22'), { notYetDue: 200000, due: 213000, overdue: true });
assert.deepEqual(dueNow(-200000, plan, '2026-10-22'), { notYetDue: 200000, due: 0, overdue: false }, 'first instalment paid');
assert.deepEqual(dueNow(5000, [], '2026-10-22'), { notYetDue: 0, due: 0, overdue: false });
assert.deepEqual(dueNow(-500, [], '2026-10-22'), { notYetDue: 0, due: 500, overdue: false }, 'owing without a plan is due, not overdue');

// B2: monthly split adds up exactly.
const m = monthlyPlan(413000, 3, '2026-10-21');
assert.deepEqual(m.map(r => r.due_date), ['2026-10-21', '2026-11-21', '2026-12-21']);
assert.deepEqual(m.map(r => r.amount), [137666.66, 137666.66, 137666.68]);

// B4: GSTIN check and the GST split.
assert.equal(isGstin('27ABCDE1234F1Z5'), true);
assert.equal(isGstin('27abcde1234f1z5'), false, 'upper case only');
assert.equal(isGstin('28ABCDE1234F1Z5'), false, 'no such state code');
assert.equal(isGstin('27ABCDE1234F1Z'), false, 'too short');
assert.equal(isInterState('27ABCDE1234F1Z5', '27'), false, 'same state: CGST + SGST');
assert.equal(isInterState('27ABCDE1234F1Z5', '33'), true, 'other state: IGST');
assert.equal(isInterState('27ABCDE1234F1Z5', null), false, 'no state recorded: same state');

// B4b: periods, statements, reconciliation.
assert.deepEqual(periodRange('weekly', '2026-10-22'), { from: '2026-10-19', to: '2026-10-25' }, 'Thursday → Mon–Sun');
assert.deepEqual(periodRange('weekly', '2026-10-25'), { from: '2026-10-19', to: '2026-10-25' }, 'Sunday ends its week');
assert.deepEqual(periodRange('monthly', '2026-02-10'), { from: '2026-02-01', to: '2026-02-28' });
assert.deepEqual(periodRange('annual', '2026-03-31'), { from: '2025-04-01', to: '2026-03-31' }, 'March is the old financial year');
assert.deepEqual(periodRange('annual', '2026-04-01'), { from: '2026-04-01', to: '2027-03-31' });
const st = statementOf([
  { id: 1, entry_date: '2026-09-30', debit: 1000, credit: 0 },
  { id: 4, entry_date: '2026-10-05', debit: 0, credit: 300 },
  { id: 3, entry_date: '2026-10-05', debit: 200, credit: 0 },
  { id: 2, entry_date: '2026-10-02', debit: 999, credit: 0, voided_at: '2026-10-03T00:00:00Z' }, // voided: ignored
  { id: 5, entry_date: '2026-11-01', debit: 50, credit: 0 }, // after the period
], '2026-10-01', '2026-10-31');
assert.equal(st.opening, -1000);
assert.deepEqual(st.lines.map(l => [l.id, l.balance]), [[3, -1200], [4, -900]], 'same day: by id');
assert.deepEqual([st.charges, st.credits, st.closing], [200, 300, -900]);
const rec = reconcile([
  { id: 'a', flight_date: '2026-10-01', student_id: 's', aircraft_id: 8, total_hours: '1.0' },
  { id: 'b', flight_date: '2026-10-02', student_id: 's', aircraft_id: 8, total_hours: 1.5 },
  { id: 'c', flight_date: '2026-10-03', student_id: 's', aircraft_id: 9, total_hours: 1 },
  { id: 'd', flight_date: '2026-10-03', student_id: null, aircraft_id: 9, total_hours: 0.5 },
  { id: 'e', flight_date: '2026-11-03', student_id: 's', aircraft_id: 9, total_hours: 2 },
], [
  { source_id: 'a', debit: 12980, hours: 1, voided_at: null },
  { source_id: 'b', debit: 6490, hours: 0.5, voided_at: null },
  { source_id: 'c', debit: 12980, hours: 1, voided_at: '2026-10-04T00:00:00Z' },
], [{ flight_record_id: 'b', hours: 1 }, { flight_record_id: 'e', hours: 2 }]);
assert.deepEqual(rec.map(r => r.status), ['CHARGED', 'PACKAGE_AND_CHARGED', 'NOT_CHARGED', 'NO_STUDENT', 'PACKAGE']);
assert.equal(rec[2].voidedCharges, 1, 'voided charge called out');
assert.deepEqual(reconcile(rec.slice(0, 3), [], [{ flight_record_id: 'b', hours: 1 }], '2026-10-02').map(r => r.status),
  ['BEFORE_BILLING', 'PACKAGE', 'NOT_CHARGED'], 'uncharged flights before the billing start date');
assert.deepEqual(reconTotals(rec, i => rec[i].flight_date.slice(0, 7)),
  [{ key: '2026-10', flights: 4, hours: 4, packageHours: 1, charged: 19470 }, { key: '2026-11', flights: 1, hours: 2, packageHours: 2, charged: 0 }]);

console.log('billing tests passed');

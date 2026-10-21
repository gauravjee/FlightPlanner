// lib/billing.test.ts
// Run: npx tsx lib/billing.test.ts
import assert from 'node:assert/strict';
import { categoryFor, priceHours, balanceOf, parseAmount, formatINR, splitHours, dueNow, monthlyPlan } from './billing';

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

console.log('billing tests passed');

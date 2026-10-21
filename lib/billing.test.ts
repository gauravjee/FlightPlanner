// lib/billing.test.ts
// Run: npx tsx lib/billing.test.ts
import assert from 'node:assert/strict';
import { categoryFor, priceHours, balanceOf, parseAmount, formatINR } from './billing';

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

console.log('billing tests passed');

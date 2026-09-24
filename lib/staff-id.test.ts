// lib/staff-id.test.ts — run: npx tsx lib/staff-id.test.ts
import assert from 'node:assert/strict';
import { isValidStaffPrefix, formatStaffId } from './staff-id';

assert.equal(formatStaffId('HFA', '2026-09-15', 1), 'HFAE26090000001');
assert.equal(formatStaffId('HF', '2026-09-01', 1), 'HFE260900000001');
assert.equal(formatStaffId('HFA', '2026-10-01', 2), 'HFAE26100000002');
assert.equal(formatStaffId('SUB', '2026-10-01', 1), 'SUBE26100000001');
assert.equal(formatStaffId('TEST', '2026-05-01', 1), 'TESTE2605000001');
assert.equal(formatStaffId('ABCDE', '2026-05-01', 99999), 'ABCDEE260599999');
assert.throws(() => formatStaffId('ABCDE', '2026-05-01', 100000)); // never longer than 15
for (const p of ['A', 'HF', 'HFA', 'TEST', 'ABCDE']) assert.equal(formatStaffId(p, '2027-01-31', 7).length, 15);

assert.ok(isValidStaffPrefix('HFA'));
assert.ok(isValidStaffPrefix('A1'));
assert.ok(!isValidStaffPrefix(''));
assert.ok(!isValidStaffPrefix('hfa'));
assert.ok(!isValidStaffPrefix('ABCDEF'));
assert.ok(!isValidStaffPrefix('H-A'));
assert.ok(!isValidStaffPrefix('SUB'));

console.log('staff-id: all checks passed');

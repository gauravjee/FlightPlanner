// lib/dgca.test.ts — run: npx tsx lib/dgca.test.ts
import assert from 'node:assert';
import { DGCA_PASS_MARK, deriveExamResult, isValidExamScore } from './dgca';

// The boundary is the whole point of the rule: 70 passes, 69 does not.
assert.strictEqual(deriveExamResult(DGCA_PASS_MARK), 'PASS');
assert.strictEqual(deriveExamResult(DGCA_PASS_MARK - 1), 'FAIL');
assert.strictEqual(deriveExamResult(69.9), 'FAIL');
assert.strictEqual(deriveExamResult(100), 'PASS');
assert.strictEqual(deriveExamResult(0), 'FAIL');

// No attempt recorded is not a fail — the requirement stays open on it.
assert.strictEqual(deriveExamResult(null), null);
assert.strictEqual(deriveExamResult(NaN), null);

assert.strictEqual(isValidExamScore(0), true);
assert.strictEqual(isValidExamScore(100), true);
assert.strictEqual(isValidExamScore(101), false);
assert.strictEqual(isValidExamScore(-1), false);
assert.strictEqual(isValidExamScore('80'), false);
assert.strictEqual(isValidExamScore(null), false);
assert.strictEqual(isValidExamScore(NaN), false);

console.log('dgca.test.ts: all assertions passed');

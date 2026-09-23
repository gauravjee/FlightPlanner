// lib/enrollment.test.ts — run: npx tsx lib/enrollment.test.ts
import assert from 'node:assert/strict';
import { ENROLLMENT_PREFIX_RE, parseStartNumber, formatEnrollmentId } from './enrollment';

assert.deepEqual(parseStartNumber('0001'), { start: 1, width: 4 });
assert.deepEqual(parseStartNumber(' 1001 '), { start: 1001, width: 4 });
assert.equal(parseStartNumber(''), null);
assert.equal(parseStartNumber('12a'), null);
assert.equal(parseStartNumber('-1'), null);
assert.equal(parseStartNumber('1234567890'), null);

assert.equal(formatEnrollmentId('HFA2026-27', 1, 4), 'HFA2026-270001');
assert.equal(formatEnrollmentId('HFA2026-27', 1001, 4), 'HFA2026-271001');
assert.equal(formatEnrollmentId('HFA2026-27', 10000, 4), 'HFA2026-2710000'); // never truncated

assert.ok(ENROLLMENT_PREFIX_RE.test('HFA2026-27'));
assert.ok(ENROLLMENT_PREFIX_RE.test('HFA/26'));
assert.ok(!ENROLLMENT_PREFIX_RE.test(''));
assert.ok(!ENROLLMENT_PREFIX_RE.test('-HFA'));
assert.ok(!ENROLLMENT_PREFIX_RE.test('HFA 2026'));

console.log('enrollment: all checks passed');

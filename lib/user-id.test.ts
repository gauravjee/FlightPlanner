// lib/user-id.test.ts — run: npx tsx lib/user-id.test.ts
import assert from 'node:assert/strict';
import { chosenUserIdProblem, exactIlike, isEmailIdentifier, USER_ID_RE } from './user-id';

const P = ['HFA2026-27', 'TEST2027-28'];
assert.equal(chosenUserIdProblem('ravi.k', P), null);
assert.equal(chosenUserIdProblem('Ravi_K-01', P), null);
assert.equal(chosenUserIdProblem('abcd', P), null);                        // 4 = shortest
assert.equal(chosenUserIdProblem('a'.repeat(20), P), null);                // 20 = longest
assert.match(chosenUserIdProblem('abc', P)!, /4 to 20/);
assert.match(chosenUserIdProblem('a'.repeat(21), P)!, /4 to 20/);
assert.match(chosenUserIdProblem('ravi k', P)!, /4 to 20/);                // no spaces
assert.match(chosenUserIdProblem('ravi/k', P)!, /4 to 20/);
assert.match(chosenUserIdProblem('ravi@x.in', P)!, /email/);
assert.match(chosenUserIdProblem('HFAE26090000001', P)!, /staff ID/);     // staff ID shapes
assert.match(chosenUserIdProblem('hfe260900000001', P)!, /staff ID/);
assert.match(chosenUserIdProblem('SUBE26100000002', P)!, /staff ID/);
assert.equal(chosenUserIdProblem('HFAE2609000001', P), null);             // 14 chars: not a staff ID
assert.match(chosenUserIdProblem('hfa2026-270001', P)!, /enrollment/);    // enrollment prefix, any case
assert.match(chosenUserIdProblem('TEST2027-281001', P)!, /enrollment/);
assert.match(chosenUserIdProblem('HFA2026-27x', P)!, /enrollment/);       // any suffix after a prefix
assert.equal(chosenUserIdProblem('HFA2026-2', P), null);                  // only part of a prefix is fine

assert.ok(isEmailIdentifier('a@b.c') && !isEmailIdentifier('ravi.k'));
assert.equal(exactIlike('ravi_k%\\'), 'ravi\\_k\\%\\\\');
assert.ok(USER_ID_RE.test('a.b_c-d'));

console.log('user-id: all checks passed');

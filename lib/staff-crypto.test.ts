// lib/staff-crypto.test.ts — run: npx tsx lib/staff-crypto.test.ts
// Uses a throwaway key; never the real STAFF_DATA_KEY.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import * as m from './staff-crypto'; // reads the key at call time, not import time

process.env.STAFF_DATA_KEY = randomBytes(32).toString('base64');

const docs = { pan: 'ABCDE1234F', aadhaar: '123412341234', passportNumber: 'Z1234567', passportIssueDate: '2020-01-02', passportIssuePlace: 'Chennai' };
const enc = m.encryptIdDocuments(docs);
assert.match(enc, /^v1:[^:]+:[^:]+:[^:]+$/);
assert.ok(!enc.includes('123412341234') && !enc.includes('ABCDE1234F')); // no plaintext
assert.deepEqual(m.decryptIdDocuments(enc), docs);
assert.notEqual(m.encryptIdDocuments(docs), enc); // fresh IV every time

// Tampering is detected.
const parts = enc.split(':');
const ct = Buffer.from(parts[3], 'base64'); ct[0] ^= 1;
assert.throws(() => m.decryptIdDocuments([parts[0], parts[1], parts[2], ct.toString('base64')].join(':')));
assert.throws(() => m.decryptIdDocuments('v2:a:b:c'));

// Wrong key can't read it.
process.env.STAFF_DATA_KEY = randomBytes(32).toString('base64');
assert.throws(() => m.decryptIdDocuments(enc));
// Bad key refused.
process.env.STAFF_DATA_KEY = randomBytes(16).toString('base64');
assert.throws(() => m.encryptIdDocuments(docs));

assert.ok(m.isValidPan('ABCDE1234F'));
assert.ok(!m.isValidPan('abcde1234f'));
assert.ok(m.isValidAadhaar('123412341234'));
assert.ok(!m.isValidAadhaar('1234 1234 1234'));
assert.equal(m.maskAadhaar('123412345678'), 'XXXX-XXXX-5678');
assert.equal(m.maskPan('ABCDE1234F'), 'XXXXX1234F');

console.log('staff-crypto: all checks passed');

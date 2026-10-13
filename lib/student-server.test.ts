// lib/student-server.test.ts — run: npx tsx lib/student-server.test.ts
// Uses a throwaway key; never the real STAFF_DATA_KEY.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { decryptIdDocuments } from './staff-crypto';
import { parseStudentDocs, maskStudentDocs, publicStudentRow, groundedRefusal, groundedCancelBefore } from './student-server';

process.env.STAFF_DATA_KEY = randomBytes(32).toString('base64');

// Aadhaar is normalised and validated; PAN is not a student field and is dropped.
const ok = parseStudentDocs({ aadhaar: '1234 5678-9012', passportNumber: 'z1234567', passportIssueDate: '2021-06-01', passportIssuePlace: ' Chennai ', pan: 'ABCDE1234F' });
assert.equal(ok.error, null);
assert.deepEqual(decryptIdDocuments(ok.enc!), { aadhaar: '123456789012', passportNumber: 'Z1234567', passportIssueDate: '2021-06-01', passportIssuePlace: 'Chennai' });
assert.equal(parseStudentDocs({ aadhaar: '123' }).error, 'Aadhaar must be 12 digits.');
assert.equal(parseStudentDocs({ passportIssueDate: '01/06/2021' }).error, 'Passport date of issue must be a date.');
assert.deepEqual(parseStudentDocs({}), { enc: null, error: null }); // all blank = clear

assert.deepEqual(maskStudentDocs(ok.enc), { aadhaar: 'XXXX-XXXX-9012', passport: 'XXXX4567' });
assert.equal(maskStudentDocs(null), null);
assert.deepEqual(maskStudentDocs('v1:bad:bad:bad'), { aadhaar: 'unreadable', passport: 'unreadable' });

// The encrypted blob never leaves the server; only admins get the masks.
const row = { id: 's1', name: 'A', id_documents_enc: ok.enc };
assert.deepEqual(publicStudentRow(row, false), { id: 's1', name: 'A' });
assert.deepEqual(publicStudentRow(row, true), { id: 's1', name: 'A', documents_masked: { aadhaar: 'XXXX-XXXX-9012', passport: 'XXXX4567' } });

// Grounded until 20 Oct: flights on 20 Oct IST are refused, 21 Oct IST allowed (UTC 18:30 on the 20th is 00:00 IST on the 21st).
assert.match(groundedRefusal('2026-10-20', '2026-10-20T12:00:00Z')!, /grounded until 2026-10-20/);
assert.equal(groundedRefusal('2026-10-20', '2026-10-20T18:30:00Z'), null);
assert.match(groundedRefusal('2026-10-20')!, /grounded/); // no start time: refuse
assert.equal(groundedCancelBefore('2026-10-20'), '2026-10-20T18:30:00.000Z');

console.log('student-server: all checks passed');

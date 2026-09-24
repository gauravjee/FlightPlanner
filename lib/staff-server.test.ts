// lib/staff-server.test.ts — run: npx tsx lib/staff-server.test.ts
// Uses a throwaway key; never the real STAFF_DATA_KEY.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { parseStaffBody, toStaffMember, staffDbError } from './staff-server';
process.env.STAFF_DATA_KEY = randomBytes(32).toString('base64');
const r = parseStaffBody({ name: ' A ', joiningDate: '2026-05-01', isSub: true, designation: '', idDocuments: { pan: 'abcde1234f', aadhaar: '1234 5678 9012' } }, true);
assert.equal(r.error, null); assert.equal(r.data.name, 'A'); assert.equal(r.data.is_sub, true); assert.equal(r.data.designation, null);
assert.match(r.data.id_documents_enc as string, /^v1:/);
const row = toStaffMember({ id: 1, staff_id: 'TESTE2605000001', is_sub: false, name: 'A', joining_date: '2026-05-01', id_documents_enc: r.data.id_documents_enc, users: { role: 'admin' }, instructors: [{ id: 6 }], ames: [] });
assert.deepEqual(row.documentsMasked, { pan: 'XXXXX1234F', aadhaar: 'XXXX-XXXX-9012', passport: false });
assert.equal(row.loginRole, 'admin'); assert.equal(row.instructorId, 6); assert.equal(row.ameId, null);
assert.equal(parseStaffBody({ joiningDate: '2026-05-01' }, true).error, 'Name is required.');
assert.equal(parseStaffBody({ name: 'A' }, true).error, 'Joining date is required.');
assert.equal(parseStaffBody({ name: '' }, false).error, 'Name is required.');
assert.equal(parseStaffBody({ joiningDate: '' }, false).error, 'Joining date is required.');
assert.equal(parseStaffBody({ dateOfBirth: '01/01/1990' }, false).error, 'dateOfBirth must be a date.');
assert.equal(parseStaffBody({ employmentType: 'X' }, false).error, 'Employment type must be Permanent or Contract.');
assert.equal(parseStaffBody({ idDocuments: { aadhaar: '123' } }, false).error, 'Aadhaar must be 12 digits.');
assert.equal(parseStaffBody({ idDocuments: { pan: '' } }, false).data.id_documents_enc, null); // all cleared
assert.equal(parseStaffBody({ isSub: true, name: 'B' }, false).data.is_sub, undefined);
assert.equal(staffDbError({ code: 'P0001', message: 'Set the staff ID prefix in Admin Setup first.' }, 'x'), 'Set the staff ID prefix in Admin Setup first.');
assert.equal(staffDbError({ code: '23514', message: 'new row violates check constraint "staff_members_dates"' }, 'x'), "The last working day can't be before the joining date.");
console.log('staff-server: all checks passed');

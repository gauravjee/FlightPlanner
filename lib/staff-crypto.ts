// lib/staff-crypto.ts — SERVER ONLY (reads STAFF_DATA_KEY).
// Staff ID documents (PAN, Aadhaar, passport) are stored encrypted in
// staff_members.id_documents_enc (operator decision 2026-09-24; design doc
// §9a item 9). AES-256-GCM (NIST FIPS 197 + SP 800-38D) with a fresh random
// 96-bit IV per value; the auth tag makes any tampering fail to decrypt.
// Stored as 'v1:<iv>:<tag>:<ciphertext>' (base64 parts). 'v1' = key version,
// so the key can be rotated later (add STAFF_DATA_KEY_V2, re-encrypt).
// Key: STAFF_DATA_KEY = 32 random bytes, base64 — in .env.local (git-ignored)
// and Vercel, never in the DB, logs or git. Lose the key = lose the data.
// ponytail: no AAD binding ciphertext to its row (swapping values between rows
// needs DB write access anyway); add the staff id as AAD if that ever matters.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type IdDocuments = {
  pan?: string;
  aadhaar?: string;
  passportNumber?: string;
  passportIssueDate?: string; // 'YYYY-MM-DD'
  passportIssuePlace?: string;
};

function key(): Buffer {
  const k = Buffer.from(process.env.STAFF_DATA_KEY ?? '', 'base64');
  if (k.length !== 32) throw new Error('STAFF_DATA_KEY must be 32 random bytes, base64-encoded.');
  return k;
}

export function encryptIdDocuments(docs: IdDocuments): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(docs), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

export function decryptIdDocuments(value: string): IdDocuments {
  const [version, iv, tag, ct] = value.split(':');
  if (version !== 'v1' || !iv || !tag || !ct) throw new Error('Unrecognised encrypted value.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8'));
}

export const isValidPan = (v: string) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v);
export const isValidAadhaar = (v: string) => /^\d{12}$/.test(v);

/** For lists: 'XXXX-XXXX-1234'. */
export const maskAadhaar = (v: string) => 'XXXX-XXXX-' + v.slice(-4);
/** For lists: 'XXXXX1234X' style — first 5 hidden. */
export const maskPan = (v: string) => 'XXXXX' + v.slice(5);

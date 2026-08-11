// lib/password.ts
// Shared secure password generator for server-created accounts. Used by
// both /api/admin/users (staff accounts) and /api/students (student
// accounts, created together with their training profile) so the two
// routes don't maintain their own copies of the same character set.

import crypto from 'crypto';

export function generatePassword(): string {
  // Mixed case + digits, no ambiguous characters (I, l, 0, O) — matches the
  // scheme already used by scripts/setup-auth.ts.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

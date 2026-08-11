// scripts/test-auth.ts
// Local sanity check for bcrypt hash/compare — not tied to any real
// account. Uses an obvious placeholder value so it can't be mistaken for a
// live credential if this file is ever read out of context.
import bcrypt from 'bcryptjs';

async function test() {
  const password = 'not-a-real-password-just-a-bcrypt-smoke-test';
  const hash = await bcrypt.hash(password, 10);
  console.log('Password:', password);
  console.log('Hash:', hash);

  const isValid = await bcrypt.compare(password, hash);
  console.log('Verify works:', isValid);
}

test();

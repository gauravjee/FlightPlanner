import bcrypt from 'bcryptjs';

async function test() {
  const password = 'FlightPro@2024';
  const hash = await bcrypt.hash(password, 10);
  console.log('Password:', password);
  console.log('Hash:', hash);
  
  const isValid = await bcrypt.compare(password, hash);
  console.log('Verify works:', isValid);
}

test();
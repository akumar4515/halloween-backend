import bcrypt from 'bcrypt';
import pool from '../config/db.js';
import dotenv from 'dotenv';

dotenv.config();

// Get password and email from command line
const inputPassword = process.argv[2];
const email = process.argv[3] || 'amankumar22200245@gmail.com';

// Common passwords to test
const commonPasswords = [
  'password',
  'admin',
  'admin123',
  'password123',
  '123456',
  '12345678',
  'qwerty',
  'abc123',
  'letmein',
  'welcome',
  'monkey',
  '1234567',
  'sunshine',
  'princess',
  'azerty',
  'trustno1',
  '000000',
  'amankumar22200245',
  'amankumar',
  'kumar',
  'flove.admin@00',
];

async function getHashFromDB() {
  try {
    const [admins] = await pool.query(
      'SELECT password FROM admins WHERE email = ?',
      [email]
    );
    
    if (admins.length === 0) {
      console.error(`No admin found with email: ${email}`);
      process.exit(1);
    }
    
    return admins[0].password;
  } catch (err) {
    console.error('Error fetching hash from database:', err);
    process.exit(1);
  }
}

async function checkPassword(password, hash) {
  try {
    const match = await bcrypt.compare(password, hash);
    return match;
  } catch (err) {
    console.error('Error comparing password:', err);
    return false;
  }
}

async function main() {
  // Get current hash from database
  const hash = await getHashFromDB();
  console.log(`Using hash from database for: ${email}\n`);
  
  if (inputPassword) {
    // Test single password
    const match = await checkPassword(inputPassword, hash);
    console.log(`Testing password: "${inputPassword}"`);
    console.log(`Match: ${match ? '✅ YES' : '❌ NO'}\n`);
  } else {
    // Test common passwords
    console.log('Testing common passwords against the current hash...\n');
    let found = false;
    
    for (const pwd of commonPasswords) {
      const match = await checkPassword(pwd, hash);
      if (match) {
        console.log(`✅ FOUND! Password is: "${pwd}"`);
        found = true;
        break;
      }
    }
    
    if (!found) {
      console.log('❌ None of the common passwords matched.');
      console.log('\nTo test a specific password, run:');
      console.log('node scripts/test-password.js <your-password> [email]\n');
    }
  }
  
  process.exit(0);
}

main();


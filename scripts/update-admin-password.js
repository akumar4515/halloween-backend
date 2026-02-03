import bcrypt from 'bcrypt';
import pool from '../config/db.js';
import dotenv from 'dotenv';

dotenv.config();

// Get password from command line argument
const password = process.argv[2];
const email = process.argv[3] || 'amankumar22200245@gmail.com';

if (!password) {
  console.error('Usage: node scripts/update-admin-password.js <password> [email]');
  console.error('Example: node scripts/update-admin-password.js mypassword123');
  process.exit(1);
}

async function updatePassword() {
  try {
    // Generate hash
    const hash = await bcrypt.hash(password, 10);
    
    // Update in database
    const [result] = await pool.query(
      'UPDATE admins SET password = ? WHERE email = ?',
      [hash, email]
    );
    
    if (result.affectedRows === 0) {
      console.error(`No admin found with email: ${email}`);
      process.exit(1);
    }
    
    console.log('\n========================================');
    console.log('Password Updated Successfully!');
    console.log('========================================');
    console.log('Email:', email);
    console.log('New Password:', password);
    console.log('Hash:', hash);
    console.log('========================================\n');
    
    process.exit(0);
  } catch (err) {
    console.error('Error updating password:', err);
    process.exit(1);
  }
}

updatePassword();


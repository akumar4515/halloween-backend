import bcrypt from 'bcrypt';
import pool from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

const ADMIN_USERNAME = 'flovex_admin';
const ADMIN_PASSWORD = 'flovex.admin@00';
const ADMIN_EMAIL = 'admin@flovex.com';

async function setupAdmin() {
  try {
    console.log('Setting up admin user...');

    // Hash the password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, saltRounds);
    console.log('Password hashed successfully');

    // Check if admin already exists
    const [existing] = await pool.execute(
      'SELECT id FROM admin_users WHERE username = ?',
      [ADMIN_USERNAME]
    );

    if (existing.length > 0) {
      // Update existing admin
      await pool.execute(
        'UPDATE admin_users SET password_hash = ?, email = ?, updated_at = NOW() WHERE username = ?',
        [passwordHash, ADMIN_EMAIL, ADMIN_USERNAME]
      );
      console.log('Admin user updated successfully');
    } else {
      // Insert new admin
      await pool.execute(
        'INSERT INTO admin_users (username, email, password_hash, is_active) VALUES (?, ?, ?, ?)',
        [ADMIN_USERNAME, ADMIN_EMAIL, passwordHash, true]
      );
      console.log('Admin user created successfully');
    }

    console.log('\nAdmin credentials:');
    console.log(`Username: ${ADMIN_USERNAME}`);
    console.log(`Password: ${ADMIN_PASSWORD}`);
    console.log(`Email: ${ADMIN_EMAIL}`);

    process.exit(0);
  } catch (error) {
    console.error('Error setting up admin:', error);
    process.exit(1);
  }
}

setupAdmin();

import bcrypt from 'bcrypt';

// Get password from command line argument or use default
const password = process.argv[2] || 'admin123';

// Generate hash with 10 salt rounds (matching the existing hash format)
bcrypt.hash(password, 10, (err, hash) => {
  if (err) {
    console.error('Error generating hash:', err);
    process.exit(1);
  }
  
  console.log('\n========================================');
  console.log('Password Hash Generator');
  console.log('========================================');
  console.log('Password:', password);
  console.log('Hash:', hash);
  console.log('\nSQL Update Statement:');
  console.log(`UPDATE admins SET password = '${hash}' WHERE email = 'amankumar22200245@gmail.com';`);
  console.log('========================================\n');
});


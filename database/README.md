# Database Setup

## Admin Table Setup

1. Run the SQL file to create admin tables:
   ```bash
   mysql -u root -p flovex < database/admin.sql
   ```

2. Or execute the SQL directly in MySQL:
   ```sql
   USE flovex;
   SOURCE database/admin.sql;
   ```

## Default Admin Credentials

- **Username:** `flovex_admin`
- **Password:** `flovex.admin@00`
- **Email:** `admin@flovex.com`

**Important:** The password in the SQL file is a placeholder. You need to hash it using bcrypt before inserting it into the database.

## Password Hashing

To hash the password properly, you can use Node.js:

```javascript
const bcrypt = require('bcrypt');
const password = 'flovex.admin@00';
const hash = await bcrypt.hash(password, 10);
console.log(hash);
```

Then update the INSERT statement in `admin.sql` with the hashed password.

## Alternative: Quick Setup Script

You can also create a setup script to hash and insert the password automatically.

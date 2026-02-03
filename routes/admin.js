import { Router } from 'express';
import bcrypt from 'bcrypt';
import pool from '../config/db.js';

const router = Router();

// POST /admin/auth - Admin authentication
router.post('/auth', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required' 
      });
    }

    // Find admin by email
    const [admins] = await pool.query(
      'SELECT id, email, password, role, is_active FROM admins WHERE email = ?',
      [email]
    );

    if (admins.length === 0) {
      return res.status(401).json({ 
        error: 'Invalid email or password' 
      });
    }

    const admin = admins[0];

    // Check if admin is active
    if (!admin.is_active) {
      return res.status(403).json({ 
        error: 'Account is deactivated' 
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, admin.password);

    if (!isPasswordValid) {
      return res.status(401).json({ 
        error: 'Invalid email or password' 
      });
    }

    // Return success response (you can add JWT token here later if needed)
    res.json({
      success: true,
      message: 'Authentication successful',
      admin: {
        id: admin.id,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;


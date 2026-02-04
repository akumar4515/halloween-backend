import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Initialize Google OAuth client
const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || `${process.env.BASE_URL || 'http://localhost:3000'}/auth/google/callback`
);

// GET /auth/google - Initiate Google OAuth flow
router.get('/google', (req, res) => {
  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ],
    prompt: 'consent'
  });
  
  res.redirect(authUrl);
});

// GET /auth/google/callback - Handle Google OAuth callback
router.get('/google/callback', async (req, res, next) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    // Exchange code for tokens
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    if (!tokens.id_token) {
      return res.status(400).json({ error: 'ID token not received from Google' });
    }

    // Get user info from Google
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    if (!email) {
      return res.status(400).json({ error: 'Email not provided by Google' });
    }

    // Check if user exists
    let [users] = await pool.query(
      'SELECT * FROM users WHERE email = ? OR google_id = ?',
      [email, googleId]
    );

    let user;
    if (users.length > 0) {
      // Update existing user
      user = users[0];
      await pool.query(
        `UPDATE users 
         SET google_id = ?, name = ?, picture = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [googleId, name, picture, user.id]
      );
      user.google_id = googleId;
      user.name = name;
      user.picture = picture;
    } else {
      // Create new user
      const [result] = await pool.query(
        `INSERT INTO users (google_id, email, name, picture, provider) 
         VALUES (?, ?, ?, ?, 'google')`,
        [googleId, email, name, picture]
      );
      [users] = await pool.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
      user = users[0];
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        name: user.name 
      },
      process.env.JWT_SECRET || 'your-secret-key-change-this',
      { expiresIn: '7d' }
    );

    // Redirect to frontend with token (or return JSON)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/auth/callback?token=${token}&success=true`);
  } catch (err) {
    next(err);
  }
});

// POST /auth/google/verify - Verify Google ID token (alternative method for mobile/web apps)
router.post('/google/verify', async (req, res, next) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'ID token is required' });
    }

    // Verify the token
    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    if (!email) {
      return res.status(400).json({ error: 'Email not provided by Google' });
    }

    // Check if user exists
    let [users] = await pool.query(
      'SELECT * FROM users WHERE email = ? OR google_id = ?',
      [email, googleId]
    );

    let user;
    if (users.length > 0) {
      // Update existing user
      user = users[0];
      await pool.query(
        `UPDATE users 
         SET google_id = ?, name = ?, picture = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [googleId, name, picture, user.id]
      );
      user.google_id = googleId;
      user.name = name;
      user.picture = picture;
    } else {
      // Create new user
      const [result] = await pool.query(
        `INSERT INTO users (google_id, email, name, picture, provider) 
         VALUES (?, ?, ?, ?, 'google')`,
        [googleId, email, name, picture]
      );
      [users] = await pool.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
      user = users[0];
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        name: user.name 
      },
      process.env.JWT_SECRET || 'your-secret-key-change-this',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /auth/me - Get current user (protected route)
router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const [users] = await pool.query(
      'SELECT id, email, name, picture, provider, subscription, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    
    res.json({
      success: true,
      user: users[0]
    });
  } catch (err) {
    next(err);
  }
});

export default router;


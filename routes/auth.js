import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import pool from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const BACKEND_URL = process.env.BACKEND_URL || process.env.BASE_URL || 'http://localhost:5000';
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || `${BACKEND_URL}/api/auth/google/callback`;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

const oauthClient = new OAuth2Client(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

const signToken = (user) =>
  jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

const normalizeUser = (row) => ({
  id: row.id,
  email: row.email,
  name: row.name,
  picture: row.picture,
  provider: row.provider,
  subscription: row.subscription,
  created_at: row.created_at,
});

const upsertGoogleUser = async ({ googleId, email, name, picture }) => {
  const [existing] = await pool.query(
    'SELECT id FROM users WHERE google_id = ? OR email = ? LIMIT 1',
    [googleId, email]
  );

  if (existing.length > 0) {
    const userId = existing[0].id;
    await pool.query(
      `UPDATE users
       SET google_id = ?, email = ?, name = ?, picture = ?, provider = 'google', is_active = 1
       WHERE id = ?`,
      [googleId, email, name, picture, userId]
    );
    const [rows] = await pool.query(
      'SELECT id, email, name, picture, provider, subscription, created_at FROM users WHERE id = ?',
      [userId]
    );
    return rows[0];
  }

  const [result] = await pool.query(
    `INSERT INTO users (google_id, email, name, picture, provider, is_active)
     VALUES (?, ?, ?, ?, 'google', 1)`,
    [googleId, email, name, picture]
  );

  const [rows] = await pool.query(
    'SELECT id, email, name, picture, provider, subscription, created_at FROM users WHERE id = ?',
    [result.insertId]
  );
  return rows[0];
};

// GET /api/auth/google - Redirect to Google OAuth consent
router.get('/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ error: 'Google OAuth is not configured' });
  }

  const authUrl = oauthClient.generateAuthUrl({
    access_type: 'offline',
    prompt: 'select_account',
    scope: ['openid', 'email', 'profile'],
  });

  res.redirect(authUrl);
});

// GET /api/auth/google/callback - Handle OAuth callback
router.get('/google/callback', async (req, res, next) => {
  try {
    if (req.query.error) {
      const error = encodeURIComponent(req.query.error);
      return res.redirect(`${FRONTEND_URL}/auth/callback?success=false&error=${error}`);
    }

    const code = req.query.code;
    if (!code) {
      return res.redirect(
        `${FRONTEND_URL}/auth/callback?success=false&error=missing_code`
      );
    }

    const { tokens } = await oauthClient.getToken(code);
    const idToken = tokens.id_token;

    if (!idToken) {
      return res.redirect(
        `${FRONTEND_URL}/auth/callback?success=false&error=missing_id_token`
      );
    }

    const ticket = await oauthClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.redirect(
        `${FRONTEND_URL}/auth/callback?success=false&error=missing_profile`
      );
    }

    const user = await upsertGoogleUser({
      googleId: payload.sub,
      email: payload.email,
      name: payload.name || payload.given_name || 'User',
      picture: payload.picture || '',
    });

    const token = signToken(user);
    const encodedToken = encodeURIComponent(token);
    res.redirect(`${FRONTEND_URL}/auth/callback?success=true&token=${encodedToken}`);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/google/verify - Verify Google ID token from client
router.post('/google/verify', async (req, res, next) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required' });
    }

    const ticket = await oauthClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(400).json({ error: 'Invalid Google token payload' });
    }

    const user = await upsertGoogleUser({
      googleId: payload.sub,
      email: payload.email,
      name: payload.name || payload.given_name || 'User',
      picture: payload.picture || '',
    });

    const token = signToken(user);
    res.json({
      success: true,
      token,
      user: normalizeUser(user),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me - Get current user
router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, email, name, picture, provider, subscription, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: normalizeUser(rows[0]),
    });
  } catch (err) {
    next(err);
  }
});

export default router;

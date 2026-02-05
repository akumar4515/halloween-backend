import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import pool from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  FRONTEND_URL,
  JWT_SECRET,
} = process.env;

const getOAuthClient = () => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return null;
  }
  return new OAuth2Client(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback'
  );
};

const signToken = (userId) =>
  jwt.sign({ id: userId }, JWT_SECRET || 'your-secret-key-change-this', {
    expiresIn: '7d',
  });

const buildFrontendRedirect = (params) => {
  const baseUrl = FRONTEND_URL || 'http://localhost:3000';
  const url = new URL('/auth/callback', baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
};

const upsertGoogleUser = async ({ id, email, name }) => {
  if (!email) {
    throw new Error('Google account did not return an email');
  }

  const [byGoogleId] = await pool.query(
    'SELECT id, email, name, subscription, is_active FROM users WHERE google_id = ?',
    [id]
  );

  if (byGoogleId.length > 0) {
    const existing = byGoogleId[0];
    if (!existing.is_active) {
      throw new Error('Account is deactivated');
    }
    await pool.query(
      'UPDATE users SET email = ?, name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [email, name, existing.id]
    );
    const [updated] = await pool.query(
      'SELECT id, email, name, subscription, is_active FROM users WHERE id = ?',
      [existing.id]
    );
    return updated[0];
  }

  const [byEmail] = await pool.query(
    'SELECT id, google_id, is_active FROM users WHERE email = ?',
    [email]
  );

  if (byEmail.length > 0) {
    const existing = byEmail[0];
    if (!existing.is_active) {
      throw new Error('Account is deactivated');
    }
    await pool.query(
      'UPDATE users SET google_id = ?, name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id, name, existing.id]
    );
    const [updated] = await pool.query(
      'SELECT id, email, name, subscription, is_active FROM users WHERE id = ?',
      [existing.id]
    );
    return updated[0];
  }

  const [result] = await pool.query(
    'INSERT INTO users (google_id, email, name, provider) VALUES (?, ?, ?, ?)',
    [id, email, name, 'google']
  );

  const [created] = await pool.query(
    'SELECT id, email, name, subscription, is_active FROM users WHERE id = ?',
    [result.insertId]
  );

  return created[0];
};

router.get('/google', (req, res) => {
  const oauthClient = getOAuthClient();
  if (!oauthClient) {
    return res.status(500).json({ error: 'Google OAuth is not configured' });
  }

  const url = oauthClient.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['profile', 'email'],
  });

  return res.redirect(url);
});

router.get('/google/callback', async (req, res) => {
  const oauthClient = getOAuthClient();
  if (!oauthClient) {
    return res.redirect(buildFrontendRedirect({ error: 'OAuth not configured' }));
  }

  if (req.query.error) {
    return res.redirect(buildFrontendRedirect({ error: req.query.error }));
  }

  const { code } = req.query;
  if (!code) {
    return res.redirect(buildFrontendRedirect({ error: 'Missing code' }));
  }

  try {
    const { tokens } = await oauthClient.getToken(code);
    oauthClient.setCredentials(tokens);

    const { data } = await oauthClient.request({
      url: 'https://www.googleapis.com/oauth2/v2/userinfo',
    });

    const user = await upsertGoogleUser({
      id: data.id,
      email: data.email,
      name: data.name,
    });

    const token = signToken(user.id);
    return res.redirect(buildFrontendRedirect({ token }));
  } catch (error) {
    const message = error?.message || 'Google authentication failed';
    return res.redirect(buildFrontendRedirect({ error: message }));
  }
});

router.post('/google/verify', async (req, res, next) => {
  try {
    const oauthClient = getOAuthClient();
    if (!oauthClient) {
      return res.status(500).json({ error: 'Google OAuth is not configured' });
    }

    const credential = req.body?.credential || req.body?.id_token;
    if (!credential) {
      return res.status(400).json({ error: 'credential is required' });
    }

    const ticket = await oauthClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const user = await upsertGoogleUser({
      id: payload.sub,
      email: payload.email,
      name: payload.name,
    });

    const token = signToken(user.id);
    res.json({
      success: true,
      token,
      user,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

export default router;

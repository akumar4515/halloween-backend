import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

// Middleware to authenticate JWT token
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-this');
      
      // Get user from database
      const [users] = await pool.query(
        'SELECT id, email, name, picture, subscription, is_active FROM users WHERE id = ?',
        [decoded.id]
      );
      
      if (users.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = users[0];

      if (!user.is_active) {
        return res.status(403).json({ error: 'Account is deactivated' });
      }

      // Attach user to request object
      req.user = user;
      next();
    } catch (jwtError) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (err) {
    next(err);
  }
};


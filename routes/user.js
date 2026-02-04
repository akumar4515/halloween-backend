import { Router } from 'express';
import pool from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// ==================== WATCH HISTORY ROUTES ====================

// POST /user/watch-history - Add or update watch history
router.post('/watch-history', async (req, res, next) => {
  try {
    const { video_id, progress_seconds = 0, completed = false } = req.body;
    const userId = req.user.id;

    if (!video_id) {
      return res.status(400).json({ error: 'video_id is required' });
    }

    // Check if video exists
    const [videos] = await pool.query('SELECT id FROM videos WHERE id = ?', [video_id]);
    if (videos.length === 0) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Check if watch history already exists
    const [existing] = await pool.query(
      'SELECT * FROM watch_history WHERE user_id = ? AND video_id = ?',
      [userId, video_id]
    );

    if (existing.length > 0) {
      // Update existing record
      await pool.query(
        `UPDATE watch_history 
         SET watched_at = CURRENT_TIMESTAMP, 
             progress_seconds = ?, 
             completed = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND video_id = ?`,
        [progress_seconds, completed ? 1 : 0, userId, video_id]
      );

      const [updated] = await pool.query(
        'SELECT * FROM watch_history WHERE user_id = ? AND video_id = ?',
        [userId, video_id]
      );

      return res.json({
        success: true,
        message: 'Watch history updated',
        data: updated[0]
      });
    } else {
      // Create new record
      const [result] = await pool.query(
        `INSERT INTO watch_history (user_id, video_id, progress_seconds, completed) 
         VALUES (?, ?, ?, ?)`,
        [userId, video_id, progress_seconds, completed ? 1 : 0]
      );

      const [newRecord] = await pool.query(
        'SELECT * FROM watch_history WHERE id = ?',
        [result.insertId]
      );

      return res.status(201).json({
        success: true,
        message: 'Watch history added',
        data: newRecord[0]
      });
    }
  } catch (err) {
    next(err);
  }
});

// GET /user/watch-history - Get user's watch history
router.get('/watch-history', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    // Get watch history with video details
    const [rows] = await pool.query(
      `SELECT 
        wh.*,
        v.id as video_id,
        v.title,
        v.slug,
        v.description,
        v.thumbnail_url,
        v.video_url,
        v.duration,
        v.category,
        v.is_premium,
        c.id as channel_id,
        c.name as channel_name,
        c.slug as channel_slug,
        c.profile_pic as channel_profile_pic
      FROM watch_history wh
      INNER JOIN videos v ON wh.video_id = v.id
      LEFT JOIN channels c ON v.channel_id = c.id
      WHERE wh.user_id = ?
      ORDER BY wh.watched_at DESC
      LIMIT ? OFFSET ?`,
      [userId, parseInt(limit, 10), offset]
    );

    // Get total count
    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM watch_history WHERE user_id = ?',
      [userId]
    );

    // Format response
    const formatted = rows.map(row => ({
      id: row.id,
      video: {
        id: row.video_id,
        title: row.title,
        slug: row.slug,
        description: row.description,
        thumbnail_url: row.thumbnail_url,
        video_url: row.video_url,
        duration: row.duration,
        category: row.category,
        is_premium: row.is_premium,
        channel: row.channel_id ? {
          id: row.channel_id,
          name: row.channel_name,
          slug: row.channel_slug,
          profile_pic: row.channel_profile_pic
        } : null
      },
      progress_seconds: row.progress_seconds,
      completed: row.completed === 1,
      watched_at: row.watched_at,
      created_at: row.created_at
    }));

    res.json({
      success: true,
      data: formatted,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / parseInt(limit, 10))
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /user/watch-history/:video_id - Get watch history for specific video
router.get('/watch-history/:video_id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const videoId = req.params.video_id;

    const [rows] = await pool.query(
      `SELECT 
        wh.*,
        v.title,
        v.slug,
        v.thumbnail_url
      FROM watch_history wh
      INNER JOIN videos v ON wh.video_id = v.id
      WHERE wh.user_id = ? AND wh.video_id = ?`,
      [userId, videoId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Watch history not found' });
    }

    res.json({
      success: true,
      data: {
        ...rows[0],
        completed: rows[0].completed === 1
      }
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /user/watch-history/:video_id - Remove video from watch history
router.delete('/watch-history/:video_id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const videoId = req.params.video_id;

    const [result] = await pool.query(
      'DELETE FROM watch_history WHERE user_id = ? AND video_id = ?',
      [userId, videoId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Watch history not found' });
    }

    res.json({
      success: true,
      message: 'Watch history removed'
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /user/watch-history - Clear all watch history
router.delete('/watch-history', async (req, res, next) => {
  try {
    const userId = req.user.id;

    await pool.query(
      'DELETE FROM watch_history WHERE user_id = ?',
      [userId]
    );

    res.json({
      success: true,
      message: 'All watch history cleared'
    });
  } catch (err) {
    next(err);
  }
});

// ==================== FOLLOW/UNFOLLOW ROUTES ====================

// POST /user/follow - Follow an actor or channel
router.post('/follow', async (req, res, next) => {
  try {
    const { type, id } = req.body;
    const userId = req.user.id;

    if (!type || !id) {
      return res.status(400).json({ error: 'type and id are required' });
    }

    if (!['actor', 'channel'].includes(type)) {
      return res.status(400).json({ error: 'type must be "actor" or "channel"' });
    }

    // Check if actor/channel exists
    const tableName = type === 'actor' ? 'actors' : 'channels';
    const [entities] = await pool.query(`SELECT id FROM ${tableName} WHERE id = ?`, [id]);
    
    if (entities.length === 0) {
      return res.status(404).json({ error: `${type} not found` });
    }

    // Check if already following
    const [existing] = await pool.query(
      'SELECT * FROM following WHERE user_id = ? AND followable_type = ? AND followable_id = ?',
      [userId, type, id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: `Already following this ${type}` });
    }

    // Add to following
    const [result] = await pool.query(
      'INSERT INTO following (user_id, followable_type, followable_id) VALUES (?, ?, ?)',
      [userId, type, id]
    );

    const [newFollow] = await pool.query(
      'SELECT * FROM following WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: `Successfully followed ${type}`,
      data: newFollow[0]
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Already following this item' });
    }
    next(err);
  }
});

// DELETE /user/follow - Unfollow an actor or channel
router.delete('/follow', async (req, res, next) => {
  try {
    const { type, id } = req.body;
    const userId = req.user.id;

    if (!type || !id) {
      return res.status(400).json({ error: 'type and id are required' });
    }

    if (!['actor', 'channel'].includes(type)) {
      return res.status(400).json({ error: 'type must be "actor" or "channel"' });
    }

    const [result] = await pool.query(
      'DELETE FROM following WHERE user_id = ? AND followable_type = ? AND followable_id = ?',
      [userId, type, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: `Not following this ${type}` });
    }

    res.json({
      success: true,
      message: `Successfully unfollowed ${type}`
    });
  } catch (err) {
    next(err);
  }
});

// GET /user/following - Get all followed actors and channels
router.get('/following', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { type, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let whereClause = 'WHERE f.user_id = ?';
    let queryParams = [userId];

    if (type && ['actor', 'channel'].includes(type)) {
      whereClause += ' AND f.followable_type = ?';
      queryParams.push(type);
    }

    // Get following records
    const [rows] = await pool.query(
      `SELECT 
        f.*,
        CASE 
          WHEN f.followable_type = 'actor' THEN a.name
          WHEN f.followable_type = 'channel' THEN c.name
        END as name,
        CASE 
          WHEN f.followable_type = 'actor' THEN a.slug
          WHEN f.followable_type = 'channel' THEN c.slug
        END as slug,
        CASE 
          WHEN f.followable_type = 'actor' THEN a.profile_pic
          WHEN f.followable_type = 'channel' THEN c.profile_pic
        END as profile_pic,
        CASE 
          WHEN f.followable_type = 'actor' THEN a.bio
          WHEN f.followable_type = 'channel' THEN c.description
        END as description
      FROM following f
      LEFT JOIN actors a ON f.followable_type = 'actor' AND f.followable_id = a.id
      LEFT JOIN channels c ON f.followable_type = 'channel' AND f.followable_id = c.id
      ${whereClause}
      ORDER BY f.created_at DESC
      LIMIT ? OFFSET ?`,
      [...queryParams, parseInt(limit, 10), offset]
    );

    // Get total count
    let countWhere = 'WHERE user_id = ?';
    let countParams = [userId];
    if (type && ['actor', 'channel'].includes(type)) {
      countWhere += ' AND followable_type = ?';
      countParams.push(type);
    }
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM following ${countWhere}`,
      countParams
    );

    // Format response
    const formatted = rows.map(row => ({
      id: row.id,
      type: row.followable_type,
      item: {
        id: row.followable_id,
        name: row.name,
        slug: row.slug,
        profile_pic: row.profile_pic,
        description: row.description
      },
      followed_at: row.created_at
    }));

    res.json({
      success: true,
      data: formatted,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / parseInt(limit, 10))
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /user/following/:type/:id - Check if user is following a specific actor/channel
router.get('/following/:type/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { type, id } = req.params;

    if (!['actor', 'channel'].includes(type)) {
      return res.status(400).json({ error: 'type must be "actor" or "channel"' });
    }

    const [rows] = await pool.query(
      'SELECT * FROM following WHERE user_id = ? AND followable_type = ? AND followable_id = ?',
      [userId, type, id]
    );

    res.json({
      success: true,
      is_following: rows.length > 0,
      data: rows.length > 0 ? rows[0] : null
    });
  } catch (err) {
    next(err);
  }
});

export default router;


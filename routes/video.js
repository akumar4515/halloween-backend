import { Router } from 'express';
import pool from '../config/db.js';

const router = Router();

// GET /api/videos - fetch all videos with channel and actors info
router.get('/videos', async (req, res, next) => {
  try {
    const { type, category, channel, page = 1, limit = 50 } = req.query;

    let where = [];
    let values = [];
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    if (type === 'free') where.push('v.is_premium = 0');
    if (type === 'premium') where.push('v.is_premium = 1');

    if (category) {
      where.push('v.category = ?');
      values.push(category);
    }

    if (channel) {
      where.push('(c.name = ? OR c.slug = ?)');
      values.push(channel, channel);
    }

    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // Get videos with channel info
    const [rows] = await pool.query(
      `
      SELECT 
        v.*,
        c.id as channel_id,
        c.name as channel_name,
        c.slug as channel_slug,
        c.profile_pic as channel_profile_pic,
        c.description as channel_description,
        c.is_verified as channel_is_verified
      FROM videos v
      LEFT JOIN channels c ON v.channel_id = c.id
      ${whereSQL}
      ORDER BY v.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...values, parseInt(limit, 10), offset]
    );

    // Get actors for each video
    const videoIds = rows.map(v => v.id);
    let actorsMap = {};

    if (videoIds.length > 0) {
      const placeholders = videoIds.map(() => '?').join(',');
      const [actorRows] = await pool.query(
        `
        SELECT 
          va.video_id,
          a.id as actor_id,
          a.name as actor_name,
          a.slug as actor_slug,
          a.profile_pic as actor_profile_pic,
          a.bio as actor_bio
        FROM video_actors va
        INNER JOIN actors a ON va.actor_id = a.id
        WHERE va.video_id IN (${placeholders})
        ORDER BY a.name ASC
        `,
        videoIds
      );

      // Group actors by video_id
      actorRows.forEach(row => {
        if (!actorsMap[row.video_id]) {
          actorsMap[row.video_id] = [];
        }
        actorsMap[row.video_id].push({
          id: row.actor_id,
          name: row.actor_name,
          slug: row.actor_slug,
          profile_pic: row.actor_profile_pic,
          bio: row.actor_bio
        });
      });
    }

    // Attach actors to each video
    const videosWithActors = rows.map(video => ({
      ...video,
      channel: video.channel_id ? {
        id: video.channel_id,
        name: video.channel_name,
        slug: video.channel_slug,
        profile_pic: video.channel_profile_pic,
        description: video.channel_description,
        is_verified: video.channel_is_verified
      } : null,
      actors: actorsMap[video.id] || []
    }));

    res.json({ 
      data: videosWithActors,
      pagination: { page: parseInt(page, 10), limit: parseInt(limit, 10) }
    });
  } catch (err) {
    next(err);
  }
});


// GET /api/videos/search?q=... - search in multiple fields including channel and actors
router.get('/videos/search', async (req, res, next) => {
  try {
    const { q } = req.query;

    if (!q || String(q).trim() === '') {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const term = `%${q}%`;
    
    // Search in videos, channels, and actors
    const [rows] = await pool.query(
      `
      SELECT DISTINCT
        v.*,
        c.id as channel_id,
        c.name as channel_name,
        c.slug as channel_slug,
        c.profile_pic as channel_profile_pic,
        c.description as channel_description,
        c.is_verified as channel_is_verified
      FROM videos v
      LEFT JOIN channels c ON v.channel_id = c.id
      LEFT JOIN video_actors va ON v.id = va.video_id
      LEFT JOIN actors a ON va.actor_id = a.id
      WHERE v.title LIKE ?
         OR v.slug LIKE ?
         OR v.description LIKE ?
         OR v.video_url LIKE ?
         OR v.thumbnail_url LIKE ?
         OR v.category LIKE ?
         OR v.tags LIKE ?
         OR c.name LIKE ?
         OR c.slug LIKE ?
         OR a.name LIKE ?
         OR a.slug LIKE ?
      ORDER BY v.created_at DESC
      `,
      [term, term, term, term, term, term, term, term, term, term, term],
    );

    // Get actors for each video
    const videoIds = rows.map(v => v.id);
    let actorsMap = {};

    if (videoIds.length > 0) {
      const placeholders = videoIds.map(() => '?').join(',');
      const [actorRows] = await pool.query(
        `
        SELECT 
          va.video_id,
          a.id as actor_id,
          a.name as actor_name,
          a.slug as actor_slug,
          a.profile_pic as actor_profile_pic,
          a.bio as actor_bio
        FROM video_actors va
        INNER JOIN actors a ON va.actor_id = a.id
        WHERE va.video_id IN (${placeholders})
        ORDER BY a.name ASC
        `,
        videoIds
      );

      actorRows.forEach(row => {
        if (!actorsMap[row.video_id]) {
          actorsMap[row.video_id] = [];
        }
        actorsMap[row.video_id].push({
          id: row.actor_id,
          name: row.actor_name,
          slug: row.actor_slug,
          profile_pic: row.actor_profile_pic,
          bio: row.actor_bio
        });
      });
    }

    // Attach actors to each video
    const videosWithActors = rows.map(video => ({
      ...video,
      channel: video.channel_id ? {
        id: video.channel_id,
        name: video.channel_name,
        slug: video.channel_slug,
        profile_pic: video.channel_profile_pic,
        description: video.channel_description,
        is_verified: video.channel_is_verified
      } : null,
      actors: actorsMap[video.id] || []
    }));

    return res.json({ data: videosWithActors });
  } catch (err) {
    return next(err);
  }
});

// GET /api/videos/free - get free videos with channel and actors
router.get('/videos/free', async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [rows] = await pool.query(
      `
      SELECT 
        v.*,
        c.id as channel_id,
        c.name as channel_name,
        c.slug as channel_slug,
        c.profile_pic as channel_profile_pic,
        c.description as channel_description,
        c.is_verified as channel_is_verified
      FROM videos v
      LEFT JOIN channels c ON v.channel_id = c.id
      WHERE v.is_premium = 0
      ORDER BY v.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [parseInt(limit, 10), offset]
    );

    // Get actors for each video
    const videoIds = rows.map(v => v.id);
    let actorsMap = {};

    if (videoIds.length > 0) {
      const placeholders = videoIds.map(() => '?').join(',');
      const [actorRows] = await pool.query(
        `
        SELECT 
          va.video_id,
          a.id as actor_id,
          a.name as actor_name,
          a.slug as actor_slug,
          a.profile_pic as actor_profile_pic,
          a.bio as actor_bio
        FROM video_actors va
        INNER JOIN actors a ON va.actor_id = a.id
        WHERE va.video_id IN (${placeholders})
        ORDER BY a.name ASC
        `,
        videoIds
      );

      actorRows.forEach(row => {
        if (!actorsMap[row.video_id]) {
          actorsMap[row.video_id] = [];
        }
        actorsMap[row.video_id].push({
          id: row.actor_id,
          name: row.actor_name,
          slug: row.actor_slug,
          profile_pic: row.actor_profile_pic,
          bio: row.actor_bio
        });
      });
    }

    const videosWithActors = rows.map(video => ({
      ...video,
      channel: video.channel_id ? {
        id: video.channel_id,
        name: video.channel_name,
        slug: video.channel_slug,
        profile_pic: video.channel_profile_pic,
        description: video.channel_description,
        is_verified: video.channel_is_verified
      } : null,
      actors: actorsMap[video.id] || []
    }));

    res.json({ 
      data: videosWithActors,
      pagination: { page: parseInt(page, 10), limit: parseInt(limit, 10) }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/videos/premium - get premium videos with channel and actors
router.get('/videos/premium', async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [rows] = await pool.query(
      `
      SELECT 
        v.*,
        c.id as channel_id,
        c.name as channel_name,
        c.slug as channel_slug,
        c.profile_pic as channel_profile_pic,
        c.description as channel_description,
        c.is_verified as channel_is_verified
      FROM videos v
      LEFT JOIN channels c ON v.channel_id = c.id
      WHERE v.is_premium = 1
      ORDER BY v.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [parseInt(limit, 10), offset]
    );

    // Get actors for each video
    const videoIds = rows.map(v => v.id);
    let actorsMap = {};

    if (videoIds.length > 0) {
      const placeholders = videoIds.map(() => '?').join(',');
      const [actorRows] = await pool.query(
        `
        SELECT 
          va.video_id,
          a.id as actor_id,
          a.name as actor_name,
          a.slug as actor_slug,
          a.profile_pic as actor_profile_pic,
          a.bio as actor_bio
        FROM video_actors va
        INNER JOIN actors a ON va.actor_id = a.id
        WHERE va.video_id IN (${placeholders})
        ORDER BY a.name ASC
        `,
        videoIds
      );

      actorRows.forEach(row => {
        if (!actorsMap[row.video_id]) {
          actorsMap[row.video_id] = [];
        }
        actorsMap[row.video_id].push({
          id: row.actor_id,
          name: row.actor_name,
          slug: row.actor_slug,
          profile_pic: row.actor_profile_pic,
          bio: row.actor_bio
        });
      });
    }

    const videosWithActors = rows.map(video => ({
      ...video,
      channel: video.channel_id ? {
        id: video.channel_id,
        name: video.channel_name,
        slug: video.channel_slug,
        profile_pic: video.channel_profile_pic,
        description: video.channel_description,
        is_verified: video.channel_is_verified
      } : null,
      actors: actorsMap[video.id] || []
    }));

    res.json({ 
      data: videosWithActors,
      pagination: { page: parseInt(page, 10), limit: parseInt(limit, 10) }
    });
  } catch (err) {
    next(err);
  }
});


// GET /api/categories - list distinct categories
router.get('/categories', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT category
       FROM videos
       WHERE category IS NOT NULL
         AND category <> ''
       ORDER BY category ASC`,
    );

    const categories = rows.map((row) => row.category);
    res.json({ data: categories });
  } catch (err) {
    next(err);
  }
});

// GET /api/channels - list all channels from channels table
router.get('/channels', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, slug, profile_pic, description, is_verified, created_at, updated_at
       FROM channels
       ORDER BY name ASC`,
    );

    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/actors - list all actors from actors table
router.get('/actors', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, slug, profile_pic, bio, created_at, updated_at
       FROM actors
       ORDER BY name ASC`,
    );

    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

export default router;


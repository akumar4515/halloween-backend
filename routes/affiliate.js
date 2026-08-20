import { Router } from 'express';
import pool from '../config/database.js';

const router = Router();

const toSafeInt = (value, fallback, min = 0) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, parsed);
};

// GET /api/affiliate/videos - Get all affiliate videos with pagination
router.get('/videos', async (req, res) => {
  try {
    const page = toSafeInt(req.query.page, 1, 1);
    const perPage = toSafeInt(req.query.per_page, 30, 1);
    const offset = (page - 1) * perPage;

    // Get total count
    const [countResult] = await pool.execute(
      'SELECT COUNT(*) as total FROM affiliate_videos'
    );
    let total = countResult[0].total;
    let totalPages = Math.ceil(total / perPage);

    // Get videos with thumbnails, categories, and pornstars
    // Convert to integers to ensure proper parameter binding
    const limitValue = toSafeInt(perPage, 30, 1);
    const offsetValue = toSafeInt(offset, 0, 0);
    
    const [videos] = await pool.query(`
      SELECT 
        v.*,
        GROUP_CONCAT(DISTINCT t.thumbnail_url ORDER BY t.thumb_order SEPARATOR '|||') as thumbnails,
        GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') as categories,
        GROUP_CONCAT(DISTINCT p.name ORDER BY p.name SEPARATOR ', ') as pornstars,
        GROUP_CONCAT(DISTINCT ch.name ORDER BY ch.name SEPARATOR ', ') as channels
      FROM affiliate_videos v
      LEFT JOIN affiliate_video_thumbnails t ON v.id = t.video_id
      LEFT JOIN affiliate_video_categories vc ON v.id = vc.video_id
      LEFT JOIN affiliate_categories c ON vc.category_id = c.id
      LEFT JOIN affiliate_video_pornstars vp ON v.id = vp.video_id
      LEFT JOIN affiliate_pornstars p ON vp.pornstar_id = p.id
      LEFT JOIN affiliate_video_channels vch ON v.id = vch.video_id
      LEFT JOIN affiliate_channels ch ON vch.channel_id = ch.id
      GROUP BY v.id
      ORDER BY v.published_at DESC, v.created_at DESC, v.id DESC
      LIMIT ${limitValue} OFFSET ${offsetValue}
    `);

    // Format videos
    const formattedVideos = videos.map(video => ({
      id: video.id,
      provider_video_id: video.provider_video_id,
      title: video.title,
      description: video.description,
      video_url: video.video_url,
      affiliate_url: video.affiliate_url,
      iframe_url: video.iframe_url,
      embed_duration: video.embed_duration,
      duration: video.duration,
      trailer_url: video.trailer_url,
      published_at: video.published_at,
      created_at: video.created_at,
      thumbnail_url: video.thumbnails ? video.thumbnails.split('|||')[0] : null,
      thumbnails: video.thumbnails ? video.thumbnails.split('|||') : [],
      categories: video.categories ? video.categories.split(', ') : [],
      pornstars: video.pornstars ? video.pornstars.split(', ') : [],
      channels: video.channels ? video.channels.split(', ') : []
    }));

    res.json({
      success: true,
      data: formattedVideos,
      pagination: {
        page,
        perPage,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error('Error fetching affiliate videos:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch videos',
      message: error.message
    });
  }
});

// GET /api/affiliate/videos/:id - Get single affiliate video
router.get('/videos/:id', async (req, res) => {
  try {
    const videoId = req.params.id;

    const [videos] = await pool.execute(`
      SELECT 
        v.*,
        GROUP_CONCAT(DISTINCT t.thumbnail_url ORDER BY t.thumb_order SEPARATOR '|||') as thumbnails,
        GROUP_CONCAT(DISTINCT c.id ORDER BY c.id SEPARATOR ',') as category_ids,
        GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') as categories,
        GROUP_CONCAT(DISTINCT p.id ORDER BY p.id SEPARATOR ',') as pornstar_ids,
        GROUP_CONCAT(DISTINCT p.name ORDER BY p.name SEPARATOR ', ') as pornstars,
        GROUP_CONCAT(DISTINCT ch.id ORDER BY ch.id SEPARATOR ',') as channel_ids,
        GROUP_CONCAT(DISTINCT ch.name ORDER BY ch.name SEPARATOR ', ') as channels
      FROM affiliate_videos v
      LEFT JOIN affiliate_video_thumbnails t ON v.id = t.video_id
      LEFT JOIN affiliate_video_categories vc ON v.id = vc.video_id
      LEFT JOIN affiliate_categories c ON vc.category_id = c.id
      LEFT JOIN affiliate_video_pornstars vp ON v.id = vp.video_id
      LEFT JOIN affiliate_pornstars p ON vp.pornstar_id = p.id
      LEFT JOIN affiliate_video_channels vch ON v.id = vch.video_id
      LEFT JOIN affiliate_channels ch ON vch.channel_id = ch.id
      WHERE v.id = ? OR v.provider_video_id = ?
      GROUP BY v.id
    `, [videoId, videoId]);

    if (videos.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Video not found'
      });
    }

    const video = videos[0];
    const formattedVideo = {
      id: video.id,
      provider_video_id: video.provider_video_id,
      title: video.title,
      description: video.description,
      video_url: video.video_url,
      affiliate_url: video.affiliate_url,
      iframe_url: video.iframe_url,
      embed_duration: video.embed_duration,
      duration: video.duration,
      trailer_url: video.trailer_url,
      published_at: video.published_at,
      created_at: video.created_at,
      thumbnail_url: video.thumbnails ? video.thumbnails.split('|||')[0] : null,
      thumbnails: video.thumbnails ? video.thumbnails.split('|||') : [],
      categories: video.categories ? video.categories.split(', ') : [],
      category_ids: video.category_ids ? video.category_ids.split(',').map(Number) : [],
      pornstars: video.pornstars ? video.pornstars.split(', ') : [],
      pornstar_ids: video.pornstar_ids ? video.pornstar_ids.split(',').map(Number) : [],
      channels: video.channels ? video.channels.split(', ') : [],
      channel_ids: video.channel_ids ? video.channel_ids.split(',').map(Number) : []
    };

    res.json({
      success: true,
      data: formattedVideo
    });
  } catch (error) {
    console.error('Error fetching affiliate video:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch video',
      message: error.message
    });
  }
});

// GET /api/affiliate/videos/category/:categoryId - Get videos by category
router.get('/videos/category/:categoryId', async (req, res) => {
  try {
    const categoryId = parseInt(req.params.categoryId);
    const page = toSafeInt(req.query.page, 1, 1);
    const perPage = toSafeInt(req.query.per_page, 30, 1);
    const offset = (page - 1) * perPage;

    // Get total count
    const [countResult] = await pool.execute(
      `SELECT COUNT(DISTINCT v.id) as total 
       FROM affiliate_videos v
       INNER JOIN affiliate_video_categories vc ON v.id = vc.video_id
       WHERE vc.category_id = ?`,
      [categoryId]
    );
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / perPage);

    // Get category name
    const [categories] = await pool.execute(
      'SELECT name FROM affiliate_categories WHERE id = ?',
      [categoryId]
    );

    if (categories.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }

    // Get videos
    const limitValue = toSafeInt(perPage, 30, 1);
    const offsetValue = toSafeInt(offset, 0, 0);
    
    const [videos] = await pool.query(`
      SELECT 
        v.*,
        GROUP_CONCAT(DISTINCT t.thumbnail_url ORDER BY t.thumb_order SEPARATOR '|||') as thumbnails,
        GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') as categories,
        GROUP_CONCAT(DISTINCT p.name ORDER BY p.name SEPARATOR ', ') as pornstars
      FROM affiliate_videos v
      INNER JOIN affiliate_video_categories vc ON v.id = vc.video_id
      LEFT JOIN affiliate_video_thumbnails t ON v.id = t.video_id
      LEFT JOIN affiliate_video_categories vc2 ON v.id = vc2.video_id
      LEFT JOIN affiliate_categories c ON vc2.category_id = c.id
      LEFT JOIN affiliate_video_pornstars vp ON v.id = vp.video_id
      LEFT JOIN affiliate_pornstars p ON vp.pornstar_id = p.id
      WHERE vc.category_id = ?
      GROUP BY v.id
      ORDER BY v.published_at DESC, v.created_at DESC, v.id DESC
      LIMIT ${limitValue} OFFSET ${offsetValue}
    `, [categoryId]);

    const formattedVideos = videos.map(video => ({
      id: video.id,
      provider_video_id: video.provider_video_id,
      title: video.title,
      description: video.description,
      video_url: video.video_url,
      affiliate_url: video.affiliate_url,
      iframe_url: video.iframe_url,
      embed_duration: video.embed_duration,
      duration: video.duration,
      trailer_url: video.trailer_url,
      published_at: video.published_at,
      created_at: video.created_at,
      thumbnail_url: video.thumbnails ? video.thumbnails.split('|||')[0] : null,
      thumbnails: video.thumbnails ? video.thumbnails.split('|||') : [],
      categories: video.categories ? video.categories.split(', ') : [],
      pornstars: video.pornstars ? video.pornstars.split(', ') : []
    }));

    res.json({
      success: true,
      data: formattedVideos,
      category: {
        id: categoryId,
        name: categories[0].name
      },
      pagination: {
        page,
        perPage,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error('Error fetching videos by category:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch videos',
      message: error.message
    });
  }
});

// GET /api/affiliate/videos/pornstar/:pornstarId - Get videos by pornstar
router.get('/videos/pornstar/:pornstarId', async (req, res) => {
  try {
    const pornstarId = parseInt(req.params.pornstarId);
    const page = toSafeInt(req.query.page, 1, 1);
    const perPage = toSafeInt(req.query.per_page, 30, 1);
    const offset = (page - 1) * perPage;

    // Get total count
    const [countResult] = await pool.execute(
      `SELECT COUNT(DISTINCT v.id) as total 
       FROM affiliate_videos v
       INNER JOIN affiliate_video_pornstars vp ON v.id = vp.video_id
       WHERE vp.pornstar_id = ?`,
      [pornstarId]
    );
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / perPage);

    // Get pornstar name
    const [pornstars] = await pool.execute(
      'SELECT name FROM affiliate_pornstars WHERE id = ?',
      [pornstarId]
    );

    if (pornstars.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Pornstar not found'
      });
    }

    // Get videos
    const limitValue = toSafeInt(perPage, 30, 1);
    const offsetValue = toSafeInt(offset, 0, 0);
    
    const [videos] = await pool.query(`
      SELECT 
        v.*,
        GROUP_CONCAT(DISTINCT t.thumbnail_url ORDER BY t.thumb_order SEPARATOR '|||') as thumbnails,
        GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') as categories,
        GROUP_CONCAT(DISTINCT p.name ORDER BY p.name SEPARATOR ', ') as pornstars
      FROM affiliate_videos v
      INNER JOIN affiliate_video_pornstars vp ON v.id = vp.video_id
      LEFT JOIN affiliate_video_thumbnails t ON v.id = t.video_id
      LEFT JOIN affiliate_video_categories vc ON v.id = vc.video_id
      LEFT JOIN affiliate_categories c ON vc.category_id = c.id
      LEFT JOIN affiliate_video_pornstars vp2 ON v.id = vp2.video_id
      LEFT JOIN affiliate_pornstars p ON vp2.pornstar_id = p.id
      WHERE vp.pornstar_id = ?
      GROUP BY v.id
      ORDER BY v.published_at DESC, v.created_at DESC, v.id DESC
      LIMIT ${limitValue} OFFSET ${offsetValue}
    `, [pornstarId]);

    const formattedVideos = videos.map(video => ({
      id: video.id,
      provider_video_id: video.provider_video_id,
      title: video.title,
      description: video.description,
      video_url: video.video_url,
      affiliate_url: video.affiliate_url,
      iframe_url: video.iframe_url,
      embed_duration: video.embed_duration,
      duration: video.duration,
      trailer_url: video.trailer_url,
      published_at: video.published_at,
      created_at: video.created_at,
      thumbnail_url: video.thumbnails ? video.thumbnails.split('|||')[0] : null,
      thumbnails: video.thumbnails ? video.thumbnails.split('|||') : [],
      categories: video.categories ? video.categories.split(', ') : [],
      pornstars: video.pornstars ? video.pornstars.split(', ') : []
    }));

    res.json({
      success: true,
      data: formattedVideos,
      pornstar: {
        id: pornstarId,
        name: pornstars[0].name
      },
      pagination: {
        page,
        perPage,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error('Error fetching videos by pornstar:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch videos',
      message: error.message
    });
  }
});

// GET /api/affiliate/search - Search videos by title, description, category, pornstar, channel
router.get('/search', async (req, res) => {
  try {
    const query = (req.query.query || '').trim();
    const page = toSafeInt(req.query.page, 1, 1);
    const perPage = toSafeInt(req.query.per_page, 30, 1);
    const offset = (page - 1) * perPage;

    if (!query) {
      return res.json({
        success: true,
        data: [],
        pagination: {
          page,
          perPage,
          total: 0,
          totalPages: 1
        }
      });
    }

    const likeQuery = `%${query}%`;

    const [countResult] = await pool.execute(
      `SELECT COUNT(DISTINCT v.id) as total
       FROM affiliate_videos v
       LEFT JOIN affiliate_video_categories vc ON v.id = vc.video_id
       LEFT JOIN affiliate_categories c ON vc.category_id = c.id
       LEFT JOIN affiliate_video_pornstars vp ON v.id = vp.video_id
       LEFT JOIN affiliate_pornstars p ON vp.pornstar_id = p.id
       LEFT JOIN affiliate_video_channels vch ON v.id = vch.video_id
       LEFT JOIN affiliate_channels ch ON vch.channel_id = ch.id
       WHERE v.title LIKE ? OR v.description LIKE ? OR c.name LIKE ? OR p.name LIKE ? OR ch.name LIKE ?`,
      [likeQuery, likeQuery, likeQuery, likeQuery, likeQuery]
    );

    const total = countResult[0].total;
    const totalPages = Math.ceil(total / perPage);

    const limitValue = toSafeInt(perPage, 30, 1);
    const offsetValue = toSafeInt(offset, 0, 0);

    const [videos] = await pool.query(
      `SELECT 
        v.*,
        GROUP_CONCAT(DISTINCT t.thumbnail_url ORDER BY t.thumb_order SEPARATOR '|||') as thumbnails,
        GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') as categories,
        GROUP_CONCAT(DISTINCT p.name ORDER BY p.name SEPARATOR ', ') as pornstars,
        GROUP_CONCAT(DISTINCT ch.name ORDER BY ch.name SEPARATOR ', ') as channels
      FROM affiliate_videos v
      LEFT JOIN affiliate_video_thumbnails t ON v.id = t.video_id
      LEFT JOIN affiliate_video_categories vc ON v.id = vc.video_id
      LEFT JOIN affiliate_categories c ON vc.category_id = c.id
      LEFT JOIN affiliate_video_pornstars vp ON v.id = vp.video_id
      LEFT JOIN affiliate_pornstars p ON vp.pornstar_id = p.id
      LEFT JOIN affiliate_video_channels vch ON v.id = vch.video_id
      LEFT JOIN affiliate_channels ch ON vch.channel_id = ch.id
      WHERE v.title LIKE ? OR v.description LIKE ? OR c.name LIKE ? OR p.name LIKE ? OR ch.name LIKE ?
      GROUP BY v.id
      ORDER BY v.published_at DESC, v.created_at DESC, v.id DESC
      LIMIT ${limitValue} OFFSET ${offsetValue}`,
      [likeQuery, likeQuery, likeQuery, likeQuery, likeQuery]
    );

    const formattedVideos = videos.map(video => ({
      id: video.id,
      provider_video_id: video.provider_video_id,
      title: video.title,
      description: video.description,
      video_url: video.video_url,
      affiliate_url: video.affiliate_url,
      iframe_url: video.iframe_url,
      embed_duration: video.embed_duration,
      duration: video.duration,
      trailer_url: video.trailer_url,
      published_at: video.published_at,
      created_at: video.created_at,
      thumbnail_url: video.thumbnails ? video.thumbnails.split('|||')[0] : null,
      thumbnails: video.thumbnails ? video.thumbnails.split('|||') : [],
      categories: video.categories ? video.categories.split(', ') : [],
      pornstars: video.pornstars ? video.pornstars.split(', ') : [],
      channels: video.channels ? video.channels.split(', ') : []
    }));

    res.json({
      success: true,
      data: formattedVideos,
      pagination: {
        page,
        perPage,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error('Error searching affiliate videos:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search videos',
      message: error.message
    });
  }
});

// GET /api/affiliate/videos/:id/recommendations - Recommended videos by category/pornstar/channel
router.get('/videos/:id/recommendations', async (req, res) => {
  try {
    const videoId = req.params.id;
    const page = toSafeInt(req.query.page, 1, 1);
    const perPage = toSafeInt(req.query.per_page, 24, 1);
    const offset = (page - 1) * perPage;

    const [seedRows] = await pool.execute(
      `SELECT 
        GROUP_CONCAT(DISTINCT c.id) as category_ids,
        GROUP_CONCAT(DISTINCT p.id) as pornstar_ids,
        GROUP_CONCAT(DISTINCT ch.id) as channel_ids
      FROM affiliate_videos v
      LEFT JOIN affiliate_video_categories vc ON v.id = vc.video_id
      LEFT JOIN affiliate_categories c ON vc.category_id = c.id
      LEFT JOIN affiliate_video_pornstars vp ON v.id = vp.video_id
      LEFT JOIN affiliate_pornstars p ON vp.pornstar_id = p.id
      LEFT JOIN affiliate_video_channels vch ON v.id = vch.video_id
      LEFT JOIN affiliate_channels ch ON vch.channel_id = ch.id
      WHERE v.id = ? OR v.provider_video_id = ?
      GROUP BY v.id`,
      [videoId, videoId]
    );

    const seed = seedRows[0] || {};
    const categoryIds = seed.category_ids ? seed.category_ids.split(',').map(Number).filter(Boolean) : [];
    const pornstarIds = seed.pornstar_ids ? seed.pornstar_ids.split(',').map(Number).filter(Boolean) : [];
    const channelIds = seed.channel_ids ? seed.channel_ids.split(',').map(Number).filter(Boolean) : [];

    const limitValue = toSafeInt(perPage, 24, 1);
    const offsetValue = toSafeInt(offset, 0, 0);

    let whereClause = '';
    const params = [];

    if (categoryIds.length || pornstarIds.length || channelIds.length) {
      const conditions = [];
      if (categoryIds.length) {
        conditions.push(`vc.category_id IN (${categoryIds.map(() => '?').join(',')})`);
        params.push(...categoryIds);
      }
      if (pornstarIds.length) {
        conditions.push(`vp.pornstar_id IN (${pornstarIds.map(() => '?').join(',')})`);
        params.push(...pornstarIds);
      }
      if (channelIds.length) {
        conditions.push(`vch.channel_id IN (${channelIds.map(() => '?').join(',')})`);
        params.push(...channelIds);
      }
      whereClause = `(${conditions.join(' OR ')}) AND v.id <> ?`;
      params.push(videoId);
    } else {
      whereClause = 'v.id <> ?';
      params.push(videoId);
    }

    const [countResult] = await pool.execute(
      `SELECT COUNT(DISTINCT v.id) as total
       FROM affiliate_videos v
       LEFT JOIN affiliate_video_categories vc ON v.id = vc.video_id
       LEFT JOIN affiliate_video_pornstars vp ON v.id = vp.video_id
       LEFT JOIN affiliate_video_channels vch ON v.id = vch.video_id
       WHERE ${whereClause}`,
      params
    );
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / perPage);

    const scoreParts = [];
    const scoreParams = [];
    if (categoryIds.length) {
      scoreParts.push(`MAX(CASE WHEN vc.category_id IN (${categoryIds.map(() => '?').join(',')}) THEN 1 ELSE 0 END)`);
      scoreParams.push(...categoryIds);
    }
    if (pornstarIds.length) {
      scoreParts.push(`MAX(CASE WHEN vp.pornstar_id IN (${pornstarIds.map(() => '?').join(',')}) THEN 3 ELSE 0 END)`);
      scoreParams.push(...pornstarIds);
    }
    if (channelIds.length) {
      scoreParts.push(`MAX(CASE WHEN vch.channel_id IN (${channelIds.map(() => '?').join(',')}) THEN 3 ELSE 0 END)`);
      scoreParams.push(...channelIds);
    }
    const scoreSql = scoreParts.length ? scoreParts.join(' + ') : '0';

    let [videos] = await pool.query(
      `SELECT 
        v.*,
        GROUP_CONCAT(DISTINCT t.thumbnail_url ORDER BY t.thumb_order SEPARATOR '|||') as thumbnails,
        GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') as categories,
        GROUP_CONCAT(DISTINCT p.name ORDER BY p.name SEPARATOR ', ') as pornstars,
        GROUP_CONCAT(DISTINCT ch.name ORDER BY ch.name SEPARATOR ', ') as channels,
        (${scoreSql}) as match_score
      FROM affiliate_videos v
      LEFT JOIN affiliate_video_thumbnails t ON v.id = t.video_id
      LEFT JOIN affiliate_video_categories vc ON v.id = vc.video_id
      LEFT JOIN affiliate_categories c ON vc.category_id = c.id
      LEFT JOIN affiliate_video_pornstars vp ON v.id = vp.video_id
      LEFT JOIN affiliate_pornstars p ON vp.pornstar_id = p.id
      LEFT JOIN affiliate_video_channels vch ON v.id = vch.video_id
      LEFT JOIN affiliate_channels ch ON vch.channel_id = ch.id
      WHERE ${whereClause}
      GROUP BY v.id
      ORDER BY match_score DESC, v.published_at DESC, v.created_at DESC, v.id DESC
      LIMIT ${limitValue} OFFSET ${offsetValue}`,
      [...scoreParams, ...params]
    );

    // Fallback: if no matches, return latest videos excluding current
    if (!videos.length) {
      const [fallbackCount] = await pool.execute(
        `SELECT COUNT(*) as total
         FROM affiliate_videos v
         WHERE v.id <> ?`,
        [videoId]
      );
      const fallbackTotal = fallbackCount[0].total;

      const [fallbackVideos] = await pool.query(
        `SELECT 
          v.*,
          GROUP_CONCAT(DISTINCT t.thumbnail_url ORDER BY t.thumb_order SEPARATOR '|||') as thumbnails,
          GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') as categories,
          GROUP_CONCAT(DISTINCT p.name ORDER BY p.name SEPARATOR ', ') as pornstars,
          GROUP_CONCAT(DISTINCT ch.name ORDER BY ch.name SEPARATOR ', ') as channels
        FROM affiliate_videos v
        LEFT JOIN affiliate_video_thumbnails t ON v.id = t.video_id
        LEFT JOIN affiliate_video_categories vc ON v.id = vc.video_id
        LEFT JOIN affiliate_categories c ON vc.category_id = c.id
        LEFT JOIN affiliate_video_pornstars vp ON v.id = vp.video_id
        LEFT JOIN affiliate_pornstars p ON vp.pornstar_id = p.id
        LEFT JOIN affiliate_video_channels vch ON v.id = vch.video_id
        LEFT JOIN affiliate_channels ch ON vch.channel_id = ch.id
        WHERE v.id <> ?
        GROUP BY v.id
        ORDER BY v.published_at DESC, v.created_at DESC, v.id DESC
        LIMIT ${limitValue} OFFSET ${offsetValue}`,
        [videoId]
      );

      videos = fallbackVideos;
      const fallbackPages = Math.ceil(fallbackTotal / perPage);
      totalPages = fallbackPages;
      total = fallbackTotal;
    }

    const formattedVideos = videos.map(video => ({
      id: video.id,
      provider_video_id: video.provider_video_id,
      title: video.title,
      description: video.description,
      video_url: video.video_url,
      affiliate_url: video.affiliate_url,
      iframe_url: video.iframe_url,
      embed_duration: video.embed_duration,
      duration: video.duration,
      trailer_url: video.trailer_url,
      published_at: video.published_at,
      created_at: video.created_at,
      thumbnail_url: video.thumbnails ? video.thumbnails.split('|||')[0] : null,
      thumbnails: video.thumbnails ? video.thumbnails.split('|||') : [],
      categories: video.categories ? video.categories.split(', ') : [],
      pornstars: video.pornstars ? video.pornstars.split(', ') : [],
      channels: video.channels ? video.channels.split(', ') : []
    }));

    res.json({
      success: true,
      data: formattedVideos,
      pagination: {
        page,
        perPage,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recommendations',
      message: error.message
    });
  }
});
// GET /api/affiliate/videos/channel/:channelId - Get videos by channel
router.get('/videos/channel/:channelId', async (req, res) => {
  try {
    const channelId = parseInt(req.params.channelId);
    const page = toSafeInt(req.query.page, 1, 1);
    const perPage = toSafeInt(req.query.per_page, 30, 1);
    const offset = (page - 1) * perPage;

    const [countResult] = await pool.execute(
      `SELECT COUNT(DISTINCT v.id) as total 
       FROM affiliate_videos v
       INNER JOIN affiliate_video_channels vc ON v.id = vc.video_id
       WHERE vc.channel_id = ?`,
      [channelId]
    );
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / perPage);

    const [channels] = await pool.execute(
      'SELECT name FROM affiliate_channels WHERE id = ?',
      [channelId]
    );

    if (channels.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Channel not found'
      });
    }

    const limitValue = toSafeInt(perPage, 30, 1);
    const offsetValue = toSafeInt(offset, 0, 0);

    const [videos] = await pool.query(`
      SELECT 
        v.*,
        GROUP_CONCAT(DISTINCT t.thumbnail_url ORDER BY t.thumb_order SEPARATOR '|||') as thumbnails,
        GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') as categories,
        GROUP_CONCAT(DISTINCT p.name ORDER BY p.name SEPARATOR ', ') as pornstars
      FROM affiliate_videos v
      INNER JOIN affiliate_video_channels vc ON v.id = vc.video_id
      LEFT JOIN affiliate_video_thumbnails t ON v.id = t.video_id
      LEFT JOIN affiliate_video_categories vc2 ON v.id = vc2.video_id
      LEFT JOIN affiliate_categories c ON vc2.category_id = c.id
      LEFT JOIN affiliate_video_pornstars vp ON v.id = vp.video_id
      LEFT JOIN affiliate_pornstars p ON vp.pornstar_id = p.id
      WHERE vc.channel_id = ?
      GROUP BY v.id
      ORDER BY v.published_at DESC, v.created_at DESC, v.id DESC
      LIMIT ${limitValue} OFFSET ${offsetValue}
    `, [channelId]);

    const formattedVideos = videos.map(video => ({
      id: video.id,
      provider_video_id: video.provider_video_id,
      title: video.title,
      description: video.description,
      video_url: video.video_url,
      affiliate_url: video.affiliate_url,
      iframe_url: video.iframe_url,
      embed_duration: video.embed_duration,
      duration: video.duration,
      trailer_url: video.trailer_url,
      published_at: video.published_at,
      created_at: video.created_at,
      thumbnail_url: video.thumbnails ? video.thumbnails.split('|||')[0] : null,
      thumbnails: video.thumbnails ? video.thumbnails.split('|||') : [],
      categories: video.categories ? video.categories.split(', ') : [],
      pornstars: video.pornstars ? video.pornstars.split(', ') : []
    }));

    res.json({
      success: true,
      data: formattedVideos,
      channel: {
        id: channelId,
        name: channels[0].name
      },
      pagination: {
        page,
        perPage,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error('Error fetching videos by channel:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch videos',
      message: error.message
    });
  }
});

// GET /api/affiliate/categories - Get all categories
router.get('/categories', async (req, res) => {
  try {
    const [categories] = await pool.execute(`
      SELECT 
        c.id,
        c.name,
        COUNT(DISTINCT vc.video_id) as video_count
      FROM affiliate_categories c
      LEFT JOIN affiliate_video_categories vc ON c.id = vc.category_id
      GROUP BY c.id, c.name
      ORDER BY c.name
    `);

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch categories',
      message: error.message
    });
  }
});

// GET /api/affiliate/pornstars - Get all pornstars
router.get('/pornstars', async (req, res) => {
  try {
    const [pornstars] = await pool.execute(`
      SELECT 
        p.id,
        p.name,
        COUNT(DISTINCT vp.video_id) as video_count
      FROM affiliate_pornstars p
      LEFT JOIN affiliate_video_pornstars vp ON p.id = vp.pornstar_id
      GROUP BY p.id, p.name
      ORDER BY p.name
    `);

    res.json({
      success: true,
      data: pornstars
    });
  } catch (error) {
    console.error('Error fetching pornstars:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pornstars',
      message: error.message
    });
  }
});

// GET /api/affiliate/channels - Get all channels
router.get('/channels', async (req, res) => {
  try {
    const [channels] = await pool.execute(`
      SELECT 
        ch.id,
        ch.name,
        COUNT(DISTINCT vc.video_id) as video_count
      FROM affiliate_channels ch
      LEFT JOIN affiliate_video_channels vc ON ch.id = vc.channel_id
      GROUP BY ch.id, ch.name
      ORDER BY ch.name
    `);

    res.json({
      success: true,
      data: channels
    });
  } catch (error) {
    console.error('Error fetching channels:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch channels',
      message: error.message
    });
  }
});

// POST /api/affiliate/track-click - Track affiliate link click
router.post('/track-click', async (req, res) => {
  try {
    const { video_id, utm_content, ip_address, user_agent } = req.body;

    if (!video_id) {
      return res.status(400).json({
        success: false,
        error: 'video_id is required'
      });
    }

    await pool.execute(
      `INSERT INTO affiliate_click_tracking 
       (video_id, utm_content, ip_address, user_agent) 
       VALUES (?, ?, ?, ?)`,
      [video_id, utm_content || null, ip_address || null, user_agent || null]
    );

    res.json({
      success: true,
      message: 'Click tracked successfully'
    });
  } catch (error) {
    console.error('Error tracking click:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track click',
      message: error.message
    });
  }
});

export default router;

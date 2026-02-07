import { Router } from 'express';
import pool from '../config/database.js';
import multer from 'multer';
import xlsx from 'xlsx';
import csv from 'csv-parser';
import { Readable } from 'stream';

const router = Router();

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Admin credentials
const ADMIN_USERNAME = 'flovex_admin';
const ADMIN_PASSWORD = 'flovex.admin@00';

// Authentication middleware
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const [type, credentials] = authHeader.split(' ');
  if (type !== 'Basic') {
    return res.status(401).json({ success: false, error: 'Invalid auth type' });
  }

  const [username, password] = Buffer.from(credentials, 'base64').toString().split(':');
  
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    next();
  } else {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
};

const CSV_MAX_BYTES = 2 * 1024 * 1024 * 1024;

// Column mapping (handles # prefix - just strips # and maps to lowercase database column names)
// The database columns already match the CSV format (without # prefix)
const columnMapping = {
  // For affiliate_videos table
  '#id': 'provider_video_id',
  'id': 'provider_video_id',
  '#embed': 'iframe_url',
  'embed': 'iframe_url',
  '#url': 'video_url',
  'url': 'video_url',
  '#affiliate_url': 'affiliate_url',
  'affiliate_url': 'affiliate_url',
  '#url_thumb': 'thumbnail_url',
  'url_thumb': 'thumbnail_url',
  '#thumb': 'thumbnail_url',
  'thumb': 'thumbnail_url',
  '#thumbs': 'thumbnail_url',
  'thumbs': 'thumbnail_url',
  '#thumbnail': 'thumbnail_url',
  'thumbnail': 'thumbnail_url',
  '#title': 'title',
  'title': 'title',
  '#description': 'description',
  'description': 'description',
  '#desc': 'description',
  'desc': 'description',
  '#channel': 'channels',
  'channel': 'channels',
  '#channels': 'channels',
  'channels': 'channels',
  '#studio': 'channels',
  'studio': 'channels',
  '#sname': 'channels',
  'sname': 'channels',
  '#duration': 'duration',
  'duration': 'duration',
  '#dur': 'duration',
  'dur': 'duration',
  '#duration_embed': 'embed_duration',
  'duration_embed': 'embed_duration',
  '#embdur': 'embed_duration',
  'embdur': 'embed_duration',
  '#date': 'published_at',
  'date': 'published_at',
  '#dt': 'published_at',
  'dt': 'published_at',
  '#trailer': 'trailer_url',
  'trailer': 'trailer_url',
  '#cats': 'categories',
  'cats': 'categories',
  '#pstarts': 'pornstars',
  'pstarts': 'pornstars',
  '#pstars': 'pornstars',
  'pstars': 'pornstars',
  // Generic mappings for all tables
  '#name': 'name',
  'name': 'name'
};

// Function to normalize column names (remove BOM/# prefix, convert to lowercase)
const normalizeColumnName = (colName) => {
  if (!colName) return colName;
  return colName.replace(/^\uFEFF/, '').replace(/^#/, '').toLowerCase().trim();
};

// Function to map file column to database column
const mapColumnName = (fileCol) => {
  if (!fileCol) return fileCol;

  // Try exact match first (with #, case-sensitive)
  if (columnMapping[fileCol]) {
    return columnMapping[fileCol];
  }

  // Try exact match (with #, lowercase)
  if (columnMapping[fileCol.toLowerCase()]) {
    return columnMapping[fileCol.toLowerCase()];
  }

  // Try normalized (without #, lowercase)
  const normalized = normalizeColumnName(fileCol);
  if (columnMapping[normalized]) {
    return columnMapping[normalized];
  }

  // Fallback: return normalized name (which should match DB column if no # prefix)
  return normalized;
};

const parseCsvRows = async (rawContent, requiredColumns) => {
  let csvRows = [];
  const lines = rawContent
    .split(/\r?\n/)
    .filter(line => line.trim() !== '')
    .slice(0, 5);
  const firstLine = lines[0] || '';
  const delimiters = ['|', ',', '\t', ';'];
  const delimiterCounts = delimiters.reduce((acc, delim) => {
    acc[delim] = 0;
    return acc;
  }, {});

  for (const line of lines) {
    for (const delim of delimiters) {
      delimiterCounts[delim] += (line.match(new RegExp(`\\${delim}`, 'g')) || []).length;
    }
  }

  const detectedDelimiter = delimiterCounts['|'] > 0
    ? '|'
    : (Object.entries(delimiterCounts)
        .filter(([delim]) => delim !== '|')
        .sort((a, b) => b[1] - a[1])[0]?.[0] || ',');

  let normalizedContent = rawContent;
  if (detectedDelimiter && firstLine) {
    const hasDetected = firstLine.includes(detectedDelimiter);
    const hasTabs = firstLine.includes('\t');
    if (!hasDetected && hasTabs && detectedDelimiter !== '\t') {
      const [header, ...rest] = rawContent.split(/\r?\n/);
      const fixedHeader = header.replace(/\t/g, detectedDelimiter);
      normalizedContent = [fixedHeader, ...rest].join('\n');
    }
  }

  const parseWithSeparator = async (separator, content) => {
    const rows = [];
    const stream = Readable.from(content);
    await new Promise((resolve, reject) => {
      stream
        .pipe(csv({
          separator,
          mapHeaders: ({ header }) => header ? header.replace(/^\uFEFF/, '').trim() : header
        }))
        .on('data', (row) => rows.push(row))
        .on('end', resolve)
        .on('error', reject);
    });
    return rows;
  };

  const separatorsToTry = [detectedDelimiter, '|', '\t', ',', ';'].filter(
    (sep, idx, arr) => arr.indexOf(sep) === idx
  );

  for (const sep of separatorsToTry) {
    csvRows = await parseWithSeparator(sep, normalizedContent);
    if (csvRows.length === 0) continue;

    const fileColumns = Object.keys(csvRows[0]);
    const mappedColumns = fileColumns.map(col => mapColumnName(col).toLowerCase());
    const missingRequired = requiredColumns.filter(
      col => !mappedColumns.includes(col.toLowerCase())
    );
    if (missingRequired.length === 0) break;
  }

  // If still empty or missing, try whitespace-delimited fallback
  if (csvRows.length === 0) {
    const whitespaceNormalized = rawContent.replace(/ {2,}/g, '\t');
    csvRows = await parseWithSeparator('\t', whitespaceNormalized);
  }

  return csvRows;
};

// POST /api/admin/auth - Login
router.post('/auth', (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    res.json({
      success: true,
      admin: { username, email: 'amankumar22200245@gmail.com' }
    });
  } else {
    res.status(401).json({
      success: false,
      error: 'Invalid username or password'
    });
  }
});

// GET /api/admin/tables - Get all table names
router.get('/tables', authenticateAdmin, async (req, res) => {
  try {
    const [tables] = await pool.execute(`
      SELECT TABLE_NAME as name
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME LIKE 'affiliate_%'
      ORDER BY TABLE_NAME
    `);

    res.json({
      success: true,
      data: tables
    });
  } catch (error) {
    console.error('Error fetching tables:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tables',
      message: error.message
    });
  }
});

// GET /api/admin/tables/:tableName - Get table data
router.get('/tables/:tableName', authenticateAdmin, async (req, res) => {
  try {
    const { tableName } = req.params;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.max(1, parseInt(req.query.per_page, 10) || 50);
    const offset = Math.max(0, (page - 1) * perPage);

    // Sanitize table name to prevent SQL injection
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid table name'
      });
    }

    // Get total count
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM \`${tableName}\``
    );
    const total = countResult[0].total;

    // Get table structure
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, EXTRA
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `, [tableName]);

    // Get data - embed LIMIT and OFFSET directly since they're validated integers
    const limitValue = Number(perPage);
    const offsetValue = Number(offset);
    
    const [rows] = await pool.execute(
      `SELECT * FROM \`${tableName}\` LIMIT ${limitValue} OFFSET ${offsetValue}`
    );

    res.json({
      success: true,
      data: {
        tableName,
        columns,
        rows,
        pagination: {
          page,
          perPage,
          total,
          totalPages: Math.ceil(total / perPage)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching table data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch table data',
      message: error.message
    });
  }
});

// POST /api/admin/tables/:tableName - Add new row
router.post('/tables/:tableName', authenticateAdmin, async (req, res) => {
  try {
    const { tableName } = req.params;
    const data = req.body;

    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid table name'
      });
    }

    // Get table columns
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, EXTRA
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `, [tableName]);

    // Filter out auto-increment columns
    const insertColumns = columns
      .filter(col => col.EXTRA !== 'auto_increment')
      .map(col => col.COLUMN_NAME);

    // Build insert query
    const values = insertColumns.map(col => data[col] !== undefined ? data[col] : null);
    const placeholders = insertColumns.map(() => '?').join(', ');
    const columnNames = insertColumns.map(col => `\`${col}\``).join(', ');

    await pool.execute(
      `INSERT INTO \`${tableName}\` (${columnNames}) VALUES (${placeholders})`,
      values
    );

    res.json({
      success: true,
      message: 'Row added successfully'
    });
  } catch (error) {
    console.error('Error adding row:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add row',
      message: error.message
    });
  }
});

// PUT /api/admin/tables/:tableName/:id - Update row
router.put('/tables/:tableName/:id', authenticateAdmin, async (req, res) => {
  try {
    const { tableName, id } = req.params;
    const data = req.body;

    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid table name'
      });
    }

    // Get primary key column
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME, COLUMN_KEY
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_KEY = 'PRI'
    `, [tableName]);

    if (columns.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Table has no primary key'
      });
    }

    const primaryKey = columns[0].COLUMN_NAME;

    // Get all columns
    const [allColumns] = await pool.execute(`
      SELECT COLUMN_NAME, EXTRA
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
    `, [tableName]);

    // Filter out auto-increment columns
    const updateColumns = allColumns
      .filter(col => col.EXTRA !== 'auto_increment')
      .map(col => col.COLUMN_NAME);

    // Build update query
    const setClause = updateColumns
      .filter(col => data[col] !== undefined)
      .map(col => `${col} = ?`)
      .join(', ');

    const values = updateColumns
      .filter(col => data[col] !== undefined)
      .map(col => data[col]);

    if (setClause === '') {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    await pool.execute(
      `UPDATE \`${tableName}\` SET ${setClause} WHERE \`${primaryKey}\` = ?`,
      [...values, id]
    );

    res.json({
      success: true,
      message: 'Row updated successfully'
    });
  } catch (error) {
    console.error('Error updating row:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update row',
      message: error.message
    });
  }
});

// DELETE /api/admin/tables/:tableName/:id - Delete row
router.delete('/tables/:tableName/:id', authenticateAdmin, async (req, res) => {
  try {
    const { tableName, id } = req.params;

    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid table name'
      });
    }

    // Get primary key column
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_KEY = 'PRI'
    `, [tableName]);

    if (columns.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Table has no primary key'
      });
    }

    const primaryKey = columns[0].COLUMN_NAME;

    await pool.execute(
      `DELETE FROM \`${tableName}\` WHERE \`${primaryKey}\` = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Row deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting row:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete row',
      message: error.message
    });
  }
});

// POST /api/admin/delete-all - Delete all affiliate data
router.post('/delete-all', authenticateAdmin, async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const deleteQueries = [
      'DELETE FROM affiliate_click_tracking',
      'DELETE FROM affiliate_video_channels',
      'DELETE FROM affiliate_video_pornstars',
      'DELETE FROM affiliate_video_categories',
      'DELETE FROM affiliate_video_thumbnails',
      'DELETE FROM affiliate_videos',
      'DELETE FROM affiliate_channels',
      'DELETE FROM affiliate_pornstars',
      'DELETE FROM affiliate_categories'
    ];

    for (const query of deleteQueries) {
      await connection.execute(query);
    }

    await connection.commit();

    res.json({
      success: true,
      message: 'All affiliate data deleted successfully'
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error deleting all data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete all data',
      message: error.message
    });
  } finally {
    if (connection) connection.release();
  }
});

// POST /api/admin/delete-by-date - Delete affiliate videos by published_at date range
router.post('/delete-by-date', authenticateAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.body || {};

    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return res.status(400).json({
        success: false,
        error: 'startDate is required in YYYY-MM-DD format'
      });
    }

    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({
        success: false,
        error: 'endDate must be in YYYY-MM-DD format'
      });
    }

    let result;
    if (endDate) {
      result = await pool.execute(
        `DELETE FROM affiliate_videos 
         WHERE published_at >= ? AND published_at <= ?`,
        [`${startDate} 00:00:00`, `${endDate} 23:59:59`]
      );
    } else {
      result = await pool.execute(
        `DELETE FROM affiliate_videos 
         WHERE published_at >= ?`,
        [`${startDate} 00:00:00`]
      );
    }

    res.json({
      success: true,
      message: 'Data deleted by date successfully',
      deleted: result[0]?.affectedRows || 0
    });
  } catch (error) {
    console.error('Error deleting data by date:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete data by date',
      message: error.message
    });
  }
});

// Helper function to convert date format from MM/DD/YYYY to DATETIME
const convertDateFormat = (dateStr) => {
  if (!dateStr || dateStr.trim() === '') return null;
  try {
    // Parse MM/DD/YYYY format
    const [month, day, year] = dateStr.split('/');
    if (month && day && year) {
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} 00:00:00`;
    }
  } catch (e) {
    console.error('Date conversion error:', e);
  }
  return dateStr;
};

// Special handler for affiliate_videos table
const handleAffiliateVideosUpload = async (rows, mappedFileColumns, allColumns, requiredColumns) => {
  let inserted = 0;
  let skipped = 0;
  let errors = [];
  let connection;

  const insertColumns = allColumns.filter(col =>
    !['categories', 'pornstars', 'channels', 'thumbnail_url'].includes(col.toLowerCase())
  );
  const columnNames = insertColumns.map(col => `\`${col}\``).join(', ');

  const getMappedValue = (row, targetCol) => {
    const mappedCol = mappedFileColumns.find(
      m => m.dbColumn.toLowerCase() === targetCol.toLowerCase()
    );
    if (!mappedCol) return null;
    const value = row[mappedCol.original];
    return value !== undefined && value !== '' ? value : null;
  };

  const toInsertValues = (row) => {
    return insertColumns.map(col => {
      const mappedCol = mappedFileColumns.find(
        m => m.dbColumn.toLowerCase() === col.toLowerCase()
      );
      if (!mappedCol) {
        if (col.toLowerCase() === 'affiliate_url') {
          const urlValue = getMappedValue(row, 'video_url');
          return urlValue || null;
        }
        return null;
      }

      let value = row[mappedCol.original];
      if (col.toLowerCase() === 'published_at' && value) {
        value = convertDateFormat(value);
      }
      return value !== undefined && value !== '' ? value : null;
    });
  };

  const providerIdList = rows
    .map(row => getMappedValue(row, 'provider_video_id'))
    .filter(Boolean);

  const uniqueProviderIds = [...new Set(providerIdList)];

  const categoryCache = new Map();
  const pornstarCache = new Map();
  const channelCache = new Map();

  const getOrCreateId = async (tableName, name, cache) => {
    if (cache.has(name)) return cache.get(name);
    const [existing] = await connection.execute(
      `SELECT id FROM \`${tableName}\` WHERE name = ?`,
      [name]
    );
    let id;
    if (existing.length === 0) {
      const [result] = await connection.execute(
        `INSERT IGNORE INTO \`${tableName}\` (name) VALUES (?)`,
        [name]
      );
      if (result.insertId) {
        id = result.insertId;
      } else {
        const [created] = await connection.execute(
          `SELECT id FROM \`${tableName}\` WHERE name = ?`,
          [name]
        );
        id = created[0]?.id;
      }
    } else {
      id = existing[0].id;
    }
    cache.set(name, id);
    return id;
  };

  const chunkArray = (arr, size) => {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  };

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    if (uniqueProviderIds.length > 0) {
      const placeholders = uniqueProviderIds.map(() => '?').join(', ');
      const [existingRows] = await connection.execute(
        `SELECT provider_video_id FROM \`affiliate_videos\` WHERE provider_video_id IN (${placeholders})`,
        uniqueProviderIds
      );
      const existingSet = new Set(existingRows.map(r => r.provider_video_id));
      skipped = existingSet.size;
    }

    const videoValueRows = rows.map(toInsertValues);
    const insertChunks = chunkArray(videoValueRows, 200);
    const valuePlaceholder = `(${insertColumns.map(() => '?').join(', ')})`;

    for (const chunk of insertChunks) {
      const flatValues = chunk.flat();
      const chunkPlaceholders = chunk.map(() => valuePlaceholder).join(', ');
      await connection.execute(
        `INSERT IGNORE INTO \`affiliate_videos\` (${columnNames}) VALUES ${chunkPlaceholders}`,
        flatValues
      );
    }

    const providerMap = new Map();
    if (uniqueProviderIds.length > 0) {
      const placeholders = uniqueProviderIds.map(() => '?').join(', ');
      const [videoRows] = await connection.execute(
        `SELECT id, provider_video_id FROM \`affiliate_videos\` WHERE provider_video_id IN (${placeholders})`,
        uniqueProviderIds
      );
      videoRows.forEach(row => providerMap.set(row.provider_video_id, row.id));
    }

    const thumbnailRows = [];
    const categoryLinks = [];
    const pornstarLinks = [];
    const channelLinks = [];

    for (const row of rows) {
      try {
        const providerId = getMappedValue(row, 'provider_video_id');
        const videoId = providerMap.get(providerId);
        if (!videoId) {
          skipped++;
          continue;
        }

        inserted++;

        const thumbValue = getMappedValue(row, 'thumbnail_url');
        if (thumbValue) {
          const thumbs = String(thumbValue)
            .split(';')
            .map(t => t.trim())
            .filter(Boolean);
          thumbs.forEach((thumbUrl, index) => {
            thumbnailRows.push([videoId, thumbUrl, index + 1]);
          });
        }

        const catValue = getMappedValue(row, 'categories');
        if (catValue) {
          const names = catValue.split(';').map(c => c.trim()).filter(Boolean);
          for (const name of names) {
            const categoryId = await getOrCreateId('affiliate_categories', name, categoryCache);
            if (categoryId) {
              categoryLinks.push([videoId, categoryId]);
            }
          }
        }

        const pornValue = getMappedValue(row, 'pornstars');
        if (pornValue) {
          const names = pornValue.split(';').map(p => p.trim()).filter(Boolean);
          for (const name of names) {
            const pornstarId = await getOrCreateId('affiliate_pornstars', name, pornstarCache);
            if (pornstarId) {
              pornstarLinks.push([videoId, pornstarId]);
            }
          }
        }

        const channelValue = getMappedValue(row, 'channels');
        if (channelValue) {
          const names = channelValue.split(';').map(c => c.trim()).filter(Boolean);
          for (const name of names) {
            const channelId = await getOrCreateId('affiliate_channels', name, channelCache);
            if (channelId) {
              channelLinks.push([videoId, channelId]);
            }
          }
        }
      } catch (err) {
        errors.push({ row, error: err.message });
      }
    }

    const insertBulk = async (table, columns, rowsToInsert) => {
      if (rowsToInsert.length === 0) return;
      const chunked = chunkArray(rowsToInsert, 500);
      for (const chunk of chunked) {
        await connection.query(
          `INSERT IGNORE INTO \`${table}\` (${columns}) VALUES ?`,
          [chunk]
        );
      }
    };

    await insertBulk('affiliate_video_thumbnails', 'video_id, thumbnail_url, thumb_order', thumbnailRows);
    await insertBulk('affiliate_video_categories', 'video_id, category_id', categoryLinks);
    await insertBulk('affiliate_video_pornstars', 'video_id, pornstar_id', pornstarLinks);
    await insertBulk('affiliate_video_channels', 'video_id, channel_id', channelLinks);

    await connection.commit();
  } catch (err) {
    if (connection) await connection.rollback();
    errors.push({ error: err.message });
  } finally {
    if (connection) connection.release();
  }

  return {
    success: true,
    message: `Imported ${inserted} videos with related data` + (skipped > 0 ? `, skipped ${skipped} existing` : ''),
    inserted,
    skipped,
    errors: errors.length > 0 ? errors : undefined
  };
};

// Special handler for affiliate_video_thumbnails table
// Accepts URL_THUMB (semicolon-separated) and either video_id or provider_video_id (from ID column)
const handleAffiliateThumbnailsUpload = async (rows, mappedFileColumns) => {
  let inserted = 0;
  let errors = [];

  const getMappedValue = (row, targetCol) => {
    const mappedCol = mappedFileColumns.find(
      m => m.dbColumn.toLowerCase() === targetCol.toLowerCase()
    );
    if (!mappedCol) return null;
    const value = row[mappedCol.original];
    return value !== undefined && value !== '' ? value : null;
  };

  for (const row of rows) {
    try {
      let videoId = getMappedValue(row, 'video_id');

      if (!videoId) {
        const providerVideoId = getMappedValue(row, 'provider_video_id');
        if (providerVideoId) {
          const [videos] = await pool.execute(
            `SELECT id FROM \`affiliate_videos\` WHERE provider_video_id = ?`,
            [providerVideoId]
          );
          if (videos.length > 0) {
            videoId = videos[0].id;
          }
        }
      }

      if (!videoId) {
        errors.push({ row, error: 'Missing video_id or provider_video_id' });
        continue;
      }

      const thumbValue = getMappedValue(row, 'thumbnail_url');
      if (!thumbValue) {
        errors.push({ row, error: 'Missing thumbnail_url' });
        continue;
      }

      const thumbnails = String(thumbValue)
        .split(';')
        .map(t => t.trim())
        .filter(Boolean);

      let order = 1;
      for (const thumbUrl of thumbnails) {
        await pool.execute(
          `INSERT INTO \`affiliate_video_thumbnails\` (video_id, thumbnail_url, thumb_order) VALUES (?, ?, ?)`,
          [videoId, thumbUrl, order]
        );
        order++;
        inserted++;
      }
    } catch (err) {
      errors.push({ row, error: err.message });
      console.error('Error inserting thumbnail:', err);
    }
  }

  return {
    success: true,
    message: `Imported ${inserted} thumbnails`,
    inserted,
    errors: errors.length > 0 ? errors : undefined
  };
};

// Special handler for affiliate_video_pornstars table
// Accepts PORNSTARS (semicolon-separated) and either video_id or provider_video_id (from ID column)
const handleAffiliatePornstarsUpload = async (rows, mappedFileColumns) => {
  let inserted = 0;
  let errors = [];

  const getMappedValue = (row, targetCol) => {
    const mappedCol = mappedFileColumns.find(
      m => m.dbColumn.toLowerCase() === targetCol.toLowerCase()
    );
    if (!mappedCol) return null;
    const value = row[mappedCol.original];
    return value !== undefined && value !== '' ? value : null;
  };

  for (const row of rows) {
    try {
      let videoId = getMappedValue(row, 'video_id');

      if (!videoId) {
        const providerVideoId = getMappedValue(row, 'provider_video_id');
        if (providerVideoId) {
          const [videos] = await pool.execute(
            `SELECT id FROM \`affiliate_videos\` WHERE provider_video_id = ?`,
            [providerVideoId]
          );
          if (videos.length > 0) {
            videoId = videos[0].id;
          }
        }
      }

      if (!videoId) {
        errors.push({ row, error: 'Missing video_id or provider_video_id' });
        continue;
      }

      // If pornstar_id is provided, link directly
      const pornstarIdValue = getMappedValue(row, 'pornstar_id');
      if (pornstarIdValue) {
        await pool.execute(
          `INSERT IGNORE INTO \`affiliate_video_pornstars\` (video_id, pornstar_id) VALUES (?, ?)`,
          [videoId, pornstarIdValue]
        );
        inserted++;
        continue;
      }

      // Otherwise, use PORNSTARS names (semicolon-separated)
      const pornstarsValue = getMappedValue(row, 'pornstars');
      if (!pornstarsValue) {
        errors.push({ row, error: 'Missing pornstar_id or pornstars' });
        continue;
      }

      const pornstarNames = String(pornstarsValue)
        .split(';')
        .map(p => p.trim())
        .filter(Boolean);

      for (const name of pornstarNames) {
        let [pornstars] = await pool.execute(
          `SELECT id FROM \`affiliate_pornstars\` WHERE name = ?`,
          [name]
        );

        let pornstarId;
        if (pornstars.length === 0) {
          const [result] = await pool.execute(
            `INSERT INTO \`affiliate_pornstars\` (name) VALUES (?)`,
            [name]
          );
          pornstarId = result.insertId;
        } else {
          pornstarId = pornstars[0].id;
        }

        await pool.execute(
          `INSERT IGNORE INTO \`affiliate_video_pornstars\` (video_id, pornstar_id) VALUES (?, ?)`,
          [videoId, pornstarId]
        );
        inserted++;
      }
    } catch (err) {
      errors.push({ row, error: err.message });
      console.error('Error inserting pornstars:', err);
    }
  }

  return {
    success: true,
    message: `Imported ${inserted} pornstar links`,
    inserted,
    errors: errors.length > 0 ? errors : undefined
  };
};

// POST /api/admin/upload - Upload and import file data
router.post('/upload', authenticateAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    // Single-file upload always targets affiliate_videos and related tables
    const tableName = 'affiliate_videos';

    // Get table columns
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, EXTRA
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `, [tableName]);

    const requiredColumns = columns
      .filter(col => col.IS_NULLABLE === 'NO' && col.EXTRA !== 'auto_increment')
      .map(col => col.COLUMN_NAME.toLowerCase());

    const allColumns = columns
      .filter(col => col.EXTRA !== 'auto_increment')
      .map(col => col.COLUMN_NAME);

    // Parse file based on extension
    let rows = [];
    const fileExtension = req.file.originalname.split('.').pop().toLowerCase();

    if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      // Parse XLSX
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      rows = xlsx.utils.sheet_to_json(worksheet);
    } else if (fileExtension === 'csv') {
      // Parse CSV/TSV (auto-detect delimiter with fallbacks)
      const rawContent = req.file.buffer.toString('utf8');
      const csvRows = await parseCsvRows(rawContent, requiredColumns);
      rows = csvRows;

      // Validate columns
      if (rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'File is empty'
        });
      }

      // Normalize file columns and map them to database columns
      const fileColumns = Object.keys(rows[0]);
      const mappedFileColumns = fileColumns.map(col => {
        const dbCol = mapColumnName(col);
        return {
          original: col,
          normalized: normalizeColumnName(col),
          dbColumn: dbCol
        };
      });
      
      // Debug: Log the mapping
      console.log('File columns:', fileColumns);
      console.log('Mapped columns:', mappedFileColumns.map(m => `${m.original} -> ${m.dbColumn}`));

      // Handle special case: if #URL maps to video_url but affiliate_url is required and not present,
      // we'll use the same value for both (add a virtual mapping)
      const mappedColumnNames = mappedFileColumns.map(m => m.dbColumn.toLowerCase());
      if (mappedColumnNames.includes('video_url') && !mappedColumnNames.includes('affiliate_url') && 
          requiredColumns.includes('affiliate_url')) {
        // Find the #URL column and add a virtual mapping for affiliate_url
        const urlColumn = mappedFileColumns.find(m => m.dbColumn.toLowerCase() === 'video_url');
        if (urlColumn) {
          mappedFileColumns.push({
            original: urlColumn.original,
            normalized: 'affiliate_url',
            dbColumn: 'affiliate_url'
          });
        }
      }

      // Special handling for affiliate_video_thumbnails table
      if (tableName === 'affiliate_video_thumbnails') {
        const result = await handleAffiliateThumbnailsUpload(
          rows,
          mappedFileColumns
        );
        return res.json(result);
      }

      // Special handling for affiliate_video_pornstars table
      if (tableName === 'affiliate_video_pornstars') {
        const result = await handleAffiliatePornstarsUpload(
          rows,
          mappedFileColumns
        );
        return res.json(result);
      }

      // Check if required columns are present (after mapping)
      const finalMappedColumnNames = mappedFileColumns.map(m => m.dbColumn.toLowerCase());
      const missingColumns = requiredColumns.filter(
        col => !finalMappedColumnNames.includes(col.toLowerCase())
      );

      if (missingColumns.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Not all required columns present',
          missingColumns,
          requiredColumns,
          fileColumns: fileColumns,
          mappedColumns: mappedFileColumns.map(m => `${m.original} -> ${m.dbColumn}`)
        });
      }

      // Insert data - only use columns that exist in the database
      const insertColumns = allColumns.filter(col => 
        finalMappedColumnNames.includes(col.toLowerCase())
      );

      if (insertColumns.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No matching columns found'
        });
      }

      // Special handling for affiliate_videos table
      if (tableName === 'affiliate_videos') {
        const result = await handleAffiliateVideosUpload(rows, mappedFileColumns, allColumns, requiredColumns);
        return res.json(result);
      }

      const placeholders = insertColumns.map(() => '?').join(', ');
      const columnNames = insertColumns.map(col => `\`${col}\``).join(', ');
      let inserted = 0;
      let errors = [];

      for (const row of rows) {
        try {
          const values = insertColumns.map(col => {
            // Find the file column that maps to this database column
            const mappedCol = mappedFileColumns.find(m => 
              m.dbColumn.toLowerCase() === col.toLowerCase()
            );
            if (!mappedCol) return null;
            
            let value = row[mappedCol.original];
            
            // Handle date format conversion (MM/DD/YYYY to DATETIME)
            if (col.toLowerCase() === 'published_at' && value) {
              value = convertDateFormat(value);
            }
            
            return value !== undefined && value !== '' ? value : null;
          });

          await pool.execute(
            `INSERT INTO \`${tableName}\` (${columnNames}) VALUES (${placeholders})`,
            values
          );
          inserted++;
        } catch (err) {
          errors.push({ row, error: err.message });
        }
      }

      return res.json({
        success: true,
        message: `Imported ${inserted} rows`,
        inserted,
        errors: errors.length > 0 ? errors : undefined
      });
    } else {
      return res.status(400).json({
        success: false,
        error: 'Unsupported file format. Only XLSX and CSV are supported.'
      });
    }

    // For XLSX files, validate and insert
    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'File is empty'
      });
    }

    // Normalize file columns and map them to database columns
    const fileColumns = Object.keys(rows[0]);
    const mappedFileColumns = fileColumns.map(col => ({
      original: col,
      normalized: normalizeColumnName(col),
      dbColumn: mapColumnName(col)
    }));

    // Handle special case: if #URL maps to video_url but affiliate_url is required and not present,
    // we'll use the same value for both (add a virtual mapping)
    const mappedColumnNames = mappedFileColumns.map(m => m.dbColumn.toLowerCase());
    if (mappedColumnNames.includes('video_url') && !mappedColumnNames.includes('affiliate_url') && 
        requiredColumns.includes('affiliate_url')) {
      // Find the #URL column and add a virtual mapping for affiliate_url
      const urlColumn = mappedFileColumns.find(m => m.dbColumn.toLowerCase() === 'video_url');
      if (urlColumn) {
        mappedFileColumns.push({
          original: urlColumn.original,
          normalized: 'affiliate_url',
          dbColumn: 'affiliate_url'
        });
      }
    }

    // Special handling for affiliate_video_thumbnails table
    if (tableName === 'affiliate_video_thumbnails') {
      const result = await handleAffiliateThumbnailsUpload(
        rows,
        mappedFileColumns
      );
      return res.json(result);
    }

    // Special handling for affiliate_video_pornstars table
    if (tableName === 'affiliate_video_pornstars') {
      const result = await handleAffiliatePornstarsUpload(
        rows,
        mappedFileColumns
      );
      return res.json(result);
    }

    // Check if required columns are present (after mapping)
    const finalMappedColumnNames = mappedFileColumns.map(m => m.dbColumn.toLowerCase());
    const missingColumns = requiredColumns.filter(
      col => !finalMappedColumnNames.includes(col.toLowerCase())
    );

    if (missingColumns.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Not all required columns present',
        missingColumns,
        requiredColumns,
        fileColumns: fileColumns,
        mappedColumns: mappedFileColumns.map(m => `${m.original} -> ${m.dbColumn}`)
      });
    }

    // Special handling for affiliate_videos table
    if (tableName === 'affiliate_videos') {
      const result = await handleAffiliateVideosUpload(rows, mappedFileColumns, allColumns, requiredColumns);
      return res.json(result);
    }

    // Insert data - only use columns that exist in the database
    const insertColumns = allColumns.filter(col => 
      finalMappedColumnNames.includes(col.toLowerCase())
    );

    if (insertColumns.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No matching columns found'
      });
    }

    const placeholders = insertColumns.map(() => '?').join(', ');
    const columnNames = insertColumns.map(col => `\`${col}\``).join(', ');
    let inserted = 0;
    let errors = [];

    for (const row of rows) {
      try {
        const values = insertColumns.map(col => {
          // Find the file column that maps to this database column
          const mappedCol = mappedFileColumns.find(m => 
            m.dbColumn.toLowerCase() === col.toLowerCase()
          );
          if (!mappedCol) return null;
          
          let value = row[mappedCol.original];
          
          // Handle date format conversion
          if (col.toLowerCase() === 'published_at' && value) {
            value = convertDateFormat(value);
          }
          
          return value !== undefined && value !== '' ? value : null;
        });

        await pool.execute(
          `INSERT INTO \`${tableName}\` (${columnNames}) VALUES (${placeholders})`,
          values
        );
        inserted++;
      } catch (err) {
        errors.push({ row, error: err.message });
      }
    }

    res.json({
      success: true,
      message: `Imported ${inserted} rows`,
      inserted,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload file',
      message: error.message
    });
  }
});

export default router;

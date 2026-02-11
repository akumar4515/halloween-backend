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

// Column mapping (handles # prefix and uppercase - just strips # and maps to lowercase database column names)
// The database columns already match the CSV format (without # prefix)
const columnMapping = {
  // For affiliate_videos table - ID column
  '#id': 'provider_video_id',
  'id': 'provider_video_id',
  'ID': 'provider_video_id',
  '#ID': 'provider_video_id',
  // Embed/iframe
  '#embed': 'iframe_url',
  'embed': 'iframe_url',
  'EMBED': 'iframe_url',
  '#EMBED': 'iframe_url',
  // Video URL
  '#url': 'video_url',
  'url': 'video_url',
  'URL': 'video_url',
  '#URL': 'video_url',
  // Affiliate URL
  '#affiliate_url': 'affiliate_url',
  'affiliate_url': 'affiliate_url',
  'AFFILIATE_URL': 'affiliate_url',
  '#AFFILIATE_URL': 'affiliate_url',
  // Thumbnail URLs
  '#url_thumb': 'thumbnail_url',
  'url_thumb': 'thumbnail_url',
  'URL_THUMB': 'thumbnail_url',
  '#URL_THUMB': 'thumbnail_url',
  '#thumb': 'thumbnail_url',
  'thumb': 'thumbnail_url',
  'THUMB': 'thumbnail_url',
  '#THUMB': 'thumbnail_url',
  '#thumbs': 'thumbnail_url',
  'thumbs': 'thumbnail_url',
  'THUMBS': 'thumbnail_url',
  '#THUMBS': 'thumbnail_url',
  '#thumbnail': 'thumbnail_url',
  'thumbnail': 'thumbnail_url',
  'THUMBNAIL': 'thumbnail_url',
  '#THUMBNAIL': 'thumbnail_url',
  // Title
  '#title': 'title',
  'title': 'title',
  'TITLE': 'title',
  '#TITLE': 'title',
  // Description
  '#description': 'description',
  'description': 'description',
  'DESCRIPTION': 'description',
  '#DESCRIPTION': 'description',
  '#desc': 'description',
  'desc': 'description',
  'DESC': 'description',
  '#DESC': 'description',
  // Channels/Studio
  '#channel': 'channels',
  'channel': 'channels',
  'CHANNEL': 'channels',
  '#CHANNEL': 'channels',
  '#channels': 'channels',
  'channels': 'channels',
  'CHANNELS': 'channels',
  '#CHANNELS': 'channels',
  '#studio': 'channels',
  'studio': 'channels',
  'STUDIO': 'channels',
  '#STUDIO': 'channels',
  '#sname': 'channels',
  'sname': 'channels',
  'SNAME': 'channels',
  '#SNAME': 'channels',
  // Duration
  '#duration': 'duration',
  'duration': 'duration',
  'DURATION': 'duration',
  '#DURATION': 'duration',
  '#dur': 'duration',
  'dur': 'duration',
  'DUR': 'duration',
  '#DUR': 'duration',
  // Embed Duration
  '#duration_embed': 'embed_duration',
  'duration_embed': 'embed_duration',
  'DURATION_EMBED': 'embed_duration',
  '#DURATION_EMBED': 'embed_duration',
  '#embdur': 'embed_duration',
  'embdur': 'embed_duration',
  'EMBDUR': 'embed_duration',
  '#EMBDUR': 'embed_duration',
  // Date
  '#date': 'published_at',
  'date': 'published_at',
  'DATE': 'published_at',
  '#DATE': 'published_at',
  '#dt': 'published_at',
  'dt': 'published_at',
  'DT': 'published_at',
  '#DT': 'published_at',
  // Trailer
  '#trailer': 'trailer_url',
  'trailer': 'trailer_url',
  'TRAILER': 'trailer_url',
  '#TRAILER': 'trailer_url',
  // Categories
  '#cats': 'categories',
  'cats': 'categories',
  'CATS': 'categories',
  '#CATS': 'categories',
  '#categories': 'categories',
  'categories': 'categories',
  'CATEGORIES': 'categories',
  '#CATEGORIES': 'categories',
  // Pornstars
  '#pstarts': 'pornstars',
  'pstarts': 'pornstars',
  'PSTARTS': 'pornstars',
  '#PSTARTS': 'pornstars',
  '#pstars': 'pornstars',
  'pstars': 'pornstars',
  'PSTARS': 'pornstars',
  '#PSTARS': 'pornstars',
  '#pornstars': 'pornstars',
  'pornstars': 'pornstars',
  'PORNSTARS': 'pornstars',
  '#PORNSTARS': 'pornstars',
  // Generic mappings for all tables
  '#name': 'name',
  'name': 'name',
  'NAME': 'name',
  '#NAME': 'name'
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
  
  // Detect delimiter by counting occurrences in first few lines.
  // `|` is the expected column separator for affiliate exports.
  // `;` is used inside cells (thumbnails/categories/pornstars), so do not treat it as a column delimiter.
  const delimiters = ['|', ',', '\t'];
  const delimiterCounts = delimiters.reduce((acc, delim) => {
    acc[delim] = 0;
    return acc;
  }, {});

  for (const line of lines) {
    for (const delim of delimiters) {
      // Escape special regex characters for pipe
      const escapedDelim = delim === '|' ? '\\|' : delim === '\t' ? '\\t' : delim;
      const matches = line.match(new RegExp(escapedDelim, 'g'));
      if (matches) {
        delimiterCounts[delim] += matches.length;
      }
    }
  }

  // Prioritize pipe delimiter if found, otherwise use the most common
  const detectedDelimiter = delimiterCounts['|'] > 0
    ? '|'
    : (Object.entries(delimiterCounts)
        .filter(([delim]) => delim !== '|')
        .sort((a, b) => b[1] - a[1])[0]?.[0] || ',');

  console.log('[CSV Parser] Detected delimiter:', detectedDelimiter, 'Counts:', delimiterCounts);

  // Manual parser for pipe-delimited files (more reliable than csv-parser for pipes)
  const parsePipeDelimited = (content) => {
    const stripWrappingQuotes = (value) => {
      const trimmed = String(value ?? '').trim();
      if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed.slice(1, -1).replace(/""/g, '"').trim();
      }
      return trimmed;
    };

    const unwrapQuotedLine = (line) => {
      const trimmed = String(line ?? '').trim();
      if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed.slice(1, -1);
      }
      return trimmed;
    };

    const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) {
      console.log('[CSV Parser] No lines found in content');
      return [];
    }
    
    const firstLine = lines[0].trim();
    if (!firstLine.includes('|')) {
      console.log('[CSV Parser] First line does not contain pipe delimiter');
      return [];
    }
    
    const headers = firstLine
      .split('|')
      .map(h => stripWrappingQuotes(h).replace(/^\uFEFF/, '').trim())
      .filter(h => h !== '');
    console.log('[CSV Parser] Manual parser found', headers.length, 'headers:', headers);
    
    if (headers.length === 0) {
      console.log('[CSV Parser] No valid headers found');
      return [];
    }
    
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Some generators wrap the entire row in quotes:
      // "col1|col2|col3"
      // unwrap first so `|` splitting remains consistent.
      const unwrappedLine = unwrapQuotedLine(line);
      const values = unwrappedLine.split('|').map(v => stripWrappingQuotes(v));
      if (values.length === 0 || values.every(v => v === '')) continue;
      
      const row = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] !== undefined ? values[idx] : '';
      });
      
      // Only add row if it has at least one non-empty value
      if (Object.values(row).some(val => val !== '')) {
        rows.push(row);
      }
    }
    
    console.log('[CSV Parser] Manual parser created', rows.length, 'rows');
    return rows;
  };

  const parseWithSeparator = async (separator, content) => {
    // Use manual parser for pipe-delimited files
    if (separator === '|') {
      try {
        const rows = parsePipeDelimited(content);
        if (rows.length > 0) {
          console.log('[CSV Parser] Manual pipe parser succeeded, parsed', rows.length, 'rows');
          return rows;
        }
      } catch (err) {
        console.error('[CSV Parser] Manual pipe parser failed:', err.message);
      }
    }
    
    // Fallback to csv-parser for other delimiters
    const rows = [];
    const stream = Readable.from(content);
    await new Promise((resolve, reject) => {
      stream
        .pipe(csv({
          separator: separator,
          skipEmptyLines: true,
          skipLinesWithError: false,
          mapHeaders: ({ header }) => {
            if (!header) return header;
            // Remove BOM and trim
            return header.replace(/^\uFEFF/, '').trim();
          }
        }))
        .on('data', (row) => {
          // Filter out rows where all values are empty
          const hasData = Object.values(row).some(val => val !== undefined && val !== null && String(val).trim() !== '');
          if (hasData) {
            rows.push(row);
          }
        })
        .on('end', resolve)
        .on('error', (err) => {
          console.error('[CSV Parser] Error parsing with separator', separator, ':', err.message);
          reject(err);
        });
    });
    return rows;
  };

  // If pipe delimiter detected, try manual parser FIRST before csv-parser
  if (detectedDelimiter === '|' || delimiterCounts['|'] > 0) {
    console.log('[CSV Parser] Pipe delimiter detected (count:', delimiterCounts['|'], '), using manual parser first...');
    try {
      const manualRows = parsePipeDelimited(rawContent);
      if (manualRows.length > 0) {
        const fileColumns = Object.keys(manualRows[0]);
        // Validate: must have multiple columns and no column should contain pipe character
        const hasMultipleColumns = fileColumns.length > 1;
        const hasInvalidColumn = fileColumns.some(col => col.includes('|'));
        
        console.log('[CSV Parser] Manual parser validation:', {
          rowCount: manualRows.length,
          columnCount: fileColumns.length,
          hasMultipleColumns,
          hasInvalidColumn,
          columns: fileColumns
        });
        
        if (hasMultipleColumns && !hasInvalidColumn) {
          console.log('[CSV Parser] ✓ Manual pipe parser succeeded:', manualRows.length, 'rows,', fileColumns.length, 'columns');
          csvRows = manualRows;
        } else {
          console.log('[CSV Parser] ✗ Manual parser result invalid, will try csv-parser...');
        }
      } else {
        console.log('[CSV Parser] Manual parser returned 0 rows, will try csv-parser...');
      }
    } catch (err) {
      console.error('[CSV Parser] Manual pipe parser error:', err.message, err.stack);
    }
  }

  // If manual parser didn't work or wasn't used, try csv-parser with different separators
  if (csvRows.length === 0) {
    const separatorsToTry = [detectedDelimiter, '|', ',', '\t'].filter(
      (sep, idx, arr) => arr.indexOf(sep) === idx
    );

    for (const sep of separatorsToTry) {
      try {
        const parsedRows = await parseWithSeparator(sep, rawContent);
        if (parsedRows.length === 0) {
          console.log(`[CSV Parser] No rows parsed with separator "${sep}", trying next...`);
          continue;
        }

        const fileColumns = Object.keys(parsedRows[0]);
        console.log(`[CSV Parser] Parsed ${parsedRows.length} rows with separator "${sep}"`);
        console.log('[CSV Parser] File columns:', fileColumns);
        
        // Validate: reject results where column names contain the separator (means it wasn't split properly)
        // Also reject if we only have one column (likely means parsing failed)
        const hasInvalidColumns = fileColumns.some(col => {
          if (sep === '|') {
            // For pipe, check if column contains pipe AND has multiple pipe-separated parts
            return col.includes('|') && col.split('|').length > 2;
          } else {
            return col.includes(sep);
          }
        });
        
        if (hasInvalidColumns || fileColumns.length === 1) {
          console.log(`[CSV Parser] Invalid parsing detected (columns: ${fileColumns.length}, has invalid: ${hasInvalidColumns}), trying next...`);
          continue;
        }
        
        const mappedColumns = fileColumns.map(col => mapColumnName(col).toLowerCase());
        const missingRequired = requiredColumns.filter(
          col => !mappedColumns.includes(col.toLowerCase())
        );
        
        if (missingRequired.length === 0) {
          console.log('[CSV Parser] All required columns found, using separator:', sep);
          csvRows = parsedRows;
          break;
        } else {
          console.log('[CSV Parser] Missing required columns:', missingRequired, 'trying next separator...');
        }
      } catch (err) {
        console.error(`[CSV Parser] Error with separator "${sep}":`, err.message);
        continue;
      }
    }
  }

  // If still empty or missing, try whitespace-delimited fallback
  if (csvRows.length === 0) {
    console.log('[CSV Parser] Trying whitespace-delimited fallback...');
    const whitespaceNormalized = rawContent.replace(/ {2,}/g, '\t');
    try {
      csvRows = await parseWithSeparator('\t', whitespaceNormalized);
    } catch (err) {
      console.error('[CSV Parser] Whitespace fallback failed:', err.message);
    }
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

  const chunkArray = (arr, size) => {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  };

  const hydrateNameCache = async (tableName, nameSet, cache) => {
    if (!nameSet || nameSet.size === 0) return;
    const allNames = [...nameSet].map(n => String(n).trim()).filter(Boolean);
    if (allNames.length === 0) return;

    const nameChunks = chunkArray(allNames, 500);

    // 1) Preload existing IDs in batches.
    for (const chunk of nameChunks) {
      const placeholders = chunk.map(() => '?').join(', ');
      const [existingRows] = await connection.execute(
        `SELECT id, name FROM \`${tableName}\` WHERE name IN (${placeholders})`,
        chunk
      );
      existingRows.forEach(row => cache.set(row.name, row.id));
    }

    // 2) Insert only missing names in bulk.
    const missingNames = allNames.filter(name => !cache.has(name));
    if (missingNames.length > 0) {
      const missingChunks = chunkArray(missingNames, 500);
      for (const chunk of missingChunks) {
        await connection.query(
          `INSERT IGNORE INTO \`${tableName}\` (name) VALUES ?`,
          [chunk.map(name => [name])]
        );
      }

      // 3) Reload IDs for previously missing names.
      for (const chunk of missingChunks) {
        const placeholders = chunk.map(() => '?').join(', ');
        const [rowsAfterInsert] = await connection.execute(
          `SELECT id, name FROM \`${tableName}\` WHERE name IN (${placeholders})`,
          chunk
        );
        rowsAfterInsert.forEach(row => cache.set(row.name, row.id));
      }
    }
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

    // Build unique names first, then resolve IDs in bulk to avoid N+1 queries for large CSV uploads.
    const categoryNameSet = new Set();
    const pornstarNameSet = new Set();
    const channelNameSet = new Set();

    for (const row of rows) {
      const catValue = getMappedValue(row, 'categories');
      if (catValue) {
        String(catValue)
          .split(';')
          .map(name => name.trim())
          .filter(Boolean)
          .forEach(name => categoryNameSet.add(name));
      }

      const pornValue = getMappedValue(row, 'pornstars');
      if (pornValue) {
        String(pornValue)
          .split(';')
          .map(name => name.trim())
          .filter(Boolean)
          .forEach(name => pornstarNameSet.add(name));
      }

      const channelValue = getMappedValue(row, 'channels');
      if (channelValue) {
        String(channelValue)
          .split(';')
          .map(name => name.trim())
          .filter(Boolean)
          .forEach(name => channelNameSet.add(name));
      }
    }

    await hydrateNameCache('affiliate_categories', categoryNameSet, categoryCache);
    await hydrateNameCache('affiliate_pornstars', pornstarNameSet, pornstarCache);
    await hydrateNameCache('affiliate_channels', channelNameSet, channelCache);

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
          const names = String(catValue).split(';').map(c => c.trim()).filter(Boolean);
          for (const name of names) {
            const categoryId = categoryCache.get(name);
            if (categoryId) {
              categoryLinks.push([videoId, categoryId]);
            }
          }
        }

        const pornValue = getMappedValue(row, 'pornstars');
        if (pornValue) {
          const names = String(pornValue).split(';').map(p => p.trim()).filter(Boolean);
          for (const name of names) {
            const pornstarId = pornstarCache.get(name);
            if (pornstarId) {
              pornstarLinks.push([videoId, pornstarId]);
            }
          }
        }

        const channelValue = getMappedValue(row, 'channels');
        if (channelValue) {
          const names = String(channelValue).split(';').map(c => c.trim()).filter(Boolean);
          for (const name of names) {
            const channelId = channelCache.get(name);
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

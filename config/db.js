import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// SSL Configuration for Aiven MySQL
let sslConfig = null;

if (process.env.DB_SSL === 'true' || process.env.DB_SSL === '1') {
  sslConfig = {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
  };

  // Option 1: CA certificate from file path
  if (process.env.DB_CA_CERT_PATH) {
    try {
      const caCertPath = path.resolve(process.env.DB_CA_CERT_PATH);
      sslConfig.ca = fs.readFileSync(caCertPath, 'utf8');
      console.log('[DB] Using CA certificate from file:', caCertPath);
    } catch (err) {
      console.error('[DB] Error reading CA certificate file:', err.message);
      throw new Error('Failed to read CA certificate file');
    }
  }
  // Option 2: CA certificate from environment variable (base64 or direct)
  else if (process.env.DB_CA_CERT) {
    try {
      // Try to decode if it's base64, otherwise use as-is
      let caCert = process.env.DB_CA_CERT;
      if (!caCert.includes('-----BEGIN')) {
        // Assume it's base64 encoded
        caCert = Buffer.from(caCert, 'base64').toString('utf8');
      }
      sslConfig.ca = caCert;
      console.log('[DB] Using CA certificate from environment variable');
    } catch (err) {
      console.error('[DB] Error processing CA certificate:', err.message);
      throw new Error('Failed to process CA certificate');
    }
  }
  // Option 3: Use default Aiven CA certificate location
  else {
    const defaultCaPath = path.resolve('./certs/ca.pem');
    if (fs.existsSync(defaultCaPath)) {
      try {
        sslConfig.ca = fs.readFileSync(defaultCaPath, 'utf8');
        console.log('[DB] Using default CA certificate from:', defaultCaPath);
      } catch (err) {
        console.warn('[DB] Could not read default CA certificate, proceeding without explicit CA');
      }
    } else {
      console.warn('[DB] SSL enabled but no CA certificate provided. Using default SSL configuration.');
    }
  }
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'flovex',
  ssl: sslConfig,
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

// Test connection on startup
pool.getConnection()
  .then(connection => {
    console.log('[DB] Successfully connected to MySQL database');
    connection.release();
  })
  .catch(err => {
    console.error('[DB] Error connecting to MySQL database:', err.message);
    if (err.code === 'ENOTFOUND') {
      console.error('[DB] DNS resolution failed. Check DB_HOST in .env');
    } else if (err.code === 'ECONNREFUSED') {
      console.error('[DB] Connection refused. Check DB_HOST and DB_PORT in .env');
    } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('[DB] Access denied. Check DB_USER and DB_PASSWORD in .env');
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      console.error('[DB] Database does not exist. Check DB_NAME in .env');
    }
  });

export default pool;


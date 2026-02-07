import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultCaPath = path.resolve(__dirname, '..', 'ca.pem');
const caPath = process.env.DB_SSL_CA || defaultCaPath;
const caExists = fs.existsSync(caPath);
const rejectUnauthorizedEnv = process.env.DB_SSL_REJECT_UNAUTHORIZED;
const rejectUnauthorized =
  typeof rejectUnauthorizedEnv === 'string'
    ? rejectUnauthorizedEnv.toLowerCase() === 'true'
    : true;

const sslConfig = process.env.DB_SSL === 'true' || caExists
  ? { rejectUnauthorized, ca: caExists ? fs.readFileSync(caPath) : undefined }
  : undefined;

// Create connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'flovex',
  ssl: sslConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Test connection
pool.getConnection()
  .then(connection => {
    console.log('✅ Database connected successfully');
    connection.release();
  })
  .catch(err => {
    console.error('❌ Database connection error:', err.message);
  });

export default pool;

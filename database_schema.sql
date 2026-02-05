-- =====================================================
-- Halloween Backend Database Schema
-- Complete SQL for all tables
-- =====================================================

-- =====================================================
-- 1. ADMINS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS admins (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('super_admin','admin') DEFAULT 'admin',
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_role (role)
);

-- Insert default super admin
INSERT INTO admins (email, password, role)
VALUES (
  'amankumar22200245@gmail.com',
  '$2b$10$hU3cZ4E9g8KQqYzTgWmXUO3fRzYkZb9Y9nQvW5X7ZqE0RzZ6J6r4a',
  'super_admin'
)
ON DUPLICATE KEY UPDATE email=email;

-- =====================================================
-- 2. CHANNELS TABLE (Created first - no dependencies)
-- =====================================================
CREATE TABLE IF NOT EXISTS channels (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  profile_pic VARCHAR(1000),
  description TEXT,
  is_verified TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_slug (slug),
  INDEX idx_name (name),
  INDEX idx_is_verified (is_verified)
);

-- =====================================================
-- 3. ACTORS TABLE (Created second - no dependencies)
-- =====================================================
CREATE TABLE IF NOT EXISTS actors (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  profile_pic VARCHAR(1000),
  bio TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_slug (slug),
  INDEX idx_name (name)
);

-- =====================================================
-- 4. VIDEOS TABLE (Depends on channels)
-- =====================================================
CREATE TABLE IF NOT EXISTS videos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(500) UNIQUE,
  description TEXT,
  video_url VARCHAR(1000),
  thumbnail_url VARCHAR(1000),
  category VARCHAR(255),
  tags TEXT,
  channel_id BIGINT UNSIGNED,
  is_premium TINYINT(1) DEFAULT 0,
  duration INT UNSIGNED COMMENT 'Duration in seconds',
  views BIGINT UNSIGNED DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL,
  INDEX idx_channel_id (channel_id),
  INDEX idx_category (category),
  INDEX idx_is_premium (is_premium),
  INDEX idx_slug (slug),
  INDEX idx_created_at (created_at),
  FULLTEXT INDEX idx_search (title, description, tags)
);

-- =====================================================
-- 5. VIDEO_ACTORS TABLE (Junction Table - Depends on videos and actors)
-- =====================================================
CREATE TABLE IF NOT EXISTS video_actors (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  video_id BIGINT UNSIGNED NOT NULL,
  actor_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_id) REFERENCES actors(id) ON DELETE CASCADE,
  UNIQUE KEY unique_video_actor (video_id, actor_id),
  INDEX idx_video_id (video_id),
  INDEX idx_actor_id (actor_id)
);

-- =====================================================
-- 6. USERS TABLE (No dependencies)
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  google_id VARCHAR(255) UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  picture VARCHAR(500),
  provider ENUM('google', 'email') DEFAULT 'google',
  subscription ENUM('free', 'premium', 'premium_plus') DEFAULT 'free',
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_google_id (google_id),
  INDEX idx_email (email),
  INDEX idx_provider (provider),
  INDEX idx_subscription (subscription)
);

-- =====================================================
-- 7. WATCH HISTORY TABLE (Depends on users and videos)
-- =====================================================
CREATE TABLE IF NOT EXISTS watch_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  video_id BIGINT UNSIGNED NOT NULL,
  watched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  progress_seconds INT UNSIGNED DEFAULT 0 COMMENT 'How many seconds of the video were watched',
  completed TINYINT(1) DEFAULT 0 COMMENT 'Whether the video was watched to completion',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_video (user_id, video_id),
  INDEX idx_user_id (user_id),
  INDEX idx_video_id (video_id),
  INDEX idx_watched_at (watched_at),
  INDEX idx_completed (completed)
);

-- =====================================================
-- 8. FOLLOWING TABLE (Depends on users)
-- =====================================================
CREATE TABLE IF NOT EXISTS following (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  followable_type ENUM('actor', 'channel') NOT NULL,
  followable_id BIGINT UNSIGNED NOT NULL COMMENT 'ID of the actor or channel being followed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_followable (user_id, followable_type, followable_id),
  INDEX idx_user_id (user_id),
  INDEX idx_followable (followable_type, followable_id),
  INDEX idx_created_at (created_at)
);

-- =====================================================
-- NOTES:
-- =====================================================
-- 1. Tables are created in order to satisfy foreign key dependencies:
--    - channels (no dependencies)
--    - actors (no dependencies)
--    - videos (depends on channels)
--    - video_actors (depends on videos and actors)
--    - users (no dependencies)
--    - watch_history (depends on users and videos)
--    - following (depends on users)
--
-- 2. To run this schema:
--    - Execute this entire file in your MySQL/MariaDB database
--    - Or run each CREATE TABLE statement individually in order
--
-- 3. The admins table includes a default super_admin user.
--    Password hash is for 'flove.admin@00' (update if needed).
--
-- 4. The videos table has a FULLTEXT index for search functionality.
--
-- =====================================================


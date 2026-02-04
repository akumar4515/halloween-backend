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
  INDEX idx_watched_at (watched_at)
);


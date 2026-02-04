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


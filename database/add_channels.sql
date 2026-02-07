USE flovex;

-- Channels table
CREATE TABLE IF NOT EXISTS affiliate_channels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(200) NOT NULL UNIQUE
);

-- Video-Channel relationship table
CREATE TABLE IF NOT EXISTS affiliate_video_channels (
    video_id BIGINT NOT NULL,
    channel_id INT NOT NULL,

    PRIMARY KEY (video_id, channel_id),

    FOREIGN KEY (video_id) REFERENCES affiliate_videos(id)
    ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES affiliate_channels(id)
    ON DELETE CASCADE
);

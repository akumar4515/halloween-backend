USE flovex;

-- Make affiliate_url nullable so it's not required if only video_url is provided
-- This allows #URL to be used for video_url, and affiliate_url can be NULL or same value
ALTER TABLE affiliate_videos MODIFY COLUMN affiliate_url TEXT NULL;

-- The rest of the schema is already correct:
-- #ID → provider_video_id ✓
-- #URL → video_url ✓
-- #EMBED → iframe_url ✓
-- #TITLE → title ✓
-- #DESCRIPTION → description ✓
-- #DURATION → duration ✓
-- #DURATION_EMBED → embed_duration ✓
-- #DATE → published_at ✓
-- #TRAILER → trailer_url ✓

-- Note: The column names in the database already match the CSV mapping (without # prefix)
-- The admin.js file will handle stripping the # prefix and mapping correctly.

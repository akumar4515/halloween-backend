# Eporner API Integration

Focused integration for videos, search, and thumbnails/frames.

## Base URL
All endpoints are prefixed with `/api/eporner`

---

## 📹 Video Endpoints

### 1. Search Videos
**GET** `/api/eporner/videos/search`

Search for videos using Eporner API.

**Query Parameters:**
- `query` (string) - Search term
- `page` (number, default: 1) - Page number
- `per_page` (number, default: 30) - Results per page
- `order` (string) - Sort order (e.g., "latest", "mostviewed", "toprated")
- `thumbsize` (string, default: "big") - Thumbnail size: "big", "medium", "small"

**Example:**
```bash
GET /api/eporner/videos/search?query=test&page=1&per_page=20&thumbsize=big
```

**Response:**
```json
{
  "success": true,
  "data": {
    "videos": [...],
    "count": 100,
    "page": 1
  }
}
```

### 2. Get Video List
**GET** `/api/eporner/videos`

Get a list of videos from Eporner.

**Query Parameters:**
- `page` (number)
- `per_page` (number)
- `order` (string)
- `thumbsize` (string)

**Example:**
```bash
GET /api/eporner/videos?page=1&per_page=30&order=latest&thumbsize=big
```

### 3. Get Video by ID
**GET** `/api/eporner/videos/:id`

Get detailed information about a specific video with thumbnail.

**Path Parameters:**
- `id` (number) - Video ID

**Query Parameters:**
- `thumbsize` (string) - Thumbnail size

**Example:**
```bash
GET /api/eporner/videos/12345?thumbsize=big
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 12345,
    "title": "Video Title",
    "thumb": "https://...",
    "default_thumb": "https://...",
    "duration": 1200,
    "views": 50000
  }
}
```

---

## 🖼️ Thumbnail & Frame Endpoints

### 1. Get Video Thumbnail
**GET** `/api/eporner/thumbnails/video/:id`

Get thumbnail URL for a specific video.

**Path Parameters:**
- `id` (number) - Video ID

**Query Parameters:**
- `size` (string, default: "big") - "big", "medium", "small"

**Example:**
```bash
GET /api/eporner/thumbnails/video/12345?size=big
```

**Response:**
```json
{
  "success": true,
  "data": {
    "video_id": 12345,
    "thumbnail_url": "https://...",
    "size": "big"
  }
}
```

### 2. Get Video Frame
**GET** `/api/eporner/frames/video/:id`

Get a specific frame from a video. Falls back to thumbnail if frame endpoint is not available.

**Path Parameters:**
- `id` (number) - Video ID

**Query Parameters:**
- `frame` (string, default: "1") - Frame number or timestamp
- `size` (string, default: "big") - Thumbnail size

**Example:**
```bash
GET /api/eporner/frames/video/12345?frame=5&size=big
```

**Response:**
```json
{
  "success": true,
  "data": {
    "video_id": 12345,
    "frame_number": "5",
    "frame_url": "https://...",
    "note": "Returned thumbnail as frame (frame endpoint may not be available)"
  }
}
```

---

## Configuration

Add to your `.env` file:

```env
EPORNER_BASE_URL=https://www.eporner.com
DEBUG_EPORNER=true  # Optional: Enable debug logging
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "success": false,
  "error": "Error message",
  "message": "Detailed error message",
  "status": 500
}
```

**Common Status Codes:**
- `200` - Success
- `404` - Not found
- `500` - Server error
- `502` - Eporner API error

---

## Usage Examples

### Search for videos:
```bash
GET /api/eporner/videos/search?query=test&page=1&per_page=20&thumbsize=big
```

### Get video with thumbnail:
```bash
GET /api/eporner/videos/12345?thumbsize=big
```

### Get video thumbnail:
```bash
GET /api/eporner/thumbnails/video/12345?size=big
```

### Get video frame:
```bash
GET /api/eporner/frames/video/12345?frame=10&size=medium
```

---

## Notes

- All video endpoints include thumbnail support via `thumbsize` parameter
- Thumbnail sizes: "big", "medium", "small"
- Frame endpoint falls back to thumbnail if frame API is not available
- All responses include a `success` boolean field
- Data is wrapped in a `data` field for consistency


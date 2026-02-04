# User API Documentation

All user routes require authentication. Include the JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Watch History APIs

### 1. Add/Update Watch History
**POST** `/user/watch-history`

Add a video to watch history or update existing record.

**Request Body:**
```json
{
  "video_id": 123,
  "progress_seconds": 300,
  "completed": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "Watch history added",
  "data": {
    "id": 1,
    "user_id": 1,
    "video_id": 123,
    "watched_at": "2024-01-01T12:00:00.000Z",
    "progress_seconds": 300,
    "completed": 0,
    "created_at": "2024-01-01T12:00:00.000Z"
  }
}
```

### 2. Get Watch History
**GET** `/user/watch-history?page=1&limit=50`

Get paginated list of user's watch history.

**Query Parameters:**
- `page` (optional, default: 1)
- `limit` (optional, default: 50)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "video": {
        "id": 123,
        "title": "Video Title",
        "slug": "video-slug",
        "thumbnail_url": "https://...",
        "channel": {
          "id": 1,
          "name": "Channel Name",
          "slug": "channel-slug"
        }
      },
      "progress_seconds": 300,
      "completed": false,
      "watched_at": "2024-01-01T12:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "totalPages": 2
  }
}
```

### 3. Get Watch History for Specific Video
**GET** `/user/watch-history/:video_id`

Get watch history for a specific video.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "user_id": 1,
    "video_id": 123,
    "watched_at": "2024-01-01T12:00:00.000Z",
    "progress_seconds": 300,
    "completed": false
  }
}
```

### 4. Remove Video from Watch History
**DELETE** `/user/watch-history/:video_id`

Remove a specific video from watch history.

**Response:**
```json
{
  "success": true,
  "message": "Watch history removed"
}
```

### 5. Clear All Watch History
**DELETE** `/user/watch-history`

Clear all watch history for the user.

**Response:**
```json
{
  "success": true,
  "message": "All watch history cleared"
}
```

## Follow/Unfollow APIs

### 1. Follow Actor or Channel
**POST** `/user/follow`

Follow an actor or channel.

**Request Body:**
```json
{
  "type": "actor",
  "id": 123
}
```
or
```json
{
  "type": "channel",
  "id": 456
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully followed actor",
  "data": {
    "id": 1,
    "user_id": 1,
    "followable_type": "actor",
    "followable_id": 123,
    "created_at": "2024-01-01T12:00:00.000Z"
  }
}
```

### 2. Unfollow Actor or Channel
**DELETE** `/user/follow`

Unfollow an actor or channel.

**Request Body:**
```json
{
  "type": "actor",
  "id": 123
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully unfollowed actor"
}
```

### 3. Get All Following
**GET** `/user/following?type=actor&page=1&limit=50`

Get paginated list of all followed actors and channels.

**Query Parameters:**
- `type` (optional) - Filter by "actor" or "channel"
- `page` (optional, default: 1)
- `limit` (optional, default: 50)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "type": "actor",
      "item": {
        "id": 123,
        "name": "Actor Name",
        "slug": "actor-slug",
        "profile_pic": "https://...",
        "description": "Actor bio"
      },
      "followed_at": "2024-01-01T12:00:00.000Z"
    },
    {
      "id": 2,
      "type": "channel",
      "item": {
        "id": 456,
        "name": "Channel Name",
        "slug": "channel-slug",
        "profile_pic": "https://...",
        "description": "Channel description"
      },
      "followed_at": "2024-01-01T12:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 25,
    "totalPages": 1
  }
}
```

### 4. Check if Following
**GET** `/user/following/:type/:id`

Check if user is following a specific actor or channel.

**Example:** `/user/following/actor/123`

**Response:**
```json
{
  "success": true,
  "is_following": true,
  "data": {
    "id": 1,
    "user_id": 1,
    "followable_type": "actor",
    "followable_id": 123,
    "created_at": "2024-01-01T12:00:00.000Z"
  }
}
```

## Error Responses

All endpoints may return the following error responses:

**401 Unauthorized:**
```json
{
  "error": "No token provided"
}
```
or
```json
{
  "error": "Invalid or expired token"
}
```

**400 Bad Request:**
```json
{
  "error": "video_id is required"
}
```

**404 Not Found:**
```json
{
  "error": "Video not found"
}
```

**403 Forbidden:**
```json
{
  "error": "Account is deactivated"
}
```

## Authentication

All routes require a valid JWT token obtained from:
- `POST /auth/google/verify` (after Google OAuth)
- `GET /auth/google/callback` (OAuth redirect flow)

Include the token in the Authorization header:
```
Authorization: Bearer <jwt-token>
```


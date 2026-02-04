# Google OAuth Setup Guide

This guide will help you set up Google OAuth authentication for your application.

## Prerequisites

1. A Google Cloud Platform account
2. Access to Google Cloud Console

## Step 1: Create OAuth 2.0 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth client ID**
5. If prompted, configure the OAuth consent screen:
   - Choose **External** (unless you have a Google Workspace)
   - Fill in the required information (App name, User support email, etc.)
   - Add your email to test users
   - Save and continue through the scopes (default is fine)
6. For Application type, choose **Web application**
7. Configure:
   - **Name**: Your app name (e.g., "Halloween Backend")
   - **Authorized JavaScript origins**: 
     - `http://localhost:3000` (for development)
     - Your production domain (e.g., `https://yourdomain.com`)
   - **Authorized redirect URIs**:
     - `http://localhost:3000/auth/google/callback` (for development)
     - `https://yourdomain.com/auth/google/callback` (for production)
8. Click **Create**
9. Copy the **Client ID** and **Client Secret**

## Step 2: Configure Environment Variables

Add these variables to your `.env` file:

```env
# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback

# JWT Secret (generate a strong random string)
JWT_SECRET=your-super-secret-jwt-key-change-this

# Base URL (for OAuth redirects)
BASE_URL=http://localhost:3000

# Frontend URL (where users will be redirected after login)
FRONTEND_URL=http://localhost:3000
```

## Step 3: Create Users Table

Run the SQL migration to create the users table:

```sql
-- Execute migrations/create_users_table.sql in your database
```

Or run it manually:

```sql
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  google_id VARCHAR(255) UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  picture VARCHAR(500),
  provider ENUM('google', 'email') DEFAULT 'google',
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_google_id (google_id),
  INDEX idx_email (email)
);
```

## Step 4: API Endpoints

### 1. Initiate Google OAuth Flow
**GET** `/auth/google`

Redirects user to Google login page.

### 2. OAuth Callback
**GET** `/auth/google/callback?code=...`

Handles the OAuth callback from Google. Automatically creates or updates user in database and redirects to frontend with JWT token.

### 3. Verify Google ID Token (Alternative Method)
**POST** `/auth/google/verify`

Body:
```json
{
  "idToken": "google-id-token-here"
}
```

Response:
```json
{
  "success": true,
  "token": "jwt-token-here",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "User Name",
    "picture": "https://..."
  }
}
```

### 4. Get Current User
**GET** `/auth/me`

Headers:
```
Authorization: Bearer <jwt-token>
```

Response:
```json
{
  "success": true,
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "User Name",
    "picture": "https://...",
    "provider": "google",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

## Step 5: Frontend Integration

### Option A: Server-Side Redirect Flow

1. Redirect user to: `GET /auth/google`
2. User authenticates with Google
3. Google redirects to: `/auth/google/callback`
4. Backend redirects to: `FRONTEND_URL/auth/callback?token=...&success=true`
5. Frontend extracts token from URL and stores it

### Option B: Client-Side Flow (for SPAs)

1. Use Google Sign-In JavaScript library
2. Get ID token from Google
3. Send to: `POST /auth/google/verify` with `{ idToken: "..." }`
4. Receive JWT token and user info
5. Store token in localStorage or cookies

## Testing

1. Start your server
2. Navigate to `http://localhost:3000/auth/google`
3. Complete Google authentication
4. You should be redirected back with a token

## Troubleshooting

### "redirect_uri_mismatch" Error
- Ensure the redirect URI in Google Console exactly matches `GOOGLE_REDIRECT_URI` in your `.env`
- Include protocol (http/https) and port number

### "invalid_client" Error
- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct
- Ensure OAuth consent screen is configured

### Token Verification Fails
- Check that `JWT_SECRET` is set and consistent
- Verify token hasn't expired (default: 7 days)

## Security Notes

1. **Never commit** `.env` file to version control
2. Use strong, random `JWT_SECRET` in production
3. Use HTTPS in production
4. Implement rate limiting for auth endpoints
5. Consider adding refresh token rotation


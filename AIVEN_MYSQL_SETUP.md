# Aiven MySQL Setup Guide

This guide explains how to configure your backend to connect to Aiven MySQL with SSL/TLS.

## Prerequisites

1. An Aiven MySQL service instance
2. Connection details from Aiven console

## Step 1: Get Connection Details from Aiven

1. Log in to [Aiven Console](https://console.aiven.io/)
2. Select your MySQL service
3. Go to **Overview** tab
4. Copy the connection details:
   - **Host** (e.g., `your-service.a.aivencloud.com`)
   - **Port** (usually `25060` or similar)
   - **Database name**
   - **Username**
   - **Password**

## Step 2: Download CA Certificate

1. In Aiven Console, go to your MySQL service
2. Click on **Connection information** or **Overview**
3. Download the **CA certificate** (usually named `ca.pem` or `ca-certificate.crt`)
4. Save it to your project directory (e.g., `./certs/ca.pem`)

## Step 3: Configure Environment Variables

Add these to your `.env` file:

```env
# Aiven MySQL Connection
DB_HOST=your-service.a.aivencloud.com
DB_PORT=25060
DB_USER=avnadmin
DB_PASSWORD=your-password-here
DB_NAME=defaultdb

# SSL Configuration
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true

# Option 1: CA Certificate from file path
DB_CA_CERT_PATH=./certs/ca.pem

# OR Option 2: CA Certificate as environment variable (base64 encoded)
# DB_CA_CERT=LS0tLS1CRUdJTi... (base64 encoded certificate)

# Connection Pool Settings
DB_CONNECTION_LIMIT=10
```

## Step 4: Certificate Setup Options

### Option A: Certificate File (Recommended)

1. Create a `certs` directory in your project root:
   ```bash
   mkdir certs
   ```

2. Copy the CA certificate file to `certs/ca.pem`

3. Set in `.env`:
   ```env
   DB_CA_CERT_PATH=./certs/ca.pem
   ```

4. Add `certs/` to `.gitignore`:
   ```
   certs/
   *.pem
   *.crt
   ```

### Option B: Environment Variable

1. Convert certificate to base64:
   ```bash
   # On Linux/Mac
   base64 -i ca.pem
   
   # On Windows PowerShell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("ca.pem"))
   ```

2. Set in `.env`:
   ```env
   DB_CA_CERT=LS0tLS1CRUdJTi... (paste base64 string)
   ```

## Step 5: Verify Connection

Start your server and check the console logs:

```
[DB] Using CA certificate from file: ./certs/ca.pem
[DB] Successfully connected to MySQL database
```

If you see connection errors, check:
- CA certificate path is correct
- SSL is enabled (`DB_SSL=true`)
- Host, port, username, and password are correct
- Firewall allows connections to Aiven

## Troubleshooting

### Error: "ENOTFOUND"
- **Cause**: Invalid hostname
- **Solution**: Verify `DB_HOST` in `.env`

### Error: "ECONNREFUSED"
- **Cause**: Wrong port or host
- **Solution**: Check `DB_PORT` and `DB_HOST` in Aiven console

### Error: "ER_ACCESS_DENIED_ERROR"
- **Cause**: Wrong username or password
- **Solution**: Verify credentials in Aiven console

### Error: "ER_BAD_DB_ERROR"
- **Cause**: Database doesn't exist
- **Solution**: Check `DB_NAME` matches Aiven database name

### Error: "SSL connection error"
- **Cause**: CA certificate not found or invalid
- **Solution**: 
  - Verify `DB_CA_CERT_PATH` points to correct file
  - Or set `DB_CA_CERT` with base64 encoded certificate
  - Ensure certificate file is readable

### Error: "self signed certificate"
- **Cause**: Certificate validation issue
- **Solution**: Set `DB_SSL_REJECT_UNAUTHORIZED=true` (default)

## Security Notes

1. **Never commit certificates to git** - Add to `.gitignore`
2. **Use environment variables** for sensitive data
3. **Keep certificates secure** - Restrict file permissions
4. **Rotate credentials** regularly in Aiven console

## Example .env File

```env
# Server
PORT=3000

# Aiven MySQL
DB_HOST=your-service.a.aivencloud.com
DB_PORT=25060
DB_USER=avnadmin
DB_PASSWORD=your-secure-password
DB_NAME=defaultdb
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
DB_CA_CERT_PATH=./certs/ca.pem
DB_CONNECTION_LIMIT=10

# JWT
JWT_SECRET=your-jwt-secret-key

# Google OAuth (if using)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
```

## Testing Connection

You can test the connection by starting your server:

```bash
npm start
```

Look for:
- `[DB] Successfully connected to MySQL database` - ✅ Success
- Any error messages - ❌ Check configuration


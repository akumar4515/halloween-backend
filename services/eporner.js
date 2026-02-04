const DEFAULT_BASE_URL = 'https://www.eporner.com';

function toQueryString(params = {}) {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    usp.set(k, String(v));
  });
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export class EpornerApiError extends Error {
  constructor(message, { status, url, body } = {}) {
    super(message);
    this.name = 'EpornerApiError';
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

export async function epornerGet(pathname, query = {}) {
  const baseUrl = process.env.EPORNER_BASE_URL || DEFAULT_BASE_URL;
  const url = `${baseUrl}${pathname}${toQueryString(query)}`;

  if (process.env.DEBUG_EPORNER === 'true') {
    console.log(`[Eporner API] Fetching: ${url}`);
  }

  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: { 
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': baseUrl,
        'Origin': baseUrl
      },
      // Add timeout
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    const contentType = resp.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const body = isJson ? await resp.json().catch(() => null) : await resp.text().catch(() => null);

    if (process.env.DEBUG_EPORNER === 'true') {
      console.log(`[Eporner API] Status: ${resp.status}, Content-Type: ${contentType}`);
      if (body && typeof body === 'object') {
        console.log(`[Eporner API] Response keys:`, Object.keys(body));
        console.log(`[Eporner API] Response preview:`, JSON.stringify(body).substring(0, 500));
      }
    }

    if (!resp.ok) {
      throw new EpornerApiError('Eporner API request failed', {
        status: resp.status,
        url,
        body,
      });
    }

    // Log if body is null/undefined for debugging
    if (!body && process.env.DEBUG_EPORNER === 'true') {
      console.warn(`[Eporner API] Response body is null/undefined for ${url}`);
    }

    return body;
  } catch (err) {
    // Log the error for debugging
    console.error(`[Eporner API] Error fetching ${url}:`, {
      name: err.name,
      message: err.message,
      stack: err.stack?.substring(0, 200)
    });
    
    // Handle connection errors
    if (err.name === 'AbortError' || err.message.includes('timeout')) {
      throw new EpornerApiError('Request timeout - Eporner API did not respond', {
        status: 504,
        url,
        body: { error: 'Connection timeout' }
      });
    }
    
    if (err.message.includes('ECONNREFUSED') || err.message.includes('refused to connect')) {
      throw new EpornerApiError('Connection refused - Eporner API may be unavailable or endpoint is incorrect', {
        status: 503,
        url,
        body: { 
          error: 'Connection refused',
          message: 'The API endpoint may be incorrect or the service may be down. Check EPORNER_BASE_URL in .env'
        }
      });
    }
    
    if (err.message.includes('ENOTFOUND') || err.message.includes('getaddrinfo')) {
      throw new EpornerApiError('DNS resolution failed - Invalid domain or network issue', {
        status: 503,
        url,
        body: { error: 'DNS resolution failed' }
      });
    }
    
    // Re-throw EpornerApiError as-is
    if (err instanceof EpornerApiError) {
      throw err;
    }
    
    // Wrap other errors
    throw new EpornerApiError(`Network error: ${err.message}`, {
      status: 503,
      url,
      body: { error: err.message }
    });
  }
}


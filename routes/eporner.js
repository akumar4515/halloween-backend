import { Router } from 'express';
import { epornerGet, EpornerApiError } from '../services/eporner.js';

const router = Router();

/**
 * Eporner API v2 Endpoints
 * Focused on: Videos, Search, and Thumbnails
 */
// Try multiple endpoint patterns - Eporner API structure may vary
const EP_PATHS = {
  // Standard v2 API paths
  videoSearch: '/api/v2/video/search/',
  videoById: '/api/v2/video/id/',
  videoList: '/api/v2/video/list/',
  // Alternative paths (without trailing slash)
  videoSearchAlt: '/api/v2/video/search',
  videoByIdAlt: '/api/v2/video/id',
  videoListAlt: '/api/v2/video/list',
  // Alternative API structure
  videoSearchAlt2: '/api/video/search/',
  videoByIdAlt2: '/api/video/id/',
};

// Helper function to extract video URL from Eporner response
function extractVideoUrl(video) {
  if (!video) return null;
  
  try {
    // Eporner API typically returns embed URLs or iframe HTML strings
    // Try various possible fields for video URL
    let url = video.mp4 || video.webm || video.hls || video.stream ||
              video.embed || video.url || video.src || video.video_url || null;
    
    if (!url) return null;
    
    // If it's an iframe HTML string, extract the src attribute
    const urlStr = String(url);
    if (urlStr.includes('<iframe')) {
      const iframeMatch = urlStr.match(/<iframe[^>]*\s+src=["']([^"']+)["'][^>]*>/i);
      if (iframeMatch && iframeMatch[1]) {
        url = iframeMatch[1];
      }
    }
    
    // If it's an eporner embed URL, ensure it's in the correct format
    if (url && url.includes('eporner.com/embed')) {
      // Extract video ID from embed URL if needed
      const embedMatch = url.match(/eporner\.com\/embed\/([^\/\s"']+)/i);
      if (embedMatch && embedMatch[1]) {
        return `https://www.eporner.com/embed/${embedMatch[1]}`;
      }
      // If already a full URL, return it
      if (url.startsWith('http')) {
        return url;
      }
      // If relative, make it absolute
      if (url.startsWith('/embed')) {
        return `https://www.eporner.com${url}`;
      }
    }
    
    return url;
  } catch (err) {
    console.error('[Eporner API] Error extracting video URL:', err);
    return null;
  }
}

// Helper function to extract thumbnail URL from Eporner response
function extractThumbnailUrl(video, size = 'big') {
  if (!video) return null;
  
  // Try various possible fields for thumbnail
  const thumb = video.thumb || video.default_thumb || video.thumbnail || 
                video[`thumb_${size}`] || video[`thumbnail_${size}`] ||
                video.poster || video.cover || null;
  
  // Handle object thumbs like { size, width, height, src }
  if (thumb && typeof thumb === 'object' && thumb.src) {
    return thumb.src;
  }

  // Handle array thumbs like [{ size, src }, ...]
  if (Array.isArray(video.thumbs) && video.thumbs.length > 0) {
    const match = video.thumbs.find((t) => t?.size === size) || video.thumbs[0];
    if (match?.src) return match.src;
  }

  return thumb;
}

// Helper function to format video data with URLs
function formatVideoData(video, size = 'big') {
  if (!video) return null;
  
  try {
    const videoUrl = extractVideoUrl(video);
    const embedUrl = video.embed || (video.raw && video.raw.embed) || null;
    const thumbnailUrl = extractThumbnailUrl(video, size);
    
    // Determine if this is an embed URL (for iframe) or direct video file
    const isEmbedUrl = (embedUrl || videoUrl) && (
      videoUrl.includes('/embed') || 
      videoUrl.includes('eporner.com/embed') ||
      (!videoUrl.match(/\.(mp4|webm|ogg|mov|m3u8|avi|mkv)(\?|$)/i))
    );
    
    return {
      id: video.id || video.video_id,
      title: video.title || video.name,
      description: video.description || video.desc,
      duration: video.duration || video.length,
      views: video.views || video.view_count,
      rating: video.rating || video.rate,
      video_url: videoUrl,
      embed_url: isEmbedUrl ? (embedUrl || videoUrl) : null, // Separate embed URL field
      thumbnail_url: thumbnailUrl,
      // Include all original data for reference
      raw: video
    };
  } catch (err) {
    console.error('[Eporner API] Error formatting video data:', err, 'Video:', video);
    // Return a minimal valid object if formatting fails
    return {
      id: video.id || video.video_id || null,
      title: video.title || video.name || 'Untitled',
      video_url: null,
      embed_url: null,
      thumbnail_url: null,
      raw: video
    };
  }
}

// ==================== VIDEO ROUTES ====================

// GET /api/eporner/videos/search?query=...&page=...&per_page=...&order=...&thumbsize=...
router.get('/videos/search', async (req, res) => {
  try {
    const query = {
      ...req.query,
      thumbsize: req.query.thumbsize || 'big', // big, medium, small
    };
    
    // Try multiple endpoint patterns
    const endpoints = [
      EP_PATHS.videoSearch,
      EP_PATHS.videoSearchAlt,
      EP_PATHS.videoSearchAlt2,
    ];
    
    let data = null;
    let lastError = null;
    const errors = [];
    
    for (const endpoint of endpoints) {
      try {
        data = await epornerGet(endpoint, query);
        if (data) {
          console.log(`[Eporner API] Success with endpoint: ${endpoint}`);
          break; // Success, exit loop
        }
      } catch (err) {
        lastError = err;
        const errorInfo = {
          endpoint,
          status: err.status,
          message: err.message,
          url: err.url
        };
        errors.push(errorInfo);
        console.error(`[Eporner API] Endpoint ${endpoint} failed:`, errorInfo);
        continue;
      }
    }
    
    if (!data) {
      console.error('[Eporner API] All video search endpoints failed. Errors:', errors);
      // Return empty array instead of throwing error to prevent frontend crashes
      return res.status(200).json({
        success: true,
        data: {
          videos: [],
          count: 0,
          page: parseInt(req.query.page) || 1,
          per_page: parseInt(req.query.per_page) || 30,
          query: req.query.query,
          note: 'No videos found. Eporner API endpoints may be unavailable or incorrect.'
        }
      });
    }
    
    // Format the response to ensure video_url and thumbnail_url are present
    let formattedData = data;
    
    try {
      // If data has videos array, format each video
      if (data?.videos && Array.isArray(data.videos)) {
        formattedData = {
          ...data,
          videos: data.videos.map(video => formatVideoData(video, query.thumbsize))
        };
      } else if (Array.isArray(data)) {
        // If data is directly an array
        formattedData = data.map(video => formatVideoData(video, query.thumbsize));
      } else if (data?.data && Array.isArray(data.data)) {
        // If data is nested in data field
        formattedData = {
          ...data,
          data: data.data.map(video => formatVideoData(video, query.thumbsize))
        };
      } else if (data && typeof data === 'object') {
        // Single video object
        formattedData = formatVideoData(data, query.thumbsize);
      }
    } catch (formatError) {
      console.error('[Eporner API] Error formatting video data:', formatError);
      // Return raw data if formatting fails
      formattedData = data;
    }
    
    return res.status(200).json({
      success: true,
      data: formattedData
    });
  } catch (err) {
    // Catch-all error handler - ensure we always return a response
    console.error('[Eporner API] Unexpected error in /videos/search route:', err);
    console.error('[Eporner API] Error stack:', err.stack);
    
    // Always return a valid JSON response, never let it go to global error handler
    return res.status(200).json({
      success: true,
      data: {
        videos: [],
        count: 0,
        page: parseInt(req.query?.page) || 1,
        per_page: parseInt(req.query?.per_page) || 30,
        query: req.query?.query,
        error: 'An error occurred while searching videos',
        message: err?.message || 'Unknown error',
        details: process.env.DEBUG_EPORNER === 'true' ? err.stack : undefined
      }
    });
  }
});

// GET /api/eporner/videos - Get list of videos
router.get('/videos', async (req, res) => {
  // Use a wrapper to ensure we always return a response
  try {
    const query = {
      ...req.query,
      thumbsize: req.query.thumbsize || 'big',
    };
    
    // Try multiple endpoint patterns
    const endpoints = [
      EP_PATHS.videoList,
      EP_PATHS.videoListAlt,
    ];
    
    let data = null;
    let lastError = null;
    const errors = [];
    
    for (const endpoint of endpoints) {
      try {
        data = await epornerGet(endpoint, query);
        if (data) {
          console.log(`[Eporner API] Success with endpoint: ${endpoint}`);
          // Log data structure for debugging
          if (process.env.DEBUG_EPORNER === 'true') {
            console.log(`[Eporner API] Data type:`, typeof data, 'Is array:', Array.isArray(data), 'Keys:', data && typeof data === 'object' ? Object.keys(data) : 'N/A');
          }
          break;
        } else {
          // Data is null/undefined/falsy but no error thrown
          const errorInfo = {
            endpoint,
            status: 'no_data',
            message: 'Endpoint returned null/undefined/falsy data',
            url: `${process.env.EPORNER_BASE_URL || 'https://www.eporner.com'}${endpoint}`
          };
          errors.push(errorInfo);
          console.warn(`[Eporner API] Endpoint ${endpoint} returned no data:`, errorInfo);
        }
      } catch (err) {
        lastError = err;
        const errorInfo = {
          endpoint,
          status: err?.status,
          message: err?.message || String(err),
          url: err?.url
        };
        errors.push(errorInfo);
        console.error(`[Eporner API] Endpoint ${endpoint} failed:`, errorInfo);
        continue;
      }
    }
    
    if (!data) {
      console.error('[Eporner API] All video list endpoints failed. Errors:', errors);
      // Try using search endpoint as fallback for list (since list endpoint may not exist)
      console.log('[Eporner API] Attempting fallback to search endpoint with order=latest...');
      try {
        // Use search endpoint with order parameter to get latest videos
        const fallbackQuery = { 
          ...query, 
          order: query.order || 'latest',
          per_page: query.per_page || 30
        };
        const fallbackData = await epornerGet(EP_PATHS.videoSearch, fallbackQuery);
        if (fallbackData) {
          console.log('[Eporner API] Fallback to search endpoint succeeded');
          data = fallbackData;
        }
      } catch (fallbackErr) {
        console.error('[Eporner API] Fallback to search endpoint also failed:', fallbackErr.message);
      }
    }
    
    if (!data) {
      // Return empty array instead of throwing error to prevent frontend crashes
      return res.status(200).json({
        success: true,
        data: {
          videos: [],
          count: 0,
          page: parseInt(req.query.page) || 1,
          per_page: parseInt(req.query.per_page) || 30,
          note: 'No videos found. Eporner API endpoints may be unavailable or incorrect.',
          errors: errors
        }
      });
    }
    
    // Format the response
    let formattedData = data;
    
    try {
      if (data?.videos && Array.isArray(data.videos)) {
        formattedData = {
          ...data,
          videos: data.videos.map(video => formatVideoData(video, query.thumbsize)).filter(v => v !== null)
        };
      } else if (Array.isArray(data)) {
        formattedData = data.map(video => formatVideoData(video, query.thumbsize)).filter(v => v !== null);
      } else if (data?.data && Array.isArray(data.data)) {
        formattedData = {
          ...data,
          data: data.data.map(video => formatVideoData(video, query.thumbsize)).filter(v => v !== null)
        };
      } else if (data && typeof data === 'object') {
        const formatted = formatVideoData(data, query.thumbsize);
        formattedData = formatted || data;
      }
    } catch (formatError) {
      console.error('[Eporner API] Error formatting video data:', formatError);
      // Return empty videos array if formatting fails completely
      formattedData = {
        videos: [],
        count: 0,
        page: parseInt(req.query.page) || 1,
        per_page: parseInt(req.query.per_page) || 30
      };
    }
    
    return res.status(200).json({
      success: true,
      data: formattedData
    });
  } catch (err) {
    // Catch-all error handler - ensure we always return a response
    console.error('[Eporner API] Unexpected error in /videos route:', err);
    console.error('[Eporner API] Error stack:', err.stack);
    
    // Always return a valid JSON response, never let it go to global error handler
    return res.status(200).json({
      success: true,
      data: {
        videos: [],
        count: 0,
        page: parseInt(req.query?.page) || 1,
        per_page: parseInt(req.query?.per_page) || 30,
        error: 'An error occurred while fetching videos',
        message: err?.message || 'Unknown error',
        details: process.env.DEBUG_EPORNER === 'true' ? err.stack : undefined
      }
    });
  }
});

// GET /api/eporner/videos/:id - Get video by ID with thumbnail
router.get('/videos/:id', async (req, res, next) => {
  try {
    const query = {
      ...req.query,
      id: req.params.id,
      thumbsize: req.query.thumbsize || 'big',
    };
    
    // Try multiple endpoint patterns
    const endpoints = [
      EP_PATHS.videoById,
      EP_PATHS.videoByIdAlt,
      EP_PATHS.videoByIdAlt2,
    ];
    
    let data = null;
    let lastError = null;
    const errors = [];
    
    for (const endpoint of endpoints) {
      try {
        data = await epornerGet(endpoint, query);
        if (data) {
          console.log(`[Eporner API] Success with endpoint: ${endpoint}`);
          break;
        }
      } catch (err) {
        lastError = err;
        const errorInfo = {
          endpoint,
          status: err.status,
          message: err.message,
          url: err.url
        };
        errors.push(errorInfo);
        console.error(`[Eporner API] Endpoint ${endpoint} failed:`, errorInfo);
        continue;
      }
    }
    
    if (!data) {
      console.error('[Eporner API] All video by ID endpoints failed. Errors:', errors);
      return res.status(404).json({
        success: false,
        error: 'Video not found',
        message: lastError?.message || 'All video by ID endpoints failed',
        video_id: req.params.id,
        errors: errors
      });
    }
    
    // Format the video data to ensure video_url and thumbnail_url are present
    const formattedData = formatVideoData(data, query.thumbsize);
    
    return res.json({
      success: true,
      data: formattedData
    });
  } catch (err) {
    if (err instanceof EpornerApiError) {
      return res.status(err.status || 500).json({
        success: false,
        error: 'Failed to fetch video',
        message: err.message,
        status: err.status
      });
    }
    return next(err);
  }
});

// ==================== THUMBNAIL/FRAME ROUTES ====================

// GET /api/eporner/thumbnails/video/:id?size=big|medium|small
router.get('/thumbnails/video/:id', async (req, res, next) => {
  try {
    const size = req.query.size || 'big';
    const query = {
      id: req.params.id,
      thumbsize: size,
    };
    const data = await epornerGet(EP_PATHS.videoById, query);
    
    // Extract thumbnail URL using the helper function
    const thumbnail = extractThumbnailUrl(data, size);
    
    if (thumbnail) {
      return res.json({
        success: true,
        data: {
          video_id: req.params.id,
          thumbnail_url: thumbnail,
          size: size
        }
      });
    }
    
    return res.status(404).json({
      success: false,
      error: 'Thumbnail not found for this video',
      debug: process.env.DEBUG_EPORNER === 'true' ? { raw_data: data } : undefined
    });
  } catch (err) {
    if (err instanceof EpornerApiError) {
      return res.status(err.status || 500).json({
        success: false,
        error: 'Failed to fetch thumbnail',
        message: err.message,
        status: err.status
      });
    }
    return next(err);
  }
});

// GET /api/eporner/frames/video/:id?frame=... - Get specific frame from video
router.get('/frames/video/:id', async (req, res, next) => {
  try {
    const frame = req.query.frame || '1'; // Frame number or timestamp
    const query = {
      id: req.params.id,
      frame: frame,
      thumbsize: req.query.size || 'big',
    };
    
    // Try to get frame - Eporner may have a frame endpoint
    // If not available, return thumbnail as fallback
    try {
      const data = await epornerGet(EP_PATHS.videoById, query);
      const frameUrl = data?.frame || data?.frames?.[frame] || 
                       data?.thumb || data?.default_thumb || null;
      
      if (frameUrl) {
        return res.json({
          success: true,
          data: {
            video_id: req.params.id,
            frame_number: frame,
            frame_url: frameUrl
          }
        });
      }
    } catch (err) {
      // Fallback to thumbnail if frame endpoint doesn't exist
      console.log('Frame endpoint not available, using thumbnail as fallback');
    }
    
    // Fallback: return thumbnail
    const queryThumb = {
      id: req.params.id,
      thumbsize: req.query.size || 'big',
    };
    const videoData = await epornerGet(EP_PATHS.videoById, queryThumb);
    const thumbnail = videoData?.thumb || videoData?.default_thumb || null;
    
    if (thumbnail) {
      return res.json({
        success: true,
        data: {
          video_id: req.params.id,
          frame_number: frame,
          frame_url: thumbnail,
          note: 'Returned thumbnail as frame (frame endpoint may not be available)'
        }
      });
    }
    
    return res.status(404).json({
      success: false,
      error: 'Frame/thumbnail not found'
    });
  } catch (err) {
    if (err instanceof EpornerApiError) {
      return res.status(err.status || 500).json({
        success: false,
        error: 'Failed to fetch frame',
        message: err.message,
        status: err.status
      });
    }
    return next(err);
  }
});

// GET /api/eporner/test - Test connectivity to Eporner API
router.get('/test', async (req, res) => {
  const baseUrl = process.env.EPORNER_BASE_URL || 'https://www.eporner.com';
  const testEndpoints = [
    '/api/v2/video/search/',
    '/api/v2/video/search',
    '/api/video/search/',
    '/',
  ];

  const results = [];
  
  for (const endpoint of testEndpoints) {
    try {
      const url = `${baseUrl}${endpoint}`;
      const resp = await fetch(url, {
        method: 'GET',
        headers: { 
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(10000),
      });
      
      const contentType = resp.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      const body = isJson ? await resp.json().catch(() => null) : await resp.text().catch(() => null);
      
      results.push({
        endpoint,
        url,
        status: resp.status,
        ok: resp.ok,
        contentType,
        hasData: !!body,
        success: resp.ok
      });
    } catch (err) {
      results.push({
        endpoint,
        error: err.message,
        errorType: err.name,
        success: false
      });
    }
  }

  res.json({
    baseUrl,
    message: 'Connectivity test results',
    results: results,
    note: 'If all endpoints fail, check EPORNER_BASE_URL in .env or verify Eporner API availability'
  });
});

// Error handler
router.use((err, req, res, next) => {
  if (err instanceof EpornerApiError) {
    const statusCode = err.status || 502;
    return res.status(statusCode).json({
      success: false,
      error: 'Eporner API error',
      message: err.message,
      status: err.status,
      url: err.url,
      details: err.body,
      troubleshooting: {
        checkBaseUrl: 'Verify EPORNER_BASE_URL in .env file',
        checkConnectivity: 'Test endpoint: GET /api/eporner/test',
        checkApiStatus: 'Verify Eporner API is accessible',
        enableDebug: 'Set DEBUG_EPORNER=true in .env for detailed logs'
      }
    });
  }
  return next(err);
});

export default router;


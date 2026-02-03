/**
 * Cloudflare Pages Function - API Proxy
 * Proxies requests to Alhijaz API to bypass CORS restrictions
 * 
 * Route: /api/* -> https://jadwal.miqot.com/jadwal/*
 */

export async function onRequest(context) {
  const { request, params } = context;
  
  // Get the path segments after /api/
  const pathSegments = params.path || [];
  const path = pathSegments.join('/');
  
  // Build target URL
  const targetUrl = `https://jadwal.miqot.com/jadwal/${path}`;
  
  try {
    // Forward the request to the target server
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        // Don't forward host header
      },
    });

    // Get the response body
    const data = await response.text();

    // Return response with CORS headers
    return new Response(data, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=60', // Cache for 1 minute
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Proxy error', message: error.message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}

// Handle CORS preflight requests
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

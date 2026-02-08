/**
 * Cloudflare Pages Function — Proxy for /brosur/* requests
 * Forwards to jadwal.miqot.com and returns the response with proper CORS headers.
 */
export const onRequest = async (context: { request: Request }) => {
  const { request } = context;
  const url = new URL(request.url);

  // Rebuild the target URL: /brosur/xyz → https://jadwal.miqot.com/brosur/xyz
  const targetUrl = `https://jadwal.miqot.com${url.pathname}${url.search}`;

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0',
        'Accept': request.headers.get('Accept') || '*/*',
      },
    });

    // Clone the response and add CORS headers
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', '*');

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: newHeaders });
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (error) {
    return new Response('Proxy error', { status: 502 });
  }
};

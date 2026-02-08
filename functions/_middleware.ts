/**
 * Cloudflare Pages Middleware — Dynamic Meta Tags for Agent Slugs
 * 
 * WhatsApp/social crawlers don't execute JS, so document.title changes
 * are invisible to them. This middleware intercepts HTML responses and
 * injects the correct <title>, <meta description>, and OG tags based
 * on the URL slug BEFORE the HTML is sent to the client/crawler.
 */

// Agent data (duplicated from src/data/agents.ts because CF Functions
// run in a separate Workers runtime and can't import Vite source files)
const AGENTS: Record<string, { name: string; website: string; phone: string }> = {
  'bagas': {
    name: 'Bagas Pramudita',
    website: 'alhijazindonesia.com',
    phone: '6287878573311',
  },
  'nila': {
    name: 'Nila Novita Sari',
    website: 'alhijaztourtravels.com',
    phone: '6285211209049',
  },
};

export const onRequest = async (context: { request: Request; next: () => Promise<Response> }) => {
  const response = await context.next();
  const url = new URL(context.request.url);

  // Only process HTML responses (not JS, CSS, images, etc.)
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }

  // Extract slug from path (e.g., /bagas → bagas)
  const slug = url.pathname.replace(/^\/+/, '').split('/')[0].toLowerCase();
  const agent = AGENTS[slug];

  // No matching agent → return response as-is
  if (!agent) {
    return response;
  }

  // Build dynamic meta values
  const newTitle = `Jadwal Umroh Alhijaz | ${agent.name}`;
  const newDescription = `Dapatkan info lengkap paket umrah Alhijaz Indowisata bersama ${agent.name}. Klik untuk konsultasi via WhatsApp.`;
  const pageUrl = url.href;

  // Read original HTML and inject dynamic meta tags
  let html = await response.text();

  // Replace <title>
  html = html.replace(
    /<title>[^<]*<\/title>/i,
    `<title>${newTitle}</title>`
  );

  // Replace <meta name="description">
  html = html.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${newDescription}" />`
  );

  // Inject Open Graph tags (for richer link previews)
  const ogTags = `
    <meta property="og:title" content="${newTitle}" />
    <meta property="og:description" content="${newDescription}" />
    <meta property="og:url" content="${pageUrl}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Alhijaz Indowisata" />
  `;

  // Insert OG tags before </head>
  html = html.replace('</head>', `${ogTags}</head>`);

  // Return modified HTML
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};

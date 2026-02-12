/**
 * Cloudflare Pages Middleware — Dynamic Meta Tags for Agent Slugs
 * 
 * WhatsApp/social crawlers don't execute JS, so document.title changes
 * are invisible to them. This middleware intercepts HTML responses and
 * injects the correct <title>, <meta description>, OG tags, and og:image
 * based on the URL slug BEFORE the HTML is sent to the client/crawler.
 */

// Agent data (duplicated from src/data/agents.ts because CF Functions
// run in a separate Workers runtime and can't import Vite source files)
const AGENTS: Record<string, { name: string; website: string; phone: string }> = {
  'bagas':       { name: 'Bagas Pramudita',     website: 'alhijazindonesia.com',        phone: '6287878573311' },
  'nikita':      { name: 'Nikita',              website: 'alhijazindonesia.com',        phone: '62822900020' },
  'nila':        { name: 'Nila Novita Sari',    website: 'alhijaztourtravels.com',      phone: '6285211209049' },
  'andra':       { name: 'Andra Olivia',        website: 'travelalhijazwisata.com',     phone: '628129909795' },
  'dyah':        { name: 'Dyah Ratna Witri',    website: 'alhijaztraveltours.com',      phone: '6281385975678' },
  'widi':        { name: 'Widi Purwanti',       website: 'alhijaz-hajiumroh.com',       phone: '6287820813228' },
  'aulia':       { name: 'Aulia',                website: 'alhijazumrohtravel.com',      phone: '6282110407229' },
  'selfiah':     { name: 'Selfiah Handayani',   website: 'alhijaztourtravel.co.id',     phone: '6281410478212' },
  'zakia':       { name: 'Rahima Zakia',        website: 'alhijazbirowisata.com',       phone: '6285158005623' },
  'dianwahyuni': { name: 'Dian Wahyuni',        website: 'alhijazindowisatatours.com',  phone: '6283197968407' },
  'anne':        { name: 'Anne Suryani',        website: 'hajialhijaz.com',             phone: '628129953424' },
  'evi':         { name: 'Evi Chaniago',        website: 'alhijazbirohajiumroh.com',    phone: '6281806742789' },
  'yenita':      { name: 'Yenita',              website: 'alhijazumrahtravel.com',      phone: '6281316803128' },
  'indah':       { name: 'Indah Permata',       website: 'alhijaztraveltour.com',       phone: '6281943631008' },
  'aisyah':      { name: 'Siti Aisyah',         website: 'travelalhijazumrah.com',      phone: '6281225600900' },
  'siska':       { name: 'Siska Fadia',         website: 'alhijazumroh.com',            phone: '6281188885291' },
  'linda':       { name: 'Nurlinda Dewi',       website: 'alhijazcallcenter.com',       phone: '6282112094089' },
};

export const onRequest = async (context: { request: Request; next: () => Promise<Response> }) => {
  const url = new URL(context.request.url);

  // ── Domain redirect: miqot.com → alhijaz.co ──
  // Handles both miqot.com and www.miqot.com, preserves full path + query
  const host = url.hostname.replace(/^www\./, '');
  if (host === 'miqot.com') {
    const destination = `https://alhijaz.co${url.pathname}${url.search}`;
    return Response.redirect(destination, 301);
  }

  const response = await context.next();

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
  const ogImageUrl = `${url.origin}/og/${slug}.png`;

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

  // Remove existing OG tags from index.html (to avoid duplicates)
  html = html.replace(/<meta\s+property="og:[^"]*"\s+content="[^"]*"\s*\/?>\s*/gi, '');

  // Inject fresh Open Graph + Twitter Card tags
  const metaTags = `
    <meta property="og:title" content="${newTitle}" />
    <meta property="og:description" content="${newDescription}" />
    <meta property="og:url" content="${pageUrl}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Alhijaz Indowisata" />
    <meta property="og:image" content="${ogImageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${newTitle}" />
    <meta name="twitter:description" content="${newDescription}" />
    <meta name="twitter:image" content="${ogImageUrl}" />
  `;

  // Insert before </head>
  html = html.replace('</head>', `${metaTags}</head>`);

  // Return modified HTML
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};

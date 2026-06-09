/**
 * Cloudflare Pages Function — Single Package OG Meta Tags
 * Served at /:slug/:packageId (e.g., /nikita/JBU1500)
 *
 * For bot/crawler requests (WhatsApp, Facebook, Twitter, etc.):
 *   Fetches the SPA HTML via context.next(), then injects proper
 *   OG meta tags with the package name + agent name.
 *
 * For regular browser requests:
 *   Passes through to the SPA unchanged.
 */

const AGENTS: Record<string, { name: string }> = {
  'bagas':       { name: 'Bagas Pramudita' },
  'nikita':      { name: 'Nikita' },
  'nila':        { name: 'Nila Novita Sari' },
  'andra':       { name: 'Andra Olivia' },
  'dyah':        { name: 'Dyah Ratna Witri' },
  'widi':        { name: 'Widi Purwanti' },
  'aulia':       { name: 'Aulia' },
  'selfiah':     { name: 'Selfiah Handayani' },
  'zakia':       { name: 'Rahima Zakia' },
  'dianwahyuni': { name: 'Dian Wahyuni' },
  'anne':        { name: 'Anne Suryani' },
  'evi':         { name: 'Evi Chaniago' },
  'yenita':      { name: 'Yenita' },
  'indah':       { name: 'Indah Permata' },
  'aisyah':      { name: 'Siti Aisyah' },
  'siska':       { name: 'Siska Fadia' },
  'linda':       { name: 'Nurlinda Dewi' },
  'nina':        { name: 'Nina' },
  'sari':        { name: 'Sari' },
  'isti':        { name: 'Isti' },
  'ferra':       { name: 'Ferra' },
  'jan-praba':   { name: 'Jan Praba' },
  'ekawati':     { name: 'Ekawati' },
};

// Known second-segment routes that are NOT package IDs
const KNOWN_ROUTES = ['kalkulasi', 'compare', 'umroh', 'haji', 'capi'];

const BOT_UA_PATTERN = /WhatsApp|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|Googlebot|bingbot/i;

interface ApiResponse {
  status: string;
  aaData: Array<{
    jadwal_id: string;
    jadwal_nama: string;
    maskapai: string;
    berangkat_tgl: string;
    paket_harga: Record<string, Record<string, string>>;
  }>;
}

// paket_harga is NESTED per tier: { "<TIER>": { Quard, Triple, Double, Single, Infant } }.
// "mulai" = cheapest ADULT room (Quard/Triple/Double) across all tiers — mirrors
// getMinimumPrice in src/services/data-service.ts. Single and Infant are excluded so
// we never advertise a misleadingly low infant fare. (The previous version typed this
// flat and ran Number() over the per-tier objects → NaN → price was always dropped.)
function formatPrice(harga: Record<string, Record<string, string>>): string {
  let min: number | null = null;
  for (const tier of Object.values(harga || {})) {
    if (!tier || typeof tier !== 'object') continue;
    for (const room of [tier.Quard, tier.Triple, tier.Double]) {
      const n = Number(room);
      if (Number.isFinite(n) && n > 0 && (min === null || n < min)) min = n;
    }
  }
  if (min === null) return '';
  const jt = (min / 1_000_000).toFixed(1).replace('.0', '');
  return `Rp ${jt} Jt`;
}

function extractDuration(nama: string, berangkatTgl: string, pulangTgl?: string): string {
  const match = nama.match(/(\d+)\s*HR\b/i);
  if (match) return `${match[1]} Hari`;
  return '';
}

export const onRequest: PagesFunction<{}> = async (context) => {
  const slug = (context.params.slug as string || '').toLowerCase();
  const packageId = (context.params.packageId as string || '');

  // Skip if this is a known route (not a package ID)
  if (KNOWN_ROUTES.includes(packageId.toLowerCase())) {
    return context.next();
  }

  // Skip if slug is not a known agent
  if (!AGENTS[slug]) {
    return context.next();
  }

  // For regular browsers, serve the SPA as-is
  const ua = context.request.headers.get('user-agent') || '';
  if (!BOT_UA_PATTERN.test(ua)) {
    return context.next();
  }

  // ── Bot/crawler request: inject OG meta tags ──
  const agent = AGENTS[slug];

  // Fetch package data from API
  let packageName = '';
  let price = '';
  let duration = '';
  try {
    const res = await fetch('https://jadwal.alhijaz.co/jadwal/api-get/1448', {
      headers: { 'Accept': 'application/json' },
    });
    if (res.ok) {
      const data: ApiResponse = await res.json();
      const pkg = data.aaData.find(p => p.jadwal_id === packageId);
      if (pkg) {
        packageName = pkg.jadwal_nama;
        price = formatPrice(pkg.paket_harga);
        duration = extractDuration(pkg.jadwal_nama, pkg.berangkat_tgl);
      }
    }
  } catch {
    // API fetch failed — proceed with fallback
  }

  // If package not found, fall through to SPA
  if (!packageName) {
    return context.next();
  }

  // Build meta content
  const title = `${packageName} | ${agent.name} — Alhijaz Indowisata`;
  const descParts = [`Paket ${packageName}`];
  if (duration) descParts.push(duration);
  if (price) descParts.push(`mulai ${price}`);
  descParts.push(`bersama ${agent.name}. Alhijaz Indowisata`);
  const description = descParts.join(', ');
  const url = `https://alhijaz.co/${slug}/${packageId}`;

  // Get the original SPA HTML and inject meta tags
  const response = await context.next();
  const html = await response.text();

  const updatedHtml = html
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
      `<meta name="description" content="${escapeAttr(description)}">`
    )
    .replace(
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:title" content="${escapeAttr(title)}">`
    )
    .replace(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:description" content="${escapeAttr(description)}">`
    )
    .replace(
      /<meta\s+property="og:site_name"/,
      `<meta property="og:url" content="${escapeAttr(url)}">\n    <meta property="og:site_name"`
    );

  return new Response(updatedHtml, {
    status: response.status,
    headers: {
      ...Object.fromEntries(response.headers.entries()),
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

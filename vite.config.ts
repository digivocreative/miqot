import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import { VitePWA } from 'vite-plugin-pwa'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
// @ts-expect-error — shared JS module (no types); same prompts as server.js
import { buildAiCopyPrompts, buildAiCopyChatBody, parseAiCopyVersions } from './lib/ai-copy-prompt.js'
// @ts-expect-error — shared JS module used by the production server too
import { TOP_PARTNER_ENDPOINT, sanitizePartnerRows } from './lib/top-partner.js'
// @ts-expect-error — shared JS module used by the production server too
import { mirrorTopPartnerPhotos, normalizeBunnyDownloadUrl } from './lib/top-partner-bunny.js'

dotenv.config()

const topPartnerSupabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null

const TOP_PARTNER_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
let topPartnerDevMemory: { partners: unknown[]; syncedAt: string | null } | null = null;

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Git commit info for version tracking
// 1) Check CI/CD environment variables first
// 2) Fall back to git commands
// 3) Fall back to 'unknown'
let commitHash = process.env.CF_PAGES_COMMIT_SHA?.slice(0, 7)
  || process.env.COMMIT_REF?.slice(0, 7)
  || process.env.GITHUB_SHA?.slice(0, 7)
  || process.env.COMMIT_SHA?.slice(0, 7)
  || ''
let commitMessage = process.env.COMMIT_MSG || ''

if (!commitHash) {
  try {
    commitHash = execSync('git rev-parse --short HEAD').toString().trim()
    commitMessage = execSync('git log -1 --pretty=%s').toString().trim()
  } catch {
    commitHash = 'unknown'
  }
}

// https://vite.dev/config/

// Vite plugin: serve /:slug/umroh landing page in dev server
function umrohLandingDevPlugin() {
  return {
    name: 'umroh-landing-dev',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        // Match /:slug/umroh (with optional trailing slash)
        const match = req.url?.match(/^\/([a-z0-9]+)\/umroh\/?(\?.*)?$/i);
        if (!match) return next();

        const slug = match[1].toLowerCase();
        try {
          // Dynamically import the function module (TS handled by Vite)
          const mod = await server.ssrLoadModule('/functions/[slug]/umroh.ts');
          // Build a minimal context matching Cloudflare Pages function signature
          const result = await mod.onRequest({
            params: { slug },
            request: new Request(`http://localhost${req.url}`),
          });
          const html = await result.text();
          res.writeHead(result.status, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
        } catch (err: any) {
          console.error('umroh-landing-dev error:', err);
          next();
        }
      });
    },
  };
}

// Vite plugin: serve /:slug/haji landing page in dev server
function hajiLandingDevPlugin() {
  return {
    name: 'haji-landing-dev',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        // Match /:slug/haji (with optional trailing slash)
        const match = req.url?.match(/^\/([a-z0-9-]+)\/haji\/?(\?.*)?$/i);
        if (!match) return next();

        const slug = match[1].toLowerCase();
        try {
          const mod = await server.ssrLoadModule('/functions/[slug]/haji.ts');
          const result = await mod.onRequest({
            params: { slug },
            request: new Request(`http://localhost${req.url}`),
          });
          const html = await result.text();
          res.writeHead(result.status, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
        } catch (err: any) {
          console.error('haji-landing-dev error:', err);
          next();
        }
      });
    },
  };
}

// Vite plugin: handle /api/ai-copy in dev server (proxies to OpenAI)
function aiCopyDevPlugin() {
  return {
    name: 'ai-copy-dev',
    configureServer(server: any) {
      server.middlewares.use('/api/ai-copy', async (req: any, res: any) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          });
          return res.end();
        }

        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Method not allowed' }));
        }

        const OPENAI_KEY = process.env.OPENAI_API_KEY;
        if (!OPENAI_KEY) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'OPENAI_API_KEY not set in .env' }));
        }

        // Read request body
        let body = '';
        for await (const chunk of req) body += chunk;
        const parsed = JSON.parse(body);

        const prompts = buildAiCopyPrompts(parsed);
        if (!prompts) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Missing packageData or monthData' }));
        }
        try {
          const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${OPENAI_KEY}`,
            },
            body: JSON.stringify(buildAiCopyChatBody(prompts)),
          });

          if (!openaiRes.ok) {
            const errBody = await openaiRes.text();
            console.error('OpenAI error:', errBody);
            res.writeHead(502, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'OpenAI API error', details: errBody }));
          }

          const result = await openaiRes.json();
          const versions = parseAiCopyVersions(result.choices?.[0]?.message?.content || '');
          if (versions.length === 0) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'OpenAI API error', details: 'Empty or malformed completion' }));
          }
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ versions, text: versions[0].text }));
        } catch (err: any) {
          console.error('AI Copy dev error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal error', message: err.message }));
        }
      });
    },
  };
}

// Vite plugin: proxy /api/capi/* to local Express server.
// Keeping CAPI on the real backend avoids drift between dev and production.
function capiDevPlugin() {
  return {
    name: 'capi-dev-proxy',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (!req.url?.startsWith('/api/capi/')) return next();

        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          });
          return res.end();
        }

        try {
          const headers: Record<string, string> = {};
          if (req.headers['content-type']) headers['Content-Type'] = String(req.headers['content-type']);
          if (req.headers.authorization) headers.Authorization = String(req.headers.authorization);

          let body: string | undefined;
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            body = '';
            for await (const chunk of req) body += chunk;
          }

          const upstream = await fetch(`http://localhost:3000${req.url}`, {
            method: req.method,
            headers,
            body,
          });
          const text = await upstream.text();
          res.writeHead(upstream.status, {
            'Content-Type': upstream.headers.get('content-type') || 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          return res.end(text);
        } catch (err: any) {
          res.writeHead(502, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          return res.end(JSON.stringify({
            error: 'Express server not reachable for CAPI routes',
            message: err.message,
          }));
        }
      });
    },
  };
}

// Vite plugin: proxy /api/analytics/* to local Express server
function analyticsDevPlugin() {
  return {
    name: 'analytics-dev-proxy',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (!req.url?.startsWith('/api/analytics')) return next();
        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (req.headers.authorization) headers['Authorization'] = req.headers.authorization;
          let body: string | undefined;
          if (req.method === 'POST') {
            body = '';
            for await (const chunk of req) body += chunk;
          }
          const upstream = await fetch(`http://localhost:3000${req.url}`, {
            method: req.method,
            headers,
            body: body || undefined,
          });
          const data = await upstream.text();
          res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
          res.end(data);
        } catch (err: any) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Express server not reachable', message: err.message }));
        }
      });
    },
  };
}

async function topPartnerBunnyFileExists(path: string, cdnHostname: string) {
  try {
    const res = await fetch(`https://${cdnHostname}/${path}`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const bytes = Number(res.headers.get('content-length') || '0');
    return !bytes || bytes > 512;
  } catch {
    return false;
  }
}

function topPartnerBunnyDeps() {
  const apiKey = process.env.BUNNY_STORAGE_API_KEY || '';
  const zone = process.env.BUNNY_STORAGE_ZONE || '';
  const storageHostname = process.env.BUNNY_STORAGE_HOSTNAME || 'storage.bunnycdn.com';
  const cdnHostname = process.env.BUNNY_CDN_HOSTNAME || '';

  return {
    enabled: !!(apiKey && zone && cdnHostname),
    cdnHostname,
    async fileExists(path: string) {
      return topPartnerBunnyFileExists(path, cdnHostname);
    },
    async downloadFile(url: string) {
      const normalizedUrl = normalizeBunnyDownloadUrl(url);
      const res = await fetch(normalizedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      return {
        buffer: Buffer.from(await res.arrayBuffer()),
        contentType: res.headers.get('content-type') || 'application/octet-stream',
      };
    },
    async uploadFile(path: string, buffer: Buffer, contentType?: string) {
      const res = await fetch(`https://${storageHostname}/${zone}/${path}`, {
        method: 'PUT',
        headers: {
          'AccessKey': apiKey,
          'Content-Type': contentType || 'application/octet-stream',
        },
        body: buffer,
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) throw new Error(`Bunny upload failed: ${res.status} ${res.statusText}`);
    },
    logger: console,
  };
}

function isTopPartnerCacheFresh(syncedAt: string | null | undefined) {
  const ts = Date.parse(syncedAt || '');
  return Number.isFinite(ts) && Date.now() - ts < TOP_PARTNER_REFRESH_INTERVAL_MS;
}

async function loadTopPartnerDevCache() {
  if (topPartnerDevMemory?.partners?.length) return topPartnerDevMemory;
  if (!topPartnerSupabase) return null;

  const { data, error } = await topPartnerSupabase
    .from('top_partners_cache')
    .select('data, synced_at')
    .eq('id', 'partners')
    .maybeSingle();

  if (error || !data || !Array.isArray(data.data) || data.data.length === 0) return null;
  topPartnerDevMemory = { partners: data.data, syncedAt: data.synced_at || null };
  return topPartnerDevMemory;
}

function sendTopPartnerDevResponse(
  res: any,
  payload: { partners: unknown[]; syncedAt: string | null; cached?: boolean },
) {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({
    success: true,
    partners: payload.partners,
    syncedAt: payload.syncedAt,
    cached: payload.cached === true,
    dev: true,
  }));
}

async function persistTopPartnerDevCache(partners: unknown[], syncedAt: string) {
  topPartnerDevMemory = { partners, syncedAt };
  if (!topPartnerSupabase) return;
  const { error } = await topPartnerSupabase.from('top_partners_cache').upsert(
    { id: 'partners', data: partners, synced_at: syncedAt },
    { onConflict: 'id' }
  );
  if (error) console.warn('[TopPartner/dev] Supabase cache upsert failed:', error.message);
}

function topPartnerDevPlugin() {
  return {
    name: 'top-partner-dev',
    configureServer(server: any) {
      server.middlewares.use('/api/top-partner', async (req: any, res: any) => {
        if (req.method !== 'GET') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Method not allowed' }));
        }

        try {
          const cached = await loadTopPartnerDevCache();
          if (cached?.partners?.length && isTopPartnerCacheFresh(cached.syncedAt)) {
            return sendTopPartnerDevResponse(res, { ...cached, cached: true });
          }

          const upstream = await fetch(TOP_PARTNER_ENDPOINT, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; AlhijazTopPartnerDev/1.0)',
              'Referer': 'https://alhijazindowisata.com/jadwal/',
            },
          });
          if (!upstream.ok) throw new Error(`dataagen.php ${upstream.status}`);
          const raw = await upstream.json();
          const rows = Array.isArray(raw?.aaData) ? raw.aaData : Array.isArray(raw?.data) ? raw.data : [];
          const sanitized = sanitizePartnerRows(rows).slice(0, 20);
          const partners = await mirrorTopPartnerPhotos(sanitized, topPartnerBunnyDeps());
          const syncedAt = new Date().toISOString();
          await persistTopPartnerDevCache(partners, syncedAt);
          return sendTopPartnerDevResponse(res, { partners, syncedAt, cached: false });
        } catch (err: any) {
          res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: 'Gagal mengambil data partner', message: err.message }));
        }
      });
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(commitHash),
    __APP_COMMIT_MSG__: JSON.stringify(commitMessage),
  },
  plugins: [
    umrohLandingDevPlugin(),
    hajiLandingDevPlugin(),
    aiCopyDevPlugin(),
    analyticsDevPlugin(),
    topPartnerDevPlugin(),
    capiDevPlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Alhijaz Indowisata',
        short_name: 'Alhijaz',
        description: 'Jadwal Paket Umroh Alhijaz Indowisata',
        theme_color: '#001427',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4 MiB — @react-pdf/renderer enlarges the bundle
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        // Force new SW to take over immediately
        skipWaiting: true,
        clientsClaim: true,
        // Serve the precached shell instantly for in-app navigations (no network
        // round-trip for HTML). SW only registers on alhijaz.co, where the SPA
        // derives the agent from the URL path — so the generic shell is correct.
        // The denylist routes still hit the server (OG/SSR injection, landing
        // pages, portal-jamaah meta, dashboard auth shell).
        navigateFallback: '/index.html',
        // Don't cache API responses in SW
        navigateFallbackDenylist: [/^\/api/, /\/umroh\/?$/, /\/haji\/?$/, /\/bio\/?$/, /^\/bio\/?$/, /\/brosur/, /\/itinerary/, /^\/agents\//, /^\/login/, /^\/dashboard/, /^\/f\//, /\/jamaah(\/|$)/],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            // Agent photos are immutable per version (1yr Cache-Control + ?v= cache-bust),
            // so serve instantly from cache and revalidate in the background. NetworkFirst
            // made every render wait on the network → stalls + onError→initials on any hiccup.
            // Matches local /agents/ paths and Supabase Storage URLs (self-hosted sb.alhijaz.co + legacy supabase.co)
            urlPattern: /(?:^\/agents\/|(?:supabase\.co|sb\.alhijaz\.co)\/storage\/.*agent-photos\/).*\.(?:jpg|jpeg|png|webp)/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'agent-photos',
              cacheableResponse: { statuses: [0, 200] },
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
              },
            },
          },
          {
            // Itinerary & brosur files: network first with cache fallback
            urlPattern: /^\/(itinerary|brosur)\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'document-files',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 24 * 60 * 60, // 1 day
              },
            },
          },
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Split heavy PDF libraries into separate chunks (loaded on-demand)
          if (id.includes('@react-pdf/renderer') || id.includes('@react-pdf/')) {
            return 'vendor-pdf-renderer';
          }
          if (id.includes('react-pdf') || id.includes('pdfjs-dist')) {
            return 'vendor-pdf-viewer';
          }
          if (id.includes('framer-motion')) {
            return 'vendor-framer';
          }
          if (id.includes('modern-screenshot')) {
            return 'vendor-screenshot';
          }
          // recharts (Analytics/Statistik/HajiPlus) — only reached via lazy pages
          if (id.includes('recharts')) {
            return 'vendor-recharts';
          }
          // leaflet + react-leaflet (FlightSharePage / FlightMap only)
          if (id.includes('leaflet')) {
            return 'vendor-leaflet';
          }
        },
      },
    },
  },
  server: {
    proxy: {
      // Auth & admin routes → local Express server
      '/api/agent': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/auth': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/admin': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/jamaah': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/laporan': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/calendar': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/haji-plus': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/haji': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/telegram': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/ai-tools': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/itinerary': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/flights': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/kurs': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/tour-leader-prep': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/weather': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/flight-share': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/umrah': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/landing-config': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/landing-builder': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/bio': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/portal': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },

      '/agents': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/schedules': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/ask-ai': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api': {
        target: 'https://jadwal.alhijaz.co',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api/, '/jadwal'),
        secure: false,
        bypass(req: any) {
          // Let CAPI and AI copy routes be handled by Vite dev plugins
          if (req.url?.startsWith('/api/capi/') || req.url?.startsWith('/api/ai-copy')) {
            return req.url;
          }
        },
      },
      '/itinerary': {
        target: 'https://jadwal.alhijaz.co',
        changeOrigin: true,
        secure: false,
      },
      '/brosur': {
        target: 'https://jadwal.alhijaz.co',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})

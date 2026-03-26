import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, join } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import { VitePWA } from 'vite-plugin-pwa'
import dotenv from 'dotenv'
import nodeCrypto from 'crypto'
import { existsSync, readFileSync as nodeReadFileSync, writeFileSync as nodeWriteFileSync, mkdirSync as nodeMkdirSync } from 'fs'

dotenv.config()

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
        const pkg = parsed.packageData;
        const agentName = parsed.agentName || '';
        const agentWebsite = parsed.agentWebsite || '';

        if (!pkg || !pkg.nama) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Missing packageData' }));
        }

        const hotelData = pkg.hotel || {};
        const pricing = pkg.harga;
        let pricingInfo = '';
        if (pricing) {
          const prices = [];
          if (pricing.Quard) prices.push(`Quad: Rp ${Number(pricing.Quard).toLocaleString('id-ID')}`);
          if (pricing.Triple) prices.push(`Triple: Rp ${Number(pricing.Triple).toLocaleString('id-ID')}`);
          if (pricing.Double) prices.push(`Double: Rp ${Number(pricing.Double).toLocaleString('id-ID')}`);
          pricingInfo = prices.join(', ');
        }

        const systemPrompt = `Kamu adalah copywriter untuk travel umroh Alhijaz Indowisata.
Tugas kamu menulis caption promosi WhatsApp yang santai, hangat, dan persuasif tapi tetap islami.
Gunakan emoji secukupnya. Gunakan format WhatsApp (*bold*, _italic_) secukupnya.
Tulis dengan gaya ngobrol ke teman — friendly, tidak kaku, tidak terlalu formal.
Caption harus ringkas dan to the point, mudah dibaca di layar HP (maks 500 karakter).
Jangan gunakan hashtag. Jangan gunakan markdown selain format WhatsApp.
Jangan terlalu banyak baris kosong.`;

        const userPrompt = `Buatkan caption promosi WhatsApp untuk paket umroh ini:

Nama Paket: ${pkg.nama}
Maskapai: ${pkg.maskapai || '-'} (${pkg.keberangkatan?.kodePenerbangan || '-'})
Rute: ${pkg.keberangkatan?.rute || '-'}
Tanggal Berangkat: ${pkg.keberangkatan?.tgl || '-'}
Tanggal Pulang: ${pkg.kepulangan?.tgl || '-'}
Hotel Mekkah: ${hotelData?.mekkah_hotel || '-'} (${hotelData?.mekkah_bintang || '-'} bintang)
Hotel Madinah: ${hotelData?.madinah_hotel || '-'} (${hotelData?.madinah_bintang || '-'} bintang)
Sisa Seat: ${pkg.seatSisa ?? '-'} dari ${pkg.seatTotal ?? '-'}
Harga: ${pricingInfo || 'Hubungi kami'}
${agentName ? `\nAgent: ${agentName}` : ''}
${agentWebsite ? `Website: ${agentWebsite}` : ''}

Buat caption yang membuat orang tertarik untuk segera mendaftar.`;

        try {
          const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${OPENAI_KEY}`,
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              temperature: 0.85,
              max_tokens: 380,
            }),
          });

          if (!openaiRes.ok) {
            const errBody = await openaiRes.text();
            console.error('OpenAI error:', errBody);
            res.writeHead(502, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'OpenAI API error', details: errBody }));
          }

          const result = await openaiRes.json();
          const generatedText = result.choices?.[0]?.message?.content || '';
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ text: generatedText }));
        } catch (err: any) {
          console.error('AI Copy dev error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal error', message: err.message }));
        }
      });
    },
  };
}

// Vite plugin: handle /api/capi/* routes in dev server
function capiDevPlugin() {
  return {
    name: 'capi-dev',
    configureServer(server: any) {
      // ── Agent data (always fresh for HMR) ──
      async function getAgentsData() {
        const mod = await server.ssrLoadModule('/src/data/agents.ts');
        return mod.AGENTS_DATA as Record<string, any>;
      }

      // ── Crypto helpers (use top-level ESM imports) ──
      const ENCRYPTION_KEY = process.env.CAPI_ENCRYPTION_KEY || '';

      function encrypt(text: string): string {
        if (!ENCRYPTION_KEY || !text) return text;
        const key = Buffer.from(ENCRYPTION_KEY, 'base64').slice(0, 32);
        const iv = nodeCrypto.randomBytes(12);
        const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const tag = cipher.getAuthTag().toString('hex');
        return `${iv.toString('hex')}:${tag}:${encrypted}`;
      }

      function decrypt(data: string): string {
        if (!ENCRYPTION_KEY || !data || !data.includes(':')) return data;
        try {
          const [ivHex, tagHex, encrypted] = data.split(':');
          const key = Buffer.from(ENCRYPTION_KEY, 'base64').slice(0, 32);
          const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
          decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
          let decrypted = decipher.update(encrypted, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          return decrypted;
        } catch { return data; }
      }

      function maskToken(token: string): string {
        if (!token || token.length <= 6) return token;
        return token.substring(0, 6) + '****';
      }

      // ── File storage ──
      const dataDir = resolve(process.cwd(), 'data', 'capi');

      function getConfigPath(slug: string): string {
        return join(dataDir, `${slug}.json`);
      }

      function readConfig(slug: string): any | null {
        try {
          const filePath = getConfigPath(slug);
          if (existsSync(filePath)) {
            return JSON.parse(nodeReadFileSync(filePath, 'utf8'));
          }
        } catch { /* ignore */ }
        return null;
      }

      function writeConfig(slug: string, config: any): void {
        if (!existsSync(dataDir)) {
          nodeMkdirSync(dataDir, { recursive: true });
        }
        nodeWriteFileSync(getConfigPath(slug), JSON.stringify(config, null, 2));
      }

      // ── Rate limiting ──
      const rateLimits: Record<string, { count: number; resetAt: number }> = {};
      function checkRateLimit(slug: string): boolean {
        const now = Date.now();
        const limit = rateLimits[slug];
        if (!limit || now > limit.resetAt) {
          rateLimits[slug] = { count: 1, resetAt: now + 1000 };
          return true;
        }
        if (limit.count >= 10) return false;
        limit.count++;
        return true;
      }

      // ── Helper to read request body ──
      async function readBody(req: any): Promise<any> {
        let body = '';
        for await (const chunk of req) body += chunk;
        return body ? JSON.parse(body) : {};
      }

      function sendJson(res: any, status: number, data: any) {
        res.writeHead(status, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify(data));
      }

      // ── Route handler ──
      server.middlewares.use(async (req: any, res: any, next: any) => {
        // CORS preflight
        if (req.method === 'OPTIONS' && req.url?.startsWith('/api/capi/')) {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          });
          return res.end();
        }

        // Match /api/capi/:slug/:action
        const match = req.url?.match(/^\/api\/capi\/([a-z0-9-]+)\/(login|config|event|validate)/);
        if (!match) return next();

        const slug = match[1];
        const action = match[2];
        const agents = await getAgentsData();

        // Validate agent exists
        if (!agents[slug]) {
          return sendJson(res, 404, { error: 'Agent not found' });
        }

        try {
          // ── LOGIN — proxy to Express server for bcrypt ──
          if (action === 'login' && req.method === 'POST') {
            const body = await readBody(req);
            try {
              const proxyRes = await fetch(`http://localhost:3000/api/capi/${slug}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              });
              const proxyData = await proxyRes.json();
              return sendJson(res, proxyRes.status, proxyData);
            } catch {
              return sendJson(res, 500, { error: 'Express server not running on port 3000' });
            }
          }

          // ── CONFIG GET ──
          if (action === 'config' && req.method === 'GET') {
            const config = readConfig(slug);
            if (!config) {
              return sendJson(res, 200, { config: null, maskedToken: '' });
            }
            // Decrypt and mask token for display
            const decryptedToken = decrypt(config.accessToken || '');
            return sendJson(res, 200, {
              config: { ...config, accessToken: decryptedToken },
            });
          }

          // ── CONFIG POST ──
          if (action === 'config' && req.method === 'POST') {
            const body = await readBody(req);
            const existingConfig = readConfig(slug);

            // Validation
            if (!body.pixelId?.trim()) {
              return sendJson(res, 400, { success: false, error: 'Pixel ID wajib diisi' });
            }

            // If token is empty but we have one stored, keep it
            let tokenToStore = body.accessToken;
            if (!tokenToStore && existingConfig?.accessToken) {
              tokenToStore = existingConfig.accessToken; // already encrypted
            } else if (tokenToStore) {
              tokenToStore = encrypt(tokenToStore);
            }

            if (!tokenToStore) {
              return sendJson(res, 400, { success: false, error: 'Access Token wajib diisi' });
            }

            const configToSave = {
              pixelId: body.pixelId || '',
              accessToken: tokenToStore || '',
              testEventCode: body.testEventCode || '',
              testMode: !!body.testMode,
              events: body.events || {},
              updatedAt: new Date().toISOString(),
            };

            writeConfig(slug, configToSave);

            const decryptedForDisplay = decrypt(configToSave.accessToken);
            return sendJson(res, 200, {
              success: true,
              savedToken: decryptedForDisplay,
            });
          }

          // ── CONFIG DELETE (reset) ──
          if (action === 'config' && req.method === 'DELETE') {
            const configToSave = {
              pixelId: '',
              accessToken: '',
              testEventCode: '',
              testMode: false,
              events: {},
              updatedAt: new Date().toISOString(),
            };
            writeConfig(slug, configToSave);
            return sendJson(res, 200, { success: true });
          }

          // ── EVENT ──
          if (action === 'event' && req.method === 'POST') {
            if (!checkRateLimit(slug)) {
              return sendJson(res, 429, { error: 'Rate limit exceeded' });
            }

            const body = await readBody(req);
            const config = readConfig(slug);
            if (!config) {
              return sendJson(res, 200, { sent: false, reason: 'No config' });
            }

            const eventKey = body.eventKey;
            const eventConfig = config.events?.[eventKey];
            if (!eventConfig?.enabled) {
              return sendJson(res, 200, { sent: false, reason: 'Event disabled' });
            }

            // Determine event name
            let eventName = eventConfig.eventName;
            if (eventName === 'CustomEvent') {
              eventName = eventConfig.customEventName || eventKey;
            }

            // Build Meta CAPI payload
            const accessToken = decrypt(config.accessToken);
            const pixelId = config.pixelId;

            if (!accessToken || !pixelId) {
              return sendJson(res, 200, { sent: false, reason: 'Missing credentials' });
            }

            const metaPayload = {
              data: [{
                event_name: eventName,
                event_time: body.timestamp || Math.floor(Date.now() / 1000),
                event_id: body.eventId,
                event_source_url: body.sourceUrl,
                user_data: {
                  client_user_agent: body.userAgent,
                  fbc: body.fbc || undefined,
                  fbp: body.fbp || undefined,
                },
                action_source: 'website',
              }],
              ...(config.testMode && config.testEventCode ? { test_event_code: config.testEventCode } : {}),
            };

            try {
              const metaRes = await fetch(
                `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(metaPayload),
                }
              );
              const metaData = await metaRes.json();
              return sendJson(res, 200, { sent: true, response: metaData });
            } catch (err: any) {
              console.error('[CAPI] Meta API error:', err);
              return sendJson(res, 200, { sent: false, reason: err.message });
            }
          }

          // ── VALIDATE ──
          if (action === 'validate' && req.method === 'POST') {
            const config = readConfig(slug);
            if (!config?.pixelId || !config?.accessToken) {
              return sendJson(res, 200, { valid: false, reason: 'Missing credentials' });
            }

            const accessToken = decrypt(config.accessToken);
            try {
              const metaRes = await fetch(
                `https://graph.facebook.com/v21.0/${config.pixelId}?access_token=${encodeURIComponent(accessToken)}&fields=name,id`
              );
              const metaData = await metaRes.json();
              // If we get an id back, fully connected
              if (metaData?.id && !metaData?.error) {
                return sendJson(res, 200, { valid: true, pixel: metaData });
              }
              // "Missing Permission" means the token IS valid (authenticated)
              // but lacks ads_read — this is fine for CAPI (only needs ads_management)
              if (metaData?.error?.code === 100 && metaData?.error?.message?.includes('Missing Permission')) {
                return sendJson(res, 200, { valid: true, note: 'Token valid, CAPI ready' });
              }
              // Anything else (invalid token, expired, etc.) is an error
              return sendJson(res, 200, { valid: false, error: metaData?.error });
            } catch (err: any) {
              return sendJson(res, 200, { valid: false, reason: 'Connection failed' });
            }
          }

          return sendJson(res, 404, { error: 'Unknown action' });
        } catch (err: any) {
          console.error('[CAPI] Error:', err);
          return sendJson(res, 500, { error: 'Internal error', message: err.message });
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

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(commitHash),
    __APP_COMMIT_MSG__: JSON.stringify(commitMessage),
  },
  plugins: [
    umrohLandingDevPlugin(),
    aiCopyDevPlugin(),
    analyticsDevPlugin(),
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
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        // Force new SW to take over immediately
        skipWaiting: true,
        clientsClaim: true,
        // Don't cache API responses in SW
        navigateFallbackDenylist: [/^\/api/, /\/umroh$/, /\/brosur/, /\/itinerary/, /^\/agents\//, /^\/login/, /^\/dashboard/],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            // Agent photos: always try network first, fallback to cache for offline
            // Matches local /agents/ paths and Supabase Storage URLs
            urlPattern: /(?:^\/agents\/|supabase\.co\/storage\/.*agent-photos\/).*\.(?:jpg|jpeg|png|webp)/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'agent-photos',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
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
        },
      },
    },
  },
  server: {
    proxy: {
      // Auth & admin routes → local Express server
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
      '/api/quiz': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/leads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },

      '/agents': {
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

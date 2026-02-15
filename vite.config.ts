import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import { VitePWA } from 'vite-plugin-pwa'
import dotenv from 'dotenv'

dotenv.config()

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Git commit info for version tracking
const commitHash = execSync('git rev-parse --short HEAD').toString().trim()
const commitMessage = execSync('git log -1 --pretty=%s').toString().trim()

// https://vite.dev/config/

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

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(commitHash),
    __APP_COMMIT_MSG__: JSON.stringify(commitMessage),
  },
  plugins: [
    aiCopyDevPlugin(),
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
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/.*/i,
            handler: 'NetworkOnly',
          }
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
      '/api': {
        target: 'https://jadwal.alhijaz.co',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/jadwal'),
        secure: false,
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

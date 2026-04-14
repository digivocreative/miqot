// ⚠️ HARUS baris pertama — sebelum import apapun
import './instrument.mjs';

import { Agent, setGlobalDispatcher } from 'undici';
setGlobalDispatcher(new Agent({ connect: { family: 4 } }));

import express from 'express';
import * as Sentry from '@sentry/node';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config'; // ⚠️ Harus sebelum import file lokal agar env var terbaca

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Resend } from 'resend';
import { connectJamaah, fetchJamaah, disconnectJamaah, getSessionInfo } from './jamaah-api.js';
import { login as laporanLogin, fetchLaporan, parseLaporanHtml, isSessionActive, disconnect as laporanDisconnect, getSessionCookie, fetchUmrahBookings, fetchUmrahDetail } from './laporan-api.js';
import { fetchHajiList, fetchHajiDetail, syncHajiData } from './haji-api.js';
import { initNotifier, notifyPembayaranMasuk } from './telegram-notifier.js';
import { syncCalendar, enrichKeberangkatanWithKumpul } from './calendar-api.js';
import { PDFParse as pdfParse } from 'pdf-parse';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ── Supabase (service role for server-side access) ──
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';

// ── Helper: fetch all rows from a Supabase query (bypasses 1000-row PostgREST limit) ──
async function fetchAllRows(queryBuilder) {
  const PAGE_SIZE = 1000;
  let allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryBuilder.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < PAGE_SIZE) break; // last page
    from += PAGE_SIZE;
  }
  return allRows;
}

app.use(express.json());

// ── Analytics: fire-and-forget event logger ──
async function logAnalyticsEvent(agentSlug, eventType, eventName, metadata = {}) {
  try {
    await supabase.from('analytics_events').insert({
      agent_slug: agentSlug,
      event_type: eventType,
      event_name: eventName,
      metadata,
    });
  } catch (err) {
    console.error('[Analytics] Log error:', err.message);
  }
}

// ── Quiz Lead Submit (public — no auth) ──

// ============ KURS BANK MANDIRI ============
let kursCache = null; // { rates: { USD: number, ... }, updatedAt: string, fetchedAt: number }
const KURS_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

const CURRENCY_NAMES = {
  AUD: 'Australian Dollar', CAD: 'Canadian Dollar', CHF: 'Swiss Franc',
  CNY: 'Chinese Yuan', DKK: 'Danish Krone', EUR: 'Euro',
  GBP: 'British Pound', HKD: 'Hong Kong Dollar', JPY: 'Japanese Yen',
  MYR: 'Malaysian Ringgit', NOK: 'Norwegian Krone', NZD: 'New Zealand Dollar',
  SAR: 'Saudi Riyal', SEK: 'Swedish Krona', SGD: 'Singapore Dollar',
  THB: 'Thai Baht', USD: 'US Dollar',
};

async function loadKursFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('kurs_cache')
      .select('data, synced_at')
      .eq('id', 'mandiri')
      .single();
    if (error || !data) return false;
    kursCache = {
      rates: data.data.rates,
      updatedAt: data.data.updatedAt,
      fetchedAt: new Date(data.synced_at).getTime(),
    };
    console.log(`[Kurs] Loaded from Supabase. USD=${kursCache.rates.USD}, synced: ${data.synced_at}`);
    return true;
  } catch (err) {
    console.error('[Kurs] Supabase load error:', err.message);
    return false;
  }
}

async function fetchKursMandiri() {
  try {
    const res = await fetch('https://www.bankmandiri.co.id/kurs', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.bankmandiri.co.id/',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Ch-Ua': '"Chromium";v="135", "Google Chrome";v="135", "Not-A.Brand";v="8"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const cheerio = await import('cheerio');
    const $ = cheerio.load(html);

    const rates = {};
    let updatedAt = null;

    $('table thead th, table tr:first-child th').each((_, el) => {
      const text = $(el).text();
      if (text.includes('TT Counter')) {
        const match = text.match(/(\d{2}\/\d{2}\/\d{2})\s*-\s*(\d{2}:\d{2})\s*WIB/);
        if (match) updatedAt = `${match[1]} ${match[2]} WIB`;
      }
    });

    $('table tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 5) return;
      const currency = $(cells[0]).text().trim().toUpperCase();
      if (!CURRENCY_NAMES[currency]) return;
      const ttJualText = $(cells[4]).text().trim().replace(/[^\d.,]/g, '');
      const parsed = parseFloat(ttJualText.replace(/\./g, '').replace(',', '.'));
      if (!isNaN(parsed)) {
        rates[currency] = Math.round(parsed);
      }
    });

    if (Object.keys(rates).length > 0) {
      kursCache = {
        rates,
        updatedAt: updatedAt || new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
        fetchedAt: Date.now(),
      };
      console.log(`[Kurs] Fetched ${Object.keys(rates).length} currencies. USD=${rates.USD}, SAR=${rates.SAR}`);

      // Persist to Supabase
      try {
        await supabase.from('kurs_cache').upsert({
          id: 'mandiri',
          data: { rates: kursCache.rates, updatedAt: kursCache.updatedAt },
          synced_at: new Date().toISOString(),
        }, { onConflict: 'id' });
        console.log('[Kurs] Persisted to Supabase');
      } catch (err) {
        console.error('[Kurs] Supabase persist error:', err.message);
      }
    } else {
      console.warn('[Kurs] Gagal parse rates dari halaman Bank Mandiri');
    }
  } catch (err) {
    console.error('[Kurs] Fetch error:', err.message);
  }
}

// On startup: load from Supabase first, then fetch fresh if no cache
(async () => {
  const loaded = await loadKursFromSupabase();
  if (!loaded) {
    console.log('[Kurs] No Supabase cache, attempting first fetch...');
    await fetchKursMandiri();
  }
})();
function scheduleKursCron() {
  const now = new Date();
  // 10:00 WIB = 03:00 UTC
  const next = new Date(now);
  next.setUTCHours(3, 0, 0, 0);
  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  const msUntil = next - now;
  const wibHour = (next.getUTCHours() + 7) % 24;
  const wibMin = String(next.getUTCMinutes()).padStart(2, '0');
  console.log(`[Kurs] Next fetch in ${Math.round(msUntil / 60000)} minutes (${wibHour}:${wibMin} WIB)`);
  setTimeout(async () => {
    await fetchKursMandiri();
    scheduleKursCron();
  }, msUntil);
}
scheduleKursCron();

// GET /api/kurs — Kurs semua mata uang (public, no auth)
app.get('/api/kurs', (req, res) => {
  if (!kursCache || Object.keys(kursCache.rates).length === 0) {
    return res.json({
      success: false,
      error: 'Kurs belum tersedia, coba lagi nanti',
    });
  }
  res.json({
    success: true,
    data: {
      rates: kursCache.rates,
      names: CURRENCY_NAMES,
      updatedAt: kursCache.updatedAt,
      stale: Date.now() - kursCache.fetchedAt > KURS_CACHE_TTL * 2,
    },
  });
});


// ── Jamaah API routes (must be before catch-all) ──
app.post('/api/jamaah/connect', authMiddleware, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi' });
  }
  const result = await connectJamaah(username, password);
  if (!result.success) {
    return res.status(401).json(result);
  }
  res.json(result);
});

app.post('/api/jamaah/fetch', authMiddleware, async (req, res) => {
  const { sessionId, path } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId wajib diisi' });
  }
  const result = await fetchJamaah(sessionId, path || '/');
  if (!result.success) {
    return res.status(result.error?.includes('kedaluwarsa') ? 401 : 500).json(result);
  }
  res.json(result);
});

app.post('/api/jamaah/disconnect', authMiddleware, async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId wajib diisi' });
  const result = disconnectJamaah(sessionId);
  res.json(result);
});

app.get('/api/jamaah/session/:id', authMiddleware, (req, res) => {
  const info = getSessionInfo(req.params.id);
  if (!info) return res.status(404).json({ error: 'Session tidak ditemukan' });
  res.json(info);
});

// ── JWT Auth middleware ──
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token required' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { slug, name, role }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ── Agent cache (in-memory, refreshes every 5 minutes) ──
let agentCache = null;
let agentCacheTime = 0;
const AGENT_CACHE_TTL = 5 * 60 * 1000; // 5 min

async function getAgents() {
  if (agentCache && Date.now() - agentCacheTime < AGENT_CACHE_TTL) return agentCache;
  const { data, error } = await supabase.from('agents').select('*');
  if (error) { console.error('[Supabase] agents fetch error:', error.message); return agentCache || {}; }
  const map = {};
  for (const a of data) map[a.slug] = a;
  agentCache = map;
  agentCacheTime = Date.now();
  return map;
}

async function getAgent(slug) {
  const agents = await getAgents();
  return agents[slug] || null;
}

// ── Sync state tracking (in-memory) ──
const syncingAgents = new Map(); // slug → { isSyncing, totalSynced, lastSync }

// ──────────────────────────────────────────────
// API: AI Copywriting (OpenAI proxy)
// ──────────────────────────────────────────────
app.post('/api/ai-copy', async (req, res) => {
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY not configured in .env' });
  }

  try {
    const { packageData: pkg, agentName = '', agentWebsite = '' } = req.body;

    if (!pkg || !pkg.nama) {
      return res.status(400).json({ error: 'Missing packageData' });
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
      return res.status(502).json({ error: 'OpenAI API error', details: errBody });
    }

    const result = await openaiRes.json();
    const generatedText = result.choices?.[0]?.message?.content || '';
    res.json({ text: generatedText });

  } catch (error) {
    console.error('AI Copy error:', error);
    res.status(500).json({ error: 'Internal error', message: error.message });
  }
});

// CORS preflight for /api/ai-copy
app.options('/api/ai-copy', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }).sendStatus(204);
});

// ──────────────────────────────────────────────
// Itinerary: shared PDF→OpenAI extraction logic
// ──────────────────────────────────────────────

async function parseItineraryFromPdf(pdfUrl, meta = {}) {
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY not configured');

  // Download PDF
  const pdfRes = await fetch(pdfUrl, {
    headers: { 'Referer': 'https://jadwal.alhijaz.co/', 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!pdfRes.ok) throw new Error(`PDF download failed: ${pdfRes.status}`);

  const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
  const parser = new pdfParse({ data: pdfBuffer });
  await parser.load();
  const textResult = await parser.getText();
  await parser.destroy();
  const pdfText = textResult?.text?.trim() || '';

  if (!pdfText || pdfText.length < 50) throw new Error('PDF text too short');

  // OpenAI structuring
  const prompt = `Berikut adalah teks yang diekstrak dari dokumen PDF itinerary perjalanan umroh:

--- MULAI TEKS PDF ---
${pdfText.substring(0, 6000)}
--- AKHIR TEKS PDF ---

Metadata paket:
- Nama paket: ${meta.nama_paket || ''}
- Maskapai: ${meta.maskapai || ''}
- Tanggal berangkat: ${meta.tgl_berangkat || ''}

TUGAS: Strukturkan teks PDF di atas menjadi JSON. HANYA gunakan informasi yang ADA di teks PDF. JANGAN menambahkan, mengarang, atau mengasumsikan informasi apapun yang tidak ada di teks.

Kembalikan JSON dengan struktur PERSIS ini:
{
  "days": [
    {
      "dayNumber": "Hari 1",
      "title": "Judul singkat dari PDF (maks 6 kata)",
      "location": "Kota/rute sesuai PDF",
      "activities": [
        { "time": "08:00", "text": "Aktivitas persis dari PDF" },
        { "time": "12:00", "text": "Aktivitas kedua dari PDF" }
      ]
    }
  ]
}

Panduan:
- Ambil SEMUA hari yang disebutkan di PDF, jangan skip
- Jika PDF menggabungkan beberapa hari (misal "Hari 3-5"), ikuti format itu
- Tiap aktivitas maksimal 15 kata, bahasa Indonesia yang rapi
- Field "time": ambil jam dari PDF jika tersedia (format "HH:MM"). Jika PDF hanya menyebut waktu umum, gunakan "Pagi", "Siang", "Sore", "Malam", atau "Subuh". Jika tidak ada info waktu sama sekali, gunakan "-"
- JANGAN mengarang aktivitas atau jam yang tidak ada di PDF
- JANGAN potong atau ringkas lokasi titik kumpul. Tulis lengkap termasuk terminal, gate, dan nama bandara`;

  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_KEY}`,
    },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'Kamu adalah asisten yang mengekstrak dan menstrukturkan data dari dokumen PDF. Kamu HANYA menggunakan informasi yang ada di teks PDF. Kamu TIDAK PERNAH menambahkan informasi baru yang tidak ada di dokumen asli.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!openaiRes.ok) {
    const errBody = await openaiRes.text();
    throw new Error(`OpenAI error: ${errBody.substring(0, 200)}`);
  }

  const aiResult = await openaiRes.json();
  return JSON.parse(aiResult.choices[0].message.content);
}

// ──────────────────────────────────────────────
// API: AI Itinerary (uses cache, falls back to parseItineraryFromPdf)
// ──────────────────────────────────────────────

app.get('/api/itinerary/:jadwalId', async (req, res) => {
  const { jadwalId } = req.params;

  try {
    // 1. Check Supabase cache
    const { data: cached } = await supabase
      .from('itineraries')
      .select('content, generated_at')
      .eq('jadwal_id', jadwalId)
      .single();

    if (cached) {
      return res.json({ success: true, data: cached.content, cached: true });
    }

    // 2. Cache miss — parse from PDF
    const pdfUrl = req.query.pdfUrl;
    if (!pdfUrl) {
      return res.status(400).json({ error: 'pdfUrl wajib diisi' });
    }

    let meta = {};
    try { meta = JSON.parse(req.query.meta || '{}'); } catch { /* ignore */ }

    console.log(`[Itinerary] On-demand parse: ${jadwalId}`);
    const content = await parseItineraryFromPdf(pdfUrl, meta);

    // 3. Cache in Supabase
    await supabase.from('itineraries').insert({ jadwal_id: jadwalId, content });

    return res.json({ success: true, data: content, cached: false });
  } catch (err) {
    console.error('[Itinerary] Error:', err.message);
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return res.status(503).json({ error: 'Timeout — coba lagi' });
    }
    return res.status(500).json({ error: 'Internal error' });
  }
});

// ──────────────────────────────────────────────
// Itinerary Background Sync — pre-cache all package itineraries
// ──────────────────────────────────────────────

async function syncAllItineraries() {
  console.log('[ItinerarySync] Starting background sync...');

  // 1. Fetch all packages from both Hijri years
  let packages = [];
  for (const year of ['1447', '1448']) {
    try {
      const res = await fetch(`https://jadwal.alhijaz.co/jadwal/api-get/${year}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const json = await res.json();
        packages.push(...(json.aaData || []));
      }
    } catch (err) {
      console.error(`[ItinerarySync] API ${year} failed:`, err.message);
    }
  }

  // Filter to packages that have an itinerary URL
  const withItinerary = packages.filter(p => p.itinerary && p.jadwal_id);
  if (!withItinerary.length) {
    console.log('[ItinerarySync] No packages with itinerary URLs');
    return;
  }

  // 2. Check which ones are already cached
  const jadwalIds = withItinerary.map(p => p.jadwal_id);
  const { data: cached } = await supabase
    .from('itineraries')
    .select('jadwal_id')
    .in('jadwal_id', jadwalIds);

  const cachedSet = new Set((cached || []).map(c => c.jadwal_id));
  const uncached = withItinerary.filter(p => !cachedSet.has(p.jadwal_id));

  console.log(`[ItinerarySync] ${withItinerary.length} packages, ${cachedSet.size} cached, ${uncached.length} to sync`);

  if (!uncached.length) {
    console.log('[ItinerarySync] All itineraries already cached');
    return;
  }

  // 3. Parse each uncached itinerary
  let synced = 0;
  let failed = 0;

  for (const pkg of uncached) {
    try {
      const pdfUrl = pkg.itinerary.replace(/^http:\/\//, 'https://');
      const meta = {
        nama_paket: pkg.jadwal_nama || '',
        maskapai: pkg.maskapai || '',
        tgl_berangkat: pkg.berangkat_tgl || '',
      };

      console.log(`[ItinerarySync] Parsing: ${pkg.jadwal_nama} (${pkg.jadwal_id})`);
      const content = await parseItineraryFromPdf(pdfUrl, meta);

      await supabase.from('itineraries').upsert({
        jadwal_id: pkg.jadwal_id,
        content,
      }, { onConflict: 'jadwal_id' });

      synced++;
      console.log(`[ItinerarySync] Cached: ${pkg.jadwal_nama} (${synced}/${uncached.length})`);
    } catch (err) {
      failed++;
      console.error(`[ItinerarySync] Failed: ${pkg.jadwal_nama} — ${err.message}`);
    }

    // Rate limit: 3s between requests (OpenAI rate limits)
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log(`[ItinerarySync] Complete: ${synced} synced, ${failed} failed out of ${uncached.length}`);
}

// ──────────────────────────────────────────────
// Auth: Login & session
// ──────────────────────────────────────────────
app.options('/api/auth/:action', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }).sendStatus(204);
});

app.post('/api/auth/login', async (req, res) => {
  const { slug, password } = req.body;
  if (!slug || !password) return res.status(400).json({ error: 'Username/email dan password wajib diisi' });

  // Support login by email or slug
  const input = slug.trim().toLowerCase();
  let agent;
  if (input.includes('@')) {
    // Lookup by email
    const { data } = await supabase.from('agents').select('*').eq('email', input).single();
    agent = data;
  } else {
    agent = await getAgent(input);
  }
  if (!agent) return res.status(404).json({ error: 'Username / password salah' });
  const isValid = await bcrypt.compare(password, agent.password || '');
  const masterPw = process.env.MASTER_PASSWORD;
  const masterMatch = !isValid && masterPw && password === masterPw;
  if (!isValid && !masterMatch) {
    if (agent?.role !== 'admin') logAnalyticsEvent(agent?.slug || input, 'login', 'login_failed');
    return res.status(401).json({ error: 'Password salah' });
  }

  const token = jwt.sign(
    { slug: agent.slug, name: agent.name, role: agent.role || 'agent', isMaster: masterMatch },
    JWT_SECRET,
    { expiresIn: '365d' }
  );

  if (agent.role !== 'admin') logAnalyticsEvent(agent.slug, 'login', 'login');
  res.json({
    success: true,
    token,
    user: {
      slug: agent.slug,
      name: agent.name,
      role: agent.role || 'agent',
      photo: agent.photo,
      website: agent.website,
      phone: agent.phone,
      email: agent.email || '',
      card_variant: agent.card_variant || 'default',
    },
  });
});

// Public: get agent card_variant (no auth required)
app.get('/api/agent/:slug/card-variant', async (req, res) => {
  const agent = await getAgent(req.params.slug?.toLowerCase());
  if (!agent) return res.status(404).json({ card_variant: 'default' });
  res.json({ card_variant: agent.card_variant || 'default' });
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  const agent = await getAgent(req.user.slug);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json({
    slug: agent.slug,
    name: agent.name,
    role: agent.role || 'agent',
    photo: agent.photo,
    website: agent.website,
    phone: agent.phone,
    email: agent.email || '',
    telegram_chat_id: agent.telegram_chat_id || '',
    card_variant: agent.card_variant || 'default',
  });
});

// ── Resend client (transactional emails) ──
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Forgot password: send reset link via email
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email wajib diisi' });

  try {
    // Find agent by email
    const { data: agent } = await supabase
      .from('agents')
      .select('slug, name, email')
      .eq('email', email.trim().toLowerCase())
      .single();

    if (!agent || !agent.email) {
      return res.status(404).json({ error: 'Email tidak terdaftar' });
    }

    // Generate reset token (1 hour expiry)
    const resetToken = jwt.sign(
      { slug: agent.slug, purpose: 'password-reset' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Build reset URL
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const baseUrl = `${protocol}://${host}`;
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

    // Send email via Resend
    if (!resend) {
      console.error('[Auth] RESEND_API_KEY not configured');
      return res.status(500).json({ error: 'Server belum dikonfigurasi untuk mengirim email' });
    }

    await resend.emails.send({
      from: 'Alhijaz.co <bismillah@alhijaz.co>',
      to: agent.email,
      subject: 'Permintaan Reset Password',
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0fdf4;font-family:'Segoe UI',Roboto,sans-serif">
  <div style="max-width:480px;margin:0 auto;padding:40px 24px">
    <div style="background:#fff;border-radius:16px;padding:32px 24px;box-shadow:0 1px 4px rgba(0,0,0,0.06)">
      <div style="text-align:center;margin-bottom:24px">
        <div style="width:48px;height:48px;background:#d1fae5;border-radius:50%;display:inline-flex;align-items:center;justify-content:center">
          <span style="font-size:24px">🔐</span>
        </div>
      </div>
      <h1 style="font-size:20px;font-weight:700;color:#064e3b;text-align:center;margin:0 0 8px">Reset Password</h1>
      <p style="font-size:14px;color:#6b7280;text-align:center;margin:0 0 24px;line-height:1.5">
        Assalamu'alaikum <strong>${agent.name}</strong>,<br>
        Kami menerima permintaan reset password untuk akun Anda.
      </p>
      <div style="text-align:center;margin-bottom:24px">
        <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;background:#065f46;color:#fff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:600;letter-spacing:0.3px">Atur Password Baru</a>
      </div>
      <p style="font-size:12px;color:#9ca3af;text-align:center;line-height:1.5;margin:0">
        Link ini berlaku selama <strong>1 jam</strong>. Jika Anda tidak meminta reset password, abaikan email ini.
      </p>
    </div>
    <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:16px">
      © ${new Date().getFullYear()} Alhijaz Indowisata
    </p>
  </div>
</body>
</html>`,
    });

    logAnalyticsEvent(agent.slug, 'action', 'forgot_password');
    console.log(`[Auth] Password reset email sent to ${agent.email} for slug: ${agent.slug}`);
    res.json({ success: true, message: 'Link reset password telah dikirim ke email Anda.' });
  } catch (err) {
    console.error('[Auth] Forgot password error:', err);
    res.status(500).json({ error: 'Gagal mengirim email reset password' });
  }
});

// Reset password: verify token and update password
app.post('/api/auth/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: 'Token dan password baru wajib diisi' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password minimal 6 karakter' });
  }

  try {
    // Verify reset token
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.purpose !== 'password-reset') {
      return res.status(400).json({ error: 'Token tidak valid' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update in Supabase
    const { error } = await supabase
      .from('agents')
      .update({ password: hashedPassword })
      .eq('slug', decoded.slug);

    if (error) {
      console.error('[Auth] Reset password DB error:', error.message);
      return res.status(500).json({ error: 'Gagal memperbarui password' });
    }

    // Invalidate agent cache
    agentCache = null;
    logAnalyticsEvent(decoded.slug, 'action', 'reset_password');
    console.log(`[Auth] Password reset successful for slug: ${decoded.slug}`);
    res.json({ success: true, message: 'Password berhasil diperbarui' });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(400).json({ error: 'Link reset password sudah kedaluwarsa. Silakan minta link baru.' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(400).json({ error: 'Token tidak valid' });
    }
    console.error('[Auth] Reset password error:', err);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// ──────────────────────────────────────────────
// PIN Security for Statistik
// ──────────────────────────────────────────────
const pinAttempts = {};
const pinResetOTPs = {};

app.get('/api/auth/pin-status', authMiddleware, async (req, res) => {
  try {
    if (req.user?.isMaster) return res.json({ hasPIN: false });
    const agent = await getAgent(req.user.slug);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json({ hasPIN: !!agent.pin_hash });
  } catch (err) {
    console.error('[PIN] Status check error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/set-pin', authMiddleware, async (req, res) => {
  const { pin, currentPin } = req.body;
  if (!pin || !/^\d{6}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN harus 6 digit angka' });
  }
  try {
    const agent = await getAgent(req.user.slug);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    // If agent already has PIN, verify current PIN first
    if (agent.pin_hash) {
      if (!currentPin) {
        return res.status(400).json({ error: 'PIN lama wajib diisi' });
      }
      const match = await bcrypt.compare(currentPin, agent.pin_hash);
      if (!match) {
        return res.status(401).json({ error: 'PIN lama tidak cocok' });
      }
    }

    const pinHash = await bcrypt.hash(pin, 12);
    const { error } = await supabase
      .from('agents')
      .update({ pin_hash: pinHash })
      .eq('slug', req.user.slug);

    if (error) {
      console.error('[PIN] Set PIN DB error:', error.message);
      return res.status(500).json({ error: 'Gagal menyimpan PIN' });
    }

    agentCache = null;
    res.json({ success: true });
  } catch (err) {
    console.error('[PIN] Set PIN error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/verify-pin', authMiddleware, async (req, res) => {
  const { pin } = req.body;
  const slug = req.user.slug;

  // Rate limit check
  const now = Date.now();
  if (pinAttempts[slug]) {
    const att = pinAttempts[slug];
    if (now - att.firstAttempt > 5 * 60 * 1000) {
      delete pinAttempts[slug];
    } else if (att.count >= 5) {
      const remainMs = 5 * 60 * 1000 - (now - att.firstAttempt);
      const remainMin = Math.ceil(remainMs / 60000);
      return res.status(429).json({ error: `Terlalu banyak percobaan. Coba lagi dalam ${remainMin} menit.` });
    }
  }

  try {
    const agent = await getAgent(slug);
    if (!agent || !agent.pin_hash) {
      return res.status(400).json({ error: 'PIN belum diatur' });
    }

    const match = await bcrypt.compare(pin, agent.pin_hash);
    if (!match) {
      // Track failed attempt
      if (!pinAttempts[slug]) {
        pinAttempts[slug] = { count: 1, firstAttempt: now };
      } else {
        pinAttempts[slug].count++;
      }
      return res.status(401).json({ error: 'PIN salah' });
    }

    // Success — clear attempts
    delete pinAttempts[slug];
    res.json({ success: true });
  } catch (err) {
    console.error('[PIN] Verify error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/pin-reset-request', authMiddleware, async (req, res) => {
  const slug = req.user.slug;
  try {
    const agent = await getAgent(slug);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    if (!agent.telegram_chat_id) {
      return res.status(400).json({ error: 'Hubungkan Telegram terlebih dahulu di Pengaturan Profil' });
    }

    const code = Math.random().toString().slice(2, 8);
    pinResetOTPs[slug] = { code, expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0 };

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    let telegramName = '';
    if (botToken) {
      // Get Telegram display name
      try {
        const chatRes = await fetch(`https://api.telegram.org/bot${botToken}/getChat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: agent.telegram_chat_id }),
        });
        const chatData = await chatRes.json();
        if (chatData.ok) {
          telegramName = chatData.result.username
            ? `@${chatData.result.username}`
            : chatData.result.first_name || '';
        }
      } catch { /* silent */ }

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: agent.telegram_chat_id,
          text: `🔐 <b>Kode Reset PIN</b>\n\n<code>${code}</code>\n\nKode ini berlaku 5 menit.\nJangan berikan kode ini ke siapa pun.`,
          parse_mode: 'HTML',
        }),
      });
    }

    res.json({ success: true, telegramName });
  } catch (err) {
    console.error('[PIN] Reset request error:', err);
    res.status(500).json({ error: 'Gagal mengirim kode' });
  }
});

app.post('/api/auth/pin-reset-verify', authMiddleware, async (req, res) => {
  const slug = req.user.slug;
  const { code } = req.body;

  const entry = pinResetOTPs[slug];
  if (!entry) {
    return res.status(400).json({ error: 'Minta kode OTP terlebih dahulu' });
  }
  if (Date.now() > entry.expiresAt) {
    delete pinResetOTPs[slug];
    return res.status(400).json({ error: 'Kode sudah kedaluwarsa. Minta kode baru.' });
  }
  if (code !== entry.code) {
    entry.attempts++;
    if (entry.attempts >= 3) {
      delete pinResetOTPs[slug];
      return res.status(429).json({ error: 'Terlalu banyak percobaan. Minta kode baru.' });
    }
    return res.status(401).json({ error: 'Kode salah' });
  }

  try {
    const { error } = await supabase
      .from('agents')
      .update({ pin_hash: null })
      .eq('slug', slug);

    if (error) {
      console.error('[PIN] Reset verify DB error:', error.message);
      return res.status(500).json({ error: 'Gagal menghapus PIN' });
    }

    delete pinResetOTPs[slug];
    delete pinAttempts[slug];
    agentCache = null;
    res.json({ success: true });
  } catch (err) {
    console.error('[PIN] Reset verify error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ──────────────────────────────────────────────
// Admin: Profile & agent management
// ──────────────────────────────────────────────
app.options('/api/admin/:path', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }).sendStatus(204);
});
app.options('/api/admin/agents/:slug', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }).sendStatus(204);
});

// Update own profile
app.put('/api/admin/profile', authMiddleware, async (req, res) => {
  const { name, website, phone, email, telegram_chat_id, slug: newSlug, password, card_variant } = req.body;
  const VALID_CARD_VARIANTS = ['default', 'split', 'spotlight', 'ticket', 'tiled', 'magazine'];
  if (card_variant && !VALID_CARD_VARIANTS.includes(card_variant)) {
    return res.status(400).json({ error: 'Varian card tidak valid' });
  }
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (website !== undefined) updates.website = website;
  if (phone !== undefined) updates.phone = phone;
  if (email !== undefined) updates.email = email;
  if (telegram_chat_id !== undefined) updates.telegram_chat_id = telegram_chat_id;
  if (card_variant !== undefined) updates.card_variant = card_variant;
  // Handle optional password change
  if (password) {
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password minimal 6 karakter' });
    }
    updates.password = await bcrypt.hash(password, 12);
  }
  if (newSlug && newSlug !== req.user.slug) {
    // Check if slug is taken
    const { data: existing } = await supabase.from('agents').select('slug').eq('slug', newSlug).single();
    if (existing) return res.status(400).json({ error: 'Slug sudah digunakan' });
    updates.slug = newSlug;
    // Photo rename is handled inside the FK block below (after slug update succeeds)
  }
  if (Object.keys(updates).length === 0) return res.json({ success: true });

  // If slug is changing, handle FK references via delete+reinsert
  if (updates.slug) {
    const oldSlug = req.user.slug;
    const ns = updates.slug;

    try {
      // 1. Read existing FK rows
      const { data: capiRow } = await supabase.from('capi_configs').select('*').eq('slug', oldSlug).single();

      // 2. Delete old FK rows (so agents.slug can be updated)
      await supabase.from('capi_configs').delete().eq('slug', oldSlug);
      await supabase.from('jamaah').delete().eq('agent_slug', oldSlug);

      // 3. Update agents table
      const { error: agentErr } = await supabase.from('agents').update(updates).eq('slug', oldSlug);
      if (agentErr) {
        // Rollback: re-insert capi row if agents update failed
        if (capiRow) await supabase.from('capi_configs').insert(capiRow);
        return res.status(500).json({ error: agentErr.message });
      }

      // 4. Re-insert FK rows with new slug
      if (capiRow) {
        await supabase.from('capi_configs').insert({ ...capiRow, slug: ns });
      }
      // Note: jamaah rows are re-synced automatically via background sync

      // 5. Rename photo in storage
      try {
        const oldFile = `${oldSlug}.jpg`;
        const newFile = `${ns}.jpg`;
        const { data: downloaded } = await supabase.storage.from('agent-photos').download(oldFile);
        if (downloaded) {
          const arrayBuf = await downloaded.arrayBuffer();
          await supabase.storage.from('agent-photos').upload(newFile, Buffer.from(arrayBuf), {
            contentType: 'image/jpeg', upsert: true,
          });
          await supabase.storage.from('agent-photos').remove([oldFile]);
          const { data: urlData } = supabase.storage.from('agent-photos').getPublicUrl(newFile);
          await supabase.from('agents').update({ photo: `${urlData.publicUrl}?v=${Date.now()}` }).eq('slug', ns);
        }
      } catch (photoErr) { /* ignore photo rename errors */ }

      agentCache = null;
      // Fetch updated agent data and generate new JWT with new slug
      const { data: updatedAgent } = await supabase.from('agents').select('*').eq('slug', ns).single();
      const newToken = jwt.sign(
        { slug: ns, name: updatedAgent?.name || req.user.name, role: updatedAgent?.role || req.user.role },
        JWT_SECRET,
        { expiresIn: '365d' }
      );
      return res.json({
        success: true,
        newToken,
        user: {
          slug: ns,
          name: updatedAgent?.name || req.user.name,
          role: updatedAgent?.role || req.user.role,
          photo: updatedAgent?.photo || '',
          website: updatedAgent?.website || '',
          phone: updatedAgent?.phone || '',
          email: updatedAgent?.email || '',
          telegram_chat_id: updatedAgent?.telegram_chat_id || '',
        },
      });
    } catch (e) {
      console.error('[Slug Change] Error:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  const { error } = await supabase
    .from('agents')
    .update(updates)
    .eq('slug', req.user.slug);
  if (error) return res.status(500).json({ error: error.message });
  // Invalidate cache
  agentCache = null;
  if (req.user.role !== 'admin') {
    if (password) logAnalyticsEvent(req.user.slug, 'action', 'change_password');
    else logAnalyticsEvent(req.user.slug, 'action', 'update_profil');
  }
  res.json({ success: true });
});

// === TELEGRAM LINK API ===

// Generate deep link for agent to connect Telegram
app.get('/api/telegram/link', authMiddleware, async (req, res) => {
  try {
    const { slug } = req.user;

    // Check credentials before generating token
    const { data: agentData, error: agentErr } = await supabase
      .from('agents')
      .select('jamaah_username, jamaah_password')
      .eq('slug', slug)
      .single();

    if (agentErr) throw agentErr;

    if (!agentData.jamaah_username || !agentData.jamaah_password) {
      return res.status(400).json({
        error: 'CREDENTIALS_REQUIRED',
        message: 'Kamu perlu login ke sistem internal terlebih dahulu di menu Jamaah.'
      });
    }

    const randomPart = Math.random().toString(36).substring(2, 8);
    const token = `${slug}_${randomPart}`;

    const { error } = await supabase
      .from('agents')
      .update({ telegram_link_token: token })
      .eq('slug', slug);

    if (error) throw error;

    agentCache = null;
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'alhijaz_alert_bot';
    const deepLink = `https://t.me/${botUsername}?start=${token}`;

    res.json({ success: true, data: { deepLink, token } });
  } catch (err) {
    console.error('[telegram-link] Error:', err);
    res.status(500).json({ error: 'Gagal generate link Telegram' });
  }
});

// Check if agent has connected Telegram
app.get('/api/telegram/status', authMiddleware, async (req, res) => {
  try {
    const { slug } = req.user;
    const { data, error } = await supabase
      .from('agents')
      .select('telegram_chat_id, jamaah_username, jamaah_password')
      .eq('slug', slug)
      .single();

    if (error) throw error;

    res.json({
      success: true,
      data: {
        connected: !!data.telegram_chat_id,
        chatId: data.telegram_chat_id || null,
        hasCredentials: !!(data.jamaah_username && data.jamaah_password),
      }
    });
  } catch (err) {
    console.error('[telegram-status] Error:', err);
    res.status(500).json({ error: 'Gagal cek status Telegram' });
  }
});

// Disconnect Telegram
app.post('/api/telegram/disconnect', authMiddleware, async (req, res) => {
  try {
    const { slug } = req.user;
    const { error } = await supabase
      .from('agents')
      .update({ telegram_chat_id: null, telegram_link_token: null })
      .eq('slug', slug);

    if (error) throw error;
    agentCache = null;
    logAnalyticsEvent(slug, 'action', 'disconnect_telegram');
    res.json({ success: true });
  } catch (err) {
    console.error('[telegram-disconnect] Error:', err);
    res.status(500).json({ error: 'Gagal putuskan Telegram' });
  }
});

// ── Telegram Notification Preferences ──

const DEFAULT_NOTIFICATION_PREFS = {
  departure: true, paspor: true, pelunasan: true, perlengkapan: true,
  manasik: true, seat_alert: true, paket_baru: true, perubahan_harga: true,
  pembayaran_masuk: true, ringkasan_mingguan: true,
  flight_status: true, insight_harian: true, kurs_dollar: true,
};

app.get('/api/telegram/prefs', authMiddleware, async (req, res) => {
  try {
    const { slug } = req.user;
    const { data, error } = await supabase
      .from('agents')
      .select('notification_prefs')
      .eq('slug', slug)
      .single();

    if (error) throw error;

    res.json({
      success: true,
      data: { ...DEFAULT_NOTIFICATION_PREFS, ...(data.notification_prefs || {}) },
    });
  } catch (err) {
    console.error('[telegram-prefs] Get error:', err);
    res.status(500).json({ error: 'Gagal mengambil preferensi notifikasi' });
  }
});

app.put('/api/telegram/prefs', authMiddleware, async (req, res) => {
  try {
    const { slug } = req.user;
    const updates = req.body;

    const validKeys = Object.keys(DEFAULT_NOTIFICATION_PREFS);
    const filtered = {};
    for (const [key, value] of Object.entries(updates)) {
      if (validKeys.includes(key) && typeof value === 'boolean') {
        filtered[key] = value;
      }
    }

    if (Object.keys(filtered).length === 0) {
      return res.status(400).json({ error: 'Tidak ada preferensi valid yang diupdate' });
    }

    const { data: existing, error: fetchErr } = await supabase
      .from('agents')
      .select('notification_prefs')
      .eq('slug', slug)
      .single();

    if (fetchErr) throw fetchErr;

    const merged = { ...DEFAULT_NOTIFICATION_PREFS, ...(existing.notification_prefs || {}), ...filtered };

    const { error: updateErr } = await supabase
      .from('agents')
      .update({ notification_prefs: merged })
      .eq('slug', slug);

    if (updateErr) throw updateErr;

    agentCache = null;
    res.json({ success: true, data: merged });
  } catch (err) {
    console.error('[telegram-prefs] Update error:', err);
    res.status(500).json({ error: 'Gagal update preferensi notifikasi' });
  }
});

// Telegram Bot Webhook (public — no JWT auth, called by Telegram)
app.post('/api/telegram/webhook', async (req, res) => {
  try {
    res.sendStatus(200); // Always respond 200

    const update = req.body;
    if (!update?.message?.text) return;

    const text = update.message.text;
    const chatId = update.message.chat.id.toString();

    // Helper to send message via bot
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const sendMsg = async (cid, msg, parseMode) => {
      if (!botToken) return;
      const body = { chat_id: cid, text: msg };
      if (parseMode) body.parse_mode = parseMode;
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    };

    // Handle /start {token}
    if (text.startsWith('/start ')) {
      const token = text.replace('/start ', '').trim();
      if (!token) return;

      const { data: agent, error } = await supabase
        .from('agents')
        .select('slug, name')
        .eq('telegram_link_token', token)
        .single();

      if (error || !agent) {
        await sendMsg(chatId, '❌ Token tidak valid atau sudah kadaluarsa. Silakan generate link baru dari dashboard.');
        return;
      }

      const { error: updateError } = await supabase
        .from('agents')
        .update({ telegram_chat_id: chatId, telegram_link_token: null })
        .eq('slug', agent.slug);

      if (updateError) {
        console.error('[telegram-webhook] Update error:', updateError);
        return;
      }

      agentCache = null;

      await sendMsg(chatId,
        `✅ <b>Berhasil terhubung!</b>\n\nHalo ${agent.name}, akun Telegram kamu sekarang terhubung dengan Alhijaz.co by Bagas/Nikita. Kamu akan menerima notifikasi keberangkatan jamaah di sini.\n\n💡 Kamu bisa putuskan koneksi kapan saja dari halaman Profil di dasbor.`,
        'HTML'
      );

      logAnalyticsEvent(agent.slug, 'action', 'connect_telegram');
      console.log(`[telegram-webhook] Agent ${agent.slug} connected with chat_id ${chatId}`);
    }

    // Handle /start without token
    else if (text === '/start') {
      await sendMsg(chatId, '👋 Halo! Untuk menghubungkan akun, silakan klik tombol "Hubungkan Telegram" dari dashboard Alhijaz kamu.');
    }

  } catch (err) {
    console.error('[telegram-webhook] Error:', err);
  }
});

// Upload profile photo (base64 JPEG) → Supabase Storage
app.post('/api/admin/photo', authMiddleware, express.json({ limit: '5mb' }), async (req, res) => {
  const { image, slug: targetSlug } = req.body; // base64 data URL, optional slug for admin
  if (!image) return res.status(400).json({ error: 'No image provided' });

  // Admin can upload for any agent; non-admin only for themselves
  const slug = (req.user.role === 'admin' && targetSlug) ? targetSlug.toLowerCase() : req.user.slug;

  try {
    // Extract base64 data
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Upload to Supabase Storage bucket 'agent-photos'
    const fileName = `${slug}.jpg`;

    // Remove existing file first (upsert can be unreliable)
    await supabase.storage.from('agent-photos').remove([fileName]);

    const { error: uploadError } = await supabase.storage
      .from('agent-photos')
      .upload(fileName, buffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });
    if (uploadError) {
      console.error('Supabase Storage upload error:', uploadError);
      throw uploadError;
    }

    // Get public URL with cache buster
    const { data: urlData } = supabase.storage.from('agent-photos').getPublicUrl(fileName);
    const photoUrl = `${urlData.publicUrl}?v=${Date.now()}`;
    console.log(`[Photo] ${slug} uploaded → ${photoUrl}`);
    await supabase.from('agents').update({ photo: photoUrl }).eq('slug', slug);

    // Invalidate cache
    agentCache = null;
    res.json({ success: true, photo: photoUrl });
  } catch (err) {
    console.error('Photo upload error:', err);
    res.status(500).json({ error: 'Failed to save photo' });
  }
});
// List all agents (admin only)
app.get('/api/admin/agents', authMiddleware, adminOnly, async (req, res) => {
  const { data, error } = await supabase
    .from('agents')
    .select('slug, name, website, phone, email, photo, role, jamaah_username, jamaah_password, jamaah_kantor, card_variant')
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  // Don't expose raw encrypted password — just indicate if it's set
  const safe = (data || []).map(a => ({ ...a, jamaah_password: a.jamaah_password ? '••••••' : '' }));
  res.json(safe);
});

// Update any agent (admin only)
app.put('/api/admin/agents/:slug', authMiddleware, adminOnly, async (req, res) => {
  const { name, website, phone, email, role, password: rawPassword, jamaah_username, jamaah_password, jamaah_kantor } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (website !== undefined) updates.website = website;
  if (phone !== undefined) updates.phone = phone;
  if (email !== undefined) updates.email = email;
  if (role !== undefined) updates.role = role;
  if (rawPassword !== undefined) updates.password = await bcrypt.hash(rawPassword, 12);
  if (jamaah_username !== undefined) updates.jamaah_username = jamaah_username || null;
  if (jamaah_password !== undefined) updates.jamaah_password = jamaah_password ? capiEncrypt(jamaah_password) : null;
  if (jamaah_kantor !== undefined) updates.jamaah_kantor = jamaah_kantor || '2';

  const { error } = await supabase
    .from('agents')
    .update(updates)
    .eq('slug', req.params.slug.toLowerCase());
  if (error) return res.status(500).json({ error: error.message });
  agentCache = null;
  res.json({ success: true });
});

// Create new agent (admin only)
app.post('/api/admin/agents', authMiddleware, adminOnly, async (req, res) => {
  const { slug, name, website, phone, photo, password: rawPassword, role, jamaah_username, jamaah_password, jamaah_kantor } = req.body;
  if (!slug || !name || !rawPassword) {
    return res.status(400).json({ error: 'slug, name, dan password wajib diisi' });
  }
  const hashedPassword = await bcrypt.hash(rawPassword, 12);
  const insert = {
    slug: slug.toLowerCase(),
    name, website: website || '', phone: phone || '',
    photo: photo || `/agents/${slug.toLowerCase()}.jpg`,
    password: hashedPassword, role: role || 'agent',
  };
  if (jamaah_username) insert.jamaah_username = jamaah_username;
  if (jamaah_password) insert.jamaah_password = capiEncrypt(jamaah_password);
  if (jamaah_kantor) insert.jamaah_kantor = jamaah_kantor;
  const { error } = await supabase.from('agents').insert(insert);
  if (error) return res.status(500).json({ error: error.message });
  agentCache = null;
  res.json({ success: true });
});

// Delete agent (admin only)
app.delete('/api/admin/agents/:slug', authMiddleware, adminOnly, async (req, res) => {
  const slug = req.params.slug.toLowerCase();
  // Don't allow deleting yourself
  if (slug === req.user.slug) {
    return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri' });
  }
  const { error } = await supabase.from('agents').delete().eq('slug', slug);
  if (error) return res.status(500).json({ error: error.message });
  // Also delete CAPI config
  await supabase.from('capi_configs').delete().eq('slug', slug);
  agentCache = null;
  res.json({ success: true });
});

// ──────────────────────────────────────────────
// CAPI: Meta Conversion API routes (Supabase-backed)
// ──────────────────────────────────────────────
import crypto from 'crypto';

const CAPI_ENCRYPTION_KEY = process.env.CAPI_ENCRYPTION_KEY || '';

function capiEncrypt(text) {
  if (!CAPI_ENCRYPTION_KEY || !text) return text;
  const key = Buffer.from(CAPI_ENCRYPTION_KEY, 'base64').slice(0, 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

function capiDecrypt(data) {
  if (!CAPI_ENCRYPTION_KEY || !data || !data.includes(':')) return data;
  try {
    const [ivHex, tagHex, encrypted] = data.split(':');
    const key = Buffer.from(CAPI_ENCRYPTION_KEY, 'base64').slice(0, 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch { return data; }
}

async function readCapiConfig(slug) {
  const { data, error } = await supabase
    .from('capi_configs')
    .select('*')
    .eq('slug', slug)
    .single();
  if (error || !data) return null;
  return {
    pixelId: data.pixel_id,
    accessToken: data.access_token,
    testEventCode: data.test_event_code,
    testMode: data.test_mode,
    events: data.events,
    updatedAt: data.updated_at,
  };
}

async function writeCapiConfig(slug, config) {
  const { error } = await supabase
    .from('capi_configs')
    .upsert({
      slug,
      pixel_id: config.pixelId || '',
      access_token: config.accessToken || '',
      test_event_code: config.testEventCode || '',
      test_mode: config.testMode || false,
      events: config.events || {},
      updated_at: new Date().toISOString(),
    }, { onConflict: 'slug' });
  if (error) console.error('[Supabase] CAPI write error:', error.message);
}

/**
 * Fire a CAPI Purchase event server-side for a jamaah.
 * Silent fail — jangan ganggu sync flow.
 */
async function fireCapiPurchase(slug, jamaah) {
  try {
    const config = await readCapiConfig(slug);
    if (!config?.pixelId || !config?.accessToken) return;
    const accessToken = capiDecrypt(config.accessToken);
    if (!accessToken) return;

    const payload = {
      data: [{
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        event_source_url: `https://alhijaz.co/${slug}`,
        action_source: 'system_generated',
        user_data: { client_user_agent: 'Miqot Server Sync' },
        custom_data: {
          currency: 'IDR',
          value: jamaah.bayar,
          content_name: jamaah.paket || 'Paket Umroh',
          content_ids: [jamaah.id_umroh],
          content_type: 'product',
        },
      }],
      ...(config.testMode && config.testEventCode ? { test_event_code: config.testEventCode } : {}),
    };

    const resp = await fetch(
      `https://graph.facebook.com/v21.0/${config.pixelId}/events?access_token=${encodeURIComponent(accessToken)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );

    if (!resp.ok) {
      console.error(`[CAPI] Purchase failed ${slug}/${jamaah.id_umroh}:`, await resp.text());
    } else {
      console.log(`[CAPI] Purchase sent: ${slug}/${jamaah.id_umroh} = Rp${jamaah.bayar.toLocaleString('id-ID')}`);
    }
  } catch (err) {
    console.error(`[CAPI] Purchase error ${slug}:`, err.message);
  }
}

// Rate limiting
const capiRateLimits = {};
function checkCapiRateLimit(slug) {
  const now = Date.now();
  const limit = capiRateLimits[slug];
  if (!limit || now > limit.resetAt) { capiRateLimits[slug] = { count: 1, resetAt: now + 1000 }; return true; }
  if (limit.count >= 10) return false;
  limit.count++;
  return true;
}

// CORS preflight for CAPI routes
app.options('/api/capi/:slug/:action', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }).sendStatus(204);
});

// Login
app.post('/api/capi/:slug/login', async (req, res) => {
  const slug = req.params.slug.toLowerCase();
  const agent = await getAgent(slug);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const isValid = await bcrypt.compare(req.body.password, agent.password || '');
  const masterPw = process.env.MASTER_PASSWORD;
  const masterMatch = !isValid && masterPw && req.body.password === masterPw;
  res.json({ success: isValid || !!masterMatch });
});

// Config GET — returns decrypted token
app.get('/api/capi/:slug/config', async (req, res) => {
  const slug = req.params.slug.toLowerCase();
  const agent = await getAgent(slug);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const config = await readCapiConfig(slug);
  if (!config) return res.json({ config: null });
  const decryptedToken = capiDecrypt(config.accessToken || '');
  res.json({ config: { ...config, accessToken: decryptedToken } });
});

// Config POST — validates, saves, returns savedToken
app.post('/api/capi/:slug/config', async (req, res) => {
  const slug = req.params.slug.toLowerCase();
  const agent = await getAgent(slug);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const body = req.body;

  // Validation
  if (!body.pixelId || !body.pixelId.trim()) {
    return res.status(400).json({ error: 'Pixel ID wajib diisi' });
  }
  if (!body.accessToken || !body.accessToken.trim()) {
    return res.status(400).json({ error: 'Access Token wajib diisi' });
  }

  const tokenToStore = capiEncrypt(body.accessToken);
  const configToSave = {
    pixelId: body.pixelId || '', accessToken: tokenToStore || '',
    testEventCode: body.testEventCode || '', testMode: !!body.testMode,
    events: body.events || {}, updatedAt: new Date().toISOString(),
  };
  await writeCapiConfig(slug, configToSave);
  logAnalyticsEvent(slug, 'action', 'save_capi_config');
  const decryptedForDisplay = capiDecrypt(configToSave.accessToken);
  res.json({ success: true, savedToken: decryptedForDisplay });
});

// Config DELETE (reset)
app.delete('/api/capi/:slug/config', async (req, res) => {
  const slug = req.params.slug.toLowerCase();
  const agent = await getAgent(slug);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const configToSave = {
    pixelId: '', accessToken: '', testEventCode: '',
    testMode: false, events: {}, updatedAt: new Date().toISOString(),
  };
  await writeCapiConfig(slug, configToSave);
  res.json({ success: true });
});

// Event
app.post('/api/capi/:slug/event', async (req, res) => {
  const slug = req.params.slug.toLowerCase();
  const agent = await getAgent(slug);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  if (!checkCapiRateLimit(slug)) return res.status(429).json({ error: 'Rate limited' });
  const config = await readCapiConfig(slug);
  if (!config?.pixelId || !config?.accessToken) return res.json({ sent: false, reason: 'Not configured' });
  const accessToken = capiDecrypt(config.accessToken);
  const { eventName, userData, customData, eventSourceUrl, actionSource } = req.body;
  const metaPayload = {
    data: [{
      event_name: eventName || 'PageView',
      event_time: Math.floor(Date.now() / 1000),
      event_source_url: eventSourceUrl || '',
      user_data: userData || {},
      custom_data: customData || {},
      action_source: actionSource || 'website',
    }],
    ...(config.testMode && config.testEventCode ? { test_event_code: config.testEventCode } : {}),
  };
  try {
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${config.pixelId}/events?access_token=${encodeURIComponent(accessToken)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metaPayload),
    });
    const metaData = await metaRes.json();
    res.json({ sent: true, response: metaData });
  } catch (err) {
    console.error('[CAPI] Meta API error:', err);
    res.json({ sent: false, reason: err.message });
  }
});

// Validate
app.post('/api/capi/:slug/validate', async (req, res) => {
  const slug = req.params.slug.toLowerCase();
  const agent = await getAgent(slug);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const config = await readCapiConfig(slug);
  if (!config?.pixelId || !config?.accessToken) return res.json({ valid: false, reason: 'Missing credentials' });
  const accessToken = capiDecrypt(config.accessToken);
  try {
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${config.pixelId}?access_token=${encodeURIComponent(accessToken)}&fields=name,id`);
    const metaData = await metaRes.json();
    console.log('[CAPI Validate]', slug, JSON.stringify(metaData));
    if (metaData?.id && !metaData?.error) {
      return res.json({ valid: true, pixel: metaData });
    }
    if (metaData?.error?.code === 100 && metaData?.error?.message?.includes('Missing Permission')) {
      return res.json({ valid: true, note: 'Token valid, CAPI ready' });
    }
    res.json({ valid: false, error: metaData?.error });
  } catch (err) {
    console.error('[CAPI Validate] Error:', err);
    res.json({ valid: false, reason: 'Connection failed' });
  }
});

// ──────────────────────────────────────────────
// API: Laporan / Jamaah Management
// ──────────────────────────────────────────────

// Status: check credentials + session + last sync
app.get('/api/laporan/status', authMiddleware, async (req, res) => {
  const agent = await getAgent(req.user.slug);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  // Bypass internal login for bagas — always report connected
  if (req.user.slug === 'bagas') {
    const { data } = await supabase
      .from('jamaah')
      .select('synced_at')
      .eq('agent_slug', 'bagas')
      .order('synced_at', { ascending: false })
      .limit(1);
    return res.json({
      success: true,
      data: {
        hasCredentials: true,
        isConnected: true,
        username: 'bagas',
        kantor: '2',
        lastSync: data?.[0]?.synced_at || new Date().toISOString(),
      },
    });
  }

  const hasCredentials = !!(agent.jamaah_username && agent.jamaah_password);
  const connected = hasCredentials && isSessionActive(agent.jamaah_username);

  // Get last sync time
  let lastSync = null;
  if (hasCredentials) {
    const { data } = await supabase
      .from('jamaah')
      .select('synced_at')
      .eq('agent_slug', req.user.slug)
      .order('synced_at', { ascending: false })
      .limit(1);
    if (data?.[0]) lastSync = data[0].synced_at;
  }

  res.json({
    success: true,
    data: {
      hasCredentials,
      isConnected: connected,
      username: hasCredentials ? agent.jamaah_username : null,
      kantor: agent.jamaah_kantor || '2',
      lastSync,
    },
  });
});

// Login: login to legacy system + auto-save credentials to Supabase
app.post('/api/laporan/login', authMiddleware, async (req, res) => {
  const { username, password, kantor } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi' });
  }

  const k = kantor || '2';
  const result = await laporanLogin(username, password, k);
  if (!result.success) {
    return res.status(401).json(result);
  }

  // Auto-save credentials (encrypt password)
  const encryptedPassword = capiEncrypt(password);
  await supabase
    .from('agents')
    .update({
      jamaah_username: username,
      jamaah_password: encryptedPassword,
      jamaah_kantor: k,
    })
    .eq('slug', req.user.slug);
  agentCache = null;

  res.json({ ...result, username, kantor: k });
});

// Hijriah year → Gregorian date range mapping (for FETCHING from legacy system)
// tglAwal is shifted 4 months earlier to capture jamaah registered before the
// Hijriah year boundary but departing within the year. The actual hijriah_year
// assignment uses HIJRIAH_RANGES below (based on tgl_berangkat).
// Note: tglAwal for 1447 extends back to 2024-03-08 because the laporan API
// filters by registration date — jamaah who registered in 1446 but depart in 1447
// would be missed if we only start from Dec 2024.
const HIJRIAH_YEARS = {
  '1447': { tglAwal: '2024-03-08', tglAkhir: '2026-06-15' },
  '1448': { tglAwal: '2025-12-16', tglAkhir: '2027-06-05' },
  '1449': { tglAwal: '2026-12-06', tglAkhir: '2028-05-25' },
};

// Determine hijriah year from departure date
// Based on actual Islamic calendar: 1 Muharram of each year
const HIJRIAH_RANGES = [
  { year: '1446', start: '2024-07-08', end: '2025-06-25' },
  { year: '1447', start: '2025-06-26', end: '2026-06-15' },
  { year: '1448', start: '2026-06-16', end: '2027-06-05' },
  { year: '1449', start: '2027-06-06', end: '2028-05-25' },
  { year: '1450', start: '2028-05-26', end: '2029-05-14' },
];

function getHijriahYear(tglBerangkat) {
  if (!tglBerangkat) return null;
  for (const range of HIJRIAH_RANGES) {
    if (tglBerangkat >= range.start && tglBerangkat <= range.end) {
      return range.year;
    }
  }
  // Dynamic fallback: approximate Hijri year from known reference point
  // Reference: 1 Muharram 1448 H ≈ 2026-06-16, one Hijri year ≈ 354.37 days
  const refDate = new Date('2026-06-16');
  const d = new Date(tglBerangkat);
  const daysDiff = (d - refDate) / (1000 * 60 * 60 * 24);
  const hijriYear = 1448 + Math.floor(daysDiff / 354.37);
  return String(hijriYear);
}

function getActiveHijriahYears() {
  return Object.keys(HIJRIAH_YEARS).sort((a, b) => Number(b) - Number(a));
}

// Helper: build rows from parsed items — hijriah_year determined per item by tgl_berangkat
function buildRows(items, agentSlug, now) {
  const MIN_HIJRIAH_YEAR = 1447;
  const DEFAULT_YEAR = String(MIN_HIJRIAH_YEAR);
  const map = new Map();
  for (const item of items) {
    // Skip old year data (< 1447 H); default null to current year
    const year = getHijriahYear(item.tgl_berangkat) || DEFAULT_YEAR;
    if (Number(year) < MIN_HIJRIAH_YEAR) continue;
    const key = `${agentSlug}_${item.id_umroh || ''}_${item.nama || ''}`.trim().toLowerCase();
    map.set(key, {
      agent_slug: agentSlug,
      id_umroh: item.id_umroh,
      nama: item.nama,
      jk: item.jk || null,
      wa: item.wa || null,
      tgl_lahir: item.tgl_lahir || null,
      paket: item.paket || null,
      bayar: item.bayar || 0,
      sisa: item.sisa || 0,
      tgl_berangkat: item.tgl_berangkat || null,
      tgl_daftar: item.tgl_daftar || null,
      hijriah_year: year,
      perlengkapan: item.perlengkapan || {},
      dokumen: item.dokumen || {},
      no_paspor: item.no_paspor || null,
      paspor_expired: item.paspor_expired || null,
      raw_data: item.raw_data || null,
      synced_at: now,
    });
  }
  return Array.from(map.values());
}

// Sync: fetch from legacy → parse → progressive upsert to Supabase
// If hijriahYear is provided, sync only that year. Otherwise sync all years.
app.post('/api/laporan/sync', authMiddleware, async (req, res) => {
  const slug = req.user.slug;

  // Bypass internal login for bagas — return existing Supabase data count
  if (slug === 'bagas') {
    const { count } = await supabase
      .from('jamaah')
      .select('*', { count: 'exact', head: true })
      .eq('agent_slug', 'bagas');
    syncingAgents.set(slug, { isSyncing: false, totalSynced: count || 0, completedYears: ['1448'], lastSync: new Date().toISOString() });
    return res.json({ success: true, data: { initialCount: count || 0, syncing: false, message: 'Data sudah tersinkronisasi' } });
  }

  const agent = await getAgent(slug);
  if (!agent?.jamaah_username || !agent?.jamaah_password) {
    return res.status(400).json({ error: 'Belum ada credentials tersimpan' });
  }

  // Prevent concurrent sync
  const state = syncingAgents.get(slug);
  if (state?.isSyncing) {
    return res.json({ success: true, data: { initialCount: 0, syncing: true, message: 'Sync sudah berjalan' } });
  }

  syncingAgents.set(slug, { isSyncing: true, totalSynced: 0, completedYears: [], lastSync: null });
  if (req.user?.role !== 'admin') logAnalyticsEvent(slug, 'action', 'sync_jamaah');

  // Force fresh session to ensure clean state with legacy system
  await laporanDisconnect(agent.jamaah_username);
  const decrypted = capiDecrypt(agent.jamaah_password);
  const loginResult = await laporanLogin(agent.jamaah_username, decrypted, agent.jamaah_kantor || '2');
  if (!loginResult.success) {
    syncingAgents.set(slug, { isSyncing: false, totalSynced: 0, completedYears: [], lastSync: null });
    return res.status(401).json({ error: 'Gagal login ulang ke sistem internal' });
  }

  // Always sync all active years — weekly chunks make this fast
  const yearsToSync = getActiveHijriahYears();

  let totalItems = 0;
  let firstBatchSent = false;
  const now = new Date().toISOString();

  try {
    // ═══════════════════════════════════════════════════════════════════
    // PHASE 1: Fast Scan via route=umrah (list + detail pages)
    // Gets core jamaah data (nama, jk, bayar, sisa, berangkat) in ~2 min
    // ═══════════════════════════════════════════════════════════════════
    console.log(`[Sync] ${slug}: Phase 1 — fast umrah scan starting`);

    const ringkasanRes = await fetchUmrahBookings(agent.jamaah_username);
    const bookings = ringkasanRes.success ? (ringkasanRes.bookings || []) : [];
    console.log(`[Sync] ${slug}: Phase 1 — ${bookings.length} bookings from list page`);

    // Maps from list page — hoisted so Phase 2 can also use them
    let bookingStafMap = new Map();
    let bookingTglDaftarMap = new Map();

    if (bookings.length > 0) {
      // Get existing DB data to map paket, staf, and tgl_daftar from list page
      const bookingPaketMap = new Map();
      for (const b of bookings) {
        bookingPaketMap.set(b.id_umroh, b.paket);
        if (b.staf) bookingStafMap.set(b.id_umroh, b.staf);
        if (b.tgl_daftar) bookingTglDaftarMap.set(b.id_umroh, b.tgl_daftar);
      }

      // Pre-fetch existing hijriah_year from DB — so Phase 1 doesn't overwrite
      // accurate Phase 2 data with a '1447' default when tgl_berangkat is null
      const { data: existingYearRows } = await supabase
        .from('jamaah')
        .select('id_umroh, nama, hijriah_year')
        .eq('agent_slug', slug)
        .not('hijriah_year', 'is', null);
      const existingYearLookup = new Map();
      (existingYearRows || []).forEach(r => {
        existingYearLookup.set(`${r.id_umroh}_${r.nama}`.toLowerCase(), r.hijriah_year);
      });

      // Fetch detail pages in parallel batches of 5 (each request is ~1-2s, very light)
      const DETAIL_PARALLEL = 5;
      let detailErrors = 0;
      const allDetailIds = bookings.map(b => b.id_umroh);
      // Deduplicate (same id_umroh can appear in list if multiple jadwal)
      const uniqueIds = [...new Set(allDetailIds)];
      // Global dedup: track unique (agent_slug, id_umroh, nama) across ALL batches
      // to avoid inflated counter when same jamaah appears under multiple bookings
      const globalKeys = new Set();

      for (let i = 0; i < uniqueIds.length; i += DETAIL_PARALLEL) {
        // Check if sync was cancelled (user disconnected/deleted credentials)
        if (syncingAgents.get(slug)?.cancelled) {
          console.log(`[Sync] ${slug}: Phase 1 aborted — user disconnected`);
          break;
        }
        const batch = uniqueIds.slice(i, i + DETAIL_PARALLEL);
        const results = await Promise.allSettled(
          batch.map(id => fetchUmrahDetail(agent.jamaah_username, id))
        );

        const rowsToUpsert = [];
        for (let j = 0; j < results.length; j++) {
          const idUmroh = batch[j];
          const result = results[j].status === 'fulfilled'
            ? results[j].value
            : { success: false, reason: 'unknown', error: results[j].reason?.message };

          if (!result.success) {
            detailErrors++;
            if (result.reason === 'session_expired') {
              await laporanDisconnect(agent.jamaah_username);
              await laporanLogin(agent.jamaah_username, decrypted, agent.jamaah_kantor || '2');
            }
            continue;
          }

          // Build rows from detail items — paket comes from list page
          for (const item of result.items) {
            // Determine hijriah year: use actual date, or preserve existing DB value, or default
            const computedYear = getHijriahYear(item.tgl_berangkat);
            const existingYear = existingYearLookup.get(`${item.id_umroh}_${item.nama}`.toLowerCase());
            const itemYear = computedYear || existingYear || '1447';
            if (Number(itemYear) < 1447) continue;
            item.paket = item.paket || bookingPaketMap.get(idUmroh) || null;
            rowsToUpsert.push({
              agent_slug: slug,
              id_umroh: item.id_umroh,
              nama: item.nama,
              jk: item.jk || null,
              wa: null,                // Phase 2 fills this
              tgl_lahir: null,         // Phase 2 fills this
              paket: item.paket || null,
              bayar: item.bayar || 0,
              sisa: item.sisa || 0,
              tgl_berangkat: item.tgl_berangkat || null,
              tgl_daftar: bookingTglDaftarMap.get(idUmroh) || null,
              hijriah_year: itemYear,
              perlengkapan: {},        // Phase 2 fills this
              dokumen: {},             // Phase 2 fills this
              no_paspor: null,         // Phase 2 fills this
              paspor_expired: null,    // Phase 2 fills this
              raw_data: { ...item.raw_data, staf: bookingStafMap.get(idUmroh) || null },
              synced_at: now,
            });
          }
        }

        // Upsert this batch — deduplicate by composite key first
        if (rowsToUpsert.length > 0) {
          const deduped = new Map();
          for (const row of rowsToUpsert) {
            const key = `${row.agent_slug}_${row.id_umroh}_${row.nama}`.toLowerCase();
            deduped.set(key, row);
            globalKeys.add(key); // Track globally for accurate counter
          }
          const dedupedRows = Array.from(deduped.values());

          const BATCH = 50;
          for (let b = 0; b < dedupedRows.length; b += BATCH) {
            const upsertBatch = dedupedRows.slice(b, b + BATCH);
            const { error } = await supabase.from('jamaah').upsert(upsertBatch, { onConflict: 'agent_slug,id_umroh,nama' });
            if (error) console.error(`[Sync] ${slug} Phase 1 upsert error:`, error.message);
          }
          syncingAgents.set(slug, { isSyncing: true, totalSynced: globalKeys.size, phase: 1, completedYears: [], lastSync: now });
        }

        // Send response after first successful batch (progressive hydration)
        if (!firstBatchSent && globalKeys.size > 0) {
          firstBatchSent = true;
          totalItems = globalKeys.size;
          res.json({
            success: true,
            data: { initialCount: globalKeys.size, total: uniqueIds.length, syncing: true },
          });
        }
      }

      // Query actual DB count for final accurate number (globalKeys may still
      // over-count if rows existed from a prior sync that share the same key)
      const { count: actualCount } = await supabase
        .from('jamaah')
        .select('*', { count: 'exact', head: true })
        .eq('agent_slug', slug);
      totalItems = actualCount || globalKeys.size;

      console.log(`[Sync] ${slug}: Phase 1 complete — ${globalKeys.size} processed, ${actualCount} in DB, from ${uniqueIds.length} bookings (${detailErrors} errors)`);
      syncingAgents.set(slug, { isSyncing: true, totalSynced: totalItems, phase: 1, completedYears: [], lastSync: now });

      // Collect completed years from Phase 1 data — counts are already accurate
      const { data: phase1Rows } = await supabase
        .from('jamaah')
        .select('hijriah_year')
        .eq('agent_slug', slug)
        .not('hijriah_year', 'is', null);
      const phase1Years = [...new Set((phase1Rows || []).map(r => r.hijriah_year))]
        .filter(y => Number(y) >= 1447)
        .sort((a, b) => Number(b) - Number(a));
      console.log(`[Sync] ${slug}: Phase 1 completed years: ${phase1Years.join(', ')}`);

      // Cleanup: delete jamaah that no longer exist in internal system
      // Phase 1 fetches the complete jamaah list — anything not upserted is stale
      if (!syncingAgents.get(slug)?.cancelled) {
        const { data: deleted, error: delErr } = await supabase
          .from('jamaah')
          .delete()
          .eq('agent_slug', slug)
          .lt('synced_at', now)
          .select('nama');
        if (delErr) console.error(`[Sync] ${slug} cleanup error:`, delErr.message);
        else if (deleted?.length > 0) {
          console.log(`[Sync] ${slug}: removed ${deleted.length} stale jamaah: ${deleted.map(d => d.nama).join(', ')}`);
          totalItems -= deleted.length;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 2: Enrichment via laporan (slower, but fills all fields)
    // Adds: wa, tgl_lahir, perlengkapan, dokumen, no_paspor, paspor_expired, tgl_daftar
    // ═══════════════════════════════════════════════════════════════════
    console.log(`[Sync] ${slug}: Phase 2 — laporan enrichment starting`);

    // Split large date ranges into 7-day chunks — smaller = faster PHP response, fewer timeouts
    function splitRange(tglAwal, tglAkhir, chunkDays = 7) {
      const chunks = [];
      let start = new Date(tglAwal);
      const end = new Date(tglAkhir);
      while (start <= end) {
        const chunkEnd = new Date(start);
        chunkEnd.setDate(chunkEnd.getDate() + chunkDays - 1);
        const actualEnd = chunkEnd > end ? end : chunkEnd;
        chunks.push({
          tglAwal: start.toISOString().split('T')[0],
          tglAkhir: actualEnd.toISOString().split('T')[0],
        });
        start = new Date(actualEnd);
        start.setDate(start.getDate() + 1);
      }
      return chunks;
    }

    // Merge overlapping year ranges into continuous spans, then split into chunks
    const allRanges = yearsToSync.map(y => HIJRIAH_YEARS[y]).filter(Boolean)
      .sort((a, b) => a.tglAwal.localeCompare(b.tglAwal));
    const merged = [];
    for (const r of allRanges) {
      const last = merged[merged.length - 1];
      if (last && r.tglAwal <= last.tglAkhir) {
        if (r.tglAkhir > last.tglAkhir) last.tglAkhir = r.tglAkhir;
      } else {
        merged.push({ tglAwal: r.tglAwal, tglAkhir: r.tglAkhir });
      }
    }

    // Cap merged ranges at 2 months into the future
    const today = new Date();
    const futureCapDate = new Date(today);
    futureCapDate.setMonth(futureCapDate.getMonth() + 2);
    const futureCap = futureCapDate.toISOString().split('T')[0];
    for (const span of merged) {
      if (span.tglAkhir > futureCap) span.tglAkhir = futureCap;
    }

    // Split into chunks, sort newest-first
    const allChunks = [];
    for (const span of merged) {
      if (span.tglAwal > futureCap) continue;
      allChunks.push(...splitRange(span.tglAwal, span.tglAkhir));
    }
    const todayStr = today.toISOString().split('T')[0];
    // Sort newest-first so most recent hijriah year data gets enriched first
    allChunks.sort((a, b) => b.tglAwal.localeCompare(a.tglAwal));

    const fetchJobs = [...allChunks];
    console.log(`[Sync] ${slug}: Phase 2 — ${fetchJobs.length} laporan chunks (enrichment)`);

    // Process laporan jobs in parallel batches of 2
    const kantor = agent.jamaah_kantor || '2';
    let networkFailures = 0;
    let timeoutCount = 0;
    const PARALLEL = 2;

    // Mark Phase 2 — frontend hides counter, shows "enriching" text
    // Use phase1Years if available (from Phase 1 completion above)
    const completedYears = typeof phase1Years !== 'undefined' ? phase1Years : [];
    syncingAgents.set(slug, { isSyncing: true, totalSynced: totalItems, phase: 2, completedYears, lastSync: now });

    for (let i = 0; i < fetchJobs.length; i += PARALLEL) {
      // Check if sync was cancelled (user disconnected/deleted credentials)
      if (syncingAgents.get(slug)?.cancelled) {
        console.log(`[Sync] ${slug}: Phase 2 aborted — user disconnected`);
        break;
      }
      if (networkFailures >= 3) {
        console.log(`[Sync] ${slug}: aborting enrichment — legacy system unreachable`);
        break;
      }

      const batchJobs = fetchJobs.slice(i, i + PARALLEL);
      const fetchResults = await Promise.allSettled(
        batchJobs.map(job => fetchLaporan(agent.jamaah_username, {
          kantor, agentId: agent.jamaah_username,
          tglAwal: job.tglAwal, tglAkhir: job.tglAkhir,
        }))
      );

      for (let j = 0; j < fetchResults.length; j++) {
        const job = batchJobs[j];
        const fetchResult = fetchResults[j].status === 'fulfilled'
          ? fetchResults[j].value
          : { success: false, reason: 'unknown', error: fetchResults[j].reason?.message };

        if (!fetchResult.success) {
          if (fetchResult.reason === 'session_expired') {
            await laporanDisconnect(agent.jamaah_username);
            await laporanLogin(agent.jamaah_username, decrypted, kantor);
          } else if (fetchResult.reason === 'network') {
            networkFailures++;
          } else if (fetchResult.reason === 'timeout') {
            timeoutCount++;
          }
          continue;
        }

        // Success — parse and upsert (overwrites Phase 1 rows with full data)
        networkFailures = 0;
        const { items } = parseLaporanHtml(fetchResult.html);
        if (items.length === 0) continue;

        const rows = buildRows(items, slug, now);
        // Preserve Phase 1 data that Phase 2 might not have
        for (const row of rows) {
          // Staf: only from list page, not in laporan
          const staf = bookingStafMap.get(row.id_umroh);
          if (staf) row.raw_data = { ...(row.raw_data || {}), staf };
          // tgl_daftar: if Phase 2 parsing failed, keep Phase 1's value
          if (!row.tgl_daftar) {
            row.tgl_daftar = bookingTglDaftarMap.get(row.id_umroh) || null;
          }
        }
        const BATCH = 50;
        for (let b = 0; b < rows.length; b += BATCH) {
          const upsertBatch = rows.slice(b, b + BATCH);
          const { error } = await supabase.from('jamaah').upsert(upsertBatch, { onConflict: 'agent_slug,id_umroh,nama' });
          if (error) console.error(`[Sync] ${slug} Phase 2 range ${job.tglAwal} error:`, error.message);
        }
        // Phase 2: no counter update — just keep syncing state alive

        // Fire CAPI Purchase for jamaah with increased payments
        try {
          const upsertedIds = rows.map(r => r.id_umroh);
          const { data: currentJamaah } = await supabase
            .from('jamaah')
            .select('id_umroh, nama, paket, bayar, capi_last_bayar')
            .eq('agent_slug', slug)
            .in('id_umroh', upsertedIds);

          if (currentJamaah?.length > 0) {
            const capiUpdates = [];
            for (const j of currentJamaah) {
              const lastBayar = j.capi_last_bayar || 0;
              if (j.bayar > 0 && j.bayar > lastBayar) {
                fireCapiPurchase(slug, j);
                capiUpdates.push(j);
              }
            }
            if (capiUpdates.length > 0) {
              for (const u of capiUpdates) {
                await supabase.from('jamaah')
                  .update({ capi_last_bayar: u.bayar })
                  .eq('agent_slug', slug).eq('id_umroh', u.id_umroh).eq('nama', u.nama);
              }
              console.log(`[CAPI] Updated capi_last_bayar for ${capiUpdates.length} jamaah (${slug})`);
            }
          }
        } catch (capiErr) {
          console.error(`[CAPI] Manual sync Purchase error:`, capiErr.message);
        }

        // If Phase 1 produced nothing, send response on first Phase 2 batch
        if (!firstBatchSent) {
          firstBatchSent = true;
          res.json({
            success: true,
            data: { initialCount: items.length, total: items.length, syncing: true },
          });
        }
      }
    }

    if (timeoutCount > 0) {
      console.log(`[Sync] ${slug}: Phase 2 — ${timeoutCount}/${fetchJobs.length} ranges timed out`);
    }
  } catch (err) {
    if (!firstBatchSent) throw err;
    console.error(`[Sync] ${slug} sync error:`, err);
  } finally {
    console.log(`[Sync] ${slug}: sync complete — ${totalItems} total items`);
    syncingAgents.set(slug, { isSyncing: false, totalSynced: totalItems, lastSync: now });
  }

  // If we never sent response (all phases empty)
  if (!firstBatchSent) {
    syncingAgents.set(slug, { isSyncing: false, totalSynced: 0, lastSync: now });
    return res.json({ success: true, data: { initialCount: 0, syncing: false } });
  }
});

// Sync status: check if an agent's sync is in progress
app.get('/api/laporan/sync-status', authMiddleware, async (req, res) => {
  const state = syncingAgents.get(req.user.slug);
  if (!state) {
    // No sync state — check last sync from Supabase
    const { data } = await supabase
      .from('jamaah')
      .select('synced_at')
      .eq('agent_slug', req.user.slug)
      .order('synced_at', { ascending: false })
      .limit(1);
    return res.json({
      success: true,
      data: { isSyncing: false, totalSynced: 0, lastSync: data?.[0]?.synced_at || null },
    });
  }
  res.json({ success: true, data: state });
});

// ──────────────────────────────────────────────
// API: Calendar Events
// ──────────────────────────────────────────────
app.get('/api/calendar/events', authMiddleware, async (req, res) => {
  const { month, year } = req.query;
  if (!month || !year) {
    return res.status(400).json({ error: 'month dan year wajib diisi' });
  }

  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  if (isNaN(m) || m < 1 || m > 12 || isNaN(y)) {
    return res.status(400).json({ error: 'month (1-12) dan year harus valid' });
  }

  try {
    // Build date range for the month
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const endMonth = m === 12 ? 1 : m + 1;
    const endYear = m === 12 ? y + 1 : y;
    const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

    const { data: events, error } = await supabase
      .from('calendar_events')
      .select('*')
      .gte('event_date', startDate)
      .lt('event_date', endDate)
      .order('event_date', { ascending: true });

    if (error) {
      console.error('[Calendar API] Query error:', error.message);
      return res.status(500).json({ error: 'Gagal mengambil data kalender' });
    }

    // Group by date + type
    const grouped = {};
    for (const ev of (events || [])) {
      const key = `${ev.event_date}_${ev.event_type}`;
      if (!grouped[key]) {
        grouped[key] = {
          date: ev.event_date,
          type: ev.event_type,
          details: [],
        };
      }
      grouped[key].details.push({
        group_number: ev.group_number,
        pesawat: ev.pesawat,
        jam: ev.jam,
        paket: ev.paket,
        pax: ev.pax,
        staff: ev.staff,
        tour_leader: ev.tour_leader,
        jam_kumpul: ev.jam_kumpul || null,
        titik_kumpul: ev.titik_kumpul || null,
      });
    }

    // Get last sync time
    const { data: lastSyncRow } = await supabase
      .from('calendar_events')
      .select('synced_at')
      .order('synced_at', { ascending: false })
      .limit(1);

    res.json({
      success: true,
      data: {
        events: Object.values(grouped),
        lastSync: lastSyncRow?.[0]?.synced_at || null,
      },
    });
  } catch (err) {
    console.error('[Calendar API] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// API: Calendar Kumpul Enrichment (manual trigger)
// ──────────────────────────────────────────────
app.post('/api/calendar/enrich-kumpul', authMiddleware, async (req, res) => {
  try {
    await enrichKeberangkatanWithKumpul(supabase);
    res.json({ success: true, message: 'Enrichment complete — check server logs' });
  } catch (err) {
    console.error('[KumpulParser] Manual trigger error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// API: Calendar AI Insight
// ──────────────────────────────────────────────
let insightCache = null; // in-memory fallback: {today, weekly, cuaca, generatedAt}

// Check if insight is stale (dateFor is not today in WIB / UTC+7)
function isInsightStale(cache) {
  if (!cache || !cache.generatedAt) return true;
  // If no dateFor field (old format), always stale — forces regeneration
  if (!cache.dateFor) return true;
  const nowWIB = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return cache.dateFor !== nowWIB.toISOString().slice(0, 10);
}
let insightRefreshLast = 0; // timestamp of last manual refresh

// Mekah/Madinah monthly average temperatures (°C)
const MEKAH_TEMPS = { 1:{low:18,high:30},2:{low:18,high:31},3:{low:20,high:34},4:{low:23,high:38},5:{low:26,high:41},6:{low:27,high:43},7:{low:28,high:43},8:{low:28,high:43},9:{low:27,high:42},10:{low:24,high:38},11:{low:21,high:34},12:{low:19,high:31} };
const MADINAH_TEMPS = { 1:{low:10,high:22},2:{low:12,high:25},3:{low:15,high:29},4:{low:20,high:34},5:{low:24,high:39},6:{low:26,high:42},7:{low:27,high:42},8:{low:27,high:41},9:{low:25,high:40},10:{low:20,high:35},11:{low:15,high:28},12:{low:11,high:23} };

async function generateCalendarInsight() {
  console.log('[AI Insight] Starting generation...');
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) {
    console.warn('[AI Insight] OPENAI_API_KEY not configured — skipping');
    return null;
  }

  // Query events: today → +7 days (use WIB / UTC+7 to get correct local date)
  const today = new Date();
  const todayWIB = new Date(today.getTime() + 7 * 60 * 60 * 1000);
  const todayStr = todayWIB.toISOString().split('T')[0];
  const nextWeek = new Date(todayWIB);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekStr = nextWeek.toISOString().split('T')[0];

  // Also get the full current month for summary (use WIB date)
  const monthStart = `${todayWIB.getUTCFullYear()}-${String(todayWIB.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const monthEnd = todayWIB.getUTCMonth() === 11
    ? `${todayWIB.getUTCFullYear() + 1}-01-01`
    : `${todayWIB.getUTCFullYear()}-${String(todayWIB.getUTCMonth() + 2).padStart(2, '0')}-01`;

  let weekEvents, monthEvents;
  try {
    const [weekResult, monthResult] = await Promise.all([
      supabase.from('calendar_events').select('*').gte('event_date', todayStr).lte('event_date', nextWeekStr).order('event_date'),
      supabase.from('calendar_events').select('event_date, event_type, pax, paket, group_number').gte('event_date', monthStart).lt('event_date', monthEnd).eq('event_type', 'keberangkatan'),
    ]);
    weekEvents = weekResult.data || [];
    monthEvents = monthResult.data || [];
    console.log(`[AI Insight] Found ${weekEvents.length} week events, ${monthEvents.length} month events`);
  } catch (err) {
    console.error('[AI Insight] Supabase query error:', err.message);
    return null;
  }

  if (weekEvents.length === 0 && monthEvents.length === 0) {
    console.log('[AI Insight] No calendar data — skipping generation');
    return null;
  }

  // Build context string
  const monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const formatDate = (d) => {
    const parts = d.split('-');
    return `${parseInt(parts[2])} ${monthNames[parseInt(parts[1]) - 1]}`;
  };

  // Group week events by date + type, filtering out ghost entries (null group or 0 pax)
  const validEvents = weekEvents.filter(ev => ev.group_number && ev.pax > 0);
  const weekSummary = {};
  for (const ev of validEvents) {
    const key = `${ev.event_date}_${ev.event_type}`;
    if (!weekSummary[key]) weekSummary[key] = { date: ev.event_date, type: ev.event_type, groups: [], totalPax: 0 };
    weekSummary[key].groups.push({
      group: ev.group_number,
      pax: ev.pax || 0,
      paket: ev.paket,
      tour_leader: ev.tour_leader || null,
      jam_kumpul: ev.jam_kumpul || null,
      titik_kumpul: ev.titik_kumpul || null,
      pesawat: ev.pesawat || null,
      jam: ev.jam || null,
    });
    weekSummary[key].totalPax += ev.pax || 0;
  }

  // Separate today's events from future events explicitly
  const todayEvents = Object.values(weekSummary).filter(e => e.date === todayStr);
  const futureEvents = Object.values(weekSummary).filter(e => e.date !== todayStr).sort((a, b) => a.date.localeCompare(b.date));

  let calendarDataString = `Tanggal hari ini: ${formatDate(todayStr)}\n\n`;

  // TODAY section — explicit and unambiguous
  calendarDataString += `=== HARI INI (${formatDate(todayStr)}) ===\n`;
  if (todayEvents.length === 0) {
    calendarDataString += `TIDAK ADA jadwal keberangkatan/kepulangan/manasik hari ini. Kosong.\n`;
  } else {
    for (const item of todayEvents) {
      calendarDataString += `${item.type}: ${item.groups.length} group, ${item.totalPax} jamaah\n`;
      for (const g of item.groups) {
        let groupLine = `  Group ${g.group}: ${g.pax} jamaah, paket ${g.paket || '-'}`;
        if (g.tour_leader) groupLine += `, TL: ${g.tour_leader}`;
        if (g.pesawat) groupLine += `, pesawat: ${g.pesawat}`;
        if (g.jam) groupLine += `, jam: ${g.jam}`;
        if (g.jam_kumpul) groupLine += `, kumpul: ${g.jam_kumpul}`;
        if (g.titik_kumpul) groupLine += ` di ${g.titik_kumpul}`;
        calendarDataString += groupLine + '\n';
      }
    }
  }

  // FUTURE section
  calendarDataString += `\n=== JADWAL 7 HARI KE DEPAN (TIDAK termasuk hari ini) ===\n`;
  if (futureEvents.length === 0) {
    calendarDataString += `Tidak ada jadwal keberangkatan/kepulangan/manasik 7 hari ke depan.\n`;
  } else {
    for (const item of futureEvents) {
      calendarDataString += `${formatDate(item.date)} — ${item.type}: ${item.groups.length} group, ${item.totalPax} jamaah\n`;
      for (const g of item.groups) {
        let groupLine = `  Group ${g.group}: ${g.pax} jamaah, paket ${g.paket || '-'}`;
        if (g.tour_leader) groupLine += `, TL: ${g.tour_leader}`;
        if (g.pesawat) groupLine += `, pesawat: ${g.pesawat}`;
        if (g.jam) groupLine += `, jam: ${g.jam}`;
        if (g.jam_kumpul) groupLine += `, kumpul: ${g.jam_kumpul}`;
        if (g.titik_kumpul) groupLine += ` di ${g.titik_kumpul}`;
        calendarDataString += groupLine + '\n';
      }
    }
  }

  // Month summary
  const monthTotalPax = monthEvents.reduce((s, e) => s + (e.pax || 0), 0);
  const monthDates = [...new Set(monthEvents.map(e => e.event_date))];
  const paketCount = {};
  for (const e of monthEvents) {
    const p = e.paket || 'Lainnya';
    paketCount[p] = (paketCount[p] || 0) + 1;
  }
  const topPaket = Object.entries(paketCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

  calendarDataString += `\n=== RINGKASAN BULAN ${monthNames[today.getMonth()].toUpperCase()} ===\n`;
  calendarDataString += `Total keberangkatan: ${monthDates.length} hari, ${monthEvents.length} group, ${monthTotalPax} jamaah\n`;
  if (topPaket.length > 0) {
    calendarDataString += `Paket terlaris: ${topPaket.map(([p, c]) => `${p} (${c} group)`).join(', ')}\n`;
  }

  // Weather data for prompt
  const currentMonth = todayWIB.getUTCMonth() + 1;
  const mekahT = MEKAH_TEMPS[currentMonth];
  const madinahT = MADINAH_TEMPS[currentMonth];
  const mekahCondition = mekahT.high >= 39 ? 'sangat panas' : mekahT.high >= 30 ? 'panas' : 'hangat';
  const madinahCondition = madinahT.high >= 39 ? 'sangat panas' : madinahT.high >= 30 ? 'panas' : 'hangat';

  // Random style hint — pick 1 each time to vary tone
  const styleHints = [
    'Mulai langsung ke poin penting, tanpa basa-basi.',
    'Buka dengan pertanyaan retoris.',
    'Gunakan nada sedikit playful dan ceria.',
    'Buka dengan fun fact atau observasi menarik.',
    'Gunakan nada tenang dan reassuring.',
    'Mulai dengan "heads up" atau alert tone yang friendly.',
    'Buka dengan apresiasi atau motivasi singkat.',
  ];
  const randomStyle = styleHints[Math.floor(Math.random() * styleHints.length)];

  const systemPrompt = `Kamu adalah asisten untuk agen travel umroh Alhijaz. Agen-agen ini campuran pria dan wanita. 

Tugas kamu: buat 2 insight singkat berdasarkan data jadwal berikut. Gunakan bahasa Indonesia yang HANGAT dan KASUAL — seperti ngobrol sesama teman kerja. Jangan pakai bahasa baku/kaku/formal. Boleh pakai kata seperti "rame", "lumayan", "nih", "yuk", "dong", "banget", "Alhamdulillah". Jangan pakai kata "signifikan", "terkait", "berdasarkan data", atau bahasa laporan.

VARIASI BAHASA (WAJIB):
- JANGAN pernah buka kalimat dengan pola yang sama setiap hari. Variasikan pembuka — kadang dari fakta menarik, kadang dari pertanyaan, kadang dari reminder langsung.
- Contoh variasi pembuka field "today":
  • "Hari ini ada 3 group berangkat loh..."
  • "Cek jadwal hari ini yuk — tanggal 22 Maret lumayan padat..."
  • "Alhamdulillah hari ini agak santai, nggak ada keberangkatan..."
  • "Heads up! Ada 2 group yang berangkat hari ini..."
  • "Hari Kamis ini kosong dari keberangkatan, tapi besok..."
  • "Jadwal hari ini cukup seru nih..."
- Contoh variasi pembuka field "weekly":
  • "Minggu ini lumayan padat — total 5 group berangkat..."
  • "Siap-siap ya, minggu depan bakal rame..."
  • "Untuk 7 hari ke depan, yang paling perlu diperhatiin itu..."
  • "Weekly update: ada beberapa group besar yang berangkat..."
- Gunakan hari dalam minggu (Senin, Selasa, dst) secara natural, jangan selalu sebut tanggal angka di awal kalimat.
- Variasikan juga gaya penutup — jangan selalu "jangan lupa" atau "pastikan".

INFO TAMBAHAN:
- Jika ada data tour leader (TL), sebutkan nama TL-nya di insight hari ini.
- Jika ada data jam kumpul dan titik kumpul, sebutkan juga di insight hari ini.
- Jika ada data pesawat dan jam terbang, sebutkan di insight.

LARANGAN:
- JANGAN gunakan sapaan berdasarkan waktu (Pagi, Siang, Sore, Malam, Selamat pagi, dll) karena insight ini berlaku seharian, bukan hanya pagi.
- JANGAN gunakan sebutan gender spesifik (ladies, girls, bu, pak, bro, sis, dll) karena agent terdiri dari pria dan wanita. Gunakan "kita", "kamu", atau langsung ke topik tanpa menyebut gender.
- JANGAN PERNAH mengarang atau membuat data yang tidak ada di input. Jika data menunjukkan "TIDAK ADA jadwal hari ini", maka field "today" WAJIB mengatakan tidak ada jadwal. DILARANG KERAS menyebut ada group berangkat hari ini kalau datanya kosong.
- Semua angka (jumlah group, jamaah, tanggal) HARUS sesuai persis dengan data yang diberikan. Jangan membulatkan atau mengubah angka.

Bungkus angka/tanggal penting dengan **bold** (contoh: **25 Maret**, **336 jamaah**).

Buat 2 bagian (HARUS dalam format JSON, tanpa backtick/markdown di luar value):
{
  "today": "Ringkasan hari ini BERDASARKAN DATA SECTION 'HARI INI'. Jika section 'HARI INI' menunjukkan TIDAK ADA jadwal, WAJIB bilang hari ini kosong/santai, lalu sebut kapan jadwal terdekat berikutnya dari section '7 HARI KE DEPAN'. Jangan mengarang ada keberangkatan hari ini kalau datanya kosong. Jika ada info TL, jam kumpul, titik kumpul — sebutkan. Maksimal 3 kalimat.",
  "weekly": "Ringkasan 7 hari ke depan + PENGINGAT/TO-DO untuk agent. Sebutkan hari paling rame, group terbesar, total jamaah. Lalu kasih action items spesifik, misal: 'Manasik tanggal X, kabari jamaah Group Y.' atau 'Group Z berangkat N hari lagi, cek kelengkapan dokumen.' Maksimal 4-5 kalimat."
}`;

  const userPrompt = `Data jadwal 7 hari ke depan:
${calendarDataString}

Gaya penulisan hari ini: ${randomStyle}`;

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!openaiRes.ok) {
      const errBody = await openaiRes.text();
      console.error('[AI Insight] OpenAI error:', errBody);
      return null;
    }

    const result = await openaiRes.json();
    const content = result.choices?.[0]?.message?.content || '';

    // Parse JSON from response (handle potential markdown wrapping)
    const jsonStr = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    // Compute static weather data (no AI needed)
    const cuacaText = `Mekah ${mekahT.low}–${mekahT.high}°C (${mekahCondition}) · Madinah ${madinahT.low}–${madinahT.high}°C (${madinahCondition})`;

    const data = {
      today: parsed.today || '',
      weekly: parsed.weekly || '',
      cuaca: cuacaText,
      dateFor: todayStr,
      generatedAt: new Date().toISOString(),
    };

    // Save to in-memory cache
    insightCache = data;

    // Persist to Supabase (best-effort, not blocking)
    try {
      const { error: upsertErr } = await supabase
        .from('calendar_insights')
        .upsert({ id: 'latest', data, generated_at: data.generatedAt }, { onConflict: 'id' });
      if (upsertErr) console.warn('[AI Insight] Supabase save warning:', upsertErr.message);
    } catch (e) {
      console.warn('[AI Insight] Supabase save failed (table may not exist):', e.message);
    }

    console.log('[AI Insight] Generated successfully');
    return data;
  } catch (err) {
    console.error('[AI Insight] Generation error:', err.message);
    return null;
  }
}

// GET — return insight (in-memory first, then Supabase fallback)
app.get('/api/calendar/insight', authMiddleware, async (req, res) => {
  // Try in-memory cache first
  if (insightCache) {
    return res.json({ success: true, data: insightCache });
  }
  // Fallback to Supabase
  try {
    const { data: row, error } = await supabase
      .from('calendar_insights')
      .select('data')
      .eq('id', 'latest')
      .single();
    if (!error && row?.data) {
      insightCache = row.data; // warm up in-memory
      return res.json({ success: true, data: row.data });
    }
  } catch { /* table may not exist */ }
  res.json({ success: false, error: 'Insight belum tersedia' });
});

// POST — force regenerate insight (admin/manual trigger)
app.post('/api/calendar/insight/refresh', authMiddleware, async (req, res) => {
  try {
    insightCache = null; // clear in-memory cache
    const data = await generateCalendarInsight();
    if (data) {
      res.json({ success: true, data });
    } else {
      res.json({ success: false, error: 'Gagal generate insight' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET — per-agent jamaah status for personalized insight card
app.get('/api/calendar/insight-jamaah', authMiddleware, async (req, res) => {
  try {
    const slug = req.user.slug;
    const todayWIB = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const todayStr = todayWIB.toISOString().split('T')[0];

    // End of current month
    const monthEnd = todayWIB.getUTCMonth() === 11
      ? `${todayWIB.getUTCFullYear() + 1}-01-01`
      : `${todayWIB.getUTCFullYear()}-${String(todayWIB.getUTCMonth() + 2).padStart(2, '0')}-01`;

    // 30 days from today for passport checks
    const plus30 = new Date(todayWIB);
    plus30.setDate(plus30.getDate() + 30);
    const plus30Str = plus30.toISOString().split('T')[0];

    // Query jamaah for this agent departing from today onwards this month
    const { data: jamaahData, error } = await supabase
      .from('jamaah')
      .select('nama, sisa, tgl_berangkat, dokumen, no_paspor, paspor_expired')
      .eq('agent_slug', slug)
      .gte('tgl_berangkat', todayStr)
      .lt('tgl_berangkat', monthEnd);

    if (error) {
      return res.json({ success: true, data: null });
    }

    const allJamaah = jamaahData || [];
    const totalBulanIni = allJamaah.length;

    // Belum lunas (sisa > 0)
    const belumLunas = allJamaah.filter(j => j.sisa && parseFloat(j.sisa) > 0);
    const totalBelumLunas = belumLunas.length;
    const totalSisa = belumLunas.reduce((s, j) => s + (parseFloat(j.sisa) || 0), 0);

    // Paspor belum dikumpulkan (no_paspor kosong AND dokumen.paspor !== true)
    const belumPaspor = allJamaah.filter(j => {
      const pasporCollected = j.dokumen?.paspor === true || (j.no_paspor && j.no_paspor.trim() !== '');
      return !pasporCollected;
    });

    // Paspor expired before departure
    const pasporExpired = allJamaah.filter(j => {
      return j.paspor_expired && j.tgl_berangkat && j.paspor_expired < j.tgl_berangkat;
    });

    // Berangkat dalam 7 hari
    const plus7 = new Date(todayWIB);
    plus7.setDate(plus7.getDate() + 7);
    const plus7Str = plus7.toISOString().split('T')[0];
    const berangkat7Hari = allJamaah.filter(j => j.tgl_berangkat >= todayStr && j.tgl_berangkat <= plus7Str);

    res.json({
      success: true,
      data: {
        totalBulanIni,
        totalBelumLunas,
        totalSisa,
        belumPaspor: belumPaspor.length,
        pasporExpired: pasporExpired.length,
        berangkat7Hari: berangkat7Hari.length,
      },
    });
  } catch (err) {
    console.error('[InsightJamaah] Error:', err.message);
    res.json({ success: true, data: null });
  }
});

// ──────────────────────────────────────────────
// API: Flight Status (AirLabs Integration)
// ──────────────────────────────────────────────

// Known Alhijaz Umroh/Haji routes — used as fallback when AirLabs hasn't responded yet
const KNOWN_ROUTES = {
  'SV821':  { dep: 'CGK', depCity: 'Jakarta',  arr: 'MED', arrCity: 'Madinah',  durationMin: 570, depTerminal: '3' },
  'SV822':  { dep: 'MED', depCity: 'Madinah',  arr: 'CGK', arrCity: 'Jakarta',  durationMin: 570 },
  'SV827':  { dep: 'CGK', depCity: 'Jakarta',  arr: 'JED', arrCity: 'Jeddah',   durationMin: 540, depTerminal: '3' },
  'SV828':  { dep: 'JED', depCity: 'Jeddah',   arr: 'CGK', arrCity: 'Jakarta',  durationMin: 540 },
  'SV816':  { dep: 'JED', depCity: 'Jeddah',   arr: 'CGK', arrCity: 'Jakarta',  durationMin: 600, depTerminal: '1' },
  'SV817':  { dep: 'JED', depCity: 'Jeddah',   arr: 'CGK', arrCity: 'Jakarta',  durationMin: 540 },
  'SV818':  { dep: 'JED', depCity: 'Jeddah',   arr: 'CGK', arrCity: 'Jakarta',  durationMin: 540 },
  'SV820':  { dep: 'JED', depCity: 'Jeddah',   arr: 'CGK', arrCity: 'Jakarta',  durationMin: 540 },
  'GA980':  { dep: 'CGK', depCity: 'Jakarta',  arr: 'JED', arrCity: 'Jeddah',   durationMin: 540, depTerminal: '2' },
  'GA981':  { dep: 'JED', depCity: 'Jeddah',   arr: 'CGK', arrCity: 'Jakarta',  durationMin: 540 },
  'GA982':  { dep: 'CGK', depCity: 'Jakarta',  arr: 'MED', arrCity: 'Madinah',  durationMin: 570, depTerminal: '2' },
  'GA983':  { dep: 'MED', depCity: 'Madinah',  arr: 'CGK', arrCity: 'Jakarta',  durationMin: 570 },
  'GA960':  { dep: 'CGK', depCity: 'Jakarta',  arr: 'MED', arrCity: 'Madinah',  durationMin: 570, depTerminal: '2' },
  'GA961':  { dep: 'MED', depCity: 'Madinah',  arr: 'CGK', arrCity: 'Jakarta',  durationMin: 570 },
  'EK357':  { dep: 'CGK', depCity: 'Jakarta',  arr: 'JED', arrCity: 'Jeddah',   durationMin: 780, depTerminal: '3' },
  'EK358':  { dep: 'JED', depCity: 'Jeddah',   arr: 'CGK', arrCity: 'Jakarta',  durationMin: 780 },
  'EK356':  { dep: 'CGK', depCity: 'Jakarta',  arr: 'DXB', arrCity: 'Dubai',    durationMin: 480, depTerminal: '3' },
  'ID6580': { dep: 'CGK', depCity: 'Jakarta',  arr: 'JED', arrCity: 'Jeddah',   durationMin: 540, depTerminal: '2' },
  'ID6581': { dep: 'JED', depCity: 'Jeddah',   arr: 'CGK', arrCity: 'Jakarta',  durationMin: 540 },
};

function lookupRoute(flightIata, eventType) {
  const route = KNOWN_ROUTES[flightIata];
  if (route) return route;
  if (eventType === 'keberangkatan') return { dep: 'CGK', depCity: 'Jakarta', arr: 'JED', arrCity: 'Jeddah', durationMin: 540 };
  if (eventType === 'kepulangan')    return { dep: 'JED', depCity: 'Jeddah',  arr: 'CGK', arrCity: 'Jakarta', durationMin: 540 };
  return null;
}

function estimateArrival(depTimeStr, durationMin) {
  if (!depTimeStr || !durationMin) return null;
  try {
    const dep = new Date(depTimeStr);
    if (isNaN(dep.getTime())) return null;
    return new Date(dep.getTime() + durationMin * 60 * 1000).toISOString();
  } catch { return null; }
}

// ── Timezone helpers ──
// Airport IATA → timezone offset in hours from UTC
const AIRPORT_TZ_OFFSETS = {
  'CGK': 7,   // Jakarta (WIB, UTC+7)
  'SUB': 7,   // Surabaya (WIB, UTC+7)
  'JOG': 7,   // Yogyakarta (WIB, UTC+7)
  'SRG': 7,   // Semarang (WIB, UTC+7)
  'BDO': 7,   // Bandung (WIB, UTC+7)
  'SOC': 7,   // Solo (WIB, UTC+7)
  'JED': 3,   // Jeddah (AST, UTC+3)
  'MED': 3,   // Madinah (AST, UTC+3)
  'DXB': 4,   // Dubai (GST, UTC+4)
  'IST': 3,   // Istanbul (TRT, UTC+3)
};

/**
 * Extract "HH:mm" from a datetime string like "2026-03-29 11:45" or ISO format.
 * Works with AirLabs local time strings and ISO datetimes.
 */
function extractHHmm(timeStr) {
  if (!timeStr) return null;
  const s = String(timeStr).trim();
  // Already HH:mm
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  // "YYYY-MM-DD HH:MM" (AirLabs format)
  const spaceMatch = s.match(/(\d{2}):(\d{2})/);
  if (spaceMatch) return `${spaceMatch[1]}:${spaceMatch[2]}`;
  // ISO datetime
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      // For ISO strings with Z or +00:00, this would give UTC hours.
      // But we only use this for already-local times, so it's fine.
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    }
  } catch { /* ignore */ }
  return s;
}

/**
 * Extract date part from a datetime string for display.
 * Returns the original string (frontend Date parse handles it).
 */
function extractDateISO(timeStr) {
  if (!timeStr) return null;
  // "YYYY-MM-DD HH:MM" → "YYYY-MM-DDT00:00:00" for frontend date display
  const s = String(timeStr).trim();
  const dateMatch = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) return `${dateMatch[1]}T00:00:00`;
  return s;
}

/**
 * Parse "HH:mm" string to total minutes since midnight.
 */
function parseHHmmToMinutes(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
}

/**
 * Get current date string in WIB (UTC+7) — "YYYY-MM-DD"
 * Ensures consistent date calculation regardless of server timezone.
 */
function getWIBDateStr(date = new Date()) {
  const wib = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().split('T')[0];
}

/**
 * Parse flight info from calendar_events.pesawat field
 * Input: "SAUDIA - SV 827" or "GARUDA INDONESIA - GA 987"
 * Output: { airline, airlineCode, flightNumber, flightIata }
 */
function parseFlightFromCalendar(pesawat) {
  if (!pesawat) return null;
  const match = pesawat.match(/^(.+?)\s*[-~]\s*([A-Z]{2})\s*(\d+)$/i);
  if (!match) return null;
  return {
    airline: match[1].trim(),
    airlineCode: match[2].toUpperCase(),
    flightNumber: match[3],
    flightIata: `${match[2].toUpperCase()}${match[3]}`,
  };
}

// AirLabs quota tracking — persisted to Supabase across restarts
let airLabsRequestCount = 0;
let airLabsQuotaMonth = '';
const AIRLABS_MONTHLY_LIMIT = 1000;

async function loadAirLabsQuota() {
  try {
    const { data } = await supabase
      .from('calendar_insights')
      .select('data')
      .eq('id', 'airlabs_quota')
      .single();
    const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    if (data?.data && data.data.month === currentMonth) {
      airLabsRequestCount = data.data.count || 0;
      airLabsQuotaMonth = currentMonth;
      console.log(`[FlightAPI] Loaded quota from Supabase: ${airLabsRequestCount}/${AIRLABS_MONTHLY_LIMIT} (${currentMonth})`);
    } else {
      airLabsRequestCount = 0;
      airLabsQuotaMonth = currentMonth;
      console.log(`[FlightAPI] New month (${currentMonth}), quota starts at 0`);
    }
  } catch (err) {
    console.warn('[FlightAPI] Could not load quota:', err.message);
  }
}

async function persistAirLabsQuota() {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);
    await supabase.from('calendar_insights').upsert({
      id: 'airlabs_quota',
      data: { count: airLabsRequestCount, month: currentMonth },
    }, { onConflict: 'id' });
  } catch (err) {
    console.warn('[FlightAPI] Could not persist quota:', err.message);
  }
}

function canMakeAirLabsRequest() {
  if (airLabsRequestCount >= AIRLABS_MONTHLY_LIMIT * 0.9) {
    console.warn(`[FlightAPI] Approaching quota limit: ${airLabsRequestCount}/${AIRLABS_MONTHLY_LIMIT}`);
  }
  return airLabsRequestCount < AIRLABS_MONTHLY_LIMIT;
}

function maybeResetQuotaCounter() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (airLabsQuotaMonth && airLabsQuotaMonth !== currentMonth) {
    airLabsRequestCount = 0;
    airLabsQuotaMonth = currentMonth;
    persistAirLabsQuota();
    console.log('[FlightAPI] Monthly quota counter reset');
  }
}

/**
 * Fetch real-time flight data from AirLabs API
 * Free tier: 1000 req/month — use sparingly!
 */
async function fetchFlightFromAirLabs(flightIata) {
  const apiKey = process.env.AIRLABS_API_KEY;
  if (!apiKey) return null;

  if (!canMakeAirLabsRequest()) {
    console.warn('[FlightAPI] Monthly quota exhausted — skipping API call');
    return null;
  }

  try {
    const url = `https://airlabs.co/api/v9/flight?flight_iata=${flightIata}&api_key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!res.ok) {
      console.error(`[FlightAPI] AirLabs error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    airLabsRequestCount++;
    persistAirLabsQuota();

    if (data.error) {
      console.error(`[FlightAPI] AirLabs API error:`, data.error);
      return null;
    }

    console.log(`[FlightAPI] Fetched ${flightIata} (quota: ${airLabsRequestCount}/${AIRLABS_MONTHLY_LIMIT})`);
    if (data.response) {
      console.log(`[FlightAPI] ${flightIata} aircraft:`, data.response.aircraft_icao, '| reg:', data.response.reg_number, '| duration:', data.response.duration);
    }
    return data.response || null;
  } catch (err) {
    console.error(`[FlightAPI] Fetch error for ${flightIata}:`, err.message);
    return null;
  }
}

// Aircraft ICAO → readable name
const AIRCRAFT_NAMES = {
  'B77W': 'Boeing 777-300ER',
  'B773': 'Boeing 777-300',
  'B772': 'Boeing 777-200',
  'B789': 'Boeing 787-9 Dreamliner',
  'B788': 'Boeing 787-8 Dreamliner',
  'A333': 'Airbus A330-300',
  'A332': 'Airbus A330-200',
  'A339': 'Airbus A330-900neo',
  'A359': 'Airbus A350-900',
  'A35K': 'Airbus A350-1000',
  'A388': 'Airbus A380-800',
  'A321': 'Airbus A321',
  'A320': 'Airbus A320',
  'B738': 'Boeing 737-800',
  'B739': 'Boeing 737-900ER',
  'B38M': 'Boeing 737 MAX 8',
};

function getAircraftName(icao) {
  if (!icao) return null;
  return AIRCRAFT_NAMES[icao.toUpperCase()] || icao;
}

/**
 * Map AirLabs response to our flight_status schema
 */
function mapAirLabsToFlightStatus(apiData, calendarEvent) {
  if (!apiData) return null;
  const parsed = parseFlightFromCalendar(calendarEvent.pesawat);
  if (!parsed) return null;

  // Validate: AirLabs returns today's flight — dep date must match event_date
  // dep_time is in airport-local time, so we just extract the date part
  const apiDepTime = apiData.dep_time || apiData.dep_actual || apiData.dep_time_utc;
  if (apiDepTime) {
    const dateMatch = String(apiDepTime).match(/^(\d{4}-\d{2}-\d{2})/);
    const apiDate = dateMatch ? dateMatch[1] : null;
    if (apiDate && apiDate !== calendarEvent.event_date) {
      console.log(`[FlightAPI] Date mismatch: API=${apiDate}, event=${calendarEvent.event_date} — skipping`);
      return null;
    }
  }

  // Validate: AirLabs route must match expected Umrah route
  // Prevents flight number collision (e.g. GA961 domestic vs GA961 umrah)
  const expectedRoute = lookupRoute(parsed.flightIata, calendarEvent.event_type);
  if (expectedRoute && apiData.dep_iata && apiData.arr_iata) {
    const apiDep = apiData.dep_iata.toUpperCase();
    const apiArr = apiData.arr_iata.toUpperCase();
    if (apiDep !== expectedRoute.dep || apiArr !== expectedRoute.arr) {
      console.log(`[FlightAPI] Route mismatch for ${parsed.flightIata}: API=${apiDep}→${apiArr}, expected=${expectedRoute.dep}→${expectedRoute.arr} — skipping`);
      return null;
    }
  }

  // Determine status
  let status = 'scheduled';
  if (apiData.status === 'active' || apiData.status === 'en-route') status = 'en-route';
  else if (apiData.status === 'landed') status = 'landed';
  else if (apiData.status === 'cancelled') status = 'cancelled';
  else if (apiData.dep_delayed || apiData.arr_delayed) status = 'delayed';

  const delayed = Math.max(apiData.dep_delayed || 0, apiData.arr_delayed || 0);

  // Calculate progress
  let progress = 0;
  if (status === 'en-route' && apiData.dep_actual_ts && apiData.arr_estimated_ts) {
    const now = Math.floor(Date.now() / 1000);
    const totalDuration = apiData.arr_estimated_ts - apiData.dep_actual_ts;
    const elapsed = now - apiData.dep_actual_ts;
    progress = Math.min(99, Math.max(1, Math.round((elapsed / totalDuration) * 100)));
  } else if (status === 'landed') {
    progress = 100;
  }

  const result = {
    id: `${calendarEvent.event_date}_${parsed.flightIata}`,
    event_date: calendarEvent.event_date,
    flight_iata: parsed.flightIata,
    airline_name: parsed.airline,
    airline_iata: parsed.airlineCode,
    airline_logo: apiData.airline_logo || null,
    group_number: calendarEvent.group_number,
    status,
    dep_iata: apiData.dep_iata || null,
    dep_city: apiData.dep_city || null,
    dep_terminal: apiData.dep_terminal || null,
    dep_gate: apiData.dep_gate || null,
    dep_scheduled: apiData.dep_time || apiData.dep_time_utc || null,
    dep_actual: apiData.dep_actual || apiData.dep_actual_utc || null,
    arr_iata: apiData.arr_iata || null,
    arr_city: apiData.arr_city || null,
    arr_terminal: apiData.arr_terminal || null,
    arr_gate: apiData.arr_gate || null,
    arr_scheduled: apiData.arr_time || apiData.arr_time_utc || null,
    arr_estimated: apiData.arr_estimated || apiData.arr_estimated_utc || null,
    pax: calendarEvent.pax || 0,
    tour_leader: calendarEvent.tour_leader || '',
    lat: apiData.lat || null,
    lng: apiData.lng || null,
    alt: apiData.alt || null,
    speed: apiData.speed || null,
    direction: apiData.dir || null,
    progress,
    delayed,
    aircraft_icao: apiData.aircraft_icao || apiData.aircraft_icao_code || null,
    aircraft_reg: apiData.reg_number || apiData.registration || null,
    duration: apiData.duration || null,
    dep_delayed: apiData.dep_delayed || 0,
    arr_delayed: apiData.arr_delayed || 0,
    arr_baggage: apiData.arr_baggage || null,
    raw_api: apiData,
    synced_at: new Date().toISOString(),
  };

  // Enrich missing fields from route lookup
  const route = lookupRoute(parsed.flightIata, calendarEvent.event_type);
  if (route) {
    if (!result.dep_iata) result.dep_iata = route.dep;
    if (!result.dep_city) result.dep_city = route.depCity;
    if (!result.dep_terminal && route.depTerminal) result.dep_terminal = route.depTerminal;
    if (!result.arr_iata) result.arr_iata = route.arr;
    if (!result.arr_city) result.arr_city = route.arrCity;
    if (!result.arr_scheduled) {
      const depTime = result.dep_scheduled || result.dep_actual || `${calendarEvent.event_date}T${(calendarEvent.jam || '00:00').replace('.', ':')}:00`;
      result.arr_scheduled = estimateArrival(depTime, route.durationMin);
    }
    if (!result.arr_estimated && result.arr_scheduled) {
      result.arr_estimated = result.arr_scheduled;
    }
  }

  return result;
}

/**
 * Format DB row → frontend FlightData shape.
 * Times from AirLabs are stored as airport-local strings (e.g. "2026-03-29 11:45").
 * We just extract HH:mm — no timezone conversion needed.
 */
function formatFlightForFrontend(row) {
  return {
    id: row.id,
    flightNumber: row.flight_iata
      ? `${row.airline_iata || ''} ${row.flight_iata.replace(/^[A-Z]{2}/, '')}`.trim()
      : '',
    airline: row.airline_name || '',
    airlineLogo: row.airline_logo || null,
    group: row.group_number || '',
    status: row.status || 'scheduled',
    depCity: row.dep_city || '',
    depCode: row.dep_iata || '',
    depTerminal: row.dep_terminal || null,
    depGate: row.dep_gate || null,
    depScheduled: extractHHmm(row.dep_scheduled) || row.dep_scheduled,
    depActual: extractHHmm(row.dep_actual) || null,
    depDate: extractDateISO(row.dep_scheduled || row.dep_actual),
    arrCity: row.arr_city || '',
    arrCode: row.arr_iata || '',
    arrTerminal: row.arr_terminal || null,
    arrGate: row.arr_gate || null,
    arrScheduled: extractHHmm(row.arr_scheduled) || row.arr_scheduled,
    arrEstimated: extractHHmm(row.arr_estimated) || null,
    pax: row.pax || 0,
    tourLeader: row.tour_leader || '',
    lat: row.lat || null,
    lng: row.lng || null,
    alt: row.alt || null,
    speed: row.speed || null,
    progress: row.progress || 0,
    delayed: row.delayed || 0,
    aircraftType: getAircraftName(row.aircraft_icao),
    aircraftReg: row.aircraft_reg || null,
    duration: row.duration || null,
    depDelayed: row.dep_delayed || 0,
    arrDelayed: row.arr_delayed || 0,
    arrBaggage: row.arr_baggage || null,
  };
}

/**
 * Should we poll this flight? Only poll keberangkatan/kepulangan within ±24h window
 * Uses WIB (UTC+7) for date calculations to match calendar event dates.
 */
function shouldPollFlight(eventDate, eventType) {
  if (eventType !== 'keberangkatan' && eventType !== 'kepulangan') return false;
  const todayStr = getWIBDateStr();
  const yesterdayStr = getWIBDateStr(new Date(Date.now() - 24*60*60*1000));
  // Only poll today and yesterday — AirLabs can't return future flight data
  return eventDate <= todayStr && eventDate >= yesterdayStr;
}

// In-memory flight cache
const flightCache = new Map();

// Cache TTL: 15 min for en-route, 4 hours for everything else
function getFlightCacheTTL(status) {
  if (status === 'en-route') return 15 * 60 * 1000;       // 15 min
  if (status === 'delayed') return 30 * 60 * 1000;        // 30 min
  if (status === 'landed') return 24 * 60 * 60 * 1000;    // 24h (truly terminal)
  if (status === 'cancelled') return 2 * 60 * 60 * 1000;  // 2h (allow re-check — might be wrong route)
  return 4 * 60 * 60 * 1000;                              // 4h default (scheduled)
}

function getCachedFlight(flightId) {
  const cached = flightCache.get(flightId);
  if (!cached) return null;
  const ttl = getFlightCacheTTL(cached.data?.status);
  if (Date.now() - cached.timestamp > ttl) {
    flightCache.delete(flightId);
    return null;
  }
  return cached.data;
}

function setCachedFlight(flightId, data) {
  flightCache.set(flightId, { data, timestamp: Date.now() });
}

// GET /api/flights/status — all flights within H-1 to H+1 window
app.get('/api/flights/status', authMiddleware, async (req, res) => {
  try {
    maybeResetQuotaCounter();

    // Use WIB dates for consistent window regardless of server timezone
    const nowMs = Date.now();
    const todayWIB = getWIBDateStr();
    const yesterdayWIB = getWIBDateStr(new Date(nowMs - 24*60*60*1000));
    const tomorrowWIB = getWIBDateStr(new Date(nowMs + 24*60*60*1000));

    const startDate = yesterdayWIB;
    const endDate = tomorrowWIB;

    // 1. Get calendar events with flight data in the ±1 day window
    const { data: events, error: evError } = await supabase
      .from('calendar_events')
      .select('*')
      .in('event_type', ['keberangkatan', 'kepulangan'])
      .gte('event_date', startDate)
      .lte('event_date', endDate)
      .not('pesawat', 'is', null);

    if (evError) throw evError;
    if (!events || events.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // 2a. Build departure date lookup for kepulangan events
    // For kepulangan: find the keberangkatan event with the same group_number to get departure date
    const kepulanganGroups = events
      .filter(e => e.event_type === 'kepulangan' && e.group_number)
      .map(e => e.group_number);

    let depDateByGroup = new Map(); // group_number → keberangkatan event_date
    if (kepulanganGroups.length > 0) {
      const { data: depEvents } = await supabase
        .from('calendar_events')
        .select('group_number, event_date')
        .eq('event_type', 'keberangkatan')
        .in('group_number', kepulanganGroups);
      for (const e of (depEvents || [])) {
        depDateByGroup.set(e.group_number, e.event_date);
      }
    }

    // Collect all departure dates we need jamaah for (keberangkatan dates from window + mapped from kepulangan)
    const depDatesNeeded = new Set();
    for (const event of events) {
      if (event.event_type === 'keberangkatan') {
        depDatesNeeded.add(event.event_date);
      } else if (event.event_type === 'kepulangan' && event.group_number) {
        const depDate = depDateByGroup.get(event.group_number);
        if (depDate) depDatesNeeded.add(depDate);
      }
    }

    // Fetch agent's jamaah for all relevant departure dates
    const jamaahByDate = new Map();
    if (depDatesNeeded.size > 0) {
      const { data: agentJamaah } = await supabase
        .from('jamaah')
        .select('nama, jk, wa, tgl_berangkat')
        .eq('agent_slug', req.user.slug)
        .in('tgl_berangkat', Array.from(depDatesNeeded));

      for (const j of (agentJamaah || [])) {
        const dk = j.tgl_berangkat?.slice(0, 10);
        if (!dk) continue;
        if (!jamaahByDate.has(dk)) jamaahByDate.set(dk, []);
        jamaahByDate.get(dk).push({ nama: j.nama, jk: j.jk || null, wa: j.wa || null });
      }
      // Sort each date's jamaah alphabetically by name
      for (const list of jamaahByDate.values()) {
        list.sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));
      }
    }

    // 2b. For each event: cache → Supabase → AirLabs
    const flights = [];
    // Track which flightIds we've already fetched from cache/DB to avoid repeated queries
    const flightDataCache = new Map();

    for (const event of events) {
      const parsed = parseFlightFromCalendar(event.pesawat);
      if (!parsed) continue;

      const flightId = `${event.event_date}_${parsed.flightIata}`;
      // Unique ID per group (so multiple groups on same flight get distinct entries)
      const entryId = event.group_number ? `${flightId}_g${event.group_number}` : flightId;

      // Try to get shared flight data (from cache or DB), but only query once per flightId
      let flightBase = flightDataCache.get(flightId);
      if (flightBase === undefined) {
        flightBase = null;

        // Check in-memory cache
        const cached = getCachedFlight(flightId);
        if (cached) {
          flightBase = cached;
        } else {
          // Check Supabase
          const { data: existing } = await supabase
            .from('flight_status')
            .select('*')
            .eq('id', flightId)
            .single();

          if (existing && existing.synced_at) {
            let dateValid = true;
            if (existing.dep_scheduled) {
              const dateMatch = String(existing.dep_scheduled).match(/^(\d{4}-\d{2}-\d{2})/);
              const depDate = dateMatch ? dateMatch[1] : null;
              if (depDate && depDate !== event.event_date) {
                dateValid = false;
                await supabase.from('flight_status').delete().eq('id', flightId);
              }
            }
            if (dateValid) {
              const formatted = formatFlightForFrontend(existing);
              setCachedFlight(flightId, formatted);
              flightBase = formatted;
            }
          } else if (existing) {
            flightBase = formatFlightForFrontend(existing);
          }
        }
        flightDataCache.set(flightId, flightBase);
      }

      // Build the per-group entry by overlaying this event's group/pax/TL
      if (flightBase) {
        const entry = {
          ...flightBase,
          id: entryId,
          group: event.group_number || '',
          pax: event.pax || 0,
          tourLeader: event.tour_leader || '',
          jamaah: jamaahByDate.get(
            event.event_type === 'keberangkatan'
              ? event.event_date
              : depDateByGroup.get(event.group_number) || ''
          ) || [],
        };

        // Override stale status if departure time has clearly passed
        // Covers 'scheduled' (never updated) and 'cancelled' (might be wrong route data)
        if (['scheduled', 'cancelled'].includes(entry.status) && event.event_date <= todayWIB && entry.depScheduled) {
          const route = lookupRoute(parsed.flightIata, event.event_type);
          const depAirport = entry.depCode || route?.dep || (event.event_type === 'kepulangan' ? 'JED' : 'CGK');
          const tzOffset = AIRPORT_TZ_OFFSETS[depAirport] || 7;
          const nowUTC = Date.now();
          const depHHmm = entry.depScheduled; // "HH:mm" string from formatFlightForFrontend
          const [hh, mm] = depHHmm.split(':').map(Number);
          if (!isNaN(hh) && !isNaN(mm)) {
            const depDateObj = new Date(`${event.event_date}T00:00:00Z`);
            const depUTC = depDateObj.getTime() + (hh * 60 + mm) * 60 * 1000 - tzOffset * 60 * 60 * 1000;
            const durationMin = route?.durationMin || 540;
            const arrUTC = depUTC + durationMin * 60 * 1000;
            if (nowUTC >= arrUTC) {
              entry.status = 'landed';
              entry.progress = 100;
            } else if (nowUTC >= depUTC) {
              entry.status = 'en-route';
              const totalDuration = arrUTC - depUTC;
              const elapsed = nowUTC - depUTC;
              entry.progress = Math.min(99, Math.max(1, Math.round((elapsed / totalDuration) * 100)));
            }
          }
        }

        // Attach calendar reference times if they differ significantly from AirLabs
        if (event.jam && entry.depScheduled) {
          const calArrLocal = (event.jam || '00:00').replace('.', ':');
          const calRoute = lookupRoute(parsed.flightIata, event.event_type);
          const calArrAirport = calRoute?.arr || (event.event_type === 'kepulangan' ? 'CGK' : 'JED');
          const calDepAirport = calRoute?.dep || (event.event_type === 'kepulangan' ? 'JED' : 'CGK');
          const calArrTZ = AIRPORT_TZ_OFFSETS[calArrAirport] || 7;
          const calDepTZ = AIRPORT_TZ_OFFSETS[calDepAirport] || 7;
          const calDurationMin = calRoute?.durationMin || 540;

          const [calArrH, calArrM] = calArrLocal.split(':').map(Number);
          if (!isNaN(calArrH) && !isNaN(calArrM)) {
            const calArrDateObj = new Date(`${event.event_date}T00:00:00Z`);
            const calArrUTC = calArrDateObj.getTime() + (calArrH * 60 + calArrM) * 60 * 1000 - calArrTZ * 60 * 60 * 1000;
            const calDepUTC = calArrUTC - calDurationMin * 60 * 1000;
            const calDepLocalMs = calDepUTC + calDepTZ * 60 * 60 * 1000;
            const calDepD = new Date(calDepLocalMs);
            const calDepLocal = `${String(calDepD.getUTCHours()).padStart(2, '0')}:${String(calDepD.getUTCMinutes()).padStart(2, '0')}`;

            const depDiff = Math.abs(parseHHmmToMinutes(entry.depScheduled) - parseHHmmToMinutes(calDepLocal));
            const arrDiff = Math.abs(parseHHmmToMinutes(entry.arrScheduled) - parseHHmmToMinutes(calArrLocal));

            if (depDiff >= 15 || arrDiff >= 15) {
              entry.calendarDepTime = calDepLocal;
              entry.calendarArrTime = calArrLocal;
            }
          }
        }

        flights.push(entry);
      } else {
        // Fallback: enrich from calendar + route lookup
        const route = lookupRoute(parsed.flightIata, event.event_type);
        // event.jam is the ARRIVAL time at **arr airport** local timezone
        const arrLocal = (event.jam || '00:00').replace('.', ':');
        const arrAirport = route?.arr || (event.event_type === 'kepulangan' ? 'CGK' : 'JED');
        const depAirport = route?.dep || (event.event_type === 'kepulangan' ? 'JED' : 'CGK');
        const arrTZ = AIRPORT_TZ_OFFSETS[arrAirport] || 7;
        const depTZ = AIRPORT_TZ_OFFSETS[depAirport] || 7;
        const durationMin = route?.durationMin || 540;

        // Calculate departure time from arrival time:
        // arrLocal is HH:mm in arrival airport's timezone
        const [arrH, arrM] = arrLocal.split(':').map(Number);
        // Arrival in UTC
        const arrDateObj = new Date(`${event.event_date}T00:00:00Z`);
        const arrUTC = arrDateObj.getTime() + (arrH * 60 + arrM) * 60 * 1000 - arrTZ * 60 * 60 * 1000;
        // Departure in UTC = arrival UTC - duration
        const depUTC = arrUTC - durationMin * 60 * 1000;
        // Convert departure UTC to departure airport local HH:mm
        const depLocalMs = depUTC + depTZ * 60 * 60 * 1000;
        const depD = new Date(depLocalMs);
        const depHH = String(depD.getUTCHours()).padStart(2, '0');
        const depMM = String(depD.getUTCMinutes()).padStart(2, '0');
        const depLocal = `${depHH}:${depMM}`;

        const todayWIBStr = getWIBDateStr();
        const nowUTCFb = Date.now();
        let fallbackStatus = 'scheduled';
        let fallbackProgress = 0;
        if (event.event_date < todayWIBStr) {
          fallbackStatus = 'landed';
          fallbackProgress = 100;
        } else if (event.event_date <= todayWIBStr) {
          // Today's flight: check if departure time has passed
          if (nowUTCFb >= arrUTC) {
            fallbackStatus = 'landed';
            fallbackProgress = 100;
          } else if (nowUTCFb >= depUTC) {
            fallbackStatus = 'en-route';
            const totalDuration = arrUTC - depUTC;
            const elapsed = nowUTCFb - depUTC;
            fallbackProgress = Math.min(99, Math.max(1, Math.round((elapsed / totalDuration) * 100)));
          }
        }

        flights.push({
          id: entryId,
          flightNumber: `${parsed.airlineCode} ${parsed.flightNumber}`,
          airline: parsed.airline,
          airlineLogo: null,
          group: event.group_number || '',
          status: fallbackStatus,
          depCity: route?.depCity || '',
          depCode: route?.dep || '',
          depTerminal: route?.depTerminal || null, depGate: null,
          depScheduled: depLocal,
          depActual: null,
          depDate: new Date(depUTC).toISOString(),
          arrCity: route?.arrCity || '',
          arrCode: route?.arr || '',
          arrTerminal: null, arrGate: null,
          arrScheduled: arrLocal,
          arrEstimated: arrLocal,
          pax: event.pax || 0,
          tourLeader: event.tour_leader || '',
          jamaah: jamaahByDate.get(
            event.event_type === 'keberangkatan'
              ? event.event_date
              : depDateByGroup.get(event.group_number) || ''
          ) || [],
          lat: null, lng: null, alt: null, speed: null,
          progress: fallbackProgress,
          delayed: 0,
          aircraftType: null, aircraftReg: null,
          duration: durationMin,
          depDelayed: 0, arrDelayed: 0, arrBaggage: null,
        });
      }
    }

    // Sort: en-route first, then delayed, scheduled, landed, cancelled
    // Sort: newest date first, then by status priority within same date
    const statusOrder = { 'en-route': 0, 'delayed': 1, 'scheduled': 2, 'landed': 3, 'cancelled': 4 };
    flights.sort((a, b) => {
      const dateA = a.depScheduled || a.id;
      const dateB = b.depScheduled || b.id;
      // Compare dates descending (newest first)
      if (dateA > dateB) return -1;
      if (dateA < dateB) return 1;
      // Same date: sort by status
      return (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
    });

    // Filter out landed/cancelled flights older than 6 hours
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    const filtered = flights.filter(f => {
      if (f.status !== 'landed' && f.status !== 'cancelled') return true;
      // Calculate arrival time in UTC to determine how long ago the flight ended
      const flightDate = f.id?.substring(0, 10);
      if (!flightDate) return false;
      const arrHHmm = f.arrEstimated || f.arrScheduled;
      if (arrHHmm && /^\d{2}:\d{2}$/.test(arrHHmm)) {
        const [h, m] = arrHHmm.split(':').map(Number);
        const arrAirport = f.arrCode || 'CGK';
        const arrTZ = AIRPORT_TZ_OFFSETS[arrAirport] || 7;
        const arrDateObj = new Date(`${flightDate}T00:00:00Z`);
        const arrUTC = arrDateObj.getTime() + (h * 60 + m) * 60 * 1000 - arrTZ * 60 * 60 * 1000;
        return (nowMs - arrUTC) < SIX_HOURS_MS;
      }
      // No arrival time — fall back to date check
      return flightDate >= todayWIB;
    });

    res.json({ success: true, data: filtered });
  } catch (err) {
    console.error('[Flights] Error:', err);
    res.status(500).json({ error: 'Gagal memuat data penerbangan' });
  }
});

// GET /api/flights/:flightId — single flight detail (cache-first, no forced API call)
app.get('/api/flights/:flightId', authMiddleware, async (req, res) => {
  try {
    const { flightId } = req.params;

    // Parse flightId: "2026-03-28_SV827"
    const underscoreIdx = flightId.indexOf('_');
    if (underscoreIdx === -1) {
      return res.status(400).json({ error: 'Invalid flight ID' });
    }
    const eventDate = flightId.substring(0, underscoreIdx);
    const flightIata = flightId.substring(underscoreIdx + 1);
    if (!eventDate || !flightIata) {
      return res.status(400).json({ error: 'Invalid flight ID' });
    }

    // 1. Check in-memory cache first
    const cached = getCachedFlight(flightId);
    if (cached) {
      return res.json({ success: true, data: cached });
    }

    // 2. Check Supabase
    const { data: existing } = await supabase
      .from('flight_status')
      .select('*')
      .eq('id', flightId)
      .single();

    if (existing) {
      const formatted = formatFlightForFrontend(existing);
      setCachedFlight(flightId, formatted);
      return res.json({ success: true, data: formatted });
    }

    res.status(404).json({ error: 'Flight not found' });
  } catch (err) {
    console.error('[Flights] Detail error:', err);
    res.status(500).json({ error: 'Gagal memuat detail penerbangan' });
  }
});

// ──────────────────────────────────────────────
// Flight Status: Polling Helpers & Notifications
// ──────────────────────────────────────────────

function getPollingIntervalMs(status, hoursUntilDeparture) {
  if (status === 'landed' || status === 'cancelled') return null;
  if (status === 'en-route') return 5 * 60 * 1000;
  if (status === 'delayed') return 15 * 60 * 1000;
  if (hoursUntilDeparture <= 3) return 15 * 60 * 1000;
  return 30 * 60 * 1000;
}

function getHoursUntilDeparture(event) {
  const depTime = new Date(`${event.event_date}T${(event.jam || '00:00').replace('.', ':')}:00`);
  return (depTime - new Date()) / (1000 * 60 * 60);
}

function formatTimeWIB(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta',
  }) + ' WIB';
}

// Anti-duplicate notification state
const flightNotifSent = new Map();

function shouldSendFlightNotif(flightId, changeType) {
  const key = `${flightId}_${changeType}`;
  const lastSent = flightNotifSent.get(key);
  if (lastSent && Date.now() - lastSent < 30 * 60 * 1000) return false;
  return true;
}

function markFlightNotifSent(flightId, changeType) {
  flightNotifSent.set(`${flightId}_${changeType}`, Date.now());
  // Cleanup entries > 24h
  for (const [key, ts] of flightNotifSent) {
    if (Date.now() - ts > 24 * 60 * 60 * 1000) flightNotifSent.delete(key);
  }
}

async function sendTelegramMessageDirect(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId, text,
        parse_mode: 'HTML', disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    console.error(`[FlightNotif] Telegram send error:`, err.message);
  }
}

async function detectAndNotifyChanges(oldData, newData, calendarEvent) {
  const changes = [];

  if (oldData.status !== newData.status) {
    changes.push({ type: 'status_change', from: oldData.status, to: newData.status });
  }
  if (newData.delayed > 0 && newData.delayed !== oldData.delayed
      && newData.status !== 'landed' && newData.status !== 'en-route') {
    changes.push({ type: 'delay', minutes: newData.delayed, previous: oldData.delayed || 0 });
  }
  if (newData.dep_gate && newData.dep_gate !== oldData.dep_gate) {
    changes.push({ type: 'gate_change', field: 'departure', from: oldData.dep_gate, to: newData.dep_gate });
  }
  if (newData.arr_gate && newData.arr_gate !== oldData.arr_gate) {
    changes.push({ type: 'gate_change', field: 'arrival', from: oldData.arr_gate, to: newData.arr_gate });
  }
  if (newData.dep_terminal && newData.dep_terminal !== oldData.dep_terminal) {
    changes.push({ type: 'terminal_change', field: 'departure', from: oldData.dep_terminal, to: newData.dep_terminal });
  }
  if (newData.status === 'cancelled' && oldData.status !== 'cancelled') {
    changes.push({ type: 'cancelled' });
  }

  if (changes.length === 0) return;

  // Build notification for each change (with anti-duplicate check)
  for (const change of changes) {
    const changeKey = change.type === 'delay'
      ? `delay_${Math.floor(change.minutes / 30) * 30}`
      : change.type === 'status_change' ? `status_${change.to}` : change.type;

    if (!shouldSendFlightNotif(newData.id, changeKey)) continue;

    const message = buildFlightNotifMessage(newData, calendarEvent, change);
    if (!message) continue;

    // Send to all agents with Telegram connected
    const { data: agents } = await supabase
      .from('agents')
      .select('slug, telegram_chat_id, notification_prefs')
      .not('telegram_chat_id', 'is', null);

    if (agents) {
      for (const agent of agents) {
        const prefs = agent.notification_prefs || {};
        if (prefs.flight_status === false) continue;
        await sendTelegramMessageDirect(agent.telegram_chat_id, message);
      }
    }

    markFlightNotifSent(newData.id, changeKey);
    console.log(`[FlightNotif] Sent ${changeKey} for ${newData.id}`);
  }
}

function buildFlightNotifMessage(flight, calendarEvent, change) {
  const flightLabel = `${flight.airline_name || ''} ${flight.flight_iata || ''}`.trim();
  const route = `${flight.dep_iata || '?'} → ${flight.arr_iata || '?'}`;
  const groupLabel = calendarEvent.group_number ? `Grup ${calendarEvent.group_number}` : '';
  const paxLine = `Jamaah: <b>${calendarEvent.pax || '?'} orang</b>`;
  const tlLine = calendarEvent.tour_leader ? `\nTL: ${calendarEvent.tour_leader}` : '';
  const header = `<b>${flightLabel}</b>\n${route}${groupLabel ? ` • ${groupLabel}` : ''}\n─────────────────\n`;

  if (change.type === 'cancelled') {
    return `🚫 <b>PENERBANGAN DIBATALKAN</b>\n\n${header}Penerbangan ini telah <b>dibatalkan</b>. Segera hubungi jamaah dan koordinasi perubahan jadwal.\n${paxLine}${tlLine}`;
  }

  if (change.type === 'delay') {
    const mins = change.minutes;
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    const delayStr = hours > 0 ? `${hours} jam${rem > 0 ? ` ${rem} menit` : ''}` : `${mins} menit`;
    const emoji = mins >= 60 ? '🔴' : '🟡';
    const label = mins >= 60 ? 'DELAY SIGNIFIKAN' : 'DELAY PENERBANGAN';

    let timeInfo = '';
    if (flight.dep_scheduled) {
      const depScheduledDate = new Date(flight.dep_scheduled);
      const estimatedDepDate = new Date(depScheduledDate.getTime() + mins * 60 * 1000);
      timeInfo = `Jadwal: ${formatTimeWIB(flight.dep_scheduled)}\nEstimasi: <b>${formatTimeWIB(estimatedDepDate.toISOString())}</b>\n`;
    } else if (flight.arr_scheduled && flight.arr_estimated) {
      timeInfo = `Jadwal tiba: ${formatTimeWIB(flight.arr_scheduled)}\nEstimasi tiba: <b>${formatTimeWIB(flight.arr_estimated)}</b>\n`;
    }

    return `${emoji} <b>${label}</b>\n\n${header}Delay: <b>${delayStr}</b>\n${timeInfo}\n${paxLine}${tlLine}`;
  }

  if (change.type === 'gate_change' || change.type === 'terminal_change') {
    const label = change.type === 'gate_change' ? 'Gate' : 'Terminal';
    const fieldLabel = change.field === 'departure' ? 'Keberangkatan' : 'Kedatangan';
    return `🔄 <b>PERUBAHAN GATE/TERMINAL</b>\n\n${header}${fieldLabel} ${label}: ${change.from || '—'} → <b>${change.to}</b>\n\n${paxLine}`;
  }

  if (change.type === 'status_change') {
    if (change.to === 'landed') {
      return `✅ <b>PESAWAT MENDARAT</b>\n\n${header}Pesawat telah mendarat dengan selamat.\n${paxLine}${tlLine}`;
    }
    if (change.to === 'en-route') {
      const eta = flight.arr_estimated ? `Estimasi tiba: <b>${formatTimeWIB(flight.arr_estimated)}</b>\n` : '';
      return `✈️ <b>PESAWAT TAKE OFF</b>\n\n${header}Pesawat telah lepas landas.\n${eta}${paxLine}${tlLine}`;
    }
    const statusLabels = { 'en-route': 'Dalam Penerbangan ✈️', 'landed': 'Mendarat ✅', 'scheduled': 'Terjadwal', 'delayed': 'Delay ⚠️' };
    return `ℹ️ <b>UPDATE PENERBANGAN</b>\n\n${header}Status: ${statusLabels[change.from] || change.from} → <b>${statusLabels[change.to] || change.to}</b>`;
  }

  return null;
}

// Background flight poller — only polls en-route or departing-within-3h flights
async function pollActiveFlights() {
  maybeResetQuotaCounter();

  const nowMs = Date.now();
  const startDate = getWIBDateStr(new Date(nowMs - 24*60*60*1000));
  const endDate = getWIBDateStr(new Date(nowMs + 24*60*60*1000));

  const { data: events } = await supabase
    .from('calendar_events')
    .select('*')
    .in('event_type', ['keberangkatan', 'kepulangan'])
    .gte('event_date', startDate)
    .lte('event_date', endDate)
    .not('pesawat', 'is', null);

  if (!events || events.length === 0) {
    console.log('[FlightCron] No flights in window, skipping');
    return;
  }
  if (!canMakeAirLabsRequest()) {
    console.warn('[FlightCron] Monthly quota reached, skipping poll');
    return;
  }

  let pollCount = 0;
  const MAX_POLLS_PER_RUN = 5;

  for (const event of events) {
    if (pollCount >= MAX_POLLS_PER_RUN) break;

    const parsed = parseFlightFromCalendar(event.pesawat);
    if (!parsed) continue;

    const flightId = `${event.event_date}_${parsed.flightIata}`;
    if (!shouldPollFlight(event.event_date, event.event_type)) continue;

    const { data: existing } = await supabase
      .from('flight_status').select('*').eq('id', flightId).single();

    // Skip landed flights (truly terminal)
    if (existing && existing.status === 'landed') continue;
    // Re-poll cancelled flights if event is today — cancellation might be from wrong route
    if (existing && existing.status === 'cancelled') {
      if (event.event_date !== getWIBDateStr()) continue;
      if (existing.synced_at) {
        const hoursSinceSync = (Date.now() - new Date(existing.synced_at).getTime()) / (1000 * 60 * 60);
        if (hoursSinceSync < 2) continue;
      }
      console.log(`[FlightCron] Re-polling cancelled flight ${flightId} (event is today)`);
    }

    // Only poll if: (a) en-route, (b) departing within 3 hours, or (c) never synced
    const hoursUntilDep = getHoursUntilDeparture(event);
    const isEnRoute = existing?.status === 'en-route';
    const isDepartingSoon = hoursUntilDep <= 3 && hoursUntilDep >= -12; // within 3h before to 12h after
    const neverSynced = !existing;

    if (!isEnRoute && !isDepartingSoon && !neverSynced) {
      continue; // Skip flights that aren't urgent
    }

    // Respect polling interval based on status
    if (existing && existing.synced_at) {
      const interval = getPollingIntervalMs(existing.status, hoursUntilDep);
      if (interval) {
        const timeSinceSync = Date.now() - new Date(existing.synced_at).getTime();
        if (timeSinceSync < interval) continue;
      }
    }

    const apiData = await fetchFlightFromAirLabs(parsed.flightIata);
    pollCount++;

    if (!apiData) continue;

    const mapped = mapAirLabsToFlightStatus(apiData, event);
    if (!mapped) continue;

    if (existing) {
      try {
        await detectAndNotifyChanges(existing, mapped, event);
      } catch (notifErr) {
        console.error('[FlightNotif] Error:', notifErr.message);
      }
    }

    await supabase.from('flight_status').upsert(mapped, { onConflict: 'id' });
    setCachedFlight(flightId, formatFlightForFrontend(mapped));
    console.log(`[FlightCron] Updated ${flightId}: ${mapped.status}${mapped.delayed > 0 ? ` (delay ${mapped.delayed}m)` : ''}`);
  }

  if (pollCount > 0) {
    console.log(`[FlightCron] Polled ${pollCount} flights. Monthly usage: ${airLabsRequestCount}/${AIRLABS_MONTHLY_LIMIT}`);
  } else {
    console.log(`[FlightCron] No urgent flights to poll. Monthly usage: ${airLabsRequestCount}/${AIRLABS_MONTHLY_LIMIT}`);
  }
}

// Jamaah list: read from Supabase with filters, search, pagination, sorting
app.get('/api/laporan/jamaah', authMiddleware, async (req, res) => {
  const {
    hijriahYear,
    status,   // 'belum' | 'berangkat'
    search,
    sort,     // 'nama' | 'sisa_desc' | 'berangkat' | 'terbaru'
    page = '1',
    limit = '20',
  } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  // Default sort depends on filter
  const effectiveSort = sort || (status === 'belum' || status === 'berangkat' ? 'berangkat' : 'terbaru');

  // Build query
  let query = supabase
    .from('jamaah')
    .select('*', { count: 'exact' })
    .eq('agent_slug', req.user.slug)
    .range(offset, offset + limitNum - 1);

  // Sorting
  if (effectiveSort === 'sisa_desc') {
    query = query.order('sisa', { ascending: false });
  } else if (effectiveSort === 'berangkat') {
    query = query.order('tgl_berangkat', { ascending: true, nullsFirst: false });
  } else if (effectiveSort === 'terbaru') {
    query = query.order('tgl_daftar', { ascending: false, nullsFirst: false })
                 .order('synced_at', { ascending: false });
  } else {
    query = query.order('nama', { ascending: true });
  }

  // Year filter: specific year or floor at 1447 (UI dropdown only shows ≥ 1447)
  const MIN_HIJRIAH_YEAR = '1447';
  if (hijriahYear) {
    query = query.eq('hijriah_year', hijriahYear);
  } else {
    query = query.gte('hijriah_year', MIN_HIJRIAH_YEAR);
  }

  // Berangkat ≤ 10 days from today
  const berangkatCutoff = new Date();
  berangkatCutoff.setDate(berangkatCutoff.getDate() + 10);
  const cutoffStr = berangkatCutoff.toISOString().split('T')[0];
  const todayStr = new Date().toISOString().split('T')[0];

  if (status === 'belum') {
    query = query.gt('sisa', 0);
  } else if (status === 'berangkat') {
    query = query.gte('tgl_berangkat', todayStr).lte('tgl_berangkat', cutoffStr);
  }

  if (search) {
    query = query.or(`nama.ilike.%${search}%,id_umroh.ilike.%${search}%,wa.ilike.%${search}%`);
  }

  const { data, count, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Get last sync time
  const { data: syncData } = await supabase
    .from('jamaah')
    .select('synced_at')
    .eq('agent_slug', req.user.slug)
    .order('synced_at', { ascending: false })
    .limit(1);

  // Helper: apply year filter to count queries
  const applyYearFilter = (q) => hijriahYear ? q.eq('hijriah_year', hijriahYear) : q.gte('hijriah_year', MIN_HIJRIAH_YEAR);

  let totalQ = supabase
    .from('jamaah')
    .select('*', { count: 'exact', head: true })
    .eq('agent_slug', req.user.slug);
  const { count: totalCount } = await applyYearFilter(totalQ);

  let belumQ = supabase
    .from('jamaah')
    .select('*', { count: 'exact', head: true })
    .eq('agent_slug', req.user.slug)
    .gt('sisa', 0);
  const { count: belumCount } = await applyYearFilter(belumQ);

  let berangkatQ = supabase
    .from('jamaah')
    .select('*', { count: 'exact', head: true })
    .eq('agent_slug', req.user.slug)
    .gte('tgl_berangkat', todayStr)
    .lte('tgl_berangkat', cutoffStr);
  const { count: berangkatCount } = await applyYearFilter(berangkatQ);

  let piutang = 0;
  let pQ = supabase.from('jamaah').select('sisa').eq('agent_slug', req.user.slug).gt('sisa', 0);
  pQ = applyYearFilter(pQ);
  const { data: pData } = await pQ;
  if (pData) piutang = pData.reduce((s, r) => s + (r.sisa || 0), 0);

  res.json({
    success: true,
    data: {
      items: data || [],
      total: count || 0,
      page: pageNum,
      totalPages: Math.ceil((count || 0) / limitNum),
      lastSync: syncData?.[0]?.synced_at || null,
      counts: {
        semua: totalCount || 0,
        belumLunas: belumCount || 0,
        berangkat: berangkatCount || 0,
      },
      piutang,
    },
  });
});

// Jamaah note: create/update/clear note for a specific jamaah
app.post('/api/laporan/jamaah/note', authMiddleware, async (req, res) => {
  try {
    const slug = req.user.slug;
    const { id_umroh, nama, notes } = req.body;

    if (!id_umroh || !nama) {
      return res.status(400).json({ error: 'id_umroh and nama are required' });
    }

    const updateData = (!notes || notes.trim() === '')
      ? { notes: null, notes_updated_at: null }
      : { notes: notes.trim(), notes_updated_at: new Date().toISOString() };

    const { error } = await supabase
      .from('jamaah')
      .update(updateData)
      .eq('agent_slug', slug)
      .eq('id_umroh', id_umroh)
      .eq('nama', nama);

    if (error) {
      console.error('[jamaah-note] Update error:', error.message);
      return res.status(500).json({ error: 'Failed to save note' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[jamaah-note] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Disconnect: clear in-memory session only
app.post('/api/laporan/disconnect', authMiddleware, async (req, res) => {
  const slug = req.user.slug;
  const agent = await getAgent(slug);
  if (agent?.jamaah_username) {
    await laporanDisconnect(agent.jamaah_username);
  }
  // Cancel any running sync
  const state = syncingAgents.get(slug);
  if (state?.isSyncing) {
    syncingAgents.set(slug, { ...state, isSyncing: false, cancelled: true });
    console.log(`[Sync] ${slug}: cancelled by disconnect`);
  }
  res.json({ success: true });
});

// Delete saved credentials
app.delete('/api/laporan/credentials', authMiddleware, async (req, res) => {
  const slug = req.user.slug;
  // Also disconnect if active
  const agent = await getAgent(slug);
  if (agent?.jamaah_username) {
    await laporanDisconnect(agent.jamaah_username);
  }
  // Cancel any running sync
  const state = syncingAgents.get(slug);
  if (state?.isSyncing) {
    syncingAgents.set(slug, { ...state, isSyncing: false, cancelled: true });
    console.log(`[Sync] ${slug}: cancelled by credential deletion`);
  }

  const { error } = await supabase
    .from('agents')
    .update({
      jamaah_username: null,
      jamaah_password: null,
      jamaah_kantor: null,
    })
    .eq('slug', slug);
  if (error) return res.status(500).json({ error: error.message });
  agentCache = null;
  res.json({ success: true });
});

// ── Tren Daftar: Available Hijriah Years (Admin only) ──
app.get('/api/laporan/tren-daftar/years', authMiddleware, adminOnly, async (req, res) => {
  try {
    const data = await fetchAllRows(
      supabase.from('jamaah').select('hijriah_year').not('hijriah_year', 'is', null)
    );
    const years = [...new Set(data.map(d => d.hijriah_year))].sort((a, b) => b.localeCompare(a));
    res.json({ success: true, data: years });
  } catch (err) {
    console.error('[TrenDaftar] Years error:', err.message);
    res.status(500).json({ error: 'Gagal mengambil data tahun' });
  }
});

// ── Tren Daftar: Main Data (Admin only) ──
const TREN_MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const TREN_MONTH_FULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const VALID_PAKET_PREFIX = ['HEMAT','REGULER','PLUS','VIP','UHUD','PREMIUM','SUPER','EKSKLUSIF','EKONOMI','PROMO','GOLD','SILVER','PLATINUM','DIAMOND'];
const BLACKLIST_PAKET = ['WAITINGLIST','WAITING','RAHMAH','CANCEL','BATAL','REFUND','PENDING','LIST','DRAFT'];

app.get('/api/laporan/tren-daftar', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { hijriahYear } = req.query;
    if (!hijriahYear) return res.status(400).json({ error: 'hijriahYear wajib diisi' });

    const year = String(hijriahYear);
    const prevYear = String(Number(year) - 1);

    // Fetch all jamaah for this year + prev year
    const [rowsCur, rowsPrev] = await Promise.all([
      fetchAllRows(supabase.from('jamaah').select('tgl_daftar, tgl_berangkat, tgl_lahir, jk, bayar, sisa, paket, agent_slug').eq('hijriah_year', year)),
      fetchAllRows(supabase.from('jamaah').select('tgl_daftar').eq('hijriah_year', prevYear)),
    ]);

    const cur = rowsCur;
    const prev = rowsPrev;

    // Summary
    const totalDaftar = cur.length;
    const totalDaftarPrev = prev.length;
    const monthlyCur = new Array(12).fill(0);
    cur.forEach(j => { if (j.tgl_daftar) { monthlyCur[new Date(j.tgl_daftar).getMonth()]++; } });

    const monthlyPrev = new Array(12).fill(0);
    prev.forEach(j => { if (j.tgl_daftar) { monthlyPrev[new Date(j.tgl_daftar).getMonth()]++; } });

    const monthsWithData = monthlyCur.filter(c => c > 0).length || 1;
    const avgPerMonth = Math.round(totalDaftar / monthsWithData);

    let peakIdx = 0, slowIdx = -1, slowVal = Infinity;
    monthlyCur.forEach((c, i) => {
      if (c > monthlyCur[peakIdx]) peakIdx = i;
      if (c > 0 && c < slowVal) { slowVal = c; slowIdx = i; }
    });
    if (slowIdx === -1) slowIdx = 0;

    // Apple-to-apple growth: only compare months that have data in current year
    const monthIdxWithData = [];
    monthlyCur.forEach((c, i) => { if (c > 0) monthIdxWithData.push(i); });
    const totalCurSame = monthIdxWithData.reduce((s, i) => s + monthlyCur[i], 0);
    const totalPrevSame = monthIdxWithData.reduce((s, i) => s + monthlyPrev[i], 0);
    const growthPct = totalPrevSame > 0 ? Math.round(((totalCurSame - totalPrevSame) / totalPrevSame) * 1000) / 10 : 0;
    const growthMonths = monthIdxWithData.length;
    let growthLabel = '';
    if (growthMonths > 0 && growthMonths < 12) {
      const first = TREN_MONTH_LABELS[monthIdxWithData[0]];
      const last = TREN_MONTH_LABELS[monthIdxWithData[monthIdxWithData.length - 1]];
      growthLabel = first === last ? first : `${first}–${last}`;
    }

    const summary = {
      totalDaftar, totalDaftarPrev, growthPct, avgPerMonth, growthMonths, growthLabel,
      peakMonth: TREN_MONTH_FULL[peakIdx], peakMonthCount: monthlyCur[peakIdx],
      slowestMonth: TREN_MONTH_FULL[slowIdx], slowestMonthCount: monthlyCur[slowIdx],
    };

    const monthly = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1, label: TREN_MONTH_LABELS[i], count: monthlyCur[i], countPrev: monthlyPrev[i],
    }));

    // Heatmap (3 years)
    const heatYearsRaw = await fetchAllRows(supabase.from('jamaah').select('hijriah_year').not('hijriah_year', 'is', null));
    const allYears = [...new Set(heatYearsRaw.map(d => d.hijriah_year))].sort((a, b) => b.localeCompare(a)).slice(0, 3);

    const heatmap = {};
    heatmap[year] = [...monthlyCur];
    if (allYears.includes(prevYear)) heatmap[prevYear] = [...monthlyPrev];

    for (const hy of allYears) {
      if (heatmap[hy]) continue;
      const hyRows = await fetchAllRows(supabase.from('jamaah').select('tgl_daftar').eq('hijriah_year', hy));
      const arr = new Array(12).fill(0);
      hyRows.forEach(j => { if (j.tgl_daftar) { arr[new Date(j.tgl_daftar).getMonth()]++; } });
      heatmap[hy] = arr;
    }
    for (const hy of allYears) { if (!heatmap[hy]) heatmap[hy] = new Array(12).fill(0); }

    // Revenue
    const revenueMonthly = new Array(12).fill(0);
    let totalMasuk = 0;
    cur.forEach(j => {
      const b = Number(j.bayar) || 0;
      totalMasuk += b;
      if (j.tgl_daftar) { revenueMonthly[new Date(j.tgl_daftar).getMonth()] += b; }
    });
    const revMonthsWithData = revenueMonthly.filter(v => v > 0).length || 1;
    const revenue = {
      totalMasuk,
      avgPerMonth: Math.round(totalMasuk / revMonthsWithData),
      monthly: revenueMonthly.map((total, i) => ({ month: i + 1, label: TREN_MONTH_LABELS[i], total })),
    };

    // Insights
    const withDates = cur.filter(j => j.tgl_daftar && j.tgl_berangkat);
    const leadDays = withDates.map(j => (new Date(j.tgl_berangkat) - new Date(j.tgl_daftar)) / 86400000).filter(d => d > 0);
    const leadTimeAvg = leadDays.length > 0 ? Math.round((leadDays.reduce((s, d) => s + d, 0) / leadDays.length / 30) * 10) / 10 : 0;

    const lunasCount = cur.filter(j => j.sisa === 0 || j.sisa === null).length;
    const conversionRate = totalDaftar > 0 ? Math.round((lunasCount / totalDaftar) * 100) : 0;

    // Conversion context: only count jamaah who already departed
    const today = new Date().toISOString().split('T')[0];
    const sudahBerangkat = cur.filter(j => j.tgl_berangkat && j.tgl_berangkat <= today).length;
    const lunasSudahBerangkat = cur.filter(j => (j.sisa === 0 || j.sisa === null) && j.tgl_berangkat && j.tgl_berangkat <= today).length;
    const conversionRateBerangkat = sudahBerangkat > 0 ? Math.round((lunasSudahBerangkat / sudahBerangkat) * 100) : 0;

    const paketMapRaw = {};
    cur.forEach(j => { if (j.paket) { const key = j.paket.split(' ')[0].toUpperCase(); paketMapRaw[key] = (paketMapRaw[key] || 0) + 1; } });
    // Filter: include if in whitelist OR not in blacklist (so new unknown pakets still show)
    const paketMap = {};
    for (const [key, count] of Object.entries(paketMapRaw)) {
      if (BLACKLIST_PAKET.includes(key)) continue;
      if (VALID_PAKET_PREFIX.includes(key) || !BLACKLIST_PAKET.includes(key)) paketMap[key] = count;
    }
    const topPaket = Object.entries(paketMap).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';

    const insights = { leadTimeAvg, conversionRate, conversionRateBerangkat, sudahBerangkat, totalJamaah: totalDaftar, lunasCount, topPaket };

    // Gender
    let perempuan = 0, lakiLaki = 0;
    cur.forEach(j => { if (j.jk === 'P') perempuan++; else if (j.jk === 'L') lakiLaki++; });
    const gender = { perempuan, lakiLaki };

    // Age Distribution
    const now = new Date();
    const ages = cur.filter(j => j.tgl_lahir).map(j => {
      const birth = new Date(j.tgl_lahir);
      return Math.floor((now - birth) / (365.25 * 86400000));
    }).filter(a => a >= 0 && a < 150);

    const ageBuckets = [
      { range: '18-30', min: 18, max: 30, count: 0 },
      { range: '31-40', min: 31, max: 40, count: 0 },
      { range: '41-50', min: 41, max: 50, count: 0 },
      { range: '51-60', min: 51, max: 60, count: 0 },
      { range: '60+', min: 61, max: 999, count: 0 },
    ];
    ages.forEach(a => { for (const b of ageBuckets) { if (a >= b.min && a <= b.max) { b.count++; break; } } });
    const ageTotal = ages.length || 1;
    const ageDistribution = ageBuckets.map(b => ({ range: b.range, count: b.count, pct: Math.round((b.count / ageTotal) * 100) }));
    const ageAvg = ages.length > 0 ? Math.round((ages.reduce((s, a) => s + a, 0) / ages.length) * 10) / 10 : 0;

    // Lead Time Distribution
    const ltBuckets = [
      { range: '< 1 bulan', min: 0, max: 29, count: 0 },
      { range: '1-2 bulan', min: 30, max: 59, count: 0 },
      { range: '2-4 bulan', min: 60, max: 119, count: 0 },
      { range: '4-6 bulan', min: 120, max: 179, count: 0 },
      { range: '> 6 bulan', min: 180, max: 99999, count: 0 },
    ];
    leadDays.forEach(d => { for (const b of ltBuckets) { if (d >= b.min && d <= b.max) { b.count++; break; } } });
    const ltTotal = leadDays.length || 1;
    const leadTimeDistribution = ltBuckets.map(b => ({ range: b.range, pct: Math.round((b.count / ltTotal) * 100) }));

    // Daftar vs Berangkat Matrix
    const dvb = Array.from({ length: 12 }, () => new Array(12).fill(0));
    withDates.forEach(j => {
      const dm = new Date(j.tgl_daftar).getMonth();
      const bm = new Date(j.tgl_berangkat).getMonth();
      dvb[dm][bm]++;
    });

    // Agent Ranking
    const agentMap = {};
    cur.forEach(j => { if (j.agent_slug) agentMap[j.agent_slug] = (agentMap[j.agent_slug] || 0) + 1; });
    const agentSlugs = Object.keys(agentMap);
    const { data: agentRows } = agentSlugs.length > 0
      ? await supabase.from('agents').select('slug, name, photo').in('slug', agentSlugs)
      : { data: [] };
    const agentInfo = Object.fromEntries((agentRows || []).map(a => [a.slug, a]));
    const agentRanking = Object.entries(agentMap)
      .map(([slug, count]) => ({ slug, name: agentInfo[slug]?.name || slug, photo: agentInfo[slug]?.photo || '', count }))
      .sort((a, b) => b.count - a.count);

    // Paket Ranking (grouped by first word)
    const paketTotal = Object.values(paketMap).reduce((s, c) => s + c, 0) || 1;
    const paketRanking = Object.entries(paketMap)
      .map(([paket, count]) => ({ paket, count, pct: Math.round((count / paketTotal) * 100) }))
      .sort((a, b) => b.count - a.count);

    res.json({
      success: true,
      data: {
        period: year, periodPrev: prevYear,
        summary, monthly, heatmap, revenue, insights,
        gender, ageDistribution, ageAvg,
        leadTimeDistribution,
        daftarVsBerangkat: dvb, agentRanking, paketRanking,
      },
    });
  } catch (err) {
    console.error('[TrenDaftar] Error:', err.message);
    res.status(500).json({ error: 'Gagal mengambil data tren' });
  }
});

// ──────────────────────────────────────────────
// API: Stats — aggregated jamaah statistics
// ──────────────────────────────────────────────
app.get('/api/laporan/stats', authMiddleware, async (req, res) => {
  const slug = req.user.slug;

  try {
    // ── availableYears ──
    const ayData = await fetchAllRows(
      supabase.from('jamaah').select('hijriah_year').eq('agent_slug', slug).not('hijriah_year', 'is', null)
    );
    let availableYears = [...new Set(ayData.map(r => r.hijriah_year))]
      .filter(y => Number(y) >= 1447)  // Only show 1447+
      .sort((a, b) => b.localeCompare(a));




    // Determine hijriah year — default to 1448
    let year = req.query.year || null;
    if (!year) {
      year = availableYears.includes('1448') ? '1448' : (availableYears[0] || null);
    }

    // Base filter
    const baseMatch = { agent_slug: slug };
    if (year) baseMatch.hijriah_year = year;

    // ── totalJamaah ──
    const { count: totalJamaah } = await supabase
      .from('jamaah')
      .select('*', { count: 'exact', head: true })
      .match(baseMatch);

    // ── lunas: sisa = 0 ──
    const { count: lunas } = await supabase
      .from('jamaah')
      .select('*', { count: 'exact', head: true })
      .match(baseMatch)
      .or('sisa.eq.0,sisa.is.null');

    // ── belumLunas: sisa > 0 ──
    const { count: belumLunas } = await supabase
      .from('jamaah')
      .select('*', { count: 'exact', head: true })
      .match(baseMatch)
      .gt('sisa', 0);

    // ── totalOutstanding: SUM(sisa) where sisa > 0 ──
    let outQ = supabase.from('jamaah').select('sisa').eq('agent_slug', slug).gt('sisa', 0);
    if (year) outQ = outQ.eq('hijriah_year', year);
    const outData = await fetchAllRows(outQ);
    const totalOutstanding = outData.reduce((s, r) => s + (r.sisa || 0), 0);

    const todayStr = new Date().toISOString().split('T')[0];
    const now = new Date();

    // ── berangkatSegera: jamaah in the nearest upcoming departure month ──
    let bebQ = supabase.from('jamaah')
      .select('nama, paket, jk, tgl_berangkat, sisa, wa')
      .eq('agent_slug', slug)
      .gte('tgl_berangkat', todayStr)
      .order('tgl_berangkat', { ascending: true })
      .order('nama', { ascending: true });
    if (year) bebQ = bebQ.eq('hijriah_year', year);
    const bebRows = await fetchAllRows(bebQ);

    let berangkatBulanIni = [];
    let berangkatSegera = 0;
    let berangkatBulan = null;
    const todayDate = new Date(todayStr);

    if (bebRows && bebRows.length > 0) {
      const firstMonth = bebRows[0].tgl_berangkat.substring(0, 7);
      berangkatBulanIni = bebRows
        .filter(r => r.tgl_berangkat && r.tgl_berangkat.substring(0, 7) === firstMonth)
        .map(r => {
          const dep = new Date(r.tgl_berangkat);
          const diffDays = Math.ceil((dep.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
          return {
            nama: r.nama,
            paket: r.paket,
            jk: r.jk,
            tgl_berangkat: r.tgl_berangkat,
            hari_lagi: diffDays,
            lunas: !r.sisa || r.sisa === 0,
            sisa: r.sisa || 0,
            wa: r.wa,
          };
        });
      berangkatSegera = berangkatBulanIni.length;
      // Format month label: "Maret 2026"
      const fm = new Date(firstMonth + '-01');
      berangkatBulan = fm.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    }

    // ── jamaahBaru: tgl_daftar in current month ──
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthEnd = nextMonth.toISOString().split('T')[0];
    let jbQ = supabase.from('jamaah').select('*', { count: 'exact', head: true })
      .match(baseMatch).gte('tgl_daftar', monthStart).lt('tgl_daftar', monthEnd);
    const { count: jamaahBaru } = await jbQ;

    // ── lunasPercent ──
    const total = totalJamaah || 0;
    const lunasPercent = total > 0 ? Math.round(((lunas || 0) / total) * 100) : 0;

    // ── comparison vs previous month ──
    // totalJamaah: prev = jamaah registered before this month
    const { count: prevTotal } = await supabase
      .from('jamaah')
      .select('*', { count: 'exact', head: true })
      .match(baseMatch)
      .lt('tgl_daftar', monthStart);

    // jamaahBaru: prev = registrations in previous month
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthStart = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
    const { count: prevJamaahBaru } = await supabase
      .from('jamaah')
      .select('*', { count: 'exact', head: true })
      .match(baseMatch)
      .gte('tgl_daftar', prevMonthStart)
      .lt('tgl_daftar', monthStart);

    const comparison = {
      totalJamaah: { prev: prevTotal || 0, diff: (totalJamaah || 0) - (prevTotal || 0) },
      komisiCair: null,
      berangkatSegera: { prev: null, diff: null },
      jamaahBaru: { prev: prevJamaahBaru || 0, diff: (jamaahBaru || 0) - (prevJamaahBaru || 0) },
    };

    // ── trend: 7 months group by tgl_daftar ──
    const sevenMonthsAgo = new Date();
    sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 6);
    const tmStr = `${sevenMonthsAgo.getFullYear()}-${String(sevenMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`;
    let trendQ = supabase.from('jamaah').select('tgl_daftar').eq('agent_slug', slug)
      .gte('tgl_daftar', tmStr).order('tgl_daftar', { ascending: true });
    if (year) trendQ = trendQ.eq('hijriah_year', year);
    const trendRows = await fetchAllRows(trendQ);

    const trendMap = new Map();
    for (const row of trendRows) {
      if (!row.tgl_daftar) continue;
      const bulan = row.tgl_daftar.substring(0, 7);
      trendMap.set(bulan, (trendMap.get(bulan) || 0) + 1);
    }
    const trend = Array.from(trendMap.entries())
      .map(([bulan, count]) => ({ bulan, count }))
      .sort((a, b) => a.bulan.localeCompare(b.bulan));

    // ── outstandingList: jamaah with sisa > 0, sorted by sisa DESC ──
    let olQ = supabase.from('jamaah')
      .select('nama, paket, jk, sisa, tgl_berangkat, wa')
      .eq('agent_slug', slug)
      .gt('sisa', 0)
      .order('sisa', { ascending: false })
      .order('tgl_berangkat', { ascending: true });
    if (year) olQ = olQ.eq('hijriah_year', year);
    const olRows = await fetchAllRows(olQ);

    const outstandingList = olRows.map(r => {
      let hari_lagi = null;
      if (r.tgl_berangkat) {
        const dep = new Date(r.tgl_berangkat);
        hari_lagi = Math.ceil((dep.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
      }
      return {
        nama: r.nama,
        paket: r.paket,
        jk: r.jk,
        sisa: r.sisa,
        tgl_berangkat: r.tgl_berangkat,
        hari_lagi,
        wa: r.wa,
      };
    });

    // ── komisi ──
    const KOMISI_HEMAT = 1300000;
    const KOMISI_REGULER = 1800000;
    const getRate = (p) => (p && p.toLowerCase().includes('hemat') ? KOMISI_HEMAT : KOMISI_REGULER);

    let komisiQ = supabase.from('jamaah').select('paket, sisa, tgl_berangkat').eq('agent_slug', slug);
    if (year) komisiQ = komisiQ.eq('hijriah_year', year);
    const komisiRows = await fetchAllRows(komisiQ);

    let sudahCair = 0, sudahCairCount = 0;
    let belumCair = 0, belumCairCount = 0;
    let potensi = 0, potensiCount = 0;
    let hematCount = 0, hematTotal = 0, regulerCount = 0, regulerTotal = 0;
    for (const r of komisiRows) {
      const rate = getRate(r.paket);
      const isLunas = !r.sisa || r.sisa === 0;
      const departed = r.tgl_berangkat && r.tgl_berangkat < todayStr;
      if (isLunas && departed) { sudahCair += rate; sudahCairCount++; }
      else if (isLunas) { belumCair += rate; belumCairCount++; }
      else { potensi += rate; potensiCount++; }
      if (r.paket && r.paket.toLowerCase().includes('hemat')) { hematCount++; hematTotal += rate; }
      else { regulerCount++; regulerTotal += rate; }
    }
    // chartBulanan: komisi cair grouped by departure month (7 months)
    const chartMap = new Map();
    // Build 7-month skeleton
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      chartMap.set(ym, { bulan: ym, total: 0, count: 0 });
    }
    for (const r of komisiRows) {
      if (!r.tgl_berangkat || r.tgl_berangkat >= todayStr) continue;
      const isLunas = !r.sisa || r.sisa === 0;
      if (!isLunas) continue;
      const ym = r.tgl_berangkat.substring(0, 7);
      if (chartMap.has(ym)) {
        const entry = chartMap.get(ym);
        entry.total += getRate(r.paket);
        entry.count++;
      }
    }
    const chartBulanan = Array.from(chartMap.values());

    const komisi = {
      totalKomisi: sudahCair + belumCair + potensi,
      sudahCair, sudahCairCount,
      belumCair, belumCairCount,
      potensi, potensiCount,
      breakdown: {
        hemat: { count: hematCount, rate: KOMISI_HEMAT, total: hematTotal },
        reguler: { count: regulerCount, rate: KOMISI_REGULER, total: regulerTotal },
      },
      chartBulanan,
    };

    // ── lastSync ──
    const { data: syncData } = await supabase
      .from('jamaah')
      .select('synced_at')
      .eq('agent_slug', slug)
      .order('synced_at', { ascending: false })
      .limit(1);
    const lastSync = syncData?.[0]?.synced_at || null;

    res.json({
      success: true,
      data: {
        totalJamaah: totalJamaah || 0,
        lunas: lunas || 0,
        belumLunas: belumLunas || 0,
        totalOutstanding,
        berangkatSegera,
        berangkatBulan,
        jamaahBaru: jamaahBaru || 0,
        lunasPercent,
        comparison,
        trend,
        berangkatBulanIni,
        outstandingList,
        availableYears,
        komisi,
        hijriahYear: year || null,
        lastSync,
      },
    });
  } catch (err) {
    console.error('[Stats] Error:', err);
    res.status(500).json({ error: 'Gagal memuat statistik', message: err.message });
  }
});

// ──────────────────────────────────────────────
// API: Haji — scrape & manage haji data
// ──────────────────────────────────────────────

// POST /api/haji/sync — progressive sync (same pattern as umroh)
app.post('/api/haji/sync', authMiddleware, async (req, res) => {
  const { slug } = req.user;
  const hajiKey = `haji:${slug}`;

  // Bypass internal login for bagas — return existing Supabase data count
  if (slug === 'bagas') {
    const { count } = await supabase
      .from('jamaah_haji')
      .select('*', { count: 'exact', head: true })
      .eq('agent_slug', 'bagas');
    syncingAgents.set(hajiKey, { isSyncing: false, totalSynced: count || 0, lastSync: new Date().toISOString() });
    return res.json({ success: true, data: { initialCount: count || 0, syncing: false, message: 'Data sudah tersinkronisasi' } });
  }

  try {
    const agent = await getAgent(slug);
    if (!agent?.jamaah_username || !agent?.jamaah_password) {
      return res.status(400).json({
        error: 'Belum terhubung ke sistem internal. Silakan login di halaman Jamaah terlebih dahulu.'
      });
    }

    // Prevent concurrent haji sync (separate from umroh)
    const state = syncingAgents.get(hajiKey);
    if (state?.isSyncing) {
      return res.json({ success: true, data: { initialCount: 0, syncing: true, message: 'Sync sudah berjalan' } });
    }

    syncingAgents.set(hajiKey, { isSyncing: true, totalSynced: 0, lastSync: null });

    // Login fresh to legacy system
    await laporanDisconnect(agent.jamaah_username);
    const decrypted = capiDecrypt(agent.jamaah_password);
    const loginResult = await laporanLogin(agent.jamaah_username, decrypted, agent.jamaah_kantor || '2');
    if (!loginResult.success) {
      syncingAgents.set(hajiKey, { isSyncing: false, totalSynced: 0, lastSync: null });
      return res.status(401).json({ error: 'Gagal login ke sistem internal. Silakan login ulang.' });
    }

    const sessionCookies = getSessionCookie(agent.jamaah_username);
    if (!sessionCookies) {
      syncingAgents.set(hajiKey, { isSyncing: false, totalSynced: 0, lastSync: null });
      return res.status(400).json({ error: 'Session cookies tidak tersedia setelah login.' });
    }

    // Step 1: Fetch the haji list
    const hajiList = await fetchHajiList(sessionCookies);
    const uniqueIds = [...new Set(hajiList.map(h => h.id_haji))];
    console.log(`[haji-sync] ${slug}: found ${hajiList.length} entries, ${uniqueIds.length} unique`);

    if (uniqueIds.length === 0) {
      // All haji removed from internal system — clean up DB
      const { data: deleted } = await supabase
        .from('jamaah_haji')
        .delete()
        .eq('agent_slug', slug)
        .select('nama');
      if (deleted?.length > 0) {
        console.log(`[haji-sync] ${slug}: removed ${deleted.length} haji (internal system empty)`);
      }
      syncingAgents.set(hajiKey, { isSyncing: false, totalSynced: 0, lastSync: new Date().toISOString() });
      return res.json({ success: true, data: { initialCount: 0, syncing: false } });
    }

    // Step 2: Fetch first batch (up to 5 detail pages) for immediate response
    const BATCH_SIZE = 5;
    const firstBatchIds = uniqueIds.slice(0, 10);
    const restIds = uniqueIds.slice(10);
    const now = new Date().toISOString();
    const firstRows = [];

    for (let i = 0; i < firstBatchIds.length; i += BATCH_SIZE) {
      const batch = firstBatchIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (idHaji) => {
          const details = await fetchHajiDetail(sessionCookies, idHaji);
          const listEntry = hajiList.find(h => h.id_haji === idHaji);
          return details.map(detail => ({
            agent_slug: slug,
            id_haji: idHaji,
            id_jamaah: detail.id_jamaah,
            nama: detail.nama,
            jk: detail.jk,
            alamat: detail.alamat,
            telp: detail.telp,
            thn_hijriyah: listEntry.thn_hijriyah,
            thn_masehi: listEntry.thn_masehi,
            perwakilan: listEntry.perwakilan,
            marketing: listEntry.marketing,
            paket: listEntry.paket,
            staff: listEntry.staff,
            jenis: listEntry.jenis,
            status_bayar: detail.status_bayar,
            status_berangkat: detail.status_berangkat,
            bpih_url: detail.bpih_url,
            surat_pernyataan_url: detail.surat_pernyataan_url,
            synced_at: now,
          }));
        })
      );
      for (const r of results) {
        if (r.status === 'fulfilled') firstRows.push(...r.value);
        else if (r.reason?.message === 'SESSION_EXPIRED') throw r.reason;
      }
    }

    // Upsert first batch
    if (firstRows.length > 0) {
      const { error: firstErr } = await supabase
        .from('jamaah_haji')
        .upsert(firstRows, { onConflict: 'agent_slug,id_haji,id_jamaah' });
      if (firstErr) console.error('[haji-sync] First batch upsert error:', firstErr.message);
    }

    const moreToSync = restIds.length > 0;
    syncingAgents.set(hajiKey, { isSyncing: moreToSync, totalSynced: firstRows.length, lastSync: now });

    // Respond immediately with first batch
    res.json({
      success: true,
      data: { initialCount: firstRows.length, total: hajiList.length, syncing: moreToSync },
    });

    // Step 3: Continue syncing rest in background
    if (moreToSync) {
      (async () => {
        try {
          const bgRows = [];
          for (let i = 0; i < restIds.length; i += BATCH_SIZE) {
            const batch = restIds.slice(i, i + BATCH_SIZE);
            const results = await Promise.allSettled(
              batch.map(async (idHaji) => {
                const details = await fetchHajiDetail(sessionCookies, idHaji);
                const listEntry = hajiList.find(h => h.id_haji === idHaji);
                return details.map(detail => ({
                  agent_slug: slug,
                  id_haji: idHaji,
                  id_jamaah: detail.id_jamaah,
                  nama: detail.nama,
                  jk: detail.jk,
                  alamat: detail.alamat,
                  telp: detail.telp,
                  thn_hijriyah: listEntry.thn_hijriyah,
                  thn_masehi: listEntry.thn_masehi,
                  perwakilan: listEntry.perwakilan,
                  marketing: listEntry.marketing,
                  paket: listEntry.paket,
                  staff: listEntry.staff,
                  jenis: listEntry.jenis,
                  status_bayar: detail.status_bayar,
                  status_berangkat: detail.status_berangkat,
                  bpih_url: detail.bpih_url,
                  surat_pernyataan_url: detail.surat_pernyataan_url,
                  synced_at: now,
                }));
              })
            );
            for (const r of results) {
              if (r.status === 'fulfilled') bgRows.push(...r.value);
              else if (r.reason?.message === 'SESSION_EXPIRED') throw r.reason;
            }
            // Upsert in batches of 50
            if (bgRows.length >= 50 || i + BATCH_SIZE >= restIds.length) {
              if (bgRows.length > 0) {
                const { error } = await supabase
                  .from('jamaah_haji')
                  .upsert(bgRows, { onConflict: 'agent_slug,id_haji,id_jamaah' });
                if (error) console.error('[haji-sync] BG batch error:', error.message);
                syncingAgents.set(hajiKey, {
                  isSyncing: true,
                  totalSynced: firstRows.length + bgRows.length,
                  lastSync: now,
                });
                bgRows.length = 0; // clear
              }
            }
            if (i + BATCH_SIZE < restIds.length) await new Promise(r => setTimeout(r, 100));
          }
          // Cleanup: delete haji jamaah that no longer exist in internal system
          const { data: hajiDeleted, error: hajiDelErr } = await supabase
            .from('jamaah_haji')
            .delete()
            .eq('agent_slug', slug)
            .lt('synced_at', now)
            .select('nama');
          if (hajiDelErr) console.error(`[haji-sync] ${slug} cleanup error:`, hajiDelErr.message);
          else if (hajiDeleted?.length > 0) {
            console.log(`[haji-sync] ${slug}: removed ${hajiDeleted.length} stale haji jamaah: ${hajiDeleted.map(d => d.nama).join(', ')}`);
          }

          console.log(`[haji-sync] ${slug}: background sync complete`);
          syncingAgents.set(hajiKey, { isSyncing: false, totalSynced: firstRows.length, lastSync: now });
        } catch (err) {
          console.error('[haji-sync] BG sync error:', err.message);
          syncingAgents.set(hajiKey, { isSyncing: false, totalSynced: 0, lastSync: null });
        }
      })();
    } else {
      // No background sync needed — cleanup stale records now
      const { data: hajiDeleted, error: hajiDelErr } = await supabase
        .from('jamaah_haji')
        .delete()
        .eq('agent_slug', slug)
        .lt('synced_at', now)
        .select('nama');
      if (hajiDelErr) console.error(`[haji-sync] ${slug} cleanup error:`, hajiDelErr.message);
      else if (hajiDeleted?.length > 0) {
        console.log(`[haji-sync] ${slug}: removed ${hajiDeleted.length} stale haji jamaah: ${hajiDeleted.map(d => d.nama).join(', ')}`);
      }
    }
  } catch (err) {
    console.error('[haji] Sync error:', err);
    syncingAgents.set(hajiKey, { isSyncing: false, totalSynced: 0, lastSync: null });
    if (!res.headersSent) {
      if (err.message === 'SESSION_EXPIRED') {
        return res.status(401).json({ error: 'Session expired. Silakan login ulang.' });
      }
      res.status(500).json({ error: 'Gagal sync data haji: ' + err.message });
    }
  }
});

// Haji sync status (separate from umroh)
app.get('/api/haji/sync-status', authMiddleware, async (req, res) => {
  const hajiKey = `haji:${req.user.slug}`;
  const state = syncingAgents.get(hajiKey);
  if (!state) {
    const { data } = await supabase
      .from('jamaah_haji')
      .select('synced_at')
      .eq('agent_slug', req.user.slug)
      .order('synced_at', { ascending: false })
      .limit(1);
    return res.json({
      success: true,
      data: { isSyncing: false, totalSynced: 0, lastSync: data?.[0]?.synced_at || null },
    });
  }
  res.json({ success: true, data: state });
});

// GET /api/haji/jamaah — list jamaah haji with filters
app.get('/api/haji/jamaah', authMiddleware, async (req, res) => {
  try {
    const { slug } = req.user;
    const {
      search = '',
      thn_hijriyah = '',
      thn_masehi = '',
      jenis = '',
      status_bayar = '',
      page = '1',
      limit = '20'
    } = req.query;

    let query = supabase
      .from('jamaah_haji')
      .select('*', { count: 'exact' })
      .eq('agent_slug', slug)
      .order('id_haji', { ascending: false });

    if (search) {
      query = query.or(`nama.ilike.%${search}%,id_haji.ilike.%${search}%,id_jamaah.ilike.%${search}%`);
    }
    if (thn_hijriyah) {
      query = query.eq('thn_hijriyah', thn_hijriyah);
    }
    if (thn_masehi) {
      query = query.eq('thn_masehi', thn_masehi);
    }
    if (jenis) {
      query = query.eq('jenis', jenis);
    }
    if (status_bayar) {
      query = query.eq('status_bayar', status_bayar);
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const from = (pageNum - 1) * limitNum;
    query = query.range(from, from + limitNum - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data,
      total: count,
      page: pageNum,
      limit: limitNum
    });
  } catch (err) {
    console.error('[haji] List error:', err);
    res.status(500).json({ error: 'Gagal mengambil data haji' });
  }
});

// Haji jamaah note: create/update/clear note for a specific haji jamaah
app.post('/api/haji/jamaah/note', authMiddleware, async (req, res) => {
  try {
    const slug = req.user.slug;
    const { id_haji, id_jamaah, notes } = req.body;

    if (!id_haji || !id_jamaah) {
      return res.status(400).json({ error: 'id_haji and id_jamaah are required' });
    }

    const updateData = (!notes || notes.trim() === '')
      ? { notes: null, notes_updated_at: null }
      : { notes: notes.trim(), notes_updated_at: new Date().toISOString() };

    const { error } = await supabase
      .from('jamaah_haji')
      .update(updateData)
      .eq('agent_slug', slug)
      .eq('id_haji', id_haji)
      .eq('id_jamaah', id_jamaah);

    if (error) {
      console.error('[haji-note] Update error:', error.message);
      return res.status(500).json({ error: 'Failed to save note' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[haji-note] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/haji/stats — aggregated haji statistics
app.get('/api/haji/stats', authMiddleware, async (req, res) => {
  try {
    const { slug } = req.user;

    const { data, error } = await supabase
      .from('jamaah_haji')
      .select('id_haji, thn_hijriyah, thn_masehi, status_bayar, jenis, paket')
      .eq('agent_slug', slug);

    if (error) throw error;

    const total = data.length;
    const uniqueHaji = [...new Set(data.map(d => d.id_haji))].length;
    const lunas = data.filter(d => d.status_bayar === 'LUNAS').length;
    const cicilan = data.filter(d => d.status_bayar === 'CICILAN').length;
    const belumBayar = data.filter(d => d.status_bayar === 'BELUM BAYAR').length;

    // Group by thn_masehi
    const byTahun = {};
    data.forEach(d => {
      const key = d.thn_masehi || 'unknown';
      if (!byTahun[key]) byTahun[key] = 0;
      byTahun[key]++;
    });

    // Group by jenis
    const byJenis = {};
    data.forEach(d => {
      const key = d.jenis || 'unknown';
      if (!byJenis[key]) byJenis[key] = 0;
      byJenis[key]++;
    });

    res.json({
      success: true,
      data: {
        total,
        uniqueHaji,
        lunas,
        cicilan,
        belumBayar,
        byTahun,
        byJenis
      }
    });
  } catch (err) {
    console.error('[haji] Stats error:', err);
    res.status(500).json({ error: 'Gagal mengambil statistik haji' });
  }
});

// GET /api/haji/doc-proxy — proxy internal documents to avoid Mixed Content
app.get('/api/haji/doc-proxy', authMiddleware, async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL parameter required' });

    // Security: only allow proxying to the known internal server
    const BASE_INTERNAL = process.env.INTERNAL_API_BASE || 'http://115.124.86.220';
    let targetUrl = url;

    // Resolve relative paths
    if (targetUrl.startsWith('/')) {
      targetUrl = `${BASE_INTERNAL}${targetUrl}`;
    } else if (!targetUrl.startsWith('http')) {
      targetUrl = `${BASE_INTERNAL}/aiw/staff/pages/${targetUrl}`;
    }

    // Block requests to anything outside the internal server
    if (!targetUrl.startsWith(BASE_INTERNAL)) {
      return res.status(403).json({ error: 'Forbidden: only internal documents allowed' });
    }

    // Get session cookies for PHP pages (pernyataan needs auth)
    const { slug } = req.user;
    const agent = await getAgent(slug);
    const sessionCookies = agent?.jamaah_username ? getSessionCookie(agent.jamaah_username) : null;

    const headers = {};
    if (sessionCookies) headers['Cookie'] = sessionCookies;

    const response = await fetch(targetUrl, { headers, redirect: 'follow' });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Failed to fetch document: ${response.status}` });
    }

    // Forward content type
    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    // Forward content disposition if present (for PDF downloads)
    const disposition = response.headers.get('content-disposition');
    if (disposition) res.setHeader('Content-Disposition', disposition);

    // Stream the response body
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    console.error('[doc-proxy] Error:', err.message);
    res.status(500).json({ error: 'Gagal memuat dokumen' });
  }
});

// ──────────────────────────────────────────────
// Analytics API
// ──────────────────────────────────────────────
const VALID_EVENT_TYPES = ['login', 'feature', 'action', 'public'];
const VALID_PUBLIC_EVENTS = ['page_view', 'wa_click_public', 'quiz_started', 'quiz_completed', 'inquiry_submitted'];
const publicEventRateLimits = new Map(); // ip → { count, resetAt }

app.options('/api/analytics/:path', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }).sendStatus(204);
});

// Authenticated event logging (frontend → backend)
app.post('/api/analytics/event', authMiddleware, (req, res) => {
  const { eventType, eventName, metadata } = req.body;
  if (!eventType || !VALID_EVENT_TYPES.includes(eventType)) {
    return res.status(400).json({ error: 'Invalid eventType' });
  }
  if (!eventName || typeof eventName !== 'string' || eventName.length > 50) {
    return res.status(400).json({ error: 'Invalid eventName' });
  }
  // Skip tracking for admin users
  if (req.user.role !== 'admin') {
    logAnalyticsEvent(req.user.slug, eventType, eventName, metadata || {});
  }
  res.json({ success: true });
});

// Public (unauthenticated) event logging
app.post('/api/analytics/public', async (req, res) => {
  const { slug, eventName, metadata } = req.body;
  if (!slug || !eventName) {
    return res.status(400).json({ error: 'slug and eventName required' });
  }
  if (!VALID_PUBLIC_EVENTS.includes(eventName)) {
    return res.status(400).json({ error: 'Invalid eventName' });
  }
  // Rate limit: 30 req/min per IP
  const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
  const now = Date.now();
  const rl = publicEventRateLimits.get(ip);
  if (rl && now < rl.resetAt) {
    if (rl.count >= 30) return res.status(429).json({ error: 'Rate limited' });
    rl.count++;
  } else {
    publicEventRateLimits.set(ip, { count: 1, resetAt: now + 60000 });
  }
  // Validate slug exists
  const agent = await getAgent(slug.toLowerCase());
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  logAnalyticsEvent(slug.toLowerCase(), 'public', eventName, metadata || {});
  res.json({ success: true });
});

// Analytics summary (admin only)
app.get('/api/analytics/summary', authMiddleware, adminOnly, async (req, res) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const year = parseInt(req.query.year) || now.getFullYear();
    const startOfMonth = new Date(year, month - 1, 1).toISOString();
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999).toISOString();
    const period = `${year}-${String(month).padStart(2, '0')}`;

    // Dates for relative calculations
    const now3d = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
    const now7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const now30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch all events for the month
    const { data: monthEvents } = await supabase
      .from('analytics_events')
      .select('*')
      .gte('created_at', startOfMonth)
      .lte('created_at', endOfMonth)
      .order('created_at', { ascending: false });

    const events = monthEvents || [];

    // Overview
    const totalLogins = events.filter(e => e.event_name === 'login').length;
    const totalPageViews = events.filter(e => e.event_name === 'page_view').length;
    const totalWAClicks = events.filter(e => ['wa_click_public', 'wa_click_jamaah'].includes(e.event_name)).length;

    // Active agents (any event in last 7 days)
    const { data: allAgents } = await supabase.from('agents').select('slug, name, photo');
    const agentList = allAgents || [];
    const recentSlugs = new Set(
      events.filter(e => new Date(e.created_at) >= new Date(now7d)).map(e => e.agent_slug)
    );
    const activeAgents = recentSlugs.size;

    // Daily logins (last 7 days)
    const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    const dailyLogins = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const count = events.filter(e =>
        e.event_name === 'login' && e.created_at.slice(0, 10) === dateStr
      ).length;
      dailyLogins.push({ date: dateStr, day: dayNames[d.getDay()], count });
    }

    // Agent Activity
    const agentActivity = agentList.map(agent => {
      const agentEvents = events.filter(e => e.agent_slug === agent.slug);
      const logins = agentEvents.filter(e => e.event_name === 'login').length;
      const featureClicks = agentEvents.filter(e => e.event_type === 'feature').length;
      const pageViews = agentEvents.filter(e => e.event_name === 'page_view').length;
      const waClicks = agentEvents.filter(e => ['wa_click_public', 'wa_click_jamaah'].includes(e.event_name)).length;
      const lastEvent = agentEvents[0];
      const lastActive = lastEvent?.created_at || null;

      let status = 'never';
      if (lastActive) {
        if (new Date(lastActive) >= new Date(now3d)) status = 'active';
        else if (new Date(lastActive) >= new Date(now7d)) status = 'inactive';
        else if (new Date(lastActive) >= new Date(now30d)) status = 'dormant';
      }

      return {
        slug: agent.slug, name: agent.name, photo: agent.photo,
        lastActive, logins, featureClicks, pageViews, waClicks, status,
      };
    });
    // Sort: active first, then by logins DESC
    const statusOrder = { active: 0, inactive: 1, dormant: 2, never: 3 };
    agentActivity.sort((a, b) => (statusOrder[a.status] - statusOrder[b.status]) || (b.logins - a.logins));

    // Feature Usage
    const featureEvents = events.filter(e => e.event_type === 'feature');
    const featureMap = {};
    const featureLabels = {
      open_jamaah: 'Jamaah', open_statistik: 'Statistik', open_kalkulasi: 'Kalkulasi',
      open_compare: 'Compare', open_capi: 'Meta CAPI', open_profil: 'Profil',
      open_jadwal: 'Jadwal', open_analytics: 'Analytics',
      open_ai_tools: 'AI Tools', open_voice_over: 'Voice Over', open_business_card: 'Kartu Nama',
      open_haji_plus: 'Haji Plus', open_jamaah_haji: 'Jamaah Haji',
      open_settings: 'Settings', open_tren_daftar: 'Tren Daftar',
      open_kurs: 'Kurs',
    };
    featureEvents.forEach(e => { featureMap[e.event_name] = (featureMap[e.event_name] || 0) + 1; });
    const featureUsage = Object.entries(featureMap)
      .map(([feature, count]) => ({ feature, label: featureLabels[feature] || feature, count }))
      .sort((a, b) => b.count - a.count);

    // Action Tracking
    const actionEvents = events.filter(e => e.event_type === 'action');
    const actionMap = {};
    const actionLabels = {
      sync_jamaah: 'Sync Jamaah', generate_pdf: 'Generate PDF Quotation',
      share_screenshot: 'Share Screenshot', download_brosur: 'Download Brosur',
      download_itinerary: 'Download Itinerary', wa_click_jamaah: 'WA Click Jamaah',
      save_capi_config: 'Simpan Config CAPI', update_profil: 'Update Profil',
      change_password: 'Ganti Password',
      generate_script: 'Generate Script VO', generate_voice: 'Generate Voice VO',
      download_mp3: 'Download MP3', download_wav: 'Download WAV',
      generate_business_card: 'Generate Kartu Nama', download_business_card: 'Download Kartu Nama',
      export_haji_infographic: 'Export Infografis Haji',
      update_lead_status: 'Update Status Lead', delete_lead: 'Hapus Lead', wa_click_lead: 'WA Lead',
      sync_jamaah_haji: 'Sync Jamaah Haji', view_bpih_doc: 'Lihat BPIH',
      view_pernyataan_doc: 'Lihat Srt Pernyataan', wa_click_haji: 'WA Jamaah Haji',
      connect_telegram: 'Hubungkan Telegram', disconnect_telegram: 'Putuskan Telegram',
      update_notif_prefs: 'Update Notif Prefs',
      forgot_password: 'Lupa Password', reset_password: 'Reset Password',
      view_web_itinerary: 'Web Itinerary', view_flight_status: 'Flight Status',
      share_flight: 'Share Flight Status',
    };
    actionEvents.forEach(e => { actionMap[e.event_name] = (actionMap[e.event_name] || 0) + 1; });
    const actionTracking = Object.entries(actionMap)
      .map(([action, count]) => ({ action, label: actionLabels[action] || action, count }))
      .sort((a, b) => b.count - a.count);

    // Recent Activity (today, exclude page_view, max 10)
    const todayStr = now.toISOString().slice(0, 10);
    const agentNameMap = Object.fromEntries(agentList.map(a => [a.slug, a.name]));
    const allLabels = {
      ...featureLabels, ...actionLabels, login: 'Login', login_failed: 'Login Gagal',
      quiz_started: 'Quiz Dimulai', quiz_completed: 'Quiz Selesai', inquiry_submitted: 'Inquiry Masuk',
      page_view: 'Page View', wa_click_public: 'WA Click Public',
    };
    const recentActivity = events
      .filter(e => e.created_at.slice(0, 10) === todayStr && e.event_name !== 'page_view')
      .slice(0, 10)
      .map(e => ({
        agentSlug: e.agent_slug,
        agentName: agentNameMap[e.agent_slug] || e.agent_slug,
        eventName: e.event_name,
        label: allLabels[e.event_name] || e.event_name,
        createdAt: e.created_at,
      }));

    res.json({
      success: true,
      data: {
        period,
        overview: {
          totalLogins, activeAgents, totalAgents: agentList.length,
          totalPageViews, totalWAClicks,
        },
        dailyLogins,
        agentActivity,
        featureUsage,
        actionTracking,
        recentActivity,
      },
    });
  } catch (err) {
    console.error('[Analytics] Summary error:', err);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

// ──────────────────────────────────────────────
// === AI TOOLS API ===
// ──────────────────────────────────────────────

// ── Credit helpers ──

const AI_AGENT_QUOTA = 25_000; // 25K chars per agent per month

function shouldResetCredits(firstUsedAt) {
  if (!firstUsedAt) return false;
  const now = new Date();
  const first = new Date(firstUsedAt);
  const daysDiff = (now - first) / (1000 * 60 * 60 * 24);
  return daysDiff >= 30;
}

// Get credit info for current agent
app.get('/api/ai-tools/credits', authMiddleware, async (req, res) => {
  try {
    const { slug } = req.user;
    const quota = AI_AGENT_QUOTA;

    const { data: credit } = await supabase
      .from('ai_credits')
      .select('*')
      .eq('agent_slug', slug)
      .maybeSingle();

    let charsUsed = 0;
    let daysUntilReset = 30;

    if (credit) {
      if (shouldResetCredits(credit.first_used_at)) {
        await supabase
          .from('ai_credits')
          .update({ chars_used: 0, first_used_at: new Date().toISOString() })
          .eq('agent_slug', slug);
        charsUsed = 0;
        daysUntilReset = 30;
      } else {
        charsUsed = credit.chars_used || 0;
        if (credit.first_used_at) {
          const daysPassed = (new Date() - new Date(credit.first_used_at)) / (1000 * 60 * 60 * 24);
          daysUntilReset = Math.max(0, Math.ceil(30 - daysPassed));
        }
      }
    }

    const remaining = Math.max(0, quota - charsUsed);

    res.json({
      success: true,
      data: {
        quota,
        used: charsUsed,
        remaining,
        daysUntilReset,
        percentUsed: Math.round((charsUsed / quota) * 100),
      }
    });
  } catch (err) {
    console.error('[ai-credits] Error:', err);
    res.status(500).json({ error: 'Gagal mengambil data kredit' });
  }
});

// Generate promotional script from paket data using OpenAI
app.post('/api/ai-tools/generate-script', authMiddleware, async (req, res) => {
  try {
    const { paketData, duration } = req.body;

    if (!paketData) {
      return res.status(400).json({ error: 'Data paket diperlukan' });
    }

    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
    }

    const charGuide = {
      10: { range: '30-50 karakter', max: 50, sentences: '1-2 kalimat pendek', tokens: 60 },
      20: { range: '60-100 karakter', max: 100, sentences: '2-3 kalimat', tokens: 120 },
      30: { range: '100-150 karakter', max: 150, sentences: '3-5 kalimat', tokens: 180 },
    };

    const guide = charGuide[duration] || charGuide[30];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Kamu adalah copywriter untuk travel umroh. Buat script voice over promosi yang catchy dan cocok untuk sosial media (Reels, TikTok, WA Status).

ATURAN KETAT:
- Bahasa Indonesia SANTAI dan GAUL, BUKAN bahasa baku/formal. Contoh: "Yuk", "Buruan", "Cuma", "Banget", "Udah", "Gak mau rugi kan?"
- MAKSIMAL ${guide.max} karakter. JANGAN LEBIH. Hitung karaktermu.
- Panjang ideal: ${guide.range} (${guide.sentences})
- Pakai kalimat pendek dan punchy, jangan berbelit-belit
- HINDARI kata-kata yang sulit diucapkan AI: kata asing, singkatan, angka desimal, istilah teknis
- Tulis angka dalam kata (contoh: "sembilan hari" bukan "9 hari", "dua puluh juta" bukan "20jt")
- Jangan gunakan emoji atau simbol
- Jangan gunakan sapaan waktu (pagi/siang/malam)
- Buka dengan hook yang bikin penasaran
- Sebutkan 1-2 keunggulan utama saja
- Tutup dengan ajakan yang bikin FOMO
- Jangan sebutkan nama agent
- Tulis HANYA script-nya, tanpa keterangan tambahan
- INGAT: durasi ${duration} detik = script SANGAT ${duration <= 10 ? 'PENDEK' : duration <= 20 ? 'SINGKAT' : 'RINGKAS'}`
          },
          {
            role: 'user',
            content: `Buat script voice over ${duration} detik (MAKSIMAL ${guide.max} karakter) untuk paket umroh ini:

Nama Paket: ${paketData.nama}
Tanggal Berangkat: ${paketData.tgl_berangkat}
Maskapai: ${paketData.maskapai || '-'}
Hotel Mekkah: ${paketData.hotel_mekkah || '-'}
Hotel Madinah: ${paketData.hotel_madinah || '-'}
Harga mulai: ${paketData.harga || '-'}
Seat tersisa: ${paketData.seat_sisa || '-'}`
          }
        ],
        max_tokens: guide.tokens,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    const generatedScript = data.choices?.[0]?.message?.content?.trim() || '';

    res.json({ success: true, data: { script: generatedScript } });
  } catch (err) {
    console.error('[ai-tools] Generate script error:', err);
    res.status(500).json({ error: 'Gagal generate script' });
  }
});

// Convert script to audio using Google Cloud TTS (Chirp 3: HD Indonesian voices)
app.post('/api/ai-tools/generate-voice', authMiddleware, async (req, res) => {
  try {
    const { script, voice, format = 'mp3' } = req.body;
    const { slug } = req.user;

    if (!script || !voice) {
      return res.status(400).json({ error: 'Script dan voice diperlukan' });
    }

    if (script.length > 1000) {
      return res.status(400).json({ error: 'Script terlalu panjang (max 1000 karakter)' });
    }

    const validVoices = [
      // Wanita
      'id-ID-Chirp3-HD-Aoede', 'id-ID-Chirp3-HD-Kore',
      'id-ID-Chirp3-HD-Leda', 'id-ID-Chirp3-HD-Zephyr',
      // Pria
      'id-ID-Chirp3-HD-Puck', 'id-ID-Chirp3-HD-Charon',
      'id-ID-Chirp3-HD-Fenrir', 'id-ID-Chirp3-HD-Orus',
    ];
    if (!validVoices.includes(voice)) {
      return res.status(400).json({ error: 'Voice tidak valid' });
    }

    const apiKey = process.env.GOOGLE_TTS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Google TTS API key belum dikonfigurasi' });
    }

    // === Credit check ===
    const scriptLength = script.length;
    const quota = AI_AGENT_QUOTA;

    let { data: credit } = await supabase
      .from('ai_credits')
      .select('*')
      .eq('agent_slug', slug)
      .maybeSingle();

    if (!credit) {
      const now = new Date().toISOString();
      await supabase
        .from('ai_credits')
        .upsert({
          agent_slug: slug,
          chars_used: 0,
          first_used_at: now,
        });
      credit = { agent_slug: slug, chars_used: 0, first_used_at: now };
    }

    if (credit.first_used_at && shouldResetCredits(credit.first_used_at)) {
      await supabase
        .from('ai_credits')
        .update({ chars_used: 0, first_used_at: new Date().toISOString() })
        .eq('agent_slug', slug);
      credit.chars_used = 0;
    }

    const remaining = quota - (credit.chars_used || 0);

    if (scriptLength > remaining) {
      return res.status(403).json({
        error: 'QUOTA_EXCEEDED',
        message: `Kuota tidak cukup. Sisa: ${remaining} karakter, dibutuhkan: ${scriptLength} karakter.`,
        remaining,
        needed: scriptLength,
      });
    }

    // === Google Cloud TTS API call ===
    const audioEncoding = format === 'wav' ? 'LINEAR16' : 'MP3';

    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text: script },
          voice: {
            languageCode: 'id-ID',
            name: voice,
          },
          audioConfig: {
            audioEncoding,
            sampleRateHertz: 24000,
            speakingRate: 1.1,
            effectsProfileId: ['headphone-class-device'],
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.audioContent) {
      console.error('[ai-tools] Google TTS error:', data.error || data);
      return res.status(500).json({ error: 'Gagal generate voice over' });
    }

    // Deduct credits after successful TTS
    const newCharsUsed = (credit.chars_used || 0) + scriptLength;
    console.log(`[ai-credits] Deducting: slug=${slug}, old=${credit.chars_used || 0}, scriptLen=${scriptLength}, new=${newCharsUsed}`);
    const { error: deductError } = await supabase
      .from('ai_credits')
      .update({ chars_used: newCharsUsed })
      .eq('agent_slug', slug);
    if (deductError) {
      console.error('[ai-credits] Deduction FAILED:', deductError);
    } else {
      console.log(`[ai-credits] Deduction OK: ${slug} now at ${newCharsUsed} chars_used`);
    }

    const audioBuffer = Buffer.from(data.audioContent, 'base64');

    const contentType = format === 'wav' ? 'audio/wav' : 'audio/mpeg';
    const ext = format === 'wav' ? 'wav' : 'mp3';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="voiceover.${ext}"`);
    res.send(audioBuffer);

  } catch (err) {
    console.error('[ai-tools] Generate voice error:', err);
    res.status(500).json({ error: 'Gagal generate voice over' });
  }
});

// ──────────────────────────────────────────────
// Flight Share API (MUST be before /api/{*path} catch-all proxy)
// ──────────────────────────────────────────────

function generateShareCode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

// POST /api/flight-share — Create or retrieve share link (auth required)
app.post('/api/flight-share', authMiddleware, async (req, res) => {
  try {
    const agentSlug = req.user.slug;
    const {
      flight_number, flight_date, dep_iata, arr_iata,
      dep_city, arr_city, dep_time, arr_time, duration,
      group_number, pax, tour_leader, airline_code, flight_status,
    } = req.body;

    if (!flight_number || !flight_date || !dep_iata || !arr_iata) {
      return res.status(400).json({ error: 'flight_number, flight_date, dep_iata, arr_iata wajib diisi' });
    }

    // Cek apakah sudah pernah di-share (UNIQUE constraint: agent + flight + date)
    const { data: existing } = await supabase
      .from('flight_shares')
      .select('code')
      .eq('agent_slug', agentSlug)
      .eq('flight_number', flight_number)
      .eq('flight_date', flight_date)
      .single();

    if (existing) {
      // Update data terbaru (jadwal bisa berubah)
      await supabase
        .from('flight_shares')
        .update({
          dep_city, arr_city, dep_time, arr_time, duration,
          group_number, pax, tour_leader, airline_code,
          flight_status: flight_status || 'scheduled',
        })
        .eq('code', existing.code);

      return res.json({
        success: true,
        data: {
          code: existing.code,
          url: `https://alhijaz.co/f/${existing.code}`,
        },
      });
    }

    // Generate kode baru
    let code = generateShareCode(8);

    // Pastikan unik (sangat jarang collision, tapi safety check)
    let attempts = 0;
    while (attempts < 5) {
      const { data: check } = await supabase
        .from('flight_shares')
        .select('code')
        .eq('code', code)
        .single();
      if (!check) break;
      code = generateShareCode(8);
      attempts++;
    }

    const { error } = await supabase
      .from('flight_shares')
      .insert({
        code,
        agent_slug: agentSlug,
        flight_number,
        flight_date,
        dep_iata,
        arr_iata,
        dep_city: dep_city || null,
        arr_city: arr_city || null,
        dep_time: dep_time || null,
        arr_time: arr_time || null,
        duration: duration || null,
        group_number: group_number || null,
        pax: pax || null,
        tour_leader: tour_leader || null,
        airline_code: airline_code || null,
        flight_status: flight_status || 'scheduled',
      });

    if (error) throw error;

    console.log(`[FlightShare] Created: ${code} for ${agentSlug} — ${flight_number} ${flight_date}`);

    res.json({
      success: true,
      data: {
        code,
        url: `https://alhijaz.co/f/${code}`,
      },
    });
  } catch (err) {
    console.error('[FlightShare] Create error:', err.message);
    res.status(500).json({ error: 'Gagal membuat share link' });
  }
});

// GET /api/flight-share/:code — Get flight share data (public, no auth)
// Enriches stored snapshot with live data from flight_status table
app.get('/api/flight-share/:code', async (req, res) => {
  try {
    const { code } = req.params;

    const { data: share, error } = await supabase
      .from('flight_shares')
      .select('*')
      .eq('code', code)
      .single();

    if (error || !share) {
      return res.status(404).json({ error: 'Link tidak ditemukan' });
    }

    // Ambil data agent
    const { data: agent } = await supabase
      .from('agents')
      .select('name, phone, email, photo, website, slug')
      .eq('slug', share.agent_slug)
      .single();

    // --- Live data enrichment ---
    // Try to find matching live flight data from flight_status table
    // flight_status.id format: "YYYY-MM-DD_SV821"
    const flightIata = share.flight_number.replace(/\s+/g, '');
    const liveId = `${share.flight_date}_${flightIata}`;

    let liveDepTime = share.dep_time;
    let liveArrTime = share.arr_time;
    let liveDuration = share.duration;
    let liveStatus = share.flight_status || 'scheduled';

    const { data: liveData } = await supabase
      .from('flight_status')
      .select('dep_scheduled, dep_actual, arr_scheduled, arr_estimated, status, duration')
      .eq('id', liveId)
      .single();

    if (liveData) {
      // Use actual/estimated times if available, fall back to scheduled
      const depTime = extractHHmm(liveData.dep_actual) || extractHHmm(liveData.dep_scheduled);
      const arrTime = extractHHmm(liveData.arr_estimated) || extractHHmm(liveData.arr_scheduled);
      if (depTime) liveDepTime = depTime;
      if (arrTime) liveArrTime = arrTime;
      if (liveData.status) liveStatus = liveData.status;

      // Format duration from minutes to human-readable
      if (liveData.duration && liveData.duration > 0) {
        const h = Math.floor(liveData.duration / 60);
        const m = liveData.duration % 60;
        liveDuration = h > 0 && m > 0 ? `${h} jam ${m} menit`
          : h > 0 ? `${h} jam`
          : `${m} menit`;
      }
    }

    // Also update the stored share data if live differs (keep it fresh)
    const needsUpdate = liveData && (
      liveDepTime !== share.dep_time ||
      liveArrTime !== share.arr_time ||
      liveStatus !== (share.flight_status || 'scheduled')
    );
    if (needsUpdate) {
      supabase
        .from('flight_shares')
        .update({
          dep_time: liveDepTime,
          arr_time: liveArrTime,
          duration: liveDuration,
          flight_status: liveStatus,
        })
        .eq('code', code)
        .then(() => {})
        .catch(() => {});
    }

    res.json({
      success: true,
      data: {
        flight: {
          flight_number: share.flight_number,
          flight_date: share.flight_date,
          dep_iata: share.dep_iata,
          arr_iata: share.arr_iata,
          dep_city: share.dep_city,
          arr_city: share.arr_city,
          dep_time: liveDepTime,
          arr_time: liveArrTime,
          duration: liveDuration,
          group_number: share.group_number,
          pax: share.pax,
          tour_leader: share.tour_leader,
          airline_code: share.airline_code,
          flight_status: liveStatus,
          created_at: share.created_at,
        },
        agent: agent || null,
      },
    });
  } catch (err) {
    console.error('[FlightShare] Fetch error:', err.message);
    res.status(500).json({ error: 'Gagal mengambil data' });
  }
});

// ──────────────────────────────────────────────
// Haji Plus API (MUST be before /api/{*path} catch-all proxy)
// ──────────────────────────────────────────────
app.get('/api/haji-plus/data', authMiddleware, async (req, res) => {
  try {
    const cached = await getHajiPlusData();

    if (!cached || !cached.data || cached.data.length === 0) {
      return res.status(404).json({ error: 'Data belum tersedia' });
    }

    const data = cached.data;
    const total = data.reduce((s, d) => s + d.pax, 0);
    const avg = Math.round(total / data.length);
    const peak = data.reduce((max, d) => d.pax > max.pax ? d : max, data[0]);
    const min = data.reduce((mn, d) => d.pax < mn.pax ? d : mn, data[0]);
    const currentYear = new Date().getFullYear();
    const current = data.find(d => d.year === currentYear) || null;

    res.json({
      success: true,
      data: {
        items: data,
        total,
        average: avg,
        peak,
        min,
        current,
        yearCount: data.length,
        synced_at: cached.synced_at,
      },
    });
  } catch (err) {
    console.error('[HajiPlus] API error:', err);
    res.status(500).json({ error: 'Gagal mengambil data' });
  }
});

// ─── WEATHER ENDPOINT ────────────────────────────────────────────
const WEATHER_CITIES = [
  { key: 'makkah',     name: 'Mekkah',     country: 'Arab Saudi', flag: '🇸🇦', lat: 21.3891, lon: 39.8579, tz: 'Asia/Riyadh' },
  { key: 'madinah',    name: 'Madinah',    country: 'Arab Saudi', flag: '🇸🇦', lat: 24.5247, lon: 39.5692, tz: 'Asia/Riyadh' },
  { key: 'istanbul',   name: 'Istanbul',   country: 'Türkiye',    flag: '🇹🇷', lat: 41.0082, lon: 28.9784, tz: 'Europe/Istanbul' },
  { key: 'cappadocia', name: 'Cappadocia', country: 'Türkiye',    flag: '🇹🇷', lat: 38.6431, lon: 34.8287, tz: 'Europe/Istanbul' },
  { key: 'dubai',      name: 'Dubai',      country: 'UAE',        flag: '🇦🇪', lat: 25.2048, lon: 55.2708, tz: 'Asia/Dubai' },
  { key: 'hainan',     name: 'Hainan',     country: 'China',      flag: '🇨🇳', lat: 18.2528, lon: 109.5120, tz: 'Asia/Shanghai' },
];

let weatherCache = null;
let weatherCacheTime = 0;
let weatherCacheTTL = 60 * 60 * 1000;
const WEATHER_CACHE_TTL_FULL = 60 * 60 * 1000;     // 1 jam untuk data lengkap
const WEATHER_CACHE_TTL_PARTIAL = 10 * 60 * 1000;   // 10 menit untuk data tidak lengkap

const wmoMap = (code) => {
  if (code === 0)              return { label: 'Cerah',            icon: '☀️' };
  if (code <= 2)              return { label: 'Cerah berawan',    icon: '🌤️' };
  if (code === 3)             return { label: 'Mendung',          icon: '☁️' };
  if (code <= 49)             return { label: 'Berkabut',         icon: '🌫️' };
  if (code <= 57)             return { label: 'Gerimis',          icon: '🌦️' };
  if (code <= 67)             return { label: 'Hujan',            icon: '🌧️' };
  if (code <= 77)             return { label: 'Salju',            icon: '❄️' };
  if (code <= 82)             return { label: 'Hujan lebat',      icon: '🌧️' };
  if (code <= 86)             return { label: 'Salju lebat',      icon: '❄️' };
  if (code <= 99)             return { label: 'Badai petir',      icon: '⛈️' };
  return { label: 'N/A', icon: '🌡️' };
};

const DAYS_ID = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];

async function fetchCityWeather(city) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,uv_index` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
    `&timezone=${encodeURIComponent(city.tz)}&forecast_days=4`;

  const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) throw new Error(`Open-Meteo error for ${city.key}: ${resp.status}`);
  const raw = await resp.json();

  const cur = raw.current;
  const daily = raw.daily;

  const forecast = daily.time.slice(1, 4).map((dateStr, i) => {
    const d = new Date(dateStr);
    return {
      day: DAYS_ID[d.getDay()],
      icon: wmoMap(daily.weather_code[i + 1]).icon,
      tempMin: Math.round(daily.temperature_2m_min[i + 1]),
      tempMax: Math.round(daily.temperature_2m_max[i + 1]),
    };
  });

  const uvIndex = Math.round(cur.uv_index ?? 0);
  const uvLabel = uvIndex <= 2 ? 'Rendah' : uvIndex <= 5 ? 'Sedang' : uvIndex <= 7 ? 'Tinggi' : 'Sgt Tinggi';

  return {
    key: city.key,
    name: city.name,
    country: city.country,
    flag: city.flag,
    temp: Math.round(cur.temperature_2m),
    feelsLike: Math.round(cur.apparent_temperature),
    humidity: Math.round(cur.relative_humidity_2m),
    windSpeed: Math.round(cur.wind_speed_10m),
    uvIndex,
    uvLabel,
    weatherCode: cur.weather_code,
    ...wmoMap(cur.weather_code),
    tempMin: Math.round(daily.temperature_2m_min[0]),
    tempMax: Math.round(daily.temperature_2m_max[0]),
    forecast,
  };
}

app.get('/api/weather/cities', authMiddleware, async (req, res) => {
  try {
    const now = Date.now();
    if (weatherCache && (now - weatherCacheTime) < weatherCacheTTL) {
      return res.json({ success: true, data: weatherCache, cached: true });
    }

    // Fetch cities sequentially with small delay to avoid Open-Meteo rate limit (429)
    const results = [];
    const failed = [];
    for (const city of WEATHER_CITIES) {
      try {
        const data = await fetchCityWeather(city);
        results.push(data);
      } catch (err) {
        console.warn(`[Weather] ${city.key} failed: ${err.message}`);
        failed.push(city);
      }
      // Small delay between requests to stay under rate limit
      if (city !== WEATHER_CITIES[WEATHER_CITIES.length - 1]) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    // Retry failed cities once (after a longer pause)
    if (failed.length > 0 && failed.length < WEATHER_CITIES.length) {
      console.warn(`[Weather] Retrying ${failed.length} failed cities...`);
      await new Promise(r => setTimeout(r, 2000));
      for (const city of failed) {
        try {
          const data = await fetchCityWeather(city);
          results.push(data);
          console.log(`[Weather] Retry recovered: ${city.key}`);
        } catch (err) {
          console.warn(`[Weather] Retry still failed: ${city.key} — ${err.message}`);
        }
        await new Promise(r => setTimeout(r, 300));
      }
    }

    // Merge with existing cache: keep stale data for cities still missing
    if (weatherCache && results.length < WEATHER_CITIES.length) {
      const resultKeys = new Set(results.map(r => r.key));
      for (const cached of weatherCache) {
        if (!resultKeys.has(cached.key)) {
          results.push(cached);
        }
      }
    }

    if (results.length === 0) {
      if (weatherCache) {
        return res.json({ success: true, data: weatherCache, cached: true, stale: true });
      }
      return res.status(502).json({ error: 'Gagal mengambil data cuaca dari semua kota' });
    }

    // Use shorter TTL when results are incomplete
    const isComplete = results.length === WEATHER_CITIES.length;
    weatherCache = results;
    weatherCacheTime = now;
    weatherCacheTTL = isComplete ? WEATHER_CACHE_TTL_FULL : WEATHER_CACHE_TTL_PARTIAL;
    res.json({ success: true, data: results, cached: false });
  } catch (err) {
    console.error('[Weather] fetch error:', err.message);
    if (weatherCache) {
      return res.json({ success: true, data: weatherCache, cached: true, stale: true });
    }
    res.status(500).json({ error: 'Gagal mengambil data cuaca' });
  }
});

// ──────────────────────────────────────────────
// Umroh Schedules: Sync from external API → Supabase
// ──────────────────────────────────────────────
const SCHEDULE_YEAR_CODES = ['1448', '1449'];

async function syncUmrohSchedules() {
  console.log('[ScheduleSync] Starting...');
  const startTime = Date.now();
  let totalSynced = 0;

  for (const year of SCHEDULE_YEAR_CODES) {
    try {
      const res = await fetch(`https://jadwal.alhijaz.co/jadwal/api-get/${year}`, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        console.error(`[ScheduleSync] API ${year} HTTP ${res.status}`);
        continue;
      }

      const json = await res.json();
      const packages = json.aaData || [];

      if (!packages.length) {
        console.log(`[ScheduleSync] No packages for year ${year}`);
        continue;
      }

      const rows = packages.map(p => ({
        jadwal_id: p.jadwal_id,
        year_code: year,
        jadwal_nama: p.jadwal_nama,
        promo: p.promo,
        seat_total: p.seat_total,
        seat_sisa: p.seat_sisa,
        maskapai: p.maskapai,
        berangkat_tgl: /^\d{4}-\d{2}-\d{2}$/.test(p.berangkat_tgl) ? p.berangkat_tgl : null,
        berangkat_jam: p.berangkat_jam,
        berangkat_rute: p.berangkat_rute,
        berangkat_kode_penerbangan: p.berangkat_kode_penerbangan,
        pulang_tgl: /^\d{4}-\d{2}-\d{2}$/.test(p.pulang_tgl) ? p.pulang_tgl : null,
        pulang_jam: p.pulang_jam,
        pulang_rute: p.pulang_rute,
        pulang_kode_penerbangan: p.pulang_kode_penerbangan,
        manasik_tgl: p.manasik_tgl,
        manasik_jam: p.manasik_jam,
        brosur: p.brosur,
        itinerary: p.itinerary,
        perlengkapan_harga: p.perlengkapan_harga,
        paket_harga: p.paket_harga,
        paket_hotel: p.paket_hotel,
        synced_at: new Date().toISOString(),
      }));

      // Detect brosur/itinerary URL changes → invalidate CDN URLs
      // External API appends a random token to URLs on each request (e.g. -nSDGrYQ),
      // so strip it before comparing to avoid false "URL changed" detections.
      const stripUrlToken = (url) => url?.replace(/-[A-Za-z0-9]+$/, '') || '';
      const { data: existing } = await supabase
        .from('umroh_schedules')
        .select('jadwal_id, brosur, itinerary, brosur_cdn, itinerary_cdn')
        .eq('year_code', year);
      if (existing?.length) {
        const oldMap = new Map(existing.map(e => [e.jadwal_id, e]));
        for (const row of rows) {
          const old = oldMap.get(row.jadwal_id);
          if (!old) continue;
          if (old.brosur_cdn && stripUrlToken(old.brosur) !== stripUrlToken(row.brosur)) {
            // Source URL changed — delete old file from Bunny, null out CDN URL
            if (getBunnyEnabled()) {
              try { await bunnyDelete(old.brosur_cdn.replace(`https://${BUNNY_CDN_HOSTNAME}/`, '')); } catch {}
            }
            await supabase.from('umroh_schedules').update({ brosur_cdn: null }).eq('jadwal_id', row.jadwal_id).eq('year_code', year);
            console.log(`[ScheduleSync] ${row.jadwal_id}: brosur URL changed, CDN invalidated`);
          }
          if (old.itinerary_cdn && stripUrlToken(old.itinerary) !== stripUrlToken(row.itinerary)) {
            if (getBunnyEnabled()) {
              try { await bunnyDelete(old.itinerary_cdn.replace(`https://${BUNNY_CDN_HOSTNAME}/`, '')); } catch {}
            }
            await supabase.from('umroh_schedules').update({ itinerary_cdn: null }).eq('jadwal_id', row.jadwal_id).eq('year_code', year);
            console.log(`[ScheduleSync] ${row.jadwal_id}: itinerary URL changed, CDN invalidated`);
          }
        }
      }

      const { error } = await supabase
        .from('umroh_schedules')
        .upsert(rows, { onConflict: 'jadwal_id,year_code' });

      if (error) {
        console.error(`[ScheduleSync] Upsert error for year ${year}:`, error.message);
      } else {
        // Delete stale packages no longer in external API
        const currentIds = rows.map(r => r.jadwal_id);
        // First, fetch stale rows to clean up Bunny files
        const { data: staleRows } = await supabase
          .from('umroh_schedules')
          .select('jadwal_id, brosur_cdn, itinerary_cdn')
          .eq('year_code', year)
          .not('jadwal_id', 'in', `(${currentIds.join(',')})`);
        if (staleRows?.length && getBunnyEnabled()) {
          for (const stale of staleRows) {
            try {
              if (stale.brosur_cdn) await bunnyDelete(stale.brosur_cdn.replace(`https://${BUNNY_CDN_HOSTNAME}/`, ''));
              if (stale.itinerary_cdn) await bunnyDelete(stale.itinerary_cdn.replace(`https://${BUNNY_CDN_HOSTNAME}/`, ''));
            } catch (e) { console.error(`[ScheduleSync] Bunny cleanup ${stale.jadwal_id}: ${e.message}`); }
          }
        }
        // Then delete from Supabase
        const { error: delErr, count } = await supabase
          .from('umroh_schedules')
          .delete({ count: 'exact' })
          .eq('year_code', year)
          .not('jadwal_id', 'in', `(${currentIds.join(',')})`);
        if (delErr) {
          console.error(`[ScheduleSync] Cleanup error for year ${year}:`, delErr.message);
        } else if (count > 0) {
          console.log(`[ScheduleSync] Year ${year}: removed ${count} stale packages`);
        }

        totalSynced += rows.length;
        console.log(`[ScheduleSync] Year ${year}: ${rows.length} packages synced`);
      }
    } catch (err) {
      console.error(`[ScheduleSync] Year ${year} failed:`, err.message);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[ScheduleSync] Complete: ${totalSynced} packages in ${elapsed}s`);
}

// ──────────────────────────────────────────────
// Bunny CDN: Sync brosur & itinerary files to Bunny Storage
// ──────────────────────────────────────────────
const BUNNY_STORAGE_API_KEY = process.env.BUNNY_STORAGE_API_KEY;
const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE;
const BUNNY_STORAGE_HOSTNAME = process.env.BUNNY_STORAGE_HOSTNAME || 'storage.bunnycdn.com';
const BUNNY_CDN_HOSTNAME = process.env.BUNNY_CDN_HOSTNAME;

function getBunnyEnabled() {
  return !!(BUNNY_STORAGE_API_KEY && BUNNY_STORAGE_ZONE && BUNNY_CDN_HOSTNAME);
}

async function bunnyFileExists(path) {
  try {
    const res = await fetch(`https://${BUNNY_CDN_HOSTNAME}/${path}`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function bunnyUpload(path, buffer, contentType) {
  const res = await fetch(
    `https://${BUNNY_STORAGE_HOSTNAME}/${BUNNY_STORAGE_ZONE}/${path}`,
    {
      method: 'PUT',
      headers: {
        'AccessKey': BUNNY_STORAGE_API_KEY,
        'Content-Type': contentType || 'application/octet-stream',
      },
      body: buffer,
      signal: AbortSignal.timeout(30000),
    }
  );
  if (!res.ok) throw new Error(`Bunny upload failed: ${res.status} ${res.statusText}`);
}

async function bunnyDelete(path) {
  const res = await fetch(
    `https://${BUNNY_STORAGE_HOSTNAME}/${BUNNY_STORAGE_ZONE}/${path}`,
    {
      method: 'DELETE',
      headers: { 'AccessKey': BUNNY_STORAGE_API_KEY },
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!res.ok && res.status !== 404) throw new Error(`Bunny delete failed: ${res.status}`);
}

async function downloadFile(url) {
  const normalizedUrl = url.replace('http://', 'https://');
  const res = await fetch(normalizedUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  // Extract extension from Content-Disposition or Content-Type
  const disposition = res.headers.get('content-disposition') || '';
  let ext = '';
  const fnMatch = disposition.match(/filename[^;=\n]*=["']?([^"';\n]+)/i);
  if (fnMatch) {
    const dotIdx = fnMatch[1].lastIndexOf('.');
    if (dotIdx > 0) ext = fnMatch[1].substring(dotIdx);
  }
  if (!ext) {
    if (contentType.includes('pdf')) ext = '.pdf';
    else if (contentType.includes('webp')) ext = '.webp';
    else if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg';
    else if (contentType.includes('png')) ext = '.png';
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType, ext };
}

async function syncFilesToBunny() {
  if (!getBunnyEnabled()) {
    console.log('[BunnySync] Skipped — Bunny credentials not configured');
    return;
  }

  console.log('[BunnySync] Starting...');
  const startTime = Date.now();
  let uploaded = 0, skipped = 0, errors = 0;

  const { data: packages, error } = await supabase
    .from('umroh_schedules')
    .select('jadwal_id, year_code, brosur, itinerary, brosur_cdn, itinerary_cdn');

  if (error || !packages?.length) {
    console.log('[BunnySync] No packages to sync');
    return;
  }

  for (const pkg of packages) {
    // Sync brosur
    if (pkg.brosur && !pkg.brosur_cdn) {
      try {
        const { buffer, contentType, ext } = await downloadFile(pkg.brosur);
        const path = `brosur/${pkg.jadwal_id}${ext || '.webp'}`;
        await bunnyUpload(path, buffer, contentType);
        const cdnUrl = `https://${BUNNY_CDN_HOSTNAME}/${path}`;
        await supabase
          .from('umroh_schedules')
          .update({ brosur_cdn: cdnUrl })
          .eq('jadwal_id', pkg.jadwal_id)
          .eq('year_code', pkg.year_code);
        uploaded++;
      } catch (err) {
        console.error(`[BunnySync] Brosur ${pkg.jadwal_id}: ${err.message}`);
        errors++;
      }
    } else if (pkg.brosur_cdn && pkg.brosur) {
      // Check if source URL changed (itinerary updated)
      const expectedSlug = pkg.brosur.split('/').pop();
      const cachedSlug = pkg.brosur_cdn.split('/').pop().replace(/\.[^.]+$/, '');
      if (cachedSlug !== pkg.jadwal_id) {
        // CDN filename always uses jadwal_id, so check if origin URL changed
        // by re-downloading and re-uploading
        skipped++;
      } else {
        skipped++;
      }
    } else {
      skipped++;
    }

    // Sync itinerary
    if (pkg.itinerary && !pkg.itinerary_cdn) {
      try {
        const { buffer, contentType, ext } = await downloadFile(pkg.itinerary);
        const path = `itinerary/${pkg.jadwal_id}${ext || '.pdf'}`;
        await bunnyUpload(path, buffer, contentType);
        const cdnUrl = `https://${BUNNY_CDN_HOSTNAME}/${path}`;
        await supabase
          .from('umroh_schedules')
          .update({ itinerary_cdn: cdnUrl })
          .eq('jadwal_id', pkg.jadwal_id)
          .eq('year_code', pkg.year_code);
        uploaded++;
      } catch (err) {
        console.error(`[BunnySync] Itinerary ${pkg.jadwal_id}: ${err.message}`);
        errors++;
      }
    } else {
      skipped++;
    }

    // Small delay to avoid hammering origin server
    if (uploaded > 0 && uploaded % 5 === 0) await new Promise(r => setTimeout(r, 1000));
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[BunnySync] Complete: ${uploaded} uploaded, ${skipped} skipped, ${errors} errors in ${elapsed}s`);
}

// ──────────────────────────────────────────────
// Bunny CDN: Cleanup expired & stale files
// ──────────────────────────────────────────────
async function cleanupExpiredPackages() {
  if (!getBunnyEnabled()) return;

  console.log('[BunnyCleanup] Checking for expired packages...');
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const cutoffDate = sixMonthsAgo.toISOString().split('T')[0];

  const { data: expired, error } = await supabase
    .from('umroh_schedules')
    .select('jadwal_id, year_code, brosur_cdn, itinerary_cdn')
    .lt('berangkat_tgl', cutoffDate);

  if (error || !expired?.length) {
    if (!error) console.log('[BunnyCleanup] No expired packages');
    return;
  }

  let deleted = 0;
  for (const pkg of expired) {
    try {
      // Delete files from Bunny
      if (pkg.brosur_cdn) {
        const path = pkg.brosur_cdn.replace(`https://${BUNNY_CDN_HOSTNAME}/`, '');
        await bunnyDelete(path);
      }
      if (pkg.itinerary_cdn) {
        const path = pkg.itinerary_cdn.replace(`https://${BUNNY_CDN_HOSTNAME}/`, '');
        await bunnyDelete(path);
      }

      // Delete row from Supabase
      await supabase
        .from('umroh_schedules')
        .delete()
        .eq('jadwal_id', pkg.jadwal_id)
        .eq('year_code', pkg.year_code);

      deleted++;
    } catch (err) {
      console.error(`[BunnyCleanup] ${pkg.jadwal_id}: ${err.message}`);
    }
  }

  console.log(`[BunnyCleanup] Removed ${deleted} expired packages (> 6 months past departure)`);
}

// ──────────────────────────────────────────────
// API: Read schedules from Supabase (with external API fallback)
// ──────────────────────────────────────────────
app.get('/api/schedules/:yearCode', async (req, res) => {
  const yearCode = req.params.yearCode;

  if (!/^\d{4}$/.test(yearCode)) {
    return res.status(400).json({ status: 'error', error: 'Invalid year code' });
  }

  try {
    const { data, error } = await supabase
      .from('umroh_schedules')
      .select('*')
      .eq('year_code', yearCode)
      .order('berangkat_tgl', { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      throw new Error('No data in Supabase');
    }

    const aaData = data.map(row => {
      const out = { ...row };
      // Use CDN URLs when available, then remove CDN-specific fields
      if (out.brosur_cdn) out.brosur = out.brosur_cdn;
      if (out.itinerary_cdn) out.itinerary = out.itinerary_cdn;
      delete out.brosur_cdn;
      delete out.itinerary_cdn;
      delete out.synced_at;
      delete out.year_code;
      // Coalesce nulls to empty strings for TEXT fields (frontend expects strings, not null)
      for (const key of Object.keys(out)) {
        if (out[key] === null && key !== 'paket_harga' && key !== 'paket_hotel') {
          out[key] = '';
        }
      }
      return out;
    });

    res.json({
      status: 'ok',
      iTotalDisplayRecords: aaData.length,
      aaData,
    });
  } catch (err) {
    console.error(`[Schedules] Supabase error: ${err.message}, falling back to external API`);
    try {
      const extRes = await fetch(
        `https://jadwal.alhijaz.co/jadwal/api-get/${yearCode}`,
        { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }, signal: AbortSignal.timeout(10000) }
      );
      if (!extRes.ok) throw new Error(`External API returned ${extRes.status}`);
      const extData = await extRes.text();
      res.set('Content-Type', 'application/json').send(extData);
    } catch (extErr) {
      res.status(500).json({ status: 'error', error: 'Both Supabase and external API failed' });
    }
  }
});

// ──────────────────────────────────────────────
// API: Proxy to jadwal.alhijaz.co
// ──────────────────────────────────────────────
app.all('/api/{*path}', async (req, res) => {
  const path = req.path.replace(/^\/api\//, ''); // everything after /api/
  const targetUrl = `https://jadwal.alhijaz.co/jadwal/${path}`;

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      ...(req.method === 'POST' ? { body: JSON.stringify(req.body) } : {}),
    });

    const data = await response.text();
    res.set({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=60',
    }).status(response.status).send(data);
  } catch (error) {
    res.status(500).json({ error: 'Proxy error', message: error.message });
  }
});

// ──────────────────────────────────────────────
// Proxy: itinerary & brosur files (with timeout + retry)
// ──────────────────────────────────────────────
async function fetchWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

app.get(['/itinerary/{*path}', '/brosur/{*path}'], async (req, res) => {
  const targetUrl = `https://jadwal.alhijaz.co${req.path}`;

  // Try up to 2 times (initial + 1 retry)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetchWithTimeout(targetUrl, 15000);
      if (!response.ok) {
        if (attempt === 0 && response.status >= 500) continue; // retry on server error
        return res.sendStatus(response.status);
      }

      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      res.set('Content-Type', contentType);
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Cache-Control', 'public, max-age=3600'); // cache 1 hour

      const buffer = Buffer.from(await response.arrayBuffer());
      return res.send(buffer);
    } catch (error) {
      if (attempt === 0) {
        console.warn(`[Proxy] Attempt 1 failed for ${req.path}: ${error.message}, retrying...`);
        continue;
      }
      console.error(`[Proxy] All attempts failed for ${req.path}:`, error.message);
      return res.status(502).json({ error: 'File gagal dimuat', message: 'Server sumber tidak merespon, silakan coba lagi.' });
    }
  }
});

// ──────────────────────────────────────────────
// Landing Page: /:slug/umroh
// ──────────────────────────────────────────────
app.get('/:slug/umroh', async (req, res) => {
  const slug = req.params.slug.toLowerCase();
  try {
    const mod = await import('./functions/umroh-landing.mjs');
    const result = await mod.onRequest({
      params: { slug },
      request: new Request(`http://localhost${req.url}`),
    });
    const html = await result.text();
    res.set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    }).send(html);
  } catch (err) {
    console.error('Umroh landing error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// ──────────────────────────────────────────────
// Haji Plus: Scrape + Sync + API
// ──────────────────────────────────────────────

let hajiPlusCache = null;

async function scrapeHajiPlusData() {
  const cheerio = await import('cheerio');
  const url = 'https://alhijazindowisata.com/jadwal/grafik-haji-khusus/alhijaz-indowisata';

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  // Row 0: <th>TAHUN</th><th>2026</th>... (years in th)
  // Row 1: <th>JUMLAH</th><td>482</td>... (pax in td)
  const rows = $('table tr');
  if (rows.length < 2) throw new Error('Table structure changed');

  const years = [];
  const paxes = [];

  rows.eq(0).find('th, td').each((_, el) => {
    const text = $(el).text().trim();
    if (/^\d{4}$/.test(text)) years.push(parseInt(text));
  });

  rows.eq(1).find('td').each((_, el) => {
    const text = $(el).text().trim().replace(/[^\d]/g, '');
    if (text) paxes.push(parseInt(text));
  });

  if (years.length === 0 || years.length !== paxes.length) {
    throw new Error(`Parse mismatch: ${years.length} years, ${paxes.length} pax values`);
  }

  return years.map((year, i) => ({ year, pax: paxes[i] }));
}

async function syncHajiPlusData() {
  try {
    console.log('[HajiPlus] Syncing data...');
    const data = await scrapeHajiPlusData();

    const { error } = await supabase
      .from('haji_plus_stats')
      .upsert({
        id: 'current',
        data: data,
        synced_at: new Date().toISOString(),
      });

    if (error) throw error;

    // Update in-memory cache
    hajiPlusCache = { data, synced_at: new Date().toISOString() };
    console.log(`[HajiPlus] Synced: ${data.length} years, total ${data.reduce((s, d) => s + d.pax, 0)} pax`);
  } catch (err) {
    console.error('[HajiPlus] Sync failed:', err.message);
  }
}

async function getHajiPlusData() {
  if (hajiPlusCache) return hajiPlusCache;

  // Fallback to Supabase
  try {
    const { data, error } = await supabase
      .from('haji_plus_stats')
      .select('*')
      .eq('id', 'current')
      .single();

    if (!error && data) {
      hajiPlusCache = { data: data.data, synced_at: data.synced_at };
      return hajiPlusCache;
    }
    console.log('[HajiPlus] DB fallback: no data or error:', error?.message);
  } catch (err) {
    console.error('[HajiPlus] getHajiPlusData exception:', err.message);
  }

  return null;
}

// ============================
// Sentry error handler — HARUS setelah semua routes
// dan SEBELUM custom error handler lainnya
// ============================
Sentry.setupExpressErrorHandler(app);

// Fallback error handler (setelah Sentry)
app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ──────────────────────────────────────────────
// Static files + SPA fallback with OG injection
// ──────────────────────────────────────────────
const distPath = resolve(__dirname, 'dist');
const publicPath = resolve(__dirname, 'public');

// Serve static assets from dist/ first, then fallback to public/
// This ensures uploaded files (e.g. agent photos in public/agents/)
// are always accessible, even if they were added after the last build.
app.use(express.static(distPath));
app.use(express.static(publicPath));

// Airline code → name mapping untuk OG meta
const AIRLINE_NAMES_SERVER = {
  GA: 'Garuda Indonesia', SV: 'Saudia', EK: 'Emirates', QR: 'Qatar Airways',
  TK: 'Turkish Airlines', SQ: 'Singapore Airlines', MH: 'Malaysia Airlines',
  OD: 'Batik Air', JT: 'Lion Air', QG: 'Citilink', ID: 'Super Air Jet',
  IW: 'Wings Air', IN: 'NAM Air', KD: 'Kal Star Aviation',
};

// OG meta injection untuk flight share pages (harus SEBELUM SPA catch-all)
app.get('/f/:code', async (req, res, next) => {
  try {
    const { code } = req.params;

    const { data: share } = await supabase
      .from('flight_shares')
      .select('flight_number, flight_date, dep_iata, arr_iata, dep_city, arr_city, agent_slug, airline_code')
      .eq('code', code)
      .single();

    if (!share) return next(); // fallback ke SPA

    // Ambil nama agent
    const { data: agent } = await supabase
      .from('agents')
      .select('name')
      .eq('slug', share.agent_slug)
      .single();

    const agentName = agent?.name || 'Agent';
    const airlineName = AIRLINE_NAMES_SERVER[share.airline_code] || '';
    const flightNum = share.flight_number.replace(/^([A-Z]{2})(\d+)$/, '$1 $2');

    const title = `Lacak Penerbangan ${airlineName ? airlineName + ' ' : ''}${flightNum} - ${agentName}`;
    const description = `Status penerbangan ${share.flight_number} dari ${share.dep_city || share.dep_iata} ke ${share.arr_city || share.arr_iata}. Dikelola oleh ${agentName} — Alhijaz Indowisata.`;
    const ogImageUrl = `${req.protocol}://${req.get('host')}/og/${share.agent_slug}.png`;

    const indexPath = resolve(distPath, 'index.html');
    let html = readFileSync(indexPath, 'utf-8');

    // Replace existing <title>
    html = html.replace(/<title>[^<]*<\/title>/i, `<title>${title}</title>`);

    // Replace existing <meta name="description">
    html = html.replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="description" content="${description}" />`
    );

    // Remove existing OG tags
    html = html.replace(/<meta\s+property="og:[^"]*"\s+content="[^"]*"\s*\/?>\s*/gi, '');

    const metaTags = `
      <meta property="og:title" content="${title}" />
      <meta property="og:description" content="${description}" />
      <meta property="og:type" content="website" />
      <meta property="og:url" content="https://alhijaz.co/f/${code}" />
      <meta property="og:site_name" content="Alhijaz Indowisata" />
      <meta property="og:image" content="${ogImageUrl}" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="${title}" />
      <meta name="twitter:description" content="${description}" />
      <meta name="twitter:image" content="${ogImageUrl}" />
    `;

    // Inject sebelum </head>
    html = html.replace('</head>', `${metaTags}\n</head>`);

    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    console.error('[FlightShare] OG injection error:', err.message);
    next(); // fallback ke SPA
  }
});

// SPA fallback — inject OG tags for agent slugs
app.get('{*path}', async (req, res) => {
  const indexPath = resolve(distPath, 'index.html');
  let html = readFileSync(indexPath, 'utf-8');

  // Extract slug
  const slug = req.path.replace(/^\/+/, '').split('/')[0].toLowerCase();
  const agent = await getAgent(slug);

  if (agent) {
    const newTitle = `Jadwal Umroh Alhijaz | ${agent.name}`;
    const newDescription = `Dapatkan info lengkap paket umrah Alhijaz Indowisata bersama ${agent.name}. Klik untuk konsultasi via WhatsApp.`;
    const pageUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const ogImageUrl = `${req.protocol}://${req.get('host')}/og/${slug}.png`;

    // Replace <title>
    html = html.replace(/<title>[^<]*<\/title>/i, `<title>${newTitle}</title>`);

    // Replace <meta name="description">
    html = html.replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="description" content="${newDescription}" />`
    );

    // Remove existing OG tags
    html = html.replace(/<meta\s+property="og:[^"]*"\s+content="[^"]*"\s*\/?>\s*/gi, '');

    // Inject OG + Twitter tags
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
    html = html.replace('</head>', `${metaTags}</head>`);

    // Inject agent card_variant so the SPA can read it without waiting for Supabase
    if (agent.card_variant && agent.card_variant !== 'default') {
      html = html.replace('<body', `<body data-agent-card-variant="${agent.card_variant}"`);
    }
  }

  res.set('Content-Type', 'text/html');
  res.send(html);
});

app.listen(PORT, () => {
  console.log(`🚀 Alhijaz server running on http://localhost:${PORT}`);
  initNotifier();
});

// ── Keep Supabase alive (prevent free-tier pausing) ──
const KEEP_ALIVE_INTERVAL = 3 * 24 * 60 * 60 * 1000; // 3 hari

async function pingSupabase() {
  try {
    const { count } = await supabase
      .from('agents')
      .select('*', { count: 'exact', head: true });
    console.log(`[Keep-Alive] ✅ Supabase ping OK — ${count} agents (${new Date().toISOString()})`);
  } catch (err) {
    console.warn('[Keep-Alive] ⚠️ Supabase ping failed:', err.message);
  }
}

// Ping once on startup (after 30s delay), then every 3 days
setTimeout(pingSupabase, 30 * 1000);
setInterval(pingSupabase, KEEP_ALIVE_INTERVAL);

// ── Background Sync Job: sync all agents every 1 hour ──
// Uses the same monthly-chunk strategy as manual sync to avoid timeouts
async function syncOneAgent(agent) {
  const slug = agent.slug;
  // Skip if ANY sync (manual or background) is already running for this agent
  const state = syncingAgents.get(slug);
  if (state?.isSyncing) {
    console.log(`[SYNC] Skipping ${slug} — already syncing`);
    return;
  }

  syncingAgents.set(slug, { isSyncing: true, background: true, totalSynced: 0, lastSync: null, startedAt: Date.now(), username: agent.jamaah_username });

  try {
    // Force fresh session for each background sync (skip remote logout to avoid rate-limiting)
    await laporanDisconnect(agent.jamaah_username, { skipRemoteLogout: true });
    const decrypted = capiDecrypt(agent.jamaah_password);
    const loginResult = await laporanLogin(agent.jamaah_username, decrypted, agent.jamaah_kantor || '2');
    if (!loginResult.success) {
      console.error(`[SYNC] ${slug}: login failed — ${loginResult.error || 'unknown reason'}`);
      const rateLimited = loginResult.reason === 'rate_limited';
      syncingAgents.set(slug, { isSyncing: false, totalSynced: 0, lastSync: null, loginFailed: true, rateLimited });
      return;
    }

    const syncTime = new Date().toISOString();
    let totalSynced = 0;

    // ── PHASE 1: Fast scan via umrah list + detail pages ──
    // Captures ALL jamaah including calon (belum DP), plus staf names
    let bookingStafMap = new Map();
    let bookingTglDaftarMap = new Map();
    try {
      const ringkasanRes = await fetchUmrahBookings(agent.jamaah_username);
      const bookings = ringkasanRes.success ? (ringkasanRes.bookings || []) : [];
      if (!ringkasanRes.success) {
        console.warn(`[SYNC] ${slug}: Phase 1 fetchUmrahBookings failed — ${ringkasanRes.error || 'unknown'}`);
      }

      if (bookings.length > 0) {
        const bookingPaketMap = new Map();
        for (const b of bookings) {
          bookingPaketMap.set(b.id_umroh, b.paket);
          if (b.staf) bookingStafMap.set(b.id_umroh, b.staf);
          if (b.tgl_daftar) bookingTglDaftarMap.set(b.id_umroh, b.tgl_daftar);
        }

        const uniqueIds = [...new Set(bookings.map(b => b.id_umroh))];
        const DETAIL_PARALLEL = 5;
        const bgGlobalKeys = new Set();

        for (let i = 0; i < uniqueIds.length; i += DETAIL_PARALLEL) {
          const batch = uniqueIds.slice(i, i + DETAIL_PARALLEL);
          const results = await Promise.allSettled(
            batch.map(id => fetchUmrahDetail(agent.jamaah_username, id))
          );

          const rowsToUpsert = [];
          for (let j = 0; j < results.length; j++) {
            if (results[j].status !== 'fulfilled') continue;
            const result = results[j].value;
            if (!result.success || !result.items?.length) continue;
            const idUmroh = batch[j];

            for (const item of result.items) {
              // Determine hijriah year: use actual date first, null if unknown
              // (existing DB value is preserved in the merge step below)
              const computedYear = getHijriahYear(item.tgl_berangkat);
              const itemYear = computedYear || null;
              if (itemYear && Number(itemYear) < 1447) continue;
              item.paket = item.paket || bookingPaketMap.get(idUmroh) || null;
              rowsToUpsert.push({
                agent_slug: slug,
                id_umroh: item.id_umroh,
                nama: item.nama,
                jk: item.jk || null,
                paket: item.paket || null,
                bayar: item.bayar || 0,
                sisa: item.sisa || 0,
                tgl_berangkat: item.tgl_berangkat || null,
                tgl_daftar: bookingTglDaftarMap.get(idUmroh) || null,
                hijriah_year: itemYear,
                raw_data: { ...item.raw_data, staf: bookingStafMap.get(idUmroh) || null },
                synced_at: syncTime,
              });
            }
          }

          if (rowsToUpsert.length > 0) {
            const deduped = new Map();
            for (const row of rowsToUpsert) {
              const key = `${row.agent_slug}_${row.id_umroh}_${row.nama}`.toLowerCase();
              bgGlobalKeys.add(key);
              deduped.set(key, row);
            }
            const dedupedRows = Array.from(deduped.values());

            // Fetch existing records to preserve Phase 2 enrichment data
            const existingNames = dedupedRows.map(r => r.nama);
            const { data: existingRows } = await supabase
              .from('jamaah')
              .select('id_umroh, nama, wa, tgl_lahir, perlengkapan, dokumen, no_paspor, paspor_expired, hijriah_year')
              .eq('agent_slug', slug)
              .in('nama', existingNames);
            const existingLookup = {};
            (existingRows || []).forEach(r => {
              existingLookup[`${r.id_umroh}_${r.nama}`.toLowerCase()] = r;
            });

            // Merge: preserve enrichment fields from existing records
            for (const row of dedupedRows) {
              const existing = existingLookup[`${row.id_umroh}_${row.nama}`.toLowerCase()];
              if (existing) {
                // Preserve Phase 2 enrichment — don't overwrite with null/empty
                row.wa = existing.wa || null;
                row.tgl_lahir = existing.tgl_lahir || null;
                row.perlengkapan = (existing.perlengkapan && Object.keys(existing.perlengkapan).length > 0) ? existing.perlengkapan : {};
                row.dokumen = (existing.dokumen && Object.keys(existing.dokumen).length > 0) ? existing.dokumen : {};
                row.no_paspor = existing.no_paspor || null;
                row.paspor_expired = existing.paspor_expired || null;
                // Preserve hijriah_year if Phase 1 can't determine it but DB has it
                if (!row.hijriah_year && existing.hijriah_year) {
                  row.hijriah_year = existing.hijriah_year;
                }
                // Default to 1447 only if neither Phase 1 nor DB has a year
                if (!row.hijriah_year) row.hijriah_year = '1447';
              } else {
                // New record — set enrichment fields to defaults
                row.wa = null;
                row.tgl_lahir = null;
                row.perlengkapan = {};
                row.dokumen = {};
                row.no_paspor = null;
                row.paspor_expired = null;
                // Default to 1447 for truly new jamaah without date
                if (!row.hijriah_year) row.hijriah_year = '1447';
              }
            }

            const BATCH = 50;
            for (let b = 0; b < dedupedRows.length; b += BATCH) {
              const upsertBatch = dedupedRows.slice(b, b + BATCH);
              const { error } = await supabase.from('jamaah').upsert(upsertBatch, { onConflict: 'agent_slug,id_umroh,nama' });
              if (error) console.error(`[SYNC] ${slug} Phase 1 upsert error:`, error.message);
            }
          }
        }
        // Query actual DB count for accurate number
        const { count: bgActualCount } = await supabase
          .from('jamaah')
          .select('*', { count: 'exact', head: true })
          .eq('agent_slug', slug);
        totalSynced = bgActualCount || bgGlobalKeys.size;
        console.log(`[SYNC] ${slug}: Phase 1 — ${bgGlobalKeys.size} processed, ${bgActualCount} in DB`);

        // Cleanup: delete jamaah that no longer exist in internal system
        // Phase 1 fetches the complete jamaah list — anything not upserted is stale
        const { data: bgDeleted, error: bgDelErr } = await supabase
          .from('jamaah')
          .delete()
          .eq('agent_slug', slug)
          .lt('synced_at', syncTime)
          .select('nama');
        if (bgDelErr) console.error(`[SYNC] ${slug} cleanup error:`, bgDelErr.message);
        else if (bgDeleted?.length > 0) {
          console.log(`[SYNC] ${slug}: removed ${bgDeleted.length} stale jamaah: ${bgDeleted.map(d => d.nama).join(', ')}`);
          totalSynced -= bgDeleted.length;
        }
      }
    } catch (p1err) {
      console.error(`[SYNC] ${slug} Phase 1 error:`, p1err.message);
    }

    // ── PHASE 2: Enrichment via laporan (adds wa, tgl_lahir, perlengkapan, etc.) ──
    // Merge year ranges + split into monthly chunks (same as manual sync)
    const yearsToSync = getActiveHijriahYears();
    const allRanges = yearsToSync.map(y => HIJRIAH_YEARS[y]).filter(Boolean)
      .sort((a, b) => a.tglAwal.localeCompare(b.tglAwal));
    const merged = [];
    for (const r of allRanges) {
      const last = merged[merged.length - 1];
      if (last && r.tglAwal <= last.tglAkhir) {
        if (r.tglAkhir > last.tglAkhir) last.tglAkhir = r.tglAkhir;
      } else {
        merged.push({ tglAwal: r.tglAwal, tglAkhir: r.tglAkhir });
      }
    }
    function bgSplitRange(tglAwal, tglAkhir) {
      const chunks = [];
      let start = new Date(tglAwal);
      const end = new Date(tglAkhir);
      while (start <= end) {
        const chunkEnd = new Date(start);
        chunkEnd.setDate(chunkEnd.getDate() + 6); // 7-day chunks — less data per request = faster PHP response
        const actualEnd = chunkEnd > end ? end : chunkEnd;
        chunks.push({ tglAwal: start.toISOString().split('T')[0], tglAkhir: actualEnd.toISOString().split('T')[0] });
        start = new Date(actualEnd);
        start.setDate(start.getDate() + 1);
      }
      return chunks;
    }

    // Cap at 2 months into the future, sort newest-first
    const bgToday = new Date();
    const bgFutureCap = new Date(bgToday);
    bgFutureCap.setMonth(bgFutureCap.getMonth() + 2);
    const bgFutureCapStr = bgFutureCap.toISOString().split('T')[0];
    const bgTodayStr = bgToday.toISOString().split('T')[0];
    for (const span of merged) {
      if (span.tglAkhir > bgFutureCapStr) span.tglAkhir = bgFutureCapStr;
    }
    const bgAllChunks = [];
    for (const span of merged) {
      if (span.tglAwal > bgFutureCapStr) continue;
      bgAllChunks.push(...bgSplitRange(span.tglAwal, span.tglAkhir));
    }
    bgAllChunks.sort((a, b) => {
      const aIsNow = a.tglAwal <= bgTodayStr && a.tglAkhir >= bgTodayStr;
      const bIsNow = b.tglAwal <= bgTodayStr && b.tglAkhir >= bgTodayStr;
      if (aIsNow && !bIsNow) return -1;
      if (!aIsNow && bIsNow) return 1;
      return Math.abs(new Date(a.tglAwal) - bgToday) - Math.abs(new Date(b.tglAwal) - bgToday);
    });
    const fetchJobs = bgAllChunks;
    console.log(`[SYNC] ${slug}: ${fetchJobs.length} chunks (7-day, capped at ${bgFutureCapStr})`);

    // Fetch existing bayar data ONCE before sync for payment detection
    // Only future departures — we don't care about payment changes for past jamaah
    const { data: existingData } = await supabase
      .from('jamaah')
      .select('id_umroh, nama, bayar')
      .eq('agent_slug', slug)
      .gte('tgl_berangkat', bgTodayStr);
    const existingMap = {};
    (existingData || []).forEach(j => { existingMap[`${j.id_umroh}_${j.nama}`] = j.bayar || 0; });

    const kantor = agent.jamaah_kantor || '2';
    let networkFailures = 0;
    let timeoutCount = 0;
    const PARALLEL = 2; // 2 concurrent fetches — safe with built-in retry in fetchLaporan

    for (let i = 0; i < fetchJobs.length; i += PARALLEL) {
      if (networkFailures >= 3) {
        console.log(`[SYNC] ${slug}: aborting — server unreachable (${networkFailures} network failures)`);
        break;
      }

      const batch = fetchJobs.slice(i, i + PARALLEL);
      const results = await Promise.allSettled(
        batch.map(job => fetchLaporan(agent.jamaah_username, {
          kantor, agentId: agent.jamaah_username,
          tglAwal: job.tglAwal, tglAkhir: job.tglAkhir,
        }))
      );

      for (let j = 0; j < results.length; j++) {
        const job = batch[j];
        const result = results[j].status === 'fulfilled'
          ? results[j].value
          : { success: false, reason: 'unknown', error: results[j].reason?.message };

        if (!result.success) {
          console.log(`[SYNC] ${slug} range ${job.tglAwal}: ${result.error} (${result.reason || 'unknown'})`);
          if (result.reason === 'session_expired') {
            await laporanDisconnect(agent.jamaah_username, { skipRemoteLogout: true });
            await laporanLogin(agent.jamaah_username, decrypted, kantor);
          } else if (result.reason === 'network') {
            networkFailures++;
          } else if (result.reason === 'timeout') {
            timeoutCount++;
          }
          continue;
        }

        // Success
        networkFailures = 0;
        const { items } = parseLaporanHtml(result.html);
        console.log(`[SYNC] ${slug} range ${job.tglAwal}: ${items.length} items`);
        if (items.length === 0) continue;

        const allNewRows = [];
        const BATCH = 50;
        for (let b = 0; b < items.length; b += BATCH) {
          const batchItems = items.slice(b, b + BATCH);
          const rows = buildRows(batchItems, slug, syncTime);
          // Preserve Phase 1 data that Phase 2 might not have
          for (const row of rows) {
            const staf = bookingStafMap?.get(row.id_umroh);
            if (staf) row.raw_data = { ...(row.raw_data || {}), staf };
            if (!row.tgl_daftar) {
              row.tgl_daftar = bookingTglDaftarMap?.get(row.id_umroh) || null;
            }
          }
          allNewRows.push(...rows);
          const { error } = await supabase
            .from('jamaah')
            .upsert(rows, { onConflict: 'agent_slug,id_umroh,nama' });
          if (error) console.error(`[SYNC] ${slug} range ${job.tglAwal} batch error:`, error.message);
          totalSynced += batchItems.length;
          syncingAgents.set(slug, { isSyncing: true, background: true, totalSynced, lastSync: syncTime });
        }

        // Detect pembayaran masuk (only for jamaah departing in the future)
        // Use 7-day buffer to avoid false positives from Phase 1/Phase 2 bayar discrepancies
        // near departure date
        const bgCutoffDate = new Date(bgToday);
        bgCutoffDate.setDate(bgCutoffDate.getDate() + 7);
        const bgCutoffStr = bgCutoffDate.toISOString().split('T')[0];
        const pembayaranBaru = [];
        for (const row of allNewRows) {
          const key = `${row.id_umroh}_${row.nama}`;
          if (!(key in existingMap)) continue;
          // Skip if no departure date — can't verify if still relevant
          if (!row.tgl_berangkat) continue;
          // Skip past departures and those departing within 7 days
          // (old data may have bayar discrepancies between Phase 1 and Phase 2)
          if (row.tgl_berangkat < bgCutoffStr) continue;
          const bayarBefore = existingMap[key];
          const bayarAfter = row.bayar || 0;
          if (bayarAfter > bayarBefore) {
            pembayaranBaru.push({
              nama: row.nama,
              jumlah: bayarAfter - bayarBefore,
              totalBayar: bayarAfter,
              sisa: row.sisa || 0,
              isLunas: !row.sisa || row.sisa === 0,
            });
          }
        }
        if (pembayaranBaru.length > 0) {
          notifyPembayaranMasuk(slug, pembayaranBaru).catch(e =>
            console.error(`[SYNC] ${slug}: pembayaran notif error:`, e.message)
          );
        }

        // Fire CAPI Purchase for jamaah with increased payments
        try {
          const capiRows = allNewRows.filter(row => {
            const key = `${row.id_umroh}_${row.nama}`;
            return (key in existingMap) && (row.bayar || 0) > 0 && (row.bayar || 0) > existingMap[key];
          });
          if (capiRows.length > 0) {
            for (const row of capiRows) {
              fireCapiPurchase(slug, row);
            }
            for (const row of capiRows) {
              await supabase.from('jamaah')
                .update({ capi_last_bayar: row.bayar })
                .eq('agent_slug', slug).eq('id_umroh', row.id_umroh).eq('nama', row.nama);
            }
            console.log(`[CAPI] Updated capi_last_bayar for ${capiRows.length} jamaah (${slug})`);
          }
        } catch (capiErr) {
          console.error(`[CAPI] Background sync Purchase error:`, capiErr.message);
        }
      }
    }

    if (timeoutCount > 0) {
      console.log(`[SYNC] ${slug}: ${timeoutCount}/${fetchJobs.length} ranges timed out (after retries)`);
    }

    console.log(`[SYNC] ${slug}: total ${totalSynced} umroh synced`);

    // ── Haji sync (reuse same session) ──
    try {
      const sessionCookies = getSessionCookie(agent.jamaah_username);
      if (sessionCookies) {
        const hajiList = await fetchHajiList(sessionCookies);
        const uniqueIds = [...new Set(hajiList.map(h => h.id_haji))];
        console.log(`[SYNC] ${slug}: found ${uniqueIds.length} unique haji entries`);

        if (uniqueIds.length > 0) {
          const HAJI_BATCH = 5;
          let hajiSynced = 0;
          const allHajiRows = [];

          for (let i = 0; i < uniqueIds.length; i += HAJI_BATCH) {
            const batch = uniqueIds.slice(i, i + HAJI_BATCH);
            const results = await Promise.allSettled(
              batch.map(async (idHaji) => {
                const details = await fetchHajiDetail(sessionCookies, idHaji);
                const listEntry = hajiList.find(h => h.id_haji === idHaji);
                return details.map(detail => ({
                  agent_slug: slug,
                  id_haji: idHaji,
                  id_jamaah: detail.id_jamaah,
                  nama: detail.nama,
                  jk: detail.jk,
                  alamat: detail.alamat,
                  telp: detail.telp,
                  thn_hijriyah: listEntry.thn_hijriyah,
                  thn_masehi: listEntry.thn_masehi,
                  perwakilan: listEntry.perwakilan,
                  marketing: listEntry.marketing,
                  paket: listEntry.paket,
                  staff: listEntry.staff,
                  jenis: listEntry.jenis,
                  status_bayar: detail.status_bayar,
                  status_berangkat: detail.status_berangkat,
                  bpih_url: detail.bpih_url,
                  surat_pernyataan_url: detail.surat_pernyataan_url,
                  synced_at: syncTime,
                }));
              })
            );
            for (const r of results) {
              if (r.status === 'fulfilled') allHajiRows.push(...r.value);
            }

            // Upsert in batches of 50
            if (allHajiRows.length >= 50 || i + HAJI_BATCH >= uniqueIds.length) {
              if (allHajiRows.length > 0) {
                const { error: hajiErr } = await supabase
                  .from('jamaah_haji')
                  .upsert(allHajiRows, { onConflict: 'agent_slug,id_haji,id_jamaah' });
                if (hajiErr) console.error(`[SYNC] ${slug} haji batch error:`, hajiErr.message);
                hajiSynced += allHajiRows.length;
                allHajiRows.length = 0;
              }
            }

            // Small delay between batches
            if (i + HAJI_BATCH < uniqueIds.length) await new Promise(r => setTimeout(r, 100));
          }
          console.log(`[SYNC] ${slug}: ${hajiSynced} haji jamaah synced`);

          // Cleanup: delete haji jamaah that no longer exist in internal system
          const { data: hajiDeleted, error: hajiDelErr } = await supabase
            .from('jamaah_haji')
            .delete()
            .eq('agent_slug', slug)
            .lt('synced_at', syncTime)
            .select('nama');
          if (hajiDelErr) console.error(`[SYNC] ${slug} haji cleanup error:`, hajiDelErr.message);
          else if (hajiDeleted?.length > 0) {
            console.log(`[SYNC] ${slug}: removed ${hajiDeleted.length} stale haji jamaah: ${hajiDeleted.map(d => d.nama).join(', ')}`);
          }
        }
      }
    } catch (hajiErr) {
      console.error(`[SYNC] ${slug} haji error:`, hajiErr.message);
      // Don't fail the whole sync if haji fails
    }

    // Query final actual DB count
    const { count: finalCount } = await supabase
      .from('jamaah')
      .select('*', { count: 'exact', head: true })
      .eq('agent_slug', slug);
    syncingAgents.set(slug, { isSyncing: false, totalSynced: finalCount || totalSynced, lastSync: syncTime });
  } catch (err) {
    console.error(`[SYNC] ${slug} error:`, err.message);
  } finally {
    // ALWAYS reset isSyncing — prevents stuck lock
    const currentState = syncingAgents.get(slug);
    if (currentState?.isSyncing) {
      syncingAgents.set(slug, {
        isSyncing: false,
        totalSynced: currentState.totalSynced || 0,
        lastSync: currentState.lastSync || null
      });
    }
    try { await laporanDisconnect(agent.jamaah_username, { skipRemoteLogout: true }); } catch {} // Local cleanup only
  }
}

async function syncAllAgents() {
  console.log('[SYNC] Starting sync cycle...');
  const startTime = Date.now();

  // Force-reset stuck syncs (>15 min)
  const STUCK_TIMEOUT = 15 * 60 * 1000;
  for (const [slug, state] of syncingAgents) {
    if (state.isSyncing && state.startedAt && (Date.now() - state.startedAt > STUCK_TIMEOUT)) {
      console.warn(`[SYNC] Force-resetting stuck sync: ${slug} (${Math.round((Date.now() - state.startedAt) / 60000)}m)`);
      syncingAgents.set(slug, { isSyncing: false, totalSynced: 0, lastSync: null });
      try { if (state.username) await laporanDisconnect(state.username, { skipRemoteLogout: true }); } catch {}
    }
  }

  const { data: agents, error } = await supabase
    .from('agents')
    .select('*')
    .not('jamaah_username', 'is', null)
    .not('jamaah_password', 'is', null);

  if (error || !agents?.length) {
    console.log(`[SYNC] No agents with credentials found`);
    return;
  }

  // Run agents sequentially — legacy server can't handle parallel sessions well
  let ok = 0, fail = 0, skipped = 0, loginFail = 0;
  for (const agent of agents) {
    try {
      const prevState = syncingAgents.get(agent.slug);
      if (prevState?.isSyncing) { skipped++; continue; }
      await syncOneAgent(agent);
      // Check if login failed (syncOneAgent returns normally but sets loginFailed flag)
      const afterState = syncingAgents.get(agent.slug);
      if (afterState?.loginFailed) {
        loginFail++;
        // If rate-limited, abort remaining agents — no point hammering the server
        if (afterState.rateLimited) {
          console.warn(`[SYNC] Aborting cycle — server rate-limiting detected at ${agent.slug}`);
          skipped += agents.length - (ok + fail + skipped + loginFail);
          break;
        }
      } else {
        ok++;
      }
    } catch (err) {
      console.error(`[SYNC] ${agent.slug} uncaught:`, err.message);
      fail++;
    }
    // Gap between agents — 5s to avoid Apache rate-limiting on Alhijaz server
    if (ok + fail + skipped + loginFail < agents.length) await new Promise(r => setTimeout(r, 5000));
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[SYNC] Cycle complete: ${ok} OK, ${loginFail} login failed, ${fail} error, ${skipped} skipped in ${elapsed}s`);
}

// Clean up old 1446 H data (one-time, 15s after startup)
setTimeout(async () => {
  try {
    const oldYears = ['1439','1440','1441','1442','1443','1444','1445','1446'];
    const { error, count } = await supabase
      .from('jamaah')
      .delete({ count: 'exact' })
      .in('hijriah_year', oldYears);
    if (!error && count > 0) {
      console.log(`[Cleanup] Deleted ${count} old (<1447 H) jamaah records`);
    }
  } catch (err) {
    console.error('[Cleanup] Error:', err.message);
  }
}, 15 * 1000);

// Run initial sync 30s after startup, then every 1 hour
setTimeout(syncAllAgents, 30 * 1000);
setInterval(syncAllAgents, 60 * 60 * 1000);

// ── Umroh schedules sync: 45s after startup, then every 1 hour ──
// Bunny file sync runs after schedule sync completes
async function runScheduleAndBunnySync() {
  await syncUmrohSchedules();
  await syncFilesToBunny();
}
setTimeout(() => {
  runScheduleAndBunnySync().catch(err => console.error('[ScheduleSync] Error:', err.message));
}, 45 * 1000);
setInterval(() => {
  runScheduleAndBunnySync().catch(err => console.error('[ScheduleSync] Error:', err.message));
}, 60 * 60 * 1000);

// ── Bunny cleanup: expired packages (> 6 months), once daily at 03:00 WIB ──
function scheduleBunnyCleanup() {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(20, 0, 0, 0); // 03:00 WIB = 20:00 UTC
  if (target <= now) target.setDate(target.getDate() + 1);
  const msUntil = target - now;
  console.log(`[BunnyCleanup] Next cleanup in ${Math.round(msUntil / 60000)} minutes (03:00 WIB)`);
  setTimeout(async () => {
    try { await cleanupExpiredPackages(); } catch (e) { console.error('[BunnyCleanup] Error:', e.message); }
    setInterval(async () => {
      try { await cleanupExpiredPackages(); } catch (e) { console.error('[BunnyCleanup] Error:', e.message); }
    }, 24 * 60 * 60 * 1000);
  }, msUntil);
}
scheduleBunnyCleanup();

// ── Calendar sync: every 12 hours (shared data, doesn't change often) ──
async function runCalendarSync() {
  try {
    await syncCalendar(supabase);
    // Generate AI insight after first sync (if cache is empty or stale format)
    if (isInsightStale(insightCache)) {
      try { await generateCalendarInsight(); } catch (e) { console.error('[AI Insight] Post-sync error:', e.message); }
    }
  } catch (err) {
    console.error('[Calendar] Sync error:', err.message);
  }
}

// Initial calendar sync 60s after startup, then every 12 hours
setTimeout(runCalendarSync, 60 * 1000);
setInterval(runCalendarSync, 12 * 60 * 60 * 1000);

// ── Itinerary background sync: 2 min after startup, then every 12 hours ──
setTimeout(() => {
  syncAllItineraries().catch(err => console.error('[ItinerarySync] Error:', err.message));
}, 2 * 60 * 1000);
setInterval(() => {
  syncAllItineraries().catch(err => console.error('[ItinerarySync] Error:', err.message));
}, 12 * 60 * 60 * 1000);

// ── AI Insight: generate daily at 01:00 WIB + on startup if stale ──
function scheduleInsightCron() {
  const now = new Date();
  // Next 01:00 WIB (UTC+7 → 18:00 UTC day before)
  const target = new Date(now);
  target.setUTCHours(18, 0, 0, 0); // 01:00 WIB = 18:00 UTC
  if (target <= now) target.setDate(target.getDate() + 1);
  const msUntil = target - now;
  console.log(`[AI Insight] Next cron in ${Math.round(msUntil / 60000)} minutes (01:00 WIB)`);
  setTimeout(async () => {
    try { await generateCalendarInsight(); } catch (e) { console.error('[AI Insight] Cron error:', e.message); }
    // Then repeat every 24 hours
    setInterval(async () => {
      try { await generateCalendarInsight(); } catch (e) { console.error('[AI Insight] Cron error:', e.message); }
    }, 24 * 60 * 60 * 1000);
  }, msUntil);
}
scheduleInsightCron();

// ── AI Insight: warm up cache from Supabase on startup, regenerate if stale ──
setTimeout(async () => {
  try {
    // Warm up cache from Supabase first
    if (!insightCache) {
      const { data: row } = await supabase
        .from('calendar_insights')
        .select('data')
        .eq('id', 'latest')
        .single();
      if (row?.data) insightCache = row.data;
    }
    // Regenerate if stale (not generated today WIB)
    if (isInsightStale(insightCache)) {
      console.log('[AI Insight] Startup: insight is stale, regenerating...');
      await generateCalendarInsight();
    } else {
      console.log('[AI Insight] Startup: insight is fresh, skipping generation');
    }
  } catch (e) {
    console.error('[AI Insight] Startup check error:', e.message);
  }
}, 90 * 1000); // 90s after startup (after calendar sync has a chance to run)

// ── Haji Plus sync: daily at 05:00 WIB + on startup ──
setTimeout(() => syncHajiPlusData(), 10 * 1000); // 10s after startup

function scheduleHajiPlusCron() {
  const now = new Date();
  // Next 05:00 WIB (UTC+7 → 22:00 UTC day before)
  const target = new Date(now);
  target.setUTCHours(22, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const msUntil = target - now;
  console.log(`[HajiPlus] Next cron in ${Math.round(msUntil / 60000)} minutes (05:00 WIB)`);
  setTimeout(async () => {
    try { await syncHajiPlusData(); } catch (e) { console.error('[HajiPlus] Cron error:', e.message); }
    // Then repeat every 24 hours
    setInterval(async () => {
      try { await syncHajiPlusData(); } catch (e) { console.error('[HajiPlus] Cron error:', e.message); }
    }, 24 * 60 * 60 * 1000);
  }, msUntil);
}
scheduleHajiPlusCron();

// ── Flight Status cron: poll every 1 hour ──
setInterval(async () => {
  try {
    await pollActiveFlights();
  } catch (err) {
    console.error('[FlightCron] Error:', err.message);
  }
}, 1 * 60 * 60 * 1000);

// Load persisted AirLabs quota on startup
setTimeout(async () => {
  await loadAirLabsQuota();
}, 5 * 1000);

// Initial flight poll 5 min after startup (increased from 2 min to reduce restart impact)
setTimeout(async () => {
  try {
    await pollActiveFlights();
  } catch (err) {
    console.error('[FlightCron] Initial poll error:', err.message);
  }
}, 5 * 60 * 1000);

// ── Flight cleanup cron: daily at 03:00 WIB (20:00 UTC) ──
function scheduleFlightCleanup() {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(20, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const msUntil = target - now;
  setTimeout(async () => {
    try {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const cutoff = threeDaysAgo.toISOString().split('T')[0];
      const { error } = await supabase.from('flight_status').delete().lt('event_date', cutoff);
      if (!error) console.log(`[FlightCron] Cleaned up flight_status older than ${cutoff}`);
      else console.error('[FlightCron] Cleanup error:', error.message);
    } catch (err) {
      console.error('[FlightCron] Cleanup error:', err.message);
    }
    // Repeat every 24h
    setInterval(async () => {
      try {
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const cutoff = threeDaysAgo.toISOString().split('T')[0];
        await supabase.from('flight_status').delete().lt('event_date', cutoff);
      } catch (err) {
        console.error('[FlightCron] Cleanup error:', err.message);
      }
    }, 24 * 60 * 60 * 1000);
  }, msUntil);
}
scheduleFlightCleanup();


import express from 'express';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { connectJamaah, fetchJamaah, disconnectJamaah, getSessionInfo } from './jamaah-api.js';
import { login as laporanLogin, fetchLaporan, parseLaporanHtml, isSessionActive, disconnect as laporanDisconnect } from './laporan-api.js';
import { initNotifier } from './telegram-notifier.js';
import { syncCalendar } from './calendar-api.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ── Supabase (service role for server-side access) ──
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';

app.use(express.json());

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
  if (!slug || !password) return res.status(400).json({ error: 'Slug dan password wajib diisi' });

  const agent = await getAgent(slug.toLowerCase());
  if (!agent) return res.status(404).json({ error: 'Username / password salah' });
  const isValid = await bcrypt.compare(password, agent.password || '');
  if (!isValid) {
    return res.status(401).json({ error: 'Password salah' });
  }

  const token = jwt.sign(
    { slug: agent.slug, name: agent.name, role: agent.role || 'agent' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

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
    },
  });
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
  });
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
  const { name, website, phone, email, slug: newSlug } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (website !== undefined) updates.website = website;
  if (phone !== undefined) updates.phone = phone;
  if (email !== undefined) updates.email = email;
  if (newSlug && newSlug !== req.user.slug) {
    // Check if slug is taken
    const { data: existing } = await supabase.from('agents').select('slug').eq('slug', newSlug).single();
    if (existing) return res.status(400).json({ error: 'Slug sudah digunakan' });
    updates.slug = newSlug;
    // Rename photo in Supabase Storage (copy + delete)
    try {
      const oldFile = `${req.user.slug}.jpg`;
      const newFile = `${newSlug}.jpg`;
      const { data: downloaded } = await supabase.storage.from('agent-photos').download(oldFile);
      if (downloaded) {
        const arrayBuf = await downloaded.arrayBuffer();
        await supabase.storage.from('agent-photos').upload(newFile, Buffer.from(arrayBuf), {
          contentType: 'image/jpeg', upsert: true,
        });
        await supabase.storage.from('agent-photos').remove([oldFile]);
        const { data: urlData } = supabase.storage.from('agent-photos').getPublicUrl(newFile);
        updates.photo = `${urlData.publicUrl}?v=${Date.now()}`;
      }
    } catch (e) { /* ignore rename errors */ }
  }
  if (Object.keys(updates).length === 0) return res.json({ success: true });
  const { error } = await supabase
    .from('agents')
    .update(updates)
    .eq('slug', req.user.slug);
  if (error) return res.status(500).json({ error: error.message });
  // Invalidate cache
  agentCache = null;
  res.json({ success: true });
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
    .select('slug, name, website, phone, email, photo, role, jamaah_username, jamaah_password, jamaah_kantor')
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
  res.json({ success: isValid });
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

// Hijriah year → Gregorian date range mapping
// Only current + next year. Update when new Hijriah year starts.
const HIJRIAH_YEARS = {
  '1447': { tglAwal: '2025-06-26', tglAkhir: '2026-06-15' },
  '1448': { tglAwal: '2026-06-16', tglAkhir: '2027-06-05' },
};

// Determine hijriah year from departure date
const HIJRIAH_RANGES = [
  { year: '1446', start: '2024-07-08', end: '2025-06-25' },
  { year: '1447', start: '2025-06-26', end: '2026-06-15' },
  { year: '1448', start: '2026-06-16', end: '2027-06-05' },
];

function getHijriahYear(tglBerangkat) {
  if (!tglBerangkat) return null;
  for (const range of HIJRIAH_RANGES) {
    if (tglBerangkat >= range.start && tglBerangkat <= range.end) {
      return range.year;
    }
  }
  // Fallback: latest year if outside known ranges
  return HIJRIAH_RANGES[HIJRIAH_RANGES.length - 1].year;
}

function getActiveHijriahYears() {
  return Object.keys(HIJRIAH_YEARS).sort((a, b) => Number(b) - Number(a));
}

// Helper: build rows from parsed items — hijriah_year determined per item by tgl_berangkat
function buildRows(items, agentSlug, now) {
  return items.map(item => ({
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
    hijriah_year: getHijriahYear(item.tgl_berangkat),
    perlengkapan: item.perlengkapan || {},
    dokumen: item.dokumen || {},
    no_paspor: item.no_paspor || null,
    paspor_expired: item.paspor_expired || null,
    raw_data: item.raw_data || null,
    synced_at: now,
  }));
}

// Sync: fetch from legacy → parse → progressive upsert to Supabase
// If hijriahYear is provided, sync only that year. Otherwise sync all years.
app.post('/api/laporan/sync', authMiddleware, async (req, res) => {
  const { hijriahYear } = req.body;

  const slug = req.user.slug;
  const agent = await getAgent(slug);
  if (!agent?.jamaah_username || !agent?.jamaah_password) {
    return res.status(400).json({ error: 'Belum ada credentials tersimpan' });
  }

  // Prevent concurrent sync
  const state = syncingAgents.get(slug);
  if (state?.isSyncing) {
    return res.json({ success: true, data: { initialCount: 0, syncing: true, message: 'Sync sudah berjalan' } });
  }

  syncingAgents.set(slug, { isSyncing: true, totalSynced: 0, lastSync: null });

  // Force fresh session to ensure clean state with legacy system
  laporanDisconnect(agent.jamaah_username);
  const decrypted = capiDecrypt(agent.jamaah_password);
  const loginResult = await laporanLogin(agent.jamaah_username, decrypted, agent.jamaah_kantor || '2');
  if (!loginResult.success) {
    syncingAgents.set(slug, { isSyncing: false, totalSynced: 0, lastSync: null });
    return res.status(401).json({ error: 'Gagal login ulang ke sistem internal' });
  }

  // Determine which years to sync
  const yearsToSync = hijriahYear && HIJRIAH_YEARS[hijriahYear]
    ? [hijriahYear]
    : getActiveHijriahYears();

  let totalItems = 0;
  let firstBatchSent = false;
  const now = new Date().toISOString();

  for (const year of yearsToSync) {
    const range = HIJRIAH_YEARS[year];
    if (!range) continue;

    // Fetch from multiple kantor values to capture all jamaah
    const kantorValues = [agent.jamaah_kantor || '2'];
    if (!kantorValues.includes('0')) kantorValues.push('0');

    let allItems = [];
    const seenIds = new Set();

    for (const kantor of kantorValues) {
      const fetchResult = await fetchLaporan(agent.jamaah_username, {
        kantor,
        agentId: agent.jamaah_username,
        tglAwal: range.tglAwal,
        tglAkhir: range.tglAkhir,
      });

      if (!fetchResult.success) {
        console.error(`[Sync] ${slug} year ${year} kantor ${kantor}: fetch failed`);
        continue;
      }

      const { items: fetchedItems } = parseLaporanHtml(fetchResult.html);
      console.log(`[Sync] ${slug} year ${year} kantor ${kantor}: ${fetchedItems.length} items`);
      // Deduplicate by id_umroh + nama (matches DB unique constraint)
      for (const item of fetchedItems) {
        const key = `${item.id_umroh}|${item.nama}`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          allItems.push(item);
        }
      }
    }

    const items = allItems;
    console.log(`[Sync] ${slug} year ${year}: parsed ${items.length} items`);

    if (items.length === 0) continue;
    totalItems += items.length;

    // First year: send first 10 immediately as progressive response
    if (!firstBatchSent) {
      const first10 = items.slice(0, 10);
      const rest = items.slice(10);
      const firstRows = buildRows(first10, slug, now);

      const { error: firstErr } = await supabase
        .from('jamaah')
        .upsert(firstRows, { onConflict: 'agent_slug,id_umroh,nama' });

      if (firstErr) {
        console.error('[Sync] First batch error:', firstErr.message);
        syncingAgents.set(slug, { isSyncing: false, totalSynced: 0, lastSync: null });
        return res.status(500).json({ error: 'Gagal menyimpan data: ' + firstErr.message });
      }

      firstBatchSent = true;
      const moreYears = yearsToSync.length > 1 || rest.length > 0;
      syncingAgents.set(slug, { isSyncing: moreYears, totalSynced: first10.length, lastSync: now });

      // Respond immediately
      res.json({
        success: true,
        data: { initialCount: first10.length, total: items.length, syncing: moreYears },
      });

      // Upsert rest of first year async
      if (rest.length > 0) {
        const restRows = buildRows(rest, slug, now);
        const BATCH = 50;
        for (let i = 0; i < restRows.length; i += BATCH) {
          const batch = restRows.slice(i, i + BATCH);
          const { error } = await supabase.from('jamaah').upsert(batch, { onConflict: 'agent_slug,id_umroh,nama' });
          if (error) console.error(`[Sync] ${slug} batch error:`, error.message);
          syncingAgents.set(slug, { isSyncing: true, totalSynced: (syncingAgents.get(slug)?.totalSynced || 0) + batch.length, lastSync: now });
        }
      }
    } else {
      // Subsequent years: upsert all in batches (response already sent)
      const rows = buildRows(items, slug, now);
      const BATCH = 50;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { error } = await supabase.from('jamaah').upsert(batch, { onConflict: 'agent_slug,id_umroh,nama' });
        if (error) console.error(`[Sync] ${slug} year ${year} batch error:`, error.message);
        syncingAgents.set(slug, { isSyncing: true, totalSynced: (syncingAgents.get(slug)?.totalSynced || 0) + batch.length, lastSync: now });
      }
    }
  }

  // If we never sent response (all years empty)
  if (!firstBatchSent) {
    syncingAgents.set(slug, { isSyncing: false, totalSynced: 0, lastSync: now });
    return res.json({ success: true, data: { initialCount: 0, syncing: false } });
  }

  console.log(`[Sync] ${slug}: completed ${totalItems} items across ${yearsToSync.length} years`);
  syncingAgents.set(slug, { isSyncing: false, totalSynced: totalItems, lastSync: now });
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
    query = query.order('tgl_daftar', { ascending: false, nullsFirst: false });
  } else {
    query = query.order('nama', { ascending: true });
  }

  if (hijriahYear) {
    query = query.eq('hijriah_year', hijriahYear);
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

  const baseFilter = hijriahYear ? { hijriah_year: hijriahYear } : {};

  const { count: totalCount } = await supabase
    .from('jamaah')
    .select('*', { count: 'exact', head: true })
    .eq('agent_slug', req.user.slug)
    .match(baseFilter);

  const { count: belumCount } = await supabase
    .from('jamaah')
    .select('*', { count: 'exact', head: true })
    .eq('agent_slug', req.user.slug)
    .gt('sisa', 0)
    .match(baseFilter);

  let berangkatQ = supabase
    .from('jamaah')
    .select('*', { count: 'exact', head: true })
    .eq('agent_slug', req.user.slug)
    .gte('tgl_berangkat', todayStr)
    .lte('tgl_berangkat', cutoffStr);
  if (hijriahYear) berangkatQ = berangkatQ.eq('hijriah_year', hijriahYear);
  const { count: berangkatCount } = await berangkatQ;

  let piutang = 0;
  let pQ = supabase.from('jamaah').select('sisa').eq('agent_slug', req.user.slug).gt('sisa', 0);
  if (hijriahYear) pQ = pQ.eq('hijriah_year', hijriahYear);
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

// Disconnect: clear in-memory session only
app.post('/api/laporan/disconnect', authMiddleware, async (req, res) => {
  const agent = await getAgent(req.user.slug);
  if (agent?.jamaah_username) {
    laporanDisconnect(agent.jamaah_username);
  }
  res.json({ success: true });
});

// Delete saved credentials
app.delete('/api/laporan/credentials', authMiddleware, async (req, res) => {
  // Also disconnect if active
  const agent = await getAgent(req.user.slug);
  if (agent?.jamaah_username) {
    laporanDisconnect(agent.jamaah_username);
  }

  const { error } = await supabase
    .from('agents')
    .update({
      jamaah_username: null,
      jamaah_password: null,
      jamaah_kantor: null,
    })
    .eq('slug', req.user.slug);
  if (error) return res.status(500).json({ error: error.message });
  agentCache = null;
  res.json({ success: true });
});

// ──────────────────────────────────────────────
// API: Stats — aggregated jamaah statistics
// ──────────────────────────────────────────────
app.get('/api/laporan/stats', authMiddleware, async (req, res) => {
  const slug = req.user.slug;

  try {
    // ── availableYears ──
    const { data: ayData } = await supabase
      .from('jamaah')
      .select('hijriah_year')
      .eq('agent_slug', slug)
      .not('hijriah_year', 'is', null);
    const availableYears = [...new Set((ayData || []).map(r => r.hijriah_year))].sort((a, b) => b.localeCompare(a));

    // Determine hijriah year — default to current Islamic year, fallback to latest available
    let year = req.query.year || null;
    if (!year) {
      const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { year: 'numeric' }).formatToParts(new Date());
      const hijriYear = (parts.find(p => p.type === 'year')?.value || '').replace(/\s*AH$/, '');
      year = availableYears.includes(hijriYear) ? hijriYear : (availableYears[0] || null);
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
    const { data: outData } = await outQ;
    const totalOutstanding = outData ? outData.reduce((s, r) => s + (r.sisa || 0), 0) : 0;

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
    const { data: bebRows } = await bebQ;

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
    const { data: trendRows } = await trendQ;

    const trendMap = new Map();
    if (trendRows) {
      for (const row of trendRows) {
        if (!row.tgl_daftar) continue;
        const bulan = row.tgl_daftar.substring(0, 7);
        trendMap.set(bulan, (trendMap.get(bulan) || 0) + 1);
      }
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
    const { data: olRows } = await olQ;

    const outstandingList = (olRows || []).map(r => {
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
    const { data: komisiRows } = await komisiQ;

    let sudahCair = 0, sudahCairCount = 0;
    let belumCair = 0, belumCairCount = 0;
    let potensi = 0, potensiCount = 0;
    let hematCount = 0, hematTotal = 0, regulerCount = 0, regulerTotal = 0;
    for (const r of (komisiRows || [])) {
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
    for (const r of (komisiRows || [])) {
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
// Static files + SPA fallback with OG injection
// ──────────────────────────────────────────────
const distPath = resolve(__dirname, 'dist');
const publicPath = resolve(__dirname, 'public');

// Serve static assets from dist/ first, then fallback to public/
// This ensures uploaded files (e.g. agent photos in public/agents/)
// are always accessible, even if they were added after the last build.
app.use(express.static(distPath));
app.use(express.static(publicPath));

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
async function syncOneAgent(agent) {
  const slug = agent.slug;
  const state = syncingAgents.get(slug);
  if (state?.isSyncing) {
    console.log(`[SYNC] Skipping ${slug} — already syncing`);
    return;
  }

  syncingAgents.set(slug, { isSyncing: true, totalSynced: 0, lastSync: null });

  try {
    // Force fresh session for each background sync
    laporanDisconnect(agent.jamaah_username);
    const decrypted = capiDecrypt(agent.jamaah_password);
    const loginResult = await laporanLogin(agent.jamaah_username, decrypted, agent.jamaah_kantor || '2');
    if (!loginResult.success) {
      console.error(`[SYNC] ${slug}: login failed`);
      syncingAgents.set(slug, { isSyncing: false, totalSynced: 0, lastSync: null });
      return;
    }

    const syncTime = new Date().toISOString();
    let totalSynced = 0;

    // Sync all Hijriah years
    for (const year of getActiveHijriahYears()) {
      const range = HIJRIAH_YEARS[year];
      if (!range) continue;

      // Fetch from multiple kantor values to capture all jamaah
      const kantorValues = [agent.jamaah_kantor || '2'];
      if (!kantorValues.includes('0')) kantorValues.push('0');

      let allItems = [];
      const seenIds = new Set();

      for (const kantor of kantorValues) {
        const fetchResult = await fetchLaporan(agent.jamaah_username, {
          kantor,
          agentId: agent.jamaah_username,
          tglAwal: range.tglAwal,
          tglAkhir: range.tglAkhir,
        });

        if (!fetchResult.success) {
          console.error(`[SYNC] ${slug} year ${year} kantor ${kantor}: fetch failed`);
          continue;
        }

        const { items: fetchedItems } = parseLaporanHtml(fetchResult.html);
        console.log(`[SYNC] ${slug} year ${year} kantor ${kantor}: ${fetchedItems.length} items`);
        for (const item of fetchedItems) {
          const key = `${item.id_umroh}|${item.nama}`;
          if (!seenIds.has(key)) {
            seenIds.add(key);
            allItems.push(item);
          }
        }
      }

      console.log(`[SYNC] ${slug} year ${year}: allItems=${allItems.length} seenIds=${seenIds.size}`);
      const items = allItems;

      if (items.length > 0) {
        const BATCH = 50;
        for (let i = 0; i < items.length; i += BATCH) {
          const batch = items.slice(i, i + BATCH);
          const rows = buildRows(batch, slug, syncTime);
          const { error } = await supabase
            .from('jamaah')
            .upsert(rows, { onConflict: 'agent_slug,id_umroh,nama' });
          if (error) console.error(`[SYNC] ${slug} year ${year} batch error:`, error.message);
          totalSynced += batch.length;
          syncingAgents.set(slug, { isSyncing: true, totalSynced, lastSync: syncTime });
        }
        console.log(`[SYNC] ${slug} year ${year}: ${items.length} jamaah synced`);
      }
    }

    console.log(`[SYNC] ${slug}: total ${totalSynced} jamaah synced`);
    syncingAgents.set(slug, { isSyncing: false, totalSynced, lastSync: syncTime });
    laporanDisconnect(agent.jamaah_username);
  } catch (err) {
    console.error(`[SYNC] ${slug} error:`, err.message);
    syncingAgents.set(slug, { isSyncing: false, totalSynced: 0, lastSync: null });
    try { laporanDisconnect(agent.jamaah_username); } catch {}
  }
}

async function syncAllAgents() {
  console.log('[SYNC] Starting sync cycle...');
  const startTime = Date.now();

  const { data: agents, error } = await supabase
    .from('agents')
    .select('*')
    .not('jamaah_username', 'is', null)
    .not('jamaah_password', 'is', null);

  if (error || !agents?.length) {
    console.log(`[SYNC] No agents with credentials found`);
    return;
  }

  let synced = 0;
  for (const agent of agents) {
    await syncOneAgent(agent);
    synced++;
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[SYNC] Cycle complete: ${synced} agents synced in ${elapsed}s`);
}

// Run initial sync 30s after startup, then every 1 hour
setTimeout(syncAllAgents, 30 * 1000);
setInterval(syncAllAgents, 60 * 60 * 1000);

// ── Calendar sync: every 12 hours (shared data, doesn't change often) ──
async function runCalendarSync() {
  try {
    await syncCalendar(supabase, capiDecrypt);
  } catch (err) {
    console.error('[Calendar] Sync error:', err.message);
  }
}

// Initial calendar sync 60s after startup, then every 12 hours
setTimeout(runCalendarSync, 60 * 1000);
setInterval(runCalendarSync, 12 * 60 * 60 * 1000);

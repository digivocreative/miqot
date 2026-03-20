import express from 'express';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Resend } from 'resend';
import { connectJamaah, fetchJamaah, disconnectJamaah, getSessionInfo } from './jamaah-api.js';
import { login as laporanLogin, fetchLaporan, parseLaporanHtml, isSessionActive, disconnect as laporanDisconnect, getSessionCookie } from './laporan-api.js';
import { fetchHajiList, fetchHajiDetail, syncHajiData } from './haji-api.js';
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
    { slug: agent.slug, name: agent.name, role: agent.role || 'agent' },
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
    telegram_chat_id: agent.telegram_chat_id || '',
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
  const { name, website, phone, email, telegram_chat_id, slug: newSlug, password } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (website !== undefined) updates.website = website;
  if (phone !== undefined) updates.phone = phone;
  if (email !== undefined) updates.email = email;
  if (telegram_chat_id !== undefined) updates.telegram_chat_id = telegram_chat_id;
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
      .select('telegram_chat_id')
      .eq('slug', slug)
      .single();

    if (error) throw error;

    res.json({
      success: true,
      data: {
        connected: !!data.telegram_chat_id,
        chatId: data.telegram_chat_id || null,
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
const HIJRIAH_YEARS = {
  '1447': { tglAwal: '2024-12-26', tglAkhir: '2026-06-15' },
  '1448': { tglAwal: '2025-12-16', tglAkhir: '2027-06-05' },
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
  if (req.user?.role !== 'admin') logAnalyticsEvent(slug, 'action', 'sync_jamaah');

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

    const kantor = agent.jamaah_kantor || '2';
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

    const { items: allItems } = parseLaporanHtml(fetchResult.html);
    console.log(`[Sync] ${slug} year ${year} kantor ${kantor}: ${allItems.length} items`);

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

  // Group week events by date + type
  const weekSummary = {};
  for (const ev of weekEvents) {
    const key = `${ev.event_date}_${ev.event_type}`;
    if (!weekSummary[key]) weekSummary[key] = { date: ev.event_date, type: ev.event_type, groups: [], totalPax: 0 };
    weekSummary[key].groups.push({ group: ev.group_number, pax: ev.pax || 0, paket: ev.paket });
    weekSummary[key].totalPax += ev.pax || 0;
  }

  let calendarDataString = `Hari ini: ${formatDate(todayStr)}\n\n`;
  calendarDataString += `=== JADWAL 7 HARI KE DEPAN ===\n`;
  const sortedWeek = Object.values(weekSummary).sort((a, b) => a.date.localeCompare(b.date));
  if (sortedWeek.length === 0) {
    calendarDataString += `Tidak ada jadwal keberangkatan/kepulangan/manasik 7 hari ke depan.\n`;
  } else {
    for (const item of sortedWeek) {
      calendarDataString += `${formatDate(item.date)} — ${item.type}: ${item.groups.length} group, ${item.totalPax} jamaah\n`;
      for (const g of item.groups) {
        if (g.group && g.pax > 0) calendarDataString += `  Group ${g.group}: ${g.pax} jamaah, paket ${g.paket || '-'}\n`;
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

Tugas kamu: buat 3 insight singkat berdasarkan data jadwal dan cuaca berikut. Gunakan bahasa Indonesia yang HANGAT dan KASUAL — seperti ngobrol sesama teman kerja. Jangan pakai bahasa baku/kaku/formal. Boleh pakai kata seperti "rame", "lumayan", "nih", "yuk", "dong", "banget", "Alhamdulillah". Jangan pakai kata "signifikan", "terkait", "berdasarkan data", atau bahasa laporan.

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
- Contoh variasi pembuka field "cuaca":
  • "Soal cuaca, Mekah lagi panas-panasnya nih..."
  • "Buat jamaah yang mau berangkat, cuaca di Tanah Suci..."
  • "Update cuaca: Madinah lagi adem, tapi Mekah..."
  • "Jangan lupa ingetin jamaah soal cuaca ya..."
- Gunakan hari dalam minggu (Senin, Selasa, dst) secara natural, jangan selalu sebut tanggal angka di awal kalimat.
- Variasikan juga gaya penutup — jangan selalu "jangan lupa" atau "pastikan".

LARANGAN:
- JANGAN gunakan sapaan berdasarkan waktu (Pagi, Siang, Sore, Malam, Selamat pagi, dll) karena insight ini berlaku seharian, bukan hanya pagi.
- JANGAN gunakan sebutan gender spesifik (ladies, girls, bu, pak, bro, sis, dll) karena agent terdiri dari pria dan wanita. Gunakan "kita", "kamu", atau langsung ke topik tanpa menyebut gender.

Bungkus angka/tanggal penting dengan **bold** (contoh: **25 Maret**, **336 jamaah**).

Buat 3 bagian (HARUS dalam format JSON, tanpa backtick/markdown di luar value):
{
  "today": "Ringkasan hari ini. Kalau tidak ada jadwal hari ini, kasih tahu kapan jadwal terdekat dan apa yang perlu disiapkan. Maksimal 2 kalimat.",
  "weekly": "Ringkasan 7 hari ke depan + PENGINGAT/TO-DO untuk agent. Sebutkan hari paling rame, group terbesar, total jamaah. Lalu kasih action items spesifik, misal: 'Manasik tanggal X, kabari jamaah Group Y.' atau 'Group Z berangkat N hari lagi, cek kelengkapan dokumen.' Maksimal 4-5 kalimat.",
  "cuaca": "Info cuaca Mekah dan Madinah minggu ini yang relevan untuk jamaah yang mau berangkat. Kasih tips praktis buat agent ingetin jamaahnya, misal bawa payung, minum yang banyak, pakai sunblock, dll. Harus hangat dan perhatian, kayak ibu-ibu ngingetin anaknya. Maksimal 3 kalimat."
}`;

  const userPrompt = `Data jadwal 7 hari ke depan:
${calendarDataString}

Data cuaca Mekah bulan ini: suhu ${mekahT.low}-${mekahT.high}°C, kondisi ${mekahCondition}
Data cuaca Madinah bulan ini: suhu ${madinahT.low}-${madinahT.high}°C, kondisi ${madinahCondition}

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
        max_tokens: 600,
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

    const data = {
      today: parsed.today || '',
      weekly: parsed.weekly || '',
      cuaca: parsed.cuaca || '',
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
// API: Haji — scrape & manage haji data
// ──────────────────────────────────────────────

// POST /api/haji/sync — progressive sync (same pattern as umroh)
app.post('/api/haji/sync', authMiddleware, async (req, res) => {
  const { slug } = req.user;

  try {
    const agent = await getAgent(slug);
    if (!agent?.jamaah_username || !agent?.jamaah_password) {
      return res.status(400).json({
        error: 'Belum terhubung ke sistem internal. Silakan login di halaman Jamaah terlebih dahulu.'
      });
    }

    // Prevent concurrent sync (same as umroh)
    const state = syncingAgents.get(slug);
    if (state?.isSyncing) {
      return res.json({ success: true, data: { initialCount: 0, syncing: true, message: 'Sync sudah berjalan' } });
    }

    syncingAgents.set(slug, { isSyncing: true, totalSynced: 0, lastSync: null });

    // Login fresh to legacy system
    laporanDisconnect(agent.jamaah_username);
    const decrypted = capiDecrypt(agent.jamaah_password);
    const loginResult = await laporanLogin(agent.jamaah_username, decrypted, agent.jamaah_kantor || '2');
    if (!loginResult.success) {
      syncingAgents.set(slug, { isSyncing: false, totalSynced: 0, lastSync: null });
      return res.status(401).json({ error: 'Gagal login ke sistem internal. Silakan login ulang.' });
    }

    const sessionCookies = getSessionCookie(agent.jamaah_username);
    if (!sessionCookies) {
      syncingAgents.set(slug, { isSyncing: false, totalSynced: 0, lastSync: null });
      return res.status(400).json({ error: 'Session cookies tidak tersedia setelah login.' });
    }

    // Step 1: Fetch the haji list
    const hajiList = await fetchHajiList(sessionCookies);
    const uniqueIds = [...new Set(hajiList.map(h => h.id_haji))];
    console.log(`[haji-sync] ${slug}: found ${hajiList.length} entries, ${uniqueIds.length} unique`);

    if (uniqueIds.length === 0) {
      syncingAgents.set(slug, { isSyncing: false, totalSynced: 0, lastSync: new Date().toISOString() });
      return res.json({ success: true, data: { initialCount: 0, syncing: false } });
    }

    // Step 2: Fetch first 2 batches (up to 10 detail pages) for immediate response
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
    syncingAgents.set(slug, { isSyncing: moreToSync, totalSynced: firstRows.length, lastSync: now });

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
                syncingAgents.set(slug, {
                  isSyncing: true,
                  totalSynced: firstRows.length + bgRows.length,
                  lastSync: now,
                });
                bgRows.length = 0; // clear
              }
            }
            if (i + BATCH_SIZE < restIds.length) await new Promise(r => setTimeout(r, 100));
          }
          console.log(`[haji-sync] ${slug}: background sync complete`);
          syncingAgents.set(slug, { isSyncing: false, totalSynced: firstRows.length, lastSync: now });
        } catch (err) {
          console.error('[haji-sync] BG sync error:', err.message);
          syncingAgents.set(slug, { isSyncing: false, totalSynced: 0, lastSync: null });
        }
      })();
    }
  } catch (err) {
    console.error('[haji] Sync error:', err);
    syncingAgents.set(slug, { isSyncing: false, totalSynced: 0, lastSync: null });
    if (!res.headersSent) {
      if (err.message === 'SESSION_EXPIRED') {
        return res.status(401).json({ error: 'Session expired. Silakan login ulang.' });
      }
      res.status(500).json({ error: 'Gagal sync data haji: ' + err.message });
    }
  }
});

// GET /api/haji/jamaah — list jamaah haji with filters
app.get('/api/haji/jamaah', authMiddleware, async (req, res) => {
  try {
    const { slug } = req.user;
    const {
      search = '',
      thn_hijriyah = '',
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

    // Group by thn_hijriyah
    const byTahun = {};
    data.forEach(d => {
      const key = d.thn_hijriyah || 'unknown';
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

// ──────────────────────────────────────────────
// Analytics API
// ──────────────────────────────────────────────
const VALID_EVENT_TYPES = ['login', 'feature', 'action', 'public'];
const VALID_PUBLIC_EVENTS = ['page_view', 'wa_click_public'];
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
    };
    actionEvents.forEach(e => { actionMap[e.event_name] = (actionMap[e.event_name] || 0) + 1; });
    const actionTracking = Object.entries(actionMap)
      .map(([action, count]) => ({ action, label: actionLabels[action] || action, count }))
      .sort((a, b) => b.count - a.count);

    // Recent Activity (today, exclude page_view, max 10)
    const todayStr = now.toISOString().slice(0, 10);
    const agentNameMap = Object.fromEntries(agentList.map(a => [a.slug, a.name]));
    const allLabels = { ...featureLabels, ...actionLabels, login: 'Login', login_failed: 'Login Gagal' };
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

      const kantor = agent.jamaah_kantor || '2';
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

      const { items: allItems } = parseLaporanHtml(fetchResult.html);
      console.log(`[SYNC] ${slug} year ${year} kantor ${kantor}: ${allItems.length} items`);

      console.log(`[SYNC] ${slug} year ${year}: ${allItems.length} items`);
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
        }
      }
    } catch (hajiErr) {
      console.error(`[SYNC] ${slug} haji error:`, hajiErr.message);
      // Don't fail the whole sync if haji fails
    }

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

// ── AI Insight: generate daily at 01:00 WIB + on startup if stale ──
function scheduleInsightCron() {
  const now = new Date();
  // Next 01:00 WIB (UTC+7 → 18:00 UTC day before)
  const target = new Date(now);
  target.setUTCHours(23, 0, 0, 0); // 06:00 WIB = 23:00 UTC
  if (target <= now) target.setDate(target.getDate() + 1);
  const msUntil = target - now;
  console.log(`[AI Insight] Next cron in ${Math.round(msUntil / 60000)} minutes (06:00 WIB)`);
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

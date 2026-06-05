/**
 * Telegram Notifier — monitors Alhijaz umroh packages and sends alerts.
 *
 * Runs inside the Express process via node-cron:
 *   - Every 30 min: real-time checks (seat critical, sold out, new package, price change)
 *   - Monday 08:00 WIB: weekly summary
 *   - Daily 08:00 WIB (Mon-Sat): flush queued notifications
 *
 * State persisted in data/notifier-state.json
 */

import cron from 'node-cron';
import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { getTodaysBirthdays } from './lib/birthdays.js';
import { getOrCreateKursShareImage } from './lib/kurs-share-cache.mjs';
import { buildNotifierPackagesUrl } from './lib/notifier-package-source.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, 'data', 'notifier-state.json');
const DATA_DIR = path.join(__dirname, 'data');

// Lazy-loaded after dotenv.config() runs
let YEAR_CODES, BASE_URL, BOT_TOKEN, CHAT_ID, CHAT_ID_DEV, TELEGRAM_API, OPENAI_KEY, IS_PROD, supabaseAdmin;
let isCheckRunning = false;
// Ops/infra alert recipient (DB-health canary) — a SINGLE agent DM, NOT the group.
let OPS_ALERT_CHAT_ID = '';
let OPS_ALERT_AGENT_SLUG = 'nikita';
let opsAlertChatId = '';        // resolved + cached target chat id
let opsAlertResolveTried = false;

function loadConfig() {
  YEAR_CODES = (process.env.NOTIFIER_YEAR_CODES || '1448').split(',').map(s => s.trim());
  BASE_URL = process.env.NOTIFIER_BASE_URL || 'http://localhost:3000';
  BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
  CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
  CHAT_ID_DEV = process.env.TELEGRAM_CHAT_ID_DEV || '';
  TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
  OPENAI_KEY = process.env.OPENAI_API_KEY || '';
  IS_PROD = process.env.NODE_ENV === 'production';
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  OPS_ALERT_CHAT_ID = process.env.OPS_ALERT_CHAT_ID || '';
  OPS_ALERT_AGENT_SLUG = process.env.OPS_ALERT_AGENT_SLUG || 'nikita';
  opsAlertChatId = OPS_ALERT_CHAT_ID; // env wins; empty → resolved from agent slug at init
  opsAlertResolveTried = false;
}

const SEAT_CRITICAL_ABS = 10;
const SEAT_CRITICAL_PCT = 0.2;

// ─── Helpers ─────────────────────────────────────────

function log(...args) {
  console.log(`[Notifier]`, ...args);
}

function warn(...args) {
  console.warn(`[Notifier]`, ...args);
}

function formatRupiah(num) {
  if (!num || isNaN(num)) return '-';
  return 'Rp ' + new Intl.NumberFormat('id-ID').format(num);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function formatDateShort(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function jakartaNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
}

function isOperationalHours() {
  const now = jakartaNow();
  const day = now.getDay();
  const hour = now.getHours();
  if (day === 0) return hour >= 8 && hour < 21; // Minggu
  if (day === 6) return hour >= 8 && hour < 15; // Sabtu
  return hour >= 8 && hour < 21; // Senin-Jumat
}

function seatInt(pkg) {
  return parseInt(pkg.seat_sisa, 10) || 0;
}

function seatTotal(pkg) {
  return parseInt(pkg.seat_total, 10) || 0;
}

function getLowestPrice(paketHarga) {
  if (!paketHarga || typeof paketHarga !== 'object') return { lowest: null, roomType: '', paketType: '' };
  let lowest = Infinity;
  let roomType = '';
  let paketType = '';
  for (const [pType, rooms] of Object.entries(paketHarga)) {
    if (!rooms || typeof rooms !== 'object') continue;
    for (const [rType, price] of Object.entries(rooms)) {
      if (rType === 'Infant' || rType === 'Single') continue;
      const numPrice = parseInt(price, 10);
      if (!isNaN(numPrice) && numPrice > 0 && numPrice < lowest) {
        lowest = numPrice;
        roomType = rType;
        paketType = pType;
      }
    }
  }
  return lowest === Infinity
    ? { lowest: null, roomType: '', paketType: '' }
    : { lowest, roomType, paketType };
}

function daysDiff(dateStr) {
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / (1000 * 60 * 60 * 24));
}

// ─── Telegram ────────────────────────────────────────

async function sendTelegramMessage(text) {
  const targetChatId = IS_PROD ? CHAT_ID : (CHAT_ID_DEV || CHAT_ID);
  if (!BOT_TOKEN || !targetChatId) {
    warn('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured, skipping send');
    return;
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
      const result = await res.json();
      if (result.ok) return;
      warn('Telegram API error:', result.description);
      if (attempt === 0 && result.error_code === 429) {
        const retryAfter = (result.parameters?.retry_after || 5) * 1000;
        await sleep(retryAfter);
        continue;
      }
      // On parse error, try without HTML
      if (attempt === 0) {
        const res2 = await fetch(`${TELEGRAM_API}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: targetChatId,
            text: text.replace(/<[^>]+>/g, ''),
            disable_web_page_preview: true,
          }),
        });
        const r2 = await res2.json();
        if (!r2.ok) warn('Telegram plaintext fallback also failed:', r2.description);
        return;
      }
    } catch (err) {
      warn(`Send attempt ${attempt + 1} failed:`, err.message);
      if (attempt === 0) await sleep(5000);
    }
  }
}

const FOOTER = '\n\n<i>🤖 Pesan ini dikirim otomatis. Analisis dibantu AI, data bisa berubah sewaktu-waktu.</i>';
const APP_BASE_URL = 'https://alhijaz.co';

function buildAgentPackageUrl(agentSlug, packageId) {
  return `${APP_BASE_URL}/${agentSlug}/${packageId}`;
}

function buildDashboardUrl(path = '') {
  return `${APP_BASE_URL}/dashboard${path}`;
}

function buildUrlKeyboard(rows) {
  const inline_keyboard = rows
    .map(row => row
      .filter(button => button?.text && button?.url)
      .map(button => ({ text: button.text, url: button.url }))
    )
    .filter(row => row.length > 0);

  return inline_keyboard.length > 0 ? { inline_keyboard } : undefined;
}

function buildJamaahKeyboard(extraRows = []) {
  return buildUrlKeyboard([
    [
      { text: '👥 Buka Jamaah', url: buildDashboardUrl('/jamaah') },
      { text: '📊 Statistik', url: buildDashboardUrl('/statistik') },
    ],
    ...extraRows,
  ]);
}

function buildDashboardKeyboard() {
  return buildUrlKeyboard([
    [{ text: '🏠 Buka Dashboard', url: buildDashboardUrl() }],
  ]);
}

function buildPackageActionKeyboard(packages, agentSlug) {
  const inline_keyboard = packages
    .filter(pkg => pkg?.id)
    .map(pkg => {
      const url = buildAgentPackageUrl(agentSlug, pkg.id);
      return [
        { text: '📋 Salin Link', copy_text: { text: url } },
        { text: '👁️ Lihat Paket', url },
      ];
    });

  return inline_keyboard.length > 0 ? { inline_keyboard } : undefined;
}

// Send to a specific agent's Telegram chat ID (for per-agent notifications)
async function sendTelegramToAgent(chatId, message, options = {}) {
  if (!BOT_TOKEN || !chatId) return;
  try {
    const body = {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    };
    if (options.reply_markup) body.reply_markup = options.reply_markup;

    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      warn(`Failed to send to agent chat ${chatId}:`, err);
    }
  } catch (err) {
    warn(`sendTelegramToAgent error for ${chatId}:`, err.message);
  }
}

// Send a photo (Buffer) with optional HTML caption to a specific agent.
// Throws on Telegram API error so callers can fall back to a text message.
async function sendTelegramPhotoToAgent(chatId, photoBuffer, caption, options = {}) {
  if (!BOT_TOKEN || !chatId) throw new Error('Bot token or chat id missing');
  if (!photoBuffer || !photoBuffer.length) throw new Error('Empty photo buffer');

  const filename = options.filename || `kurs.jpg`;
  const mime = options.mime || 'image/jpeg';

  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (caption) {
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
  }
  if (options.reply_markup) {
    form.append('reply_markup', JSON.stringify(options.reply_markup));
  }
  form.append('photo', new Blob([photoBuffer], { type: mime }), filename);

  const res = await fetch(`${TELEGRAM_API}/sendPhoto`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`sendPhoto ${res.status}: ${errText}`);
  }
}

// Broadcast a message to all agents with telegram_chat_id, checking notification_prefs
async function broadcastToAgents(changeType, messageBuilder) {
  try {
    if (!supabaseAdmin) return;

    const { data: agents, error } = await supabaseAdmin
      .from('agents')
      .select('slug, name, telegram_chat_id, notification_prefs')
      .not('telegram_chat_id', 'is', null);

    if (error || !agents || agents.length === 0) return;

    for (const agent of agents) {
      if (agent.notification_prefs?.[changeType] === false) continue;

      const builtMessages = messageBuilder(agent.name, agent.slug, agent);
      const messages = Array.isArray(builtMessages) ? builtMessages : [builtMessages];

      for (const builtMessage of messages) {
        if (!builtMessage) continue;

        const message = typeof builtMessage === 'string' ? builtMessage : builtMessage.text;
        const options = typeof builtMessage === 'string' ? {} : (builtMessage.options || {});
        if (!message) continue;

        try {
          await sendTelegramToAgent(agent.telegram_chat_id, message, options);
        } catch (err) {
          warn(`[broadcast-${changeType}] Failed for ${agent.slug}:`, err.message);
        }
        await new Promise(r => setTimeout(r, 300));
      }
    }
  } catch (err) {
    warn(`[broadcast-${changeType}] Error:`, err.message);
  }
}

async function sendLongMessage(text) {
  text += FOOTER;
  if (text.length <= 4000) {
    await sendTelegramMessage(text);
    return;
  }
  const lines = text.split('\n');
  let chunk = '';
  for (const line of lines) {
    if ((chunk + '\n' + line).length > 3900) {
      await sendTelegramMessage(chunk);
      await sleep(500);
      chunk = line;
    } else {
      chunk += (chunk ? '\n' : '') + line;
    }
  }
  if (chunk) await sendTelegramMessage(chunk);
}

// Resolve the single ops/infra alert recipient (default: agent 'nikita') and cache
// it. Prefers OPS_ALERT_CHAT_ID; otherwise looks up the agent by slug. Resolved at
// startup so a DB-health alert never needs a DB query at send time — the alert
// fires precisely when the DB may be degraded. Best-effort.
async function resolveOpsAlertChatId() {
  if (opsAlertChatId) return opsAlertChatId;
  if (opsAlertResolveTried || !supabaseAdmin) return opsAlertChatId;
  opsAlertResolveTried = true;
  try {
    const { data } = await supabaseAdmin
      .from('agents')
      .select('telegram_chat_id')
      .eq('slug', OPS_ALERT_AGENT_SLUG)
      .maybeSingle();
    if (data?.telegram_chat_id) opsAlertChatId = String(data.telegram_chat_id);
  } catch (err) {
    warn('resolveOpsAlertChatId failed:', err.message);
  }
  return opsAlertChatId;
}

// Ops/infra alert routed to a SINGLE recipient — the ops agent (default 'nikita'),
// NOT the broadcast group. Used by the DB-health canary in server.js. Best-effort.
export async function sendOpsAlert(text) {
  const chatId = opsAlertChatId || await resolveOpsAlertChatId();
  if (!chatId) {
    warn('sendOpsAlert: no ops recipient (set OPS_ALERT_CHAT_ID or agent slug) — dropping alert');
    return;
  }
  await sendTelegramToAgent(chatId, text);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── State Management ────────────────────────────────

async function loadState() {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveState(state) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const tmpFile = STATE_FILE + '.tmp';
  await fs.writeFile(tmpFile, JSON.stringify(state, null, 2));
  await fs.rename(tmpFile, STATE_FILE);
}

function freshState() {
  return {
    lastSnapshot: {},
    sentNotifications: {},
    weeklySnapshot: {},
    queue: [],
    lastWeeklyReport: null,
    sentDepartureReminders: {},
    lastHotDeal: null,
    lastKursSentDate: null,
  };
}

// ─── Data Fetching ───────────────────────────────────

async function fetchAllPackages() {
  const allPackages = [];
  for (const yearCode of YEAR_CODES) {
    try {
      const res = await fetch(buildNotifierPackagesUrl(BASE_URL, yearCode));
      if (!res.ok) { warn(`API error for ${yearCode}: ${res.status}`); continue; }
      const data = await res.json();
      if (data.status !== 'ok' || !Array.isArray(data.aaData)) continue;
      allPackages.push(...data.aaData);
    } catch (err) {
      warn(`Failed to fetch year ${yearCode}:`, err.message);
    }
  }
  return allPackages;
}

// ─── Notification Builders ───────────────────────────

function buildSeatCritical(pkg) {
  const { lowest, roomType } = getLowestPrice(pkg.paket_harga);
  const priceStr = lowest ? `${formatRupiah(lowest)} (${roomType})` : '-';
  return [
    `🔴 <b>SEAT HAMPIR HABIS!</b>`,
    ``,
    `📦 ${escHtml(pkg.jadwal_nama)}`,
    `🔖 Kode: <b>${escHtml(pkg.jadwal_id || '-')}</b>`,
    `📅 ${formatDateShort(pkg.berangkat_tgl)} | ✈️ ${escHtml(pkg.maskapai || '-')}`,
    `💺 Sisa: <b>${seatInt(pkg)}</b> dari ${seatTotal(pkg)} seat`,
    `💰 Mulai ${priceStr}`,
    ``,
    `🔗 https://alhijaz.co/${pkg.jadwal_id}`,
  ].join('\n');
}

function buildSoldOut(pkg, alternatives) {
  let msg = [
    `⛔ <b>SOLD OUT</b>`,
    ``,
    `📦 ${escHtml(pkg.jadwal_nama)}`,
    `🔖 Kode: <b>${escHtml(pkg.jadwal_id || '-')}</b>`,
    `📅 ${formatDateShort(pkg.berangkat_tgl)} | ✈️ ${escHtml(pkg.maskapai || '-')}`,
  ].join('\n');

  if (alternatives.length > 0) {
    msg += '\n\n📌 <b>Alternatif tersedia:</b>';
    for (const alt of alternatives.slice(0, 3)) {
      const { lowest } = getLowestPrice(alt.paket_harga);
      msg += `\n→ ${escHtml(alt.jadwal_nama)} (${formatDateShort(alt.berangkat_tgl)}) — sisa ${seatInt(alt)} seat, mulai ${formatRupiah(lowest)}`;
    }
  }
  return msg;
}

function buildNewPackage(pkg) {
  const { lowest, roomType } = getLowestPrice(pkg.paket_harga);
  const priceStr = lowest ? `${formatRupiah(lowest)} (${roomType})` : '-';
  const hotel = pkg.hotel || {};
  return [
    `🆕 <b>JADWAL BARU!</b>`,
    ``,
    `📦 ${escHtml(pkg.jadwal_nama)}`,
    `🔖 Kode: <b>${escHtml(pkg.jadwal_id || '-')}</b>`,
    `📅 ${formatDateShort(pkg.berangkat_tgl)} | ✈️ ${escHtml(pkg.maskapai || '-')}`,
    `💺 ${seatTotal(pkg)} seat tersedia`,
    `💰 Mulai ${priceStr}`,
    hotel.mekkah_hotel ? `🏨 Mekkah: ${escHtml(hotel.mekkah_hotel)}` : null,
    hotel.madinah_hotel ? `🏨 Madinah: ${escHtml(hotel.madinah_hotel)}` : null,
    ``,
    `🔗 https://alhijaz.co/${pkg.jadwal_id}`,
  ].filter(Boolean).join('\n');
}

function buildPriceChange(pkg, changes) {
  let msg = [
    `💰 <b>HARGA BERUBAH</b>`,
    ``,
    `📦 ${escHtml(pkg.jadwal_nama)}`,
    `🔖 Kode: <b>${escHtml(pkg.jadwal_id || '-')}</b>`,
    `📅 ${formatDateShort(pkg.berangkat_tgl)}`,
    ``,
  ].join('\n');

  for (const c of changes) {
    const diff = c.newPrice - c.oldPrice;
    const direction = diff > 0 ? '⬆️ naik' : '⬇️ turun';
    msg += `\n${escHtml(c.paketType)} - ${escHtml(c.roomType)}: ${formatRupiah(c.oldPrice)} → ${formatRupiah(c.newPrice)} (${direction} ${formatRupiah(Math.abs(diff))})`;
  }
  return msg;
}

function buildPromoNew(pkg) {
  const { lowest, roomType } = getLowestPrice(pkg.paket_harga);
  return [
    `🏷️ <b>PROMO BARU!</b>`,
    ``,
    `📦 ${escHtml(pkg.jadwal_nama)}`,
    `🔖 Kode: <b>${escHtml(pkg.jadwal_id || '-')}</b>`,
    `📅 ${formatDateShort(pkg.berangkat_tgl)} | ✈️ ${escHtml(pkg.maskapai || '-')}`,
    `💺 Sisa: <b>${seatInt(pkg)}</b> seat`,
    `💰 Mulai ${lowest ? formatRupiah(lowest) + ' (' + roomType + ')' : '-'}`,
    ``,
    `🔗 https://alhijaz.co/${pkg.jadwal_id}`,
  ].join('\n');
}

function buildSeatRestock(pkg) {
  const { lowest, roomType } = getLowestPrice(pkg.paket_harga);
  return [
    `📈 <b>SEAT TERSEDIA LAGI!</b>`,
    ``,
    `📦 ${escHtml(pkg.jadwal_nama)}`,
    `🔖 Kode: <b>${escHtml(pkg.jadwal_id || '-')}</b>`,
    `📅 ${formatDateShort(pkg.berangkat_tgl)} | ✈️ ${escHtml(pkg.maskapai || '-')}`,
    `💺 Sekarang tersedia: <b>${seatInt(pkg)}</b> seat`,
    `💰 Mulai ${lowest ? formatRupiah(lowest) + ' (' + roomType + ')' : '-'}`,
    ``,
    `Paket ini sebelumnya sold out. Segera follow up jamaah yang tertunda!`,
    ``,
    `🔗 https://alhijaz.co/${pkg.jadwal_id}`,
  ].join('\n');
}

function buildMilestone(pkg, pct) {
  const { lowest } = getLowestPrice(pkg.paket_harga);
  const sold = seatTotal(pkg) - seatInt(pkg);
  const labels = { 50: '50% TERJUAL', 75: '75% TERJUAL', 90: 'HAMPIR HABIS — 90% TERJUAL' };
  return [
    `🎯 <b>${labels[pct] || pct + '% TERJUAL'}</b>`,
    ``,
    `📦 ${escHtml(pkg.jadwal_nama)}`,
    `🔖 Kode: <b>${escHtml(pkg.jadwal_id || '-')}</b>`,
    `📅 ${formatDateShort(pkg.berangkat_tgl)} | ✈️ ${escHtml(pkg.maskapai || '-')}`,
    `💺 Terjual: <b>${sold}</b> dari ${seatTotal(pkg)} (sisa ${seatInt(pkg)} seat)`,
    `💰 Mulai ${lowest ? formatRupiah(lowest) : '-'}`,
    ``,
    `🔗 https://alhijaz.co/${pkg.jadwal_id}`,
  ].join('\n');
}

function buildDepartureReminder(pkgs, label) {
  let msg = `⏰ <b>PENGINGAT KEBERANGKATAN — ${escHtml(label)}</b>\n`;
  for (const pkg of pkgs) {
    const d = daysDiff(pkg.berangkat_tgl);
    const urgency = d <= 1 ? '🔴' : d <= 3 ? '🟡' : '🟢';
    msg += `\n${urgency} <b>${escHtml(pkg.jadwal_nama)}</b>`;
    msg += `\n   📅 ${formatDate(pkg.berangkat_tgl)}`;
    if (d === 0) msg += ' — <b>HARI INI!</b>';
    else if (d === 1) msg += ' — <b>BESOK!</b>';
    else msg += ` — <b>H-${d}</b>`;
    msg += `\n   ✈️ ${escHtml(pkg.maskapai || '-')} ${escHtml(pkg.berangkat_kode_penerbangan || '')}`;
    msg += `\n   💺 Sisa ${seatInt(pkg)} seat\n`;
  }
  return msg;
}

function buildHotDeal(pkgs) {
  let msg = `⚡ <b>HOT DEAL — BERANGKAT SEBENTAR LAGI!</b>\n`;
  msg += `<i>Paket ini berangkat dalam 14 hari tapi seat masih banyak. Peluang besar untuk closing!</i>\n`;
  for (const pkg of pkgs) {
    const d = daysDiff(pkg.berangkat_tgl);
    const { lowest } = getLowestPrice(pkg.paket_harga);
    msg += `\n📦 <b>${escHtml(pkg.jadwal_nama)}</b>`;
    msg += `\n   📅 ${formatDateShort(pkg.berangkat_tgl)} (H-${d}) | ✈️ ${escHtml(pkg.maskapai || '-')}`;
    msg += `\n   💺 <b>${seatInt(pkg)} seat</b> tersedia | 💰 Mulai ${formatRupiah(lowest)}`;
    msg += `\n   🔗 https://alhijaz.co/${pkg.jadwal_id}\n`;
  }
  return msg;
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── OpenAI Helper ───────────────────────────────────

async function askAI(systemPrompt, userPrompt, maxTokens = 500) {
  if (!OPENAI_KEY) {
    warn('OPENAI_API_KEY not set, skipping AI insight');
    return null;
  }
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
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
        temperature: 0.7,
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) {
      warn('OpenAI API error:', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    warn('OpenAI request failed:', err.message);
    return null;
  }
}

const AI_SYSTEM = `Kamu adalah asisten tim sales travel umroh Alhijaz Indowisata.
Tugasmu membantu agent menjual paket umroh lebih efektif.

ATURAN WAJIB:
- Bahasa Indonesia santai, mudah dipahami orang awam. Jangan pakai istilah teknis.
- SANGAT SINGKAT: maksimal 2-3 kalimat per poin. Langsung ke inti, jangan bertele-tele.
- Jangan pakai markdown. Boleh pakai emoji secukupnya (jangan berlebihan).
- Jangan pakai kata-kata formal seperti "perlu diperhatikan", "disarankan", "berdasarkan analisis".
- Tulis seperti ngobrol sama teman kerja di WhatsApp.`;

// ─── AI: Sold Out Talking Point ──────────────────────

async function aiSoldOutTalkingPoint(soldPkg, alternatives) {
  const altInfo = alternatives.slice(0, 3).map(a => {
    const { lowest } = getLowestPrice(a.paket_harga);
    return `- ${a.jadwal_nama}, ${a.maskapai}, ${formatDateShort(a.berangkat_tgl)}, sisa ${seatInt(a)} seat, mulai ${formatRupiah(lowest)}`;
  }).join('\n');

  const prompt = `Paket umroh "${soldPkg.jadwal_nama}" (${soldPkg.maskapai}, ${formatDateShort(soldPkg.berangkat_tgl)}) baru saja SOLD OUT.

Alternatif yang tersedia:
${altInfo || '(tidak ada alternatif mirip)'}

Kasih 2 kalimat saja: cara ngomong ke jamaah biar mau pindah ke alternatif ini. Singkat & persuasif.`;

  return await askAI(AI_SYSTEM, prompt, 150);
}

// ─── AI: Price Change Analysis ───────────────────────

async function aiPriceAnalysis(pkg, changes) {
  const changeInfo = changes.map(c => {
    const diff = c.newPrice - c.oldPrice;
    return `${c.paketType} ${c.roomType}: ${formatRupiah(c.oldPrice)} → ${formatRupiah(c.newPrice)} (${diff > 0 ? 'naik' : 'turun'} ${formatRupiah(Math.abs(diff))})`;
  }).join('\n');

  const prompt = `Harga paket umroh "${pkg.jadwal_nama}" (${pkg.maskapai}, berangkat ${formatDateShort(pkg.berangkat_tgl)}, sisa ${seatInt(pkg)} seat) berubah:

${changeInfo}

Jawab 2 hal saja, masing-masing 1 kalimat:
1. Kemungkinan kenapa harganya berubah
2. Cara agent manfaatkan ini buat closing`;

  return await askAI(AI_SYSTEM, prompt, 120);
}

// ─── AI: Daily Briefing ──────────────────────────────

async function sendDailyBriefing() {
  try {
    const packages = await fetchAllPackages();
    if (packages.length === 0) return;

    const state = await loadState() || freshState();
    const prevSnap = state.lastSnapshot || {};

    const active = packages.filter(p => seatInt(p) > 0);
    const critical = active.filter(p => seatInt(p) <= SEAT_CRITICAL_ABS);
    const promo = active.filter(p => p.promo === '1');
    const thisWeek = active.filter(p => { const d = daysDiff(p.berangkat_tgl); return d >= 0 && d <= 7; });

    // Seat movement in last 24h
    const movements = [];
    for (const pkg of active) {
      const prev = prevSnap[pkg.jadwal_id];
      if (prev) {
        const diff = prev.seat_sisa - seatInt(pkg);
        if (diff !== 0) movements.push({ nama: pkg.jadwal_nama, maskapai: pkg.maskapai, diff, current: seatInt(pkg) });
      }
    }
    movements.sort((a, b) => b.diff - a.diff);

    // Price range per airline
    const airlines = {};
    for (const p of active) {
      const a = p.maskapai || 'LAINNYA';
      if (!airlines[a]) airlines[a] = { count: 0, seats: 0, minPrice: Infinity };
      airlines[a].count++;
      airlines[a].seats += seatInt(p);
      const { lowest } = getLowestPrice(p.paket_harga);
      if (lowest && lowest < airlines[a].minPrice) airlines[a].minPrice = lowest;
    }

    const dataSummary = `Data hari ini (${formatDate(new Date().toISOString())}):
- Total paket aktif: ${active.length}
- Seat kritis (≤10): ${critical.length} paket
- Promo aktif: ${promo.length} paket
- Berangkat minggu ini: ${thisWeek.length} paket

Per maskapai:
${Object.entries(airlines).map(([a, d]) => `- ${a}: ${d.count} paket, ${d.seats} seat, mulai ${d.minPrice < Infinity ? formatRupiah(d.minPrice) : '-'}`).join('\n')}

Pergerakan seat terbesar (24 jam):
${movements.slice(0, 5).map(m => `- ${m.nama}: ${m.diff > 0 ? '-' + m.diff + ' terjual' : '+' + Math.abs(m.diff) + ' bertambah'} (sisa ${m.current})`).join('\n') || '(belum ada data perubahan)'}

Paket seat kritis:
${critical.slice(0, 5).map(p => `- ${p.jadwal_nama} (${p.maskapai}, ${formatDateShort(p.berangkat_tgl)}): sisa ${seatInt(p)} seat`).join('\n') || '(tidak ada)'}`;

    const aiInsight = await askAI(AI_SYSTEM, `Ini data paket umroh hari ini. Kasih 3 poin singkat untuk tim agent:
1. Paket mana yang paling gampang dijual hari ini & kenapa (1 kalimat)
2. Apa yang harus di-push hari ini (1 kalimat)
3. Satu tips jualan praktis (1 kalimat)

${dataSummary}`, 200);

    let msg = `🌅 <b>BRIEFING PAGI — ${formatDate(new Date().toISOString())}</b>\n\n`;
    msg += `📦 ${active.length} paket aktif | 🔴 ${critical.length} kritis | 🏷️ ${promo.length} promo\n`;

    if (movements.length > 0) {
      msg += `\n📈 <b>Pergerakan 24 Jam:</b>\n`;
      for (const m of movements.slice(0, 3)) {
        if (m.diff > 0) msg += `• ${escHtml(m.nama)} — <b>${m.diff} seat terjual</b> (sisa ${m.current})\n`;
      }
    }

    if (aiInsight) {
      msg += `\n🤖 <b>AI Insight:</b>\n${escHtml(aiInsight)}\n`;
    }

    await sendLongMessage(msg);
    log('✅ Daily briefing sent');
  } catch (err) {
    warn('sendDailyBriefing error:', err.message);
  }
}

// ─── Departure Reminders (H-7, H-3, H-1) ────────────

async function sendDepartureReminders() {
  try {
    const packages = await fetchAllPackages();
    if (packages.length === 0) return;

    const state = await loadState() || freshState();
    if (!state.sentDepartureReminders) state.sentDepartureReminders = {};
    const sent = state.sentDepartureReminders;

    const active = packages.filter(p => seatInt(p) > 0);
    const reminders = [
      { days: 7, label: 'H-7', key: 'h7' },
      { days: 3, label: 'H-3', key: 'h3' },
      { days: 1, label: 'H-1 / BESOK', key: 'h1' },
    ];

    for (const { days, label, key } of reminders) {
      const matched = active.filter(p => daysDiff(p.berangkat_tgl) === days);
      if (matched.length === 0) continue;

      // Filter out already-sent reminders for this milestone
      const unsent = matched.filter(p => {
        const id = p.jadwal_id;
        if (!sent[id]) sent[id] = {};
        if (sent[id][key]) return false;
        sent[id][key] = new Date().toISOString();
        return true;
      });

      if (unsent.length > 0) {
        await sendLongMessage(buildDepartureReminder(unsent, label));
        await sleep(1000);
      }
    }

    state.sentDepartureReminders = sent;
    await saveState(state);
    log('✅ Departure reminders checked');
  } catch (err) {
    warn('sendDepartureReminders error:', err.message);
  }
}

// ─── Agent Departure Reminders — Conversational ─────

const BULAN_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function formatTanggalID(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}

function formatTanggalShortID(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${BULAN_ID[d.getMonth()].substring(0, 3)}`;
}

function titleCase(str) {
  return (str || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function formatPersonName(name) {
  return escHtml(titleCase(name));
}

// ── Pagi (07:00 WIB) — semua milestone, conversational ──

function buildPagiMessage(agentName, milestones) {
  const parts = [];

  // H-1: Paling detail — sebut nama satu-satu
  if (milestones.h1.list.length > 0) {
    const { list } = milestones.h1;
    const names = list.map(j => `→ <b>${formatPersonName(j.nama)}</b>${j.sisa && parseFloat(j.sisa) > 0 ? ' ⚠️ belum lunas' : ''}`);
    parts.push(
      `⚠️ <b>Besok</b> ada ${list.length} jamaah kamu berangkat:\n` +
      names.join('\n') + '\n' +
      'Pastikan dokumen &amp; perlengkapan sudah lengkap ya!'
    );
  }

  // H-3: Nama (max 3) + highlight belum lunas
  if (milestones.h3.list.length > 0) {
    const { list, date } = milestones.h3;
    const belumLunas = list.filter(j => j.sisa && parseFloat(j.sisa) > 0).length;
    const dateStr = formatTanggalShortID(date);
    const shownNames = list.slice(0, 3).map(j =>
      `→ <b>${formatPersonName(j.nama)}</b>${j.sisa && parseFloat(j.sisa) > 0 ? ' ⚠️ belum lunas' : ''}`
    );
    const sisanya = list.length > 3 ? `\n→ dan ${list.length - 3} lainnya` : '';
    const followUp = belumLunas > 0 ? '\nMungkin bisa follow up pembayarannya hari ini?' : '';
    parts.push(
      `3 hari lagi (${dateStr}) ada ${list.length} jamaah, termasuk:\n` +
      shownNames.join('\n') + sisanya + followUp
    );
  }

  // H-7: Jumlah + warning belum lunas
  if (milestones.h7.list.length > 0) {
    const { list, date } = milestones.h7;
    const belumLunas = list.filter(j => j.sisa && parseFloat(j.sisa) > 0).length;
    const dateStr = formatTanggalShortID(date);
    const blNote = belumLunas > 0 ? `, ${belumLunas} belum lunas` : '';
    parts.push(
      `Minggu depan (${dateStr}) ada ${list.length} jamaah berangkat${blNote}. Mulai siapin dokumen dan perlengkapan ya.`
    );
  }

  // H-14: Heads up ringan
  if (milestones.h14.list.length > 0) {
    const { list, date } = milestones.h14;
    const belumLunas = list.filter(j => j.sisa && parseFloat(j.sisa) > 0).length;
    const dateStr = formatTanggalShortID(date);
    const blNote = belumLunas > 0 ? `, ${belumLunas} di antaranya belum lunas` : '';
    parts.push(
      `Heads up — tanggal ${dateStr} ada ${list.length} jamaah${blNote}. Masih ada waktu untuk follow up 🙂`
    );
  }

  if (parts.length === 0) return null;

  return `🕋 Halo <b>${escHtml(agentName)}</b>!\n\n` +
    parts.join('\n\n') +
    '\n\n👥 <i>Gunakan tombol di bawah untuk cek detail jamaah.</i>';
}

async function sendAgentDepartureReminders() {
  if (!supabaseAdmin) {
    warn('Supabase not configured — skipping agent departure reminders');
    return;
  }

  try {
    log('Checking agent departure reminders (pagi)...');

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const addDays = (base, days) => {
      const d = new Date(base + 'T00:00:00+07:00');
      d.setDate(d.getDate() + days);
      return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    };

    const targets = {
      h1:  addDays(todayStr, 1),
      h3:  addDays(todayStr, 3),
      h7:  addDays(todayStr, 7),
      h14: addDays(todayStr, 14),
    };

    const allDates = Object.values(targets);

    const { data: jamaahData, error: jErr } = await supabaseAdmin
      .from('jamaah')
      .select('agent_id, nama, sisa, tgl_berangkat')
      .in('tgl_berangkat', allDates);

    if (jErr) { warn('Failed to query jamaah:', jErr.message); return; }
    if (!jamaahData || jamaahData.length === 0) { log('No jamaah on milestone dates'); return; }

    const { data: agents, error: aErr } = await supabaseAdmin
      .from('agents')
      .select('id, slug, name, telegram_chat_id, notification_prefs')
      .not('telegram_chat_id', 'is', null);

    if (aErr || !agents || agents.length === 0) { log('No agents with telegram_chat_id'); return; }

    const agentMap = {};
    for (const a of agents) { if (a.telegram_chat_id) agentMap[a.id] = a; }

    const state = await loadState() || freshState();
    if (!state.sentDepartureReminders) state.sentDepartureReminders = {};

    // Group jamaah per agent
    const perAgent = {};
    for (const j of jamaahData) {
      if (!agentMap[j.agent_id]) continue;
      if (!perAgent[j.agent_id]) perAgent[j.agent_id] = [];
      perAgent[j.agent_id].push(j);
    }

    let sentCount = 0;

    for (const [slug, jamaahList] of Object.entries(perAgent)) {
      const agent = agentMap[slug];

      // Anti-duplicate per agent per day
      const stateKey = `departure_pagi_${slug}_${todayStr}`;
      if (state.sentDepartureReminders[stateKey]) continue;

      // Check notification preference
      if (agent.notification_prefs?.departure === false) continue;

      // Categorize by milestone
      const h1List  = jamaahList.filter(j => j.tgl_berangkat === targets.h1);
      const h3List  = jamaahList.filter(j => j.tgl_berangkat === targets.h3);
      const h7List  = jamaahList.filter(j => j.tgl_berangkat === targets.h7);
      const h14List = jamaahList.filter(j => j.tgl_berangkat === targets.h14);

      const message = buildPagiMessage(agent.name, {
        h1:  { list: h1List,  date: targets.h1 },
        h3:  { list: h3List,  date: targets.h3 },
        h7:  { list: h7List,  date: targets.h7 },
        h14: { list: h14List, date: targets.h14 },
      });

      if (!message) continue;

      try {
        await sendTelegramToAgent(agent.telegram_chat_id, message, {
          reply_markup: buildJamaahKeyboard(),
        });
        state.sentDepartureReminders[stateKey] = new Date().toISOString();
        sentCount++;
        log(`✅ Departure pagi sent to ${slug}`);
      } catch (err) {
        warn(`Failed to send pagi to ${slug}:`, err.message);
      }

      await sleep(500);
    }

    // Clean up old keys (>30 days)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    for (const [key, sentAt] of Object.entries(state.sentDepartureReminders)) {
      if (new Date(sentAt) < cutoff) delete state.sentDepartureReminders[key];
    }

    await saveState(state);
    log(`✅ Departure pagi done: ${sentCount} agent(s) notified`);
  } catch (err) {
    warn('sendAgentDepartureReminders error:', err.message);
  }
}

// ── Sore (17:00 WIB) — H-1 only, urgent ──

async function departureReminderSore() {
  if (!supabaseAdmin) return;

  try {
    log('Checking departure reminder sore (H-1 only)...');

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const tomorrow = (() => {
      const d = new Date(todayStr + 'T00:00:00+07:00');
      d.setDate(d.getDate() + 1);
      return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    })();

    const { data: jamaahData, error: jErr } = await supabaseAdmin
      .from('jamaah')
      .select('agent_id, nama, sisa, tgl_berangkat')
      .eq('tgl_berangkat', tomorrow);

    if (jErr) { warn('Sore query error:', jErr.message); return; }
    if (!jamaahData || jamaahData.length === 0) { log('No H-1 jamaah for sore reminder'); return; }

    const { data: agents, error: aErr } = await supabaseAdmin
      .from('agents')
      .select('id, slug, name, telegram_chat_id, notification_prefs')
      .not('telegram_chat_id', 'is', null);

    if (aErr || !agents || agents.length === 0) return;

    const agentMap = {};
    for (const a of agents) { if (a.telegram_chat_id) agentMap[a.id] = a; }

    const state = await loadState() || freshState();
    if (!state.sentDepartureReminders) state.sentDepartureReminders = {};

    // Group per agent
    const perAgent = {};
    for (const j of jamaahData) {
      if (!agentMap[j.agent_id]) continue;
      if (!perAgent[j.agent_id]) perAgent[j.agent_id] = [];
      perAgent[j.agent_id].push(j);
    }

    let sentCount = 0;

    for (const [slug, jamaahList] of Object.entries(perAgent)) {
      const agent = agentMap[slug];

      const stateKey = `departure_sore_${slug}_${todayStr}`;
      if (state.sentDepartureReminders[stateKey]) continue;

      // Check notification preference
      if (agent.notification_prefs?.departure === false) continue;

      const names = jamaahList.map(j => `→ <b>${formatPersonName(j.nama)}</b>`).join('\n');

      const message =
        `⏰ <b>Reminder — besok berangkat!</b>\n\n` +
        `<b>${escHtml(agent.name)}</b>, ${jamaahList.length} jamaah kamu berangkat besok pagi:\n` +
        `${names}\n\n` +
        `Pastikan semua sudah ready ya! 🙏\n\n` +
        `👥 <i>Gunakan tombol di bawah untuk cek data jamaah.</i>`;

      try {
        await sendTelegramToAgent(agent.telegram_chat_id, message, {
          reply_markup: buildJamaahKeyboard(),
        });
        state.sentDepartureReminders[stateKey] = new Date().toISOString();
        sentCount++;
        log(`✅ Departure sore sent to ${slug}`);
      } catch (err) {
        warn(`Failed to send sore to ${slug}:`, err.message);
      }

      await sleep(500);
    }

    await saveState(state);
    log(`✅ Departure sore done: ${sentCount} agent(s) notified`);
  } catch (err) {
    warn('departureReminderSore error:', err.message);
  }
}

// ─── Passport Reminder (09:30 WIB) — paspor belum kumpul / expired ─

function buildPassportMessage(agentName, belumKumpul, expired, today) {
  const parts = [];

  // Paspor expired — kritis, tampilkan duluan
  if (expired.length > 0) {
    const names = expired.map(j => {
      const berangkat = formatTanggalID(j.tgl_berangkat);
      return `→ <b>${formatPersonName(j.nama)}</b> (berangkat ${berangkat})`;
    });
    parts.push(
      `🚨 <b>${expired.length} jamaah paspor expired</b> sebelum keberangkatan:\n` +
      names.join('\n') + '\n' +
      'Segera infokan untuk perpanjang paspor!'
    );
  }

  // Paspor belum dikumpulkan
  if (belumKumpul.length > 0) {
    const daysLeft = (dateStr) => {
      const d = new Date(dateStr + 'T00:00:00+07:00');
      const t = new Date(today + 'T00:00:00+07:00');
      return Math.ceil((d - t) / (1000 * 60 * 60 * 24));
    };

    // Sort by soonest departure
    const sorted = [...belumKumpul].sort((a, b) =>
      a.tgl_berangkat.localeCompare(b.tgl_berangkat)
    );

    const names = sorted.map(j => {
      const hari = daysLeft(j.tgl_berangkat);
      return `→ <b>${formatPersonName(j.nama)}</b> — berangkat ${hari} hari lagi`;
    });

    parts.push(
      `📋 <b>${belumKumpul.length} jamaah belum kumpul paspor</b>:\n` +
      names.join('\n') + '\n' +
      'Yuk di-follow up supaya proses visa lancar.'
    );
  }

  if (parts.length === 0) return null;

  return `📛 Halo <b>${escHtml(agentName)}</b>!\n\n` +
    parts.join('\n\n') +
    '\n\n👥 <i>Gunakan tombol di bawah untuk buka data jamaah.</i>';
}

async function passportReminder() {
  try {
    if (!supabaseAdmin) { warn('passportReminder: no supabaseAdmin'); return; }

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const addDays = (dateStr, days) => {
      const d = new Date(dateStr + 'T00:00:00+07:00');
      d.setDate(d.getDate() + days);
      return d.toISOString().split('T')[0];
    };
    const maxDate = addDays(today, 30);

    // Query jamaah berangkat dalam 30 hari ke depan
    const { data: jamaahData, error: jError } = await supabaseAdmin
      .from('jamaah')
      .select('agent_id, nama, tgl_berangkat, dokumen, paspor_expired, no_paspor')
      .gte('tgl_berangkat', today)
      .lte('tgl_berangkat', maxDate);

    if (jError) throw jError;
    if (!jamaahData || jamaahData.length === 0) { log('[passport] No jamaah departing within 30 days'); return; }

    // Filter: paspor belum dikumpulkan ATAU paspor expired sebelum berangkat
    // Paspor dianggap sudah dikumpulkan jika SALAH SATU:
    //   - dokumen.paspor === true (checkbox di legacy system), ATAU
    //   - no_paspor ada isi (nomor paspor sudah di-input)
    const problemJamaah = jamaahData.filter(j => {
      const pasporCollected = j.dokumen?.paspor === true || (j.no_paspor && j.no_paspor.trim() !== '');
      const pasporExpiredBeforeDepart = j.paspor_expired && j.tgl_berangkat
        && j.paspor_expired < j.tgl_berangkat;
      return !pasporCollected || pasporExpiredBeforeDepart;
    });

    if (problemJamaah.length === 0) { log('[passport] All passports OK'); return; }

    // Query agents dengan telegram_chat_id
    const { data: agents, error: aError } = await supabaseAdmin
      .from('agents')
      .select('id, slug, name, telegram_chat_id, notification_prefs')
      .not('telegram_chat_id', 'is', null);

    if (aError) throw aError;
    if (!agents || agents.length === 0) return;

    const agentMap = {};
    agents.forEach(a => { agentMap[a.id] = a; });

    // Group per agent
    const perAgent = {};
    problemJamaah.forEach(j => {
      if (!agentMap[j.agent_id]) return;
      if (!perAgent[j.agent_id]) perAgent[j.agent_id] = [];
      perAgent[j.agent_id].push(j);
    });

    const state = await loadState() || freshState();
    let sentCount = 0;

    for (const [slug, jamaahList] of Object.entries(perAgent)) {
      const agent = agentMap[slug];

      // Anti-duplikat per hari
      const stateKey = `paspor_${slug}_${today}`;
      if (state.sentDepartureReminders?.[stateKey]) continue;

      // Check notification preference
      if (agent.notification_prefs?.paspor === false) continue;

      // Paspor dianggap collected jika checkbox ATAU nomor paspor ada
      const belumKumpul = jamaahList.filter(j => j.dokumen?.paspor !== true && !(j.no_paspor && j.no_paspor.trim() !== ''));
      const expired = jamaahList.filter(j => {
        const collected = j.dokumen?.paspor === true || (j.no_paspor && j.no_paspor.trim() !== '');
        return collected
          && j.paspor_expired
          && j.paspor_expired < j.tgl_berangkat;
      });

      const message = buildPassportMessage(agent.name, belumKumpul, expired, today);
      if (!message) continue;

      try {
        await sendTelegramToAgent(agent.telegram_chat_id, message, {
          reply_markup: buildJamaahKeyboard(),
        });
        if (!state.sentDepartureReminders) state.sentDepartureReminders = {};
        state.sentDepartureReminders[stateKey] = new Date().toISOString();
        sentCount++;
        log(`✅ Passport reminder sent to ${slug}`);
      } catch (err) {
        warn(`Failed passport reminder to ${slug}:`, err.message);
      }

      await new Promise(r => setTimeout(r, 500));
    }

    await saveState(state);
    log(`✅ Passport reminder done: ${sentCount} agent(s) notified`);
  } catch (err) {
    warn('passportReminder error:', err.message);
  }
}

// ─── Pelunasan Reminder (10:30 WIB) — deadline H-30 ────────────────

function daysUntilDate(dateStr, todayStr) {
  const target = new Date(dateStr + 'T00:00:00+07:00');
  const today = new Date(todayStr + 'T00:00:00+07:00');
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

// Mitigasi guard-bug (2026-06-05): kolom `sisa` bisa stuck >0 padahal payload AWAPI
// terakhir sudah melaporkan lunas — bayar agregat level-booking membuat bayar_sisa
// negatif + bayar_status "LEBIH BAYAR", dan guard sync mempertahankan nilai DP lama.
// Jangan pernah menagih jamaah yang upstream-nya sudah lapor lunas.
function isUpstreamLunas(row) {
  const status = String(row?.awapi_bayar_status || '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (status === 'LUNAS' || status === 'LEBIH BAYAR') return true;
  const rawSisa = Number(row?.awapi_bayar_sisa);
  return Number.isFinite(rawSisa) && rawSisa < 0;
}

function collapsePelunasanBookings(rows) {
  const byBooking = new Map();

  for (const row of rows) {
    const fallbackKey = `${row.tgl_berangkat || ''}:${String(row.nama || '').trim().toLowerCase()}`;
    const key = `${row.agent_id}:${row.id_umroh || fallbackKey}`;
    const sisa = Number(row.sisa || 0);
    const bayar = Number(row.bayar || 0);

    if (!byBooking.has(key)) {
      byBooking.set(key, {
        agent_id: row.agent_id,
        id_umroh: row.id_umroh || null,
        paket: row.paket || '',
        tgl_berangkat: row.tgl_berangkat,
        sisa,
        bayar,
        names: row.nama ? [row.nama] : [],
        memberCount: 1,
      });
      continue;
    }

    const existing = byBooking.get(key);
    existing.sisa = Math.max(Number(existing.sisa || 0), sisa);
    existing.bayar = Math.max(Number(existing.bayar || 0), bayar);
    if (!existing.paket && row.paket) existing.paket = row.paket;
    if (!existing.tgl_berangkat && row.tgl_berangkat) existing.tgl_berangkat = row.tgl_berangkat;
    if (row.nama && !existing.names.some(n => n.toLowerCase() === row.nama.toLowerCase())) {
      existing.names.push(row.nama);
    }
    existing.memberCount += 1;
  }

  return Array.from(byBooking.values());
}

function buildPelunasanMessage(agentName, bookings, today) {
  const sorted = [...bookings].sort((a, b) => {
    const dateCompare = String(a.tgl_berangkat || '').localeCompare(String(b.tgl_berangkat || ''));
    if (dateCompare !== 0) return dateCompare;
    return Number(b.sisa || 0) - Number(a.sisa || 0);
  });

  const getDeadlineInfo = (booking) => {
    const daysToDepart = daysUntilDate(booking.tgl_berangkat, today);
    const daysToDeadline = daysToDepart - 30;
    if (daysToDeadline > 0) return { urgency: 1, text: `deadline ${daysToDeadline} hari lagi`, daysToDepart };
    if (daysToDeadline === 0) return { urgency: 2, text: 'deadline hari ini', daysToDepart };
    return { urgency: 3, text: `lewat deadline ${Math.abs(daysToDeadline)} hari`, daysToDepart };
  };

  const overdue = sorted.filter(b => getDeadlineInfo(b).urgency === 3);
  const dueToday = sorted.filter(b => getDeadlineInfo(b).urgency === 2);
  const dueSoon = sorted.filter(b => getDeadlineInfo(b).urgency === 1);
  const ordered = [...overdue, ...dueToday, ...dueSoon];
  const shown = ordered.slice(0, 8);
  const remaining = ordered.length - shown.length;
  const totalSisa = sorted.reduce((sum, b) => sum + Number(b.sisa || 0), 0);

  const lines = shown.map(booking => {
    const info = getDeadlineInfo(booking);
    const primaryName = booking.names[0] || 'Tanpa nama';
    const extraNames = booking.memberCount > 1 ? ` +${booking.memberCount - 1} jamaah` : '';
    const paket = booking.paket ? ` — ${escHtml(booking.paket)}` : '';
    const departLabel = info.daysToDepart === 0 ? 'berangkat hari ini' : `H-${info.daysToDepart}`;
    return `→ <b>${formatPersonName(primaryName)}</b>${extraNames}${paket}\n` +
      `   ${formatTanggalShortID(booking.tgl_berangkat)} (${departLabel}) • ${info.text} • sisa <b>${fmtRpShort(Number(booking.sisa || 0))}</b>`;
  });

  const remainingLine = remaining > 0 ? `\n→ dan ${remaining} pendaftaran lainnya` : '';
  const summary = [
    overdue.length > 0 ? `🚨 ${overdue.length} lewat deadline H-30` : null,
    dueToday.length > 0 ? `⏰ ${dueToday.length} deadline hari ini` : null,
    dueSoon.length > 0 ? `📌 ${dueSoon.length} deadline dalam 5 hari` : null,
  ].filter(Boolean).join('\n');

  return `💰 Halo <b>${escHtml(agentName)}</b>!\n\n` +
    `<b>Reminder pelunasan jamaah</b>\n` +
    `Pelunasan maksimal H-30 sebelum keberangkatan.\n\n` +
    (summary ? `${summary}\n\n` : '') +
    lines.join('\n') + remainingLine + '\n\n' +
    `Total sisa yang perlu difollow up: <b>${fmtRpShort(totalSisa)}</b>\n\n` +
    '👥 <i>Gunakan tombol di bawah untuk buka data jamaah.</i>';
}

async function pelunasanReminder() {
  try {
    if (!supabaseAdmin) { warn('pelunasanReminder: no supabaseAdmin'); return; }

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const addDays = (dateStr, days) => {
      const d = new Date(dateStr + 'T00:00:00+07:00');
      d.setDate(d.getDate() + days);
      return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    };
    const maxDate = addDays(today, 35);

    const { data: jamaahData, error: jError } = await supabaseAdmin
      .from('jamaah')
      .select('agent_id, id_umroh, nama, paket, bayar, sisa, tgl_berangkat, awapi_bayar_status:raw_data->>bayar_status, awapi_bayar_sisa:raw_data->>bayar_sisa')
      .gte('tgl_berangkat', today)
      .lte('tgl_berangkat', maxDate)
      .gt('sisa', 0)
      .gt('bayar', 0);

    if (jError) throw jError;

    const outstanding = (jamaahData || []).filter((j) => !isUpstreamLunas(j));
    const skippedLunas = (jamaahData?.length || 0) - outstanding.length;
    if (skippedLunas > 0) log(`[pelunasan] Skipped ${skippedLunas} row(s) already lunas upstream (stale sisa)`);
    if (outstanding.length === 0) { log('[pelunasan] No outstanding payments near H-30 deadline'); return; }

    const { data: agents, error: aError } = await supabaseAdmin
      .from('agents')
      .select('id, slug, name, telegram_chat_id, notification_prefs')
      .not('telegram_chat_id', 'is', null);

    if (aError) throw aError;
    if (!agents || agents.length === 0) return;

    const agentMap = {};
    agents.forEach(a => { agentMap[a.id] = a; });

    const bookings = collapsePelunasanBookings(outstanding);
    const perAgent = {};
    bookings.forEach(booking => {
      if (!agentMap[booking.agent_id]) return;
      if (!perAgent[booking.agent_id]) perAgent[booking.agent_id] = [];
      perAgent[booking.agent_id].push(booking);
    });

    const state = await loadState() || freshState();
    if (!state.sentDepartureReminders) state.sentDepartureReminders = {};

    let sentCount = 0;

    for (const [agentId, bookingList] of Object.entries(perAgent)) {
      const agent = agentMap[agentId];
      const stateKey = `pelunasan_${agent.slug}_${today}`;
      if (state.sentDepartureReminders[stateKey]) continue;

      if (agent.notification_prefs?.pelunasan === false) continue;

      const message = buildPelunasanMessage(agent.name, bookingList, today);
      if (!message) continue;

      try {
        await sendTelegramToAgent(agent.telegram_chat_id, message, {
          reply_markup: buildJamaahKeyboard(),
        });
        state.sentDepartureReminders[stateKey] = new Date().toISOString();
        sentCount++;
        log(`✅ Pelunasan reminder sent to ${agent.slug}`);
      } catch (err) {
        warn(`Failed pelunasan reminder to ${agent.slug}:`, err.message);
      }

      await new Promise(r => setTimeout(r, 500));
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 45);
    for (const [key, sentAt] of Object.entries(state.sentDepartureReminders)) {
      if (key.startsWith('pelunasan_') && new Date(sentAt) < cutoff) {
        delete state.sentDepartureReminders[key];
      }
    }

    await saveState(state);
    log(`✅ Pelunasan reminder done: ${sentCount} agent(s) notified`);
  } catch (err) {
    warn('pelunasanReminder error:', err.message);
  }
}

// ─── Manasik Reminder H-3 (14:00 WIB) ───────────────

const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function formatTanggalLengkap(dateStr) {
  const d = new Date(dateStr + 'T00:00:00+07:00');
  return `${HARI_ID[d.getDay()]}, ${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}

function buildManasikMessage(events, manasikDate) {
  const dateStr = formatTanggalLengkap(manasikDate);

  const details = events.map(e => {
    const parts = [];
    if (e.group_number) parts.push(`Group ${escHtml(e.group_number)}`);
    if (e.paket) parts.push(escHtml(e.paket));
    if (e.pax) parts.push(`${e.pax} jamaah`);
    if (e.jam) parts.push(`jam ${escHtml(e.jam)}`);
    return `→ ${parts.join(' • ') || 'Jadwal manasik'}`;
  });

  return `🕌 <b>Manasik 3 hari lagi!</b>\n\n` +
    `📅 <b>${dateStr}</b>\n\n` +
    details.join('\n') + '\n\n' +
    'Jangan lupa kabari jamaah yang ikut manasik ya! Ingatkan waktu, tempat, dan perlengkapan yang perlu dibawa. 🙏\n\n' +
    '🏠 <i>Gunakan tombol di bawah untuk buka dashboard.</i>';
}

async function manasikReminder() {
  try {
    if (!supabaseAdmin) { warn('manasikReminder: no supabaseAdmin'); return; }

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const addDays = (dateStr, days) => {
      const d = new Date(dateStr + 'T00:00:00+07:00');
      d.setDate(d.getDate() + days);
      return d.toISOString().split('T')[0];
    };
    const targetDate = addDays(today, 3);

    // Query manasik events H-3
    const { data: events, error: eError } = await supabaseAdmin
      .from('calendar_events')
      .select('*')
      .eq('event_type', 'manasik')
      .eq('event_date', targetDate);

    if (eError) throw eError;
    if (!events || events.length === 0) { log('[manasik] No manasik events on ' + targetDate); return; }

    // Query agents dengan telegram_chat_id
    const { data: agents, error: aError } = await supabaseAdmin
      .from('agents')
      .select('slug, name, telegram_chat_id, notification_prefs')
      .not('telegram_chat_id', 'is', null);

    if (aError) throw aError;
    if (!agents || agents.length === 0) return;

    const message = buildManasikMessage(events, targetDate);
    if (!message) return;

    const state = await loadState() || freshState();
    let sentCount = 0;

    for (const agent of agents) {
      const stateKey = `manasik_${agent.slug}_${targetDate}`;
      if (state.sentDepartureReminders?.[stateKey]) continue;

      // Check notification preference
      if (agent.notification_prefs?.manasik === false) continue;

      try {
        await sendTelegramToAgent(agent.telegram_chat_id, message, {
          reply_markup: buildDashboardKeyboard(),
        });
        if (!state.sentDepartureReminders) state.sentDepartureReminders = {};
        state.sentDepartureReminders[stateKey] = new Date().toISOString();
        sentCount++;
        log(`✅ Manasik reminder sent to ${agent.slug}`);
      } catch (err) {
        warn(`Failed manasik reminder to ${agent.slug}:`, err.message);
      }

      await new Promise(r => setTimeout(r, 500));
    }

    await saveState(state);
    log(`✅ Manasik reminder done: ${sentCount} agent(s) notified`);
  } catch (err) {
    warn('manasikReminder error:', err.message);
  }
}

// ─── Perlengkapan Reminder (Senin 11:00 WIB) ────────

function buildPerlengkapanMessage(agentName, jamaahList, today) {
  const daysLeft = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00+07:00');
    const t = new Date(today + 'T00:00:00+07:00');
    return Math.ceil((d - t) / (1000 * 60 * 60 * 24));
  };

  const getMissing = (perlengkapan) => {
    if (!perlengkapan) return ['semua'];
    return Object.entries(perlengkapan)
      .filter(([, v]) => v === false)
      .map(([k]) => k.replace(/_/g, ' '));
  };

  const shown = jamaahList.slice(0, 5);
  const remaining = jamaahList.length - shown.length;

  const lines = shown.map(j => {
    const hari = daysLeft(j.tgl_berangkat);
    const missing = getMissing(j.perlengkapan);
    const missingStr = missing.length <= 3
      ? missing.join(', ')
      : `${missing.slice(0, 3).join(', ')} +${missing.length - 3} lainnya`;
    return `→ <b>${formatPersonName(j.nama)}</b> (${hari} hari lagi)\n   Kurang: ${escHtml(missingStr)}`;
  });

  const sisanya = remaining > 0 ? `\n→ dan ${remaining} jamaah lainnya` : '';

  return `📦 Halo <b>${escHtml(agentName)}</b>!\n\n` +
    `<b>${jamaahList.length} jamaah</b> perlengkapannya belum lengkap dan berangkat dalam 30 hari:\n\n` +
    lines.join('\n') + sisanya + '\n\n' +
    'Yuk diinfokan supaya jamaah bisa siapin sebelum berangkat 🙏\n\n' +
    '👥 <i>Gunakan tombol di bawah untuk buka data jamaah.</i>';
}

async function perlengkapanReminder() {
  try {
    if (!supabaseAdmin) { warn('perlengkapanReminder: no supabaseAdmin'); return; }

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const addDays = (dateStr, days) => {
      const d = new Date(dateStr + 'T00:00:00+07:00');
      d.setDate(d.getDate() + days);
      return d.toISOString().split('T')[0];
    };
    const maxDate = addDays(today, 30);

    const { data: jamaahData, error: jError } = await supabaseAdmin
      .from('jamaah')
      .select('agent_id, nama, tgl_berangkat, perlengkapan')
      .gte('tgl_berangkat', today)
      .lte('tgl_berangkat', maxDate);

    if (jError) throw jError;
    if (!jamaahData || jamaahData.length === 0) { log('[perlengkapan] No jamaah departing within 30 days'); return; }

    // Filter: perlengkapan belum lengkap
    const incomplete = jamaahData.filter(j => {
      if (!j.perlengkapan) return true;
      return Object.values(j.perlengkapan).some(v => v === false);
    });

    if (incomplete.length === 0) { log('[perlengkapan] All equipment complete'); return; }

    const { data: agents, error: aError } = await supabaseAdmin
      .from('agents')
      .select('id, slug, name, telegram_chat_id, notification_prefs')
      .not('telegram_chat_id', 'is', null);

    if (aError) throw aError;
    if (!agents || agents.length === 0) return;

    const agentMap = {};
    agents.forEach(a => { agentMap[a.id] = a; });

    const perAgent = {};
    incomplete.forEach(j => {
      if (!agentMap[j.agent_id]) return;
      if (!perAgent[j.agent_id]) perAgent[j.agent_id] = [];
      perAgent[j.agent_id].push(j);
    });

    const state = await loadState() || freshState();
    let sentCount = 0;

    for (const [slug, jamaahList] of Object.entries(perAgent)) {
      const agent = agentMap[slug];

      const stateKey = `perlengkapan_${slug}_${today}`;
      if (state.sentDepartureReminders?.[stateKey]) continue;

      // Check notification preference
      if (agent.notification_prefs?.perlengkapan === false) continue;

      const sorted = [...jamaahList].sort((a, b) =>
        a.tgl_berangkat.localeCompare(b.tgl_berangkat)
      );

      const message = buildPerlengkapanMessage(agent.name, sorted, today);
      if (!message) continue;

      try {
        await sendTelegramToAgent(agent.telegram_chat_id, message, {
          reply_markup: buildJamaahKeyboard(),
        });
        if (!state.sentDepartureReminders) state.sentDepartureReminders = {};
        state.sentDepartureReminders[stateKey] = new Date().toISOString();
        sentCount++;
        log(`✅ Perlengkapan reminder sent to ${slug}`);
      } catch (err) {
        warn(`Failed perlengkapan reminder to ${slug}:`, err.message);
      }

      await new Promise(r => setTimeout(r, 500));
    }

    await saveState(state);
    log(`✅ Perlengkapan reminder done: ${sentCount} agent(s) notified`);
  } catch (err) {
    warn('perlengkapanReminder error:', err.message);
  }
}

// ─── Ringkasan Mingguan (Senin 10:00 WIB) ─────────

function fmtRpShort(amount) {
  if (amount >= 1_000_000_000) return `Rp${(amount / 1_000_000_000).toFixed(1)}M`;
  if (amount >= 1_000_000) return `Rp${(amount / 1_000_000).toFixed(1)}jt`;
  if (amount >= 1_000) return `Rp${(amount / 1_000).toFixed(0)}rb`;
  return `Rp${amount}`;
}

function buildWeeklyMessage(agentName, stats) {
  const parts = [];

  parts.push(`📊 <b>Ringkasan Minggu Ini</b>`);

  parts.push(
    `👥 Total jamaah: <b>${stats.total}</b>\n` +
    `✅ Lunas: ${stats.lunas} • ⏳ Belum lunas: ${stats.belumLunas}` +
    (stats.totalOutstanding > 0 ? `\n💰 Total outstanding: <b>${fmtRpShort(stats.totalOutstanding)}</b>` : '')
  );

  const weekItems = [];
  if (stats.berangkatMingguIni > 0) weekItems.push(`🕋 ${stats.berangkatMingguIni} jamaah berangkat`);
  if (stats.manasikCount > 0) weekItems.push(`🕌 ${stats.manasikCount} jadwal manasik`);
  if (stats.keberangkatanCount > 0 && stats.berangkatMingguIni === 0) weekItems.push(`✈️ ${stats.keberangkatanCount} group berangkat`);
  if (weekItems.length > 0) {
    parts.push(`<b>Minggu ini:</b>\n` + weekItems.join('\n'));
  } else {
    parts.push(`<b>Minggu ini:</b> Tidak ada keberangkatan atau manasik.`);
  }

  const actions = [];
  if (stats.belumPaspor > 0) actions.push(`📛 ${stats.belumPaspor} jamaah belum kumpul paspor`);
  if (stats.belumPerlengkapan > 0) actions.push(`📦 ${stats.belumPerlengkapan} jamaah perlengkapan belum lengkap`);
  if (stats.belumLunas > 0) actions.push(`💰 ${stats.belumLunas} jamaah belum lunas`);
  if (actions.length > 0) {
    parts.push(`<b>Perlu follow up:</b>\n` + actions.join('\n'));
  }

  return `👋 Halo <b>${escHtml(agentName)}</b>!\n\n` +
    parts.join('\n\n') +
    '\n\nSemangat minggu ini! 💪\n🏠 <i>Gunakan tombol di bawah untuk buka dashboard.</i>';
}

async function weeklySummary() {
  try {
    if (!supabaseAdmin) { warn('weeklySummary: no supabaseAdmin'); return; }

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const addDays = (dateStr, days) => {
      const d = new Date(dateStr + 'T00:00:00+07:00');
      d.setDate(d.getDate() + days);
      return d.toISOString().split('T')[0];
    };
    const endOfWeek = addDays(today, 7);
    const endOfMonth = addDays(today, 30);

    const { data: agents, error: aError } = await supabaseAdmin
      .from('agents')
      .select('id, slug, name, telegram_chat_id, notification_prefs')
      .not('telegram_chat_id', 'is', null);

    if (aError) throw aError;
    if (!agents || agents.length === 0) return;

    const state = await loadState() || freshState();
    let sentCount = 0;

    for (const agent of agents) {
      const stateKey = `weekly_${agent.slug}_${today}`;
      if (state.sentDepartureReminders?.[stateKey]) continue;

      if (agent.notification_prefs?.ringkasan_mingguan === false) continue;

      const { data: jamaahData, error: jError } = await supabaseAdmin
        .from('jamaah')
        .select('nama, sisa, tgl_berangkat, dokumen, perlengkapan, no_paspor')
        .eq('agent_id', agent.id);

      if (jError) { warn(`[weekly] Error fetching jamaah for ${agent.slug}:`, jError.message); continue; }
      if (!jamaahData || jamaahData.length === 0) continue;

      const total = jamaahData.length;
      const lunas = jamaahData.filter(j => !j.sisa || j.sisa === 0).length;
      const belumLunas = jamaahData.filter(j => j.sisa && j.sisa > 0).length;
      const totalOutstanding = jamaahData.reduce((sum, j) => sum + (j.sisa || 0), 0);

      const berangkatMingguIni = jamaahData.filter(j =>
        j.tgl_berangkat && j.tgl_berangkat >= today && j.tgl_berangkat < endOfWeek
      );
      const berangkatBulanIni = jamaahData.filter(j =>
        j.tgl_berangkat && j.tgl_berangkat >= today && j.tgl_berangkat <= endOfMonth
      );
      const belumPaspor = berangkatBulanIni.filter(j => j.dokumen?.paspor !== true && !(j.no_paspor && j.no_paspor.trim() !== ''));
      const belumPerlengkapan = berangkatBulanIni.filter(j => {
        if (!j.perlengkapan) return true;
        return Object.values(j.perlengkapan).some(v => v === false);
      });

      const { data: events } = await supabaseAdmin
        .from('calendar_events')
        .select('event_type, event_date, group_number, pax')
        .gte('event_date', today)
        .lt('event_date', endOfWeek);

      const manasikCount = (events || []).filter(e => e.event_type === 'manasik').length;
      const keberangkatanCount = (events || []).filter(e => e.event_type === 'keberangkatan').length;

      const message = buildWeeklyMessage(agent.name, {
        total, lunas, belumLunas, totalOutstanding,
        berangkatMingguIni: berangkatMingguIni.length,
        berangkatBulanIni: berangkatBulanIni.length,
        belumPaspor: belumPaspor.length,
        belumPerlengkapan: belumPerlengkapan.length,
        manasikCount, keberangkatanCount,
      });

      try {
        await sendTelegramToAgent(agent.telegram_chat_id, message, {
          reply_markup: buildJamaahKeyboard([
            [{ text: '🏠 Buka Dashboard', url: buildDashboardUrl() }],
          ]),
        });
        if (!state.sentDepartureReminders) state.sentDepartureReminders = {};
        state.sentDepartureReminders[stateKey] = new Date().toISOString();
        sentCount++;
        log(`✅ Weekly summary sent to ${agent.slug}`);
      } catch (err) {
        warn(`Failed weekly summary to ${agent.slug}:`, err.message);
      }

      await new Promise(r => setTimeout(r, 500));
    }

    await saveState(state);
    log(`✅ Weekly summary done: ${sentCount} agent(s) notified`);
  } catch (err) {
    warn('weeklySummary error:', err.message);
  }
}

// ─── Jamaah Sync Events (triggered by sync) ────────

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function prefEnabled(prefs, key, legacyKey = null) {
  if (prefs?.[key] === false) return false;
  if (!hasOwn(prefs, key) && legacyKey && prefs?.[legacyKey] === false) return false;
  return true;
}

function formatTanggalMaybe(dateStr) {
  if (!dateStr) return '-';
  const dateKey = String(dateStr).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return '-';
  try {
    const d = new Date(dateKey + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return '-';
    return formatTanggalShortID(dateKey);
  } catch {
    return '-';
  }
}

function appendRemaining(lines, total, shown) {
  if (total > shown) lines.push(`→ dan ${total - shown} lainnya`);
  return lines;
}

function buildJamaahBaruMessage(agentName, jamaahList) {
  const shown = jamaahList.slice(0, 8);
  const lines = shown.map(j => {
    const meta = [
      j.paket ? escHtml(j.paket) : null,
      j.tglBerangkat ? `berangkat ${formatTanggalMaybe(j.tglBerangkat)}` : null,
      j.idUmroh ? `ID <code>${escHtml(j.idUmroh)}</code>` : null,
    ].filter(Boolean).join(' • ');
    return `→ <b>${formatPersonName(j.nama)}</b>${meta ? `\n   ${meta}` : ''}`;
  });
  appendRemaining(lines, jamaahList.length, shown.length);

  return `🆕 Halo <b>${escHtml(agentName)}</b>!\n\n` +
    `<b>${jamaahList.length} jamaah baru terdeteksi</b>\n\n` +
    lines.join('\n') + '\n\n' +
    '👥 <i>Gunakan tombol di bawah untuk cek detail jamaah.</i>';
}

function formatPaymentAmount(p) {
  const amount = Number(p.jumlah || 0);
  return amount > 0 ? `+${fmtRpShort(amount)}` : 'status lunas';
}

function buildPembayaranMessage(agentName, pembayaranList, kind) {
  const shown = pembayaranList.slice(0, 8);
  const lines = shown.map(p => {
    const total = Number(p.totalBayar || 0) > 0 ? `total ${fmtRpShort(Number(p.totalBayar || 0))}` : null;
    const sisa = Number(p.sisa || 0) > 0 ? `sisa ${fmtRpShort(Number(p.sisa || 0))}` : 'LUNAS';
    const berangkat = p.tglBerangkat ? `berangkat ${formatTanggalMaybe(p.tglBerangkat)}` : null;
    const meta = [total, sisa, berangkat].filter(Boolean).join(' • ');
    return `→ <b>${formatPersonName(p.nama)}</b> — <b>${formatPaymentAmount(p)}</b>\n   ${meta}`;
  });
  appendRemaining(lines, pembayaranList.length, shown.length);

  const totalMasuk = pembayaranList.reduce((sum, p) => sum + Number(p.jumlah || 0), 0);
  const title = kind === 'pelunasan'
    ? '🎉 <b>Pelunasan masuk!</b>'
    : '💵 <b>Pembayaran cicilan masuk!</b>';
  const footer = totalMasuk > 0
    ? `\n\nTotal masuk: <b>${fmtRpShort(totalMasuk)}</b>`
    : '';

  return `Halo <b>${escHtml(agentName)}</b>!\n\n` +
    title + '\n\n' +
    lines.join('\n') +
    footer + '\n\n' +
    '👥 <i>Gunakan tombol di bawah untuk cek detail jamaah.</i>';
}

async function notifyJamaahSyncEvents(agentId, events) {
  try {
    if (!supabaseAdmin || !events) return;

    const { data: agent, error } = await supabaseAdmin
      .from('agents')
      .select('id, slug, name, telegram_chat_id, notification_prefs')
      .eq('id', agentId)
      .single();

    if (error || !agent) return;
    if (!agent.telegram_chat_id) return;

    const prefs = agent.notification_prefs || {};
    const messages = [];

    if ((events.jamaahBaru || []).length > 0 && prefEnabled(prefs, 'jamaah_baru')) {
      messages.push(buildJamaahBaruMessage(agent.name, events.jamaahBaru));
    }
    if ((events.pembayaranCicilan || []).length > 0 && prefEnabled(prefs, 'pembayaran_cicilan', 'pembayaran_masuk')) {
      messages.push(buildPembayaranMessage(agent.name, events.pembayaranCicilan, 'cicilan'));
    }
    if ((events.pembayaranPelunasan || []).length > 0 && prefEnabled(prefs, 'pembayaran_pelunasan', 'pembayaran_masuk')) {
      messages.push(buildPembayaranMessage(agent.name, events.pembayaranPelunasan, 'pelunasan'));
    }

    for (const message of messages) {
      if (!message) continue;
      await sendTelegramToAgent(agent.telegram_chat_id, message, {
        reply_markup: buildJamaahKeyboard(),
      });
      await sleep(300);
    }

    if (messages.length > 0) {
      log(`✅ Jamaah sync notif sent to ${agent.slug}: ${messages.length} message(s)`);
    }
  } catch (err) {
    warn(`[jamaah-sync-notif] Error for ${agentId}:`, err.message);
  }
}

async function notifyPembayaranMasuk(agentId, pembayaranList) {
  const events = emptyPaymentEventsFromLegacy(pembayaranList);
  return notifyJamaahSyncEvents(agentId, events);
}

function emptyPaymentEventsFromLegacy(pembayaranList) {
  const events = { jamaahBaru: [], pembayaranCicilan: [], pembayaranPelunasan: [] };
  for (const p of pembayaranList || []) {
    if (p.isLunas) events.pembayaranPelunasan.push(p);
    else events.pembayaranCicilan.push(p);
  }
  return events;
}

// ─── Hot Deal (berangkat < 14 hari, seat masih banyak) ─

async function sendHotDeals() {
  try {
    const packages = await fetchAllPackages();
    if (packages.length === 0) return;

    const state = await loadState() || freshState();
    const today = new Date().toISOString().slice(0, 10);

    // Only send once per day
    if (state.lastHotDeal === today) return;

    const active = packages.filter(p => seatInt(p) > 0);
    const hotDeals = active.filter(p => {
      const d = daysDiff(p.berangkat_tgl);
      const total = seatTotal(p);
      const sisa = seatInt(p);
      // Berangkat dalam 14 hari & seat masih > 50% tersedia
      return d > 0 && d <= 14 && total > 0 && (sisa / total) > 0.5;
    }).sort((a, b) => daysDiff(a.berangkat_tgl) - daysDiff(b.berangkat_tgl));

    if (hotDeals.length > 0) {
      await sendLongMessage(buildHotDeal(hotDeals.slice(0, 5)));
      state.lastHotDeal = today;
      await saveState(state);
      log(`✅ Hot deals sent (${hotDeals.length} packages)`);
    }
  } catch (err) {
    warn('sendHotDeals error:', err.message);
  }
}

// ─── AI: Weekly Analysis (enhanced) ─────────────────

async function getWeeklyAIAnalysis(packages, salesData, weeklySnap) {
  const active = packages.filter(p => seatInt(p) > 0);
  const soldOut = packages.filter(p => seatInt(p) <= 0);

  const topSales = salesData.slice(0, 5).map(s =>
    `- ${s.pkg.jadwal_nama} (${s.pkg.maskapai}): ${s.sold} seat terjual`
  ).join('\n');

  // Detect trends
  const airlineSales = {};
  for (const s of salesData) {
    const a = s.pkg.maskapai || 'LAINNYA';
    airlineSales[a] = (airlineSales[a] || 0) + s.sold;
  }

  const prompt = `Data penjualan umroh minggu ini:

Paket aktif: ${active.length}, Sold out: ${soldOut.length}

Terlaris:
${topSales || '(belum ada data)'}

Per maskapai:
${Object.entries(airlineSales).sort((a, b) => b[1] - a[1]).map(([a, s]) => `- ${a}: ${s} seat terjual`).join('\n') || '(belum ada data)'}

Kasih 3 poin singkat (masing-masing 1-2 kalimat):
1. Apa yang laris & kenapa
2. Paket mana yang kemungkinan habis minggu depan
3. Fokus jualan minggu depan sebaiknya ke mana`;

  return await askAI(AI_SYSTEM, prompt, 200);
}

// ─── Similarity for Sold Out alternatives ────────────

function findAlternatives(soldPkg, allPackages) {
  const keywords = (soldPkg.jadwal_nama || '').toLowerCase().split(/[\s\-\(\)]+/).filter(w => w.length > 2);
  const duration = soldPkg.durasi || '';
  const maskapai = soldPkg.maskapai || '';

  const scored = allPackages
    .filter(p => p.jadwal_id !== soldPkg.jadwal_id && seatInt(p) > 0)
    .map(p => {
      let score = 0;
      const name = (p.jadwal_nama || '').toLowerCase();
      for (const kw of keywords) {
        if (name.includes(kw)) score += 2;
      }
      if (p.maskapai === maskapai) score += 3;
      if (p.durasi === duration) score += 2;
      return { pkg: p, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 3).map(x => x.pkg);
}

// ─── Core: Check & Notify ────────────────────────────

async function checkAndNotify() {
  if (isCheckRunning) {
    log('checkAndNotify already running, skipping this cycle');
    return;
  }
  isCheckRunning = true;
  try {
    const packages = await fetchAllPackages();
    if (packages.length === 0) { warn('No packages fetched, skipping check'); return; }

    log(`Checking ${packages.length} packages...`);

    let state = await loadState();
    const isFirstRun = !state;
    if (!state) state = freshState();

    const prevSnapshot = state.lastSnapshot || {};
    const sentNotifs = state.sentNotifications || {};
    const notifications = [];

    // Build current snapshot
    const currentSnapshot = {};
    const currentById = {};
    for (const pkg of packages) {
      const id = pkg.jadwal_id;
      currentById[id] = pkg;
      currentSnapshot[id] = {
        seat_sisa: seatInt(pkg),
        seat_total: seatTotal(pkg),
        paket_harga: pkg.paket_harga || {},
        jadwal_nama: pkg.jadwal_nama,
        maskapai: pkg.maskapai,
        berangkat_tgl: pkg.berangkat_tgl,
        promo: pkg.promo,
      };
    }

    // Skip notifications on first run — just capture baseline
    if (isFirstRun) {
      log('First run — saving baseline snapshot silently');
      state.lastSnapshot = currentSnapshot;
      state.weeklySnapshot = {};
      // Pre-seed milestones so we don't spam existing packages
      for (const [id, snap] of Object.entries(currentSnapshot)) {
        state.weeklySnapshot[id] = { seat_sisa: snap.seat_sisa };
        const total = snap.seat_total;
        const sisa = snap.seat_sisa;
        if (total > 0 && sisa >= 0) {
          const soldPct = Math.round(((total - sisa) / total) * 100);
          const milestones = {};
          for (const t of [50, 75, 90]) {
            if (soldPct >= t) milestones[t] = new Date().toISOString();
          }
          if (Object.keys(milestones).length > 0) {
            if (!sentNotifs[id]) sentNotifs[id] = {};
            sentNotifs[id].milestones = milestones;
          }
        }
      }
      state.sentNotifications = sentNotifs;
      await saveState(state);
      return;
    }

    // 1. New packages
    for (const [id, snap] of Object.entries(currentSnapshot)) {
      if (!prevSnapshot[id] && snap.seat_sisa > 0) {
        if (!sentNotifs[id]) sentNotifs[id] = {};
        if (!sentNotifs[id].newPackage) {
          sentNotifs[id].newPackage = { sentAt: new Date().toISOString() };
          notifications.push({
            type: 'newPackage',
            text: buildNewPackage(currentById[id]),
            agentBroadcast: { type: 'paket_baru', pkg: currentById[id] },
          });
        }
      }
    }

    // 2. Seat critical
    for (const [id, snap] of Object.entries(currentSnapshot)) {
      const seats = snap.seat_sisa;
      const total = snap.seat_total;
      if (seats <= 0) continue;
      const isCritical = seats <= SEAT_CRITICAL_ABS || (total > 0 && seats / total <= SEAT_CRITICAL_PCT);
      if (!isCritical) continue;

      if (!sentNotifs[id]) sentNotifs[id] = {};
      const prev = sentNotifs[id].seatCritical;
      if (!prev || seats < prev.lastSeatCount) {
        sentNotifs[id].seatCritical = { lastSeatCount: seats, sentAt: new Date().toISOString() };
        notifications.push({
          type: 'seatCritical',
          text: buildSeatCritical(currentById[id]),
          agentBroadcast: { type: 'seat_alert', pkg: currentById[id] },
        });
      }
    }

    // 3. Sold out
    for (const [id, prev] of Object.entries(prevSnapshot)) {
      if (prev.seat_sisa > 0 && !currentSnapshot[id]) {
        // Package disappeared (seat 0 or removed)
        if (!sentNotifs[id]) sentNotifs[id] = {};
        if (!sentNotifs[id].soldOut?.sentAt) {
          const alternatives = findAlternatives(prev, packages);
          sentNotifs[id].soldOut = { sentAt: new Date().toISOString() };
          const talkingPoint = await aiSoldOutTalkingPoint(prev, alternatives);
          let text = buildSoldOut(prev, alternatives);
          if (talkingPoint) text += `\n\n💡 <b>Tips Agent:</b>\n${escHtml(talkingPoint)}`;
          notifications.push({ type: 'soldOut', text });
        }
      }
    }
    // Also check packages that still exist but seat_sisa = 0
    for (const [id, snap] of Object.entries(currentSnapshot)) {
      if (snap.seat_sisa <= 0 && prevSnapshot[id]?.seat_sisa > 0) {
        if (!sentNotifs[id]) sentNotifs[id] = {};
        if (!sentNotifs[id].soldOut?.sentAt) {
          const alternatives = findAlternatives(snap, packages);
          sentNotifs[id].soldOut = { sentAt: new Date().toISOString() };
          const talkingPoint = await aiSoldOutTalkingPoint(snap, alternatives);
          let text = buildSoldOut(snap, alternatives);
          if (talkingPoint) text += `\n\n💡 <b>Tips Agent:</b>\n${escHtml(talkingPoint)}`;
          notifications.push({ type: 'soldOut', text });
        }
      }
    }

    // 4. Price changes
    for (const [id, snap] of Object.entries(currentSnapshot)) {
      if (!prevSnapshot[id]) continue;
      const oldHarga = prevSnapshot[id].paket_harga || {};
      const newHarga = snap.paket_harga || {};
      const changes = [];

      for (const [pType, rooms] of Object.entries(newHarga)) {
        if (!rooms || typeof rooms !== 'object') continue;
        for (const [rType, price] of Object.entries(rooms)) {
          if (rType === 'Infant' || rType === 'Single') continue;
          const newPrice = parseInt(price, 10);
          const oldPrice = parseInt(oldHarga[pType]?.[rType], 10);
          if (!isNaN(newPrice) && !isNaN(oldPrice) && newPrice !== oldPrice && newPrice > 0 && oldPrice > 0) {
            changes.push({ paketType: pType, roomType: rType, oldPrice, newPrice });
          }
        }
      }

      if (changes.length > 0) {
        if (!sentNotifs[id]) sentNotifs[id] = {};
        sentNotifs[id].priceChange = { sentAt: new Date().toISOString() };
        const pkg = currentById[id] || snap;
        const analysis = await aiPriceAnalysis(pkg, changes);
        let text = buildPriceChange(pkg, changes);
        if (analysis) text += `\n\n💡 <b>Analisis:</b>\n${escHtml(analysis)}`;
        notifications.push({ type: 'priceChange', text, agentBroadcast: { type: 'perubahan_harga', pkg, changes } });
      }
    }

    // 5. New promo
    for (const [id, snap] of Object.entries(currentSnapshot)) {
      if (!prevSnapshot[id]) continue;
      if (snap.promo === '1' && prevSnapshot[id].promo !== '1' && snap.seat_sisa > 0) {
        if (!sentNotifs[id]) sentNotifs[id] = {};
        if (!sentNotifs[id].promoNew?.sentAt) {
          sentNotifs[id].promoNew = { sentAt: new Date().toISOString() };
          notifications.push({
            type: 'promoNew',
            text: buildPromoNew(currentById[id]),
          });
        }
      }
    }

    // 6. Seat restock (was sold out, now has seats)
    for (const [id, snap] of Object.entries(currentSnapshot)) {
      if (snap.seat_sisa > 0 && prevSnapshot[id] && prevSnapshot[id].seat_sisa <= 0) {
        if (!sentNotifs[id]) sentNotifs[id] = {};
        // Reset soldOut so it can trigger again if needed
        sentNotifs[id].soldOut = { sentAt: null };
        sentNotifs[id].restock = { sentAt: new Date().toISOString() };
        notifications.push({
          type: 'restock',
          text: buildSeatRestock(currentById[id]),
        });
      }
    }

    // 7. Milestone (50%, 75%, 90% sold)
    for (const [id, snap] of Object.entries(currentSnapshot)) {
      const total = snap.seat_total;
      const sisa = snap.seat_sisa;
      if (total <= 0 || sisa <= 0) continue;
      const soldPct = Math.round(((total - sisa) / total) * 100);

      if (!sentNotifs[id]) sentNotifs[id] = {};
      if (!sentNotifs[id].milestones) sentNotifs[id].milestones = {};

      for (const threshold of [50, 75, 90]) {
        if (soldPct >= threshold && !sentNotifs[id].milestones[threshold]) {
          sentNotifs[id].milestones[threshold] = new Date().toISOString();
          notifications.push({
            type: 'milestone',
            text: buildMilestone(currentById[id], threshold),
          });
        }
      }
    }

    // Update state
    state.lastSnapshot = currentSnapshot;
    state.sentNotifications = sentNotifs;

    // Send or queue
    if (notifications.length > 0) {
      if (isOperationalHours()) {
        let sent = 0;
        for (const notif of notifications) {
          await sendLongMessage(notif.text);
          sent++;
          if (sent % 20 === 0) await sleep(60000); // respect rate limit
          else await sleep(1000);
        }
        log(`✅ Sent ${sent} notification(s)`);

        // Agent broadcast — batch per type, send 1 message per agent
        const seatAlerts = [];
        const paketBarus = [];
        const hargaChanges = [];

        for (const notif of notifications) {
          if (!notif.agentBroadcast) continue;
          const { type: bType, pkg: bPkg, changes: bChanges } = notif.agentBroadcast;
          if (bType === 'seat_alert') {
            seatAlerts.push({
              id: bPkg.jadwal_id,
              nama: escHtml(bPkg.jadwal_nama || ''),
              tgl: formatDateShort(bPkg.berangkat_tgl),
              sisa: seatInt(bPkg),
            });
          } else if (bType === 'paket_baru') {
            const { lowest } = getLowestPrice(bPkg.paket_harga);
            paketBarus.push({
              id: bPkg.jadwal_id,
              nama: escHtml(bPkg.jadwal_nama || ''),
              tgl: formatDateShort(bPkg.berangkat_tgl),
              harga: lowest ? formatRupiah(lowest) : '-',
              seat: seatTotal(bPkg),
            });
          } else if (bType === 'perubahan_harga' && bChanges) {
            hargaChanges.push({
              id: bPkg.jadwal_id,
              nama: escHtml(bPkg.jadwal_nama || bPkg.jadwal_id || ''),
              tgl: formatDateShort(bPkg.berangkat_tgl),
              changes: bChanges,
            });
          }
        }

        if (seatAlerts.length > 0) {
          await broadcastToAgents('seat_alert', (agentName, agentSlug) => {
            return seatAlerts.map(s => ({
              text: `🔥 Halo <b>${escHtml(agentName)}</b>!\n\n` +
                `⚠️ <b>Seat tinggal sedikit!</b>\n` +
                `<i>Momentum bagus untuk follow up calon jamaah yang sudah berminat.</i>\n\n` +
                `🕋 <b>${s.nama}</b>\n` +
                `📅 Berangkat: <b>${s.tgl}</b>\n` +
                `🪑 Sisa: <b>${s.sisa} seat</b>\n` +
                `🔗 <i>Gunakan tombol di bawah untuk buka atau salin link.</i>\n\n` +
                `🏃‍♂️ <b>Segera infokan sebelum seat habis.</b>`,
              options: {
                reply_markup: buildPackageActionKeyboard([s], agentSlug),
              },
            }));
          });
        }

        if (paketBarus.length > 0) {
          await broadcastToAgents('paket_baru', (agentName, agentSlug) => {
            return paketBarus.map(p => ({
              text: `🆕 Halo <b>${escHtml(agentName)}</b>!\n\n` +
                `🎉 <b>Paket baru tersedia!</b>\n` +
                `<i>Siap dipromosikan ke calon jamaah hari ini.</i>\n\n` +
                `🕋 <b>${p.nama}</b>\n` +
                `📅 Berangkat: <b>${p.tgl}</b>\n` +
                `💰 Harga mulai: <b>${p.harga}</b>\n` +
                `🪑 Seat tersedia: <b>${p.seat}</b>\n` +
                `🔗 <i>Gunakan tombol di bawah untuk buka atau salin link.</i>\n\n` +
                `🚀 <b>Cek detail dan mulai promosikan.</b>`,
              options: {
                reply_markup: buildPackageActionKeyboard([p], agentSlug),
              },
            }));
          });
        }

        if (hargaChanges.length > 0) {
          await broadcastToAgents('perubahan_harga', (agentName, agentSlug) => {
            return hargaChanges.map(h => {
              const cl = h.changes.map(c => {
                const dir = c.newPrice > c.oldPrice ? '📈 naik' : '📉 turun';
                return `   ${escHtml(c.paketType)} ${escHtml(c.roomType)}: ${formatRupiah(c.oldPrice)} → ${formatRupiah(c.newPrice)} (${dir})`;
              }).join('\n');
              return {
                text: `💲 Halo <b>${escHtml(agentName)}</b>!\n\n` +
                  `📣 <b>Perubahan harga paket!</b>\n` +
                  `<i>Pastikan calon jamaah mendapat info harga terbaru.</i>\n\n` +
                  `🕋 <b>${h.nama}</b>\n` +
                  `📅 Berangkat: <b>${h.tgl}</b>\n` +
                  `${cl}\n` +
                  `🔗 <i>Gunakan tombol di bawah untuk buka atau salin link.</i>\n\n` +
                  `✅ <b>Update info ke jamaah yang sudah tanya ya.</b>`,
                options: {
                  reply_markup: buildPackageActionKeyboard([h], agentSlug),
                },
              };
            });
          });
        }
      } else {
        // Queue for later
        for (const notif of notifications) {
          state.queue.push({ ...notif, queuedAt: new Date().toISOString() });
        }
        log(`📥 Queued ${notifications.length} notification(s) — outside operational hours`);
      }
    } else {
      log('No changes detected');
    }

    await saveState(state);
  } catch (err) {
    warn('checkAndNotify error:', err.message);
  } finally {
    isCheckRunning = false;
  }
}

// ─── Flush Queue ─────────────────────────────────────

async function flushQueue() {
  try {
    if (!isOperationalHours()) return;

    const state = await loadState();
    if (!state || !state.queue || state.queue.length === 0) return;

    log(`Flushing ${state.queue.length} queued notification(s)...`);

    if (state.queue.length > 3) {
      // Combine into one message
      let combined = `📬 <b>NOTIFIKASI TERTUNDA</b> (${state.queue.length} item)\n`;
      combined += `<i>Perubahan terdeteksi di luar jam operasional:</i>\n`;
      for (const item of state.queue) {
        combined += '\n━━━━━━━━━━━━━━━━━━━\n' + item.text;
      }
      await sendLongMessage(combined);
    } else {
      for (const item of state.queue) {
        await sendLongMessage(item.text);
        await sleep(1000);
      }
    }

    state.queue = [];
    await saveState(state);
    log(`✅ Queue flushed`);
  } catch (err) {
    warn('flushQueue error:', err.message);
  }
}

// ─── Weekly Report ───────────────────────────────────

async function sendWeeklyReport() {
  try {
    const packages = await fetchAllPackages();
    if (packages.length === 0) { warn('No packages for weekly report'); return; }

    const state = await loadState() || freshState();
    const weeklySnap = state.weeklySnapshot || {};

    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const dateRange = `${formatDateShort(weekAgo.toISOString())} — ${formatDateShort(now.toISOString())}`;

    // Stats
    const active = packages.filter(p => seatInt(p) > 0);
    const soldOut = packages.filter(p => seatInt(p) <= 0);
    const critical = active.filter(p => seatInt(p) <= SEAT_CRITICAL_ABS);
    const promo = active.filter(p => p.promo === '1');

    // Departures this week
    const thisWeek = active.filter(p => {
      const d = daysDiff(p.berangkat_tgl);
      return d >= 0 && d <= 7;
    }).sort((a, b) => new Date(a.berangkat_tgl) - new Date(b.berangkat_tgl));

    // Top 3 most sold (seats decreased most compared to weekly snapshot)
    const salesData = [];
    for (const pkg of packages) {
      const prev = weeklySnap[pkg.jadwal_id];
      if (prev) {
        const sold = prev.seat_sisa - seatInt(pkg);
        if (sold > 0) salesData.push({ pkg, sold });
      }
    }
    salesData.sort((a, b) => b.sold - a.sold);

    let msg = `📊 <b>RINGKASAN MINGGUAN</b>\n${dateRange}\n\n`;
    msg += `📦 Paket aktif: <b>${active.length}</b>\n`;
    msg += `⛔ Sold out: <b>${soldOut.length}</b>\n`;
    msg += `🔴 Seat kritis: <b>${critical.length}</b> paket\n`;

    if (salesData.length > 0) {
      msg += `\n🔥 <b>PALING LARIS MINGGU INI:</b>\n`;
      for (let i = 0; i < Math.min(3, salesData.length); i++) {
        const { pkg, sold } = salesData[i];
        msg += `${i + 1}. ${escHtml(pkg.jadwal_nama)} — <b>${sold} seat</b> terjual\n`;
      }
    }

    if (thisWeek.length > 0) {
      msg += `\n✈️ <b>BERANGKAT MINGGU INI:</b>\n`;
      for (const pkg of thisWeek.slice(0, 10)) {
        msg += `• ${escHtml(pkg.jadwal_nama)} (${formatDateShort(pkg.berangkat_tgl)}) — sisa ${seatInt(pkg)} seat\n`;
      }
      if (thisWeek.length > 10) msg += `<i>...dan ${thisWeek.length - 10} lainnya</i>\n`;
    }

    if (promo.length > 0) {
      msg += `\n🏷️ <b>PROMO AKTIF:</b>\n`;
      const sorted = promo
        .map(p => ({ pkg: p, price: getLowestPrice(p.paket_harga).lowest }))
        .filter(x => x.price)
        .sort((a, b) => a.price - b.price);
      for (const { pkg, price } of sorted.slice(0, 5)) {
        msg += `• ${escHtml(pkg.jadwal_nama)} — mulai ${formatRupiah(price)}\n`;
      }
      if (sorted.length > 5) msg += `<i>...dan ${sorted.length - 5} lainnya</i>\n`;
    }

    // AI weekly analysis
    const aiAnalysis = await getWeeklyAIAnalysis(packages, salesData, weeklySnap);
    if (aiAnalysis) {
      msg += `\n🤖 <b>AI ANALISIS MINGGUAN:</b>\n${escHtml(aiAnalysis)}\n`;
    }

    await sendLongMessage(msg);

    // Reset weekly snapshot
    state.weeklySnapshot = {};
    for (const pkg of packages) {
      state.weeklySnapshot[pkg.jadwal_id] = { seat_sisa: seatInt(pkg) };
    }
    state.lastWeeklyReport = new Date().toISOString();
    await saveState(state);

    log(`✅ Weekly report sent`);
  } catch (err) {
    warn('sendWeeklyReport error:', err.message);
  }
}

// ─── Daily Tips (Closing, Meta Ads, Google Ads) ──────

const TIPS_CATEGORIES = [
  {
    key: 'closing',
    label: '🎯 TIPS CLOSING',
    prompt: `Kasih 1 tips closing penjualan paket umroh yang praktis dan bisa langsung dipraktekkin hari ini.

Konteks: agent jualan via WhatsApp, Instagram, dan ketemu langsung. Jamaah biasanya ragu soal harga, tanggal, atau masih banding-bandingin.

Format:
- Judul tips (singkat, 3-5 kata)
- Penjelasan 2-3 kalimat, langsung ke cara praktisnya
- 1 contoh kalimat yang bisa langsung di-copy paste ke WhatsApp

Jangan ulang tips yang umum banget kayak "follow up". Kasih yang spesifik dan actionable.`,
  },
  {
    key: 'meta_ads',
    label: '📱 TIPS META ADS',
    prompt: `Kasih 1 tips Meta Ads (Facebook/Instagram Ads) untuk promosi paket umroh.

Konteks: travel agent kecil-menengah, budget ads terbatas, target jamaah Indonesia.

Format:
- Judul tips (singkat, 3-5 kata)
- Penjelasan 2-3 kalimat, langsung ke cara praktisnya
- 1 contoh: bisa berupa contoh headline ads, targeting, atau strategi budget

Fokus ke tips yang applicable untuk bisnis umroh. Jangan terlalu teknis.`,
  },
  {
    key: 'google_ads',
    label: '🔍 TIPS GOOGLE ADS',
    prompt: `Kasih 1 tips Google Ads untuk promosi paket umroh.

Konteks: travel agent kecil-menengah, budget ads terbatas, target orang yang lagi cari paket umroh di Google.

Format:
- Judul tips (singkat, 3-5 kata)
- Penjelasan 2-3 kalimat, langsung ke cara praktisnya
- 1 contoh: bisa berupa contoh keyword, headline iklan, atau strategi bidding

Fokus ke tips yang applicable untuk bisnis umroh. Jangan terlalu teknis.`,
  },
];

function getTipsCategory(slotIndex) {
  // Rotate: use day-of-year * 2 + slot (0=morning, 1=evening) to cycle through 3 categories
  const now = jakartaNow();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24));
  const index = (dayOfYear * 2 + slotIndex) % TIPS_CATEGORIES.length;
  return TIPS_CATEGORIES[index];
}

async function sendDailyTips(slotIndex) {
  try {
    const category = getTipsCategory(slotIndex);
    const slotLabel = slotIndex === 0 ? 'Pagi' : 'Malam';

    log(`Generating ${category.key} tips (${slotLabel})...`);

    const tip = await askAI(AI_SYSTEM, category.prompt, 250);
    if (!tip) {
      warn('Failed to generate tips — AI returned empty');
      return;
    }

    const msg = [
      `${category.label}`,
      ``,
      escHtml(tip),
    ].join('\n');

    await sendLongMessage(msg);
    log(`✅ Tips sent: ${category.key} (${slotLabel})`);
  } catch (err) {
    warn('sendDailyTips error:', err.message);
  }
}

// ─── Periodic Update (every 4 hours) ─────────────────

const PERIODIC_TOPICS = [
  {
    key: 'market_pulse',
    label: '📊 UPDATE SIANG',
    buildPrompt: (stats) => `Ini data paket umroh saat ini:

${stats}

Kasih "market pulse" singkat untuk tim agent:
1. Kondisi pasar umroh hari ini dalam 1 kalimat (berdasarkan data seat & harga)
2. 1 paket yang paling worth di-push sekarang & alasannya (1 kalimat)
3. 1 kalimat motivasi jualan yang relevan dengan kondisi hari ini

Singkat, praktis, langsung bisa dipake.`,
  },
  {
    key: 'opportunity',
    label: '💡 PELUANG SORE',
    buildPrompt: (stats) => `Ini data paket umroh saat ini:

${stats}

Kasih analisis peluang untuk tim agent:
1. Paket mana yang seat-nya masih banyak tapi harganya menarik — cocok di-push sore ini (1-2 kalimat)
2. Strategi follow-up sore hari: apa yang harus dilakukan agent sebelum pulang kerja (1-2 kalimat)

Singkat, praktis, langsung bisa dipake.`,
  },
  {
    key: 'closing_recap',
    label: '🌙 RECAP MALAM',
    buildPrompt: (stats) => `Ini data paket umroh saat ini:

${stats}

Kasih recap malam untuk tim agent:
1. Rangkuman singkat kondisi paket hari ini (seat terjual, yang kritis, dll) — 1-2 kalimat
2. Apa yang harus disiapkan untuk besok pagi (1 kalimat)
3. 1 insight menarik dari data hari ini yang bisa jadi bahan ngobrol sama jamaah

Singkat, praktis, santai karena udah malam.`,
  },
];

async function sendPeriodicUpdate(slotIndex) {
  try {
    if (!isOperationalHours()) {
      log('Periodic update skipped — outside operational hours');
      return;
    }

    const packages = await fetchAllPackages();
    if (packages.length === 0) { warn('No packages for periodic update'); return; }

    const topic = PERIODIC_TOPICS[slotIndex % PERIODIC_TOPICS.length];
    log(`Generating periodic update: ${topic.key}...`);

    const active = packages.filter(p => seatInt(p) > 0);
    const soldOut = packages.filter(p => seatInt(p) <= 0);
    const critical = active.filter(p => seatInt(p) <= SEAT_CRITICAL_ABS);
    const promo = active.filter(p => p.promo === '1');

    // Departing soon
    const soon = active.filter(p => { const d = daysDiff(p.berangkat_tgl); return d >= 0 && d <= 14; })
      .sort((a, b) => daysDiff(a.berangkat_tgl) - daysDiff(b.berangkat_tgl));

    // Price range per airline
    const airlines = {};
    for (const p of active) {
      const a = p.maskapai || 'LAINNYA';
      if (!airlines[a]) airlines[a] = { count: 0, seats: 0, minPrice: Infinity };
      airlines[a].count++;
      airlines[a].seats += seatInt(p);
      const { lowest } = getLowestPrice(p.paket_harga);
      if (lowest && lowest < airlines[a].minPrice) airlines[a].minPrice = lowest;
    }

    // Most available seats
    const mostSeats = [...active].sort((a, b) => seatInt(b) - seatInt(a)).slice(0, 5);

    const stats = `Paket aktif: ${active.length}, Sold out: ${soldOut.length}, Seat kritis: ${critical.length}, Promo: ${promo.length}

Per maskapai:
${Object.entries(airlines).map(([a, d]) => `- ${a}: ${d.count} paket, ${d.seats} seat, mulai ${d.minPrice < Infinity ? formatRupiah(d.minPrice) : '-'}`).join('\n')}

Berangkat dalam 14 hari:
${soon.slice(0, 5).map(p => `- ${p.jadwal_nama} (H-${daysDiff(p.berangkat_tgl)}, ${p.maskapai}): sisa ${seatInt(p)} seat`).join('\n') || '(tidak ada)'}

Seat terbanyak tersedia:
${mostSeats.map(p => `- ${p.jadwal_nama} (${p.maskapai}, ${formatDateShort(p.berangkat_tgl)}): ${seatInt(p)} seat, mulai ${formatRupiah(getLowestPrice(p.paket_harga).lowest)}`).join('\n')}

Seat kritis:
${critical.slice(0, 5).map(p => `- ${p.jadwal_nama} (${p.maskapai}): sisa ${seatInt(p)} seat`).join('\n') || '(tidak ada)'}`;

    const aiContent = await askAI(AI_SYSTEM, topic.buildPrompt(stats), 250);

    let msg = `${topic.label} — ${formatDateShort(new Date().toISOString())}\n\n`;
    msg += `📦 ${active.length} aktif | ⛔ ${soldOut.length} habis | 🔴 ${critical.length} kritis | 🏷️ ${promo.length} promo\n`;

    if (soon.length > 0) {
      msg += `\n✈️ <b>Segera berangkat:</b>\n`;
      for (const p of soon.slice(0, 3)) {
        msg += `• ${escHtml(p.jadwal_nama)} (H-${daysDiff(p.berangkat_tgl)}) — sisa ${seatInt(p)} seat\n`;
      }
    }

    if (aiContent) {
      msg += `\n🤖 <b>Insight:</b>\n${escHtml(aiContent)}\n`;
    }

    await sendLongMessage(msg);
    log(`✅ Periodic update sent: ${topic.key}`);
  } catch (err) {
    warn('sendPeriodicUpdate error:', err.message);
  }
}

// ─── AI Calendar Insight ─────────────────────────────

export async function sendCalendarInsight() {
  try {
    if (!supabaseAdmin) return;

    const { data: row, error } = await supabaseAdmin
      .from('calendar_insights')
      .select('data')
      .eq('id', 'latest')
      .single();

    if (error || !row?.data) {
      warn('[CalendarInsight] No insight data found, skipping');
      return;
    }

    const insight = row.data;

    // Skip if insight is stale (not today's WIB date)
    const nowWIB = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const todayStr = nowWIB.toISOString().slice(0, 10);
    if (insight.dateFor && insight.dateFor !== todayStr) {
      warn(`[CalendarInsight] Insight stale (${insight.dateFor} vs ${todayStr}), skipping`);
      return;
    }

    // Convert markdown **bold** to HTML <b>bold</b> for Telegram
    const md2html = (text) => (text || '-').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

    const cuacaLine = insight.cuaca ? `\n🌡️ ${insight.cuaca}` : '';
    const msg =
      `✈️ <b>AI INSIGHT HARIAN</b>${cuacaLine}\n\n` +
      `📅 <b>Hari Ini</b>\n${md2html(insight.today)}\n\n` +
      `🗓 <b>7 Hari ke Depan</b>\n${md2html(insight.weekly)}`;

    // Kirim ke grup
    await sendLongMessage(msg);
    log('[CalendarInsight] Sent to group');

    // Kirim personal ke semua agent (dengan preference check insight_harian)
    await broadcastToAgents('insight_harian', () => msg + FOOTER);
    log('[CalendarInsight] Broadcast to agents done');
  } catch (err) {
    warn('[CalendarInsight] Error:', err.message);
  }
}

// ─── Kurs Dollar Daily Update ────────────────────────

// Convert "DD/MM/YY HH:MM WIB" → "Hari, D Bulan YYYY" (matches dashboard share modal).
// Falls back to the original string if parsing fails.
function formatKursDateForShare(rawUpdatedAt) {
  const m = String(rawUpdatedAt || '').match(/(\d{2})\/(\d{2})\/(\d{2})\s+\d{2}:\d{2}\s*WIB/);
  if (!m) return rawUpdatedAt || '';
  const dt = new Date(2000 + parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  const dayName = dt.toLocaleDateString('id-ID', { weekday: 'long' });
  const monthName = dt.toLocaleDateString('id-ID', { month: 'long' });
  return `${dayName}, ${dt.getDate()} ${monthName} ${dt.getFullYear()}`;
}

export async function sendKursUpdate() {
  try {
    const res = await fetch(`${BASE_URL}/api/kurs`);
    const json = await res.json();
    if (!json.success || !json.data?.rates) {
      warn('[Kurs] No kurs data available, skipping');
      return;
    }

    const { rates, updatedAt } = json.data;
    const usd = rates.USD;
    const sar = rates.SAR;
    if (!usd) {
      warn('[Kurs] USD rate not available, skipping');
      return;
    }

    // Load previous rates for comparison
    const state = await loadState();

    // Dedup: skip if already sent today
    const today = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
    if (state.lastKursSentDate === today) {
      log('[Kurs] Already sent today, skipping');
      return;
    }

    const prev = state.lastKurs || {};

    const delta = (curr, old) => {
      if (!old) return '';
      const diff = curr - old;
      if (diff === 0) return ' (=)';
      const arrow = diff > 0 ? '🔺' : '🔻';
      const sign = diff > 0 ? '+' : '';
      return ` ${arrow} ${sign}${new Intl.NumberFormat('id-ID').format(diff)}`;
    };

    const dateStr = new Date().toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      timeZone: 'Asia/Jakarta',
    });

    let msg = `💱 <b>KURS HARI INI</b>\n`;
    msg += `📅 ${dateStr}\n\n`;
    msg += `🇺🇸 <b>USD:</b> ${formatRupiah(usd)}${delta(usd, prev.USD)}\n`;
    if (sar) {
      msg += `🇸🇦 <b>SAR:</b> ${formatRupiah(sar)}${delta(sar, prev.SAR)}\n`;
    }
    msg += `\n<i>Sumber: Bank Mandiri TT Counter</i>`;
    msg += `\n<i>Update: ${updatedAt}</i>`;

    // Send to group chat (text — admin/internal channel)
    await sendLongMessage(msg);
    log('[Kurs] Sent to group');

    // Per-agent broadcast: send the personalized kurs image with a short caption.
    // Falls back to text message if image generation fails for an agent.
    const caption =
      `💱 <b>Kurs Hari Ini</b>\n` +
      `📅 ${dateStr}\n\n` +
      `🇺🇸 <b>USD:</b> ${formatRupiah(usd)}${delta(usd, prev.USD)}` +
      (sar ? `\n🇸🇦 <b>SAR:</b> ${formatRupiah(sar)}${delta(sar, prev.SAR)}` : '') +
      `\n\n<i>Sumber: Bank Mandiri TT Counter</i>`;

    if (supabaseAdmin) {
      const { data: agents, error: agentsErr } = await supabaseAdmin
        .from('agents')
        .select('slug, name, phone, photo, website, telegram_chat_id, notification_prefs')
        .not('telegram_chat_id', 'is', null);

      if (agentsErr) {
        warn('[Kurs] Failed to load agents for broadcast:', agentsErr.message);
      } else if (agents && agents.length) {
        let sent = 0, fallback = 0, failed = 0;
        for (const agent of agents) {
          if (agent.notification_prefs?.kurs_dollar === false) continue;
          try {
            const image = await getOrCreateKursShareImage({
              kurs: { usd, updatedAt: formatKursDateForShare(updatedAt) },
              agent: {
                name: agent.name || '',
                phone: agent.phone || '',
                photo: agent.photo || '',
                slug: agent.slug,
                website: agent.website || '',
              },
            });
            await sendTelegramPhotoToAgent(agent.telegram_chat_id, image.buffer, caption + FOOTER, {
              filename: `kurs-${agent.slug}.jpg`,
            });
            sent++;
          } catch (err) {
            warn(`[Kurs] Image broadcast failed for ${agent.slug}, falling back to text:`, err.message);
            try {
              await sendTelegramToAgent(agent.telegram_chat_id, msg + FOOTER);
              fallback++;
            } catch (err2) {
              failed++;
              warn(`[Kurs] Text fallback also failed for ${agent.slug}:`, err2.message);
            }
          }
          await new Promise(r => setTimeout(r, 300)); // throttle Telegram API
        }
        log(`[Kurs] Broadcast done — image: ${sent}, text-fallback: ${fallback}, failed: ${failed}`);
      }
    }

    // Save current rates and mark as sent today
    state.lastKurs = { USD: usd, SAR: sar };
    state.lastKursSentDate = today;
    await saveState(state);
  } catch (err) {
    warn('[Kurs] sendKursUpdate error:', err.message);
  }
}

// ─── Birthday Digest (daily 07:00 WIB) ───────────────

function normalizeBirthdayWa(wa) {
  const cleaned = String(wa || '').replace(/[^0-9]/g, '');
  if (!cleaned) return null;
  if (cleaned.startsWith('0')) return '62' + cleaned.slice(1);
  if (cleaned.startsWith('62')) return cleaned;
  if (cleaned.startsWith('8')) return '62' + cleaned;
  return cleaned;
}

function escHtmlBday(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildBirthdayActionKeyboard(birthdays) {
  const waRows = birthdays
    .map(b => {
      const phone = normalizeBirthdayWa(b.wa);
      if (!phone) return null;
      const firstName = titleCase(String(b.nama || '').split(/\s+/)[0] || 'Jamaah');
      return [{ text: `💬 Ucapkan ${firstName}`, url: `https://wa.me/${phone}` }];
    })
    .filter(Boolean)
    .slice(0, 3);

  return buildUrlKeyboard([
    [{ text: '🎂 Buka Dashboard', url: buildDashboardUrl() }],
    ...waRows,
  ]);
}

function formatBirthdayDigestMessage(birthdays) {
  const lines = [
    '🎂 <b>Ulang Tahun Jamaah Hari Ini</b>',
    '',
    `Ada ${birthdays.length} jamaah berulang tahun hari ini:`,
    '',
  ];

  birthdays.forEach((b, i) => {
    lines.push(`${i + 1}. <b>${escHtmlBday(b.salutation)} ${escHtmlBday(b.nama)}</b> (${b.age} tahun)`);
    if (b.paket) lines.push(`   📦 ${escHtmlBday(b.paket)}`);
    if (b.wa) {
      const phone = normalizeBirthdayWa(b.wa);
      if (phone) {
        lines.push(`   💬 <a href="https://wa.me/${phone}">Kirim ucapan</a>`);
      }
    }
    lines.push('');
  });

  lines.push('🎁 <i>Gunakan tombol di bawah untuk buka dashboard atau kirim ucapan cepat.</i>');
  return lines.join('\n');
}

async function sendBirthdayDigestToAgent(agent) {
  const todayBirthdays = await getTodaysBirthdays(supabaseAdmin, agent.id);
  if (todayBirthdays.length === 0) return { sent: false, reason: 'no_birthdays' };

  const message = formatBirthdayDigestMessage(todayBirthdays);
  await sendTelegramToAgent(agent.telegram_chat_id, message, {
    reply_markup: buildBirthdayActionKeyboard(todayBirthdays),
  });
  return { sent: true, count: todayBirthdays.length };
}

async function runBirthdayDigest() {
  if (!supabaseAdmin) {
    loadConfig();
    if (!supabaseAdmin) {
      warn('[birthday-digest] Supabase admin client not configured — skipping');
      return { agentsChecked: 0, sent: 0 };
    }
  }

  log('[birthday-digest] Cron fired at', new Date().toISOString());

  const { data: agents, error } = await supabaseAdmin
    .from('agents')
    .select('id, slug, name, telegram_chat_id, notification_prefs')
    .not('telegram_chat_id', 'is', null);

  if (error) {
    warn('[birthday-digest] Failed to fetch agents:', error.message);
    return { agentsChecked: 0, sent: 0, error: error.message };
  }

  let sentCount = 0;
  let optedIn = 0;

  for (const agent of agents || []) {
    const prefs = agent.notification_prefs || {};
    if (prefs.birthday_digest !== true) continue;
    optedIn++;

    try {
      const result = await sendBirthdayDigestToAgent(agent);
      if (result.sent) {
        sentCount++;
        log(`[birthday-digest] sent to ${agent.slug} (${result.count} jamaah)`);
      }
    } catch (err) {
      warn(`[birthday-digest] Failed for agent ${agent.slug}:`, err.message);
      // Continue to next agent
    }

    // Throttle to avoid Telegram rate limits
    await sleep(300);
  }

  log(`[birthday-digest] Done: ${sentCount}/${optedIn} digests sent (of ${agents?.length || 0} connected agents)`);
  return { agentsChecked: agents?.length || 0, optedIn, sent: sentCount };
}

// ─── Init ────────────────────────────────────────────

export { loadConfig, sendDailyBriefing, sendWeeklyReport, sendDepartureReminders, sendHotDeals, checkAndNotify, sendDailyTips, sendPeriodicUpdate, sendAgentDepartureReminders, departureReminderSore, passportReminder, pelunasanReminder, manasikReminder, perlengkapanReminder, weeklySummary, notifyJamaahSyncEvents, notifyPembayaranMasuk, runBirthdayDigest, isUpstreamLunas };

export function initNotifier() {
  loadConfig();
  resolveOpsAlertChatId()
    .then(id => log(`Ops/DB alerts → agent '${OPS_ALERT_AGENT_SLUG}' (${id ? 'resolved' : 'UNRESOLVED'})`))
    .catch(() => {});

  if (!BOT_TOKEN) {
    warn('TELEGRAM_BOT_TOKEN not set — notifier disabled');
    return;
  }

  if (!CHAT_ID) {
    warn('TELEGRAM_CHAT_ID not set — group notifications disabled, per-agent notifications still active');
  }

  const mode = IS_PROD ? 'PRODUCTION' : 'DEVELOPMENT';
  log(`Starting [${mode}] with year codes: [${YEAR_CODES.join(', ')}]`);

  // Real-time check every 30 minutes
  cron.schedule('*/30 * * * *', () => {
    checkAndNotify();
  }, { timezone: 'Asia/Jakarta' });

  // Flush queue at 08:00 WIB every day
  cron.schedule('0 8 * * *', () => {
    flushQueue();
  }, { timezone: 'Asia/Jakarta' });

  // Daily AI briefing at 08:10 WIB every day
  cron.schedule('10 8 * * *', () => {
    sendDailyBriefing();
  }, { timezone: 'Asia/Jakarta' });

  // Departure reminders at 08:15 WIB every day
  cron.schedule('15 8 * * *', () => {
    sendDepartureReminders();
  }, { timezone: 'Asia/Jakarta' });

  // CRON: AI Calendar Insight (08:30 WIB)
  cron.schedule('30 8 * * *', () => {
    sendCalendarInsight();
  }, { timezone: 'Asia/Jakarta' });

  // Hot deals at 09:00 WIB every day
  cron.schedule('0 9 * * *', () => {
    sendHotDeals();
  }, { timezone: 'Asia/Jakarta' });

  // Weekly report Monday 08:20 WIB (runs after briefing)
  cron.schedule('20 8 * * 1', () => {
    sendWeeklyReport();
  }, { timezone: 'Asia/Jakarta' });

  // Daily tips (closing, meta ads, google ads) — dimatikan
  // cron.schedule('45 10 * * *', () => { sendDailyTips(0); }, { timezone: 'Asia/Jakarta' });
  // cron.schedule('15 19 * * *', () => { sendDailyTips(1); }, { timezone: 'Asia/Jakarta' });

  // Periodic updates every 4 hours: 12:00, 16:00, 20:00 WIB
  cron.schedule('0 12 * * *', () => {
    sendPeriodicUpdate(0);
  }, { timezone: 'Asia/Jakarta' });

  cron.schedule('0 16 * * *', () => {
    sendPeriodicUpdate(1);
  }, { timezone: 'Asia/Jakarta' });

  cron.schedule('0 20 * * *', () => {
    sendPeriodicUpdate(2);
  }, { timezone: 'Asia/Jakarta' });

  // CRON: Departure Reminder Pagi (07:00 WIB) — semua milestone, conversational
  cron.schedule('0 7 * * *', () => {
    sendAgentDepartureReminders();
  }, { timezone: 'Asia/Jakarta' });

  // CRON: Birthday Digest Harian (07:00 WIB) — opt-in via notification_prefs.birthday_digest
  cron.schedule('0 7 * * *', () => {
    runBirthdayDigest();
  }, { timezone: 'Asia/Jakarta' });

  // CRON: Departure Reminder Sore (17:00 WIB) — H-1 only, urgent
  cron.schedule('0 17 * * *', () => {
    departureReminderSore();
  }, { timezone: 'Asia/Jakarta' });

  // CRON: Passport Reminder (09:30 WIB) — paspor belum kumpul / expired
  cron.schedule('30 9 * * *', () => {
    passportReminder();
  }, { timezone: 'Asia/Jakarta' });

  // CRON: Pelunasan Reminder (10:30 WIB) — deadline H-30
  cron.schedule('30 10 * * *', () => {
    pelunasanReminder();
  }, { timezone: 'Asia/Jakarta' });

  // CRON: Manasik Reminder H-3 (14:00 WIB)
  cron.schedule('0 14 * * *', () => {
    manasikReminder();
  }, { timezone: 'Asia/Jakarta' });

  // CRON: Perlengkapan Reminder (Senin 11:00 WIB)
  cron.schedule('0 11 * * 1', () => {
    perlengkapanReminder();
  }, { timezone: 'Asia/Jakarta' });

  // CRON: Ringkasan Mingguan (Senin 10:00 WIB)
  cron.schedule('0 10 * * 1', () => {
    weeklySummary();
  }, { timezone: 'Asia/Jakarta' });

  // Kurs Dollar Update is now event-driven (triggered by server.js after successful scrape)

  // Initial check after 15s delay (let Express settle)
  setTimeout(() => {
    log('Running initial check...');
    checkAndNotify();
  }, 15000);

  log('✅ Notifier initialized');
}

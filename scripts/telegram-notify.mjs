#!/usr/bin/env node
/**
 * Telegram Notification Bot untuk Jadwal Umroh Alhijaz
 * Usage: node scripts/telegram-notify.mjs <command>
 *
 * Commands:
 *   pagi     - 07:00 — Ringkasan + seat kritis + top 3 termurah
 *   siang    - 12:00 — Seat update lengkap + keberangkatan minggu ini
 *   sore     - 16:00 — Harga maskapai + info promo
 *   malam    - 20:00 — Pengingat manasik (H-3) + pengingat keberangkatan (H-7)
 *   realtime - Deteksi perubahan (paket baru, seat drop, promo baru)
 *
 * Daily limit: max 7 pesan/hari (4 rutin + 3 realtime)
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(PROJECT_ROOT, 'data', 'telegram-state.json');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
// Skrip legacy ini historisnya mengirim ke grup dev, bukan grup produksi
const CHAT_ID = process.env.TELEGRAM_CHAT_ID_DEV || '';
const API_URL = 'https://jadwal.alhijaz.co/jadwal/api-get/1448';

const DAILY_LIMIT = 7;
const ROUTINE_COUNT = 4;
const MAX_REALTIME_ALERTS = DAILY_LIMIT - ROUTINE_COUNT; // 3

// ============================================
// Helpers
// ============================================

function formatPrice(price) {
  const num = typeof price === 'string' ? parseInt(price, 10) : price;
  if (!num || isNaN(num)) return '-';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

function getMinimumPrice(pkg) {
  let minPrice = null;
  for (const tierPricing of Object.values(pkg.paket_harga || {})) {
    const prices = [tierPricing.Quard, tierPricing.Triple, tierPricing.Double];
    for (const priceStr of prices) {
      if (priceStr) {
        const price = parseInt(priceStr, 10);
        if (price > 0 && (minPrice === null || price < minPrice)) {
          minPrice = price;
        }
      }
    }
  }
  return minPrice;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatDateShort(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

function daysDiff(dateStr) {
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / (1000 * 60 * 60 * 24));
}

function isThisWeek(dateStr) {
  const d = daysDiff(dateStr);
  return d >= 0 && d <= 7;
}

function isThisMonth(dateStr) {
  const now = new Date();
  const target = new Date(dateStr);
  return (
    target.getMonth() === now.getMonth() &&
    target.getFullYear() === now.getFullYear() &&
    target >= now
  );
}

function seatInt(pkg) {
  return parseInt(pkg.seat_sisa, 10) || 0;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ============================================
// API & Telegram
// ============================================

async function fetchPackages() {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok') throw new Error(`API status: ${data.status}`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return data.aaData.filter((pkg) => {
    const dep = new Date(pkg.berangkat_tgl);
    return dep >= now && seatInt(pkg) > 0;
  });
}

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
  });
  const result = await res.json();
  if (!result.ok) {
    console.error('Telegram error:', result.description);
    const res2 = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: text.replace(/[*_`\[]/g, ''),
        disable_web_page_preview: true,
      }),
    });
    const result2 = await res2.json();
    if (!result2.ok) console.error('Telegram retry error:', result2.description);
  }
}

async function sendLongMessage(text) {
  if (text.length <= 4000) {
    await sendTelegram(text);
    return;
  }
  const lines = text.split('\n');
  let chunk = '';
  for (const line of lines) {
    if ((chunk + '\n' + line).length > 3900) {
      await sendTelegram(chunk);
      chunk = line;
    } else {
      chunk += (chunk ? '\n' : '') + line;
    }
  }
  if (chunk) await sendTelegram(chunk);
}

// ============================================
// State Management
// ============================================

function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    // Migrate old format (flat package map) to new format
    if (raw && !raw.packages && !raw.alertCount) {
      return { packages: raw, alertCount: 0, alertDate: todayStr() };
    }
    return raw;
  } catch {
    return null;
  }
}

function saveState(state) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function getAlertCounter(state) {
  if (!state || state.alertDate !== todayStr()) {
    return { count: 0, date: todayStr() };
  }
  return { count: state.alertCount || 0, date: state.alertDate };
}

function incrementAlert(state) {
  state.alertCount = (state.alertCount || 0) + 1;
  state.alertDate = todayStr();
}

function canSendRealtimeAlert(state) {
  const { count } = getAlertCounter(state);
  return count < DAILY_LIMIT;
}

// ============================================
// Commands (4 gabungan)
// ============================================

async function cmdPagi(packages) {
  // Ringkasan + seat kritis + top 3 termurah
  const totalPaket = packages.length;
  const promoPakets = packages.filter((p) => p.promo === '1');
  const seatKritis = packages.filter((p) => seatInt(p) < 5);
  const seatTerbatas = packages.filter((p) => seatInt(p) >= 5 && seatInt(p) <= 10);
  const mingguIni = packages.filter((p) => isThisWeek(p.berangkat_tgl));

  const maskapaiSet = new Set(packages.map((p) => p.maskapai));
  const prices = packages.map((p) => getMinimumPrice(p)).filter(Boolean);
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;

  let msg = `🌅 *LAPORAN PAGI — JADWAL UMROH*\n`;
  msg += `📅 ${formatDate(new Date().toISOString())}\n\n`;

  // Ringkasan
  msg += `📦 *Total Paket:* ${totalPaket} | 🏷️ *Promo:* ${promoPakets.length}\n`;
  msg += `✈️ *Maskapai:* ${[...maskapaiSet].join(', ')}\n`;
  if (minPrice && maxPrice) {
    msg += `💰 *Harga:* ${formatPrice(minPrice)} — ${formatPrice(maxPrice)}\n`;
  }
  msg += '\n';

  // Seat kritis
  msg += `💺 *Status Seat:*\n`;
  msg += `  🔴 Kritis (<5): ${seatKritis.length} | 🟡 Terbatas (5-10): ${seatTerbatas.length} | 🟢 Tersedia: ${totalPaket - seatKritis.length - seatTerbatas.length}\n`;

  if (seatKritis.length > 0) {
    msg += `\n⚠️ *Seat Kritis — Segera Follow Up:*\n`;
    for (const p of seatKritis.slice(0, 5)) {
      msg += `  • ${p.jadwal_nama} — *${seatInt(p)} seat* (${formatDateShort(p.berangkat_tgl)})\n`;
    }
    if (seatKritis.length > 5) msg += `  _...dan ${seatKritis.length - 5} lainnya_\n`;
  }

  if (mingguIni.length > 0) {
    msg += `\n🛫 *Berangkat Minggu Ini:* ${mingguIni.length} paket\n`;
    for (const p of mingguIni.slice(0, 3)) {
      msg += `  • ${p.jadwal_nama} — ${formatDateShort(p.berangkat_tgl)} (${seatInt(p)} seat)\n`;
    }
    if (mingguIni.length > 3) msg += `  _...dan ${mingguIni.length - 3} lainnya_\n`;
  }

  // Top 3 termurah
  const withPrice = packages
    .map((p) => ({ pkg: p, price: getMinimumPrice(p) }))
    .filter((x) => x.price !== null)
    .sort((a, b) => a.price - b.price);

  if (withPrice.length > 0) {
    msg += `\n💰 *Top 3 Termurah:*\n`;
    const medals = ['🥇', '🥈', '🥉'];
    for (let i = 0; i < Math.min(3, withPrice.length); i++) {
      const { pkg, price } = withPrice[i];
      msg += `  ${medals[i]} *${formatPrice(price)}* — ${pkg.jadwal_nama} (${pkg.maskapai}, ${formatDateShort(pkg.berangkat_tgl)})\n`;
    }
  }

  await sendLongMessage(msg);
}

async function cmdSiang(packages) {
  // Seat update lengkap + keberangkatan minggu ini
  const kritis = packages.filter((p) => seatInt(p) < 5).sort((a, b) => seatInt(a) - seatInt(b));
  const terbatas = packages
    .filter((p) => seatInt(p) >= 5 && seatInt(p) <= 10)
    .sort((a, b) => seatInt(a) - seatInt(b));
  const tersedia = packages.filter((p) => seatInt(p) > 10).sort((a, b) => seatInt(a) - seatInt(b));

  let msg = `☀️ *LAPORAN SIANG — ${formatDateShort(new Date().toISOString())}*\n`;

  if (kritis.length > 0) {
    msg += `\n🔴 *SEAT KRITIS:*\n`;
    for (const p of kritis) {
      msg += `• *${seatInt(p)} seat* — ${p.jadwal_nama}\n`;
      msg += `  ${p.maskapai} · ${formatDateShort(p.berangkat_tgl)} · ${formatPrice(getMinimumPrice(p))}\n`;
    }
  }

  if (terbatas.length > 0) {
    msg += `\n🟡 *SEAT TERBATAS:*\n`;
    for (const p of terbatas) {
      msg += `• *${seatInt(p)} seat* — ${p.jadwal_nama}\n`;
      msg += `  ${p.maskapai} · ${formatDateShort(p.berangkat_tgl)} · ${formatPrice(getMinimumPrice(p))}\n`;
    }
  }

  if (kritis.length === 0 && terbatas.length === 0) {
    msg += `\n✅ Semua paket masih tersedia cukup seat.\n`;
  }

  msg += `\n🟢 ${tersedia.length} paket lainnya masih tersedia.\n`;

  // Keberangkatan minggu ini — hanya tampilkan jika ada
  const mingguIni = packages
    .filter((p) => isThisWeek(p.berangkat_tgl))
    .sort((a, b) => new Date(a.berangkat_tgl) - new Date(b.berangkat_tgl));

  if (mingguIni.length > 0) {
    msg += `\n🛫 *BERANGKAT MINGGU INI:*\n`;
    for (const pkg of mingguIni) {
      const d = daysDiff(pkg.berangkat_tgl);
      const urgency = d <= 1 ? '🔴' : d <= 3 ? '🟡' : '🟢';
      msg += `${urgency} ${pkg.jadwal_nama} — ${formatDate(pkg.berangkat_tgl)}`;
      if (d === 0) msg += ' *(HARI INI!)*';
      else if (d === 1) msg += ' *(BESOK!)*';
      else msg += ` *(H-${d})*`;
      msg += `\n  ✈️ ${pkg.maskapai} · 💺 ${seatInt(pkg)} seat\n`;
    }
  }

  await sendLongMessage(msg);
}

async function cmdSore(packages) {
  // Harga maskapai + info promo
  const byMaskapai = {};
  for (const pkg of packages) {
    const airline = pkg.maskapai || 'LAINNYA';
    if (!byMaskapai[airline]) byMaskapai[airline] = [];
    byMaskapai[airline].push(pkg);
  }

  let msg = `🌇 *LAPORAN SORE — HARGA & PROMO*\n\n`;

  // Harga per maskapai
  msg += `✈️ *HARGA PER MASKAPAI:*\n\n`;
  const airlines = Object.keys(byMaskapai).sort();
  for (const airline of airlines) {
    const pkgs = byMaskapai[airline];
    const airlinePrices = pkgs.map((p) => getMinimumPrice(p)).filter(Boolean);
    const min = airlinePrices.length ? Math.min(...airlinePrices) : null;
    const max = airlinePrices.length ? Math.max(...airlinePrices) : null;

    msg += `*${airline}* (${pkgs.length} paket)\n`;
    if (min && max) {
      msg += `  💰 ${formatPrice(min)}`;
      if (min !== max) msg += ` — ${formatPrice(max)}`;
      msg += '\n';
    }
    const seatTotal = pkgs.reduce((s, p) => s + seatInt(p), 0);
    msg += `  💺 Total seat: ${seatTotal}\n`;
    const promoCount = pkgs.filter((p) => p.promo === '1').length;
    if (promoCount > 0) msg += `  🏷️ ${promoCount} paket promo\n`;
    msg += '\n';
  }

  // Info promo
  const promoPakets = packages.filter((p) => p.promo === '1');
  msg += `━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🏷️ *PAKET PROMO AKTIF*`;

  if (promoPakets.length === 0) {
    msg += `\nTidak ada promo aktif saat ini.\n`;
  } else {
    msg += ` (${promoPakets.length} paket)\n\n`;
    const sorted = promoPakets
      .map((p) => ({ pkg: p, price: getMinimumPrice(p) }))
      .filter((x) => x.price !== null)
      .sort((a, b) => a.price - b.price);
    for (const { pkg, price } of sorted.slice(0, 10)) {
      msg += `  • *${formatPrice(price)}* — ${pkg.jadwal_nama}\n`;
      msg += `    ✈️ ${pkg.maskapai} | 📅 ${formatDateShort(pkg.berangkat_tgl)} | 💺 ${seatInt(pkg)} seat\n`;
    }
    if (sorted.length > 10) msg += `  _...dan ${sorted.length - 10} lainnya_\n`;
  }

  await sendLongMessage(msg);
}

async function cmdMalam(packages) {
  // Pengingat manasik (H-3) + pengingat keberangkatan (H-7)
  let msg = `🌙 *LAPORAN MALAM — PENGINGAT*\n\n`;

  // Pengingat manasik H-3
  const manasik = packages
    .filter((p) => {
      if (!p.manasik_tgl) return false;
      const d = daysDiff(p.manasik_tgl);
      return d >= 0 && d <= 3;
    })
    .sort((a, b) => new Date(a.manasik_tgl) - new Date(b.manasik_tgl));

  msg += `📋 *PENGINGAT MANASIK (H-3):*\n`;
  if (manasik.length === 0) {
    msg += `Tidak ada jadwal manasik dalam 3 hari ke depan.\n`;
  } else {
    msg += '\n';
    for (const pkg of manasik) {
      const d = daysDiff(pkg.manasik_tgl);
      msg += `📌 *${pkg.jadwal_nama}*\n`;
      msg += `   📅 ${formatDate(pkg.manasik_tgl)}`;
      if (d === 0) msg += ' — *HARI INI!*';
      else if (d === 1) msg += ' — *BESOK!*';
      else msg += ` — *H-${d}*`;
      msg += '\n';
      if (pkg.manasik_jam) msg += `   🕐 Jam: ${pkg.manasik_jam}\n`;
      msg += `   ✈️ Berangkat: ${formatDateShort(pkg.berangkat_tgl)} (${pkg.maskapai})\n\n`;
    }
    msg += `_Pastikan jamaah sudah dikonfirmasi kehadirannya._\n`;
  }

  // Pengingat keberangkatan H-7
  const berangkat = packages
    .filter((p) => {
      const d = daysDiff(p.berangkat_tgl);
      return d >= 0 && d <= 7;
    })
    .sort((a, b) => new Date(a.berangkat_tgl) - new Date(b.berangkat_tgl));

  msg += `\n━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🛫 *PENGINGAT KEBERANGKATAN (H-7):*\n`;
  if (berangkat.length === 0) {
    msg += `Tidak ada keberangkatan dalam 7 hari ke depan.\n`;
  } else {
    msg += '\n';
    for (const pkg of berangkat) {
      const d = daysDiff(pkg.berangkat_tgl);
      const urgency = d <= 2 ? '🔴' : d <= 4 ? '🟡' : '🟢';
      msg += `${urgency} *${pkg.jadwal_nama}*\n`;
      msg += `   📅 ${formatDate(pkg.berangkat_tgl)}`;
      if (d === 0) msg += ' — *HARI INI!*';
      else if (d === 1) msg += ' — *BESOK!*';
      else msg += ` — *H-${d}*`;
      msg += '\n';
      msg += `   ✈️ ${pkg.maskapai} ${pkg.berangkat_kode_penerbangan || ''}\n`;
      msg += `   🕐 Jam: ${pkg.berangkat_jam || '-'} | 💺 ${seatInt(pkg)} seat\n\n`;
    }
    msg += `_Checklist: paspor, visa, tiket, perlengkapan, kesehatan._\n`;
  }

  await sendLongMessage(msg);
}

async function cmdRealtime(packages) {
  const state = loadState() || { packages: {}, alertCount: 0, alertDate: todayStr() };

  // Reset counter if date changed
  if (state.alertDate !== todayStr()) {
    state.alertCount = 0;
    state.alertDate = todayStr();
  }

  const prevPackages = state.packages || {};

  // Build current package state
  const currentPackages = {};
  for (const pkg of packages) {
    currentPackages[pkg.jadwal_id] = {
      nama: pkg.jadwal_nama,
      seat: seatInt(pkg),
      promo: pkg.promo,
      maskapai: pkg.maskapai,
      berangkat_tgl: pkg.berangkat_tgl,
      minPrice: getMinimumPrice(pkg),
    };
  }

  // First run — save baseline
  if (Object.keys(prevPackages).length === 0) {
    state.packages = currentPackages;
    saveState(state);
    console.log('Realtime: baseline state saved (' + Object.keys(currentPackages).length + ' packages)');
    return;
  }

  const alerts = [];

  // Detect new packages
  const newPkgs = [];
  for (const [id, cur] of Object.entries(currentPackages)) {
    if (!prevPackages[id]) {
      newPkgs.push(cur);
    }
  }

  if (newPkgs.length > 0) {
    let alert = `🆕 *PAKET BARU TERSEDIA!*\n\n`;
    for (const p of newPkgs) {
      alert += `• *${p.nama}*\n`;
      alert += `  ✈️ ${p.maskapai} | 📅 ${formatDateShort(p.berangkat_tgl)}\n`;
      alert += `  💰 ${formatPrice(p.minPrice)} | 💺 ${p.seat} seat\n`;
      if (p.promo === '1') alert += `  🏷️ *PROMO!*\n`;
      alert += '\n';
    }
    alerts.push(alert);
  }

  // Detect seat drops
  const seatDrops = [];
  for (const [id, cur] of Object.entries(currentPackages)) {
    if (prevPackages[id]) {
      const prevSeat = prevPackages[id].seat;
      const curSeat = cur.seat;
      if (curSeat < prevSeat && (curSeat < 5 || prevSeat - curSeat >= 3)) {
        seatDrops.push({ ...cur, prevSeat, curSeat });
      }
    }
  }

  if (seatDrops.length > 0) {
    let alert = `📉 *SEAT DROP ALERT!*\n\n`;
    for (const p of seatDrops) {
      const icon = p.curSeat < 5 ? '🔴' : '🟡';
      alert += `${icon} *${p.nama}*\n`;
      alert += `  💺 ${p.prevSeat} → *${p.curSeat} seat*\n`;
      alert += `  ✈️ ${p.maskapai} | 📅 ${formatDateShort(p.berangkat_tgl)}\n\n`;
    }
    alerts.push(alert);
  }

  // Detect new promos
  const newPromos = [];
  for (const [id, cur] of Object.entries(currentPackages)) {
    if (prevPackages[id] && prevPackages[id].promo !== '1' && cur.promo === '1') {
      newPromos.push(cur);
    }
  }

  if (newPromos.length > 0) {
    let alert = `🏷️ *PROMO BARU!*\n\n`;
    for (const p of newPromos) {
      alert += `• *${p.nama}*\n`;
      alert += `  ✈️ ${p.maskapai} | 📅 ${formatDateShort(p.berangkat_tgl)}\n`;
      alert += `  💰 ${formatPrice(p.minPrice)} | 💺 ${p.seat} seat\n\n`;
    }
    alerts.push(alert);
  }

  // Detect sold out
  const soldOut = [];
  for (const [id, prev] of Object.entries(prevPackages)) {
    if (!currentPackages[id]) {
      soldOut.push(prev);
    }
  }

  if (soldOut.length > 0) {
    let alert = `🚫 *SOLD OUT / TIDAK TERSEDIA:*\n\n`;
    for (const p of soldOut) {
      alert += `• ${p.nama} (${p.maskapai}, ${formatDateShort(p.berangkat_tgl)})\n`;
    }
    alerts.push(alert);
  }

  // Send alerts (with daily limit check)
  if (alerts.length > 0) {
    if (canSendRealtimeAlert(state)) {
      for (const alert of alerts) {
        await sendLongMessage(alert);
      }
      incrementAlert(state);
      console.log(`Realtime: ${alerts.length} alert(s) sent (daily count: ${state.alertCount}/${DAILY_LIMIT})`);
    } else {
      console.log(`Realtime: ${alerts.length} alert(s) SKIPPED — daily limit reached (${state.alertCount}/${DAILY_LIMIT})`);
    }
  } else {
    console.log('Realtime: no changes detected');
  }

  // Always update package state
  state.packages = currentPackages;
  saveState(state);
}

// ============================================
// Main
// ============================================

const COMMANDS = {
  pagi: cmdPagi,
  siang: cmdSiang,
  sore: cmdSore,
  malam: cmdMalam,
  realtime: cmdRealtime,
};

async function main() {
  const command = process.argv[2];

  if (!command || !COMMANDS[command]) {
    console.log('Usage: node scripts/telegram-notify.mjs <command>');
    console.log('Commands:', Object.keys(COMMANDS).join(', '));
    process.exit(1);
  }

  if (!BOT_TOKEN || !CHAT_ID) {
    console.error('TELEGRAM_BOT_TOKEN dan TELEGRAM_CHAT_ID_DEV wajib tersedia di .env');
    process.exit(1);
  }

  try {
    const packages = await fetchPackages();
    console.log(`Fetched ${packages.length} active packages`);

    // For routine commands, increment alert counter
    if (command !== 'realtime') {
      const state = loadState() || { packages: {}, alertCount: 0, alertDate: todayStr() };
      if (state.alertDate !== todayStr()) {
        state.alertCount = 0;
        state.alertDate = todayStr();
      }
      await COMMANDS[command](packages);
      incrementAlert(state);
      saveState(state);
      console.log(`Command '${command}' completed (daily count: ${state.alertCount}/${DAILY_LIMIT})`);
    } else {
      await COMMANDS[command](packages);
      console.log(`Command '${command}' completed`);
    }
  } catch (err) {
    console.error(`Error running '${command}':`, err.message);
    await sendTelegram(`❌ *Error notifikasi (${command}):*\n${err.message}`).catch(() => {});
    process.exit(1);
  }
}

main();

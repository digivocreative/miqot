/**
 * OG Image generator — composites a 1200x630 PNG per agent.
 *
 * Used by:
 *  - scripts/generate-og.mjs (bulk/CLI)
 *  - server.js (auto-regenerate on agent create / approve / photo change)
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { terasPreviewExcerpt } from './teras-share.js';
import {
  CITY_LABEL_ID,
  OG_CITY_HEX,
  formatIdDate,
  formatPackageTitle,
} from './itinerary-share-meta.js';
import {
  formatHotelName,
  formatPriceShort,
  roomLabelId,
  seatNoteId,
} from './package-share-meta.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'public', 'og');

/**
 * Emoji and other astral-plane glyphs, stripped from every value that reaches
 * an SVG <text>. This is not cosmetic: when Pango cannot find a colour-emoji
 * face for the requested weight it raises a *fatal* error and aborts the
 * process — not a JS exception, so no try/catch upstream can save it. A single
 * ❤️ in an agent name or a post body would take the whole Express server down.
 *
 * Ranges cover emoji blocks, dingbats/misc symbols, variation selectors, ZWJ
 * and keycaps, plus everything outside the BMP. Typographic arrows (U+2190…)
 * are deliberately left alone — the cards use → and it renders fine.
 */
const UNRENDERABLE_GLYPHS = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]|[\u{10000}-\u{10FFFF}]/gu;

/**
 * Drop glyphs Pango may not be able to render, then normalise whitespace so a
 * removed emoji doesn't leave a double space behind.
 */
export function stripUnrenderableGlyphs(text) {
  return String(text || '').replace(UNRENDERABLE_GLYPHS, '').replace(/\s+/g, ' ').trim();
}

/**
 * Escape for SVG text. Sanitising here rather than at each call site makes this
 * the single choke point every card already funnels its free text through, so
 * a new card can't reintroduce the crash by forgetting to sanitise. Literal
 * emoji written directly into a template (🌐/📱/✈ in the cards below) bypass
 * this on purpose — those are fixed strings that are known to render.
 */
export function escapeXml(str) {
  return stripUnrenderableGlyphs(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatPhone(phone) {
  const clean = String(phone || '').replace(/\D/g, '');
  if (clean.startsWith('62')) return `+62 ${clean.slice(2)}`;
  return phone || '';
}

function measureText(text, fontSize) {
  return String(text || '').length * fontSize * 0.52;
}

/**
 * Load the agent's photo as a Buffer — supports both HTTP(S) URLs and local paths.
 * Returns null if the photo can't be loaded.
 */
export async function loadAgentPhotoBuffer(photoField, slug) {
  if (!photoField) {
    // Fallback to the local /public/agents/{slug}.jpg convention
    const local = path.join(PROJECT_ROOT, 'public', 'agents', `${slug}.jpg`);
    if (fs.existsSync(local)) return fs.readFileSync(local);
    return null;
  }

  // HTTP(S) URL (e.g. Supabase Storage public URL). Timeout ketat: saat
  // storage stall, endpoint pemanggil (mis. agent-card) jatuh ke fallback
  // monogram alih-alih menggantung sampai timeout default undici (~5 menit).
  if (/^https?:\/\//i.test(photoField)) {
    try {
      const res = await fetch(photoField, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return null;
      const arrayBuf = await res.arrayBuffer();
      return Buffer.from(arrayBuf);
    } catch {
      return null;
    }
  }

  // Local path — e.g. /agents/bagas.jpg
  const local = path.join(PROJECT_ROOT, 'public', photoField.replace(/^\//, ''));
  if (fs.existsSync(local)) return fs.readFileSync(local);

  // Last-resort fallback: public/agents/{slug}.jpg
  const fallback = path.join(PROJECT_ROOT, 'public', 'agents', `${slug}.jpg`);
  if (fs.existsSync(fallback)) return fs.readFileSync(fallback);

  return null;
}

/**
 * Generate a 1200x630 OG PNG for a single agent.
 * Returns the PNG Buffer. Caller decides where to persist it.
 */
export async function generateOgPng({ name, website, phone, photoBuffer }) {
  const W = 1200;
  const H = 630;
  const photoSize = 180;
  const photoX = 80;
  const photoY = Math.round((H - photoSize) / 2) - 30;

  // 1. Gradient background
  const bgSvg = Buffer.from(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="40%" stop-color="#FFF7ED"/>
          <stop offset="100%" stop-color="#FEE2E2"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      <rect x="0" y="${H - 80}" width="${W}" height="80" fill="#B91C1C"/>
      <rect x="0" y="${H - 84}" width="${W}" height="4" fill="#F59E0B"/>
    </svg>
  `);
  const bgBuffer = await sharp(bgSvg).png().toBuffer();

  const composites = [];

  // 2. Photo (if available)
  if (photoBuffer) {
    try {
      const sizedPhoto = await sharp(photoBuffer)
        .resize(photoSize, photoSize, { fit: 'cover' })
        .png()
        .toBuffer();

      const circleMask = Buffer.from(`
        <svg width="${photoSize}" height="${photoSize}">
          <circle cx="${photoSize / 2}" cy="${photoSize / 2}" r="${photoSize / 2}" fill="white"/>
        </svg>
      `);
      const circularPhoto = await sharp(sizedPhoto)
        .composite([{ input: circleMask, blend: 'dest-in' }])
        .png()
        .toBuffer();

      const ringSize = photoSize + 8;
      const ringSvg = Buffer.from(`
        <svg width="${ringSize}" height="${ringSize}">
          <circle cx="${ringSize / 2}" cy="${ringSize / 2}" r="${ringSize / 2}" fill="white"/>
          <circle cx="${ringSize / 2}" cy="${ringSize / 2}" r="${ringSize / 2 - 1}" fill="none" stroke="#E5E7EB" stroke-width="1"/>
        </svg>
      `);
      const ringBuffer = await sharp(ringSvg).png().toBuffer();

      composites.push(
        { input: ringBuffer, left: photoX - 4, top: photoY - 4 },
        { input: circularPhoto, left: photoX, top: photoY },
      );
    } catch (e) {
      console.warn('[og-generator] Failed to process photo:', e.message);
    }
  }

  // 3. Text overlay
  const textStartX = photoBuffer ? photoX + photoSize + 60 : photoX;
  // Sanitise before the fallback so an emoji-only name still falls back to a
  // label, and before measuring so the verified badge lands beside the text.
  const displayName = stripUnrenderableGlyphs(name) || 'Alhijaz';
  const safeName = escapeXml(displayName);
  const safeWeb = escapeXml(website || 'alhijazindonesia.com');
  const safePhone = escapeXml(formatPhone(phone));
  const nameWidth = measureText(displayName, 38);
  const badgeCx = textStartX + nameWidth + 24;
  const badgeCy = photoY + 43;

  const textSvg = Buffer.from(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <text x="${textStartX}" y="${photoY + 50}" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="bold" fill="#111827">
        ${safeName}
      </text>
      <circle cx="${badgeCx}" cy="${badgeCy}" r="14" fill="#1DA1F2"/>
      <polyline points="${badgeCx - 6},${badgeCy} ${badgeCx - 1},${badgeCy + 5} ${badgeCx + 7},${badgeCy - 6}" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="${textStartX}" y="${photoY + 95}" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#6B7280">
        🌐  ${safeWeb}
      </text>
      <text x="${textStartX}" y="${photoY + 132}" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#374151" font-weight="600">
        📱  ${safePhone}
      </text>
      <text x="${textStartX}" y="${photoY + 178}" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="#9CA3AF" font-style="italic">
        Travel Consultant — Alhijaz Indowisata
      </text>
      <text x="${W / 2}" y="${H - 32}" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="bold" fill="white" text-anchor="middle" letter-spacing="2">
        JADWAL UMRAH — ALHIJAZ INDOWISATA
      </text>
    </svg>
  `);
  composites.push({ input: Buffer.from(textSvg), left: 0, top: 0 });

  return sharp(bgBuffer).composite(composites).png({ quality: 90 }).toBuffer();
}

/** Format nomor telepon ke bentuk lokal 08xx-xxxx-xxxx. */
export function formatLocalPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  const local = digits.startsWith('62') ? `0${digits.slice(2)}` : digits;
  if (!local) return '';
  return [local.slice(0, 4), local.slice(4, 8), local.slice(8)]
    .filter(Boolean)
    .join('-');
}

/** Rapikan nilai website agent untuk ditampilkan: buang protokol/garis miring akhir. */
function normalizeAgentWebsite(value) {
  const clean = stripUnrenderableGlyphs(value).replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!clean || clean.length < 4 || /\s/.test(clean)) return '';
  return clean.length > 50 ? `${clean.slice(0, 48)}…` : clean;
}

/**
 * Pecah nama jadi maksimal 2 baris dengan ukuran font yang selalu muat pada
 * lebar panel data (676px). Nama sangat panjang dikecilkan dulu sebelum
 * dipotong ellipsis.
 */
function splitAgentName(raw) {
  // Sanitise up front: the line-splitting and font-size maths below are all
  // length-based, so they must run on the same string the card will render.
  const name = stripUnrenderableGlyphs(raw) || 'Agent Alhijaz';
  const capped = name.length > 44 ? `${name.slice(0, 42).trim()}…` : name;
  const MAXW = 676;
  const one = Math.floor(MAXW / Math.max(1, capped.length * 0.52));
  if (one >= 38 || !capped.includes(' ')) {
    return { lines: [capped], size: Math.max(30, Math.min(52, one)) };
  }
  const words = capped.split(' ');
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i += 1) {
    const diff = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  const lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
  const longest = Math.max(lines[0].length, lines[1].length);
  const size = Math.max(30, Math.min(42, Math.floor(MAXW / (longest * 0.52))));
  return { lines, size };
}

/**
 * PNG referensi identitas untuk disertakan bersama prompt banner ChatGPT.
 * Kanvas sengaja putih polos dan hanya memuat aset/informasi yang perlu disalin.
 * Tanpa panel, chip, ikon, atau ornamen agar model image-gen tidak menganggap
 * elemen referensi sebagai bagian dari desain banner.
 */
export async function generatePackageValueAgentCardPng({ name, phone, photoBuffer, website }) {
  const W = 1200;
  const H = 630;
  const nameSpec = splitAgentName(name);
  const phoneDisplay = formatLocalPhone(phone) || String(phone || '').slice(0, 20);
  const phoneSize = phoneDisplay.length > 17 ? 34 : 40;
  const site = normalizeAgentWebsite(website);
  const siteSize = site.length > 34 ? 25 : 29;

  // Foto korup/gagal dianggap tidak tersedia; jangan tampilkan monogram yang
  // berisiko dibaca model sebagai wajah atau elemen brand baru.
  let circularPhoto = null;
  if (photoBuffer) {
    try {
      const size = 200;
      const sizedPhoto = await sharp(photoBuffer)
        .resize(size, size, { fit: 'cover', position: 'attention' })
        .png()
        .toBuffer();
      const circleMask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`);
      circularPhoto = await sharp(sizedPhoto)
        .composite([{ input: circleMask, blend: 'dest-in' }])
        .png()
        .toBuffer();
    } catch (error) {
      console.warn('[package-value] Failed to process agent photo:', error.message);
    }
  }

  const CX = circularPhoto ? 400 : 84;
  const contentHeight = (nameSpec.lines.length * Math.round(nameSpec.size * 1.16))
    + 28 + 52 + (site ? 45 : 0);
  let cursor = Math.round((H - contentHeight) / 2);

  // Rakit hanya teks kanonis agent; tidak ada label atau ikon tambahan.
  let rows = '';
  for (const line of nameSpec.lines) {
    cursor += nameSpec.size;
    rows += `<text x="${CX}" y="${cursor}" font-family="Inter, Arial, sans-serif" font-size="${nameSpec.size}" font-weight="900" fill="#0F172A" letter-spacing="-0.5">${escapeXml(line)}</text>`;
    cursor += Math.round(nameSpec.size * 0.16);
  }
  cursor += 28 + phoneSize;
  rows += `<text x="${CX}" y="${cursor}" font-family="Inter, Arial, sans-serif" font-size="${phoneSize}" font-weight="700" fill="#0F172A">${escapeXml(phoneDisplay)}</text>`;

  if (site) {
    cursor += 20 + siteSize;
    rows += `<text x="${CX}" y="${cursor}" font-family="Inter, Arial, sans-serif" font-size="${siteSize}" font-weight="650" fill="#0F172A">${escapeXml(site)}</text>`;
  }

  const baseSvg = Buffer.from(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${W}" height="${H}" fill="#FFFFFF"/>
      ${rows}
    </svg>
  `);

  const composites = [];
  if (circularPhoto) {
    composites.push({ input: circularPhoto, left: 92, top: 215 });
  }

  const logoPath = path.join(PROJECT_ROOT, 'public', 'logo-alhijaz-besar.png');
  if (fs.existsSync(logoPath)) {
    const logo = await sharp(logoPath)
      .resize({ width: 210, height: 120, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    composites.push({ input: logo, left: 72, top: 54 });
  }

  return sharp(baseSvg).composite(composites).png({ quality: 94 }).toBuffer();
}

/**
 * Generate a 1200x630 OG PNG for a portal-jamaah link, featuring the
 * jamaah's name, the paket they're booked on, and the airline. Used as
 * the WhatsApp/Facebook share preview for /[slug]/jamaah/[token]/... URLs
 * so the recipient sees something personal instead of a generic agent card.
 */
export async function generatePortalJamaahOgPng({
  jamaahName,
  paketName,
  maskapai,
  agentName,
  agentPhotoBuffer,
}) {
  const W = 1200;
  const H = 630;
  const photoSize = 180;
  const photoX = 80;
  const photoY = Math.round((H - photoSize) / 2) - 30;

  const bgSvg = Buffer.from(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="40%" stop-color="#ECFDF5"/>
          <stop offset="100%" stop-color="#D1FAE5"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      <rect x="0" y="${H - 80}" width="${W}" height="80" fill="#047857"/>
      <rect x="0" y="${H - 84}" width="${W}" height="4" fill="#F59E0B"/>
    </svg>
  `);
  const bgBuffer = await sharp(bgSvg).png().toBuffer();

  const composites = [];

  if (agentPhotoBuffer) {
    try {
      const sizedPhoto = await sharp(agentPhotoBuffer)
        .resize(photoSize, photoSize, { fit: 'cover' })
        .png()
        .toBuffer();

      const circleMask = Buffer.from(`
        <svg width="${photoSize}" height="${photoSize}">
          <circle cx="${photoSize / 2}" cy="${photoSize / 2}" r="${photoSize / 2}" fill="white"/>
        </svg>
      `);
      const circularPhoto = await sharp(sizedPhoto)
        .composite([{ input: circleMask, blend: 'dest-in' }])
        .png()
        .toBuffer();

      const ringSize = photoSize + 8;
      const ringSvg = Buffer.from(`
        <svg width="${ringSize}" height="${ringSize}">
          <circle cx="${ringSize / 2}" cy="${ringSize / 2}" r="${ringSize / 2}" fill="white"/>
          <circle cx="${ringSize / 2}" cy="${ringSize / 2}" r="${ringSize / 2 - 1}" fill="none" stroke="#E5E7EB" stroke-width="1"/>
        </svg>
      `);
      const ringBuffer = await sharp(ringSvg).png().toBuffer();

      composites.push(
        { input: ringBuffer, left: photoX - 4, top: photoY - 4 },
        { input: circularPhoto, left: photoX, top: photoY },
      );
    } catch (e) {
      console.warn('[og-generator] Failed to process agent photo:', e.message);
    }
  }

  const textStartX = agentPhotoBuffer ? photoX + photoSize + 60 : photoX;
  // Truncate visually if too long (rough char budget for 38pt at available width).
  // SVG doesn't auto-wrap, so we just cap to avoid overflow into the photo/footer.
  // Cap before escaping: slicing escaped text can cut an entity (`&amp;`) in half
  // and produce invalid XML.
  const jamaahDisplay = escapeXml(truncateOgText(stripUnrenderableGlyphs(jamaahName) || 'Jamaah Alhijaz', 30));
  const paketDisplay = escapeXml(truncateOgText(paketName, 40));
  const safeMaskapai = escapeXml(maskapai || '');
  const safeAgent = escapeXml(agentName || '');

  const textSvg = Buffer.from(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <text x="${textStartX}" y="${photoY + 12}" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="bold" fill="#047857" letter-spacing="3">
        PORTAL JAMAAH
      </text>
      <text x="${textStartX}" y="${photoY + 64}" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="bold" fill="#111827">
        ${jamaahDisplay}
      </text>
      <text x="${textStartX}" y="${photoY + 108}" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="#374151" font-weight="600">
        ${paketDisplay}
      </text>
      <text x="${textStartX}" y="${photoY + 148}" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#6B7280">
        ✈  ${safeMaskapai}
      </text>
      ${safeAgent ? `<text x="${textStartX}" y="${photoY + 198}" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="#9CA3AF" font-style="italic">bersama ${safeAgent}</text>` : ''}
      <text x="${W / 2}" y="${H - 32}" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="bold" fill="white" text-anchor="middle" letter-spacing="2">
        PORTAL JAMAAH — ALHIJAZ INDOWISATA
      </text>
    </svg>
  `);
  composites.push({ input: Buffer.from(textSvg), left: 0, top: 0 });

  return sharp(bgBuffer).composite(composites).png({ quality: 90 }).toBuffer();
}

function formatFlightOgDate(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  try {
    return new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${raw}T00:00:00Z`));
  } catch {
    return raw;
  }
}

function displayFlightNumber(value) {
  const compact = String(value || '').replace(/\s+/g, '').toUpperCase();
  return compact.replace(/^([A-Z0-9]{2})(\d+)$/, '$1 $2');
}

function truncateOgText(value, maxLength) {
  const text = stripUnrenderableGlyphs(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}…` : text;
}

function ogInitials(value) {
  // Sanitise first: initials taken from an emoji-only name would be stripped
  // later by escapeXml, leaving an empty monogram instead of the fallback.
  return (stripUnrenderableGlyphs(value) || 'AH')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase() || 'AH';
}

/**
 * Generate a flight-specific 1200x630 OG card. The image intentionally avoids
 * operational status claims because social crawlers may cache previews long
 * after takeoff; route and schedule identity remain useful and trustworthy.
 */
export async function generateFlightShareOgPng({
  flightNumber,
  flightDate,
  depIata,
  arrIata,
  depCity,
  arrCity,
  depTime,
  arrTime,
  duration,
  airlineName,
  groupNumber,
  pax,
  tourLeader,
  agentName,
  agentPhotoBuffer,
}) {
  const W = 1200;
  const H = 630;
  const safeFlight = escapeXml(displayFlightNumber(flightNumber) || 'PENERBANGAN');
  const safeAirline = escapeXml(truncateOgText(airlineName || 'Alhijaz Indowisata', 34));
  const safeDate = escapeXml(formatFlightOgDate(flightDate));
  const safeDep = escapeXml(String(depIata || '—').toUpperCase());
  const safeArr = escapeXml(String(arrIata || '—').toUpperCase());
  const safeDepCity = escapeXml(truncateOgText(depCity || depIata || '', 24));
  const safeArrCity = escapeXml(truncateOgText(arrCity || arrIata || '', 24));
  const safeDepTime = escapeXml(depTime || '—');
  const safeArrTime = escapeXml(arrTime || '—');
  const safeDuration = escapeXml(truncateOgText(duration || 'Jadwal penerbangan', 24));
  const safeAgent = escapeXml(truncateOgText(stripUnrenderableGlyphs(agentName) || 'Agent Alhijaz', 30));
  const safeTl = escapeXml(truncateOgText(tourLeader || '', 34));
  const safeInitials = escapeXml(ogInitials(agentName));
  const manifest = [
    groupNumber ? `GRUP ${String(groupNumber).toUpperCase()}` : '',
    Number(pax) > 0 ? `${Number(pax)} JAMAAH` : '',
  ].filter(Boolean).join('  •  ') || 'PENERBANGAN JAMAAH ALHIJAZ';
  const safeManifest = escapeXml(manifest);
  let avatarBuffer = null;

  if (agentPhotoBuffer) {
    try {
      avatarBuffer = await sharp(agentPhotoBuffer)
        .resize(72, 72, { fit: 'cover' })
        .composite([{ input: Buffer.from('<svg width="72" height="72"><circle cx="36" cy="36" r="36" fill="white"/></svg>'), blend: 'dest-in' }])
        .png()
        .toBuffer();
    } catch (err) {
      console.warn('[og-generator] Failed to process flight-share agent photo:', err.message);
    }
  }

  const svg = Buffer.from(`
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#210307"/>
          <stop offset="46%" stop-color="#5F0C14"/>
          <stop offset="100%" stop-color="#A52127"/>
        </linearGradient>
        <radialGradient id="warmGlow" cx="18%" cy="5%" r="82%">
          <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.34"/>
          <stop offset="48%" stop-color="#FB7185" stop-opacity="0.10"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="route" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#10B981"/>
          <stop offset="48%" stop-color="#34D399"/>
          <stop offset="52%" stop-color="#60A5FA"/>
          <stop offset="100%" stop-color="#3B82F6"/>
        </linearGradient>
        <pattern id="pattern" width="92" height="92" patternUnits="userSpaceOnUse">
          <path d="M46 7 85 46 46 85 7 46Z" fill="none" stroke="#FFFFFF" stroke-width="1" opacity="0.08"/>
          <circle cx="46" cy="46" r="13" fill="none" stroke="#FDE68A" stroke-width="1" opacity="0.10"/>
        </pattern>
        <filter id="shadow" x="-10%" y="-20%" width="120%" height="150%">
          <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#160104" flood-opacity="0.34"/>
        </filter>
        <clipPath id="cardClip">
          <rect x="56" y="166" width="1088" height="394" rx="36"/>
        </clipPath>
        <clipPath id="avatarClip">
          <circle cx="1080" cy="78" r="36"/>
        </clipPath>
      </defs>

      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      <rect width="${W}" height="${H}" fill="url(#warmGlow)"/>
      <rect width="${W}" height="${H}" fill="url(#pattern)"/>
      <circle cx="1090" cy="-40" r="260" fill="#F59E0B" opacity="0.10"/>
      <circle cx="1180" cy="580" r="310" fill="#FB7185" opacity="0.12"/>

      <text x="72" y="145" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="900" fill="#FDE68A" letter-spacing="4">STATUS PENERBANGAN</text>

      <text x="1018" y="72" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="800" fill="#FFFFFF" text-anchor="end">${safeAgent}</text>
      <text x="1018" y="98" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="700" fill="#FECACA" text-anchor="end" letter-spacing="1.5">TRAVEL CONSULTANT</text>
      <circle cx="1080" cy="78" r="42" fill="rgba(255,255,255,0.15)" stroke="#FDE68A" stroke-width="3"/>
      ${avatarBuffer ? '' : `<text x="1080" y="87" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="900" fill="#FFFFFF" text-anchor="middle">${safeInitials}</text>`}

      <g filter="url(#shadow)">
        <rect x="56" y="166" width="1088" height="394" rx="36" fill="#FFFFFF"/>
      </g>

      <g clip-path="url(#cardClip)">
        <rect x="56" y="500" width="1088" height="60" fill="#F8FAFC"/>
        <rect x="56" y="500" width="8" height="60" fill="#8A1E22"/>
      </g>

      <rect x="88" y="193" width="14" height="14" rx="7" fill="#8A1E22"/>
      <text x="116" y="210" font-family="Inter, Arial, sans-serif" font-size="25" font-weight="900" fill="#111827">${safeAirline}  ·  ${safeFlight}</text>
      <text x="1108" y="210" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="700" fill="#64748B" text-anchor="end">${safeDate}</text>
      <line x1="88" y1="238" x2="1112" y2="238" stroke="#E2E8F0" stroke-width="2"/>

      <text x="94" y="356" font-family="Inter, Arial, sans-serif" font-size="92" font-weight="900" fill="#111827" letter-spacing="-3">${safeDep}</text>
      <text x="1106" y="356" font-family="Inter, Arial, sans-serif" font-size="92" font-weight="900" fill="#111827" text-anchor="end" letter-spacing="-3">${safeArr}</text>
      <text x="98" y="392" font-family="Inter, Arial, sans-serif" font-size="23" font-weight="700" fill="#94A3B8">${safeDepCity}</text>
      <text x="1102" y="392" font-family="Inter, Arial, sans-serif" font-size="23" font-weight="700" fill="#94A3B8" text-anchor="end">${safeArrCity}</text>

      <line x1="368" y1="320" x2="832" y2="320" stroke="#CBD5E1" stroke-width="4" stroke-dasharray="12 12" stroke-linecap="round"/>
      <line x1="368" y1="320" x2="832" y2="320" stroke="url(#route)" stroke-width="5" stroke-linecap="round" opacity="0.40"/>
      <circle cx="368" cy="320" r="9" fill="#10B981" stroke="#FFFFFF" stroke-width="4"/>
      <circle cx="832" cy="320" r="9" fill="#3B82F6" stroke="#FFFFFF" stroke-width="4"/>
      <circle cx="600" cy="320" r="31" fill="#8A1E22" stroke="#FDE68A" stroke-width="4"/>
      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" transform="translate(586 306) scale(1.18)" fill="#FFFFFF"/>

      <text x="98" y="435" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="900" fill="#10B981" letter-spacing="2">BERANGKAT</text>
      <text x="98" y="477" font-family="Inter, Arial, sans-serif" font-size="36" font-weight="900" fill="#111827">${safeDepTime}</text>
      <text x="1102" y="435" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="900" fill="#3B82F6" text-anchor="end" letter-spacing="2">TIBA</text>
      <text x="1102" y="477" font-family="Inter, Arial, sans-serif" font-size="36" font-weight="900" fill="#111827" text-anchor="end">${safeArrTime}</text>

      <rect x="470" y="422" width="260" height="58" rx="29" fill="#FFF7ED" stroke="#FED7AA" stroke-width="2"/>
      <text x="600" y="458" font-family="Inter, Arial, sans-serif" font-size="19" font-weight="900" fill="#9A3412" text-anchor="middle">${safeDuration}</text>

      <text x="92" y="538" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="900" fill="#475569" letter-spacing="1">${safeManifest}</text>
      ${safeTl ? `<text x="1106" y="538" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="800" fill="#64748B" text-anchor="end">TOUR LEADER  ·  ${safeTl}</text>` : ''}

      <text x="72" y="606" font-family="Inter, Arial, sans-serif" font-size="17" font-weight="800" fill="#FDE68A" letter-spacing="1.2">PT ALHIJAZ INDOWISATA  ·  UMRAH &amp; HAJI PLUS</text>
      <text x="1128" y="606" font-family="Inter, Arial, sans-serif" font-size="17" font-weight="800" fill="#FFFFFF" text-anchor="end">alhijaz.co</text>
    </svg>
  `);

  const composites = [];
  const logoPath = path.join(PROJECT_ROOT, 'src', 'logo-alhijaz-white.png');
  if (fs.existsSync(logoPath)) {
    const logo = await sharp(logoPath).resize({ width: 190 }).png().toBuffer();
    composites.push({ input: logo, left: 72, top: 50 });
  }

  if (avatarBuffer) {
    composites.push({ input: avatarBuffer, left: 1044, top: 42 });
  }

  return sharp(svg).composite(composites).png({ quality: 92 }).toBuffer();
}

function formatTerasOgDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Jakarta',
    }).format(parsed);
  } catch {
    return '';
  }
}

/**
 * Greedy word wrap for SVG <text> lines. measureText's 0.52 ratio is the same
 * approximation the other cards use, so maxWidth is kept loose on purpose.
 */
function wrapOgLines(text, fontSize, maxWidth, maxLines) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureText(candidate, fontSize) <= maxWidth || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);

  // Whatever didn't fit gets an ellipsis, so the card never reads as if the
  // post simply ended mid-sentence.
  if (lines.join(' ').length < words.join(' ').length && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[\s.,;:!-]+$/, '')}…`;
  }
  return lines;
}

/**
 * Teras post OG card. Author + short excerpt only: the link itself stays
 * login-gated, so its preview must remain a teaser rather than the whole post.
 */
export async function generateTerasPostOgPng({
  authorName,
  authorSlug,
  authorPhotoBuffer,
  body,
  createdAt,
  reactionCount = 0,
  commentCount = 0,
  hasMedia = false,
  isSystem = false,
}) {
  const W = 1200;
  const H = 630;
  const safeName = escapeXml(truncateOgText(stripUnrenderableGlyphs(authorName) || 'Agent Alhijaz', 28));
  const safeHandle = escapeXml(authorSlug ? `@${String(authorSlug).toLowerCase()}` : 'Agent Alhijaz');
  const safeDate = escapeXml(formatTerasOgDate(createdAt));
  const safeInitials = escapeXml(ogInitials(authorName));

  const excerpt = stripUnrenderableGlyphs(terasPreviewExcerpt(body))
    || (hasMedia ? 'Membagikan foto di Teras.' : 'Membagikan kabar di Teras.');
  const bodyLines = wrapOgLines(excerpt, 36, 900, 3).map(escapeXml);

  const stats = [
    reactionCount > 0 ? `${reactionCount} reaksi` : '',
    commentCount > 0 ? `${commentCount} komentar` : '',
    hasMedia ? 'Foto' : '',
  ].filter(Boolean);
  const safeStats = escapeXml(stats.join('   •   ') || 'Kiriman baru');
  const safeKicker = escapeXml(isSystem ? 'PENGUMUMAN' : 'KIRIMAN TERAS');

  let avatarBuffer = null;
  if (authorPhotoBuffer) {
    try {
      avatarBuffer = await sharp(authorPhotoBuffer)
        .resize(96, 96, { fit: 'cover' })
        .composite([{ input: Buffer.from('<svg width="96" height="96"><circle cx="48" cy="48" r="48" fill="white"/></svg>'), blend: 'dest-in' }])
        .png()
        .toBuffer();
    } catch (err) {
      console.warn('[og-generator] Failed to process Teras author photo:', err.message);
    }
  }

  const svg = Buffer.from(`
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="terasBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#04120E"/>
          <stop offset="52%" stop-color="#07352A"/>
          <stop offset="100%" stop-color="#0B5C43"/>
        </linearGradient>
        <radialGradient id="terasGlow" cx="14%" cy="4%" r="86%">
          <stop offset="0%" stop-color="#34D399" stop-opacity="0.30"/>
          <stop offset="52%" stop-color="#0EA5E9" stop-opacity="0.08"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>
        <pattern id="terasPattern" width="96" height="96" patternUnits="userSpaceOnUse">
          <path d="M48 6 90 48 48 90 6 48Z" fill="none" stroke="#FFFFFF" stroke-width="1" opacity="0.07"/>
          <circle cx="48" cy="48" r="12" fill="none" stroke="#A7F3D0" stroke-width="1" opacity="0.10"/>
        </pattern>
        <filter id="terasShadow" x="-10%" y="-20%" width="120%" height="150%">
          <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#02110C" flood-opacity="0.42"/>
        </filter>
        <clipPath id="terasCardClip">
          <rect x="56" y="150" width="1088" height="384" rx="38"/>
        </clipPath>
      </defs>

      <rect width="${W}" height="${H}" fill="url(#terasBg)"/>
      <rect width="${W}" height="${H}" fill="url(#terasGlow)"/>
      <rect width="${W}" height="${H}" fill="url(#terasPattern)"/>
      <circle cx="1120" cy="-30" r="250" fill="#34D399" opacity="0.10"/>
      <circle cx="1180" cy="600" r="300" fill="#0EA5E9" opacity="0.10"/>

      <text x="1128" y="72" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="900" fill="#FFFFFF" text-anchor="end" letter-spacing="6">TERAS</text>
      <text x="1128" y="98" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="800" fill="#6EE7B7" text-anchor="end" letter-spacing="3">KOMUNITAS AGENT</text>

      <g filter="url(#terasShadow)">
        <rect x="56" y="150" width="1088" height="384" rx="38" fill="#FFFFFF"/>
      </g>
      <g clip-path="url(#terasCardClip)">
        <rect x="56" y="150" width="1088" height="7" fill="#10B981"/>
      </g>

      <circle cx="156" cy="242" r="52" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="3"/>
      ${avatarBuffer ? '' : `<text x="156" y="255" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="900" fill="#047857" text-anchor="middle">${safeInitials}</text>`}

      <text x="228" y="232" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="900" fill="#0F172A">${safeName}</text>
      <text x="228" y="268" font-family="Inter, Arial, sans-serif" font-size="21" font-weight="700" fill="#94A3B8">${safeHandle}${safeDate ? `  •  ${safeDate}` : ''}</text>

      <rect x="936" y="206" width="172" height="46" rx="23" fill="#ECFDF5"/>
      <text x="1022" y="236" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="900" fill="#047857" text-anchor="middle" letter-spacing="1.5">${safeKicker}</text>

      ${bodyLines.map((line, i) => `<text x="108" y="${348 + i * 52}" font-family="Inter, Arial, sans-serif" font-size="36" font-weight="700" fill="#1F2937">${line}</text>`).join('\n      ')}

      <line x1="108" y1="466" x2="1092" y2="466" stroke="#E2E8F0" stroke-width="2"/>
      <text x="108" y="506" font-family="Inter, Arial, sans-serif" font-size="19" font-weight="800" fill="#64748B" letter-spacing="0.5">${safeStats}</text>
      <text x="1092" y="506" font-family="Inter, Arial, sans-serif" font-size="19" font-weight="900" fill="#047857" text-anchor="end">Buka di aplikasi agent →</text>

      <text x="72" y="588" font-family="Inter, Arial, sans-serif" font-size="17" font-weight="800" fill="#A7F3D0" letter-spacing="1.2">PT ALHIJAZ INDOWISATA  ·  KHUSUS AGENT</text>
      <text x="1128" y="588" font-family="Inter, Arial, sans-serif" font-size="17" font-weight="800" fill="#FFFFFF" text-anchor="end">alhijaz.co</text>
    </svg>
  `);

  const composites = [];
  const logoPath = path.join(PROJECT_ROOT, 'src', 'logo-alhijaz-white.png');
  if (fs.existsSync(logoPath)) {
    const logo = await sharp(logoPath).resize({ width: 190 }).png().toBuffer();
    composites.push({ input: logo, left: 72, top: 48 });
  }
  if (avatarBuffer) {
    composites.push({ input: avatarBuffer, left: 108, top: 194 });
  }

  return sharp(svg).composite(composites).png({ quality: 92 }).toBuffer();
}

const ITIN_ICONS = {
  calendar: 'M8 2v4M16 2v4M3.5 9.5h17M5 5h14a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 21H5a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 5 5Z',
  plane: 'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
  moon: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5.2l3.4 2',
  seat: 'M5 10V6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5V10M6.5 19.5V21M17.5 19.5V21M4 11h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z',
};

/**
 * Baris "chip" ikon+teks di bawah judul kartu — dipakai kartu itinerary dan
 * kartu paket supaya keduanya memakai geometri yang persis sama. `tone: 'gold'`
 * membalik chip jadi blok emas berteks gelap; dipakai untuk satu chip yang
 * memang perlu menonjol (sisa kursi), bukan sebagai variasi dekoratif.
 */
function renderOgChipRow(chips, x0, top) {
  const CHIP_PAD = 14;
  const CHIP_ICON = 16;
  const CHIP_GAP_ICON = 8;
  const CHIP_GAP = 10;
  let chipX = x0;
  return chips.filter(c => c && c.text).map(({ icon, text, tone }) => {
    const w = CHIP_PAD * 2 + CHIP_ICON + CHIP_GAP_ICON + measureText(text, 16);
    const x = chipX;
    chipX += w + CHIP_GAP;
    const gold = tone === 'gold';
    return `
      <rect x="${x.toFixed(1)}" y="${top}" width="${w.toFixed(1)}" height="37" rx="10" fill="${gold ? '#D4AF37' : '#FFFFFF26'}"/>
      <path d="${ITIN_ICONS[icon]}" transform="translate(${(x + CHIP_PAD).toFixed(1)} ${top + 10}) scale(0.667)" fill="none" stroke="${gold ? '#33210A' : '#FFFFFFCC'}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="${(x + CHIP_PAD + CHIP_ICON + CHIP_GAP_ICON).toFixed(1)}" y="${top + 24}" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="${gold ? '700' : '600'}" fill="${gold ? '#33210A' : '#FFFFFF'}">${escapeXml(text)}</text>`;
  }).join('');
}

/**
 * Itinerary share OG card. Package title plus a proportional per-city night
 * bar on burgundy — that bar is a direct translation of the "Ringkasan
 * Perjalanan" block on the page, and its numbers come from the same helper,
 * so the card and the page cannot disagree.
 */
export async function generateItineraryOgPng({
  paketName,
  departDate,
  airline,
  dayCount,
  segments,
  agentName,
  agentPhotoBuffer,
}) {
  const W = 1200;
  const H = 630;
  const MARGIN = 56;
  const CONTENT_W = W - MARGIN * 2;

  const titleLines = wrapOgLines(formatPackageTitle(paketName) || 'Itinerary Umroh', 60, 748, 2)
    .map(escapeXml);
  const lastBaseline = 306;
  const firstBaseline = lastBaseline - 68 * (titleLines.length - 1);
  const eyebrowBaseline = firstBaseline - 66;

  const visibleSegments = Array.isArray(segments) ? segments.filter(s => s && s.nights > 0) : [];
  const totalNights = visibleSegments.reduce((n, s) => n + s.nights, 0);
  const days = Number(dayCount) > 0 ? Number(dayCount) : 0;

  const chipTexts = [
    { icon: 'calendar', text: formatIdDate(departDate) },
    { icon: 'plane', text: truncateOgText(formatPackageTitle(airline), 24) },
    {
      icon: 'moon',
      text: days && totalNights ? `${days} hari · ${totalNights} malam`
        : days ? `${days} hari` : '',
    },
  ].filter(c => c.text);

  const chipSvg = renderOgChipRow(chipTexts, MARGIN, 336);

  const STRIP_Y = 426;
  const STRIP_GAP = 8;
  let stripSvg = '';
  if (visibleSegments.length && totalNights > 0) {
    const avail = CONTENT_W - STRIP_GAP * (visibleSegments.length - 1);
    let segX = MARGIN;
    stripSvg = visibleSegments.map((s) => {
      const w = Math.max(24, Math.round((avail * s.nights) / totalNights));
      const color = OG_CITY_HEX[s.key] || OG_CITY_HEX.transit;
      const rawLabel = CITY_LABEL_ID[s.key] || s.key;
      const label = escapeXml(rawLabel);
      const nameX = segX + 20;
      // measureText meremehkan lebar teks tebal, jadi lebarnya dilebihkan —
      // kalau pas-pasan, "Madinah" dan "3 malam" saling menempel.
      const nameW = measureText(rawLabel, 19) * 1.12;
      const nightsX = nameX + nameW + 14;
      // Label menyusut bertahap: segmen 2 malam terlalu sempit untuk memuat
      // "Dubai 2 malam" dan akan menabrak label kota berikutnya.
      const budget = w - 6;
      const fitsFull = 20 + nameW + 14 + measureText(`${s.nights} malam`, 17) * 1.06 <= budget;
      const fitsShort = 20 + nameW + 14 + measureText(`${s.nights}`, 17) * 1.06 <= budget;
      const fitsName = 20 + nameW <= budget;
      const nightsText = fitsFull ? `${s.nights} malam` : fitsShort ? `${s.nights}` : '';
      const block = `
        <rect x="${segX}" y="${STRIP_Y}" width="${w}" height="16" rx="8" fill="${color}"/>
        <circle cx="${segX + 5.5}" cy="${STRIP_Y + 40}" r="5.5" fill="${color}"/>
        ${fitsName ? `<text x="${nameX}" y="${STRIP_Y + 46}" font-family="Inter, Arial, sans-serif" font-size="19" font-weight="700" fill="#FFFFFF">${label}</text>` : ''}
        ${fitsName && nightsText ? `<text x="${nightsX.toFixed(1)}" y="${STRIP_Y + 46}" font-family="Inter, Arial, sans-serif" font-size="17" font-weight="500" fill="#FFFFFF99">${nightsText}</text>` : ''}`;
      segX += w + STRIP_GAP;
      return block;
    }).join('');
  } else {
    // Fallback: computeNightSegments gave up (>30% unknown locations, or fewer
    // than 2 days). The card is still useful — just tidy the empty band.
    stripSvg = `
      <rect x="${MARGIN}" y="${STRIP_Y + 6}" width="${CONTENT_W}" height="2" fill="#FFFFFF26"/>
      ${days ? `<text x="${MARGIN}" y="${STRIP_Y + 50}" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="800" letter-spacing="2" fill="#F0DDA8">${days} HARI PERJALANAN</text>` : ''}`;
  }

  const safeAgent = escapeXml(truncateOgText(stripUnrenderableGlyphs(agentName) || 'Agent Alhijaz', 28));
  const safeInitials = escapeXml(ogInitials(agentName));

  const badgeText = 'ITINERARY';
  const badgeW = Math.round(measureText(badgeText, 14) + 3 * badgeText.length + 32);
  const badgeX = W - MARGIN - badgeW;

  let avatarBuffer = null;
  if (agentPhotoBuffer) {
    try {
      avatarBuffer = await sharp(agentPhotoBuffer)
        .resize(52, 52, { fit: 'cover' })
        .composite([{ input: Buffer.from('<svg width="52" height="52"><circle cx="26" cy="26" r="26" fill="white"/></svg>'), blend: 'dest-in' }])
        .png()
        .toBuffer();
    } catch (err) {
      console.warn('[og-generator] Failed to process itinerary agent photo:', err.message);
    }
  }

  const svg = Buffer.from(`
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="itinBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#4A0805"/>
          <stop offset="100%" stop-color="#8A0F0A"/>
        </linearGradient>
        <radialGradient id="itinHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#F0DDA8" stop-opacity="0.20"/>
          <stop offset="100%" stop-color="#F0DDA8" stop-opacity="0"/>
        </radialGradient>
      </defs>

      <rect width="${W}" height="${H}" fill="url(#itinBg)"/>
      <circle cx="1160" cy="50" r="260" fill="#D4AF37" opacity="0.07"/>
      <circle cx="70" cy="660" r="230" fill="#FB7185" opacity="0.07"/>
      <circle cx="994" cy="236" r="178" fill="url(#itinHalo)"/>

      <rect x="${badgeX}" y="48" width="${badgeW}" height="35" rx="9" fill="none" stroke="#FFFFFF66" stroke-width="1.5"/>
      <text x="${badgeX + badgeW / 2}" y="71" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="800" letter-spacing="3" fill="#FFFFFFCC" text-anchor="middle">${badgeText}</text>

      <text x="${MARGIN}" y="${eyebrowBaseline}" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="800" letter-spacing="3.4" fill="#D4AF37">RENCANA PERJALANAN HARI PER HARI</text>
      ${titleLines.map((line, i) => `<text x="${MARGIN}" y="${firstBaseline + i * 68}" font-family="Inter, Arial, sans-serif" font-size="60" font-weight="800" letter-spacing="-1.4" fill="#FFFFFF">${line}</text>`).join('')}
      ${chipSvg}
      ${stripSvg}

      <circle cx="84" cy="556" r="28" fill="#FFFFFF26" stroke="#D4AF37" stroke-width="2"/>
      ${avatarBuffer ? '' : `<text x="84" y="564" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="800" fill="#FFFFFF" text-anchor="middle">${safeInitials}</text>`}
      <text x="126" y="550" font-family="Inter, Arial, sans-serif" font-size="19" font-weight="700" fill="#FFFFFF">${safeAgent}</text>
      <text x="126" y="572" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700" letter-spacing="1.6" fill="#F0DDA8">KONSULTAN UMROH &amp; HAJI PLUS</text>
      <text x="${W - MARGIN}" y="562" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="700" fill="#FFFFFFB3" text-anchor="end">alhijaz.co</text>
    </svg>
  `);

  const composites = [];

  const logoPath = path.join(PROJECT_ROOT, 'src', 'new-logo', 'new-logo-alhijaz-white.png');
  if (fs.existsSync(logoPath)) {
    const logo = await sharp(logoPath).resize({ width: 190 }).png().toBuffer();
    composites.push({ input: logo, left: MARGIN, top: 46 });
  }

  // Ka'bah emblem. sharp has no opacity option on composite, so the alpha is
  // scaled via dest-in with a semi-transparent white (0x54 ≈ 0.33). Kept faint
  // on purpose: it is a watermark behind the content, not a photo.
  const emblemPath = path.join(PROJECT_ROOT, 'public', 'img-brosur', 'kabah.png');
  if (fs.existsSync(emblemPath)) {
    try {
      const scaled = await sharp(emblemPath).resize({ width: 364 }).ensureAlpha().png().toBuffer();
      // Masker dest-in harus persis seukuran gambarnya; kabah.png tidak bujur
      // sangkar (657x644), jadi tingginya dibaca ulang, bukan diasumsikan.
      const { width: ew, height: eh } = await sharp(scaled).metadata();
      const emblem = await sharp(scaled)
        .composite([{ input: Buffer.from(`<svg width="${ew}" height="${eh}"><rect width="${ew}" height="${eh}" fill="#ffffff54"/></svg>`), blend: 'dest-in' }])
        .png()
        .toBuffer();
      composites.push({ input: emblem, left: 812, top: 58 });
    } catch (err) {
      console.warn('[og-generator] Failed to process itinerary emblem:', err.message);
    }
  }

  if (avatarBuffer) composites.push({ input: avatarBuffer, left: 58, top: 530 });

  return sharp(svg).composite(composites).png({ quality: 92 }).toBuffer();
}

/**
 * Kartu OG satu paket (/:slug/:jadwalId). Isinya persis fakta yang dibaca
 * jamaah di kartu paket: nama, keberangkatan, durasi, maskapai, sisa kursi,
 * harga mulai berikut tipe kamarnya, dan hotel per kota. Angkanya datang dari
 * pemanggil (server.js) yang memakai helper brochure-schedule yang sama dengan
 * halaman, jadi kartu ini tak bisa menyebut harga yang berbeda dari halamannya.
 *
 * Hijau, bukan burgundy seperti kartu itinerary: dua permukaan share ini sering
 * dikirim berdampingan oleh agent yang sama, dan warnanya yang membedakan
 * "jadwal & harga" dari "rencana harian" di daftar chat.
 */
export async function generatePackageOgPng({
  paketName,
  packageId,
  departDate,
  durationDays,
  airline,
  priceFrom,
  priceRoom,
  seatSisa,
  hotels,
  agentName,
  agentPhotoBuffer,
}) {
  const W = 1200;
  const H = 630;
  const MARGIN = 56;

  // Nama paket Alhijaz sering panjang ("PLUS REDSEA PAKET RAHMAH 9HR (KERETA
  // CEPAT)") — dua baris 60px memotongnya jadi "…(Kereta…", persis informasi
  // yang membedakan satu paket dari paket lain. Turun satu tingkat ukuran dulu
  // sebelum membiarkannya terpotong.
  const rawTitle = formatPackageTitle(paketName) || String(packageId || '').toUpperCase() || 'Paket Umroh';
  const TITLE_STEPS = [
    { size: 60, step: 68, maxLines: 2, eyebrowGap: 66 },
    { size: 46, step: 54, maxLines: 3, eyebrowGap: 54 },
  ];
  const fitted = TITLE_STEPS
    .map(s => ({ ...s, lines: wrapOgLines(rawTitle, s.size, 748, s.maxLines) }))
    .find(s => !s.lines.some(line => line.endsWith('…')))
    || { ...TITLE_STEPS[TITLE_STEPS.length - 1], lines: wrapOgLines(rawTitle, 46, 748, 3) };

  const titleLines = fitted.lines.map(escapeXml);
  const lastBaseline = 306;
  const firstBaseline = lastBaseline - fitted.step * (titleLines.length - 1);
  const eyebrowBaseline = firstBaseline - fitted.eyebrowGap;

  const departLabel = formatIdDate(departDate);
  const eyebrow = departLabel ? `KEBERANGKATAN ${departLabel.toUpperCase()}` : 'JADWAL UMROH ALHIJAZ INDOWISATA';

  const days = Number(durationDays) > 0 ? Number(durationDays) : 0;
  const kursi = seatNoteId(seatSisa);
  const chipSvg = renderOgChipRow([
    { icon: 'clock', text: days ? `${days} hari` : '' },
    { icon: 'plane', text: truncateOgText(formatPackageTitle(airline), 24) },
    // Huruf besar di awal: chip ini berdiri sendiri, bukan sambungan kalimat.
    { icon: 'seat', text: kursi ? `${kursi.charAt(0).toUpperCase()}${kursi.slice(1)}` : '', tone: 'gold' },
  ], MARGIN, 336);

  // ── Panel harga (kiri) ──
  const PANEL_X = MARGIN;
  const PANEL_Y = 396;
  const PANEL_W = 548;
  const PANEL_H = 120;
  const priceLabel = formatPriceShort(priceFrom);
  const roomLabel = roomLabelId(priceRoom);
  const priceSuffix = priceLabel ? `/pax${roomLabel ? ` · ${roomLabel}` : ''}` : '';
  // measureText melebihkan lebar string berangka (faktor 0.52/char dikalibrasi
  // untuk huruf), jadi dikoreksi turun — kalau tidak, "/pax" mengambang jauh
  // dari digit terakhir.
  const suffixX = PANEL_X + 32 + measureText(priceLabel, 52) * 0.9 + 14;
  const priceSvg = priceLabel
    ? `
      <text x="${PANEL_X + 32}" y="${PANEL_Y + 42}" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="800" letter-spacing="3" fill="#F0DDA8">MULAI DARI</text>
      <text x="${PANEL_X + 32}" y="${PANEL_Y + 96}" font-family="Inter, Arial, sans-serif" font-size="52" font-weight="800" letter-spacing="-1" fill="#FFFFFF">${escapeXml(priceLabel)}</text>
      <text x="${suffixX.toFixed(1)}" y="${PANEL_Y + 96}" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="600" fill="#FFFFFFB3">${escapeXml(priceSuffix)}</text>`
    : `
      <text x="${PANEL_X + 32}" y="${PANEL_Y + 42}" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="800" letter-spacing="3" fill="#F0DDA8">HARGA PAKET</text>
      <text x="${PANEL_X + 32}" y="${PANEL_Y + 92}" font-family="Inter, Arial, sans-serif" font-size="40" font-weight="800" fill="#FFFFFF">Hubungi kami</text>`;

  // ── Hotel per kota (kanan) ──
  const HOTEL_X = 660;
  const visibleHotels = (Array.isArray(hotels) ? hotels : []).filter(h => h && h.name).slice(0, 2);
  const hotelSvg = visibleHotels.map((hotel, i) => {
    const baseY = PANEL_Y + 32 + i * 52;
    // Bintang ditulis, bukan digambar: glyph ★ ada di rentang yang dibuang
    // stripUnrenderableGlyphs (Pango bisa fatal), jadi ia akan hilang diam-diam.
    const stars = Number(hotel.stars) > 0 ? ` · BINTANG ${Math.min(5, Math.round(Number(hotel.stars)))}` : '';
    return `
      <text x="${HOTEL_X}" y="${baseY}" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="800" letter-spacing="2.2" fill="#F0DDA8">${escapeXml(String(hotel.city || '').toUpperCase())}${stars}</text>
      <text x="${HOTEL_X}" y="${baseY + 26}" font-family="Inter, Arial, sans-serif" font-size="21" font-weight="700" fill="#FFFFFF">${escapeXml(truncateOgText(formatHotelName(hotel.name), 26))}</text>`;
  }).join('');

  const safeAgent = escapeXml(truncateOgText(stripUnrenderableGlyphs(agentName) || '', 28));
  const safeInitials = escapeXml(ogInitials(agentName));

  const badgeText = 'PAKET UMROH';
  const badgeW = Math.round(measureText(badgeText, 14) + 3 * badgeText.length + 32);
  const badgeX = W - MARGIN - badgeW;

  let avatarBuffer = null;
  if (agentPhotoBuffer) {
    try {
      avatarBuffer = await sharp(agentPhotoBuffer)
        .resize(52, 52, { fit: 'cover' })
        .composite([{ input: Buffer.from('<svg width="52" height="52"><circle cx="26" cy="26" r="26" fill="white"/></svg>'), blend: 'dest-in' }])
        .png()
        .toBuffer();
    } catch (err) {
      console.warn('[og-generator] Failed to process package agent photo:', err.message);
    }
  }

  const footerSvg = safeAgent
    ? `
      <circle cx="84" cy="556" r="28" fill="#FFFFFF26" stroke="#D4AF37" stroke-width="2"/>
      ${avatarBuffer ? '' : `<text x="84" y="564" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="800" fill="#FFFFFF" text-anchor="middle">${safeInitials}</text>`}
      <text x="126" y="550" font-family="Inter, Arial, sans-serif" font-size="19" font-weight="700" fill="#FFFFFF">${safeAgent}</text>
      <text x="126" y="572" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700" letter-spacing="1.6" fill="#F0DDA8">KONSULTAN UMROH &amp; HAJI PLUS</text>`
    : `
      <text x="${MARGIN}" y="550" font-family="Inter, Arial, sans-serif" font-size="19" font-weight="700" fill="#FFFFFF">PT Alhijaz Indowisata</text>
      <text x="${MARGIN}" y="572" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700" letter-spacing="1.6" fill="#F0DDA8">TRAVEL UMROH &amp; HAJI PLUS</text>`;

  const svg = Buffer.from(`
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="pkgBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#03241A"/>
          <stop offset="100%" stop-color="#0A5C42"/>
        </linearGradient>
        <radialGradient id="pkgHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#F0DDA8" stop-opacity="0.20"/>
          <stop offset="100%" stop-color="#F0DDA8" stop-opacity="0"/>
        </radialGradient>
      </defs>

      <rect width="${W}" height="${H}" fill="url(#pkgBg)"/>
      <circle cx="1160" cy="50" r="260" fill="#D4AF37" opacity="0.08"/>
      <circle cx="70" cy="660" r="230" fill="#34D399" opacity="0.08"/>
      <circle cx="1000" cy="220" r="178" fill="url(#pkgHalo)"/>

      <rect x="${badgeX}" y="48" width="${badgeW}" height="35" rx="9" fill="none" stroke="#FFFFFF66" stroke-width="1.5"/>
      <text x="${badgeX + badgeW / 2}" y="71" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="800" letter-spacing="3" fill="#FFFFFFCC" text-anchor="middle">${badgeText}</text>

      <text x="${MARGIN}" y="${eyebrowBaseline}" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="800" letter-spacing="3.4" fill="#D4AF37">${escapeXml(eyebrow)}</text>
      ${titleLines.map((line, i) => `<text x="${MARGIN}" y="${firstBaseline + i * fitted.step}" font-family="Inter, Arial, sans-serif" font-size="${fitted.size}" font-weight="800" letter-spacing="-1.4" fill="#FFFFFF">${line}</text>`).join('')}
      ${chipSvg}

      <rect x="${PANEL_X}" y="${PANEL_Y}" width="${PANEL_W}" height="${PANEL_H}" rx="18" fill="#FFFFFF14" stroke="#FFFFFF2E" stroke-width="1.5"/>
      ${priceSvg}
      ${hotelSvg}

      ${footerSvg}
      <text x="${W - MARGIN}" y="562" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="700" fill="#FFFFFFB3" text-anchor="end">alhijaz.co</text>
    </svg>
  `);

  const composites = [];

  const logoPath = path.join(PROJECT_ROOT, 'src', 'new-logo', 'new-logo-alhijaz-white.png');
  if (fs.existsSync(logoPath)) {
    const logo = await sharp(logoPath).resize({ width: 190 }).png().toBuffer();
    composites.push({ input: logo, left: MARGIN, top: 46 });
  }

  // Watermark Ka'bah — sama seperti kartu itinerary, tapi lebih kecil dan lebih
  // ke atas supaya tidak menabrak blok hotel di kanan bawah.
  const emblemPath = path.join(PROJECT_ROOT, 'public', 'img-brosur', 'kabah.png');
  if (fs.existsSync(emblemPath)) {
    try {
      const scaled = await sharp(emblemPath).resize({ width: 300 }).ensureAlpha().png().toBuffer();
      const { width: ew, height: eh } = await sharp(scaled).metadata();
      const emblem = await sharp(scaled)
        .composite([{ input: Buffer.from(`<svg width="${ew}" height="${eh}"><rect width="${ew}" height="${eh}" fill="#ffffff4a"/></svg>`), blend: 'dest-in' }])
        .png()
        .toBuffer();
      composites.push({ input: emblem, left: 866, top: 58 });
    } catch (err) {
      console.warn('[og-generator] Failed to process package emblem:', err.message);
    }
  }

  if (avatarBuffer && safeAgent) composites.push({ input: avatarBuffer, left: 58, top: 530 });

  return sharp(svg).composite(composites).png({ quality: 92 }).toBuffer();
}

/**
 * Generate the OG image for an agent and save it to public/og/{slug}.png.
 * Fire-and-forget friendly — never throws; logs and returns a status.
 */
export async function regenerateOgForAgent(agent) {
  if (!agent || !agent.slug) return { ok: false, reason: 'missing-agent' };
  const slug = agent.slug;
  try {
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    const photoBuffer = await loadAgentPhotoBuffer(agent.photo, slug);
    const png = await generateOgPng({
      name: agent.name,
      website: agent.website,
      phone: agent.phone,
      photoBuffer,
    });
    const outPath = path.join(OUTPUT_DIR, `${slug}.png`);
    fs.writeFileSync(outPath, png);
    console.log(`[og-generator] ✅ ${slug}.png (${(png.length / 1024).toFixed(0)}kb)`);
    return { ok: true, path: outPath, hadPhoto: !!photoBuffer };
  } catch (err) {
    console.error(`[og-generator] ❌ Failed for ${slug}:`, err.message);
    return { ok: false, reason: err.message };
  }
}

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'public', 'og');

export function escapeXml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
  const safeName = escapeXml(name || 'Alhijaz');
  const safeWeb = escapeXml(website || 'alhijazindonesia.com');
  const safePhone = escapeXml(formatPhone(phone));
  const nameWidth = measureText(name, 38);
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
  const clean = String(value || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!clean || clean.length < 4 || /\s/.test(clean)) return '';
  return clean.length > 50 ? `${clean.slice(0, 48)}…` : clean;
}

/**
 * Pecah nama jadi maksimal 2 baris dengan ukuran font yang selalu muat pada
 * lebar panel data (676px). Nama sangat panjang dikecilkan dulu sebelum
 * dipotong ellipsis.
 */
function splitAgentName(raw) {
  const name = String(raw || 'Agent Alhijaz').trim().replace(/\s+/g, ' ');
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
  const safeJamaah = escapeXml(jamaahName || 'Jamaah Alhijaz');
  const safePaket = escapeXml(paketName || '');
  const safeMaskapai = escapeXml(maskapai || '');
  const safeAgent = escapeXml(agentName || '');

  // Truncate visually if too long (rough char budget for 38pt at available width).
  // SVG doesn't auto-wrap, so we just cap to avoid overflow into the photo/footer.
  const jamaahDisplay = safeJamaah.length > 30 ? safeJamaah.slice(0, 28) + '…' : safeJamaah;
  const paketDisplay = safePaket.length > 40 ? safePaket.slice(0, 38) + '…' : safePaket;

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
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}…` : text;
}

function ogInitials(value) {
  return String(value || 'AH')
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
  const safeAgent = escapeXml(truncateOgText(agentName || 'Agent Alhijaz', 30));
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

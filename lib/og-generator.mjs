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

  // HTTP(S) URL (e.g. Supabase Storage public URL)
  if (/^https?:\/\//i.test(photoField)) {
    try {
      const res = await fetch(photoField);
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

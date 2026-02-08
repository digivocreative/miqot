/**
 * Generate static OG images (1200x630) for each agent.
 * Uses sharp to composite: gradient background + agent photo (circular) + text overlay.
 *
 * Usage: node scripts/generate-og.mjs
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const AGENTS_DIR = path.join(ROOT, 'public', 'agents');
const OUTPUT_DIR = path.join(ROOT, 'public', 'og');

// ─── Agent Data ───
const AGENTS = {
  bagas:        { name: 'Bagas Pramudita',     website: 'alhijazindonesia.com',        phone: '6287878573311' },
  nikita:       { name: 'Nikita',              website: 'alhijazindonesia.com',        phone: '62822900020' },
  nila:         { name: 'Nila Novita Sari',    website: 'alhijaztourtravels.com',      phone: '6285211209049' },
  andra:        { name: 'Andra Olivia',        website: 'travelalhijazwisata.com',     phone: '628129909795' },
  dyah:         { name: 'Dyah Ratna Witri',    website: 'alhijaztraveltours.com',      phone: '6281385975678' },
  widi:         { name: 'Widi Purwanti',       website: 'alhijaz-hajiumroh.com',       phone: '6287820813228' },
  aulia:        { name: 'Leni Aulianingsih',   website: 'alhijazumrohtravel.com',      phone: '6282110407229' },
  selfiah:      { name: 'Selfiah Handayani',   website: 'alhijaztourtravel.co.id',     phone: '6281410478212' },
  zakia:        { name: 'Rahima Zakia',        website: 'alhijazbirowisata.com',       phone: '6285158005623' },
  dianwahyuni:  { name: 'Dian Wahyuni',        website: 'alhijazindowisatatours.com',  phone: '6283197968407' },
  anne:         { name: 'Anne Suryani',        website: 'hajialhijaz.com',             phone: '628129953424' },
  evi:          { name: 'Evi Chaniago',        website: 'alhijazbirohajiumroh.com',    phone: '6281806742789' },
  yenita:       { name: 'Yenita',              website: 'alhijazumrahtravel.com',      phone: '6281316803128' },
  indah:        { name: 'Indah Permata',       website: 'alhijaztraveltour.com',       phone: '6281943631008' },
  aisyah:       { name: 'Siti Aisyah',         website: 'travelalhijazumrah.com',      phone: '6281225600900' },
  siska:        { name: 'Siska Fadia',         website: 'alhijazumroh.com',            phone: '6281188885291' },
  linda:        { name: 'Nurlinda Dewi',       website: 'alhijazcallcenter.com',       phone: '6282112094089' },
};

// ─── Helpers ───
function formatPhone(phone) {
  const clean = phone.replace(/\D/g, '');
  if (clean.startsWith('62')) return `+62 ${clean.slice(2)}`;
  return phone;
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Approximate text width for Arial at a given font size
function measureText(text, fontSize) {
  // Average character width factor for Arial (approx 0.52 of font size)
  return text.length * fontSize * 0.52;
}

// ─── Main ───
async function generateOgImage(slug, agent) {
  const W = 1200, H = 630;
  const photoSize = 180;
  const photoX = 80, photoY = Math.round((H - photoSize) / 2) - 30;

  // 1. Gradient background SVG
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
      <!-- Bottom bar -->
      <rect x="0" y="${H - 80}" width="${W}" height="80" fill="#B91C1C"/>
      <!-- Gold accent line -->
      <rect x="0" y="${H - 84}" width="${W}" height="4" fill="#F59E0B"/>
    </svg>
  `);
  const bgBuffer = await sharp(bgSvg).png().toBuffer();

  // 2. Agent photo → circular
  const photoPath = path.join(AGENTS_DIR, `${slug}.jpg`);
  if (!fs.existsSync(photoPath)) {
    console.warn(`  ⚠ Photo not found: ${photoPath}, skipping`);
    return;
  }

  const photoBuffer = await sharp(photoPath)
    .resize(photoSize, photoSize, { fit: 'cover' })
    .png()
    .toBuffer();

  const circleMask = Buffer.from(`
    <svg width="${photoSize}" height="${photoSize}">
      <circle cx="${photoSize / 2}" cy="${photoSize / 2}" r="${photoSize / 2}" fill="white"/>
    </svg>
  `);

  const circularPhoto = await sharp(photoBuffer)
    .composite([{ input: circleMask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  // 3. Photo border ring
  const ringSize = photoSize + 8;
  const ringSvg = Buffer.from(`
    <svg width="${ringSize}" height="${ringSize}">
      <circle cx="${ringSize / 2}" cy="${ringSize / 2}" r="${ringSize / 2}" fill="white"/>
      <circle cx="${ringSize / 2}" cy="${ringSize / 2}" r="${ringSize / 2 - 1}" fill="none" stroke="#E5E7EB" stroke-width="1"/>
    </svg>
  `);
  const ringBuffer = await sharp(ringSvg).png().toBuffer();

  // 4. Text overlay SVG
  const textX = photoX + photoSize + 60;
  const formattedPhone = formatPhone(agent.phone);
  const safeName = escapeXml(agent.name);
  const safeWeb = escapeXml(agent.website);
  const safePhone = escapeXml(formattedPhone);

  // Calculate badge position based on actual text width
  const nameWidth = measureText(agent.name, 38);
  const badgeCx = textX + nameWidth + 24;
  const badgeCy = photoY + 43;

  const textSvg = Buffer.from(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <!-- Agent Name -->
      <text x="${textX}" y="${photoY + 50}" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="bold" fill="#111827">
        ${safeName}
      </text>
      
      <!-- Verified badge -->
      <circle cx="${badgeCx}" cy="${badgeCy}" r="14" fill="#1DA1F2"/>
      <polyline points="${badgeCx - 6},${badgeCy} ${badgeCx - 1},${badgeCy + 5} ${badgeCx + 7},${badgeCy - 6}" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>

      <!-- Website -->
      <text x="${textX}" y="${photoY + 95}" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#6B7280">
        🌐  ${safeWeb}
      </text>

      <!-- Phone -->
      <text x="${textX}" y="${photoY + 132}" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#374151" font-weight="600">
        📱  ${safePhone}
      </text>
      
      <!-- Tagline -->
      <text x="${textX}" y="${photoY + 178}" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="#9CA3AF" font-style="italic">
        Travel Consultant — Alhijaz Indowisata
      </text>

      <!-- Bottom bar text -->
      <text x="${W / 2}" y="${H - 32}" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="bold" fill="white" text-anchor="middle" letter-spacing="2">
        JADWAL UMRAH — ALHIJAZ INDOWISATA
      </text>
    </svg>
  `);

  // 5. Composite everything
  await sharp(bgBuffer)
    .composite([
      { input: ringBuffer, left: photoX - 4, top: photoY - 4 },
      { input: circularPhoto, left: photoX, top: photoY },
      { input: Buffer.from(textSvg), left: 0, top: 0 },
    ])
    .png({ quality: 90 })
    .toFile(path.join(OUTPUT_DIR, `${slug}.png`));

  console.log(`  ✅ ${slug}.png → ${agent.name}`);
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log('🎨 Generating OG images...\n');

  for (const [slug, agent] of Object.entries(AGENTS)) {
    await generateOgImage(slug, agent);
  }

  console.log(`\n✨ Done! Images generated in public/og/`);
}

main().catch(console.error);

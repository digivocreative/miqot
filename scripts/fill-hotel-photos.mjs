#!/usr/bin/env node
// Isi foto hotel dari situs RESMI hotel ke Bunny + kolom hotels.media.
//
// Sumber ditentukan manual lewat manifest (hasil riset per hotel), BUKAN hasil
// crawl otomatis: tiap URL harus berasal dari domain resmi hotel/rantainya.
// Manifest = JSON array [{ slug, category, url, source }].
//
// Idempoten: identitas file = sha256 ISI gambar setelah diproses, dan URL yang
// sha-nya sudah ada di hotels.media dilewati — jadi menjalankan ulang tidak
// menggandakan foto.
//
// Jalankan: node --env-file=.env scripts/fill-hotel-photos.mjs <manifest.json> [--dry]
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { normalizeHotelMediaInput, HOTEL_MAX_MEDIA_ITEMS } from '../lib/hotel-directory.js';

const manifestPath = process.argv[2];
const DRY = process.argv.includes('--dry');
if (!manifestPath) {
  console.error('Pemakaian: node --env-file=.env scripts/fill-hotel-photos.mjs <manifest.json> [--dry]');
  process.exit(1);
}

const {
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  BUNNY_STORAGE_API_KEY, BUNNY_STORAGE_ZONE, BUNNY_CDN_HOSTNAME,
} = process.env;
const BUNNY_STORAGE_HOSTNAME = process.env.BUNNY_STORAGE_HOSTNAME || 'storage.bunnycdn.com';
const FOLDER = 'hotels';

const missing = Object.entries({
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BUNNY_STORAGE_API_KEY, BUNNY_STORAGE_ZONE, BUNNY_CDN_HOSTNAME,
}).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(`Env belum lengkap: ${missing.join(', ')}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const CDN_PREFIX = `https://${BUNNY_CDN_HOSTNAME}/${FOLDER}/`;
const MAX_BYTES = 3 * 1024 * 1024;

// Cermin resizeHotelPhoto di klien: maks 1600px, JPEG 0.85, latar putih.
// Kalau masih >3MB (foto raksasa dari situs hotel), turunkan kualitas bertahap.
async function processImage(buffer) {
  let quality = 85;
  for (;;) {
    const out = await sharp(buffer)
      .rotate() // hormati EXIF orientation
      .resize({ width: 1600, withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (out.length <= MAX_BYTES || quality <= 55) return out;
    quality -= 10;
  }
}

async function download(url) {
  const res = await fetch(url, {
    headers: {
      // Beberapa CDN hotel menolak permintaan tanpa UA/Referer yang wajar.
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
      Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`unduh gagal ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 8 * 1024) throw new Error(`terlalu kecil (${buf.length} B) — kemungkinan placeholder`);
  return buf;
}

async function bunnyUpload(path, buffer) {
  const res = await fetch(`https://${BUNNY_STORAGE_HOSTNAME}/${BUNNY_STORAGE_ZONE}/${path}`, {
    method: 'PUT',
    headers: { AccessKey: BUNNY_STORAGE_API_KEY, 'Content-Type': 'image/jpeg' },
    body: buffer,
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`Bunny upload ${res.status}: ${await res.text()}`);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const bySlug = new Map();
for (const row of manifest) {
  if (!bySlug.has(row.slug)) bySlug.set(row.slug, []);
  bySlug.get(row.slug).push(row);
}

let uploaded = 0;
let skipped = 0;
const failures = [];

for (const [slug, rows] of bySlug) {
  const { data: hotel, error } = await supabase
    .from('hotels')
    .select('id, slug, name, media')
    .eq('slug', slug)
    .maybeSingle();
  if (error) { console.error(`[${slug}] query gagal: ${error.message}`); continue; }
  if (!hotel) { console.error(`[${slug}] hotel tidak ada di DB`); continue; }

  const media = Array.isArray(hotel.media) ? [...hotel.media] : [];
  const existingSha = new Set(
    media.map(m => (typeof m?.url === 'string' ? m.url.split('-').pop()?.replace(/\.\w+$/, '') : null)).filter(Boolean)
  );
  let added = 0;

  for (const row of rows) {
    if (media.length >= HOTEL_MAX_MEDIA_ITEMS) { console.warn(`[${slug}] batas ${HOTEL_MAX_MEDIA_ITEMS} media tercapai`); break; }
    try {
      const raw = await download(row.url);
      const jpeg = await processImage(raw);
      const sha = crypto.createHash('sha256').update(jpeg).digest('hex');
      if (existingSha.has(sha)) { skipped += 1; continue; }
      const fileName = `${FOLDER}/${slug}-${crypto.randomUUID()}-${sha}.jpg`;
      const publicUrl = `https://${BUNNY_CDN_HOSTNAME}/${fileName}`;
      if (!DRY) await bunnyUpload(fileName, jpeg);
      media.push({ type: 'image', url: publicUrl, category: row.category });
      existingSha.add(sha);
      added += 1;
      uploaded += 1;
      console.log(`[${slug}] ${row.category.padEnd(9)} ${(jpeg.length / 1024).toFixed(0).padStart(4)} KB  ← ${row.source}`);
    } catch (err) {
      failures.push({ slug, category: row.category, url: row.url, reason: err.message });
      console.error(`[${slug}] GAGAL ${row.category}: ${err.message}`);
    }
  }

  if (!added) continue;
  // Lewat validator asli supaya isi kolom persis seperti yang endpoint terima.
  const normalized = normalizeHotelMediaInput(media, [CDN_PREFIX]);
  if (!normalized) { console.error(`[${slug}] media hasil gabungan DITOLAK validator — dilewati`); continue; }
  if (DRY) { console.log(`[${slug}] (dry) akan menyimpan ${normalized.length} media`); continue; }
  const { error: upErr } = await supabase
    .from('hotels')
    .update({ media: normalized, updated_at: new Date().toISOString() })
    .eq('id', hotel.id);
  if (upErr) console.error(`[${slug}] simpan gagal: ${upErr.message}`);
  else console.log(`[${slug}] tersimpan — total ${normalized.length} media\n`);
}

console.log(`\nSelesai. Terunggah ${uploaded}, dilewati (sudah ada) ${skipped}, gagal ${failures.length}.`);
if (failures.length) {
  console.log('\nGagal:');
  for (const f of failures) console.log(`  ${f.slug} / ${f.category}: ${f.reason}\n    ${f.url}`);
}

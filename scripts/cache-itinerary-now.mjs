// One-off: paksa cache brosur/itinerary paket yang URL-nya ada tapi *_cdn masih kosong
// ke Bunny CDN — TANPA nunggu sync harian 03:30 WIB.
//
// Konteks: paket baru (mis. JBU1562/1563/1564, PROMO, masuk 15 Jun 2026) belum ter-cache,
// sehingga itinerary dimuat live dari origin alhijaz yang flaky (522 intermiten) → "Gagal memuat PDF".
// Origin men-generate PDF on-the-fly; 200 cepat saat cache CF hangat, 522 ~19,5s saat cache-miss.
// Maka downloadFile di sini RETRY agresif untuk menangkap window 200.
//
// Pakai fungsi asli dari lib/cdn-file-sync.js (jangan duplikasi keputusan/metadata).
// Jalankan dari root repo: node scripts/cache-itinerary-now.mjs

import 'dotenv/config';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { buildCdnMetadataUpdate, getCdnFileDecision } from '../lib/cdn-file-sync.js';

const BUNNY_STORAGE_API_KEY = process.env.BUNNY_STORAGE_API_KEY;
const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE;
const BUNNY_STORAGE_HOSTNAME = process.env.BUNNY_STORAGE_HOSTNAME || 'storage.bunnycdn.com';
const BUNNY_CDN_HOSTNAME = process.env.BUNNY_CDN_HOSTNAME;

if (!(BUNNY_STORAGE_API_KEY && BUNNY_STORAGE_ZONE && BUNNY_CDN_HOSTNAME)) {
  console.error('Bunny credentials tidak lengkap di .env'); process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const FILE_CONFIGS = [
  { kind: 'brosur', folder: 'brosur', sourceField: 'brosur', cdnField: 'brosur_cdn', fallbackExt: '.webp', label: 'Brosur' },
  { kind: 'itinerary', folder: 'itinerary', sourceField: 'itinerary', cdnField: 'itinerary_cdn', fallbackExt: '.pdf', label: 'Itinerary' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

// downloadFile mirip server.js, TAPI dengan retry karena origin alhijaz flaky (522).
async function downloadFileWithRetry(url, { attempts = 14, perAttemptMs = 25000 } = {}) {
  const normalizedUrl = url.replace('http://', 'https://');
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(normalizedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(perAttemptMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentType = res.headers.get('content-type') || 'application/octet-stream';
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
      // Sanity: PDF harus diawali %PDF; tolak body kecil/HTML yg lolos sbg 200.
      if (contentType.includes('pdf') && !buffer.subarray(0, 5).toString('latin1').startsWith('%PDF')) {
        throw new Error(`bukan PDF valid (magic mismatch, ${buffer.length}B)`);
      }
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      console.log(`    ✓ download ok di attempt ${i} (${buffer.length}B, ${contentType})`);
      return { buffer, contentType, ext, bytes: buffer.length, sha256 };
    } catch (err) {
      lastErr = err;
      console.log(`    … attempt ${i}/${attempts} gagal: ${err.message}`);
      if (i < attempts) await sleep(1500);
    }
  }
  throw new Error(`semua ${attempts} attempt gagal: ${lastErr?.message}`);
}

async function bunnyUpload(path, buffer, contentType) {
  const res = await fetch(`https://${BUNNY_STORAGE_HOSTNAME}/${BUNNY_STORAGE_ZONE}/${path}`, {
    method: 'PUT',
    headers: { 'AccessKey': BUNNY_STORAGE_API_KEY, 'Content-Type': contentType || 'application/octet-stream' },
    body: buffer,
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`Bunny upload failed: ${res.status} ${res.statusText}`);
}

async function main() {
  // Generik: semua row yang punya itinerary/brosur URL tapi *_cdn kosong (menyembuhkan JBU1562/63/64).
  const { data: rows, error } = await supabase
    .from('umroh_schedules')
    .select('jadwal_id, year_code, brosur, itinerary, brosur_cdn, itinerary_cdn, brosur_source_sha256, brosur_source_bytes, itinerary_source_sha256, itinerary_source_bytes')
    .or('and(itinerary.neq.,itinerary_cdn.is.null),and(itinerary.neq.,itinerary_cdn.eq.),and(brosur.neq.,brosur_cdn.is.null),and(brosur.neq.,brosur_cdn.eq.)');

  if (error) { console.error('Query gagal:', error.message); process.exit(1); }

  // Filter ulang di sini biar pasti (PostgREST .or kompleks bisa rapuh).
  const targets = (rows || []).filter(r =>
    (r.itinerary && !r.itinerary_cdn) || (r.brosur && !r.brosur_cdn));

  console.log(`Kandidat: ${targets.length} paket ->`, targets.map(r => r.jadwal_id).join(', ') || '(none)');

  let uploaded = 0, skipped = 0, errors = 0;
  for (const pkg of targets) {
    for (const config of FILE_CONFIGS) {
      const src = pkg[config.sourceField];
      if (!src || pkg[config.cdnField]) { continue; }
      console.log(`\n[${pkg.jadwal_id}] ${config.label}: ${src}`);
      try {
        const file = await downloadFileWithRetry(src);
        const fileMeta = { sha256: file.sha256, bytes: file.bytes, contentType: file.contentType };
        const decision = getCdnFileDecision(pkg, config.kind, fileMeta);
        if (decision.action === 'skip') { console.log(`    skip (${decision.reason})`); skipped++; continue; }

        const path = `${config.folder}/${pkg.jadwal_id}${file.ext || config.fallbackExt}`;
        await bunnyUpload(path, file.buffer, file.contentType);
        const cdnUrl = `https://${BUNNY_CDN_HOSTNAME}/${path}`;
        const update = buildCdnMetadataUpdate(config.kind, cdnUrl, fileMeta);
        const { error: upErr } = await supabase
          .from('umroh_schedules').update(update)
          .eq('jadwal_id', pkg.jadwal_id).eq('year_code', pkg.year_code);
        if (upErr) throw new Error(`DB update: ${upErr.message}`);
        console.log(`    ⬆️  uploaded -> ${cdnUrl}`);
        uploaded++;
      } catch (err) {
        console.error(`    ✗ ${err.message}`);
        errors++;
      }
    }
  }
  console.log(`\nSelesai: ${uploaded} uploaded, ${skipped} skipped, ${errors} errors.`);
  process.exit(errors && !uploaded ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });

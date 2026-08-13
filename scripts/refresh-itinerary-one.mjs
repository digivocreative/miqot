// One-off: paksa re-fingerprint + mirror CDN untuk SATU paket, tanpa menunggu
// scan harian 03:30 WIB. Dipakai saat kantor merevisi PDF di belakang URL yang
// sama (JBU1528, 13 Agt 2026: cache memuat itinerary keberangkatan 29 Agt).
//
// Memakai keputusan/metadata asli dari lib/cdn-file-sync.js — jangan duplikasi.
// Jalankan dari root repo: node scripts/refresh-itinerary-one.mjs JBU1528

import 'dotenv/config';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { buildCdnMetadataUpdate, buildContentAddressedCdnPath, getCdnFileDecision } from '../lib/cdn-file-sync.js';

const jadwalId = process.argv[2];
if (!jadwalId) { console.error('Usage: node refresh-itinerary-one.mjs <JADWAL_ID>'); process.exit(1); }

const BUNNY_STORAGE_API_KEY = process.env.BUNNY_STORAGE_API_KEY;
const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE;
const BUNNY_STORAGE_HOSTNAME = process.env.BUNNY_STORAGE_HOSTNAME || 'storage.bunnycdn.com';
const BUNNY_CDN_HOSTNAME = process.env.BUNNY_CDN_HOSTNAME;
if (!(BUNNY_STORAGE_API_KEY && BUNNY_STORAGE_ZONE && BUNNY_CDN_HOSTNAME)) {
  console.error('Bunny credentials tidak lengkap di .env'); process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function downloadWithRetry(url, attempts = 8) {
  const normalized = url.replace('http://', 'https://');
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(normalized, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://jadwal.alhijaz.co/' },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentType = res.headers.get('content-type') || 'application/octet-stream';
      const buffer = Buffer.from(await res.arrayBuffer());
      if (contentType.includes('pdf') && !buffer.subarray(0, 5).toString('latin1').startsWith('%PDF')) {
        throw new Error(`bukan PDF valid (${buffer.length}B)`);
      }
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      console.log(`  ✓ download attempt ${i}: ${buffer.length}B, sha ${sha256.slice(0, 16)}`);
      return { buffer, contentType, ext: '.pdf', bytes: buffer.length, sha256 };
    } catch (err) {
      lastErr = err;
      console.log(`  … attempt ${i}/${attempts} gagal: ${err.message}`);
      if (i < attempts) await sleep(1500);
    }
  }
  throw new Error(`semua attempt gagal: ${lastErr?.message}`);
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

const { data: pkg, error } = await supabase
  .from('umroh_schedules')
  .select('jadwal_id, year_code, itinerary, itinerary_cdn, itinerary_source_sha256, itinerary_source_bytes')
  .eq('jadwal_id', jadwalId)
  .maybeSingle();
if (error || !pkg) { console.error('Row tidak ditemukan:', error?.message); process.exit(1); }

console.log(`[${pkg.jadwal_id}] sumber: ${pkg.itinerary}`);
console.log(`  sha tercatat: ${pkg.itinerary_source_sha256?.slice(0, 16)} (${pkg.itinerary_source_bytes}B)`);

const file = await downloadWithRetry(pkg.itinerary);
const fileMeta = { sha256: file.sha256, bytes: file.bytes, contentType: file.contentType };
const decision = getCdnFileDecision(pkg, 'itinerary', fileMeta);
console.log(`  keputusan: ${decision.action} (${decision.reason})`);
if (decision.action === 'skip') { console.log('  Tidak ada perubahan — berhenti.'); process.exit(0); }

const path = buildContentAddressedCdnPath('itinerary', pkg.jadwal_id, file.sha256, file.ext);
await bunnyUpload(path, file.buffer, file.contentType);
const cdnUrl = `https://${BUNNY_CDN_HOSTNAME}/${path}`;
const update = buildCdnMetadataUpdate('itinerary', cdnUrl, fileMeta);
const { error: upErr } = await supabase
  .from('umroh_schedules').update(update)
  .eq('jadwal_id', pkg.jadwal_id).eq('year_code', pkg.year_code);
if (upErr) { console.error('  DB update gagal:', upErr.message); process.exit(1); }

console.log(`  ⬆️  uploaded → ${cdnUrl}`);
console.log('  Fingerprint diperbarui; cache lama kini terhitung stale → parse ulang saat diakses.');

#!/usr/bin/env node
// Buat derivatif web (webp 800px) untuk foto destinasi itinerary di Bunny
// Storage: foto-destinasi/<nama>.png (master, unggahan user, JANGAN disentuh)
// → foto-destinasi/web/<nama>.webp (yang direferensikan halaman share
// itinerary via destinationPhotoUrl di lib/itinerary-destinasi.js).
//
// Kenapa: master PNG 300–700KB per foto; satu itinerary menampilkan belasan
// foto → halaman berat di jaringan jamaah. Bunny Optimizer tidak aktif di pull
// zone (dicek 2026-07-31: ?width= tak berpengaruh), jadi resize dilakukan di
// sini dengan sharp. 800px ≈ 2× lebar render kartu (~460px) — tajam di retina.
//
// Jalankan ulang setiap user menambah/mengganti foto master:
//   node scripts/optimize-foto-destinasi.mjs          # hanya yang belum ada
//   node scripts/optimize-foto-destinasi.mjs --force  # regenerasi semua
//
// Env wajib: BUNNY_STORAGE_API_KEY, BUNNY_STORAGE_ZONE (opsional:
// BUNNY_STORAGE_HOSTNAME). Setelah --force, purge cache folder di panel Bunny.
import 'dotenv/config';
import sharp from 'sharp';

const KEY = process.env.BUNNY_STORAGE_API_KEY;
const ZONE = process.env.BUNNY_STORAGE_ZONE;
const STORAGE = process.env.BUNNY_STORAGE_HOSTNAME || 'storage.bunnycdn.com';
const FORCE = process.argv.includes('--force');
if (!KEY || !ZONE) {
  console.error('Env BUNNY_STORAGE_API_KEY / BUNNY_STORAGE_ZONE wajib diisi.');
  process.exit(1);
}

const base = `https://${STORAGE}/${ZONE}/foto-destinasi`;
const headers = { AccessKey: KEY };

const listRes = await fetch(`${base}/`, { headers });
if (!listRes.ok) { console.error('Gagal list folder:', listRes.status); process.exit(1); }
const entries = await listRes.json();
const masters = entries.filter(e => !e.IsDirectory && /\.png$/i.test(e.ObjectName));
const existingRes = await fetch(`${base}/web/`, { headers });
const existing = existingRes.ok
  ? new Set((await existingRes.json()).filter(e => !e.IsDirectory).map(e => e.ObjectName))
  : new Set();
console.log(`${masters.length} master PNG, ${existing.size} derivatif sudah ada${FORCE ? ' (force: regenerasi semua)' : ''}`);

let ok = 0, skipped = 0, failed = 0;
for (const m of masters) {
  const outName = m.ObjectName.replace(/\.png$/i, '.webp');
  if (!FORCE && existing.has(outName)) { skipped++; continue; }
  try {
    const src = await fetch(`${base}/${m.ObjectName}`, { headers });
    if (!src.ok) throw new Error(`GET ${src.status}`);
    const buf = Buffer.from(await src.arrayBuffer());
    const webp = await sharp(buf)
      .resize({ width: 800, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
    const put = await fetch(`${base}/web/${outName}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'image/webp' },
      body: webp,
    });
    if (!put.ok) throw new Error(`PUT ${put.status}`);
    ok++;
    console.log('↑', outName, `${Math.round(m.Length / 1024)}KB → ${Math.round(webp.length / 1024)}KB`);
  } catch (e) {
    failed++;
    console.error('GAGAL', m.ObjectName, e.message);
  }
}
console.log(`selesai: ${ok} upload, ${skipped} skip, ${failed} gagal`);
process.exit(failed ? 1 : 0);

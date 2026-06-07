#!/usr/bin/env node
// Sync asset statis landing ke Bunny Storage (path identik dengan public/
// sehingga url() relatif di dalam CSS tetap resolve di CDN).
//
// Env wajib  : BUNNY_STORAGE_API_KEY, BUNNY_STORAGE_ZONE, BUNNY_CDN_HOSTNAME
// Env opsional: BUNNY_STORAGE_HOSTNAME (default storage.bunnycdn.com)
// Flag       : --force  → upload ulang semua (abaikan cek HEAD)
//
// PENTING (urutan deploy): jalankan script ini SEBELUM merestart service dengan
// kode transform baru — env BUNNY_CDN_HOSTNAME sudah terpasang di produksi
// (dipakai wa-copy/brosur), jadi rewrite CDN langsung aktif begitu kode baru jalan.
//
// Update asset di kemudian hari: bump query ?ver= di template (pola repo) ATAU
// jalankan ulang dengan --force lalu purge cache di panel Bunny.
import 'dotenv/config';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, extname } from 'path';

const KEY = process.env.BUNNY_STORAGE_API_KEY;
const ZONE = process.env.BUNNY_STORAGE_ZONE;
const STORAGE = process.env.BUNNY_STORAGE_HOSTNAME || 'storage.bunnycdn.com';
const CDN = process.env.BUNNY_CDN_HOSTNAME;
const FORCE = process.argv.includes('--force');
if (!KEY || !ZONE || !CDN) {
  console.error('Env BUNNY_STORAGE_API_KEY / BUNNY_STORAGE_ZONE / BUNNY_CDN_HOSTNAME wajib diisi.');
  process.exit(1);
}

const ROOTS = ['public/wp-content', 'public/wp-includes', 'public/fonts'];
const MIME = {
  '.css': 'text/css', '.js': 'application/javascript', '.avif': 'image/avif',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject', '.json': 'application/json',
  '.ico': 'image/x-icon',
};

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const files = ROOTS.flatMap((r) => { try { return [...walk(r)]; } catch { return []; } });
console.log(files.length, 'file kandidat dari', ROOTS.join(', '));
let uploaded = 0, skipped = 0, failed = 0;
const queue = [...files];
await Promise.all(Array.from({ length: 4 }, async () => {
  for (let f = queue.shift(); f; f = queue.shift()) {
    const key = relative('public', f).split('\\').join('/');
    const size = statSync(f).size;
    if (!FORCE) {
      try {
        const head = await fetch(`https://${CDN}/${key}`, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
        if (head.ok && Number(head.headers.get('content-length')) === size) { skipped++; continue; }
      } catch { /* HEAD gagal → lanjut upload */ }
    }
    try {
      const res = await fetch(`https://${STORAGE}/${ZONE}/${key}`, {
        method: 'PUT',
        headers: { AccessKey: KEY, 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream' },
        body: readFileSync(f),
      });
      if (res.ok) { uploaded++; console.log('↑', key); }
      else { failed++; console.error('GAGAL', res.status, key); }
    } catch (e) {
      failed++; console.error('GAGAL', key, e.message);
    }
  }
}));
console.log(`selesai: ${uploaded} upload, ${skipped} skip (sudah ada), ${failed} gagal`);
process.exit(failed ? 1 : 0);

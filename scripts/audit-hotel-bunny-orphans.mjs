#!/usr/bin/env node
// Audit file media Direktori Hotel di Bunny Storage (folder `hotels/`).
//
// Membandingkan isi storage dengan URL yang benar-benar direferensikan DB
// (hotels.media + hotel_city_banners.image_url), lalu melaporkan dua arah:
//   YATIM  — ada di storage, tak direferensikan siapa pun (buang-buang kuota)
//   HILANG — direferensikan DB tapi filenya tidak ada (kartu/galeri rusak)
//
// Sejak 0d54c94 server membersihkan sendiri saat media dicabut/hotel dihapus;
// skrip ini untuk sisa sebelum perbaikan itu, dan sebagai pemeriksaan berkala.
//
// Default DRY-RUN (tidak menghapus apa pun). Pemakaian:
//   node --env-file=.env scripts/audit-hotel-bunny-orphans.mjs
//   node --env-file=.env scripts/audit-hotel-bunny-orphans.mjs --delete
//   node --env-file=.env scripts/audit-hotel-bunny-orphans.mjs --min-age-hours=48
//   node --env-file=.env scripts/audit-hotel-bunny-orphans.mjs --json
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const numArg = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const value = Number(hit.split('=')[1]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const DO_DELETE = flag('delete');
const AS_JSON = flag('json');
// Unggahan yang baru saja terjadi bisa saja sedang dikerjakan di form yang
// belum disimpan — jangan dihapus. Bukan yatim, cuma belum sempat tersimpan.
const MIN_AGE_HOURS = numArg('min-age-hours', 24);

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  BUNNY_STORAGE_API_KEY,
  BUNNY_STORAGE_ZONE,
  BUNNY_CDN_HOSTNAME,
} = process.env;
const BUNNY_STORAGE_HOSTNAME = process.env.BUNNY_STORAGE_HOSTNAME || 'storage.bunnycdn.com';
const FOLDER = 'hotels';

const missingEnv = Object.entries({
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  BUNNY_STORAGE_API_KEY,
  BUNNY_STORAGE_ZONE,
  BUNNY_CDN_HOSTNAME,
}).filter(([, value]) => !value).map(([key]) => key);
if (missingEnv.length) {
  console.error(`Env belum lengkap: ${missingEnv.join(', ')}`);
  console.error('Jalankan dengan: node --env-file=.env scripts/audit-hotel-bunny-orphans.mjs');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const CDN_PREFIX = `https://${BUNNY_CDN_HOSTNAME}/${FOLDER}/`;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Bunny mengirim waktu tanpa penanda zona ("2026-08-16T10:00:00.000") — itu UTC.
function parseBunnyDate(value) {
  if (typeof value !== 'string' || !value) return null;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function listStorageObjects() {
  const res = await fetch(`https://${BUNNY_STORAGE_HOSTNAME}/${BUNNY_STORAGE_ZONE}/${FOLDER}/`, {
    headers: { AccessKey: BUNNY_STORAGE_API_KEY, Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Bunny list gagal: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && !row.IsDirectory && typeof row.ObjectName === 'string')
    .map((row) => ({
      name: row.ObjectName,
      url: `${CDN_PREFIX}${row.ObjectName}`,
      bytes: Number(row.Length) || 0,
      changedAt: parseBunnyDate(row.LastChanged) || parseBunnyDate(row.DateCreated),
    }));
}

// Siapa yang memakai URL ini — dipakai saat melaporkan file HILANG supaya
// langsung ketahuan hotel/kategori mana yang tampilannya rusak.
async function loadReferences() {
  const refs = new Map();
  const addRef = (url, label) => {
    if (typeof url !== 'string' || !url) return;
    if (!refs.has(url)) refs.set(url, []);
    refs.get(url).push(label);
  };

  const { data: hotels, error } = await supabase.from('hotels').select('slug, name, media');
  if (error) throw new Error(`Query hotels gagal: ${error.message}`);
  for (const hotel of hotels || []) {
    for (const item of Array.isArray(hotel.media) ? hotel.media : []) {
      addRef(item?.url, `hotel:${hotel.slug}`);
    }
  }

  const { data: banners, error: bannerError } = await supabase
    .from('hotel_city_banners')
    .select('city, image_url');
  if (bannerError) {
    // Tabel banner belum dimigrasi = belum ada referensi banner sama sekali.
    const code = String(bannerError.code || '');
    const isMissingTable = ['42P01', 'PGRST205', 'PGRST200'].includes(code);
    if (!isMissingTable) throw new Error(`Query banner gagal: ${bannerError.message}`);
    console.warn('! Tabel hotel_city_banners belum ada — referensi banner dilewati.\n');
  }
  for (const row of banners || []) addRef(row?.image_url, `banner:${row.city}`);

  return refs;
}

async function deleteObject(name) {
  const res = await fetch(
    `https://${BUNNY_STORAGE_HOSTNAME}/${BUNNY_STORAGE_ZONE}/${FOLDER}/${name}`,
    {
      method: 'DELETE',
      headers: { AccessKey: BUNNY_STORAGE_API_KEY },
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!res.ok && res.status !== 404) throw new Error(`status ${res.status}`);
}

const [objects, refs] = await Promise.all([listStorageObjects(), loadReferences()]);

const now = Date.now();
const ageLimitMs = MIN_AGE_HOURS * 3600 * 1000;
const orphans = [];
const tooFresh = [];
for (const object of objects) {
  if (refs.has(object.url)) continue;
  // Tanpa tanggal, perlakukan sebagai baru (fail-closed) — jangan hapus.
  const ageMs = object.changedAt ? now - object.changedAt.getTime() : 0;
  (ageMs >= ageLimitMs ? orphans : tooFresh).push({ ...object, ageMs });
}

const storageUrls = new Set(objects.map((o) => o.url));
const missing = [];
for (const [url, users] of refs) {
  // Hanya URL di folder hotel yang bisa dinilai di sini (fallback Supabase
  // Storage punya prefix lain dan tidak diaudit skrip ini).
  if (!url.startsWith(CDN_PREFIX)) continue;
  if (!storageUrls.has(url)) missing.push({ url, users });
}

const orphanBytes = orphans.reduce((sum, o) => sum + o.bytes, 0);

if (AS_JSON) {
  console.log(JSON.stringify({
    folder: FOLDER,
    scanned: objects.length,
    referenced: refs.size,
    orphans: orphans.map(({ name, bytes, changedAt }) => ({ name, bytes, changedAt })),
    skippedTooFresh: tooFresh.map(({ name, bytes }) => ({ name, bytes })),
    missing,
    orphanBytes,
    deleted: false,
  }, null, 2));
  process.exit(0);
}

console.log(`Folder Bunny  : ${FOLDER}/ (${objects.length} file)`);
console.log(`Referensi DB  : ${refs.size} URL\n`);

if (missing.length) {
  console.log(`HILANG — direferensikan DB tapi file tidak ada (${missing.length}):`);
  for (const item of missing) {
    console.log(`  ${item.url.slice(CDN_PREFIX.length)}  ← ${item.users.join(', ')}`);
  }
  console.log('  Perbaiki dengan unggah ulang media lewat panel Kelola Hotel.\n');
}

if (tooFresh.length) {
  console.log(`DILEWATI — tak direferensikan tapi baru (< ${MIN_AGE_HOURS} jam, mungkin form belum disimpan): ${tooFresh.length} file\n`);
}

if (!orphans.length) {
  console.log('YATIM: tidak ada. Storage bersih.');
} else {
  console.log(`YATIM — ada di storage, tak dipakai siapa pun (${orphans.length} file, ${formatBytes(orphanBytes)}):`);
  for (const item of orphans.sort((a, b) => b.bytes - a.bytes)) {
    const age = Math.floor(item.ageMs / 3600000);
    console.log(`  ${item.name}  ${formatBytes(item.bytes).padStart(9)}  ${age} jam`);
  }
  if (!DO_DELETE) {
    console.log(`\nDry-run. Tambahkan --delete untuk menghapus ${orphans.length} file di atas.`);
  }
}

if (DO_DELETE && orphans.length) {
  console.log('\nMenghapus...');
  let deleted = 0;
  for (const item of orphans) {
    try {
      await deleteObject(item.name);
      deleted += 1;
    } catch (err) {
      console.error(`  GAGAL ${item.name}: ${err.message}`);
    }
  }
  console.log(`Selesai: ${deleted}/${orphans.length} file terhapus (${formatBytes(orphanBytes)} dibebaskan).`);
}

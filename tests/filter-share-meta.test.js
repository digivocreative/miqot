import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFilterShareMeta } from '../lib/filter-share-meta.js';

// Teks meta & kartu share per URL filter. SATU sumber untuk server.js (suntikan
// SSR + rute /og/filter) dan src/App.tsx (judul tab). Kalau dipisah, judul tab
// dan kartu WhatsApp bisa menyebut filter yang sama dengan dua nama berbeda.

const nikita = { agentName: 'Nikita Sari', agentSlug: 'nikita' };

test('tiap dimensi punya eyebrow & headline sendiri', () => {
  const cases = [
    ['umroh-ramadhan',  'JENIS PAKET',       'Umroh Ramadhan', 'Umroh Ramadhan'],
    ['landing-madinah', 'KOTA LANDING',      'Madinah',        'Landing Madinah'],
    ['9-hari',          'DURASI PERJALANAN', '9 Hari',         'Umroh 9 Hari'],
    ['november-2026',   'KEBERANGKATAN',     'November 2026',  'Keberangkatan November 2026'],
  ];
  for (const [slug, eyebrow, headline, titleHead] of cases) {
    const meta = buildFilterShareMeta({ filterSlug: slug, ...nikita });
    assert.equal(meta.eyebrow, eyebrow, `${slug} eyebrow`);
    assert.equal(meta.headline, headline, `${slug} headline`);
    assert.equal(meta.title, `${titleHead} — Jadwal Umroh Alhijaz | Nikita Sari`, `${slug} title`);
    assert.equal(meta.ogImagePath, `/og/filter/nikita/${slug}.png`, `${slug} og path`);
  }
});

test('mode telanjang memakai Title Case dari eyebrow-nya', () => {
  // Label dropdown "DATA PER-BULAN" itu jargon internal — tidak boleh tayang di
  // kartu yang dikirim agent ke jamaah.
  const bulan = buildFilterShareMeta({ filterSlug: 'data-per-bulan', ...nikita });
  assert.equal(bulan.eyebrow, 'KEBERANGKATAN');
  assert.equal(bulan.headline, 'Keberangkatan');
  const tipe = buildFilterShareMeta({ filterSlug: 'tipe-paket', ...nikita });
  assert.equal(tipe.headline, 'Jenis Paket');
  const landing = buildFilterShareMeta({ filterSlug: 'landing-di', ...nikita });
  assert.equal(landing.headline, 'Kota Landing');
});

test('tanpa agent: sufiks jatuh ke nama perusahaan, og path tanpa slug', () => {
  const meta = buildFilterShareMeta({ filterSlug: 'umroh-ramadhan' });
  assert.equal(meta.title, 'Umroh Ramadhan — Jadwal Umroh Alhijaz Indowisata');
  assert.equal(meta.ogImagePath, '/og/filter/umroh-ramadhan.png');
  assert.doesNotMatch(meta.description, /bersama/);
});

test('deskripsi menyebut filter + agent dan menutup dengan ajakan WhatsApp', () => {
  const meta = buildFilterShareMeta({ filterSlug: 'umroh-ramadhan', ...nikita });
  assert.match(meta.description, /Nikita Sari/);
  assert.match(meta.description, /WhatsApp/);
});

test('frasa deskripsi wajar per dimensi, bukan titleHead yang di-lowercase', () => {
  // Teks ini yang dibaca jamaah di preview WhatsApp. "paket umroh ramadhan"
  // mematikan huruf besarnya, dan "paket keberangkatan november 2026" bukan
  // bahasa Indonesia yang wajar.
  const desc = slug => buildFilterShareMeta({ filterSlug: slug, ...nikita }).description;
  assert.match(desc('umroh-ramadhan'), /paket Umroh Ramadhan dari/);
  assert.match(desc('landing-madinah'), /paket umroh yang mendarat di Madinah/);
  assert.match(desc('9-hari'), /paket umroh 9 hari dari/);
  assert.match(desc('november-2026'), /paket umroh keberangkatan November 2026/);
  assert.match(desc('tipe-paket'), /paket umroh dari semua jenis/);
  assert.match(desc('data-per-bulan'), /paket umroh menurut bulan keberangkatan/);
});

test('slug bukan-filter → null (bukan kartu kosong)', () => {
  // Pemanggil memakai null sebagai "pakai kartu agent" — fail-open. Kalau ini
  // mengembalikan objek, /nikita/JBU1574 akan dapat kartu filter yang salah.
  for (const asing of ['JBU1574', 'ngawur', '', undefined, null, 'jamaah']) {
    assert.equal(buildFilterShareMeta({ filterSlug: asing, ...nikita }), null, `slug: ${asing}`);
  }
});

test('mode tanpa sub-filter tidak dapat kartu sendiri', () => {
  // SEAT TERSEDIA & SEMUA DATA itu keadaan bawaan halaman, bukan "filter" yang
  // layak punya kartu sendiri — keduanya menampilkan isi yang sama dengan /{slug}.
  for (const slug of ['semua-data', 'liburan-sekolah', 'cuti-5-hari']) {
    assert.equal(buildFilterShareMeta({ filterSlug: slug, ...nikita }), null, `slug: ${slug}`);
  }
});

test('slug lama tetap dapat kartu yang benar', () => {
  // /umroh-promo & /bintang-5 sudah tersebar di WhatsApp.
  const promo = buildFilterShareMeta({ filterSlug: 'umroh-promo', ...nikita });
  assert.equal(promo.headline, 'Umroh Promo');
  assert.equal(promo.ogImagePath, '/og/filter/nikita/umroh-promo.png');
  const bintang = buildFilterShareMeta({ filterSlug: 'bintang-5', ...nikita });
  assert.equal(bintang.headline, 'Umroh Rahmah');
});

# Itinerary Share — Meta & og:image — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link `/{slug}/{packageId}/itinerary` yang dibagikan ke WhatsApp menampilkan kartu preview 1200×630 berisi nama paket, tanggal, maskapai, dan bentuk perjalanan per kota.

**Architecture:** Satu modul murni baru di `lib/` untuk semua logika presentasi (normalisasi nama paket, segmen kota, perakitan copy) supaya bisa diuji tanpa server. Kartu PNG dirender `sharp` dari string SVG di `lib/og-generator.mjs`, mengikuti pola tiga kartu OG yang sudah produksi. Dua sentuhan di `server.js`: rute PNG baru dan perluasan rute SSR.

**Tech Stack:** Node ESM, `sharp`, `node:test`, Express 5.

**Spec:** [2026-07-31-itinerary-og-meta-design.md](../specs/2026-07-31-itinerary-og-meta-design.md)

## Global Constraints

- Semua teks bebas yang masuk SVG **wajib** lewat `escapeXml()` dari `og-generator.mjs`. Emoji yang lolos membuat Pango gagal fatal dan mematikan proses Express — bukan exception yang bisa ditangkap.
- Kartu 1200×630, keluaran PNG, `og:image:type` `image/png`.
- Palet kota kartu OG **tidak boleh** memakai `CITY_HEX` dari `cityTheme.ts`. Nilai wajib: Mekkah `#6BA3E8`, Madinah `#3FA985`, Dubai `#E0B93C`, Turki `#F2827E`, Mesir `#B08BE0`, Transit `#9AA6B5`.
- Latar kartu: gradien linear 145° `#4A0805` → `#8A0F0A`. Aksen emas `#D4AF37`, emas lembut `#F0DDA8`.
- Judul meta: `Itinerary {nama} — Alhijaz Indowisata`. Deskripsi maksimal **160 karakter**.
- Logo kartu: `src/new-logo/new-logo-alhijaz-white.png` (bukan `src/logo-alhijaz-white.png`).
- Emblem: `public/img-brosur/kabah.png`.
- Rute `/og/itinerary/...` harus terdaftar **sebelum** middleware static, bersebelahan dengan rute `/og/*` lain.
- Tag `og:image` harus **disisipkan** sebelum `</head>`, bukan `.replace()` — `index.html` tidak punya tag itu.
- `server.js` tidak hot-reload; restart setelah menyentuhnya.
- Commit di `main`. Verifikasi `git branch --show-current` sebelum tiap commit.

---

### Task 1: Modul presentasi share itinerary

**Files:**
- Create: `lib/itinerary-share-meta.js`
- Test: `tests/itinerary-share-meta.test.js`

**Interfaces:**
- Consumes: `computeNightSegments` dari `lib/itinerary-view.js`
- Produces:
  - `CITY_LABEL_ID: Record<CityKey, string>`
  - `OG_CITY_HEX: Record<CityKey, string>`
  - `formatPackageTitle(raw: string) => string`
  - `formatIdDate(value: string) => string`
  - `ogSegments(days: Array<{location?: string}>) => Array<{key, nights}> | null`
  - `segmentsSentence(segments) => string`
  - `buildItineraryShareMeta({paketName, packageId, segments, dayCount, departDate, airline, agentName}) => {title, description}`

- [ ] **Step 1: Tulis test yang gagal**

`tests/itinerary-share-meta.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildItineraryShareMeta,
  formatIdDate,
  formatPackageTitle,
  ogSegments,
  segmentsSentence,
} from '../lib/itinerary-share-meta.js';

test('formatPackageTitle: huruf besar semua jadi title case', () => {
  assert.equal(formatPackageTitle('UMROH AKHIR RAMADHAN 1447'), 'Umroh Akhir Ramadhan 1447');
});

test('formatPackageTitle: kode maskapai dan token berangka dibiarkan', () => {
  assert.equal(formatPackageTitle('UMROH PLUS TURKI 12 HARI BY SV'), 'Umroh Plus Turki 12 Hari by SV');
  assert.equal(formatPackageTitle('PAKET A'), 'Paket A');
});

test('formatPackageTitle: token pertama tak pernah dikecilkan', () => {
  assert.equal(formatPackageTitle('BY SAUDIA'), 'By Saudia');
});

test('formatPackageTitle: nama campuran dibiarkan apa adanya', () => {
  assert.equal(formatPackageTitle('Umroh Ramadhan Reguler'), 'Umroh Ramadhan Reguler');
});

test('formatPackageTitle: kosong', () => {
  assert.equal(formatPackageTitle(null), '');
});

test('formatIdDate: ISO jadi tanggal Indonesia', () => {
  assert.equal(formatIdDate('2027-03-12'), '12 Maret 2027');
  assert.equal(formatIdDate(''), '');
  assert.equal(formatIdDate('bukan-tanggal'), '');
});

test('ogSegments: malam per kota, segmen Indonesia dibuang', () => {
  const days = [
    { location: 'Jakarta' },
    { location: 'Madinah' },
    { location: 'Madinah' },
    { location: 'Madinah' },
    { location: 'Mekkah' },
    { location: 'Mekkah' },
    { location: 'Jakarta' },
  ];
  assert.deepEqual(ogSegments(days), [
    { key: 'madinah', nights: 3 },
    { key: 'mekkah', nights: 2 },
  ]);
});

test('ogSegments: null kalau lokasi tak terbaca', () => {
  assert.equal(ogSegments([{ location: '' }, { location: '' }, { location: '' }]), null);
  assert.equal(ogSegments([]), null);
});

test('segmentsSentence', () => {
  assert.equal(
    segmentsSentence([{ key: 'madinah', nights: 3 }, { key: 'mekkah', nights: 4 }]),
    'Madinah 3, Mekkah 4 malam'
  );
  assert.equal(segmentsSentence(null), '');
});

test('buildItineraryShareMeta: kasus lengkap', () => {
  const meta = buildItineraryShareMeta({
    paketName: 'UMROH AKHIR RAMADHAN 1447',
    packageId: 'UAR1447',
    segments: [{ key: 'madinah', nights: 3 }, { key: 'mekkah', nights: 4 }, { key: 'dubai', nights: 2 }],
    dayCount: 9,
    departDate: '2027-03-12',
    airline: 'SAUDIA',
    agentName: 'Bagas Pramudita',
  });
  assert.equal(meta.title, 'Itinerary Umroh Akhir Ramadhan 1447 — Alhijaz Indowisata');
  assert.equal(
    meta.description,
    'Rencana perjalanan hari per hari: Madinah 3, Mekkah 4, Dubai 2 malam. '
    + 'Berangkat 12 Maret 2027 dengan Saudia. Bersama Bagas Pramudita — Alhijaz Indowisata.'
  );
  assert.ok(meta.description.length <= 160);
});

test('buildItineraryShareMeta: tanpa segmen jatuh ke jumlah hari', () => {
  const meta = buildItineraryShareMeta({
    paketName: 'UMROH HEMAT',
    packageId: 'UH1',
    segments: null,
    dayCount: 9,
    departDate: '2027-03-12',
    airline: 'SAUDIA',
    agentName: 'Bagas Pramudita',
  });
  assert.ok(meta.description.startsWith('Rencana perjalanan 9 hari.'));
});

test('buildItineraryShareMeta: klausa maskapai dibuang lebih dulu saat kepanjangan', () => {
  const meta = buildItineraryShareMeta({
    paketName: 'UMROH PLUS TURKI MESIR',
    packageId: 'UPTM',
    segments: [
      { key: 'madinah', nights: 3 }, { key: 'mekkah', nights: 4 }, { key: 'dubai', nights: 2 },
      { key: 'turki', nights: 3 }, { key: 'mesir', nights: 2 },
    ],
    dayCount: 16,
    departDate: '2027-09-12',
    airline: 'TURKISH AIRLINES',
    agentName: 'Muhammad Abdurrahman Alhabsyi',
  });
  assert.ok(meta.description.length <= 160, meta.description);
  assert.ok(!meta.description.includes('dengan'), meta.description);
  assert.ok(meta.description.includes('Muhammad Abdurrahman Alhabsyi'));
});

test('buildItineraryShareMeta: nama paket kosong jatuh ke packageId', () => {
  const meta = buildItineraryShareMeta({ paketName: '', packageId: 'uar1447', agentName: 'Bagas' });
  assert.equal(meta.title, 'Itinerary UAR1447 — Alhijaz Indowisata');
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

```bash
node --test tests/itinerary-share-meta.test.js
```

Expected: FAIL — `Cannot find module '.../lib/itinerary-share-meta.js'`

- [ ] **Step 3: Tulis implementasinya**

`lib/itinerary-share-meta.js`:

```js
// Presentasi share itinerary — dipakai server.js (rute SSR + rute OG) dan
// lib/og-generator.mjs. Modul murni, tanpa dependensi eksternal.
// Spec: docs/superpowers/specs/2026-07-31-itinerary-og-meta-design.md

import { computeNightSegments } from './itinerary-view.js';

// Label kota. Sumber kebenaran untuk tampilan web ada di
// src/components/itinerary/cityTheme.ts (CITY_LABEL); disalin ke sini karena
// modul TS itu tidak bisa diimpor server. Menambah kota = ubah keduanya.
export const CITY_LABEL_ID = {
  mekkah: 'Mekkah', madinah: 'Madinah', dubai: 'Dubai', turki: 'Turki',
  mesir: 'Mesir', transit: 'Transit', home: 'Indonesia',
};

// Palet kota untuk kartu OG berlatar burgundy gelap. SENGAJA berbeda dari
// CITY_HEX di cityTheme.ts, yang dikalibrasi untuk teks gelap di atas putih:
// dipakai apa adanya di sini semuanya gagal kontras, dan turki (#8A0F0A)
// identik dengan warna latar kartu sehingga segmennya hilang total.
export const OG_CITY_HEX = {
  mekkah: '#6BA3E8', madinah: '#3FA985', dubai: '#E0B93C', turki: '#F2827E',
  mesir: '#B08BE0', transit: '#9AA6B5', home: '#9AA6B5',
};

const TITLE_STOPWORDS = new Set(['BY', 'DAN', 'DI', 'KE', 'DARI']);
const DESCRIPTION_LIMIT = 160;

/**
 * jadwal_nama datang HURUF BESAR SEMUA dari sumber. Judul 60px huruf besar
 * semua memakan ruang jauh lebih banyak dan lebih lambat dibaca — tapi
 * toTitleCase generik akan merusak kode maskapai (SV → Sv) dan token berangka
 * (9H → 9h), jadi normalisasinya harus sadar bentuk token.
 */
export function formatPackageTitle(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (/[a-z]/.test(text)) return text; // sudah ditulis manusia, jangan diutak-atik
  return text
    .split(/(\s+)/)
    .map((token, i) => {
      if (!token.trim()) return token;
      if (/\d/.test(token)) return token;
      if (i > 0 && TITLE_STOPWORDS.has(token)) return token.toLowerCase();
      if (/^[A-Z]{1,3}$/.test(token)) return token;
      return token.charAt(0) + token.slice(1).toLowerCase();
    })
    .join('');
}

export function formatIdDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00Z`)
    : new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    }).format(parsed);
  } catch {
    return '';
  }
}

/**
 * Segmen malam untuk kartu OG. Memakai helper yang sama dengan JourneyStrip
 * supaya angka di kartu dan di halaman tidak pernah berbeda, termasuk
 * pembuangan segmen 'home' (malam di perjalanan pulang tak perlu disebut).
 */
export function ogSegments(days) {
  const segments = computeNightSegments(days);
  if (!segments) return null;
  const visible = segments.filter(s => s.key !== 'home');
  return visible.length ? visible : null;
}

export function segmentsSentence(segments) {
  if (!Array.isArray(segments) || !segments.length) return '';
  return `${segments.map(s => `${CITY_LABEL_ID[s.key] || s.key} ${s.nights}`).join(', ')} malam`;
}

/**
 * Judul + deskripsi meta. Deskripsi dirakit bertahap: kalau melewati batas
 * 160 karakter, klausa dibuang berurutan — maskapai, lalu rincian kota, lalu
 * embel merek. Klausa agent tidak pernah dibuang; setelah nama agent keluar
 * dari judul, di sinilah satu-satunya tempat ia muncul di teks meta.
 */
export function buildItineraryShareMeta({
  paketName,
  packageId,
  segments,
  dayCount,
  departDate,
  airline,
  agentName,
} = {}) {
  const nama = formatPackageTitle(paketName) || String(packageId || '').toUpperCase();
  const title = `Itinerary ${nama} — Alhijaz Indowisata`;

  const segmenText = segmentsSentence(segments);
  const tgl = formatIdDate(departDate);
  const maskapai = formatPackageTitle(airline);
  const agent = String(agentName || '').trim();
  const hari = Number(dayCount) > 0 ? `${Number(dayCount)} hari` : '';

  const compose = (level) => {
    const detailed = segmenText && level < 2;
    const c1 = detailed
      ? `Rencana perjalanan hari per hari: ${segmenText}.`
      : (hari ? `Rencana perjalanan ${hari}.` : 'Rencana perjalanan hari per hari.');
    const c2 = tgl
      ? (level >= 1 || !maskapai ? `Berangkat ${tgl}.` : `Berangkat ${tgl} dengan ${maskapai}.`)
      : '';
    const c3 = agent
      ? (level >= 3 ? `Bersama ${agent}.` : `Bersama ${agent} — Alhijaz Indowisata.`)
      : 'Alhijaz Indowisata.';
    return [c1, c2, c3].filter(Boolean).join(' ');
  };

  let description = compose(0);
  for (let level = 1; level <= 3 && description.length > DESCRIPTION_LIMIT; level += 1) {
    description = compose(level);
  }
  return { title, description };
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

```bash
node --test tests/itinerary-share-meta.test.js
```

Expected: PASS, 12 test.

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary-share-meta.js tests/itinerary-share-meta.test.js
git commit -m "feat(itinerary): modul presentasi share — nama paket, segmen kota, copy meta"
```

---

### Task 2: Kartu OG `generateItineraryOgPng`

**Files:**
- Modify: `lib/og-generator.mjs` (tambah import + fungsi baru di akhir, sebelum `regenerateOgForAgent`)
- Test: skrip asap manual (bukan unit test — keluarannya gambar)

**Interfaces:**
- Consumes: `formatIdDate`, `formatPackageTitle`, `CITY_LABEL_ID`, `OG_CITY_HEX` dari Task 1; `escapeXml`, `measureText`, `wrapOgLines`, `ogInitials`, `truncateOgText` yang sudah ada di modul
- Produces: `generateItineraryOgPng({paketName, departDate, airline, dayCount, segments, agentName, agentPhotoBuffer}) => Promise<Buffer>`

- [ ] **Step 1: Tambah import di kepala `lib/og-generator.mjs`**

Setelah baris `import { terasPreviewExcerpt } from './teras-share.js';`:

```js
import {
  CITY_LABEL_ID,
  OG_CITY_HEX,
  formatIdDate,
  formatPackageTitle,
} from './itinerary-share-meta.js';
```

- [ ] **Step 2: Tambah fungsi kartu**

Sisipkan sebelum `export async function regenerateOgForAgent(agent)`:

```js
const ITIN_ICONS = {
  calendar: 'M8 2v4M16 2v4M3.5 9.5h17M5 5h14a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 21H5a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 5 5Z',
  plane: 'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
  moon: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
};

/**
 * Kartu OG halaman share itinerary. Judul paket + bar segmen kota proporsional
 * di latar burgundy — bar itu terjemahan langsung blok "Ringkasan Perjalanan"
 * di halamannya, dan angkanya berasal dari helper yang sama, jadi kartu dan
 * halaman tak bisa berselisih.
 */
export async function generateItineraryOgPng({
  paketName,
  departDate,
  airline,
  dayCount,
  segments,
  agentName,
  agentPhotoBuffer,
}) {
  const W = 1200;
  const H = 630;
  const MARGIN = 56;
  const CONTENT_W = W - MARGIN * 2;

  const titleLines = wrapOgLines(formatPackageTitle(paketName) || 'Itinerary Umroh', 60, 748, 2)
    .map(escapeXml);
  const lastBaseline = 306;
  const firstBaseline = lastBaseline - 68 * (titleLines.length - 1);
  const eyebrowBaseline = firstBaseline - 66;

  const visibleSegments = Array.isArray(segments) ? segments.filter(s => s && s.nights > 0) : [];
  const totalNights = visibleSegments.reduce((n, s) => n + s.nights, 0);
  const days = Number(dayCount) > 0 ? Number(dayCount) : 0;

  const chipTexts = [
    { icon: 'calendar', text: formatIdDate(departDate) },
    { icon: 'plane', text: truncateOgText(formatPackageTitle(airline), 24) },
    {
      icon: 'moon',
      text: days && totalNights ? `${days} hari · ${totalNights} malam`
        : days ? `${days} hari` : '',
    },
  ].filter(c => c.text);

  const CHIP_PAD = 14;
  const CHIP_ICON = 16;
  const CHIP_GAP_ICON = 8;
  const CHIP_GAP = 10;
  const CHIP_TOP = 336;
  let chipX = MARGIN;
  const chipSvg = chipTexts.map(({ icon, text }) => {
    const w = CHIP_PAD * 2 + CHIP_ICON + CHIP_GAP_ICON + measureText(text, 16);
    const x = chipX;
    chipX += w + CHIP_GAP;
    return `
      <rect x="${x.toFixed(1)}" y="${CHIP_TOP}" width="${w.toFixed(1)}" height="37" rx="10" fill="#FFFFFF26"/>
      <path d="${ITIN_ICONS[icon]}" transform="translate(${(x + CHIP_PAD).toFixed(1)} ${CHIP_TOP + 10}) scale(0.667)" fill="none" stroke="#FFFFFFCC" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="${(x + CHIP_PAD + CHIP_ICON + CHIP_GAP_ICON).toFixed(1)}" y="${CHIP_TOP + 24}" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="600" fill="#FFFFFF">${escapeXml(text)}</text>`;
  }).join('');

  const STRIP_Y = 426;
  const STRIP_GAP = 8;
  let stripSvg = '';
  if (visibleSegments.length && totalNights > 0) {
    const avail = CONTENT_W - STRIP_GAP * (visibleSegments.length - 1);
    let segX = MARGIN;
    stripSvg = visibleSegments.map((s) => {
      const w = Math.max(24, Math.round((avail * s.nights) / totalNights));
      const color = OG_CITY_HEX[s.key] || OG_CITY_HEX.transit;
      const label = escapeXml(CITY_LABEL_ID[s.key] || s.key);
      const nameX = segX + 20;
      const nightsX = nameX + measureText(CITY_LABEL_ID[s.key] || s.key, 19) + 10;
      const block = `
        <rect x="${segX}" y="${STRIP_Y}" width="${w}" height="16" rx="8" fill="${color}"/>
        <circle cx="${segX + 5.5}" cy="${STRIP_Y + 40}" r="5.5" fill="${color}"/>
        <text x="${nameX}" y="${STRIP_Y + 46}" font-family="Inter, Arial, sans-serif" font-size="19" font-weight="700" fill="#FFFFFF">${label}</text>
        <text x="${nightsX.toFixed(1)}" y="${STRIP_Y + 46}" font-family="Inter, Arial, sans-serif" font-size="17" font-weight="500" fill="#FFFFFF99">${s.nights} malam</text>`;
      segX += w + STRIP_GAP;
      return block;
    }).join('');
  } else {
    // Fallback: computeNightSegments menyerah (>30% lokasi tak dikenal atau
    // hari <2). Kartu tetap berguna — cukup rapikan bandnya dengan garis.
    stripSvg = `
      <rect x="${MARGIN}" y="${STRIP_Y + 6}" width="${CONTENT_W}" height="2" fill="#FFFFFF26"/>
      ${days ? `<text x="${MARGIN}" y="${STRIP_Y + 50}" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="800" letter-spacing="2" fill="#F0DDA8">${days} HARI PERJALANAN</text>` : ''}`;
  }

  const safeAgent = escapeXml(truncateOgText(stripUnrenderableGlyphs(agentName) || 'Agent Alhijaz', 28));
  const safeInitials = escapeXml(ogInitials(agentName));

  const badgeText = 'ITINERARY';
  const badgeW = Math.round(measureText(badgeText, 14) + 3 * badgeText.length + 32);
  const badgeX = W - MARGIN - badgeW;

  let avatarBuffer = null;
  if (agentPhotoBuffer) {
    try {
      avatarBuffer = await sharp(agentPhotoBuffer)
        .resize(52, 52, { fit: 'cover' })
        .composite([{ input: Buffer.from('<svg width="52" height="52"><circle cx="26" cy="26" r="26" fill="white"/></svg>'), blend: 'dest-in' }])
        .png()
        .toBuffer();
    } catch (err) {
      console.warn('[og-generator] Failed to process itinerary agent photo:', err.message);
    }
  }

  const svg = Buffer.from(`
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="itinBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#4A0805"/>
          <stop offset="100%" stop-color="#8A0F0A"/>
        </linearGradient>
        <radialGradient id="itinHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#F0DDA8" stop-opacity="0.20"/>
          <stop offset="100%" stop-color="#F0DDA8" stop-opacity="0"/>
        </radialGradient>
      </defs>

      <rect width="${W}" height="${H}" fill="url(#itinBg)"/>
      <circle cx="1160" cy="50" r="260" fill="#D4AF37" opacity="0.07"/>
      <circle cx="70" cy="660" r="230" fill="#FB7185" opacity="0.07"/>
      <circle cx="984" cy="256" r="178" fill="url(#itinHalo)"/>

      <rect x="${badgeX}" y="48" width="${badgeW}" height="35" rx="9" fill="none" stroke="#FFFFFF66" stroke-width="1.5"/>
      <text x="${badgeX + badgeW / 2}" y="71" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="800" letter-spacing="3" fill="#FFFFFFCC" text-anchor="middle">${badgeText}</text>

      <text x="${MARGIN}" y="${eyebrowBaseline}" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="800" letter-spacing="3.4" fill="#D4AF37">RENCANA PERJALANAN HARI PER HARI</text>
      ${titleLines.map((line, i) => `<text x="${MARGIN}" y="${firstBaseline + i * 68}" font-family="Inter, Arial, sans-serif" font-size="60" font-weight="800" letter-spacing="-1.4" fill="#FFFFFF">${line}</text>`).join('')}
      ${chipSvg}
      ${stripSvg}

      <circle cx="84" cy="556" r="28" fill="#FFFFFF26" stroke="#D4AF37" stroke-width="2"/>
      ${avatarBuffer ? '' : `<text x="84" y="564" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="800" fill="#FFFFFF" text-anchor="middle">${safeInitials}</text>`}
      <text x="126" y="550" font-family="Inter, Arial, sans-serif" font-size="19" font-weight="700" fill="#FFFFFF">${safeAgent}</text>
      <text x="126" y="572" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700" letter-spacing="1.6" fill="#F0DDA8">KONSULTAN UMROH &amp; HAJI PLUS</text>
      <text x="${W - MARGIN}" y="562" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="700" fill="#FFFFFFB3" text-anchor="end">alhijaz.co</text>
    </svg>
  `);

  const composites = [];

  const logoPath = path.join(PROJECT_ROOT, 'src', 'new-logo', 'new-logo-alhijaz-white.png');
  if (fs.existsSync(logoPath)) {
    const logo = await sharp(logoPath).resize({ width: 190 }).png().toBuffer();
    composites.push({ input: logo, left: MARGIN, top: 46 });
  }

  // Emblem Ka'bah. sharp tidak punya properti opacity pada composite, jadi
  // alfanya diskalakan lewat dest-in dengan putih semi-transparan (0x85 ≈ 0.52).
  const emblemPath = path.join(PROJECT_ROOT, 'public', 'img-brosur', 'kabah.png');
  if (fs.existsSync(emblemPath)) {
    try {
      const emblem = await sharp(emblemPath)
        .resize({ width: 364 })
        .ensureAlpha()
        .composite([{ input: Buffer.from('<svg width="364" height="364"><rect width="364" height="364" fill="#ffffff85"/></svg>'), blend: 'dest-in' }])
        .png()
        .toBuffer();
      composites.push({ input: emblem, left: 812, top: 74 });
    } catch (err) {
      console.warn('[og-generator] Failed to process itinerary emblem:', err.message);
    }
  }

  if (avatarBuffer) composites.push({ input: avatarBuffer, left: 58, top: 530 });

  return sharp(svg).composite(composites).png({ quality: 92 }).toBuffer();
}
```

- [ ] **Step 3: Skrip asap — render lima varian ke scratchpad**

Buat `scripts/preview-itinerary-og.mjs`:

```js
// Pratinjau kartu OG itinerary tanpa server. Bukan bagian pipeline produksi.
// Jalankan: node scripts/preview-itinerary-og.mjs <folder-keluaran>
import fs from 'fs';
import path from 'path';
import { generateItineraryOgPng } from '../lib/og-generator.mjs';

const outDir = process.argv[2] || '.';
fs.mkdirSync(outDir, { recursive: true });

const base = {
  paketName: 'UMROH AKHIR RAMADHAN 1447',
  departDate: '2027-03-12',
  airline: 'SAUDIA',
  dayCount: 9,
  segments: [{ key: 'madinah', nights: 3 }, { key: 'mekkah', nights: 4 }],
  agentName: 'Bagas Pramudita',
};

const cases = {
  'judul-1-baris': base,
  'judul-2-baris': { ...base, paketName: 'UMROH PLUS TURKI ISTANBUL BURSA CAPPADOCIA 15 HARI BY TURKISH AIRLINES' },
  'lima-segmen': {
    ...base,
    dayCount: 16,
    segments: [
      { key: 'madinah', nights: 3 }, { key: 'mekkah', nights: 4 }, { key: 'dubai', nights: 2 },
      { key: 'turki', nights: 3 }, { key: 'mesir', nights: 2 },
    ],
  },
  'tanpa-segmen': { ...base, segments: null },
  'nama-beremoji': { ...base, agentName: 'Bagas 🌙 Pramudita', paketName: 'UMROH ✨ HEMAT' },
};

for (const [name, input] of Object.entries(cases)) {
  const png = await generateItineraryOgPng(input);
  const file = path.join(outDir, `itin-og-${name}.png`);
  fs.writeFileSync(file, png);
  console.log(`${file} — ${(png.length / 1024).toFixed(0)} KB`);
}
```

- [ ] **Step 4: Jalankan dan periksa mata**

```bash
node scripts/preview-itinerary-og.mjs /private/tmp/claude-501/-Users-bagas-alhijaz/44ab968b-a883-492c-ab7d-6bfb4880feb5/scratchpad
```

Expected: lima PNG tertulis, tiap berkas <500 KB, tidak ada crash pada kasus `nama-beremoji`.
Periksa mata: judul tidak menabrak emblem, segmen Turki terlihat jelas, label malam tidak bertumpuk.

- [ ] **Step 5: Commit**

```bash
node --check lib/og-generator.mjs
git add lib/og-generator.mjs scripts/preview-itinerary-og.mjs
git commit -m "feat(itinerary): kartu OG 1200x630 untuk halaman share itinerary"
```

---

### Task 3: Rute `GET /og/itinerary/:slug/:packageId.png`

**Files:**
- Modify: `server.js` — baris import 35; rute baru setelah rute `/og/teras/:code.png`

**Interfaces:**
- Consumes: `generateItineraryOgPng` (Task 2), `ogSegments` (Task 1), `resolveSlug`, `getItineraryContext`, `loadAgentPhotoBuffer`, `supabase` — semuanya sudah ada di `server.js`
- Produces: rute HTTP `GET /og/itinerary/:slug/:packageId.png` → `image/png`

- [ ] **Step 1: Perluas import**

`server.js:35` — tambah `generateItineraryOgPng` ke daftar impor dari `./lib/og-generator.mjs`, dan tambah baris impor baru:

```js
import { buildItineraryShareMeta, ogSegments } from './lib/itinerary-share-meta.js';
```

- [ ] **Step 2: Tambah rute**

Setelah blok rute `/og/teras/:code.png` berakhir:

```js
// Kartu OG halaman share itinerary. Dirender on-demand seperti kartu lain;
// bot menyimpannya sejam. Slug ikut di path supaya kartunya membawa identitas
// agent yang membagikan, bukan cuma paketnya.
app.get('/og/itinerary/:slug/:packageId.png', async (req, res) => {
  const slug = String(req.params.slug || '').toLowerCase();
  const packageId = String(req.params.packageId || '').toUpperCase();
  if (!/^[a-z0-9-]{1,64}$/.test(slug) || !/^[A-Z0-9-]{3,32}$/.test(packageId)) {
    return res.status(404).type('text/plain').send('not found');
  }
  try {
    const resolved = await resolveSlug(slug);
    if (!resolved || !resolved.agent) return res.status(404).type('text/plain').send('not found');
    const agent = resolved.agent;

    const { data: rows } = await supabase
      .from('umroh_schedules')
      .select('jadwal_nama, berangkat_tgl, maskapai')
      .eq('jadwal_id', packageId)
      .limit(1);
    const schedule = rows?.[0] || null;

    const itinerary = await getItineraryContext(packageId);
    const days = itinerary?.days || [];
    // Tanpa itinerary tersusun, halamannya sendiri menampilkan "belum
    // tersedia" — lebih baik tak ada gambar daripada gambar yang menjanjikan
    // isi yang tidak ada.
    if (!days.length) return res.status(404).type('text/plain').send('not found');

    const agentPhotoBuffer = await loadAgentPhotoBuffer(agent.photo, agent.slug);
    const png = await generateItineraryOgPng({
      paketName: schedule?.jadwal_nama || packageId,
      departDate: schedule?.berangkat_tgl || null,
      airline: schedule?.maskapai || null,
      dayCount: days.length,
      segments: ogSegments(days),
      agentName: agent.name,
      agentPhotoBuffer,
    });

    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600',
    }).send(png);
  } catch (err) {
    console.error('[og/itinerary] generation failed:', slug, packageId, err.message);
    res.status(500).type('text/plain').send('og generation failed');
  }
});
```

- [ ] **Step 3: Verifikasi sintaks**

```bash
node --check server.js
```

Expected: tanpa keluaran.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat(itinerary): rute /og/itinerary/:slug/:packageId.png"
```

---

### Task 4: Perluas rute SSR itinerary

**Files:**
- Modify: `server.js:21213-21266` (rute `app.get('/:slug/:packageId/itinerary', ...)`)

**Interfaces:**
- Consumes: `buildItineraryShareMeta`, `ogSegments` (Task 1); rute PNG (Task 3)
- Produces: HTML dengan `og:image`, `og:type`, `canonical`, `twitter:*`

- [ ] **Step 1: Ganti isi rute**

Ganti seluruh badan rute dari `let nama = packageId;` sampai `.send(html);`:

```js
    const canonicalSlug = String(agent.slug || slug).toLowerCase();
    let schedule = null;
    try {
      const { data } = await supabase
        .from('umroh_schedules')
        .select('jadwal_nama, berangkat_tgl, maskapai, itinerary_source_sha256')
        .eq('jadwal_id', packageId)
        .limit(1);
      schedule = data?.[0] || null;
    } catch { /* fallback: pakai packageId */ }

    let days = [];
    try {
      const itinerary = await getItineraryContext(packageId);
      days = itinerary?.days || [];
    } catch { /* itinerary belum tersusun — kartu OG dilewati */ }

    const { title, description } = buildItineraryShareMeta({
      paketName: schedule?.jadwal_nama || '',
      packageId,
      segments: ogSegments(days),
      dayCount: days.length,
      departDate: schedule?.berangkat_tgl || null,
      airline: schedule?.maskapai || null,
      agentName: agent.name,
    });

    const origin = `${req.protocol}://${req.get('host')}`;
    const pageUrl = `${origin}/${canonicalSlug}/${packageId}/itinerary`;
    // Bot menyimpan preview per-URL. Tanpa penanda versi, itinerary yang
    // di-resync akan tetap tampil dengan kartu lama berminggu-minggu.
    const sha = String(schedule?.itinerary_source_sha256 || '').slice(0, 8);
    const ogImage = days.length
      ? `${origin}/og/itinerary/${canonicalSlug}/${packageId}.png${sha ? `?v=${sha}` : ''}`
      : null;

    let html = getIndexHtml();
    html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtmlAttr(title)}</title>`);
    html = html.replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="description" content="${escapeHtmlAttr(description)}" />`
    );
    // og:title / og:description ADA di index.html jadi diganti; og:image dan
    // twitter:* TIDAK ada, jadi harus disisipkan — .replace() untuk tag yang
    // tak ada gagal diam-diam dan tag itu tak akan pernah muncul.
    html = html.replace(
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:title" content="${escapeHtmlAttr(title)}" />`
    );
    html = html.replace(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:description" content="${escapeHtmlAttr(description)}" />`
    );
    html = html.replace(
      /<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/i,
      '<meta property="og:type" content="article" />'
    );

    const extraTags = `
    <link rel="canonical" href="${escapeHtmlAttr(pageUrl)}" />
    <meta property="og:url" content="${escapeHtmlAttr(pageUrl)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtmlAttr(title)}" />
    <meta name="twitter:description" content="${escapeHtmlAttr(description)}" />${ogImage ? `
    <meta property="og:image" content="${escapeHtmlAttr(ogImage)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:type" content="image/png" />
    <meta name="twitter:image" content="${escapeHtmlAttr(ogImage)}" />` : ''}
    `;
    html = html.replace('</head>', `${extraTags}</head>`);

    res.set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    }).send(html);
```

Catatan: `og:url` pindah ke blok sisipan, jadi baris `.replace(/<meta\s+property="og:site_name"/i, ...)` yang lama dihapus.

- [ ] **Step 2: Verifikasi sintaks**

```bash
node --check server.js
```

Expected: tanpa keluaran.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat(itinerary): og:image, canonical & twitter card di rute share itinerary"
```

---

### Task 5: Verifikasi menyeluruh

**Files:** tidak ada perubahan kode kecuali perbaikan yang ditemukan

- [ ] **Step 1: Seluruh test unit**

```bash
node --test tests/itinerary-share-meta.test.js tests/brochure-schedule.test.js
```

Expected: PASS.

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: sukses.

- [ ] **Step 3: Rute hidup — jalankan server dan uji dengan curl**

```bash
node server.js
```

Di terminal lain, ganti `<slug>`/`<id>` dengan data nyata:

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type} %{size_download}\n" "http://localhost:3000/og/itinerary/<slug>/<id>.png"
```

Expected: `200 image/png` dengan ukuran >50000.

```bash
curl -s "http://localhost:3000/<slug>/<id>/itinerary" | grep -oE '<(meta|link)[^>]*(og:|twitter:|canonical)[^>]*>'
```

Expected: `og:image` absolut dengan `?v=`, `og:image:width` 1200, `twitter:card` `summary_large_image`, `canonical` absolut.

- [ ] **Step 4: Commit perbaikan kalau ada, lalu push**

```bash
git branch --show-current
git push origin main
```

---

## Self-Review

**Cakupan spec:** D1 → Task 2 (baris agent kecil). D2 → tidak ada harga di mana pun. D3 → Task 2. D4 → `OG_CITY_HEX` Task 1, dipakai Task 2. D5 → emblem Task 2. D6 → `formatPackageTitle` Task 1. D7 → `buildItineraryShareMeta` Task 1. Fallback berjenjang → Task 2 (strip), Task 3 (404), Task 4 (`og:image` null). Cache & `?v=` → Task 4. Semua enam titik rawan tercakup.

**Penyimpangan dari spec (disengaja):** spec menamai berkas baru `lib/format-package-name.js` dan menaruh perakitan copy di `server.js`. Digabung jadi satu modul `lib/itinerary-share-meta.js` supaya aturan pembuangan klausa 160 karakter bisa diuji unit, dan supaya label kota + palet gelap punya satu tempat sinkron, bukan dua.

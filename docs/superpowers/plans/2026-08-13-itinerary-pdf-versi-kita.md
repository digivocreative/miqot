# Itinerary PDF "versi kita" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menerbitkan tampilan web itinerary sebagai PDF 400×800 px yang bisa dikirim agent lewat WhatsApp ke calon jamaah.

**Architecture:** Tiga berkas baru dengan tanggung jawab terpisah — logika murni (`lib/itinerary-pdf.js`), dokumen render (`src/components/ItineraryDocument.tsx`), dan perakit blob (`src/utils/itineraryPdfBlob.ts`). Semua parsing, klasifikasi aktivitas, pemilihan foto, dan koreksi tanggal memakai ulang modul yang sudah ada; tidak ada logika parsing baru. Pemicunya satu tombol di footer `ItineraryModal` yang mengikuti tab aktif.

**Tech Stack:** `@react-pdf/renderer` v4, `qrcode`, Inter self-hosted di `/fonts/`, `node:test` untuk unit test.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-13-itinerary-pdf-versi-kita-design.md`
- Halaman **400 × 800 px** potret. Kartu `mx-3` → lebar isi 376 px.
- Palet dikunci: kanvas `#F6F1EA`, kartu putih border `#EAE2D8`, panel momen `#FBF6E6`, burgundy `#8A0F0A`, gradien hero `#4A0805 → #8A0F0A`, emas `#D4AF37`, ink `#1E1512` / `#453B35` / `#63564D`, garis rail `#EFE7DC`, titik rail `#C9B18A`.
- Font: **hanya Inter Regular + Bold** dari `/fonts/Inter-Regular.ttf` & `/fonts/Inter-Bold.ttf`. Wajib `Font.registerHyphenationCallback((w) => [w])`.
- **Emoji tidak ter-render** di react-pdf. `★` aman. Bendera memakai `<Image>` PNG dari `public/flags/`.
- Foto: ambil derivatif `.webp` → kanvas → `image/jpeg` kualitas **0.82**, lebar maks **800 px**. Foto gagal muat dilewati diam-diam.
- Fail-closed di mana pun angka tak bisa dipercaya: lebih baik blok hilang daripada salah.
- Nama berkas unduhan: `rencana-perjalanan-<jadwalId>.pdf`.
- Tes dijalankan dengan `node --test <file>` (konvensi repo: `node:test` + `node:assert/strict`).

## File Structure

| Berkas | Tanggung jawab |
|---|---|
| `lib/itinerary-pdf.js` (baru) | Logika murni tanpa dependensi: normalisasi jam, bentuk leg penerbangan, baris harga, gerbang fail-closed. Bisa diuji di node. |
| `tests/itinerary-pdf.test.js` (baru) | Unit test untuk keempatnya. |
| `src/components/ItineraryDocument.tsx` (baru) | Dokumen `@react-pdf/renderer`. Render saja — tidak mengambil data, tidak memutuskan apa pun. |
| `src/utils/itineraryPdfBlob.ts` (baru) | Perakit: pra-muat foto & QR ke dataURL, lalu `pdf(<ItineraryDocument/>).toBlob()`. |
| `src/components/ItineraryModal.tsx` (ubah) | Tombol footer mengikuti tab aktif. |

---

### Task 1: Logika murni `lib/itinerary-pdf.js`

**Files:**
- Create: `lib/itinerary-pdf.js`
- Test: `tests/itinerary-pdf.test.js`

**Interfaces:**
- Consumes: `itineraryDayDates` dari `lib/itinerary-view.js`
- Produces:
  - `normalizeJam(raw: string): string`
  - `flightLegView(paket, arrivals): Array<{kick, tglISO, dari, jam, ke, jamTiba, kode}>` — `jamTiba` `null` bila sama dengan `jam`
  - `priceRows(paket): Array<{tier: string, mulaiDari: number, kamar: Array<{label: string, harga: number}>}>`
  - `canRenderItineraryPdf(content, paket): boolean`

- [ ] **Step 1: Write the failing test**

Buat `tests/itinerary-pdf.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeJam,
  flightLegView,
  priceRows,
  canRenderItineraryPdf,
} from '../lib/itinerary-pdf.js';

// ── normalizeJam (temuan T-3) ──
test('normalizeJam menyeragamkan pemisah jam jadwal ke titik dua', () => {
  assert.equal(normalizeJam('15.50'), '15:50');
  assert.equal(normalizeJam('21:15'), '21:15');
  assert.equal(normalizeJam('9.5'), '09:50');
  assert.equal(normalizeJam('16.00'), '16:00');
});

test('normalizeJam membiarkan yang tak berpola apa adanya', () => {
  assert.equal(normalizeJam(''), '');
  assert.equal(normalizeJam('-'), '-');
  assert.equal(normalizeJam(null), '');
  assert.equal(normalizeJam('sore'), 'sore');
});

// ── flightLegView (temuan T-2) ──
const PAKET = {
  keberangkatan: { tgl: '2026-09-05', jam: '15.50', rute: 'CGK - MED', kodePenerbangan: 'SV 821' },
  kepulangan: { tgl: '2026-09-13', jam: '16.00', rute: 'JED - CGK', kodePenerbangan: 'SV 818' },
};

test('jam tiba disembunyikan bila sama dengan jam berangkat', () => {
  const [pergi, pulang] = flightLegView(PAKET, { berangkat: '21:15', pulang: '16:00' });
  assert.equal(pergi.jam, '15:50');
  assert.equal(pergi.jamTiba, '21:15');
  assert.equal(pulang.jam, '16:00');
  assert.equal(pulang.jamTiba, null);
});

test('jam tiba yang beda tetap tampil, dan dinormalisasi', () => {
  const [, pulang] = flightLegView(PAKET, { berangkat: null, pulang: '06.40' });
  assert.equal(pulang.jamTiba, '06:40');
});

test('rute dipecah jadi bandara asal & tujuan, transit dibuang', () => {
  const [pergi] = flightLegView(
    { keberangkatan: { tgl: '2026-09-05', jam: '10:25', rute: 'CGK-DXB / DXB-JED', kodePenerbangan: 'EK 357' }, kepulangan: {} },
    {},
  );
  assert.equal(pergi.dari, 'CGK');
  assert.equal(pergi.ke, 'JED');
});

// ── priceRows (temuan T-4) ──
test('satu tier menghasilkan satu baris', () => {
  const rows = priceRows({ harga: { HEMAT: { Quard: '31900000', Triple: '32900000', Double: '34900000', Infant: '13900000' } } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tier, 'HEMAT');
  assert.equal(rows[0].mulaiDari, 31900000);
  assert.deepEqual(rows[0].kamar.map(k => k.label), ['Bertiga', 'Berdua']);
});

test('banyak tier terurut dari termurah', () => {
  const rows = priceRows({
    harga: {
      RAHMAH: { Quard: '43500000' },
      HEMAT: { Quard: '33900000' },
      UHUD: { Quard: '37900000' },
    },
  });
  assert.deepEqual(rows.map(r => r.tier), ['HEMAT', 'UHUD', 'RAHMAH']);
});

test('tier tanpa harga terjual dibuang', () => {
  const rows = priceRows({ harga: { HEMAT: { Quard: '31900000' }, PRIVATE: { Quard: 'N/A', Double: '0' } } });
  assert.deepEqual(rows.map(r => r.tier), ['HEMAT']);
});

test('paket tanpa harga menghasilkan daftar kosong', () => {
  assert.deepEqual(priceRows({}), []);
  assert.deepEqual(priceRows(null), []);
});

// ── canRenderItineraryPdf ──
const HARI = (n) => ({ dayNumber: String(n), title: 'Hari ' + n, location: 'Madinah', activities: [] });

test('itinerary sehat lolos gerbang', () => {
  const content = { days: [HARI(1), HARI(2), HARI(3)] };
  const paket = { keberangkatan: { tgl: '2026-09-05' }, kepulangan: { tgl: '2026-09-07' } };
  assert.equal(canRenderItineraryPdf(content, paket), true);
});

test('days kosong ditolak', () => {
  const paket = { keberangkatan: { tgl: '2026-09-05' }, kepulangan: { tgl: '2026-09-07' } };
  assert.equal(canRenderItineraryPdf({ days: [] }, paket), false);
  assert.equal(canRenderItineraryPdf(null, paket), false);
});

test('penomoran hari yang tak sepakat dengan jadwal ditolak', () => {
  const content = { days: [HARI(1), HARI(2), HARI(3)] };
  const paket = { keberangkatan: { tgl: '2026-09-05' }, kepulangan: { tgl: '2026-09-20' } };
  assert.equal(canRenderItineraryPdf(content, paket), false);
});

test('tanpa tanggal berangkat ditolak', () => {
  assert.equal(canRenderItineraryPdf({ days: [HARI(1)] }, {}), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/itinerary-pdf.test.js`
Expected: FAIL — `Cannot find module '../lib/itinerary-pdf.js'`

- [ ] **Step 3: Write minimal implementation**

Buat `lib/itinerary-pdf.js`:

```js
// Logika murni untuk PDF "Rencana Perjalanan" — tanpa dependensi selain
// itinerary-view.js, supaya bisa diuji di node tanpa DOM.
// Spec: docs/superpowers/specs/2026-08-13-itinerary-pdf-versi-kita-design.md
import { itineraryDayDates } from './itinerary-view.js';

/**
 * Jam dari tabel jadwal memakai titik ("15.50") sedangkan jam dari itinerary
 * memakai titik dua ("21:15") — keduanya bersebelahan di satu baris kartu
 * penerbangan (temuan T-3). Hanya pemisahnya yang diseragamkan; string yang
 * tak berpola jam dibiarkan apa adanya supaya tidak pernah mengarang angka.
 */
export function normalizeJam(raw) {
  const s = String(raw ?? '').trim();
  const m = s.match(/^(\d{1,2})[.:](\d{1,2})$/);
  if (!m) return s;
  return `${m[1].padStart(2, '0')}:${m[2].padEnd(2, '0')}`;
}

function stops(rute) {
  return String(rute || '')
    .split(/[/,]|\s-\s|–/)
    .flatMap((s) => s.split('-'))
    .map((s) => s.trim())
    .filter((s, i, a) => s && s !== a[i - 1]);
}

/**
 * Dua leg siap render. `jamTiba` sengaja null bila sama dengan `jam`: untuk
 * banyak jadwal, `pulang_jam` justru berisi jam TIBA di Jakarta sehingga kartu
 * menampilkan "JED 16:00 → CGK 16:00" (temuan T-2). Menyembunyikan yang
 * duplikat lebih jujur daripada mencetak dua angka yang tak mungkin benar.
 */
export function flightLegView(paket, arrivals) {
  const legs = [
    ['Berangkat', paket?.keberangkatan, arrivals?.berangkat],
    ['Pulang', paket?.kepulangan, arrivals?.pulang],
  ];
  return legs.map(([kick, info, tiba]) => {
    const uniq = stops(info?.rute);
    const jam = normalizeJam(info?.jam);
    const jamTiba = normalizeJam(tiba);
    return {
      kick,
      tglISO: info?.tgl || '',
      dari: uniq[0] || '—',
      ke: uniq[uniq.length - 1] || '—',
      jam,
      jamTiba: jamTiba && jamTiba !== jam ? jamTiba : null,
      kode: info?.kodePenerbangan || '',
    };
  });
}

// Infant sengaja di luar: itu harga per orang, bukan kamar (sama seperti
// src/lib/packageTiers.js). Urutan = urutan tampil di blok harga.
const ROOM_TYPES = [
  ['Quard', 'Berempat'],
  ['Triple', 'Bertiga'],
  ['Double', 'Berdua'],
  ['Single', 'Sendiri'],
];

function toPrice(value) {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Satu baris per tier yang benar-benar dijual, termurah dulu. Paket bisa hanya
 * punya SATU tier (temuan T-4), jadi pemanggil tak boleh mengasumsikan tiga.
 * `kamar` berisi tipe kamar selain yang jadi `mulaiDari`.
 */
export function priceRows(paket) {
  const harga = paket && typeof paket.harga === 'object' && paket.harga ? paket.harga : {};
  const rows = [];
  for (const tier of Object.keys(harga)) {
    const pricing = harga[tier];
    if (!pricing || typeof pricing !== 'object') continue;
    const kamar = ROOM_TYPES
      .map(([key, label]) => ({ label, harga: toPrice(pricing[key]) }))
      .filter((k) => k.harga > 0);
    if (!kamar.length) continue;
    const mulaiDari = Math.min(...kamar.map((k) => k.harga));
    rows.push({
      tier,
      mulaiDari,
      kamar: kamar.filter((k) => k.harga !== mulaiDari),
    });
  }
  return rows.sort((a, b) => a.mulaiDari - b.mulaiDari);
}

/**
 * Gerbang fail-closed. Tombol unduh tidak boleh muncul bila tanggal per hari
 * tak bisa ditambatkan ke jadwal — PDF yang tanggalnya salah lebih berbahaya
 * daripada tak ada PDF, karena ia beredar di WA tanpa bisa ditarik kembali.
 */
export function canRenderItineraryPdf(content, paket) {
  const days = content && Array.isArray(content.days) ? content.days : [];
  if (!days.length) return false;
  const iso = itineraryDayDates(days, paket?.keberangkatan?.tgl, paket?.kepulangan?.tgl);
  return iso.some((d) => d !== null);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/itinerary-pdf.test.js`
Expected: PASS — 12 tes hijau.

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary-pdf.js tests/itinerary-pdf.test.js
git commit -m "feat(itinerary): logika murni untuk PDF rencana perjalanan"
```

---

### Task 2: Dokumen `ItineraryDocument.tsx`

**Files:**
- Create: `src/components/ItineraryDocument.tsx`

**Interfaces:**
- Consumes: `normalizeJam`, `flightLegView`, `priceRows` (Task 1); `classifyActivity`, `activityIconName`, `splitImportantPlaces`, `itineraryDayDates`, `rewriteHomeArrivalTerminal`, `retitleDayWithDate`, `splitDayTitleDate`, `isRedundantDayLocation`, `computeNightSegments`, `cityKeyForLocation` dari `lib/itinerary-view.js`
- Produces: `export function ItineraryDocument(props: ItineraryDocProps)` dengan
  ```ts
  interface ItineraryDocProps {
    content: { days: ItineraryDayData[] };
    paket: UmrohPackage;
    agent?: AgentData | null;
    photosByDay: Array<Array<{ dataUrl: string; label: string } | null>>;
    flagDataUrl?: string;
    logoDataUrl?: string;
    qrDataUrl?: string;
    shareUrl?: string;
  }
  ```

Dokumen ini **render saja**: tidak fetch, tidak memilih foto, tidak memutuskan boleh-tidaknya terbit. Semua aset masuk sebagai dataURL dari Task 3.

- [ ] **Step 1: Buat kerangka dokumen + gaya**

Buat `src/components/ItineraryDocument.tsx`. Bagian pertama — font, palet, dan StyleSheet:

```tsx
import { Document, Page, View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer';
import type { UmrohPackage } from '@/types';
import type { AgentData } from '@/data/agents';
import {
  classifyActivity,
  splitImportantPlaces,
  itineraryDayDates,
  rewriteHomeArrivalTerminal,
  retitleDayWithDate,
  splitDayTitleDate,
  isRedundantDayLocation,
  computeNightSegments,
} from '../../lib/itinerary-view.js';
import { flightLegView, priceRows } from '../../lib/itinerary-pdf.js';

const fontOrigin = typeof window !== 'undefined' ? window.location.origin : '';
Font.register({
  family: 'Inter',
  fonts: [
    { src: `${fontOrigin}/fonts/Inter-Regular.ttf`, fontWeight: 'normal' },
    { src: `${fontOrigin}/fonts/Inter-Bold.ttf`, fontWeight: 'bold' },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

// Palet dikunci spec — nilainya sama persis dengan tampilan web itinerary
// supaya PDF dan halaman yang di-QR terasa satu dokumen.
const C = {
  canvas: '#F6F1EA',
  paper: '#FFFFFF',
  border: '#EAE2D8',
  divider: '#F1EAE1',
  ink: '#1E1512',
  ink2: '#453B35',
  ink3: '#63564D',
  burgundy: '#8A0F0A',
  burgundyDark: '#4A0805',
  gold: '#D4AF37',
  gold50: '#FBF6E6',
  gold700: '#6B550C',
  rail: '#EFE7DC',
  dot: '#C9B18A',
};

const CITY_HEX: Record<string, string> = {
  mekkah: '#2A5C9A', madinah: '#1F5F4B', dubai: '#8A6D12',
  turki: '#8A0F0A', mesir: '#6B3FA0', transit: '#556072', home: '#3D4451',
};

const BADGE_TEXT: Record<string, string> = {
  kumpul: 'TITIK KUMPUL', takeoff: 'TAKE OFF', landing: 'LANDING', transit: 'TRANSIT',
  bus: 'PERJALANAN BUS', kereta: 'KERETA CEPAT', tiba: 'TIBA', perjalanan: 'PERJALANAN',
};

const s = StyleSheet.create({
  page: { fontFamily: 'Inter', backgroundColor: C.canvas, paddingBottom: 34, paddingTop: 0 },
  hero: { backgroundColor: C.burgundyDark, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo: { width: 128, height: 22, objectFit: 'contain' },
  badge: { borderWidth: 1, borderColor: '#FFFFFF4D', borderRadius: 4, paddingVertical: 4, paddingHorizontal: 8 },
  badgeText: { fontSize: 9, fontWeight: 'bold', letterSpacing: 1.3, color: '#FFFFFFCC' },
  heroTitle: { marginTop: 12, fontSize: 17, fontWeight: 'bold', lineHeight: 1.5, color: '#FFFFFF' },
  pillRow: { marginTop: 12, flexDirection: 'row', gap: 6 },
  pill: { backgroundColor: '#FFFFFF26', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 8 },
  pillText: { fontSize: 11, fontWeight: 'bold', color: '#FFFFFF' },

  runHead: { backgroundColor: C.burgundyDark, paddingHorizontal: 18, paddingVertical: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  runLogo: { width: 104, height: 18, objectFit: 'contain' },

  cardWrap: { marginHorizontal: 12, marginTop: 10 },
  card: { backgroundColor: C.paper, borderRadius: 16, borderWidth: 1, borderColor: C.border },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.divider },
  dayChip: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.burgundy, alignItems: 'center', justifyContent: 'center' },
  dayChipText: { fontSize: 14, fontWeight: 'bold', color: '#FFFFFF' },
  dayTitle: { fontSize: 14, fontWeight: 'bold', color: C.ink },
  daySub: { fontSize: 11.5, color: C.ink3, marginTop: 1 },
  flag: { width: 52, height: 35, opacity: 0.3, objectFit: 'cover', borderRadius: 4 },

  timeline: { paddingHorizontal: 14, paddingVertical: 12, position: 'relative' },
  railLine: { position: 'absolute', left: 61.5, top: 16, bottom: 16, width: 1, backgroundColor: C.rail },
  row: { flexDirection: 'row', marginBottom: 14 },
  jam: { width: 44, fontSize: 12.5, fontWeight: 'bold', color: C.burgundy },
  dotCol: { width: 18, alignItems: 'center', paddingTop: 5 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.paper, borderWidth: 2, borderColor: C.dot },
  rowBody: { flex: 1 },
  actText: { fontSize: 13.5, lineHeight: 1.5, color: C.ink },

  moment: { backgroundColor: C.gold50, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 },
  momentTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  momentJam: { fontSize: 12.5, fontWeight: 'bold', color: C.burgundy },
  momentBadge: { fontSize: 9.5, fontWeight: 'bold', letterSpacing: 0.8, color: C.gold700 },

  photo: { marginTop: 8, width: '100%', height: 159, borderRadius: 12, objectFit: 'cover' },
  photoCap: { marginTop: 4, fontSize: 9, color: C.ink3 },

  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.divider },
  sectionTitle: { fontSize: 13.5, fontWeight: 'bold', color: C.ink },
  sectionBadge: { backgroundColor: '#FAF7F5', borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8 },
  sectionBadgeText: { fontSize: 10, fontWeight: 'bold', color: C.ink2 },

  legRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  airport: { fontSize: 17, fontWeight: 'bold', color: C.ink },
  legJam: { fontSize: 11.5, fontWeight: 'bold', color: C.burgundy, marginTop: 4 },
  legMid: { flex: 1, alignItems: 'center' },
  legKode: { fontSize: 10.5, fontWeight: 'bold', color: C.ink2 },
  legLine: { height: 1, width: '100%', backgroundColor: C.border, marginTop: 5 },
  kicker: { fontSize: 10, fontWeight: 'bold', letterSpacing: 0.7, color: C.ink3 },
  tanggal: { fontSize: 11.5, fontWeight: 'bold', color: C.ink2 },

  agentCard: { marginHorizontal: 12, marginTop: 10, backgroundColor: C.ink, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  agentName: { fontSize: 13.5, fontWeight: 'bold', color: '#FFFFFF' },
  agentContact: { fontSize: 10.5, color: C.gold, marginTop: 2 },
  agentAjak: { fontSize: 9.5, color: '#FFFFFF99', marginTop: 2 },
  qr: { width: 58, height: 58, backgroundColor: '#FFFFFF', borderRadius: 4 },

  note: { marginTop: 13, paddingHorizontal: 24, fontSize: 10.5, color: C.ink3, textAlign: 'center' },
  foot: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12, backgroundColor: C.canvas, borderTopWidth: 1, borderTopColor: '#E9E1DD' },
  footText: { fontSize: 7, color: C.ink3 },
});
```

- [ ] **Step 2: Tambahkan komponen teks tebal & baris aktivitas**

Lanjutkan berkas yang sama:

```tsx
// Nama tempat penting ditebalkan di tengah kalimat — react-pdf mendukungnya
// lewat <Text> bersarang (Pencil tidak, itu batasan alat mockup saja).
function ActivityText({ text, style }: { text: string; style?: object }) {
  const parts = splitImportantPlaces(text) as Array<{ text: string; bold: boolean }>;
  return (
    <Text style={style}>
      {parts.map((p, i) =>
        p.bold ? <Text key={i} style={{ fontWeight: 'bold' }}>{p.text}</Text> : <Text key={i}>{p.text}</Text>,
      )}
    </Text>
  );
}

const ID_FULL = (iso: string) =>
  iso
    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
      })
    : '';

const fmtRp = (v: number) => `Rp ${v.toLocaleString('id-ID')}`;
```

- [ ] **Step 3: Tambahkan kartu hari**

```tsx
interface Foto { dataUrl: string; label: string }

function KartuHari({
  day, index, dateISO, photos, flagDataUrl,
}: {
  day: { dayNumber: string; title: string; location?: string | null; activities: Array<{ time: string; text: string } | string> };
  index: number;
  dateISO: string | null;
  photos: Array<Foto | null>;
  flagDataUrl?: string;
}) {
  const dayNum = day.dayNumber?.match(/\d[\d\-–]*/)?.[0] || String(index + 1);
  const { title: retitled } = retitleDayWithDate(day.title, dateISO) as { title: string };
  const { rest, dateText } = splitDayTitleDate(retitled) as { rest: string; dateText: string | null };
  const title = rest || day.location || dateText || day.title;
  const dateLabel = dateText && title !== dateText ? dateText : dateISO ? ID_FULL(dateISO) : null;
  const showLocation = Boolean(day.location) && !isRedundantDayLocation(title, day.location);
  const subtitle = [showLocation ? day.location : null, dateLabel].filter(Boolean).join('  ·  ');

  let lastShownTime = '';
  return (
    <View style={s.cardWrap}>
      <View style={s.card}>
        <View style={s.cardHead}>
          <View style={s.dayChip}><Text style={s.dayChipText}>{dayNum}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.dayTitle}>{title}</Text>
            {subtitle ? <Text style={s.daySub}>{subtitle}</Text> : null}
          </View>
          {flagDataUrl ? <Image src={flagDataUrl} style={s.flag} /> : null}
        </View>
        <View style={s.timeline}>
          <View style={s.railLine} />
          {day.activities.map((raw, i) => {
            const act = typeof raw === 'string' ? { time: '-', text: raw } : raw;
            const kind = classifyActivity(act.text, { dayIndex: index, activityIndex: i }) as string;
            const hasTime = Boolean(act.time && act.time !== '-');
            const showTime = hasTime && act.time !== lastShownTime;
            if (showTime) lastShownTime = act.time;
            const foto = photos?.[i] || null;

            if (kind !== 'regular') {
              return (
                <View key={i} style={s.moment} wrap={false}>
                  <View style={s.momentTop}>
                    {showTime ? <Text style={s.momentJam}>{act.time}</Text> : null}
                    <Text style={s.momentBadge}>{BADGE_TEXT[kind]}</Text>
                  </View>
                  <ActivityText text={act.text} style={s.actText} />
                  {foto ? <Image src={foto.dataUrl} style={s.photo} /> : null}
                </View>
              );
            }
            return (
              <View key={i} style={s.row}>
                <Text style={s.jam}>{showTime ? act.time : ''}</Text>
                <View style={s.dotCol}><View style={s.dot} /></View>
                <View style={s.rowBody}>
                  <ActivityText text={act.text} style={s.actText} />
                  {foto ? (
                    <View wrap={false}>
                      <Image src={foto.dataUrl} style={s.photo} />
                      <Text style={s.photoCap}>{foto.label}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Tambahkan kartu penutup (penerbangan, hotel, harga, agent)**

```tsx
function KartuPenerbangan({ paket, arrivals }: { paket: UmrohPackage; arrivals: { berangkat: string | null; pulang: string | null } }) {
  const legs = flightLegView(paket, arrivals) as Array<{ kick: string; tglISO: string; dari: string; ke: string; jam: string; jamTiba: string | null; kode: string }>;
  if (!legs.some((l) => l.dari !== '—')) return null;
  return (
    <View style={s.cardWrap} wrap={false}>
      <View style={s.card}>
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>Penerbangan</Text>
          {paket.maskapai ? (
            <View style={s.sectionBadge}><Text style={s.sectionBadgeText}>{paket.maskapai}</Text></View>
          ) : null}
        </View>
        <View style={{ paddingHorizontal: 14, paddingVertical: 14, gap: 14 }}>
          {legs.map((l) => (
            <View key={l.kick}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={s.kicker}>{l.kick.toUpperCase()}</Text>
                <Text style={s.tanggal}>{ID_FULL(l.tglISO)}</Text>
              </View>
              <View style={s.legRow}>
                <View style={{ width: 56 }}>
                  <Text style={s.airport}>{l.dari}</Text>
                  <Text style={s.legJam}>{l.jam}</Text>
                </View>
                <View style={s.legMid}>
                  <Text style={s.legKode}>{l.kode}</Text>
                  <View style={s.legLine} />
                </View>
                <View style={{ width: 56, alignItems: 'flex-end' }}>
                  <Text style={s.airport}>{l.ke}</Text>
                  {l.jamTiba ? <Text style={s.legJam}>{l.jamTiba}</Text> : null}
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function KartuHotel({ paket }: { paket: UmrohPackage }) {
  const tiers = Object.keys(paket.hotel || {});
  const tier = tiers[0];
  const info = (tier ? paket.hotel[tier] : {}) as Record<string, string | undefined>;
  const rows = Object.entries(info)
    .filter(([k, v]) => k.endsWith('_hotel') && Boolean(v))
    .map(([k, v]) => {
      const city = k.replace(/_hotel$/, '');
      const bintang = parseInt(String(info[`${city}_bintang`] ?? ''), 10);
      return { city, nama: String(v), bintang: Number.isFinite(bintang) ? Math.min(bintang, 5) : 0 };
    });
  if (!rows.length) return null;
  return (
    <View style={s.cardWrap} wrap={false}>
      <View style={s.card}>
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>Hotel</Text>
          {tier ? <View style={s.sectionBadge}><Text style={s.sectionBadgeText}>PAKET {tier.toUpperCase()}</Text></View> : null}
        </View>
        <View style={{ paddingHorizontal: 14 }}>
          {rows.map((r, i) => (
            <View
              key={r.city}
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: C.divider }}
            >
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: CITY_HEX[r.city] || CITY_HEX.transit }} />
                  <Text style={{ fontSize: 10, fontWeight: 'bold', letterSpacing: 0.8, color: C.ink3 }}>{r.city.toUpperCase()}</Text>
                </View>
                <Text style={{ fontSize: 13.5, fontWeight: 'bold', color: C.ink, marginTop: 2 }}>{r.nama}</Text>
              </View>
              {r.bintang > 0 ? (
                <Text style={{ fontSize: 12, letterSpacing: 1.5, color: C.gold }}>{'★'.repeat(r.bintang)}</Text>
              ) : null}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function KartuHarga({ paket }: { paket: UmrohPackage }) {
  const rows = priceRows(paket) as Array<{ tier: string; mulaiDari: number; kamar: Array<{ label: string; harga: number }> }>;
  if (!rows.length) return null;
  return (
    <View style={s.cardWrap} wrap={false}>
      <View style={s.card}>
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>Harga</Text>
          <View style={s.sectionBadge}><Text style={s.sectionBadgeText}>MULAI DARI</Text></View>
        </View>
        <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 13, gap: 9 }}>
          {rows.map((r) => (
            <View key={r.tier}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12.5, fontWeight: 'bold', color: C.ink2 }}>{r.tier}</Text>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: C.burgundy }}>{fmtRp(r.mulaiDari)}</Text>
              </View>
              {r.kamar.length ? (
                <Text style={{ fontSize: 11, color: C.ink3, marginTop: 3 }}>
                  {r.kamar.map((k) => `${k.label} ${fmtRp(k.harga)}`).join('  ·  ')}
                </Text>
              ) : null}
            </View>
          ))}
          <Text style={{ fontSize: 10, lineHeight: 1.45, color: C.ink3 }}>
            Harga dapat berubah sewaktu-waktu dan belum termasuk perlengkapan. Penawaran resmi diterbitkan terpisah oleh agent Anda.
          </Text>
        </View>
      </View>
    </View>
  );
}
```

- [ ] **Step 5: Rakit `ItineraryDocument`**

```tsx
export interface ItineraryDocProps {
  content: { days: Array<{ dayNumber: string; title: string; location?: string | null; activities: Array<{ time: string; text: string } | string> }> };
  paket: UmrohPackage;
  agent?: AgentData | null;
  photosByDay: Array<Array<Foto | null>>;
  flagDataUrl?: string;
  logoDataUrl?: string;
  qrDataUrl?: string;
  shareUrl?: string;
}

export function ItineraryDocument({
  content, paket, agent, photosByDay, flagDataUrl, logoDataUrl, qrDataUrl,
}: ItineraryDocProps) {
  const days = rewriteHomeArrivalTerminal(content.days) as ItineraryDocProps['content']['days'];
  const dayISO = itineraryDayDates(days, paket?.keberangkatan?.tgl, paket?.kepulangan?.tgl) as Array<string | null>;

  // Jam tiba diambil dari baris kedatangan itinerary, sama seperti WebItineraryView.
  const landings: Array<{ time: string; dayIndex: number }> = [];
  days.forEach((d, di) =>
    d.activities.forEach((raw, ai) => {
      const act = typeof raw === 'string' ? { time: '-', text: raw } : raw;
      if (!act.time || act.time === '-') return;
      const kind = classifyActivity(act.text, { dayIndex: di, activityIndex: ai });
      if (kind === 'landing' || kind === 'tiba') landings.push({ time: act.time, dayIndex: di });
    }),
  );
  const half = days.length / 2;
  const arrivals = {
    berangkat: landings.find((l) => l.dayIndex < half)?.time ?? null,
    pulang: [...landings].reverse().find((l) => l.dayIndex >= half)?.time ?? null,
  };

  const segments = computeNightSegments(days) as Array<{ key: string; nights: number }> | null;
  const totalNights = segments ? segments.filter((x) => x.key !== 'home').reduce((n, x) => n + x.nights, 0) : 0;

  const berangkatLabel = paket?.keberangkatan?.tgl
    ? new Date(`${paket.keberangkatan.tgl}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : '';

  return (
    <Document title={`Rencana Perjalanan — ${paket?.nama || ''}`}>
      <Page size={[400, 800]} style={s.page}>
        <View style={s.hero}>
          <View style={s.heroTop}>
            {logoDataUrl ? <Image src={logoDataUrl} style={s.logo} /> : <View />}
            <View style={s.badge}><Text style={s.badgeText}>ITINERARY</Text></View>
          </View>
          <Text style={s.heroTitle}>{paket?.nama || ''}</Text>
          <View style={s.pillRow}>
            {berangkatLabel ? <View style={s.pill}><Text style={s.pillText}>{berangkatLabel}</Text></View> : null}
            {paket?.maskapai ? <View style={s.pill}><Text style={s.pillText}>{paket.maskapai}</Text></View> : null}
            <View style={s.pill}><Text style={s.pillText}>{days.length} hari</Text></View>
            {totalNights > 0 ? <View style={s.pill}><Text style={s.pillText}>{totalNights} malam</Text></View> : null}
          </View>
        </View>

        {days.map((day, i) => (
          <KartuHari
            key={i}
            day={day}
            index={i}
            dateISO={dayISO[i]}
            photos={photosByDay[i] || []}
            flagDataUrl={flagDataUrl}
          />
        ))}

        <KartuPenerbangan paket={paket} arrivals={arrivals} />
        <KartuHotel paket={paket} />
        <KartuHarga paket={paket} />

        {agent ? (
          <View style={s.agentCard} wrap={false}>
            <View style={{ flex: 1 }}>
              <Text style={s.agentName}>{agent.name}</Text>
              {agent.phone ? <Text style={s.agentContact}>{agent.phone}</Text> : null}
              <Text style={s.agentAjak}>Pindai untuk buka itinerary versi web</Text>
            </View>
            {qrDataUrl ? <Image src={qrDataUrl} style={s.qr} /> : null}
          </View>
        ) : null}

        <Text style={s.note}>Jadwal dapat berubah menyesuaikan kondisi di lapangan.</Text>

        <View style={s.foot} fixed>
          <Text style={s.footText}>{paket?.jadwalId} · {paket?.nama}</Text>
          <Text style={s.footText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
```

- [ ] **Step 6: Verifikasi kompilasi**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep ItineraryDocument`
Expected: tidak ada baris keluar (proyek punya ~6 error pre-existing di berkas lain — abaikan yang bukan `ItineraryDocument`).

- [ ] **Step 7: Commit**

```bash
git add src/components/ItineraryDocument.tsx
git commit -m "feat(itinerary): dokumen PDF rencana perjalanan 400x800"
```

---

### Task 3: Perakit `itineraryPdfBlob.ts`

**Files:**
- Create: `src/utils/itineraryPdfBlob.ts`

**Interfaces:**
- Consumes: `ItineraryDocument` (Task 2), `canRenderItineraryPdf` (Task 1), `destinationPhotosForDays` + `destinationPhotoUrl` dari `lib/itinerary-destinasi.js`
- Produces: `generateItineraryPdfBlob(opts): Promise<Blob>` dan `itineraryPdfFileName(jadwalId): string`

- [ ] **Step 1: Tulis perakit**

Buat `src/utils/itineraryPdfBlob.ts`:

```ts
// Perakit PDF "Rencana Perjalanan": mengubah aset jadi dataURL lalu menyerahkan
// ke ItineraryDocument. Dipisah dari dokumennya supaya dokumen tetap render-only
// dan bisa dipakai ulang bila nanti dipanggil dari halaman share.
import { pdf } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import type { UmrohPackage } from '@/types';
import type { AgentData } from '@/data/agents';
import { destinationPhotosForDays, destinationPhotoUrl } from '../../lib/itinerary-destinasi.js';
import { ItineraryDocument, type ItineraryDocProps } from '../components/ItineraryDocument';

/**
 * react-pdf tidak bisa membaca WebP (dan tidak bisa membaca JPEG progresif),
 * sedangkan derivatif foto destinasi semuanya WebP. Kanvas dipakai sebagai
 * penerjemah — pola yang sama dengan foto agent di generateQuotationPdfBlob.
 * Bunny mengirim `access-control-allow-origin: *` sehingga kanvas tak ter-taint.
 */
async function toJpegDataUrl(url: string, maxWidth = 800, quality = 0.82): Promise<string | null> {
  try {
    return await new Promise<string>((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const scale = img.naturalWidth > maxWidth ? maxWidth / img.naturalWidth : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas 2d tidak tersedia'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error(`gagal memuat ${url}`));
      img.src = url;
    });
  } catch (err) {
    // Satu foto hilang tidak boleh menggagalkan seluruh dokumen.
    console.warn('[itinerary-pdf] foto dilewati:', url, err);
    return null;
  }
}

export function itineraryPdfFileName(jadwalId: string): string {
  return `rencana-perjalanan-${jadwalId || 'alhijaz'}.pdf`;
}

export async function generateItineraryPdfBlob({
  content,
  paket,
  agent,
  shareUrl,
}: {
  content: ItineraryDocProps['content'];
  paket: UmrohPackage;
  agent?: AgentData | null;
  shareUrl?: string;
}): Promise<Blob> {
  const photoPlan = destinationPhotosForDays(content.days) as Array<Array<{ file: string; label: string } | null>>;

  // Satu berkas foto bisa muncul di beberapa hari? Tidak — dedup-nya global di
  // destinationPhotosForDays. Tetap di-cache supaya aman bila aturannya berubah.
  const cache = new Map<string, string | null>();
  const photosByDay: Array<Array<{ dataUrl: string; label: string } | null>> = [];
  for (const perDay of photoPlan) {
    const out: Array<{ dataUrl: string; label: string } | null> = [];
    for (const p of perDay) {
      if (!p) { out.push(null); continue; }
      if (!cache.has(p.file)) cache.set(p.file, await toJpegDataUrl(destinationPhotoUrl(p.file)));
      const dataUrl = cache.get(p.file);
      out.push(dataUrl ? { dataUrl, label: p.label } : null);
    }
    photosByDay.push(out);
  }

  const [logoDataUrl, flagDataUrl] = await Promise.all([
    toJpegDataUrl(`${window.location.origin}/new-logo/new-logo-alhijaz-white.png`, 400),
    toJpegDataUrl(`${window.location.origin}/flags/saudi.png`, 200),
  ]);

  let qrDataUrl: string | undefined;
  if (shareUrl) {
    try {
      qrDataUrl = await QRCode.toDataURL(shareUrl, { margin: 0, width: 232, color: { dark: '#1E1512', light: '#FFFFFF' } });
    } catch (err) {
      console.warn('[itinerary-pdf] QR dilewati:', err);
    }
  }

  return pdf(
    <ItineraryDocument
      content={content}
      paket={paket}
      agent={agent}
      photosByDay={photosByDay}
      flagDataUrl={flagDataUrl || undefined}
      logoDataUrl={logoDataUrl || undefined}
      qrDataUrl={qrDataUrl}
      shareUrl={shareUrl}
    />,
  ).toBlob();
}
```

- [ ] **Step 2: Ganti ekstensi ke `.tsx`**

Berkas memuat JSX, jadi namanya harus `.tsx`:

```bash
git mv src/utils/itineraryPdfBlob.ts src/utils/itineraryPdfBlob.tsx 2>/dev/null || mv src/utils/itineraryPdfBlob.ts src/utils/itineraryPdfBlob.tsx
```

- [ ] **Step 3: Verifikasi build**

Run: `npm run build:spa`
Expected: build sukses (`✓ built in ...`). Build — bukan `tsc` — adalah gerbang FE di repo ini.

- [ ] **Step 4: Commit**

```bash
git add src/utils/itineraryPdfBlob.tsx
git commit -m "feat(itinerary): perakit blob PDF + konversi foto webp lewat kanvas"
```

---

### Task 4: Tombol di `ItineraryModal`

**Files:**
- Modify: `src/components/ItineraryModal.tsx`

**Interfaces:**
- Consumes: `generateItineraryPdfBlob`, `itineraryPdfFileName` (Task 3); `canRenderItineraryPdf` (Task 1); `downloadBlob`, `canShareFiles` dari `src/utils/share`

Perilaku (D-7): tombol unduh di footer mengikuti tab aktif — tab **Itinerary** menghasilkan PDF kita, tab **Preview PDF** tetap mengunduh PDF kantor seperti sekarang. Tombol dinonaktifkan bila `canRenderItineraryPdf()` `false`.

- [ ] **Step 1: Tambahkan import & state**

Di `src/components/ItineraryModal.tsx`, tambahkan pada blok import:

```tsx
import { canRenderItineraryPdf } from '../../lib/itinerary-pdf.js';
import { generateItineraryPdfBlob, itineraryPdfFileName } from '../utils/itineraryPdfBlob';
```

Tambahkan state di dekat state lain di komponen:

```tsx
const [buildingOwnPdf, setBuildingOwnPdf] = useState(false);
```

- [ ] **Step 2: Tambahkan handler**

Sisipkan sebelum `return createPortal(`:

```tsx
// PDF "versi kita" — dirakit di klien dari data yang sama dengan tampilan web.
// Gerbang canRenderItineraryPdf memastikan tanggal per hari bisa ditambatkan ke
// jadwal; kalau tidak, tombol dinonaktifkan (lebih baik hilang daripada salah).
const ownPdfReady = Boolean(
  effectivePaket && webContent && canRenderItineraryPdf(webContent, effectivePaket),
);

const handleOwnPdf = async () => {
  if (!ownPdfReady || buildingOwnPdf || !effectivePaket || !webContent) return;
  setBuildingOwnPdf(true);
  try {
    const blob = await generateItineraryPdfBlob({
      content: webContent,
      paket: effectivePaket,
      agent: agentSlug ? AGENTS_DATA[agentSlug] : null,
      shareUrl: shareUrl || undefined,
    });
    const fileName = itineraryPdfFileName(effectivePaket.jadwalId);
    const file = new File([blob], fileName, { type: 'application/pdf' });
    if (canShareFiles([file]) && typeof navigator.share === 'function') {
      try {
        await navigator.share({ files: [file], title: 'Rencana Perjalanan' });
      } catch (err) {
        if ((err as DOMException)?.name !== 'AbortError') downloadBlob(blob, fileName);
      }
    } else {
      downloadBlob(blob, fileName);
    }
    trackEvent('action', 'itinerary_pdf_download', { paket: effectivePaket.jadwalId });
  } catch (err) {
    console.error('[itinerary-pdf] gagal:', err);
  } finally {
    setBuildingOwnPdf(false);
  }
};
```

Pastikan `AGENTS_DATA` sudah ter-import di berkas ini; bila belum, tambahkan
`import { AGENTS_DATA } from '@/data/agents';`.

- [ ] **Step 3: Sambungkan ke tombol footer**

Cari tombol unduh/share di footer (blok `{/* ─── FOOTER ─── */}`). Bungkus
`onClick`-nya supaya bercabang menurut tab, dan ganti labelnya:

```tsx
onClick={activeTab === 'itinerary' && hasTabs ? handleOwnPdf : handleShareOrDownload}
disabled={activeTab === 'itinerary' && hasTabs ? !ownPdfReady || buildingOwnPdf : undefined}
```

Label tombol saat tab Itinerary aktif: `buildingOwnPdf ? 'Menyiapkan…' : 'Unduh PDF'`.

- [ ] **Step 4: Verifikasi build**

Run: `npm run build:spa`
Expected: build sukses.

- [ ] **Step 5: Commit**

```bash
git add src/components/ItineraryModal.tsx
git commit -m "feat(itinerary): tombol unduh PDF mengikuti tab aktif"
```

---

### Task 5: Regresi & daftar verifikasi manual

**Files:**
- Test: `tests/itinerary-pdf.test.js` (sudah ada), `tests/itinerary-view.test.js`

- [ ] **Step 1: Jalankan tes unit yang berdekatan**

Run: `node --test tests/itinerary-pdf.test.js tests/itinerary-view.test.js tests/itinerary-destinasi.test.js tests/package-tiers.test.js`
Expected: semua PASS — memastikan modul yang dipakai ulang tidak tersenggol.

- [ ] **Step 2: Build final**

Run: `npm run build`
Expected: sukses.

- [ ] **Step 3: Commit bila ada perubahan**

```bash
git status --short
```

Daftar verifikasi manual untuk user (jangan dijalankan otomatis — uji end-to-end
di repo ini lambat dan rewel di browser):

1. Buka modal itinerary paket **JBU1504** dari halaman jadwal.
2. Di tab **Itinerary**, tekan **Unduh PDF** → berkas `rencana-perjalanan-JBU1504.pdf`.
3. Periksa: ±8 halaman; foto rombongan muncul di hari 2 & 3; tidak ada foto terbelah
   antar halaman; nomor halaman `n / total` benar di tiap halaman.
4. Periksa kartu penerbangan: `CGK 15:50 → MED 21:15` (dua titik, bukan titik),
   dan pada leg pulang jam tiba **tidak** tampil karena sama dengan jam berangkat.
5. Periksa kartu harga: satu baris `HEMAT` + baris kecil tipe kamar lain.
6. Buka PDF-nya di HP lewat WhatsApp — teks harus terbaca tanpa zoom.
7. Uji paket bertier banyak (mis. JBU1500) → blok harga menampilkan beberapa baris.

---

## Self-Review

**Spec coverage:** §3 bentuk → Task 2 Step 1/5; §4 isi & sumber → Task 2 Step 3–5;
§5 T-1 → Task 2 Step 5 (`segments` boleh null, pil malam hanya bila > 0); T-2 → Task 1
`flightLegView`; T-3 → Task 1 `normalizeJam`; T-4 → Task 1 `priceRows` + Task 2
`KartuHarga`; §6 arsitektur → Task 1–3; §7 foto → Task 3 Step 1; §8 paginasi → Task 2
(`wrap={false}` pada foto & kartu penutup, `fixed` + `render` pada kaki); §9 pemicu →
Task 4; §10 pengujian → Task 1 + Task 5.

**Placeholder scan:** tidak ada TBD/TODO; setiap langkah kode memuat kode sungguhan.

**Type consistency:** `ItineraryDocProps` di Task 2 Step 5 cocok dengan objek yang
dikirim Task 3; `Foto = {dataUrl, label}` dipakai konsisten di `KartuHari`,
`photosByDay`, dan perakit; `flightLegView`/`priceRows` dipanggil dengan bentuk yang
sama seperti yang dites di Task 1.

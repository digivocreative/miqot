# Manasik Mendatang Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambahkan tab "Manasik" di section bawah kartu kalender `/dashboard`, berisi sesi manasik mendatang yang bisa dibuka menjadi daftar jamaah + tombol Chat WA pengingat.

**Architecture:** Nol perubahan server. Sesi manasik diturunkan di klien dari payload `/api/calendar/berangkat-mendatang` yang sudah di-fetch kartu ini (grup berangkat sudah membawa `manasik_tgl`/`manasik_jam`). Logika pengelompokan ditaruh di modul murni `lib/manasik-sessions.js` yang bisa diuji langsung dengan `node --test`. Tampilannya jadi tab kedua pada section yang sudah ada, memakai satu keluarga sheet yang sama supaya invarian fokus/`inert`/Escape kartu tidak berlipat.

**Tech Stack:** React 18 + TypeScript, Tailwind, framer-motion, lucide-react, Vite. Tes: `node:test` + `node:assert/strict`. Modul `lib/` = ESM polos, diimpor klien lewat `../../lib/*.js`.

## Global Constraints

- **Spec acuan:** `docs/superpowers/specs/2026-08-14-manasik-mendatang-design.md`.
- **Tidak ada perubahan pada `server.js`, endpoint, cache key, atau skema DB.**
- **Jendela manasik tidak boleh ditulis sebagai angka literal** — di kode maupun di teks UI. Diturunkan: `MANASIK_WINDOW_DAYS = BERANGKAT_MENDATANG_WINDOW_DAYS - MANASIK_MAX_LEAD_DAYS` (60 − 18 = 42).
- **Warna manasik = ungu (`violet`)**, memakai kelas yang sudah ada di `TAB_CONFIG.manasik` pada `UpcomingSchedule.tsx`. Tidak ada kosakata warna baru.
- **Bahasa UI Indonesia.** Label tab persis `Berangkat` dan `Manasik`.
- **Tidak menambahkan pelacakan analitik** (tombol Chat WA di tab Berangkat pun belum dilacak).
- Setiap task diakhiri commit. Pesan commit berbahasa Indonesia, gaya conventional commit seperti riwayat repo.
- Verifikasi tiap task memakai `node --test <file>` dan/atau `npm run build`. Suite penuh & pemeriksaan browser dijalankan user.
- Semua file baru diberi komentar kepala berbahasa Indonesia yang menjelaskan **kenapa** modul itu ada, mengikuti gaya `lib/berangkat-groups.js`.

---

### Task 1: Validator tanggal nyata + perbaikan "Invalid Date"

Bug yang sudah hidup di produksi: `umroh_schedules` memakai sentinel `0000-00-00` untuk "tidak ada tanggal" (JBU0679 WAITINGLIST, JBU1577 UMRAH PRIVAT 9HR). `fmtTglLong('0000-00-00')` menghasilkan string `"Invalid Date"`, dan detail grup Berangkat Mendatang memajangnya apa adanya di field Manasik.

Validator yang sama akan dipakai Task 2, jadi ditaruh di `lib/berangkat-groups.js` bersama helper tanggal lain yang sudah ada di sana.

**Files:**
- Modify: `lib/berangkat-groups.js` (tambah `realDateKey` setelah `fmtHariLagi`, sekitar baris 23)
- Modify: `lib/berangkat-groups.d.ts` (tambah deklarasi)
- Modify: `src/components/berangkat/BerangkatGroupViews.tsx:9` (impor) dan `:272-274` (`manasikLabel`)
- Test: `tests/berangkat-groups.test.js` (tambah 2 tes di akhir berkas)

**Interfaces:**
- Consumes: —
- Produces: `realDateKey(value: string | null | undefined): string | null` dari `lib/berangkat-groups.js` — mengembalikan `'YYYY-MM-DD'` bila nilainya tanggal kalender yang benar-benar ada, selain itu `null`. Dipakai Task 2.

- [ ] **Step 1: Tulis tes yang gagal**

Tambahkan di akhir `tests/berangkat-groups.test.js`:

```js
test('realDateKey menolak sentinel 0000-00-00 dan tanggal yang tak ada di kalender', () => {
  // umroh_schedules memakai '0000-00-00' sebagai "tidak ada tanggal" (JBU0679,
  // JBU1577). Regex saja meloloskannya, dan Date.parse('2026-02-31') justru
  // VALID (bergeser jadi 3 Maret) — dua-duanya harus ditolak.
  assert.equal(realDateKey('0000-00-00'), null);
  assert.equal(realDateKey('2026-02-31'), null);
  assert.equal(realDateKey('2026-13-01'), null);
  assert.equal(realDateKey(''), null);
  assert.equal(realDateKey(null), null);
  assert.equal(realDateKey(undefined), null);
  assert.equal(realDateKey('bukan tanggal'), null);
});

test('realDateKey meloloskan tanggal nyata dan memotong bagian waktu', () => {
  assert.equal(realDateKey('2026-08-14'), '2026-08-14');
  assert.equal(realDateKey('2026-02-28'), '2026-02-28');
  assert.equal(realDateKey('2024-02-29'), '2024-02-29'); // kabisat
  assert.equal(realDateKey('2026-08-14T00:00:00.000Z'), '2026-08-14');
});
```

Tambahkan `realDateKey` ke daftar impor di baris 3-5 berkas itu:

```js
import {
  buildBerangkatGroups, getDestinationFlags, cleanTourLeader, realDateKey,
} from '../lib/berangkat-groups.js';
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `node --test tests/berangkat-groups.test.js`
Expected: FAIL — `realDateKey is not a function`.

- [ ] **Step 3: Implementasikan `realDateKey`**

Sisipkan di `lib/berangkat-groups.js` tepat setelah fungsi `fmtHariLagi` (baris 23):

```js
// Tanggal yang benar-benar ada di kalender, atau null. Dua jebakan sekaligus:
// (1) umroh_schedules memakai sentinel '0000-00-00' untuk "tidak ada tanggal",
//     yang lolos regex tapi bikin fmtTglLong() menghasilkan string "Invalid Date"
//     dan memajangnya ke pengguna;
// (2) Date.parse('2026-02-31') TIDAK NaN — ia bergeser diam-diam ke 3 Maret.
//     Karena itu hasilnya diuji balik, bukan sekadar dicek Number.isFinite.
export function realDateKey(value) {
  const key = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const ms = Date.parse(`${key}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10) === key ? key : null;
}
```

Tambahkan deklarasinya di `lib/berangkat-groups.d.ts`, setelah baris `export function fmtHariLagi(...)`:

```ts
export function realDateKey(value: string | null | undefined): string | null;
```

- [ ] **Step 4: Jalankan tes, pastikan lulus**

Run: `node --test tests/berangkat-groups.test.js`
Expected: PASS, semua tes lama tetap hijau.

- [ ] **Step 5: Pakai validator itu untuk membetulkan "Invalid Date"**

Di `src/components/berangkat/BerangkatGroupViews.tsx`, ubah baris impor 9 menjadi:

```tsx
import { getDestinationFlags, fmtTgl, fmtTglLong, realDateKey } from '../../../lib/berangkat-groups.js';
```

Lalu ganti `manasikLabel` di `BerangkatGroupDetail` (baris 272-274) menjadi:

```tsx
  // realDateKey, bukan sekadar cek kosong: manasik_tgl bisa berisi sentinel
  // '0000-00-00' dari umroh_schedules, dan fmtTglLong() akan memajangnya
  // sebagai literal "Invalid Date" ke agen.
  const manasikLabel = realDateKey(group.manasik_tgl)
    ? fmtTglLong(group.manasik_tgl)
    : null;
```

`GroupMeta` sudah menampilkan `-` untuk nilai kosong, jadi tak ada perubahan lain.

- [ ] **Step 6: Pastikan build hijau**

Run: `npm run build`
Expected: sukses, tanpa error TypeScript baru.

- [ ] **Step 7: Commit**

```bash
git add lib/berangkat-groups.js lib/berangkat-groups.d.ts src/components/berangkat/BerangkatGroupViews.tsx tests/berangkat-groups.test.js
git commit -m "fix(berangkat): field Manasik tak lagi menampilkan \"Invalid Date\"

umroh_schedules memakai sentinel 0000-00-00 sebagai \"tidak ada tanggal\"
(JBU0679, JBU1577); fmtTglLong memajangnya apa adanya ke agen. Tambah
realDateKey() yang juga menolak tanggal yang bergeser diam-diam saat
diparse (2026-02-31 -> 3 Maret)."
```

---

### Task 2: Modul `lib/manasik-sessions.js`

Logika murni: `BerangkatGroup[]` → `ManasikSession[]`. Dipisah dari `berangkat-groups.js` supaya modul itu tetap tentang berangkat saja — ia ikut dipakai halaman Statistik, yang tak menampilkan manasik.

**Files:**
- Create: `lib/manasik-sessions.js`
- Create: `lib/manasik-sessions.d.ts`
- Test: `tests/manasik-sessions.test.js`

**Interfaces:**
- Consumes: `realDateKey` dari `lib/berangkat-groups.js` (Task 1); `BERANGKAT_MENDATANG_WINDOW_DAYS` dari `lib/laporan-stats.js` (sudah ada, nilai 60, modul nol dependensi).
- Produces, dipakai Task 4 & 5:
  - `MANASIK_MAX_LEAD_DAYS: number` (18)
  - `MANASIK_WINDOW_DAYS: number` (turunan, 42)
  - `normalizeManasikJam(value: string|null|undefined): string|null` — `'08:00:00'` → `'08:00'`
  - `wibTodayKey(now?: Date): string` — `'YYYY-MM-DD'` menurut WIB
  - `buildManasikSessions(groups: BerangkatGroup[], todayStr: string): ManasikSession[]`
  - Tipe `ManasikSession` = `{ key, manasik_tgl, manasik_jam, hari_lagi, count, groups, items }`

- [ ] **Step 1: Tulis tes yang gagal**

Buat `tests/manasik-sessions.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildManasikSessions,
  normalizeManasikJam,
  wibTodayKey,
  MANASIK_WINDOW_DAYS,
  MANASIK_MAX_LEAD_DAYS,
} from '../lib/manasik-sessions.js';
import { BERANGKAT_MENDATANG_WINDOW_DAYS } from '../lib/laporan-stats.js';

const TODAY = '2026-08-14';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function plusDays(n) {
  return new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * MS_PER_DAY).toISOString().slice(0, 10);
}

// Bentuknya mengikuti keluaran buildBerangkatGroups() apa adanya.
function grp({ paket, manasik_tgl, manasik_jam = '08:00:00', namas = ['A'], berangkat = plusDays(20) }) {
  return {
    key: `${paket}|${manasik_tgl}|${manasik_jam}`,
    jadwal_id: paket,
    itinerary_ready: false,
    paket,
    count: namas.length,
    tour_leader: null,
    manasik_tgl,
    manasik_jam,
    tgl_berangkat: berangkat,
    berangkat_kode_penerbangan: null,
    items: namas.map(nama => ({
      nama, paket, jk: 'L', tgl_berangkat: berangkat,
      hari_lagi: 20, lunas: true, sisa: 0, wa: null,
    })),
  };
}

test('paket berbeda pada tanggal + jam yang sama menjadi SATU sesi', () => {
  // Ini alasan pengelompokannya per tanggal+jam, bukan per paket: pada data
  // 2026-08-14, 8 dari 11 tanggal manasik dihadiri lebih dari satu paket.
  const sessions = buildManasikSessions([
    grp({ paket: 'PROMO PLUS BADAR 10HR', manasik_tgl: plusDays(1), namas: ['BUDI', 'ANI'] }),
    grp({ paket: 'PROMO UMRAH 9HR', manasik_tgl: plusDays(1), namas: ['CITRA'] }),
  ], TODAY);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].count, 3);
  assert.equal(sessions[0].groups.length, 2);
  assert.equal(sessions[0].items.length, 3);
});

test('jam berbeda pada tanggal yang sama menjadi DUA sesi', () => {
  // 19 Sep 2026 punya sesi 08:00 (4 paket) dan 08:30 (1 paket) di data nyata.
  const sessions = buildManasikSessions([
    grp({ paket: 'REGULER 9HR', manasik_tgl: plusDays(5), manasik_jam: '08:00:00' }),
    grp({ paket: 'PROMO PLUS DUBAI 10 HARI', manasik_tgl: plusDays(5), manasik_jam: '08:30:00' }),
  ], TODAY);

  assert.equal(sessions.length, 2);
  assert.deepEqual(sessions.map(s => s.manasik_jam), ['08:00', '08:30']);
});

test('manasik dengan tanggal sentinel atau cacat dibuang', () => {
  const sessions = buildManasikSessions([
    grp({ paket: 'WAITINGLIST', manasik_tgl: '0000-00-00' }),
    grp({ paket: 'UMRAH PRIVAT 9HR', manasik_tgl: null }),
    grp({ paket: 'TANGGAL NGACO', manasik_tgl: '2026-02-31' }),
    grp({ paket: 'REGULER 9HR', manasik_tgl: plusDays(3) }),
  ], TODAY);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].groups[0].paket, 'REGULER 9HR');
});

test('manasik kemarin dibuang, manasik hari ini ikut dengan hari_lagi 0', () => {
  const sessions = buildManasikSessions([
    grp({ paket: 'SUDAH LEWAT', manasik_tgl: plusDays(-1) }),
    grp({ paket: 'HARI INI', manasik_tgl: TODAY }),
  ], TODAY);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].groups[0].paket, 'HARI INI');
  assert.equal(sessions[0].hari_lagi, 0);
});

test('batas jendela: hari terakhir ikut, sehari sesudahnya dibuang', () => {
  const sessions = buildManasikSessions([
    grp({ paket: 'TEPAT DI BATAS', manasik_tgl: plusDays(MANASIK_WINDOW_DAYS) }),
    grp({ paket: 'LEWAT BATAS', manasik_tgl: plusDays(MANASIK_WINDOW_DAYS + 1) }),
  ], TODAY);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].groups[0].paket, 'TEPAT DI BATAS');
  assert.equal(sessions[0].hari_lagi, MANASIK_WINDOW_DAYS);
});

test('jendela manasik tak pernah melampaui jangkauan data yang di-fetch', () => {
  // INVARIAN INTI. Sesi manasik hanya terlihat kalau jamaahnya ikut ter-fetch,
  // dan yang ter-fetch cuma yang berangkat dalam BERANGKAT_MENDATANG_WINDOW_DAYS.
  // Kalau salah satu angka digeser sampai jumlahnya melebihi jendela berangkat,
  // sesi di ujung jendela hilang DIAM-DIAM — tes ini yang menahannya.
  assert.ok(
    MANASIK_WINDOW_DAYS + MANASIK_MAX_LEAD_DAYS <= BERANGKAT_MENDATANG_WINDOW_DAYS,
    `jendela manasik (${MANASIK_WINDOW_DAYS}) + lead maks (${MANASIK_MAX_LEAD_DAYS}) `
    + `melebihi jendela berangkat (${BERANGKAT_MENDATANG_WINDOW_DAYS})`,
  );
  assert.ok(MANASIK_WINDOW_DAYS > 0);
});

test('manasik_jam kosong tidak menghilangkan sesi', () => {
  const sessions = buildManasikSessions([
    grp({ paket: 'TANPA JAM', manasik_tgl: plusDays(2), manasik_jam: null }),
  ], TODAY);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].manasik_jam, null);
  assert.equal(sessions[0].count, 1);
});

test('items terurut nama, count sama dengan jumlah items, sesi terurut tanggal', () => {
  const sessions = buildManasikSessions([
    grp({ paket: 'PAKET B', manasik_tgl: plusDays(9), namas: ['ZAINAL'] }),
    grp({ paket: 'PAKET A', manasik_tgl: plusDays(4), namas: ['SITI', 'AHMAD'] }),
  ], TODAY);

  assert.deepEqual(sessions.map(s => s.manasik_tgl), [plusDays(4), plusDays(9)]);
  assert.deepEqual(sessions[0].items.map(i => i.nama), ['AHMAD', 'SITI']);
  assert.equal(sessions[0].count, sessions[0].items.length);
});

test('normalizeManasikJam memangkas detik dan menolak nilai kosong', () => {
  assert.equal(normalizeManasikJam('08:00:00'), '08:00');
  assert.equal(normalizeManasikJam('08:30'), '08:30');
  assert.equal(normalizeManasikJam(''), null);
  assert.equal(normalizeManasikJam(null), null);
});

test('wibTodayKey memakai tanggal WIB, bukan UTC', () => {
  // 14 Agu 22:30 UTC = 15 Agu 05:30 WIB. Memakai tanggal perangkat/UTC
  // membuat batas jendela dan hari_lagi meleset sehari.
  assert.equal(wibTodayKey(new Date('2026-08-14T22:30:00Z')), '2026-08-15');
  assert.equal(wibTodayKey(new Date('2026-08-14T10:00:00Z')), '2026-08-14');
});
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `node --test tests/manasik-sessions.test.js`
Expected: FAIL — `Cannot find module '../lib/manasik-sessions.js'`.

- [ ] **Step 3: Implementasikan modulnya**

Buat `lib/manasik-sessions.js`:

```js
// Sesi "Manasik Mendatang" untuk kartu kalender dashboard. Diturunkan dari grup
// "Berangkat Mendatang" yang SUDAH di-fetch kartu itu, jadi tidak ada endpoint,
// request, maupun kunci cache tambahan.
//
// Kuncinya tanggal+jam, BUKAN jadwal: manasik adalah acara gabungan. Pada data
// 2026-08-14, 8 dari 11 tanggal manasik dalam jendela dihadiri lebih dari satu
// paket, dan satu tanggal bisa punya dua sesi berbeda jam (19 Sep: 08:00 untuk
// 4 paket, 08:30 untuk 1 paket). Mengelompokkan per paket menghasilkan baris
// kembar bertanggal & berjam identik.
//
// ESM polos di root lib/ supaya bisa diuji langsung tests/ dan diimpor dari
// src/ lewat ../../lib/manasik-sessions.js — pola yang sama dengan
// lib/berangkat-groups.js.

import { realDateKey } from './berangkat-groups.js';
import { BERANGKAT_MENDATANG_WINDOW_DAYS } from './laporan-stats.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Gap `berangkat_tgl - manasik_tgl` yang terukur di umroh_schedules
// (100 jadwal, 2026-08-14): minimum 6 hari, maksimum 18 hari.
export const MANASIK_MAX_LEAD_DAYS = 18;

// DITURUNKAN, bukan angka tetap. Sesi manasik hanya terlihat kalau jamaahnya
// ikut ter-fetch, dan yang ter-fetch cuma yang berangkat dalam
// BERANGKAT_MENDATANG_WINDOW_DAYS. Jadi jendela manasik yang dijamin utuh =
// jendela berangkat dikurangi gap maksimum. Menuliskan 42 sebagai literal
// membuat sesi di ujung jendela hilang diam-diam begitu salah satu angka
// digeser — dijaga tes invarian di tests/manasik-sessions.test.js.
export const MANASIK_WINDOW_DAYS = BERANGKAT_MENDATANG_WINDOW_DAYS - MANASIK_MAX_LEAD_DAYS;

// 'HH:MM:SS' (bentuk yang dipakai umroh_schedules.manasik_jam) -> 'HH:MM'.
export function normalizeManasikJam(value) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : null;
}

// Batas jendela dan hari_lagi harus sepakat dengan perhitungan server, yang
// memakai tanggal WIB (getWIBDateStr di server.js). Memakai tanggal perangkat
// membuat keduanya meleset sehari bagi agen di luar WIB atau yang membuka
// aplikasi lewat tengah malam. Pola offsetnya sama dengan jakartaDateString()
// di calendar-api.js.
export function wibTodayKey(now = new Date()) {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function buildManasikSessions(groups, todayStr) {
  const todayKey = realDateKey(todayStr);
  if (!todayKey) return [];
  const todayMs = Date.parse(`${todayKey}T00:00:00Z`);
  const endMs = todayMs + (MANASIK_WINDOW_DAYS * MS_PER_DAY);

  const byKey = new Map();
  for (const group of groups || []) {
    const tgl = realDateKey(group?.manasik_tgl);
    if (!tgl) continue;
    const ms = Date.parse(`${tgl}T00:00:00Z`);
    if (ms < todayMs || ms > endMs) continue;

    const jam = normalizeManasikJam(group.manasik_jam);
    const key = `${tgl}|${jam || ''}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        manasik_tgl: tgl,
        manasik_jam: jam,
        hari_lagi: Math.round((ms - todayMs) / MS_PER_DAY),
        count: 0,
        groups: [],
        items: [],
      });
    }
    const session = byKey.get(key);
    session.groups.push(group);
    session.items.push(...(group.items || []));
    session.count = session.items.length;
  }

  for (const session of byKey.values()) {
    session.items.sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || '')));
    session.groups.sort((a, b) => String(a.paket || '').localeCompare(String(b.paket || '')));
  }

  return Array.from(byKey.values()).sort((a, b) =>
    a.manasik_tgl.localeCompare(b.manasik_tgl)
    || String(a.manasik_jam || '').localeCompare(String(b.manasik_jam || ''))
  );
}
```

Buat `lib/manasik-sessions.d.ts`:

```ts
import type { BerangkatGroup, BerangkatItem } from './berangkat-groups.js';

export interface ManasikSession {
  key: string;
  manasik_tgl: string;
  manasik_jam: string | null;
  hari_lagi: number;
  count: number;
  groups: BerangkatGroup[];
  items: BerangkatItem[];
}

export const MANASIK_MAX_LEAD_DAYS: number;
export const MANASIK_WINDOW_DAYS: number;
export function normalizeManasikJam(value: string | null | undefined): string | null;
export function wibTodayKey(now?: Date): string;
export function buildManasikSessions(groups: BerangkatGroup[], todayStr: string): ManasikSession[];
```

- [ ] **Step 4: Jalankan tes, pastikan lulus**

Run: `node --test tests/manasik-sessions.test.js`
Expected: PASS, 10 tes.

- [ ] **Step 5: Commit**

```bash
git add lib/manasik-sessions.js lib/manasik-sessions.d.ts tests/manasik-sessions.test.js
git commit -m "feat(manasik): modul sesi manasik dari grup berangkat

Kelompokkan per tanggal+jam karena manasik acara gabungan (8 dari 11
tanggal dihadiri >1 paket). Jendela 42 hari diturunkan dari jendela
berangkat dikurangi gap maksimum terukur, dijaga tes invarian."
```

---

### Task 3: Buka `JamaahRow` agar bisa dipakai manasik

`BerangkatRow` saat ini file-internal (sudah diperiksa: tak diimpor dari mana pun) dan pesan WA-nya dipaku ke pesan keberangkatan. Setelah task ini ia melayani manasik juga, jadi namanya diganti dan pesannya bisa dioper. Tak ada perubahan perilaku.

**Files:**
- Modify: `src/components/berangkat/BerangkatGroupViews.tsx` — baris 12 (`toWaTitleCase`), 48-54 (tanda tangan `BerangkatRow`), 106 (`FieldLabel`), 112 (`GroupMeta`), 294 (pemakaian di `BerangkatGroupDetail`)

**Interfaces:**
- Consumes: —
- Produces, dipakai Task 4:
  - `export function JamaahRow({ item, showPackage?, buildWaText? })` — `buildWaText?: (item: BerangkatItem) => string`, default `buildBerangkatWaText`
  - `export function FieldLabel({ children })`
  - `export function GroupMeta({ label, value })`
  - `export function toWaTitleCase(value: string | null | undefined): string`

- [ ] **Step 1: Ekspor helper teks**

Ubah baris 12 dari `function toWaTitleCase(` menjadi:

```tsx
export function toWaTitleCase(value: string | null | undefined): string {
```

- [ ] **Step 2: Ganti nama `BerangkatRow` menjadi `JamaahRow`, ekspor, dan buka pesan WA-nya**

Ganti baris 48-54 (dari `function BerangkatRow({` sampai baris `: null;`) menjadi:

```tsx
// Dipakai daftar Berangkat Mendatang DAN daftar peserta sesi manasik, karena
// itu namanya bukan lagi BerangkatRow. `buildWaText` dioper supaya pengingat
// manasik tidak memakai kalimat keberangkatan.
export function JamaahRow({ item, showPackage = true, buildWaText = buildBerangkatWaText }: {
  item: BerangkatItem;
  showPackage?: boolean;
  buildWaText?: (item: BerangkatItem) => string;
}) {
  const initials = getInitials(item.nama);
  const isFemale = item.jk === 'P';
  const waNumber = normalizeWaNumber(item.wa);
  const waUrl = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(buildWaText(item))}`
    : null;
```

- [ ] **Step 3: Ekspor `FieldLabel` dan `GroupMeta`**

Baris 106: `function FieldLabel({` → `export function FieldLabel({`
Baris 112: `function GroupMeta({` → `export function GroupMeta({`

- [ ] **Step 4: Perbarui pemakaian di dalam berkas**

Baris 294, di `BerangkatGroupDetail`:

```tsx
        {group.items.map((item, i) => <JamaahRow key={`${group.key}-${item.nama}-${i}`} item={item} showPackage={false} />)}
```

- [ ] **Step 5: Pastikan tak ada sisa nama lama**

Run: `grep -rn "BerangkatRow" src/ tests/`
Expected: tidak ada keluaran.

- [ ] **Step 6: Build & tes terkait**

Run: `npm run build && node --test tests/berangkat-groups.test.js tests/upcoming-schedule-itinerary.test.js tests/upcoming-schedule-mutawif.test.js`
Expected: build sukses, semua tes PASS. (Tes penjaga itu memaku isi sheet tanggal, bukan komponen ini — kalau merah, berarti ada yang tersenggol.)

- [ ] **Step 7: Commit**

```bash
git add src/components/berangkat/BerangkatGroupViews.tsx
git commit -m "refactor(berangkat): BerangkatRow jadi JamaahRow yang bisa dipakai bersama

Baris jamaah akan dipakai daftar peserta manasik juga. Pesan WA dioper
lewat prop buildWaText (default tetap pesan keberangkatan), dan
FieldLabel/GroupMeta diekspor untuk grid meta sheet manasik."
```

---

### Task 4: Komponen tampilan manasik

Berkas terpisah supaya `BerangkatGroupViews.tsx` — yang ikut dipakai halaman Statistik — tidak membengkak oleh kode yang tak dipakainya.

**Files:**
- Create: `src/components/berangkat/ManasikSessionViews.tsx`

**Interfaces:**
- Consumes: `JamaahRow`, `FieldLabel`, `GroupMeta`, `toWaTitleCase` dari `./BerangkatGroupViews` (Task 3); `ManasikSession` dari `lib/manasik-sessions.js` (Task 2); `fmtTgl`, `fmtTglLong` dari `lib/berangkat-groups.js`.
- Produces, dipakai Task 5:
  - `export function ManasikSessionSummaryRow({ session, onSelect }: { session: ManasikSession; onSelect: (key: string) => void })`
  - `export function ManasikSessionDetail({ session }: { session: ManasikSession })`

- [ ] **Step 1: Buat berkasnya**

Buat `src/components/berangkat/ManasikSessionViews.tsx`:

```tsx
// Tampilan "Manasik Mendatang" di kartu kalender dashboard. Dipisah dari
// BerangkatGroupViews.tsx karena berkas itu ikut dipakai halaman Statistik,
// yang tidak menampilkan manasik sama sekali.
//
// Warnanya ungu, mengikuti warna yang sudah jadi milik manasik di legenda dan
// titik kalender kartu ini (TAB_CONFIG.manasik di UpcomingSchedule.tsx).

import { Clock, Users } from 'lucide-react';
import { fmtTgl, fmtTglLong } from '../../../lib/berangkat-groups.js';
import type { BerangkatItem } from '../../../lib/berangkat-groups.js';
import type { ManasikSession } from '../../../lib/manasik-sessions.js';
import { FieldLabel, GroupMeta, JamaahRow, toWaTitleCase } from './BerangkatGroupViews';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function buildManasikWaText(item: BerangkatItem, session: ManasikSession): string {
  const honorific = item.jk === 'P' ? 'Ibu' : 'Bapak';
  const jamaahName = toWaTitleCase(item.nama);
  const packageName = toWaTitleCase(item.paket || 'Umroh');
  const jam = session.manasik_jam ? ` pukul ${session.manasik_jam} WIB` : '';
  const lines = [
    `Assalamualaikum ${honorific} *${jamaahName}*, mau mengingatkan bahwa manasik untuk ${packageName} dijadwalkan pada ${fmtTglLong(session.manasik_tgl)}${jam}.`,
    '',
    `Mohon kehadiran ${honorific} tepat waktu ya. Jazakumullah khairan.`,
  ];
  return lines.join('\n');
}

// Menggantikan bendera destinasi yang dipakai baris berangkat: satu sesi memuat
// banyak paket dengan destinasi berbeda, jadi bendera justru menyesatkan.
// Dibaca sebagai UTC karena kuncinya sudah 'YYYY-MM-DD' hasil realDateKey.
function ManasikDateChip({ tgl }: { tgl: string }) {
  const date = new Date(`${tgl}T00:00:00Z`);
  return (
    <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-violet-50 leading-none dark:bg-violet-900/20">
      <span className="text-[11px] font-extrabold text-violet-600 dark:text-violet-300">{date.getUTCDate()}</span>
      <span className="mt-0.5 text-[7px] font-bold uppercase tracking-wide text-violet-400 dark:text-violet-400/80">
        {SHORT_MONTHS[date.getUTCMonth()]}
      </span>
    </div>
  );
}

function hariLagiLabel(hariLagi: number): string {
  return hariLagi === 0 ? 'Hari ini' : `${hariLagi} hari`;
}

export function ManasikSessionSummaryRow({ session, onSelect }: {
  session: ManasikSession;
  onSelect: (key: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(session.key)}
      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50/80 dark:hover:bg-slate-700/30 active:scale-[0.99] transition-all"
    >
      <ManasikDateChip tgl={session.manasik_tgl} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-gray-800 dark:text-white truncate">
          {fmtTglLong(session.manasik_tgl)}
        </p>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[10px] font-medium">
          {session.manasik_jam && (
            <>
              <span className="inline-flex shrink-0 items-center gap-1 text-violet-600 dark:text-violet-400">
                <Clock size={11} strokeWidth={2.2} className="shrink-0" />
                <span>{session.manasik_jam}</span>
              </span>
              <span className="text-gray-300 dark:text-slate-600">·</span>
            </>
          )}
          <span className="shrink-0 text-gray-500 dark:text-slate-400">{session.groups.length} paket</span>
          <span className="text-gray-300 dark:text-slate-600">·</span>
          <span className="inline-flex shrink-0 items-center gap-1 text-amber-600 dark:text-amber-400">
            <Users size={11} strokeWidth={2.2} className="shrink-0" />
            <span>{session.count} Jamaah</span>
          </span>
        </div>
      </div>
      {/* Badge menggantikan chevron (baris berangkat memakai chevron): dengan
          chip tanggal di kiri, memasang keduanya membuat baris sesak di HP. */}
      <span className={`shrink-0 inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold ${
        session.hari_lagi <= 3
          ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
          : 'bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400'
      }`}>
        {hariLagiLabel(session.hari_lagi)}
      </span>
    </button>
  );
}

export function ManasikSessionDetail({ session }: { session: ManasikSession }) {
  return (
    <div>
      <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700/50 bg-white/40 dark:bg-slate-800/40">
        <div className="flex items-center gap-2">
          <ManasikDateChip tgl={session.manasik_tgl} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-gray-800 dark:text-white">
              {fmtTglLong(session.manasik_tgl)}
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
          <GroupMeta label="Jam" value={session.manasik_jam ? `${session.manasik_jam} WIB` : null} />
          <GroupMeta label="Jamaah" value={`${session.count} orang`} />
          <GroupMeta label="Paket" value={`${session.groups.length} paket`} />
          <GroupMeta label="Sisa Waktu" value={session.hari_lagi === 0 ? 'Hari ini' : `${session.hari_lagi} hari lagi`} />
        </div>
      </div>
      {session.groups.map(group => (
        <div key={group.key}>
          <div className="flex items-baseline justify-between gap-2 bg-gray-50/80 px-4 py-1.5 dark:bg-slate-700/30">
            <FieldLabel>{group.paket}</FieldLabel>
            <span className="shrink-0 text-[9px] font-semibold text-gray-400 dark:text-slate-500">
              Berangkat {fmtTgl(group.tgl_berangkat)}
            </span>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-slate-700/40">
            {group.items.map((item, i) => (
              <JamaahRow
                key={`${group.key}-${item.nama}-${i}`}
                item={item}
                showPackage={false}
                buildWaText={(jamaah) => buildManasikWaText(jamaah, session)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Pastikan build hijau**

Run: `npm run build`
Expected: sukses. (Komponen belum dipakai siapa pun — itu normal untuk task ini; Task 5 yang menyambungkannya.)

- [ ] **Step 3: Commit**

```bash
git add src/components/berangkat/ManasikSessionViews.tsx
git commit -m "feat(manasik): komponen baris sesi & sheet detail manasik

Chip tanggal ungu menggantikan bendera destinasi (satu sesi memuat
banyak paket berbeda destinasi), peserta dikelompokkan per paket, dan
tombol Chat WA memakai pesan pengingat manasik."
```

---

### Task 5: Tab Berangkat/Manasik di `UpcomingSchedule`

Menyambungkan semuanya. Kunci desainnya: **satu keluarga sheet, bukan dua**. Sheet hanya bisa dibuka dari tab yang aktif, dan selama sheet terbuka kartu di belakang `inert` sehingga tab tak bisa berganti — jadi satu pasang state cukup, hanya pencariannya yang bercabang.

**Files:**
- Modify: `src/components/UpcomingSchedule.tsx` — baris 1-9 (impor), 99-101 (konfigurasi tab section), 136-143 (state), 174-179 (turunan), 209-214 (gerbang sheet), 282-294 (efek fokus), 470-510 (render section), 750-808 (sheet)

**Interfaces:**
- Consumes: `buildManasikSessions`, `wibTodayKey`, `MANASIK_WINDOW_DAYS` (Task 2); `ManasikSessionSummaryRow`, `ManasikSessionDetail` (Task 4).
- Produces: —

- [ ] **Step 1: Tambah impor**

Baris 2 — tambahkan `GraduationCap` ke daftar ikon lucide:

```tsx
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, FileText, GraduationCap, Plane, PlaneTakeoff, User, UserCheck, Users, Clock, X, MapPin } from 'lucide-react';
```

Setelah baris 9, tambahkan:

```tsx
import { buildManasikSessions, wibTodayKey, MANASIK_WINDOW_DAYS } from '../../lib/manasik-sessions.js';
import type { ManasikSession } from '../../lib/manasik-sessions.js';
import { ManasikSessionSummaryRow, ManasikSessionDetail } from './berangkat/ManasikSessionViews';
```

- [ ] **Step 2: Tambah konfigurasi tab section**

Setelah baris 103 (`const DAY_HEADERS = ...`), sisipkan:

```tsx
// Tab section bawah kartu. Kelas pill-nya diambil dari TAB_CONFIG supaya tak
// ada kosakata warna baru: hijau = berangkat, ungu = manasik, persis warna
// titik kalender dan legenda di atasnya.
const SECTION_ORDER = ['berangkat', 'manasik'] as const;
type SectionKey = typeof SECTION_ORDER[number];
const SECTION_CONFIG: Record<SectionKey, { label: string; activeTab: string }> = {
  berangkat: { label: 'Berangkat', activeTab: TAB_CONFIG.keberangkatan.activeTab },
  manasik: { label: 'Manasik', activeTab: TAB_CONFIG.manasik.activeTab },
};
```

- [ ] **Step 3: Ganti state section**

Ganti baris 139-140:

```tsx
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
```

menjadi:

```tsx
  // Satu pasang state untuk KEDUA tab: sheet cuma bisa dibuka dari tab yang
  // aktif, dan selama sheet terbuka kartu di belakang `inert` sehingga tab tak
  // bisa berganti. Yang bercabang cuma pencariannya, di bawah.
  const [activeSection, setActiveSection] = useState<SectionKey>('berangkat');
  const [showAllList, setShowAllList] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
```

Ganti juga nama ref di baris 143:

```tsx
  const listCloseButtonRef = useRef<HTMLButtonElement | null>(null);
```

- [ ] **Step 4: Turunkan sesi manasik & entitas terpilih**

Ganti baris 174-179:

```tsx
  const berangkatGroups = useMemo(() => buildBerangkatGroups(berangkatItems), [berangkatItems]);
  const berangkatPreview = berangkatGroups.slice(0, 3);
  const selectedGroup = useMemo(
    () => berangkatGroups.find(g => g.key === selectedGroupKey) || null,
    [berangkatGroups, selectedGroupKey],
  );
```

menjadi:

```tsx
  const berangkatGroups = useMemo(() => buildBerangkatGroups(berangkatItems), [berangkatItems]);
  const manasikSessions = useMemo(
    () => buildManasikSessions(berangkatGroups, wibTodayKey()),
    [berangkatGroups],
  );
  const manasikJamaahCount = useMemo(
    () => manasikSessions.reduce((total, session) => total + session.count, 0),
    [manasikSessions],
  );

  const isManasik = activeSection === 'manasik';
  const listLength = isManasik ? manasikSessions.length : berangkatGroups.length;
  const previewCount = Math.min(3, listLength);

  // Dua pencarian terpisah, masing-masing dipagari tab aktif: kunci milik tab
  // lain tak boleh ikut cocok. Keduanya memakai HASIL pencarian, bukan kunci
  // mentah — lihat catatan di anySheetOpen di bawah.
  const selectedGroup = useMemo(
    () => (activeSection === 'berangkat' ? berangkatGroups.find(g => g.key === selectedKey) || null : null),
    [activeSection, berangkatGroups, selectedKey],
  );
  const selectedSession: ManasikSession | null = useMemo(
    () => (activeSection === 'manasik' ? manasikSessions.find(s => s.key === selectedKey) || null : null),
    [activeSection, manasikSessions, selectedKey],
  );

  // Ganti tab = buang state sheet milik tab lama. Ditulis di handler, bukan
  // effect, supaya tak ada render antara dengan kunci yang tak cocok.
  const selectSection = useCallback((section: SectionKey) => {
    setActiveSection(section);
    setSelectedKey(null);
    setShowAllList(false);
  }, []);
```

- [ ] **Step 5: Perbarui gerbang sheet**

Ganti baris 212-214:

```tsx
  const anySheetOpen = selectedDay !== null || showAllGroups || !!selectedGroup;
  const daySheetOpen = selectedDay !== null;
  const berangkatSheetOpen = showAllGroups || !!selectedGroup;
```

menjadi:

```tsx
  const anySheetOpen = selectedDay !== null || showAllList || !!selectedGroup || !!selectedSession;
  const daySheetOpen = selectedDay !== null;
  const listSheetOpen = showAllList || !!selectedGroup || !!selectedSession;
```

- [ ] **Step 6: Perbarui penangan Escape**

Di efek Escape (baris 259-264), ganti blok cabangnya:

```tsx
      if (listSheetOpen) {
        setSelectedKey(null);
        setShowAllList(false);
      } else if (daySheetOpen) {
        setSelectedDay(null);
      }
```

dan dependensinya di baris 268:

```tsx
  }, [anySheetOpen, listSheetOpen, daySheetOpen, activeItinerary]);
```

- [ ] **Step 7: Perbarui efek fokus**

Ganti baris 282-294:

```tsx
  useEffect(() => {
    if (!berangkatSheetOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    return () => { previouslyFocused?.focus?.(); };
  }, [berangkatSheetOpen]);

  useEffect(() => {
    if (!berangkatSheetOpen) return;
    berangkatCloseButtonRef.current?.focus();
  }, [berangkatSheetOpen, selectedGroupKey]);
```

menjadi:

```tsx
  useEffect(() => {
    if (!listSheetOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    return () => { previouslyFocused?.focus?.(); };
  }, [listSheetOpen]);

  useEffect(() => {
    if (!listSheetOpen) return;
    listCloseButtonRef.current?.focus();
  }, [listSheetOpen, selectedKey]);
```

- [ ] **Step 8: Ganti header section jadi tab**

Ganti blok baris 485-495 (dari `<div className="px-4 pt-3 pb-2 border-t ...">` sampai `</div>` penutupnya, yang memuat judul "Berangkat Mendatang" dan ikon `Plane`) menjadi:

```tsx
            <div className="px-4 pt-3 pb-2 border-t border-gray-100 dark:border-slate-700">
              <div className="flex items-center justify-between gap-2">
                <div className="flex gap-1 rounded-xl bg-gray-50 p-1 dark:bg-slate-900">
                  {SECTION_ORDER.map(section => (
                    <button
                      key={section}
                      type="button"
                      onClick={() => selectSection(section)}
                      aria-pressed={activeSection === section}
                      className={`rounded-lg px-3 py-1.5 text-[10px] font-bold transition-all duration-200 ${
                        activeSection === section
                          ? SECTION_CONFIG[section].activeTab
                          : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'
                      }`}
                    >
                      {SECTION_CONFIG[section].label}
                    </button>
                  ))}
                </div>
                {isManasik
                  ? <GraduationCap size={15} className="shrink-0 text-violet-500 dark:text-violet-400" />
                  : <Plane size={15} className="shrink-0 text-blue-500 dark:text-blue-400" />}
              </div>
              <p className="mt-1.5 text-[10px] text-gray-400 dark:text-slate-500">
                {isManasik
                  ? `${manasikJamaahCount} jamaah · ${manasikSessions.length} sesi · ${MANASIK_WINDOW_DAYS} hari ke depan`
                  : `${berangkatItems.length} jamaah · ${berangkatGroups.length} paket${berangkatLabel ? ` · ${berangkatLabel}` : ''}`}
              </p>
            </div>
```

- [ ] **Step 9: Ganti daftar preview & tombol "Lihat lainnya"**

Ganti blok baris 496-508 (dari `<div className="divide-y divide-gray-50 ...">` sampai tombol "Lihat lainnya" beserta penutupnya) menjadi:

```tsx
            {isManasik && manasikSessions.length === 0 ? (
              <p className="px-4 pb-3 text-[11px] text-gray-400 dark:text-slate-500">
                Belum ada manasik dalam {MANASIK_WINDOW_DAYS} hari ke depan
              </p>
            ) : (
              <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
                {isManasik
                  ? manasikSessions.slice(0, previewCount).map(session => (
                      <ManasikSessionSummaryRow key={session.key} session={session} onSelect={setSelectedKey} />
                    ))
                  : berangkatGroups.slice(0, previewCount).map(group => (
                      <BerangkatGroupSummaryRow key={group.key} group={group} onSelect={setSelectedKey} />
                    ))}
              </div>
            )}
            {listLength > previewCount && (
              <button
                onClick={() => setShowAllList(true)}
                className="w-full py-2.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20 transition-colors border-t border-gray-50 dark:border-slate-700/50 flex items-center justify-center gap-1"
              >
                Lihat lainnya <ChevronDown size={12} />
              </button>
            )}
```

- [ ] **Step 10: Perbarui sheet daftar/detail**

Ganti kondisi pembuka sheet di baris 752 menjadi:

```tsx
        {listSheetOpen && (
```

Ganti overlay `onClick` (baris 760) dan tombol tutup `onClick` (baris 787) menjadi:

```tsx
              onClick={() => { setSelectedKey(null); setShowAllList(false); }}
```

Ganti judul & subjudul (baris 774-784) menjadi:

```tsx
              <div className="px-4 pb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p id="berangkat-sheet-title" className="text-base font-bold text-gray-800 dark:text-white">
                    {selectedSession ? 'Detail Manasik'
                      : selectedGroup ? 'Detail Keberangkatan'
                      : isManasik ? 'Manasik Mendatang' : 'Berangkat Mendatang'}
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">
                    {selectedSession
                      ? `${selectedSession.count} jamaah · ${fmtTglLong(selectedSession.manasik_tgl)}${selectedSession.manasik_jam ? ` · ${selectedSession.manasik_jam}` : ''}`
                      : selectedGroup
                        ? `${selectedGroup.count} jamaah · ${fmtTglLong(selectedGroup.tgl_berangkat)}`
                        : isManasik
                          ? `${manasikSessions.length} sesi · ${MANASIK_WINDOW_DAYS} hari ke depan`
                          : `${berangkatGroups.length} paket${berangkatLabel ? ` · ${berangkatLabel}` : ''}`}
                  </p>
                </div>
```

Ganti `ref` tombol tutup (baris 786) menjadi `ref={listCloseButtonRef}`.

Ganti isi sheet (baris 794-804) menjadi:

```tsx
              <div className="flex-1 overflow-y-auto">
                {selectedSession ? (
                  <ManasikSessionDetail session={selectedSession} />
                ) : selectedGroup ? (
                  <BerangkatGroupDetail group={selectedGroup} agentSlug={agentSlug} />
                ) : (
                  <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
                    {isManasik
                      ? manasikSessions.map(session => (
                          <ManasikSessionSummaryRow key={session.key} session={session} onSelect={setSelectedKey} />
                        ))
                      : berangkatGroups.map(group => (
                          <BerangkatGroupSummaryRow key={group.key} group={group} onSelect={setSelectedKey} />
                        ))}
                  </div>
                )}
              </div>
```

- [ ] **Step 11: Pastikan tak ada sisa nama state lama**

Run: `grep -n "showAllGroups\|selectedGroupKey\|berangkatSheetOpen\|berangkatCloseButtonRef\|berangkatPreview" src/components/UpcomingSchedule.tsx`
Expected: tidak ada keluaran.

- [ ] **Step 12: Build & tes penjaga**

Run: `npm run build && node --test tests/upcoming-schedule-itinerary.test.js tests/upcoming-schedule-mutawif.test.js tests/manasik-sessions.test.js tests/berangkat-groups.test.js`
Expected: build sukses, semua PASS.

- [ ] **Step 13: Commit**

```bash
git add src/components/UpcomingSchedule.tsx
git commit -m "feat(manasik): tab Berangkat/Manasik di kartu kalender dashboard

Satu keluarga sheet untuk kedua tab supaya invarian inert/Escape/fokus
kartu tidak berlipat: sheet hanya bisa dibuka dari tab aktif, dan tab
tak bisa berganti selagi sheet terbuka. Ganti tab membuang state sheet
di handler, bukan effect."
```

---

### Task 6: Verifikasi akhir

**Files:** tidak ada perubahan berkas.

**Interfaces:**
- Consumes: seluruh hasil Task 1-5.
- Produces: —

- [ ] **Step 1: Jalankan seluruh tes yang tersentuh**

Run:

```bash
node --test tests/manasik-sessions.test.js tests/berangkat-groups.test.js tests/berangkat-enrich.test.js tests/upcoming-schedule-itinerary.test.js tests/upcoming-schedule-mutawif.test.js tests/laporan-stats.test.js
```

Expected: semua PASS.

- [ ] **Step 2: Build produksi**

Run: `npm run build`
Expected: sukses.

- [ ] **Step 3: Lint berkas yang tersentuh**

Run: `npx eslint src/components/UpcomingSchedule.tsx src/components/berangkat/ManasikSessionViews.tsx src/components/berangkat/BerangkatGroupViews.tsx lib/manasik-sessions.js lib/berangkat-groups.js`
Expected: tanpa error. (Peringatan yang sudah ada sebelumnya boleh tetap ada.)

- [ ] **Step 4: Serahkan checklist manual ke user**

Laporkan hasil verifikasi apa adanya, lalu serahkan checklist ini — suite penuh & pemeriksaan browser dijalankan user:

- [ ] Buka `/dashboard`: section menampilkan pill **Berangkat | Manasik**, tab Berangkat aktif, isinya persis seperti sebelum perubahan.
- [ ] Klik pill **Manasik**: sesi terurut tanggal; tanggal dengan dua jam berbeda tampil sebagai dua baris.
- [ ] Klik "Lihat lainnya" di tab Manasik: sheet memuat seluruh sesi.
- [ ] Buka satu sesi: peserta dikelompokkan per paket, jumlahnya cocok dengan angka di baris ringkasnya.
- [ ] Klik **Chat WA** salah satu peserta: teksnya menyebut manasik (tanggal + jam), bukan keberangkatan.
- [ ] Escape menutup sheet manasik dan mengembalikan fokus ke pemicunya; kartu di belakang tak bisa di-Tab selagi sheet terbuka.
- [ ] Berpindah tab saat tak ada sheet terbuka tidak meninggalkan sisa state.
- [ ] Mode gelap: pill ungu, chip tanggal, dan badge "Hari ini" terbaca.
- [ ] Di tab **Berangkat**, buka detail grup untuk jadwal yang manasik_tgl-nya `0000-00-00` (JBU1577 UMRAH PRIVAT 9HR bila muncul): field Manasik menampilkan `-`, bukan "Invalid Date".

- [ ] **Step 5: Commit (bila ada perbaikan dari langkah di atas)**

Bila tak ada perubahan berkas, lewati. Bila ada, commit dengan pesan yang menyebut temuannya.

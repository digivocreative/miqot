# Itinerary Tampilan Web — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tab "Tampilan web" (rail waktu) di ItineraryModal + halaman share publik `/:slug/:packageId/itinerary`, sesuai spec `docs/superpowers/specs/2026-07-30-itinerary-web-view-design.md`.

**Architecture:** Logika murni (klasifikasi aktivitas, deteksi kota, hitung malam) di `lib/itinerary-view.js` — pola yang sama dengan `lib/teras-linkify.js`: satu file plain-JS dipakai server & FE, dites dengan node:test. Komponen visual di `src/components/itinerary/` (light-only), dikomposisi oleh `WebItineraryView` yang ditulis ulang. Share page = komponen FE + rute di `main.tsx` + rute OG di `server.js` (pola flight-share/bio, BUKAN Cloudflare function — deviasi dari spec, lihat Task 8).

**Tech Stack:** React + Tailwind (token baru `itin`), lucide-react, node:test, Express (server.js), Supabase.

## Global Constraints

- Light-only: komponen itinerary TIDAK punya varian dark (spec D2). Tidak ada `dark:` class di `src/components/itinerary/`.
- Warna kota (D9): mekkah `#2A5C9A`, madinah `#1F5F4B`, dubai `#8A6D12`, turki `#8A0F0A`, mesir `#6B3FA0`, transit `#556072`, home `#3D4451`. Netral: ink `#1E1512`, ink2 `#5A4F49`, ink3 `#7D6E64`, line `#E9E1DD`, canvas `#FAF7F5`.
- Emas Dubai JANGAN dicerahkan (`#9C7A00`=4.04:1 gagal AA). Gold terang `#D4AF37` dilarang total.
- Burgundy interaktif = tombol penuh teks putih saja; jangan ada elemen interaktif burgundy di dalam timeline (D7).
- Rail garis kiri = warna kota alpha `38` hex (~22%).
- Jam/kode bandara/durasi pakai `font-mono` (fallback ui-monospace boleh; jangan menambah loading font baru).
- PDF selalu jalan keluar: error/kosong → arahkan ke tab/dokumen PDF, jangan buntu.
- Tab web disembunyikan bila `jadwalId` tidak tersedia (jangan render tab yang pasti gagal).
- Strip ringkasan disembunyikan bila hitungan malam tak masuk akal (lebih baik hilang daripada salah).
- Event publik wajib `trackPublicEvent`; event agent `trackEvent`. Event baru WAJIB didaftarkan di server.js (unwhitelisted public = 400 senyap).
- `git branch --show-current` harus `main` sebelum setiap commit (branch bisa berpindah di tengah sesi).
- Verifikasi cepat saja: `node --check`, `node --test` file baru, `npm run build`. JANGAN jalankan suite `tests/*` penuh (lambat/flaky — user yang menjalankan e2e).

---

### Task 1: Logika murni `lib/itinerary-view.js` (TDD)

**Files:**
- Create: `lib/itinerary-view.js`
- Test: `tests/itinerary-view.test.js`

**Interfaces (Produces):**
```js
export function cityKeyForLocation(location: string|null): 'mekkah'|'madinah'|'dubai'|'turki'|'mesir'|'transit'|'home'|null
// Kota TERAKHIR yang disebut di string location ("Medinah – Mekkah" → 'mekkah').
// Taif→mekkah, Bir Ali→madinah, Jeddah/Laut Merah→transit, Jakarta/CGK→home.

export function classifyActivity(text: string, opts?: {dayIndex?: number, activityIndex?: number}):
  'kumpul'|'takeoff'|'landing'|'transit'|'regular'
// ATURAN POSISIONAL (cacat #8 spec): aktivitas pertama hari pertama = 'kumpul'
// walau tak ada kata "kumpul" di teks.

export function activityIconName(kind: string, text: string): string
// Nama ikon lucide. kind highlight: kumpul→'users', takeoff→'plane-takeoff',
// landing→'plane-landing', transit→'plane-landing'. regular: dari kata kunci teks
// (makan/sarapan→'utensils', city tour/photostop→'camera', ziarah/masjid→'landmark',
// hotel/istirahat/koper→'bed-double', imigrasi/paspor→'badge-check',
// pengarahan→'megaphone', default→'circle-dot').

export function computeNightSegments(days: Array<{location?: string|null}>):
  Array<{key: string, nights: number}>|null
// Malam hari-i = kota hari-i (kecuali hari terakhir, tanpa malam). Kelompokkan
// berurutan. null bila >30% hari tak teridentifikasi kotanya, atau total malam < 1
// → caller menyembunyikan strip.
```

- [ ] **Step 1: Tulis test yang gagal** — `tests/itinerary-view.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cityKeyForLocation,
  classifyActivity,
  activityIconName,
  computeNightSegments,
} from '../lib/itinerary-view.js';

// ── cityKeyForLocation ──
test('kota terakhir di location menang', () => {
  assert.equal(cityKeyForLocation('Medinah – Mekkah'), 'mekkah');
  assert.equal(cityKeyForLocation('Dubai – Jeddah - Medinah'), 'madinah');
  assert.equal(cityKeyForLocation('Jakarta - Dubai'), 'dubai');
  assert.equal(cityKeyForLocation('Jeddah – Dubai – Jakarta'), 'home');
});

test('alias & kota khusus', () => {
  assert.equal(cityKeyForLocation('Makkah'), 'mekkah');
  assert.equal(cityKeyForLocation('Taif'), 'mekkah');          // day-trip ikut Mekkah
  assert.equal(cityKeyForLocation('Bir Ali'), 'madinah');      // miqot ikut Madinah
  assert.equal(cityKeyForLocation('Istanbul'), 'turki');
  assert.equal(cityKeyForLocation('Cappadocia'), 'turki');
  assert.equal(cityKeyForLocation('Cairo - Alexandria'), 'mesir');
  assert.equal(cityKeyForLocation('Jeddah'), 'transit');
  assert.equal(cityKeyForLocation(''), null);
  assert.equal(cityKeyForLocation(null), null);
});

// ── classifyActivity ──
test('aturan posisional: aktivitas pertama hari pertama = kumpul (cacat #8)', () => {
  // Teks nyata JBU1587 yang TIDAK memuat kata "kumpul":
  assert.equal(
    classifyActivity('Tiba di gate Cafe Zukavia gate 5 Terminal 2F Bandara Soekarno Hatta',
      { dayIndex: 0, activityIndex: 0 }),
    'kumpul');
  // Posisi lain dengan teks sama TIDAK otomatis kumpul:
  assert.notEqual(
    classifyActivity('Tiba di gate Cafe Zukavia gate 5 Terminal 2F Bandara Soekarno Hatta',
      { dayIndex: 3, activityIndex: 0 }),
    'kumpul');
});

test('kata kunci kumpul tetap jalan di posisi mana pun', () => {
  assert.equal(classifyActivity('Berkumpul di Terminal 3', { dayIndex: 2, activityIndex: 1 }), 'kumpul');
});

test('takeoff / landing / transit dari teks nyata', () => {
  assert.equal(classifyActivity('Dengan pesawat Emirates Airlines EK 357 berangkat menuju Dubai'), 'takeoff');
  assert.equal(classifyActivity('Melanjutkan dengan EK 358 menuju Jakarta'), 'takeoff');
  assert.equal(classifyActivity('Tiba di bandara King Abdul Aziz Jeddah, menuju Medinah'), 'landing');
  assert.equal(classifyActivity('Tiba di Dubai, cek in hotel dan istirahat'), 'landing');
  assert.equal(classifyActivity('Tiba di bandara Dubai (transit)'), 'transit');
});

test('bukan highlight: tiba di hotel & menuju biasa', () => {
  assert.equal(classifyActivity('Tiba di hotel, cek in hotel dan istirahat'), 'regular');
  assert.equal(classifyActivity('Check out hotel menuju Bir Ali untuk Miqot'), 'regular');
  assert.equal(classifyActivity('Sarapan di hotel'), 'regular');
});

// ── activityIconName ──
test('ikon highlight & regular', () => {
  assert.equal(activityIconName('kumpul', 'apa pun'), 'users');
  assert.equal(activityIconName('takeoff', 'x'), 'plane-takeoff');
  assert.equal(activityIconName('regular', 'Sarapan di hotel'), 'utensils');
  assert.equal(activityIconName('regular', 'City tour Dubai photostop Burj Khalifah'), 'camera');
  assert.equal(activityIconName('regular', 'Ziarah Raudlah dan Makam Rasulullah'), 'landmark');
  assert.equal(activityIconName('regular', 'Menuju imigrasi'), 'badge-check');
  assert.equal(activityIconName('regular', 'Munajad di area'), 'circle-dot');
});

// ── computeNightSegments ──
test('JBU1587: Dubai 1, Madinah 3, Mekkah 5, transit ekor', () => {
  const days = [
    { location: 'Jakarta - Dubai' },       // malam 1 → dubai
    { location: 'Dubai – Jeddah - Medinah' }, // malam 2 → madinah (perjalanan berakhir Madinah)
    { location: 'Medinah' }, { location: 'Medinah' }, { location: 'Medinah' }, // 3,4,5
    { location: 'Medinah – Mekkah' },      // 6 → mekkah
    { location: 'Mekkah' }, { location: 'Mekkah' }, { location: 'Mekkah' }, { location: 'Mekkah' }, // 7-10
    { location: 'Mekkah - Jeddah' },       // 11 → transit (Jeddah)
    { location: 'Jeddah – Dubai – Jakarta' }, // hari terakhir: tanpa malam
  ];
  assert.deepEqual(computeNightSegments(days), [
    { key: 'dubai', nights: 1 },
    { key: 'madinah', nights: 4 },
    { key: 'mekkah', nights: 5 },
    { key: 'transit', nights: 1 },
  ]);
});

test('gagal identifikasi >30% → null (strip disembunyikan)', () => {
  assert.equal(computeNightSegments([
    { location: 'X' }, { location: 'Y' }, { location: 'Mekkah' }, { location: 'Z' },
  ]), null);
  assert.equal(computeNightSegments([]), null);
  assert.equal(computeNightSegments([{ location: 'Mekkah' }]), null); // 0 malam
});
```

> Catatan nilai test JBU1587: malam-2 jatuh ke **madinah** (aturan "kota terakhir"), sehingga
> Madinah 4 malam & muncul segmen transit 1 malam — beda dari mockup yang manual (3/5).
> Ini konsekuensi aturan deterministik dari spec; mockup yang menyimpang, bukan aturannya.

- [ ] **Step 2: Jalankan test — pastikan gagal** — `node --test tests/itinerary-view.test.js` → FAIL (module not found).

- [ ] **Step 3: Implementasi `lib/itinerary-view.js`:**

```js
// Logika murni tampilan web itinerary — dipakai FE (src/components/itinerary/) dan
// bisa dipakai server. Tanpa dependensi. Spec: docs/superpowers/specs/2026-07-30-*.md
// Kota → key. Urutan pola TIDAK penting (pencocokan pakai posisi kemunculan terakhir).
const CITY_PATTERNS = [
  { key: 'mekkah',  re: /mekkah|makkah|mecca|thaif|taif/gi },
  { key: 'madinah', re: /madinah|medinah|madina|medina|bir\s*ali/gi },
  { key: 'dubai',   re: /dubai/gi },
  { key: 'turki',   re: /istanbul|bursa|cappadocia|kapadokya|ankara|turki|turkey|türkiye/gi },
  { key: 'mesir',   re: /cairo|kairo|alexandria|iskandaria|mesir|egypt/gi },
  { key: 'transit', re: /jeddah|jedah|laut\s*merah|red\s*sea/gi },
  { key: 'home',    re: /jakarta|indonesia|soekarno|cgk|tanah\s*air/gi },
];

export function cityKeyForLocation(location) {
  if (!location || typeof location !== 'string') return null;
  let best = null;
  let bestIdx = -1;
  for (const { key, re } of CITY_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(location)) !== null) {
      if (m.index > bestIdx) { bestIdx = m.index; best = key; }
    }
  }
  return best;
}

function hasCityToken(text) {
  return CITY_PATTERNS.some(({ re }) => { re.lastIndex = 0; return re.test(text); });
}

export function classifyActivity(text, { dayIndex = 0, activityIndex = 0 } = {}) {
  const t = String(text || '').toLowerCase();
  // Posisional (cacat #8): titik kumpul paket nyata sering tanpa kata "kumpul".
  if (dayIndex === 0 && activityIndex === 0) return 'kumpul';
  if (/\b(berkumpul|kumpul)\b/.test(t)) return 'kumpul';
  if (/\btransit\b/.test(t)) return 'transit';
  // Landing: "tiba di hotel" bukan landing; "tiba di <kota>" iya.
  if (!/tiba di hotel/.test(t)) {
    if (/mendarat|tiba di (bandara|terminal)/.test(t)) return 'landing';
    if (/\btiba\b/.test(t) && hasCityToken(t)) return 'landing';
  }
  if (
    /berangkat\s+menuju|take\s*off|melanjutkan\s+dengan/.test(t) ||
    /dengan\s+(pesawat|saudia?|garuda|emirates|etihad|qatar|oman|turkish)/.test(t) ||
    /pesawat.*menuju/.test(t)
  ) return 'takeoff';
  return 'regular';
}

const HIGHLIGHT_ICONS = {
  kumpul: 'users',
  takeoff: 'plane-takeoff',
  landing: 'plane-landing',
  transit: 'plane-landing',
};

export function activityIconName(kind, text) {
  if (HIGHLIGHT_ICONS[kind]) return HIGHLIGHT_ICONS[kind];
  const t = String(text || '').toLowerCase();
  if (/makan|sarapan|nasi|resto/.test(t)) return 'utensils';
  if (/city\s*tour|photostop|foto\b|wisata/.test(t)) return 'camera';
  if (/ziarah|masjid|sholat|shalat|manasik|umrah|umroh|raudlah|percetakan/.test(t)) return 'landmark';
  if (/hotel|istirahat|koper|check\s*(in|out)|cek\s*(in|out)/.test(t)) return 'bed-double';
  if (/imigrasi|paspor|boarding/.test(t)) return 'badge-check';
  if (/pengarahan|pembagian/.test(t)) return 'megaphone';
  return 'circle-dot';
}

export function computeNightSegments(days) {
  if (!Array.isArray(days) || days.length < 2) return null;
  const nightDays = days.slice(0, -1); // hari terakhir tak bermalam
  const keys = nightDays.map(d => cityKeyForLocation(d?.location || ''));
  const unresolved = keys.filter(k => k === null).length;
  if (unresolved / keys.length > 0.3) return null;
  const segments = [];
  for (const key of keys) {
    if (key === null) continue; // toleransi kecil: lewati yang tak dikenal
    const last = segments[segments.length - 1];
    if (last && last.key === key) last.nights += 1;
    else segments.push({ key, nights: 1 });
  }
  if (!segments.length) return null;
  return segments;
}
```

- [ ] **Step 4: Jalankan test — pastikan lulus** — `node --test tests/itinerary-view.test.js` → semua PASS.

- [ ] **Step 5: Commit** — cek `git branch --show-current` = main, lalu:
```bash
git add lib/itinerary-view.js tests/itinerary-view.test.js
git commit -m "feat(itinerary): logika murni tampilan web — klasifikasi posisional, kota, malam"
```

---

### Task 2: Token Tailwind + komponen `src/components/itinerary/`

**Files:**
- Modify: `tailwind.config.js` (theme.extend.colors)
- Create: `src/components/itinerary/cityTheme.ts`
- Create: `src/components/itinerary/JourneyStrip.tsx`
- Create: `src/components/itinerary/DayRail.tsx`
- Create: `src/components/itinerary/FlightCard.tsx`
- Create: `src/components/itinerary/HotelCard.tsx`
- Create: `src/components/itinerary/AgentFooter.tsx`

**Interfaces:**
- Consumes: `lib/itinerary-view.js` (import path dari `src/components/itinerary/` = `../../../lib/itinerary-view.js` — 3 tingkat, konvensi sama dengan teras).
- Produces (dipakai Task 3 & 7):
  - `cityTheme.ts`: `CITY_HEX: Record<CityKey,string>`, `CITY_LABEL: Record<CityKey,string>`, `railColor(key): string` (hex+'38'), `type CityKey`.
  - `JourneyStrip({ days, routeText })` — hitung segmen sendiri via `computeNightSegments`; render null bila null.
  - `DayRail({ day, dayIndex, dateLabel })` — header hari + rail aktivitas satu hari.
  - `FlightCard({ paket })` — berangkat & pulang dari `paket.keberangkatan/kepulangan/maskapai`.
  - `HotelCard({ hotel })` — `hotel: PackageHotels` (Record<tier, HotelInfo>); >1 tier → tab tier kecil.
  - `AgentFooter({ agentName, agentPhone, agentPhoto, agentSlug, paketNama })` — kartu agent + tombol WA (`wa.me`).

- [ ] **Step 1: Token Tailwind** — di `tailwind.config.js` `theme.extend.colors`, setelah blok `gold`:

```js
        // Tampilan web itinerary — light-only (spec 2026-07-30, D9).
        // Kota: hanya via CITY_HEX di src/components/itinerary/cityTheme.ts (inline style).
        itin: {
          ink: '#1E1512', ink2: '#5A4F49', ink3: '#7D6E64',
          line: '#E9E1DD', canvas: '#FAF7F5',
        },
```

- [ ] **Step 2: `cityTheme.ts`:**

```ts
export type CityKey = 'mekkah' | 'madinah' | 'dubai' | 'turki' | 'mesir' | 'transit' | 'home';

// D9 (2026-07-30). Emas Dubai JANGAN dicerahkan (AA). Semua lolos ≥4.5:1 di atas putih.
export const CITY_HEX: Record<CityKey, string> = {
  mekkah: '#2A5C9A', madinah: '#1F5F4B', dubai: '#8A6D12', turki: '#8A0F0A',
  mesir: '#6B3FA0', transit: '#556072', home: '#3D4451',
};

export const CITY_LABEL: Record<CityKey, string> = {
  mekkah: 'Mekkah', madinah: 'Madinah', dubai: 'Dubai', turki: 'Turki',
  mesir: 'Mesir', transit: 'Transit', home: 'Indonesia',
};

export const DEFAULT_CITY: CityKey = 'transit';

/** Garis rail: warna kota pada alpha ~22% */
export function railColor(key: CityKey): string { return `${CITY_HEX[key]}38`; }
```

- [ ] **Step 3: `JourneyStrip.tsx`:**

```tsx
import { Plane } from 'lucide-react';
import { computeNightSegments } from '../../../lib/itinerary-view.js';
import { CITY_HEX, CITY_LABEL, type CityKey } from './cityTheme';

interface Props {
  days: Array<{ location?: string | null }>;
  routeText?: string | null; // "CGK → DXB → JED · pulang JED → DXB → CGK"
}

export default function JourneyStrip({ days, routeText }: Props) {
  const segments = computeNightSegments(days) as Array<{ key: CityKey; nights: number }> | null;
  if (!segments) return null; // hitungan tak masuk akal → lebih baik hilang daripada salah
  const totalNights = segments.reduce((n, s) => n + s.nights, 0);

  return (
    <div className="mx-4 rounded-2xl bg-itin-canvas p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-itin-ink3">Alur Perjalanan</span>
        <span className="font-mono text-[10px] font-medium text-itin-ink2">
          {totalNights} malam · {days.length} hari
        </span>
      </div>
      <div className="mt-2.5 flex items-center gap-1">
        {segments.map((s, i) => (
          <div key={i} className="h-2 rounded-full" style={{ backgroundColor: CITY_HEX[s.key], flexGrow: s.nights }} />
        ))}
      </div>
      <div className="mt-2.5 flex items-start justify-between gap-2">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5 min-w-0">
            <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ backgroundColor: CITY_HEX[s.key] }} />
            <span className="min-w-0">
              <span className="block truncate text-[11.5px] font-semibold text-itin-ink">{CITY_LABEL[s.key]}</span>
              <span className="block text-[10px] text-itin-ink3">{s.nights} malam</span>
            </span>
          </div>
        ))}
      </div>
      {routeText && (
        <div className="mt-2 flex items-center gap-1.5 pt-1">
          <Plane size={11} className="shrink-0 text-itin-ink3" />
          <span className="truncate font-mono text-[9.5px] text-itin-ink2">{routeText}</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: `DayRail.tsx`:**

```tsx
import {
  Users, Megaphone, BadgeCheck, PlaneTakeoff, PlaneLanding, BedDouble,
  Utensils, Camera, Landmark, CircleDot, type LucideIcon,
} from 'lucide-react';
import { classifyActivity, activityIconName, cityKeyForLocation } from '../../../lib/itinerary-view.js';
import { CITY_HEX, DEFAULT_CITY, railColor, type CityKey } from './cityTheme';

const ICONS: Record<string, LucideIcon> = {
  'users': Users, 'megaphone': Megaphone, 'badge-check': BadgeCheck,
  'plane-takeoff': PlaneTakeoff, 'plane-landing': PlaneLanding, 'bed-double': BedDouble,
  'utensils': Utensils, 'camera': Camera, 'landmark': Landmark, 'circle-dot': CircleDot,
};

const BADGE_TEXT: Record<string, string> = {
  kumpul: 'TITIK KUMPUL', takeoff: 'TAKE OFF', landing: 'LANDING', transit: 'TRANSIT',
};

export interface ItineraryDayData {
  dayNumber: string;
  title: string;
  location?: string | null;
  activities: Array<{ time: string; text: string } | string>;
}

interface Props { day: ItineraryDayData; dayIndex: number; dateLabel?: string | null; }

export default function DayRail({ day, dayIndex, dateLabel }: Props) {
  const cityKey = (cityKeyForLocation(day.location || '') || DEFAULT_CITY) as CityKey;
  const c = CITY_HEX[cityKey];
  const dayNum = day.dayNumber?.match(/\d[\d\-–]*/)?.[0] || String(dayIndex + 1);

  return (
    <section>
      {/* Header hari — full-bleed, sticky */}
      <div className="sticky top-0 z-10 flex items-center gap-2.5 border-y border-itin-line bg-white px-4 py-3">
        <span className="h-[26px] w-[3px] rounded-full" style={{ backgroundColor: c }} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9.5px] font-bold tracking-[0.04em]" style={{ color: c }}>
              HARI {dayNum}
            </span>
            <span className="truncate text-[13px] font-semibold text-itin-ink">{day.title}</span>
          </div>
          <div className="truncate text-[10.5px] text-itin-ink3">
            {[day.location, dateLabel].filter(Boolean).join('  ·  ')}
          </div>
        </div>
      </div>
      {/* Rail aktivitas — border-left, BUKAN dot absolut (spec D4) */}
      <div className="px-4 pb-1 pt-3.5">
        <div className="border-l-[1.5px] pl-4" style={{ borderColor: railColor(cityKey) }}>
          {day.activities.map((raw, i) => {
            const act = typeof raw === 'string' ? { time: '-', text: raw } : raw;
            const kind = classifyActivity(act.text, { dayIndex, activityIndex: i });
            const highlight = kind !== 'regular';
            const Icon = ICONS[activityIconName(kind, act.text)] || CircleDot;
            const showTime = act.time && act.time !== '-';
            return (
              <div key={i} className="pb-4 last:pb-3">
                <div className="flex items-center gap-2">
                  <Icon size={13} style={highlight ? { color: c } : undefined}
                    className={highlight ? undefined : 'text-itin-ink3'} />
                  {showTime && (
                    <span className="font-mono text-[11px] font-bold"
                      style={highlight ? { color: c } : undefined}
                      {...(highlight ? {} : { className: 'font-mono text-[11px] font-bold text-itin-ink3' })}>
                      {act.time}
                    </span>
                  )}
                  {highlight && (
                    <span className="rounded px-1.5 py-px text-[7.5px] font-bold uppercase tracking-[0.05em] text-white"
                      style={{ backgroundColor: c }}>
                      {BADGE_TEXT[kind]}
                    </span>
                  )}
                </div>
                <p className={`mt-1 text-[12.5px] leading-[1.45] ${highlight ? 'font-medium text-itin-ink' : 'text-itin-ink2'}`}>
                  {act.text}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
```

> Perhatian implementasi: JSX di atas untuk `span` waktu memakai spread props ganda yang canggung —
> saat menulis file sungguhan, tulis dua cabang eksplisit:
> `<span className="font-mono text-[11px] font-bold" style={{color:c}}>` untuk highlight dan
> `<span className="font-mono text-[11px] font-bold text-itin-ink3">` untuk regular.

- [ ] **Step 5: `FlightCard.tsx`:**

```tsx
import { Plane } from 'lucide-react';
import type { UmrohPackage } from '@/types';

function LegRow({ kick, tgl, jam, rute, kode }: { kick: string; tgl: string; jam: string; rute: string; kode: string }) {
  const stops = rute.split(/[\/,]| - |–|-/).map(s => s.trim()).filter(Boolean);
  const from = stops[0] || '—';
  const to = stops[stops.length - 1] || '—';
  const via = stops.length > 2 ? `via ${stops.slice(1, -1).join(', ')}` : null;
  const dateLabel = tgl
    ? new Date(tgl).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : '';
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-[0.07em] text-itin-ink3">{kick}</span>
        <span className="text-[10.5px] font-semibold text-itin-ink2">{dateLabel}</span>
      </div>
      <div className="mt-2 flex items-center gap-2.5">
        <div>
          <div className="font-mono text-[16px] font-bold leading-none text-itin-ink">{from}</div>
          <div className="mt-0.5 font-mono text-[10.5px] text-itin-ink3">{jam || '—'}</div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <span className="font-mono text-[9.5px] font-medium text-itin-ink2">{kode}</span>
          <div className="mt-1 flex w-full items-center gap-1.5">
            <span className="h-px flex-1 bg-itin-line" />
            <Plane size={11} className="shrink-0 text-itin-ink3" />
            <span className="h-px flex-1 bg-itin-line" />
          </div>
          {via && <span className="mt-1 truncate text-[9.5px] text-itin-ink3">{via}</span>}
        </div>
        <div className="text-right">
          <div className="font-mono text-[16px] font-bold leading-none text-itin-ink">{to}</div>
          <div className="mt-0.5 font-mono text-[10.5px] text-itin-ink3">&nbsp;</div>
        </div>
      </div>
    </div>
  );
}

export default function FlightCard({ paket }: { paket: UmrohPackage }) {
  if (!paket.keberangkatan?.rute && !paket.kepulangan?.rute) return null;
  return (
    <div className="overflow-hidden rounded-2xl border border-itin-line bg-white">
      <div className="flex items-center justify-between border-b border-itin-line px-3.5 py-2.5">
        <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-itin-ink">
          <Plane size={14} className="text-itin-ink2" /> Penerbangan
        </span>
        {paket.maskapai && (
          <span className="rounded-md bg-itin-canvas px-2 py-0.5 text-[9.5px] font-bold tracking-[0.03em] text-itin-ink2">
            {paket.maskapai}
          </span>
        )}
      </div>
      <div className="space-y-4 p-3.5">
        <LegRow kick="Berangkat" tgl={paket.keberangkatan?.tgl} jam={paket.keberangkatan?.jam}
          rute={paket.keberangkatan?.rute || ''} kode={paket.keberangkatan?.kodePenerbangan || ''} />
        <LegRow kick="Pulang" tgl={paket.kepulangan?.tgl} jam={paket.kepulangan?.jam}
          rute={paket.kepulangan?.rute || ''} kode={paket.kepulangan?.kodePenerbangan || ''} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: `HotelCard.tsx`** — tier tab bila >1 tier:

```tsx
import { useState } from 'react';
import { BedDouble } from 'lucide-react';
import { cityKeyForLocation } from '../../../lib/itinerary-view.js';
import { CITY_HEX, DEFAULT_CITY, type CityKey } from './cityTheme';

// hotel: Record<tier, Record<citySlot, hotelName>> — citySlot: madinah/mekkah/cairo/dubai/...
export default function HotelCard({ hotel }: { hotel: Record<string, Record<string, string>> }) {
  const tiers = Object.keys(hotel || {}).filter(t => hotel[t] && Object.keys(hotel[t]).length);
  const [active, setActive] = useState(0);
  if (!tiers.length) return null;
  const rows = Object.entries(hotel[tiers[Math.min(active, tiers.length - 1)]] || {})
    .filter(([, name]) => !!name);

  return (
    <div className="overflow-hidden rounded-2xl border border-itin-line bg-white">
      <div className="flex items-center justify-between border-b border-itin-line px-3.5 py-2.5">
        <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-itin-ink">
          <BedDouble size={14} className="text-itin-ink2" /> Hotel
        </span>
        {tiers.length === 1 ? (
          <span className="rounded-md bg-itin-canvas px-2 py-0.5 text-[9.5px] font-bold tracking-[0.03em] text-itin-ink2">
            PAKET {tiers[0].toUpperCase()}
          </span>
        ) : (
          <div className="flex gap-1">
            {tiers.map((t, i) => (
              <button key={t} type="button" onClick={() => setActive(i)}
                className={`rounded-md px-2 py-0.5 text-[9.5px] font-bold tracking-[0.03em] ${
                  i === active ? 'bg-itin-ink text-white' : 'bg-itin-canvas text-itin-ink2'}`}>
                {t.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="px-3.5 py-1">
        {rows.map(([slot, name], i) => {
          const key = (cityKeyForLocation(slot) || DEFAULT_CITY) as CityKey;
          return (
            <div key={slot} className={`flex items-center justify-between gap-2.5 py-2.5 ${
              i < rows.length - 1 ? 'border-b border-itin-line' : ''}`}>
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ backgroundColor: CITY_HEX[key] }} />
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold capitalize text-itin-ink">{slot}</span>
                  <span className="block truncate text-[10.5px] text-itin-ink3">{name}</span>
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: `AgentFooter.tsx`:**

```tsx
interface Props {
  agentName: string | null; agentPhone: string | null; agentPhoto: string | null;
  agentSlug: string | null; paketNama: string; onWaClick?: () => void;
}

export default function AgentFooter({ agentName, agentPhone, agentPhoto, agentSlug, paketNama, onWaClick }: Props) {
  if (!agentSlug || !agentName) return null;
  const openWa = () => {
    onWaClick?.();
    const msg = encodeURIComponent(`Assalamualaikum, saya mau tanya terkait paket ${paketNama}`);
    window.open(`https://wa.me/${agentPhone}?text=${msg}`, '_blank');
  };
  return (
    <div className="rounded-2xl bg-burgundy-50 p-3.5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-burgundy text-[15px] font-bold text-white">
          {agentPhoto
            ? <img src={agentPhoto} alt={agentName} className="h-full w-full object-cover"
                onError={e => { e.currentTarget.style.display = 'none'; }} />
            : agentName[0]?.toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold text-itin-ink">{agentName}</p>
          <p className="text-[10.5px] text-itin-ink2">Agen Umroh · Alhijaz Indowisata</p>
        </div>
      </div>
      {agentPhone && (
        <button type="button" onClick={openWa}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-burgundy py-2.5 text-[12.5px] font-bold text-white transition-transform active:scale-[0.98]">
          Chat WhatsApp
        </button>
      )}
      <p className="mt-2.5 text-center text-[9.5px] leading-[1.4] text-itin-ink3">
        Disusun dari itinerary resmi Alhijaz Indowisata · alhijaz.co/{agentSlug}
      </p>
    </div>
  );
}
```

- [ ] **Step 8: Verifikasi kompilasi** — `npm run build:spa` → sukses (komponen belum dipakai; cukup pastikan tak merusak build).

- [ ] **Step 9: Commit**
```bash
git add tailwind.config.js src/components/itinerary/
git commit -m "feat(itinerary): komponen rail waktu light-only + token itin"
```

---

### Task 3: Tulis ulang `WebItineraryView.tsx`

**Files:**
- Modify: `src/components/WebItineraryView.tsx` (ganti seluruh isi — komponen lama dead code dengan bug isDark, spec cacat #1–#7)

**Interfaces:**
- Produces: `default WebItineraryView({ content, loading, error, paket, agentSlug, agentName, agentPhone, agentPhoto, onRetryPdf })`
  - `content: { days: ItineraryDayData[] } | null`
  - `onRetryPdf?: () => void` — dipanggil tombol "Buka dokumen PDF" pada error state.
  - `export type { ItineraryContent }` dipertahankan (`{ days: ItineraryDayData[] }`).

- [ ] **Step 1: Tulis ulang file** — struktur:

```tsx
import { AlertCircle, FileText } from 'lucide-react';
import type { UmrohPackage } from '@/types';
import JourneyStrip from './itinerary/JourneyStrip';
import DayRail, { type ItineraryDayData } from './itinerary/DayRail';
import FlightCard from './itinerary/FlightCard';
import HotelCard from './itinerary/HotelCard';
import AgentFooter from './itinerary/AgentFooter';

export interface ItineraryContent { days: ItineraryDayData[] }

interface Props {
  content: ItineraryContent | null;
  loading: boolean;
  error: string | null;
  paket?: UmrohPackage | null;
  agentSlug?: string | null; agentName?: string | null;
  agentPhone?: string | null; agentPhoto?: string | null;
  onRetryPdf?: () => void;
}

function buildRouteText(paket?: UmrohPackage | null): string | null {
  const dep = paket?.keberangkatan?.rute?.replace(/\s*\/\s*|\s*-\s*/g, ' → ');
  const ret = paket?.kepulangan?.rute?.replace(/\s*\/\s*|\s*-\s*/g, ' → ');
  if (!dep && !ret) return null;
  return [dep, ret ? `pulang ${ret}` : null].filter(Boolean).join('  ·  ');
}

function dayDate(paket: UmrohPackage | null | undefined, dayIndex: number): string | null {
  const tgl = paket?.keberangkatan?.tgl;
  if (!tgl) return null;
  const d = new Date(tgl);
  d.setDate(d.getDate() + dayIndex);
  return d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function WebItineraryView({
  content, loading, error, paket, agentSlug, agentName, agentPhone, agentPhoto, onRetryPdf,
}: Props) {
  if (loading) {
    return (
      <div className="bg-white px-4 py-5" aria-busy>
        <div className="h-24 animate-pulse rounded-2xl bg-itin-canvas" />
        {[0, 1, 2].map(i => (
          <div key={i} className="mt-5 flex gap-3">
            <div className="h-3 w-3 animate-pulse rounded-full bg-itin-line" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/3 animate-pulse rounded-full bg-itin-line" />
              <div className="h-2.5 w-2/3 animate-pulse rounded-full bg-itin-canvas" />
            </div>
          </div>
        ))}
        <p className="mt-6 text-center text-[10px] text-itin-ink3">
          Membaca PDF & menyusun itinerary… bisa sampai 1 menit untuk paket baru.
        </p>
      </div>
    );
  }

  const days = content?.days;
  if (error || !days?.length) {
    return (
      <div className="flex flex-col items-center bg-white px-6 py-14 text-center">
        <AlertCircle size={22} className="text-itin-ink3" />
        <p className="mt-2 text-sm font-semibold text-itin-ink">Tampilan web belum tersedia</p>
        <p className="mt-1 max-w-[260px] text-xs leading-5 text-itin-ink3">
          {error || 'Itinerary belum bisa disusun otomatis.'} Dokumen PDF tetap bisa dibuka.
        </p>
        {onRetryPdf && (
          <button type="button" onClick={onRetryPdf}
            className="mt-4 flex items-center gap-2 rounded-xl border border-itin-line px-4 py-2 text-xs font-bold text-itin-ink2">
            <FileText size={14} /> Buka dokumen PDF
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white pb-4">
      <div className="pt-3.5"><JourneyStrip days={days} routeText={buildRouteText(paket)} /></div>
      <div className="mt-3.5">
        {days.map((day, i) => (
          <DayRail key={i} day={day} dayIndex={i} dateLabel={dayDate(paket, i)} />
        ))}
      </div>
      <div className="mt-4 space-y-3.5 px-4">
        {paket && <FlightCard paket={paket} />}
        {paket?.hotel && <HotelCard hotel={paket.hotel as any} />}
        <AgentFooter agentSlug={agentSlug ?? null} agentName={agentName ?? null}
          agentPhone={agentPhone ?? null} agentPhoto={agentPhoto ?? null}
          paketNama={paket?.nama || ''} />
      </div>
    </div>
  );
}
```

> `hotel as any`: `PackageHotels` bertipe `Record<tier, HotelInfo>`; `HotelInfo` punya slot kota
> string — cek bentuk aslinya di `src/types/umroh-package.ts` saat implementasi; kalau `HotelInfo`
> objek dengan properti (bukan Record), map dulu ke `Record<string,string>` per tier di sini,
> jangan di HotelCard.

- [ ] **Step 2: Build** — `npm run build:spa` → sukses.
- [ ] **Step 3: Commit** — `git add src/components/WebItineraryView.tsx && git commit -m "feat(itinerary): tulis ulang WebItineraryView — komposisi rail waktu"`

---

### Task 4: Tab di `ItineraryModal` + fetch + footer Link/Bagikan

**Files:**
- Modify: `src/components/ItineraryModal.tsx`

**Interfaces:**
- Consumes: `WebItineraryView` (Task 3), `trackEvent` dari `../utils/analytics`.
- Produces: prop baru `jadwalId?: string | null` (dipakai Task 5). `jadwalId` efektif = `paket?.jadwalId ?? jadwalId ?? null`.

- [ ] **Step 1: Destrukturkan semua prop** (baris 74): `{ isOpen, onClose, fileUrl, title, paket, agentSlug, agentName, agentPhone, agentPhoto, jadwalId }` + tambah `jadwalId?: string | null;` ke interface.

- [ ] **Step 2: State tab + fetch:**

```tsx
type ItinTab = 'pdf' | 'web';
const [tab, setTab] = useState<ItinTab>('pdf');
const effectiveJadwalId = paket?.jadwalId ?? jadwalId ?? null;
const [webContent, setWebContent] = useState<ItineraryContent | null>(null);
const [webLoading, setWebLoading] = useState(false);
const [webError, setWebError] = useState<string | null>(null);
const webFetchedRef = useRef(false);

useEffect(() => {
  if (isOpen) { setTab('pdf'); webFetchedRef.current = false; setWebContent(null); setWebError(null); }
}, [isOpen, fileUrl]);

const openWebTab = () => {
  setTab('web');
  trackEvent('action', 'view_itinerary_web', { paket: title });
  if (webFetchedRef.current) return;
  webFetchedRef.current = true;
  setWebLoading(true);
  const meta = JSON.stringify({
    nama_paket: paket?.nama || title,
    maskapai: paket?.maskapai || '',
    tgl_berangkat: paket?.keberangkatan?.tgl || '',
  });
  fetch(`/api/itinerary/${encodeURIComponent(effectiveJadwalId!)}?pdfUrl=${encodeURIComponent(originalUrl)}&meta=${encodeURIComponent(meta)}`)
    .then(r => r.json())
    .then(json => {
      if (json?.success && Array.isArray(json.data?.days) && json.data.days.length) setWebContent(json.data);
      else setWebError('Itinerary belum bisa disusun otomatis.');
    })
    .catch(() => setWebError('Gagal memuat. Coba lagi nanti.'))
    .finally(() => setWebLoading(false));
};
```

- [ ] **Step 3: Segmented tab di header** — di bawah baris judul (sebelum penutup div header), hanya bila `effectiveJadwalId`:

```tsx
{effectiveJadwalId && (
  <div className="mt-3 flex gap-1 rounded-xl bg-gray-100 p-[3px] dark:bg-slate-800">
    {([['pdf', 'Dokumen asli', FileText], ['web', 'Tampilan web', ListTree]] as const).map(([key, label, Icon]) => (
      <button key={key} type="button"
        onClick={() => (key === 'web' ? openWebTab() : setTab('pdf'))}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-[9px] px-2 py-2 text-[12.5px] font-semibold transition-colors ${
          tab === key
            ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-600 dark:text-white'
            : 'text-gray-400 dark:text-slate-400'}`}>
        <Icon size={14} /> {label}
      </button>
    ))}
  </div>
)}
```
(Import `ListTree` dari lucide-react. Chrome modal boleh dark — konten web view yang light-only.)

- [ ] **Step 4: Render konten per tab** — bungkus viewer PDF yang ada dengan `{tab === 'pdf' && (…viewer lama…)}`; tambahkan:

```tsx
{tab === 'web' && (
  <div className="flex-1 min-h-0 overflow-y-auto bg-white">
    <WebItineraryView content={webContent} loading={webLoading} error={webError}
      paket={paket ?? null} agentSlug={agentSlug ?? null} agentName={agentName ?? null}
      agentPhone={agentPhone ?? null} agentPhoto={agentPhoto ?? null}
      onRetryPdf={() => setTab('pdf')} />
  </div>
)}
```
PENTING: kontrol zoom & listener pinch hanya relevan untuk tab pdf — pastikan blok kontrol zoom ikut berada di dalam cabang `tab === 'pdf'`.
Import: `const WebItineraryView = lazy(() => import('./WebItineraryView'));` + bungkus `<Suspense fallback={null}>`.

- [ ] **Step 5: Footer Link + Bagikan:**

```tsx
const shareUrl = agentSlug && effectiveJadwalId
  ? `https://alhijaz.co/${agentSlug}/${effectiveJadwalId}/itinerary` : null;
const [linkCopied, setLinkCopied] = useState(false);
const copyShareLink = async () => {
  if (!shareUrl) return;
  trackEvent('action', 'copy_itinerary_link', { paket: title });
  try { await navigator.clipboard.writeText(shareUrl); } catch { window.prompt('Salin link:', shareUrl); return; }
  setLinkCopied(true);
  setTimeout(() => setLinkCopied(false), 2000);
};
```
Footer jadi baris flex: tombol `Link` (border, ikon `Link`/`Check` saat copied, `disabled={!shareUrl}` disembunyikan bila `!shareUrl`) + tombol share lama (`flex-1`).

- [ ] **Step 6: Build + verifikasi manual singkat** — `npm run build:spa` sukses.
- [ ] **Step 7: Commit** — `git add src/components/ItineraryModal.tsx && git commit -m "feat(itinerary): tab tampilan web + link share di ItineraryModal"`

---

### Task 5: Plumbing `jadwalId` — server attachment + AskAIModal + UpcomingSchedule

**Files:**
- Modify: `server.js` (~1855–1870, fungsi attachment AskAI)
- Modify: `src/components/AskAIModal.tsx` (interface :37, call site :1066)
- Modify: `src/components/UpcomingSchedule.tsx` (state activeItinerary, call site :574)

**Interfaces:**
- Produces: attachment AskAI kini `{ type, url, title, jadwal_id }`.

- [ ] **Step 1: server.js** — di kedua return attachment (brosur & itinerary), tambah `jadwal_id: pkg.jadwal_id || null`.
- [ ] **Step 2: AskAIModal** — interface attachment (:37) tambah `jadwal_id?: string | null;`; call site ItineraryModal tambah `jadwalId={activeAttachment.jadwal_id ?? null}`. Validasi attachment di :624 tak perlu berubah (field ekstra ikut tersimpan).
- [ ] **Step 3: UpcomingSchedule** — state `activeItinerary` tambah field `jadwalId: string | null`; `setActiveItinerary({ url, title: paket.name, jadwalId: detail.jadwal_id })`; call site ItineraryModal (:574) tambah `jadwalId={activeItinerary.jadwalId}`.
- [ ] **Step 4: Verifikasi** — `node --check server.js` && `npm run build:spa`.
- [ ] **Step 5: Commit** — `git add server.js src/components/AskAIModal.tsx src/components/UpcomingSchedule.tsx && git commit -m "feat(itinerary): teruskan jadwal_id ke ItineraryModal dari AskAI & UpcomingSchedule"`

---

### Task 6: Registrasi analytics di server.js

**Files:**
- Modify: `server.js` (:17569 VALID_PUBLIC_EVENTS, :17585 FEATURE_LABELS, :17611 ACTION_LABELS)

- [ ] **Step 1:** Ikuti gaya label yang ada (baca blok sekitar dulu). Tambah:
  - `VALID_PUBLIC_EVENTS`: `'open_itinerary_share'`, `'wa_click_itinerary'`
  - `FEATURE_LABELS`: `open_itinerary_share: '🗺️ Buka Itinerary Share'`
  - `ACTION_LABELS`: `view_itinerary_web: '🗺️ Lihat Itinerary Web'`, `copy_itinerary_link: '🔗 Salin Link Itinerary'`, `wa_click_itinerary: '💬 WA dari Itinerary Share'`
- [ ] **Step 2:** `node --check server.js` → OK.
- [ ] **Step 3:** Commit — `git add server.js && git commit -m "feat(analytics): daftarkan 4 event itinerary web/share"`

---

### Task 7: Halaman share `/:slug/:packageId/itinerary` (FE)

**Files:**
- Create: `src/components/itinerary/SharePage.tsx`
- Modify: `src/main.tsx` (~:410–453)

**Interfaces:**
- Consumes: `getPackageById` (`src/services/data-service.ts:477`), `AGENTS_DATA` + `loadAgentsFromSupabase` (`src/data/agents.ts`), komponen Task 2/3, `trackPublicEvent`.
- Produces: `default ItinerarySharePage({ slug, packageId })`.

- [ ] **Step 1: `SharePage.tsx`:**

```tsx
import { useEffect, useState } from 'react';
import { CalendarRange, FileText, Moon, Plane } from 'lucide-react';
import type { UmrohPackage } from '@/types';
import { trackPublicEvent } from '@/utils/analytics';
import { getPackageById } from '@/services/data-service';
import { AGENTS_DATA, loadAgentsFromSupabase, type AgentData } from '@/data/agents';
import WebItineraryView, { type ItineraryContent } from '../WebItineraryView';

export default function ItinerarySharePage({ slug, packageId }: { slug: string; packageId: string }) {
  const [content, setContent] = useState<ItineraryContent | null>(null);
  const [paket, setPaket] = useState<UmrohPackage | null>(null);
  const [agent, setAgent] = useState<AgentData | null>(AGENTS_DATA[slug] || null);
  const [state, setState] = useState<'loading' | 'ready' | 'notfound'>('loading');

  useEffect(() => {
    trackPublicEvent(slug, 'open_itinerary_share', { paket: packageId });
    loadAgentsFromSupabase().then(map => setAgent(map[slug] || null)).catch(() => {});
    Promise.allSettled([
      fetch(`/api/itinerary/${encodeURIComponent(packageId)}`).then(r => r.json()),
      getPackageById(packageId),
    ]).then(([itin, pkg]) => {
      const days = itin.status === 'fulfilled' && itin.value?.success ? itin.value.data : null;
      const p = pkg.status === 'fulfilled' ? pkg.value : null;
      if (p) setPaket(p);
      if (days?.days?.length) { setContent(days); setState('ready'); }
      else setState('notfound'); // share tanpa itinerary tersusun = 404 lembut (spec State)
    });
  }, [slug, packageId]);

  const waHref = agent?.phone
    ? `https://wa.me/${agent.phone}?text=${encodeURIComponent(`Assalamualaikum, saya mau tanya terkait paket ${paket?.nama || packageId}`)}`
    : null;
  const openWa = () => {
    trackPublicEvent(slug, 'wa_click_itinerary', { paket: packageId });
    if (waHref) window.open(waHref, '_blank');
  };

  if (state === 'loading') {
    return <div className="min-h-screen bg-white"><div className="mx-auto max-w-md px-4 pt-10">
      <div className="h-36 animate-pulse rounded-2xl bg-itin-canvas" /></div></div>;
  }
  if (state === 'notfound') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-itin-canvas px-4">
        <div className="w-full max-w-sm rounded-2xl border border-itin-line bg-white p-6 text-center">
          <p className="text-sm font-bold text-itin-ink">Itinerary belum tersedia</p>
          <p className="mt-1 text-xs leading-5 text-itin-ink3">Silakan buka halaman paket untuk info lengkap.</p>
          <a href={`/${slug}/${packageId}`}
            className="mt-4 inline-block rounded-xl bg-gradient-burgundy px-4 py-2.5 text-xs font-bold text-white">
            Buka halaman paket
          </a>
        </div>
      </div>
    );
  }

  const pdfUrl = paket?.itineraryUrl || null;
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-md pb-24">
        {/* Hero burgundy */}
        <header className="bg-gradient-burgundy px-5 pb-5 pt-6 text-white">
          <p className="text-[11px] font-bold tracking-[0.22em]">
            ALHIJAZ <span className="font-normal text-white/70">INDOWISATA</span>
          </p>
          <h1 className="mt-2 font-display text-[24px] leading-[1.18]">{paket?.nama || packageId}</h1>
          <p className="mt-1.5 text-[9px] font-bold tracking-[0.14em] text-white/70">ITINERARY PERJALANAN</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {paket?.keberangkatan?.tgl && (
              <span className="flex items-center gap-1.5 rounded-lg bg-white/15 px-2 py-1 text-[10px] font-semibold">
                <CalendarRange size={11} className="text-white/80" />
                {new Date(paket.keberangkatan.tgl).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
            {paket?.maskapai && (
              <span className="flex items-center gap-1.5 rounded-lg bg-white/15 px-2 py-1 text-[10px] font-semibold">
                <Plane size={11} className="text-white/80" /> {paket.maskapai}
              </span>
            )}
            {content && content.days.length > 1 && (
              <span className="flex items-center gap-1.5 rounded-lg bg-white/15 px-2 py-1 text-[10px] font-semibold">
                <Moon size={11} className="text-white/80" /> {content.days.length} hari
              </span>
            )}
          </div>
        </header>

        <WebItineraryView content={content} loading={false} error={null} paket={paket}
          agentSlug={slug} agentName={agent?.name ?? null} agentPhone={agent?.phone ?? null}
          agentPhoto={agent?.photo ?? null} />

        {pdfUrl && (
          <div className="px-4">
            <a href={pdfUrl} target="_blank" rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl border border-itin-line py-2.5 text-[12.5px] font-semibold text-itin-ink2">
              <FileText size={15} /> Lihat dokumen PDF asli
            </a>
            <p className="mt-3 text-center text-[9.5px] leading-[1.45] text-itin-ink3">
              Jadwal dapat berubah menyesuaikan kondisi di lapangan.
            </p>
          </div>
        )}
      </div>

      {/* CTA sticky */}
      {agent?.phone && (
        <div className="fixed inset-x-0 bottom-0 border-t border-itin-line bg-white px-4 pb-4 pt-3">
          <div className="mx-auto max-w-md">
            <button type="button" onClick={openWa}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-burgundy py-3.5 text-[13.5px] font-bold text-white active:scale-[0.98]">
              Tanya {agent.name.split(' ')[0]} via WhatsApp
            </button>
            <p className="mt-1.5 text-center font-mono text-[9.5px] text-itin-ink3">alhijaz.co/{slug}</p>
          </div>
        </div>
      )}
    </div>
  );
}
```
Catatan: `font-display` (Calistoga) terdefinisi global di tailwind config; kalau font tidak termuat di luar portal, fallback serif Georgia tetap layak.

- [ ] **Step 2: Rute di `main.tsx`** — tambah lazy import di dekat lazy import lain:
```tsx
const ItinerarySharePage = lazy(() => import('./components/itinerary/SharePage'));
```
Di IIFE `page` (sebelum `return <App singlePackageId=…>`), setelah `isSinglePackageWithAgent` terdefinisi:
```tsx
if (isSinglePackageWithAgent && segments[2]?.toLowerCase() === 'itinerary') {
  return <ItinerarySharePage slug={firstSlug} packageId={segments[1]} />
}
```
- [ ] **Step 3: Build** — `npm run build:spa`.
- [ ] **Step 4: Commit** — `git add src/components/itinerary/SharePage.tsx src/main.tsx && git commit -m "feat(itinerary): halaman share publik /:slug/:packageId/itinerary"`

---

### Task 8: Rute OG di server.js (deviasi dari spec: bukan Cloudflare function)

Spec menyebut perluasan `functions/[slug]/[packageId].ts`. **Bukti di kode**: OG produksi disuntik oleh Express (`server.js` — flight share :21657, bio :21166 via `resolveSlug` + `getIndexHtml`), dan function CF 2-segmen tak akan match path 3-segmen. Maka rute OG baru masuk server.js; function CF tak disentuh.

**Files:**
- Modify: `server.js` — tambah route SETELAH blok bio route (`app.get('/:slug/bio'…)` :21166 berakhir ~:21190), SEBELUM static/catch-all.

- [ ] **Step 1: Route:**

```js
// Itinerary share: /:slug/:packageId/itinerary — SSR OG meta (SPA renders body)
app.get('/:slug/:packageId/itinerary', async (req, res, next) => {
  const slug = String(req.params.slug || '').toLowerCase();
  const packageId = String(req.params.packageId || '').toUpperCase();
  try {
    const resolved = await resolveSlug(slug);
    if (!resolved) return next();
    if (resolved.redirect) return res.redirect(301, `/${resolved.redirect}/${packageId}/itinerary`);
    const agent = resolved.agent;

    let nama = packageId;
    try {
      const { data } = await supabase
        .from('umroh_schedules')
        .select('jadwal_nama, maskapai, berangkat_tgl')
        .eq('jadwal_id', packageId)
        .limit(1);
      if (data?.[0]?.jadwal_nama) nama = data[0].jadwal_nama;
    } catch { /* fallback: pakai packageId */ }

    const origin = `${req.protocol}://${req.get('host')}`;
    const pageUrl = `${origin}/${slug}/${packageId}/itinerary`;
    const title = `Itinerary ${nama} | ${agent.name} — Alhijaz Indowisata`;
    const description = `Rencana perjalanan hari per hari paket ${nama} bersama ${agent.name}, Alhijaz Indowisata.`;

    let html = getIndexHtml();
    html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtmlAttr(title)}</title>`);
    html = html.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="description" content="${escapeHtmlAttr(description)}" />`);
    html = html.replace(/<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:title" content="${escapeHtmlAttr(title)}" />`);
    html = html.replace(/<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:description" content="${escapeHtmlAttr(description)}" />`);
    html = html.replace(/<meta\s+property="og:site_name"/i,
      `<meta property="og:url" content="${escapeHtmlAttr(pageUrl)}" />\n    <meta property="og:site_name"`);

    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' }).send(html);
  } catch (err) {
    console.error('[itinerary-share] SSR error:', slug, packageId, err.message);
    next();
  }
});
```
(Verifikasi saat implementasi: `escapeHtmlAttr` :21061 & `resolveSlug` sudah terdefinisi SEBELUM titik sisip — keduanya di atas :21166, aman.)

- [ ] **Step 2:** `node --check server.js` → OK.
- [ ] **Step 3:** Commit — `git add server.js && git commit -m "feat(itinerary): OG meta share itinerary di server (pola bio/flight-share)"`

---

### Task 9: Verifikasi akhir + checklist manual

- [ ] **Step 1:** `node --test tests/itinerary-view.test.js` → PASS semua.
- [ ] **Step 2:** `node --check server.js` → OK.
- [ ] **Step 3:** `npm run build` (spa + functions) → sukses.
- [ ] **Step 4:** Smoke dev bila memungkinkan: buka preview, PackageCard → Itinerary → tab "Tampilan web" pada paket ber-cache (JBU1587).
- [ ] **Step 5:** Tulis checklist manual untuk user (e2e milik user):
  - Modal: tab web di PackageCard (paket lama ber-cache & paket baru on-demand), AskAI attachment, UpcomingSchedule.
  - Salin Link → buka `/:slug/:jadwalId/itinerary` di tab incognito.
  - Preview WA: kirim link ke chat sendiri, cek OG title.
  - Analytics: cek 4 event muncul di halaman Analytics (bukan slug mentah).
  - **Deploy server.js diperlukan** (attachment jadwal_id, analytics, OG route — server tak hot-reload).
- [ ] **Step 6:** Commit terakhir bila ada sisa perubahan.

## Self-Review Notes

- Spec coverage: cacat #1–#8 → Task 1–3; D1–D9 → konstanta/komponen; tab & fallback → Task 4; celah jadwalId → Task 5; analytics 4 event → Task 4/6/7; share page + state → Task 7; OG → Task 8 (deviasi didokumentasikan); "dua bagian rawan" spec → `computeNightSegments` (null→sembunyikan) & `HotelCard` tier tab / share pakai tier pertama (param `?tier=` TIDAK diimplementasikan — YAGNI, tier pertama dulu; dicatat di checklist).
- Type consistency: `ItineraryContent`/`ItineraryDayData` satu sumber (DayRail → re-export WebItineraryView); `jadwalId` prop konsisten; `jadwal_id` snake_case hanya di payload server.

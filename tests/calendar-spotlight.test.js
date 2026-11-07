import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Sorotan bergilir di kartu kalender Dashboard. Semua keputusannya (urutan
// tanggal, isi gelembung, mesin status, posisi, gerbang harian) murni di
// src/lib/calendarSpotlight.ts supaya bisa diuji tanpa DOM.
// Spec: docs/superpowers/specs/2026-11-07-kalender-sorotan-bergilir-design.md

const root = new URL('..', import.meta.url).pathname;

async function bundle(entry, name) {
  const dir = await mkdtemp(join(tmpdir(), `${name}-`));
  const outfile = join(dir, `${name}.mjs`);
  await build({
    entryPoints: [join(root, entry)],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    alias: { '@': join(root, 'src') },
    logLevel: 'silent',
  });
  return import(pathToFileURL(outfile).href);
}

const S = await bundle('src/lib/calendarSpotlight.ts', 'calendar-spotlight');

const TODAY = '2026-11-07';

function det(overrides = {}) {
  return {
    jadwal_id: null, group_number: null, pesawat: null, jam: null, paket: null,
    pax: 0, pax_jamaah: null, pax_terisi: null, staff: null, mutawif: null, tour_leader: null,
    jam_kumpul: null, titik_kumpul: null,
    departure_airport_code: null, departure_airport_city: null, departure_terminal: null,
    arrival_airport_code: null, arrival_airport_city: null, arrival_terminal: null,
    itinerary_url: null,
    ...overrides,
  };
}

const TYPE = { B: 'keberangkatan', P: 'kepulangan', M: 'manasik' };

// Bulan contoh di mockup: November 2026, hari ini Sabtu 7 Nov.
function novemberEvents() {
  const plan = { 3: 'P', 5: 'B', 7: 'PM', 9: 'B', 12: 'P', 14: 'BM', 16: 'B', 18: 'P', 21: 'BM', 23: 'P', 25: 'B', 28: 'BP', 30: 'P' };
  const events = [];
  for (const [day, types] of Object.entries(plan)) {
    for (const t of types) {
      events.push({
        date: `2026-11-${String(day).padStart(2, '0')}`,
        type: TYPE[t],
        details: [det({ group_number: String(day), pax: 40 })],
      });
    }
  }
  // Placeholder kosong dari sync legacy: tidak bertitik, tidak boleh disinggahi.
  events.push({ date: '2026-11-20', type: 'keberangkatan', details: [det()] });
  return events;
}

function mineFrom({ berangkat = {}, manasik = {} } = {}) {
  const toMap = obj => new Map(Object.entries(obj).map(([d, count]) => [`2026-11-${String(d).padStart(2, '0')}`, { count, jadwalIds: [] }]));
  return { berangkat: toMap(berangkat), manasik: toMap(manasik) };
}

function memoryStorage() {
  const data = new Map();
  return { getItem: k => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
}

const throwingStorage = {
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('SecurityError'); },
};

// ── Urutan tanggal ──

test('buildSpotlightDates: hari ini, lalu tanggal jamaah Anda, lalu sisanya; tanggal lewat & kosong dilewati', () => {
  const dates = S.buildSpotlightDates({
    events: novemberEvents(), year: 2026, month: 11, todayKey: TODAY,
    mine: mineFrom({ berangkat: { 9: 3, 14: 4, 21: 5 }, manasik: { 7: 4, 14: 5 } }),
  });
  assert.deepEqual(dates, [
    '2026-11-07', '2026-11-09', '2026-11-14', '2026-11-21',
    '2026-11-12', '2026-11-16', '2026-11-18', '2026-11-23', '2026-11-25', '2026-11-28', '2026-11-30',
  ]);
});

test('buildSpotlightDates: jamaah Anda di tanggal tanpa event kalender tidak menambah tanggal', () => {
  const dates = S.buildSpotlightDates({
    events: novemberEvents(), year: 2026, month: 11, todayKey: TODAY,
    mine: mineFrom({ berangkat: { 19: 2 } }),
  });
  assert.equal(dates.includes('2026-11-19'), false);
  assert.equal(dates.length, 11);
});

test('buildSpotlightDates: kosong bila bulan tampil bukan bulan berjalan WIB', () => {
  const args = { events: novemberEvents(), mine: mineFrom() };
  assert.deepEqual(S.buildSpotlightDates({ ...args, year: 2026, month: 12, todayKey: TODAY }), []);
  assert.deepEqual(S.buildSpotlightDates({ ...args, year: 2026, month: 11, todayKey: '2026-12-01' }), []);
});

test('buildSpotlightDates: kosong bila semua jadwal bulan ini sudah lewat', () => {
  const dates = S.buildSpotlightDates({ events: novemberEvents(), mine: mineFrom(), year: 2026, month: 11, todayKey: '2026-11-30' });
  assert.deepEqual(dates, ['2026-11-30']);
  assert.deepEqual(S.buildSpotlightDates({ events: novemberEvents().filter(e => e.date < '2026-11-30'), mine: mineFrom(), year: 2026, month: 11, todayKey: '2026-11-30' }), []);
});

test('buildSpotlightMine: kelompokkan jumlah jamaah agent per tanggal berangkat & manasik', () => {
  const mine = S.buildSpotlightMine(
    [
      { key: 'a', jadwal_id: 'J12', tgl_berangkat: '2026-11-09', count: 2 },
      { key: 'b', jadwal_id: 'J13', tgl_berangkat: '2026-11-09T00:00:00', count: 1 },
      { key: 'c', jadwal_id: null, tgl_berangkat: 'bukan tanggal', count: 9 },
    ],
    [{ key: 's', manasik_tgl: '2026-11-07', count: 4, groups: [{ jadwal_id: 'J14' }] }],
  );
  assert.deepEqual(mine.berangkat.get('2026-11-09'), { count: 3, jadwalIds: ['J12', 'J13'] });
  assert.equal(mine.berangkat.size, 1);
  assert.deepEqual(mine.manasik.get('2026-11-07'), { count: 4, jadwalIds: ['J14'] });
});

// ── Gerbang harian ──

test('gerbang harian: sekali per hari WIB per perangkat', () => {
  const storage = memoryStorage();
  assert.equal(S.SPOTLIGHT_GATE_KEY, 'calendar-spotlight-v1');
  assert.equal(S.canAutoStartSpotlight('2026-11-07', storage), true);
  S.markSpotlightShown('2026-11-07', storage);
  assert.equal(storage.getItem('calendar-spotlight-v1'), '2026-11-07');
  assert.equal(S.canAutoStartSpotlight('2026-11-07', storage), false);
  assert.equal(S.canAutoStartSpotlight('2026-11-08', storage), true);
});

test('gerbang harian: storage yang melempar jatuh ke cadangan memori, bukan tampil terus', () => {
  assert.equal(S.canAutoStartSpotlight('2031-01-01', throwingStorage), true);
  S.markSpotlightShown('2031-01-01', throwingStorage);
  assert.equal(S.canAutoStartSpotlight('2031-01-01', throwingStorage), false);
  assert.equal(S.canAutoStartSpotlight('2031-01-02', throwingStorage), true);
});

// ── Mesin status ──

const ELEVEN = Array.from({ length: 11 }, (_, i) => `2026-11-${String(i + 7).padStart(2, '0')}`);

test('reducer: start memulai mode auto; gerak dikurangi langsung manual; daftar kosong = null', () => {
  assert.equal(S.SPOTLIGHT_AUTO_STOPS, 6);
  assert.equal(S.SPOTLIGHT_DWELL_MS, 3000);
  const auto = S.spotlightReducer(null, { type: 'start', dates: ELEVEN, trigger: 'auto', reducedMotion: false });
  assert.deepEqual(auto, { mode: 'auto', dates: ELEVEN, index: 0, shown: 1, trigger: 'auto' });
  const reduced = S.spotlightReducer(null, { type: 'start', dates: ELEVEN, trigger: 'replay', reducedMotion: true });
  assert.equal(reduced.mode, 'manual');
  assert.equal(reduced.trigger, 'replay');
  assert.equal(S.spotlightReducer(null, { type: 'start', dates: [], trigger: 'auto', reducedMotion: false }), null);
});

test('reducer: advance berhenti setelah 6 singgah', () => {
  let s = S.spotlightReducer(null, { type: 'start', dates: ELEVEN, trigger: 'auto', reducedMotion: false });
  for (let i = 0; i < 5; i++) s = S.spotlightReducer(s, { type: 'advance' });
  assert.equal(s.index, 5);
  assert.equal(s.shown, 6);
  assert.equal(S.spotlightReducer(s, { type: 'advance' }), null);
});

test('reducer: advance berhenti di akhir daftar yang lebih pendek dari 6', () => {
  let s = S.spotlightReducer(null, { type: 'start', dates: ELEVEN.slice(0, 2), trigger: 'auto', reducedMotion: false });
  s = S.spotlightReducer(s, { type: 'advance' });
  assert.equal(s.index, 1);
  assert.equal(S.spotlightReducer(s, { type: 'advance' }), null);
});

test('reducer: ‹ › memindah manual, mematikan mode auto, dan tidak melewati ujung', () => {
  const start = S.spotlightReducer(null, { type: 'start', dates: ELEVEN, trigger: 'auto', reducedMotion: false });
  assert.equal(S.spotlightReducer(start, { type: 'go', delta: -1 }), start);
  const next = S.spotlightReducer(start, { type: 'go', delta: 1 });
  assert.equal(next.mode, 'manual');
  assert.equal(next.index, 1);
  assert.equal(S.spotlightReducer(next, { type: 'advance' }), next);
  const last = { ...next, index: 10 };
  assert.equal(S.spotlightReducer(last, { type: 'go', delta: 1 }), last);
});

test('reducer: hover desktop menggantikan putaran; hoverEnd hanya menutup mode hover', () => {
  const start = S.spotlightReducer(null, { type: 'start', dates: ELEVEN, trigger: 'auto', reducedMotion: false });
  const hover = S.spotlightReducer(start, { type: 'hover', date: '2026-11-03' });
  assert.deepEqual(hover, { mode: 'hover', dates: ['2026-11-03'], index: 0, shown: 0, trigger: 'hover' });
  assert.equal(S.spotlightReducer(hover, { type: 'hoverEnd' }), null);
  assert.equal(S.spotlightReducer(start, { type: 'hoverEnd' }), start);
  assert.equal(S.spotlightReducer(start, { type: 'dismiss' }), null);
});

// ── Posisi ──

const BASE_POS = { wrapperWidth: 358, wrapperHeight: 600, viewportTop: 0, viewportBottom: 800, bubbleHeight: 180 };

test('posisi: kolom kanan rata kanan di dalam kartu, ekor tetap menunjuk tanggal', () => {
  const pos = S.computeBubblePosition({ ...BASE_POS, cell: { left: 298, right: 346, top: 74, bottom: 120 } });
  assert.deepEqual(pos, { left: 106, top: 126, width: 244, arrowLeft: 216, placement: 'below' });
});

test('posisi: kolom kiri menempel margin 8 px, ekor dijepit minimal 16 px', () => {
  const pos = S.computeBubblePosition({ ...BASE_POS, cell: { left: 12, right: 60, top: 74, bottom: 120 } });
  assert.equal(pos.left, 8);
  assert.equal(pos.arrowLeft, 28);
});

test('posisi: ruang terlihat di bawah sempit → naik ke atas tanggal', () => {
  const pos = S.computeBubblePosition({ ...BASE_POS, viewportBottom: 300, cell: { left: 298, right: 346, top: 220, bottom: 266 } });
  assert.equal(pos.placement, 'above');
  assert.equal(pos.top, 220 + 2 - 6 - 180);
});

test('posisi: kartu sempit menyusutkan lebar gelembung', () => {
  const pos = S.computeBubblePosition({ ...BASE_POS, wrapperWidth: 240, cell: { left: 100, right: 130, top: 74, bottom: 120 } });
  assert.equal(pos.width, 224);
  assert.equal(pos.left, 8);
});

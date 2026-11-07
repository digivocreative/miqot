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

function memoryStorage() {
  const data = new Map();
  return { getItem: k => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
}

const throwingStorage = {
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('SecurityError'); },
};

// ── Tanggal yang disorot ──
// Revisi user 2026-11-07: tidak bergilir. Satu gelembung saja, di hari ini bila
// ada agenda; bila tidak, di tanggal berjadwal terdekat berikutnya.

test('pickSpotlightDate: hari ini bila ada agenda', () => {
  assert.equal(S.pickSpotlightDate({ events: novemberEvents(), year: 2026, month: 11, todayKey: TODAY }), '2026-11-07');
});

test('pickSpotlightDate: hari ini kosong → tanggal berjadwal terdekat berikutnya', () => {
  assert.equal(S.pickSpotlightDate({ events: novemberEvents(), year: 2026, month: 11, todayKey: '2026-11-08' }), '2026-11-09');
});

test('pickSpotlightDate: placeholder kosong dari sync legacy dilewati', () => {
  assert.equal(S.pickSpotlightDate({ events: novemberEvents(), year: 2026, month: 11, todayKey: '2026-11-19' }), '2026-11-21');
});

test('pickSpotlightDate: null bila bulan tampil bukan bulan berjalan atau agenda bulan ini habis', () => {
  const events = novemberEvents();
  assert.equal(S.pickSpotlightDate({ events, year: 2026, month: 12, todayKey: TODAY }), null);
  assert.equal(S.pickSpotlightDate({ events, year: 2026, month: 11, todayKey: '2026-12-01' }), null);
  assert.equal(S.pickSpotlightDate({ events: events.filter(e => e.date < '2026-11-30'), year: 2026, month: 11, todayKey: '2026-11-30' }), null);
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

// ── Isi gelembung ──

const NO_MINE = { berangkat: new Map(), manasik: new Map() };
const ev = (date, type, details) => ({ date, type, details });

function nineNov() {
  return [ev('2026-11-09', 'keberangkatan', [
    det({ pesawat: 'SAUDIA ~ SV 817', jam: '06:45', pax: 300, pax_terisi: 138, tour_leader: '• Hasan Basri', group_number: '11', jadwal_id: 'J11' }),
    det({ pesawat: 'GARUDA INDONESIA ~ GA 980', jam: '10:20', pax: 92, tour_leader: '• Ust. Ridwan Hakim', group_number: '12', jadwal_id: 'J12' }),
    det({ pesawat: 'LION AIR ~ JT 112', jam: '22:10', pax_terisi: 182, tour_leader: 'Dedi Kurnia', group_number: '13' }),
  ])];
}

test('isi: berangkat beberapa kloter + jamaah Anda (TL kloter jamaah Anda didahulukan)', () => {
  const mine = { berangkat: new Map([['2026-11-09', { count: 3, jadwalIds: ['J12'] }]]), manasik: new Map() };
  const c = S.buildSpotlightContent({ date: '2026-11-09', events: nineNov(), todayKey: TODAY, mine });
  assert.equal(c.date, '2026-11-09');
  assert.equal(c.day, 9);
  assert.equal(c.dayLabel, 'SEN, 9 NOV');
  assert.deepEqual(c.badge, { text: 'H-2', tone: 'keberangkatan' });
  assert.deepEqual(c.sections, [{
    type: 'keberangkatan',
    title: '3 kloter berangkat',
    lines: [
      { icon: 'takeoff', text: 'Saudia · Garuda Indonesia +1' },
      { icon: 'clock', text: 'Take off 06:45–22:10 · 412 pax' },
      { icon: 'tl', text: 'TL Ust. Ridwan Hakim +2' },
    ],
  }]);
  assert.deepEqual(c.mine, [{ type: 'keberangkatan', text: '3 jamaah Anda berangkat · Kloter 12' }]);
});

test('isi: satu kloter berangkat menulis nomor penerbangan lengkap', () => {
  const events = [ev('2026-11-09', 'keberangkatan', [nineNov()[0].details[0]])];
  const c = S.buildSpotlightContent({ date: '2026-11-09', events, todayKey: TODAY, mine: NO_MINE });
  assert.deepEqual(c.sections[0].lines, [
    { icon: 'takeoff', text: 'Saudia SV 817' },
    { icon: 'clock', text: 'Take off 06:45 · 138 pax' },
    { icon: 'tl', text: 'TL Hasan Basri' },
  ]);
  assert.deepEqual(c.mine, []);
});

test('isi: hari ini campuran pulang + manasik, baris tanpa ikon, jamaah Anda manasik', () => {
  const events = [
    ev('2026-11-07', 'manasik', [det({ jam: '08:00', paket: '14/11/2026UMROH PLUS TURKI', tour_leader: 'Ust. Ahmad Fauzi' })]),
    ev('2026-11-07', 'kepulangan', [det({ pesawat: 'SAUDIA ~ SV 816', jam: '14.30', arrival_terminal: '3', staff: 'Joko Santoso', tour_leader: 'Hendra Wijaya', pax: 120 })]),
  ];
  const mine = { berangkat: new Map(), manasik: new Map([['2026-11-07', { count: 4, jadwalIds: [] }]]) };
  const c = S.buildSpotlightContent({ date: '2026-11-07', events, todayKey: TODAY, mine });
  assert.equal(c.dayLabel, 'SAB, 7 NOV');
  assert.deepEqual(c.badge, { text: 'HARI INI', tone: 'today' });
  assert.deepEqual(c.sections, [
    { type: 'kepulangan', title: '1 kloter pulang tiba', lines: [
      { icon: null, text: 'SV 816 · tiba 14:30 · T3' },
      { icon: null, text: 'TL Hendra Wijaya' },
    ] },
    { type: 'manasik', title: 'Manasik 08:00', lines: [
      { icon: null, text: 'Untuk keberangkatan 14 Nov' },
      { icon: null, text: 'TL Ust. Ahmad Fauzi' },
    ] },
  ]);
  assert.deepEqual(c.mine, [{ type: 'manasik', text: '4 jamaah Anda ikut manasik' }]);
});

test('isi: pulang tunggal dengan TL dan staff penjemput', () => {
  const events = [ev('2026-11-12', 'kepulangan', [det({ pesawat: 'SAUDIA ~ SV 826', jam: '16:20', arrival_terminal: 'T3', staff: '• Joko Santoso', tour_leader: 'Siti Rahmawati', pax: 110 })])];
  const c = S.buildSpotlightContent({ date: '2026-11-12', events, todayKey: TODAY, mine: NO_MINE });
  assert.deepEqual(c.badge, { text: 'H-5', tone: 'kepulangan' });
  assert.deepEqual(c.sections[0], { type: 'kepulangan', title: '1 kloter pulang tiba', lines: [
    { icon: 'landing', text: 'Saudia SV 826 · tiba 16:20 · T3' },
    { icon: 'tl', text: 'TL Siti Rahmawati' },
    { icon: 'staff', text: 'Dijemput staff Joko Santoso' },
  ] });
});

test('isi: berangkat campuran ≤2 kloter ditulis per penerbangan', () => {
  const events = [
    ev('2026-11-14', 'keberangkatan', nineNov()[0].details.slice(0, 2)),
    ev('2026-11-14', 'manasik', [det({ jam: '08:00', paket: '21/11/2026UMROH REGULER' })]),
  ];
  const mine = {
    berangkat: new Map([['2026-11-14', { count: 4, jadwalIds: ['J11'] }]]),
    manasik: new Map([['2026-11-14', { count: 5, jadwalIds: [] }]]),
  };
  const c = S.buildSpotlightContent({ date: '2026-11-14', events, todayKey: TODAY, mine });
  assert.deepEqual(c.sections[0].lines, [
    { icon: null, text: 'SV 817 06:45 · GA 980 10:20 · 230 pax' },
    { icon: null, text: 'TL Hasan Basri +1' },
  ]);
  assert.deepEqual(c.mine, [
    { type: 'keberangkatan', text: '4 jamaah Anda berangkat · Kloter 11' },
    { type: 'manasik', text: '5 jamaah Anda ikut manasik' },
  ]);
});

test('isi: jamaah Anda manasik tidak ditulis bila tanggal itu tak punya event manasik', () => {
  const mine = { berangkat: new Map(), manasik: new Map([['2026-11-09', { count: 5, jadwalIds: [] }]]) };
  const c = S.buildSpotlightContent({ date: '2026-11-09', events: nineNov(), todayKey: TODAY, mine });
  assert.deepEqual(c.mine, []);
});

test('isi: data legacy bolong tidak memunculkan baris kosong atau undefined', () => {
  const events = [ev('2026-11-16', 'keberangkatan', [det({ group_number: '16' })])];
  const c = S.buildSpotlightContent({ date: '2026-11-16', events, todayKey: TODAY, mine: NO_MINE });
  assert.deepEqual(c.sections, [{ type: 'keberangkatan', title: '1 kloter berangkat', lines: [] }]);
  assert.doesNotMatch(JSON.stringify(c), /undefined|null[^,}]|TL "/);
});

test('isi: tanggal tanpa detail tampil → null', () => {
  const events = [ev('2026-11-20', 'keberangkatan', [det()])];
  assert.equal(S.buildSpotlightContent({ date: '2026-11-20', events, todayKey: TODAY, mine: NO_MINE }), null);
});

test('isi: lencana BESOK, dan tanggal lewat tanpa lencana', () => {
  const events = [
    ev('2026-11-08', 'kepulangan', [det({ group_number: '8' })]),
    ev('2026-11-03', 'kepulangan', [det({ group_number: '3' })]),
  ];
  assert.deepEqual(S.buildSpotlightContent({ date: '2026-11-08', events, todayKey: TODAY, mine: NO_MINE }).badge, { text: 'BESOK', tone: 'kepulangan' });
  assert.equal(S.buildSpotlightContent({ date: '2026-11-03', events, todayKey: TODAY, mine: NO_MINE }).badge, null);
});

test('isi: manasik untuk beberapa tanggal keberangkatan', () => {
  const pk = (p, jam) => det({ paket: p, jam });
  const two = [ev('2026-11-21', 'manasik', [pk('14/11/2026A', '08:30'), pk('21/11/2026B', '08:00')])];
  const c2 = S.buildSpotlightContent({ date: '2026-11-21', events: two, todayKey: TODAY, mine: NO_MINE });
  assert.equal(c2.sections[0].title, 'Manasik 08:00');
  assert.deepEqual(c2.sections[0].lines[0], { icon: 'manasik', text: 'Untuk keberangkatan 14 & 21 Nov' });
  const cross = [ev('2026-11-21', 'manasik', [pk('28/11/2026A'), pk('05/12/2026B')])];
  assert.equal(S.buildSpotlightContent({ date: '2026-11-21', events: cross, todayKey: TODAY, mine: NO_MINE }).sections[0].lines[0].text, 'Untuk keberangkatan 28 Nov & 5 Des');
  const three = [ev('2026-11-21', 'manasik', [pk('14/11/2026A'), pk('21/11/2026B'), pk('28/11/2026C')])];
  const c3 = S.buildSpotlightContent({ date: '2026-11-21', events: three, todayKey: TODAY, mine: NO_MINE });
  assert.equal(c3.sections[0].title, 'Manasik');
  assert.equal(c3.sections[0].lines[0].text, 'Untuk keberangkatan 14 & 21 Nov +1');
});

// ── Tanpa lompatan tata letak ──
// Tombol "Sorot lagi" muncul/hilang bersamaan dengan gelembung. Kalau ia ikut
// mengalir di baris legenda, tingginya (±18 px) menambah tinggi baris 29 px →
// seluruh kartu & widget di bawahnya melompat 5 px tiap gelembung buka/tutup
// (terukur sebagai layout-shift 2026-11-07). Ia wajib melayang (absolute).

test('tombol Sorot lagi melayang di baris legenda, tidak mengubah tinggi kartu', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(join(root, 'src/components/UpcomingSchedule.tsx'), 'utf8');
  const chip = src.match(/\{canReplaySpotlight && \([\s\S]*?Sorot lagi[\s\S]*?\)\}/)?.[0] || '';
  assert.ok(chip, 'blok tombol Sorot lagi tidak ditemukan');
  assert.match(chip, /position: 'absolute'/);
  assert.doesNotMatch(chip, /ml-auto/);
});

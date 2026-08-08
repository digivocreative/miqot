import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSync } from 'esbuild';

const rootPath = new URL('..', import.meta.url).pathname;

function read(path) {
  return readFileSync(join(rootPath, path), 'utf8');
}

// --- Bundel lib murni beranda ke ESM agar bisa diuji perilaku (bukan cocok-teks) ---
const outDir = realpathSync(mkdtempSync(join(tmpdir(), 'portal-beranda-')));
process.on('exit', () => rmSync(outDir, { recursive: true, force: true }));

function bundle(entry, name) {
  const outfile = join(outDir, name);
  buildSync({
    entryPoints: [join(rootPath, entry)],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  });
  return outfile;
}

const { deriveActions, MAX_ACTIONS } = await import(bundle('src/components/portal-jamaah/lib/portalActions.ts', 'portalActions.mjs'));
const { deriveTripPhase } = await import(bundle('src/components/portal-jamaah/utils/tripPhase.ts', 'tripPhase.mjs'));
const { countCompletedDocs } = await import(bundle('src/components/portal-jamaah/lib/dokumenChecklist.ts', 'dokumenChecklist.mjs'));

function isoDaysFromNow(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

const AGENT = { slug: 'nikita', name: 'Nikita', phone: '0812345678', photo: null, website: null };

function makeJamaah(over = {}) {
  return {
    id: 1,
    nama: 'Budi Santoso',
    jk: 'L',
    wa: null,
    bayar: 10_000_000,
    sisa: 0,
    bayar_pct: 100,
    no_paspor: 'C1234567',
    paspor_expired: null,
    dokumen: { ktp: true, vaksin: true, foto_46: true, buku_nikah: true },
    perlengkapan: { koper_besar: { status: 'diambil' } },
    is_initiator: true,
    ...over,
  };
}

function makeData(over = {}) {
  return {
    booking: {
      id_umroh: 'UMR001',
      paket: 'Paket Test',
      tgl_berangkat: isoDaysFromNow(90),
      tgl_pulang: isoDaysFromNow(102),
      hari_ke_berangkat: 90,
      jadwal: null,
      ...(over.booking || {}),
    },
    jamaah: over.jamaah || [makeJamaah()],
    agent: 'agent' in over ? over.agent : AGENT,
    schedule: over.schedule ?? null,
  };
}

// ---------- deriveTripPhase ----------

test('tripPhase: hari positif = pra', () => {
  const info = deriveTripPhase({ hari_ke_berangkat: 10, tgl_berangkat: isoDaysFromNow(10), tgl_pulang: isoDaysFromNow(22) });
  assert.equal(info.phase, 'pra');
  assert.equal(info.daysToBerangkat, 10);
  assert.equal(info.tripDayNumber, null);
});

test('tripPhase: sudah berangkat & pulang masih depan = perjalanan hari ke-N', () => {
  const info = deriveTripPhase({ hari_ke_berangkat: -2, tgl_berangkat: isoDaysFromNow(-2), tgl_pulang: isoDaysFromNow(8) });
  assert.equal(info.phase, 'perjalanan');
  assert.equal(info.tripDayNumber, 3);
});

test('tripPhase: pulang sudah lewat = pasca', () => {
  const info = deriveTripPhase({ hari_ke_berangkat: -20, tgl_berangkat: isoDaysFromNow(-20), tgl_pulang: isoDaysFromNow(-8) });
  assert.equal(info.phase, 'pasca');
  assert.equal(info.tripDayNumber, null);
});

test('tripPhase: tgl_pulang tak diketahui — dekat berangkat = perjalanan, jauh = pasca', () => {
  assert.equal(deriveTripPhase({ hari_ke_berangkat: -3, tgl_berangkat: isoDaysFromNow(-3), tgl_pulang: null }).phase, 'perjalanan');
  assert.equal(deriveTripPhase({ hari_ke_berangkat: -60, tgl_berangkat: isoDaysFromNow(-60), tgl_pulang: null }).phase, 'pasca');
});

test('tripPhase: hari_ke_berangkat null TANPA tanggal = pra (bukan hari-H)', () => {
  const info = deriveTripPhase({ hari_ke_berangkat: null, tgl_berangkat: null, tgl_pulang: null });
  assert.equal(info.phase, 'pra');
  assert.equal(info.daysToBerangkat, null);
});

// ---------- deriveActions ----------

test('actions: tanpa urgent & tanpa persiapan = kosong', () => {
  assert.deepEqual(deriveActions(makeData(), null), []);
});

test('actions: pembayaran urgent tampil merah menuju halaman pembayaran', () => {
  const data = makeData({
    booking: { hari_ke_berangkat: 10 },
    jamaah: [makeJamaah({ sisa: 5_000_000 })],
  });
  const actions = deriveActions(data, null);
  assert.equal(actions[0].id, 'payment-overdue');
  assert.equal(actions[0].tone, 'red');
  assert.deepEqual(actions[0].target, { type: 'route', route: 'pembayaran' });
});

const EMPTY_PROGRESS = { overall_pct: 0, tahapan_pct: 0, spiritual_pct: 0, dokumen_pct: 0, perlengkapan_pct: 0 };

test('actions: task persiapan sekategori dengan urgent tidak diduplikasi; perlengkapan diarahkan ke WA', () => {
  const data = makeData({
    booking: { hari_ke_berangkat: 5 },
    jamaah: [makeJamaah({ sisa: 5_000_000 })],
  });
  const persiapan = {
    tahapan: [
      { id: 'pelunasan', title: 'Pelunasan sisa pembayaran', description: '', phase: 'sekarang', checked: false },
      { id: 'packing_koper', title: 'Packing koper', description: '', phase: 'h7', checked: false },
      { id: 'tidur_cukup', title: 'Tidur cukup', description: '', phase: 'h1', checked: false },
    ],
    spiritual: [],
    perlengkapan_per_jamaah: {},
    progress: EMPTY_PROGRESS,
  };
  const actions = deriveActions(data, persiapan);
  // pelunasan gugur (kategori pembayaran sudah urgent); tidur_cukup belum masuk jendela h1.
  assert.deepEqual(actions.map((a) => a.id), ['payment-overdue', 'packing_koper']);
  assert.equal(actions[1].target.type, 'wa');
  assert.match(actions[1].target.message, /UMR001/);
});

test('actions: jauh dari keberangkatan (H-90), task persiapan disembunyikan — beranda tenang', () => {
  const data = makeData({ booking: { hari_ke_berangkat: 90 } });
  const persiapan = {
    tahapan: [
      { id: 'dp_dibayar', title: 'DP keluarga dibayar', description: '', phase: 'sekarang', checked: false },
      { id: 'manasik_hadir', title: 'Hadir Manasik Bersama', description: '', phase: 'h30', checked: false },
      { id: 'fisik_sehat', title: 'Persiapan fisik & kesehatan', description: '', checked: false },
    ],
    spiritual: [],
    perlengkapan_per_jamaah: {},
    progress: EMPTY_PROGRESS,
  };
  assert.deepEqual(deriveActions(data, persiapan), []);
});

test('actions: tanpa nomor WA agent, item perlengkapan jadi kartu info (none), bukan tombol mati', () => {
  const data = makeData({ agent: null, booking: { hari_ke_berangkat: 5 }, jamaah: [makeJamaah({ sisa: 1 })] });
  const persiapan = {
    tahapan: [{ id: 'packing_koper', title: 'Packing koper', description: '', phase: 'h7', checked: false }],
    spiritual: [],
    perlengkapan_per_jamaah: {},
    progress: EMPTY_PROGRESS,
  };
  const packing = deriveActions(data, persiapan).find((a) => a.id === 'packing_koper');
  assert.equal(packing.target.type, 'none');
});

test('actions: manasik dekat menuju halaman Itinerary (rumah barunya) — tidak pernah ke beranda', () => {
  const data = makeData({
    booking: { hari_ke_berangkat: 5 },
    schedule: { manasik_tgl: isoDaysFromNow(3), manasik_jam: '09:00' },
  });
  const actions = deriveActions(data, null);
  const manasik = actions.find((a) => a.id === 'manasik-soon');
  assert.ok(manasik, 'alert manasik harus tampil');
  assert.deepEqual(manasik.target, { type: 'route', route: 'itinerary' });
  for (const action of actions) {
    assert.notDeepEqual(action.target, { type: 'route', route: 'beranda' }, `${action.id} tidak boleh menuju beranda`);
  }
});

test('actions: total dibatasi MAX_ACTIONS dengan urgent didahulukan', () => {
  const data = makeData({
    booking: { hari_ke_berangkat: 5 },
    jamaah: [makeJamaah({ sisa: 5_000_000, no_paspor: null, dokumen: {}, perlengkapan: { koper_besar: { status: 'tersedia' } } })],
    schedule: { manasik_tgl: isoDaysFromNow(3), manasik_jam: null },
  });
  const actions = deriveActions(data, null);
  assert.equal(actions.length, MAX_ACTIONS);
  assert.ok(actions.every((a) => a.urgent));
  assert.deepEqual(actions.map((a) => a.id), ['payment-overdue', 'doc-incomplete', 'equipment-untaken']);
});

// ---------- countCompletedDocs ----------

test('dokumen: status per-dokumen independen — belum_siap satu dokumen tidak menolkan yang lain', () => {
  const jamaah = makeJamaah({ no_paspor: 'C1', dokumen: { ktp: 'belum_siap', vaksin: true } });
  assert.deepEqual(countCompletedDocs(jamaah), { completed: 2, total: 5 });
});

// ---------- Pin komposisi sumber (regresi arsitektur) ----------

test('BerandaPage memakai ActionListWidget + fase perjalanan, tanpa widget/rumus/roster lama', () => {
  const src = read('src/components/portal-jamaah/pages/BerandaPage.tsx');
  assert.match(src, /ActionListWidget/);
  assert.match(src, /deriveTripPhase/);
  assert.match(src, /PrayerTimesCard/);
  assert.match(src, /<PrayerTimesCard[^>]*secondary/);
  assert.doesNotMatch(src, /SmartAlertsStrip|TaskListWidget/);
  assert.doesNotMatch(src, /computeJamaahPreparation|includesReadyDocument/);
  // Feedback 2026-08-08: seksi Anggota Booking dihapus dari beranda.
  assert.doesNotMatch(src, /RosterItem|Anggota Booking/);
});

test('ActionListWidget: WA deep-link + tracking + hilang total saat tidak ada aksi', () => {
  const src = read('src/components/portal-jamaah/components/ActionListWidget.tsx');
  assert.match(src, /Yang Perlu Anda Lakukan/);
  assert.match(src, /wa\.me/);
  assert.match(src, /trackPublicEvent\(slug, 'wa_click_portal'/);
  assert.match(src, /if \(!actions\.length\) return null/);
  // Feedback 2026-08-08: tanpa kartu perayaan "Semua tugas tuntas".
  assert.doesNotMatch(src, /Semua tugas tuntas/);
});

test('DokumenPage memakai checklist bersama (satu sumber kebenaran)', () => {
  const src = read('src/components/portal-jamaah/pages/DokumenPage.tsx');
  assert.match(src, /from '\.\.\/lib\/dokumenChecklist'/);
  assert.doesNotMatch(src, /const DOCS: DocSpec\[\]/);
});

test('ItineraryPage: model Jadwal + rumah manasik; FAQ tidak lagi menyebut menu Manasik', () => {
  const itinerary = read('src/components/portal-jamaah/pages/ItineraryPage.tsx');
  const faq = read('src/components/portal-jamaah/lib/faq.ts');

  // Pakai komponen Jadwal apa adanya, bukan salinan miskin milik portal.
  assert.match(itinerary, /import WebItineraryView.*'\.\.\/\.\.\/WebItineraryView'/);
  assert.match(itinerary, /<WebItineraryView/);
  assert.match(itinerary, /getPackageById/);
  assert.match(itinerary, /yearCode/, 'year_code booking dikirim, jangan andalkan default data-service');
  // schedule.itinerary dari /me = itineraries.content, sumber yang sama dengan Jadwal.
  assert.match(itinerary, /asItineraryContent\(schedule\?\.itinerary\)/);
  assert.match(itinerary, /onRetryPdf/, 'jamaah tetap punya jalan keluar ke PDF');

  assert.match(itinerary, /Manasik Bersama/);
  assert.match(itinerary, /manasik_tgl/);
  assert.doesNotMatch(faq, /menu Manasik/);
});

test('route itinerary tersinkron di enum, router, menu, dashboard, dan whitelist analytics', () => {
  const hook = read('src/components/portal-jamaah/hooks/usePortalRoute.ts');
  const router = read('src/components/portal-jamaah/PortalJamaahRouter.tsx');
  const menu = read('src/components/portal-jamaah/lib/portalMenu.ts');
  const dashboard = read('src/components/portal-jamaah/pages/PortalDashboard.tsx');
  const server = read('server.js');

  for (const [name, src] of [['hook', hook], ['router', router], ['menu', menu], ['dashboard', dashboard]]) {
    assert.match(src, /'itinerary'/, `${name} harus mengenal route itinerary`);
    assert.doesNotMatch(src, /'perjalanan'/, `${name} masih menyisakan route perjalanan`);
  }
  assert.match(menu, /label: 'Itinerary'/);
  assert.match(dashboard, /itinerary: 'open_portal_itinerary'/);
  assert.match(dashboard, /route === 'itinerary' && <ItineraryPage/);
  // Event publik yang tak masuk whitelist di-drop diam-diam (400).
  assert.match(server, /'open_portal_itinerary'/);
  assert.match(server, /open_portal_itinerary: 'Portal: Itinerary'/);
});

test('HeroCountdown sadar fase perjalanan', () => {
  const src = read('src/components/portal-jamaah/components/HeroCountdown.tsx');
  assert.match(src, /trip\.phase === 'perjalanan'/);
  assert.match(src, /trip\.phase === 'pasca'/);
  assert.match(src, /Di Tanah Suci/);
});

// Feedback 2026-08-08: bentuk 6 kartu DIPERTAHANKAN, yang dibereskan hanya
// sumber ketidakrapiannya — tinggi kartu, border ganda, dan bayangan bertumpuk.
test('PortalMenuCard: 6 kartu tetap, tapi rapi — sama tinggi, border tunggal, satu bayangan', () => {
  const grid = read('src/components/portal-jamaah/components/PortalMenuGrid.tsx');
  const cell = read('src/components/portal-jamaah/components/PortalMenuCard.tsx');
  const tile = read('src/components/portal-jamaah/ui/IconTile.tsx');

  assert.match(grid, /grid-cols-3/);
  assert.match(grid, /items-stretch/);
  assert.match(cell, /<Card/, 'tiap menu tetap kartu sendiri');

  // 1. Tinggi seragam → garis bawah sejajar dalam satu baris grid.
  assert.match(cell, /h-full w-full/, 'tombol mengisi tinggi baris');
  assert.match(cell, /'relative flex h-full/, 'Card mengisi tinggi tombol');

  // 2. Premium mengganti warna border, tidak menumpuk ring emas di atas border.
  assert.match(cell, /premium: 'border-gold\/45'/);
  assert.doesNotMatch(cell, /ring-1 ring-gold/);

  // 3. Satu sumber bayangan per kartu (halo IconTile dimatikan lewat `flat`).
  assert.match(cell, /\bflat\b/);
  assert.match(tile, /flat\?: boolean/);
  assert.match(tile, /flat \? '' : TINT_SHADOWS\[tint\]/);
  assert.doesNotMatch(cell, /blur-2xl/, 'glow yang terpotong overflow-hidden dicabut');

  // Identitas visual dipertahankan: gradien burgundy + emas khusus Al-Quran.
  assert.match(cell, /brand: 'brand'/);
  assert.match(cell, /premium: 'gold'/);
});

// Feedback 2026-08-08: kartu Waktu Solat selalu terbuka, tanpa state collapsed.
test('PrayerTimesCard selalu terbuka + target sentuh tab 44px', () => {
  const src = read('src/components/portal-jamaah/components/PrayerTimesCard.tsx');
  assert.match(src, /secondary\?: boolean/);
  assert.doesNotMatch(src, /expanded|ChevronDown/);
  assert.match(src, /secondary && !primary\.data && primary\.status === 'error'/);
  assert.match(src, /min-h-11/);
  assert.doesNotMatch(src, /min-h-9/);
});

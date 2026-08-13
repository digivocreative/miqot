import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Tombol "Unduh PDF" di ItineraryModal melayani DUA berkas berbeda tergantung
// tab aktif: PDF "Rencana Perjalanan" yang dirakit di klien (versi kita) dan
// dokumen itinerary asli dari kantor. Sebelum ini hanya yang pertama ber-event,
// jadi di Analytics unduhan versi kantor tak terlihat sama sekali dan angka
// "unduh itinerary" tak bisa dipakai menilai versi mana yang dikirim ke jamaah.
// Source guard, sepola tests/filter-header-tipe-paket.test.js.

const root = new URL('..', import.meta.url).pathname;
const read = rel => readFileSync(join(root, rel), 'utf8');

const modal = read('src/components/ItineraryModal.tsx');
const server = read('server.js');
const analyticsPage = read('src/components/AnalyticsPage.tsx');
const strip = read('src/components/itinerary/JourneyStrip.tsx');
const webView = read('src/components/WebItineraryView.tsx');
const sharePage = read('src/components/itinerary/SharePage.tsx');
const portalPage = read('src/components/portal-jamaah/pages/ItineraryPage.tsx');

const OWN = 'itinerary_own_pdf_download';
const OFFICE = 'itinerary_office_pdf_download';
const SHARE = 'itinerary_pdf_download_share';
const PORTAL = 'itinerary_pdf_download_portal';

const handler = name => modal.match(new RegExp(`const ${name} = async \\(\\) => \\{[\\s\\S]*?\\n  \\};`))?.[0] ?? '';

test('tiap handler unduhan menembakkan event-nya sendiri, tidak saling pinjam', () => {
  const own = handler('handleOwnPdf');
  const office = handler('handleShareItinerary');
  assert.notEqual(own, '', 'handleOwnPdf tidak ditemukan — perbarui regex tes ini bersama kodenya');
  assert.notEqual(office, '', 'handleShareItinerary tidak ditemukan');

  assert.match(own, new RegExp(`trackEvent\\('action', '${OWN}'`));
  assert.ok(!own.includes(OFFICE), 'handleOwnPdf tidak boleh menembakkan event versi kantor');

  assert.match(office, new RegExp(`trackEvent\\('action', '${OFFICE}'`));
  assert.ok(!office.includes(OWN), 'handleShareItinerary tidak boleh menembakkan event versi kita');
});

test('kedua event punya label sendiri yang saling membedakan', () => {
  const block = server.match(/const ACTION_LABELS = \{[\s\S]*?\n\};/)?.[0] ?? '';
  assert.notEqual(block, '', 'ACTION_LABELS tidak ditemukan di server.js');

  const labelOf = name => block.match(new RegExp(`${name}: '([^']+)'`))?.[1] ?? '';
  const own = labelOf(OWN);
  const office = labelOf(OFFICE);
  assert.notEqual(own, '', `${OWN} tanpa label → tampil sebagai slug mentah di Analytics`);
  assert.notEqual(office, '', `${OFFICE} tanpa label → tampil sebagai slug mentah di Analytics`);
  assert.notEqual(own, office, 'label kedua event unduhan harus berbeda');

  // `download_itinerary` menyala saat modal DIBUKA, bukan saat berkas terunduh.
  // Labelnya tidak boleh berbunyi "unduh/download" — di daftar aksi ia berdiri
  // persis di sebelah dua event unduhan yang asli.
  const open = labelOf('download_itinerary');
  assert.notEqual(open, '', 'download_itinerary kehilangan label');
  assert.doesNotMatch(open, /unduh|download/i);
});

test('ikon Analytics dibedakan juga, bukan cuma teks label', () => {
  const icons = analyticsPage.match(/const ACTION_ICONS: Record<string, string> = \{[\s\S]*?\n\};/)?.[0] ?? '';
  assert.notEqual(icons, '', 'ACTION_ICONS tidak ditemukan');
  const iconOf = name => icons.match(new RegExp(`${name}: '([^']+)'`))?.[1] ?? '';
  const seen = new Set();
  for (const name of [OWN, OFFICE, SHARE, PORTAL]) {
    const icon = iconOf(name);
    assert.notEqual(icon, '', `${name} jatuh ke ikon default`);
    assert.ok(!seen.has(icon), `ikon ${icon} dipakai dua event unduhan`);
    seen.add(icon);
  }
});

// ── Permukaan jamaah: tombol "Itinerary PDF" di JourneyStrip ──

test('JourneyStrip menembakkan lewat callback pemanggil, saat klik', () => {
  const handler = strip.match(/const startDownload = \(e: React\.MouseEvent\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  assert.notEqual(handler, '', 'startDownload tidak ditemukan');
  // Sesudah guard (klik kedua saat proses berjalan tidak boleh dihitung dua kali)
  // tapi SEBELUM kerja async: jalur desktop memakai location.assign yang
  // meninggalkan halaman, event yang dikirim belakangan bisa hilang.
  const guard = handler.indexOf('if (downloading || !pdfUrl) return;');
  const fire = handler.indexOf('onPdfDownload?.()');
  const async = handler.indexOf('const run = async');
  assert.ok(guard !== -1 && fire !== -1 && async !== -1, 'guard/callback/run tidak lengkap');
  assert.ok(guard < fire && fire < async, 'onPdfDownload harus sesudah guard dan sebelum kerja async');
  // Komponennya dipakai tiga permukaan dengan sesi berbeda — nama event tidak
  // boleh dipatri di sini.
  assert.ok(!strip.includes('trackPublicEvent') && !strip.includes('trackEvent'));
});

test('prop unduhan diteruskan WebItineraryView ke JourneyStrip', () => {
  assert.match(webView, /onPdfDownload\?: \(\) => void;/);
  assert.match(webView, /onPdfDownload=\{onPdfDownload\}/);
});

test('share publik & portal jamaah memakai nama event masing-masing', () => {
  assert.match(sharePage, new RegExp(`onPdfDownload=\\{\\(\\) => trackPublicEvent\\(slug, '${SHARE}'`));
  assert.match(portalPage, new RegExp(`onPdfDownload=\\{\\(\\) => trackPublicEvent\\(slug, '${PORTAL}'`));
  assert.notEqual(SHARE, PORTAL);
  // Portal butuh slug agen; dulu ItineraryPage tidak menerimanya sama sekali.
  assert.match(read('src/components/portal-jamaah/pages/PortalDashboard.tsx'), /<ItineraryPage slug=\{slug\}/);
});

test('event permukaan jamaah lolos whitelist server, dan tetap bertipe public', () => {
  const whitelist = server.match(/const VALID_PUBLIC_EVENTS = \[[\s\S]*?\n\];/)?.[0] ?? '';
  assert.notEqual(whitelist, '', 'VALID_PUBLIC_EVENTS tidak ditemukan');
  // Tanpa whitelist, POST /api/analytics/public menjawab 400 dan event hilang
  // diam-diam — persis kegagalan yang diperingatkan trackPublicEvent.
  for (const name of [SHARE, PORTAL]) {
    assert.ok(whitelist.includes(`'${name}'`), `${name} belum di-whitelist → ditolak 400`);
    assert.ok(name.length <= 50, 'eventName > 50 karakter ditolak endpoint');
    // Bukan aksi agen: yang mengunduh jamaah, jadi tak boleh masuk metrik
    // aktivitas agen lewat trackEvent('action', ...).
    assert.ok(!server.includes(`trackEvent('action', '${name}'`));
  }
});

test('event publik punya daftar hitungan sendiri, tanpa ditelan page_view', () => {
  // Sebelum ini event bertipe 'public' tidak punya breakdown sama sekali:
  // hanya lewat di umpan aktivitas terbaru, jadi unduhan sisi jamaah mustahil
  // dihitung. Panel ini yang membuat pelacakan JourneyStrip ada gunanya.
  assert.match(server, /const publicTracking = Object\.entries\(publicMap\)/);
  assert.match(server, /e\.event_type === 'public' && e\.event_name !== 'page_view'/);
  assert.match(server, /\n        publicTracking,\n/);
  // Label publik diambil dari kamus gabungan — ACTION_LABELS saja tak cukup
  // karena sebagian event publik berlabel di FEATURE_LABELS (open_portal_*).
  assert.match(server, /label: ALL_EVENT_LABELS\[name\] \|\| name/);
  assert.match(analyticsPage, /publicTracking\.map\(p =>/);
  // Respons lama (tab terbuka saat deploy) tidak punya field ini.
  assert.match(analyticsPage, /data\.publicTracking \?\? \[\]/);
});

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

const OWN = 'itinerary_own_pdf_download';
const OFFICE = 'itinerary_office_pdf_download';

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
  const own = iconOf(OWN);
  const office = iconOf(OFFICE);
  assert.notEqual(own, '', `${OWN} jatuh ke ikon default`);
  assert.notEqual(office, '', `${OFFICE} jatuh ke ikon default`);
  assert.notEqual(own, office);
});

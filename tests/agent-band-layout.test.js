import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AGENT_BLOCK, ellipsize, layoutAgentBlock } from '../src/lib/agentBandLayout.js';

// Penggaris palsu menggantikan ctx.measureText. Lebarnya sengaja linear
// terhadap panjang teks DAN ukuran huruf — itu cukup untuk menguji aturan
// penyusutan dan perataan, dan membebaskan tes ini dari DOM.
const measure = (text, fontSize) => text.length * fontSize * 0.55;

// Kotak yang benar-benar terukur dari brosur produksi.
const SLOT_PIL = { x: 488, y: 1372, width: 444, height: 40 };
const SLOT_PITA = { x: 322, y: 1366, width: 758, height: 74 };
const SLOT_KEEMASAN = { x: 482, y: 1546, width: 644, height: 54 };
const SLOT_TINGGI = { x: 744, y: 1440, width: 520, height: 160 };

const AGENT = { name: 'Nikita Ramadhani', landing: 'alhijaz.co/nikita', phone: '0812-3456-7890' };

const lay = (slot, over = {}) => layoutAgentBlock({ slot, ...AGENT, ...over, measure });

test('semua ukuran turunan TINGGI kotak, bukan angka tetap', () => {
  // Kotak dua kali lebih tinggi → huruf dan foto dua kali lebih besar. Ini
  // penjaga yang sama semangatnya dengan WATERMARK di PhotoWatermark.tsx:
  // begitu ada piksel tetap menyelinap masuk, rasio ini pecah.
  const a = lay({ x: 0, y: 0, width: 1000, height: 40 });
  const b = lay({ x: 0, y: 0, width: 1000, height: 80 });
  assert.equal(b.contentHeight, a.contentHeight * 2);
  assert.equal(b.name.fontSize, a.name.fontSize * 2);
  assert.equal(b.photo.size, a.photo.size * 2);
  assert.equal(b.landing.fontSize, a.landing.fontSize * 2);
});

test('kotak tinggi-sempit dibatasi oleh LEBAR, bukan tingginya', () => {
  // Tanpa widthCapRatio, kotak 520×160 menghasilkan foto setinggi 160 px yang
  // menabrak dua sisi dan nama sebesar judul.
  const layout = lay(SLOT_TINGGI);
  assert.ok(layout.contentHeight < SLOT_TINGGI.height, 'tinggi isi harus dibatasi');
  assert.equal(layout.contentHeight, SLOT_TINGGI.width * AGENT_BLOCK.widthCapRatio);
  // Tetap dipusatkan secara vertikal di dalam kotaknya.
  const margin = layout.top - SLOT_TINGGI.y;
  assert.ok(Math.abs(margin - (SLOT_TINGGI.height - layout.contentHeight) / 2) < 0.001);
});

test('nomor WA rata kanan tepat pada padding kotak', () => {
  for (const slot of [SLOT_PIL, SLOT_PITA, SLOT_KEEMASAN]) {
    const layout = lay(slot);
    const padX = layout.contentHeight * AGENT_BLOCK.padXRatio;
    const right = layout.wa.textX + measure(layout.wa.text, layout.wa.fontSize, 700);
    assert.ok(
      Math.abs(right - (slot.x + slot.width - padX)) < 0.001,
      `tepi kanan meleset di kotak ${slot.width}×${slot.height}`,
    );
  }
});

test('nama panjang menyusut lalu dipotong — nomor WA tidak pernah terpotong', () => {
  const layout = lay(SLOT_PIL, { name: 'Muhammad Abdurrahman Al-Faruqi Assiddiqi' });
  assert.ok(layout.name.fontSize < layout.contentHeight * AGENT_BLOCK.nameRatio, 'nama harus menyusut dulu');
  assert.ok(layout.name.text.endsWith('…'), 'nama harus dipotong elipsis');
  assert.equal(layout.wa.text, AGENT.phone, 'nomor wajib utuh');
  // Kolom kiri tidak boleh menabrak blok WhatsApp.
  const nameRight = layout.name.x + measure(layout.name.text, layout.name.fontSize, 700);
  assert.ok(nameRight <= layout.wa.iconX, 'nama menabrak blok WhatsApp');
});

test('nomor panjang mengecil sendiri ketimbang mendesak nama sampai habis', () => {
  const layout = lay(SLOT_PIL, { phone: '0812-3456-7890-1234-5678' });
  assert.ok(layout.wa.fontSize < layout.contentHeight * AGENT_BLOCK.nameRatio, 'nomor harus mengecil');
  assert.equal(layout.wa.text, '0812-3456-7890-1234-5678', 'nomor tetap utuh');
  assert.ok(layout.name && layout.name.text.length > 0, 'nama tidak boleh habis');
});

test('tidak ada elemen yang keluar dari kotak', () => {
  for (const slot of [SLOT_PIL, SLOT_PITA, SLOT_KEEMASAN, SLOT_TINGGI]) {
    const layout = lay(slot);
    const left = slot.x;
    const right = slot.x + slot.width;
    const top = slot.y;
    const bottom = slot.y + slot.height;
    const label = `kotak ${slot.width}×${slot.height}`;
    assert.ok(layout.photo.x >= left, `${label}: foto keluar kiri`);
    assert.ok(layout.photo.y >= top, `${label}: foto keluar atas`);
    assert.ok(layout.photo.y + layout.photo.size <= bottom + 0.001, `${label}: foto keluar bawah`);
    assert.ok(layout.name.y >= top, `${label}: nama keluar atas`);
    assert.ok(
      layout.landing.y + layout.landing.lineHeight <= bottom + 0.001,
      `${label}: alamat keluar bawah`,
    );
    assert.ok(layout.wa.iconX + layout.wa.iconSize <= right, `${label}: ikon WA keluar kanan`);
    assert.ok(layout.wa.iconY >= top, `${label}: ikon WA keluar atas`);
    assert.ok(layout.wa.iconY + layout.wa.iconSize <= bottom + 0.001, `${label}: ikon WA keluar bawah`);
  }
});

test('kolom teks selalu di kanan foto', () => {
  for (const slot of [SLOT_PIL, SLOT_PITA, SLOT_KEEMASAN]) {
    const layout = lay(slot);
    assert.ok(layout.name.x >= layout.photo.x + layout.photo.size, 'nama menimpa foto');
    assert.equal(layout.landing.x, layout.name.x, 'nama dan alamat harus rata kiri sama');
  }
});

test('tanpa alamat landing, nama dipusatkan sendirian', () => {
  const layout = lay(SLOT_PIL, { landing: '' });
  assert.equal(layout.landing, null);
  const mid = layout.top + layout.contentHeight / 2;
  const nameMid = layout.name.y + layout.name.lineHeight / 2;
  assert.ok(Math.abs(nameMid - mid) < 0.001, 'nama harus di sumbu tengah');
});

test('tanpa nomor, kolom teks memakai seluruh lebar', () => {
  const sempit = lay(SLOT_PIL);
  const lebar = lay(SLOT_PIL, { phone: '' });
  assert.equal(lebar.wa, null);
  assert.ok(
    lebar.name.fontSize >= sempit.name.fontSize,
    'tanpa nomor, nama tidak boleh lebih kecil',
  );
});

test('kotak terlalu kecil → null (pemanggil jatuh ke pita)', () => {
  assert.equal(lay({ x: 0, y: 0, width: 400, height: 10 }), null);
  assert.equal(lay({ x: 0, y: 0, width: 100, height: 100 }), null, 'lebar sempit membatasi tinggi isi');
});

test('masukan cacat tidak melempar', () => {
  assert.equal(layoutAgentBlock({}), null);
  assert.equal(layoutAgentBlock({ slot: SLOT_PIL, ...AGENT }), null, 'tanpa measure → null');
  assert.equal(layoutAgentBlock({ slot: { x: 0, y: 0, width: 0, height: 0 }, ...AGENT, measure }), null);
});

test('ellipsize memotong sampai muat, dan menyerah dengan benar', () => {
  const at = (fs) => (t) => measure(t, fs, 700);
  assert.equal(ellipsize('Nikita', 1000, at(20)), 'Nikita', 'yang muat dibiarkan utuh');
  const potong = ellipsize('Muhammad Abdurrahman', 60, at(20));
  assert.ok(potong.endsWith('…'));
  assert.ok(at(20)(potong) <= 60);
  assert.equal(ellipsize('Nikita', 1, at(20)), '', 'tak ada yang muat → kosong');
  assert.equal(ellipsize('', 100, at(20)), '');
});

test('rasio rupa ditulis sebagai kelipatan, bukan piksel', () => {
  for (const key of ['photoRatio', 'nameRatio', 'landingRatio', 'waIconRatio', 'padXRatio']) {
    assert.ok(AGENT_BLOCK[key] > 0 && AGENT_BLOCK[key] <= 1.5, `${key} harus kelipatan tinggi isi`);
  }
});

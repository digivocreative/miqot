import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AGENT_BLOCK, ellipsize, fillTone, layoutAgentBlock } from '../src/lib/agentBandLayout.js';

// Penggaris palsu menggantikan ctx.measureText. Lebarnya sengaja linear
// terhadap panjang teks DAN ukuran huruf — itu cukup untuk menguji aturan
// pemasan dan perataan, dan membebaskan tes ini dari DOM.
const measure = (text, fontSize) => text.length * fontSize * 0.55;

// Kotak yang benar-benar terukur dari brosur produksi.
const SLOT_PIL = { x: 488, y: 1372, width: 444, height: 40 };
const SLOT_PITA = { x: 322, y: 1366, width: 758, height: 74 };
const SLOT_KEEMASAN = { x: 482, y: 1546, width: 644, height: 54 };
const SLOT_TINGGI = { x: 744, y: 1440, width: 520, height: 160 };
/** Pita di kanan pil template Milad (JBU1558), sebelum pita hadiah ilustrasinya. */
const SLOT_PITA_SEMPIT = { x: 512, y: 1544, width: 248, height: 56 };
const SEMUA_SLOT = [SLOT_PIL, SLOT_PITA, SLOT_KEEMASAN, SLOT_TINGGI, SLOT_PITA_SEMPIT];
/** Kotak yang cukup lebar untuk nama + nomor sebaris dengan huruf layak. */
const SATU_BARIS = [SLOT_PIL, SLOT_PITA, SLOT_KEEMASAN];

const AGENT = { name: 'Nikita Ramadhani', phone: '0812-3456-7890' };

const lay = (slot, over = {}) => layoutAgentBlock({ slot, ...AGENT, ...over, measure });

/** Lebar baris pada satu ukuran huruf — cerminan aturan di dalam modul. */
function rowWidthAt(layout, fs, name = AGENT.name, phone = AGENT.phone) {
  const nameW = name ? measure(name, fs, 700) : 0;
  const waW = phone ? fs * AGENT_BLOCK.waIconRatio + fs * AGENT_BLOCK.waGapRatio + measure(phone, fs, 700) : 0;
  const gap = name && phone ? fs * AGENT_BLOCK.columnGapRatio : 0;
  return nameW + gap + waW;
}

test('semua ukuran turunan TINGGI kotak, bukan angka tetap', () => {
  // Kotak dua kali lebih tinggi → huruf dua kali lebih besar. Penjaga yang sama
  // semangatnya dengan WATERMARK di PhotoWatermark.tsx: begitu ada piksel tetap
  // menyelinap masuk, rasio ini pecah. Kotaknya dibuat sangat lebar supaya yang
  // mengikat tingginya, bukan pemas lebar.
  const a = lay({ x: 0, y: 0, width: 4000, height: 40 });
  const b = lay({ x: 0, y: 0, width: 8000, height: 80 });
  assert.equal(b.contentHeight, a.contentHeight * 2);
  assert.equal(b.fontSize, a.fontSize * 2);
  assert.equal(b.wa.iconSize, a.wa.iconSize * 2);
});

test('huruf dibesarkan sampai mentok — bukan sekadar muat', () => {
  // Ini inti permintaan "hurufnya diperbesar": untuk tiap kotak, ukuran huruf
  // harus SUDAH maksimum — entah karena satu langkah lebih besar tidak muat
  // selebar barisnya, atau karena sudah mengisi tinggi kotak dengan layak.
  //
  // LANTAI 0,62 ITU MILIK TES, sengaja ditulis di sini dan bukan diturunkan
  // dari AGENT_BLOCK.singleLineRatio. Versi pertama tes ini memakai konstanta
  // modulnya, jadi menurunkan konstanta itu ikut menurunkan asersinya —
  // asersi hampa yang lolos saat singleLineRatio dimutasi 0,7 → 0,5.
  const LANTAI_TINGGI = 0.62;
  for (const slot of SEMUA_SLOT) {
    const layout = lay(slot);
    const padX = layout.contentHeight * AGENT_BLOCK.padXRatio;
    const rowWidth = slot.width - padX * 2;
    const mentokLebar = rowWidthAt(layout, layout.fontSize + 0.5) > rowWidth;
    const mengisiTinggi = layout.fontSize >= layout.contentHeight * LANTAI_TINGGI;
    assert.ok(
      mentokLebar || mengisiTinggi,
      `kotak ${slot.width}×${slot.height}: huruf ${layout.fontSize} masih bisa dibesarkan`,
    );
  }
});

test('satu baris memberi huruf jauh lebih besar daripada skema dua baris', () => {
  // Foto dan alamat landing dibuang justru demi ini (permintaan user
  // 2026-09-01). Patokan lamanya: nama = 0,45 × tinggi isi, dengan baris alamat
  // di bawahnya dan foto memakan ±1,14 × tinggi isi di kiri.
  const PATOKAN_LAMA = 0.45;
  for (const slot of [SLOT_PIL, SLOT_PITA, SLOT_KEEMASAN]) {
    const layout = lay(slot);
    assert.ok(
      layout.fontSize > layout.contentHeight * PATOKAN_LAMA,
      `kotak ${slot.width}×${slot.height}: huruf ${layout.fontSize} tidak lebih besar dari skema lama`,
    );
  }
});

test('nama dan nomor memakai SATU ukuran huruf', () => {
  // Dua ukuran berbeda pada satu baris pendek terbaca sebagai ketidaksengajaan.
  for (const slot of SEMUA_SLOT) {
    const layout = lay(slot);
    assert.equal(layout.wa.iconSize, layout.fontSize * AGENT_BLOCK.waIconRatio);
    assert.ok(layout.name, 'nama harus ada');
  }
});

test('nomor WA rata kanan tepat pada padding kotak', () => {
  for (const slot of SATU_BARIS) {
    const layout = lay(slot);
    const padX = layout.contentHeight * AGENT_BLOCK.padXRatio;
    const right = layout.wa.textX + measure(layout.wa.text, layout.fontSize, 700);
    assert.ok(
      Math.abs(right - (slot.x + slot.width - padX)) < 0.001,
      `tepi kanan meleset di kotak ${slot.width}×${slot.height}`,
    );
  }
});

test('nama rata kiri tepat pada padding kotak', () => {
  for (const slot of SEMUA_SLOT) {
    const layout = lay(slot);
    const padX = layout.contentHeight * AGENT_BLOCK.padXRatio;
    assert.ok(Math.abs(layout.name.x - (slot.x + padX)) < 0.001, 'tepi kiri meleset');
  }
});

test('kotak tinggi-sempit dibatasi oleh LEBAR, bukan tingginya', () => {
  const layout = lay(SLOT_TINGGI);
  assert.ok(layout.contentHeight < SLOT_TINGGI.height, 'tinggi isi harus dibatasi');
  assert.equal(layout.contentHeight, SLOT_TINGGI.width * AGENT_BLOCK.widthCapRatio);
});

test('nama panjang dipotong — nomor WA tidak pernah terpotong', () => {
  const layout = lay(SLOT_PIL, { name: 'Muhammad Abdurrahman Al-Faruqi Assiddiqi' });
  assert.ok(layout.name.text.endsWith('…'), 'nama harus dipotong elipsis');
  assert.equal(layout.wa.text, AGENT.phone, 'nomor wajib utuh');
  const nameRight = layout.name.x + measure(layout.name.text, layout.fontSize, 700);
  assert.ok(nameRight <= layout.wa.iconX, 'nama menabrak blok WhatsApp');
});

test('nomor panjang mengecilkan baris, bukan menghabiskan nama', () => {
  const layout = lay(SLOT_PIL, { phone: '0812-3456-7890-1234-5678' });
  assert.equal(layout.wa.text, '0812-3456-7890-1234-5678', 'nomor tetap utuh');
  assert.ok(layout.name && layout.name.text.length > 0, 'nama tidak boleh habis');
  assert.ok(layout.fontSize < lay(SLOT_PIL).fontSize, 'baris harus menyusut');
});

test('tidak ada elemen yang keluar dari kotak', () => {
  for (const slot of SEMUA_SLOT) {
    const layout = lay(slot);
    const label = `kotak ${slot.width}×${slot.height}`;
    assert.ok(layout.name.x >= slot.x, `${label}: nama keluar kiri`);
    assert.ok(layout.wa.iconX + layout.wa.iconSize <= slot.x + slot.width, `${label}: ikon keluar kanan`);
    assert.ok(layout.wa.iconY >= slot.y, `${label}: ikon keluar atas`);
    assert.ok(
      layout.wa.iconY + layout.wa.iconSize <= slot.y + slot.height + 0.001,
      `${label}: ikon keluar bawah`,
    );
    // Tiap baris dipusatkan pada sumbunya sendiri: setengah tinggi huruf tidak
    // boleh melewati kotak, entah isinya sebaris atau ditumpuk.
    for (const line of [layout.name, layout.wa]) {
      assert.ok(line.midY - layout.fontSize / 2 >= slot.y - 0.001, `${label}: teks keluar atas`);
      assert.ok(
        line.midY + layout.fontSize / 2 <= slot.y + slot.height + 0.001,
        `${label}: teks keluar bawah`,
      );
    }
    const nameRight = layout.name.x + measure(layout.name.text, layout.fontSize, 700);
    const waRight = layout.wa.textX + measure(layout.wa.text, layout.fontSize, 700);
    assert.ok(nameRight <= slot.x + slot.width + 0.001, `${label}: nama keluar kanan`);
    assert.ok(waRight <= slot.x + slot.width + 0.001, `${label}: nomor keluar kanan`);
  }
});

test('nama dan nomor sesumbu vertikal', () => {
  const layout = lay(SLOT_KEEMASAN);
  assert.equal(layout.name.midY, layout.wa.midY);
  assert.equal(layout.name.midY, SLOT_KEEMASAN.y + SLOT_KEEMASAN.height / 2);
});

test('tanpa nomor, nama memakai seluruh lebar', () => {
  const sempit = lay(SLOT_PIL);
  const lebar = lay(SLOT_PIL, { phone: '' });
  assert.equal(lebar.wa, null);
  assert.ok(lebar.fontSize >= sempit.fontSize, 'tanpa nomor, huruf tidak boleh lebih kecil');
});

test('tanpa nama, nomor tetap tergambar', () => {
  const layout = lay(SLOT_PIL, { name: '' });
  assert.equal(layout.name, null);
  assert.equal(layout.wa.text, AGENT.phone);
});

test('tanpa nama DAN tanpa nomor → null', () => {
  assert.equal(lay(SLOT_PIL, { name: '', phone: '' }), null);
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
  for (const key of ['singleLineRatio', 'fontFloorRatio', 'waIconRatio', 'waGapRatio', 'padXRatio']) {
    assert.ok(AGENT_BLOCK[key] > 0 && AGENT_BLOCK[key] <= 1.5, `${key} harus kelipatan`);
  }
});

// ── Dua baris untuk kotak sempit ────────────────────────────────────────────

test('kotak lebar tetap SATU baris: nama dan nomor sesumbu', () => {
  for (const slot of SATU_BARIS) {
    const layout = lay(slot);
    assert.equal(layout.stacked, false, `kotak ${slot.width}×${slot.height} tidak boleh ditumpuk`);
    assert.equal(layout.name.midY, layout.wa.midY);
  }
});

test('pita sempit: nama dan nomor ditumpuk kalau hurufnya jadi jauh lebih besar', () => {
  // Hitungan tangan dengan penggaris palsu (0,55 em per huruf): sebaris, nama
  // 16 huruf + jeda + ikon + nomor 14 huruf = 18,42 em di lebar 229 px → huruf
  // ±12 px. Ditumpuk, baris terpanjangnya cuma 9,02 em, jadi yang membatasi
  // tinggi kotak — jauh di atas 16 px.
  const slot = SLOT_PITA_SEMPIT;
  const layout = lay(slot);
  assert.equal(layout.stacked, true);
  assert.ok(layout.fontSize >= 16, `huruf ${layout.fontSize} tidak lebih besar dari versi sebaris`);
  assert.ok(layout.name.midY < layout.wa.midY, 'nama di atas nomor');
  assert.ok(layout.wa.midY - layout.name.midY >= layout.fontSize, 'dua baris saling menimpa');
  assert.equal(layout.name.text, AGENT.name, 'nama muat utuh, tanpa elipsis');
  assert.equal(layout.wa.text, AGENT.phone);
  // Rata kiri pada padding yang sama dengan versi sebaris.
  assert.equal(layout.wa.iconX, layout.name.x);
});

test('tumpukan tidak dipakai kalau hurufnya tak naik berarti', () => {
  // Pil 40 px dengan nama panjang: dua baris setinggi itu hanya menaikkan
  // huruf beberapa persen, dan dua baris yang sesak lebih jelek daripada
  // elipsis di satu baris.
  const layout = lay(SLOT_PIL, { name: 'Muhammad Abdurrahman Al-Faruqi Assiddiqi' });
  assert.equal(layout.stacked, false);
});

// ── Warna teks mengikuti isian kotak ────────────────────────────────────────

test('isian gelap → teks terang, isian terang → teks gelap', () => {
  assert.equal(fillTone([0x72, 0x06, 0x00]), 'dark', 'kotak marun Lailatul Qadr');
  assert.equal(fillTone([0xff, 0xd8, 0x81]), 'light', 'kotak kuning Ramadhan');
  assert.equal(fillTone([0xff, 0xff, 0xff]), 'light');
  assert.equal(fillTone([0xf1, 0xf1, 0xf1]), 'light', 'pita abu muda di kanan pil');
  assert.equal(fillTone(undefined), 'light', 'tanpa info isian → perilaku lama');
});

test('nama panjang di pita sempit: tetap ditumpuk, namanya yang dielipsis', () => {
  // Hitungan tangan: sebaris, nama 40 huruf membuat baris 31,6 em — huruf
  // jatuh ke lantai 0,34 × 28,5 ≈ 9,7 px. Ditumpuk, baris nomor (9,02 em)
  // dan tinggi kotak mengizinkan ±20 px; nama cukup dielipsis di ukuran itu,
  // seperti aturan versi sebaris.
  const layout = lay(SLOT_PITA_SEMPIT, { name: 'Muhammad Abdurrahman Al-Faruqi Assiddiqi' });
  assert.equal(layout.stacked, true);
  assert.ok(layout.fontSize >= 15, `huruf ${layout.fontSize} masih sekecil versi sebaris`);
  assert.ok(layout.name.text.endsWith('…'), 'nama harus dipotong elipsis');
  assert.equal(layout.wa.text, AGENT.phone, 'nomor wajib utuh');
  const nameRight = layout.name.x + measure(layout.name.text, layout.fontSize, 700);
  assert.ok(nameRight <= SLOT_PITA_SEMPIT.x + SLOT_PITA_SEMPIT.width, 'nama keluar kanan');
});

test('nama yang nyaris muat: huruf tumpukan menyusut sedikit, nama tampil utuh', () => {
  // Hitungan tangan: titik awal tumpukan di kotak ini 0,7 × 28,52 = 19,96 px.
  // Nama 24 huruf di ukuran itu 263 px, lebih lebar dari baris 230,9 px; di
  // 17,46 px (masih di atas 0,85 × 19,96 = 16,97) lebarnya 230,5 px — muat.
  const name = 'Siti Nurhaliza Rahmawati';
  const layout = lay(SLOT_PITA_SEMPIT, { name });
  assert.equal(layout.stacked, true);
  assert.equal(layout.name.text, name, 'nama yang nyaris muat jangan dielipsis');
  assert.ok(layout.fontSize > 16.9 && layout.fontSize < 19.9, `huruf ${layout.fontSize}`);
});

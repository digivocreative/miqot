import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CONTACT_SLOT, findContactSlot } from '../src/lib/brochureContactSlot.js';

// Fixture-nya SINTETIS, bukan brosur asli: yang diuji adalah aturan pemindai,
// dan aturan itu bisa dilanggar dengan struktur — bukan dengan foto. Setiap
// kasus di bawah mereproduksi susunan strip bawah satu keluarga template nyata
// beserta jebakannya, seperti yang terukur dari 19 brosur produksi:
//
//   pil       1080×1440  pil putih kosong 476×46 di 43,7%–87,6% lebar
//   pita      1080×1440  pita putih 74 px, pil merah label di kiri
//   keemasan  1200×1600  blok merah nomor izin di kiri, kotak putih berlabel
//                        gelap di kanan — isian harus jatuh DI BAWAH labelnya
//
// Saat modul ini ditulis, ketiganya ditera ulang terhadap 19 brosur produksi
// dan cocok 19/19. Kalau ada aturan yang dilonggarkan, tera ulang ke brosur
// asli — lolosnya tes sintetis saja tidak membuktikan apa pun soal produksi.

const RED = [0x8a, 0x0b, 0x0a];
const WHITE = [0xff, 0xff, 0xff];
const DARK = [0x22, 0x22, 0x22];

// Warna keluarga kotak isian (Ramadhan, Sya'ban, Syawal, Lailatul Qadr), diukur
// dari brosur produksi JBU1627 dan JBU1630.
const MAROON = [0x6e, 0x0a, 0x00];
const GOLD = [0xc8, 0x85, 0x24];
const CREAM = [0xff, 0xea, 0xc1];
const YELLOW_PANEL = [0xf8, 0xd4, 0x7c];
const YELLOW_BOX = [0xff, 0xd8, 0x81];
const YELLOW_OUTLINE = [0xca, 0x9e, 0x45];
const MAROON_BOX = [0x72, 0x06, 0x00];
const MAROON_OUTLINE = [0xc5, 0x69, 0x42];

/**
 * Merakit potongan bawah gambar. `rects` dalam koordinat GAMBAR PENUH supaya
 * angka di tes bisa disalin apa adanya dari hasil pengukuran brosur.
 */
function buildRegion({ imageWidth, imageHeight, scanRatio = CONTACT_SLOT.scanRatio, base = RED, rects = [] }) {
  const height = Math.max(1, Math.round(imageHeight * scanRatio));
  const offsetY = imageHeight - height;
  const data = new Uint8ClampedArray(imageWidth * height * 4);
  for (let i = 0; i < imageWidth * height; i++) {
    data[i * 4] = base[0];
    data[i * 4 + 1] = base[1];
    data[i * 4 + 2] = base[2];
    data[i * 4 + 3] = 255;
  }
  for (const r of rects) {
    const color = r.color || WHITE;
    for (let y = r.y; y < r.y + r.h; y++) {
      const row = y - offsetY;
      if (row < 0 || row >= height) continue;
      for (let x = r.x; x < r.x + r.w; x++) {
        if (x < 0 || x >= imageWidth) continue;
        const i = (row * imageWidth + x) * 4;
        data[i] = color[0];
        data[i + 1] = color[1];
        data[i + 2] = color[2];
        data[i + 3] = 255;
      }
    }
  }
  return { data, width: imageWidth, height, offsetY, imageHeight };
}

function near(actual, expected, tolerance = CONTACT_SLOT.step) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `harap ${expected} ± ${tolerance}, dapat ${actual}`,
  );
}

function assertBox(slot, [x1, y1, x2, y2]) {
  assert.ok(slot, 'kotak seharusnya ketemu');
  near(slot.x, x1);
  near(slot.y, y1);
  near(slot.x + slot.width, x2);
  near(slot.y + slot.height, y2);
}

test('keluarga pil: menemukan pil putih kosong di strip bawah', () => {
  const slot = findContactSlot(buildRegion({
    imageWidth: 1080,
    imageHeight: 1440,
    rects: [{ x: 472, y: 1368, w: 476, h: 46 }],
  }));
  assertBox(slot, [472, 1368, 948, 1414]);
});

test('keluarga pita: mulai setelah pil label merah di kiri', () => {
  const slot = findContactSlot(buildRegion({
    imageWidth: 1080,
    imageHeight: 1440,
    rects: [
      { x: 0, y: 1366, w: 1080, h: 74 },
      { x: 0, y: 1366, w: 322, h: 74, color: RED },
    ],
  }));
  assertBox(slot, [322, 1366, 1080, 1440]);
});

test('keluarga keemasan: berhenti DI BAWAH label gelap, dan blok izin tak tersentuh', () => {
  const slot = findContactSlot(buildRegion({
    imageWidth: 1200,
    imageHeight: 1600,
    rects: [
      { x: 470, y: 1514, w: 660, h: 86 },
      // Blok merah "PT. ALHIJAZ INDOWISATA / Izin Umrah No. ..." di kiri.
      { x: 0, y: 1514, w: 450, h: 86, color: RED },
      // Label "Informasi & Pendaftaran:" — piksel gelap yang WAJIB memotong.
      { x: 500, y: 1516, w: 340, h: 28, color: DARK },
    ],
  }));
  assertBox(slot, [470, 1546, 1130, 1600]);
  assert.ok(slot.x >= 450, 'kotak tidak boleh menyentuh blok nomor izin di kiri');
  assert.ok(slot.y >= 1544, 'kotak tidak boleh menimpa label');
});

test('panel putih besar DI ATAS strip kalah dari kotak yang menyentuh dasar', () => {
  // Ini yang bikin "persegi kosong terbesar" tanpa jangkar salah sasaran di 6
  // dari 19 brosur: panel "Tidak Termasuk" jauh lebih luas daripada pilnya.
  //
  // Jeda merah 1340–1368 antara panel dan pil itu BUKAN hiasan tes: jangkar
  // hanya memisahkan keduanya selama area putihnya memang terpisah. Kalau suatu
  // template menyambung panel ke strip bawah tanpa jeda, kotaknya memang akan
  // ikut memanjang ke atas — di 19 brosur produksi itu tidak pernah merugikan
  // karena widthCapRatio di agentBandLayout menahan isinya tetap seukuran.
  const slot = findContactSlot(buildRegion({
    imageWidth: 1080,
    imageHeight: 1440,
    rects: [
      { x: 100, y: 1250, w: 880, h: 90 },
      { x: 472, y: 1368, w: 476, h: 46 },
    ],
  }));
  assert.ok(slot, 'kotak seharusnya ketemu');
  assert.ok(slot.y >= 1360, `kotak harus yang di dasar, dapat y=${slot.y}`);
  near(slot.x, 472);
});

test('tanpa area putih sama sekali → null (pemanggil jatuh ke pita)', () => {
  const slot = findContactSlot(buildRegion({ imageWidth: 1080, imageHeight: 1440 }));
  assert.equal(slot, null);
});

test('kotak terlalu sempit ditolak', () => {
  const slot = findContactSlot(buildRegion({
    imageWidth: 1080,
    imageHeight: 1440,
    // 200 px = 18,5% lebar, di bawah ambang 22%.
    rects: [{ x: 700, y: 1368, w: 200, h: 46 }],
  }));
  assert.equal(slot, null);
});

test('kotak terlalu pendek ditolak', () => {
  const slot = findContactSlot(buildRegion({
    imageWidth: 1080,
    imageHeight: 1440,
    // 20 px = 1,4% tinggi, di bawah ambang 2%.
    rects: [{ x: 300, y: 1420, w: 700, h: 20 }],
  }));
  assert.equal(slot, null);
});

test('kotak putih yang tidak menyentuh dasar ditolak', () => {
  const slot = findContactSlot(buildRegion({
    imageWidth: 1080,
    imageHeight: 1440,
    // Berakhir di 1395, sementara pita jangkar mulai 1440 − 36 = 1404.
    rects: [{ x: 300, y: 1330, w: 700, h: 65 }],
  }));
  assert.equal(slot, null);
});

test('masukan cacat tidak melempar', () => {
  assert.equal(findContactSlot(null), null);
  assert.equal(findContactSlot({}), null);
  assert.equal(
    findContactSlot({ data: new Uint8ClampedArray(4), width: 100, height: 100, offsetY: 0, imageHeight: 100 }),
    null,
  );
});

test('ambang ditulis sebagai rasio, bukan piksel tetap', () => {
  // Empat ukuran kanvas beredar sekaligus (1080×1440, 1081×1440, 1200×1600,
  // 1279×1600). Angka tetap di sini akan mati diam-diam di salah satunya.
  for (const key of ['scanRatio', 'anchorRatio', 'minWidthRatio', 'minHeightRatio']) {
    assert.ok(CONTACT_SLOT[key] > 0 && CONTACT_SLOT[key] < 1, `${key} harus rasio`);
  }
});

test('kotak yang sama ditemukan pada dua ukuran kanvas berbeda', () => {
  // Susunan proporsional yang identik harus menghasilkan rasio yang identik —
  // ini penjaga langsung terhadap kembalinya koordinat piksel tetap.
  const asRatio = (w, h) => {
    const slot = findContactSlot(buildRegion({
      imageWidth: w,
      imageHeight: h,
      rects: [{ x: Math.round(w * 0.44), y: Math.round(h * 0.95), w: Math.round(w * 0.44), h: Math.round(h * 0.032) }],
    }));
    assert.ok(slot, `kotak seharusnya ketemu di ${w}×${h}`);
    return [slot.x / w, (slot.x + slot.width) / w];
  };
  const small = asRatio(1080, 1440);
  const large = asRatio(1279, 1600);
  near(small[0], large[0], 0.01);
  near(small[1], large[1], 0.01);
});

// ── Keluarga kotak isian berwarna ───────────────────────────────────────────
// Brosur Ramadhan, Sya'ban, Syawal, dan Lailatul Qadr (JBU1627 dst.) tidak
// punya satu piksel putih pun di strip bawahnya: area kontaknya kotak isian
// bergaris tepi emas, berisi kuning ATAU marun. Sebelum ini 12 brosur itu
// jatuh ke pita jaring pengaman — kanvas ditinggikan, padahal kotaknya ada.

test('keluarga kotak kuning: isian berwarna tetap ketemu, dibatasi garis tepi 1 px', () => {
  // Garis tepinya 1 px di koordinat GANJIL (513, 911, 1385, 1427), dan margin
  // panel di luarnya nyaris sewarna isian. Sampel satu piksel per sel 2 px akan
  // melompati garis itu lalu menyatukan kotak dengan marginnya.
  const slot = findContactSlot(buildRegion({
    imageWidth: 1080,
    imageHeight: 1440,
    base: MAROON,
    rects: [
      { x: 485, y: 1351, w: 15, h: 89, color: GOLD },
      { x: 500, y: 1351, w: 580, h: 89, color: YELLOW_PANEL },
      { x: 520, y: 1360, w: 200, h: 14, color: DARK },
      { x: 513, y: 1385, w: 399, h: 43, color: YELLOW_OUTLINE },
      { x: 514, y: 1386, w: 397, h: 41, color: YELLOW_BOX },
      { x: 939, y: 1296, w: 141, h: 144, color: GOLD },
    ],
  }));
  assertBox(slot, [514, 1386, 911, 1427]);
  for (let k = 0; k < 3; k++) near(slot.fill[k], YELLOW_BOX[k], 6);
});

test('keluarga kotak marun: isian sewarna panelnya, hanya garis tepi yang memisahkan', () => {
  const slot = findContactSlot(buildRegion({
    imageWidth: 1080,
    imageHeight: 1440,
    base: MAROON_BOX,
    rects: [
      // Panel krem "PT. ALHIJAZ INDOWISATA" di kiri, penuh teks gelap.
      { x: 0, y: 1296, w: 485, h: 144, color: CREAM },
      { x: 65, y: 1376, w: 265, h: 20, color: DARK },
      { x: 75, y: 1404, w: 230, h: 12, color: DARK },
      { x: 75, y: 1420, w: 220, h: 12, color: DARK },
      { x: 485, y: 1296, w: 15, h: 144, color: GOLD },
      // Label putih "Informasi & Pendaftaran" di atas kotak.
      { x: 530, y: 1367, w: 230, h: 8, color: WHITE },
      { x: 528, y: 1385, w: 530, h: 2, color: MAROON_OUTLINE },
      { x: 528, y: 1427, w: 530, h: 2, color: MAROON_OUTLINE },
      { x: 528, y: 1385, w: 2, h: 44, color: MAROON_OUTLINE },
      { x: 1056, y: 1385, w: 2, h: 44, color: MAROON_OUTLINE },
    ],
  }));
  assertBox(slot, [530, 1387, 1056, 1427]);
  for (let k = 0; k < 3; k++) near(slot.fill[k], MAROON_BOX[k], 6);
});

test('kotak berwarna hanya dicari kalau TIDAK ada kotak putih', () => {
  // Kotak merah bergaris tepi di kiri ini lebih luas daripada pilnya. Kalau
  // isian berwarna ikut berlomba dengan yang putih, blok merah semacam "PT.
  // ALHIJAZ INDOWISATA" di template lama bisa merebut tempat kontaknya.
  const slot = findContactSlot(buildRegion({
    imageWidth: 1080,
    imageHeight: 1440,
    rects: [
      { x: 18, y: 1328, w: 454, h: 2, color: DARK },
      { x: 18, y: 1438, w: 454, h: 2, color: DARK },
      { x: 18, y: 1328, w: 2, h: 112, color: DARK },
      { x: 470, y: 1328, w: 2, h: 112, color: DARK },
      { x: 472, y: 1368, w: 476, h: 46 },
    ],
  }));
  assertBox(slot, [472, 1368, 948, 1414]);
});

test('latar berwarna tanpa kotak → null, bukan sembarang bidang polos', () => {
  // Bidang merah di bawah baris teks ini polos dan menyentuh dasar, tapi
  // membentang dari tepi ke tepi gambar: itu latar, bukan kotak isian.
  const slot = findContactSlot(buildRegion({
    imageWidth: 1080,
    imageHeight: 1440,
    rects: [{ x: 0, y: 1310, w: 1080, h: 6, color: DARK }],
  }));
  assert.equal(slot, null);
});

test('bidang berwarna yang terbuka ke atas → null', () => {
  // Dibatasi kiri-kanan, tapi tidak punya tepi atas di dalam strip.
  const slot = findContactSlot(buildRegion({
    imageWidth: 1080,
    imageHeight: 1440,
    rects: [
      { x: 300, y: 1296, w: 4, h: 144, color: DARK },
      { x: 800, y: 1296, w: 4, h: 144, color: DARK },
    ],
  }));
  assert.equal(slot, null);
});

// ── Kotak dinilai dari luas yang bisa dipakai, bukan luas mentahnya ─────────

test('label di pojok kiri kotak: isian di BAWAH label, bukan di sampingnya', () => {
  // Template keemasan 960×1280 (JBU1617). Persegi di kanan label lebih LUAS
  // (336×70 lawan 516×44), tapi isinya satu baris: tingginya tak terpakai,
  // lebarnya yang menentukan besar huruf.
  const slot = findContactSlot(buildRegion({
    imageWidth: 960,
    imageHeight: 1280,
    rects: [
      { x: 390, y: 1210, w: 516, h: 70 },
      { x: 408, y: 1222, w: 162, h: 13, color: DARK },
    ],
  }));
  assertBox(slot, [390, 1236, 906, 1280]);
});

// ── Pil label di area terbuka ───────────────────────────────────────────────
// Template berlatar putih (Jum'atain, Akhir Tahun, Milad) menaruh pil merah
// "Konsultasi Umrah Hubungi!" di pojok kiri bawah, dan kanan pilnya terbuka
// sampai baris teks di atasnya. Persegi putih terbesarnya jauh lebih tinggi
// daripada pil — teks yang dipusatkan di situ melayang di atas pil.

test('pil menyentuh dasar di area terbuka: isian sejajar pil, bukan melayang di atasnya', () => {
  const slot = findContactSlot(buildRegion({
    imageWidth: 1081,
    imageHeight: 1440,
    base: WHITE,
    rects: [
      { x: 328, y: 1302, w: 456, h: 9, color: DARK },
      { x: 0, y: 1387, w: 416, h: 53, color: RED },
      // Ujung miring pil melebar ke bawah.
      { x: 0, y: 1414, w: 449, h: 26, color: RED },
    ],
  }));
  assertBox(slot, [450, 1387, 1081, 1440]);
});

test('pita di kanan pil tetap dipakai walau lebih sempit dari ambang kotak biasa', () => {
  // Template Milad 1279×1600 (JBU1558): kanan pil hanya ±250 px sebelum pita
  // hadiah ilustrasinya — di bawah ambang 22% lebar, padahal letaknya sudah
  // pasti karena pilnya yang menunjuk.
  const slot = findContactSlot(buildRegion({
    imageWidth: 1279,
    imageHeight: 1600,
    base: WHITE,
    rects: [
      { x: 72, y: 1472, w: 528, h: 36, color: DARK },
      { x: 0, y: 1544, w: 490, h: 56, color: RED },
      { x: 0, y: 1572, w: 512, h: 28, color: RED },
      { x: 800, y: 1440, w: 479, h: 122, color: DARK },
      { x: 760, y: 1566, w: 519, h: 34, color: DARK },
    ],
  }));
  assertBox(slot, [512, 1544, 760, 1600]);
});

test('sudut kotak isian membulat: tepi kiri-kanan tetap terbaca tertutup', () => {
  // Kotak asli bersudut bulat. Lengkung garis tepinya masuk beberapa piksel ke
  // dalam di baris teratas dan terbawah, jadi persegi kosong terbesar berhenti
  // SEBELUM garis tepi kiri-kanan — kolom tepat di sebelahnya hampir kosong.
  const corner = (x, y) => ({ x, y, w: 8, h: 6, color: MAROON_OUTLINE });
  const slot = findContactSlot(buildRegion({
    imageWidth: 1080,
    imageHeight: 1440,
    base: MAROON_BOX,
    rects: [
      { x: 0, y: 1296, w: 485, h: 144, color: CREAM },
      { x: 65, y: 1376, w: 265, h: 20, color: DARK },
      { x: 75, y: 1404, w: 230, h: 12, color: DARK },
      { x: 75, y: 1420, w: 220, h: 12, color: DARK },
      { x: 485, y: 1296, w: 15, h: 144, color: GOLD },
      { x: 528, y: 1385, w: 530, h: 2, color: MAROON_OUTLINE },
      { x: 528, y: 1427, w: 530, h: 2, color: MAROON_OUTLINE },
      { x: 528, y: 1385, w: 2, h: 44, color: MAROON_OUTLINE },
      { x: 1056, y: 1385, w: 2, h: 44, color: MAROON_OUTLINE },
      corner(530, 1387), corner(1048, 1387), corner(530, 1421), corner(1048, 1421),
    ],
  }));
  assert.ok(slot, 'kotak seharusnya ketemu');
  assert.ok(slot.x >= 530 && slot.x + slot.width <= 1056, 'isian tetap di dalam garis tepi');
  assert.ok(slot.y >= 1387 && slot.y + slot.height <= 1427, 'isian tetap di dalam garis tepi');
  assert.ok(slot.width >= 480, `kotak menciut jadi ${slot.width} px`);
});

test('pita di kanan pil menang atas bidang kosong lain yang lebih luas', () => {
  // Template Milad yang asli: di pojok kanan bawah, di bawah ilustrasi, ada
  // bidang putih yang sedikit lebih luas daripada pita di kanan pil. Isian di
  // pojok itu jauh dari label "Konsultasi Umrah Hubungi!" yang memintanya.
  const slot = findContactSlot(buildRegion({
    imageWidth: 1279,
    imageHeight: 1600,
    base: WHITE,
    rects: [
      { x: 72, y: 1472, w: 528, h: 36, color: DARK },
      { x: 0, y: 1544, w: 490, h: 56, color: RED },
      { x: 0, y: 1572, w: 512, h: 28, color: RED },
      { x: 800, y: 1440, w: 479, h: 90, color: DARK },
      { x: 760, y: 1530, w: 140, h: 60, color: DARK },
    ],
  }));
  assertBox(slot, [512, 1544, 760, 1600]);
});

test('ornamen kecil yang menempel di atas pil tidak ikut menaikkan pitanya', () => {
  // Brosur Milad asli: beberapa kolom di dekat tepi kiri pil bersambung ke
  // hiasan setinggi ±8 px di atasnya. Puncak pil yang diambil dari kolom
  // TERTINGGI ikut naik ke hiasan itu, pita jadi lebih tinggi dari pil, dan
  // teksnya berhenti sejajar.
  const slot = findContactSlot(buildRegion({
    imageWidth: 1279,
    imageHeight: 1600,
    base: WHITE,
    rects: [
      { x: 72, y: 1472, w: 528, h: 36, color: DARK },
      { x: 26, y: 1530, w: 6, h: 14, color: DARK },
      { x: 0, y: 1544, w: 490, h: 56, color: RED },
      { x: 0, y: 1572, w: 512, h: 28, color: RED },
      { x: 800, y: 1440, w: 479, h: 122, color: DARK },
      { x: 760, y: 1566, w: 519, h: 34, color: DARK },
    ],
  }));
  assertBox(slot, [512, 1544, 760, 1600]);
});

test('teks putih di dalam pil tidak menurunkan pitanya', () => {
  // Huruf putih "Konsultasi Umrah Hubungi!" memutus deret sel penuh di lebih
  // dari separuh kolom pil: di kolom itu puncaknya jatuh ke bawah huruf.
  const letters = [];
  for (let x = 40; x < 400; x += 8) letters.push({ x, y: 1398, w: 6, h: 28, color: WHITE });
  const slot = findContactSlot(buildRegion({
    imageWidth: 1081,
    imageHeight: 1440,
    base: WHITE,
    rects: [
      { x: 328, y: 1302, w: 456, h: 9, color: DARK },
      { x: 0, y: 1387, w: 416, h: 53, color: RED },
      { x: 0, y: 1414, w: 449, h: 26, color: RED },
      ...letters,
    ],
  }));
  assertBox(slot, [450, 1387, 1081, 1440]);
});

test('ikon kecil yang menyentuh dasar bukan pil label', () => {
  // Pita putih selebar gambar dengan ikon kecil di pojok kiri bawahnya. Kalau
  // ikon itu dihitung sebagai pil, kotaknya menciut ke setinggi ikon.
  const slot = findContactSlot(buildRegion({
    imageWidth: 1080,
    imageHeight: 1440,
    rects: [
      { x: 0, y: 1366, w: 1080, h: 74 },
      { x: 40, y: 1400, w: 50, h: 40, color: DARK },
    ],
  }));
  assertBox(slot, [90, 1366, 1080, 1440]);
});

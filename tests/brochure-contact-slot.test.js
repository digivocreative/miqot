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

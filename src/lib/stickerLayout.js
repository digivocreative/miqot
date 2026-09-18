// Geometri sticker, ternormalisasi dan murni.
//
// Brosur paket beredar dalam EMPAT ukuran (1080×1440, 1081×1440, 1200×1600,
// 1279×1600) dan Brosur Jadwal 1080×1620, sementara editor menampilkannya
// diperkecil agar muat layar HP. Koordinat piksel karena itu dijamin salah —
// pelajaran yang sama yang dulu membatalkan rancangan koordinat tetap di
// brochureContactSlot. Yang disimpan adalah pecahan: cx/cy titik tengah dalam
// 0..1, w lebar sebagai pecahan lebar gambar. Tinggi TIDAK disimpan — ia
// turunan dari rasio sticker (yang datang dari katalog, bukan dari DOM).
//
// Pratinjau dan komposit memanggil placementToRect() yang sama dengan rasio
// yang sama, hanya beda ukuran kotak. Itulah yang membuat keduanya tidak bisa
// berbeda pendapat, dan kenapa modul ini tidak boleh menyentuh DOM sama sekali.
export const STICKER_W_MIN = 0.1;
export const STICKER_W_MAX = 1;
export const STICKER_W_DEFAULT = 0.3;

/** Bagian sticker yang wajib tetap di dalam gambar, supaya tak bisa hilang. */
export const MIN_VISIBLE = 0.25;

// Sticker ke-n muncul bergeser dari yang sebelumnya supaya tumpukan tidak
// menimpa persis dan yang di bawah masih bisa ditap. Berputar di 8 posisi
// sehingga sticker ke-9 kembali ke tengah, bukan lari makin jauh keluar gambar.
const STAGGER = [
  [0, 0], [0.08, 0.08], [-0.08, -0.08], [0.08, -0.08],
  [-0.08, 0.08], [0.16, 0.16], [-0.16, -0.16], [0.16, -0.16],
];

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function defaultPlacement(stickerId, index = 0) {
  const [dx, dy] = STAGGER[((index % STAGGER.length) + STAGGER.length) % STAGGER.length];
  return { stickerId, cx: 0.5 + dx, cy: 0.5 + dy, w: STICKER_W_DEFAULT };
}

/**
 * @param {number} aspect lebar/tinggi STICKER (dari katalog).
 * @param {number} imageAspect lebar/tinggi GAMBAR DASAR — dibutuhkan karena `w`
 *   diukur terhadap lebar sedangkan batas vertikal diukur terhadap tinggi.
 */
export function clampPlacement(placement, aspect, imageAspect) {
  const w = clampNumber(placement.w, STICKER_W_MIN, STICKER_W_MAX);
  // Tinggi sticker sebagai pecahan TINGGI gambar.
  const h = (w / aspect) * imageAspect;
  // Titik tengah boleh keluar tepi sejauh (setengah − bagian wajib terlihat).
  const slackX = w / 2 - w * MIN_VISIBLE;
  const slackY = h / 2 - h * MIN_VISIBLE;
  return {
    stickerId: placement.stickerId,
    cx: clampNumber(placement.cx, -slackX, 1 + slackX),
    cy: clampNumber(placement.cy, -slackY, 1 + slackY),
    w,
  };
}

export function placementToRect(placement, aspect, boxW, boxH) {
  const w = placement.w * boxW;
  const h = w / aspect;
  return { x: placement.cx * boxW - w / 2, y: placement.cy * boxH - h / 2, w, h };
}

export function rectToPlacement(rect, boxW, boxH) {
  return {
    stickerId: rect.stickerId,
    cx: (rect.x + rect.w / 2) / boxW,
    cy: (rect.y + rect.h / 2) / boxH,
    w: rect.w / boxW,
  };
}

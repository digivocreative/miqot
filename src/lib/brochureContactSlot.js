/**
 * Pencari "kotak kontak" pada brosur paket umroh.
 *
 * Brosur datang dari hulu (admin Alhijaz) sebagai gambar jadi, dan SETIAP
 * template menyisakan satu area kosong di strip paling bawah untuk diisi
 * identitas agent — di sebelah label "Konsultasi Umrah Hubungi!",
 * "Informasi & Pendaftaran:", atau pil kosong "Konsultasi Umrah Hubungi :".
 * Selama ini area itu terkirim ke calon jamaah dalam keadaan KOSONG.
 *
 * Modul ini mencari area tersebut dengan mengukur, bukan dengan menghafal
 * koordinat. Alasannya ditemukan lewat 19 brosur asli: ada EMPAT ukuran kanvas
 * (1080×1440, 1081×1440, 1200×1600, 1279×1600) dan setidaknya enam susunan
 * strip bawah. Koordinat tetap dijamin salah, cepat atau lambat.
 *
 * ATURAN YANG MEMBUATNYA BENAR — jangan dilonggarkan tanpa menguji ulang ke-19
 * fixture:
 *
 * 1. Perseginya harus MENYENTUH DASAR (2,5% terbawah). Tanpa jangkar ini,
 *    "persegi kosong terbesar" memilih bagian dalam panel "Tidak Termasuk" yang
 *    ada di ATAS strip kontak — terbukti salah sasaran di 6 dari 19 brosur.
 * 2. Yang dipilih perseginya yang TERLUAS, bukan irisan baris. Irisan bikin
 *    satu baris jelek menyempitkan hasil (kotak keemasan menciut jadi 0,59–0,92
 *    padahal ruang aslinya 0,40–0,94).
 * 3. Piksel gelap otomatis memotong persegi. Ini yang membuat label
 *    "Informasi & Pendaftaran:" tidak tertimpa: barisnya tidak putih, jadi
 *    persegi berhenti di bawahnya.
 * 4. Hanya 10% baris terbawah yang dipindai. Di atas itu ada panel harga dan
 *    daftar fasilitas yang juga putih dan lebar.
 *
 * Blok merah berisi nomor izin ("Izin Umrah No. U.490 Tahun 2020") di keluarga
 * template keemasan aman dengan sendirinya: warnanya merah, jadi tidak pernah
 * masuk mask, jadi tidak pernah masuk persegi.
 */

/**
 * Semua ambang dalam rasio terhadap ukuran gambar, tidak pernah piksel tetap —
 * empat ukuran kanvas beredar sekaligus.
 */
export const CONTACT_SLOT = {
  /** Bagian bawah gambar yang dipindai. */
  scanRatio: 0.1,
  /** Persegi wajib menyentuh pita setinggi ini di dasar gambar. */
  anchorRatio: 0.025,
  /** Ambang minimum agar sebuah kotak dianggap slot kontak, bukan celah. */
  minWidthRatio: 0.22,
  minHeightRatio: 0.02,
  /**
   * Piksel diambil tiap 2 px di kedua sumbu. Slot terkecil yang pernah diukur
   * 444×40, jadi kisi 2 px masih memberi 222×20 sel — jauh dari kasar, tapi
   * memangkas kerja jadi seperempat.
   */
  step: 2,
  /**
   * Ambang "putih". Sengaja 236, bukan 250: tepi kotak putih pada brosur
   * ter-JPEG punya dering kompresi, dan pita putihnya sendiri kadang #FEFEFE.
   */
  whiteLevel: 236,
};

/**
 * @param {object} region Potongan bawah gambar dalam bentuk RGBA.
 * @param {Uint8ClampedArray} region.data Panjang = width × height × 4.
 * @param {number} region.width Lebar potongan = lebar gambar penuh.
 * @param {number} region.height Tinggi potongan.
 * @param {number} region.offsetY Baris pertama potongan pada gambar penuh.
 * @param {number} region.imageHeight Tinggi gambar penuh — semua ambang rasio
 *   dihitung terhadap ini, bukan terhadap tinggi potongan.
 * @returns {{x: number, y: number, width: number, height: number} | null}
 *   Kotak dalam koordinat GAMBAR PENUH, atau null kalau tidak ada yang layak.
 */
export function findContactSlot(region) {
  const { data, width, height, offsetY, imageHeight } = region || {};
  if (!data || !width || !height || !imageHeight) return null;
  if (data.length < width * height * 4) return null;

  const { step, whiteLevel, anchorRatio, minWidthRatio, minHeightRatio } = CONTACT_SLOT;
  const cols = Math.ceil(width / step);
  const rows = Math.ceil(height / step);
  if (cols < 2 || rows < 2) return null;

  // up[c] = berapa sel putih beruntun ke ATAS dari baris berjalan. Dihitung
  // sekali sambil menurun, dipakai ulang oleh setiap baris jangkar.
  const up = new Int32Array(cols);
  const upByRow = [];
  for (let r = 0; r < rows; r++) {
    const y = Math.min(r * step, height - 1);
    const rowBase = y * width * 4;
    for (let c = 0; c < cols; c++) {
      const x = Math.min(c * step, width - 1);
      const i = rowBase + x * 4;
      const white = data[i] > whiteLevel && data[i + 1] > whiteLevel && data[i + 2] > whiteLevel;
      up[c] = white ? up[c] + 1 : 0;
    }
    upByRow.push(Int32Array.from(up));
  }

  const minCols = Math.max(1, Math.ceil((width * minWidthRatio) / step));
  const minRows = Math.max(1, Math.ceil((imageHeight * minHeightRatio) / step));
  const anchorTop = imageHeight - imageHeight * anchorRatio;

  let bestArea = 0;
  let best = null;

  for (let r = 0; r < rows; r++) {
    if (offsetY + r * step < anchorTop) continue;
    const heights = upByRow[r];
    // Persegi terbesar dalam histogram, disaring oleh ambang minimum.
    const stack = [];
    for (let c = 0; c <= cols; c++) {
      const cur = c < cols ? heights[c] : 0;
      let start = c;
      while (stack.length && stack[stack.length - 1][1] >= cur) {
        const [s, h] = stack.pop();
        const w = c - s;
        if (h >= minRows && w >= minCols) {
          const area = h * w;
          if (area > bestArea) {
            bestArea = area;
            best = { c1: s, c2: c, r1: r - h + 1, r2: r + 1 };
          }
        }
        start = s;
      }
      stack.push([start, cur]);
    }
  }

  if (!best) return null;

  const x = best.c1 * step;
  const x2 = Math.min(best.c2 * step, width);
  const y = offsetY + best.r1 * step;
  const y2 = Math.min(offsetY + best.r2 * step, imageHeight);
  if (x2 - x < width * minWidthRatio) return null;
  if (y2 - y < imageHeight * minHeightRatio) return null;
  return { x, y, width: x2 - x, height: y2 - y };
}

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
 * strip bawah. Koordinat tetap dijamin salah, cepat atau lambat. Per Oktober
 * 2026 sudah 150 brosur dan 14 ukuran kanvas, dari 960×1280 sampai 4500×6000.
 *
 * ATURAN YANG MEMBUATNYA BENAR — jangan dilonggarkan tanpa menguji ulang ke
 * brosur produksi:
 *
 * 1. Perseginya harus MENYENTUH DASAR (2,5% terbawah). Tanpa jangkar ini,
 *    "persegi kosong terbesar" memilih bagian dalam panel "Tidak Termasuk" yang
 *    ada di ATAS strip kontak — terbukti salah sasaran di 6 dari 19 brosur.
 * 2. Yang dipilih persegi dengan LUAS TERPAKAI terbesar, bukan irisan baris dan
 *    bukan luas mentah. Isinya satu baris, jadi tinggi di atas `usableAspect` ×
 *    lebar tidak menambah apa pun; luas mentah sempat memilih celah tinggi di
 *    SAMPING label "Informasi & Pendaftaran:" alih-alih kotak lebar di
 *    bawahnya (template keemasan 960×1280).
 * 3. Piksel gelap otomatis memotong persegi. Ini yang membuat label
 *    "Informasi & Pendaftaran:" tidak tertimpa: barisnya tidak putih, jadi
 *    persegi berhenti di bawahnya.
 * 4. Hanya 10% baris terbawah yang dipindai. Di atas itu ada panel harga dan
 *    daftar fasilitas yang juga putih dan lebar.
 * 5. Satu sel dianggap kosong hanya kalau KEEMPAT pikselnya kosong. Template
 *    Ramadhan menggambar garis tepi kotak setebal 1 px di koordinat ganjil;
 *    sampel satu piksel per sel melompatinya dan menyatukan kotak dengan
 *    margin di luarnya.
 *
 * Dua tahap, berurutan:
 *
 * - Tahap 1 mencari isian PUTIH — 138 dari 150 brosur per Oktober 2026
 *   memakai itu. Blok merah berisi nomor izin ("Izin Umrah No. U.490 Tahun 2020") di
 *   keluarga template keemasan aman dengan sendirinya: warnanya merah, jadi
 *   tidak pernah masuk mask, jadi tidak pernah masuk persegi.
 * - Tahap 2 hanya berjalan kalau tahap 1 tak menemukan apa pun: kotak isian
 *   BERWARNA (kuning di template Ramadhan/Sya'ban, marun di Syawal/Lailatul
 *   Qadr). Warna kandidat diambil dari pita jangkar, dan perseginya wajib
 *   TERTUTUP di atas, kiri, dan kanan — latar polos yang membentang dari tepi
 *   ke tepi bukan kotak isian. Kalau tahap 2 ikut berlomba saat ada kotak
 *   putih, blok merah semacam "PT. ALHIJAZ INDOWISATA" bisa merebut tempatnya.
 *
 * Di tahap 1, pil label yang menyentuh dasar didahulukan. Template berlatar
 * putih (Jum'atain, Akhir Tahun, Milad) menaruh pil merah "Konsultasi Umrah
 * Hubungi!" di pojok kiri bawah dan membiarkan kanannya terbuka sampai baris
 * teks di atasnya. Persegi putih terbesarnya jauh lebih tinggi daripada pil —
 * teks yang dipusatkan di situ melayang di atas pil — atau malah ada di pojok
 * lain yang tak ada hubungannya dengan label itu. Yang dipakai karenanya pita
 * setinggi pil, tepat di kanannya.
 */

/**
 * Semua ambang dalam rasio terhadap ukuran gambar, tidak pernah piksel tetap —
 * banyak ukuran kanvas beredar sekaligus.
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
  /**
   * Tinggi yang terpakai dibatasi lebar × ini saat menilai persegi. Cermin
   * AGENT_BLOCK.widthCapRatio: tinggi di atas itu tak pernah sampai ke huruf.
   */
  usableAspect: 0.115,
  /**
   * Tahap 2: selisih per kanal yang masih dihitung "warna isian yang sama".
   * Sama longgarnya dengan whiteLevel (255 − 236 = 19).
   */
  fillTolerance: 20,
  /** Tahap 2: berapa warna kandidat dari pita jangkar yang diuji. */
  maxFills: 6,
  /** Tahap 2: bagian sisi atas/kiri/kanan persegi yang wajib tertutup tepi. */
  edgeCoverage: 0.6,
  /**
   * Tahap 2: tepi dicari sampai sejauh bagian ini dari tinggi persegi ke luar.
   * Kotak isian bersudut bulat: lengkungnya membuat persegi kosong terbesar
   * berhenti beberapa sel SEBELUM garis tepi kiri-kanannya.
   */
  edgeReachRatio: 0.5,
  /**
   * Lebar minimum pil label di baris terbawah. Pil yang terukur 30–42% lebar
   * gambar; ambang ini menyaring ikon, logo, dan ujung pita ilustrasi yang
   * kebetulan menyentuh dasar. Latar yang membentang sampai tepi kanan
   * (keluarga pil) gugur dengan sendirinya: tak ada ruang di kanannya.
   */
  labelMinWidthRatio: 0.15,
  /** Pita harus mulai paling jauh sejauh ini dari ujung kanan pil. */
  labelReachRatio: 0.06,
  /** Puncak pil = persentil ini dari puncak per kolom (lihat labelBand). */
  labelTopPercentile: 0.1,
  /**
   * Lebar minimum pita di kanan pil. Lebih longgar daripada minWidthRatio
   * karena letaknya sudah ditunjuk pilnya, bukan ditebak dari celah.
   */
  bandMinWidthRatio: 0.15,
};

/**
 * @param {object} region Potongan bawah gambar dalam bentuk RGBA.
 * @param {Uint8ClampedArray} region.data Panjang = width × height × 4.
 * @param {number} region.width Lebar potongan = lebar gambar penuh.
 * @param {number} region.height Tinggi potongan.
 * @param {number} region.offsetY Baris pertama potongan pada gambar penuh.
 * @param {number} region.imageHeight Tinggi gambar penuh — semua ambang rasio
 *   dihitung terhadap ini, bukan terhadap tinggi potongan.
 * @returns {{x: number, y: number, width: number, height: number, fill: number[]} | null}
 *   Kotak dalam koordinat GAMBAR PENUH beserta warna rata-rata isiannya, atau
 *   null kalau tidak ada yang layak.
 */
export function findContactSlot(region) {
  const { data, width, height, offsetY = 0, imageHeight } = region || {};
  if (!data || !width || !height || !imageHeight) return null;
  if (data.length < width * height * 4) return null;

  const { step, whiteLevel, anchorRatio, minWidthRatio, minHeightRatio } = CONTACT_SLOT;
  const cols = Math.ceil(width / step);
  const rows = Math.ceil(height / step);
  if (cols < 2 || rows < 2) return null;

  const anchorTop = imageHeight - imageHeight * anchorRatio;
  let anchorRow = rows;
  for (let r = 0; r < rows; r++) {
    if (offsetY + r * step >= anchorTop) { anchorRow = r; break; }
  }
  if (anchorRow >= rows) return null;

  const grid = {
    data, width, height, cols, rows, step, anchorRow,
    minCols: Math.max(1, Math.ceil((width * minWidthRatio) / step)),
    minRows: Math.max(1, Math.ceil((imageHeight * minHeightRatio) / step)),
  };

  // ── Tahap 1: isian putih.
  const isWhite = (i) => data[i] > whiteLevel && data[i + 1] > whiteLevel && data[i + 2] > whiteLevel;
  const white = buildMask(grid, isWhite);
  let rect = labelBand(grid, white) || largestAnchoredRect(grid, white, { minCols: grid.minCols, minRows: grid.minRows });

  // ── Tahap 2: kotak isian berwarna — hanya kalau tak ada yang putih.
  if (!rect) {
    let bestScore = 0;
    for (const fill of candidateFills(grid, isWhite)) {
      const tol = CONTACT_SLOT.fillTolerance;
      const near = (i) =>
        Math.abs(data[i] - fill[0]) <= tol &&
        Math.abs(data[i + 1] - fill[1]) <= tol &&
        Math.abs(data[i + 2] - fill[2]) <= tol;
      const candidateMask = buildMask(grid, near);
      const candidate = largestAnchoredRect(grid, candidateMask, { minCols: grid.minCols, minRows: grid.minRows });
      if (!candidate || !isEnclosed(grid, candidateMask, candidate)) continue;
      if (candidate.score > bestScore) {
        bestScore = candidate.score;
        rect = candidate;
      }
    }
  }
  if (!rect) return null;

  const x = rect.c1 * step;
  const x2 = Math.min(rect.c2 * step, width);
  const y = offsetY + rect.r1 * step;
  const y2 = Math.min(offsetY + rect.r2 * step, imageHeight);
  return { x, y, width: x2 - x, height: y2 - y, fill: meanFill(grid, rect) };
}

/**
 * Mask per sel: 1 = keempat pikselnya lolos `isBlank`. Satu piksel saja yang
 * gagal sudah cukup memotong — itu yang menangkap garis tepi setebal 1 px.
 */
function buildMask(grid, isBlank) {
  const { data, width, height, cols, rows, step } = grid;
  const mask = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const y0 = r * step;
    const y1 = Math.min(y0 + step, height);
    for (let c = 0; c < cols; c++) {
      const x0 = c * step;
      const x1 = Math.min(x0 + step, width);
      let blank = 1;
      for (let y = y0; y < y1 && blank; y++) {
        const rowBase = y * width * 4;
        for (let xx = x0; xx < x1; xx++) {
          if (!isBlank(rowBase + xx * 4)) { blank = 0; break; }
        }
      }
      mask[r * cols + c] = blank;
    }
  }
  return mask;
}

/**
 * Persegi kosong dengan luas terpakai terbesar yang baris terbawahnya ada di
 * pita jangkar. Baris di atas `rowStart` dan kolom di kiri `colStart`
 * diperlakukan penuh, dan persegi yang mulai di kanan `maxStartCol` diabaikan
 * (dipakai pencarian pita yang harus menempel di kanan pil).
 */
function largestAnchoredRect(grid, mask, { minCols, minRows, rowStart = 0, colStart = 0, maxStartCol = Infinity }) {
  const { cols, rows, anchorRow } = grid;
  const aspect = CONTACT_SLOT.usableAspect;
  const up = new Int32Array(cols);
  let best = null;
  for (let r = rowStart; r < rows; r++) {
    for (let c = 0; c < cols; c++) up[c] = c >= colStart && mask[r * cols + c] ? up[c] + 1 : 0;
    if (r < anchorRow) continue;
    // Persegi terbesar dalam histogram, disaring oleh ambang minimum.
    const stack = [];
    for (let c = 0; c <= cols; c++) {
      const cur = c < cols ? up[c] : 0;
      let start = c;
      while (stack.length && stack[stack.length - 1][1] >= cur) {
        const [s, h] = stack.pop();
        const w = c - s;
        if (h >= minRows && w >= minCols && s <= maxStartCol) {
          const score = w * Math.min(h, w * aspect);
          if (!best || score > best.score) best = { c1: s, c2: c, r1: r - h + 1, r2: r + 1, score };
        }
        start = s;
      }
      stack.push([start, cur]);
    }
  }
  return best;
}

/**
 * Warna kandidat tahap 2: warna terbanyak di pita jangkar. Kotak isian wajib
 * menyentuh pita itu, jadi warnanya pasti ada di sana. Putih dilewati —
 * tahap 1 sudah mencarinya.
 */
function candidateFills(grid, isWhite) {
  const { data, width, cols, rows, step, anchorRow, minCols } = grid;
  const bins = new Map();
  for (let r = anchorRow; r < rows; r++) {
    const rowBase = r * step * width * 4;
    for (let c = 0; c < cols; c++) {
      const i = rowBase + c * step * 4;
      if (isWhite(i)) continue;
      const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
      const bin = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      bin.n++;
      bin.r += data[i];
      bin.g += data[i + 1];
      bin.b += data[i + 2];
      bins.set(key, bin);
    }
  }
  const fills = [];
  const sorted = [...bins.values()].filter((b) => b.n >= minCols).sort((a, b) => b.n - a.n);
  for (const bin of sorted) {
    const fill = [bin.r / bin.n, bin.g / bin.n, bin.b / bin.n];
    // Satu warna yang kebetulan jatuh di perbatasan dua bin cukup diuji sekali.
    if (fills.some((f) => f.every((v, k) => Math.abs(v - fill[k]) <= 8))) continue;
    fills.push(fill);
    if (fills.length >= CONTACT_SLOT.maxFills) break;
  }
  return fills;
}

/**
 * Kotak isian berwarna = tertutup tepi di atas, kiri, dan kanan, dalam jarak
 * dekat. Persegi yang menyentuh tepi gambar atau puncak area pindai adalah
 * latar, bukan kotak.
 */
function isEnclosed(grid, mask, rect) {
  const { cols } = grid;
  if (rect.r1 === 0 || rect.c1 === 0 || rect.c2 >= cols) return false;
  const w = rect.c2 - rect.c1;
  const h = rect.r2 - rect.r1;
  const reach = Math.max(2, Math.ceil(h * CONTACT_SLOT.edgeReachRatio));
  const need = CONTACT_SLOT.edgeCoverage;

  let top = 0;
  for (let c = rect.c1; c < rect.c2; c++) {
    for (let r = rect.r1 - 1; r >= Math.max(0, rect.r1 - reach); r--) {
      if (!mask[r * cols + c]) { top++; break; }
    }
  }
  let left = 0;
  let right = 0;
  for (let r = rect.r1; r < rect.r2; r++) {
    for (let c = rect.c1 - 1; c >= Math.max(0, rect.c1 - reach); c--) {
      if (!mask[r * cols + c]) { left++; break; }
    }
    for (let c = rect.c2; c < Math.min(cols, rect.c2 + reach); c++) {
      if (!mask[r * cols + c]) { right++; break; }
    }
  }
  return top >= w * need && left >= h * need && right >= h * need;
}

/**
 * Pita setinggi pil label, tepat di kanan pil. Pil = deret sel penuh di baris
 * TERBAWAH; puncaknya diukur per kolom sebagai puncak deret sel penuh yang naik
 * dari dasar. Pil keluarga pita yang mengapung di tengah pita putih tidak
 * menyentuh dasar, jadi tak pernah terhitung. Panel merah keluarga keemasan
 * memang menyentuh dasar, tapi menjulang jauh di atas kotak putihnya — pita
 * setinggi panel itu terpotong label "Informasi & Pendaftaran:", jadi gugur.
 *
 * Puncak pil = persentil `labelTopPercentile` dari puncak per kolom, bukan
 * yang tertinggi. Teks putih di dalam pil MENURUNKAN puncak kolom-kolomnya
 * (deretnya putus di huruf), sementara hiasan kecil yang menempel di atas pil
 * MENAIKKAN puncak segelintir kolom — brosur Milad punya keduanya.
 *
 * @returns persegi pita, atau null kalau tidak ada pil yang memenuhi.
 */
function labelBand(grid, mask) {
  const { cols, rows, width, step } = grid;
  const bottom = rows - 1;
  const minLabel = Math.ceil((width * CONTACT_SLOT.labelMinWidthRatio) / step);
  const reach = Math.max(1, Math.ceil((width * CONTACT_SLOT.labelReachRatio) / step));
  const minCols = Math.max(1, Math.ceil((width * CONTACT_SLOT.bandMinWidthRatio) / step));

  let best = null;
  for (let c = 0; c < cols;) {
    if (mask[bottom * cols + c]) { c++; continue; }
    const start = c;
    while (c < cols && !mask[bottom * cols + c]) c++;
    const end = c;
    if (end - start < minLabel || end >= cols) continue;

    const tops = [];
    for (let k = start; k < end; k++) {
      let r = bottom;
      while (r >= 0 && !mask[r * cols + k]) r--;
      tops.push(r + 1);
    }
    tops.sort((a, b) => a - b);
    const top = tops[Math.floor(tops.length * CONTACT_SLOT.labelTopPercentile)];
    const bandRows = rows - top;
    if (bandRows < grid.minRows) continue;

    const band = largestAnchoredRect(grid, mask, {
      rowStart: top,
      colStart: end,
      maxStartCol: end + reach,
      minRows: Math.max(grid.minRows, bandRows - 1),
      minCols,
    });
    if (band && (!best || band.score > best.score)) best = band;
  }
  return best;
}

function meanFill(grid, rect) {
  const { data, width, step } = grid;
  let n = 0;
  const sum = [0, 0, 0];
  for (let r = rect.r1; r < rect.r2; r++) {
    const rowBase = r * step * width * 4;
    for (let c = rect.c1; c < rect.c2; c++) {
      const i = rowBase + c * step * 4;
      sum[0] += data[i];
      sum[1] += data[i + 1];
      sum[2] += data[i + 2];
      n++;
    }
  }
  return n ? sum.map((v) => Math.round(v / n)) : [255, 255, 255];
}

/**
 * Tata letak blok identitas agent di dalam kotak kontak brosur.
 *
 * Pasangan dari src/lib/brochureContactSlot.js: yang itu MENEMUKAN kotaknya,
 * yang ini MENGISI-nya. Dipisah karena keduanya gagal dengan cara berbeda —
 * kotak yang salah temu kelihatan sebagai tulisan di tempat aneh, tata letak
 * yang salah kelihatan sebagai teks bertabrakan — dan karena keduanya jadi bisa
 * diuji tanpa DOM sama sekali.
 *
 * Isinya sengaja cuma DUA: nama dan nomor WhatsApp, dalam SATU baris. Foto dan
 * alamat landing sempat ada lalu dibuang (permintaan user 2026-09-01) justru
 * demi ukuran huruf: satu baris berarti seluruh tinggi kotak jadi milik satu
 * baris teks, bukan dibagi dua, dan ruang bekas foto (±1,14× tinggi isi)
 * ikut jatuh ke teks. Di kotak pil yang paling sempit sekalipun itu menaikkan
 * ukuran huruf sekitar sepertiga.
 *
 * ATURAN POKOK: setiap ukuran adalah turunan TINGGI KOTAK, tidak pernah lebar
 * layar dan tidak pernah piksel tetap. Sama seperti WATERMARK di
 * src/components/PhotoWatermark.tsx, dan alasannya sama: berkas yang diunduh
 * dari ponsel dan dari desktop harus identik. Kotak yang ditemukan di 19 brosur
 * asli berkisar 308×54 sampai 758×74 — bahkan ada yang 520×160 — jadi blok ini
 * memang harus bisa memuai dan menyusut, bukan sekadar digeser.
 *
 * Pengukuran lebar teks disuntikkan lewat `measure` supaya modul ini tetap
 * murni: kanvas menyediakan ctx.measureText, tes menyediakan penggaris palsu.
 */

export const AGENT_BLOCK = {
  /**
   * Tinggi isi dibatasi oleh LEBAR kotak juga, bukan tingginya saja. Tanpa ini,
   * kotak 520×160 (template berlatar putih) menghasilkan huruf setinggi judul
   * yang toh langsung disusutkan lagi oleh pemas baris di bawah.
   */
  widthCapRatio: 0.115,
  /** Jarak isi ke tepi kiri/kanan kotak, kelipatan tinggi isi. */
  padXRatio: 0.3,
  /**
   * Ukuran huruf awal = tinggi isi × ini. Satu baris, jadi angkanya jauh lebih
   * besar daripada saat masih ada baris alamat di bawah nama (dulu 0,45).
   * Ini titik AWAL; pemas baris di bawah yang menentukan angka akhirnya.
   */
  singleLineRatio: 0.7,
  /** Lantai penyusutan sebelum nama mulai dipotong elipsis. */
  fontFloorRatio: 0.34,
  /**
   * Ikon dan jarak ikut UKURAN HURUF, bukan tinggi kotak — supaya saat baris
   * disusutkan agar muat, ikonnya ikut mengecil dan proporsinya tetap.
   */
  waIconRatio: 1,
  waGapRatio: 0.32,
  /** Jarak minimum antara nama dan blok WhatsApp, kelipatan ukuran huruf. */
  columnGapRatio: 0.6,
  /**
   * Kotak yang lebih pendek dari ini bukan slot kontak yang bisa diisi dengan
   * layak — pemanggil sebaiknya jatuh ke pita tambahan.
   */
  minHeight: 18,
  /**
   * Tumpukan huruf sengaja sama dengan WATERMARK: font ini sudah pasti termuat
   * di aplikasi, dan kanvas yang menggambar huruf belum termuat diam-diam
   * mengganti bentuknya.
   */
  fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  colors: {
    name: '#8A0B0A',
    phone: '#8A0B0A',
    waIcon: '#1FA855',
  },
};

/** Potong teks sampai muat, dengan elipsis. Mengembalikan '' kalau tak ada yang muat. */
export function ellipsize(text, maxWidth, measureAt) {
  const full = String(text || '');
  if (!full) return '';
  if (measureAt(full) <= maxWidth) return full;
  let lo = 0;
  let hi = full.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measureAt(full.slice(0, mid) + '…') <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? full.slice(0, lo) + '…' : '';
}

/**
 * @param {object} input
 * @param {{x: number, y: number, width: number, height: number}} input.slot
 * @param {string} input.name Nama agent, apa adanya.
 * @param {string} input.phone Nomor SIAP TAMPIL, mis. "0812-3456-7890".
 *   Pemformatan tinggal di pemanggil supaya modul ini tidak ikut memikul
 *   aturan nomor Indonesia.
 * @param {(text: string, fontSize: number, weight: number) => number} input.measure
 * @returns {object | null} null kalau kotaknya terlalu kecil untuk diisi.
 */
export function layoutAgentBlock({ slot, name, phone, measure }) {
  if (!slot || !(slot.width > 0) || !(slot.height > 0) || typeof measure !== 'function') return null;

  const B = AGENT_BLOCK;
  const contentHeight = Math.min(slot.height, slot.width * B.widthCapRatio);
  if (contentHeight < B.minHeight) return null;

  const padX = contentHeight * B.padXRatio;
  const rowWidth = slot.width - padX * 2;
  if (rowWidth <= 0) return null;

  const nameText = String(name || '');
  const phoneText = String(phone || '');
  if (!nameText && !phoneText) return null;

  const left = slot.x + padX;
  const right = slot.x + slot.width - padX;
  const midY = slot.y + slot.height / 2;

  const waWidthAt = (fs) =>
    phoneText ? fs * B.waIconRatio + fs * B.waGapRatio + measure(phoneText, fs, 700) : 0;
  const rowWidthAt = (fs) => {
    const nameW = nameText ? measure(nameText, fs, 700) : 0;
    const gap = nameText && phoneText ? fs * B.columnGapRatio : 0;
    return nameW + gap + waWidthAt(fs);
  };

  // Satu ukuran huruf untuk nama DAN nomor: dua ukuran berbeda pada satu baris
  // pendek terbaca sebagai ketidaksengajaan. Dipaskan turun sampai muat.
  const floor = contentHeight * B.fontFloorRatio;
  let fontSize = contentHeight * B.singleLineRatio;
  while (fontSize > floor && rowWidthAt(fontSize) > rowWidth) {
    fontSize = Math.max(floor, fontSize - 0.5);
  }

  // Nomor tidak pernah dipotong — itu satu-satunya isi yang kalau salah,
  // brosurnya jadi menyesatkan, bukan sekadar jelek.
  const waWidth = waWidthAt(fontSize);
  const waX = right - waWidth;
  const nameBudget = Math.max(0, (phoneText ? waX - fontSize * B.columnGapRatio : right) - left);
  const nameFinal = ellipsize(nameText, nameBudget, (t) => measure(t, fontSize, 700));

  const waIconSize = fontSize * B.waIconRatio;

  return {
    contentHeight,
    fontSize,
    midY,
    name: nameFinal ? { x: left, midY, text: nameFinal } : null,
    wa: phoneText
      ? {
          iconX: waX,
          iconY: midY - waIconSize / 2,
          iconSize: waIconSize,
          textX: waX + waIconSize + fontSize * B.waGapRatio,
          midY,
          text: phoneText,
        }
      : null,
  };
}

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
 * Pengecualiannya kotak SEMPIT (pita di kanan pil template Milad, ±250 px):
 * sebaris, nama + nomor hanya muat dengan huruf ±12 px. Di situ keduanya
 * ditumpuk dua baris — tapi hanya kalau itu menaikkan huruf minimal seperempat.
 * Tujuannya tetap sama dengan keputusan satu baris tadi: huruf sebesar mungkin.
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
  /** Tumpukan dua baris: jeda antarbaris, kelipatan ukuran huruf. */
  stackGapRatio: 0.28,
  /** Bagian tinggi kotak yang boleh diisi dua baris; sisanya ruang napas. */
  stackFillRatio: 0.82,
  /**
   * Tumpukan dipakai hanya kalau hurufnya naik minimal sekian kali versi
   * sebaris. Pil 40 px dengan nama panjang cuma naik beberapa persen kalau
   * ditumpuk — dua baris sesak lebih jelek daripada elipsis di satu baris.
   */
  stackMinGain: 1.25,
  /**
   * Dalam tumpukan, huruf boleh menyusut sampai sekian kali ukuran awalnya agar
   * nama yang nyaris muat tampil utuh. Lebih dari itu namanya yang dielipsis:
   * huruf besar lebih penting daripada nama superpanjang yang lengkap.
   */
  stackNameShrink: 0.85,
  /**
   * Luminans isian kotak (0–255) di bawah angka ini digambar dengan teks terang.
   * Kotak marun template Syawal/Lailatul Qadr ±28; kuning Ramadhan ±219.
   */
  darkFillLuma: 140,
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
 * Nada isian kotak: 'dark' berarti teks harus terang. Tanpa info isian (kotak
 * lama, pita jaring pengaman) hasilnya 'light' — perilaku sebelum ada kotak
 * berwarna.
 *
 * @param {number[] | undefined} fill RGB rata-rata isian kotak.
 * @returns {'light' | 'dark'}
 */
export function fillTone(fill) {
  if (!Array.isArray(fill) || fill.length < 3) return 'light';
  const luma = 0.2126 * fill[0] + 0.7152 * fill[1] + 0.0722 * fill[2];
  return luma < AGENT_BLOCK.darkFillLuma ? 'dark' : 'light';
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

  const single = {
    contentHeight,
    fontSize,
    midY,
    stacked: false,
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

  const stacked = nameText && phoneText
    ? layoutStacked({ slot, nameText, phoneText, measure, contentHeight, left, rowWidth })
    : null;
  return stacked && stacked.fontSize >= fontSize * B.stackMinGain ? stacked : single;
}

/**
 * Nama di atas, ikon + nomor di bawah, rata kiri pada padding yang sama dengan
 * versi sebaris. Hurufnya tidak pernah melewati titik awal versi sebaris
 * (lebar kotak tetap yang menentukan seberapa besar isi boleh tampil).
 *
 * Aturan potongnya sama dengan versi sebaris: nomor tidak pernah dipotong,
 * nama boleh dielipsis. Sebelum memotong, huruf boleh menyusut sedikit
 * (sampai `stackNameShrink`) supaya nama yang nyaris muat tampil utuh.
 */
function layoutStacked({ slot, nameText, phoneText, measure, contentHeight, left, rowWidth }) {
  const B = AGENT_BLOCK;
  const waWidthAt = (fs) => fs * B.waIconRatio + fs * B.waGapRatio + measure(phoneText, fs, 700);
  let fontSize = Math.min(
    contentHeight * B.singleLineRatio,
    (slot.height * B.stackFillRatio) / (2 + B.stackGapRatio),
  );
  while (fontSize > 0 && waWidthAt(fontSize) > rowWidth) fontSize -= 0.5;
  if (!(fontSize > 0)) return null;

  const shrinkFloor = fontSize * B.stackNameShrink;
  let fitted = fontSize;
  while (fitted > shrinkFloor && measure(nameText, fitted, 700) > rowWidth) fitted -= 0.5;
  if (measure(nameText, fitted, 700) <= rowWidth) fontSize = fitted;
  const nameFinal = ellipsize(nameText, rowWidth, (t) => measure(t, fontSize, 700));
  if (!nameFinal) return null;

  const block = fontSize * (2 + B.stackGapRatio);
  const top = slot.y + (slot.height - block) / 2;
  const nameMidY = top + fontSize / 2;
  const waMidY = top + fontSize * (1 + B.stackGapRatio) + fontSize / 2;
  const iconSize = fontSize * B.waIconRatio;
  return {
    contentHeight,
    fontSize,
    midY: slot.y + slot.height / 2,
    stacked: true,
    name: { x: left, midY: nameMidY, text: nameFinal },
    wa: {
      iconX: left,
      iconY: waMidY - iconSize / 2,
      iconSize,
      textX: left + iconSize + fontSize * B.waGapRatio,
      midY: waMidY,
      text: phoneText,
    },
  };
}

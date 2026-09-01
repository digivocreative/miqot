/**
 * Tata letak blok identitas agent di dalam kotak kontak brosur.
 *
 * Pasangan dari src/lib/brochureContactSlot.js: yang itu MENEMUKAN kotaknya,
 * yang ini MENGISI-nya. Dipisah karena keduanya gagal dengan cara berbeda —
 * kotak yang salah temu kelihatan sebagai tulisan di tempat aneh, tata letak
 * yang salah kelihatan sebagai teks bertabrakan — dan karena keduanya jadi bisa
 * diuji tanpa DOM sama sekali.
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
   * kotak 520×160 (template berlatar putih) menghasilkan foto setinggi 160 px
   * yang menabrak dua sisi dan nama sebesar judul.
   */
  widthCapRatio: 0.115,
  /** Jarak isi ke tepi kiri/kanan kotak, kelipatan tinggi isi. */
  padXRatio: 0.3,
  photoRatio: 0.9,
  photoRingRatio: 0.045,
  photoGapRatio: 0.24,
  nameRatio: 0.45,
  landingRatio: 0.3,
  nameLineRatio: 1.12,
  landingLineRatio: 1.3,
  waIconRatio: 0.55,
  waGapRatio: 0.16,
  /** Jarak minimum antara kolom teks kiri dan blok WhatsApp di kanan. */
  columnGapRatio: 0.25,
  /** Nama boleh menyusut sampai serapuh ini sebelum dipotong elipsis. */
  nameShrinkFloor: 0.72,
  /** Blok WhatsApp tidak boleh memakan lebih dari separuh lebar yang tersedia. */
  waMaxShareOfRow: 0.5,
  /**
   * Kotak yang lebih pendek dari ini (relatif lebarnya) bukan slot kontak yang
   * bisa diisi dengan layak — pemanggil sebaiknya jatuh ke pita tambahan.
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
    landing: '#A8635F',
    phone: '#8A0B0A',
    waIcon: '#1FA855',
    photoRing: '#C9A24D',
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
 * @param {string} input.landing Mis. "alhijaz.co/nikita".
 * @param {string} input.phone Nomor SIAP TAMPIL, mis. "0812-3456-7890".
 *   Pemformatan tinggal di pemanggil (formatPhoneDisplay) supaya modul ini
 *   tidak ikut memikul aturan nomor Indonesia.
 * @param {(text: string, fontSize: number, weight: number) => number} input.measure
 * @returns {object | null} null kalau kotaknya terlalu kecil untuk diisi.
 */
export function layoutAgentBlock({ slot, name, landing, phone, measure }) {
  if (!slot || !(slot.width > 0) || !(slot.height > 0) || typeof measure !== 'function') return null;

  const B = AGENT_BLOCK;
  const contentHeight = Math.min(slot.height, slot.width * B.widthCapRatio);
  if (contentHeight < B.minHeight) return null;

  const padX = contentHeight * B.padXRatio;
  const rowWidth = slot.width - padX * 2;
  if (rowWidth <= 0) return null;

  const top = slot.y + (slot.height - contentHeight) / 2;
  const midY = top + contentHeight / 2;

  const photoSize = contentHeight * B.photoRatio;
  const photoX = slot.x + padX;
  const photoY = top + (contentHeight - photoSize) / 2;
  const textX = photoX + photoSize + contentHeight * B.photoGapRatio;

  const nameSizeMax = contentHeight * B.nameRatio;
  const landingSize = contentHeight * B.landingRatio;

  // ── Blok WhatsApp di kanan, diukur lebih dulu: ia yang menentukan sisa ruang
  //    untuk nama, bukan sebaliknya. Nomor tidak boleh pernah terpotong.
  const waIconSize = contentHeight * B.waIconRatio;
  const waGap = contentHeight * B.waGapRatio;
  const phoneText = String(phone || '');
  let waFontSize = nameSizeMax;
  let waTextWidth = phoneText ? measure(phoneText, waFontSize, 700) : 0;
  const waBudget = rowWidth * B.waMaxShareOfRow;
  const waFloor = contentHeight * 0.28;
  while (phoneText && waIconSize + waGap + waTextWidth > waBudget && waFontSize > waFloor) {
    waFontSize = Math.max(waFloor, waFontSize - 0.5);
    waTextWidth = measure(phoneText, waFontSize, 700);
  }
  const waWidth = phoneText ? waIconSize + waGap + waTextWidth : 0;
  const waX = slot.x + slot.width - padX - waWidth;

  // ── Kolom teks kiri mengisi apa pun yang tersisa.
  const textBudget = Math.max(0, waX - textX - (phoneText ? contentHeight * B.columnGapRatio : 0));

  const nameText = String(name || '');
  let nameSize = nameSizeMax;
  const nameFloor = nameSizeMax * B.nameShrinkFloor;
  while (nameText && measure(nameText, nameSize, 700) > textBudget && nameSize > nameFloor) {
    nameSize = Math.max(nameFloor, nameSize - 0.5);
  }
  const nameFinal = ellipsize(nameText, textBudget, (t) => measure(t, nameSize, 700));
  const landingFinal = ellipsize(String(landing || ''), textBudget, (t) => measure(t, landingSize, 500));

  const nameLineH = nameSize * B.nameLineRatio;
  const landingLineH = landingFinal ? landingSize * B.landingLineRatio : 0;
  const stackH = (nameFinal ? nameLineH : 0) + landingLineH;
  const textTop = top + (contentHeight - stackH) / 2;

  return {
    contentHeight,
    top,
    photo: {
      x: photoX,
      y: photoY,
      size: photoSize,
      ringWidth: Math.max(1, contentHeight * B.photoRingRatio),
    },
    name: nameFinal
      ? { x: textX, y: textTop, fontSize: nameSize, lineHeight: nameLineH, text: nameFinal }
      : null,
    landing: landingFinal
      ? {
          x: textX,
          y: textTop + (nameFinal ? nameLineH : 0),
          fontSize: landingSize,
          lineHeight: landingLineH,
          text: landingFinal,
        }
      : null,
    wa: phoneText
      ? {
          iconX: waX,
          iconY: midY - waIconSize / 2,
          iconSize: waIconSize,
          textX: waX + waIconSize + waGap,
          midY,
          fontSize: waFontSize,
          text: phoneText,
        }
      : null,
  };
}

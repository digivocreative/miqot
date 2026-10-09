// Utilitas bersama untuk desain brosur alternatif (Boarding Pass, Kartu,
// Kolom Harga, Kalender). Helper inti (format tanggal/harga/pill/dsb) tetap
// milik BrochureScheduleTemplate — file ini hanya menampung logika yang KHUSUS
// desain alternatif agar tidak menempel di template klasik.
import {
  MONTH_ABBR_ID,
  cleanPackageDisplayName,
  countTripDays,
  detectPackagePills,
  formatDepartureDay,
  formatHargaJt,
  type BrochureAgent,
  type BrochureMonth,
  type BrochurePackage,
  type PillTag,
} from '../BrochureScheduleTemplate';

// Prop kontrak seragam semua desain (klasik memakai superset-nya sendiri).
// `variant` hanya dipakai klasik (winter otomatis); desain lain mengabaikannya
// dengan tidak mendeklarasikannya — assignability TS tetap aman karena optional.
export interface BrochureDesignTemplateProps {
  month: BrochureMonth;
  agent: BrochureAgent;
  /** Diterima demi parity API dengan klasik; badge tanggal desain baru selalu
   *  menampilkan singkatan bulan sehingga aman untuk filter lintas-bulan. */
  showFullDate?: boolean;
  displayMode?: 'hari' | 'seat';
}

export function monthAbbrFromIso(iso: string, abbr: readonly string[]): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const m = parseInt(iso.slice(5, 7), 10);
  if (!Number.isFinite(m) || m < 1 || m > 12) return '';
  return abbr[m - 1] || '';
}

export function yearFromIso(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.slice(0, 4) : '';
}

// Chip penanda baris highlight: PROMO (flag API / kata di nama) atau HEMAT
// (hanya via nama). Mengembalikan null untuk baris biasa/sold-out.
export function promoChipLabel(p: BrochurePackage): 'PROMO' | 'HEMAT' | null {
  if (p.soldOut) return null;
  if (p.isPromo === true || /\bPROMO\b/i.test(p.nama)) return 'PROMO';
  if (/\bHEMAT\b/i.test(p.nama)) return 'HEMAT';
  return null;
}

// Saat chip PROMO tampil, kata "PROMO" di judul jadi redundan → buang.
// HEMAT dibiarkan di judul (bagian dari nama produk, mis. "UMRAH HEMAT").
export function stripPromoWord(name: string, chip: 'PROMO' | 'HEMAT' | null): string {
  if (chip !== 'PROMO') return name;
  const stripped = name
    .replace(/\bPROMO\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*\+\s*/, '')
    .trim();
  return stripped || name;
}

// Nama paket dari sumber kadang membawa durasi tertulis "11 HARI" (varian
// "11HR" sudah di-strip cleanPackageDisplayName). Desain baru menampilkan
// durasi/seat di kolom-chip khusus yang ikut toggle, jadi kata durasi di judul
// dibuang agar mode SEAT benar-benar bebas kata "HARI". Klasik tidak diubah.
export function stripDurationWord(name: string): string {
  const stripped = name
    .replace(/\b\d+\s*HARI\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*\+\s*$/, '')
    .trim();
  return stripped || name;
}

// Kota landing (dari server: arrival terakhir penerbangan berangkat) → kode
// IATA untuk baris rute desain Boarding Pass. Kota tak dikenal → null
// (baris rute disembunyikan, chip maskapai/durasi tetap tampil).
export function landingIata(landing: string | undefined | null): string | null {
  const s = String(landing || '').trim();
  if (!s) return null;
  if (/jed+ah|jedda|^jed$/i.test(s)) return 'JED';
  if (/madinah|madina|medina|^med$/i.test(s)) return 'MED';
  if (/riyadh|^ruh$/i.test(s)) return 'RUH';
  if (/taif|^tif$/i.test(s)) return 'TIF';
  if (/^[A-Za-z]{3}$/.test(s)) return s.toUpperCase();
  return null;
}

// Ukuran judul yang tetap muat satu baris (nowrap) di `widthPx`. Huruf
// Montserrat Black rata-rata ~0.66em per karakter; label filter non-bulan
// (Tipe Paket, Maskapai) bisa jauh lebih panjang dari "JANUARI 2027".
export function fitTitleFontSize(title: string, widthPx: number, maxPx: number, minPx: number): number {
  const len = Math.max(1, title.length);
  return Math.max(minPx, Math.min(maxPx, Math.floor(widthPx / (len * 0.66))));
}

// "JANUARI 2027" → { head: 'JANUARI', year: '2027' } untuk judul dua warna.
// Label tanpa tahun di ujung → year kosong, head = label utuh.
export function splitTitleYear(title: string): { head: string; year: string } {
  const year = title.match(/\d{4}$/)?.[0] ?? '';
  return { head: year ? title.replace(/\s+\d{4}$/, '') : title, year };
}

export interface BrochureRowModel {
  name: string;
  pills: PillTag[];
  chip: 'PROMO' | 'HEMAT' | null;
  soldOut: boolean;
  day: string;
  monthAbbr: string;
  /** "11 HARI" (mode hari) atau "SISA 25 SEAT" (mode seat); null = sembunyikan. */
  metaLabel: string | null;
  /** Angka kolom HARI/SISA untuk desain bertabel ('-' bila kosong). */
  metaValue: string;
  /** Sisa seat 1–5 di mode seat — layak diberi penanda mendesak. */
  seatCritical: boolean;
  /** "36.3" (juta) atau null → "Hubungi kami". */
  priceJt: string | null;
}

// Satu sumber turunan baris paket untuk desain Kartu/Kolom Harga/Kalender:
// nama bersih (tanpa PROMO bila chip PROMO tampil, tanpa "n HARI" karena
// durasi punya slotnya sendiri), pil, chip highlight, dan isi slot HARI/SEAT.
export function brochureRowModel(p: BrochurePackage, displayMode: 'hari' | 'seat'): BrochureRowModel {
  const chip = promoChipLabel(p);
  const soldOut = !!p.soldOut;
  const tripDays = p.hari ?? countTripDays(p.berangkat_tgl, p.pulang_tgl);
  const seat = p.seatSisa;
  const seatCritical = displayMode === 'seat' && !soldOut && typeof seat === 'number' && seat > 0 && seat <= 5;
  let metaLabel: string | null;
  let metaValue: string;
  if (displayMode === 'seat') {
    metaValue = typeof seat === 'number' ? String(seat) : '-';
    metaLabel = soldOut ? null : `SISA ${metaValue} SEAT`;
  } else {
    metaValue = tripDays ? String(tripDays) : '-';
    metaLabel = tripDays ? `${tripDays} HARI` : null;
  }
  return {
    name: stripDurationWord(stripPromoWord(cleanPackageDisplayName(p.nama), chip)),
    pills: detectPackagePills(p.nama, p.umrohDulu),
    chip,
    soldOut,
    day: formatDepartureDay(p.berangkat_tgl),
    monthAbbr: monthAbbrFromIso(p.berangkat_tgl, MONTH_ABBR_ID),
    metaLabel,
    metaValue,
    seatCritical,
    priceJt: typeof p.harga === 'number' ? formatHargaJt(p.harga) : null,
  };
}

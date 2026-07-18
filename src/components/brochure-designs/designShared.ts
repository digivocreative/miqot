// Utilitas bersama untuk desain brosur alternatif (Zamrud Royal, Boarding
// Pass, Senja Haramain). Helper inti (format tanggal/harga/pill/dsb) tetap
// milik BrochureScheduleTemplate — file ini hanya menampung logika yang KHUSUS
// desain baru agar tidak menempel di template klasik.
import type { BrochureAgent, BrochureMonth, BrochurePackage } from '../BrochureScheduleTemplate';

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

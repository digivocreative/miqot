/**
 * Deklarasi tipe untuk src/lib/brochureContactSlot.js — pencari area kosong di
 * strip bawah brosur paket, tempat identitas agent digambar.
 */

export interface ContactSlot {
  /** Koordinat dalam piksel GAMBAR PENUH. */
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * RGB rata-rata isian kotak. Diisi findContactSlot; penggambar memilih teks
   * terang di atas isian gelap. Kotak buatan pemanggil (pita jaring pengaman)
   * boleh tanpa ini.
   */
  fill?: [number, number, number];
}

export interface ContactSlotRegion {
  /** RGBA, panjang = width × height × 4. */
  data: Uint8ClampedArray;
  /** Lebar potongan; sama dengan lebar gambar penuh. */
  width: number;
  /** Tinggi potongan. */
  height: number;
  /** Baris pertama potongan pada gambar penuh. */
  offsetY: number;
  /** Tinggi gambar penuh — acuan semua ambang rasio. */
  imageHeight: number;
}

export declare const CONTACT_SLOT: {
  readonly scanRatio: number;
  readonly anchorRatio: number;
  readonly minWidthRatio: number;
  readonly minHeightRatio: number;
  readonly step: number;
  readonly whiteLevel: number;
  readonly usableAspect: number;
  readonly fillTolerance: number;
  readonly maxFills: number;
  readonly edgeCoverage: number;
  readonly edgeReachRatio: number;
  readonly labelMinWidthRatio: number;
  readonly labelReachRatio: number;
  readonly labelTopPercentile: number;
  readonly bandMinWidthRatio: number;
};

export declare function findContactSlot(region: ContactSlotRegion): ContactSlot | null;

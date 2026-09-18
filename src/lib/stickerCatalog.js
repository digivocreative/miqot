// Katalog sticker brosur.
//
// Daftarnya sengaja hardcode: sticker baru jarang, dan manifest/endpoint
// menambah mode gagal (JSON basi di cache CDN, folder listing yang butuh kunci
// Storage) untuk masalah yang tidak ada. Menambah sticker = unggah PNG ke
// Bunny, tambah satu baris di sini, jalankan `node scripts/build-sticker-thumbs.mjs`,
// commit thumbnail-nya. tests/sticker-catalog.test.js menolak baris tanpa
// thumbnail, jadi langkah terakhir itu tidak bisa terlupa diam-diam.
export const STICKER_BASE = 'https://alhijaz.b-cdn.net/sticker';
export const STICKER_THUMB_BASE = '/img-sticker';

export const STICKER_GROUPS = [
  { id: 'ketersediaan', label: 'Ketersediaan' },
  { id: 'populer', label: 'Populer' },
  { id: 'fasilitas', label: 'Fasilitas' },
  { id: 'plus', label: 'Plus' },
  { id: 'promo', label: 'Promo' },
];

// `aspect` = lebar/tinggi, DITULIS di sini dan tidak pernah dibaca dari
// naturalWidth saat runtime. Dua akibatnya: geometri tidak bergantung pada
// gambar sudah termuat atau belum, dan pratinjau (thumbnail lokal 256px)
// dijamin memakai rasio yang sama dengan komposit (PNG Bunny 1254px).
// Semua sticker saat ini 1254×1254 — diverifikasi 2026-09-18.
export const STICKERS = [
  { id: 'sisa-1-seat',       label: 'Sisa 1 Seat',       group: 'ketersediaan', aspect: 1 },
  { id: 'sisa-2-seat',       label: 'Sisa 2 Seat',       group: 'ketersediaan', aspect: 1 },
  { id: 'sisa-3-seat',       label: 'Sisa 3 Seat',       group: 'ketersediaan', aspect: 1 },
  { id: 'seat-terbatas',     label: 'Seat Terbatas',     group: 'ketersediaan', aspect: 1 },
  { id: 'tinggal-sedikit',   label: 'Tinggal Sedikit',   group: 'ketersediaan', aspect: 1 },
  { id: 'hampir-full',       label: 'Hampir Full',       group: 'ketersediaan', aspect: 1 },
  { id: 'last-seat',         label: 'Last Seat',         group: 'ketersediaan', aspect: 1 },
  { id: 'full-booked',       label: 'Full Booked',       group: 'ketersediaan', aspect: 1 },
  { id: 'sold-out',          label: 'Sold Out',          group: 'ketersediaan', aspect: 1 },
  { id: 'best-seller',       label: 'Best Seller',       group: 'populer',      aspect: 1 },
  { id: 'paling-dicari',     label: 'Paling Dicari',     group: 'populer',      aspect: 1 },
  { id: 'favorit-jamaah',    label: 'Favorit Jamaah',    group: 'populer',      aspect: 1 },
  { id: 'jadwal-favorit',    label: 'Jadwal Favorit',    group: 'populer',      aspect: 1 },
  { id: 'pilihan-keluarga',  label: 'Pilihan Keluarga',  group: 'populer',      aspect: 1 },
  { id: 'hotel-bintang-5',   label: 'Hotel Bintang 5',   group: 'fasilitas',    aspect: 1 },
  { id: 'hotel-dekat-haram', label: 'Hotel Dekat Haram', group: 'fasilitas',    aspect: 1 },
  { id: 'direct-flight',     label: 'Direct Flight',     group: 'fasilitas',    aspect: 1 },
  { id: 'plus-dubai',        label: 'Plus Dubai',        group: 'plus',         aspect: 1 },
  { id: 'plus-redsea',       label: 'Plus Red Sea',      group: 'plus',         aspect: 1 },
  { id: 'plus-turki',        label: 'Plus Turki',        group: 'plus',         aspect: 1 },
  { id: 'promo-terbatas',    label: 'Promo Terbatas',    group: 'promo',        aspect: 1 },
];

// Empat sticker yang dipamerkan di baris ajakan. Sengaja mewakili empat alasan
// berbeda (sisa seat, promo, fasilitas, populer) supaya agent langsung paham
// cakupannya, bukan mengira fiturnya cuma soal seat.
export const STICKER_PROMO_PREVIEW = ['sisa-1-seat', 'promo-terbatas', 'hotel-bintang-5', 'best-seller'];

const BY_ID = new Map(STICKERS.map(s => [s.id, s]));

export function stickerById(id) {
  return BY_ID.get(id) ?? null;
}

export function stickerFullUrl(id) {
  return `${STICKER_BASE}/${id}.png`;
}

export function stickerThumbUrl(id) {
  return `${STICKER_THUMB_BASE}/${id}.webp`;
}

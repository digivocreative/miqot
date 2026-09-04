// Presentasi share satu paket (/:slug/:jadwalId) — dipakai server.js (rute SSR
// + rute OG) dan lib/og-generator.mjs. Modul murni, tanpa dependensi eksternal.
//
// Sengaja sejalan dengan lib/itinerary-share-meta.js: judul memakai nama paket
// apa adanya + embel merek, nama agent hidup di deskripsi. Angka harga/kursi
// datang dari helper yang sama dengan halaman Brosur (lib/brochure-schedule.js)
// supaya kartu share dan kartu paket tidak pernah menyebut angka berbeda.

import { formatIdDate, formatPackageTitle } from './itinerary-share-meta.js';

// jadwal_id Alhijaz berbentuk huruf + angka (JBU1509, JHU0212). Dipakai sebagai
// saringan murah SEBELUM query DB: tanpa ini rute share ikut menyapa setiap
// path dua-segmen SPA (termasuk /assets/index-*.js) dengan satu hit Supabase.
export const PACKAGE_ID_RE = /^[A-Z]{2,6}\d{2,8}$/;

const DESCRIPTION_LIMIT = 160;

// Ambang "tinggal sedikit". Di atas ini jumlah kursi bukan urgensi, cuma angka.
const LOW_SEAT_THRESHOLD = 10;

const ROOM_LABEL_ID = { Quard: 'Quad', Triple: 'Triple', Double: 'Double' };

/** Nama tipe kamar seperti yang dibaca jamaah di kartu paket ("Quard" → "Quad"). */
export function roomLabelId(room) {
  const raw = String(room || '').trim();
  return ROOM_LABEL_ID[raw] || raw;
}

/** "Rp 39.9 Jt" — bentuk yang sama dengan harga header di kartu paket. */
export function formatPriceShort(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `Rp ${parseFloat((n / 1_000_000).toFixed(1))} Jt`;
}

/**
 * Catatan kursi — HANYA saat sisanya benar-benar sedikit dan masih di atas nol.
 * seat_sisa = 0 TIDAK berarti sold out: paket yang sudah berangkat pun dinolkan
 * di sumber, jadi "kursi habis" di situ akan jadi klaim palsu.
 */
export function seatNoteId(seatSisa) {
  const n = Number(seatSisa);
  if (!Number.isFinite(n) || n <= 0 || n > LOW_SEAT_THRESHOLD) return '';
  return `sisa ${n} kursi`;
}

/**
 * "MOVENPICK" → "Movenpick", "AL HARAM" → "Al Haram". Kata sandang Arab "AL"
 * lolos aturan akronim di formatPackageTitle (kode 1-3 huruf dibiarkan utuh),
 * jadi khusus nama hotel ia diturunkan di sini — bukan di daftar stopword
 * umum, karena di nama paket "AL" bisa saja bagian nama diri.
 */
export function formatHotelName(name) {
  return formatPackageTitle(name).replace(/\bAL\b/g, 'Al');
}

/**
 * Judul + deskripsi meta untuk satu paket. Deskripsi dirakit bertahap: kalau
 * melewati 160 karakter, klausa dibuang berurutan — tipe kamar & maskapai,
 * lalu catatan kursi, lalu embel merek. Klausa agent tak pernah dibuang.
 */
export function buildPackageShareMeta({
  paketName,
  packageId,
  departDate,
  durationDays,
  airline,
  priceFrom,
  priceRoom,
  seatSisa,
  agentName,
  isWaitingList = false,
} = {}) {
  const nama = formatPackageTitle(paketName) || String(packageId || '').toUpperCase();
  const title = isWaitingList
    ? 'Daftar Tunggu Umroh — Alhijaz Indowisata'
    : `${nama} — Alhijaz Indowisata`;

  const tgl = formatIdDate(departDate);
  const maskapai = formatPackageTitle(airline);
  const agent = String(agentName || '').trim();
  const hari = Number(durationDays) > 0 ? Number(durationDays) : 0;
  const harga = formatPriceShort(priceFrom);
  const kamar = roomLabelId(priceRoom);
  const kursi = seatNoteId(seatSisa);

  const compose = (level) => {
    const trip = hari ? `Umroh ${hari} hari` : 'Paket umroh';
    const withDate = tgl ? `${trip}, berangkat ${tgl}` : trip;
    const c1 = maskapai && level < 1 ? `${withDate} dengan ${maskapai}.` : `${withDate}.`;

    let c2 = '';
    if (harga) {
      const room = kamar && level < 1 ? ` (${kamar})` : '';
      const seat = kursi && level < 2 ? ` — ${kursi}` : '';
      c2 = `Mulai ${harga}/pax${room}${seat}.`;
    } else if (kursi && level < 2) {
      c2 = `Kuota ${kursi}.`;
    }

    const c3 = agent
      ? (level >= 3 ? `Bersama ${agent}.` : `Bersama ${agent} — Alhijaz Indowisata.`)
      : 'Alhijaz Indowisata.';

    return [c1, c2, c3].filter(Boolean).join(' ');
  };

  let description = isWaitingList
    ? `Daftar tunggu keberangkatan umroh Alhijaz Indowisata${agent ? ` bersama ${agent}` : ''}. Tinggalkan data Anda untuk diinfokan begitu jadwalnya dibuka.`
    : compose(0);

  for (let level = 1; level <= 3 && description.length > DESCRIPTION_LIMIT; level += 1) {
    description = compose(level);
  }

  return { title, description };
}

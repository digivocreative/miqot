// Presentasi share itinerary — dipakai server.js (rute SSR + rute OG) dan
// lib/og-generator.mjs. Modul murni, tanpa dependensi eksternal.
// Spec: docs/superpowers/specs/2026-07-31-itinerary-og-meta-design.md

import { computeNightSegments } from './itinerary-view.js';

// Label kota. Sumber kebenaran untuk tampilan web ada di
// src/components/itinerary/cityTheme.ts (CITY_LABEL); disalin ke sini karena
// modul TS itu tidak bisa diimpor server. Menambah kota = ubah keduanya.
export const CITY_LABEL_ID = {
  mekkah: 'Mekkah', madinah: 'Madinah', dubai: 'Dubai', turki: 'Turki',
  mesir: 'Mesir', transit: 'Transit', home: 'Indonesia',
};

// Palet kota untuk kartu OG berlatar burgundy gelap. SENGAJA berbeda dari
// CITY_HEX di cityTheme.ts, yang dikalibrasi untuk teks gelap di atas putih:
// dipakai apa adanya di sini semuanya gagal kontras, dan turki (#8A0F0A)
// identik dengan warna latar kartu sehingga segmennya hilang total.
export const OG_CITY_HEX = {
  mekkah: '#6BA3E8', madinah: '#3FA985', dubai: '#E0B93C', turki: '#F2827E',
  mesir: '#B08BE0', transit: '#9AA6B5', home: '#9AA6B5',
};

const TITLE_STOPWORDS = new Set(['BY', 'DAN', 'DI', 'KE', 'DARI']);
const DESCRIPTION_LIMIT = 160;

/**
 * jadwal_nama datang HURUF BESAR SEMUA dari sumber. Judul 60px huruf besar
 * semua memakan ruang jauh lebih banyak dan lebih lambat dibaca — tapi
 * toTitleCase generik akan merusak kode maskapai (SV → Sv) dan token berangka
 * (9H → 9h), jadi normalisasinya harus sadar bentuk token.
 */
export function formatPackageTitle(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (/[a-z]/.test(text)) return text; // sudah ditulis manusia, jangan diutak-atik
  return text
    .split(/(\s+)/)
    .map((token, i) => {
      if (!token.trim()) return token;
      if (/\d/.test(token)) return token;
      // Dicek sebelum aturan akronim, kalau tidak "BY" akan lolos sebagai
      // kode dua huruf dan tak pernah dikecilkan.
      if (TITLE_STOPWORDS.has(token)) {
        return i > 0 ? token.toLowerCase() : token.charAt(0) + token.slice(1).toLowerCase();
      }
      if (/^[A-Z]{1,3}$/.test(token)) return token;
      return token.charAt(0) + token.slice(1).toLowerCase();
    })
    .join('');
}

export function formatIdDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00Z`)
    : new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    }).format(parsed);
  } catch {
    return '';
  }
}

/**
 * Segmen malam untuk kartu OG. Memakai helper yang sama dengan JourneyStrip
 * supaya angka di kartu dan di halaman tidak pernah berbeda, termasuk
 * pembuangan segmen 'home' (malam di perjalanan pulang tak perlu disebut).
 */
export function ogSegments(days) {
  const segments = computeNightSegments(days);
  if (!segments) return null;
  const visible = segments.filter(s => s.key !== 'home');
  return visible.length ? visible : null;
}

export function segmentsSentence(segments) {
  if (!Array.isArray(segments) || !segments.length) return '';
  return `${segments.map(s => `${CITY_LABEL_ID[s.key] || s.key} ${s.nights}`).join(', ')} malam`;
}

/**
 * Judul + deskripsi meta. Deskripsi dirakit bertahap: kalau melewati batas
 * 160 karakter, klausa dibuang berurutan — maskapai, lalu rincian kota, lalu
 * embel merek. Klausa agent tidak pernah dibuang; setelah nama agent keluar
 * dari judul, di sinilah satu-satunya tempat ia muncul di teks meta.
 */
export function buildItineraryShareMeta({
  paketName,
  packageId,
  segments,
  dayCount,
  departDate,
  airline,
  agentName,
} = {}) {
  const nama = formatPackageTitle(paketName) || String(packageId || '').toUpperCase();
  const title = `Itinerary ${nama} — Alhijaz Indowisata`;

  const segmenText = segmentsSentence(segments);
  const tgl = formatIdDate(departDate);
  const maskapai = formatPackageTitle(airline);
  const agent = String(agentName || '').trim();
  const hari = Number(dayCount) > 0 ? `${Number(dayCount)} hari` : '';

  const compose = (level) => {
    const detailed = segmenText && level < 2;
    const c1 = detailed
      ? `Rencana perjalanan hari per hari: ${segmenText}.`
      : (hari ? `Rencana perjalanan ${hari}.` : 'Rencana perjalanan hari per hari.');
    const c2 = tgl
      ? (level >= 1 || !maskapai ? `Berangkat ${tgl}.` : `Berangkat ${tgl} dengan ${maskapai}.`)
      : '';
    const c3 = agent
      ? (level >= 3 ? `Bersama ${agent}.` : `Bersama ${agent} — Alhijaz Indowisata.`)
      : 'Alhijaz Indowisata.';
    return [c1, c2, c3].filter(Boolean).join(' ');
  };

  let description = compose(0);
  for (let level = 1; level <= 3 && description.length > DESCRIPTION_LIMIT; level += 1) {
    description = compose(level);
  }
  return { title, description };
}

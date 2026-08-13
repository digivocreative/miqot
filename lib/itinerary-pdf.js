// Logika murni untuk PDF "Rencana Perjalanan" — tanpa dependensi selain
// itinerary-view.js, supaya bisa diuji di node tanpa DOM.
// Spec: docs/superpowers/specs/2026-08-13-itinerary-pdf-versi-kita-design.md
import { itineraryDayDates } from './itinerary-view.js';

/**
 * Jam dari tabel jadwal memakai titik ("15.50") sedangkan jam dari itinerary
 * memakai titik dua ("21:15") — keduanya bersebelahan di satu baris kartu
 * penerbangan (temuan T-3). Hanya pemisahnya yang diseragamkan; string yang
 * tak berpola jam dibiarkan apa adanya supaya tidak pernah mengarang angka.
 */
export function normalizeJam(raw) {
  const s = String(raw ?? '').trim();
  const m = s.match(/^(\d{1,2})[.:](\d{1,2})$/);
  if (!m) return s;
  return `${m[1].padStart(2, '0')}:${m[2].padEnd(2, '0')}`;
}

function stops(rute) {
  return String(rute || '')
    .split(/[/,]|\s-\s|–/)
    .flatMap(s => s.split('-'))
    .map(s => s.trim())
    .filter((s, i, a) => s && s !== a[i - 1]);
}

/**
 * Dua leg siap render. `jamTiba` sengaja null bila sama dengan `jam`: untuk
 * banyak jadwal, `pulang_jam` justru berisi jam TIBA di Jakarta sehingga kartu
 * menampilkan "JED 16:00 → CGK 16:00" (temuan T-2). Menyembunyikan yang
 * duplikat lebih jujur daripada mencetak dua angka yang tak mungkin benar.
 */
export function flightLegView(paket, arrivals) {
  const legs = [
    ['Berangkat', paket?.keberangkatan, arrivals?.berangkat],
    ['Pulang', paket?.kepulangan, arrivals?.pulang],
  ];
  return legs.map(([kick, info, tiba]) => {
    const uniq = stops(info?.rute);
    const jam = normalizeJam(info?.jam);
    const jamTiba = normalizeJam(tiba);
    return {
      kick,
      tglISO: info?.tgl || '',
      dari: uniq[0] || '—',
      ke: uniq[uniq.length - 1] || '—',
      jam,
      jamTiba: jamTiba && jamTiba !== jam ? jamTiba : null,
      kode: info?.kodePenerbangan || '',
    };
  });
}

// Infant sengaja di luar: itu harga per orang, bukan kamar (sama seperti
// src/lib/packageTiers.js). Urutan = urutan tampil di blok harga.
const ROOM_TYPES = [
  ['Quard', 'Berempat'],
  ['Triple', 'Bertiga'],
  ['Double', 'Berdua'],
  ['Single', 'Sendiri'],
];

function toPrice(value) {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Satu baris per tier yang benar-benar dijual, termurah dulu. Paket bisa hanya
 * punya SATU tier (temuan T-4: JBU1504 hanya menjual HEMAT), jadi pemanggil
 * tak boleh mengasumsikan tiga. `kamar` berisi tipe kamar selain yang jadi
 * `mulaiDari`.
 */
export function priceRows(paket) {
  const harga = paket && typeof paket.harga === 'object' && paket.harga ? paket.harga : {};
  const rows = [];
  for (const tier of Object.keys(harga)) {
    const pricing = harga[tier];
    if (!pricing || typeof pricing !== 'object') continue;
    const kamar = ROOM_TYPES
      .map(([key, label]) => ({ label, harga: toPrice(pricing[key]) }))
      .filter(k => k.harga > 0);
    if (!kamar.length) continue;
    const mulaiDari = Math.min(...kamar.map(k => k.harga));
    rows.push({
      tier,
      mulaiDari,
      kamar: kamar.filter(k => k.harga !== mulaiDari),
    });
  }
  return rows.sort((a, b) => a.mulaiDari - b.mulaiDari);
}

/**
 * Gerbang fail-closed. Tombol unduh tidak boleh muncul bila tanggal per hari
 * tak bisa ditambatkan ke jadwal — PDF yang tanggalnya salah lebih berbahaya
 * daripada tak ada PDF, karena ia beredar di WA tanpa bisa ditarik kembali.
 */
export function canRenderItineraryPdf(content, paket) {
  const days = content && Array.isArray(content.days) ? content.days : [];
  if (!days.length) return false;
  const iso = itineraryDayDates(days, paket?.keberangkatan?.tgl, paket?.kepulangan?.tgl);
  return iso.some(d => d !== null);
}

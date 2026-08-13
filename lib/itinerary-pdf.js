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

/**
 * Jam yang boleh dicetak di kartu penerbangan, atau '' bila yang datang bukan
 * jam. `pulang_jam` sebagian jadwal hanya penanda hari (" (+7)", "5(+3)") tanpa
 * jam sama sekali; `normalizeJam` sengaja membiarkannya utuh supaya tak pernah
 * mengarang angka, tapi mencetaknya di bawah nama bandara berarti mengaku tahu
 * jam yang memang tidak kita punya.
 */
function jamTampil(raw) {
  const jam = normalizeJam(raw);
  return /^\d{2}:\d{2}$/.test(jam) ? jam : '';
}

function stops(rute) {
  return String(rute || '')
    .split(/[/,]|\s-\s|–/)
    .flatMap(s => s.split('-'))
    .map(s => s.trim())
    .filter((s, i, a) => s && s !== a[i - 1]);
}

/**
 * Dua leg siap render, dipakai bersama kartu penerbangan web
 * (src/components/itinerary/FlightCard.tsx) dan PDF — satu-satunya sumber
 * bentuk jam & pemecahan rute, supaya keduanya tak pernah berbeda.
 *
 * Jam kembar dipindah ke sisi KEDATANGAN dan sisi keberangkatan dikosongkan.
 * Alasannya bukan estetika: `pulang_jam` di jadwal terbukti berisi jam TIBA di
 * Jakarta — survei 1448 (2026-08-13) menemukan 91 dari 99 paket cocok dengan
 * jam kedatangan itinerary, sedangkan leg berangkat 0 dari 83. Itinerary
 * JBU1504 menuliskannya terang-terangan: SV818 berangkat Jeddah 01:55, tiba
 * CGK 16:00, sementara `pulang_jam` = "16.00". Jadi angka yang tersisa memang
 * milik sisi kanan; jam berangkat sungguhan tidak ada di tabel jadwal dan
 * pemanggil merendernya sebagai "—".
 *
 * `via` = bandara transit; hanya web yang merendernya, PDF mengabaikannya.
 */
export function flightLegView(paket, arrivals) {
  const legs = [
    ['Berangkat', paket?.keberangkatan, arrivals?.berangkat],
    ['Pulang', paket?.kepulangan, arrivals?.pulang],
  ];
  return legs.map(([kick, info, tiba]) => {
    const uniq = stops(info?.rute);
    const jam = jamTampil(info?.jam);
    const jamTiba = jamTampil(tiba);
    // Dua-duanya kosong bukan "kembar" — itu cuma jadwal tanpa jam sama sekali.
    const kembar = Boolean(jam) && jam === jamTiba;
    return {
      kick,
      tglISO: info?.tgl || '',
      dari: uniq[0] || '—',
      ke: uniq[uniq.length - 1] || '—',
      via: uniq.length > 2 ? uniq.slice(1, -1) : [],
      jam: kembar ? '' : jam,
      jamTiba: jamTiba || null,
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

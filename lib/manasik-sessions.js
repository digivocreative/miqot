// Sesi "Manasik Mendatang" untuk kartu kalender dashboard. Diturunkan dari grup
// "Berangkat Mendatang" yang SUDAH di-fetch kartu itu, jadi tidak ada endpoint,
// request, maupun kunci cache tambahan.
//
// Kuncinya tanggal+jam, BUKAN jadwal: manasik adalah acara gabungan. Pada data
// 2026-08-14, 8 dari 11 tanggal manasik dalam jendela dihadiri lebih dari satu
// paket, dan satu tanggal bisa punya dua sesi berbeda jam (19 Sep: 08:00 untuk
// 4 paket, 08:30 untuk 1 paket). Mengelompokkan per paket menghasilkan baris
// kembar bertanggal & berjam identik.
//
// ESM polos di root lib/ supaya bisa diuji langsung tests/ dan diimpor dari
// src/ lewat ../../lib/manasik-sessions.js — pola yang sama dengan
// lib/berangkat-groups.js.

import { realDateKey } from './berangkat-groups.js';
import { BERANGKAT_MENDATANG_WINDOW_DAYS } from './laporan-stats.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Gap `berangkat_tgl - manasik_tgl` yang terukur di umroh_schedules
// (100 jadwal, 2026-08-14): minimum 6 hari, maksimum 18 hari.
export const MANASIK_MAX_LEAD_DAYS = 18;

// DITURUNKAN, bukan angka tetap. Sesi manasik hanya terlihat kalau jamaahnya
// ikut ter-fetch, dan yang ter-fetch cuma yang berangkat dalam
// BERANGKAT_MENDATANG_WINDOW_DAYS. Jadi jendela manasik yang dijamin utuh =
// jendela berangkat dikurangi gap maksimum. Menuliskan 42 sebagai literal
// membuat sesi di ujung jendela hilang diam-diam begitu salah satu angka
// digeser — dijaga tes invarian di tests/manasik-sessions.test.js.
export const MANASIK_WINDOW_DAYS = BERANGKAT_MENDATANG_WINDOW_DAYS - MANASIK_MAX_LEAD_DAYS;

// 'HH:MM:SS' (bentuk yang dipakai umroh_schedules.manasik_jam) -> 'HH:MM'.
export function normalizeManasikJam(value) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : null;
}

// Batas jendela dan hari_lagi harus sepakat dengan perhitungan server, yang
// memakai tanggal WIB (getWIBDateStr di server.js). Memakai tanggal perangkat
// membuat keduanya meleset sehari bagi agen di luar WIB atau yang membuka
// aplikasi lewat tengah malam. Pola offsetnya sama dengan jakartaDateString()
// di calendar-api.js.
export function wibTodayKey(now = new Date()) {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Tab default section "Berangkat|Manasik" di kartu kalender: yang ADA datanya
// yang ditampilkan (berangkat menang bila keduanya isi), dan null berarti
// dua-duanya kosong — komponen memakainya sebagai gerbang untuk tidak
// merender tab sama sekali, biar kalendernya saja. Dirumuskan dari kedua
// daftar, bukan dari asumsi "manasik ⊆ berangkat" yang berlaku hari ini,
// supaya tetap benar kalau sumber manasik kelak berdiri sendiri.
export function pickDefaultSection(berangkatGroups, manasikSessions) {
  if (Array.isArray(berangkatGroups) && berangkatGroups.length > 0) return 'berangkat';
  if (Array.isArray(manasikSessions) && manasikSessions.length > 0) return 'manasik';
  return null;
}

export function buildManasikSessions(groups, todayStr) {
  const todayKey = realDateKey(todayStr);
  if (!todayKey) return [];
  const todayMs = Date.parse(`${todayKey}T00:00:00Z`);
  const endMs = todayMs + (MANASIK_WINDOW_DAYS * MS_PER_DAY);

  const byKey = new Map();
  for (const group of groups || []) {
    const tgl = realDateKey(group?.manasik_tgl);
    if (!tgl) continue;
    const ms = Date.parse(`${tgl}T00:00:00Z`);
    if (ms < todayMs || ms > endMs) continue;

    const jam = normalizeManasikJam(group.manasik_jam);
    const key = `${tgl}|${jam || ''}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        manasik_tgl: tgl,
        manasik_jam: jam,
        hari_lagi: Math.round((ms - todayMs) / MS_PER_DAY),
        count: 0,
        // Diisi setelah semua grup terkumpul — satu sesi memuat banyak paket,
        // masing-masing dengan TL sendiri.
        tour_leaders: [],
        // Ditandai setelah seluruh sesi jadi; lihat catatannya di bawah.
        shares_date: false,
        groups: [],
        items: [],
      });
    }
    const session = byKey.get(key);
    session.groups.push(group);
    session.items.push(...(group.items || []));
    session.count = session.items.length;
  }

  // Berapa sesi yang jatuh di tanggal yang sama — dihitung sekali di sini,
  // bukan ditebak per baris di komponen.
  const sessionsPerDate = new Map();
  for (const session of byKey.values()) {
    sessionsPerDate.set(session.manasik_tgl, (sessionsPerDate.get(session.manasik_tgl) || 0) + 1);
  }

  for (const session of byKey.values()) {
    session.items.sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || '')));
    session.groups.sort((a, b) => String(a.paket || '').localeCompare(String(b.paket || '')));
    // tour_leader grup sudah dibersihkan cleanTourLeader() di buildBerangkatGroups,
    // termasuk placeholder "-" yang dipakai calendar_events untuk TL yang belum
    // ditunjuk — di sini cukup membuang yang null lalu meng-unik-kan.
    session.tour_leaders = [...new Set(session.groups.map(g => g.tour_leader).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    // Baris ringkas hanya menampilkan hari+tanggal; tanpa penanda ini, dua sesi
    // di tanggal yang sama (19 Sep 08:00 dan 08:30) tampil kembar tak
    // terbedakan. Yang berbagi tanggal saja yang perlu memunculkan jamnya.
    session.shares_date = (sessionsPerDate.get(session.manasik_tgl) || 0) > 1;
  }

  return Array.from(byKey.values()).sort((a, b) =>
    a.manasik_tgl.localeCompare(b.manasik_tgl)
    || String(a.manasik_jam || '').localeCompare(String(b.manasik_jam || ''))
  );
}

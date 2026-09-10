// Registri halaman landing per keberangkatan (/26SEP2026, /12SEP2026, ...).
// Satu berkas data per kloter di ./kloter/; komponen, rute klien, dan server
// membaca dari sini. Menambah kloter = tambah berkas data + daftarkan di
// KLOTER_TRIPS. Helper di bawah murni (tanpa DOM) supaya bisa diuji di node.

import kloter45 from './kloter/kloter45.js';
import kloter39 from './kloter/kloter39.js';
import kloter41 from './kloter/kloter41.js';

export const KLOTER_TRIPS = [kloter45, kloter39, kloter41];

// Slug internal huruf kecil: RESERVED_SPA_SLUGS dan segmen URL selalu
// dibandingkan lowercase. Tautan yang dibagikan (publicPath) huruf besar.
export const KLOTER_SLUGS = KLOTER_TRIPS.map((trip) => trip.slug);

export function findKloterTripBySlug(segment) {
  const normalized = String(segment || '').trim().toLowerCase();
  return KLOTER_TRIPS.find((trip) => trip.slug === normalized) || null;
}

// Sub-halaman di bawah tiap kloter (menu di atas kolom cari).
export const KLOTER_SUB_PAGES = ['doa', 'dzikir', 'itinerary', 'room-list'];

export const KLOTER_MENU = [
  { id: 'doa', label: 'Doa', description: 'Doa perjalanan & ibadah' },
  { id: 'dzikir', label: 'Dzikir', description: 'Pagi, petang, setelah shalat' },
  { id: 'itinerary', label: 'Itinerary', description: 'Rencana perjalanan hari per hari' },
  { id: 'room-list', label: 'Room List', description: 'Daftar kamar hotel' },
];

export function resolveKloterSubPage(segment) {
  const normalized = String(segment || '').trim().toLowerCase();
  return KLOTER_SUB_PAGES.includes(normalized) ? normalized : null;
}

export function getKloterSubPagePath(trip, subPage) {
  return subPage ? `${trip.publicPath}/${subPage}` : trip.publicPath;
}

export const KLOTER_CHECKLIST_ITEMS = [
  { id: 'wa', label: 'Nomor WhatsApp' },
  { id: 'nusuk', label: 'Nusuk' },
];

export function isKloterChecked(prep, jamaahNo, itemId) {
  return !!prep?.[jamaahNo]?.[itemId];
}

export function getKloterMemberPhone(prep, member) {
  const savedPhone = prep?.[member.no]?.phone;
  return typeof savedPhone === 'string' ? savedPhone : member.phone;
}

// Jamaah dikelompokkan per ID Umrah (satu booking = satu keluarga), anggota
// diurutkan dari yang tertua.
export function getKloterGroups(trip) {
  const byId = new Map();
  for (const member of trip.jamaah) {
    if (!byId.has(member.idUmrah)) byId.set(member.idUmrah, []);
    byId.get(member.idUmrah).push(member);
  }
  return Array.from(byId.entries())
    .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
    .map(([idUmrah, members], index) => ({
      idUmrah,
      displayName: `Keluarga ${index + 1}`,
      members: [...members].sort((left, right) => right.age - left.age || left.no - right.no),
    }));
}

/**
 * Pencarian bekerja per KELUARGA, bukan per orang: satu nama ketemu berarti
 * seluruh anggota ID Umrah yang sama ikut tampil, supaya hubungan keluarganya
 * kelihatan utuh. Filter checklist tetap per orang — gunanya justru menyaring
 * individu di dalam keluarga.
 */
export function filterKloterGroups(groups, { query = '', prep = {}, filter = 'all' } = {}) {
  const normalizedQuery = query.trim().toLowerCase();

  return groups
    .map((group) => {
      const groupMatchesQuery = !normalizedQuery
        || group.displayName.toLowerCase().includes(normalizedQuery)
        || group.idUmrah.toLowerCase().includes(normalizedQuery)
        || group.members.some((member) => (
          member.name.toLowerCase().includes(normalizedQuery)
          || getKloterMemberPhone(prep, member).toLowerCase().includes(normalizedQuery)
        ));
      if (!groupMatchesQuery) return { ...group, members: [] };

      const members = filter === 'nusuk'
        ? group.members.filter((member) => !isKloterChecked(prep, member.no, 'nusuk'))
        : group.members;
      return { ...group, members };
    })
    .filter((group) => group.members.length > 0);
}

export function findKloterRoomsByName(roomList, query) {
  const normalized = String(query || '').trim().toLowerCase();
  if (!normalized) return roomList.rooms;
  return roomList.rooms.filter((room) => (
    String(room.no) === normalized
    || room.guests.some((guest) => guest.name.toLowerCase().includes(normalized))
  ));
}

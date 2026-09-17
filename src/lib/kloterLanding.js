// Helper halaman landing per keberangkatan (/26SEP2026, /12SEP2026, ...). Berkas
// ini TIDAK mengimpor data jamaah: trip diterima sebagai argumen (rute klien
// memuatnya lewat ./kloterSlugs.js, Node lewat ./kloterTrips.js). Helper di
// bawah murni (tanpa DOM) supaya bisa diuji di node.

// Menu di atas kolom cari; id-nya = KLOTER_SUB_PAGES di ./kloterSlugs.js.
export const KLOTER_MENU = [
  { id: 'doa', label: 'Doa', description: 'Doa perjalanan & ibadah' },
  { id: 'dzikir', label: 'Dzikir', description: 'Pagi, petang, setelah shalat' },
  { id: 'itinerary', label: 'Itinerary', description: 'Rencana perjalanan hari per hari' },
  { id: 'room-list', label: 'Room List', description: 'Daftar kamar hotel' },
];

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

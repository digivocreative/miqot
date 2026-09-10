export const KLOTER45_SLUG = '26sep2026';

// Tautan yang dibagikan ke jamaah ditulis huruf besar (/26SEP2026); rute dan
// slug internal tetap huruf kecil supaya cocok dengan RESERVED_SPA_SLUGS dan
// kunci penyimpanan. Keduanya menunjuk halaman yang sama.
export const KLOTER45_PUBLIC_PATH = '/26SEP2026';

// Sub-halaman di bawah /26SEP2026 (menu di atas kolom cari). Segmen URL-nya
// huruf kecil; pencocokan tidak peduli besar-kecil huruf, sama seperti slug.
export const KLOTER45_SUB_PAGES = ['doa', 'dzikir', 'itinerary', 'room-list'];

export const KLOTER45_MENU = [
  { id: 'doa', label: 'Doa', description: 'Doa perjalanan & ibadah' },
  { id: 'dzikir', label: 'Dzikir', description: 'Pagi, petang, setelah shalat' },
  { id: 'itinerary', label: 'Itinerary', description: 'Rencana perjalanan hari per hari' },
  { id: 'room-list', label: 'Room List', description: 'Daftar kamar hotel' },
];

// Room list dari Tour Leader — dua daftar karena kloter ini menginap di dua
// negara. Isi kamar disalin dari PDF resmi (tautan `pdfUrl`) supaya jamaah
// bisa mencari nama sendiri tanpa mengunduh; PDF-nya tetap bisa dibuka.
// Nama di `guests` harus persis sama dengan KLOTER45_JAMAAH (dijaga tes).
export const KLOTER45_ROOM_LISTS = [
  {
    id: 'dubai',
    label: 'Dubai',
    title: 'Room List Dubai',
    updatedAt: '4 September 2026',
    pdfUrl: 'https://alhijaz.b-cdn.net/roomlist-kloter45-dubai.pdf',
    hotels: [
      { city: 'Dubai', name: 'Time Onyx / setaraf', nights: 1, checkIn: '26 September 2026', checkOut: '27 September 2026' },
    ],
    rooms: [
      { no: 1, type: 'Double', guests: [{ name: 'SUPARYANTO RAHARDJO' }, { name: 'DWI ASIH' }] },
      { no: 2, type: 'Double', guests: [{ name: 'SUHARTONO GUNAWAN TASCHAN' }, { name: 'CICIH MURNIASIH' }] },
      { no: 3, type: 'Double', guests: [{ name: 'NORA RIRINTAMI' }, { name: 'HENDRAYUDA SABAR' }] },
      { no: 4, type: 'Double', guests: [{ name: 'SYECHAN HANAFI' }, { name: 'DEWI MAULIDINA AZIZAH' }] },
      { no: 5, type: 'Double', guests: [{ name: 'YULI HAPSARI' }, { name: 'PRAYOGI SUMONO' }] },
      { no: 6, type: 'Double', guests: [{ name: 'HENDRI KOTO' }, { name: 'NERA LIADIANI' }] },
      { no: 7, type: 'Double', guests: [{ name: 'DICKY SEPTRIADI' }, { name: 'RICA MUSTIKA SETIA' }] },
      { no: 8, type: 'Double', guests: [{ name: 'SISMAN JASUDIRMAN' }, { name: 'ISKARWIYAH BARDAI' }] },
      { no: 9, type: 'Double', guests: [{ name: 'LILIK MASKANAH' }, { name: 'PALAL MOELJO' }] },
      { no: 10, type: 'Double', guests: [{ name: 'PUTRI KURNIA RIZKI' }, { name: 'MAULIDA FAKIHATUL FAISA' }, { name: 'EBRAHIM UTA KAUTSARRAZKY', note: 'Tanpa tempat tidur' }] },
      { no: 11, type: 'Twin', guests: [{ name: 'USUP SETIAWAN' }, { name: 'AZIZUL HAKIM' }] },
      { no: 12, type: 'Twin', guests: [{ name: 'SYAMSU DAIRATIL IRVAN' }, { name: 'KHAERUL ACHMAD PAKKI' }] },
      { no: 13, type: 'Twin', guests: [{ name: 'SITI MARWAH HAMID' }, { name: 'YULI HERAWATI' }] },
      { no: 14, type: 'Twin', guests: [{ name: 'IED BUDI HARTONO' }, { name: 'BAGAS PRAMUDITA', note: 'Tour Leader' }] },
      { no: 15, type: 'Twin', guests: [{ name: 'NURUL FITRIAH ZALALUDIN' }, { name: 'KHAIRA TALITA AMEERAH' }] },
      { no: 16, type: 'Twin', guests: [{ name: 'KIANI AMALIA PUTRI' }, { name: 'ALMEER FAWWAZ FATHURRAHMAN' }] },
      { no: 17, type: 'Twin', guests: [{ name: 'SUPRI SUBAGIO' }, { name: 'MASRUL M MOCHTAR' }] },
      { no: 18, type: 'Twin', guests: [{ name: 'DEDE SUDRAJAT' }, { name: 'FIRMAN IRWANSYAH' }] },
      { no: 19, type: 'Twin', guests: [{ name: 'ARMIA FARANA' }, { name: 'EUIS NURZANAH' }] },
      { no: 20, type: 'Triple', guests: [{ name: 'SITI JUBAEDAH' }, { name: 'LILIS OMO SUKARMA' }, { name: 'SARIBUNAN SIMBOLON' }] },
      { no: 21, type: 'Triple', guests: [{ name: 'EVY URMILA SARI' }, { name: 'ADINDA MUTIA CAHYANI' }, { name: 'NURJANNAH BAHTIAR' }] },
    ],
  },
  {
    id: 'saudi',
    label: 'Mekkah – Madinah',
    title: 'Room List Mekkah – Madinah',
    updatedAt: '7 September 2026',
    pdfUrl: 'https://alhijaz.b-cdn.net/roomlist-kloter45-mekkah-madinah.pdf',
    hotels: [
      { city: 'Madinah', name: 'ODST Al Madinah', nights: 3, checkIn: '27 September 2026', checkOut: '30 September 2026' },
      { city: 'Mekkah', name: 'Al Massa Grand', nights: 4, checkIn: '30 September 2026', checkOut: '4 Oktober 2026' },
    ],
    rooms: [
      { no: 1, type: 'Double', guests: [{ name: 'SUPARYANTO RAHARDJO' }, { name: 'DWI ASIH' }] },
      { no: 2, type: 'Double', guests: [{ name: 'DICKY SEPTRIADI' }, { name: 'RICA MUSTIKA SETIA' }] },
      { no: 3, type: 'Double', guests: [{ name: 'PRAYOGI SUMONO' }, { name: 'YULI HAPSARI' }] },
      { no: 4, type: 'Double', guests: [{ name: 'CICIH MURNIASIH' }, { name: 'SUHARTONO GUNAWAN TASCHAN' }] },
      { no: 5, type: 'Double', guests: [{ name: 'ARMIA FARANA' }, { name: 'EUIS NURZANAH' }] },
      { no: 6, type: 'Triple', guests: [{ name: 'EVY URMILA SARI' }, { name: 'ADINDA MUTIA CAHYANI' }, { name: 'NURJANNAH BAHTIAR' }] },
      { no: 7, type: 'Quad', guests: [{ name: 'IED BUDI HARTONO' }, { name: 'SYECHAN HANAFI' }, { name: 'BAGAS PRAMUDITA', note: 'Tour Leader' }, { name: 'Muthowif', note: 'Pembimbing' }] },
      { no: 8, type: 'Quad', guests: [{ name: 'DEWI MAULIDINA AZIZAH' }, { name: 'SITI JUBAEDAH' }, { name: 'LILIS OMO SUKARMA' }, { name: 'SARIBUNAN SIMBOLON' }] },
      { no: 9, type: 'Quad', guests: [{ name: 'NURUL FITRIAH ZALALUDIN' }, { name: 'KIANI AMALIA PUTRI' }, { name: 'ALMEER FAWWAZ FATHURRAHMAN' }, { name: 'KHAIRA TALITA AMEERAH' }] },
      { no: 10, type: 'Quad', guests: [{ name: 'NORA RIRINTAMI' }, { name: 'SITI MARWAH HAMID' }, { name: 'YULI HERAWATI' }, { name: 'NERA LIADIANI' }] },
      { no: 11, type: 'Quad', guests: [{ name: 'HENDRAYUDA SABAR' }, { name: 'KHAERUL ACHMAD PAKKI' }, { name: 'SYAMSU DAIRATIL IRVAN' }, { name: 'HENDRI KOTO' }] },
      { no: 12, type: 'Quad', guests: [{ name: 'PUTRI KURNIA RIZKI' }, { name: 'ISKARWIYAH BARDAI' }, { name: 'MAULIDA FAKIHATUL FAISA' }, { name: 'LILIK MASKANAH' }, { name: 'EBRAHIM UTA KAUTSARRAZKY', note: 'Tanpa tempat tidur' }] },
      { no: 13, type: 'Quad', guests: [{ name: 'USUP SETIAWAN' }, { name: 'PALAL MOELJO' }, { name: 'SISMAN JASUDIRMAN' }, { name: 'AZIZUL HAKIM' }] },
      { no: 14, type: 'Quad', guests: [{ name: 'SUPRI SUBAGIO' }, { name: 'MASRUL M MOCHTAR' }, { name: 'DEDE SUDRAJAT' }, { name: 'FIRMAN IRWANSYAH' }] },
    ],
  },
];

export function findKloter45RoomsByName(roomList, query) {
  const normalized = String(query || '').trim().toLowerCase();
  if (!normalized) return roomList.rooms;
  return roomList.rooms.filter((room) => (
    String(room.no) === normalized
    || room.guests.some((guest) => guest.name.toLowerCase().includes(normalized))
  ));
}

export function resolveKloter45SubPage(segment) {
  const normalized = String(segment || '').trim().toLowerCase();
  return KLOTER45_SUB_PAGES.includes(normalized) ? normalized : null;
}

export function getKloter45SubPagePath(subPage) {
  return subPage ? `${KLOTER45_PUBLIC_PATH}/${subPage}` : KLOTER45_PUBLIC_PATH;
}

export const KLOTER45_TRIP = {
  kloterLabel: 'Kloter 45',
  tripCode: 'JBU1569',
  packageName: 'Paket Umroh Plus Dubai',
  packageVariant: 'Hemat 10 Hari',
  departureDate: '26 September 2026',
  returnDate: '5 Oktober 2026',
  travelDateRange: '26 SEPTEMBER - 5 OKTOBER 2026',
  airline: 'Emirates',
  tourLeader: 'Bagas Pramudita',
  totalJamaah: 45,
};

export const KLOTER45_CHECKLIST_ITEMS = [
  { id: 'wa', label: 'Nomor WhatsApp' },
  { id: 'nusuk', label: 'Nusuk' },
];

export const KLOTER45_CONTACTS = [
  {
    role: 'Tour Leader',
    name: 'Bagas Pramudita',
    whatsappDisplay: '087878573311',
    whatsappUrl: 'https://wa.me/6287878573311',
    photoUrl: 'https://alhijaz.b-cdn.net/bagas-p.png',
    photoObjectPosition: 'center',
    photoClassName: 'from-emerald-500 to-teal-500',
  },
];

export const KLOTER45_JAMAAH = [
  { no: 1, idUmrah: 'AIW0029251', name: 'ARMIA FARANA', gender: 'P', age: 50, phone: '081310430877', phoneMasked: '0813****0877' },
  { no: 2, idUmrah: 'AIW0029251', name: 'EUIS NURZANAH', gender: 'P', age: 66, phone: '081310430877', phoneMasked: '0813****0877' },
  { no: 3, idUmrah: 'AIW0029492', name: 'PRAYOGI SUMONO', gender: 'L', age: 31, phone: '6281234567890', phoneMasked: '6281****7890' },
  { no: 4, idUmrah: 'AIW0029492', name: 'YULI HAPSARI', gender: 'P', age: 29, phone: '6289670687009', phoneMasked: '6289****7009' },
  { no: 5, idUmrah: 'AIW0029713', name: 'SUHARTONO GUNAWAN TASCHAN', gender: 'L', age: 56, phone: '081288244614', phoneMasked: '0812****4614' },
  { no: 6, idUmrah: 'AIW0029713', name: 'CICIH MURNIASIH', gender: 'P', age: 53, phone: '087772889900', phoneMasked: '0877****9900' },
  { no: 7, idUmrah: 'AIW0029767', name: 'IED BUDI HARTONO', gender: 'L', age: 55, phone: '081310655821', phoneMasked: '0813****5821' },
  { no: 8, idUmrah: 'AIW0029767', name: 'NURUL FITRIAH ZALALUDIN', gender: 'P', age: 46, phone: '081310655821', phoneMasked: '0813****5821' },
  { no: 9, idUmrah: 'AIW0029767', name: 'KIANI AMALIA PUTRI', gender: 'P', age: 16, phone: '081310655821', phoneMasked: '0813****5821' },
  { no: 10, idUmrah: 'AIW0029767', name: 'ALMEER FAWWAZ FATHURRAHMAN', gender: 'L', age: 13, phone: '081310655821', phoneMasked: '0813****5821' },
  { no: 11, idUmrah: 'AIW0029767', name: 'KHAIRA TALITA AMEERAH', gender: 'P', age: 11, phone: '081310655821', phoneMasked: '0813****5821' },
  { no: 12, idUmrah: 'AIW0029793', name: 'NORA RIRINTAMI', gender: 'P', age: 36, phone: '085267765557', phoneMasked: '0852****5557' },
  { no: 13, idUmrah: 'AIW0029793', name: 'HENDRAYUDA SABAR', gender: 'L', age: 38, phone: '081386047724', phoneMasked: '0813****7724' },
  { no: 14, idUmrah: 'AIW0029922', name: 'SUPARYANTO RAHARDJO', gender: 'L', age: 49, phone: '081210153858', phoneMasked: '0812****3858' },
  { no: 15, idUmrah: 'AIW0029922', name: 'DWI ASIH', gender: 'P', age: 48, phone: '081373407500', phoneMasked: '0813****7500' },
  { no: 16, idUmrah: 'AIW0029924', name: 'SUPRI SUBAGIO', gender: 'L', age: 70, phone: '081213699445', phoneMasked: '0812****9445' },
  { no: 17, idUmrah: 'AIW0029950', name: 'SYECHAN HANAFI', gender: 'L', age: 29, phone: '081211733919', phoneMasked: '0812****3919' },
  { no: 18, idUmrah: 'AIW0029950', name: 'DEWI MAULIDINA AZIZAH', gender: 'P', age: 29, phone: '085892665383', phoneMasked: '0858****5383' },
  { no: 19, idUmrah: 'AIW0029952', name: 'YULI HERAWATI', gender: 'P', age: 54, phone: '087888850992', phoneMasked: '0878****0992' },
  { no: 20, idUmrah: 'AIW0030001', name: 'DEDE SUDRAJAT', gender: 'L', age: 67, phone: '085720987398', phoneMasked: '0857****7398' },
  { no: 21, idUmrah: 'AIW0030001', name: 'FIRMAN IRWANSYAH', gender: 'L', age: 42, phone: '081219692348', phoneMasked: '0812****2348' },
  { no: 22, idUmrah: 'AIW0030057', name: 'SITI JUBAEDAH', gender: 'P', age: 55, phone: '085810181936', phoneMasked: '0858****1936' },
  { no: 23, idUmrah: 'AIW0030093', name: 'EVY URMILA SARI', gender: 'P', age: 34, phone: '081243736294', phoneMasked: '0812****6294' },
  { no: 24, idUmrah: 'AIW0030093', name: 'ADINDA MUTIA CAHYANI', gender: 'P', age: 25, phone: '081243736294', phoneMasked: '0812****6294' },
  { no: 25, idUmrah: 'AIW0030093', name: 'NURJANNAH BAHTIAR', gender: 'P', age: 60, phone: '081243736294', phoneMasked: '0812****6294' },
  { no: 26, idUmrah: 'AIW0030108', name: 'SYAMSU DAIRATIL IRVAN', gender: 'L', age: 40, phone: '08118508405', phoneMasked: '0811****8405' },
  { no: 27, idUmrah: 'AIW0030108', name: 'SITI MARWAH HAMID', gender: 'P', age: 64, phone: '081247563401', phoneMasked: '0812****3401' },
  { no: 28, idUmrah: 'AIW0030108', name: 'KHAERUL ACHMAD PAKKI', gender: 'L', age: 65, phone: '089603760777', phoneMasked: '0896****0777' },
  { no: 29, idUmrah: 'AIW0030203', name: 'HENDRI KOTO', gender: 'L', age: 41, phone: '081388670009', phoneMasked: '0813****0009' },
  { no: 30, idUmrah: 'AIW0030203', name: 'NERA LIADIANI', gender: 'P', age: 37, phone: '082260720144', phoneMasked: '0822****0144' },
  { no: 31, idUmrah: 'AIW0030275', name: 'LILIS OMO SUKARMA', gender: 'P', age: 60, phone: '085723545999', phoneMasked: '0857****5999' },
  { no: 32, idUmrah: 'AIW0030284', name: 'BAGAS PRAMUDITA', gender: 'L', age: 31, phone: '087878573311', phoneMasked: '0878****3311' },
  { no: 33, idUmrah: 'AIW0030300', name: 'DICKY SEPTRIADI', gender: 'L', age: 40, phone: '08111663456', phoneMasked: '0811****3456' },
  { no: 34, idUmrah: 'AIW0030300', name: 'RICA MUSTIKA SETIA', gender: 'P', age: 39, phone: '085882063986', phoneMasked: '0858****3986' },
  { no: 35, idUmrah: 'AIW0030311', name: 'USUP SETIAWAN', gender: 'L', age: 31, phone: '082281879992', phoneMasked: '0822****9992' },
  { no: 36, idUmrah: 'AIW0030311', name: 'PUTRI KURNIA RIZKI', gender: 'P', age: 30, phone: '628125236117', phoneMasked: '6281****6117' },
  { no: 37, idUmrah: 'AIW0030311', name: 'PALAL MOELJO', gender: 'L', age: 43, phone: '628580471500', phoneMasked: '6285****1500' },
  { no: 38, idUmrah: 'AIW0030311', name: 'SISMAN JASUDIRMAN', gender: 'L', age: 44, phone: '082281879992', phoneMasked: '0822****9992' },
  { no: 39, idUmrah: 'AIW0030311', name: 'ISKARWIYAH BARDAI', gender: 'P', age: 56, phone: '082281879992', phoneMasked: '0822****9992' },
  { no: 40, idUmrah: 'AIW0030311', name: 'MAULIDA FAKIHATUL FAISA', gender: 'P', age: 23, phone: '082281879992', phoneMasked: '0822****9992' },
  { no: 41, idUmrah: 'AIW0030311', name: 'LILIK MASKANAH', gender: 'P', age: 59, phone: '082281879992', phoneMasked: '0822****9992' },
  { no: 42, idUmrah: 'AIW0030311', name: 'EBRAHIM UTA KAUTSARRAZKY', gender: 'L', age: 22, phone: '082281879992', phoneMasked: '0822****9992' },
  { no: 43, idUmrah: 'AIW0030311', name: 'AZIZUL HAKIM', gender: 'L', age: 26, phone: '082281879992', phoneMasked: '0822****9992' },
  { no: 44, idUmrah: 'AIW0030363', name: 'MASRUL M MOCHTAR', gender: 'L', age: 63, phone: '6281213216839', phoneMasked: '6281****6839' },
  { no: 45, idUmrah: 'AIW0030573', name: 'SARIBUNAN SIMBOLON', gender: 'P', age: 36, phone: '087782169835', phoneMasked: '0877****9835' },
];

export function isKloter45Checked(prep, jamaahNo, itemId) {
  return !!prep?.[jamaahNo]?.[itemId];
}

export function getKloter45MemberPhone(prep, member) {
  const savedPhone = prep?.[member.no]?.phone;
  return typeof savedPhone === 'string' ? savedPhone : member.phone;
}

/**
 * Pencarian bekerja per KELUARGA, bukan per orang: satu nama ketemu berarti
 * seluruh anggota ID Umrah yang sama ikut tampil, supaya hubungan keluarganya
 * kelihatan utuh. Filter checklist tetap per orang — gunanya justru menyaring
 * individu di dalam keluarga.
 */
export function filterKloter45Groups(groups, { query = '', prep = {}, filter = 'all' } = {}) {
  const normalizedQuery = query.trim().toLowerCase();

  return groups
    .map((group) => {
      const groupMatchesQuery = !normalizedQuery
        || group.displayName.toLowerCase().includes(normalizedQuery)
        || group.idUmrah.toLowerCase().includes(normalizedQuery)
        || group.members.some((member) => (
          member.name.toLowerCase().includes(normalizedQuery)
          || getKloter45MemberPhone(prep, member).toLowerCase().includes(normalizedQuery)
        ));
      if (!groupMatchesQuery) return { ...group, members: [] };

      const members = filter === 'nusuk'
        ? group.members.filter((member) => !isKloter45Checked(prep, member.no, 'nusuk'))
        : group.members;
      return { ...group, members };
    })
    .filter((group) => group.members.length > 0);
}

export function getKloter45Groups(jamaah = KLOTER45_JAMAAH) {
  const byId = new Map();

  for (const member of jamaah) {
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

// Daftar TEMPAT YANG DIKUNJUNGI dari teks itinerary. Logika murni tanpa
// dependensi — dipakai FE (PDF perbandingan paket) dan bisa dipakai server.
//
// Kenapa modul terpisah dari `itinerary-destinasi.js`?
// Modul itu memilih FOTO untuk galeri itinerary web, dan dua aturannya memang
// benar untuk foto tapi merusak daftar tempat:
//   1. hanya mengenali tempat yang punya berkas foto di CDN (23 pola), jadi
//      seluruh rangkaian tur Turki & Mesir tak pernah muncul;
//   2. satu aktivitas maksimal SATU foto, jadi "Ziarah Jabal Tsur, Padang
//      Arafah, Jabal Rahmah, Muzdalifah, Mina, Jabal Nur, dan Gua Hira"
//      hanya menyumbang satu nama.
// Hasilnya daftar yang tampak seperti "contoh foto yang kebetulan tersedia",
// bukan tempat yang benar-benar dikunjungi — persis keluhan agent.
//
// Aturan kamus ini:
//   • Hanya SITUS yang dikunjungi. Kota/kawasan (Madinah, Jeddah, Alexandria,
//     Cappadocia) TIDAK dimasukkan — barisnya hampir selalu transit atau
//     menginap ("menuju Alexandria", "Tiba di Bandara Cairo"), sedangkan
//     turnya sendiri sudah terwakili situs-situsnya.
//   • Moda transportasi bukan tempat: "kereta cepat Haramain" pernah muncul di
//     daftar tempat dan dilaporkan tidak sesuai.
//   • Toko/pabrik oleh-oleh (jewelry shop, pabrik papirus, turkish carpet)
//     dilewati — itu titik belanja terjadwal, bukan tempat yang dijual.
//   • Nama orang bukan tempat. "Abu Bakar Ash-Shiddiq" hanya dikenali lewat
//     "Masjid Abu Bakar"; yang tanpa penanda tempat diabaikan.

/**
 * Urutan array TIDAK menentukan hasil — keluaran diurutkan berdasarkan posisi
 * kemunculan di teks, supaya daftarnya terbaca searah dengan itinerary.
 * Ejaan hulu beragam (tabel `itineraries` diisi banyak orang), jadi tiap regex
 * menampung varian yang benar-benar muncul di data.
 *
 * `sorotan: true` = tampil di dokumen jualan (PDF perbandingan). Daftar penuh
 * 40+ nama terlalu ramai, jadi yang disisakan hanya nama yang jadi ALASAN orang
 * memilih satu paket ketimbang paket lain. Yang sengaja tidak bersorotan:
 *   • titik di dalam situs besar — Hajar Aswad, Hijr Ismail, Maqam Ibrahim,
 *     Rukun Yamani semuanya di dalam Masjidil Haram yang sudah disebut;
 *   • masjid kecil serombongan ziarah — Masjid Abu Bakar, Ghamamah, Jumat,
 *     Tujuh selalu satu paket dengan Quba/Nabawi;
 *   • titik miqat & logistik — Bir Ali, Tan'im;
 *   • ziarah yang ADA DI HAMPIR SEMUA paket umroh — Raudhah, Makam Rasulullah,
 *     Padang Arafah, Jabal Rahmah, Muzdalifah, Mina: benar dikunjungi, tapi tak
 *     membedakan apa pun saat dua paket disandingkan;
 *   • detail city tour — Tophane Complex, Ottoman Clock Tower, Pigeon Valley.
 * Semuanya tetap terbaca lewat `visitedPlacesForDays` bila suatu saat perlu.
 */
const PLACE_PATTERNS = [
  // ── Madinah ──
  { label: 'Masjid Nabawi', re: /nabawi/i , sorotan: true },
  { label: 'Raudhah', re: /raud[ah]?ah/i },
  { label: 'Makam Rasulullah', re: /makam\s+(?:ke\s+)?rasulullah|makam\s+nabi\b/i },
  { label: 'Makam Baqi', re: /\bbaqi['’]?\b/i },
  { label: 'Masjid Quba', re: /\b[qk]uba['’]?\b/i , sorotan: true },
  { label: 'Masjid Qiblatain', re: /[qk]iblatain/i },
  { label: 'Masjid Jumat', re: /masjid\s+jum[a-z'’]*/i },
  { label: 'Masjid Tujuh', re: /masjid\s+tujuh|sab['’]?ah\s+masajid/i },
  { label: 'Masjid Ghamamah', re: /gh[ao]mamah/i },
  { label: 'Masjid Abu Bakar', re: /masjid\s+abu\s*bakar/i },
  { label: 'Masjid Ali bin Abi Thalib', re: /masjid\s+ali\b/i },
  { label: 'Jabal Uhud', re: /\buhud\b/i , sorotan: true },
  { label: 'Bukit Rumat', re: /bukit\s+rumat|jabal\s+rumat/i },
  { label: 'Pasar Kurma', re: /pasar\s+kurma|kebun\s+kurma/i },
  { label: 'Jabal Magnet', re: /jabal\s+magnet/i , sorotan: true },
  { label: 'Percetakan Al-Qur’an', re: /percetakan\s+al[-\s]?qur['’]?an/i , sorotan: true },
  { label: 'Bir Ali', re: /bir\s*ali\b/i },
  // ── Ziarah Badar ──
  { label: 'Bir Ar-Rouha', re: /bir\s*ar[-\s]?rouha/i },
  { label: 'Jabal Malaikat', re: /jabal\s+malaikat/i },
  { label: 'Bir As-Syifa', re: /bir\s*as[-\s]?syifa/i },
  { label: 'Makam Syuhada Badar', re: /syuhada\s+badar/i , sorotan: true },
  // ── Mekkah ──
  { label: 'Masjidil Haram', re: /masjidil\s*haram|masjid\s*(?:al[-\s]?)?haram\b|ka['’]?bah/i , sorotan: true },
  { label: 'Hajar Aswad', re: /hajar\s+aswad/i },
  { label: 'Hijr Ismail', re: /hijr\s+isma['’]?il/i },
  { label: 'Maqam Ibrahim', re: /ma[qk]am\s+ibrahim/i },
  { label: 'Rukun Yamani', re: /rukun\s+yamani/i },
  { label: 'Jabal Tsur', re: /jabal\s+t[sh]ur/i },
  { label: 'Padang Arafah', re: /arafah/i },
  // "jabal" wajib: nama tier paket RAHMAH tak boleh ikut tertangkap.
  { label: 'Jabal Rahmah', re: /jabal\s+rahmah/i },
  { label: 'Muzdalifah', re: /muzdalifah/i },
  { label: 'Mina', re: /\bmina\b/i },
  { label: 'Jabal Nur', re: /jabal\s+n[uo]r/i },
  { label: 'Gua Hira', re: /g[ou]a\s+hira|museum\s+wahyu/i },
  { label: 'Makam Ma’la', re: /ma['’]la\b/i },
  { label: 'Masjid Tan’im', re: /tan['’]?im/i },
  // ── Taif ──
  { label: 'Masjid Abdullah bin Abbas', re: /abdullah\s+ib?n\s*abbas/i , sorotan: true },
  { label: 'Masjid Al-Ku’aa', re: /al[-\s]?ku['’]?aa/i },
  { label: 'Masjid Qantharah', re: /qantharah|al[-\s]?madhoun/i },
  { label: 'Penyulingan Mawar', re: /penyulingan\s+mawar|pabrik\s+mawar/i , sorotan: true },
  // ── Jeddah ──
  { label: 'Museum Al-Ahmoodi', re: /ahmoodi/i , sorotan: true },
  { label: 'Masjid Qishos', re: /qishos|qisas/i },
  { label: 'Corniche', re: /cornich?e/i },
  { label: 'Laut Merah', re: /laut\s+merah|red\s*sea/i , sorotan: true },
  // ── Turki ──
  { label: 'Hagia Sophia', re: /hagia|aya\s*sof/i , sorotan: true },
  { label: 'Blue Mosque', re: /blue\s*mosque|masjid\s*biru|sultan\s*ahmed/i , sorotan: true },
  { label: 'Bosphorus', re: /bosph?[oa]rus/i , sorotan: true },
  { label: 'Topkapi Palace', re: /topkapi/i , sorotan: true },
  { label: 'Hippodrome', re: /hippodrome/i },
  { label: 'Grand Bazaar', re: /grand\s*bazaar/i , sorotan: true },
  { label: 'Galata Tower', re: /galata/i , sorotan: true },
  { label: 'Taksim', re: /taksim/i , sorotan: true },
  { label: 'Istiklal Street', re: /stiklal|istiqlal\s+street/i },
  { label: 'Masjid Fatih Sultan', re: /fatih\s+sultan/i },
  { label: 'Masjid Eyup Sultan', re: /ey[uü]p/i , sorotan: true },
  { label: 'Pierre Loti', re: /pierre\s+loti/i , sorotan: true },
  { label: 'Underground City', re: /underground\s*city/i , sorotan: true },
  { label: 'Goreme Valley', re: /g[öo]reme/i , sorotan: true },
  { label: 'Avanos Pottery Village', re: /avanos/i },
  { label: 'Pigeon Valley', re: /pigeon\s*valley/i },
  { label: 'Uchisar Castle', re: /u[çc]hisar/i },
  { label: 'Danau Tuz', re: /tuz\s*g[öo]l[üu]|salt\s*lake/i },
  { label: 'Anitkabir', re: /an[iı]tkabir|atat[üu]rk\s+mausoleum/i , sorotan: true },
  { label: 'Grand Mosque Bursa', re: /grand\s+mosque|ulu\s+cami/i , sorotan: true },
  { label: 'Tophane Complex', re: /tophane/i },
  { label: 'Ottoman Clock Tower', re: /clock\s+tower/i },
  { label: 'Osmangazi Tomb', re: /osmangazi/i },
  // ── Dubai ──
  { label: 'Burj Khalifa', re: /burj\s*khalifah?/i , sorotan: true },
  { label: 'Burj Al Arab', re: /burj\s*a[lr][-\s]*arab/i , sorotan: true },
  { label: 'Palm Jumeirah', re: /jumeirah/i , sorotan: true },
  { label: 'Dubai Aquarium', re: /dubai\s+aquarium/i },
  { label: 'Dubai Mall', re: /dubai\s+mall/i , sorotan: true },
  { label: 'Dubai Frame', re: /dubai\s+frame/i , sorotan: true },
  { label: 'Miracle Garden', re: /miracle\s+garden/i , sorotan: true },
  { label: 'Desert Safari', re: /desert\s+safari/i , sorotan: true },
  // ── Mesir ──
  { label: 'Piramida Giza', re: /piramida|pyramid|\bgiza\b/i , sorotan: true },
  { label: 'Sphinx', re: /sphinx/i , sorotan: true },
  // "museum peradaban" saja TIDAK cukup: Museum Al-Ahmoodi di Jeddah kerap
  // ditulis "museum peradaban Arab kuno" dan sempat tertukar jadi museum Mesir.
  { label: 'Museum Peradaban Mesir', re: /national\s+museum\s+of\s+egyptian|museum\s+peradaban\s+mesir/i , sorotan: true },
  { label: 'Museum Mesir', re: /egyptian\s+museum|museum\s+mesir/i , sorotan: true },
  { label: 'Masjid Al-Azhar', re: /azhar/i , sorotan: true },
  { label: 'Khan El Khalili', re: /khan\s+el[-\s]?khalili/i , sorotan: true },
  { label: 'Qait Bay Fort', re: /qait\s*bay|qaitbay/i , sorotan: true },
  { label: 'Pompey’s Pillar', re: /pompey/i },
  { label: 'Masjid Abu Al-Abbas', re: /abb?u\s*a?l?[-\s]?abbas/i },
  { label: 'Masjid Nabi Daniel', re: /nabi\s+daniel/i },
  { label: 'Makam Imam Busiri', re: /busiri/i },
  { label: 'Montaza Palace', re: /montaza/i , sorotan: true },
  { label: 'Makam Imam Syafi’i', re: /el\s*emam\s*el\s*shafei|imam\s+sy?af[i']/i },
  { label: 'Masjid Sayyidah Zainab', re: /sayeda\s+zeinab|sayyidah\s+zainab/i },
  { label: 'Masjid Sayyidina Husein', re: /el\s+hussein|sayyidina\s+husein/i },
  { label: 'Makam Lukman Al-Hakim', re: /lukman\s+al\s*hakim/i },
];

/**
 * Semua tempat yang disebut satu potong teks, urut kemunculannya. Berbeda dari
 * pemilih foto yang berhenti di kecocokan pertama: satu kalimat ziarah bisa
 * menyebut tujuh tempat sekaligus dan semuanya harus terbaca.
 */
export function placesInText(text, { sorotanSaja = false } = {}) {
  const t = String(text || '');
  if (!t) return [];
  const hits = [];
  for (const { label, re, sorotan } of PLACE_PATTERNS) {
    if (sorotanSaja && !sorotan) continue;
    const found = t.match(re);
    if (found) hits.push({ label, at: found.index ?? 0 });
  }
  hits.sort((a, b) => a.at - b.at);
  const urut = [];
  for (const { label } of hits) if (!urut.includes(label)) urut.push(label);
  return urut;
}

/**
 * Tempat yang dikunjungi sepanjang itinerary, urut kemunculan dan tanpa
 * duplikat — "sholat di Masjidil Haram" berulang tiap hari, cukup sekali di
 * daftar. Menerima activities campuran string / {time,text} seperti
 * ItineraryDayData.
 */
export function visitedPlacesForDays(days, { sorotanSaja = false } = {}) {
  const list = Array.isArray(days) ? days : [];
  const urut = [];
  for (const day of list) {
    const activities = Array.isArray(day?.activities) ? day.activities : [];
    for (const raw of activities) {
      const text = String((typeof raw === 'string' ? raw : raw?.text) || '');
      for (const label of placesInText(text, { sorotanSaja })) {
        if (!urut.includes(label)) urut.push(label);
      }
    }
  }
  return urut;
}

/**
 * Sorotan saja — yang dipakai PDF perbandingan paket. Urutannya tetap searah
 * itinerary, jadi hasilnya selalu subset berurutan dari `visitedPlacesForDays`.
 */
export function highlightPlacesForDays(days) {
  return visitedPlacesForDays(days, { sorotanSaja: true });
}

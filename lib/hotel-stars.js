// Bintang hotel paket dari Direktori Hotel.
//
// API jadwal hulu hanya sesekali menyertakan bintang ("NAMA (★5)"); sebagian
// besar hotel datang sebagai nama polos. Tabel statis src/data/hotelMetadata.ts
// menambal yang dikenal, tapi tiap hotel baru di jadwal tampil tanpa bintang
// sampai ada yang menyunting kode. Direktori Hotel (tabel `hotels`, dikelola
// lewat halaman Kelola) sudah menyimpan bintang dan nama lain tiap hotel, jadi
// sync jadwal memakainya untuk mengisi bintang yang kosong — dan melaporkan
// hotel yang tidak dikenal direktori supaya bisa segera didaftarkan.

const MIN_CONTAINMENT_LEN = 5;

// Kunci kota di paket_hotel → kota Direktori Hotel. Kota tur Turki semuanya
// satu kelompok 'turki' di direktori.
const DIRECTORY_CITY_BY_PACKAGE_CITY = {
  mekkah: 'mekkah',
  madinah: 'madinah',
  cairo: 'kairo',
  dubai: 'dubai',
  haikou: 'haikou',
  istanbul: 'turki',
  bursa: 'turki',
  cappadocia: 'turki',
  ankara: 'turki',
  bolu: 'turki',
  kusadasi: 'turki',
  pamukkale: 'turki',
  izmir: 'turki',
  antalya: 'turki',
  konya: 'turki',
  trabzon: 'turki',
};

const STAR_IN_NAME_RE = /\(\s*[★⭐]\s*(\d)\s*\)\s*$/;

// Cermin normalizeHotelName di src/data/hotelMetadata.ts.
export function normalizeHotelName(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/\s*\/\s*SETARAF.*$/, '')
    .replace(/\s+\/\s+/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim();
}

function validStars(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

/**
 * Entri direktori untuk satu nama hotel paket — aturan yang sama dengan
 * matchHotelPhoto (src/lib/hotelThumbs.ts): cocok penuh, atau saling memuat
 * dengan nama direktori minimal 5 karakter dan yang terpanjang menang. Kota
 * ikut disaring supaya "MOVENPICK" Madinah tidak memakai bintang Movenpick
 * Mekkah.
 */
export function matchDirectoryHotel(packageHotelName, packageCity, directory) {
  if (!packageHotelName || !Array.isArray(directory) || directory.length === 0) return null;
  const needle = normalizeHotelName(String(packageHotelName).replace(STAR_IN_NAME_RE, ''));
  if (!needle) return null;
  const wantCity = DIRECTORY_CITY_BY_PACKAGE_CITY[String(packageCity || '').toLowerCase()] || null;

  let best = null;
  let bestLen = 0;
  for (const entry of directory) {
    if (wantCity && entry?.city && entry.city !== wantCity) continue;
    const names = [entry?.name, ...(Array.isArray(entry?.aliases) ? entry.aliases : [])];
    for (const name of names) {
      const candidate = normalizeHotelName(name);
      if (!candidate) continue;
      if (candidate === needle) return entry;
      if (candidate.length < MIN_CONTAINMENT_LEN) continue;
      if (!needle.includes(candidate) && !candidate.includes(needle)) continue;
      if (candidate.length > bestLen) {
        best = entry;
        bestLen = candidate.length;
      }
    }
  }
  return best;
}

function directoryStars(name, city, directory) {
  return validStars(matchDirectoryHotel(name, city, directory)?.stars);
}

/**
 * Isi bintang yang kosong di satu `paket_hotel` dari direktori. Bintang dari
 * hulu tidak pernah ditimpa. Dua bentuk payload didukung:
 *   baru: { mekkah: "NAMA (★5)" }            → ditambah " (★N)" di belakang
 *   lama: { mekkah_hotel, mekkah_bintang }   → mekkah_bintang diisi
 * `missing` berisi hotel yang tetap tanpa bintang (tidak dikenal direktori
 * atau direktorinya belum diberi bintang).
 */
export function fillPackageHotelStars(paketHotel, directory) {
  const missing = [];
  if (!paketHotel || typeof paketHotel !== 'object') return { paketHotel, missing };

  const out = {};
  for (const [tier, info] of Object.entries(paketHotel)) {
    if (!info || typeof info !== 'object') {
      out[tier] = info;
      continue;
    }
    const next = { ...info };
    for (const [key, value] of Object.entries(info)) {
      if (typeof value !== 'string' || !value.trim()) continue;
      if (key.endsWith('_bintang') || key.endsWith('_jarak')) continue;

      if (key.endsWith('_hotel')) {
        const city = key.slice(0, -'_hotel'.length);
        if (validStars(info[`${city}_bintang`])) continue;
        const stars = directoryStars(value, city, directory);
        if (stars) next[`${city}_bintang`] = String(stars);
        else missing.push({ city, name: value.trim() });
        continue;
      }

      if (STAR_IN_NAME_RE.test(value)) continue;
      const stars = directoryStars(value, key, directory);
      if (stars) next[key] = `${value.trim()} (★${stars})`;
      else missing.push({ city: key, name: value.trim() });
    }
    out[tier] = next;
  }
  return { paketHotel: out, missing };
}

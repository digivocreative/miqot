// Logika bersama kartu "Berangkat Mendatang" — dipakai StatistikPage (halaman
// Statistik) dan UpcomingSchedule (kartu kalender dashboard). Ditaruh di root
// lib/ sebagai ESM polos supaya bisa diuji langsung oleh tests/ dan di-import
// dari src/ lewat ../../lib/berangkat-groups.js (lihat lib/teras-linkify.js).

export function fmtTgl(d) {
  try {
    return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return d; }
}

export function fmtTglLong(d) {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return d; }
}

export function fmtHariLagi(n) {
  if (n === null || n === undefined) return '-';
  if (n <= 30) return `${n} hari lagi`;
  return `${Math.floor(n / 30)} bulan lagi`;
}

export function cleanTourLeader(value) {
  const cleaned = String(value || '')
    .replace(/•/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || null;
}

export const SAUDI_DESTINATION_FLAG = {
  code: 'sa',
  label: 'Arab Saudi',
  src: '/flags/saudi.png',
  fallback: 'SA',
};

export const EXTRA_DESTINATION_FLAGS = [
  {
    code: 'ae',
    label: 'Uni Emirat Arab',
    src: '/flags/uae.png',
    fallback: 'AE',
    pattern: /\b(DUBAI|UAE|UNI EMIRAT|ABU DHABI|DESERT SAFARI|DXB)\b/i,
  },
  {
    code: 'tr',
    label: 'Turki',
    src: '/flags/turki.png',
    fallback: 'TR',
    pattern: /\b(TURKI|TURKEY|ISTANBUL|BURSA|ANKARA|CAPPADOCIA)\b/i,
  },
  {
    code: 'eg',
    label: 'Mesir',
    src: '/flags/mesir.png',
    fallback: 'EG',
    pattern: /\b(MESIR|EGYPT|CAIRO|KAIRO|ALEXANDRIA|ISKANDARIYAH)\b/i,
  },
  {
    code: 'cn',
    label: 'China',
    src: '/flags/china.png',
    fallback: 'CN',
    pattern: /\b(CHINA|TIONGKOK|HAIKOU|BEIJING|SHANGHAI|GUANGZHOU)\b/i,
  },
  {
    code: 'ps',
    label: 'Palestine',
    src: '/flags/palestine.svg',
    fallback: 'PS',
    pattern: /\b(AQSA|AQSHA|AL AQSA|AL AQSHA|PALESTIN|PALESTINE|JORDAN|AMMAN|PETRA|JERUSALEM|BAITUL MAQDIS)\b/i,
  },
];

export function getDestinationFlags(paket) {
  const packageName = String(paket || '').toUpperCase();
  const matchedDestinationFlags = EXTRA_DESTINATION_FLAGS
    .filter(flag => flag.pattern.test(packageName))
    .map(({ pattern: _pattern, ...flag }) => flag);
  return matchedDestinationFlags.length > 0 ? matchedDestinationFlags : [SAUDI_DESTINATION_FLAG];
}

export function buildBerangkatGroups(items) {
  const map = new Map();
  for (const item of items || []) {
    const key = item.jadwal_id || `${item.paket || '-'}|${item.tgl_berangkat}|${item.berangkat_kode_penerbangan || ''}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        paket: item.paket || 'Paket Umroh',
        count: 0,
        tour_leader: cleanTourLeader(item.tour_leader),
        manasik_tgl: item.manasik_tgl || null,
        manasik_jam: item.manasik_jam || null,
        tgl_berangkat: item.tgl_berangkat,
        berangkat_kode_penerbangan: item.berangkat_kode_penerbangan || null,
        items: [],
      });
    }
    const group = map.get(key);
    group.items.push(item);
    group.count++;
  }
  return Array.from(map.values()).sort((a, b) =>
    String(a.tgl_berangkat || '').localeCompare(String(b.tgl_berangkat || ''))
    || a.paket.localeCompare(b.paket)
  );
}

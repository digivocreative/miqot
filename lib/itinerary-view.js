// Logika murni tampilan web itinerary — dipakai FE (src/components/itinerary/) dan
// bisa dipakai server. Tanpa dependensi. Spec: docs/superpowers/specs/2026-07-30-itinerary-web-view-design.md
//
// Kota → key. Urutan entri TIDAK menentukan prioritas — pencocokan memakai posisi
// kemunculan TERAKHIR di string location ("Medinah – Mekkah" → 'mekkah').
const CITY_PATTERNS = [
  { key: 'mekkah', re: /mekkah|makkah|mecca|thaif|taif/gi },
  { key: 'madinah', re: /madinah|medinah|madina|medina|bir\s*ali/gi },
  { key: 'dubai', re: /dubai/gi },
  { key: 'turki', re: /istanbul|bursa|cappadocia|kapadokya|ankara|turki|turkey|türkiye/gi },
  { key: 'mesir', re: /cairo|kairo|alexandria|iskandaria|mesir|egypt/gi },
  { key: 'transit', re: /jeddah|jedah|laut\s*merah|red\s*sea/gi },
  { key: 'home', re: /jakarta|indonesia|soekarno|cgk|tanah\s*air/gi },
];

export function cityKeyForLocation(location) {
  if (!location || typeof location !== 'string') return null;
  let best = null;
  let bestIdx = -1;
  for (const { key, re } of CITY_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(location)) !== null) {
      if (m.index > bestIdx) { bestIdx = m.index; best = key; }
    }
  }
  return best;
}

function hasCityToken(text) {
  return CITY_PATTERNS.some(({ re }) => { re.lastIndex = 0; return re.test(text); });
}

export function classifyActivity(text, { dayIndex = 0, activityIndex = 0 } = {}) {
  const t = String(text || '').toLowerCase();
  // Posisional (cacat #8 spec): titik kumpul paket nyata sering tanpa kata "kumpul"
  // (mis. "Tiba di gate Cafe Zukavia gate 5 Terminal 2F ...").
  if (dayIndex === 0 && activityIndex === 0) return 'kumpul';
  if (/\b(berkumpul|kumpul)\b/.test(t)) return 'kumpul';
  if (/\btransit\b/.test(t)) return 'transit';
  // Landing: "tiba di hotel" bukan landing; "tiba di <kota>" iya.
  if (!/tiba di hotel/.test(t)) {
    if (/mendarat|tiba di (bandara|terminal)/.test(t)) return 'landing';
    if (/\btiba\b/.test(t) && hasCityToken(t)) return 'landing';
  }
  if (
    /berangkat\s+menuju|take\s*off|melanjutkan\s+dengan/.test(t) ||
    /dengan\s+(pesawat|saudia?|garuda|emirates|etihad|qatar|oman|turkish)/.test(t) ||
    /pesawat.*menuju/.test(t)
  ) return 'takeoff';
  return 'regular';
}

const HIGHLIGHT_ICONS = {
  kumpul: 'users',
  takeoff: 'plane-takeoff',
  landing: 'plane-landing',
  transit: 'plane-landing',
};

export function activityIconName(kind, text) {
  if (HIGHLIGHT_ICONS[kind]) return HIGHLIGHT_ICONS[kind];
  const t = String(text || '').toLowerCase();
  if (/makan|sarapan|nasi|resto/.test(t)) return 'utensils';
  if (/city\s*tour|photostop|foto\b|wisata/.test(t)) return 'camera';
  if (/ziarah|masjid|sholat|shalat|manasik|umrah|umroh|raudlah|percetakan/.test(t)) return 'landmark';
  if (/hotel|istirahat|koper|check\s*(in|out)|cek\s*(in|out)/.test(t)) return 'bed-double';
  if (/imigrasi|paspor|boarding/.test(t)) return 'badge-check';
  if (/pengarahan|pembagian/.test(t)) return 'megaphone';
  return 'circle-dot';
}

// Tempat yang layak ditebalkan di teks aktivitas: situs suci, titik ziarah,
// kota, dan bandara. Nama hotel SENGAJA tidak masuk — variasinya tak terbatas
// dan menebalkannya membuat hampir tiap baris tebal, yang justru meniadakan
// gunanya penebalan. Urutan tak menentukan apa pun; pencocokan memakai
// alternasi terpanjang-dulu yang dibangun di bawah.
const IMPORTANT_PLACES = [
  // Situs suci & titik ziarah
  'masjidil haram', 'masjid al-haram', 'masjid nabawi', 'masjid quba', 'masjid qiblatain',
  "ka'bah", 'kabah', 'raudhah', 'raudlah', 'raudah', 'multazam', 'hijr ismail', 'maqam ibrahim',
  'jabal rahmah', 'jabal nur', 'jabal uhud', 'jabal tsur', 'gua hira', 'gua tsur',
  'jannatul baqi', 'jannatul mualla', 'baqi', 'khandaq', 'arafah', 'muzdalifah', 'mina',
  'bir ali', 'dzulhulaifah', 'percetakan al-quran', 'kebun kurma',
  // Kota
  'mekkah', 'makkah', 'mecca', 'madinah', 'medinah', 'madina', 'medina',
  'jeddah', 'jedah', 'thaif', 'taif', 'jakarta', 'dubai', 'abu dhabi',
  'istanbul', 'bursa', 'cappadocia', 'kapadokya', 'ankara',
  'kairo', 'cairo', 'alexandria', 'iskandaria',
  // Bandara
  'soekarno-hatta', 'soekarno hatta', 'king abdulaziz', 'prince mohammed bin abdulaziz',
];

const IMPORTANT_PLACE_RE = new RegExp(
  `\\b(?:${[...IMPORTANT_PLACES]
    .sort((a, b) => b.length - a.length) // terpanjang dulu: "jabal uhud" menang atas "uhud"
    .map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})\\b`,
  'gi'
);

/**
 * Pecah teks aktivitas jadi potongan {text, bold} supaya nama tempat penting
 * bisa ditebalkan saat dirender. Mengembalikan potongan, bukan HTML: teks
 * itinerary berasal dari PDF pihak ketiga lewat parser LLM, jadi tak boleh
 * pernah masuk innerHTML.
 */
export function splitImportantPlaces(text) {
  const raw = String(text || '');
  if (!raw) return [];
  const parts = [];
  let last = 0;
  let m;
  IMPORTANT_PLACE_RE.lastIndex = 0;
  while ((m = IMPORTANT_PLACE_RE.exec(raw)) !== null) {
    if (m.index > last) parts.push({ text: raw.slice(last, m.index), bold: false });
    parts.push({ text: m[0], bold: true });
    last = m.index + m[0].length;
  }
  if (last < raw.length) parts.push({ text: raw.slice(last), bold: false });
  return parts.length ? parts : [{ text: raw, bold: false }];
}

const ID_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const ID_WEEKDAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
// Apostrof sudah dilucuti sebelum pencarian, jadi "jum'at"/"jum’at" ikut kena.
const ID_WEEKDAY_INDEX = {
  minggu: 0, ahad: 0, senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, sabtu: 6,
};

const TITLE_DATE_RE = new RegExp(
  `(?:(minggu|ahad|senin|selasa|rabu|kamis|jum['’]?at|sabtu)\\s*,?\\s*)?`
  + `(\\d{1,2})\\s+(${ID_MONTHS.join('|')})(?:\\s+(\\d{4}))?`,
  'i'
);

/**
 * Tanggal di judul hari berasal dari teks PDF dan TIDAK bisa dipercaya. PDF
 * JBU1504, misalnya, menulis "05 September" dua kali sehingga seluruh hari
 * sesudahnya mundur sehari — hari terakhirnya meleset dari pulang_tgl. Yang
 * jadi sumber kebenaran adalah berangkat_tgl di jadwal (dipakai kartu
 * penerbangan dan sinkronisasi), jadi tanggal di judul ditulis ulang dari sana.
 *
 * Nama hari diturunkan dari tanggal, bukan disalin — kalau angkanya salah,
 * nama harinya juga tak bisa diandalkan. Tapi ejaan aslinya dipertahankan
 * selama sudah menunjuk hari yang benar, supaya "Ahad" tidak berubah jadi
 * "Minggu" dan "Jum'at" tidak berubah jadi "Jumat" tanpa alasan.
 *
 * Mengembalikan { title, hadDate }. `hadDate` true berarti judul sudah memuat
 * tanggal, sehingga pemanggil tak perlu menampilkannya lagi di baris terpisah.
 */
export function retitleDayWithDate(title, isoDate) {
  const raw = String(title || '');
  const m = raw.match(TITLE_DATE_RE);
  if (!m) return { title: raw, hadDate: false };
  if (!isoDate) return { title: raw, hadDate: true };

  const iso = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!iso) return { title: raw, hadDate: true };
  const d = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  if (Number.isNaN(d.getTime())) return { title: raw, hadDate: true };

  const original = (m[1] || '').toLowerCase().replace(/['’]/g, '');
  const sameDay = ID_WEEKDAY_INDEX[original] === d.getUTCDay();
  const weekday = sameDay ? m[1] : ID_WEEKDAYS[d.getUTCDay()];
  const padded = m[2].length === 2 && m[2].startsWith('0');
  const day = padded ? String(d.getUTCDate()).padStart(2, '0') : String(d.getUTCDate());
  const corrected = `${m[1] ? `${weekday}, ` : ''}${day} ${ID_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

  return { title: raw.replace(TITLE_DATE_RE, corrected), hadDate: true };
}

function parseIsoUtc(value) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Tanggal tiap hari itinerary (YYYY-MM-DD), ditambatkan ke `dayNumber` — BUKAN
 * ke posisi di array. Banyak PDF Alhijaz memulai dari "Hari 0" (kumpul di
 * Jakarta sehari sebelum terbang), jadi menghitung berangkat_tgl + indeks array
 * menggeser SELURUH hari mundur sehari. Hari 1 selalu hari keberangkatan.
 *
 * Mengembalikan null untuk semua hari kalau penomorannya tak bisa dipercaya:
 * ada nomor yang hilang, urutannya mundur, atau nomor hari terakhir tak jatuh
 * tepat di pulang_tgl. Kalau penomoran dan jadwal tak sepakat, kita tidak tahu
 * hari mana yang hilang atau berlebih — dan menebak berarti memasang tanggal
 * salah di setiap kartu. Sama seperti computeNightSegments, lebih baik hilang
 * daripada salah.
 */
export function itineraryDayDates(days, departISO, returnISO) {
  const list = Array.isArray(days) ? days : [];
  const none = list.map(() => null);
  const start = parseIsoUtc(departISO);
  if (!start || !list.length) return none;

  const numbers = list.map((d) => {
    const m = String(d?.dayNumber ?? '').match(/\d+/);
    return m ? Number(m[0]) : null;
  });
  if (numbers.some(n => n === null)) return none;
  for (let i = 1; i < numbers.length; i += 1) {
    if (numbers[i] < numbers[i - 1]) return none;
  }

  const end = parseIsoUtc(returnISO);
  if (end) {
    const span = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    if (Math.max(...numbers) !== span) return none;
  }

  return numbers.map((n) => {
    const d = new Date(start.getTime());
    d.setUTCDate(d.getUTCDate() + (n - 1));
    return d.toISOString().slice(0, 10);
  });
}

export function computeNightSegments(days) {
  if (!Array.isArray(days) || days.length < 2) return null;
  const nightDays = days.slice(0, -1); // hari terakhir tak bermalam
  const keys = nightDays.map(d => cityKeyForLocation((d && d.location) || ''));
  const unresolved = keys.filter(k => k === null).length;
  if (unresolved / keys.length > 0.3) return null;
  const segments = [];
  for (const key of keys) {
    if (key === null) continue; // toleransi kecil: lewati yang tak dikenal
    const last = segments[segments.length - 1];
    if (last && last.key === key) last.nights += 1;
    else segments.push({ key, nights: 1 });
  }
  if (!segments.length) return null;
  return segments;
}

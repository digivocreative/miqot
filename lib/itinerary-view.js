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

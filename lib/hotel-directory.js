// Direktori Hotel — helper murni (gate akses, validasi payload, proyeksi list).
//
// Gate slug sengaja dijadikan SATU titik keputusan (meniru lib/community-access.js
// era rilis terbatas Teras): membuka fitur untuk semua agent nanti cukup mengedit
// file ini + kembarannya di klien, src/lib/hotelAccess.ts.

export const HOTEL_DIRECTORY_AGENT_SLUGS = new Set(['nikita', 'bagas']);

export const HOTEL_CITIES = ['mekkah', 'madinah', 'turki', 'dubai'];

export const HOTEL_CITY_LABELS = {
  mekkah: 'Mekkah',
  madinah: 'Madinah',
  turki: 'Turki',
  dubai: 'Dubai',
};

// Hanya kota masjid yang punya landmark jarak; turki/dubai tampil area/distrik saja.
export const HOTEL_CITY_LANDMARKS = {
  mekkah: 'Masjidil Haram',
  madinah: 'Masjid Nabawi',
};

export const HOTEL_MAX_MEDIA_ITEMS = 30;

// Kategori media DITAWARKAN, bukan didaftar: tidak ada kolom daftar kategori.
// Ketiganya selalu jadi chip siap-klik di panel Kelola (pola FACILITY_PRESETS),
// sedangkan daftar yang tampil di galeri agent diturunkan dari label terpakai.
export const HOTEL_MEDIA_CATEGORY_PRESETS = ['Lobby', 'Kamar', 'Restoran'];

// Rating platform pemesanan. `max` WAJIB per platform: Booking & Agoda memakai
// skala 10, sisanya 5 — menyamakan semuanya ke 5 membuat 8,6 terbaca lebih
// buruk daripada 4,3. `hosts` menjaga tautannya benar-benar menuju platform
// yang diklaim, bukan tautan sembarangan yang menyamar.
export const HOTEL_RATING_PLATFORMS = [
  { id: 'google', label: 'Google', max: 5, hosts: ['maps.app.goo.gl', 'goo.gl', 'maps.google.com', 'www.google.com', 'google.com'] },
  { id: 'tripadvisor', label: 'Tripadvisor', max: 5, hosts: ['tripadvisor.com', 'www.tripadvisor.com', 'tripadvisor.co.id', 'www.tripadvisor.co.id'] },
  { id: 'booking', label: 'Booking.com', max: 10, hosts: ['booking.com', 'www.booking.com'] },
  { id: 'agoda', label: 'Agoda', max: 10, hosts: ['agoda.com', 'www.agoda.com'] },
  { id: 'tripcom', label: 'Trip.com', max: 5, hosts: ['trip.com', 'www.trip.com', 'id.trip.com'] },
];

const RATING_PLATFORM_BY_ID = new Map(HOTEL_RATING_PLATFORMS.map((p) => [p.id, p]));

// null = ditolak (pemanggil membalas 400); array = daftar bersih siap simpan.
export function normalizeHotelRatingsInput(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;

  const out = [];
  const seen = new Set();
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;

    const platform = typeof item.platform === 'string' ? item.platform.trim().toLowerCase() : '';
    const config = RATING_PLATFORM_BY_ID.get(platform);
    if (!config) return null;
    // Dua entri platform sama = ambigu; tolak daripada diam-diam memilih satu.
    if (seen.has(platform)) return null;
    seen.add(platform);

    const score = typeof item.score === 'number' ? item.score : Number.NaN;
    if (!Number.isFinite(score) || score < 0 || score > config.max) return null;
    // Satu desimal: itu presisi yang dipakai semua platform ini.
    const rounded = Math.round(score * 10) / 10;

    let reviews = null;
    if (item.reviews !== undefined && item.reviews !== null && item.reviews !== '') {
      const parsed = typeof item.reviews === 'number' ? item.reviews : Number.NaN;
      if (!Number.isInteger(parsed) || parsed < 0) return null;
      reviews = parsed;
    }

    let url = null;
    if (item.url !== undefined && item.url !== null && String(item.url).trim() !== '') {
      const raw = String(item.url).trim();
      let parsed;
      try {
        parsed = new URL(raw);
      } catch {
        return null;
      }
      if (parsed.protocol !== 'https:') return null;
      if (!config.hosts.includes(parsed.hostname.toLowerCase())) return null;
      url = raw;
    }

    out.push({ platform, score: rounded, reviews, url });
  }
  return out;
}

const LIMITS = {
  name: 120,
  area: 120,
  address: 300,
  description: 2000,
  agent_note: 1000,
  distance_label: 60,
  walk_label: 60,
  facility: 30,
  facilities: 20,
  media_category: 30,
};

const GMAPS_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'maps.google.com',
  'www.google.com',
  'google.com',
]);

export function isHotelDirectoryEnabledForAgent(agentOrSlug) {
  const slug = typeof agentOrSlug === 'string' ? agentOrSlug : agentOrSlug?.slug;
  return HOTEL_DIRECTORY_AGENT_SLUGS.has(String(slug || '').trim().toLowerCase());
}

export function requireHotelDirectoryAccess(agent, res) {
  if (isHotelDirectoryEnabledForAgent(agent)) return true;
  res.status(403).json({ error: 'Direktori Hotel belum tersedia untuk agent ini' });
  return false;
}

export function slugifyHotelName(name, existingSlugs = []) {
  const base = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '') || 'hotel';
  const taken = new Set([...existingSlugs].map((s) => String(s).toLowerCase()));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

// Cermin normalizeCommunityMediaInput (server.js) TANPA syarat slug pengunggah:
// hotel adalah entitas bersama — media bisa diunggah nikita atau bagas, jadi cukup
// origin CDN + folder /hotels/, tanpa query/hash, dan ekstensi sesuai tipe.
export function normalizeHotelMediaInput(value, publicUrlPrefixes = []) {
  if (!Array.isArray(value) || value.length > HOTEL_MAX_MEDIA_ITEMS) return null;
  const expectedPrefixes = [];
  for (const prefix of publicUrlPrefixes) {
    try {
      const parsed = new URL(prefix);
      expectedPrefixes.push({ origin: parsed.origin, path: parsed.pathname });
    } catch {
      /* prefix tak valid diabaikan */
    }
  }
  if (expectedPrefixes.length === 0) return null;

  const seenUrls = new Set();
  const normalized = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    if (item.type !== 'image' && item.type !== 'video') return null;
    if (typeof item.url !== 'string') return null;
    let candidate;
    try {
      candidate = new URL(item.url);
    } catch {
      return null;
    }
    const matchesPrefix = expectedPrefixes.some(
      (prefix) => candidate.origin === prefix.origin && candidate.pathname.startsWith(prefix.path)
    );
    if (!matchesPrefix || candidate.search || candidate.hash) return null;
    const path = candidate.pathname.toLowerCase();
    const hasExpectedExtension = item.type === 'image'
      ? /\.(?:jpe?g|png|webp)$/.test(path)
      : /\.(?:mp4|mov|webm)$/.test(path);
    if (!hasExpectedExtension || seenUrls.has(item.url)) return null;
    seenUrls.add(item.url);
    // Kategori opsional. Kosong = kunci DIBUANG, bukan disimpan sebagai "" —
    // string kosong akan melahirkan chip hantu di galeri.
    const entry = { type: item.type, url: item.url };
    if (item.category !== undefined && item.category !== null) {
      if (typeof item.category !== 'string') return null;
      const category = item.category.trim();
      if (category.length > LIMITS.media_category) return null;
      if (category) entry.category = category;
    }
    normalized.push(entry);
  }
  return normalized;
}

// Daftar kategori yang BENAR-BENAR dipakai media hotel ini, terurut: preset
// dulu (sesuai urutan preset), lalu kategori bikinan sendiri sesuai urutan
// kemunculan. Dedup case-insensitive — "lobby" dan "Lobby" satu kategori, dan
// ejaan preset yang menang supaya chip tidak tampil dua kali dengan beda huruf.
export function hotelMediaCategories(media) {
  const presetByKey = new Map(
    HOTEL_MEDIA_CATEGORY_PRESETS.map((preset) => [preset.toLowerCase(), preset])
  );
  const used = new Map();
  for (const item of Array.isArray(media) ? media : []) {
    const raw = typeof item?.category === 'string' ? item.category.trim() : '';
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (used.has(key)) continue;
    used.set(key, presetByKey.get(key) || raw);
  }
  const presets = [];
  for (const [key, label] of presetByKey) {
    if (used.has(key)) { presets.push(label); used.delete(key); }
  }
  return [...presets, ...used.values()];
}

function cleanText(value, maxLen) {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false };
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > maxLen) return { ok: false };
  return { ok: true, value: trimmed };
}

function cleanGmapsUrl(value) {
  const base = cleanText(value, 500);
  if (!base.ok) return { ok: false };
  if (base.value === null) return { ok: true, value: null };
  let parsed;
  try {
    parsed = new URL(base.value);
  } catch {
    return { ok: false };
  }
  if (parsed.protocol !== 'https:' || !GMAPS_HOSTS.has(parsed.hostname)) return { ok: false };
  return { ok: true, value: parsed.toString() };
}

// Whitelist eksplisit — field di luar daftar ini TIDAK pernah ikut ke DB
// (jebakan builder-payload-whitelist dari fitur edit Teras).
export function buildHotelPayload(input, { mediaPrefixes = [] } = {}) {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Payload hotel tidak valid' };
  }

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) return { ok: false, error: 'Nama hotel wajib diisi' };
  if (name.length > LIMITS.name) {
    return { ok: false, error: `Nama hotel maksimal ${LIMITS.name} karakter` };
  }

  const city = typeof input.city === 'string' ? input.city.trim().toLowerCase() : '';
  if (!HOTEL_CITIES.includes(city)) {
    return { ok: false, error: 'Kategori kota tidak dikenal' };
  }

  let stars = null;
  if (input.stars !== undefined && input.stars !== null) {
    if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) {
      return { ok: false, error: 'Bintang harus 1-5' };
    }
    stars = input.stars;
  }

  const cityHasDistance = Boolean(HOTEL_CITY_LANDMARKS[city]);
  const textFields = {};
  for (const [field, label] of [
    ['distance_label', 'Jarak'],
    ['walk_label', 'Keterangan jalan kaki'],
    ['area', 'Area/distrik'],
    ['address', 'Alamat'],
    ['description', 'Deskripsi'],
    ['agent_note', 'Catatan agent'],
  ]) {
    const cleaned = cleanText(input[field], LIMITS[field]);
    if (!cleaned.ok) {
      return { ok: false, error: `${label} tidak valid (maksimal ${LIMITS[field]} karakter)` };
    }
    textFields[field] = cleaned.value;
  }
  if (!cityHasDistance) {
    // Turki/Dubai tanpa jarak — paksa null meski klien mengirimnya.
    textFields.distance_label = null;
    textFields.walk_label = null;
  }

  const gmaps = cleanGmapsUrl(input.gmaps_url);
  if (!gmaps.ok) {
    return { ok: false, error: 'Link Google Maps harus https ke domain Google Maps' };
  }

  let facilities = [];
  if (input.facilities !== undefined && input.facilities !== null) {
    if (!Array.isArray(input.facilities) || input.facilities.some((f) => typeof f !== 'string')) {
      return { ok: false, error: 'Fasilitas harus berupa daftar teks' };
    }
    facilities = input.facilities.map((f) => f.trim()).filter(Boolean);
    if (facilities.length > LIMITS.facilities) {
      return { ok: false, error: `Fasilitas maksimal ${LIMITS.facilities} item` };
    }
    if (facilities.some((f) => f.length > LIMITS.facility)) {
      return { ok: false, error: `Tiap fasilitas maksimal ${LIMITS.facility} karakter` };
    }
  }

  let media = [];
  if (input.media !== undefined && input.media !== null) {
    const normalized = normalizeHotelMediaInput(input.media, mediaPrefixes);
    if (normalized === null) {
      return { ok: false, error: 'Daftar media hotel tidak valid' };
    }
    media = normalized;
  }

  const ratings = normalizeHotelRatingsInput(input.ratings);
  if (ratings === null) {
    return { ok: false, error: 'Daftar rating platform tidak valid' };
  }

  return {
    ok: true,
    data: {
      name,
      city,
      stars,
      distance_label: textFields.distance_label,
      walk_label: textFields.walk_label,
      area: textFields.area,
      address: textFields.address,
      gmaps_url: gmaps.value,
      description: textFields.description,
      facilities,
      agent_note: textFields.agent_note,
      media,
      ratings,
    },
  };
}

// Selisih media lama vs baru untuk pembersihan storage: URL yang hilang dari
// daftar baru DAN berada di bawah salah satu prefix media hotel. File di luar
// prefix bukan milik direktori — tidak pernah boleh ikut terhapus dari sini.
export function hotelMediaUrlsRemoved(oldMedia, newMedia, prefixes = []) {
  const kept = new Set();
  for (const item of Array.isArray(newMedia) ? newMedia : []) {
    if (typeof item?.url === 'string') kept.add(item.url);
  }
  const removed = [];
  const seen = new Set();
  for (const item of Array.isArray(oldMedia) ? oldMedia : []) {
    const url = typeof item?.url === 'string' ? item.url : '';
    if (!url || kept.has(url) || seen.has(url)) continue;
    if (!prefixes.some((prefix) => typeof prefix === 'string' && prefix && url.startsWith(prefix))) continue;
    seen.add(url);
    removed.push(url);
  }
  return removed;
}

// Proyeksi ringan untuk list — cover = foto pertama (video tidak bisa jadi cover).
export function hotelListItem(row) {
  const media = Array.isArray(row.media) ? row.media : [];
  const firstImage = media.find((m) => m?.type === 'image') || null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    city: row.city,
    stars: row.stars ?? null,
    distance_label: row.distance_label ?? null,
    walk_label: row.walk_label ?? null,
    area: row.area ?? null,
    cover: firstImage ? firstImage.url : null,
    photo_count: media.filter((m) => m?.type === 'image').length,
    video_count: media.filter((m) => m?.type === 'video').length,
  };
}

// ── Helper penyaring/pengurut daftar (dipakai FE HotelPage) ──

// "±450m" → 450, "±2.5km" → 2500. Null bila label kosong/tak terbaca, supaya
// pemanggil bisa menaruh hotel tanpa jarak di urutan paling belakang.
export function parseHotelDistanceMeters(label) {
  const text = String(label || '').trim();
  if (!text) return null;
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(km|m)\b/i);
  if (!match) return null;
  const value = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) return null;
  return match[2].toLowerCase() === 'km' ? value * 1000 : value;
}

// Kota dari label area. Area kota tur ditulis "<distrik>, <Kota>"
// ("Görükle (Nilüfer), Bursa" → "Bursa"); tanpa koma berarti tidak ada kota
// yang bisa dipastikan — jangan menebak dari distriknya.
export function hotelAreaCity(area) {
  const text = String(area || '').trim();
  if (!text.includes(',')) return null;
  const tail = text.slice(text.lastIndexOf(',') + 1).trim();
  return tail || null;
}

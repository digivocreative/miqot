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
    normalized.push({ type: item.type, url: item.url });
  }
  return normalized;
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
    },
  };
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

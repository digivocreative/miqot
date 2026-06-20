export const TOP_PARTNER_ENDPOINT =
  'https://alhijazindowisata.com/jadwal/src/dataagen.php?sEcho=1&iColumns=10&iDisplayStart=0&iDisplayLength=-1';

export const TOP_PARTNER_PHOTO_PROXY_BASE =
  'https://alhijazindowisata.com/jadwal/_s.php?.max=350&.img=http://115.124.86.220/m/';

export const TOP_PARTNER_WHATSAPP_TEXT = 'Assalamualaikum, saya ingin info umroh Alhijaz';

export const TOP_PARTNER_META_TITLE = 'Top Partner Alhijaz Indowisata';

export const TOP_PARTNER_META_DESCRIPTION =
  'Temukan partner unggulan resmi yang responsif dan mudah dihubungi untuk konsultasi umroh dan haji plus.';

export const TOP_PARTNER_OG_IMAGE_PATH = '/og/top-partner.png';

function asText(value) {
  return value == null ? '' : String(value);
}

export function normalizeWaNumber(raw) {
  const digits = asText(raw).replace(/\D/g, '');
  if (!digits) return '';

  const normalized = digits.startsWith('0')
    ? `62${digits.slice(1)}`
    : digits.startsWith('62')
      ? digits
      : '';

  if (normalized.length < 10 || normalized.length > 15) return '';
  return normalized;
}

export function firstValidUrl(raw, options = {}) {
  const line = asText(raw).split(/[\r\n]/).map((v) => v.trim()).find(Boolean) || '';
  if (!line || line === '-') return '';

  const url = /^https?:\/\//i.test(line)
    ? line
    : /^www\./i.test(line)
      ? `https://${line}`
      : '';

  if (!url) return '';
  if (options.rejectMaps && /(^https?:\/\/)?(www\.)?(maps\.app\.goo\.gl|google\.[^/]+\/maps)/i.test(url)) {
    return '';
  }
  return url;
}

export function buildPhotoProxyUrl(file) {
  const cleanFile = asText(file).trim();
  return cleanFile ? `${TOP_PARTNER_PHOTO_PROXY_BASE}${cleanFile}` : '';
}

export function buildWaLink(phone) {
  const cleanPhone = normalizeWaNumber(phone);
  if (!cleanPhone) return '';
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(TOP_PARTNER_WHATSAPP_TEXT)}`;
}

export function sanitizePartnerRow(row) {
  const full = Array.isArray(row) ? row : [];
  const name = asText(full[0]).trim().replace(/\s+/g, ' ');
  const phone = normalizeWaNumber(full[1]);
  const photoFile = asText(full[2]).trim();

  return {
    id: asText(full[8]).trim(),
    name,
    phone,
    waLink: buildWaLink(phone),
    photo: buildPhotoProxyUrl(photoFile),
    photoFile,
    facebook: firstValidUrl(full[3]),
    instagram: firstValidUrl(full[4]),
    tiktok: firstValidUrl(full[6], { rejectMaps: true }),
    website: firstValidUrl(full[7]),
  };
}

export function sanitizePartnerRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(sanitizePartnerRow)
    .filter((partner) => partner.name);
}

export function shufflePartners(partners, random = Math.random) {
  const result = [...(Array.isArray(partners) ? partners : [])];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

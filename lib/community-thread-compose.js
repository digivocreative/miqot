// Helper murni untuk utas Teras (beberapa kiriman sekali kirim).
// Tanpa DB: semua validasi bentuk hidup di sini supaya bisa diuji tanpa server.
// Normalisasi media sengaja TIDAK di sini — ia butuh prefix URL publik dan
// slug agen yang hanya ada di server.js.

import { extractCommunityMentions } from './community-mentions.js';

export const MAX_THREAD_SEGMENTS = 5;
export const MAX_SEGMENT_BODY_CHARS = 500;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function readSegment(raw) {
  const body = typeof raw?.body === 'string' ? raw.body.trim() : '';
  return {
    clientId: raw?.client_id === undefined ? null : raw.client_id,
    body,
    length: Array.from(body).length,
    media: raw?.media,
    photoUrl: raw?.photo_url,
    hasQuote: raw?.quoted_post_id !== undefined && raw?.quoted_post_id !== null,
    hasLinkPreview: raw?.link_preview !== undefined && raw?.link_preview !== null,
  };
}

function fail(error) {
  return { segments: null, error };
}

/**
 * Menerima bentuk lama `{ body, media, photo_url, client_id }` maupun bentuk
 * baru `{ segments: [...] }` dan mengembalikan daftar segmen tervalidasi.
 * Bentuk lama sengaja mempertahankan pesan galatnya yang persis, karena klien
 * dan tes yang sudah ada bergantung padanya.
 */
export function normalizeThreadSegments(payload) {
  const isLegacy = payload?.segments === undefined;
  const rawSegments = isLegacy ? [payload] : payload.segments;

  if (!Array.isArray(rawSegments)) return fail('Format utas tidak valid');
  if (rawSegments.length === 0) return fail('Utas wajib berisi minimal 1 kiriman');
  if (rawSegments.length > MAX_THREAD_SEGMENTS) {
    return fail(`Utas maksimal ${MAX_THREAD_SEGMENTS} kiriman`);
  }

  const segments = rawSegments.map(readSegment);
  const isThread = segments.length > 1;

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    if (segment.length < 1 || segment.length > MAX_SEGMENT_BODY_CHARS) {
      return fail(isThread
        ? `Isi kiriman ke-${i + 1} wajib 1–${MAX_SEGMENT_BODY_CHARS} karakter`
        : `Isi posting wajib 1–${MAX_SEGMENT_BODY_CHARS} karakter`);
    }
    // Rantai parent_post_id harus diketahui sebelum insert pertama, jadi utas
    // wajib membawa id dari klien. Kiriman tunggal boleh tanpa id (bentuk lama).
    if (segment.clientId === null) {
      if (isThread) return fail('Setiap kiriman dalam utas wajib punya ID');
    } else if (!isUuid(segment.clientId)) {
      return fail('ID kiriman tidak valid');
    }
    if (i > 0 && (segment.hasQuote || segment.hasLinkPreview)) {
      return fail('Kutipan dan pratinjau tautan hanya boleh di kiriman pertama');
    }
  }

  const ids = segments.map(segment => segment.clientId).filter(Boolean);
  if (new Set(ids).size !== ids.length) return fail('ID kiriman kembar dalam satu utas');

  return {
    segments: segments.map(segment => ({
      clientId: segment.clientId,
      body: segment.body,
      media: segment.media,
      photoUrl: segment.photoUrl,
    })),
    error: null,
  };
}

/**
 * Menyusun rantai insert. Segmen 1 sengaja tetap `null/null` supaya utas satu
 * segmen tak terbedakan dari kiriman biasa.
 */
export function buildThreadChain(segments) {
  const rootId = segments.length > 1 ? segments[0].clientId : null;
  return segments.map((segment, index) => ({
    ...segment,
    parentPostId: index === 0 ? null : segments[index - 1].clientId,
    rootPostId: index === 0 ? null : rootId,
  }));
}

/**
 * Kumpulkan sebutan dari seluruh utas. Tiap orang muncul sekali, memetakan ke
 * segmen tempat ia PERTAMA disebut, dan `limit` berlaku untuk daftar gabungan.
 * @param {Array<{postId: string, body: string}>} segments
 */
export function collectThreadMentions(segments, memberSlugs, authorSlug, limit) {
  const seen = new Set();
  const out = [];
  for (const segment of segments) {
    const slugs = extractCommunityMentions(segment.body, memberSlugs, authorSlug, limit);
    for (const slug of slugs) {
      if (seen.has(slug)) continue;
      seen.add(slug);
      out.push({ slug, postId: segment.postId });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

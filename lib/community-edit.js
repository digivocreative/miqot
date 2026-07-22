// Validasi edit kiriman/komentar Teras — murni, tanpa DB, diuji unit.
// Batas panjang HARUS selaras dengan aturan buat: kiriman ikut
// MAX_SEGMENT_BODY_CHARS (community-thread-compose), komentar 300 (angka yang
// sama dengan cek di POST /api/community/posts/:id/comments dan
// MAX_COMMUNITY_COMMENT_CHARS di TerasPage.tsx — 3 titik sinkron).

import { hasEveryoneMention } from './community-broadcast.js';
import { MAX_SEGMENT_BODY_CHARS } from './community-thread-compose.js';

export const MAX_REPLY_BODY_CHARS = 300;

/**
 * Edit tidak memicu broadcast, jadi @semua yang BARU muncul lewat edit akan
 * menampilkan pil yang menjanjikan notifikasi yang tidak pernah terjadi —
 * ditolak. @semua yang memang sudah ada di teks lama boleh tetap/dihapus.
 */
export function validateCommunityEdit({ nextBody, previousBody, isReply }) {
  const body = typeof nextBody === 'string' ? nextBody.trim() : '';
  const length = Array.from(body).length;
  const max = isReply ? MAX_REPLY_BODY_CHARS : MAX_SEGMENT_BODY_CHARS;
  if (length < 1 || length > max) {
    return {
      ok: false,
      error: isReply
        ? `Isi komentar wajib 1–${MAX_REPLY_BODY_CHARS} karakter`
        : `Isi posting wajib 1–${MAX_SEGMENT_BODY_CHARS} karakter`,
    };
  }
  const previous = typeof previousBody === 'string' ? previousBody : '';
  if (hasEveryoneMention(body) && !hasEveryoneMention(previous)) {
    return { ok: false, error: 'Tidak bisa menambah @semua lewat edit' };
  }
  return { ok: true, body };
}

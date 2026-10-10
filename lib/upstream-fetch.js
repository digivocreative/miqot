// fetch ke server Alhijaz (115.124.86.220) yang kadang menelan sebagian besar
// koneksi TCP berjam-jam (10 Okt 2026: ±60% SYN tak berbalas, yang tersambung
// dijawab 0,03 dtk). Default undici menunggu 10 dtk per sambungan lalu request
// gagal — form daftar, login, sync, refresh jamaah ikut gagal.
//
// Sambung singkat + coba ulang HANYA untuk gagal-sambung: request belum pernah
// terkirim, jadi aman diulang untuk GET maupun POST. Gagal sesudah tersambung
// (timeout keseluruhan, 5xx, body putus) tidak diulang di sini.
import { Agent } from 'undici';

export const DEFAULT_CONNECT_TIMEOUT_MS = 3_000;
export const DEFAULT_CONNECT_ATTEMPTS = 5;

const RETRYABLE_NETWORK_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'EAI_AGAIN',
]);

export function networkErrorCode(err) {
  return err?.cause?.code || err?.code || '';
}

export function isRetryableConnectError(err) {
  return RETRYABLE_NETWORK_CODES.has(networkErrorCode(err));
}

/**
 * Buat pembungkus fetch dengan dispatcher sendiri (IPv4, connect timeout
 * singkat) yang mengulang gagal-sambung sampai `attempts` kali. Opsi lain
 * (headers, body, redirect, signal) diteruskan apa adanya; `signal` yang sudah
 * abort menghentikan pengulangan karena errornya bukan gagal-sambung.
 * `globalThis.fetch` dibaca saat dipanggil, jadi tes yang memalsukan fetch
 * tetap berjalan.
 */
export function createUpstreamFetch({
  connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
  attempts = DEFAULT_CONNECT_ATTEMPTS,
} = {}) {
  const dispatcher = new Agent({ connect: { family: 4, timeout: connectTimeoutMs } });
  return async function upstreamFetch(url, options = {}) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await globalThis.fetch(url, { ...options, dispatcher });
      } catch (err) {
        if (attempt >= attempts || !isRetryableConnectError(err)) throw err;
      }
    }
  };
}

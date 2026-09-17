// Pesan galat muat data untuk pengguna. Jangan tampilkan Error.message mentah
// ("HTTP error! status: 503", "signal is aborted without reason") — pengguna perlu tahu
// apa yang terjadi dan apa yang bisa dilakukan.

export interface LoadErrorContext {
  /** Default: navigator.onLine */
  online?: boolean;
}

export const LOAD_ERROR_MESSAGES = {
  offline: 'Tidak ada koneksi internet. Periksa sinyal atau Wi-Fi, lalu coba lagi.',
  timeout: 'Server terlalu lama merespons. Coba lagi sebentar lagi.',
  server: 'Server sedang bermasalah. Coba lagi beberapa saat lagi.',
  notFound: 'Data tidak ditemukan di server.',
  rateLimited: 'Terlalu banyak permintaan. Tunggu sebentar, lalu coba lagi.',
  generic: 'Data belum bisa dimuat. Coba lagi.',
} as const;

export function describeLoadError(error: unknown, context: LoadErrorContext = {}): string {
  const online = context.online ?? (typeof navigator === 'undefined' || navigator.onLine !== false);
  if (!online) return LOAD_ERROR_MESSAGES.offline;

  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';

  if (name === 'AbortError' || name === 'TimeoutError' || /abort|time(?:d)? ?out/i.test(message)) {
    return LOAD_ERROR_MESSAGES.timeout;
  }
  if (/failed to fetch|load failed|networkerror|network request failed/i.test(message)) {
    return LOAD_ERROR_MESSAGES.offline;
  }
  const status = Number(/status:?\s*(\d{3})/i.exec(message)?.[1]);
  if (status === 404) return LOAD_ERROR_MESSAGES.notFound;
  if (status === 429) return LOAD_ERROR_MESSAGES.rateLimited;
  if (status >= 500) return LOAD_ERROR_MESSAGES.server;
  return LOAD_ERROR_MESSAGES.generic;
}

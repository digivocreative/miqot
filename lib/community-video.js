// Inspeksi kontainer MP4/QuickTime untuk unggahan video Teras.
//
// Konteks: pipeline media Teras tidak mentranscode video — file diteruskan
// apa adanya ke CDN. iPhone dengan setelan kamera "High Efficiency" merekam
// HEVC (hvc1/hev1) dan iPhone Pro bisa merekam ProRes; keduanya TIDAK bisa
// didecode mayoritas Android/Windows, jadi harus ditolak saat upload dengan
// pesan yang menjelaskan cara memperbaikinya — bukan lolos lalu jadi laporan
// "video tidak bisa diputar" dari sebagian agent.
//
// Pendekatan blocklist (bukan allowlist): codec tak dikenal dibiarkan lolos
// supaya file aneh-tapi-playable tidak ditolak keliru; daftar di bawah hanya
// codec yang PASTI bermasalah lintas perangkat.

const REJECTED_VIDEO_CODECS = new Map([
  ['hvc1', 'hevc'],
  ['hev1', 'hevc'],
  ['dvh1', 'hevc'], // Dolby Vision (profil berbasis HEVC)
  ['dvhe', 'hevc'],
  ['ap4h', 'prores'],
  ['ap4x', 'prores'],
  ['apch', 'prores'],
  ['apcn', 'prores'],
  ['apcs', 'prores'],
  ['apco', 'prores'],
]);

const REJECTION_MESSAGES = {
  hevc: 'Video ini terekam dalam format HEVC (High Efficiency) yang tidak bisa diputar '
    + 'di sebagian besar perangkat. Di iPhone: Pengaturan > Kamera > Format > pilih '
    + '"Paling Kompatibel", lalu rekam ulang — atau ekspor ulang video sebagai MP4 (H.264).',
  prores: 'Video ini terekam dalam format ProRes yang tidak bisa diputar di browser. '
    + 'Ekspor ulang video sebagai MP4 (H.264) sebelum diunggah.',
};

const CONTAINER_BOXES = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);

/**
 * Kumpulkan fourcc sample-entry dari seluruh box stsd di dalam moov.
 * Berjalan atas buffer utuh (limit upload 20MB, sudah di memori).
 * Kembalikan [] bila struktur tidak bisa diparse — pemanggil memperlakukan
 * itu sebagai "tidak diketahui", bukan alasan menolak.
 */
export function mp4SampleEntryCodecs(buffer) {
  const codecs = [];
  try {
    walkBoxes(buffer, 0, buffer.length, codecs, 0);
  } catch {
    return [];
  }
  return codecs;
}

function walkBoxes(buffer, start, end, codecs, depth) {
  if (depth > 8) return;
  let offset = start;
  while (offset + 8 <= end) {
    let size = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    let headerSize = 8;
    if (size === 1) {
      if (offset + 16 > end) return;
      const largeSize = buffer.readBigUInt64BE(offset + 8);
      if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) return;
      size = Number(largeSize);
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < headerSize || offset + size > end) return;

    if (CONTAINER_BOXES.has(type)) {
      walkBoxes(buffer, offset + headerSize, offset + size, codecs, depth + 1);
    } else if (type === 'stsd') {
      readSampleEntries(buffer, offset + headerSize, offset + size, codecs);
    }
    offset += size;
  }
}

function readSampleEntries(buffer, start, end, codecs) {
  // stsd: version(1) + flags(3) + entry_count(4), lalu deretan sample entry
  // yang masing-masing box biasa (size + fourcc).
  if (start + 8 > end) return;
  const entryCount = buffer.readUInt32BE(start + 4);
  let offset = start + 8;
  for (let i = 0; i < entryCount && offset + 8 <= end; i += 1) {
    const size = buffer.readUInt32BE(offset);
    if (size < 8 || offset + size > end) return;
    codecs.push(buffer.toString('latin1', offset + 4, offset + 8));
    offset += size;
  }
}

/**
 * Null bila aman; {codec, message} bila unggahan memuat codec video yang
 * harus ditolak. `message` siap tampil ke pengguna (Bahasa Indonesia).
 */
export function findRejectedVideoCodec(buffer) {
  for (const fourcc of mp4SampleEntryCodecs(buffer)) {
    const family = REJECTED_VIDEO_CODECS.get(fourcc);
    if (family) return { codec: fourcc, message: REJECTION_MESSAGES[family] };
  }
  return null;
}

// H.264 — satu-satunya codec video yang bisa diputar di semua perangkat agent
// (iPhone lama, Android, desktop) tanpa syarat.
const BASELINE_VIDEO_CODECS = new Set(['avc1', 'avc3']);

const BASELINE_MISSING_MESSAGE = 'Video harus MP4 dengan codec H.264 supaya bisa diputar '
  + 'di semua perangkat agent. Ekspor ulang video sebagai MP4 (H.264), lalu unggah lagi.';

/**
 * Kebijakan LEBIH KETAT dari findRejectedVideoCodec: selain menolak codec yang
 * pasti bermasalah, video WAJIB memuat trek H.264 — kontainer yang tidak bisa
 * diparse pun ditolak. Dipakai Direktori Hotel: pengunggahnya cuma 2 admin
 * (salah-tolak murah, tinggal ekspor ulang) sementara isinya dibuka berulang
 * oleh semua agent lintas perangkat (video tak terputar mahal). Teras tetap
 * memakai blocklist karena pengunggahnya seluruh agent.
 */
export function findUnplayableVideo(buffer) {
  const codecs = mp4SampleEntryCodecs(buffer);
  for (const fourcc of codecs) {
    const family = REJECTED_VIDEO_CODECS.get(fourcc);
    if (family) return { codec: fourcc, message: REJECTION_MESSAGES[family] };
  }
  if (codecs.some((fourcc) => BASELINE_VIDEO_CODECS.has(fourcc))) return null;
  return { codec: codecs[0] || null, message: BASELINE_MISSING_MESSAGE };
}

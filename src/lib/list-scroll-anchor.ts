/**
 * Menjaga kartu yang sedang dibaca tetap di tempatnya saat daftar paket ditukar.
 *
 * Refresh latar (revalidasi cache + interval 30 menit) mengganti SELURUH array
 * packages. Kalau data segar menjatuhkan satu paket yang posisinya di ATAS
 * viewport — mis. kursinya habis, jadi tersaring keluar mode AVAILABLE — semua
 * kartu di bawahnya naik setinggi kartu itu (terukur 524px untuk dua kartu).
 *
 * Tidak ada yang menahan pergeseran itu: daftarnya sengaja memakai
 * `[overflow-anchor:none]` (lihat App.tsx) dan iOS Safari memang belum punya
 * scroll anchoring sama sekali (`overflow-anchor` baru ada di Safari 27). Jadi
 * kompensasinya harus manual: ukur posisi kartu jangkar sebelum swap, ukur lagi
 * setelah layout, lalu geser scroll sebesar selisihnya.
 *
 * Mekanismenya sama persis dengan `anchorCardDuringToggle` di App.tsx yang sudah
 * terbukti untuk animasi buka/tutup kartu — bedanya di sini koreksinya sekali
 * jalan (bukan ResizeObserver), karena swap daftar itu satu commit, bukan animasi.
 */

const CARD_SELECTOR = '[data-jadwal-id]';

/**
 * Berapa kartu cadangan yang ikut dicatat. Kartu jangkar sendiri BISA lenyap
 * (justru paket yang kursinya habis itulah yang hilang), jadi butuh kandidat
 * berikutnya. Semua kartu di bawah bergeser serempak, jadi meluruskan kartu mana
 * pun yang selamat memberi hasil yang sama.
 */
const FALLBACK_DEPTH = 8;

/** Di bawah ini bukan pergeseran yang terasa — jangan panggil scrollBy sia-sia. */
const MIN_CORRECTION_PX = 0.5;

export interface ListAnchorCandidate {
  id: string;
  /** Posisi relatif viewport (rect.top), bukan dokumen: itu yang dilihat mata. */
  top: number;
}

export interface ListAnchor {
  candidates: ListAnchorCandidate[];
}

type MinimalElement = Pick<Element, 'getBoundingClientRect' | 'getAttribute'>;
type MinimalDocument = { querySelectorAll(selector: string): ArrayLike<MinimalElement> };
type MinimalWindow = { scrollBy(x: number, y: number): void };

/**
 * Catat kartu pertama yang masih kelihatan (rect.bottom > 0) beserta beberapa
 * kartu sesudahnya. HARUS dipanggil sinkron sebelum setPackages, selagi DOM
 * masih memuat daftar yang lama.
 */
export function captureListAnchor(doc: MinimalDocument = document): ListAnchor | null {
  const cards = Array.from(doc.querySelectorAll(CARD_SELECTOR));
  const startIndex = cards.findIndex(card => card.getBoundingClientRect().bottom > 0);
  if (startIndex === -1) return null;

  const candidates: ListAnchorCandidate[] = [];
  for (const card of cards.slice(startIndex, startIndex + FALLBACK_DEPTH)) {
    const id = card.getAttribute('data-jadwal-id');
    if (id) candidates.push({ id, top: card.getBoundingClientRect().top });
  }

  return candidates.length > 0 ? { candidates } : null;
}

/**
 * Kembalikan kartu jangkar ke posisi layar semula. Dipanggil di useLayoutEffect —
 * setelah DOM baru terpasang, SEBELUM paint — supaya pergeserannya tak pernah
 * sempat terlihat.
 *
 * @returns jumlah piksel yang dikoreksi (0 = tidak ada yang perlu digeser).
 */
export function restoreListAnchor(
  anchor: ListAnchor | null,
  doc: MinimalDocument = document,
  win: MinimalWindow = window,
): number {
  if (!anchor) return 0;

  const byId = new Map<string, MinimalElement>();
  for (const card of Array.from(doc.querySelectorAll(CARD_SELECTOR))) {
    const id = card.getAttribute('data-jadwal-id');
    if (id && !byId.has(id)) byId.set(id, card);
  }

  for (const { id, top } of anchor.candidates) {
    const card = byId.get(id);
    if (!card) continue; // kandidat ini ikut tersaring keluar — coba yang berikutnya
    const delta = card.getBoundingClientRect().top - top;
    if (Math.abs(delta) < MIN_CORRECTION_PX) return 0;
    win.scrollBy(0, delta);
    return delta;
  }

  // Semua kandidat lenyap (mis. filter memangkas habis bagian daftar ini).
  // Tak ada titik acuan yang jujur — biarkan, jangan menebak.
  return 0;
}

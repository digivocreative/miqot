/**
 * Gestur tarik-untuk-segarkan: ambang, redaman, dan kelayakan titik mulai.
 *
 * Dipisah dari komponennya (src/components/pwa/PullToRefresh.tsx) supaya
 * keputusan gestur bisa diuji node:test tanpa browser — lihat
 * tests/pull-to-refresh.test.js. Fungsi yang menyentuh DOM di bawah sengaja
 * hanya MEMBACA (getComputedStyle, scrollHeight), jadi tetap aman dipanggil
 * berkali-kali dalam satu gestur.
 */

/** Gerakan mentah (px) sebelum arah gestur dinilai. Di bawah ini jari masih dianggap diam. */
export const PULL_START_SLOP = 8;

/** Jarak TERSAJI (sesudah redaman) yang mengunci refresh saat jari diangkat. */
export const PULL_TRIGGER = 62;

/**
 * Asimtot jarak tersaji. Redamannya hiperbolik — makin jauh ditarik makin berat,
 * dan indikator tidak pernah lepas ke tengah layar berapa pun panjang tarikannya.
 */
export const PULL_MAX = 140;

/** Jarak parkir indikator selama refresh berjalan. */
export const PULL_PARK = 56;

/**
 * Redaman tarikan: `raw` px jari → px yang benar-benar digambar.
 * PULL_TRIGGER (62) tercapai di sekitar 111px tarikan mentah — sepadan dengan
 * rasa PTR bawaan iOS. Lebih pendek dari itu, gestur gampang terpicu saat
 * pengguna sebenarnya cuma mengayun daftar ke atas.
 */
export function dampPull(raw) {
  if (raw <= 0) return 0;
  return (PULL_MAX * raw) / (raw + PULL_MAX);
}

/**
 * Menilai gestur dari perpindahan sejak jari menyentuh: 'pending' = belum cukup
 * bukti, tunggu frame berikutnya. Sekali 'abandon', gestur itu TIDAK boleh
 * dinilai ulang — jari yang berbalik turun setelah menggulir ke atas bukan
 * tarikan refresh, dan halamannya pun sudah tidak di puncak lagi.
 *
 * Sumbu X diperiksa lebih dulu karena halaman jadwal penuh carousel horizontal:
 * geser mendatar yang kebetulan turun sedikit harus tetap milik carousel-nya.
 */
export function classifyGesture(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < PULL_START_SLOP && ay < PULL_START_SLOP) return 'pending';
  if (ax >= ay) return 'abandon';
  if (dy <= 0) return 'abandon';
  return 'pull';
}

const SCROLLABLE_OVERFLOW = new Set(['auto', 'scroll', 'overlay']);

/**
 * Titik mulai yang sah: BUKAN di dalam overlay dan BUKAN di dalam scroller lain.
 *
 * - `position: fixed` menyaring header jadwal, FloatingAgentBar, rail desktop,
 *   dan semua modal (ItineraryModal `fixed inset-0`, overlay FilterModal) sekali
 *   jalan — tanpa daftar komponen yang harus dijaga tetap mutakhir.
 * - Scroller-Y bersarang (dropdown filter, panel modal) menang atas halaman:
 *   tarikan di dalamnya milik mereka. Diperiksa dari `scrollHeight` yang NYATA,
 *   bukan dari kelasnya, supaya scroller yang isinya kebetulan muat tidak ikut
 *   memblokir.
 * - `data-ptr-ignore` disediakan untuk kasus yang lolos dua aturan di atas;
 *   belum dipakai siapa pun, dan memang tidak apa-apa begitu.
 */
export function isPullEligibleStart(target) {
  let node = target && typeof target === 'object' && 'nodeType' in target && target.nodeType === 1
    ? /** @type {Element} */ (target)
    : null;
  const root = node?.ownerDocument?.documentElement ?? null;

  while (node && node !== root) {
    if (node.hasAttribute('data-ptr-ignore')) return false;
    if (node.getAttribute('role') === 'dialog') return false;

    const style = node.ownerDocument?.defaultView?.getComputedStyle(node);
    if (style) {
      if (style.position === 'fixed') return false;
      if (SCROLLABLE_OVERFLOW.has(style.overflowY) && node.scrollHeight - node.clientHeight > 1) return false;
    }

    node = node.parentElement;
  }

  return true;
}

/**
 * Sedang mengetik → jangan tarik. Keyboard di layar menggeser viewport, dan
 * scrollY saat itu tidak bisa dipercaya sebagai "halaman di puncak".
 */
export function isTypingTarget(element) {
  if (!element) return false;
  const tag = element.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return element.isContentEditable === true;
}

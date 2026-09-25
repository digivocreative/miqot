/**
 * Kunci gulir halaman selama overlay layar penuh terbuka — TANPA mengubah lebar
 * viewport.
 *
 * Cara lazim (`overflow: hidden` di <body>) menghapus scrollbar halaman. Di
 * peramban yang scrollbar-nya memakan lebar, viewport langsung melebar:
 * Chrome/Edge/Safari desktop (index.css menata `::-webkit-scrollbar` global
 * selebar 6px, dan scrollbar bertata selalu klasik — bahkan di macOS yang
 * aslinya overlay) serta Firefox Windows (17px). Akibatnya:
 *
 * - Semua yang ditengahkan bergeser separuh lebar scrollbar — di halaman jadwal
 *   kolom tengah DAN kedua rail `fixed` melompat 3px saat galeri dibuka, lalu
 *   3px kembali sesudah galeri selesai memudar. Terbaca sebagai kedipan.
 * - WebKit mengukur media query TANPA scrollbar, jadi di jendela yang lebarnya
 *   ≤6px di atas breakpoint, mengunci gulir ikut melompati breakpoint itu (rail
 *   370↔400px di 1440, kolom 380↔512px di 1280).
 *
 * `scrollbar-gutter: stable` di <html> tidak menolong: Chromium mengabaikannya
 * untuk scrollbar viewport bertata saat sistemnya overlay (terukur Chromium 152,
 * macOS). Kompensasi padding juga tidak: tidak menyentuh media query WebKit, dan
 * setiap elemen `fixed` harus ikut dikoreksi satu per satu.
 *
 * Jadi: bila scrollbar memakan lebar, scrollbar DIBIARKAN dan gulirnya ditahan
 * lewat event — roda, tombol gulir, sentuh. Hanya gulir yang benar-benar akan
 * dimakan elemen yang bisa digulir di dalam overlay (strip thumbnail) yang
 * diloloskan. Bila scrollbar tidak memakan lebar (HP, scrollbar overlay),
 * `overflow: hidden` tidak menggeser apa pun dan tetap dipakai — ia juga
 * menahan gestur sentuh paling rapat.
 *
 * Satu-satunya yang lolos di mode event: menyeret scrollbar halaman itu sendiri.
 * Itu gestur sengaja, dan event `scroll` tidak bisa dibatalkan.
 */

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar']);
const FORM_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const ACTIVATES_ON_SPACE = new Set(['BUTTON', 'A', 'SUMMARY']);

type ElementLike = Element | null;

function asElement(target: EventTarget | null): ElementLike {
  const node = target as Element | null;
  return node && node.nodeType === 1 ? node : null;
}

function isFormControl(el: ElementLike): boolean {
  return Boolean(el && (FORM_TAGS.has(el.tagName) || (el as HTMLElement).isContentEditable));
}

/**
 * Apakah gulir sebesar (dx, dy) akan dimakan salah satu leluhur `target` di
 * dalam dokumen — bukan merambat ke halaman. Sumbu dominan yang dihitung;
 * elemen yang sudah mentok ke arah itu tidak dihitung (gulirnya akan merambat).
 */
function scrollsWithin(win: Window, target: EventTarget | null, dx: number, dy: number): boolean {
  const { body, documentElement } = win.document;
  const vertical = Math.abs(dy) >= Math.abs(dx);
  const delta = vertical ? dy : dx;
  if (delta === 0) return false;

  for (let el = asElement(target); el && el !== body && el !== documentElement; el = el.parentElement) {
    const style = win.getComputedStyle(el);
    const overflow = vertical ? style.overflowY : style.overflowX;
    if (overflow !== 'auto' && overflow !== 'scroll') continue;

    const room = vertical
      ? (delta > 0 ? el.scrollHeight - el.clientHeight - el.scrollTop : el.scrollTop)
      : (delta > 0 ? el.scrollWidth - el.clientWidth - el.scrollLeft : el.scrollLeft);
    if (room >= 1) return true;
  }
  return false;
}

function keyDelta(event: KeyboardEvent): number {
  switch (event.key) {
    case 'ArrowUp':
    case 'PageUp':
    case 'Home':
      return -1;
    case ' ':
    case 'Spacebar':
      return event.shiftKey ? -1 : 1;
    default:
      return 1;
  }
}

/**
 * Lebar yang dimakan scrollbar halaman. 0 = tidak ada scrollbar, atau
 * scrollbarnya overlay (HP, Firefox macOS): `overflow: hidden` di sana tidak
 * menggeser apa pun.
 */
export function documentScrollbarWidth(win: Window = window): number {
  return win.innerWidth - win.document.documentElement.clientWidth;
}

/**
 * Kunci gulir halaman. Kembalian = pelepas kuncinya.
 *
 * Mode `overflow: hidden` mengembalikan nilai overflow sebelumnya apa adanya,
 * jadi kunci bertumpuk (overlay di atas sheet yang juga mengunci) aman selama
 * dilepas berurutan terbalik.
 */
export function lockDocumentScroll(win: Window = window): () => void {
  const doc = win.document;
  // Diukur SEBELUM apa pun disentuh.
  if (documentScrollbarWidth(win) <= 0) {
    const previous = doc.body.style.overflow;
    doc.body.style.overflow = 'hidden';
    return () => {
      doc.body.style.overflow = previous;
    };
  }

  const onWheel = (event: WheelEvent) => {
    // Ctrl + roda = zoom peramban / pinch trackpad, bukan gulir.
    if (event.ctrlKey || !event.cancelable) return;
    if (scrollsWithin(win, event.target, event.deltaX, event.deltaY)) return;
    event.preventDefault();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || !SCROLL_KEYS.has(event.key)) return;
    const target = asElement(event.target);
    // Panah di slider Plyr = seek/volume; ketikan di isian bukan gulir.
    if (isFormControl(target)) return;
    // Spasi di tombol = mengaktifkan tombolnya.
    if ((event.key === ' ' || event.key === 'Spacebar') && target && ACTIVATES_ON_SPACE.has(target.tagName)) return;
    if (scrollsWithin(win, target, 0, keyDelta(event))) return;
    event.preventDefault();
  };

  let touchStart: { x: number; y: number } | null = null;
  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    touchStart = event.touches.length === 1 && touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const onTouchMove = (event: TouchEvent) => {
    // Dua jari = pinch-zoom; dibiarkan demi aksesibilitas.
    if (!touchStart || event.touches.length !== 1 || !event.cancelable) return;
    if (isFormControl(asElement(event.target))) return;
    const touch = event.touches[0];
    // Jari bergerak ke atas = isi menggulir ke bawah: tanda disamakan dengan roda.
    const dx = touchStart.x - touch.clientX;
    const dy = touchStart.y - touch.clientY;
    if (scrollsWithin(win, event.target, dx, dy)) return;
    event.preventDefault();
  };

  // capture: listener lain tidak bisa melompati kunci lewat stopPropagation.
  const active = { passive: false, capture: true } as const;
  win.addEventListener('wheel', onWheel, active);
  win.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
  win.addEventListener('touchmove', onTouchMove, active);
  // Bubble, bukan capture: pemilik tombol (dialog, Plyr) bereaksi lebih dulu,
  // dan yang sudah mereka cegah tidak disentuh lagi.
  win.addEventListener('keydown', onKeyDown);

  return () => {
    win.removeEventListener('wheel', onWheel, active);
    win.removeEventListener('touchstart', onTouchStart, { capture: true });
    win.removeEventListener('touchmove', onTouchMove, active);
    win.removeEventListener('keydown', onKeyDown);
  };
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Download, Share2, Loader2 } from 'lucide-react';
import PlyrVideo from './PlyrVideo';
import PhotoWatermark from './PhotoWatermark';
import { canShareFiles, downloadBlob } from '../utils/share';
import { stampWatermarkOnImage } from '../utils/stampWatermark';

export interface ViewerMediaItem {
  type: 'image' | 'video';
  url: string;
  poster?: string;
  width?: number;
  height?: number;
}

interface MediaViewerModalProps {
  media: ViewerMediaItem[];
  /** Item yang dibuka pertama; setelahnya modal mengurus indeksnya sendiri. */
  initialIndex?: number;
  /** Dipakai untuk aria-label dan keterangan bawah, mis. nama hotel. */
  label: string;
  /**
   * Teks watermark yang ditempel di pojok bawah FOTO (bukan video, yang
   * bawahnya dipakai kontrol pemutar). Opsional: permukaan lain yang memakai
   * viewer ini — mis. media Teras — tidak ikut kena watermark.
   */
  watermark?: string;
  /**
   * Tampilkan strip thumbnail di kaki viewer. Opt-in: permukaan yang membuka
   * satu media saja (mis. lampiran Teras) tidak butuh, dan stripnya memakan
   * ruang gambar. Dipakai galeri hotel di rail jadwal.
   */
  showThumbnails?: boolean;
  onClose: () => void;
}

// Salinan perilaku slide viewer media Teras (TerasPage.tsx). Ditaruh di komponen
// tersendiri supaya permukaan baru — halaman media Direktori Hotel — tidak
// menyalin ulang logikanya; Teras masih memakai versi inline-nya sendiri dan
// bisa dipindahkan ke sini tanpa mengubah tampilan.
const SLIDE_VARIANTS = {
  enter: (direction: number) => ({
    x: direction === 0 ? 0 : `${direction * 100}%`,
    opacity: direction === 0 ? 1 : 0.3,
    scale: direction === 0 ? 1 : 0.96,
  }),
  center: { x: 0, opacity: 1, scale: 1 },
  exit: (direction: number) => ({
    x: direction === 0 ? 0 : `${direction * -100}%`,
    opacity: 0.3,
    scale: 0.96,
  }),
};

// Nama berkas yang dikenali manusia saat tersimpan di galeri/Unduhan —
// bukan hash panjang milik CDN. Ekstensi diambil dari URL, lalu dari MIME
// bila URL-nya tidak membawa ekstensi.
function mediaFileName(label: string, index: number, url: string, mime: string): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'media';
  let ext = '';
  try {
    const match = new URL(url).pathname.match(/\.([a-z0-9]{1,5})$/i);
    if (match) ext = match[1].toLowerCase();
  } catch { /* URL relatif/aneh — jatuh ke MIME di bawah */ }
  if (!ext) {
    ext = mime.includes('png') ? 'png'
      : mime.includes('webp') ? 'webp'
      : mime.startsWith('video/') ? 'mp4'
      : 'jpg';
  }
  return `${base}-${index + 1}.${ext}`;
}

async function fetchMediaBlob(url: string): Promise<Blob> {
  // mode cors eksplisit: berkasnya dibaca ke kanvas (watermark), jadi respons
  // opaque tidak berguna. Rute service worker untuk foto CDN sengaja hanya
  // menangkap <img> (lihat vite.config.ts) supaya fetch ini tidak disodori
  // cache opaque milik <img> — itu yang dulu membuat Bagikan selalu gagal.
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`Media tidak bisa diambil (${res.status})`);
  return res.blob();
}

function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError';
}

/** Hasil penyiapan berkas: `stamped` false = watermark TIDAK jadi tercetak. */
interface PreparedMedia { blob: Blob; stamped: boolean }

export default function MediaViewerModal({ media, initialIndex = 0, label, watermark, showThumbnails, onClose }: MediaViewerModalProps) {
  const reduceMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(() => Math.max(0, Math.min(media.length - 1, initialIndex)));
  const [direction, setDirection] = useState(0);
  // Strip hanya berguna kalau ada yang bisa dilompati.
  const thumbsVisible = Boolean(showThumbnails) && media.length > 1;
  const thumbStripRef = useRef<HTMLDivElement>(null);
  // Video hanya diputar otomatis kalau memang item itu yang dibuka: kliknya
  // sendiri sudah gestur "mau nonton". Slide ke item lain mulai dari diam.
  const [autoPlay, setAutoPlay] = useState(() => media[initialIndex]?.type === 'video');
  const [busy, setBusy] = useState<'download' | 'share' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!thumbsVisible) return;
    const strip = thumbStripRef.current;
    const aktif = strip?.querySelector<HTMLElement>(`[data-thumb-index="${index}"]`);
    // 'nearest' supaya strip tidak melompat saat thumbnail aktif sudah terlihat.
    aktif?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  }, [index, thumbsVisible]);

  const navigate = useCallback((delta: number) => {
    setIndex(current => {
      const next = Math.max(0, Math.min(media.length - 1, current + delta));
      if (next === current) return current;
      setDirection(delta);
      setAutoPlay(false);
      return next;
    });
  }, [media.length]);

  /** Lompat ke satu media tertentu; arah slide diturunkan dari posisi relatifnya. */
  const goTo = useCallback((target: number) => {
    setIndex(current => {
      const next = Math.max(0, Math.min(media.length - 1, target));
      if (next === current) return current;
      setDirection(next > current ? 1 : -1);
      setAutoPlay(false);
      return next;
    });
  }, [media.length]);

  // Daftar media bisa menyusut saat modal terbuka (mis. data disegarkan).
  useEffect(() => {
    setIndex(current => Math.max(0, Math.min(media.length - 1, current)));
  }, [media.length]);

  // Pesan galat menempel pada satu media; pindah item = mulai bersih.
  useEffect(() => { setActionError(null); }, [index]);

  // Satu jalur penyiapan untuk Download DAN Share: ambil dari CDN, lalu bakar
  // watermark ke pikselnya. Video dilewati (bawahnya milik kontrol pemutar,
  // dan membakar teks ke video butuh transcode).
  //
  // Hasilnya disimpan per URL selama modal terbuka: foto yang sedang tampil
  // disiapkan LEBIH AWAL (efek di bawah), supaya saat tombol Bagikan ditekan
  // navigator.share() bisa dipanggil tanpa satu pun await di depannya. Safari
  // iOS mencabut izin share sheet begitu gestur ketuk "habis" oleh fetch +
  // bakar kanvas yang memakan lebih dari sedetik → NotAllowedError.
  const preparedRef = useRef(new Map<string, PreparedMedia>());
  useEffect(() => { preparedRef.current.clear(); }, [watermark]);

  const prepareMedia = useCallback(async (item: ViewerMediaItem): Promise<PreparedMedia> => {
    const cached = preparedRef.current.get(item.url);
    if (cached) return cached;
    const blob = await fetchMediaBlob(item.url);
    let prepared: PreparedMedia = { blob, stamped: false };
    if (watermark && item.type === 'image') {
      try {
        prepared = { blob: await stampWatermarkOnImage(blob, watermark), stamped: true };
      } catch {
        // Gagal membakar (kanvas ternoda, format aneh) TIDAK boleh membatalkan
        // unduhan — berkas asli tetap diberikan, dan pemanggil memberi tahu
        // bahwa watermark-nya tidak ikut. Diam-diam menyerahkan foto polos
        // justru yang paling berbahaya.
      }
    }
    preparedRef.current.set(item.url, prepared);
    return prepared;
  }, [watermark]);

  // Pemanasan: siapkan foto aktif sedikit setelah slide berhenti (jeda supaya
  // geser cepat melewati banyak foto tidak memicu decode beruntun). Hanya bila
  // perangkat punya share sheet — di desktop Download menunggu klik saja.
  const activeUrl = media[index]?.url;
  const activeType = media[index]?.type;
  useEffect(() => {
    if (!activeUrl || activeType !== 'image') return;
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return;
    const timer = window.setTimeout(() => {
      prepareMedia({ type: 'image', url: activeUrl }).catch(() => {
        // Galatnya dilaporkan saat tombol benar-benar ditekan.
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [activeUrl, activeType, prepareMedia]);

  const handleDownload = useCallback(async () => {
    const item = media[index];
    if (!item || busy) return;
    setBusy('download');
    setActionError(null);
    try {
      const { blob, stamped } = await prepareMedia(item);
      // Setelah dibakar, jenis berkas ditentukan kanvas (mis. webp → jpeg),
      // jadi ekstensi diambil dari MIME hasil, bukan dari URL sumber.
      downloadBlob(blob, mediaFileName(label, index, stamped ? '' : item.url, blob.type));
      if (!stamped && watermark && item.type === 'image') {
        setActionError('Watermark gagal ditempel — berkas terunduh tanpa watermark.');
      }
    } catch {
      // Jaringan/CDN bermasalah: buka di tab baru supaya media tetap bisa
      // disimpan manual, bukan buntu tanpa jalan keluar.
      setActionError('Gagal mengunduh. Media dibuka di tab baru.');
      window.open(item.url, '_blank', 'noopener,noreferrer');
    } finally {
      setBusy(null);
    }
  }, [busy, index, label, media, prepareMedia, watermark]);

  const handleShare = useCallback(async () => {
    const item = media[index];
    if (!item || busy) return;
    setBusy('share');
    setActionError(null);

    const toFile = ({ blob, stamped }: PreparedMedia) =>
      new File([blob], mediaFileName(label, index, stamped ? '' : item.url, blob.type), {
        type: blob.type || 'application/octet-stream',
      });

    // Berkas dulu (WhatsApp menerima medianya langsung); hanya kalau
    // perangkat menolak berkas, bagikan tautannya.
    const shareFile = async (file: File) => {
      if (canShareFiles([file])) {
        await navigator.share({ files: [file] });
        return true;
      }
      if (typeof navigator.share === 'function') {
        // Jalur terakhir: yang dibagikan tautan CDN mentah — foto di ujung
        // tautan itu TIDAK ber-watermark, karena bukan berkas kita yang lewat.
        await navigator.share({ title: label, url: item.url });
        return true;
      }
      return false;
    };

    let prepared: PreparedMedia | null = preparedRef.current.get(item.url) ?? null;
    try {
      // Jalur cepat: berkas sudah hangat → navigator.share() dipanggil masih di
      // dalam gestur ketuk. Jalur lambat (belum hangat) menunggu dulu; Chrome
      // memberi jeda 5 detik, Safari lebih pelit — galatnya ditangani di bawah.
      if (!prepared) prepared = await prepareMedia(item);
      const shared = await shareFile(toFile(prepared));
      if (!shared) setActionError('Perangkat ini tidak mendukung berbagi langsung — pakai Download.');
    } catch (err) {
      // Batal dari share sheet bukan kegagalan.
      if (isAbortError(err)) return;
      console.warn('[media-viewer] bagikan gagal:', err);
      if (prepared) {
        // Share sheet ditolak peramban (mis. gestur kedaluwarsa) padahal
        // berkasnya sudah ada: jangan buntu, serahkan lewat unduhan.
        downloadBlob(prepared.blob, toFile(prepared).name);
        setActionError('Bagikan ditolak peramban — berkas diunduh sebagai gantinya.');
      } else {
        setActionError('Gagal mengambil media dari CDN. Coba lagi.');
      }
    } finally {
      setBusy(null);
    }
  }, [busy, index, label, media, prepareMedia]);

  useLayoutEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const appRoot = document.getElementById('root');
    const previousAriaHidden = appRoot?.getAttribute('aria-hidden') ?? null;
    const previousInert = appRoot?.inert ?? false;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    document.body.style.overflow = 'hidden';
    appRoot?.setAttribute('aria-hidden', 'true');
    if (appRoot) appRoot.inert = true;

    const focusFrame = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLButtonElement>('[data-media-viewer-close]')?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      // Panah kiri/kanan milik pemutar video saat fokusnya di sana.
      if (event.target instanceof HTMLVideoElement) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); navigate(-1); return; }
      if (event.key === 'ArrowRight') { event.preventDefault(); navigate(1); return; }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])',
      )).filter(el => el.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousAriaHidden === null) appRoot?.removeAttribute('aria-hidden');
      else appRoot?.setAttribute('aria-hidden', previousAriaHidden);
      if (appRoot) appRoot.inert = previousInert;
      // Kembalikan fokus ke thumbnail asal supaya urutan tab tidak lompat.
      window.requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus(); });
    };
  }, [navigate, onClose]);

  if (typeof document === 'undefined' || media.length === 0) return null;
  const active = media[index];

  return createPortal(
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      className="fixed inset-0 z-[90] flex h-[100dvh] w-screen flex-col overflow-hidden bg-black/95 text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.22 }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
        <span aria-live="polite" className="rounded-full bg-black/45 px-3 py-1.5 text-xs font-bold tabular-nums backdrop-blur-sm">
          {index + 1}/{media.length}
        </span>
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={busy !== null}
            aria-label="Download media"
            title="Download"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-black/60 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60"
          >
            {busy === 'download' ? <Loader2 size={19} className="animate-spin" /> : <Download size={19} />}
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={busy !== null}
            aria-label="Bagikan media"
            title="Bagikan"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-black/60 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60"
          >
            {busy === 'share' ? <Loader2 size={19} className="animate-spin" /> : <Share2 size={19} />}
          </button>
          <button
            type="button"
            data-media-viewer-close
            onClick={onClose}
            aria-label="Tutup media"
            title="Tutup"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-black/60 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X size={21} />
          </button>
        </div>
      </div>

      {actionError && (
        <p
          role="status"
          className="pointer-events-none absolute inset-x-4 top-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] z-30 mx-auto max-w-xs rounded-xl bg-red-500/90 px-3 py-2 text-center text-xs font-medium text-white shadow-lg"
        >
          {actionError}
        </p>
      )}

      <div
        className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-3 pt-16 ${thumbsVisible ? 'pb-32' : 'pb-16'}`}
        onClick={event => { if (event.target === event.currentTarget) onClose(); }}
      >
        <AnimatePresence mode="popLayout" custom={direction} initial={false}>
          <motion.div
            key={`${index}-${active?.url}`}
            className="flex h-full w-full items-center justify-center"
            onClick={event => {
              const target = event.target;
              if (target instanceof Element && target.closest('img, video, [data-media-content]')) return;
              onClose();
            }}
            custom={direction}
            variants={SLIDE_VARIANTS}
            initial={reduceMotion ? false : 'enter'}
            animate="center"
            exit="exit"
            transition={reduceMotion ? { duration: 0 } : {
              x: { type: 'spring', stiffness: 320, damping: 33 },
              opacity: { duration: 0.16 },
              scale: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
            }}
          >
            {active?.type === 'video' ? (
              <PlyrVideo
                src={active.url}
                ariaLabel={`Video ${index + 1} layar penuh — ${label}`}
                mode="viewer"
                className="overflow-hidden rounded-xl shadow-2xl"
                autoPlay={autoPlay}
                poster={active.poster}
                width={active.width}
                height={active.height}
              />
            ) : (
              // Geser dipindah dari <img> ke pembungkusnya supaya watermark
              // ikut bergerak bersama fotonya, bukan diam di tempat. Pembungkus
              // menyusut mengikuti foto (bukan viewport), jadi watermark
              // menempel di tepi bawah GAMBAR walau rasionya jangkung.
              <motion.div
                className="relative flex max-h-full max-w-full overflow-hidden rounded-xl shadow-2xl"
                drag={media.length > 1 ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.16}
                onDragEnd={(_event, info) => {
                  if (Math.abs(info.offset.x) < 60) return;
                  navigate(info.offset.x < 0 ? 1 : -1);
                }}
              >
                <img
                  src={active?.url}
                  alt={`Foto ${index + 1} layar penuh — ${label}`}
                  draggable={false}
                  className="block select-none object-contain [touch-action:pan-y_pinch-zoom]"
                  // Batas ukuran diambil dari VIEWPORT, bukan persen terhadap
                  // pembungkus. Pembungkus menyusut mengikuti foto (supaya
                  // watermark menempel di tepi gambar), jadi max-h/max-w persen
                  // akan melingkar ke dirinya sendiri: foto tampil sebesar
                  // ukuran aslinya dan terpotong. Angkanya = tinggi dialog
                  // (100dvh) dikurangi pt-16+pb-16, dan lebar dikurangi px-3.
                  style={{ maxHeight: 'calc(100dvh - 8rem)', maxWidth: 'calc(100vw - 1.5rem)' }}
                />
                {watermark && <PhotoWatermark text={watermark} />}
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {media.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => navigate(-1)}
            disabled={index === 0}
            aria-label="Media sebelumnya"
            className="absolute left-2 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-black/60 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:pointer-events-none disabled:opacity-25"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            type="button"
            onClick={() => navigate(1)}
            disabled={index === media.length - 1}
            aria-label="Media berikutnya"
            className="absolute right-2 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-black/60 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:pointer-events-none disabled:opacity-25"
          >
            <ChevronRight size={22} />
          </button>
        </>
      )}

      {thumbsVisible && (
        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 to-transparent pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-6">
          <div ref={thumbStripRef} className="no-scrollbar flex justify-start gap-2 overflow-x-auto px-4 sm:justify-center">
            {media.map((item, i) => (
              <button
                key={`${item.url}-${i}`}
                type="button"
                data-thumb-index={i}
                onClick={() => goTo(i)}
                aria-label={`Buka media ke-${i + 1}`}
                aria-current={i === index}
                className={`h-12 w-16 shrink-0 overflow-hidden rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                  i === index ? 'opacity-100 ring-2 ring-white' : 'opacity-50 hover:opacity-80'
                }`}
              >
                <img
                  src={item.poster || item.url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      <p
        className={`pointer-events-none absolute inset-x-16 z-20 truncate text-center text-xs font-medium text-white/75 ${
          thumbsVisible ? 'bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+5rem))]' : 'bottom-[max(1rem,env(safe-area-inset-bottom))]'
        }`}
      >
        {label}
      </p>
    </motion.div>,
    document.body,
  );
}

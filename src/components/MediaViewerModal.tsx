import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import PlyrVideo from './PlyrVideo';

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

export default function MediaViewerModal({ media, initialIndex = 0, label, onClose }: MediaViewerModalProps) {
  const reduceMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(() => Math.max(0, Math.min(media.length - 1, initialIndex)));
  const [direction, setDirection] = useState(0);
  // Video hanya diputar otomatis kalau memang item itu yang dibuka: kliknya
  // sendiri sudah gestur "mau nonton". Slide ke item lain mulai dari diam.
  const [autoPlay, setAutoPlay] = useState(() => media[initialIndex]?.type === 'video');

  const navigate = useCallback((delta: number) => {
    setIndex(current => {
      const next = Math.max(0, Math.min(media.length - 1, current + delta));
      if (next === current) return current;
      setDirection(delta);
      setAutoPlay(false);
      return next;
    });
  }, [media.length]);

  // Daftar media bisa menyusut saat modal terbuka (mis. data disegarkan).
  useEffect(() => {
    setIndex(current => Math.max(0, Math.min(media.length - 1, current)));
  }, [media.length]);

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
        <button
          type="button"
          data-media-viewer-close
          onClick={onClose}
          aria-label="Tutup media"
          title="Tutup"
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-black/60 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <X size={21} />
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-3 pb-16 pt-16"
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
              <motion.img
                src={active?.url}
                alt={`Foto ${index + 1} layar penuh — ${label}`}
                draggable={false}
                drag={media.length > 1 ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.16}
                onDragEnd={(_event, info) => {
                  if (Math.abs(info.offset.x) < 60) return;
                  navigate(info.offset.x < 0 ? 1 : -1);
                }}
                className="max-h-full max-w-full select-none rounded-xl object-contain shadow-2xl [touch-action:pan-y_pinch-zoom]"
              />
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
            className="absolute left-2 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-black/60 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:pointer-events-none disabled:opacity-0"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            type="button"
            onClick={() => navigate(1)}
            disabled={index === media.length - 1}
            aria-label="Media berikutnya"
            className="absolute right-2 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-black/60 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:pointer-events-none disabled:opacity-0"
          >
            <ChevronRight size={22} />
          </button>
        </>
      )}

      <p className="pointer-events-none absolute inset-x-16 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 truncate text-center text-xs font-medium text-white/75">
        {label}
      </p>
    </motion.div>,
    document.body,
  );
}

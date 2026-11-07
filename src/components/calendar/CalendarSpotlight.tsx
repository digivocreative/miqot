import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Clock, IdCard, PlaneLanding, PlaneTakeoff, User, X } from 'lucide-react';
import KaabaIcon from '../bio/KaabaIcon';
import { computeBubblePosition, type SpotlightContent, type SpotlightIcon } from '../../lib/calendarSpotlight';
import type { CalendarEventType } from '../../lib/calendarEvents';

// Gelembung sorotan di kartu kalender: satu tanggal (hari ini, atau agenda
// terdekat berikutnya). Keputusan isi & posisi ada di
// src/lib/calendarSpotlight.ts; komponen ini merender dan menutup diri saat
// agent ke tempat lain.
//
// Kulitnya mengikuti tooltip yang sudah ada di aplikasi (AvailabilityCoachMark):
// warna DIBALIK terhadap kartu — kartu terang → gelembung slate-900, kartu
// gelap → gelembung slate-50 — supaya tidak menyatu dengan latar kalender.
// Ekor & badan polos; bayangannya drop-shadow di pembungkus.
//
// Posisi & lebar ditulis inline, dan warna yang menentukan keterbacaan hanya
// memakai kelas yang sudah ada di build lama (service worker bisa masih
// memegang CSS lama): teks utama mewarisi text-white/dark:text-slate-900, baris
// jamaah Anda berupa pil solid ber-teks putih.

const DOT: Record<CalendarEventType, string> = {
  keberangkatan: 'bg-emerald-500',
  kepulangan: 'bg-blue-500',
  manasik: 'bg-violet-500',
};

const ICON_TONE: Record<CalendarEventType, string> = {
  keberangkatan: 'text-emerald-400 dark:text-emerald-600',
  kepulangan: 'text-blue-400 dark:text-blue-600',
  manasik: 'text-violet-400 dark:text-violet-600',
};

const BADGE_TONE: Record<'today' | CalendarEventType, string> = {
  today: 'bg-emerald-500',
  keberangkatan: 'bg-emerald-500',
  kepulangan: 'bg-blue-500',
  manasik: 'bg-violet-500',
};

const MINE_TONE = {
  keberangkatan: 'bg-emerald-500',
  manasik: 'bg-violet-500',
} as const;

function LineIcon({ icon, type }: { icon: SpotlightIcon; type: CalendarEventType }) {
  const className = `shrink-0 ${ICON_TONE[type]}`;
  switch (icon) {
    case 'takeoff': return <PlaneTakeoff size={12} className={className} />;
    case 'landing': return <PlaneLanding size={12} className={className} />;
    case 'clock': return <Clock size={12} className={className} />;
    case 'tl': return <User size={12} className={className} />;
    case 'staff': return <IdCard size={12} className={className} />;
    case 'manasik': return <KaabaIcon size={12} className={className} />;
  }
}

interface Position {
  left: number;
  top: number;
  width: number;
  arrowLeft: number;
  placement: 'below' | 'above';
}

interface CalendarSpotlightProps {
  wrapperRef: RefObject<HTMLDivElement | null>;
  content: SpotlightContent;
  reducedMotion: boolean;
  onOpenDetail(): void;
  onDismiss(): void;
}

export default function CalendarSpotlight({ wrapperRef, content, reducedMotion, onOpenDetail, onDismiss }: CalendarSpotlightProps) {
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<Position | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  // ── Posisi ──
  // Diukur sebelum dicat, lalu diulang saat kartu berubah ukuran atau jendela
  // digulir (ruang terlihat menentukan gelembung di bawah atau di atas tanggal).
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const bubble = bubbleRef.current;
    if (!wrapper || !bubble) return;

    let frame = 0;
    const place = () => {
      const cell = wrapper.querySelector<HTMLElement>(`[data-cal-day="${content.day}"]`);
      if (!cell) return;
      const w = wrapper.getBoundingClientRect();
      const c = cell.getBoundingClientRect();
      // Ruang atas yang terlihat dimulai di bawah header sticky dashboard.
      const headerBottom = document.querySelector('header.sticky')?.getBoundingClientRect().bottom ?? 0;
      const next = computeBubblePosition({
        cell: { top: c.top - w.top, bottom: c.bottom - w.top, left: c.left - w.left, right: c.right - w.left },
        wrapperWidth: w.width,
        wrapperHeight: w.height,
        viewportTop: Math.max(0, headerBottom) - w.top,
        viewportBottom: window.innerHeight - w.top,
        bubbleHeight: bubble.offsetHeight,
      });
      setPos(prev => (prev && prev.left === next.left && prev.top === next.top && prev.width === next.width
        && prev.arrowLeft === next.arrowLeft && prev.placement === next.placement ? prev : next));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };

    place();
    const ro = new ResizeObserver(schedule);
    ro.observe(wrapper);
    ro.observe(bubble);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [content.day, wrapperRef]);

  // ── Tutup saat agent ke tempat lain ──
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (bubbleRef.current?.contains(event.target as Node)) return;
      onDismissRef.current();
    };
    // Listener document + preventDefault: pintasan Escape App (listener
    // window) melewati event yang sudah defaultPrevented, jadi satu Escape
    // hanya menutup gelembung ini.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      onDismissRef.current();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const single = content.sections.length === 1;
  const below = (pos?.placement ?? 'below') === 'below';
  const arrowLeft = pos?.arrowLeft ?? 24;

  return (
    <motion.div
      ref={bubbleRef}
      role="group"
      aria-label={`Agenda ${content.dayLabel}`}
      className="absolute drop-shadow-[0_6px_12px_rgba(15,23,42,0.22)] dark:drop-shadow-[0_6px_14px_rgba(0,0,0,0.55)]"
      style={{
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        width: pos?.width ?? 244,
        // Di bawah header sticky dashboard (z-30), di atas kartu lain; sheet z-50.
        zIndex: 20,
        visibility: pos ? 'visible' : 'hidden',
        transformOrigin: `${arrowLeft}px ${below ? '0%' : '100%'}`,
      }}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.96 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      {/* Ekor di belakang badan, polos tanpa garis tepi: menyatu dengan badan. */}
      <span
        aria-hidden="true"
        className="absolute rounded-[2px] bg-slate-900 dark:bg-slate-50"
        style={{
          left: arrowLeft,
          marginLeft: -6,
          width: 12,
          height: 12,
          transform: 'rotate(45deg)',
          ...(below ? { top: -5 } : { bottom: -5 }),
        }}
      />
      <div className="relative overflow-hidden rounded-xl bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900">
        <div className="space-y-2 px-3 pb-2 pt-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-300 dark:text-slate-600">{content.dayLabel}</span>
            {content.badge && (
              <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white ${BADGE_TONE[content.badge.tone]}`}>
                {content.badge.text}
              </span>
            )}
            <button
              type="button"
              aria-label="Tutup"
              onClick={onDismiss}
              className="relative touch-hit ml-auto -mr-1 flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/10 hover:text-white dark:text-slate-500 dark:hover:bg-black/10 dark:hover:text-slate-900"
            >
              <X size={14} />
            </button>
          </div>

          {single ? (
            <div className="space-y-1">
              <p className="text-sm font-bold leading-snug">{content.sections[0].title}</p>
              {content.sections[0].lines.map(line => (
                <div key={line.text} className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                  {line.icon && <LineIcon icon={line.icon} type={content.sections[0].type} />}
                  <span className="truncate">{line.text}</span>
                </div>
              ))}
            </div>
          ) : (
            content.sections.map(section => (
              <div key={section.type} className="flex gap-2">
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${DOT[section.type]}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold leading-snug">{section.title}</p>
                  {section.lines.map(line => (
                    <p key={line.text} className="mt-0.5 truncate text-[10px] font-medium text-slate-400 dark:text-slate-500">{line.text}</p>
                  ))}
                </div>
              </div>
            ))
          )}

          {content.mine.length > 0 && (
            <div className="space-y-1">
              {content.mine.map(line => (
                <p key={line.type} className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold leading-snug text-white ${MINE_TONE[line.type]}`}>{line.text}</p>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onOpenDetail}
          className="flex w-full items-center justify-center gap-1 border-t border-white/10 py-2 text-[11px] font-semibold transition-colors hover:bg-white/10 dark:border-slate-200 dark:hover:bg-black/10"
        >
          Lihat detail <ChevronRight size={12} />
        </button>
      </div>
    </motion.div>
  );
}

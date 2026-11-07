import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { animate, motion, useMotionValue, type AnimationPlaybackControls } from 'framer-motion';
import { ChevronLeft, ChevronRight, Clock, IdCard, PlaneLanding, PlaneTakeoff, User } from 'lucide-react';
import KaabaIcon from '../bio/KaabaIcon';
import {
  computeBubblePosition,
  SPOTLIGHT_DWELL_MS,
  type SpotlightContent,
  type SpotlightIcon,
  type SpotlightState,
} from '../../lib/calendarSpotlight';
import type { CalendarEventType } from '../../lib/calendarEvents';

// Gelembung sorotan bergilir di kartu kalender. Keputusannya (urutan, isi,
// posisi) sudah dihitung di src/lib/calendarSpotlight.ts; komponen ini hanya
// merender, menjalankan garis waktu, dan menutup diri saat agent ke tempat lain.
//
// Posisi, lebar, dan warna tint ditulis inline: service worker bisa masih
// memegang CSS build lama yang belum kenal kelas Tailwind baru (lihat
// spec §7), dan properti inilah yang menentukan gelembung terlihat atau tidak.

const DOT: Record<CalendarEventType, string> = {
  keberangkatan: 'bg-emerald-500',
  kepulangan: 'bg-blue-500',
  manasik: 'bg-violet-500',
};

const ICON_TONE: Record<CalendarEventType, string> = {
  keberangkatan: 'text-emerald-400',
  kepulangan: 'text-blue-400',
  manasik: 'text-violet-400',
};

const BADGE_TONE: Record<'today' | CalendarEventType, string> = {
  today: 'bg-emerald-500',
  keberangkatan: 'bg-emerald-500',
  kepulangan: 'bg-blue-500',
  manasik: 'bg-violet-500',
};

const MINE_TONE = {
  keberangkatan: { tint: 'rgba(16, 185, 129, 0.15)', text: 'text-emerald-300' },
  manasik: { tint: 'rgba(139, 92, 246, 0.2)', text: 'text-violet-300' },
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
  state: SpotlightState;
  content: SpotlightContent;
  reducedMotion: boolean;
  onAdvance(): void;
  onGo(delta: -1 | 1): void;
  onOpenDetail(): void;
  onDismiss(): void;
  onPointerEnter?(): void;
  onPointerLeave?(): void;
}

export default function CalendarSpotlight({
  wrapperRef,
  state,
  content,
  reducedMotion,
  onAdvance,
  onGo,
  onOpenDetail,
  onDismiss,
  onPointerEnter,
  onPointerLeave,
}: CalendarSpotlightProps) {
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<Position | null>(null);
  const left = useMotionValue(0);
  const top = useMotionValue(0);
  const placedRef = useRef(false);
  const progress = useMotionValue(0);
  const [held, setHeld] = useState(false);
  const timerRef = useRef<AnimationPlaybackControls | null>(null);

  const callbacks = useRef({ onAdvance, onDismiss });
  callbacks.current = { onAdvance, onDismiss };

  const running = state.mode === 'auto' && !reducedMotion;
  const total = state.dates.length;

  // ── Posisi ──
  // Diukur sebelum dicat (useLayoutEffect), lalu diulang saat tanggal
  // berganti, kartu berubah ukuran, atau jendela digulir/diubah ukurannya.
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const bubble = bubbleRef.current;
    if (!wrapper || !bubble) return;

    let frame = 0;
    const place = (glide: boolean) => {
      const cell = wrapper.querySelector<HTMLElement>(`[data-cal-day="${content.day}"]`);
      if (!cell) return;
      const w = wrapper.getBoundingClientRect();
      const c = cell.getBoundingClientRect();
      const next = computeBubblePosition({
        cell: { top: c.top - w.top, bottom: c.bottom - w.top, left: c.left - w.left, right: c.right - w.left },
        wrapperWidth: w.width,
        wrapperHeight: w.height,
        viewportTop: -w.top,
        viewportBottom: window.innerHeight - w.top,
        bubbleHeight: bubble.offsetHeight,
      });
      setPos(prev => (prev && prev.left === next.left && prev.top === next.top && prev.width === next.width
        && prev.arrowLeft === next.arrowLeft && prev.placement === next.placement ? prev : next));
      if (!placedRef.current || !glide || reducedMotion) {
        left.set(next.left);
        top.set(next.top);
        placedRef.current = true;
      } else {
        animate(left, next.left, { type: 'spring', stiffness: 420, damping: 40 });
        animate(top, next.top, { type: 'spring', stiffness: 420, damping: 40 });
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => place(false));
    };

    place(true);
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
  }, [content.date, content.day, wrapperRef, reducedMotion, left, top]);

  // ── Garis waktu ──
  useEffect(() => {
    if (!running) return;
    progress.set(0);
    const controls = animate(progress, 1, {
      duration: SPOTLIGHT_DWELL_MS / 1000,
      ease: 'linear',
      onComplete: () => callbacks.current.onAdvance(),
    });
    timerRef.current = controls;
    return () => {
      controls.stop();
      timerRef.current = null;
    };
  }, [running, content.date, progress]);

  useEffect(() => {
    const controls = timerRef.current;
    if (!controls) return;
    if (held) controls.pause();
    else controls.play();
  }, [held, content.date, running]);

  // ── Tutup saat agent ke tempat lain ──
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (bubbleRef.current?.contains(event.target as Node)) return;
      callbacks.current.onDismiss();
    };
    // Listener document + preventDefault: pintasan Escape App (listener
    // window) melewati event yang sudah defaultPrevented, jadi satu Escape
    // hanya menutup gelembung ini.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      callbacks.current.onDismiss();
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
      aria-label={`Sorotan ${content.dayLabel}`}
      className="absolute cursor-pointer"
      style={{
        left,
        top,
        width: pos?.width ?? 244,
        zIndex: 30,
        visibility: pos ? 'visible' : 'hidden',
        transformOrigin: `${arrowLeft}px ${below ? '0%' : '100%'}`,
      }}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: reducedMotion ? 0 : 4, transition: { duration: 0.18 } }}
      transition={{ duration: reducedMotion ? 0.12 : 0.22, ease: 'easeOut' }}
      onClick={onOpenDetail}
      onPointerEnter={() => { setHeld(true); onPointerEnter?.(); }}
      onPointerLeave={() => { setHeld(false); onPointerLeave?.(); }}
      onFocus={() => setHeld(true)}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHeld(false);
      }}
    >
      <div
        className="overflow-hidden border border-slate-900 bg-slate-900 text-white dark:border-slate-700 dark:bg-slate-950"
        style={{ borderRadius: 14, boxShadow: '0 10px 28px rgba(15, 23, 42, 0.32)' }}
      >
        {running && (
          <div className="bg-slate-800" style={{ height: 2 }}>
            <motion.div className="h-full bg-emerald-400" style={{ scaleX: progress, transformOrigin: '0% 50%' }} />
          </div>
        )}
        <motion.div
          key={content.date}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.12 }}
          className="space-y-2 px-3 pb-3 pt-2.5"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold tracking-wide text-slate-200">{content.dayLabel}</span>
            {content.badge && (
              <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-extrabold text-white ${BADGE_TONE[content.badge.tone]}`}>
                {content.badge.text}
              </span>
            )}
          </div>

          {single ? (
            <div className="space-y-1.5">
              <p className="text-base font-bold leading-tight text-white">{content.sections[0].title}</p>
              {content.sections[0].lines.map(line => (
                <div key={line.text} className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-400">
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
                  <p className="text-[13px] font-bold leading-tight text-white">{section.title}</p>
                  {section.lines.map(line => (
                    <p key={line.text} className="mt-0.5 truncate text-[10px] text-slate-400">{line.text}</p>
                  ))}
                </div>
              </div>
            ))
          )}

          {content.mine.length > 0 && (
            <div className="space-y-0.5 rounded-xl px-2.5 py-1.5" style={{ backgroundColor: MINE_TONE[content.mine[0].type].tint }}>
              {content.mine.map(line => (
                <p key={line.type} className={`text-[11px] font-semibold leading-snug ${MINE_TONE[line.type].text}`}>{line.text}</p>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-0.5">
            {state.mode !== 'hover' ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Tanggal sebelumnya"
                  disabled={state.index === 0}
                  onClick={event => { event.stopPropagation(); onGo(-1); }}
                  className="touch-hit relative flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-slate-300 transition-colors hover:bg-slate-700 disabled:opacity-30"
                >
                  <ChevronLeft size={12} />
                </button>
                <span className="text-[10px] font-bold tabular-nums text-slate-200">{state.index + 1}/{total}</span>
                <button
                  type="button"
                  aria-label="Tanggal berikutnya"
                  disabled={state.index >= total - 1}
                  onClick={event => { event.stopPropagation(); onGo(1); }}
                  className="touch-hit relative flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-slate-300 transition-colors hover:bg-slate-700 disabled:opacity-30"
                >
                  <ChevronRight size={12} />
                </button>
              </div>
            ) : <span />}
            <button
              type="button"
              onClick={event => { event.stopPropagation(); onOpenDetail(); }}
              className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-300"
            >
              Detail <ChevronRight size={12} />
            </button>
          </div>
        </motion.div>
      </div>

      {/* Ekor di atas kotak supaya menutup garis tepinya di pangkal ekor. */}
      <span
        aria-hidden="true"
        className="absolute border-slate-900 bg-slate-900 dark:border-slate-700 dark:bg-slate-950"
        style={{
          left: arrowLeft - 6,
          width: 12,
          height: 12,
          transform: 'rotate(45deg)',
          borderStyle: 'solid',
          ...(below
            ? { top: -6, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 0, borderBottomWidth: 0 }
            : { bottom: -6, borderBottomWidth: 1, borderRightWidth: 1, borderTopWidth: 0, borderLeftWidth: 0 }),
        }}
      />
    </motion.div>
  );
}

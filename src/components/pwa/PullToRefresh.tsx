import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, Loader2 } from 'lucide-react';
import { isStandaloneDisplay } from '../../lib/pwa/launch';
import {
  PULL_PARK,
  PULL_TRIGGER,
  classifyGesture,
  dampPull,
  isPullEligibleStart,
  isTypingTarget,
  type GestureVerdict,
} from '../../lib/pwa/pull-to-refresh';

/**
 * Tarik-untuk-segarkan untuk app terpasang.
 *
 * Hanya hidup di mode standalone bersentuhan: di tab browser, Chrome/Safari sudah
 * punya gestur sendiri — dua PTR di satu layar justru membingungkan. Di iOS
 * standalone tidak ada gestur refresh SAMA SEKALI, dan itulah lubang yang ditambal
 * komponen ini.
 *
 * Jarak tarikan digambar lewat `style` elemen secara imperatif, BUKAN state React:
 * halaman jadwal merender ratusan kartu, dan setState tiap touchmove akan merender
 * ulang seluruh daftar 60x per detik. Yang masuk state hanya `phase` — berubah
 * paling banyak beberapa kali per gestur.
 */

type Phase = 'idle' | 'pulling' | 'armed' | 'refreshing';

/** Putaran minimal supaya refresh yang selesai dalam 80ms tidak terbaca seperti kedipan. */
const MIN_SPIN_MS = 450;

const EASE_OUT = 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1), opacity 200ms linear';

interface Props {
  /**
   * Matikan saat halaman belum punya isi (spinner muat pertama). Overlay & scroller
   * bersarang TIDAK perlu diurus di sini — isPullEligibleStart yang menyaringnya.
   */
  enabled: boolean;
  onRefresh: () => Promise<unknown>;
}

interface GestureState {
  tracking: boolean;
  verdict: GestureVerdict;
  startX: number;
  startY: number;
  identifier: number | null;
  distance: number;
}

const IDLE_GESTURE: GestureState = {
  tracking: false,
  verdict: 'pending',
  startX: 0,
  startY: 0,
  identifier: null,
  distance: 0,
};

export default function PullToRefresh({ enabled, onRefresh }: Props) {
  // Aplikasi terpasang tidak pernah berpindah ke/dari standalone tanpa dimuat ulang,
  // jadi cukup dinilai sekali saat mount.
  //
  // `pointer: coarse` — BUKAN maxTouchPoints: laptop layar sentuh melaporkan
  // maxTouchPoints > 0 padahal gesturnya pakai trackpad, dan di sana PTR cuma jadi
  // indikator yang muncul entah kenapa. Ambang yang sama sudah dipakai aturan zoom
  // input di src/index.css.
  const [active] = useState(
    () =>
      typeof window !== 'undefined' &&
      isStandaloneDisplay() &&
      window.matchMedia?.('(pointer: coarse)').matches === true,
  );
  const [phase, setPhase] = useState<Phase>('idle');

  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<GestureState>({ ...IDLE_GESTURE });
  const phaseRef = useRef<Phase>('idle');
  const mountedRef = useRef(true);

  // onRefresh datang sebagai closure baru tiap render App; menyimpannya di ref
  // membuat listener terpasang SEKALI, bukan dicopot-pasang tiap render.
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const setPhaseBoth = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const paint = useCallback((distance: number, animate: boolean) => {
    const el = indicatorRef.current;
    if (!el) return;
    el.style.transition = animate ? EASE_OUT : 'none';
    el.style.transform = `translate3d(-50%, ${Math.round(distance)}px, 0)`;
    el.style.opacity = String(Math.min(1, distance / 36));
  }, []);

  /**
   * `overscroll-behavior-y: contain` di <html> menyelesaikan dua hal sekaligus:
   * memadamkan PTR bawaan Chrome Android (supaya tidak dobel dengan yang ini) dan
   * menghentikan pantulan rubber-band iOS yang akan berkelahi dengan indikator.
   *
   * Mengikuti `enabled`, bukan sekadar `active`: di dashboard ada halaman yang
   * belum punya penyegar sendiri (lihat PullToRefreshHost). Kalau kelas ini tetap
   * terpasang di sana, PTR bawaan Android ikut padam dan halaman itu kehilangan
   * SEMUA cara menyegarkan — gestur kita mati, gestur browser juga mati.
   */
  useEffect(() => {
    if (!active || !enabled) return;
    const root = document.documentElement;
    root.classList.add('pull-refresh-host');
    return () => root.classList.remove('pull-refresh-host');
  }, [active, enabled]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!active) return;

    const reset = (animate: boolean) => {
      gestureRef.current = { ...IDLE_GESTURE };
      if (phaseRef.current === 'refreshing') return;
      setPhaseBoth('idle');
      paint(0, animate);
    };

    const runRefresh = async () => {
      setPhaseBoth('refreshing');
      paint(PULL_PARK, true);
      const startedAt = Date.now();
      try {
        await onRefreshRef.current();
      } catch {
        // Kegagalan refresh sudah punya suaranya sendiri di halaman (pita data
        // tersimpan). Indikator cuma perlu menutup diri dengan rapi.
      }
      const rest = MIN_SPIN_MS - (Date.now() - startedAt);
      if (rest > 0) await new Promise(resolve => window.setTimeout(resolve, rest));
      if (!mountedRef.current) return;
      setPhaseBoth('idle');
      paint(0, true);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (!enabledRef.current || phaseRef.current === 'refreshing') return;
      if (event.touches.length !== 1) {
        gestureRef.current = { ...IDLE_GESTURE };
        return;
      }
      if (window.scrollY > 1) return;
      if (isTypingTarget(document.activeElement)) return;
      if (!isPullEligibleStart(event.target)) return;

      const touch = event.touches[0];
      gestureRef.current = {
        tracking: true,
        verdict: 'pending',
        startX: touch.clientX,
        startY: touch.clientY,
        identifier: touch.identifier,
        distance: 0,
      };
    };

    const handleTouchMove = (event: TouchEvent) => {
      const gesture = gestureRef.current;
      if (!gesture.tracking) return;
      if (!enabledRef.current || event.touches.length !== 1) {
        reset(true);
        return;
      }

      const touch = event.touches[0];
      if (touch.identifier !== gesture.identifier) {
        reset(true);
        return;
      }

      const dx = touch.clientX - gesture.startX;
      const dy = touch.clientY - gesture.startY;

      if (gesture.verdict === 'pending') {
        const verdict = classifyGesture(dx, dy);
        if (verdict === 'pending') return;
        if (verdict === 'abandon') {
          gesture.tracking = false;
          return;
        }
        // Halaman masih di puncak saat jari turun: sisa gestur ini milik kita.
        if (window.scrollY > 1) {
          gesture.tracking = false;
          return;
        }
        gesture.verdict = 'pull';
        setPhaseBoth('pulling');
      }

      const distance = dampPull(dy);
      gesture.distance = distance;
      paint(distance, false);

      const armed = distance >= PULL_TRIGGER;
      if (armed !== (phaseRef.current === 'armed')) setPhaseBoth(armed ? 'armed' : 'pulling');

      // Menahan gulir native sepanjang tarikan. Sesudah iOS mulai menggulir,
      // preventDefault tidak lagi didengar — itu sebabnya gestur hanya boleh
      // dimulai saat halaman benar-benar di puncak dan jari bergerak TURUN.
      if (event.cancelable) event.preventDefault();
    };

    const handleTouchEnd = () => {
      const gesture = gestureRef.current;
      if (!gesture.tracking || gesture.verdict !== 'pull') {
        reset(true);
        return;
      }
      const armed = gesture.distance >= PULL_TRIGGER;
      gestureRef.current = { ...IDLE_GESTURE };
      if (armed) void runRefresh();
      else reset(true);
    };

    const handleTouchCancel = () => reset(true);

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    // Non-passive WAJIB: handler touchmove yang dipasang React di root bersifat
    // passive, dan preventDefault di sana diabaikan diam-diam.
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [active, paint, setPhaseBoth]);

  if (!active) return null;

  const spinning = phase === 'refreshing';

  return (
    <div
      ref={indicatorRef}
      data-pull-refresh
      data-phase={phase}
      aria-hidden={phase === 'idle'}
      className="pointer-events-none fixed left-1/2 z-[55] opacity-0"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) - 38px)', transform: 'translate3d(-50%, 0, 0)' }}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-emerald-600 shadow-lg ring-1 ring-black/5 dark:bg-slate-800 dark:text-emerald-400 dark:ring-white/10">
        {spinning ? (
          <Loader2 size={17} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
        ) : (
          <ArrowDown
            size={17}
            aria-hidden="true"
            className={`transition-transform duration-200 motion-reduce:transition-none ${phase === 'armed' ? 'rotate-180' : ''}`}
          />
        )}
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {spinning ? 'Menyegarkan data' : phase === 'armed' ? 'Lepas untuk menyegarkan' : ''}
      </span>
    </div>
  );
}

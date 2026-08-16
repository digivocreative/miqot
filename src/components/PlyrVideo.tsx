import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Plyr from 'plyr';
import 'plyr/dist/plyr.css';
import { videoPreviewSrc, videoPreviewFallbackSrc } from '../lib/videoPoster';

interface PlyrVideoProps {
  src: string;
  ariaLabel: string;
  /**
   * fit    — natural ratio, capped height (single media in feed/composer)
   * strip  — fixed-height horizontal strip item, natural width
   * fill   — fill the parent box (pair grid)
   * viewer — fullscreen media viewer, capped to viewport
   */
  mode: 'fit' | 'strip' | 'fill' | 'viewer';
  minWidth?: string;
  className?: string;
  /** Seek here once the video is ready (resume from feed → viewer). */
  startTime?: number;
  /** Start playing once ready — only valid off a user gesture. */
  autoPlay?: boolean;
  /** Preserve the source player's mute state on resume. */
  startMuted?: boolean;
  /** Poster JPEG hasil frame-grab composer — thumbnail tanpa decode video. */
  poster?: string;
  /** Dimensi asli video: aspect-ratio benar SEBELUM metadata/poster termuat. */
  width?: number;
  height?: number;
}

// Narrow players (portrait video) can't fit the full control set — the
// progress bar collapses and the play button overflows the left edge.
// Feed/preview modes omit Plyr's fullscreen control — the overlay button that
// opens the internal media viewer already covers it (one entry point only).
const CONTROLS_BY_MODE: Record<PlyrVideoProps['mode'], string[]> = {
  fit: ['play-large', 'play', 'progress', 'current-time', 'mute'],
  strip: ['play-large', 'play', 'progress'],
  fill: ['play-large', 'play', 'progress'],
  viewer: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen'],
};

export default function PlyrVideo({ src, ariaLabel, mode, minWidth, className, startTime, autoPlay, startMuted, poster, width, height }: PlyrVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Read at mount only — a fresh viewer instance carries the resume position.
  const startTimeRef = useRef(startTime);
  const autoPlayRef = useRef(autoPlay);
  const startMutedRef = useRef(startMuted);
  // Sekali fragment poster ditolak browser, pakai URL polos seterusnya untuk
  // src ini — preview kembali hitam, tapi videonya tetap bisa diputar.
  const [posterFragmentFailed, setPosterFragmentFailed] = useState(false);
  useEffect(() => { setPosterFragmentFailed(false); }, [src]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    const player = new Plyr(element, {
      controls: CONTROLS_BY_MODE[mode],
      fullscreen: { iosNative: true },
    });

    const resumeTime = startTimeRef.current;
    const shouldAutoPlay = autoPlayRef.current;
    const wantMuted = !!startMutedRef.current;
    if ((resumeTime && Number.isFinite(resumeTime)) || shouldAutoPlay) {
      const resume = () => {
        if (resumeTime && Number.isFinite(resumeTime)) {
          try { element.currentTime = resumeTime; } catch { /* seek not ready — ignore */ }
        }
        if (!shouldAutoPlay) return;
        // Try to keep the source player's audio state. If the browser blocks
        // unmuted autoplay (the click gesture doesn't survive the async mount),
        // fall back to muted playback — always permitted — then restore sound.
        element.muted = wantMuted;
        const played = element.play();
        if (played && typeof played.catch === 'function') {
          played.catch(() => {
            element.muted = true;
            const retried = element.play();
            if (retried && typeof retried.then === 'function') {
              retried.then(() => { element.muted = wantMuted; }).catch(() => { /* still blocked */ });
            }
          });
        }
      };
      if (element.readyState >= 1) resume();
      else element.addEventListener('loadedmetadata', resume, { once: true });
    }

    return () => player.destroy();
  }, [mode]);

  return (
    <div
      // Penanda "ini area media, bukan latar" — Plyr menumpuk poster & kontrol
      // di atas <video>, jadi klik di area video sering tidak mengenai elemen
      // <video> itu sendiri. Media viewer memakai atribut ini untuk memutuskan
      // klik mana yang menutup popup.
      data-media-content="video"
      className={`teras-plyr teras-plyr-${mode}${className ? ` ${className}` : ''}`}
      style={minWidth ? ({ '--teras-plyr-minw': minWidth } as CSSProperties) : undefined}
    >
      <video
        ref={videoRef}
        // Dengan poster sungguhan, trik fragment `#t=` tidak dibutuhkan (dan
        // hanya menambah range-request); fragment tinggal jalur mundur untuk
        // media lama yang belum punya poster.
        src={poster || posterFragmentFailed ? src : videoPreviewSrc(src)}
        poster={poster}
        playsInline
        preload="metadata"
        controls
        aria-label={ariaLabel}
        style={width && height ? { aspectRatio: `${width} / ${height}` } : undefined}
        onError={() => {
          if (!poster && !posterFragmentFailed && videoPreviewFallbackSrc(src)) setPosterFragmentFailed(true);
        }}
      />
    </div>
  );
}

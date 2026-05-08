// src/components/BrochureSchedulePage.tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Download, Share2, Loader2 } from 'lucide-react';
import {
  BrochureScheduleTemplate,
  BROCHURE_W,
  BROCHURE_H,
  BROCHURE_FONT_WEIGHTS,
  type BrochureMonth,
  type BrochureAgent,
} from './BrochureScheduleTemplate';
import { getAuthHeaders } from './LoginPage';
import { canShareFiles, downloadBlob, isTouchPrimary } from '../utils/share';

const EXPORT_TYPE = 'png';
const EXPORT_MIME = 'image/png';
const EXPORT_EXT = 'png';
const EXPORT_SCALE = 1;
const PACKAGES_PER_IMAGE = 10;

interface ExportedImage {
  blob: Blob;
  ext: string;
  mime: string;
}

interface BrochureSchedulePageProps {
  agent: BrochureAgent;
}

interface ApiResponse {
  months: BrochureMonth[];
  agent: BrochureAgent;
}

function mergeAgentProfile(base: BrochureAgent, incoming?: BrochureAgent | null): BrochureAgent {
  const merged = { ...base, ...(incoming || {}) };
  return {
    ...merged,
    slug: (incoming?.slug || base.slug || '').trim(),
  };
}

function BrochureSkeleton() {
  return (
    <div
      className="animate-pulse w-full"
      style={{
        maxWidth: 480,
        aspectRatio: `${BROCHURE_W} / ${BROCHURE_H}`,
        borderRadius: 16,
        overflow: 'hidden',
        background: 'linear-gradient(180deg, #ffffff 0%, #fff8ec 100%)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
      }}
    >
      <div className="flex items-center justify-between p-5">
        <div className="h-8 w-24 rounded bg-rose-100" />
        <div className="flex gap-2">
          <div className="w-10 h-10 rounded-full bg-amber-100" />
          <div className="w-10 h-10 rounded-full bg-rose-100" />
        </div>
      </div>
      <div className="px-6 mt-2 flex flex-col items-center gap-2">
        <div className="h-7 w-3/5 rounded bg-amber-100" />
        <div className="h-9 w-2/3 rounded bg-rose-100" />
      </div>
      <div className="mt-6 mx-5 rounded-2xl bg-white overflow-hidden border border-amber-100">
        <div className="h-7 bg-rose-900/80" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-9 border-t border-rose-100/70 px-3 flex items-center gap-3">
            <div className="h-3 w-4 rounded bg-rose-200" />
            <div className="h-3 flex-1 rounded bg-rose-100" />
            <div className="h-3 w-12 rounded bg-rose-200" />
          </div>
        ))}
      </div>
    </div>
  );
}

function splitMonthIntoImagePages(month: BrochureMonth): BrochureMonth[] {
  const pages: BrochureMonth[] = [];
  for (let start = 0; start < month.packages.length; start += PACKAGES_PER_IMAGE) {
    pages.push({
      ...month,
      key: `${month.key}-page-${pages.length + 1}`,
      packages: month.packages.slice(start, start + PACKAGES_PER_IMAGE),
      truncatedCount: 0,
    });
  }
  return pages.length ? pages : [{ ...month, truncatedCount: 0 }];
}

export default function BrochureSchedulePage({ agent: agentProp }: BrochureSchedulePageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [months, setMonths] = useState<BrochureMonth[]>([]);
  const [agent, setAgent] = useState<BrochureAgent>(agentProp);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const tabBarRef = useRef<HTMLDivElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const [previewScale, setPreviewScale] = useState(0);
  const exportPageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [busy, setBusy] = useState<null | { kind: 'share' | 'download'; pageIndex: number }>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compute preview scale once container is in DOM (after loading flips off).
  // useLayoutEffect runs synchronously before paint, so we never paint at the wrong scale.
  useLayoutEffect(() => {
    if (loading) return;
    function recompute() {
      const w = previewContainerRef.current?.clientWidth;
      if (w && w > 0) setPreviewScale(w / BROCHURE_W);
    }
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, [loading]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/ai-tools/brosur-jadwal-bulan', { headers: getAuthHeaders() });
        if (!res.ok) {
          let payload: any = null;
          try { payload = await res.json(); } catch { /* ignore non-JSON errors */ }
          if (res.status === 403) throw new Error(payload?.message || 'Anda tidak memiliki akses ke fitur ini.');
          if (res.status === 401) throw new Error('Sesi login berakhir. Silakan login ulang.');
          throw new Error(payload?.message || 'Gagal memuat jadwal, coba lagi.');
        }
        const json: ApiResponse = await res.json();
        if (!alive) return;
        setMonths(json.months || []);
        setAgent(mergeAgentProfile(agentProp, json.agent));
        if (json.months?.length) {
          setActiveKey(json.months[0].key);
        }
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || 'Gagal memuat brosur');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Scroll active tab into view on change
  useEffect(() => {
    if (!activeKey || !tabBarRef.current) return;
    const el = tabBarRef.current.querySelector(`[data-key="${activeKey}"]`) as HTMLElement | null;
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [activeKey]);

  const activeMonth = months.find(m => m.key === activeKey) || null;
  const activeImagePages = activeMonth ? splitMonthIntoImagePages(activeMonth) : [];
  const showShareButton = isTouchPrimary() && typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const filenameForMonth = (label: string, pageIndex = 1, pageCount = 1, ext = EXPORT_EXT) => {
    const base = `brosur-paket-umroh-${label.toLowerCase().replace(/\s+/g, '-')}`;
    return `${base}${pageCount > 1 ? `-gambar-${pageIndex}` : ''}.${ext}`;
  };

  function showToast(message: string) {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  }

  function waitForNextPaint(): Promise<void> {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
  }

  async function waitForFonts() {
    if (!document.fonts) return;
    try {
      // Probe at the actual sizes used in the brochure, not 16px. Some browsers cache
      // font metrics per size — probing at 16 doesn't guarantee 25/40/etc are decoded
      // by the time snapdom serializes the SVG.
      await Promise.all([
        ...BROCHURE_FONT_WEIGHTS.map(w => document.fonts.load(`${w} 32px "Inter"`).catch(() => null)),
        ...BROCHURE_FONT_WEIGHTS.map(w => document.fonts.load(`${w} 88px "Inter"`).catch(() => null)),
        document.fonts.load(`400 25px "Bebas Neue"`).catch(() => null),
        document.fonts.load(`400 42px "Bebas Neue"`).catch(() => null),
        document.fonts.load(`500 25px "Oswald"`).catch(() => null),
        document.fonts.load(`900 40px "Montserrat"`).catch(() => null),
        document.fonts.load(`800 20px "Montserrat"`).catch(() => null),
      ]);
      await document.fonts.ready;
      await waitForNextPaint();
      await waitForNextPaint();
    } catch {
      // Best effort: export should continue even if one font load probe fails.
    }
  }

  async function toExportedImage(result: any): Promise<ExportedImage | null> {
    try {
      const png = await result.toBlob({
        type: EXPORT_TYPE,
        backgroundColor: '#FFFFFF',
      });
      if (png instanceof Blob && png.size > 0) {
        return { blob: png, ext: EXPORT_EXT, mime: png.type || EXPORT_MIME };
      }
    } catch (err) {
      console.warn('[brosur] PNG export failed:', err);
    }
    return null;
  }

  async function captureBlob(pageIndex: number): Promise<ExportedImage | null> {
    const target = exportPageRefs.current[pageIndex];
    if (!target) return null;
    await waitForFonts();
    target.getBoundingClientRect();
    await waitForNextPaint();
    const { snapdom } = await import('@zumer/snapdom');

    // Always capture with embedFonts: true. The previous fallback to embedFonts: false
    // produced a "successful" PNG that was rendered with system-fallback fonts (because
    // an SVG <foreignObject> data URL doesn't share the page's font registry) — which is
    // exactly the bug we're trying to avoid. If the first attempt fails, re-warm fonts
    // and try the same config once more.
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await snapdom(target, {
          scale: EXPORT_SCALE,
          embedFonts: true,
          backgroundColor: '#FFFFFF',
        });
        const image = await toExportedImage(result);
        if (image) return image;
      } catch (err) {
        lastError = err;
        console.warn(`[brosur] capture attempt ${attempt + 1} failed:`, err);
      }
      if (attempt === 0) {
        await waitForFonts();
        await waitForNextPaint();
      }
    }

    if (lastError) throw lastError;
    return null;
  }

  async function handleDownload(pageIndex: number) {
    if (!activeMonth) return;
    setBusy({ kind: 'download', pageIndex });
    try {
      const image = await captureBlob(pageIndex);
      if (!image) throw new Error('capture-failed');
      downloadBlob(image.blob, filenameForMonth(activeMonth.label, pageIndex + 1, activeImagePages.length, image.ext));
    } catch (e) {
      console.error('[brosur] download failed:', e);
      showToast('Gagal generate brosur, coba lagi');
    } finally {
      setBusy(null);
    }
  }

  async function handleShare(pageIndex: number) {
    if (!activeMonth) return;
    setBusy({ kind: 'share', pageIndex });
    try {
      const image = await captureBlob(pageIndex);
      if (!image) throw new Error('capture-failed');
      const file = new File(
        [image.blob],
        filenameForMonth(activeMonth.label, pageIndex + 1, activeImagePages.length, image.ext),
        { type: image.mime }
      );
      if (canShareFiles([file])) {
        try {
          await navigator.share({
            files: [file],
            title: `Brosur Paket Umroh ${activeMonth.label}`,
            text: `Paket Umroh ${activeMonth.label} dari ${agent.name || 'Alhijaz'}`,
          });
        } catch (err: any) {
          if (err?.name === 'AbortError') return; // user cancelled — silent
          throw err;
        }
      } else {
        downloadBlob(image.blob, filenameForMonth(activeMonth.label, pageIndex + 1, activeImagePages.length, image.ext));
        showToast(`Share tidak didukung, ${image.ext.toUpperCase()} diunduh`);
      }
    } catch (e) {
      console.error('[brosur] share failed:', e);
      showToast('Gagal generate brosur, coba lagi');
    } finally {
      setBusy(null);
    }
  }

  // ── Loading: skeleton placeholder ───────────────────────────────
  if (loading) {
    return (
      <div className="pb-8">
        {/* Tab bar skeleton */}
        <div className="sticky top-0 bg-white dark:bg-slate-900 z-10 border-b border-gray-100 dark:border-slate-800">
          <div className="flex gap-2 px-4 py-3 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-7 rounded-full bg-gray-100 dark:bg-slate-800 animate-pulse"
                style={{ width: 90 }}
              />
            ))}
          </div>
        </div>
        {/* Brochure skeleton */}
        <div className="flex justify-center px-4 pt-5">
          <BrochureSkeleton />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 pt-10 pb-8 text-center">
        <p className="text-sm font-bold text-gray-800 dark:text-white">Gagal memuat brosur</p>
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1.5 leading-relaxed">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold active:scale-95 transition"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  if (!months.length || !activeMonth) {
    return (
      <div className="px-4 pt-10 pb-8 text-center">
        <p className="text-sm font-bold text-gray-800 dark:text-white">Belum ada jadwal paket yang aktif</p>
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1.5 leading-relaxed">
          Jadwal akan muncul otomatis saat ada paket mendatang dengan harga aktif.
        </p>
      </div>
    );
  }

  const previewReady = previewScale > 0;
  const imagePageCount = activeImagePages.length;

  return (
    <div style={{ paddingBottom: '2rem' }}>
      {/* Tab bar */}
      <div className="sticky top-0 bg-white dark:bg-slate-900 z-10 border-b border-gray-100 dark:border-slate-800">
        <div ref={tabBarRef} className="overflow-x-auto no-scrollbar">
          <div className="flex gap-2 px-4 py-3 min-w-max">
            {months.map(m => {
              const active = m.key === activeKey;
              return (
                <button
                  key={m.key}
                  data-key={m.key}
                  onClick={() => setActiveKey(m.key)}
                  className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-emerald-500 text-white'
                      : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Brochure previews + per-image actions */}
      <div className="flex justify-center px-4 pt-5">
        <div
          ref={previewContainerRef}
          style={{
            width: '100%',
            maxWidth: 480,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          {previewReady ? (
            activeImagePages.map((page, index) => {
              const shareBusy = busy?.kind === 'share' && busy.pageIndex === index;
              const downloadBusy = busy?.kind === 'download' && busy.pageIndex === index;

              return (
                <div
                  key={page.key}
                  style={{
                    width: '100%',
                    overflow: 'hidden',
                    borderRadius: 18,
                    boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
                    background: '#fff',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: `${BROCHURE_W} / ${BROCHURE_H}`,
                      position: 'relative',
                      overflow: 'hidden',
                      background: '#fff',
                    }}
                  >
                    <div
                      style={{
                        width: BROCHURE_W,
                        height: BROCHURE_H,
                        transform: `scale(${previewScale})`,
                        transformOrigin: 'top left',
                      }}
                    >
                      <BrochureScheduleTemplate month={page} agent={agent} />
                    </div>
                  </div>

                  <div
                    style={{
                      padding: 10,
                      borderTop: '1px solid rgba(15, 23, 42, 0.08)',
                      background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                    }}
                  >
                    <div className={`grid ${showShareButton ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
                      {showShareButton && (
                        <button
                          onClick={() => handleShare(index)}
                          disabled={busy !== null}
                          className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 shadow-sm shadow-emerald-500/20 transition-all duration-200 active:scale-[0.98] disabled:opacity-70"
                        >
                          {shareBusy ? <Loader2 size={17} className="animate-spin" /> : <Share2 size={17} />}
                          <span>Share</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleDownload(index)}
                        disabled={busy !== null}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-slate-800 border border-emerald-200 dark:border-emerald-700/70 transition-all duration-200 active:scale-[0.98] disabled:opacity-70"
                      >
                        {downloadBusy ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}
                        <span>Download</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <BrochureSkeleton />
          )}
        </div>
      </div>

      {toast && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-30 bg-gray-900 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-xl max-w-[90vw] whitespace-nowrap"
          style={{ bottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
        >
          {toast}
        </div>
      )}

      {/* Off-screen full-size export node — used as snapdom target. Keep it rendered, not transparent, so export matches preview. */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: -(BROCHURE_W + 80),
          top: 0,
          width: BROCHURE_W,
          pointerEvents: 'none',
        }}
      >
        {activeImagePages.map((page, index) => (
          <div
            key={page.key}
            ref={(node) => { exportPageRefs.current[index] = node; }}
            style={{ width: BROCHURE_W, height: BROCHURE_H }}
          >
            <BrochureScheduleTemplate month={page} agent={agent} />
          </div>
        ))}
      </div>
    </div>
  );
}

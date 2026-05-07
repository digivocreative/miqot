// src/components/BrochureSchedulePage.tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Download, Share2, Loader2 } from 'lucide-react';
import { BrochureScheduleTemplate, BROCHURE_W, BROCHURE_H, type BrochureMonth, type BrochureAgent } from './BrochureScheduleTemplate';
import { getAuthHeaders } from './LoginPage';

interface BrochureSchedulePageProps {
  agent: BrochureAgent;
}

interface ApiResponse {
  months: BrochureMonth[];
  agent: BrochureAgent;
}

export default function BrochureSchedulePage({ agent: agentProp }: BrochureSchedulePageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [months, setMonths] = useState<BrochureMonth[]>([]);
  const [agent, setAgent] = useState<BrochureAgent>(agentProp);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const tabBarRef = useRef<HTMLDivElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const [previewScale, setPreviewScale] = useState(0.4);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState<null | 'share' | 'download'>(null);

  useLayoutEffect(() => {
    function recompute() {
      const w = previewContainerRef.current?.clientWidth;
      setPreviewScale(w && w > 0 ? w / BROCHURE_W : 0.4);
    }
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/ai-tools/brosur-jadwal-bulan', { headers: getAuthHeaders() });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: ApiResponse = await res.json();
        if (!alive) return;
        setMonths(json.months || []);
        setAgent(json.agent || agentProp);
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

  // Scroll active tab into view on change
  useEffect(() => {
    if (!activeKey || !tabBarRef.current) return;
    const el = tabBarRef.current.querySelector(`[data-key="${activeKey}"]`) as HTMLElement | null;
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [activeKey]);

  const activeMonth = months.find(m => m.key === activeKey) || null;

  const filenameForMonth = (label: string) =>
    `brosur-paket-umroh-${label.toLowerCase().replace(/\s+/g, '-')}.png`;

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function captureBlob(): Promise<Blob | null> {
    if (!exportRef.current) return null;
    const { snapdom } = await import('@zumer/snapdom');
    const result = await snapdom(exportRef.current, { scale: 2, embedFonts: true });
    return await result.toBlob({ type: 'png' });
  }

  async function handleDownload() {
    if (!activeMonth) return;
    setBusy('download');
    try {
      const blob = await captureBlob();
      if (!blob) throw new Error('capture-failed');
      triggerDownload(blob, filenameForMonth(activeMonth.label));
    } catch (e) {
      console.error('[brosur] download failed:', e);
      alert('Gagal generate brosur, coba lagi.');
    } finally {
      setBusy(null);
    }
  }

  async function handleShare() {
    if (!activeMonth) return;
    setBusy('share');
    try {
      const blob = await captureBlob();
      if (!blob) throw new Error('capture-failed');
      const file = new File([blob], filenameForMonth(activeMonth.label), { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
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
        // Fallback: download
        triggerDownload(blob, filenameForMonth(activeMonth.label));
        alert('Browser tidak support share langsung, brosur ter-download.');
      }
    } catch (e) {
      console.error('[brosur] share failed:', e);
      alert('Gagal generate brosur, coba lagi.');
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="px-4 pt-6 pb-8 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-gray-400" size={28} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 pt-6 pb-8 text-center text-sm text-red-600 dark:text-red-400">
        {error}
      </div>
    );
  }

  if (!months.length || !activeMonth) {
    return (
      <div className="px-4 pt-10 pb-8 text-center">
        <p className="text-sm text-gray-500 dark:text-slate-400">Belum ada jadwal paket yang aktif.</p>
      </div>
    );
  }

  return (
    <div className="pb-32">
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
                      ? 'bg-red-600 text-white'
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

      {/* Brochure preview — scaled to fit screen */}
      <div className="flex justify-center px-4 pt-5">
        <div
          ref={previewContainerRef}
          style={{
            width: '100%',
            maxWidth: 480,
            aspectRatio: `${BROCHURE_W} / ${BROCHURE_H}`,
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 16,
            boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
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
            <BrochureScheduleTemplate month={activeMonth} agent={agent} />
          </div>
        </div>
      </div>

      {/* Hidden full-size export node — used as snapdom target */}
      <div style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none', opacity: 0 }}>
        <div ref={exportRef}>
          <BrochureScheduleTemplate month={activeMonth} agent={agent} />
        </div>
      </div>

      {/* Action bar */}
      <div className="fixed left-0 right-0 bottom-16 px-4 z-20 pointer-events-none">
        <div className="max-w-md mx-auto flex gap-3 pointer-events-auto">
          <button
            onClick={handleShare}
            disabled={busy !== null}
            className="flex-1 h-12 rounded-2xl bg-red-600 text-white font-bold flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] disabled:opacity-60"
          >
            {busy === 'share' ? <Loader2 className="animate-spin" size={18} /> : <Share2 size={18} />}
            Share
          </button>
          <button
            onClick={handleDownload}
            disabled={busy !== null}
            className="flex-1 h-12 rounded-2xl bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 border-2 border-red-600 dark:border-red-400 font-bold flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] disabled:opacity-60"
          >
            {busy === 'download' ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
            Download
          </button>
        </div>
      </div>
    </div>
  );
}

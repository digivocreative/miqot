// src/components/BrochureSchedulePage.tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
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

  useLayoutEffect(() => {
    function recompute() {
      const w = previewContainerRef.current?.clientWidth || BROCHURE_W;
      setPreviewScale(w / BROCHURE_W);
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
    </div>
  );
}

// Halaman share publik /:slug/:packageId/itinerary — dilihat jamaah, tanpa auth.
// Light-only, tona Alhijaz (spec 2026-07-30). OG meta disuntik server.js (rute SSR).
import { useEffect, useState } from 'react';
import { CalendarRange, FileText, Moon, Plane } from 'lucide-react';
import type { UmrohPackage } from '@/types';
import { trackPublicEvent } from '@/utils/analytics';
import { getPackageById } from '@/services/data-service';
import { AGENTS_DATA, loadAgentsFromSupabase, type AgentData } from '@/data/agents';
import WebItineraryView, { type ItineraryContent } from '../WebItineraryView';
import FloatingAgentBar from '../FloatingAgentBar';

export default function ItinerarySharePage({ slug, packageId }: { slug: string; packageId: string }) {
  const [content, setContent] = useState<ItineraryContent | null>(null);
  const [paket, setPaket] = useState<UmrohPackage | null>(null);
  const [agent, setAgent] = useState<AgentData | null>(AGENTS_DATA[slug] || null);
  const [state, setState] = useState<'loading' | 'ready' | 'notfound'>('loading');

  // Halaman share light-only — jangan warisi kelas `dark` dari sesi app agent di browser yang sama
  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  useEffect(() => {
    trackPublicEvent(slug, 'open_itinerary_share', { paket: packageId });
    loadAgentsFromSupabase().then(map => setAgent(map[slug] || null)).catch(() => {});
    Promise.allSettled([
      fetch(`/api/itinerary/${encodeURIComponent(packageId)}`).then(r => r.json()),
      getPackageById(packageId),
    ]).then(([itin, pkg]) => {
      const days: ItineraryContent | null =
        itin.status === 'fulfilled' && itin.value?.success ? itin.value.data : null;
      const p = pkg.status === 'fulfilled' ? pkg.value : null;
      if (p) setPaket(p);
      if (days?.days?.length) {
        setContent(days);
        setState('ready');
      } else {
        // Share tanpa itinerary tersusun = 404 lembut (spec, bagian State)
        setState('notfound');
      }
    });
  }, [slug, packageId]);

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-md px-4 pt-10">
          <div className="h-36 animate-pulse rounded-2xl bg-itin-canvas" />
          <div className="mt-4 h-20 animate-pulse rounded-2xl bg-itin-canvas" />
        </div>
      </div>
    );
  }

  if (state === 'notfound') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-itin-canvas px-4">
        <div className="w-full max-w-sm rounded-2xl border border-itin-line bg-white p-6 text-center">
          <p className="text-sm font-bold text-itin-ink">Itinerary belum tersedia</p>
          <p className="mt-1 text-xs leading-5 text-itin-ink3">
            Silakan buka halaman paket untuk info lengkap.
          </p>
          <a
            href={`/${slug}/${packageId}`}
            className="mt-4 inline-block rounded-xl bg-gradient-burgundy px-4 py-2.5 text-xs font-bold text-white"
          >
            Buka halaman paket
          </a>
        </div>
      </div>
    );
  }

  const pdfUrl = paket?.itineraryUrl || null;

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-md pb-24">
        {/* Hero burgundy + pola geometri islami (star-and-cross, goresan putih tipis) */}
        <header className="relative overflow-hidden bg-gradient-burgundy px-5 pb-5 pt-6 text-white">
          <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full">
            <defs>
              <pattern id="itin-hero-pattern" width="56" height="56" patternUnits="userSpaceOnUse">
                {/* Bintang 8: dua persegi bertumpuk, satu diputar 45° (rub el hizb) */}
                <rect x="14" y="14" width="28" height="28" fill="none" stroke="white" strokeOpacity="0.09" />
                <rect x="14" y="14" width="28" height="28" fill="none" stroke="white" strokeOpacity="0.09" transform="rotate(45 28 28)" />
                {/* Belah ketupat kecil di tiap sudut tile — membentuk silang saat berulang */}
                <rect x="-5" y="-5" width="10" height="10" fill="none" stroke="white" strokeOpacity="0.07" transform="rotate(45 0 0)" />
                <rect x="51" y="-5" width="10" height="10" fill="none" stroke="white" strokeOpacity="0.07" transform="rotate(45 56 0)" />
                <rect x="-5" y="51" width="10" height="10" fill="none" stroke="white" strokeOpacity="0.07" transform="rotate(45 0 56)" />
                <rect x="51" y="51" width="10" height="10" fill="none" stroke="white" strokeOpacity="0.07" transform="rotate(45 56 56)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#itin-hero-pattern)" />
          </svg>
          <div className="relative">
          <p className="text-[11px] font-bold tracking-[0.22em]">
            ALHIJAZ <span className="font-normal text-white/70">INDOWISATA</span>
          </p>
          <h1 className="mt-2 font-display text-[24px] leading-[1.18]">{paket?.nama || packageId}</h1>
          <p className="mt-1.5 text-[9px] font-bold tracking-[0.14em] text-white/70">ITINERARY PERJALANAN</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {paket?.keberangkatan?.tgl && (
              <span className="flex items-center gap-1.5 rounded-lg bg-white/15 px-2 py-1 text-[10px] font-semibold">
                <CalendarRange size={11} className="text-white/80" />
                {new Date(paket.keberangkatan.tgl).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
            {paket?.maskapai && (
              <span className="flex items-center gap-1.5 rounded-lg bg-white/15 px-2 py-1 text-[10px] font-semibold">
                <Plane size={11} className="text-white/80" /> {paket.maskapai}
              </span>
            )}
            {content && content.days.length > 1 && (
              <span className="flex items-center gap-1.5 rounded-lg bg-white/15 px-2 py-1 text-[10px] font-semibold">
                <Moon size={11} className="text-white/80" /> {content.days.length} hari
              </span>
            )}
          </div>
          </div>
        </header>

        <WebItineraryView
          content={content}
          loading={false}
          error={null}
          paket={paket}
          agentSlug={slug}
          agentName={agent?.name ?? null}
          agentPhone={agent?.phone ?? null}
          agentPhoto={agent?.photo ?? null}
          hideAgentFooter
        />

        <div className="px-4">
          {pdfUrl && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl border border-itin-line py-2.5 text-[12.5px] font-semibold text-itin-ink2"
            >
              <FileText size={15} /> Lihat dokumen PDF asli
            </a>
          )}
          <p className="mt-3 text-center text-[9.5px] leading-[1.45] text-itin-ink3">
            Jadwal dapat berubah menyesuaikan kondisi di lapangan.
          </p>
        </div>
      </div>

      {/* Profil agent melayang — komponen yang sama dengan jadwal (FloatingAgentBar) */}
      {agent?.phone && (
        <FloatingAgentBar
          agent={agent}
          slug={slug}
          message={`Assalamualaikum, saya mau tanya terkait paket ${paket?.nama || packageId}`}
          eventName="wa_click_itinerary"
          eventMeta={{ paket: packageId }}
        />
      )}
    </div>
  );
}

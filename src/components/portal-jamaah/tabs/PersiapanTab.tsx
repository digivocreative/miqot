import { useEffect, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import PersiapanHeader, { type PersiapanSubTab } from './persiapan/PersiapanHeader';
import TahapanSubTab from './persiapan/TahapanSubTab';
import SpiritualSubTab from './persiapan/SpiritualSubTab';
import DokumenSubTab from './persiapan/DokumenSubTab';
import PerlengkapanSubTab from './persiapan/PerlengkapanSubTab';
import { usePortalPersiapan } from '../hooks/usePortalPersiapan';
import type { PortalMeData } from '../hooks/usePortalMe';
import type { PortalTabId } from '../components/PortalBottomNav';

function LoadingScreen() {
  return (
    <div className="flex min-h-[calc(100vh-80px)] items-center justify-center bg-slate-50 px-4 py-8 font-sans">
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <Loader2 className="h-7 w-7 animate-spin" strokeWidth={2} />
        </div>
        <p className="mt-4 text-sm font-semibold text-slate-700">Memuat persiapan...</p>
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-8">
      <section className="rounded-2xl border border-slate-100 bg-white p-5 text-center shadow-sm">
        <AlertCircle className="mx-auto h-8 w-8 text-amber-700" strokeWidth={2} />
        <p className="mt-3 text-sm font-semibold text-slate-950">Persiapan belum bisa dimuat</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">Coba muat ulang data persiapan booking Anda.</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white"
        >
          Muat Ulang
        </button>
      </section>
    </div>
  );
}

export default function PersiapanTab({
  data,
  onNavigateRoot,
}: {
  data: PortalMeData;
  onNavigateRoot: (tab: PortalTabId) => void;
}) {
  const [subTab, setSubTab] = useState<PersiapanSubTab>('tahapan');
  const [selectedJamaahId, setSelectedJamaahId] = useState<number | undefined>(data.jamaah[0]?.id);
  const { persiapan, loading, error, toggleItem, refetch } = usePortalPersiapan();

  useEffect(() => {
    if (!selectedJamaahId && data.jamaah[0]?.id) setSelectedJamaahId(data.jamaah[0].id);
  }, [data.jamaah, selectedJamaahId]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 font-sans text-slate-900">
      <PersiapanHeader
        overallPct={persiapan?.progress.overall_pct || 0}
        activeSubTab={subTab}
        onSubTabChange={setSubTab}
        onBack={() => setSubTab('tahapan')}
      />

      {loading && <LoadingScreen />}
      {!loading && Boolean(error) && !persiapan && <ErrorState onRetry={refetch} />}
      {!loading && persiapan && (
        <>
          {subTab === 'tahapan' && (
            <TahapanSubTab
              items={persiapan.tahapan}
              departureDate={data.booking.tgl_berangkat}
              hariKeBerangkat={data.booking.hari_ke_berangkat}
              onToggle={(kind, itemId, checked) => toggleItem(kind, itemId, checked)}
              onNavigate={onNavigateRoot}
              onSubTabChange={setSubTab}
            />
          )}
          {subTab === 'spiritual' && (
            <SpiritualSubTab
              items={persiapan.spiritual}
              onToggle={(kind, itemId, checked) => toggleItem(kind, itemId, checked)}
            />
          )}
          {subTab === 'dokumen' && (
            <DokumenSubTab
              data={data}
              selectedId={selectedJamaahId}
              onSelectJamaah={setSelectedJamaahId}
            />
          )}
          {subTab === 'perlengkapan' && (
            <PerlengkapanSubTab
              data={data}
              selectedId={selectedJamaahId}
              onSelectJamaah={setSelectedJamaahId}
              serverItems={selectedJamaahId ? persiapan.perlengkapan_per_jamaah[String(selectedJamaahId)] : undefined}
            />
          )}
        </>
      )}
    </div>
  );
}

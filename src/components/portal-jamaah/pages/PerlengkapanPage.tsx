import { useState } from 'react';
import PortalBackBar from '../components/PortalBackBar';
import JamaahSelector from '../tabs/persiapan/JamaahSelector';
import PerlengkapanItem from '../tabs/persiapan/PerlengkapanItem';
import { usePortalPersiapan } from '../hooks/usePortalPersiapan';
import type { PortalMeData } from '../hooks/usePortalMe';
import type { PortalPerlengkapanStateItem } from '../hooks/usePortalPersiapan';

function subtextFor(item: PortalPerlengkapanStateItem): string {
  if (item.status === 'diambil') return `Diambil${item.diambil_at ? ' ' + new Date(item.diambil_at).toLocaleDateString('id-ID') : ''}`;
  if (item.status === 'tersedia') return 'Tersedia · akan diserahkan agent';
  return 'Belum siap · menunggu update agent';
}

export default function PerlengkapanPage({
  data,
  onBack,
}: {
  data: PortalMeData;
  onBack: () => void;
}) {
  const [selectedId, setSelectedId] = useState<number | undefined>(data.jamaah[0]?.id);
  const { persiapan } = usePortalPersiapan();
  const items = selectedId ? persiapan?.perlengkapan_per_jamaah?.[String(selectedId)] ?? [] : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900 dark:from-slate-900 dark:to-slate-950 dark:text-white">
      <PortalBackBar title="Perlengkapan" onBack={onBack} />
      <main className="mx-auto w-full max-w-lg space-y-5 px-4 pb-24 pt-5">
        {data.jamaah.length > 1 && (
          <JamaahSelector jamaah={data.jamaah} selectedId={selectedId} onChange={setSelectedId} />
        )}

        <section className="space-y-3">
          <p className="text-[13px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Perlengkapan Umroh</p>
          {items.length === 0 ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-5 text-sm text-gray-500 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              Daftar perlengkapan belum tersedia. Hubungi agent untuk info ambil.
            </div>
          ) : (
            <div className="space-y-2.5">
              {items.map((item) => (
                <PerlengkapanItem key={item.id} item={item} subtext={subtextFor(item)} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

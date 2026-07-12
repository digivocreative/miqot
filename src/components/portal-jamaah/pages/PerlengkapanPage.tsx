import { useState } from 'react';
import { AlertCircle, Package, PackageOpen, RefreshCw } from 'lucide-react';
import PortalBackBar from '../components/PortalBackBar';
import JamaahSelector from '../tabs/persiapan/JamaahSelector';
import PerlengkapanItem from '../tabs/persiapan/PerlengkapanItem';
import { usePortalPersiapan } from '../hooks/usePortalPersiapan';
import type { PortalMeData } from '../hooks/usePortalMe';
import type { PortalPerlengkapanStateItem } from '../hooks/usePortalPersiapan';

function subtextFor(item: PortalPerlengkapanStateItem): string {
  if (item.status === 'diambil') {
    const takenAt = item.diambil_at ? new Date(item.diambil_at) : null;
    const formattedDate = takenAt && Number.isFinite(takenAt.getTime())
      ? takenAt.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
      : null;
    return `Sudah diambil${formattedDate ? ` pada ${formattedDate}` : ''}`;
  }
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
  const { persiapan, loading, error, refetch } = usePortalPersiapan();
  const items = selectedId !== undefined
    ? persiapan?.perlengkapan_per_jamaah?.[String(selectedId)] ?? []
    : [];
  const takenCount = items.filter((item) => item.status === 'diambil').length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900 dark:from-slate-900 dark:to-slate-950 dark:text-white">
      <PortalBackBar
        title="Perlengkapan"
        onBack={onBack}
        icon={Package}
        iconClassName="bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400"
      />
      <main className="mx-auto w-full max-w-lg space-y-4 px-4 pb-24 pt-4">
        {data.jamaah.length > 1 && (
          <JamaahSelector jamaah={data.jamaah} selectedId={selectedId} onChange={setSelectedId} />
        )}

        <section className="space-y-3">
          <div className="flex min-h-7 items-center justify-between gap-3">
            <h1 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Perlengkapan Umroh</h1>
            {!loading && !error && items.length > 0 && (
              <span className="flex-none rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-bold text-violet-700 dark:bg-violet-900/20 dark:text-violet-300">
                {takenCount}/{items.length} diambil
              </span>
            )}
          </div>

          {loading ? (
            <div className="space-y-2.5" role="status" aria-label="Memuat daftar perlengkapan">
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="flex animate-pulse items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="h-10 w-10 flex-none rounded-xl bg-gray-100 dark:bg-slate-700" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3 w-2/5 rounded bg-gray-100 dark:bg-slate-700" />
                    <div className="h-2.5 w-3/4 rounded bg-gray-100 dark:bg-slate-700" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-800/50 dark:bg-red-900/20" role="alert">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-none text-red-500 dark:text-red-400" strokeWidth={2} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-red-700 dark:text-red-300">Perlengkapan belum bisa dimuat</p>
                  <p className="mt-1 text-xs leading-5 text-red-600 dark:text-red-400">Periksa koneksi lalu coba lagi.</p>
                  <button
                    type="button"
                    onClick={() => void refetch()}
                    className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-bold text-red-600 shadow-sm transition-colors hover:bg-red-100 active:scale-95 dark:bg-slate-800 dark:text-red-300 dark:hover:bg-slate-700"
                  >
                    <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.2} />
                    Coba lagi
                  </button>
                </div>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-gray-100 bg-white px-5 py-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400">
                <PackageOpen className="h-5 w-5" strokeWidth={2} />
              </div>
              <p className="mt-3 text-sm font-bold text-gray-800 dark:text-slate-100">Daftar belum tersedia</p>
              <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-gray-500 dark:text-slate-400">
                Agent akan memperbarui status perlengkapan dan jadwal pengambilannya di sini.
              </p>
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

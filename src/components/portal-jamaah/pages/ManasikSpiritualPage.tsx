import { AlertCircle, BookOpenCheck, ListChecks, MapPin, RefreshCw } from 'lucide-react';
import PortalBackBar from '../components/PortalBackBar';
import ChecklistItem from '../tabs/persiapan/ChecklistItem';
import { usePortalPersiapan } from '../hooks/usePortalPersiapan';
import type { PortalMeData } from '../hooks/usePortalMe';
import { formatLongDate, formatPortalTime } from '../utils/formatDate';

export default function ManasikSpiritualPage({
  data,
  onBack,
}: {
  data: PortalMeData;
  onBack: () => void;
}) {
  const { persiapan, loading, error, toggleItem, refetch } = usePortalPersiapan();
  const schedule = data.schedule;
  const spiritual = persiapan?.spiritual ?? [];
  const completedCount = spiritual.filter((item) => item.checked).length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900 dark:from-slate-900 dark:to-slate-950 dark:text-white">
      <PortalBackBar
        title="Manasik & Spiritual"
        onBack={onBack}
        icon={BookOpenCheck}
        iconClassName="bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-900/20 dark:text-fuchsia-400"
      />
      <main className="mx-auto w-full max-w-lg space-y-4 px-4 pb-24 pt-4">
        <section
          className="overflow-hidden rounded-2xl p-4 text-white shadow-sm"
          style={{ background: 'linear-gradient(135deg, #581c87 0%, #7c3aed 50%, #6b21a8 100%)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-purple-100">
              <BookOpenCheck className="h-4 w-4 flex-none" strokeWidth={2} />
              <span className="truncate">Jadwal Manasik</span>
            </div>
            {schedule?.manasik_jam && (
              <span className="flex-none rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur-sm">
                {formatPortalTime(schedule.manasik_jam)}
              </span>
            )}
          </div>
          <p className="mt-3 text-lg font-bold leading-snug tracking-tight sm:text-xl">
            {schedule?.manasik_tgl ? formatLongDate(schedule.manasik_tgl) : 'Jadwal menyusul'}
          </p>
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 text-xs font-medium leading-5 text-purple-50 backdrop-blur-sm">
            <MapPin className="mt-0.5 h-4 w-4 flex-none" strokeWidth={2} />
            <span className="min-w-0">Lokasi akan dikonfirmasi oleh agent.</span>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex min-h-7 items-center justify-between gap-3">
            <h1 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Persiapan Spiritual</h1>
            {!loading && !error && spiritual.length > 0 && (
              <span className="flex-none rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                {completedCount}/{spiritual.length} selesai
              </span>
            )}
          </div>

          {loading ? (
            <div className="space-y-2.5" role="status" aria-label="Memuat checklist spiritual">
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="flex animate-pulse items-start gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="h-9 w-9 flex-none rounded-lg bg-gray-100 dark:bg-slate-700" />
                  <div className="min-w-0 flex-1 space-y-2 pt-1">
                    <div className="h-3 w-1/2 rounded bg-gray-100 dark:bg-slate-700" />
                    <div className="h-2.5 w-full rounded bg-gray-100 dark:bg-slate-700" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-800/50 dark:bg-red-900/20" role="alert">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-none text-red-500 dark:text-red-400" strokeWidth={2} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-red-700 dark:text-red-300">Checklist belum bisa dimuat</p>
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
          ) : spiritual.length === 0 ? (
            <div className="rounded-2xl border border-gray-100 bg-white px-5 py-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-900/20 dark:text-fuchsia-400">
                <ListChecks className="h-5 w-5" strokeWidth={2} />
              </div>
              <p className="mt-3 text-sm font-bold text-gray-800 dark:text-slate-100">Checklist belum tersedia</p>
              <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-gray-500 dark:text-slate-400">
                Panduan persiapan spiritual akan tampil saat sudah dirilis oleh agent.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {spiritual.map((item) => (
                <ChecklistItem
                  key={item.id}
                  item={item}
                  kind="spiritual"
                  comfortableTouchTarget
                  onToggle={(_, itemId, checked) => toggleItem('spiritual', itemId, checked)}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

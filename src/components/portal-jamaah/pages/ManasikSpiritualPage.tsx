import { BookOpenCheck, MapPin } from 'lucide-react';
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
  const { persiapan, toggleItem } = usePortalPersiapan();
  const schedule = data.schedule;
  const spiritual = persiapan?.spiritual ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900 dark:from-slate-900 dark:to-slate-950 dark:text-white">
      <PortalBackBar title="Manasik & Spiritual" onBack={onBack} />
      <main className="mx-auto w-full max-w-lg space-y-5 px-4 pb-24 pt-5">
        <section
          className="rounded-2xl p-6 text-white shadow-sm"
          style={{ background: 'linear-gradient(135deg, #581c87 0%, #7c3aed 50%, #6b21a8 100%)' }}
        >
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-purple-100">
            <BookOpenCheck className="h-4 w-4" strokeWidth={2} />
            Jadwal Manasik
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight">
            {schedule?.manasik_tgl ? formatLongDate(schedule.manasik_tgl) : 'Jadwal menyusul'}
          </p>
          {schedule?.manasik_jam && (
            <p className="mt-1 text-sm font-semibold text-purple-100">Pukul {formatPortalTime(schedule.manasik_jam)} WIB</p>
          )}
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-sm font-medium text-purple-50 backdrop-blur-sm">
            <MapPin className="h-4 w-4 flex-none" strokeWidth={2} />
            <span>Lokasi: hubungi agent untuk konfirmasi venue</span>
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-[13px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Persiapan Spiritual</p>
          {spiritual.length === 0 ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-5 text-sm text-gray-500 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              Checklist spiritual belum tersedia.
            </div>
          ) : (
            <div className="space-y-2">
              {spiritual.map((item) => (
                <ChecklistItem
                  key={item.id}
                  item={item}
                  kind="spiritual"
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

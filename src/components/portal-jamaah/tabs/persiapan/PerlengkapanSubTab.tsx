import { Info } from 'lucide-react';
import { PERLENGKAPAN_DEFAULTS } from '@/constants/persiapan-defaults';
import JamaahSelector from './JamaahSelector';
import PerlengkapanItem from './PerlengkapanItem';
import type { PortalJamaah, PortalMeData } from '../../hooks/usePortalMe';
import type { PortalPerlengkapanStateItem } from '../../hooks/usePortalPersiapan';
import { formatShortDate } from '../../utils/formatDate';

function selectedJamaah(jamaah: PortalJamaah[], selectedId?: number) {
  return jamaah.find((item) => item.id === selectedId) || jamaah[0];
}

function normalizeStatus(value: unknown): PortalPerlengkapanStateItem['status'] {
  if (value === 'diambil' || value === 'tersedia' || value === 'belum_siap') return value;
  return 'belum_siap';
}

function mergeItems(
  jamaah: PortalJamaah,
  scheduleDate?: string | null,
  serverItems?: PortalPerlengkapanStateItem[]
): PortalPerlengkapanStateItem[] {
  if (serverItems?.length) return serverItems;

  return PERLENGKAPAN_DEFAULTS.map((item) => {
    const entry = jamaah.perlengkapan?.[item.id] || {};
    const explicitStatus = normalizeStatus(entry.status);
    const hasExplicitStatus = Boolean(entry.status);
    const status = hasExplicitStatus ? explicitStatus : item.handover === 'dp' ? 'diambil' : 'tersedia';
    const daftarDate = (jamaah as PortalJamaah & { tgl_daftar?: string }).tgl_daftar || null;
    return {
      ...item,
      handover: item.handover as 'dp' | 'manasik',
      status,
      diambil_at: entry.diambil_at || (item.handover === 'dp' ? daftarDate : scheduleDate) || null,
    };
  });
}

function subtextFor(item: PortalPerlengkapanStateItem, manasikDate?: string | null) {
  if (item.status === 'diambil') {
    const date = item.diambil_at ? formatShortDate(item.diambil_at) : item.handover === 'dp' ? 'saat DP' : 'saat handover';
    return `Diambil ${date}`;
  }
  if (item.status === 'tersedia') {
    return `Tersedia · diserahkan ${item.handover === 'manasik' ? formatShortDate(manasikDate) : 'saat DP'}`;
  }
  return 'Belum siap · menunggu update agent';
}

function group(items: PortalPerlengkapanStateItem[], status: PortalPerlengkapanStateItem['status']) {
  return items.filter((item) => item.status === status);
}

function GroupSection({
  title,
  items,
  manasikDate,
  tone,
}: {
  title: string;
  items: PortalPerlengkapanStateItem[];
  manasikDate?: string | null;
  tone: 'emerald' | 'amber' | 'slate';
}) {
  if (!items.length) return null;
  const titleClass = tone === 'emerald'
    ? 'text-emerald-700 dark:text-emerald-300'
    : tone === 'amber'
      ? 'text-amber-700 dark:text-amber-300'
      : 'text-slate-600 dark:text-slate-300';

  return (
    <section>
      <p className={`mb-3 text-xs font-bold uppercase tracking-wide ${titleClass}`}>{title}</p>
      <div className="space-y-3">
        {items.map((item) => (
          <PerlengkapanItem key={item.id} item={item} subtext={subtextFor(item, manasikDate)} />
        ))}
      </div>
    </section>
  );
}

export default function PerlengkapanSubTab({
  data,
  selectedId,
  onSelectJamaah,
  serverItems,
}: {
  data: PortalMeData;
  selectedId?: number;
  onSelectJamaah: (id: number) => void;
  serverItems?: PortalPerlengkapanStateItem[];
}) {
  const active = selectedJamaah(data.jamaah, selectedId);
  if (!active) return null;

  const items = mergeItems(active, data.schedule?.manasik_tgl, serverItems);
  const taken = group(items, 'diambil');
  const available = group(items, 'tersedia');
  const pending = group(items, 'belum_siap');

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-28 pt-5">
      <JamaahSelector jamaah={data.jamaah} selectedId={active.id} onChange={onSelectJamaah} />

      <div className="mt-5 space-y-4">
        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Sedang dilihat</p>
              <p className="mt-1 truncate text-lg font-bold text-slate-950 dark:text-white">{active.nama}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Status perlengkapan jamaah</p>
            </div>
            <span className="flex-none rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              {taken.length}/{items.length} Diambil
            </span>
          </div>
        </section>

        <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-[11px] font-semibold text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Diambil</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" />Tersedia di kantor</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-300" />Belum siap</span>
        </div>

        <GroupSection title="Sudah Diambil" items={taken} manasikDate={data.schedule?.manasik_tgl} tone="emerald" />
        <GroupSection title="Akan Diambil Saat Manasik" items={available} manasikDate={data.schedule?.manasik_tgl} tone="amber" />
        <GroupSection title="Belum Siap" items={pending} manasikDate={data.schedule?.manasik_tgl} tone="slate" />

        <section className="rounded-2xl border border-sky-100 bg-sky-50 p-4 dark:border-sky-800/40 dark:bg-sky-900/20">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-4 w-4 flex-none text-sky-700 dark:text-sky-300" strokeWidth={2} />
            <p className="text-xs leading-5 text-sky-800 dark:text-sky-200">
              Status diupdate oleh {data.agent?.name || 'agent'} saat handover. Anda bisa konfirmasi via WhatsApp jika ada item yang belum diterima.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

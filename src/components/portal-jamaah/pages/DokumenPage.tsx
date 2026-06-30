import { useState } from 'react';
import { Check, Clock, X as XIcon } from 'lucide-react';
import PortalBackBar from '../components/PortalBackBar';
import JamaahSelector from '../tabs/persiapan/JamaahSelector';
import type { PortalJamaah, PortalMeData } from '../hooks/usePortalMe';

type DocStatus = 'lengkap' | 'diproses' | 'belum';

interface DocSpec {
  key: string;
  label: string;
  matchKeys: string[];
}

const DOCS: DocSpec[] = [
  { key: 'paspor', label: 'Paspor', matchKeys: ['paspor'] },
  { key: 'ktp', label: 'KTP', matchKeys: ['ktp'] },
  { key: 'vaksin', label: 'Vaksin Meningitis', matchKeys: ['vaksin', 'meningitis', 'icv'] },
  { key: 'foto_46', label: 'Foto 4x6 latar putih', matchKeys: ['foto_46', 'foto', 'pas_foto'] },
  { key: 'buku_nikah', label: 'Buku Nikah', matchKeys: ['buku_nikah', 'nikah', 'buku nikah'] },
];

function docStatus(jamaah: PortalJamaah | undefined, spec: DocSpec): DocStatus {
  if (!jamaah) return 'belum';
  const text = JSON.stringify(jamaah.dokumen || {}).toLowerCase();
  if (spec.matchKeys.includes('paspor') && jamaah.no_paspor) return 'lengkap';
  for (const key of spec.matchKeys) {
    if (text.includes(`${key}_belum_siap`)) return 'diproses';
    if (text.includes(key)) return 'lengkap';
  }
  return 'belum';
}

const STATUS_BADGE: Record<DocStatus, { label: string; bg: string; text: string; icon: typeof Check }> = {
  lengkap: {
    label: 'Lengkap',
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    text: 'text-emerald-700 dark:text-emerald-300',
    icon: Check,
  },
  diproses: {
    label: 'Diproses',
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-300',
    icon: Clock,
  },
  belum: {
    label: 'Belum',
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-700 dark:text-red-300',
    icon: XIcon,
  },
};

export default function DokumenPage({
  data,
  onBack,
}: {
  data: PortalMeData;
  onBack: () => void;
}) {
  const [selectedId, setSelectedId] = useState<number | undefined>(data.jamaah[0]?.id);
  const selected = data.jamaah.find((j) => j.id === selectedId);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900 dark:from-slate-900 dark:to-slate-950 dark:text-white">
      <PortalBackBar title="Dokumen" onBack={onBack} />
      <main className="mx-auto w-full max-w-lg space-y-5 px-4 pb-24 pt-5">
        {data.jamaah.length > 1 && (
          <JamaahSelector jamaah={data.jamaah} selectedId={selectedId} onChange={setSelectedId} />
        )}

        <section className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Dokumen Wajib</p>
          <div className="space-y-2.5">
            {DOCS.map((doc) => {
              const status = docStatus(selected, doc);
              const badge = STATUS_BADGE[status];
              const IconBadge = badge.icon;
              return (
                <div key={doc.key} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{doc.label}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${badge.bg} ${badge.text}`}>
                    <IconBadge className="h-3 w-3" strokeWidth={2.5} />
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-amber-100 bg-amber-50 p-4 dark:border-amber-800/40 dark:bg-amber-900/20">
          <p className="text-sm font-bold text-amber-800 dark:text-amber-200">Belum punya dokumen tertentu?</p>
          <p className="mt-1 text-xs leading-5 text-amber-700 dark:text-amber-300">
            Hubungi {data.agent?.name || 'agent'} untuk panduan &amp; kirim dokumen lewat WhatsApp.
          </p>
        </section>
      </main>
    </div>
  );
}

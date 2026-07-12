import { useState } from 'react';
import { Check, Clock, FileText, X as XIcon } from 'lucide-react';
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
  { key: 'paspor', label: 'Paspor', matchKeys: ['paspor', 'passport'] },
  { key: 'ktp', label: 'KTP', matchKeys: ['ktp'] },
  { key: 'vaksin', label: 'Vaksin Meningitis', matchKeys: ['vaksin', 'vaksin_meningitis', 'meningitis', 'icv'] },
  { key: 'foto_46', label: 'Foto 4x6 latar putih', matchKeys: ['foto_46', 'foto_4x6', 'foto', 'pas_foto'] },
  { key: 'buku_nikah', label: 'Buku Nikah', matchKeys: ['buku_nikah', 'nikah', 'buku nikah'] },
];

const READY_STATUSES = new Set(['lengkap', 'verified', 'uploaded', 'checked', 'diambil', 'ready', 'selesai']);
const PROCESSING_STATUSES = new Set(['diproses', 'proses', 'processing', 'pending', 'menunggu_verifikasi', 'dikirim']);
const MISSING_STATUSES = new Set(['belum', 'belum_siap', 'missing', 'false', '0']);

function normalizeDocKey(value: string) {
  return value.trim().toLocaleLowerCase('id-ID').replace(/[\s-]+/g, '_');
}

function docValueStatus(value: unknown): DocStatus {
  if (value === true || value === 1) return 'lengkap';
  if (value === false || value === 0 || value === null || value === undefined) return 'belum';

  if (typeof value === 'string') {
    const normalized = normalizeDocKey(value);
    if (!normalized || MISSING_STATUSES.has(normalized)) return 'belum';
    if (PROCESSING_STATUSES.has(normalized)) return 'diproses';
    if (READY_STATUSES.has(normalized)) return 'lengkap';
    // A non-empty filename or URL is treated as an uploaded document.
    return 'lengkap';
  }

  if (typeof value === 'object') {
    const entry = value as Record<string, unknown>;
    if (entry.verified === true || entry.uploaded === true || entry.checked === true || entry.ready === true) {
      return 'lengkap';
    }
    if (entry.processing === true || entry.diproses === true || entry.pending === true) return 'diproses';
    if (entry.status !== undefined) return docValueStatus(entry.status);
    if (entry.url || entry.file || entry.path || entry.filename) return 'lengkap';
  }

  return 'belum';
}

function docStatus(jamaah: PortalJamaah | undefined, spec: DocSpec): DocStatus {
  if (!jamaah) return 'belum';
  if (spec.key === 'paspor' && String(jamaah.no_paspor || '').trim()) return 'lengkap';

  const aliases = new Set(spec.matchKeys.map(normalizeDocKey));
  let bestStatus: DocStatus = 'belum';
  for (const [rawKey, value] of Object.entries(jamaah.dokumen || {})) {
    const key = normalizeDocKey(rawKey);
    if (!aliases.has(key)) continue;
    const status = docValueStatus(value);
    if (status === 'lengkap') return 'lengkap';
    if (status === 'diproses') bestStatus = 'diproses';
  }
  return bestStatus;
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
  const selected = data.jamaah.find((j) => j.id === selectedId) || data.jamaah[0];
  const completedCount = selected ? DOCS.filter((doc) => docStatus(selected, doc) === 'lengkap').length : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900 dark:from-slate-900 dark:to-slate-950 dark:text-white">
      <PortalBackBar
        title="Dokumen"
        onBack={onBack}
        icon={FileText}
        iconClassName="bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
      />
      <main className="mx-auto w-full max-w-lg space-y-4 px-4 pb-24 pt-4">
        {data.jamaah.length > 1 && (
          <JamaahSelector jamaah={data.jamaah} selectedId={selected?.id} onChange={setSelectedId} />
        )}

        {selected ? (
          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Dokumen Wajib</p>
                <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-slate-400">{selected.nama}</p>
              </div>
              <span className="flex-none rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                {completedCount}/{DOCS.length} lengkap
              </span>
            </div>
            <div className="space-y-2">
              {DOCS.map((doc) => {
                const status = docStatus(selected, doc);
                const badge = STATUS_BADGE[status];
                const IconBadge = badge.icon;
                return (
                  <div key={doc.key} className="flex items-center gap-3 overflow-hidden rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${badge.bg} ${badge.text}`}>
                      <IconBadge className="h-4 w-4" strokeWidth={2.5} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-bold leading-snug text-gray-900 [overflow-wrap:anywhere] dark:text-white">{doc.label}</p>
                    </div>
                    <span className={`flex-none rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide ${badge.bg} ${badge.text}`}>
                      {badge.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <FileText className="mx-auto h-9 w-9 text-gray-300 dark:text-slate-600" strokeWidth={2} />
            <p className="mt-3 text-sm font-bold text-gray-900 dark:text-white">Data jamaah belum tersedia</p>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-slate-400">
              Checklist dokumen akan tampil setelah data jamaah dimuat.
            </p>
          </section>
        )}

        <section className="rounded-2xl border border-amber-100 bg-amber-50 p-4 dark:border-amber-800/40 dark:bg-amber-900/20">
          <p className="text-sm font-bold text-amber-800 dark:text-amber-200">Belum punya dokumen tertentu?</p>
          <p className="mt-1 text-xs leading-5 text-amber-700 dark:text-amber-300">
            {data.agent?.phone
              ? `Hubungi ${data.agent?.name || 'agent'} untuk panduan dan kirim dokumen lewat WhatsApp.`
              : `Hubungi ${data.agent?.name || 'agent'} untuk panduan pengumpulan dokumen.`}
          </p>
        </section>
      </main>
    </div>
  );
}

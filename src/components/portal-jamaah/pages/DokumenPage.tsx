import { useState } from 'react';
import { Check, Clock, FileText, X as XIcon } from 'lucide-react';
import PortalBackBar from '../components/PortalBackBar';
import JamaahSelector from '../tabs/persiapan/JamaahSelector';
import type { PortalMeData } from '../hooks/usePortalMe';
// Checklist dokumen dari lib bersama — SATU sumber kebenaran.
import { DOKUMEN_WAJIB as DOCS, docStatus, type DocStatus } from '../lib/dokumenChecklist';
import { Card, PortalPageShell, SectionLabel, StatusChip, type ChipStatus } from '../ui';

const STATUS_BADGE: Record<DocStatus, { label: string; chip: ChipStatus; iconBg: string; iconText: string; icon: typeof Check }> = {
  lengkap: {
    label: 'Lengkap',
    chip: 'success',
    iconBg: 'bg-emerald-500/12',
    iconText: 'text-emerald-700',
    icon: Check,
  },
  diproses: {
    label: 'Diproses',
    chip: 'warning',
    iconBg: 'bg-amber-500/15',
    iconText: 'text-amber-700',
    icon: Clock,
  },
  belum: {
    label: 'Belum',
    chip: 'danger',
    iconBg: 'bg-red-500/12',
    iconText: 'text-red-600',
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
    <PortalPageShell>
      <PortalBackBar
        title="Dokumen"
        onBack={onBack}
        icon={FileText}
        iconClassName="bg-burgundy-700/8 text-burgundy-700"
      />
      <main className="mx-auto w-full max-w-lg space-y-4 px-4 pb-24 pt-4">
        {data.jamaah.length > 1 && (
          <JamaahSelector jamaah={data.jamaah} selectedId={selected?.id} onChange={setSelectedId} />
        )}

        {selected ? (
          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <SectionLabel>Dokumen Wajib</SectionLabel>
                <p className="mt-1.5 truncate text-xs text-ink/60">{selected.nama}</p>
              </div>
              <StatusChip status={completedCount === DOCS.length ? 'success' : 'neutral'} className="flex-none">
                {completedCount}/{DOCS.length} lengkap
              </StatusChip>
            </div>
            <div className="space-y-2">
              {DOCS.map((doc) => {
                const status = docStatus(selected, doc);
                const badge = STATUS_BADGE[status];
                const IconBadge = badge.icon;
                return (
                  <Card key={doc.key} className="flex items-center gap-3 overflow-hidden p-3.5">
                    <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${badge.iconBg} ${badge.iconText}`}>
                      <IconBadge className="h-4 w-4" strokeWidth={2.5} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-bold leading-snug text-ink [overflow-wrap:anywhere]">{doc.label}</p>
                    </div>
                    <StatusChip status={badge.chip} className="flex-none">
                      {badge.label}
                    </StatusChip>
                  </Card>
                );
              })}
            </div>
          </section>
        ) : (
          <Card className="overflow-hidden p-5 text-center">
            <FileText className="mx-auto h-9 w-9 text-burgundy-200" strokeWidth={2} />
            <p className="mt-3 text-sm font-bold text-ink">Data jamaah belum tersedia</p>
            <p className="mt-1 text-xs leading-5 text-ink/60">
              Checklist dokumen akan tampil setelah data jamaah dimuat.
            </p>
          </Card>
        )}

        <section className="rounded-lega border border-amber-500/20 bg-amber-500/10 p-4">
          <p className="text-sm font-bold text-amber-800">Belum punya dokumen tertentu?</p>
          <p className="mt-1 text-xs leading-5 text-amber-700">
            {data.agent?.phone
              ? `Hubungi ${data.agent?.name || 'agent'} untuk panduan dan kirim dokumen lewat WhatsApp.`
              : `Hubungi ${data.agent?.name || 'agent'} untuk panduan pengumpulan dokumen.`}
          </p>
        </section>
      </main>
    </PortalPageShell>
  );
}

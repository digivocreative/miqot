import { CheckCircle2, FileText, MessageCircle } from 'lucide-react';
import { normalizeWaNumber } from '@/utils/phone';
import JamaahSelector from './JamaahSelector';
import { Button, Card, IconTile, SectionLabel, StatusChip } from '../../ui';
import type { PortalJamaah, PortalMeData } from '../../hooks/usePortalMe';
import { formatLongDate } from '../../utils/formatDate';

const DOCUMENT_ITEMS = [
  { id: 'paspor', title: 'Paspor', description: 'Nomor paspor dan masa berlaku aktif minimal 6 bulan' },
  { id: 'ktp', title: 'KTP', description: 'Identitas sesuai data pendaftaran' },
  { id: 'vaksin', title: 'Vaksin Meningitis', description: 'Sertifikat ICV' },
  { id: 'foto_46', title: 'Foto 4x6 latar putih', description: 'Foto formal sesuai ketentuan visa' },
  { id: 'buku_nikah', title: 'Buku Nikah', description: 'Wajib untuk pasutri' },
] as const;

function docEntry(jamaah: PortalJamaah, id: string) {
  const docs = jamaah.dokumen || {};
  const aliases: Record<string, string[]> = {
    paspor: ['paspor', 'passport'],
    ktp: ['ktp', 'KTP'],
    vaksin: ['vaksin', 'vaksin_meningitis', 'meningitis', 'icv'],
    foto_46: ['foto_46', 'foto', 'pas_foto'],
    buku_nikah: ['buku_nikah', 'nikah', 'buku nikah'],
  };
  for (const key of aliases[id] || [id]) {
    if (Object.prototype.hasOwnProperty.call(docs, key)) return docs[key] as Record<string, unknown> | boolean;
  }
  return null;
}

function isVerified(jamaah: PortalJamaah, id: string) {
  if (id === 'paspor' && jamaah.no_paspor) return true;
  const entry = docEntry(jamaah, id);
  if (entry === true) return true;
  if (!entry || typeof entry !== 'object') return false;
  return entry.verified === true || entry.uploaded === true || entry.checked === true || entry.status === 'verified';
}

function selectedJamaah(jamaah: PortalJamaah[], selectedId?: number) {
  return jamaah.find((item) => item.id === selectedId) || jamaah[0];
}

export default function DokumenSubTab({
  data,
  selectedId,
  onSelectJamaah,
}: {
  data: PortalMeData;
  selectedId?: number;
  onSelectJamaah: (id: number) => void;
}) {
  const active = selectedJamaah(data.jamaah, selectedId);
  if (!active) return null;

  const done = DOCUMENT_ITEMS.filter((item) => isVerified(active, item.id)).length;
  const phone = normalizeWaNumber(data.agent?.phone);
  const waText = `Assalamualaikum ${data.agent?.name || 'Agent'},
Saya ${active.nama} dari booking ${data.booking.id_umroh}.
Saya mau kirim dokumen: ___
Mohon dicek ya.`;
  const waLink = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(waText)}` : null;

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-28 pt-5">
      <JamaahSelector jamaah={data.jamaah} selectedId={active.id} onChange={onSelectJamaah} />

      <div className="mt-5 space-y-4">
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink/70">Sedang dilihat</p>
              <p className="mt-1 truncate text-lg font-bold text-ink">{active.nama}</p>
              {active.no_paspor && (
                <p className="mt-1 font-mono text-xs tabular-nums text-ink/60">
                  Paspor {active.no_paspor} · exp {formatLongDate(active.paspor_expired)}
                </p>
              )}
            </div>
            <StatusChip status={done === DOCUMENT_ITEMS.length ? 'success' : 'neutral'} className="flex-none">
              {done}/{DOCUMENT_ITEMS.length} Lengkap
            </StatusChip>
          </div>
        </Card>

        <section>
          <SectionLabel className="mb-3">Checklist Dokumen</SectionLabel>
          <div className="space-y-3">
            {DOCUMENT_ITEMS.map((item) => {
              const verified = isVerified(active, item.id);
              return (
                <Card key={item.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <IconTile tint="neutral" size="md">
                      {verified ? <CheckCircle2 className="h-5 w-5" strokeWidth={2} /> : <FileText className="h-5 w-5" strokeWidth={2} />}
                    </IconTile>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-ink">{item.title}</p>
                        <StatusChip status={verified ? 'success' : 'neutral'} className="flex-none">
                          {verified ? 'Diterima' : 'Belum'}
                        </StatusChip>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-ink/60">{item.description}</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        {waLink && (
          <Button href={waLink} target="_blank" rel="noreferrer" variant="wa" fullWidth>
            <MessageCircle className="h-4 w-4" strokeWidth={2} />
            Upload Dokumen Baru
          </Button>
        )}
      </div>
    </main>
  );
}

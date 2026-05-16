import { CheckCircle2, FileText, MessageCircle } from 'lucide-react';
import { normalizeWaNumber } from '@/utils/phone';
import JamaahSelector from './JamaahSelector';
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
    buku_nikah: ['buku_nikah', 'nikah'],
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
    <main className="mx-auto w-full max-w-md pb-28">
      <JamaahSelector jamaah={data.jamaah} selectedId={active.id} onChange={onSelectJamaah} />

      <div className="space-y-4 px-4 pt-4">
        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Sedang dilihat</p>
              <p className="mt-1 truncate text-lg font-bold text-slate-950">{active.nama}</p>
              {active.no_paspor && (
                <p className="mt-1 text-xs text-slate-500">
                  Paspor {active.no_paspor} · exp {formatLongDate(active.paspor_expired)}
                </p>
              )}
            </div>
            <span className="flex-none rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              {done}/{DOCUMENT_ITEMS.length} Lengkap
            </span>
          </div>
        </section>

        <section>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Checklist Dokumen</p>
          <div className="space-y-3">
            {DOCUMENT_ITEMS.map((item) => {
              const verified = isVerified(active, item.id);
              return (
                <div key={item.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${verified ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                      {verified ? <CheckCircle2 className="h-5 w-5" strokeWidth={2} /> : <FileText className="h-5 w-5" strokeWidth={2} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                        <span className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-semibold ${verified ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {verified ? 'Diterima' : 'Belum'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {waLink && (
          <a
            href={waLink}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white"
          >
            <MessageCircle className="h-4 w-4" strokeWidth={2} />
            Upload Dokumen Baru
          </a>
        )}
      </div>
    </main>
  );
}

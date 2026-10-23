import { FileText, MessageCircle } from 'lucide-react';
import type { HajiPersonal } from '../lib/calonHaji';
import { normalizeWaNumber } from '../utils/phone';

export type HajiDocument = { url: string; title: string; doc: 'bpih' | 'pernyataan' };

function Item({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-slate-400">{label}</p>
      <p className="break-words text-xs font-semibold text-gray-700 dark:text-slate-200">{value || '-'}</p>
    </div>
  );
}

function usd(value: number | string | null) {
  if (value == null || String(value).trim() === '' || !Number.isFinite(Number(value))) return '-';
  return `USD ${Number(value).toLocaleString('id-ID')}`;
}

function dateLabel(value: string | null) {
  if (!value) return '-';
  const day = value.slice(0, 10);
  const date = new Date(`${day}T00:00:00`);
  return Number.isNaN(date.getTime()) ? day : date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function CalonHajiPersonalDetail({ records, nama, onDocument }: {
  records: HajiPersonal[];
  nama: string;
  onDocument: (document: HajiDocument) => void;
}) {
  return (
    <div className="space-y-4 px-3 pb-3">
      {records.map((item, index) => {
        const wa = normalizeWaNumber(item.telp);
        const openDocument = (url: string, doc: HajiDocument['doc']) => onDocument({
          url: `/api/haji/doc-proxy?url=${encodeURIComponent(url)}`,
          title: `${doc === 'bpih' ? 'BPIH' : 'Pernyataan'} - ${nama}`,
          doc,
        });
        return (
          <section key={`${item.id_haji}_${item.id_jamaah}_${index}`} className="space-y-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              <Item label="WhatsApp" value={item.telp} />
              <Item label="Paket" value={item.paket_detail || item.paket} />
              <Item label="No. Porsi" value={item.nomor_porsi} />
              <Item label="No. SPPH" value={item.nomor_spph} />
              <Item label="Staff" value={item.staff} />
              <Item label="Tgl Daftar" value={dateLabel(item.tgl_daftar)} />
              <Item label="No. Paspor" value={item.no_paspor} />
            </div>
            {(wa || item.bpih_url) && (
              <div className="flex gap-2">
                {wa && (
                  <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"
                    className="flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-2 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
                    <MessageCircle size={14} /> WhatsApp
                  </a>
                )}
                {item.bpih_url && (
                  <button type="button" onClick={() => openDocument(item.bpih_url!, 'bpih')}
                    className="flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-50 px-2 py-2 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30">
                    <FileText size={14} /> Buka BPIH
                  </button>
                )}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-gray-50 p-3 dark:bg-slate-900/50">
              {([['Harga Paket', item.paket_harga], ['Terbayar', item.bayar], ['Sisa Bayar', item.sisa]] as const).map(([label, value]) => (
                <div key={label} className="min-w-0 space-y-1">
                  <p className="text-[10px] text-gray-500 dark:text-slate-400">{label}</p>
                  <p className="break-words text-[11px] font-semibold text-gray-700 dark:text-slate-200">{usd(value)}</p>
                </div>
              ))}
            </div>
            {item.surat_pernyataan_url && (
              <button type="button" onClick={() => openDocument(item.surat_pernyataan_url!, 'pernyataan')}
                className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-600 transition-colors hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:bg-violet-900/20 dark:text-violet-400 dark:hover:bg-violet-900/30">
                <FileText size={14} /> Surat Pernyataan
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { CreditCard, MessageCircle, X } from 'lucide-react';
import { normalizeWaNumber } from '@/utils/phone';
import PortalBackBar from '../components/PortalBackBar';
import JamaahPaymentCard from '../components/JamaahPaymentCard';
import type { PortalMeData } from '../hooks/usePortalMe';
import { addDays, formatLongDate } from '../utils/formatDate';
import { formatRupiah, formatRupiahFull } from '../utils/formatRupiah';

function paymentTotals(data: PortalMeData) {
  const totalBayar = data.jamaah.reduce((sum, item) => sum + Number(item.bayar || 0), 0);
  const totalSisa = data.jamaah.reduce((sum, item) => sum + Number(item.sisa || 0), 0);
  const totalHarga = totalBayar + totalSisa;
  const bayarPct = totalHarga > 0 ? Math.round((totalBayar / totalHarga) * 100) : 0;
  return { totalBayar, totalSisa, totalHarga, bayarPct };
}

function roomTypeFromPackage(paket?: string | null) {
  const lower = String(paket || '').toLowerCase();
  if (lower.includes('double')) return 'Double';
  if (lower.includes('triple')) return 'Triple';
  if (lower.includes('quad')) return 'Quad';
  return 'Tipe kamar sesuai paket';
}

export default function PembayaranPage({
  data,
  onBack,
}: {
  data: PortalMeData;
  onBack: () => void;
}) {
  const [showTransfer, setShowTransfer] = useState(false);
  const totals = paymentTotals(data);
  const roomType = roomTypeFromPackage(data.booking.paket);
  const initiator = data.jamaah.find((item) => item.is_initiator) || data.jamaah[0];
  const deadline = addDays(data.booking.tgl_berangkat, -30);
  const agentPhone = normalizeWaNumber(data.agent?.phone);
  const confirmationTemplate = useMemo(
    () => `Assalamualaikum ${data.agent?.name || 'Agent'},
Saya ${initiator?.nama || 'jamaah'}, dari booking ${data.booking.id_umroh}.
Saya mau konfirmasi pembayaran ke rekening:
[ ] Saya sudah transfer Rp ___ pada tanggal ___
[ ] Bukti transfer akan saya kirim setelah ini.

Mohon dicek ya. Terima kasih 🙏`,
    [data.agent?.name, data.booking.id_umroh, initiator?.nama]
  );
  const waLink = agentPhone ? `https://wa.me/${agentPhone}?text=${encodeURIComponent(confirmationTemplate)}` : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900 dark:from-slate-900 dark:to-slate-950 dark:text-white">
      <PortalBackBar title="Pembayaran" onBack={onBack} />
      <main className="mx-auto w-full max-w-lg space-y-5 px-4 pb-24 pt-5">
        <section
          className="rounded-2xl p-5 text-white shadow-sm"
          style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #312e81 100%)' }}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-100">Total Booking</p>
          <p className="mt-2 text-3xl font-bold tracking-tight">{formatRupiahFull(totals.totalHarga)}</p>
          <p className="mt-1 text-sm font-medium text-blue-100">
            {data.jamaah.length} jamaah · {roomType}
          </p>
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-blue-100">
              <span>Progress pembayaran</span>
              <span className="text-sm font-bold text-white">{totals.bayarPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-emerald-500" style={{ width: `${totals.bayarPct}%` }} />
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/20 pt-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200">Dibayar</p>
              <p className="mt-1 text-base font-bold text-emerald-200">{formatRupiah(totals.totalBayar)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200">Sisa</p>
              <p className="mt-1 text-base font-bold text-amber-200">{formatRupiah(totals.totalSisa)}</p>
            </div>
          </div>
        </section>

        <section className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50 p-4 dark:border-amber-800/40 dark:bg-amber-900/20">
          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40">
            <CreditCard className="h-5 w-5 text-amber-600 dark:text-amber-400" strokeWidth={2} />
          </div>
          <div>
            <p className="text-sm font-bold text-amber-800 dark:text-amber-200">Deadline pelunasan H-30</p>
            <p className="mt-1 text-xs leading-5 text-amber-700 dark:text-amber-300">
              Pelunasan disarankan sebelum {formatLongDate(deadline)} agar dokumen keberangkatan bisa final.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Per Jamaah</p>
          <div className="space-y-3">
            {data.jamaah.map((item) => (
              <JamaahPaymentCard key={item.id} jamaah={item} />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <button
            type="button"
            onClick={() => setShowTransfer(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3.5 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition active:scale-95"
          >
            <CreditCard className="h-5 w-5" strokeWidth={2} />
            Cara Transfer / Bayar
          </button>
          {waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-sm font-bold text-gray-700 transition active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <MessageCircle className="h-5 w-5" strokeWidth={2} />
              Konfirmasi Pembayaran ke {data.agent?.name || 'Agent'}
            </a>
          )}
        </section>
      </main>

      {showTransfer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 px-4 pb-5 sm:items-center sm:pb-0">
          <section className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-white">Cara Transfer / Bayar</p>
                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-slate-300">
                  Gunakan instruksi rekening resmi dari agent. Setelah transfer, kirim bukti lewat tombol konfirmasi WhatsApp.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTransfer(false)}
                aria-label="Tutup"
                className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-300"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
            <div className="mt-4 rounded-2xl bg-gray-50 p-4 dark:bg-slate-900">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">Kode Booking</p>
              <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{data.booking.id_umroh}</p>
              <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-slate-400">
                Cantumkan kode booking ini pada berita transfer atau pesan konfirmasi.
              </p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

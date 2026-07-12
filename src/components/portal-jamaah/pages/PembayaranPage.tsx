import { useEffect, useMemo, useState } from 'react';
import { CreditCard, MessageCircle, X } from 'lucide-react';
import { normalizeWaNumber } from '@/utils/phone';
import PortalBackBar from '../components/PortalBackBar';
import JamaahPaymentCard from '../components/JamaahPaymentCard';
import type { PortalMeData } from '../hooks/usePortalMe';
import { addDays, formatLongDate } from '../utils/formatDate';
import { formatRupiah, formatRupiahFull } from '../utils/formatRupiah';

function safeMoney(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function paymentTotals(data: PortalMeData) {
  const totalBayar = data.jamaah.reduce((sum, item) => sum + Math.max(0, safeMoney(item.bayar)), 0);
  const totalSisa = data.jamaah.reduce((sum, item) => sum + Math.max(0, safeMoney(item.sisa)), 0);
  const totalHarga = totalBayar + totalSisa;
  const rawPct = totalHarga > 0 ? Math.round((totalBayar / totalHarga) * 100) : 0;
  const bayarPct = Math.max(0, Math.min(100, rawPct));
  return { totalBayar, totalSisa, totalHarga, bayarPct };
}

function roomTypeFromPackage(paket?: string | null) {
  const lower = String(paket || '').toLowerCase();
  if (lower.includes('single')) return 'Single';
  if (lower.includes('double')) return 'Double';
  if (lower.includes('triple')) return 'Triple';
  if (lower.includes('quad') || lower.includes('quard')) return 'Quad';
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

  useEffect(() => {
    if (!showTransfer) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowTransfer(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [showTransfer]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900 dark:from-slate-900 dark:to-slate-950 dark:text-white">
      <PortalBackBar
        title="Pembayaran"
        onBack={onBack}
        icon={CreditCard}
        iconClassName="bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
      />
      <main className="mx-auto w-full max-w-lg space-y-4 px-4 pb-24 pt-4">
        <section
          className="overflow-hidden rounded-2xl p-4 text-white shadow-sm"
          style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #312e81 100%)' }}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-100">Total Booking</p>
          <p className="mt-2 break-words text-2xl font-bold tabular-nums tracking-tight [overflow-wrap:anywhere]">
            {formatRupiahFull(totals.totalHarga)}
          </p>
          <p className="mt-1 text-sm font-medium text-blue-100">
            {data.jamaah.length} jamaah · {roomType}
          </p>
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-blue-100">
              <span>Progress pembayaran</span>
              <span className="text-sm font-bold text-white">{totals.bayarPct}%</span>
            </div>
            <div
              role="progressbar"
              aria-label="Progress pembayaran booking"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={totals.bayarPct}
              className="h-2 overflow-hidden rounded-full bg-white/20"
            >
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-emerald-500" style={{ width: `${totals.bayarPct}%` }} />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/20 pt-3.5">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200">Dibayar</p>
              <p title={formatRupiahFull(totals.totalBayar)} className="mt-1 truncate text-base font-bold tabular-nums text-emerald-200">
                {formatRupiah(totals.totalBayar)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200">Sisa</p>
              <p title={formatRupiahFull(totals.totalSisa)} className="mt-1 truncate text-base font-bold tabular-nums text-amber-200">
                {formatRupiah(totals.totalSisa)}
              </p>
            </div>
          </div>
        </section>

        <section className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50 p-3.5 dark:border-amber-800/40 dark:bg-amber-900/20">
          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40">
            <CreditCard className="h-5 w-5 text-amber-600 dark:text-amber-400" strokeWidth={2} />
          </div>
          <div>
            <p className="text-sm font-bold text-amber-800 dark:text-amber-200">Deadline pelunasan H-30</p>
            <p className="mt-1 text-xs leading-5 text-amber-700 dark:text-amber-300">
              {deadline
                ? `Pelunasan disarankan sebelum ${formatLongDate(deadline)} agar dokumen keberangkatan bisa final.`
                : 'Tanggal batas pelunasan akan tampil setelah jadwal keberangkatan ditetapkan.'}
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Per Jamaah</p>
          {data.jamaah.length ? (
            <div className="space-y-3">
              {data.jamaah.map((item) => (
                <JamaahPaymentCard key={item.id} jamaah={item} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-100 bg-white p-4 text-sm text-gray-500 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              Data pembayaran jamaah belum tersedia.
            </div>
          )}
        </section>

        <section className="space-y-3">
          <button
            type="button"
            onClick={() => setShowTransfer(true)}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition-all duration-200 hover:bg-emerald-600 active:scale-95"
          >
            <CreditCard className="h-5 w-5" strokeWidth={2} />
            Cara Transfer / Bayar
          </button>
          {waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-center text-sm font-bold leading-5 text-gray-700 transition-colors hover:bg-gray-50 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <MessageCircle className="h-5 w-5 flex-none" strokeWidth={2} />
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                Konfirmasi Pembayaran ke {data.agent?.name || 'Agent'}
              </span>
            </a>
          )}
        </section>
      </main>

      {showTransfer && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/40 p-4 sm:items-center"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowTransfer(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="transfer-dialog-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl border border-gray-100 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-800"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p id="transfer-dialog-title" className="text-lg font-bold text-gray-900 dark:text-white">Cara Transfer / Bayar</p>
                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-slate-300">
                  {waLink
                    ? 'Gunakan instruksi rekening resmi dari agent. Setelah transfer, kirim bukti lewat tombol konfirmasi WhatsApp.'
                    : 'Minta instruksi rekening resmi langsung dari agent, lalu cantumkan kode booking saat mengirim bukti transfer.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTransfer(false)}
                aria-label="Tutup"
                className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 active:scale-95 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
            <div className="mt-4 rounded-2xl bg-gray-50 p-4 dark:bg-slate-900">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">Kode Booking</p>
              <p className="mt-1 break-words text-lg font-bold text-gray-900 [overflow-wrap:anywhere] dark:text-white">{data.booking.id_umroh}</p>
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

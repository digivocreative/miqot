import { useMemo, useState } from 'react';
import { CreditCard, MessageCircle, X } from 'lucide-react';
import { normalizeWaNumber } from '@/utils/phone';
import PortalTopBar from '../components/PortalTopBar';
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

export default function BayarTab({ data }: { data: PortalMeData }) {
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
    <div className="min-h-screen overflow-x-hidden bg-slate-50 font-sans text-slate-900">
      <PortalTopBar agent={data.agent} title="Bayar" />
      <main className="mx-auto w-full max-w-md space-y-5 px-4 pb-28 pt-5">
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Booking</p>
          <p className="mt-2 text-3xl font-bold tracking-normal text-slate-950">{formatRupiahFull(totals.totalHarga)}</p>
          <p className="mt-1 text-sm text-slate-500">
            {data.jamaah.length} jamaah · {roomType}
          </p>

          <div className="mt-5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Progress pembayaran</span>
              <span>{totals.bayarPct}%</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-emerald-700" style={{ width: `${totals.bayarPct}%` }} />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Dibayar</p>
              <p className="mt-1 text-sm font-bold text-emerald-700">{formatRupiah(totals.totalBayar)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Sisa</p>
              <p className="mt-1 text-sm font-bold text-amber-700">{formatRupiah(totals.totalSisa)}</p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-900">Deadline pelunasan H-30</p>
            <p className="mt-1 text-xs leading-5 text-amber-800">
              Pelunasan disarankan sebelum {formatLongDate(deadline)} agar dokumen keberangkatan bisa final.
            </p>
          </div>
        </section>

        <section>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Per Jamaah</p>
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
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white"
          >
            <CreditCard className="h-4 w-4" strokeWidth={2} />
            Cara Transfer / Bayar
          </button>
          {waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
            >
              <MessageCircle className="h-4 w-4" strokeWidth={2} />
              Konfirmasi Pembayaran ke {data.agent?.name || 'Agent'}
            </a>
          )}
        </section>
      </main>

      {showTransfer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/30 px-4 pb-5 sm:items-center sm:pb-0">
          <section className="w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold text-slate-950">Cara Transfer / Bayar</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Gunakan instruksi rekening resmi dari agent. Setelah transfer, kirim bukti lewat tombol konfirmasi WhatsApp.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTransfer(false)}
                className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-slate-100 text-slate-700"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
            <div className="mt-4 rounded-2xl bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Kode Booking</p>
              <p className="mt-1 text-lg font-bold text-slate-950">{data.booking.id_umroh}</p>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                Cantumkan kode booking ini pada berita transfer atau pesan konfirmasi.
              </p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { CreditCard, MessageCircle, X } from 'lucide-react';
import { normalizeWaNumber } from '@/utils/phone';
import PortalBackBar from '../components/PortalBackBar';
import JamaahPaymentCard from '../components/JamaahPaymentCard';
import type { PortalMeData } from '../hooks/usePortalMe';
import { addDays, formatLongDate } from '../utils/formatDate';
import { formatRupiah, formatRupiahFull } from '../utils/formatRupiah';
import { Button, Card, GradientText, InvertedPanel, PortalPageShell, SectionLabel } from '../ui';

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
    <PortalPageShell>
      <PortalBackBar
        title="Pembayaran"
        onBack={onBack}
        icon={CreditCard}
        iconClassName="bg-burgundy-700/8 text-burgundy-700"
      />
      <main className="mx-auto w-full max-w-lg space-y-4 px-4 pb-24 pt-4">
        <InvertedPanel className="overflow-hidden p-5" texture ring>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-gold">Total Booking</p>
          <p className="mt-2 break-words font-mono text-3xl font-medium tabular-nums leading-tight [overflow-wrap:anywhere]">
            <GradientText tone="gold">{formatRupiahFull(totals.totalHarga)}</GradientText>
          </p>
          <p className="mt-1 text-sm font-medium text-white/70">
            {data.jamaah.length} jamaah · {roomType}
          </p>
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.12em] text-white/60">
              <span>Progress pembayaran</span>
              <span className="text-sm font-bold tabular-nums text-white">{totals.bayarPct}%</span>
            </div>
            <div
              role="progressbar"
              aria-label="Progress pembayaran booking"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={totals.bayarPct}
              className="h-2 overflow-hidden rounded-full bg-white/15"
            >
              <div className="h-full rounded-full bg-gradient-gold" style={{ width: `${totals.bayarPct}%` }} />
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/15 pt-4">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/50">Dibayar</p>
              <p title={formatRupiahFull(totals.totalBayar)} className="mt-1 truncate font-mono text-base font-bold tabular-nums text-emerald-200">
                {formatRupiah(totals.totalBayar)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/50">Sisa</p>
              <p title={formatRupiahFull(totals.totalSisa)} className="mt-1 truncate font-mono text-base font-bold tabular-nums text-amber-200">
                {formatRupiah(totals.totalSisa)}
              </p>
            </div>
          </div>
        </InvertedPanel>

        <section className="flex items-start gap-3 rounded-lega border border-amber-500/20 bg-amber-500/10 p-3.5">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-amber-500/15 text-amber-700">
            <CreditCard className="h-5 w-5" strokeWidth={2} />
          </span>
          <div>
            <p className="text-sm font-bold text-amber-800">Deadline pelunasan H-30</p>
            <p className="mt-1 text-xs leading-5 text-amber-700">
              {deadline
                ? `Pelunasan disarankan sebelum ${formatLongDate(deadline)} agar dokumen keberangkatan bisa final.`
                : 'Tanggal batas pelunasan akan tampil setelah jadwal keberangkatan ditetapkan.'}
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <SectionLabel>Per Jamaah</SectionLabel>
          {data.jamaah.length ? (
            <div className="space-y-3">
              {data.jamaah.map((item) => (
                <JamaahPaymentCard key={item.id} jamaah={item} />
              ))}
            </div>
          ) : (
            <Card className="p-4 text-sm text-ink/60">
              Data pembayaran jamaah belum tersedia.
            </Card>
          )}
        </section>

        <section className="space-y-3">
          <Button type="button" variant="primary" size="lg" fullWidth onClick={() => setShowTransfer(true)}>
            <CreditCard className="h-5 w-5" strokeWidth={2} />
            Cara Transfer / Bayar
          </Button>
          {waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 py-3 text-center text-sm font-semibold leading-5 text-white shadow-sm transition-all duration-200 hover:brightness-105 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy-700 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
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
          className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-ink/50 p-4 sm:items-center"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowTransfer(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="transfer-dialog-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-lega border border-black/5 bg-white p-5 shadow-card"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p id="transfer-dialog-title" className="font-display text-lg text-ink">Cara Transfer / Bayar</p>
                <p className="mt-2 text-sm leading-6 text-ink/70">
                  {waLink
                    ? 'Gunakan instruksi rekening resmi dari agent. Setelah transfer, kirim bukti lewat tombol konfirmasi WhatsApp.'
                    : 'Minta instruksi rekening resmi langsung dari agent, lalu cantumkan kode booking saat mengirim bukti transfer.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTransfer(false)}
                aria-label="Tutup"
                className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-burgundy-700/8 text-burgundy-700 transition-colors hover:bg-burgundy-700/15 active:scale-95"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
            <div className="mt-4 rounded-2xl bg-burgundy-50 p-4">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ink/50">Kode Booking</p>
              <p className="mt-1 break-words font-mono text-lg font-bold tabular-nums text-ink [overflow-wrap:anywhere]">{data.booking.id_umroh}</p>
              <p className="mt-3 text-xs leading-5 text-ink/60">
                Cantumkan kode booking ini pada berita transfer atau pesan konfirmasi.
              </p>
            </div>
          </section>
        </div>
      )}
    </PortalPageShell>
  );
}

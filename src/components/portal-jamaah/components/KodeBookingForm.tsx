import { Loader2, Send } from 'lucide-react';
import { Button, Card, SectionLabel } from '../ui';

interface Props {
  kodeBooking: string;
  waNumber: string;
  submitting: boolean;
  error: string;
  onKodeBookingChange: (value: string) => void;
  onWaNumberChange: (value: string) => void;
  onSubmit: () => void;
}

export default function KodeBookingForm({
  kodeBooking,
  waNumber,
  submitting,
  error,
  onKodeBookingChange,
  onWaNumberChange,
  onSubmit,
}: Props) {
  return (
    <Card className="overflow-hidden p-5">
      <SectionLabel>Masuk dengan Kode Booking</SectionLabel>
      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.12em] text-ink/60">
            Kode Booking
          </span>
          <input
            type="text"
            value={kodeBooking}
            onChange={(e) => onKodeBookingChange(e.target.value.toUpperCase())}
            placeholder="Contoh: AIW0028902"
            autoComplete="off"
            spellCheck={false}
            className="h-12 w-full rounded-lega border border-black/10 bg-white px-4 font-mono text-sm uppercase tracking-wide tabular-nums text-ink outline-none transition-all placeholder:text-ink/30 focus:border-burgundy-700 focus:ring-2 focus:ring-burgundy-700 focus:ring-offset-2 focus:ring-offset-white"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.12em] text-ink/60">
            Nomor WhatsApp
          </span>
          <div className="flex h-12 overflow-hidden rounded-lega border border-black/10 bg-white transition-all focus-within:border-burgundy-700 focus-within:ring-2 focus-within:ring-burgundy-700 focus-within:ring-offset-2 focus-within:ring-offset-white">
            <div className="flex items-center border-r border-black/10 bg-burgundy-50 px-4 font-mono text-sm font-medium text-burgundy-700/80">
              +62
            </div>
            <input
              type="tel"
              inputMode="numeric"
              value={waNumber}
              onChange={(e) => onWaNumberChange(e.target.value.replace(/[^\d\s-]/g, ''))}
              placeholder="812 3456 7890"
              autoComplete="tel"
              className="min-w-0 flex-1 bg-transparent px-4 font-mono text-sm tabular-nums text-ink outline-none placeholder:text-ink/30"
            />
          </div>
        </label>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-600">
            {error}
          </p>
        )}

        <Button
          type="button"
          variant="primary"
          size="lg"
          fullWidth
          onClick={onSubmit}
          disabled={submitting}
        >
          {submitting ? <Loader2 size={16} strokeWidth={2} className="animate-spin" /> : <Send size={16} strokeWidth={2} />}
          {submitting ? 'Mengirim...' : 'Kirim Link Akses ke WA'}
        </Button>
        <p className="text-center text-xs leading-relaxed text-ink/50">
          Link akan dikirim ke WhatsApp Anda dalam beberapa detik
        </p>
      </div>
    </Card>
  );
}

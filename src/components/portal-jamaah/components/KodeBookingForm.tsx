import { Send } from 'lucide-react';

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
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Masuk dengan Kode Booking</p>
      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-700">Kode Booking</span>
          <input
            type="text"
            value={kodeBooking}
            onChange={(e) => onKodeBookingChange(e.target.value.toUpperCase())}
            placeholder="Contoh: AIW0028902"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold uppercase tracking-wide text-slate-900 outline-none transition focus:border-emerald-700 focus:ring-4 focus:ring-emerald-50"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-700">Nomor WhatsApp</span>
          <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white transition focus-within:border-emerald-700 focus-within:ring-4 focus-within:ring-emerald-50">
            <div className="flex items-center border-r border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-500">
              +62
            </div>
            <input
              type="tel"
              inputMode="numeric"
              value={waNumber}
              onChange={(e) => onWaNumberChange(e.target.value.replace(/[^\d\s-]/g, ''))}
              placeholder="812 3456 7890"
              className="min-w-0 flex-1 px-4 py-3 text-sm font-semibold text-slate-900 outline-none"
            />
          </div>
        </label>

        {error && (
          <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Send size={16} strokeWidth={2} />
          {submitting ? 'Mengirim...' : 'Kirim Link Akses ke WA'}
        </button>
        <p className="text-center text-xs leading-relaxed text-slate-500">
          Link akan dikirim ke WhatsApp Anda dalam beberapa detik
        </p>
      </div>
    </section>
  );
}

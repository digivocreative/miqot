import { Loader2, Send } from 'lucide-react';

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
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Masuk dengan Kode Booking</p>
      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300">
            Kode Booking
          </span>
          <input
            type="text"
            value={kodeBooking}
            onChange={(e) => onKodeBookingChange(e.target.value.toUpperCase())}
            placeholder="Contoh: AIW0028902"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold uppercase tracking-wide text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300">
            Nomor WhatsApp
          </span>
          <div className="flex overflow-hidden rounded-xl border border-gray-200 bg-white transition-all focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center border-r border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              +62
            </div>
            <input
              type="tel"
              inputMode="numeric"
              value={waNumber}
              onChange={(e) => onWaNumberChange(e.target.value.replace(/[^\d\s-]/g, ''))}
              placeholder="812 3456 7890"
              autoComplete="tel"
              className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm font-semibold text-gray-800 outline-none placeholder:text-gray-400 dark:text-white"
            />
          </div>
        </label>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-600 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition-all duration-200 hover:bg-emerald-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? <Loader2 size={16} strokeWidth={2} className="animate-spin" /> : <Send size={16} strokeWidth={2} />}
          {submitting ? 'Mengirim...' : 'Kirim Link Akses ke WA'}
        </button>
        <p className="text-center text-xs leading-relaxed text-gray-500 dark:text-slate-400">
          Link akan dikirim ke WhatsApp Anda dalam beberapa detik
        </p>
      </div>
    </section>
  );
}

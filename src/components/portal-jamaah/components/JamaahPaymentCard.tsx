import type { PortalJamaah } from '../hooks/usePortalMe';
import { formatRupiah, formatRupiahFull } from '../utils/formatRupiah';

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'J';
}

export default function JamaahPaymentCard({ jamaah }: { jamaah: PortalJamaah }) {
  const lunas = Number(jamaah.sisa || 0) <= 0;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">
          {initials(jamaah.nama)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{jamaah.nama}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Dibayar {formatRupiah(jamaah.bayar)} · Sisa {formatRupiah(jamaah.sisa)}
          </p>
        </div>
        <span
          className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            lunas ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          }`}
        >
          {lunas ? 'Lunas' : `${jamaah.bayar_pct}%`}
        </span>
      </div>
      {!lunas && (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Sisa pembayaran: <span className="font-semibold text-slate-900">{formatRupiahFull(jamaah.sisa)}</span>
        </p>
      )}
    </div>
  );
}

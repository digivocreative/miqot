import type { PortalJamaah } from '../../hooks/usePortalMe';

function firstName(name: string) {
  return name.split(/\s+/).filter(Boolean)[0] || name;
}

function isPassportWarning(expired?: string | null) {
  if (!expired) return false;
  const expiresAt = new Date(expired).getTime();
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt - Date.now() < 180 * 24 * 60 * 60 * 1000;
}

export default function JamaahSelector({
  jamaah,
  selectedId,
  onChange,
}: {
  jamaah: PortalJamaah[];
  selectedId?: number;
  onChange: (id: number) => void;
}) {
  if (jamaah.length <= 1) return null;

  return (
    <div className="space-y-2.5">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Pilih Jamaah</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {jamaah.map((item) => {
          const selected = item.id === selectedId;
          const hasWarning = isPassportWarning(item.paspor_expired);
          const background = item.jk === 'P' ? 'be185d' : '047857';

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className="flex w-16 flex-shrink-0 flex-col items-center gap-1.5"
            >
              <div className="relative">
                <img
                  src={`https://ui-avatars.com/api/?name=${encodeURIComponent(item.nama)}&background=${background}&color=fff`}
                  alt={item.nama}
                  className={`h-12 w-12 rounded-full ${selected ? 'ring-2 ring-emerald-600 ring-offset-2 ring-offset-gray-50 dark:ring-emerald-400 dark:ring-offset-slate-900' : 'opacity-60'}`}
                />
                {hasWarning && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-amber-500 dark:border-slate-900">
                    <span className="text-[8px] font-bold text-white">!</span>
                  </span>
                )}
              </div>
              <span className={`max-w-full truncate text-[10px] ${selected ? 'font-semibold text-emerald-700 dark:text-emerald-300' : 'font-medium text-slate-500 dark:text-slate-400'}`}>
                {firstName(item.nama)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

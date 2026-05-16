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
    <div className="px-5 pt-4">
      <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Pilih Jamaah</p>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-2">
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
                  className={`h-12 w-12 rounded-full ${selected ? 'ring-2 ring-emerald-600 ring-offset-2' : 'opacity-60'}`}
                />
                {hasWarning && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-amber-500">
                    <span className="text-[8px] font-bold text-white">!</span>
                  </span>
                )}
              </div>
              <span className={`max-w-full truncate text-[10px] ${selected ? 'font-semibold text-emerald-700' : 'font-medium text-slate-500'}`}>
                {firstName(item.nama)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

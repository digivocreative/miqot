import { Avatar, SectionLabel, cn } from '../../ui';
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
      <SectionLabel>Pilih Jamaah</SectionLabel>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {jamaah.map((item) => {
          const selected = item.id === selectedId;
          const hasWarning = isPassportWarning(item.paspor_expired);

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className="flex w-16 flex-shrink-0 flex-col items-center gap-1.5"
            >
              <div className="relative">
                <Avatar
                  name={item.nama}
                  size="lg"
                  className={selected ? 'ring-2 ring-burgundy-700 ring-offset-2 ring-offset-canvas' : 'opacity-60'}
                />
                {hasWarning && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-amber-500">
                    <span className="text-[8px] font-bold text-white">!</span>
                  </span>
                )}
              </div>
              <span className={cn('max-w-full truncate text-[10px]', selected ? 'font-semibold text-burgundy-800' : 'font-medium text-ink/60')}>
                {firstName(item.nama)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

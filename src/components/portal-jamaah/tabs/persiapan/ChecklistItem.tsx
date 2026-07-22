import { Check, ExternalLink, LockKeyhole } from 'lucide-react';
import { Card, StatusChip, cn } from '../../ui';
import type { PortalPersiapanItem, PersiapanKind } from '../../hooks/usePortalPersiapan';

const CROSS_LINK_LABELS: Record<string, string> = {
  bayar: 'Buka tab Pembayaran',
  perlengkapan: 'Cek sub-tab Perlengkapan',
  dokumen: 'Cek sub-tab Dokumen',
};

export default function ChecklistItem({
  item,
  kind,
  pending = false,
  onToggle,
  onCrossLink,
  descriptionItalic = false,
  comfortableTouchTarget = false,
}: {
  item: PortalPersiapanItem;
  kind: PersiapanKind;
  pending?: boolean;
  onToggle: (kind: PersiapanKind, itemId: string, checked: boolean) => void;
  onCrossLink?: (target: string) => void;
  descriptionItalic?: boolean;
  comfortableTouchTarget?: boolean;
}) {
  const disabled = Boolean(item.auto_synced);
  // "Done" keeps success-green; pending = warning-amber; empty = neutral.
  const checkboxClass = item.checked
    ? 'border-emerald-600 bg-emerald-600 text-white'
    : pending
      ? 'border-amber-400 bg-amber-100 text-amber-700 border-dashed'
      : 'border-ink/20 bg-white text-transparent';

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onToggle(kind, item.id, !item.checked)}
          className={cn(
            'doc-check mt-0.5 flex flex-none items-center justify-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-burgundy-700 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
            comfortableTouchTarget ? 'h-9 w-9' : 'h-[22px] w-[22px]',
            disabled ? 'cursor-not-allowed opacity-80' : 'cursor-pointer',
          )}
          title={disabled ? 'Otomatis dari data pembayaran/dokumen' : undefined}
          aria-label={disabled
            ? `${item.title} disinkronkan otomatis`
            : `${item.checked ? 'Batalkan tanda selesai untuk' : 'Tandai selesai'} ${item.title}`}
          aria-pressed={item.checked}
        >
          <span className={cn('flex h-[22px] w-[22px] items-center justify-center rounded-lg border-[1.5px]', checkboxClass)} aria-hidden="true">
            {item.checked && <Check className="h-3.5 w-3.5" strokeWidth={2.4} />}
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold leading-5 text-ink">{item.title}</p>
            {disabled && (
              <StatusChip status="neutral" className="flex-none">
                <LockKeyhole className="h-3 w-3" strokeWidth={2} />
                auto
              </StatusChip>
            )}
          </div>
          <p className={cn('mt-1 text-xs leading-5 text-ink/60', descriptionItalic && 'italic')}>
            {item.description}
          </p>
          {item.crossLink && onCrossLink && (
            <button
              type="button"
              onClick={() => onCrossLink(item.crossLink!)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-burgundy-700/8 px-3 py-2 text-[11px] font-semibold text-burgundy-800"
            >
              {CROSS_LINK_LABELS[item.crossLink] || 'Buka detail'}
              <ExternalLink className="h-3 w-3" strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

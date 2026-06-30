import { Check, ExternalLink, LockKeyhole } from 'lucide-react';
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
}: {
  item: PortalPersiapanItem;
  kind: PersiapanKind;
  pending?: boolean;
  onToggle: (kind: PersiapanKind, itemId: string, checked: boolean) => void;
  onCrossLink?: (target: string) => void;
  descriptionItalic?: boolean;
}) {
  const disabled = Boolean(item.auto_synced);
  const checkboxClass = item.checked
    ? 'border-emerald-700 bg-emerald-700 text-white dark:border-emerald-500 dark:bg-emerald-500'
    : pending
      ? 'border-amber-400 bg-amber-100 text-amber-700 border-dashed dark:bg-amber-900/30 dark:text-amber-300'
      : 'border-slate-300 bg-white text-transparent dark:border-slate-600 dark:bg-slate-900';

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-start gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onToggle(kind, item.id, !item.checked)}
          className={`doc-check mt-0.5 flex h-[22px] w-[22px] flex-none items-center justify-center rounded-lg border-[1.5px] ${checkboxClass} ${
            disabled ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
          }`}
          title={disabled ? 'Otomatis dari data pembayaran/dokumen' : undefined}
          aria-pressed={item.checked}
        >
          {item.checked && <Check className="h-3.5 w-3.5" strokeWidth={2.4} />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold leading-5 text-slate-950 dark:text-white">{item.title}</p>
            {disabled && (
              <span className="inline-flex flex-none items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                <LockKeyhole className="h-3 w-3" strokeWidth={2} />
                auto
              </span>
            )}
          </div>
          <p className={`mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400 ${descriptionItalic ? 'italic' : ''}`}>
            {item.description}
          </p>
          {item.crossLink && onCrossLink && (
            <button
              type="button"
              onClick={() => onCrossLink(item.crossLink!)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
            >
              {CROSS_LINK_LABELS[item.crossLink] || 'Buka detail'}
              <ExternalLink className="h-3 w-3" strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

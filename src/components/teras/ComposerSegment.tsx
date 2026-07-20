import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

/**
 * Satu segmen composer Teras (satu kiriman dalam sebuah utas).
 *
 * Komponen ini SENGAJA bodoh: tidak ada fetch, tidak ada AbortController,
 * tidak ada pembersihan object-URL. Semua itu tetap di TerasPage supaya
 * pembatalan unggah dan revoke blob: punya satu pemilik. Toolbar, petak media,
 * overlay sorotan mention, dan popover mention dirender induk lalu dititipkan
 * lewat props — ketiganya butuh state yang hanya ada di induk.
 */

export interface ComposerSegmentValue {
  key: string;
  id: string;
  body: string;
}

interface ComposerSegmentProps {
  index: number;
  total: number;
  value: ComposerSegmentValue;
  maxChars: number;
  /** Sedikit di atas maxChars supaya teks tempelan tidak dipangkas diam-diam. */
  hardCap: number;
  disabled: boolean;
  /**
   * Placeholder segmen pertama. Wajib tetap 'Apa yang ingin dibagikan?' —
   * tes browser mencarinya lewat konstanta COMPOSER_PLACEHOLDER di induk.
   */
  placeholder: string;
  autoFocus?: boolean;
  authorName: string;
  avatar: ReactNode;
  mediaCount: number;
  maxMedia: number;
  /** MentionHighlightLayer milik induk. */
  overlay: ReactNode;
  /** MentionAutocomplete milik induk (null saat popover tertutup). */
  popover: ReactNode;
  /** Tombol Foto/Video milik induk (butuh state unggah). */
  toolbar: ReactNode;
  hint?: ReactNode;
  mediaGrid: ReactNode;
  /** Quote & pratinjau tautan — hanya segmen pertama yang mengisinya. */
  footer?: ReactNode;
  onChange: (index: number, body: string, element: HTMLTextAreaElement) => void;
  onKeyDown: (index: number, event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onRemove: (index: number) => void;
  textareaRef: (element: HTMLTextAreaElement | null) => void;
}

export default function ComposerSegment({
  index,
  total,
  value,
  maxChars,
  hardCap,
  disabled,
  placeholder,
  autoFocus = false,
  authorName,
  avatar,
  mediaCount,
  maxMedia,
  overlay,
  popover,
  toolbar,
  hint,
  mediaGrid,
  footer,
  onChange,
  onKeyDown,
  onRemove,
  textareaRef,
}: ComposerSegmentProps) {
  const nodeRef = useRef<HTMLTextAreaElement | null>(null);
  const length = Array.from(value.body.trim()).length;
  const overLimit = length > maxChars;
  const isThread = total > 1;

  // Auto-grow: tiap segmen mengurus tingginya sendiri, jadi segmen kedua dan
  // seterusnya ikut tumbuh — bukan hanya segmen pertama seperti sebelumnya.
  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  }, [value.body]);

  return (
    <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-3">
      <div className="flex flex-col items-center">
        {avatar}
        <div aria-hidden="true" className="mt-2 min-h-12 w-px flex-1 bg-gray-200 dark:bg-slate-700" />
      </div>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[13px] font-bold text-gray-900 dark:text-white">{authorName}</p>
          {isThread && (
            <span className="shrink-0 text-[10px] font-semibold tabular-nums text-gray-500 dark:text-slate-400">
              {index + 1}/{total}
            </span>
          )}
          {mediaCount > 0 && (
            <span className="shrink-0 text-[10px] font-semibold tabular-nums text-gray-500 dark:text-slate-400">
              {mediaCount}/{maxMedia}
            </span>
          )}
          {isThread && index > 0 && (
            <button
              type="button"
              onClick={() => onRemove(index)}
              disabled={disabled}
              aria-label={`Hapus kiriman ke-${index + 1}`}
              title="Hapus kiriman dari utas"
              className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:opacity-40 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              <span aria-hidden="true" className="text-sm font-semibold">✕</span>
            </button>
          )}
        </div>

        <div className="relative mt-1.5">
          {overlay}
          <textarea
            ref={node => {
              nodeRef.current = node;
              textareaRef(node);
            }}
            autoFocus={autoFocus}
            aria-label={isThread ? `Isi kiriman ke-${index + 1}` : 'Isi kiriman'}
            value={value.body}
            onChange={event => onChange(index, event.target.value, event.target)}
            onKeyDown={event => onKeyDown(index, event)}
            disabled={disabled}
            maxLength={hardCap}
            placeholder={index === 0 ? placeholder : 'Tambahkan ke utas…'}
            className="relative min-h-[88px] w-full resize-none overflow-hidden bg-transparent p-0 text-[17px] leading-relaxed text-gray-900 outline-none placeholder:text-gray-500 disabled:opacity-60 dark:text-white dark:placeholder:text-slate-400"
          />
          {popover}
        </div>

        {overLimit && (
          <p className="mb-2 text-[10px] font-medium text-red-500 dark:text-red-400">
            Isi kiriman maksimal {maxChars} karakter
          </p>
        )}

        <div className="flex min-h-11 items-center gap-1">
          {toolbar}
          <span className="flex-1" />
          <span
            aria-live="polite"
            className={`text-[10px] font-semibold tabular-nums ${
              overLimit ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-slate-400'
            }`}
          >
            {length}/{maxChars}
          </span>
        </div>

        {hint}
        {mediaGrid}
        {footer}
      </div>
    </div>
  );
}

import type { RefObject } from 'react';
import { Bold, Code, Italic, List, ListOrdered, Quote, Strikethrough } from 'lucide-react';

interface FormatToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
}

const BTN_CLASS =
  'w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors active:scale-95';

/**
 * WhatsApp formatting toolbar for an admin textarea. Inline buttons wrap the
 * selection in *…* / _…_ / ~…~ / ```…```; line buttons prefix the selected
 * lines with "- " / "1. " / "> ". Same selection-restore pattern as
 * CaptionEditor's insertToken.
 */
export default function FormatToolbar({ textareaRef, value, onChange }: FormatToolbarProps) {
  const apply = (
    fn: (s: { value: string; start: number; end: number }) => { next: string; selStart: number; selEnd: number },
  ) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const { next, selStart, selEnd } = fn({ value, start, end });
    onChange(next);
    if (el) {
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(selStart, selEnd);
      });
    }
  };

  // Wrap the selection; empty selection puts the caret between the markers.
  const wrap = (marker: string) =>
    apply(({ value, start, end }) => {
      const sel = value.slice(start, end);
      const next = value.slice(0, start) + marker + sel + marker + value.slice(end);
      return { next, selStart: start + marker.length, selEnd: start + marker.length + sel.length };
    });

  // Prefix every non-empty line touched by the selection.
  const prefixLines = (prefix: (lineIdx: number) => string) =>
    apply(({ value, start, end }) => {
      const blockStart = value.lastIndexOf('\n', start - 1) + 1;
      const blockEndIdx = value.indexOf('\n', end);
      const blockEnd = blockEndIdx === -1 ? value.length : blockEndIdx;
      let n = 0;
      const prefixed = value
        .slice(blockStart, blockEnd)
        .split('\n')
        .map(line => (line.trim() ? prefix(n++) + line : line))
        .join('\n');
      const next = value.slice(0, blockStart) + prefixed + value.slice(blockEnd);
      return { next, selStart: blockStart, selEnd: blockStart + prefixed.length };
    });

  const buttons: { label: string; title: string; icon: typeof Bold; onClick: () => void }[] = [
    { label: 'Tebal', title: 'Tebal — *teks*', icon: Bold, onClick: () => wrap('*') },
    { label: 'Miring', title: 'Miring — _teks_', icon: Italic, onClick: () => wrap('_') },
    { label: 'Coret', title: 'Coret — ~teks~', icon: Strikethrough, onClick: () => wrap('~') },
    { label: 'Monospace', title: 'Monospace — ```teks```', icon: Code, onClick: () => wrap('```') },
    { label: 'Daftar', title: 'Daftar poin', icon: List, onClick: () => prefixLines(() => '- ') },
    { label: 'Daftar bernomor', title: 'Daftar bernomor', icon: ListOrdered, onClick: () => prefixLines(i => `${i + 1}. `) },
    { label: 'Kutipan', title: 'Kutipan', icon: Quote, onClick: () => prefixLines(() => '> ') },
  ];

  return (
    <div className="flex flex-wrap gap-1">
      {buttons.map(({ label, title, icon: Icon, onClick }) => (
        <button key={label} type="button" onClick={onClick} className={BTN_CLASS} aria-label={label} title={title}>
          <Icon size={13} />
        </button>
      ))}
    </div>
  );
}

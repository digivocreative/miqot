import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Optional content pinned to the bottom of the sheet (e.g. danger button). */
  footer?: ReactNode;
}

/**
 * Reusable bottom-sheet chrome: backdrop + slide-up panel with header bar.
 * All edit sheets and the add-tile picker use this.
 */
export default function SheetBase({ open, onClose, title, children, footer }: Props) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Next frame → slide in
      requestAnimationFrame(() => setVisible(true));
    } else if (mounted) {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 220);
      return () => clearTimeout(t);
    }
  }, [open, mounted]);

  // Lock body scroll while a sheet is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9000] flex items-end justify-center">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className={`relative w-full max-w-lg mx-auto bg-white dark:bg-slate-800 rounded-t-2xl shadow-2xl border-t border-gray-100 dark:border-slate-700 transition-transform duration-200 ease-out flex flex-col ${visible ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '90vh' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-slate-600" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-1 pb-3 border-b border-gray-100 dark:border-slate-700 shrink-0">
          <h2 className="text-base font-bold text-gray-800 dark:text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors active:scale-95"
            aria-label="Tutup"
          >
            <X size={16} />
          </button>
        </div>
        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-gray-100 dark:border-slate-700 px-5 py-3 bg-gray-50 dark:bg-slate-800/80 rounded-b-xl">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

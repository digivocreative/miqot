import { useEffect, useState } from 'react';
import { X, Sparkles } from 'lucide-react';

const STORAGE_KEY = 'bio-editor-hint-dismissed-v1';

/**
 * One-time onboarding hint shown above the tile list.
 * Dismissed state persists in localStorage so it doesn't reappear after edits.
 */
export default function HintBanner() {
  const [mounted, setMounted] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) !== '1'; } catch { return true; }
  });
  const [visible, setVisible] = useState(false);

  // Fade in on first paint so the banner doesn't pop in jarringly on load.
  // Double rAF ensures the opacity-0 / max-h-0 state paints before the class
  // flip — otherwise both states collapse into one frame and the transition
  // never plays.
  useEffect(() => {
    if (!mounted) return;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setVisible(true));
    });
    return () => {
      cancelAnimationFrame(r1);
      if (r2) cancelAnimationFrame(r2);
    };
  }, [mounted]);

  if (!mounted) return null;

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
    setVisible(false);
    // Wait out the fade-out before unmounting so the height collapse and
    // opacity transition both complete smoothly.
    setTimeout(() => setMounted(false), 220);
  };

  return (
    <div
      className={`overflow-hidden transition-all duration-200 ease-out ${
        visible ? 'opacity-100 max-h-40 scale-100' : 'opacity-0 max-h-0 scale-[0.98]'
      }`}
    >
      <div className="rounded-2xl border border-emerald-200/70 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-emerald-950/30 dark:via-slate-800 dark:to-slate-800 p-3 flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
          <Sparkles size={14} className="text-emerald-600 dark:text-emerald-400" strokeWidth={2.2} />
        </div>
        <div className="flex-1 min-w-0 text-[12px] leading-snug text-gray-700 dark:text-slate-200">
          <p className="font-semibold mb-0.5">Cara pakai bio editor:</p>
          <ul className="space-y-0.5 text-gray-600 dark:text-slate-300">
            <li>• Tap bagian untuk edit isinya</li>
            <li>• Tahan ⋮⋮ lalu geser untuk ubah urutan</li>
            <li>• Tap 👁 untuk sembunyikan tanpa menghapus</li>
          </ul>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          aria-label="Tutup tips"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

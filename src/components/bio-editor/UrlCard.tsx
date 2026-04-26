import { useState } from 'react';
import { Copy, Check, Link } from 'lucide-react';

interface Props {
  /** Uppercase label rendered above the URL (e.g. "LINK BIO PUBLIK") */
  label: string;
  /** Full URL with scheme — written to clipboard when "Salin" is tapped */
  url: string;
  /** Optional aria-label override for the copy button */
  copyAriaLabel?: string;
}

/**
 * Reusable card showing a public URL with a one-tap "Salin" button.
 * Used by all three Landing Page tabs (Umroh, Haji, Bio) to keep the
 * URL display consistent.
 */
export default function UrlCard({ label, url, copyAriaLabel }: Props) {
  const [copied, setCopied] = useState(false);
  const displayUrl = url.replace(/^https?:\/\//, '');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Best-effort — clipboard can be denied in some environments.
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center shrink-0">
          <Link size={14} className="text-emerald-600 dark:text-emerald-400" strokeWidth={2.2} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-gray-500 dark:text-slate-400 uppercase tracking-wider font-semibold">{label}</p>
          <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">{displayUrl}</p>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 ${
            copied
              ? 'bg-emerald-500 text-white'
              : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/30'
          }`}
          aria-label={copyAriaLabel || 'Salin link'}
        >
          {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2.5} />}
          {copied ? 'Tersalin' : 'Salin'}
        </button>
      </div>
    </div>
  );
}

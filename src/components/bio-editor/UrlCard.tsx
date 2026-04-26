import { useState } from 'react';
import { Copy, Check, Link } from 'lucide-react';
import { buildBioLink, copyBioLink } from './useBioConfig';

interface Props {
  slug: string;
}

export default function UrlCard({ slug }: Props) {
  const [copied, setCopied] = useState(false);
  const url = buildBioLink(slug);
  const displayUrl = url.replace(/^https?:\/\//, '');

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center shrink-0">
          <Link size={14} className="text-emerald-600 dark:text-emerald-400" strokeWidth={2.2} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-gray-500 dark:text-slate-400 uppercase tracking-wider font-semibold">LINK BIO PUBLIK</p>
          <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">{displayUrl}</p>
        </div>
        <button
          type="button"
          onClick={async () => {
            const ok = await copyBioLink(slug);
            if (ok) {
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }
          }}
          className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 ${
            copied
              ? 'bg-emerald-500 text-white'
              : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/30'
          }`}
          aria-label="Salin link bio"
        >
          {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2.5} />}
          {copied ? 'Tersalin' : 'Salin'}
        </button>
      </div>
    </div>
  );
}

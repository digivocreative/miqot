import { Eye, EyeOff, Search, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { BioConfig } from '../bio/types';
import { validateBioTile } from './bioEditorValidation';

interface Props {
  config: BioConfig;
  agentPhone?: string;
  onToggleEnabled: () => void;
  onOpenSeo: () => void;
  onShowHidden: () => void;
}

export default function PublicStatusCard({ config, agentPhone, onToggleEnabled, onOpenSeo, onShowHidden }: Props) {
  const validations = config.tiles.map(tile => ({ tile, validation: validateBioTile(tile, agentPhone) }));
  const visibleReady = validations.filter(({ tile, validation }) => tile.visible && validation.complete).length;
  const hidden = config.tiles.filter(tile => !tile.visible).length;
  const issueCount = validations.filter(({ validation }) => !validation.complete).length;
  const hasSeo = !!(config.seo?.title || config.seo?.description || config.seo?.og_image_url);
  const waMissing = validations.some(({ tile, validation }) => tile.type === 'wa' && tile.visible && !validation.complete);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
          config.enabled
            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
            : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-300'
        }`}>
          {config.enabled ? <Eye size={17} strokeWidth={2.3} /> : <EyeOff size={17} strokeWidth={2.3} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-800 dark:text-white">
            Bio {config.enabled ? 'aktif' : 'nonaktif'}
          </p>
          <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">
            {visibleReady} tile tampil · {hidden} tersembunyi · {issueCount} perlu dilengkapi
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleEnabled}
          className={`relative w-12 h-7 rounded-full transition-colors active:scale-95 ${
            config.enabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-slate-600'
          }`}
          aria-label={config.enabled ? 'Nonaktifkan bio' : 'Aktifkan bio'}
        >
          <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
            config.enabled ? 'translate-x-5' : 'translate-x-1'
          }`} />
        </button>
      </div>

      {(waMissing || issueCount > 0) && (
        <div className="mt-3 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 p-2.5 flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-snug text-amber-800 dark:text-amber-200">
            {waMissing ? 'Nomor HP belum diisi, jadi tile WhatsApp tidak tampil publik.' : 'Ada tile yang belum lengkap. Lengkapi dulu sebelum ditampilkan.'}
          </p>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onOpenSeo}
          className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 text-xs font-semibold hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors active:scale-95"
        >
          <Search size={13} strokeWidth={2.4} />
          SEO {hasSeo ? 'Siap' : 'Default'}
        </button>
        <button
          type="button"
          onClick={onShowHidden}
          disabled={hidden === 0}
          className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 text-xs font-semibold hover:bg-gray-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:hover:bg-gray-100 dark:disabled:hover:bg-slate-700 transition-colors active:scale-95"
        >
          <CheckCircle2 size={13} strokeWidth={2.4} />
          Tampilkan Draft
        </button>
      </div>
    </div>
  );
}

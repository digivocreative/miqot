import { useState } from 'react';
import { X, Plus, Save } from 'lucide-react';
import SheetBase from './SheetBase';
import type { BioConfig } from '../../bio/types';

interface Props {
  open: boolean;
  onClose: () => void;
  config: BioConfig;
  onUpdate: (updater: (prev: BioConfig) => BioConfig) => void;
  onSave: () => void | Promise<void>;
}

export default function SheetHero({ open, onClose, config, onUpdate, onSave }: Props) {
  const { hero } = config;
  const [newBadge, setNewBadge] = useState('');

  const updateHero = (patch: Partial<BioConfig['hero']>) => {
    onUpdate(prev => ({ ...prev, hero: { ...prev.hero, ...patch } }));
  };

  const updateSocials = (patch: Partial<BioConfig['hero']['socials']>) => {
    onUpdate(prev => ({
      ...prev,
      hero: { ...prev.hero, socials: { ...prev.hero.socials, ...patch } },
    }));
  };

  const addBadge = () => {
    const trimmed = newBadge.trim();
    if (!trimmed) return;
    if (hero.badges.length >= 3) return;
    updateHero({ badges: [...hero.badges, trimmed.slice(0, 40)] });
    setNewBadge('');
  };

  const removeBadge = (i: number) => {
    updateHero({ badges: hero.badges.filter((_, idx) => idx !== i) });
  };

  const footer = (
    <button
      type="button"
      onClick={() => { void onSave(); }}
      className="w-full py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
    >
      <Save size={15} strokeWidth={2.4} /> Simpan
    </button>
  );

  return (
    <SheetBase open={open} onClose={onClose} title="Edit Hero" footer={footer}>
      <div className="space-y-4">
        <section>
          <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Tagline</label>
          <textarea
            value={hero.tagline ?? ''}
            onChange={(e) => updateHero({ tagline: e.target.value || null })}
            placeholder="Konsultan Umroh & Haji Plus · Mitra Resmi Alhijaz"
            maxLength={120}
            rows={2}
            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 resize-none"
          />
          <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">
            {(hero.tagline ?? '').length}/120 · Kosongkan untuk pakai default
          </p>
        </section>

        <section>
          <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
            Badges <span className="text-gray-400 dark:text-slate-500">(maks. 3)</span>
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {hero.badges.map((b, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-800/50 px-2 py-1 rounded-full"
              >
                {b}
                <button
                  type="button"
                  onClick={() => removeBadge(i)}
                  className="opacity-60 hover:opacity-100"
                  aria-label="Hapus badge"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          {hero.badges.length < 3 && (
            <div className="flex gap-2">
              <input
                type="text"
                value={newBadge}
                onChange={(e) => setNewBadge(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addBadge(); } }}
                placeholder="Contoh: 📍 Jakarta"
                maxLength={40}
                className="flex-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={addBadge}
                disabled={!newBadge.trim()}
                className="px-3 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50 hover:bg-emerald-600 active:scale-95 transition-all"
              >
                <Plus size={14} />
              </button>
            </div>
          )}
        </section>

        <section>
          <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Sosial Media</label>
          <div className="space-y-2">
            {([
              ['instagram', 'Instagram', '@handle'],
              ['tiktok', 'TikTok', '@handle'],
              ['youtube', 'YouTube', '@channel'],
            ] as const).map(([key, label, placeholder]) => (
              <div key={key}>
                <label className="block text-[11px] text-gray-500 dark:text-slate-400 mb-0.5">{label}</label>
                <input
                  type="text"
                  value={hero.socials[key] ?? ''}
                  onChange={(e) => updateSocials({ [key]: e.target.value.trim() || null } as any)}
                  placeholder={placeholder}
                  maxLength={60}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1.5">Cukup isi handle (tanpa @). Kosong = tidak tampil.</p>
        </section>
      </div>
    </SheetBase>
  );
}

import { useEffect, useRef, useState } from 'react';
import { X, ChevronDown, Pencil, Save, Wand2, Loader2 } from 'lucide-react';
import SheetBase from './SheetBase';
import type { BioConfig } from '../../bio/types';
import { getAuthHeaders } from '../../LoginPage';

const BADGE_PRESETS: string[] = [
  '⭐ Partner Resmi Alhijaz',
  '✅ Izin Resmi Kemenag',
  '🕋 Spesialis Umroh',
  '🌙 Spesialis Haji Plus',
  '🏆 Konsultan Terpercaya',
  '💯 25+ Tahun Pengalaman',
  '🤝 Konsultan Pribadi',
  '📞 Respon Cepat 24/7',
  '💎 Umroh Bintang 5',
  '🎓 Tour Leader BNSP',
  '✈️ Pasti Berangkat',
  '📋 Visa Resmi',
  '🏨 Hotel Pelataran',
  '💰 Cicilan 0%',
  '📍 Jakarta Timur',
];

interface Props {
  open: boolean;
  onClose: () => void;
  slug: string;
  config: BioConfig;
  onUpdate: (updater: (prev: BioConfig) => BioConfig) => void;
  onSave: () => void | Promise<void>;
}

export default function SheetHero({ open, onClose, slug, config, onUpdate, onSave }: Props) {
  const { hero } = config;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [genCount, setGenCount] = useState(0);
  const pickerRef = useRef<HTMLDivElement>(null);

  const TAGLINE_DAILY_MAX = 5;
  const TAGLINE_COUNTER_KEY = 'bio-tagline-gen-counter-v1';
  const todayKey = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Hydrate today's counter from localStorage (resets when the date rolls over).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TAGLINE_COUNTER_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { date: string; count: number };
      if (parsed?.date === todayKey() && typeof parsed.count === 'number') {
        setGenCount(parsed.count);
      }
    } catch { /* ignore */ }
  }, []);

  const bumpCounter = () => {
    setGenCount(prev => {
      const next = prev + 1;
      try {
        localStorage.setItem(TAGLINE_COUNTER_KEY, JSON.stringify({ date: todayKey(), count: next }));
      } catch { /* ignore */ }
      return next;
    });
  };

  const limitReached = genCount >= TAGLINE_DAILY_MAX;

  // Close the dropdown when the user taps anywhere outside it. Doesn't apply
  // to custom-input mode — that has its own explicit Batal button.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDocPointer = (e: PointerEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDocPointer);
    return () => document.removeEventListener('pointerdown', onDocPointer);
  }, [pickerOpen]);

  const updateHero = (patch: Partial<BioConfig['hero']>) => {
    onUpdate(prev => ({ ...prev, hero: { ...prev.hero, ...patch } }));
  };

  const updateSocials = (patch: Partial<BioConfig['hero']['socials']>) => {
    onUpdate(prev => ({
      ...prev,
      hero: { ...prev.hero, socials: { ...prev.hero.socials, ...patch } },
    }));
  };

  const addBadge = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    if (hero.badges.length >= 3) return;
    if (hero.badges.includes(trimmed)) return;
    updateHero({ badges: [...hero.badges, trimmed.slice(0, 40)] });
  };

  const submitCustom = () => {
    addBadge(customText);
    setCustomText('');
    setCustomMode(false);
    setPickerOpen(false);
  };

  const cancelCustom = () => {
    setCustomText('');
    setCustomMode(false);
  };

  const removeBadge = (i: number) => {
    updateHero({ badges: hero.badges.filter((_, idx) => idx !== i) });
  };

  const generateTagline = async () => {
    if (generating) return;
    if (limitReached) {
      alert('Melebihi batas harian. Coba lagi nanti.');
      return;
    }
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch(`/api/bio/${encodeURIComponent(slug)}/tagline-generate`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = await res.json();
      if (!res.ok || !j.success || !j.tagline) {
        throw new Error(j?.error || 'Gagal generate tagline');
      }
      updateHero({ tagline: String(j.tagline).slice(0, 120) });
      bumpCounter();
    } catch (e: any) {
      setGenerateError(e?.message || 'Gagal generate tagline');
    } finally {
      setGenerating(false);
    }
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
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300">Tagline</label>
            <button
              type="button"
              onClick={generateTagline}
              disabled={generating}
              aria-disabled={limitReached}
              className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md transition-colors ${
                limitReached
                  ? 'text-gray-400 dark:text-slate-500 cursor-not-allowed'
                  : 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
              } disabled:opacity-60 disabled:cursor-not-allowed`}
              title={limitReached
                ? 'Melebihi batas harian. Coba lagi nanti.'
                : `Generate tagline otomatis dengan AI (sisa ${TAGLINE_DAILY_MAX - genCount}x hari ini)`}
            >
              {generating
                ? <Loader2 size={10} strokeWidth={2.5} className="animate-spin" />
                : <Wand2 size={10} strokeWidth={2.5} />}
              {generating ? 'Memproses…' : 'Auto'}
            </button>
          </div>
          <textarea
            value={hero.tagline ?? ''}
            onChange={(e) => updateHero({ tagline: e.target.value || null })}
            placeholder="Bersama Alhijaz, nikmati perjalanan suci yang penuh berkah · Konsultasi mudah dan nyaman untuk Umroh & Haji Anda ✨"
            maxLength={120}
            rows={4}
            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 resize-none"
          />
          <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">
            {(hero.tagline ?? '').length}/120 · Kosongkan untuk pakai default
          </p>
          {generateError && (
            <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">{generateError}</p>
          )}
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
          {hero.badges.length < 3 && !customMode && (
            <div ref={pickerRef} className="relative">
              <button
                type="button"
                onClick={() => setPickerOpen(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700/50 active:scale-[0.99] transition-all"
              >
                <span className="text-gray-500 dark:text-slate-400">+ Pilih badge</span>
                <ChevronDown
                  size={14}
                  className={`text-gray-400 dark:text-slate-500 transition-transform ${pickerOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {pickerOpen && (
                <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                  {BADGE_PRESETS.map((preset) => {
                    const used = hero.badges.includes(preset);
                    return (
                      <button
                        key={preset}
                        type="button"
                        disabled={used}
                        onClick={() => {
                          if (used) return;
                          addBadge(preset);
                          setPickerOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 dark:border-slate-700/60 last:border-b-0 transition-colors ${
                          used
                            ? 'text-gray-400 dark:text-slate-500 bg-gray-50 dark:bg-slate-900/40 cursor-not-allowed'
                            : 'text-gray-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span>{preset}</span>
                          {used && (
                            <span className="text-[9px] font-bold tracking-wider text-gray-400 dark:text-slate-500">
                              DIPAKAI
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setCustomMode(true);
                      setPickerOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50/70 dark:bg-emerald-900/15 hover:bg-emerald-100 dark:hover:bg-emerald-900/25 transition-colors flex items-center gap-1.5"
                  >
                    <Pencil size={12} strokeWidth={2.5} /> Custom…
                  </button>
                </div>
              )}
            </div>
          )}
          {hero.badges.length < 3 && customMode && (
            <div className="flex gap-2">
              <input
                type="text"
                autoFocus
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); submitCustom(); }
                  if (e.key === 'Escape') { e.preventDefault(); cancelCustom(); }
                }}
                placeholder="Contoh: 📍 Jakarta"
                maxLength={40}
                className="flex-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={submitCustom}
                disabled={!customText.trim()}
                className="px-3 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50 hover:bg-emerald-600 active:scale-95 transition-all"
              >
                Tambah
              </button>
              <button
                type="button"
                onClick={cancelCustom}
                className="px-3 py-2 rounded-xl text-sm font-semibold text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 active:scale-95 transition-all"
                aria-label="Batal"
              >
                Batal
              </button>
            </div>
          )}
        </section>

        <section>
          <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Sosial Media</label>
          <div className="space-y-2">
            {([
              ['instagram', 'Instagram', 'alhijazwowkeren'],
              ['tiktok', 'TikTok', 'alhijazwowkeren'],
              ['youtube', 'YouTube', 'alhijazwowkeren'],
            ] as const).map(([key, label, placeholder]) => (
              <div key={key}>
                <label className="block text-[11px] text-gray-500 dark:text-slate-400 mb-0.5">{label}</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-slate-400 select-none">
                    @
                  </span>
                  <input
                    type="text"
                    value={hero.socials[key] ?? ''}
                    onChange={(e) => {
                      // Strip any leading @ the user might paste — the prefix
                      // is rendered as a non-editable adornment, so we never
                      // store it in the value.
                      const cleaned = e.target.value.replace(/^@+/, '').trim();
                      updateSocials({ [key]: cleaned || null } as any);
                    }}
                    placeholder={placeholder}
                    maxLength={60}
                    className="w-full pl-7 pr-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                  />
                </div>
                <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">
                  {(hero.socials[key] ?? '').length}/60
                </p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1.5">Cukup isi handle. Kosong = tidak tampil.</p>
        </section>
      </div>
    </SheetBase>
  );
}

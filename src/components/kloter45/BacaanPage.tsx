import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { ChevronDown, Search, Star } from 'lucide-react';
import Kloter45SubPageShell from '@/components/kloter45/SubPageShell';
import type { DoaEntry } from '@/components/portal-jamaah/lib/doaData';
import type { BacaanTab } from '@/lib/kloter45Bacaan';

type IconComponent = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

function matchesQuery(entry: DoaEntry, query: string) {
  return entry.title.toLowerCase().includes(query)
    || entry.terjemahan.toLowerCase().includes(query)
    || entry.latin.toLowerCase().includes(query);
}

/** Durasi buka/tutup panel (duration-300) + margin sampai tinggi panel diam. */
const ANCHOR_WINDOW_MS = 450;

/**
 * Pindah dari bacaan A ke B: panel A menutup, jadi kalau A ada di ATAS B, baris
 * B ikut naik setinggi panel A — bisa sampai lewat dari layar. iOS Safari belum
 * punya scroll anchoring, jadi posisinya ditahan manual: selama panel A mengecil,
 * geser scroll sebesar pergeseran tombol B (pola anchorCardDuringToggle di App.tsx).
 */
function holdRowDuringSwitch(closingPanel: Element, openingRow: Element) {
  const anchorTop = openingRow.getBoundingClientRect().top;
  const observer = new ResizeObserver(() => {
    // Baris lepas dari DOM (ganti tab / tersaring pencarian) → rect-nya nol,
    // "koreksi"-nya justru melempar halaman.
    if (!openingRow.isConnected) {
      observer.disconnect();
      return;
    }
    const delta = openingRow.getBoundingClientRect().top - anchorTop;
    if (delta !== 0) window.scrollBy(0, delta);
  });
  observer.observe(closingPanel);
  const timer = setTimeout(() => observer.disconnect(), ANCHOR_WINDOW_MS);
  return () => {
    clearTimeout(timer);
    observer.disconnect();
  };
}

// Halaman Doa dan Dzikir memakai kerangka yang sama: baris tab di atas, lalu
// satu daftar rata — tiap bacaan satu baris yang bisa dibuka. Yang beda cuma
// judul, ikon, dan tab-nya.
export default function Kloter45BacaanPage({
  pageId,
  title,
  icon,
  tabs,
  onBack,
}: {
  pageId: 'doa' | 'dzikir';
  title: string;
  icon: IconComponent;
  tabs: BacaanTab[];
  onBack: () => void;
}) {
  const [activeTabId, setActiveTabId] = useState(tabs[0]?.id ?? '');
  const [query, setQuery] = useState('');
  // Satu bacaan terbuka paling banyak: membuka B otomatis menutup A.
  const [openId, setOpenId] = useState<string | null>(null);
  const listRef = useRef<HTMLElement>(null);
  const releaseAnchorRef = useRef<(() => void) | null>(null);
  useEffect(() => () => releaseAnchorRef.current?.(), []);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const entries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!activeTab) return [];
    return normalized ? activeTab.entries.filter((entry) => matchesQuery(entry, normalized)) : activeTab.entries;
  }, [activeTab, query]);

  const toggle = (id: string) => {
    releaseAnchorRef.current?.();
    releaseAnchorRef.current = null;
    const list = listRef.current;
    if (list && openId !== null && openId !== id) {
      const closingPanel = list.querySelector(`[data-bacaan-entry="${openId}"] [data-bacaan-panel]`);
      const openingRow = list.querySelector(`[data-bacaan-entry="${id}"]`);
      if (closingPanel && openingRow) releaseAnchorRef.current = holdRowDuringSwitch(closingPanel, openingRow);
    }
    setOpenId(openId === id ? null : id);
  };

  return (
    <Kloter45SubPageShell title={title} icon={icon} onBack={onBack}>
      <div data-bacaan-page={pageId} className="space-y-3">
        <div
          role="tablist"
          aria-label={`Kelompok ${title.toLowerCase()}`}
          data-bacaan-tabs
          className="grid gap-1 rounded-2xl border border-gray-100 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        >
          {tabs.map((tab) => {
            const active = tab.id === activeTab?.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-bacaan-tab={tab.id}
                onClick={() => {
                  setActiveTabId(tab.id);
                  setOpenId(null);
                }}
                className={`min-h-10 rounded-xl px-2 py-2 text-xs font-bold transition-all active:scale-[0.98] ${
                  active
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                    : 'text-gray-600 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800/60'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <label className="flex h-10 items-center gap-2 rounded-2xl border border-gray-100 bg-white px-3 shadow-sm transition-all focus-within:ring-2 focus-within:ring-emerald-500/50 dark:border-slate-700 dark:bg-slate-800">
          <Search size={14} strokeWidth={2.4} className="flex-none text-gray-400 dark:text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Cari ${title.toLowerCase()} (judul atau terjemahan)`}
            aria-label={`Cari ${title.toLowerCase()}`}
            className="min-w-0 flex-1 bg-transparent text-xs font-medium text-gray-800 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-slate-500"
          />
        </label>

        {entries.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm font-bold text-gray-900 dark:text-slate-100">Tidak ditemukan</p>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-slate-400">Coba kata kunci lain.</p>
          </div>
        ) : (
          <section
            ref={listRef}
            data-bacaan-list={activeTab?.id}
            // Posisi saat pindah bacaan ditahan holdRowDuringSwitch; anchoring
            // bawaan Chrome dimatikan supaya tidak ikut mengoreksi dua kali.
            className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm [overflow-anchor:none] dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900"
          >
            {entries.map((entry) => {
              const open = openId === entry.id;
              const panelId = `${pageId}-${activeTab?.id}-${entry.id}`;
              return (
                <article key={entry.id} data-bacaan-entry={entry.id}>
                  <h2>
                    <button
                      type="button"
                      onClick={() => toggle(entry.id)}
                      aria-expanded={open}
                      aria-controls={panelId}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50 active:scale-[0.99] dark:hover:bg-slate-800/60"
                    >
                      <Star size={16} strokeWidth={2} className="flex-none fill-amber-400 text-amber-400" aria-hidden="true" />
                      <span className="min-w-0 flex-1 text-sm font-bold text-gray-900 dark:text-slate-100">{entry.title}</span>
                      {entry.ulang && (
                        <span
                          data-bacaan-ulang
                          className="flex-none rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                        >
                          {entry.ulang}
                        </span>
                      )}
                      <ChevronDown
                        size={16}
                        strokeWidth={2.4}
                        className={`flex-none text-gray-400 transition-transform duration-300 dark:text-slate-400 ${open ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </h2>

                  {/* Panel selalu terpasang supaya tutupnya juga beranimasi;
                      tinggi dianimasikan lewat grid-rows 0fr ↔ 1fr. */}
                  <div
                    id={panelId}
                    data-bacaan-panel
                    aria-hidden={!open}
                    // Tipe React 18 belum mengenal `inert`; lewat spread agar tsc diam.
                    {...(open ? {} : { inert: '' })}
                    className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out motion-reduce:transition-none ${
                      open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                    }`}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div className="border-t border-gray-100 bg-gray-50/60 px-4 pb-4 pt-3 dark:border-slate-800 dark:bg-slate-800/40">
                        <p className="font-arabic text-2xl leading-loose text-gray-900 dark:text-slate-100" dir="rtl" lang="ar">
                          {entry.arab}
                        </p>
                        <p className="mt-3 text-sm italic leading-6 text-emerald-700 dark:text-emerald-300">{entry.latin}</p>
                        <p className="mt-1.5 text-sm leading-6 text-gray-600 dark:text-slate-300">{entry.terjemahan}</p>
                        {entry.sumber && (
                          <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">{entry.sumber}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </Kloter45SubPageShell>
  );
}

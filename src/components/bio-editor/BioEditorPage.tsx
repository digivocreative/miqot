import { useMemo, useState } from 'react';
import { Plus, Loader2, Inbox } from 'lucide-react';
import type { BioAgentPublic, BioTile, BioTileType } from '../bio/types';
import { useBioConfig, bioEditorNewId } from './useBioConfig';
import EditorHeader from './EditorHeader';
import UrlCard from './UrlCard';
import ThemePicker from './ThemePicker';
import HeroCard from './HeroCard';
import TileList from './TileList';
import BottomBar from './BottomBar';
import SheetHero from './sheets/SheetHero';
import SheetEditTile from './sheets/SheetEditTile';
import SheetAddTile from './sheets/SheetAddTile';
import HintBanner from './HintBanner';

interface Props {
  agent: BioAgentPublic;
}

export default function BioEditorPage({ agent }: Props) {
  const bio = useBioConfig(agent.slug);
  const { config, loading, saveStatus, lastSaved, error, reload } = bio;

  const [heroOpen, setHeroOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editingTileId, setEditingTileId] = useState<string | null>(null);

  const editingTile = useMemo(() => {
    if (!config || !editingTileId) return null;
    return config.tiles.find(t => t.id === editingTileId) || null;
  }, [config, editingTileId]);

  const usedSingletonTypes = useMemo(() => {
    const set = new Set<BioTileType>();
    for (const t of (config?.tiles || [])) {
      if (t.type === 'umroh' || t.type === 'haji' || t.type === 'wa' || t.type === 'featured') {
        set.add(t.type);
      }
    }
    return set;
  }, [config]);

  const handleAddTile = (type: BioTileType) => {
    const id = bioEditorNewId();
    bio.addTile({ id, type, visible: true, config: {} });
    setAddOpen(false);
    // Open edit sheet for the new tile — OOBE flow
    setTimeout(() => setEditingTileId(id), 100);
  };

  // Save status renders inline in the URL card (no longer floating)
  const saveIndicator = <EditorHeader saveStatus={saveStatus} lastSaved={lastSaved} />;

  if (loading) {
    return (
      <div className="px-4 py-6 flex flex-col items-center gap-3">
        <Loader2 size={22} className="animate-spin text-emerald-500" />
        <p className="text-sm text-gray-500 dark:text-slate-400">Memuat editor…</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="px-4 py-10 flex flex-col items-center gap-4 text-center">
        <p className="text-sm font-semibold text-gray-800 dark:text-white">Gagal memuat editor</p>
        <p className="text-xs text-gray-500 dark:text-slate-400">{error || 'Tidak bisa mengambil data dari server.'}</p>
        <button
          type="button"
          onClick={reload}
          className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 active:scale-95 transition-all"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  const tiles = config.tiles;
  const hasTiles = tiles.length > 0;
  const allHidden = hasTiles && tiles.every(t => !t.visible);

  return (
    <div className="pb-24">
      <div className="px-4 pt-4 pb-4 flex flex-col gap-3">
        <UrlCard slug={agent.slug} status={saveIndicator} />
        <HintBanner />
        <ThemePicker value={config.theme} onChange={bio.setTheme} />
        <HeroCard agent={agent} hero={config.hero} onTap={() => setHeroOpen(true)} />

        <section>
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-[11px] text-gray-500 dark:text-slate-400 uppercase tracking-wider font-semibold">
              TILES
            </p>
            <span className="text-[11px] text-gray-400 dark:text-slate-500">
              {tiles.length} tile · tahan ⋮⋮ untuk mengurutkan
            </span>
          </div>

          {allHidden && (
            <div className="mb-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 p-2.5 text-[11px] text-amber-700 dark:text-amber-300">
              Semua tile sedang tersembunyi. Aktifkan minimal satu tile agar bio tidak terlihat kosong.
            </div>
          )}

          {hasTiles ? (
            <TileList
              tiles={tiles}
              agentPhone={agent.phone}
              onReorder={bio.reorderTiles}
              onTapTile={(t) => setEditingTileId(t.id)}
              onToggleVisible={(t) => bio.updateTile(t.id, { visible: !t.visible })}
            />
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-gray-200 dark:border-slate-700 px-4 py-8 flex flex-col items-center gap-2 text-center">
              <Inbox size={22} className="text-gray-400 dark:text-slate-500" />
              <p className="text-sm font-semibold text-gray-800 dark:text-white">Belum ada tile</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Tambahkan tile pertama untuk mulai isi bio Anda.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="mt-2 w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl border-2 border-dashed border-emerald-300 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 text-sm font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-900/20 active:scale-[0.99] transition-all"
          >
            <Plus size={14} strokeWidth={2.5} />
            Tambah Tile
          </button>
        </section>
      </div>

      <BottomBar slug={agent.slug} agentName={agent.name} />

      <SheetHero
        open={heroOpen}
        onClose={() => setHeroOpen(false)}
        config={config}
        onUpdate={bio.updateConfig}
      />
      <SheetEditTile
        open={!!editingTile}
        onClose={() => setEditingTileId(null)}
        tile={editingTile}
        agent={agent}
        waLinkPreview={config._wa_link_preview}
        onUpdateConfig={bio.updateTileConfig}
        onDelete={bio.deleteTile}
      />
      <SheetAddTile
        open={addOpen}
        onClose={() => setAddOpen(false)}
        usedSingletonTypes={usedSingletonTypes}
        onAdd={handleAddTile}
      />
    </div>
  );
}

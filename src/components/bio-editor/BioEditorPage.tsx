import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Plus, Loader2, Inbox } from 'lucide-react';
import type { BioAgentPublic, BioTile, BioTileType } from '../bio/types';
import { useBioConfig, bioEditorNewId } from './useBioConfig';
import { canShowBioTile, validateBioTile } from './bioEditorValidation';
import SaveToast from './SaveToast';
import UrlCard from './UrlCard';
import PublicStatusCard from './PublicStatusCard';
import ThemePicker from './ThemePicker';
import HeroCard from './HeroCard';
import TileList from './TileList';
import BottomBar from './BottomBar';
import SheetHero from './sheets/SheetHero';
import SheetEditTile from './sheets/SheetEditTile';
import SheetAddTile from './sheets/SheetAddTile';
import SheetSeo from './sheets/SheetSeo';
import SheetPreview from './sheets/SheetPreview';
import HintBanner from './HintBanner';

interface Props {
  agent: BioAgentPublic;
}

export default function BioEditorPage({ agent }: Props) {
  const bio = useBioConfig(agent.slug);
  const { config, loading, saveStatus, error, reload } = bio;

  const [heroOpen, setHeroOpen] = useState(false);
  const [seoOpen, setSeoOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editingTileId, setEditingTileId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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

  const showNotice = (message: string, type: 'success' | 'error') => {
    setNotice({ message, type });
    setTimeout(() => setNotice(null), 2200);
  };

  const handleAddTile = (type: BioTileType) => {
    const id = bioEditorNewId();
    const tileDraft: Omit<BioTile, 'order'> = { id, type, visible: false, config: {} };
    const visible = canShowBioTile({ ...tileDraft, order: 0 }, agent.phone);
    bio.addTile({ ...tileDraft, visible });
    setAddOpen(false);
    // Open edit sheet for the new tile — OOBE flow
    setTimeout(() => setEditingTileId(id), 100);
  };

  const handleToggleVisible = (tile: BioTile) => {
    if (tile.visible) {
      bio.updateTile(tile.id, { visible: false });
      return;
    }
    const validation = validateBioTile(tile, agent.phone);
    if (!validation.complete) {
      showNotice(validation.issues[0] || 'Lengkapi tile dulu', 'error');
      setEditingTileId(tile.id);
      return;
    }
    bio.updateTile(tile.id, { visible: true });
  };

  const updateTileConfigSafely = (id: string, patch: Record<string, unknown>) => {
    const current = config?.tiles.find(t => t.id === id);
    const nextCurrent = current ? { ...current, config: { ...current.config, ...patch } } : null;
    const shouldHide = !!(nextCurrent?.visible && !canShowBioTile(nextCurrent, agent.phone));
    bio.updateConfig(prev => ({
      ...prev,
      tiles: prev.tiles.map(t => {
        if (t.id !== id) return t;
        const next = { ...t, config: { ...t.config, ...patch } };
        return shouldHide ? { ...next, visible: false } : next;
      }),
    }));
    if (shouldHide) showNotice('Tile disembunyikan sampai lengkap', 'error');
  };

  const showCompleteHiddenTiles = () => {
    if (!config) return;
    const readyHidden = config.tiles.filter(t => !t.visible && canShowBioTile(t, agent.phone));
    if (readyHidden.length === 0) {
      showNotice('Tidak ada draft yang siap tampil', 'error');
      return;
    }
    bio.updateConfig(prev => ({
      ...prev,
      tiles: prev.tiles.map(t => readyHidden.some(r => r.id === t.id) ? { ...t, visible: true } : t),
    }));
    showNotice(`${readyHidden.length} draft ditampilkan`, 'success');
  };

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
        <UrlCard slug={agent.slug} />
        <PublicStatusCard
          config={config}
          agentPhone={agent.phone}
          onToggleEnabled={() => bio.updateConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
          onOpenSeo={() => setSeoOpen(true)}
          onShowHidden={showCompleteHiddenTiles}
        />
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
            <div className="mb-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 p-2.5 text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-2">
              <span className="flex-1">Semua tile sedang tersembunyi. Aktifkan minimal satu tile agar bio tidak terlihat kosong.</span>
              <button
                type="button"
                onClick={showCompleteHiddenTiles}
                className="shrink-0 px-2 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 font-semibold active:scale-95"
              >
                Tampilkan
              </button>
            </div>
          )}

          {hasTiles ? (
            <TileList
              tiles={tiles}
              agentPhone={agent.phone}
              onReorder={bio.reorderTiles}
              onTapTile={(t) => setEditingTileId(t.id)}
              onToggleVisible={handleToggleVisible}
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

      <BottomBar
        slug={agent.slug}
        agentName={agent.name}
        onPreview={() => setPreviewOpen(true)}
        onNotice={showNotice}
      />
      <SaveToast saveStatus={saveStatus} />
      {notice && <NoticeToast message={notice.message} type={notice.type} />}

      <SheetHero
        open={heroOpen}
        onClose={() => setHeroOpen(false)}
        config={config}
        onUpdate={bio.updateConfig}
      />
      <SheetSeo
        open={seoOpen}
        onClose={() => setSeoOpen(false)}
        slug={agent.slug}
        config={config}
        onUpdate={bio.updateConfig}
      />
      <SheetPreview
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        slug={agent.slug}
      />
      <SheetEditTile
        open={!!editingTile}
        onClose={() => setEditingTileId(null)}
        tile={editingTile}
        agent={agent}
        waLinkPreview={config._wa_link_preview}
        onUpdateConfig={updateTileConfigSafely}
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

function NoticeToast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-[8.5rem] z-40 px-3 py-1.5 rounded-full shadow-lg text-[11.5px] font-semibold flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 text-gray-800 dark:text-white">
      {type === 'success'
        ? <CheckCircle2 size={13} className="text-emerald-500" strokeWidth={2.5} />
        : <AlertCircle size={13} className="text-red-500" strokeWidth={2.5} />}
      {message}
    </div>
  );
}

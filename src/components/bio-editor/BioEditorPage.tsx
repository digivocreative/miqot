import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Plus, Inbox } from 'lucide-react';
import type { BioAgentPublic, BioTile, BioTileType } from '../bio/types';
import { useBioConfig, bioEditorNewId, buildBioLink } from './useBioConfig';
import { canShowBioTile, validateBioTile } from './bioEditorValidation';
import SaveToast from './SaveToast';
import UrlCard from './UrlCard';
import SeoCard from './SeoCard';
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
      if (t.type === 'umroh' || t.type === 'umroh_landing' || t.type === 'haji' || t.type === 'wa' || t.type === 'featured') {
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
    // Default new tiles to visible — agents expect a freshly-added section to
    // show up on their bio. The render-time `canShowBioTile` guard still hides
    // it publicly until required fields are filled, but the user's intent flag
    // stays "on" so once they complete the form it appears immediately.
    const tileDraft: Omit<BioTile, 'order'> = { id, type, visible: true, config: {} };
    bio.addTile(tileDraft);
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
      showNotice(validation.issues[0] || 'Lengkapi bagian dulu', 'error');
      setEditingTileId(tile.id);
      return;
    }
    bio.updateTile(tile.id, { visible: true });
  };

  // Save the patched config without ever flipping the user's `visible` flag.
  // The public bio's render-time guard already hides incomplete tiles, so we
  // don't need to fight the user's intent here — they explicitly asked for the
  // section to default visible, and forcing it off mid-edit is confusing.
  const updateTileConfigSafely = (id: string, patch: Record<string, unknown>) => {
    bio.updateConfig(prev => ({
      ...prev,
      tiles: prev.tiles.map(t => (
        t.id === id ? { ...t, config: { ...t.config, ...patch } } : t
      )),
    }));
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
    return <BioEditorSkeleton />;
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
    <div className="pb-28">
      <div className="px-4 pb-4 flex flex-col gap-3">
        <UrlCard label="LINK BIO PUBLIK" url={buildBioLink(agent.slug)} copyAriaLabel="Salin link bio" />
        <HintBanner />
        <ThemePicker value={config.theme} onChange={bio.setTheme} />
        <HeroCard agent={agent} hero={config.hero} onTap={() => setHeroOpen(true)} />
        <SeoCard seo={config.seo} onTap={() => setSeoOpen(true)} />

        <section>
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-[11px] text-gray-500 dark:text-slate-400 uppercase tracking-wider font-semibold">
              BAGIAN
            </p>
            <span className="text-[11px] text-gray-400 dark:text-slate-500">
              {tiles.length} bagian · tahan ⋮⋮ untuk mengurutkan
            </span>
          </div>

          {allHidden && (
            <div className="mb-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 p-2.5 text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-2">
              <span className="flex-1">Semua bagian sedang tersembunyi. Aktifkan minimal satu bagian agar bio tidak terlihat kosong.</span>
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
              <p className="text-sm font-semibold text-gray-800 dark:text-white">Belum ada bagian</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Tambahkan bagian pertama untuk mulai isi bio Anda.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="mt-2 w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl border-2 border-dashed border-emerald-300 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 text-sm font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-900/20 active:scale-[0.99] transition-all"
          >
            <Plus size={14} strokeWidth={2.5} />
            Tambah Bagian
          </button>
        </section>
      </div>

      <BottomBar
        slug={agent.slug}
        onPreview={() => setPreviewOpen(true)}
      />
      <SaveToast saveStatus={saveStatus} />
      <NoticeToast notice={notice} />

      <SheetHero
        open={heroOpen}
        onClose={() => setHeroOpen(false)}
        slug={agent.slug}
        config={config}
        onUpdate={bio.updateConfig}
        onSave={async () => { await bio.flush(); setHeroOpen(false); }}
      />
      <SheetSeo
        open={seoOpen}
        onClose={() => setSeoOpen(false)}
        agent={agent}
        config={config}
        onUpdate={bio.updateConfig}
        onSave={async () => { await bio.flush(); setSeoOpen(false); }}
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
        onSave={async () => { await bio.flush(); setEditingTileId(null); }}
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

function BioSkeletonBlock({ className }: { className: string }) {
  return <div className={`bg-gray-200 dark:bg-slate-700 animate-pulse ${className}`} />;
}

function BioEditorSkeleton() {
  return (
    <div className="pb-28">
      <div className="px-4 pb-4 flex flex-col gap-3">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3">
          <div className="flex items-center gap-2">
            <BioSkeletonBlock className="w-8 h-8 rounded-lg shrink-0" />
            <div className="flex-1 space-y-2">
              <BioSkeletonBlock className="h-3 w-28 rounded-full" />
              <BioSkeletonBlock className="h-4 w-48 max-w-full rounded-full" />
            </div>
            <BioSkeletonBlock className="h-8 w-20 rounded-lg shrink-0" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3 space-y-3">
          <div className="flex items-center gap-3">
            <BioSkeletonBlock className="w-9 h-9 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
              <BioSkeletonBlock className="h-4 w-24 rounded-full" />
              <BioSkeletonBlock className="h-3 w-44 max-w-full rounded-full" />
            </div>
            <BioSkeletonBlock className="w-12 h-7 rounded-full shrink-0" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <BioSkeletonBlock className="h-10 rounded-xl" />
            <BioSkeletonBlock className="h-10 rounded-xl" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3">
          <BioSkeletonBlock className="h-3 w-16 rounded-full mb-3" />
          <div className="flex gap-2 overflow-hidden">
            {[0, 1, 2, 3].map(i => <BioSkeletonBlock key={i} className="w-16 h-24 rounded-xl shrink-0" />)}
          </div>
        </div>

        <BioSkeletonBlock className="h-16 rounded-2xl" />

        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <BioSkeletonBlock className="h-3 w-12 rounded-full" />
            <BioSkeletonBlock className="h-3 w-32 rounded-full" />
          </div>
          {[0, 1, 2].map(i => <BioSkeletonBlock key={i} className="h-16 rounded-2xl" />)}
          <BioSkeletonBlock className="h-12 rounded-2xl" />
        </section>
      </div>
    </div>
  );
}

function NoticeToast({ notice }: { notice: { message: string; type: 'success' | 'error' } | null }) {
  // Hold onto the last shown notice for one render cycle after dismissal so we
  // can transition opacity/translate out before unmounting the DOM node.
  const [rendered, setRendered] = useState(notice);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (notice) {
      setRendered(notice);
      // Double rAF so the initial opacity-0 state actually paints before the
      // class flips, otherwise the transition is collapsed into one frame.
      let r2 = 0;
      const r1 = requestAnimationFrame(() => {
        r2 = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(r1);
        if (r2) cancelAnimationFrame(r2);
      };
    }
    setVisible(false);
    const t = setTimeout(() => setRendered(null), 200);
    return () => clearTimeout(t);
  }, [notice]);

  if (!rendered) return null;

  return (
    <div
      className={`pointer-events-none fixed left-1/2 -translate-x-1/2 bottom-[8.5rem] z-40 px-3 py-1.5 rounded-full shadow-lg text-[11.5px] font-semibold flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 text-gray-800 dark:text-white transition-all duration-200 ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
      }`}
    >
      {rendered.type === 'success'
        ? <CheckCircle2 size={13} className="text-emerald-500" strokeWidth={2.5} />
        : <AlertCircle size={13} className="text-red-500" strokeWidth={2.5} />}
      {rendered.message}
    </div>
  );
}

import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useWaCopyContent } from '../hooks/useWaCopyContent';
import { useToast, ToastPill } from '../hooks/useToast';
import { resolveCategoryIcon } from '../lib/categoryIcons';
import { kontenPath } from '../lib/kontenRoutes';
import type { KontenRoute } from '../lib/kontenRoutes';
import type { CategoryDraft, CategoryMeta } from '../lib/types';
import CategoryEditor from './CategoryEditor';
import DeleteCategoryPanel from './DeleteCategoryPanel';

export type KontenCatRoute = Extract<KontenRoute, { kind: 'cat-list' | 'cat-new' | 'cat-edit' | 'cat-delete' }>;

interface CategoryManagerProps {
  route: KontenCatRoute;
  navigate: (path: string, opts?: { replace?: boolean }) => void;
  navigateUp: () => void;
}

/** Category CRUD for one content type. The sub-view (list/create/edit/delete) is
 *  derived entirely from the route — reload restores it (see lib/kontenRoutes). */
export default function CategoryManager({ route, navigate, navigateUp }: CategoryManagerProps) {
  const content = useWaCopyContent();
  const { toast, showToast } = useToast();

  const cfg = {
    caption: {
      unit: 'Kategori',
      categories: content.captionCategories,
      countOf: (value: string) => content.captions.filter(c => c.category === value).length,
      create: content.createCaptionCategory,
      update: content.updateCaptionCategory,
      reorder: content.reorderCaptionCategory,
      remove: content.deleteCaptionCategory,
    },
    faq: {
      unit: 'Kategori',
      categories: content.faqCategories,
      countOf: (value: string) => content.faqs.filter(f => f.category === value).length,
      create: content.createFaqCategory,
      update: content.updateFaqCategory,
      reorder: content.reorderFaqCategory,
      remove: content.deleteFaqCategory,
    },
    tourleader: {
      unit: 'Fase',
      categories: content.tourPhases,
      countOf: (value: string) => content.tourSteps.filter(t => t.phase === value).length,
      create: content.createTourCategory,
      update: content.updateTourCategory,
      reorder: content.reorderTourCategory,
      remove: content.deleteTourCategory,
    },
  }[route.tab];

  const categories: CategoryMeta[] = [...cfg.categories].sort((a, b) => a.order - b.order);

  // Set while delete-confirm is navigating up itself, so the vanished-category
  // effect below doesn't fire a second (replace) navigation for the same removal.
  const leavingRef = useRef(false);
  const routeKey = kontenPath(route);
  useEffect(() => {
    leavingRef.current = false;
  }, [routeKey]);

  // Route targets a category that's gone (deep link after reload, deleted elsewhere)
  // → snap back to the category list.
  const targetMissing =
    (route.kind === 'cat-edit' || route.kind === 'cat-delete') &&
    !categories.some(c => c.value === route.value);
  useEffect(() => {
    if (targetMissing && !leavingRef.current) {
      navigate(kontenPath({ kind: 'cat-list', tab: route.tab }), { replace: true });
    }
  }, [targetMissing, navigate, route.tab]);

  // ── Edit / create sub-view ────────────────────────────────────────
  if (route.kind === 'cat-new' || route.kind === 'cat-edit') {
    if (targetMissing) return null; // redirect effect above runs next frame
    const initial = route.kind === 'cat-edit' ? categories.find(c => c.value === route.value) : undefined;
    return (
      <div style={{ paddingBottom: '2rem' }}>
        <CategoryEditor
          unitLabel={cfg.unit}
          initial={initial}
          onCancel={navigateUp}
          onSave={(draft: CategoryDraft) => {
            if (route.kind === 'cat-edit') cfg.update(route.value, draft);
            else cfg.create(draft);
            showToast(`${cfg.unit} tersimpan`);
            navigateUp();
          }}
        />
        <ToastPill toast={toast} />
      </div>
    );
  }

  // ── Delete + reassign sub-view ────────────────────────────────────
  if (route.kind === 'cat-delete') {
    const category = categories.find(c => c.value === route.value);
    if (!category) return null; // redirect effect above runs next frame
    return (
      <div style={{ paddingBottom: '2rem' }}>
        <DeleteCategoryPanel
          unitLabel={cfg.unit}
          category={category}
          others={categories.filter(c => c.value !== category.value)}
          count={cfg.countOf(category.value)}
          onCancel={navigateUp}
          onConfirm={reassignTo => {
            leavingRef.current = true;
            cfg.remove(category.value, reassignTo);
            showToast(`${cfg.unit} dihapus`);
            navigateUp();
          }}
        />
        <ToastPill toast={toast} />
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────
  const canDelete = categories.length > 1;

  // No local back/title header here — the sticky dashboard header already shows
  // a contextual title (kontenTitle) and its back button steps up via kontenUp.
  return (
    <div className="px-4 pt-4 space-y-4" style={{ paddingBottom: '2rem' }}>
      <button
        onClick={() => navigate(kontenPath({ kind: 'cat-new', tab: route.tab }))}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
      >
        <Plus size={16} />
        Tambah {cfg.unit}
      </button>

      <div className="space-y-2">
        {categories.map((cat, idx) => {
          const Icon = resolveCategoryIcon(cat.iconName);
          const count = cfg.countOf(cat.value);
          return (
            <div
              key={cat.value}
              className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3 flex items-center gap-3"
            >
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => cfg.reorder(cat.value, 'up')}
                  disabled={idx === 0}
                  className="w-6 h-6 flex items-center justify-center rounded-md text-gray-300 dark:text-slate-600 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-slate-700 dark:hover:text-slate-400 disabled:opacity-20 transition-colors"
                  aria-label="Naik"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  onClick={() => cfg.reorder(cat.value, 'down')}
                  disabled={idx === categories.length - 1}
                  className="w-6 h-6 flex items-center justify-center rounded-md text-gray-300 dark:text-slate-600 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-slate-700 dark:hover:text-slate-400 disabled:opacity-20 transition-colors"
                  aria-label="Turun"
                >
                  <ChevronDown size={14} />
                </button>
              </div>

              <span className="w-9 h-9 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-100 dark:border-slate-700 flex items-center justify-center flex-shrink-0">
                <Icon size={16} className="text-gray-500 dark:text-slate-400" />
              </span>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800 dark:text-white truncate">{cat.label}</p>
                <p className="text-xs text-gray-400 dark:text-slate-500">{count} konten</p>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => navigate(kontenPath({ kind: 'cat-edit', tab: route.tab, value: cat.value }))}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                  aria-label="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => navigate(kontenPath({ kind: 'cat-delete', tab: route.tab, value: cat.value }))}
                  disabled={!canDelete}
                  title={canDelete ? undefined : `Tidak bisa menghapus ${cfg.unit.toLowerCase()} terakhir`}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 dark:text-slate-500 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                  aria-label="Hapus"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <ToastPill toast={toast} />
    </div>
  );
}

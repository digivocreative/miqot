import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useWaCopyContent } from '../hooks/useWaCopyContent';
import { useToast, ToastPill } from '../hooks/useToast';
import { resolveCategoryIcon } from '../lib/categoryIcons';
import type { CategoryDraft, CategoryMeta, WaTab } from '../lib/types';
import CategoryEditor from './CategoryEditor';
import DeleteCategoryPanel from './DeleteCategoryPanel';

interface CategoryManagerProps {
  kind: WaTab;
  backRequest: number;
  onExit: () => void;
}

type SubView = { mode: 'list' } | { mode: 'edit'; value: string | null } | { mode: 'delete'; value: string };

export default function CategoryManager({ kind, backRequest, onExit }: CategoryManagerProps) {
  const content = useWaCopyContent();
  const { toast, showToast } = useToast();

  const cfg = {
    caption: {
      title: 'Kategori Caption',
      unit: 'Kategori',
      categories: content.captionCategories,
      countOf: (value: string) => content.captions.filter(c => c.category === value).length,
      create: content.createCaptionCategory,
      update: content.updateCaptionCategory,
      reorder: content.reorderCaptionCategory,
      remove: content.deleteCaptionCategory,
    },
    faq: {
      title: 'Kategori FAQ',
      unit: 'Kategori',
      categories: content.faqCategories,
      countOf: (value: string) => content.faqs.filter(f => f.category === value).length,
      create: content.createFaqCategory,
      update: content.updateFaqCategory,
      reorder: content.reorderFaqCategory,
      remove: content.deleteFaqCategory,
    },
    tourleader: {
      title: 'Fase Tour Leader',
      unit: 'Fase',
      categories: content.tourPhases,
      countOf: (value: string) => content.tourSteps.filter(t => t.phase === value).length,
      create: content.createTourCategory,
      update: content.updateTourCategory,
      reorder: content.reorderTourCategory,
      remove: content.deleteTourCategory,
    },
  }[kind];

  const categories: CategoryMeta[] = [...cfg.categories].sort((a, b) => a.order - b.order);

  const [sub, setSub] = useState<SubView>({ mode: 'list' });
  const subRef = useRef(sub);
  subRef.current = sub;
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  // backRequest is a never-reset counter, so only increments seen AFTER mount are
  // presses — reacting to the mount-time value would replay a stale press and
  // onExit() the manager the moment it remounts (the "blink" on re-open).
  const seenBackRequest = useRef(backRequest);

  // Parent back button: step out of a sub-view, or leave the manager from the list.
  // onExit is read via a ref so the parent's inline-arrow identity (it re-renders on
  // every store mutation) can't re-fire this effect with an unchanged backRequest.
  useEffect(() => {
    if (backRequest === seenBackRequest.current) return;
    seenBackRequest.current = backRequest;
    if (subRef.current.mode === 'list') onExitRef.current();
    else setSub({ mode: 'list' });
  }, [backRequest]);

  // If the targeted category vanished (e.g. deleted elsewhere), snap back to the
  // list — done in an effect rather than via setState during render.
  useEffect(() => {
    if (sub.mode !== 'list' && sub.value != null && !categories.some(c => c.value === sub.value)) {
      setSub({ mode: 'list' });
    }
  }, [sub, categories]);

  // ── Edit / create sub-view ────────────────────────────────────────
  if (sub.mode === 'edit') {
    const initial = sub.value ? categories.find(c => c.value === sub.value) : undefined;
    return (
      <div style={{ paddingBottom: '2rem' }}>
        <CategoryEditor
          unitLabel={cfg.unit}
          initial={initial}
          onCancel={() => setSub({ mode: 'list' })}
          onSave={(draft: CategoryDraft) => {
            if (sub.value) cfg.update(sub.value, draft);
            else cfg.create(draft);
            showToast(`${cfg.unit} tersimpan`);
            setSub({ mode: 'list' });
          }}
        />
        <ToastPill toast={toast} />
      </div>
    );
  }

  // ── Delete + reassign sub-view ────────────────────────────────────
  if (sub.mode === 'delete') {
    const category = categories.find(c => c.value === sub.value);
    if (!category) return null; // the reset effect above will snap back to the list
    return (
      <div style={{ paddingBottom: '2rem' }}>
        <DeleteCategoryPanel
          unitLabel={cfg.unit}
          category={category}
          others={categories.filter(c => c.value !== category.value)}
          count={cfg.countOf(category.value)}
          onCancel={() => setSub({ mode: 'list' })}
          onConfirm={reassignTo => {
            cfg.remove(category.value, reassignTo);
            showToast(`${cfg.unit} dihapus`);
            setSub({ mode: 'list' });
          }}
        />
        <ToastPill toast={toast} />
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────
  const canDelete = categories.length > 1;

  return (
    <div className="px-4 pt-4 space-y-4" style={{ paddingBottom: '2rem' }}>
      <div className="flex items-center gap-2">
        <button
          onClick={onExit}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          aria-label="Kembali"
        >
          <ChevronLeft size={18} />
        </button>
        <h2 className="text-sm font-bold text-gray-800 dark:text-white">{cfg.title}</h2>
      </div>

      <button
        onClick={() => setSub({ mode: 'edit', value: null })}
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
                  onClick={() => setSub({ mode: 'edit', value: cat.value })}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                  aria-label="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setSub({ mode: 'delete', value: cat.value })}
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

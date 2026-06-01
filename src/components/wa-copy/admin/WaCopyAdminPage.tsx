import { useEffect, useState } from 'react';
import { Plus, Settings2 } from 'lucide-react';
import SegmentedControl from '../../common/SegmentedControl';
import { useWaCopyContent } from '../hooks/useWaCopyContent';
import { useToast, ToastPill } from '../hooks/useToast';
import type { WaTab } from '../lib/types';
import ContentList, { type ContentRow } from './ContentList';
import CaptionEditor from './CaptionEditor';
import FaqEditor from './FaqEditor';
import TourLeaderEditor from './TourLeaderEditor';
import CategoryManager from './CategoryManager';

const TYPE_OPTIONS = [
  { value: 'faq' as WaTab, label: 'FAQ' },
  { value: 'caption' as WaTab, label: 'Caption' },
  { value: 'tourleader' as WaTab, label: 'Tour Leader' },
];

const firstLine = (s: string) => s.split('\n')[0].slice(0, 80);

interface Group<T extends { id: string; order: number }> {
  items: T[];
  groupOrder: string[];
  groupOf: (x: T) => string;
}

interface WaCopyAdminPageProps {
  backRequest?: number;
  onEditingChange?: (editing: boolean) => void;
}

function buildRows<T extends { id: string; order: number; active: boolean }>(
  { items, groupOrder, groupOf }: Group<T>,
  toRow: (x: T) => { badge: string; title: string; subtitle: string },
): ContentRow[] {
  const sorted = [...items].sort(
    (a, b) => groupOrder.indexOf(groupOf(a)) - groupOrder.indexOf(groupOf(b)) || a.order - b.order,
  );
  return sorted.map(item => {
    const groupItems = sorted.filter(x => groupOf(x) === groupOf(item));
    const idx = groupItems.findIndex(x => x.id === item.id);
    const { badge, title, subtitle } = toRow(item);
    return { id: item.id, badge, title, subtitle, active: item.active, canUp: idx > 0, canDown: idx < groupItems.length - 1 };
  });
}

/** Internal admin editor for global WA Copy content (gated by admin role in DashboardLayout). */
export default function WaCopyAdminPage({ backRequest = 0, onEditingChange }: WaCopyAdminPageProps) {
  const content = useWaCopyContent();
  const sortByOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;
  const captionCats = [...content.captionCategories].sort(sortByOrder);
  const faqCats = [...content.faqCategories].sort(sortByOrder);
  const phaseCats = [...content.tourPhases].sort(sortByOrder);
  const CAPTION_LABEL: Record<string, string> = Object.fromEntries(captionCats.map(c => [c.value, c.label]));
  const FAQ_LABEL: Record<string, string> = Object.fromEntries(faqCats.map(c => [c.value, c.label]));
  const PHASE_LABEL: Record<string, string> = Object.fromEntries(phaseCats.map(c => [c.value, c.label]));
  const CAPTION_ORDER = captionCats.map(c => c.value);
  const FAQ_ORDER = faqCats.map(c => c.value);
  const PHASE_ORDER = phaseCats.map(c => c.value);
  const { toast, showToast } = useToast();
  const [type, setType] = useState<WaTab>('faq');
  // null = list view; { id: null } = create new; { id } = edit existing.
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);
  const [managing, setManaging] = useState(false);

  useEffect(() => {
    onEditingChange?.(editing !== null || managing);
  }, [editing, managing, onEditingChange]);

  useEffect(() => {
    return () => onEditingChange?.(false);
  }, [onEditingChange]);

  useEffect(() => {
    if (!backRequest) return;
    if (managing) return;
    setEditing(current => (current ? null : current));
  }, [backRequest, managing]);

  const closeEditor = () => setEditing(null);
  const afterSave = () => {
    showToast('Konten tersimpan');
    setEditing(null);
  };

  // ── Category manager view ─────────────────────────────────────────
  if (managing) {
    return <CategoryManager kind={type} backRequest={backRequest} onExit={() => setManaging(false)} />;
  }

  // ── Editor view ───────────────────────────────────────────────────
  if (editing) {
    if (type === 'caption') {
      const initial = editing.id ? content.captions.find(c => c.id === editing.id) : undefined;
      return (
        <div style={{ paddingBottom: '2rem' }}>
          <CaptionEditor
            categories={captionCats}
            initial={initial}
            onCancel={closeEditor}
            onSave={draft => {
              if (editing.id) content.updateCaption(editing.id, draft);
              else content.createCaption(draft);
              afterSave();
            }}
          />
          <ToastPill toast={toast} />
        </div>
      );
    }
    if (type === 'faq') {
      const initial = editing.id ? content.faqs.find(f => f.id === editing.id) : undefined;
      return (
        <div style={{ paddingBottom: '2rem' }}>
          <FaqEditor
            categories={faqCats}
            initial={initial}
            onCancel={closeEditor}
            onSave={draft => {
              if (editing.id) content.updateFaq(editing.id, draft);
              else content.createFaq(draft);
              afterSave();
            }}
          />
          <ToastPill toast={toast} />
        </div>
      );
    }
    const initial = editing.id ? content.tourSteps.find(t => t.id === editing.id) : undefined;
    return (
      <div style={{ paddingBottom: '2rem' }}>
        <TourLeaderEditor
          categories={phaseCats}
          initial={initial}
          onCancel={closeEditor}
          onSave={draft => {
            if (editing.id) content.updateTour(editing.id, draft);
            else content.createTour(draft);
            afterSave();
          }}
        />
        <ToastPill toast={toast} />
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────
  let rows: ContentRow[] = [];
  let onToggle: (id: string) => void = () => {};
  let onReorder: (id: string, dir: 'up' | 'down') => void = () => {};

  if (type === 'caption') {
    rows = buildRows(
      { items: content.captions, groupOrder: CAPTION_ORDER, groupOf: c => c.category },
      c => ({
        badge: CAPTION_LABEL[c.category],
        title: firstLine(c.template),
        subtitle: c.packageAware ? 'Pakai Paket' : '',
      }),
    );
    onToggle = content.toggleCaption;
    onReorder = content.reorderCaption;
  } else if (type === 'faq') {
    rows = buildRows(
      { items: content.faqs, groupOrder: FAQ_ORDER, groupOf: f => f.category },
      f => ({ badge: FAQ_LABEL[f.category], title: f.question, subtitle: '' }),
    );
    onToggle = content.toggleFaq;
    onReorder = content.reorderFaq;
  } else {
    rows = buildRows(
      { items: content.tourSteps, groupOrder: PHASE_ORDER, groupOf: t => t.phase },
      t => ({ badge: PHASE_LABEL[t.phase], title: t.title, subtitle: '' }),
    );
    onToggle = content.toggleTour;
    onReorder = content.reorderTour;
  }

  return (
    <div className="px-4 pt-4 pb-8 space-y-4" style={{ paddingBottom: '2rem' }}>
      <SegmentedControl options={TYPE_OPTIONS} value={type} onChange={setType} accent="emerald" />

      <div className="flex gap-2">
        <button
          onClick={() => setEditing({ id: null })}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
        >
          <Plus size={16} />
          Tambah
        </button>
        <button
          onClick={() => setManaging(true)}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
        >
          <Settings2 size={16} />
          Kelola Kategori
        </button>
      </div>

      <ContentList rows={rows} onToggle={onToggle} onReorder={onReorder} onEdit={id => setEditing({ id })} />

      <ToastPill toast={toast} />
    </div>
  );
}

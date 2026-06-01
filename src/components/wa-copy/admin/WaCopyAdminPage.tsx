import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import SegmentedControl from '../../common/SegmentedControl';
import { useWaCopyContent } from '../hooks/useWaCopyContent';
import { useToast, ToastPill } from '../hooks/useToast';
import { CAPTION_CATEGORIES } from '../lib/captions';
import { FAQ_CATEGORIES } from '../lib/faq';
import { TOUR_PHASES } from '../lib/tourleader';
import type { WaTab } from '../lib/types';
import ContentList, { type ContentRow } from './ContentList';
import CaptionEditor from './CaptionEditor';
import FaqEditor from './FaqEditor';
import TourLeaderEditor from './TourLeaderEditor';

const TYPE_OPTIONS = [
  { value: 'faq' as WaTab, label: 'FAQ' },
  { value: 'caption' as WaTab, label: 'Caption' },
  { value: 'tourleader' as WaTab, label: 'Tour Leader' },
];

const CAPTION_LABEL: Record<string, string> = Object.fromEntries(CAPTION_CATEGORIES.map(c => [c.value, c.label]));
const FAQ_LABEL: Record<string, string> = Object.fromEntries(FAQ_CATEGORIES.map(c => [c.value, c.label]));
const PHASE_LABEL: Record<string, string> = Object.fromEntries(TOUR_PHASES.map(p => [p.value, p.label]));
const CAPTION_ORDER = CAPTION_CATEGORIES.map(c => c.value);
const FAQ_ORDER = FAQ_CATEGORIES.map(c => c.value);
const PHASE_ORDER = TOUR_PHASES.map(p => p.value);

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
  const { toast, showToast } = useToast();
  const [type, setType] = useState<WaTab>('faq');
  // null = list view; { id: null } = create new; { id } = edit existing.
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);

  useEffect(() => {
    onEditingChange?.(editing !== null);
  }, [editing, onEditingChange]);

  useEffect(() => {
    return () => onEditingChange?.(false);
  }, [onEditingChange]);

  useEffect(() => {
    if (!backRequest) return;
    setEditing(current => (current ? null : current));
  }, [backRequest]);

  const closeEditor = () => setEditing(null);
  const afterSave = () => {
    showToast('Konten tersimpan');
    setEditing(null);
  };

  // ── Editor view ───────────────────────────────────────────────────
  if (editing) {
    if (type === 'caption') {
      const initial = editing.id ? content.captions.find(c => c.id === editing.id) : undefined;
      return (
        <div style={{ paddingBottom: '2rem' }}>
          <CaptionEditor
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
      <p className="text-xs text-gray-500 dark:text-slate-400 -mt-1">Kelola konten yang dilihat semua agent.</p>

      <button
        onClick={() => setEditing({ id: null })}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
      >
        <Plus size={16} />
        Tambah
      </button>

      <ContentList rows={rows} onToggle={onToggle} onReorder={onReorder} onEdit={id => setEditing({ id })} />

      <ToastPill toast={toast} />
    </div>
  );
}

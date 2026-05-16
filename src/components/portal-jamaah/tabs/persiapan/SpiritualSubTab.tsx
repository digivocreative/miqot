import { Book, BookOpen, Heart } from 'lucide-react';
import ChecklistItem from './ChecklistItem';
import type { PortalPersiapanItem, PersiapanCategory } from '../../hooks/usePortalPersiapan';

const CATEGORIES: Array<{
  id: PersiapanCategory;
  label: string;
  icon: typeof BookOpen;
  boxClass: string;
  iconClass: string;
}> = [
  { id: 'niat_doa', label: 'Niat & Doa', icon: BookOpen, boxClass: 'bg-emerald-50', iconClass: 'text-emerald-700' },
  { id: 'ilmu_manasik', label: 'Ilmu Manasik', icon: Book, boxClass: 'bg-indigo-50', iconClass: 'text-indigo-700' },
  { id: 'persiapan_hati', label: 'Persiapan Hati', icon: Heart, boxClass: 'bg-rose-50', iconClass: 'text-rose-700' },
];

export default function SpiritualSubTab({
  items,
  onToggle,
}: {
  items: PortalPersiapanItem[];
  onToggle: (kind: 'spiritual', itemId: string, checked: boolean) => void;
}) {
  return (
    <main className="mx-auto w-full max-w-md space-y-6 px-4 pb-28 pt-4">
      <p className="rounded-2xl border border-slate-100 bg-white p-4 text-sm leading-6 text-slate-600 shadow-sm">
        Persiapan ibadah & ilmu manasik. Hafalan ini akan dipakai selama tawaf dan sa'i.
      </p>

      {CATEGORIES.map((category) => {
        const Icon = category.icon;
        const categoryItems = items.filter((item) => item.category === category.id);
        const done = categoryItems.filter((item) => item.checked).length;
        return (
          <section key={category.id}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${category.boxClass}`}>
                  <Icon className={`h-4 w-4 ${category.iconClass}`} strokeWidth={2} />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{category.label}</p>
                  <p className="text-xs text-slate-500">{done}/{categoryItems.length} selesai</p>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              {categoryItems.map((item) => (
                <div key={item.id} className="relative">
                  <ChecklistItem
                    item={item}
                    kind="spiritual"
                    onToggle={(_, itemId, checked) => onToggle('spiritual', itemId, checked)}
                    descriptionItalic={category.id === 'niat_doa'}
                  />
                  {item.resourceUrl && (
                    <a
                      href={item.resourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute bottom-4 right-4 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-700"
                    >
                      Pelajari
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
      <p className="sr-only">resourceUrl</p>
    </main>
  );
}

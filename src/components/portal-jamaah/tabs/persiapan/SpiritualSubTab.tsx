import { Book, BookOpen, Heart } from 'lucide-react';
import ChecklistItem from './ChecklistItem';
import { Card, IconTile } from '../../ui';
import type { PortalPersiapanItem, PersiapanCategory } from '../../hooks/usePortalPersiapan';

// Rainbow category hues collapsed into one brand-tinted tile; differentiated by icon.
const CATEGORIES: Array<{
  id: PersiapanCategory;
  label: string;
  icon: typeof BookOpen;
}> = [
  { id: 'niat_doa', label: 'Niat & Doa', icon: BookOpen },
  { id: 'ilmu_manasik', label: 'Ilmu Manasik', icon: Book },
  { id: 'persiapan_hati', label: 'Persiapan Hati', icon: Heart },
];

export default function SpiritualSubTab({
  items,
  onToggle,
}: {
  items: PortalPersiapanItem[];
  onToggle: (kind: 'spiritual', itemId: string, checked: boolean) => void;
}) {
  return (
    <main className="mx-auto w-full max-w-lg space-y-5 px-4 pb-28 pt-5">
      <Card className="p-4 text-sm leading-6 text-ink/70">
        Persiapan ibadah & ilmu manasik. Hafalan ini akan dipakai selama tawaf dan sa'i.
      </Card>

      {CATEGORIES.map((category) => {
        const Icon = category.icon;
        const categoryItems = items.filter((item) => item.category === category.id);
        const done = categoryItems.filter((item) => item.checked).length;
        return (
          <section key={category.id}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <IconTile tint="neutral" size="sm">
                  <Icon className="h-4 w-4" strokeWidth={2} />
                </IconTile>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink/70">{category.label}</p>
                  <p className="text-xs text-ink/70">{done}/{categoryItems.length} selesai</p>
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
                      className="absolute bottom-4 right-4 rounded-lg bg-burgundy-700/8 px-2.5 py-1.5 text-[10px] font-semibold text-burgundy-800"
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

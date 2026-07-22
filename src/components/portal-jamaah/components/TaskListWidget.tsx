import { CheckCircle, ChevronRight } from 'lucide-react';
import { deriveTopTasks, type TaskCategory } from '../lib/portalTasks';
import type { PortalPersiapanData } from '../hooks/usePortalPersiapan';
import type { PortalRoute } from '../hooks/usePortalRoute';
import { IconTile, SectionLabel, type TileTint } from '../ui';

// Rainbow category hues collapse to soft-burgundy `brand` IconTiles; the glyph
// (CreditCard / FileText / Package / BookOpenCheck) differentiates the task,
// not the color. Keeps the widget calm and on-brand.
const CATEGORY_TINT: Record<TaskCategory, TileTint> = {
  pembayaran: 'neutral',
  dokumen: 'neutral',
  perlengkapan: 'neutral',
  manasik: 'neutral',
  fallback: 'neutral',
};

export default function TaskListWidget({
  persiapan,
  onNavigate,
}: {
  persiapan: PortalPersiapanData | null;
  onNavigate: (route: PortalRoute) => void;
}) {
  const tasks = deriveTopTasks(persiapan);

  return (
    <section className="space-y-3">
      <SectionLabel>Yang Perlu Anda Lakukan</SectionLabel>
      {tasks.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lega border border-gold/30 bg-gold-50 p-3.5">
          <IconTile tint="gold" size="md">
            <CheckCircle className="h-5 w-5" strokeWidth={2} />
          </IconTile>
          <p className="text-sm font-bold text-burgundy-900">Semua tugas tuntas, semoga lancar ya</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => {
            const Icon = task.icon;
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => onNavigate(task.navigateTo)}
                className="flex w-full items-center gap-3 rounded-lega border border-black/5 bg-white p-3.5 text-left shadow-soft transition-all duration-200 active:scale-[0.98] hover:border-burgundy-700/30 hover:shadow-card"
              >
                <IconTile tint={CATEGORY_TINT[task.category]} size="md">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </IconTile>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-bold leading-5 text-ink">{task.title}</p>
                  <p className="mt-0.5 break-words text-xs leading-5 text-ink/60">{task.subtitle}</p>
                </div>
                <ChevronRight className="h-[18px] w-[18px] flex-none text-burgundy-700/40" strokeWidth={2} />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

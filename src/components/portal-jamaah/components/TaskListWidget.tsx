import { CheckCircle, ChevronRight } from 'lucide-react';
import { deriveTopTasks, type TaskCategory } from '../lib/portalTasks';
import type { PortalPersiapanData } from '../hooks/usePortalPersiapan';
import type { PortalRoute } from '../hooks/usePortalRoute';

const CATEGORY_STYLES: Record<TaskCategory, { bg: string; color: string }> = {
  pembayaran: { bg: 'bg-sky-50 dark:bg-sky-900/20', color: 'text-sky-600 dark:text-sky-400' },
  dokumen: { bg: 'bg-amber-50 dark:bg-amber-900/20', color: 'text-amber-600 dark:text-amber-400' },
  perlengkapan: { bg: 'bg-violet-50 dark:bg-violet-900/20', color: 'text-violet-600 dark:text-violet-400' },
  manasik: { bg: 'bg-purple-50 dark:bg-purple-900/20', color: 'text-purple-600 dark:text-purple-400' },
  fallback: { bg: 'bg-gray-50 dark:bg-slate-700', color: 'text-gray-600 dark:text-slate-400' },
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
      <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">
        YANG PERLU ANDA LAKUKAN
      </h2>
      {tasks.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4 dark:border-emerald-800/40 dark:bg-emerald-900/20">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/40">
            <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" strokeWidth={2} />
          </div>
          <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">Semua tugas tuntas, semoga lancar ya</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {tasks.map((task) => {
            const Icon = task.icon;
            const styles = CATEGORY_STYLES[task.category];
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => onNavigate(task.navigateTo)}
                className="flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 text-left shadow-sm transition active:scale-[0.98] hover:border-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-emerald-700"
              >
                <div className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${styles.bg}`}>
                  <Icon className={`h-5 w-5 ${styles.color}`} strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{task.title}</p>
                  <p className="truncate text-xs text-gray-500 dark:text-slate-400">{task.subtitle}</p>
                </div>
                <ChevronRight className="h-[18px] w-[18px] flex-none text-gray-400 dark:text-slate-500" strokeWidth={2} />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

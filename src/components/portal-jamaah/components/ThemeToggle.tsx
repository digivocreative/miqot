import { Moon, Sun } from 'lucide-react';
import { usePortalTheme } from '../hooks/usePortalTheme';

export default function ThemeToggle() {
  const { isDark, toggle } = usePortalTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Mode terang' : 'Mode gelap'}
      className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100/80 dark:bg-slate-800/80 text-gray-500 transition-colors hover:bg-gray-200 active:scale-95 dark:text-slate-300 dark:hover:bg-slate-700"
    >
      {isDark ? <Sun className="h-4 w-4" strokeWidth={2} /> : <Moon className="h-4 w-4" strokeWidth={2} />}
    </button>
  );
}

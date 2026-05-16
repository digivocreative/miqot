import { Moon, Sun } from 'lucide-react';
import { usePortalTheme } from '../hooks/usePortalTheme';

export default function ThemeToggle() {
  const { isDark, toggle } = usePortalTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Mode terang' : 'Mode gelap'}
      className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100/80 dark:bg-slate-800/80 text-gray-500 transition-colors hover:bg-gray-200 active:scale-95 dark:text-slate-300 dark:hover:bg-slate-700"
    >
      {isDark ? <Sun className="h-5 w-5" strokeWidth={2} /> : <Moon className="h-5 w-5" strokeWidth={2} />}
    </button>
  );
}

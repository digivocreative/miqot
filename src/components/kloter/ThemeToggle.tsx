import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

// Satu preferensi tema untuk semua halaman kloter.
export const KLOTER_THEME_KEY = 'kloter:theme';

function readInitialTheme() {
  if (typeof window === 'undefined') return false;
  const stored = window.localStorage.getItem(KLOTER_THEME_KEY);
  if (stored === 'dark') return true;
  if (stored === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export default function KloterThemeToggle() {
  const [isDark, setIsDark] = useState(readInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      window.localStorage.setItem(KLOTER_THEME_KEY, isDark ? 'dark' : 'light');
    } catch {
      // Theme persistence is optional; the visible toggle remains functional.
    }
  }, [isDark]);

  return (
    <button
      type="button"
      onClick={() => setIsDark((value) => !value)}
      aria-label={isDark ? 'Mode terang' : 'Mode gelap'}
      className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100/80 dark:bg-slate-800/80 text-gray-500 transition-colors hover:bg-gray-200 active:scale-95 dark:text-slate-300 dark:hover:bg-slate-700"
    >
      {isDark ? <Sun className="h-4 w-4" strokeWidth={2} /> : <Moon className="h-4 w-4" strokeWidth={2} />}
    </button>
  );
}

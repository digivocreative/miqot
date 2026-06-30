import { useEffect, useState } from 'react';

const STORAGE_KEY = 'portalDarkMode';

function readInitial(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = window.sessionStorage.getItem(STORAGE_KEY);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function applyDarkClass(isDark: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', isDark);
}

export function usePortalTheme() {
  const [isDark, setIsDark] = useState<boolean>(readInitial);

  useEffect(() => {
    applyDarkClass(isDark);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(STORAGE_KEY, String(isDark));
    }
  }, [isDark]);

  return {
    isDark,
    toggle: () => setIsDark((prev) => !prev),
    setDark: setIsDark,
  };
}

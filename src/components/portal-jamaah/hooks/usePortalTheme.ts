import { useEffect } from 'react';

/**
 * Portal Jamaah is light-only (redesign 2026-07). This hook now only guarantees
 * the portal never inherits a `.dark` class (e.g. from a prior dashboard session
 * or the visitor's OS dark preference). The former sessionStorage/matchMedia
 * toggle was removed. The return shape is kept minimal for call-site compatibility.
 */
export function usePortalTheme() {
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  return { isDark: false as const, toggle: () => {}, setDark: (_?: boolean) => {} };
}

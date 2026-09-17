// Warna bar status Android / judul jendela desktop mengikuti header aplikasi.
// Dulu statis #001427 (navy) di atas header putih → pita gelap di atas setiap layar.
// Mode gelap app memakai class `dark` pada <html> (toggle dashboard, halaman publik,
// kloter), jadi cukup diamati di satu tempat.

export const THEME_COLOR_LIGHT = '#ffffff';
export const THEME_COLOR_DARK = '#0f172a';

export function themeColorFor(isDark: boolean): string {
  return isDark ? THEME_COLOR_DARK : THEME_COLOR_LIGHT;
}

export function startThemeColorSync(): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {};
  const root = document.documentElement;
  const apply = () => {
    const color = themeColorFor(root.classList.contains('dark'));
    let meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    if (meta.getAttribute('content') !== color) meta.setAttribute('content', color);
  };
  apply();
  const observer = new MutationObserver(apply);
  observer.observe(root, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

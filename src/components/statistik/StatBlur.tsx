// Blur angka halaman Statistik selama mode demo (src/lib/nikitaFocusMode.ts).
// Konteks bawaan mati, jadi komponen bersama (mis. BerangkatGroupViews di
// kalender) tidak terpengaruh di luar StatistikPage.
import { createContext, useContext } from 'react';
import type { CSSProperties, ReactNode } from 'react';

const StatBlurContext = createContext(false);

export const StatBlurProvider = StatBlurContext.Provider;

export function useStatBlur(): boolean {
  return useContext(StatBlurContext);
}

// Gaya inline, bukan kelas Tailwind baru: CSS lama yang dipegang SW belum
// memuat kelas baru (lihat memory reference_tailwind_new_class_sw_cache).
const BLUR_STYLE: CSSProperties = {
  display: 'inline-block',
  filter: 'blur(6px)',
  userSelect: 'none',
  WebkitUserSelect: 'none',
};

export function Blur({ children }: { children: ReactNode }) {
  const blurred = useStatBlur();
  if (!blurred) return <>{children}</>;
  return <span style={BLUR_STYLE} aria-hidden="true">{children}</span>;
}

/** Label sumbu Y grafik (teks SVG, filter CSS tak andal di Safari) → disamarkan. */
export function axisTickFormatter(blurred: boolean, format?: (v: number) => string) {
  return (v: number) => (blurred ? '••' : format ? format(v) : String(v));
}

import type { ReactNode } from 'react';

interface RailShellProps {
  side: 'left' | 'right';
  children: ReactNode;
}

/**
 * Pembungkus geometri rail desktop.
 *
 * Geometrinya hidup di src/index.css (.jadwal-rail): `fixed` membentang penuh
 * dari atas viewport, jaraknya lewat padding-top yang membaca
 * --filter-header-visible-h, lebarnya --jadwal-rail-left-w / --jadwal-rail-right-w,
 * dan dipasang di selokan lewat calc() dari --jadwal-col-w. Ditaruh di CSS supaya
 * kolom tengah tidak pernah bergeser karena interaksi — hanya karena resize
 * melewati breakpoint.
 *
 * Rail muncul di ≥1024px; di bawah itu `display: none` dan halaman berperilaku
 * persis seperti sebelum fitur ini ada.
 *
 * TANPA kepala: nama paket sudah terbaca di kartu tengah yang terbuka tepat di
 * antara kedua rail, jadi mengulangnya dua kali lagi hanya memakan ruang.
 * `aria-label` menggantikan judul yang dulu terlihat. Menutup rail lewat klik
 * kartu lagi atau Escape (App.tsx), jadi tombol X pun tak diperlukan.
 */
export default function RailShell({ side, children }: RailShellProps) {
  return (
    <aside
      className={`jadwal-rail jadwal-rail--${side}`}
      aria-label={side === 'left' ? 'Rencana perjalanan paket' : 'Hotel paket'}
    >
      {children}
    </aside>
  );
}

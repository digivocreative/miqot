import { useEffect, useRef, useState } from 'react';

// Watermark "alhijaz.co/<slug-agent>" yang ditempel di atas foto hotel saat
// dibuka layar penuh (lightbox). Sengaja HANYA di layar penuh — di thumbnail
// dan cover, teksnya cuma jadi noda dan menutupi isi foto.
//
// Ini lapisan DOM, bukan piksel: ikut terbawa kalau agent men-screenshot layar
// (cara paling umum foto dipakai), tidak terbawa kalau berkasnya diunduh
// langsung dari CDN. Itu keputusan sadar — membakar ke piksel butuh canvas +
// CORS Bunny.
//
// Warna, ukuran huruf, bayangan, dan gradien ditulis sebagai inline style,
// bukan kelas Tailwind. Kelas yang baru lahir bareng sebuah fitur bisa belum
// ada di CSS lama yang masih dipegang service worker di perangkat agent; yang
// dipakai dari Tailwind hanya kelas posisi yang sudah lama ada di bundle.

/**
 * Satu sumber kebenaran untuk rupa watermark: dipakai lapisan DOM di lightbox
 * DAN oleh stampWatermarkOnImage() yang membakarnya ke piksel saat foto
 * diunduh/dibagikan.
 *
 * ATURANNYA: ukuran huruf selalu turunan dari LEBAR FOTO, tidak pernah dari
 * lebar layar. Konsekuensinya berkas yang diunduh dari ponsel dan dari desktop
 * identik bit-per-bit — watermark bukan lagi soal perangkat siapa yang menekan
 * tombol. Angka tetap dalam piksel (mis. "22px") sengaja TIDAK dipakai: itu
 * yang dulu membuat hasil unduhan berbeda-beda.
 */
export const WATERMARK = {
  /**
   * Ukuran huruf = lebar foto × angka ini. Setara 22px pada foto selebar 728px
   * (lebar lightbox di desktop) — patokan rupa yang sudah disetujui.
   */
  fontSizeRatio: 22 / 728,
  /**
   * Lantai keterbacaan. Hanya menyentuh TAMPILAN di layar sempit (foto di
   * ponsel tampil ±351px → 10,6px, terlalu kecil dibaca); berkas yang dibakar
   * memakai lantainya sendiri di bawah dan tetap sama di semua perangkat.
   */
  minFontSize: 12,
  minBurnedFontSize: 14,
  opacity: 0.6,
  /** Renggang huruf, dalam kelipatan ukuran huruf (0,5px saat huruf 22px). */
  letterSpacingRatio: 0.5 / 22,
  /** Jarak dasar teks ke tepi bawah foto, dalam kelipatan ukuran huruf. */
  bottomRatio: 1.3,
  fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
} as const;

export default function PhotoWatermark({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Lebar lapisan ini = lebar foto (inset-x-0 pada pembungkus yang menyusut
  // mengikuti gambar). Diukur, bukan ditebak: ukuran huruf harus mengikuti
  // seberapa besar FOTO tampil, persis seperti versi yang dibakar ke piksel,
  // supaya yang dilihat agent sebanding dengan yang tersimpan di berkas.
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      // Kotak BORDER, bukan contentRect: contentRect sudah dipotong padding
      // kiri-kanan lapisan ini, jadi hurufnya keluar ~5% lebih kecil daripada
      // versi yang dibakar ke piksel (yang memakai lebar foto penuh).
      const entry = entries[0];
      const next = entry?.borderBoxSize?.[0]?.inlineSize ?? el.offsetWidth;
      setWidth(prev => (Math.abs(prev - next) < 0.5 ? prev : next));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!text) return null;
  const fontSize = Math.max(WATERMARK.minFontSize, Math.round(width * WATERMARK.fontSizeRatio));

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 select-none"
      style={{
        paddingLeft: 12,
        paddingRight: 12,
        paddingTop: fontSize * 2.5,
        // Jarak ke tepi bawah foto sengaja lega — mepet bawah terbaca seperti
        // cacat cetak, bukan tanda tangan.
        paddingBottom: Math.round(fontSize * WATERMARK.bottomRatio),
        opacity: WATERMARK.opacity,
        // Sebelum ukuran pertama masuk dari ResizeObserver, lapisan ini tak
        // punya lebar untuk dihitung — sembunyikan satu frame, jangan
        // berkedip di ukuran yang salah.
        visibility: width ? 'visible' : 'hidden',
        // Gradien tipis supaya teks tetap terbaca di foto lobi yang terang
        // maupun foto kamar yang gelap.
        background: 'linear-gradient(to top, rgba(0,0,0,0.5), rgba(0,0,0,0))',
      }}
    >
      <span
        style={{
          display: 'block',
          textAlign: 'center',
          fontSize,
          lineHeight: 1.2,
          fontWeight: 700,
          fontFamily: WATERMARK.fontFamily,
          letterSpacing: fontSize * WATERMARK.letterSpacingRatio,
          color: '#ffffff',
          textShadow: `0 1px ${Math.max(2, fontSize * 0.18)}px rgba(0,0,0,0.6)`,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </span>
    </div>
  );
}

/**
 * Teks watermark untuk seorang agent. Slug kosong/tak dikenal jatuh ke domain
 * saja — jangan pernah memunculkan "alhijaz.co/undefined" di depan jamaah.
 */
export function agentWatermarkText(slug?: string | null): string {
  const clean = String(slug || '').trim().toLowerCase();
  return clean ? `alhijaz.co/${clean}` : 'alhijaz.co';
}

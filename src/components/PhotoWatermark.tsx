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
 * diunduh/dibagikan. Dua jalur itu harus terlihat sama — kalau angkanya
 * bercabang, foto yang tersimpan tidak lagi cocok dengan yang dilihat agent.
 */
export const WATERMARK = {
  fontSize: 22,
  opacity: 0.6,
  /** Jarak dasar teks ke tepi bawah foto, dalam kelipatan ukuran huruf. */
  bottomRatio: 1.3,
  /**
   * Ukuran huruf saat dibakar ke piksel = lebar gambar × angka ini. Diturunkan
   * dari lapisan DOM (22px pada foto selebar ±508px di lightbox) supaya berkas
   * terunduh sebanding dengan yang tampil di layar.
   */
  fontSizeRatio: 22 / 508,
  minBurnedFontSize: 14,
  fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
} as const;

export default function PhotoWatermark({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 select-none"
      style={{
        paddingLeft: 12,
        paddingRight: 12,
        paddingTop: WATERMARK.fontSize * 2.5,
        // Jarak ke tepi bawah foto sengaja lega — mepet bawah terbaca seperti
        // cacat cetak, bukan tanda tangan.
        paddingBottom: Math.round(WATERMARK.fontSize * WATERMARK.bottomRatio),
        opacity: WATERMARK.opacity,
        // Gradien tipis supaya teks tetap terbaca di foto lobi yang terang
        // maupun foto kamar yang gelap.
        background: 'linear-gradient(to top, rgba(0,0,0,0.5), rgba(0,0,0,0))',
      }}
    >
      <span
        style={{
          display: 'block',
          textAlign: 'center',
          fontSize: WATERMARK.fontSize,
          lineHeight: 1.2,
          fontWeight: 700,
          fontFamily: WATERMARK.fontFamily,
          letterSpacing: 0.5,
          color: '#ffffff',
          textShadow: '0 1px 4px rgba(0,0,0,0.6)',
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

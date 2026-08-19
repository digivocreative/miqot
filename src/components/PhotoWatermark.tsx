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

export default function PhotoWatermark({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 select-none"
      style={{
        paddingLeft: 12,
        paddingRight: 12,
        paddingTop: 40,
        paddingBottom: 12,
        opacity: 0.8,
        // Gradien tipis supaya teks tetap terbaca di foto lobi yang terang
        // maupun foto kamar yang gelap.
        background: 'linear-gradient(to top, rgba(0,0,0,0.5), rgba(0,0,0,0))',
      }}
    >
      <span
        style={{
          display: 'block',
          textAlign: 'center',
          fontSize: 20,
          lineHeight: 1.2,
          fontWeight: 700,
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

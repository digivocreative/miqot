import logoAlhijazColored from '@/new-logo/new-logo-alhijaz-colored.png';
import logoAlhijazWhite from '@/new-logo/new-logo-alhijaz-white.png';

// Logo terbaru + kilau (shine) yang sama dengan header halaman jadwal
// (FilterHeader): dua lapis gambar, lapisan atas di-mask jadi kilau berjalan
// lewat .animate-logo-shine di index.css. Versi putih dipakai di mode gelap
// lewat kelas dark: (halaman ini tidak memegang state tema di sini).
export default function KloterShineLogo({ href = '/' }: { href?: string }) {
  return (
    <a
      href={href}
      aria-label="Alhijaz Indowisata"
      data-kloter-logo
      className="group relative block flex-none cursor-pointer transition-opacity hover:opacity-80"
    >
      <img src={logoAlhijazColored} alt="Alhijaz Indowisata" className="h-7 w-auto object-contain dark:hidden" />
      <img src={logoAlhijazWhite} alt="Alhijaz Indowisata" className="hidden h-7 w-auto object-contain dark:block" />
      {/* Lapisan kilau: filter brightness(0) invert(1) memutihkan apa pun sumbernya,
          jadi satu lapisan cukup untuk terang maupun gelap. */}
      <img
        src={logoAlhijazColored}
        alt=""
        aria-hidden="true"
        className="animate-logo-shine pointer-events-none absolute inset-0 h-7 w-auto object-contain"
      />
    </a>
  );
}

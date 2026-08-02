// Avatar Bani — karakter pria berpeci, SVG inline (tanpa dependency baru, tanpa
// aset gambar yang perlu diunduh terpisah).
//
// Urutan lapisan menentukan hasilnya: baju koko → leher → telinga → kepala →
// rambut pelipis & poni → peci. Peci digambar TERAKHIR di atas kepala supaya
// ujung poni tersembunyi rapi di bawah tepinya.
//
// Bagian bawah koko sengaja digambar sampai y=52 (melewati viewBox): animasi
// .bani-float menggeser badan ~0.7px ke atas, kalau berhenti di y=48 akan muncul
// celah latar tipis di dasar lingkaran.
//
// Dibuat "hidup" oleh tiga animasi halus yang seluruhnya mati saat
// prefers-reduced-motion (keyframes di src/index.css):
//   .bani-float — badan naik-turun tipis, kesan bernapas
//   .bani-blink — mata berkedip berkala
//   .bani-look  — mata melirik, hanya saat state="thinking"
//
// SVG ini SUDAH memuat lingkaran gradien birunya sendiri, jadi pemanggil cukup
// menentukan ukuran lewat className (mis. "h-10 w-10").
import { useId } from 'react';

export default function BaniAvatar({
  className = '',
  state = 'idle',
}: {
  className?: string;
  state?: 'idle' | 'thinking';
}) {
  // Id gradien wajib unik: tiga avatar hidup bersamaan di satu halaman (FAB +
  // header + bubble). Pola sama dengan FlightRouteLine.tsx.
  const uid = useId().replace(/:/g, '');

  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Bani"
    >
      <defs>
        <linearGradient id={`bani-bg-${uid}`} x1="0" y1="0" x2="48" y2="48">
          <stop offset="0" stopColor="#f8fafc" />
          <stop offset="1" stopColor="#93c5fd" />
        </linearGradient>
        <clipPath id={`bani-clip-${uid}`}>
          <circle cx="24" cy="24" r="24" />
        </clipPath>
      </defs>

      <circle cx="24" cy="24" r="24" fill={`url(#bani-bg-${uid})`} />

      <g clipPath={`url(#bani-clip-${uid})`}>
        <g className="bani-float">
          {/* baju koko + kerah + placket berkancing */}
          <path d="M24 33.4C15 33.4 7.8 39.6 6 48v4h36v-4c-1.8-8.4-9-14.6-18-14.6Z" fill="#0f766e" />
          <path d="M20.4 34.1 24 39l3.6-4.9c-1.1-.45-2.3-.7-3.6-.7s-2.5.25-3.6.7Z" fill="#115e59" />
          <path d="M23.2 39h1.6v13h-1.6Z" fill="#115e59" opacity=".65" />
          <circle cx="24" cy="43" r=".7" fill="#000" opacity=".18" />
          <circle cx="24" cy="47" r=".7" fill="#000" opacity=".18" />

          {/* leher + bayangan rahang */}
          <path d="M21.1 30h5.8v4.4c0 1-1.3 1.8-2.9 1.8s-2.9-.8-2.9-1.8V30Z" fill="#e0aa7d" />
          <path d="M21.1 30h5.8v1.6c-1.9.9-3.9.9-5.8 0V30Z" fill="#c9906a" opacity=".55" />

          <ellipse cx="14.4" cy="24.8" rx="1.35" ry="1.75" fill="#f0c19a" />
          <ellipse cx="33.6" cy="24.8" rx="1.35" ry="1.75" fill="#f0c19a" />

          <ellipse cx="24" cy="23.4" rx="9.6" ry="10.4" fill="#f3c9a4" />

          {/* rambut: pelipis kiri/kanan + poni tipis yang menyembul di bawah peci */}
          <path d="M14.6 20.4c.2-2.6.9-4.6 1.9-6.1l2.6 1.5c-.9 1.4-1.4 3-1.5 5.1l-3-.5Z" fill="#2b2018" />
          <path d="M33.4 20.4c-.2-2.6-.9-4.6-1.9-6.1l-2.6 1.5c.9 1.4 1.4 3 1.5 5.1l3-.5Z" fill="#2b2018" />
          <path d="M15.6 17.6c1.6-2.6 4.6-4.2 8.4-4.2s6.8 1.6 8.4 4.2c-2-1.3-5-2-8.4-2s-6.4.7-8.4 2Z" fill="#2b2018" />

          {/* peci */}
          <path d="M15.2 17.8 15.9 11c.1-1.2 3.6-2.2 8.1-2.2s8 1 8.1 2.2l.7 6.8c-2.2-1.3-5.3-2-8.8-2s-6.6.7-8.8 2Z" fill="#1e293b" />
          <path d="M24 8.8c-4.5 0-8 1-8.1 2.2l-.2 1.6c1.4-1 4.6-1.7 8.3-1.7s6.9.7 8.3 1.7l-.2-1.6c-.1-1.2-3.6-2.2-8.1-2.2Z" fill="#334155" />

          <path
            d="M18.9 20.5c1-.8 2.4-.8 3.4 0M25.7 20.5c1-.8 2.4-.8 3.4 0"
            stroke="#3a2b20"
            strokeWidth="1.25"
            strokeLinecap="round"
          />

          {/* .bani-look membungkus .bani-blink: dua animasi transform tidak bisa
              hidup di elemen yang sama, jadi lirikan dan kedipan dipisah grup. */}
          <g className={state === 'thinking' ? 'bani-look' : undefined}>
            <g className="bani-blink">
              <ellipse cx="20.6" cy="23.4" rx="1.45" ry="1.85" fill="#3b2a24" />
              <ellipse cx="27.4" cy="23.4" rx="1.45" ry="1.85" fill="#3b2a24" />
              <circle cx="21.1" cy="22.7" r=".5" fill="#fff" opacity=".92" />
              <circle cx="27.9" cy="22.7" r=".5" fill="#fff" opacity=".92" />
            </g>
          </g>

          <path d="M23.6 25.4c-.35 1 .1 1.6.8 1.6" stroke="#dda87f" strokeWidth=".9" strokeLinecap="round" fill="none" />
          <path d="M21.9 29c.7.85 1.35 1.28 2.1 1.28s1.4-.43 2.1-1.28" stroke="#a4573c" strokeWidth="1.2" strokeLinecap="round" />
        </g>
      </g>

      {/* tepi tipis supaya lingkaran avatar tetap terbaca di atas kartu putih */}
      <circle cx="24" cy="24" r="23.5" fill="none" stroke="#000" strokeWidth="1" opacity=".07" />
    </svg>
  );
}

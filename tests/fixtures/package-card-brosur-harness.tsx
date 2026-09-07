import { createRoot } from 'react-dom/client';

import PackageCard from '../../src/components/PackageCard';
import '../../src/index.css';

/**
 * Harness DOM untuk pratinjau brosur di dalam PackageCard.
 *
 * Pelengkap harness SSR (package-card-render.js), bukan penggantinya. SSR hanya
 * pernah melihat SATU sisi gerbang kesiapan: efek, ref, dan onLoad tidak jalan
 * di sana, jadi brosurLoaded selamanya false. Sisi seberangnya — gambar mendarat,
 * kerangka dilepas, gambar fade-in — cuma ada di DOM hidup.
 *
 * Yang diukur tesnya nanti geometri sungguhan (tinggi konten panel expand,
 * opacity terkomputasi), jadi CSS Tailwind WAJIB ikut termuat: import
 * src/index.css di bawah bukan hiasan.
 *
 * JANGAN memakai kelas Tailwind sendiri di berkas ini. Glob `content` Tailwind
 * cuma memindai ./index.html + ./src/**, jadi kelas yang hanya ada di sini tidak
 * pernah dibuatkan CSS-nya dan hilang tanpa suara. Kelas yang diuji aman karena
 * dieja di dalam src/components/PackageCard.tsx. Gaya harness pakai style inline.
 */

// Relatif dan bernama khas supaya tes bisa mencegatnya lewat page.route() lalu
// MENAHAN responsnya. Penahanan itu inti tesnya: keadaan "belum siap" harus bisa
// diukur dengan tenang, bukan dikejar dalam beberapa milidetik.
const BROSUR_URL = '/__uji-brosur.jpg';

const SAMPLE_FLIGHT = {
  tgl: '2026-09-03',
  jam: '10.25',
  rute: 'CGK - JED',
  kodePenerbangan: 'SV 819',
};

/**
 * Bentuknya sengaja dijaga sama dengan samplePackage() di package-card-render.js.
 * TIDAK diimpor dari sana: berkas itu memuat esbuild dan builtin node di ruang
 * lingkup modul, jadi vite tidak bisa membundelnya untuk browser.
 */
const pkg = {
  jadwalId: 'JBU1500',
  nama: 'UMROH RAHMAH 9 HARI',
  isPromo: false,
  seatTotal: 45,
  seatSisa: 17,
  maskapai: 'SAUDIA',
  keberangkatan: SAMPLE_FLIGHT,
  kepulangan: { ...SAMPLE_FLIGHT, tgl: '2026-09-11', rute: 'JED - CGK', kodePenerbangan: 'SV 820' },
  manasikTanggal: '2026-08-24',
  manasikJam: '09:00:00',
  brosurUrl: BROSUR_URL,
  itineraryUrl: '',
  perlengkapanHarga: '0',
  harga: { RAHMAH: { Quard: '33900000', Triple: '34900000', Double: '36900000' } },
  hotel: {
    RAHMAH: {
      mekkah_hotel: 'GRAND AL MASSA', mekkah_bintang: '4', mekkah_jarak: '300m',
      madinah_hotel: 'AL EIMAN TAIBAH', madinah_bintang: '4', madinah_jarak: '150m',
    },
  },
};

// isExpanded, bukan isSingleView: blok brosur hidup DI DALAM panel expand
// (motion.div ber-height animasi). Panel yang tertutup tinggi 0, jadi tak ada
// geometri yang bisa diukur.
createRoot(document.getElementById('root')!).render(
  <div style={{ width: 420, margin: '0 auto' }}>
    <PackageCard package={pkg as never} isExpanded />
  </div>,
);

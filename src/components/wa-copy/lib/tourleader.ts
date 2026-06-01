import type { CategoryMeta, TourPhase, TourStep } from './types';

export const TOUR_PHASES: CategoryMeta<TourPhase>[] = [
  { value: 'sebelum', label: 'Sebelum', iconName: 'ListChecks', order: 1, tip: 'Persiapan & briefing sebelum keberangkatan.' },
  { value: 'saat', label: 'Saat', iconName: 'Compass', order: 2, tip: 'Pendampingan selama perjalanan & ibadah.' },
  { value: 'setelah', label: 'Setelah', iconName: 'Home', order: 3, tip: 'Kepulangan & menjaga silaturahmi.' },
];

export const TOUR_SEED: TourStep[] = [
  {
    id: 'tl-sebelum-1',
    phase: 'sebelum',
    title: 'Briefing & Perkenalan',
    body:
      'Kumpulkan jamaah untuk perkenalan dan briefing awal. Perkenalkan diri Anda sebagai tour leader, bagikan rundown perjalanan secara ringkas, dan pastikan setiap jamaah tahu cara menghubungi Anda. Suasana yang hangat sejak awal membuat jamaah lebih tenang dan mudah dikoordinasi sepanjang perjalanan.',
    order: 1,
    active: true,
  },
  {
    id: 'tl-sebelum-2',
    phase: 'sebelum',
    title: 'Cek Dokumen & Barang',
    body:
      'Ingatkan jamaah memeriksa paspor, kartu identitas, dan dokumen penting lainnya sebelum berangkat. Pastikan barang berharga dan obat pribadi dibawa di tas kabin, serta berat bagasi sesuai ketentuan maskapai. Pengecekan kecil ini mencegah masalah besar di bandara.',
    order: 2,
    active: true,
  },
  {
    id: 'tl-sebelum-3',
    phase: 'sebelum',
    title: 'Doa & Niat Bersama',
    body:
      'Sebelum berangkat, ajak jamaah berkumpul sejenak untuk meluruskan niat dan memanjatkan doa safar bersama. Momen ini menyetel suasana hati seluruh rombongan agar lebih khusyuk, sekaligus mengingatkan bahwa perjalanan ini adalah ibadah, bukan sekadar wisata.',
    order: 3,
    active: true,
  },
  {
    id: 'tl-saat-1',
    phase: 'saat',
    title: 'Di Bandara & Penerbangan',
    body:
      'Dampingi jamaah saat check-in, imigrasi, dan boarding. Jaga rombongan tetap bersama, bantu jamaah yang kesulitan, dan ingatkan waktu serta tempat berniat ihram sesuai arahan pembimbing. Komunikasi yang jelas di titik-titik ramai ini sangat menentukan kelancaran perjalanan.',
    order: 1,
    active: true,
  },
  {
    id: 'tl-saat-2',
    phase: 'saat',
    title: 'Tiba di Hotel & Pembagian Kamar',
    body:
      'Setibanya di hotel, koordinasikan pembagian kamar dengan rapi dan sampaikan informasi penting: titik dan jam berkumpul, lokasi makan, serta nomor yang bisa dihubungi. Pastikan jamaah lansia dan yang butuh perhatian khusus mendapat kamar yang nyaman dan mudah diakses.',
    order: 2,
    active: true,
  },
  {
    id: 'tl-saat-3',
    phase: 'saat',
    title: 'Pendampingan Ibadah',
    body:
      'Dampingi jamaah menuju masjid dan selama rangkaian ibadah. Bantu mengingatkan tata cara tawaf dan sai sesuai bimbingan muthawif, jaga agar rombongan tidak terpisah, dan beri perhatian lebih pada jamaah lansia. Kehadiran Anda yang sigap membuat ibadah terasa tenang dan aman.',
    order: 3,
    active: true,
  },
  {
    id: 'tl-setelah-1',
    phase: 'setelah',
    title: 'Persiapan Kepulangan',
    body:
      'Menjelang pulang, ingatkan jamaah untuk berkemas lebih awal, memperhatikan batas berat oleh-oleh, dan menyiapkan dokumen. Kumpulkan kembali paspor sesuai prosedur, konfirmasi jam checkout, dan pastikan tidak ada barang yang tertinggal di kamar.',
    order: 1,
    active: true,
  },
  {
    id: 'tl-setelah-2',
    phase: 'setelah',
    title: 'Tiba di Tanah Air',
    body:
      'Saat tiba kembali, koordinasikan rombongan hingga semua jamaah dan bagasi lengkap. Pastikan setiap jamaah terhubung dengan penjemput masing-masing, sampaikan ucapan terima kasih, dan doakan agar ibadahnya menjadi umroh yang mabrur.',
    order: 2,
    active: true,
  },
  {
    id: 'tl-setelah-3',
    phase: 'setelah',
    title: 'Follow Up & Silaturahmi',
    body:
      'Beberapa hari setelah kepulangan, sapa kembali jamaah lewat pesan, tanyakan kesan dan masukan mereka, serta jaga silaturahmi. Hubungan baik yang terawat sering kali menjadi pintu rekomendasi dan keberangkatan berikutnya, sekaligus bukti pelayanan yang tulus.',
    order: 3,
    active: true,
  },
];

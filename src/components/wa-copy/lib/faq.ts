import { HelpCircle, CreditCard, FileText, Plane, BedDouble } from 'lucide-react';
import type { AgentFaqEntry, CategoryMeta, FaqCategory } from './types';

export const FAQ_CATEGORIES: CategoryMeta<FaqCategory>[] = [
  { value: 'umum', label: 'Umum', icon: HelpCircle, iconName: 'HelpCircle', order: 1, tip: 'Pertanyaan dasar calon jamaah.' },
  { value: 'pembayaran', label: 'Pembayaran', icon: CreditCard, iconName: 'CreditCard', order: 2, tip: 'Cara bayar, DP, dan pelunasan.' },
  { value: 'dokumen', label: 'Dokumen', icon: FileText, iconName: 'FileText', order: 3, tip: 'Paspor dan berkas wajib.' },
  { value: 'keberangkatan', label: 'Keberangkatan', icon: Plane, iconName: 'Plane', order: 4, tip: 'Manasik, bagasi, dan titik kumpul.' },
  { value: 'fasilitas', label: 'Fasilitas', icon: BedDouble, iconName: 'BedDouble', order: 5, tip: 'Hotel, makan, dan yang termasuk paket.' },
];

export const WA_COPY_FAQ_SEED: AgentFaqEntry[] = [
  {
    id: 'faq-umum-pertama',
    category: 'umum',
    question: 'Saya belum pernah umroh, apakah dibimbing?',
    answer:
      'Tentu. Selama di Tanah Suci ada muthawif/pembimbing yang mendampingi tata cara ibadah dari awal sampai selesai, jadi jamaah baru tidak perlu khawatir.',
    order: 1,
    active: true,
  },
  {
    id: 'faq-umum-lansia',
    category: 'umum',
    question: 'Apakah orang tua lansia bisa ikut?',
    answer:
      'Bisa, dengan pendampingan dan memastikan kondisi kesehatan memadai. Sebaiknya konsultasikan kondisi beliau ke agent agar pelayanan bisa disesuaikan.',
    order: 2,
    active: true,
  },
  {
    id: 'faq-bayar-cara',
    category: 'pembayaran',
    question: 'Bagaimana cara melakukan pembayaran?',
    answer:
      'Pembayaran dilakukan via transfer ke rekening resmi. Setelah transfer, kirim bukti ke agent melalui WhatsApp untuk dikonfirmasi, dan cantumkan nama jamaah pada keterangan transfer.',
    order: 1,
    active: true,
  },
  {
    id: 'faq-bayar-dp',
    category: 'pembayaran',
    question: 'Apakah bisa bayar DP atau dicicil?',
    answer:
      'Bisa. DP digunakan untuk mengunci seat, lalu pelunasan mengikuti jadwal yang disepakati. Untuk skema cicilan yang pas, silakan diskusikan langsung dengan agent.',
    order: 2,
    active: true,
  },
  {
    id: 'faq-bayar-deadline',
    category: 'pembayaran',
    question: 'Kapan batas pelunasan?',
    answer:
      'Umumnya pelunasan paling lambat H-30 sebelum keberangkatan, agar dokumen visa dan tiket bisa difinalisasi tanpa hambatan.',
    order: 3,
    active: true,
  },
  {
    id: 'faq-dok-syarat',
    category: 'dokumen',
    question: 'Apa saja dokumen yang perlu disiapkan?',
    answer:
      'Paspor dengan masa berlaku minimal 7 bulan dari tanggal berangkat, KTP, Kartu Keluarga, pasfoto, serta sertifikat vaksin meningitis. Agent akan membantu mengecek kelengkapannya.',
    order: 1,
    active: true,
  },
  {
    id: 'faq-dok-paspor-nama',
    category: 'dokumen',
    question: 'Nama di paspor saya hanya dua kata, bagaimana?',
    answer:
      'Tetap bisa diproses. Pada kasus tertentu diperlukan dokumen pendukung tambahan. Sampaikan kondisi paspor Anda ke agent agar diarahkan sejak awal.',
    order: 2,
    active: true,
  },
  {
    id: 'faq-brkt-manasik',
    category: 'keberangkatan',
    question: 'Apakah manasik wajib dihadiri?',
    answer:
      'Sangat dianjurkan. Manasik adalah pembekalan tata cara umroh yang penting terutama bagi yang belum pernah berangkat. Jadwalnya akan diinformasikan oleh agent.',
    order: 1,
    active: true,
  },
  {
    id: 'faq-brkt-koper',
    category: 'keberangkatan',
    question: 'Berapa berat bagasi yang diperbolehkan?',
    answer:
      'Umumnya bagasi 30 kg ditambah tas kabin 7 kg, tergantung maskapai. Detail per penerbangan akan diinfokan agent menjelang keberangkatan agar tidak kena biaya kelebihan.',
    order: 2,
    active: true,
  },
  {
    id: 'faq-fas-include',
    category: 'fasilitas',
    question: 'Apa saja yang termasuk dalam paket?',
    answer:
      'Secara umum paket sudah mencakup tiket pesawat, hotel, visa, transportasi selama di Tanah Suci, pembimbing ibadah, dan makan. Rincian persisnya berbeda tiap paket — agent bisa menjelaskan detailnya.',
    order: 1,
    active: true,
  },
  {
    id: 'faq-fas-hotel',
    category: 'fasilitas',
    question: 'Hotelnya bintang berapa dan sedekat apa?',
    answer:
      'Bervariasi tergantung paket yang dipilih. Detail bintang hotel serta jarak ke Masjidil Haram dan Masjid Nabawi tercantum di brosur masing-masing paket.',
    order: 2,
    active: true,
  },
  {
    id: 'faq-fas-makan',
    category: 'fasilitas',
    question: 'Apakah mendapat makan selama di sana?',
    answer:
      'Umumnya jamaah mendapat makan dengan menu Indonesia selama di Tanah Suci. Frekuensi dan detailnya menyesuaikan paket yang dipilih.',
    order: 3,
    active: true,
  },
];

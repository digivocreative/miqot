export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
}

export const PORTAL_FAQ: FaqEntry[] = [
  {
    id: 'cara-bayar',
    question: 'Bagaimana cara melakukan pembayaran?',
    answer: 'Pembayaran dilakukan via transfer bank ke rekening resmi agent yang tercantum di menu Pembayaran. Setelah transfer, kirim bukti ke agent lewat tombol WhatsApp untuk dikonfirmasi. Cantumkan kode booking pada berita transfer.',
  },
  {
    id: 'dokumen-wajib',
    question: 'Apa saja dokumen yang perlu disiapkan?',
    answer: 'Paspor (masa berlaku minimal 7 bulan dari tanggal berangkat), Visa Umroh, Sertifikat Vaksin Meningitis, KTP, Kartu Keluarga (KK), dan foto 4x6 latar putih. Detail status tiap dokumen bisa dilihat di menu Dokumen.',
  },
  {
    id: 'deadline-pelunasan',
    question: 'Kapan deadline pelunasan?',
    answer: 'Deadline pelunasan adalah H-30 sebelum tanggal keberangkatan. Pelunasan tepat waktu penting agar dokumen visa & tiket bisa difinalisasi tanpa hambatan.',
  },
  {
    id: 'manasik-wajib',
    question: 'Apakah manasik wajib dihadiri?',
    answer: 'Sangat dianjurkan. Manasik adalah pembekalan tata cara umroh yang berguna terutama untuk jamaah yang belum pernah umroh. Jadwal manasik tersedia di menu Manasik.',
  },
  {
    id: 'sakit-menjelang-berangkat',
    question: 'Bagaimana kalau saya sakit menjelang berangkat?',
    answer: 'Segera hubungi agent. Tergantung kondisi, agent dapat membantu pengurusan reschedule, refund parsial sesuai kebijakan, atau pengurusan asuransi perjalanan jika tersedia.',
  },
  {
    id: 'berat-koper',
    question: 'Berapa berat koper maksimal yang diperbolehkan?',
    answer: 'Umumnya bagasi 30 kg + tas kabin 7 kg, tergantung maskapai. Detail per penerbangan akan diinfokan agent menjelang keberangkatan. Hindari kelebihan agar tidak kena biaya tambahan.',
  },
  {
    id: 'transfer-jamaah-lain',
    question: 'Apakah pembayaran bisa dialihkan ke jamaah lain?',
    answer: 'Bisa, dengan persetujuan tertulis dari kedua belah pihak dan koordinasi agent. Hubungi agent untuk proses pengalihan resmi.',
  },
  {
    id: 'pembatalan-refund',
    question: 'Bagaimana prosedur pembatalan / refund?',
    answer: 'Pembatalan mengikuti syarat & ketentuan perjanjian booking. Refund parsial dimungkinkan tergantung jarak waktu pembatalan ke tanggal berangkat. Hubungi agent untuk perhitungan resmi.',
  },
];

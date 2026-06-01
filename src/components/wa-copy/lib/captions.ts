import { Heart, Hourglass, Wallet, Quote, ShieldCheck, Lightbulb } from 'lucide-react';
import type { CaptionCategory, CaptionEntry, CategoryMeta } from './types';

export const CAPTION_CATEGORIES: CategoryMeta<CaptionCategory>[] = [
  { value: 'sentuhan_hati', label: 'Sentuhan Hati', icon: Heart, tip: 'Sentuh emosi & kerinduan ke Baitullah. Cocok untuk audiens yang sudah lama berniat.' },
  { value: 'mumpung_sempat', label: 'Mumpung Sempat', icon: Hourglass, tip: 'Dorong urgensi tanpa menekan — selagi sehat, sempat, dan ada rezeki.' },
  { value: 'ringan_kantong', label: 'Ringan di Kantong', icon: Wallet, tip: 'Angkat sisi keterjangkauan & kemudahan cicilan. Pakai token {harga} agar akurat.' },
  { value: 'kata_jamaah', label: 'Kata Jamaah', icon: Quote, tip: 'Bangun kepercayaan lewat kesan jamaah. Hindari klaim angka yang berlebihan.' },
  { value: 'aman_tepercaya', label: 'Aman & Tepercaya', icon: ShieldCheck, tip: 'Tekankan legalitas, transparansi, dan pendampingan. Tutup dengan ajakan bertanya.' },
  { value: 'tips_info', label: 'Tips & Info', icon: Lightbulb, tip: 'Beri nilai dulu (tips/checklist), baru ajak konsultasi. Ringan dibagikan ulang.' },
];

export const CAPTION_SEED: CaptionEntry[] = [
  {
    id: 'cap-sentuhan-1',
    category: 'sentuhan_hati',
    packageAware: false,
    template:
      'Ada panggilan yang tak bisa ditunda — panggilan untuk hadir di Baitullah. 🕋\n\nKalau hati sudah rindu, jangan tunda lagi. Saya {nama} siap bantu wujudkan langkah pertama Anda.\n\n📲 Chat langsung: wa.me/{wa}\n🔗 Info lengkap: {link}',
    order: 1,
    active: true,
  },
  {
    id: 'cap-sentuhan-2',
    category: 'sentuhan_hati',
    packageAware: true,
    template:
      "Bayangkan berdiri di depan Ka'bah, air mata jatuh tanpa diminta... 🤍\n\nPaket {paket} berangkat {tanggal} bersama {maskapai}, {hari} penuh makna. Mulai {harga}.\n\nYuk, mulai dari niat. Hubungi saya, {nama} — wa.me/{wa}",
    order: 2,
    active: true,
  },
  {
    id: 'cap-mumpung-1',
    category: 'mumpung_sempat',
    packageAware: false,
    template:
      "Selagi sehat, selagi ada rezeki, selagi masih ada waktu — mumpung sempat. ⏳\n\nJangan tunggu 'nanti' yang belum tentu datang. Tanya-tanya dulu ke saya {nama}, gratis. wa.me/{wa}",
    order: 1,
    active: true,
  },
  {
    id: 'cap-mumpung-2',
    category: 'mumpung_sempat',
    packageAware: true,
    template:
      'Kuota terbatas, niat jangan ditunda. 🚪\n\nPaket {paket} keberangkatan {tanggal} ({hari}) sedang banyak diminati. Mulai {harga}.\n\nAmankan tempat Anda sekarang — {nama}, wa.me/{wa}',
    order: 2,
    active: true,
  },
  {
    id: 'cap-ringan-1',
    category: 'ringan_kantong',
    packageAware: true,
    template:
      'Umroh tak harus menunggu kaya dulu. 💸\n\nPaket {paket} mulai {harga}, sudah termasuk perjalanan {hari}. Bisa diatur, bisa dicicil — saya bantu carikan yang pas di kantong.\n\nNgobrol dulu yuk, {nama} — wa.me/{wa}',
    order: 1,
    active: true,
  },
  {
    id: 'cap-ringan-2',
    category: 'ringan_kantong',
    packageAware: false,
    template:
      'Niat ada, tinggal diatur caranya. 🙌\n\nSaya bantu susun rencana umroh yang ramah di kantong, tanpa ribet. Konsultasi gratis bersama {nama}: wa.me/{wa}\n🔗 {link}',
    order: 2,
    active: true,
  },
  {
    id: 'cap-jamaah-1',
    category: 'kata_jamaah',
    packageAware: false,
    template:
      '"Awalnya ragu, tapi semua diurus rapi dari awal sampai pulang." 🤍\n\nAlhamdulillah, satu lagi jamaah pulang dengan hati tenang. Insya Allah berikutnya giliran Anda.\n\nMau dengar cerita lengkapnya? Chat {nama} — wa.me/{wa}',
    order: 1,
    active: true,
  },
  {
    id: 'cap-jamaah-2',
    category: 'kata_jamaah',
    packageAware: false,
    template:
      'Kepercayaan jamaah adalah amanah yang saya jaga. 🙏\n\nTerima kasih sudah memercayakan perjalanan suci Anda. Doa terbaik selalu menyertai.\n\nIngin berangkat juga? Saya {nama} siap bantu. {link}',
    order: 2,
    active: true,
  },
  {
    id: 'cap-aman-1',
    category: 'aman_tepercaya',
    packageAware: false,
    template:
      'Perjalanan ibadah itu soal kepercayaan. 🛡️\n\nLegalitas resmi, proses transparan, pendampingan sampai tuntas — itu komitmen yang saya pegang.\n\nTanyakan apa pun ke saya {nama} — wa.me/{wa}\n🔗 {link}',
    order: 1,
    active: true,
  },
  {
    id: 'cap-aman-2',
    category: 'aman_tepercaya',
    packageAware: true,
    template:
      'Berangkat tenang, ibadah khusyuk. ✈️\n\nPaket {paket} bersama {maskapai}, keberangkatan {tanggal}, didampingi tim berpengalaman. Mulai {harga}.\n\nDetail lengkap dari saya, {nama}: wa.me/{wa}',
    order: 2,
    active: true,
  },
  {
    id: 'cap-tips-1',
    category: 'tips_info',
    packageAware: false,
    template:
      'Tips singkat sebelum umroh: siapkan dokumen jauh-jauh hari, jaga kesehatan, dan perbanyak doa. 📝\n\nButuh checklist lengkapnya? Saya kirimkan gratis. Chat {nama} — wa.me/{wa}',
    order: 1,
    active: true,
  },
  {
    id: 'cap-tips-2',
    category: 'tips_info',
    packageAware: true,
    template:
      'Mau tahu rincian paket {paket}? 📋\n\nBerangkat {tanggal}, durasi {hari}, maskapai {maskapai}, mulai {harga}. Saya jelaskan satu per satu biar Anda yakin.\n\n{nama} — wa.me/{wa} | {link}',
    order: 2,
    active: true,
  },
];

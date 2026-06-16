/**
 * Brochure "Prompt Generator" — merakit prompt siap-tempel ke ChatGPT untuk
 * membuat ulang brosur paket umroh dengan strip kontak agen.
 *
 * 100% deterministik (tanpa AI / tanpa backend): variasi datang dari data paket,
 * 3 perlakuan (variant), dan dropdown "Gaya desain". ChatGPT toh sudah melihat
 * gambar brosur yang dilampirkan agen, jadi tugas prompt cuma dua:
 *   1. instruksi yang jelas & stabil,
 *   2. menyuntik data akurat (nomor WA, harga) sebagai sumber kebenaran.
 */

export type BrochureVariant = 'keep' | 'redesign' | 'story';

/** Perlakuan brosur — dipakai sebagai segmented tabs di modal. */
export const VARIANTS: ReadonlyArray<{ value: BrochureVariant; label: string }> = [
  { value: 'keep', label: 'Pertahankan' },
  { value: 'redesign', label: 'Desain ulang' },
  { value: 'story', label: 'Story 9:16' },
];

/** Preset "Gaya desain" — value, label dropdown, dan frasa yang disuntik ke prompt. */
export const DESIGN_STYLES: ReadonlyArray<{ value: string; label: string; phrase: string }> = [
  { value: 'modern', label: 'Modern premium', phrase: 'modern, bersih, dan premium' },
  { value: 'elegan', label: 'Elegan emas', phrase: 'elegan dengan aksen emas dan kontras mewah' },
  { value: 'mewah', label: 'Mewah & dramatis', phrase: 'mewah dan dramatis dengan kontras serta pencahayaan tinggi' },
  { value: 'minimalis', label: 'Minimalis', phrase: 'minimalis dan bersih dengan banyak ruang kosong, fokus ke tipografi' },
  { value: 'cerah', label: 'Cerah & ceria', phrase: 'cerah, ceria, dan ramah' },
  { value: 'klasik', label: 'Klasik islami', phrase: 'klasik islami dengan ornamen arabesque dan nuansa hangat' },
];

export const RATIOS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '4:5', label: '4:5 (Feed)' },
  { value: '1:1', label: '1:1 (Kotak)' },
  { value: '9:16', label: '9:16 (Story)' },
];

/** Ringkasan data paket sebagai "sumber kebenaran" — hanya untuk brosur per-paket. */
export interface BrochurePromptPkg {
  nama: string;
  /** Tanggal keberangkatan, sudah diformat untuk dibaca (mis. "12 September 2026"). */
  tgl?: string;
  /** Baris harga siap-pakai (mis. "mulai Rp 30.500.000"). */
  harga?: string;
  /** Hotel Mekkah + bintang (mis. "Movenpick (★★★★★)"). */
  mekkah?: string;
  /** Hotel Madinah + bintang. */
  madinah?: string;
  maskapai?: string;
}

export interface BrochurePromptInput {
  agent: { name: string; phone: string; website: string };
  pkg?: BrochurePromptPkg | null;
  extra: { instagram?: string; alamat?: string; note?: string };
  variant: BrochureVariant;
  /** value dari DESIGN_STYLES */
  style: string;
  /** value dari RATIOS — diabaikan untuk variant 'story' (dipaksa 9:16). */
  ratio: string;
  reserveQr: boolean;
}

/** Format nomor WA `628…`/`08…` jadi `0812-3456-7890` yang enak dibaca (digit dipertahankan). */
export function formatWa(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  let nat = digits;
  if (nat.startsWith('62')) nat = '0' + nat.slice(2);
  else if (!nat.startsWith('0')) nat = '0' + nat;
  return nat.replace(/(\d{4})(\d{4})(\d+)/, '$1-$2-$3');
}

/** Rasio efektif — variant Story selalu 9:16, apa pun pilihan dropdown. */
export function effectiveRatio(variant: BrochureVariant, ratio: string): string {
  return variant === 'story' ? '9:16' : ratio;
}

export function buildBrochurePrompt(input: BrochurePromptInput): string {
  const { agent, pkg, extra, variant, style, ratio, reserveQr } = input;
  const wa = formatWa(agent.phone);
  const phrase = DESIGN_STYLES.find((s) => s.value === style)?.phrase ?? '';
  const ratioOut = effectiveRatio(variant, ratio);

  // ── Strip kontak ──
  const contact: string[] = [];
  if (agent.name?.trim()) contact.push(`• Nama: ${agent.name.trim()}`);
  if (wa) contact.push(`• WhatsApp: ${wa}`);
  if (agent.website?.trim()) contact.push(`• Website: ${agent.website.trim()}`);
  if (extra.instagram?.trim()) contact.push(`• Instagram: ${extra.instagram.trim()}`);
  if (extra.alamat?.trim()) contact.push(`• Alamat: ${extra.alamat.trim()}`);

  // ── Kalimat pembuka per perlakuan ──
  const stylePhrase = phrase ? ` Gaya visual: ${phrase}.` : '';
  let intro: string;
  let goals = '';
  if (variant === 'keep') {
    intro =
      'Tolong EDIT gambar brosur paket umroh yang saya lampirkan. Pertahankan seluruh ' +
      'desain, tata letak, warna, foto, dan semua teks (harga, tanggal, hotel, maskapai) ' +
      `PERSIS seperti aslinya — jangan diubah, jangan diketik ulang.${stylePhrase}`;
  } else {
    const isStory = variant === 'story';
    intro =
      'Kamu adalah senior graphic designer spesialis materi promosi umroh & haji. Saya lampirkan ' +
      'sebuah brosur paket umroh sebagai ACUAN ISI (bukan untuk ditiru mentah-mentah). ' +
      (isStory
        ? 'Susun ulang isinya menjadi konten vertical story 9:16 untuk Instagram/WhatsApp Story '
        : 'Rancang ULANG menjadi sebuah poster promosi ') +
      'yang jauh lebih menarik, modern, dan premium dari aslinya — tingkatkan kualitas komposisi, ' +
      `hierarki visual, tipografi, dan warna.${stylePhrase}`;
    goals =
      'Sasaran desain (buat eye-catching & layak dibagikan di Instagram/WhatsApp):\n' +
      '- Headline kuat dengan hierarki jelas: nama paket → harga → tanggal keberangkatan → fasilitas utama.\n' +
      "- Visual Tanah Suci yang elegan (Ka'bah / Masjid Nabawi / Kubah Hijau), ornamen islami halus, latar bergradien premium.\n" +
      '- Tipografi modern yang mudah dibaca, ikon kecil untuk tiap fasilitas, dan ajakan menghubungi agen yang jelas.';
  }

  // ── Data acuan (sumber kebenaran — jaga akurasi meski desain diubah total) ──
  let dataBlock = '';
  if (pkg) {
    const parts: string[] = [];
    if (pkg.tgl) parts.push(`berangkat ${pkg.tgl}`);
    if (pkg.harga) parts.push(pkg.harga);
    const hotelBits: string[] = [];
    if (pkg.mekkah) hotelBits.push(`Mekkah ${pkg.mekkah}`);
    if (pkg.madinah) hotelBits.push(`Madinah ${pkg.madinah}`);
    if (hotelBits.length) parts.push(`hotel ${hotelBits.join(' / ')}`);
    if (pkg.maskapai) parts.push(`maskapai ${pkg.maskapai}`);
    const detail = parts.length ? ` — ${parts.join(', ')}` : '';
    dataBlock =
      'WAJIB AKURAT — pakai data ini sebagai sumber kebenaran, JANGAN mengubah atau mengarang angka:\n' +
      `${pkg.nama}${detail}.`;
  }

  // ── Strip kontak ──
  const contactBlock = 'Tambahkan strip kontak agen di bagian bawah, rapi dan menonjol:\n' + contact.join('\n');

  // ── Ketentuan ──
  const rules: string[] = [
    '- Bahasa Indonesia; pastikan tidak ada teks yang salah eja.',
    `- Tulis nomor WhatsApp PERSIS, digit per digit: ${wa || '(isi nomor WhatsApp)'} — periksa tiap digit.`,
  ];
  if (reserveQr) {
    rules.push('- Sisakan kotak putih ±2,5 cm di sisi kanan strip kontak untuk QR code (saya tempel sendiri).');
  }
  rules.push(`- Rasio ${ratioOut}, resolusi tinggi dan tajam (kualitas siap cetak).`);
  if (extra.note?.trim()) rules.push(`- ${extra.note.trim()}`);

  const sections = [intro, goals, dataBlock, contactBlock, `Ketentuan:\n${rules.join('\n')}`].filter(Boolean);
  return sections.join('\n\n');
}

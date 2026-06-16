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
  { value: 'asli', label: 'Sesuai aslinya', phrase: '' },
  { value: 'elegan', label: 'Elegan emas', phrase: 'dengan nuansa elegan dan aksen warna emas' },
  { value: 'mewah', label: 'Mewah modern', phrase: 'dengan kesan mewah dan modern' },
  { value: 'minimalis', label: 'Minimalis bersih', phrase: 'dengan gaya minimalis yang bersih dan rapi' },
  { value: 'cerah', label: 'Cerah & ceria', phrase: 'dengan palet warna cerah dan ceria' },
  { value: 'klasik', label: 'Klasik islami', phrase: 'dengan ornamen islami klasik (arabesque)' },
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
  let intro: string;
  if (variant === 'keep') {
    intro =
      'Tolong EDIT gambar brosur paket umroh yang saya lampirkan. Pertahankan seluruh ' +
      'desain, tata letak, warna, foto, dan semua teks (harga, tanggal, hotel, maskapai) ' +
      'PERSIS seperti aslinya — jangan diubah, jangan diketik ulang, jangan dirapikan.';
  } else if (variant === 'redesign') {
    intro =
      `Tolong BUAT ULANG brosur paket umroh yang saya lampirkan${phrase ? ' ' + phrase : ''}, ` +
      'tetapi pertahankan SEMUA informasi (harga, tanggal, hotel, maskapai) sama persis. ' +
      'Gunakan data acuan di bawah sebagai sumber kebenaran.';
  } else {
    intro =
      'Tolong SUSUN ULANG konten brosur yang saya lampirkan menjadi format vertical story ' +
      `9:16 untuk Instagram/WhatsApp Story${phrase ? ' ' + phrase : ''}, dengan semua ` +
      'informasi sama persis. Gunakan data acuan di bawah sebagai sumber kebenaran.';
  }

  // Untuk perlakuan "Pertahankan", gaya desain hanya mempengaruhi strip kontak (brosur tak diubah).
  const stripStyle = variant === 'keep' && phrase ? ` (buat strip kontak ${phrase})` : '';
  const contactBlock =
    'Tambahkan strip kontak agen di bagian bawah brosur (perlebar kanvas ke bawah bila ' +
    `perlu), dengan latar senada brosur dan teks besar yang terbaca jelas${stripStyle}:\n` +
    contact.join('\n');

  // ── Aturan ──
  const rules: string[] = [
    `- Tulis nomor WhatsApp PERSIS, digit per digit: ${wa || '(isi nomor WhatsApp)'} — jangan menebak dari gambar.`,
  ];
  if (reserveQr) {
    rules.push('- Sisakan kotak putih ±2,5 cm di sisi kanan strip kontak untuk QR code (saya tempel sendiri).');
  }
  rules.push('- Bahasa Indonesia. Jangan menambah logo, teks, atau klaim promosi lain yang tidak diminta.');
  rules.push(`- Output rasio ${ratioOut}, resolusi tinggi dan tajam.`);
  if (extra.note?.trim()) rules.push(`- ${extra.note.trim()}`);

  // ── Data acuan (hanya brosur per-paket) ──
  let ref = '';
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
    ref = `\n\nData acuan paket (jangan mengarang angka): ${pkg.nama}${detail}.`;
  }

  return `${intro}\n\n${contactBlock}\n\nAturan:\n${rules.join('\n')}${ref}`;
}

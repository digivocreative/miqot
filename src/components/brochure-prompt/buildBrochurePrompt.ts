/**
 * Brochure "Prompt Generator" — merakit prompt siap-tempel ke ChatGPT untuk
 * membuat ulang brosur paket umroh dengan strip kontak agen.
 *
 * 100% deterministik (tanpa AI / tanpa backend): variasi datang dari data paket,
 * 3 perlakuan (variant), dan 12 preset "Gaya desain". ChatGPT toh sudah melihat
 * gambar brosur yang dilampirkan agen, jadi tugas prompt cuma dua:
 *   1. instruksi yang jelas & stabil,
 *   2. menyuntik data akurat (nomor WA, harga) sebagai sumber kebenaran.
 */

export type BrochureVariant = 'keep' | 'redesign' | 'story';

/** Jenis materi — tab di modal: 'brosur' (poster lengkap) vs 'banner' (iklan, teks minim). */
export type BrochureKind = 'brosur' | 'banner';

/** Perlakuan brosur — dipakai sebagai segmented tabs di modal. */
export const VARIANTS: ReadonlyArray<{ value: BrochureVariant; label: string }> = [
  { value: 'keep', label: 'Pertahankan' },
  { value: 'redesign', label: 'Desain ulang' },
  { value: 'story', label: 'Story 9:16' },
];

/** Preset "Gaya desain" — value, label dropdown, dan frasa yang disuntik ke prompt. */
export const DESIGN_STYLES: ReadonlyArray<{ value: string; label: string; phrase: string }> = [
  { value: 'modern', label: 'Modern premium', phrase: 'modern premium dengan palet emerald–ivory, grid terstruktur, tipografi sans-serif berkelas, dan depth lembut' },
  { value: 'elegan', label: 'Elegan emas', phrase: 'elegan dengan palet ivory, hitam, dan aksen emas metalik yang subtil; komposisi simetris dan mewah' },
  { value: 'mewah', label: 'Mewah & dramatis', phrase: 'luxury dramatic dengan palet midnight, spotlight sinematik, kontras tinggi, dan layering visual yang dalam' },
  { value: 'minimalis', label: 'Minimalis', phrase: 'minimalis editorial dengan banyak ruang kosong, satu hero image kuat, palet terbatas, dan fokus pada tipografi' },
  { value: 'cerah', label: 'Cerah & ceria', phrase: 'cerah, optimistis, dan ramah dengan palet sky blue, teal, dan coral; bentuk organik serta pencahayaan segar' },
  { value: 'klasik', label: 'Klasik islami', phrase: 'klasik islami dengan palet krem–emerald–emas, geometri arabesque halus, bingkai ornamental, dan nuansa hangat' },
  { value: 'cinematic', label: 'Cinematic malam', phrase: 'cinematic malam bernuansa navy–amber, cahaya dramatis, atmosfer Tanah Suci yang emosional, dan depth fotografis' },
  { value: 'editorial', label: 'Editorial magazine', phrase: 'editorial ala majalah travel premium dengan grid asimetris, skala tipografi berani, crop foto artistik, dan caption rapi' },
  { value: 'earthy', label: 'Natural earthy', phrase: 'natural earthy dengan palet pasir, terracotta, olive, dan krem; tekstur kertas lembut serta suasana hangat autentik' },
  { value: 'monochrome', label: 'Monokrom bold', phrase: 'monokrom hitam–putih yang bold dengan satu aksen emerald, tipografi tegas, kontras tajam, dan komposisi grafis' },
  { value: 'futuristic', label: 'Futuristik glass', phrase: 'futuristik elegan dengan glassmorphism terkontrol, gradasi teal–indigo, glow halus, garis cahaya, dan panel transparan yang tetap terbaca' },
  { value: 'pastel', label: 'Pastel lembut', phrase: 'pastel lembut dengan palet sage, biru muda, lilac, dan krem; gradasi airy, bentuk membulat, dan suasana menenangkan' },
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
  /** Harga paket; builder menormalkannya menjadi format seperti "mulai Rp 30.5 Juta". */
  harga?: string;
  /** Hotel Mekkah + bintang (mis. "Movenpick (★★★★★)"). */
  mekkah?: string;
  /** Hotel Madinah + bintang. */
  madinah?: string;
  maskapai?: string;
}

/** Satu baris paket dalam brosur jadwal/filter bulanan. */
export interface BrochurePromptSchedulePackage {
  nama: string;
  /** Tanggal keberangkatan, sudah diformat untuk dibaca. */
  tgl?: string;
  /** Durasi perjalanan dalam hari. */
  hari?: number | null;
  /** Sisa seat bila brosur sedang memakai mode SEAT. */
  seatSisa?: number | null;
  /** Harga paket; builder menormalkannya menjadi format seperti "mulai Rp 33.9 Juta". */
  harga?: string;
  maskapai?: string;
  landing?: string;
  /** Hotel ringkas, mis. "Makkah: Movenpick (★★★★★)". */
  hotel?: string[];
  soldOut?: boolean;
}

/** Ringkasan sumber kebenaran untuk brosur jadwal berisi banyak paket. */
export interface BrochurePromptSchedule {
  title: string;
  filterLabel?: string;
  pageIndex?: number;
  pageCount?: number;
  displayMode?: 'hari' | 'seat';
  packages: BrochurePromptSchedulePackage[];
  truncatedCount?: number;
}

export interface BrochurePromptInput {
  agent: { name: string; phone: string; website: string };
  pkg?: BrochurePromptPkg | null;
  schedule?: BrochurePromptSchedule | null;
  /** URL publik gambar brosur referensi. Dipakai untuk percobaan tanpa upload manual di ChatGPT. */
  referenceImageUrl?: string | null;
  /** explicit = tulis kontak dari profil; attached = pakai kontak yang sudah ada di gambar terlampir. */
  contactSource?: 'explicit' | 'attached';
  extra: { instagram?: string; alamat?: string; note?: string };
  variant: BrochureVariant;
  /** Jenis materi: brosur (poster lengkap) atau banner (iklan, teks minim). */
  kind: BrochureKind;
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

/** Rapikan nama paket agar tak tersingkat: "REGULER 9HR" / "9 HR" → "REGULER 9 HARI". */
export function normalizePackageName(nama: string): string {
  return (nama || '')
    .replace(/(\d+)\s*HR\b/gi, '$1 HARI')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Ringkas denominasi harga untuk materi promosi: `Rp 39.400.000` → `Rp 39.4 Juta`.
 * Titik selalu dipakai sebagai pemisah desimal agar hasil gambar konsisten dengan
 * contoh yang diberikan ke model, terlepas dari format angka pada sumber data.
 */
export function formatBrochurePrice(raw: string | number | null | undefined): string | undefined {
  if (raw == null) return undefined;
  const source = String(raw).trim();
  if (!source) return undefined;

  const hasStartingPricePrefix = /\bmulai\b/i.test(source);
  let millions: number;

  if (typeof raw === 'number') {
    millions = raw / 1_000_000;
  } else if (/\b(?:juta|jt)\b/i.test(source)) {
    const match = source.match(/\d+(?:[.,]\d+)?/);
    if (!match) return source;
    millions = Number(match[0].replace(',', '.'));
  } else {
    const digits = source.replace(/\D/g, '');
    if (!digits) return source;
    millions = Number(digits) / 1_000_000;
  }

  if (!Number.isFinite(millions) || millions <= 0) return undefined;
  const compact = (Math.round(millions * 10) / 10).toFixed(1);
  return `${hasStartingPricePrefix ? 'mulai ' : ''}Rp ${compact} Juta`;
}

const PRICE_FORMAT_RULE =
  '- FORMAT HARGA WAJIB memakai denominasi jutaan: tulis “Rp 39.4 Juta” (atau “mulai Rp 39.4 Juta”), BUKAN “Rp 39.400.000”. Gunakan titik sebagai pemisah desimal dan selalu tampilkan satu angka desimal.';

function buildScheduleDataBlock(schedule?: BrochurePromptSchedule | null): string {
  if (!schedule || !schedule.packages?.length) return '';
  const title = normalizePackageName(schedule.title || 'Brosur jadwal paket umroh');
  const meta: string[] = [];
  if (schedule.filterLabel?.trim()) meta.push(`filter ${schedule.filterLabel.trim()}`);
  if (schedule.pageIndex && schedule.pageCount && schedule.pageCount > 1) {
    meta.push(`halaman ${schedule.pageIndex} dari ${schedule.pageCount}`);
  }
  if (schedule.displayMode === 'seat') meta.push('brosur menampilkan sisa seat');

  const packageLines = schedule.packages.map((p, i) => {
    const details: string[] = [];
    if (p.tgl) details.push(`berangkat ${p.tgl}`);
    if (typeof p.hari === 'number' && p.hari > 0) details.push(`${p.hari} hari`);
    if (typeof p.seatSisa === 'number' && p.seatSisa >= 0) details.push(`${p.seatSisa} seat`);
    const compactPrice = formatBrochurePrice(p.harga);
    if (compactPrice) details.push(`harga ${compactPrice}`);
    if (p.maskapai) details.push(`maskapai ${p.maskapai}`);
    if (p.landing) details.push(`landing ${p.landing}`);
    if (p.hotel?.length) details.push(`hotel ${p.hotel.join(' / ')}`);
    if (p.soldOut) details.push('SOLD OUT');
    const suffix = details.length ? ` — ${details.join(', ')}` : '';
    return `${i + 1}. ${normalizePackageName(p.nama)}${suffix}`;
  });

  if (schedule.truncatedCount && schedule.truncatedCount > 0) {
    packageLines.push(`Catatan: ${schedule.truncatedCount} paket lain tidak tampil di halaman ini.`);
  }

  return [
    'WAJIB AKURAT — brosur ini berisi beberapa paket. Pakai data berikut sebagai sumber kebenaran, jangan mengubah atau mengarang angka:',
    `Materi: ${title}${meta.length ? ` (${meta.join(', ')})` : ''}.`,
    `Daftar paket:\n${packageLines.join('\n')}`,
    'Jika ruang desain terbatas, ringkas tampilannya tetapi jangan menghapus harga/tanggal utama dari paket yang terlihat.',
  ].join('\n');
}

/**
 * ChatGPT dapat mengubah teks native-share yang terlalu panjang menjadi
 * attachment. Jaga prompt ringkas agar instruksi tetap mudah dipakai bersama
 * gambar brosur yang dibagikan.
 */
export const CHATGPT_NATIVE_SHARE_TEXT_LIMIT = 5_000;
export const CHATGPT_NATIVE_SHARE_SAFE_BUDGET = 1_800;

/**
 * Satu payload Web Share untuk dikirim ke ChatGPT melalui native share sheet.
 * `title` sengaja tidak ditambahkan agar iOS tidak membuat activity item ketiga;
 * gambar dan prompt tetap ikut dalam request yang sama.
 */
export function buildImageAndPromptShareData(file: File, prompt: string): ShareData {
  if (!file || !file.type.startsWith('image/')) throw new Error('native-share-image-required');
  const text = prompt?.trim();
  if (!text) throw new Error('native-share-prompt-required');
  if (text.length > CHATGPT_NATIVE_SHARE_TEXT_LIMIT) throw new Error('native-share-prompt-too-long');
  return { files: [file], text };
}

export function buildNativeSharePrompt(input: BrochurePromptInput): string {
  const { agent, pkg, schedule, contactSource = 'explicit', extra, kind, style, ratio, variant } = input;
  const selectedStyle = DESIGN_STYLES.find((item) => item.value === style) ?? DESIGN_STYLES[0];
  const ratioOut = effectiveRatio(variant, ratio);
  const wa = formatWa(agent.phone);
  const useAttachedContact = contactSource === 'attached';

  const task = kind === 'banner'
    ? 'Buat SATU banner iklan umroh yang scroll-stopping dari gambar terlampir: headline, sub-headline, 2–4 benefit faktual, harga, dan kontak.'
    : schedule
      ? 'Buat ulang brosur jadwal pada gambar terlampir menjadi SATU vertical story 9:16 yang premium, visual-rich, dan terbaca jelas di HP.'
      : 'Rancang ulang brosur pada gambar terlampir menjadi SATU poster promosi yang lebih menarik, modern, premium, dan terbaca jelas di HP.';

  const sourceHint = schedule
    ? `SUMBER — baca dan pertahankan SEMUA ${schedule.packages.length} baris paket dari gambar secara akurat${schedule.title ? ` (${normalizePackageName(schedule.title).slice(0, 160)})` : ''}.`
    : pkg
      ? `SUMBER — gambar terlampir + data utama: ${[
          normalizePackageName(pkg.nama).slice(0, 160),
          pkg.tgl,
          formatBrochurePrice(pkg.harga),
          pkg.maskapai?.slice(0, 80),
        ].filter(Boolean).join(' | ')}.`
      : 'SUMBER — baca dan pertahankan semua informasi pada gambar terlampir secara akurat.';

  const contact = useAttachedContact
    ? 'KONTAK — pertahankan nama, WhatsApp, website/logo dari gambar.'
    : `KONTAK — ${[
        agent.name?.trim().slice(0, 100),
        wa,
        agent.website?.trim().slice(0, 120),
        extra.instagram?.trim().slice(0, 80),
        extra.alamat?.trim().slice(0, 160),
      ].filter(Boolean).join(' | ')}.`;

  const promptSections = [
    task,
    `GAYA — ${selectedStyle.label}: ${selectedStyle.phrase}.`,
    sourceHint,
    'AKURASI — jangan mengubah angka atau mengarang diskon, tanggal, hotel, maskapai, fasilitas, maupun klaim.',
    'HARGA — ubah “Rp 39.400.000” menjadi “Rp 39.4 Juta” (titik, satu desimal).',
    contact,
    `OUTPUT — rasio ${ratioOut}, Bahasa Indonesia, ejaan benar, hierarki jelas, safe margin, resolusi tinggi; bukan mockup/kolase, tanpa watermark AI atau penjelasan di luar artwork.`,
    extra.note?.trim() ? `CATATAN — ${extra.note.trim().slice(0, 180)}` : '',
  ].filter(Boolean);
  const prompt = promptSections.join('\n\n');
  if (prompt.length <= CHATGPT_NATIVE_SHARE_SAFE_BUDGET) return prompt;

  // Defensive fallback: never cut a sentence or data field mid-way. Optional note
  // and the long style description are removed first while all core instructions stay.
  return [
    task,
    `GAYA — ${selectedStyle.label}.`,
    sourceHint,
    'AKURASI — jangan mengubah angka atau mengarang fakta yang tidak ada pada gambar.',
    'HARGA — ubah “Rp 39.400.000” menjadi “Rp 39.4 Juta” (titik, satu desimal).',
    contact,
    `OUTPUT — rasio ${ratioOut}, Bahasa Indonesia, terbaca jelas di HP, satu artwork tanpa mockup atau watermark AI.`,
  ].join('\n\n');
}

export function buildBrochurePrompt(input: BrochurePromptInput): string {
  const { agent, pkg, schedule, referenceImageUrl, contactSource = 'explicit', extra, variant, kind, style, ratio, reserveQr } = input;
  const wa = formatWa(agent.phone);
  const selectedStyle = DESIGN_STYLES.find((s) => s.value === style) ?? DESIGN_STYLES[0];
  const stylePhrase = `\nArah gaya terpilih — ${selectedStyle.label} (WAJIB konsisten): ${selectedStyle.phrase}.`;
  const ratioOut = effectiveRatio(variant, ratio);
  const useAttachedContact = contactSource === 'attached';
  const referenceUrl = typeof referenceImageUrl === 'string' ? referenceImageUrl.trim() : '';
  const referenceBlock = referenceUrl
    ? [
        'Link brosur referensi:',
        referenceUrl,
        'Buka dan baca gambar dari link ini sebagai acuan visual/isi. Jika link tidak bisa dibuka, jangan mengarang detail dari gambar; minta saya upload brosurnya.',
      ].join('\n')
    : '';

  // ── Strip kontak ──
  const contact: string[] = [];
  if (!useAttachedContact) {
    if (agent.name?.trim()) contact.push(`• Nama: ${agent.name.trim()}`);
    if (wa) contact.push(`• WhatsApp: ${wa}`);
    if (agent.website?.trim()) contact.push(`• Website: ${agent.website.trim()}`);
    if (extra.instagram?.trim()) contact.push(`• Instagram: ${extra.instagram.trim()}`);
    if (extra.alamat?.trim()) contact.push(`• Alamat: ${extra.alamat.trim()}`);
  }

  // ════ BANNER ADS — sengaja MINIM teks; beda total dari brosur ════
  if (kind === 'banner') {
    const introB =
      'Kamu adalah senior art director iklan digital. ' +
      (referenceUrl
        ? 'Saya sematkan link brosur paket umroh di bawah '
        : 'Saya lampirkan sebuah brosur paket umroh ') +
      'HANYA sebagai acuan isi. Buatkan sebuah BANNER IKLAN (ad creative) yang scroll-stopping ' +
      `untuk Instagram/Facebook Ads — INI BUKAN brosur.${stylePhrase}`;
    const goalsB =
      'Aturan banner iklan (WAJIB):\n' +
      '- Teks ringkas tapi MENJUAL (BUKAN brosur): 1 HEADLINE utama, 1 SUB-HEADLINE pendek, ' +
      '2–4 BENEFIT singkat (poin/ikon, masing-masing 2–4 kata), harga, serta nama & WhatsApp agen. ' +
      'DILARANG menaruh tanggal, itinerary, paragraf panjang, atau tombol/CTA.\n' +
      '- HEADLINE harus MENARIK & menggugah — emosional / hook / urgensi (mis. rindu Baitullah, ' +
      'panggilan ke Tanah Suci, kesempatan terbatas), BUKAN sekadar menyalin nama paket.\n' +
      '- SUB-HEADLINE pendek mendukung headline (boleh memuat nama paket / keunggulan utama).\n' +
      '- BENEFIT berupa poin singkat & menjual (mis. "Hotel ⭐5 dekat Masjid", "Penerbangan langsung", ' +
      '"Bimbingan ibadah", "Kuota terbatas") — olah dari keunggulan paket di bawah, JANGAN mengarang fakta/angka.\n' +
      "- Satu fokus visual yang kuat & memukau (Ka'bah / Masjid Nabawi / suasana Tanah Suci), komposisi rapi & lega.\n" +
      '- Hierarki: visual dominan → headline → sub-headline → benefit singkat → harga.\n' +
      '- Tetap berhenti-scroll & terbaca cepat; layak jadi materi iklan berbayar.';
    let dataB = '';
    if (pkg) {
      const compactPrice = formatBrochurePrice(pkg.harga);
      const hl: string[] = [];
      if (pkg.mekkah) hl.push(`hotel Mekkah ${pkg.mekkah}`);
      if (pkg.madinah) hl.push(`hotel Madinah ${pkg.madinah}`);
      if (pkg.maskapai) hl.push(`maskapai ${pkg.maskapai}`);
      dataB =
        'Pakai data ini (akurat, jangan diubah atau dikarang):\n' +
        `- Paket: ${normalizePackageName(pkg.nama)}` +
        `${compactPrice ? `\n- Harga: ${compactPrice}` : ''}` +
        `${hl.length ? `\n- Keunggulan (olah jadi 2–4 benefit singkat): ${hl.join('; ')}` : ''}\n` +
        'Jangan menulis tanggal/itinerary atau detail bertele-tele — ringkas jadi poin benefit yang menjual.';
    } else if (schedule) {
      dataB =
        buildScheduleDataBlock(schedule) + '\n' +
        'Untuk banner iklan, jangan menulis ulang semua paket. Ambil hook utama dari harga mulai, bulan/filter, dan 2–3 paket paling menarik.';
    }
    const contactB: string[] = [];
    if (!useAttachedContact) {
      if (agent.name?.trim()) contactB.push(`• Nama: ${agent.name.trim()}`);
      if (wa) contactB.push(`• WhatsApp: ${wa}`);
      if (agent.website?.trim()) contactB.push(`• Website: ${agent.website.trim()}`);
    }
    const rulesB: string[] = [
      '- Bahasa Indonesia; teks sesedikit mungkin dan tidak ada yang salah eja.',
      PRICE_FORMAT_RULE,
      '- Hasil akhir berupa satu artwork banner utuh, tanpa mockup perangkat, tanpa penjelasan, dan tanpa watermark buatan AI.',
      `- Rasio ${ratioOut}, resolusi tinggi dan tajam.`,
    ];
    if (useAttachedContact) {
      rulesB.splice(1, 0, '- Info kontak agen sudah ada di gambar terlampir; pertahankan nama, WhatsApp, website/logo dari gambar secara akurat, jangan menambah kontak baru.');
    } else {
      rulesB.splice(1, 0, `- Tulis nomor WhatsApp PERSIS, digit per digit: ${wa || '(isi nomor WhatsApp)'} — periksa tiap digit.`);
    }
    if (extra.note?.trim()) rulesB.push(`- ${extra.note.trim()}`);
    return [
      introB,
      goalsB,
      referenceBlock,
      dataB,
      useAttachedContact
        ? 'Kontak agen: ambil dari gambar brosur yang saya lampirkan, pertahankan secara akurat dan rapi.'
        : `Cantumkan kontak agen secara kecil & rapi (jangan dominan):\n${contactB.join('\n')}`,
      `Ketentuan:\n${rulesB.join('\n')}`,
    ].filter(Boolean).join('\n\n');
  }

  // ════ BROSUR — rancang ulang poster premium (default) ════
  let intro: string;
  let goals = '';
  if (schedule && variant !== 'keep') {
    intro =
      'Kamu adalah senior creative director untuk kampanye umroh premium. ' +
      (referenceUrl
        ? 'Saya sematkan link brosur jadwal paket umroh di bawah sebagai ACUAN ISI, lalu '
        : 'Saya lampirkan brosur jadwal paket umroh sebagai ACUAN ISI, lalu ') +
      'saya ingin kamu membuat ulang menjadi desain vertical story 9:16 yang jauh lebih visual-rich, cinematic, dan eye-catching. Jangan meniru mentah-mentah; naikkan level komposisi, depth, pencahayaan, tipografi, dan rasa premium-nya.' +
      stylePhrase;
    goals =
      'Arah visual yang wajib terasa:\n' +
      "- Jadikan ini materi promosi yang kuat untuk WhatsApp Story/Instagram Story: frame pertama harus langsung menarik perhatian.\n" +
      "- Gunakan visual Tanah Suci yang megah dan emosional (Ka'bah, Masjid Nabawi, siluet jamaah, cahaya matahari/golden hour, tekstur islami halus) dengan layering yang kaya, bukan background polos.\n" +
      '- Buat hierarki tajam: judul besar → highlight faktual → tabel/list paket yang tetap terbaca → kontak.\n' +
      '- Desain boleh editorial dan modern: badge tanggal, price chips, icon kecil, divider elegan, glass/metallic accent secukupnya, ruang napas tetap rapi.\n' +
      '- Prioritaskan keterbacaan di layar HP; pertahankan safe margin, jangan menumpuk teks, jangan membuat tabel terlalu kecil, dan jangan mengarang data.\n' +
      '- Hasilkan satu artwork final yang memenuhi frame, bukan mockup, bukan kolase alternatif, dan tanpa penjelasan di luar desain.';
  } else if (variant === 'keep') {
    intro =
      (referenceUrl
        ? 'Tolong EDIT gambar brosur paket umroh dari link referensi di bawah. Pertahankan seluruh '
        : 'Tolong EDIT gambar brosur paket umroh yang saya lampirkan. Pertahankan seluruh ') +
      'desain, tata letak, warna, foto, dan semua teks (harga, tanggal, hotel, maskapai) ' +
      `PERSIS seperti aslinya — jangan diubah, jangan diketik ulang.${stylePhrase}`;
  } else {
    const isStory = variant === 'story';
    intro =
      'Kamu adalah senior graphic designer spesialis materi promosi umroh & haji. ' +
      (referenceUrl
        ? 'Saya sematkan link brosur paket umroh di bawah sebagai ACUAN ISI (bukan untuk ditiru mentah-mentah). '
        : 'Saya lampirkan sebuah brosur paket umroh sebagai ACUAN ISI (bukan untuk ditiru mentah-mentah). ') +
      (isStory
        ? 'Susun ulang isinya menjadi konten vertical story 9:16 untuk Instagram/WhatsApp Story '
        : 'Rancang ULANG menjadi sebuah poster promosi ') +
      'yang jauh lebih menarik, modern, dan premium dari aslinya — tingkatkan kualitas komposisi, ' +
      `hierarki visual, tipografi, dan warna.${stylePhrase}`;
    goals =
      'Sasaran desain (buat eye-catching & layak dibagikan di Instagram/WhatsApp):\n' +
      '- Headline kuat dengan hierarki jelas: nama paket → harga → tanggal keberangkatan → fasilitas utama.\n' +
      "- Visual Tanah Suci yang elegan (Ka'bah / Masjid Nabawi / Kubah Hijau), ornamen islami halus, latar bergradien premium.\n" +
      '- Tipografi modern yang mudah dibaca, ikon kecil untuk tiap fasilitas, dan ajakan menghubungi agen yang jelas.\n' +
      '- Pertahankan safe margin; hasil akhir harus satu artwork poster utuh, tanpa mockup, tanpa variasi berdampingan, dan tanpa watermark buatan AI.';
  }

  // ── Data acuan (sumber kebenaran — jaga akurasi meski desain diubah total) ──
  let dataBlock = '';
  if (pkg) {
    const parts: string[] = [];
    if (pkg.tgl) parts.push(`berangkat ${pkg.tgl}`);
    const compactPrice = formatBrochurePrice(pkg.harga);
    if (compactPrice) parts.push(compactPrice);
    const hotelBits: string[] = [];
    if (pkg.mekkah) hotelBits.push(`Mekkah ${pkg.mekkah}`);
    if (pkg.madinah) hotelBits.push(`Madinah ${pkg.madinah}`);
    if (hotelBits.length) parts.push(`hotel ${hotelBits.join(' / ')}`);
    if (pkg.maskapai) parts.push(`maskapai ${pkg.maskapai}`);
    const detail = parts.length ? ` — ${parts.join(', ')}` : '';
    dataBlock =
      'WAJIB AKURAT — pakai data ini sebagai sumber kebenaran, JANGAN mengubah atau mengarang angka:\n' +
      `${normalizePackageName(pkg.nama)}${detail}.`;
  } else if (schedule) {
    dataBlock = buildScheduleDataBlock(schedule);
  }

  // ── Strip kontak ──
  const contactBlock = useAttachedContact
    ? 'Info kontak agen sudah ada di brosur terlampir. Pertahankan strip kontak dari gambar secara akurat (nama, WhatsApp, website/logo), rapikan posisinya bila perlu, tetapi jangan mengubah nomor atau menambahkan kontak baru.'
    : 'Tambahkan strip kontak agen di bagian bawah, rapi dan menonjol:\n' + contact.join('\n');

  // ── Ketentuan ──
  const rules: string[] = [
    '- Bahasa Indonesia; pastikan tidak ada teks yang salah eja.',
    PRICE_FORMAT_RULE,
    '- Salin semua fakta dari blok sumber kebenaran secara presisi. Jangan menambah diskon, tanggal, hotel, maskapai, fasilitas, atau klaim yang tidak diberikan.',
    '- Pastikan teks penting kontras dan terbaca pada layar ponsel; jangan menaruh teks terlalu dekat tepi artwork.',
  ];
  if (useAttachedContact) {
    rules.push('- Jangan menulis ulang kontak dari profil lain; gunakan kontak yang terlihat di gambar referensi.');
  } else {
    rules.push(`- Tulis nomor WhatsApp PERSIS, digit per digit: ${wa || '(isi nomor WhatsApp)'} — periksa tiap digit.`);
  }
  if (reserveQr) {
    rules.push('- Sisakan kotak putih ±2,5 cm di sisi kanan strip kontak untuk QR code (saya tempel sendiri).');
  }
  rules.push(`- Rasio ${ratioOut}, resolusi tinggi dan tajam (kualitas siap cetak).`);
  if (extra.note?.trim()) rules.push(`- ${extra.note.trim()}`);

  const sections = [intro, goals, referenceBlock, dataBlock, contactBlock, `Ketentuan:\n${rules.join('\n')}`].filter(Boolean);
  return sections.join('\n\n');
}

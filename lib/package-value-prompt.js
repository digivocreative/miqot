// Grounded prompt + parser untuk fitur "Nilai Plus Paket".
// File ini sengaja murni (tanpa akses DB) supaya kontrak AI dapat dites tanpa
// menjalankan server atau memanggil OpenAI.

export const PACKAGE_VALUE_PROMPT_VERSION = '2026-07-17-v7-styled-experiential-adfit';
export const MAX_PACKAGE_VALUE_ADVANTAGES = 3;

const ALLOWED_SOURCES = new Set(['brosur', 'itinerary']);
const HEADLINE_STOP_WORDS = new Set([
  'dan', 'dengan', 'di', 'ke', 'lebih', 'paket', 'perjalanan', 'rasakan', 'satu',
  'umroh', 'untuk', 'yang',
]);
const GENERIC_UMROH_ACTIVITY_PATTERN = /(?:ziarah (?:di |kota )?madinah|makam rasulullah|makam (?:para )?sahabat|tiba di (?:bandara|hotel)|check[ -]?in|makan (?:pagi|siang|malam)|istirahat|shalat rutin|ibadah di masjidil haram|manasik umroh)/i;
const DISTINCTIVE_VALUE_PATTERN = /(?:kereta cepat|haramain|piramida|giza|cairo|kairo|thaif|taif|badar|aqsha|al aqsa|istanbul|bursa|cappadocia|kapadokia|dubai|haikou|petra|alexandria)/i;

/**
 * Preset arah desain untuk prompt banner. Setiap generate memakai satu preset
 * sehingga hasil ChatGPT terasa berbeda-beda, bukan template emerald yang sama.
 * Arahan sengaja konkret (warna, tipografi, komposisi) agar model image-gen
 * mengeksekusi gaya dengan patuh. Semua preset premium & pantas untuk produk
 * perjalanan ibadah.
 */
export const PACKAGE_VALUE_STYLES = [
  {
    id: 'editorial-majalah',
    name: 'Editorial Majalah',
    palette: 'Ivory hangat (#F5F0E6) dominan, emerald tua (#0B3D2E), aksen foil emas tipis (#C9A227).',
    typography: 'Serif display kontras tinggi ala masthead majalah mode untuk hook; grotesk kecil kapital berspasi lebar untuk bukti.',
    composition: 'Foto hero full-bleed dua pertiga atas dengan hook besar menumpuk elegan ala sampul majalah; nilai plus jadi deck editorial rata kiri di sepertiga bawah dipisah garis hairline; identitas agent baris kolofon terbawah.',
    heroTreatment: 'Fotografi arsitektur resolusi tinggi dari destinasi paket, tone hangat majalah perjalanan premium, depth of field tipis.',
    mood: 'Anggun dan berkelas, seperti fitur utama majalah perjalanan mewah.',
    finishing: 'Grain kertas matte halus plus bingkai dalam garis hairline emas.',
  },
  {
    id: 'sinematik-senja',
    name: 'Sinematik Senja',
    palette: 'Color grading film teal-orange: bayangan teal gelap (#12343B), highlight amber (#E8A13D), warna kulit natural.',
    typography: 'Sans terkondensasi kapital ala judul film, tracking sangat lebar untuk hook; bukti kecil tipis seperti kredit poster.',
    composition: 'Satu adegan dramatis memenuhi kanvas dengan letterbox tipis atas-bawah; copy tenang di sepertiga bawah ala poster film; nilai plus tiga baris kredit pendek di atas footer identitas agent.',
    heroTreatment: 'Fotografi sinematik golden hour: siluet jamaah atau menara masjid dilatari matahari rendah, lens flare halus.',
    mood: 'Megah dan menggetarkan, seperti trailer perjalanan spiritual sekali seumur hidup.',
    finishing: 'Film grain 35mm halus dan vignette lembut di keempat sudut.',
  },
  {
    id: 'minimalis-swiss',
    name: 'Minimalis Swiss',
    palette: 'Putih gading (#FAFAF7) minimal 60% kanvas sebagai ruang kosong, teks hitam pekat, satu aksen emerald (#0E7A5F) untuk garis dan nomor.',
    typography: 'Grotesk netral ala Helvetica: hook besar rata kiri, nilai plus bernomor 01/02/03 dengan hierarki ukuran ketat.',
    composition: 'Grid asimetris disiplin: satu foto persegi terpotong presisi di kanan-atas, hook dan nilai plus bernomor menuruni kolom kiri; identitas agent footer kecil rata kiri; sisanya sengaja kosong.',
    heroTreatment: 'Satu foto dipotong ketat pada detail arsitektur atau transportasi paket, warna natural tanpa filter berlebihan.',
    mood: 'Tenang, rasional, percaya diri — premium lewat keteraturan, bukan ornamen.',
    finishing: 'Tanpa tekstur; tepi tajam dan garis pemisah hitam 1px.',
  },
  {
    id: 'tipografi-monumental',
    name: 'Tipografi Monumental',
    palette: 'Dua warna berani: latar emerald pekat (#06382B), tipografi putih tulang; aksen emas hanya pada satu kata kunci headline.',
    typography: 'Hook sans extra-bold raksasa memenuhi 50-60% kanvas, boleh terpotong elegan di tepi; bukti dalam grotesk medium kecil.',
    composition: 'Kanvas didominasi headline bertumpuk 3-4 baris; foto hero mengintip dari balik huruf atau di-masking ke kata terbesar; nilai plus anotasi kecil pada baris huruf dengan garis penunjuk tipis; footer agent strip bawah.',
    heroTreatment: 'Foto duotone emerald-putih elemen paket, ter-clip di dalam huruf atau di antara blok headline.',
    mood: 'Berani, modern, langsung ke inti — mustahil dilewatkan saat scroll.',
    finishing: 'Letterpress sangat halus pada huruf raksasa agar terasa dicetak.',
  },
  {
    id: 'mewah-malam-emas',
    name: 'Mewah Malam Emas',
    palette: 'Hijau midnight nyaris hitam (#04231B) dominan; seluruh teks dan ornamen emas champagne (#D4B36A); tanpa warna ketiga.',
    typography: 'Serif ramping elegan berspasi lebar untuk hook; nilai plus kapital kecil emas seperti undangan gala.',
    composition: 'Simetris sentral ala undangan mewah: hero bercahaya di tengah-atas, hook di bawahnya, nilai plus vertikal dipisah ornamen geometris islami tipis; identitas agent segel penutup di dasar.',
    heroTreatment: 'Arsitektur masjid atau interior hotel paket di malam hari menyala keemasan dari kegelapan, cahaya hangat.',
    mood: 'Khidmat dan eksklusif, seperti undangan pribadi ke perjalanan istimewa.',
    finishing: 'Foil emas pada garis ornamen, glow lembut di sekitar sumber cahaya.',
  },
  {
    id: 'dokumenter-humanis',
    name: 'Dokumenter Humanis',
    palette: 'Earth tone natural: pasir hangat (#D8C3A5), coklat tanah (#6F5B3E), putih berdebu; aksen oranye kunyit kecil untuk anotasi.',
    typography: 'Serif buku klasik untuk hook naratif; caption kecil ala reportase dengan garis penunjuk tipis per bukti.',
    composition: 'Satu foto candid kuat full-bleed; hook ala judul reportase di sepertiga atas; nilai plus caption beranotasi menempel pada elemen nyata dalam foto; identitas agent sebagai byline bawah.',
    heroTreatment: 'Foto dokumenter jujur tanpa pose: tangan berdoa, jendela kereta, koper di lobi hotel paket — cahaya alami.',
    mood: 'Jujur dan mengharukan, seperti kisah nyata yang sedang berlangsung.',
    finishing: 'Grain film ISO 400, highlight sedikit terbakar, tanpa efek glossy.',
  },
  {
    id: 'kolase-kertas',
    name: 'Kolase Kertas',
    palette: 'Kertas krem (#EFE7D8), foto warna natural, aksen terracotta (#B4552D) dan tinta hijau tua untuk stempel dan label.',
    typography: 'Hook serif tegas, label kecil gaya mesin tik, tepat satu kata tulisan tangan tinta sebagai penekanan.',
    composition: 'Kolase rapi 2-3 foto bertepi sobek dengan selotip kertas overlap diagonal; tiap potongan mewakili satu nilai plus berlabel kecil; properti boarding pass/stempel paspor; identitas agent kartu terselip di sudut bawah.',
    heroTreatment: 'Foto otentik destinasi dan transportasi paket sebagai cetakan fisik yang ditempel di jurnal perjalanan.',
    mood: 'Personal dan penuh kenangan, seperti scrapbook perjalanan yang dirindukan.',
    finishing: 'Serat kertas nyata, drop shadow lembut tiap tempelan, sobekan tepi meyakinkan.',
  },
  {
    id: 'poster-vintage',
    name: 'Poster Travel Vintage',
    palette: 'Kertas krem tua (#EFE3C4), hijau kereta (#155E52), langit persik pudar (#E8B98A), border emas tua (#B8860B).',
    typography: 'Display Art Deco kondensasi tinggi untuk kata destinasi, sub-headline dalam pita melengkung ala poster 1930-an.',
    composition: 'Simetris penuh: landmark dari sudut pandang bawah heroik dengan sinar matahari stilisasi, border ornamen deco keliling kanvas, copy piramida di bawah; identitas agent plakat kecil di dasar.',
    heroTreatment: 'Ilustrasi gouache flat ala poster travel klasik: landmark atau transportasi paket dalam bidang warna tegas — bukan fotografi.',
    mood: 'Nostalgia era keemasan perjalanan — poster kolektor yang layak dibingkai.',
    finishing: 'Kertas tua samar, tinta silkscreen sedikit misregistrasi, tepi membulat lembut.',
  },
  {
    id: 'geometri-islami',
    name: 'Geometri Islami Presisi',
    palette: 'Dasar gading (#F4EEE1), pola bintang delapan emerald (#046A38) dan teal malam (#0E3B43), garis pola emas metalik (#D4AF37).',
    typography: 'Sans geometris kapital tracking lebar untuk hook; nomor nilai plus dalam medali oktagonal kecil.',
    composition: 'Medali bintang delapan raksasa di tengah berisi foto hero; pola girih menerus keluar medali lalu memudar ke tepi; copy simetris pada sumbu tengah; identitas agent di dasar sumbu.',
    heroTreatment: 'Foto landmark paket dipotong presisi bentuk bintang delapan, tone emerald-emas menyatu dengan pola.',
    mood: 'Tertata, intelektual, abadi — presisi geometri Islam sebagai bahasa kemewahan.',
    finishing: 'Letterpress samar pada dasar kertas, garis pola 1-2px, tanpa drop shadow.',
  },
  {
    id: 'gradien-mihrab',
    name: 'Gradien Mihrab Segar',
    palette: 'Mesh gradient halus emerald (#0E5A43) → teal (#116466) → pasir hangat (#E9D8B4); teks putih, aksen safron lembut (#E8C468).',
    typography: 'Sans variabel modern semi-bold besar, nomor nilai plus dalam pill badge membulat — rasa produk digital premium.',
    composition: 'Jendela lengkung mihrab besar di tengah-atas berisi foto hero; ornamen garis tipis jarang; copy berhierarki jelas di bawah jendela; identitas agent footer bersih.',
    heroTreatment: 'Foto destinasi cerah tajam dalam lengkung mihrab bertepi bersih; satu elemen menyembul keluar bingkai untuk kedalaman.',
    mood: 'Segar, optimis, digital-native — umroh terasa dekat bagi generasi muda.',
    finishing: 'Noise grain tipis anti-banding, soft shadow lembut di bawah jendela mihrab.',
  },
];

const DEFAULT_STYLE = PACKAGE_VALUE_STYLES[0];

function resolvePackageValueStyle(style) {
  return PACKAGE_VALUE_STYLES.find((item) => item.id === style?.id) || DEFAULT_STYLE;
}

/**
 * Pilih arah desain untuk satu request. `excludeId` dipakai tombol "ganti gaya"
 * agar rotasi selalu menghasilkan gaya yang berbeda dari yang barusan tampil.
 */
export function pickPackageValueStyle({ excludeId = '', random = Math.random } = {}) {
  const pool = PACKAGE_VALUE_STYLES.filter((item) => item.id !== excludeId);
  const candidates = pool.length > 0 ? pool : PACKAGE_VALUE_STYLES;
  const index = Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)));
  return candidates[index];
}

function cleanText(value, maxLength) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizedRecord(value, allowedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const key of allowedKeys) {
    const raw = value[key];
    if (raw === null || raw === undefined || raw === '') continue;
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
      out[key] = raw;
    }
  }
  return out;
}

function formatIndonesianDate(value) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return cleanText(value, 40);
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return cleanText(value, 40);
  return `${Number(match[3])} ${months[monthIndex]} ${match[1]}`;
}

function formatRupiah(value) {
  const amount = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return cleanText(value, 60);
  return `Rp${Math.round(amount).toLocaleString('id-ID')}`;
}

function headlineTokens(value) {
  return new Set(cleanText(value, 160)
    .toLocaleLowerCase('id-ID')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !HEADLINE_STOP_WORDS.has(token)));
}

function isGenericUmrohAdvantage(item) {
  const text = [item.title, item.description, item.sourceRef].filter(Boolean).join(' ');
  return GENERIC_UMROH_ACTIVITY_PATTERN.test(text) && !DISTINCTIVE_VALUE_PATTERN.test(text);
}

function rankAdvantagesForCreative(advantages, headline) {
  const concrete = advantages.filter((item) => !isGenericUmrohAdvantage(item));
  // Jangan sampai penyaring heuristik membuat prompt miskin bukti. Poin generik
  // hanya dibuang bila tetap tersisa minimal dua pembeda yang konkret.
  const candidates = concrete.length >= 2 ? concrete : advantages;
  const tokens = headlineTokens(headline);

  return candidates
    .map((item, index) => {
      // benefit ikut dihitung: headline diwajibkan bertumpu pada advantages[0]
      // dan sering menggemakan copy pengalaman, bukan judul/bukti faktualnya.
      const text = [item.title, item.benefit, item.description, item.sourceRef]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('id-ID');
      const overlap = [...tokens].filter((token) => text.includes(token)).length;
      const distinctive = DISTINCTIVE_VALUE_PATTERN.test(text) ? 1 : 0;
      return { item, index, score: (overlap * 20) + (distinctive * 5) + (item.source === 'itinerary' ? 1 : 0) };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ item }) => item);
}

/** "UMROH PLUS CAIRO 12 HARI BY EGYPT AIR" → "Umroh Plus Cairo 12 Hari" — buang
 * aroma katalog: title-case + strip sufiks maskapai (sudah punya baris sendiri). */
function displayPackageName(name) {
  const stripped = cleanText(name, 240).replace(/\s+BY\s+.+$/i, '');
  return stripped.toLocaleLowerCase('id-ID').replace(/(^|[\s(/-])(\p{L})/gu, (match, sep, letter) => `${sep}${letter.toLocaleUpperCase('id-ID')}`);
}

/**
 * Pilih SATU anchor penawaran di sisi perakit (harga bila ada, selain itu
 * tanggal) supaya model image-gen tidak menerima dua "pilihan" yang ambigu.
 * Jargon kamar internal diterjemahkan ke bahasa jamaah.
 */
function pickOfferAnchor(packageData = {}) {
  const roomPhrases = { Quard: 'kamar berempat', Triple: 'kamar bertiga', Double: 'kamar berdua', Single: 'kamar single' };
  const preferredRoomOrder = ['Quard', 'Triple', 'Double', 'Single'];
  const primaryRoom = preferredRoomOrder.find((room) => packageData.pricing?.[room]);
  if (primaryRoom) {
    const price = formatRupiah(packageData.pricing[primaryRoom]);
    if (price) return `Mulai ${price} (${roomPhrases[primaryRoom]})`;
  }
  const date = formatIndonesianDate(packageData.departure?.date);
  return date ? `Berangkat ${date}` : '';
}

function packageReferenceLines(packageData = {}) {
  const facts = [];
  const add = (label, value) => {
    const cleanValue = cleanText(value, 240);
    if (cleanValue) facts.push(`- ${label}: ${cleanValue}`);
  };

  add('Label paket', displayPackageName(packageData.name));
  add('Referensi maskapai', packageData.airline);
  // Selalu relevan untuk semua paket umroh; tanpa baris ini, paket miskin-fakta
  // dilarang menggambar masjid oleh aturan grounding padahal preset menuntutnya.
  facts.push('- Setting ibadah yang selalu boleh digambarkan: Masjidil Haram (Makkah) dan Masjid Nabawi (Madinah).');
  return facts;
}

// Plafon aman di bawah batas native share ChatGPT (5000 karakter) — lihat
// CHATGPT_NATIVE_SHARE_TEXT_LIMIT di buildBrochurePrompt.ts.
const MAX_BANNER_PROMPT_LENGTH = 4900;

// Degradasi bertingkat saat konten ekstrem: lepas elemen paling non-kritis
// lebih dulu. Tahap terakhir dijamin muat untuk semua input yang sudah
// melewati cap cleanText di assembler.
const PROMPT_DEGRADE_STAGES = [
  {},
  { includeSourceRefs: false },
  { includeSourceRefs: false, includeAudience: false, visualIdeaMax: 120 },
  { includeSourceRefs: false, includeAudience: false, visualIdeaMax: 0, includeBenefits: false },
];

/**
 * Rakit prompt final secara deterministik dari hasil yang evidence-nya sudah
 * tervalidasi. Model tidak diberi kebebasan menulis ulang fakta kanonis paket;
 * arah desain datang dari preset terpilih, bukan dari model.
 */
export function buildPackageValueBannerPrompt(result, packageData = {}, style = DEFAULT_STYLE) {
  if (!result?.headline || !Array.isArray(result?.advantages) || result.advantages.length === 0) return '';

  const activeStyle = resolvePackageValueStyle(style);
  let prompt = '';
  for (const stage of PROMPT_DEGRADE_STAGES) {
    prompt = assembleBannerPrompt(result, packageData, activeStyle, stage);
    if (prompt.length <= MAX_BANNER_PROMPT_LENGTH) return prompt;
  }
  // Pengaman terakhir untuk input patologis di luar alur parse normal.
  return prompt.slice(0, MAX_BANNER_PROMPT_LENGTH);
}

function assembleBannerPrompt(result, packageData, activeStyle, {
  includeSourceRefs = true,
  includeAudience = true,
  includeBenefits = true,
  visualIdeaMax = 200,
} = {}) {
  const audience = includeAudience
    ? cleanText((Array.isArray(result.bestFor) ? result.bestFor : [])
      .map((item) => cleanText(item, 100))
      .filter(Boolean)
      .join(', '), 200)
    : '';
  const referenceFacts = packageReferenceLines(packageData);
  const offerAnchor = pickOfferAnchor(packageData);
  const visualIdea = visualIdeaMax > 0 ? cleanText(result.visualIdea, visualIdeaMax) : '';
  // Anggaran teks image-gen terbatas (±30-60 kata andal): hanya NILAI PLUS 1
  // yang tampil penuh; poin 2-3 cukup judul + satu baris pendukung.
  const advantageDirectives = result.advantages.map((item, index) => {
    const sourceRef = includeSourceRefs ? cleanText(item.sourceRef, 180) : '';
    const benefit = includeBenefits ? cleanText(item.benefit, 120) : '';
    const description = cleanText(item.description, 140);
    const isPrimary = index === 0;
    const supportLine = benefit || description;
    const internalRef = [!isPrimary && benefit ? description : '', sourceRef]
      .filter(Boolean).join(' • ');
    return [
      `NILAI PLUS ${index + 1}${isPrimary ? ' — PESAN UTAMA' : ''}`,
      `- Judul yang wajib tampil: “${cleanText(item.title, 60)}”`,
      isPrimary && benefit ? `- Copy pengalaman yang wajib tampil: “${benefit}”` : null,
      isPrimary
        ? `- Bukti singkat yang wajib tampil: “${description}”`
        : `- Satu baris pendukung yang wajib tampil: “${supportLine}”`,
      internalRef ? `- Referensi visual internal, JANGAN tampilkan teks ini di artwork: ${internalRef}` : null,
    ].filter(Boolean).join('\n');
  });

  return [
    'Buat SATU ad creative umroh yang scroll-stopping untuk media sosial. Ini bukan brosur dan bukan poster berisi banyak informasi. Kanvas vertikal potret; komposisikan seluruh teks dan identitas agent aman di area tengah rasio 4:5 karena tepi atas-bawah bisa terpotong saat crop feed.',
    '',
    `ARAH DESAIN — ${activeStyle.name.toLocaleUpperCase('id-ID')}`,
    `- Palet: ${activeStyle.palette}`,
    `- Tipografi: ${activeStyle.typography}`,
    `- Komposisi: ${activeStyle.composition}`,
    `- Hero visual: ${activeStyle.heroTreatment}`,
    `- Mood: ${activeStyle.mood}`,
    `- Finishing: ${activeStyle.finishing}`,
    '- Ikuti arah desain ini secara konsisten pada seluruh kanvas; jangan mencampur gaya lain. Prioritaskan visual yang lega — tampilkan hanya copy terpenting dalam satu komposisi utuh, bukan layout katalog.',
    '',
    'BIG IDEA',
    `Hook utama: “${cleanText(result.headline, 120)}”`,
    result.summary ? `Kalimat pendukung: “${cleanText(result.summary, 160)}”` : null,
    visualIdea ? `Adegan hero: ${visualIdea}` : null,
    visualIdea ? '- Terjemahkan adegan hero sepenuhnya ke medium, palet, dan waktu-cahaya ARAH DESAIN di atas; bila keduanya bertentangan, arah desain yang menang.' : null,
    '- Hero visual dan hook harus langsung membuktikan NILAI PLUS 1; itulah alasan orang berhenti scroll.',
    '- NILAI PLUS 2–3 menjadi penguat, bukan informasi paket yang berdiri sendiri.',
    '',
    'NILAI PLUS — INTI IKLAN, WAJIB TERASA',
    ...advantageDirectives,
    '- Tampilkan SEMUA nilai plus di atas. Jangan menghilangkan, mengganti dengan kata sifat generik, atau mengecilkannya jadi chip dekoratif.',
    '- NILAI PLUS 1 tampil paling menonjol; nilai plus lain lebih kecil, dieksekusi mengikuti komposisi arah desain (nomor, garis penunjuk, atau anotasi yang menyatu) tanpa card terpisah.',
    '',
    'BATAS TEKS LAIN YANG BOLEH TERLIHAT',
    `- Selain copy nilai plus di atas, cukup: satu hook, satu kalimat pendukung, satu label paket kecil${offerAnchor ? `, dan satu anchor penawaran opsional: “${offerAnchor}”` : ''}.`,
    '- CTA pendek: “Tanya Paket Ini”.',
    '',
    'FAKTA ACUAN — HANYA KONTEKS, BUKAN UNTUK DITEMPEL',
    ...referenceFacts,
    audience ? `- Audiens: ${audience}` : null,
    '- Jangan membuat blok spesifikasi paket; nilai plus tetap pesan yang paling menonjol.',
    '',
    'LAMPIRAN IDENTITAS AGENT',
    '- Satu lembar aset identitas agent dilampirkan bersama prompt ini: foto, nama, peran, WhatsApp, website, dan logo Alhijaz berlabel jelas.',
    '- Ambil semua aset identitas persis dari lembar itu; jangan mengarang identitas dan jangan meniru layout lembarnya. Nomor dan label chip (01–06) hanyalah penanda — jangan pernah menampilkannya di artwork.',
    '- Jadikan identitas agent signature/footer yang menyatu dengan arah desain, bukan kartu ditempel mentah; pertahankan wajah asli dan proporsi logo.',
    '',
    'ATURAN WAJIB',
    '- Grounding: gunakan hanya destinasi, pengalaman, dan angka yang tertulis di prompt ini; jangan mengarang detail baru, klaim superlatif, atau perbandingan.',
    '- Teks yang tampil hanya yang diwajibkan di atas — tidak ada teks tambahan apa pun; semua tulisan tajam, terbaca, dan persis tanpa typo.',
    '- Copy tersusun sebagai satu blok terpadu di dalam komposisi; area visual dibiarkan bersih dan lega.',
    '- Hasil akhir SATU artwork iklan final siap posting, bukan penjelasan desain.',
  ].filter((line) => line !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function findTierKey(record, requestedTier) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return '';
  const keys = Object.keys(record);
  const wanted = cleanText(requestedTier, 40).toLocaleLowerCase('id-ID');
  return keys.find((key) => key.toLocaleLowerCase('id-ID') === wanted) || keys[0] || '';
}

function normalizeItinerary(itinerary) {
  const days = Array.isArray(itinerary?.days) ? itinerary.days.slice(0, 24) : [];
  return {
    days: days.map((day) => ({
      dayNumber: cleanText(day?.dayNumber, 40),
      title: cleanText(day?.title, 120),
      location: cleanText(day?.location, 160),
      activities: (Array.isArray(day?.activities) ? day.activities : [])
        .slice(0, 12)
        .map((activity) => ({
          time: cleanText(activity?.time, 30),
          text: cleanText(activity?.text, 220),
        }))
        .filter((activity) => activity.time || activity.text),
    })).filter((day) => day.dayNumber || day.title || day.location || day.activities.length > 0),
  };
}

function buildEvidenceCatalog(packageData, itinerary) {
  const evidence = [];
  const add = (id, source, fact) => {
    const cleanFact = cleanText(fact, 300);
    if (cleanFact) evidence.push({ id, source, fact: cleanFact });
  };

  add('B01', 'brosur', `Nama paket: ${packageData.name}`);
  add('B02', 'brosur', packageData.tier ? `Tier yang dipilih: ${packageData.tier}` : '');
  add('B03', 'brosur', [packageData.airline, packageData.departure.flight].filter(Boolean).length
    ? `Maskapai/penerbangan berangkat: ${[packageData.airline, packageData.departure.flight].filter(Boolean).join(' • ')}`
    : '');
  add('B04', 'brosur', packageData.departure.route ? `Rute berangkat: ${packageData.departure.route}` : '');
  add('B05', 'brosur', packageData.return.route ? `Rute pulang: ${packageData.return.route}` : '');
  add('B06', 'brosur', packageData.departure.date ? `Tanggal berangkat: ${packageData.departure.date}` : '');
  add('B07', 'brosur', packageData.return.date ? `Tanggal pulang: ${packageData.return.date}` : '');
  add('B08', 'brosur', packageData.promo ? 'Paket ditandai sebagai PROMO' : '');

  const priceFacts = Object.entries(packageData.pricing || {}).map(([room, price]) => `${room}: ${price}`);
  add('B09', 'brosur', priceFacts.length ? `Harga tier ${packageData.tier || '-'} — ${priceFacts.join(', ')}` : '');

  let hotelIndex = 1;
  for (const [city, hotel] of Object.entries(packageData.hotel || {})) {
    add(`BH${String(hotelIndex).padStart(2, '0')}`, 'brosur', `Hotel ${city} tier ${packageData.tier || '-'}: ${hotel}`);
    hotelIndex += 1;
  }

  for (const [dayIndex, day] of (itinerary?.days || []).entries()) {
    const dayId = `I${String(dayIndex + 1).padStart(2, '0')}`;
    add(dayId, 'itinerary', [day.dayNumber, day.title, day.location].filter(Boolean).join(' • '));
    for (const [activityIndex, activity] of day.activities.entries()) {
      add(`${dayId}A${String(activityIndex + 1).padStart(2, '0')}`, 'itinerary', [
        day.dayNumber,
        activity.time,
        activity.text,
      ].filter(Boolean).join(' • '));
    }
  }
  return evidence;
}

/**
 * Ubah row umroh_schedules + itinerary cache menjadi konteks minimum yang boleh
 * dilihat model. Hanya tier aktif yang dikirim agar model tidak mencampur hotel
 * atau harga antar-tier.
 */
export function buildPackageValueContext(schedule, itinerary, requestedTier = '') {
  if (!schedule || typeof schedule !== 'object') return null;

  const pricingByTier = schedule.paket_harga && typeof schedule.paket_harga === 'object'
    ? schedule.paket_harga
    : {};
  const hotelsByTier = schedule.paket_hotel && typeof schedule.paket_hotel === 'object'
    ? schedule.paket_hotel
    : {};
  const tier = findTierKey(pricingByTier, requestedTier) || findTierKey(hotelsByTier, requestedTier);
  const pricing = normalizedRecord(pricingByTier[tier], ['Single', 'Double', 'Triple', 'Quard', 'Infant']);
  const hotel = normalizedRecord(hotelsByTier[tier], [
    'mekkah', 'madinah', 'cairo', 'alexandria', 'istanbul', 'bursa',
    'cappadocia', 'ankara', 'dubai', 'aqsha', 'amman', 'petra', 'haikou',
  ]);
  const normalizedItinerary = normalizeItinerary(itinerary);
  const itineraryAvailable = normalizedItinerary.days.length > 0;

  const packageData = {
    jadwalId: cleanText(schedule.jadwal_id, 80),
    name: cleanText(schedule.jadwal_nama || schedule.nama, 180),
    tier: cleanText(tier, 40),
    promo: String(schedule.promo ?? '') === '1',
    departure: {
      date: cleanText(schedule.berangkat_tgl, 40),
      time: cleanText(schedule.berangkat_jam, 30),
      route: cleanText(schedule.berangkat_rute, 160),
      flight: cleanText(schedule.berangkat_kode_penerbangan, 80),
    },
    return: {
      date: cleanText(schedule.pulang_tgl, 40),
      time: cleanText(schedule.pulang_jam, 30),
      route: cleanText(schedule.pulang_rute, 160),
      flight: cleanText(schedule.pulang_kode_penerbangan, 80),
    },
    airline: cleanText(schedule.maskapai, 100),
    pricing,
    hotel,
  };

  return {
    package: packageData,
    itinerary: itineraryAvailable ? normalizedItinerary : null,
    evidence: buildEvidenceCatalog(packageData, itineraryAvailable ? normalizedItinerary : null),
    sourceAvailability: {
      brochure: true,
      itinerary: itineraryAvailable,
    },
  };
}

export function buildPackageValuePrompts(context) {
  if (!context?.package?.jadwalId || !context?.package?.name) return null;
  const itineraryInstruction = context.sourceAvailability?.itinerary
    ? 'Itinerary tersedia. Gunakan aktivitas harian yang benar-benar relevan sebagai bukti tambahan.'
    : 'Itinerary belum tersedia. Semua poin WAJIB hanya bersumber dari DATA BROSUR TERSTRUKTUR; jangan menyebut atau mengasumsikan isi itinerary.';

  const systemPrompt = `Kamu adalah content strategist untuk banner promosi paket umroh Alhijaz Indowisata.
Tugasmu memilih dan merumuskan materi paling kuat untuk SATU banner dari fakta brosur terstruktur dan itinerary yang diberikan. Sistem akan merakit hasilmu menjadi prompt desain siap-tempel ke ChatGPT.

ATURAN GROUNDING:
- Buat 2 sampai ${MAX_PACKAGE_VALUE_ADVANTAGES} poin. Pilih 3 bila tersedia tiga fakta pembeda yang layak; gunakan 2 hanya jika poin ketiga akan generik atau lemah.
- Setiap poin wajib memakai tepat satu evidenceId yang benar-benar ada di katalog evidence pada input. Sistem mengambil teks sumber langsung dari ID tersebut.
- Gunakan evidenceId yang berbeda untuk setiap poin. Jangan mengulang fakta yang sama dengan kata-kata lain.
- Evidence bersumber dari "brosur" atau "itinerary". DATA BROSUR TERSTRUKTUR mencakup nama paket, tier aktif, jadwal, penerbangan, rute, harga, dan hotel.
- Jangan mencampur hotel atau harga dari tier lain. Gunakan hanya tier yang ada di input.
- Jangan menganggap kota pada rute penerbangan sebagai destinasi wisata. Destinasi/aktivitas wisata hanya boleh disebut jika ada di itinerary atau secara eksplisit ada pada nama paket.
- Jangan menyebut "termurah", "terdekat", "terlengkap", "terbaik", "eksklusif", "tanpa transit", "penerbangan langsung", penghematan waktu, atau klaim perbandingan lain tanpa bukti eksplisit.
- Jangan mengarang jarak hotel, durasi perjalanan, kualitas layanan, fasilitas, jumlah umroh, makanan, visa, bagasi, atau aktivitas.
- Seat tersisa bukan nilai plus dan tidak tersedia di input.
- Prioritaskan hal yang paling khas: transportasi khusus, destinasi/aktivitas tambahan, hotel spesifik pada tier aktif, atau susunan perjalanan yang memang terbukti.
- Jika itinerary tersedia dan memiliki aktivitas, transportasi, atau destinasi non-generik yang membedakan, NILAI PLUS 1 wajib memakai evidence dari itinerary. Poin itinerary konkret lebih penting daripada label paket, tanggal, maskapai, atau harga.
- Headline wajib bertumpu langsung pada advantages[0]. Jangan membuat headline dari poin kedua atau ketiga.
- Jangan jadikan aktivitas umum semua paket sebagai poin utama, misalnya tiba di bandara, check-in, istirahat, makan, shalat rutin, atau ibadah di Masjidil Haram, kecuali ada detail khusus yang membedakannya.
- Ziarah rutin Madinah, Makam Rasulullah/sahabat, manasik, dan city tour standar Makkah–Madinah bukan nilai plus. Jangan pilih aktivitas tersebut bila ada fakta paket yang lebih khas.
- Urutkan advantages dari nilai jual yang paling kuat dan spesifik ke yang paling umum.
- Fakta boleh diterjemahkan menjadi manfaat yang wajar, tetapi jangan menjanjikan kenyamanan, keamanan, atau hasil ibadah.
- "Cocok untuk" boleh berupa preferensi perjalanan yang netral; jangan membuat klaim usia, kesehatan, atau kemampuan fisik.

ATURAN COPYWRITING — KEMASAN, BUKAN SALINAN MENTAH:
- Headline harus berupa hook iklan maksimal 6 kata yang memancing rasa ingin tahu dan bertumpu pada nilai plus terkuat.
- Jangan memakai nama paket, tier, durasi, harga, atau daftar destinasi sebagai headline. Headline bukan label brosur.
- Summary maksimal 12 kata dan harus memperkuat satu big idea, bukan merangkum seluruh paket.
- Title setiap nilai plus maksimal 4 kata dan harus menyebut pembeda konkret, bukan kata sifat seperti “lebih nyaman”, “istimewa”, atau “premium”.
- Benefit setiap nilai plus adalah copy pengalaman maksimal 10 kata: ubah fakta menjadi adegan yang bisa dibayangkan jamaah memakai kata kerja indrawi (melaju, menatap, menginap, menyusuri), tanpa menambah fakta baru. Contoh pola: fakta "kereta cepat Haramain" → "Melaju Madinah–Makkah, gurun berkejaran di jendela".
- Description akan tampil pada artwork: tulis tepat satu kalimat faktual maksimal 12 kata yang menjelaskan bukti keunggulannya. Jangan memakai kalimat manfaat generik.
- Nama spesifik adalah bukti paling meyakinkan: tulis nama hotel, kereta, kota, atau maskapai persis seperti di evidence; satu nama konkret mengalahkan tiga kata sifat.
- Jangan menulis kosakata internal pada title/benefit/description yang akan tampil: kata "tier", nama tier (VIP/HEMAT dll.), kode kamar (Quard/Double/Triple), atau format mentah evidence. Terjemahkan ke bahasa jamaah, contoh: "Hotel Makkah tier VIP: FAIRMONT" → "Menginap di Fairmont Makkah".
- visualIdea adalah satu kalimat maksimal 20 kata yang menggambarkan adegan hero untuk membuktikan advantages[0]: sebutkan subjek, aksi, dan sudut pandang saja. Jangan menyebut waktu/cahaya (pagi, senja, malam) ataupun medium (foto, ilustrasi) — keduanya ditentukan arah desain terpisah. Hanya boleh memuat elemen yang ada di evidence.
- Tulis bahasa Indonesia yang hangat, ringkas, dan konkret. Hindari FOMO, CTA, salam, hashtag, serta klaim bombastis.
- Jangan menyalin atau mengarang source/sourceRef sendiri; cukup kembalikan evidenceId paling kuat untuk poin itu.

${itineraryInstruction}

Balas HANYA sebagai JSON valid dengan struktur:
{
  "headline": "hook iklan maksimal 6 kata, bukan nama paket",
  "summary": "maksimal 12 kata untuk mendukung satu big idea",
  "visualIdea": "adegan hero visual maksimal 20 kata yang membuktikan nilai plus pertama",
  "advantages": [
    {
      "title": "maksimal 4 kata, pembeda konkret",
      "benefit": "copy pengalaman maksimal 10 kata, adegan yang bisa dibayangkan",
      "description": "satu kalimat faktual maksimal 12 kata yang layak tampil",
      "evidenceId": "satu ID dari katalog evidence"
    }
  ],
  "bestFor": ["maksimal 2 preferensi audiens"]
}`;

  const userPrompt = `Pilih materi nilai plus untuk prompt banner paket berikut. Jangan gunakan pengetahuan di luar JSON ini:\n${JSON.stringify(context)}`;
  return { systemPrompt, userPrompt };
}

export function buildPackageValueChatBody({ systemPrompt, userPrompt }) {
  return {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.45,
    max_tokens: 1600,
    response_format: { type: 'json_object' },
  };
}

/** Parse + batasi output model sebelum dikirim ke browser. */
export function parsePackageValueResult(content, {
  itineraryAvailable = true,
  evidenceCatalog = [],
  packageData = {},
  style = DEFAULT_STYLE,
} = {}) {
  let parsed;
  try {
    const raw = String(content ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const evidenceById = new Map((Array.isArray(evidenceCatalog) ? evidenceCatalog : [])
    .filter((item) => item?.id && ALLOWED_SOURCES.has(item?.source))
    .map((item) => [String(item.id), item]));
  const enforceEvidenceIds = evidenceById.size > 0;

  const advantages = (Array.isArray(parsed?.advantages) ? parsed.advantages : [])
    .map((item) => {
      const evidenceId = cleanText(item?.evidenceId, 30);
      const evidence = evidenceById.get(evidenceId);
      const source = evidence
        ? evidence.source
        : cleanText(item?.source, 20).toLocaleLowerCase('id-ID');
      return {
        title: cleanText(item?.title, 80),
        benefit: cleanText(item?.benefit, 160),
        description: cleanText(item?.description, 420),
        source,
        sourceRef: evidence ? cleanText(evidence.fact, 300) : cleanText(item?.sourceRef, 220),
        evidenceId: evidence?.id || '',
      };
    })
    .filter((item) => !enforceEvidenceIds || item.evidenceId)
    .filter((item) => item.title && item.description && item.sourceRef && ALLOWED_SOURCES.has(item.source))
    .filter((item) => itineraryAvailable || item.source !== 'itinerary')
    .slice(0, MAX_PACKAGE_VALUE_ADVANTAGES);

  if (advantages.length === 0) return null;

  const uniqueEvidenceIds = new Set();
  const uniqueAdvantages = advantages.filter((item) => {
    if (!item.evidenceId) return true;
    if (uniqueEvidenceIds.has(item.evidenceId)) return false;
    uniqueEvidenceIds.add(item.evidenceId);
    return true;
  });
  const rankedAdvantages = rankAdvantagesForCreative(
    uniqueAdvantages,
    cleanText(parsed?.headline, 140),
  );

  if (rankedAdvantages.length === 0) return null;

  const activeStyle = resolvePackageValueStyle(style);
  const result = {
    headline: cleanText(parsed?.headline, 140) || 'Nilai Plus Paket',
    summary: cleanText(parsed?.summary, 600),
    visualIdea: cleanText(parsed?.visualIdea, 220),
    advantages: rankedAdvantages,
    bestFor: (Array.isArray(parsed?.bestFor) ? parsed.bestFor : [])
      .map((item) => cleanText(item, 180))
      .filter(Boolean)
      .slice(0, 2),
  };
  return {
    ...result,
    style: { id: activeStyle.id, name: activeStyle.name },
    bannerPrompt: buildPackageValueBannerPrompt(result, packageData, activeStyle),
  };
}

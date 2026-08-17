// Grounded prompt + parser untuk fitur "Nilai Plus Paket".
// File ini sengaja murni (tanpa akses DB) supaya kontrak AI dapat dites tanpa
// menjalankan server atau memanggil OpenAI.

export const PACKAGE_VALUE_PROMPT_VERSION = '2026-08-17-v20-display-safe-facts';
export const MIN_PACKAGE_VALUE_ADVANTAGES = 3;
export const MAX_PACKAGE_VALUE_ADVANTAGES = 4;

const ALLOWED_SOURCES = new Set(['brosur', 'itinerary']);
const HEADLINE_STOP_WORDS = new Set([
  'dan', 'dengan', 'di', 'ke', 'lebih', 'paket', 'perjalanan', 'rasakan', 'satu',
  'umroh', 'untuk', 'yang',
]);
const GENERIC_UMROH_ACTIVITY_PATTERN = /(?:raudhah|rawdhah|\bziarah\b|makam rasulullah|makam (?:para )?sahabat|masjid nabawi|city ?tour|jabal (?:uhud|rahmah|tsur)|masjid quba|masjid qiblatain|padang arafah|muzdalifah|tawaf sunnah|tempat(?:-tempat)? ijabah|shalat dhuha|sholat dhu?hur|qiyamul lail|manasik|pembekalan umroh|ibadah (?:rutin|mandiri|khusus|di (?:masjidil haram|makkah|mekkah|mekah|madinah))|menuju masjidil haram|umr(?:ah|oh) (?:kedua|ke-?2)|pengarahan|pembagian paspor|boarding pass|\bkoper\b|tiba di (?:bandara|hotel|jakarta|terminal|gate)|menuju bandara|berangkat dengan pesawat|perjalanan (?:jakarta ke|ke (?:makkah|mekkah|mekah|madinah))|kembali (?:ke jakarta|ke tanah air|dengan pesawat)|c(?:heck|ek)[ -]?(?:in|out)|makan (?:pagi|siang|malam)|istirahat|shalat rutin)/i;
const DISTINCTIVE_VALUE_PATTERN = /(?:kereta cepat|haramain|piramida|giza|cairo|kairo|thaif|taif|badar|aqsha|al aqsa|istanbul|bursa|cappadocia|kapadokia|dubai|haikou|petra|alexandria)/i;

// Logistik transportasi rutin dari itinerary TIDAK pernah jadi evidence nilai
// plus, bahkan bila menyebut kota distinctive: "Berangkat menuju kota Jeddah",
// "Kembali ke tanah air", "Transit di Haikou", "Tiba di Bursa", "Melanjutkan
// perjalanan ke Medinah" adalah perpindahan biasa — keunggulan penerbangan
// diwakili SATU evidence maskapai (B03) yang membawa fakta direct-flight.
const ROUTINE_TRANSPORT_PATTERN = /(?:\bberangkat menuju\b|\bkembali (?:ke|menuju)\b|\bmelanjutkan (?:perjalanan|ke|menuju|kota)\b|\btiba di\b|\btransit\b|take ?off|\blanding\b|\bdengan pesawat\b|\bnaik pesawat\b|\bmenuju bandara\b|\bboarding\b)/i;

// Entitas berikut tidak boleh dipindahkan dari satu evidence ke evidence lain.
// Ini menutup celah ketika model memakai evidence penerbangan ke Istanbul tetapi
// menambahkan "kereta cepat" hanya karena frasa itu muncul pada nama paket.
const GROUNDED_FACT_GROUPS = [
  { id: 'transport:train', terms: ['kereta', 'haramain'] },
  { id: 'transport:plane', terms: ['pesawat', 'penerbangan', 'maskapai', 'airline', 'airlines', 'terbang'] },
  { id: 'transport:cruise', terms: ['cruise', 'kapal pesiar', 'berlayar'] },
  { id: 'transport:bus', terms: ['bus', 'bis'] },
  { id: 'place:makkah', terms: ['makkah', 'mekkah', 'mekah'] },
  { id: 'place:madinah', terms: ['madinah', 'medinah', 'medina'] },
  { id: 'place:jeddah', terms: ['jeddah', 'jedah'] },
  { id: 'place:istanbul', terms: ['istanbul'] },
  { id: 'place:bursa', terms: ['bursa'] },
  { id: 'place:cappadocia', terms: ['cappadocia', 'kapadokia'] },
  { id: 'place:ankara', terms: ['ankara'] },
  { id: 'place:turkey', terms: ['turkey', 'turki'] },
  { id: 'place:cairo', terms: ['cairo', 'kairo'] },
  { id: 'place:alexandria', terms: ['alexandria', 'aleksandria'] },
  { id: 'place:giza', terms: ['giza'] },
  { id: 'place:dubai', terms: ['dubai'] },
  { id: 'place:aqsha', terms: ['aqsha', 'aqsa', 'al aqsa', 'al aqsha'] },
  { id: 'place:amman', terms: ['amman'] },
  { id: 'place:petra', terms: ['petra'] },
  { id: 'place:haikou', terms: ['haikou'] },
  { id: 'place:thaif', terms: ['thaif', 'taif'] },
  { id: 'place:badar', terms: ['badar', 'badr'] },
  { id: 'place:jakarta', terms: ['jakarta'] },
  { id: 'landmark:kaaba', terms: ['kabah', 'ka bah'] },
  { id: 'landmark:haram', terms: ['masjidil haram'] },
  { id: 'landmark:nabawi', terms: ['masjid nabawi'] },
  { id: 'landmark:bosphorus', terms: ['bosphorus', 'bosporus'] },
  { id: 'landmark:hagia-sophia', terms: ['hagia sophia', 'aya sofya'] },
  { id: 'landmark:blue-mosque', terms: ['blue mosque', 'masjid biru'] },
  { id: 'landmark:grand-mosque', terms: ['grand mosque'] },
  { id: 'landmark:pyramid', terms: ['piramida', 'pyramid'] },
  { id: 'landmark:goreme', terms: ['goreme'] },
  { id: 'landmark:underground-city', terms: ['underground city', 'kota bawah tanah'] },
];

const CANONICAL_GROUP_TERMS = new Set(GROUNDED_FACT_GROUPS.flatMap((group) => group.terms));

// Klaim bernilai jual tinggi harus tertulis eksplisit pada evidence; model tidak
// boleh menyimpulkan kenyamanan, jarak, efisiensi, atau kualitas sendiri.
const SOURCE_REQUIRED_CLAIM_GROUPS = [
  { id: 'claim:comparative-speed', terms: ['lebih cepat'] },
  { id: 'claim:comparative-comfort', terms: ['lebih nyaman'] },
  { id: 'claim:comfort', terms: ['nyaman', 'kenyamanan'] },
  { id: 'claim:efficiency', terms: ['efisien', 'hemat waktu', 'menghemat waktu'] },
  { id: 'claim:proximity', terms: ['dekat', 'strategis', 'jarak', 'akses', 'akses mudah', 'pusat kota'] },
  { id: 'claim:luxury', terms: ['mewah', 'kemewahan'] },
  { id: 'claim:guarantee', terms: ['menjamin', 'terjamin', 'terpercaya', 'pasti'] },
  { id: 'claim:superlative', terms: ['terbaik', 'termurah', 'terlengkap', 'maksimal', 'eksklusif', 'terkemuka', 'ternama', 'kelas dunia'] },
  { id: 'claim:direct-flight', terms: ['tanpa transit', 'penerbangan langsung', 'terbang langsung', 'langsung', 'direct flight', 'direct'] },
  { id: 'claim:culture', terms: ['budaya'] },
  { id: 'claim:history', terms: ['sejarah', 'bersejarah'] },
  { id: 'claim:scenery', terms: ['pemandangan', 'panorama'] },
  { id: 'claim:generic-quality', terms: ['keindahan', 'menakjubkan', 'istimewa', 'modern'] },
];
// "setaraf/setara" ikut dilarang tampil: jargon hedging brosur yang melemahkan
// copy iklan ("Hotel Anjum atau setaraf" → cukup nama hotel/bintangnya).
// Terlarang mutlak: label internal tier, hedging brosur, dan format mentah
// evidence (bullet • / prefix label katalog) yang bocor ke copy konsumen.
const DISPLAY_HARD_FORBIDDEN_PATTERN = /\b(?:tier|uhud|rahmah|hemat|vip|setaraf?)\b|[•]|maskapai\s*\/\s*penerbangan/i;
// Fakta katalog kini memakai kosakata yang aman tampil, sehingga larangan jargon
// tidak lagi ikut menyaring salinan mentah. Label fakta tetap data internal:
// "Hotel madinah: AL RITZ" adalah baris katalog, bukan kalimat iklan.
const DISPLAY_RAW_CATALOG_PATTERN = /\b(?:penerbangan\s+berangkat|harga\s+paket|tanggal\s+berangkat)\s*:|\bhotel\s+[a-z]+\s*:/i;
// Kode kamar dilarang KECUALI bagian nama sah di evidence — hotel nyata bernama
// "TRIPLE ONE" atau "DOUBLE TREE by Hilton" bukan jargon kamar.
const DISPLAY_ROOM_JARGON_PATTERN = /\b(?:quard|quad|double|triple|single)\b/gi;

// Kode bandara → nama kota, untuk fakta turunan penerbangan langsung yang bisa
// dirujuk model dengan nama kota (binding check bekerja pada nama, bukan kode).
const AIRPORT_CITY_NAMES = new Map([
  ['CGK', 'Jakarta'], ['JED', 'Jeddah'], ['MED', 'Madinah'], ['RUH', 'Riyadh'],
  ['TIF', 'Taif'], ['IST', 'Istanbul'], ['SAW', 'Istanbul'], ['CAI', 'Cairo'],
  ['DXB', 'Dubai'], ['AUH', 'Abu Dhabi'], ['AMM', 'Amman'], ['HAK', 'Haikou'],
  ['KUL', 'Kuala Lumpur'], ['SIN', 'Singapura'], ['DOH', 'Doha'], ['JT', 'Jakarta'],
]);

/**
 * Rute berangkat satu segmen ("CGK-JED" / "CGK - MED") = penerbangan langsung
 * tanpa transit — fakta turunan bernilai jual yang sah dari data brosur.
 * Rute multi-segmen ("CGK-DXB / DXB-JED") bukan direct; jangan pernah diklaim.
 */
export function directFlightFactFromRoute(route) {
  const segments = String(route || '').split('/').map((part) => part.trim()).filter(Boolean);
  if (segments.length !== 1) return '';
  const match = segments[0].match(/^([A-Z]{2,3})\s*-\s*([A-Z]{2,3})$/);
  if (!match) return '';
  const from = AIRPORT_CITY_NAMES.get(match[1]) || match[1];
  const to = AIRPORT_CITY_NAMES.get(match[2]) || match[2];
  return `Penerbangan langsung tanpa transit ${from}-${to}`;
}

const CATALOG_NAMED_TERM_STOP_WORDS = new Set([
  'AKTIVITAS', 'BERANGKAT', 'DOUBLE', 'HARGA', 'HARI', 'HOTEL', 'ITINERARY',
  'JUTA', 'KAMAR', 'MASKAPAI', 'PENERBANGAN', 'QUARD', 'RAHMAH', 'RUTE',
  'SINGLE', 'TIER', 'TRIPLE', 'UHUD',
]);
const TITLE_ANCHOR_STOP_WORDS = new Set([
  'ada', 'anda', 'dalam', 'dan', 'dengan', 'dari', 'di', 'hotel', 'jamaah',
  'jemaah', 'ke', 'kenapa', 'menarik', 'menuju', 'nilai', 'paket', 'pengalaman',
  'perjalanan', 'plus', 'selama', 'untuk', 'yang',
]);
const FACT_GROUP_DISPLAY_LABELS = new Map([
  ['place:makkah', 'Makkah'], ['place:madinah', 'Madinah'], ['place:jeddah', 'Jeddah'],
  ['place:istanbul', 'Istanbul'], ['place:bursa', 'Bursa'], ['place:cappadocia', 'Cappadocia'],
  ['place:ankara', 'Ankara'], ['place:turkey', 'Turki'], ['place:cairo', 'Cairo'],
  ['place:alexandria', 'Alexandria'], ['place:giza', 'Giza'], ['place:dubai', 'Dubai'],
  ['place:aqsha', 'Aqsha'], ['place:amman', 'Amman'], ['place:petra', 'Petra'],
  ['place:haikou', 'Haikou'], ['place:thaif', 'Thaif'], ['place:badar', 'Badar'],
  ['place:jakarta', 'Jakarta'], ['landmark:kaaba', 'Kabah'],
  ['landmark:haram', 'Masjidil Haram'], ['landmark:nabawi', 'Masjid Nabawi'],
  ['landmark:bosphorus', 'Bosphorus'], ['landmark:hagia-sophia', 'Hagia Sophia'],
  ['landmark:blue-mosque', 'Blue Mosque'], ['landmark:grand-mosque', 'Grand Mosque'],
  ['landmark:pyramid', 'Piramida'], ['landmark:goreme', 'Goreme Valley'],
  ['landmark:underground-city', 'Underground City'],
]);

/**
 * Preset arah desain untuk prompt banner. Setiap generate memakai satu preset
 * sehingga hasil ChatGPT terasa berbeda-beda, bukan template emerald yang sama.
 * Arahan sengaja konkret (warna, tipografi, komposisi) agar model image-gen
 * mengeksekusi gaya dengan patuh. Semua preset premium & pantas untuk produk
 * perjalanan ibadah.
 */
export const PACKAGE_VALUE_STYLES = [
  {
    id: 'editorial',
    name: 'Editorial magazine',
    palette: 'Ivory hangat (#F5F0E6) dominan, emerald tua (#0B3D2E), aksen foil emas tipis (#C9A227).',
    typography: 'Serif display kontras tinggi ala masthead majalah mode untuk hook; grotesk kecil kapital berspasi lebar untuk bukti.',
    composition: 'Foto hero full-bleed dua pertiga atas dengan hook besar menumpuk elegan ala sampul majalah; nilai plus jadi deck editorial rata kiri di sepertiga bawah dipisah garis hairline; identitas agent ringkas di kanan atas.',
    heroTreatment: 'Fotografi arsitektur resolusi tinggi dari destinasi paket, tone hangat majalah perjalanan premium, depth of field tipis.',
    mood: 'Anggun dan berkelas, seperti fitur utama majalah perjalanan mewah.',
    finishing: 'Grain kertas matte halus plus bingkai dalam garis hairline emas.',
  },
  {
    id: 'cinematic',
    name: 'Cinematic malam',
    palette: 'Color grading film teal-orange: bayangan teal gelap (#12343B), highlight amber (#E8A13D), warna kulit natural.',
    typography: 'Sans terkondensasi kapital ala judul film, tracking sangat lebar untuk hook; bukti kecil tipis seperti kredit poster.',
    composition: 'Satu adegan dramatis memenuhi kanvas dengan letterbox tipis atas-bawah; copy tenang di sepertiga bawah ala poster film; nilai plus seperti kredit pendek; identitas agent ringkas di kanan atas.',
    heroTreatment: 'Fotografi sinematik golden hour: siluet jamaah atau menara masjid dilatari matahari rendah, lens flare halus.',
    mood: 'Megah dan menggetarkan, seperti trailer perjalanan spiritual sekali seumur hidup.',
    finishing: 'Film grain 35mm halus dan vignette lembut di keempat sudut.',
  },
  {
    id: 'minimalis',
    name: 'Minimalis',
    palette: 'Putih gading (#FAFAF7) minimal 60% kanvas sebagai ruang kosong, teks hitam pekat, satu aksen emerald (#0E7A5F) untuk garis dan nomor.',
    typography: 'Grotesk netral ala Helvetica: hook besar rata kiri, nilai plus bernomor 01/02/03 dengan hierarki ukuran ketat.',
    composition: 'Grid asimetris disiplin: satu foto persegi terpotong presisi di kanan-tengah, hook dan nilai plus bernomor menuruni kolom kiri; identitas agent kecil di kanan atas; sisanya sengaja kosong.',
    heroTreatment: 'Satu foto dipotong ketat pada detail arsitektur atau transportasi paket, warna natural tanpa filter berlebihan.',
    mood: 'Tenang, rasional, percaya diri — premium lewat keteraturan, bukan ornamen.',
    finishing: 'Tanpa tekstur; tepi tajam dan garis pemisah hitam 1px.',
  },
  {
    id: 'monochrome',
    name: 'Monokrom bold',
    palette: 'Dua warna berani: latar emerald pekat (#06382B), tipografi putih tulang; aksen emas hanya pada satu kata kunci headline.',
    typography: 'Hook sans extra-bold raksasa memenuhi 50-60% kanvas, boleh terpotong elegan di tepi; bukti dalam grotesk medium kecil.',
    composition: 'Kanvas didominasi headline bertumpuk 3-4 baris; foto hero mengintip dari balik huruf atau di-masking ke kata terbesar; nilai plus anotasi kecil pada baris huruf; identitas agent kecil di kanan atas.',
    heroTreatment: 'Foto duotone emerald-putih elemen paket, ter-clip di dalam huruf atau di antara blok headline.',
    mood: 'Berani, modern, langsung ke inti — mustahil dilewatkan saat scroll.',
    finishing: 'Letterpress sangat halus pada huruf raksasa agar terasa dicetak.',
  },
  {
    id: 'mewah',
    name: 'Mewah & dramatis',
    palette: 'Hijau midnight nyaris hitam (#04231B) dominan; seluruh teks dan ornamen emas champagne (#D4B36A); tanpa warna ketiga.',
    typography: 'Serif ramping elegan berspasi lebar untuk hook; nilai plus kapital kecil emas seperti undangan gala.',
    composition: 'Simetris sentral ala undangan mewah: hero bercahaya di tengah, hook di bawahnya, nilai plus vertikal dipisah ornamen geometris islami tipis; identitas agent kecil di kanan atas.',
    heroTreatment: 'Arsitektur masjid atau interior hotel paket di malam hari menyala keemasan dari kegelapan, cahaya hangat.',
    mood: 'Khidmat dan eksklusif, seperti undangan pribadi ke perjalanan istimewa.',
    finishing: 'Foil emas pada garis ornamen, glow lembut di sekitar sumber cahaya.',
  },
  {
    id: 'earthy',
    name: 'Natural earthy',
    palette: 'Earth tone natural: pasir hangat (#D8C3A5), coklat tanah (#6F5B3E), putih berdebu; aksen oranye kunyit kecil untuk anotasi.',
    typography: 'Serif buku klasik untuk hook naratif; caption kecil ala reportase dengan garis penunjuk tipis per bukti.',
    composition: 'Satu foto candid kuat full-bleed; hook ala judul reportase di sepertiga atas; nilai plus caption beranotasi menempel pada elemen nyata; identitas agent sebagai byline kanan atas.',
    heroTreatment: 'Foto dokumenter jujur tanpa pose: tangan berdoa, jendela kereta, koper di lobi hotel paket — cahaya alami.',
    mood: 'Jujur dan mengharukan, seperti kisah nyata yang sedang berlangsung.',
    finishing: 'Grain film ISO 400, highlight sedikit terbakar, tanpa efek glossy.',
  },
  {
    id: 'pastel',
    name: 'Pastel lembut',
    palette: 'Sage lembut, biru muda, lilac, dan krem dengan gradasi airy serta kontras teks yang tetap jelas.',
    typography: 'Sans humanis bersih dengan bobot medium; hook membulat lembut tanpa terasa kekanak-kanakan.',
    composition: 'Satu hero visual kuat dengan bentuk organik membulat, ruang kosong lega, dan nilai plus tersusun ringan tanpa card bertumpuk.',
    heroTreatment: 'Fotografi destinasi terang dengan cahaya diffuse, warna pastel alami, dan detail tetap tajam.',
    mood: 'Menenangkan, ramah, dan optimistis.',
    finishing: 'Gradasi halus, soft grain tipis, dan bayangan sangat lembut.',
  },
  {
    id: 'cerah',
    name: 'Cerah & ceria',
    palette: 'Sky blue, teal, dan coral yang cerah dengan dasar putih hangat dan kontras aksesibel.',
    typography: 'Sans-serif modern bersahabat dengan hook tebal dan subcopy ringan.',
    composition: 'Komposisi dinamis dengan satu hero terang, bentuk organik, ruang putih cukup, dan nilai plus mengikuti alur visual.',
    heroTreatment: 'Fotografi perjalanan berlimpah cahaya pagi, warna segar, ekspresi natural, tanpa saturasi berlebihan.',
    mood: 'Optimistis, ramah, dan energik.',
    finishing: 'Highlight bersih, gradien tipis, dan aksen grafis coral secukupnya.',
  },
  {
    id: 'klasik',
    name: 'Klasik islami',
    palette: 'Dasar gading (#F4EEE1), pola bintang delapan emerald (#046A38) dan teal malam (#0E3B43), garis pola emas metalik (#D4AF37).',
    typography: 'Sans geometris kapital tracking lebar untuk hook; nomor nilai plus dalam medali oktagonal kecil.',
    composition: 'Medali bintang delapan raksasa di tengah berisi foto hero; pola girih menerus keluar medali lalu memudar ke tepi; copy simetris pada sumbu tengah; identitas agent kecil di kanan atas.',
    heroTreatment: 'Foto landmark paket dipotong presisi bentuk bintang delapan, tone emerald-emas menyatu dengan pola.',
    mood: 'Tertata, intelektual, abadi — presisi geometri Islam sebagai bahasa kemewahan.',
    finishing: 'Letterpress samar pada dasar kertas, garis pola 1-2px, tanpa drop shadow.',
  },
  {
    id: 'modern',
    name: 'Modern premium',
    palette: 'Mesh gradient halus emerald (#0E5A43) → teal (#116466) → pasir hangat (#E9D8B4); teks putih, aksen safron lembut (#E8C468).',
    typography: 'Sans variabel modern semi-bold besar, nomor nilai plus dalam pill badge membulat — rasa produk digital premium.',
    composition: 'Jendela lengkung mihrab besar di tengah berisi foto hero; ornamen garis tipis jarang; copy berhierarki jelas di bawah jendela; identitas agent bersih di kanan atas.',
    heroTreatment: 'Foto destinasi cerah tajam dalam lengkung mihrab bertepi bersih; satu elemen menyembul keluar bingkai untuk kedalaman.',
    mood: 'Segar, optimis, digital-native — umroh terasa dekat bagi generasi muda.',
    finishing: 'Noise grain tipis anti-banding, soft shadow lembut di bawah jendela mihrab.',
  },
  {
    id: 'elegan',
    name: 'Elegan emas',
    palette: 'Ivory, hitam lembut, dan aksen emas metalik subtil dengan kontras premium.',
    typography: 'Serif display elegan untuk hook dipadukan sans-serif bersih untuk bukti nilai plus.',
    composition: 'Komposisi simetris dan lapang dengan satu hero visual, garis emas tipis, dan hierarki copy yang tenang.',
    heroTreatment: 'Fotografi arsitektur atau perjalanan dengan pencahayaan hangat, detail mewah, dan warna kulit natural.',
    mood: 'Anggun, hangat, dan berkelas tanpa berlebihan.',
    finishing: 'Foil emas tipis, matte grain lembut, tanpa ornamen ramai.',
  },
  {
    id: 'futuristic',
    name: 'Futuristik glass',
    palette: 'Gradasi teal–indigo dengan glow halus, dasar gelap bersih, dan teks putih berkontras tinggi.',
    typography: 'Sans geometris modern dengan tracking rapi dan angka tegas.',
    composition: 'Satu hero visual dominan dengan glassmorphism terkontrol, garis cahaya, dan panel transparan seminimal mungkin.',
    heroTreatment: 'Fotografi tajam dengan depth digital halus dan pantulan cahaya teal–indigo.',
    mood: 'Modern, inovatif, dan elegan.',
    finishing: 'Glass blur terkontrol, glow tipis, noise anti-banding, tanpa efek sci-fi berlebihan.',
  },
];

const DEFAULT_STYLE = PACKAGE_VALUE_STYLES.find((style) => style.id === 'modern') || PACKAGE_VALUE_STYLES[0];

function resolvePackageValueStyle(style) {
  return PACKAGE_VALUE_STYLES.find((item) => item.id === style?.id) || DEFAULT_STYLE;
}

/**
 * Pilih arah desain untuk satu request. `excludeId` dipakai tombol "ganti gaya"
 * agar rotasi selalu menghasilkan gaya yang berbeda dari yang barusan tampil.
 */
export function pickPackageValueStyle({ preferredId = '', excludeId = '', random = Math.random } = {}) {
  const preferred = PACKAGE_VALUE_STYLES.find((item) => item.id === preferredId);
  if (preferred) return preferred;
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

function normalizeGroundingText(value) {
  return cleanText(value, 1200)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('id-ID')
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsGroundingTerm(normalizedText, term) {
  const normalizedTerm = normalizeGroundingText(term);
  return normalizedTerm && ` ${normalizedText} `.includes(` ${normalizedTerm} `);
}

function containsFactGroup(normalizedText, group) {
  return group.terms.some((term) => containsGroundingTerm(normalizedText, term));
}

function buildCatalogFactGroups(evidenceCatalog) {
  const namedTerms = new Set();
  for (const evidence of Array.isArray(evidenceCatalog) ? evidenceCatalog : []) {
    const matches = String(evidence?.fact ?? '').match(/\b[A-Z][A-Z0-9]{2,}\b/g) || [];
    for (const match of matches) {
      const term = match.toLocaleLowerCase('id-ID');
      // Kata yang sudah punya grup kanonis (MAKKAH, MADINAH, TAIF) tidak boleh
      // menjadi istilah named: — pencocokannya harfiah, sehingga brosur
      // "…OMAR MAKKAH" akan menolak copy "Makkah" untuk evidence itinerary yang
      // mengeja "Mekkah". Grup place:/landmark: sudah menjaganya berikut sinonim.
      if (CATALOG_NAMED_TERM_STOP_WORDS.has(match) || /^\d+$/.test(match)) continue;
      if (CANONICAL_GROUP_TERMS.has(term)) continue;
      namedTerms.add(term);
    }
  }
  return [
    ...GROUNDED_FACT_GROUPS,
    ...[...namedTerms].map((term) => ({ id: `named:${term}`, terms: [term] })),
  ];
}

/** Token harga utuh pada sebuah fakta ("45.900.000", "43.900.000"). */
function priceTokensFromFact(fact) {
  return String(fact ?? '').match(/\d[\d.]{6,}\d/g) || [];
}

function groundingNumbers(value) {
  return (String(value ?? '').match(/\d+(?::\d+)?/g) || [])
    .map((item) => item.includes(':') ? item : String(Number(item)))
    .filter((item) => item !== 'NaN');
}

function findEvidenceBindingIssue(text, evidenceFact, factGroups) {
  const normalizedText = normalizeGroundingText(text);
  const normalizedEvidence = normalizeGroundingText(evidenceFact);
  if (!normalizedText) return 'empty-copy';
  if (DISPLAY_HARD_FORBIDDEN_PATTERN.test(text) || DISPLAY_RAW_CATALOG_PATTERN.test(text)) return 'internal-copy';
  const roomJargon = text.match(DISPLAY_ROOM_JARGON_PATTERN) || [];
  if (roomJargon.length) {
    const payload = normalizeGroundingText(evidencePayload(evidenceFact));
    const allNamedInEvidence = roomJargon.every((word) => (
      ` ${payload} `.includes(` ${normalizeGroundingText(word)} `)
    ));
    if (!allNamedInEvidence) return 'internal-copy';
  }

  const claimsTrainRide = /\b(?:(?:melaju|menaiki|naik|menggunakan)\b[^.]{0,45}\bkereta|perjalanan\s+(?:dengan\s+)?kereta)\b/i.test(text);
  const evidenceProvesTrainRide = /\b(?:(?:melaju|menaiki|naik|menggunakan)\b[^.]{0,45}\bkereta|perjalanan\s+(?:dengan\s+)?kereta|kereta\b[^.]{0,45}\bmenuju)\b/i.test(evidenceFact);
  if (claimsTrainRide && !evidenceProvesTrainRide) return 'relation:train-ride';

  for (const group of [...factGroups, ...SOURCE_REQUIRED_CLAIM_GROUPS]) {
    if (containsFactGroup(normalizedText, group) && !containsFactGroup(normalizedEvidence, group)) {
      return group.id;
    }
  }

  // Harga selalu tampil dalam bentuk ringkas ("43.900.000" → "43.9 JUTA"), jadi
  // pecahannya wajib dianggap terbukti — kalau tidak, poin harga bikinan sistem
  // sendiri ditolak sebagai angka tanpa sumber. Diringkas PER HARGA: memformat
  // seluruh fakta akan melumat tiga harga kamar menjadi satu angka raksasa dan
  // justru mengesahkan angka yang tidak pernah ada.
  const evidenceNumbers = new Set([
    ...groundingNumbers(evidenceFact),
    ...priceTokensFromFact(evidenceFact).flatMap((raw) => groundingNumbers(formatCompactMillionPrice(raw))),
  ]);
  const unsupportedNumber = groundingNumbers(text).find((number) => !evidenceNumbers.has(number));
  return unsupportedNumber ? `number:${unsupportedNumber}` : '';
}

function titleHasEvidenceAnchor(title, evidenceFact, factGroups) {
  const normalizedTitle = normalizeGroundingText(title);
  const normalizedEvidence = normalizeGroundingText(evidenceFact);
  if (!normalizedTitle || !normalizedEvidence) return false;

  if (factGroups.some((group) => (
    containsFactGroup(normalizedTitle, group) && containsFactGroup(normalizedEvidence, group)
  ))) return true;

  const evidenceTokens = new Set(normalizedEvidence.split(' '));
  return normalizedTitle.split(' ').some((token) => (
    token.length >= 4
    && !TITLE_ANCHOR_STOP_WORDS.has(token)
    && evidenceTokens.has(token)
  ));
}

function displayFactText(value) {
  return cleanText(value, 180)
    .replace(/\s*\([^)]*[★*]\s*\d[^)]*\)\s*/g, ' ')
    // Hedging brosur "X ATAU SETARAF" / "X/SETARAF" tidak pernah ikut tampil.
    .replace(/\s*(?:\/|\batau\b)?\s*\bsetaraf?\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('id-ID')
    .replace(/(^|[\s(/-])(\p{L})/gu, (match, sep, letter) => `${sep}${letter.toLocaleUpperCase('id-ID')}`)
    .replace(/\b(Sv|Ek|Ey|Ga|Tk|Qr|Sq|Wy|Kl|Hu|Fz)\s*(\d+)\b/g, (match, code, digits) => `${code.toUpperCase()} ${digits}`);
}

/** Normalisasi ejaan display: typo model & varian ejaan yang tidak konsisten. */
function fixDisplaySpelling(value) {
  return String(value ?? '')
    .replace(/\bjumataii+n\b/gi, 'Jumatain')
    .replace(/\bmedinah\b/gi, 'Madinah')
    .replace(/\bmekah\b/gi, 'Makkah');
}

function evidencePayload(evidenceFact) {
  const parts = cleanText(evidenceFact, 300).split(/\s+•\s+/).filter(Boolean);
  return parts.at(-1) || cleanText(evidenceFact, 300);
}

// Ambang pemulihan rujukan evidence: klaim harus cukup panjang dan hampir
// seluruh kata isinya harus ada pada fakta kandidat.
const EVIDENCE_RECOVERY_MIN_TOKENS = 3;
const EVIDENCE_RECOVERY_MIN_SCORE = 0.7;

function evidenceIdFamily(id) {
  return String(id || '').toLocaleUpperCase('id-ID').replace(/\d+$/, '');
}

/**
 * Model kadang memakai fakta katalog dengan benar tetapi menulis evidenceId yang
 * tidak ada (mis. I05A04 untuk fakta milik I05A03). Karena salah ketik itu
 * berulang pada percobaan perbaikan, fail-closed membuat paket tersebut gagal
 * permanen. Pulihkan rujukannya lewat teks: kandidat dinilai dari kata isi yang
 * benar-benar muncul pada fakta, dan hanya diterima bila satu kandidat menang
 * telak. Ini bukan pelonggaran grounding — findEvidenceBindingIssue tetap
 * menguji seluruh copy terhadap fakta hasil pemulihan, sehingga poin yang
 * menempel ke fakta keliru tetap ditolak.
 */
function recoverEvidenceByText(item, evidenceCatalog) {
  // Pemulihan hanya untuk SALAH KETIK, bukan tebak-tebakan: ID karangan harus
  // sekeluarga dengan kandidatnya (I05A04→I05A03 boleh, I02A02→I01A01 tidak).
  // Tanpa syarat ini, ID karangan bisa menempel ke fakta hari lain yang judul
  // harinya kebetulan melegalkan klaim yang seharusnya ditolak.
  const family = evidenceIdFamily(item?.evidenceId);
  if (!family) return null;

  // Klaim diuji terhadap isi aktivitas, bukan judul hari — header "Hari 5 •
  // Kereta Cepat Haramain Madinah - Makkah" bukan bukti bagi aktivitasnya.
  const claimTokens = normalizeGroundingText(item?.description || item?.sourceRef || '')
    .split(' ')
    .filter((token) => token.length >= 4 && !TITLE_ANCHOR_STOP_WORDS.has(token));
  if (claimTokens.length < EVIDENCE_RECOVERY_MIN_TOKENS) return null;

  const scored = (Array.isArray(evidenceCatalog) ? evidenceCatalog : [])
    .filter((evidence) => (
      evidence?.id
      && ALLOWED_SOURCES.has(evidence?.source)
      && evidenceIdFamily(evidence.id) === family
    ))
    .map((evidence) => {
      const factTokens = new Set(normalizeGroundingText(evidencePayload(evidence.fact)).split(' '));
      const hits = claimTokens.filter((token) => factTokens.has(token)).length;
      return { evidence, score: hits / claimTokens.length };
    })
    .filter((candidate) => candidate.score >= EVIDENCE_RECOVERY_MIN_SCORE)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return null;

  // Seri = ambigu. Jangan menebak sumbernya.
  const [best, runnerUp] = scored;
  if (runnerUp && runnerUp.score === best.score) return null;
  return best.evidence;
}

function labelsPresentInEvidence(evidenceFact, prefix = '') {
  const normalized = normalizeGroundingText(evidenceFact);
  return GROUNDED_FACT_GROUPS
    .filter((group) => (!prefix || group.id.startsWith(prefix)) && containsFactGroup(normalized, group))
    .map((group) => FACT_GROUP_DISPLAY_LABELS.get(group.id))
    .filter(Boolean);
}

function sentenceFromEvidence(value) {
  const words = cleanText(value, 150)
    .replace(/[.;,\s]+$/, '')
    .split(/\s+/)
    .slice(0, 12);
  // Jangan berhenti di potongan daftar/kata sambung ("..., El." / "... dan").
  // Angka pendek sah (nomor penerbangan "57") tidak ikut dibuang.
  const isOrphanTail = (word) => {
    const bare = word.replace(/[^\p{L}\p{N}]/gu, '');
    if (/^\d+$/.test(bare)) return false;
    return /^(?:dan|serta|dengan|ke|di|el|al|the|by|&|&amp;)$/i.test(bare) || bare.length <= 2;
  };
  while (words.length > 1 && isOrphanTail(words.at(-1))) {
    words.pop();
  }
  const cleanValue = words.join(' ').replace(/[,;:]+$/, '');
  return cleanValue ? `${cleanValue}.` : '';
}

function copyShapeIssue(title, benefit, description) {
  const wordCount = (value) => cleanText(value, 500).split(/\s+/).filter(Boolean).length;
  if (wordCount(title) > 4) return 'title-too-long';
  if (wordCount(benefit) > 12) return 'benefit-too-long';
  if (wordCount(description) > 12) return 'description-too-long';
  return '';
}

/**
 * Jalan keluar deterministik setelah satu repair AI gagal. Model tetap memilih
 * evidence yang paling menarik, tetapi copy berisiko dibangun ulang hanya dari
 * satu fact tersebut sehingga moda, kota, hotel, dan klaim tidak bisa silang.
 */
function buildEvidenceBoundAdvantage(evidence) {
  const fact = cleanText(evidence?.fact, 300);
  const payload = evidencePayload(fact);
  const places = labelsPresentInEvidence(fact, 'place:');
  const landmarks = labelsPresentInEvidence(fact, 'landmark:');
  const hotelMatch = fact.match(/Hotel\s+([^:]+?)(?:\s+tier\s+[^:]+)?:\s*(.+)$/i);

  if (hotelMatch) {
    const city = places[0] || displayFactText(hotelMatch[1].replace(/\s+tier\s+.*$/i, '')) || 'tujuan';
    const fullHotel = displayFactText(hotelMatch[2]);
    // Potong di batas kata yang wajar: "Al Ritz Al Madinah" jangan jadi
    // "Al Ritz Al" — buang kata sambung nama hotel yang menggantung di ekor.
    const hotelWords = fullHotel.split(/\s+/).slice(0, 3);
    while (hotelWords.length > 1 && /^(?:al|el|dar|the|le|by|bin)$/i.test(hotelWords.at(-1))) {
      hotelWords.pop();
    }
    const shortHotel = hotelWords.join(' ');
    return {
      title: `Hotel ${shortHotel}`,
      benefit: `Bermalam di ${shortHotel} selama di ${city}`,
      description: `Menginap di ${fullHotel} selama berada di ${city}.`,
    };
  }

  // Format lama ("Maskapai/penerbangan berangkat: SAUDIA • SV 827 • …") tetap
  // dikenali karena cache dan katalog lama masih memakainya.
  if (/^(?:Maskapai\/penerbangan|Maskapai|Penerbangan berangkat)\b/i.test(fact)) {
    const head = (fact.split(':').slice(1).join(':').split(/\s+[—•]\s+/)[0] || '').trim();
    // Kode penerbangan bukan bahasa iklan: "SAUDIA SV 827" → "SAUDIA".
    const airline = displayFactText(head.replace(/\b[A-Z]{2}\s?\d{2,4}(?:\/\d{2,4})*\b/g, '').trim())
      || displayFactText(head);
    // Fakta turunan direct flight jauh lebih menjual daripada nama maskapai.
    const directMatch = fact.match(/Penerbangan langsung tanpa transit\s+([A-Za-z .]+)-([A-Za-z .]+)/i);
    if (directMatch) {
      const destination = displayFactText(directMatch[2]);
      return {
        title: `Terbang Langsung ke ${destination}`,
        benefit: `Penerbangan ${airline} langsung tanpa transit menuju ${destination}`,
        description: `Rute berangkat langsung ${displayFactText(directMatch[1])}-${destination} tanpa transit.`,
      };
    }
    return {
      title: `Penerbangan ${airline}`,
      benefit: `Memulai perjalanan udara bersama ${airline}`,
      description: `Penerbangan berangkat menggunakan ${airline}.`,
    };
  }

  if (/\b(?:kereta|haramain)\b/i.test(fact)) {
    const trainName = /haramain/i.test(fact) ? 'Kereta Cepat Haramain' : 'Kereta Cepat';
    const destination = places.at(-1);
    const provesTrainRide = /\b(?:(?:melaju|menaiki|naik|menggunakan)\b[^.]{0,45}\bkereta|perjalanan\s+(?:dengan\s+)?kereta|kereta\b[^.]{0,45}\bmenuju)\b/i.test(fact);
    return {
      title: trainName,
      benefit: provesTrainRide
        ? (destination ? `Melaju menuju ${destination} dengan ${trainName}` : `Melaju dengan ${trainName}`)
        : 'Perjalanan berlanjut lewat stasiun kereta cepat',
      description: sentenceFromEvidence(payload),
    };
  }

  if (/\b(?:pesawat|penerbangan|airlines?|maskapai)\b/i.test(fact)) {
    // Kota tujuan hanya dari kalimat penerbangannya sendiri — judul hari/agenda
    // pada fact yang sama bisa menyebut kota lain (Thaif) yang dicapai darat.
    // Leg transit tidak pernah dijual sebagai tujuan.
    const payloadPlaces = labelsPresentInEvidence(payload, 'place:');
    const destination = /\btransit\b/i.test(fact) ? '' : payloadPlaces.at(-1);
    const operatorMatch = payload.match(/pesawat\s+(.+?)(?:\s+(?:menuju|dari|jamaah|jemaah|kembali|tiba|melanjutkan|berangkat|dan)\b|$)/i);
    const operatorRaw = cleanText(operatorMatch?.[1], 80);
    const operator = displayFactText(operatorRaw);
    const operatorName = displayFactText(operatorRaw.replace(/\b[A-Z]{2}\s*\d+\b/gi, '').trim()) || operator;
    return {
      title: destination ? `Penerbangan ke ${destination}` : `Penerbangan ${operatorName || 'Paket'}`,
      benefit: destination
        ? `Terbang menuju ${destination}${operator ? ` bersama ${operator}` : ''}`
        : `Memulai perjalanan udara${operator ? ` bersama ${operator}` : ''}`,
      description: sentenceFromEvidence(payload),
    };
  }

  if (/\b(?:cruise|kapal pesiar)\b/i.test(fact)) {
    const anchor = landmarks.find((label) => label === 'Bosphorus') || places.at(-1) || 'Paket';
    const cruiseLabel = /\bprivate\s+cruise\b/i.test(fact) ? 'private cruise' : 'cruise';
    return {
      title: `Cruise ${anchor}`,
      benefit: `Menyusuri ${anchor} dengan ${cruiseLabel}`,
      description: sentenceFromEvidence(payload),
    };
  }

  if (/\b(?:city\s*tour|citytour|tour|mengunjungi)\b/i.test(fact) && (places.length || landmarks.length)) {
    const place = places.at(-1) || landmarks[0];
    const highlights = landmarks.slice(0, 2).join(' dan ');
    return {
      title: `Jelajah ${place}`,
      benefit: highlights ? `Menjelajahi ${highlights} di ${place}` : `Menjelajahi ${place} dalam rangkaian perjalanan`,
      description: sentenceFromEvidence(payload),
    };
  }

  if (/\bHarga\b/i.test(fact)) {
    // Satu fakta memuat harga beberapa kamar. Pakai yang termurah — sama dengan
    // jangkar penawaran pada banner (pickOfferAnchor) — supaya artwork tidak
    // memajang dua angka berbeda, dan jangan pernah meringkas seluruh fakta.
    const priceTokens = priceTokensFromFact(fact);
    const anchor = priceTokens.length
      ? priceTokens.reduce((cheapest, current) => (
        Number(current.replace(/\D/g, '')) < Number(cheapest.replace(/\D/g, '')) ? current : cheapest
      ))
      : fact;
    const price = formatCompactMillionPrice(anchor);
    return {
      title: `Harga ${price}`,
      benefit: `Harga paket tercantum ${price}`,
      description: `Harga paket yang tercantum adalah ${price}.`,
    };
  }

  const anchorWords = displayFactText(payload)
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !TITLE_ANCHOR_STOP_WORDS.has(word.toLocaleLowerCase('id-ID')))
    .slice(0, 3)
    .join(' ');
  const title = anchorWords || 'Agenda Perjalanan';
  return {
    title,
    benefit: `Ada ${title} dalam rangkaian perjalanan`,
    description: sentenceFromEvidence(payload),
  };
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

/** "43900000" / "Rp43.900.000" → "43.9 JUTA". */
export function formatCompactMillionPrice(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  const amount = Number(digits);
  if (!Number.isFinite(amount) || amount <= 0) return cleanText(value, 60);
  const millions = Math.round((amount / 1_000_000) * 10) / 10;
  const display = Number.isInteger(millions) ? String(millions) : millions.toFixed(1);
  return `${display} JUTA`;
}

function headlineTokens(value) {
  return new Set(cleanText(value, 160)
    .toLocaleLowerCase('id-ID')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !HEADLINE_STOP_WORDS.has(token)));
}

function isGenericUmrohAdvantage(item) {
  const text = [item.title, item.benefit, item.description, item.sourceRef].filter(Boolean).join(' ');
  return GENERIC_UMROH_ACTIVITY_PATTERN.test(text) && !DISTINCTIVE_VALUE_PATTERN.test(text);
}

/**
 * Satu aspek satu poin: dua poin penerbangan ("Penerbangan Saudia" muncul dua
 * kali dari evidence brosur + itinerary), dua kereta, atau dua hotel di kota
 * yang sama membuat iklan terasa mengulang. Poin terkuat (urutan ranking)
 * menang; sisanya dibuang.
 */
function advantageAspectKey(item) {
  const combined = normalizeGroundingText(
    [item.title, item.benefit, item.description, item.sourceRef].filter(Boolean).join(' '),
  );
  // Kode penerbangan (SV 817, EK 359) = aspek pesawat meski kata "penerbangan"
  // tidak ditulis — menutup duplikat terselubung "Berangkat Kota Jeddah".
  if (/\b(?:sv|ek|ey|ga|gia|tk|qr|sq|wy|kl|hu|fz|ez)\s?\d{2,4}\b/.test(combined)) return 'transport:plane';
  for (const group of GROUNDED_FACT_GROUPS) {
    if (group.id.startsWith('transport:') && containsFactGroup(combined, group)) return group.id;
  }
  const hotelMatch = String(item.sourceRef || '').match(/^Hotel\s+([a-z]+)/i);
  if (hotelMatch) return `hotel:${hotelMatch[1].toLocaleLowerCase('id-ID')}`;
  return `evidence:${item.evidenceId || normalizeGroundingText(item.title)}`;
}

function dedupeAdvantageAspects(advantages) {
  const seenAspects = new Set();
  const seenTitles = new Set();
  return advantages.filter((item) => {
    const key = advantageAspectKey(item);
    const titleKey = normalizeGroundingText(item.title);
    if (seenAspects.has(key) || (titleKey && seenTitles.has(titleKey))) return false;
    seenAspects.add(key);
    if (titleKey) seenTitles.add(titleKey);
    return true;
  });
}

function rankAdvantagesForCreative(advantages, headline) {
  // Aktivitas rutin tidak pernah dipulihkan sebagai filler. Lebih baik meminta
  // model memperbaiki hasil daripada mempromosikan Raudhah/ziarah standar
  // sebagai pembeda paket.
  const candidates = advantages.filter((item) => !isGenericUmrohAdvantage(item));
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
      // Poin penerbangan bermuatan "tanpa transit" harus memenangkan aspek
      // penerbangan atas evidence itinerary rutin ("Berangkat dengan pesawat…").
      const directFlight = /tanpa transit/i.test(text) ? 1 : 0;
      return { item, index, score: (overlap * 20) + (directFlight * 8) + (distinctive * 5) + (item.source === 'itinerary' ? 1 : 0) };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ item }) => item);
}

/** "Plus Turkey 15hr" → "Umroh Plus Turkey 15 Hari" — rapikan durasi,
 * pastikan kategori Umroh terbaca, dan buang sufiks maskapai yang redundan. */
export function displayPackageName(name) {
  let normalized = cleanText(name, 240)
    .replace(/\s+BY\s+.+$/i, '')
    .replace(/\b(\d+)\s*(?:hari|hrs?|h)\b/gi, '$1 Hari')
    .replace(/^umrah\b/i, 'Umroh')
    .trim();
  if (!normalized) return '';
  if (!/^umroh\b/i.test(normalized)) normalized = `Umroh ${normalized}`;
  return normalized.toLocaleLowerCase('id-ID').replace(/(^|[\s(/-])(\p{L})/gu, (match, sep, letter) => `${sep}${letter.toLocaleUpperCase('id-ID')}`);
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
    const price = formatCompactMillionPrice(packageData.pricing[primaryRoom]);
    if (price) return { type: 'price', text: price, qualifier: roomPhrases[primaryRoom] };
  }
  const date = formatIndonesianDate(packageData.departure?.date);
  return date ? { type: 'date', text: `Berangkat ${date}` } : null;
}

function packageReferenceLines(packageData = {}) {
  const facts = [];
  const add = (label, value) => {
    const cleanValue = cleanText(value, 240);
    if (cleanValue) facts.push(`- ${label}: ${cleanValue}`);
  };

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
  { includeSourceRefs: false, includeAudience: false },
  { includeSourceRefs: false, includeAudience: false, visualIdeaMax: 100, includeFinishing: false },
  { includeSourceRefs: false, includeAudience: false, visualIdeaMax: 0, includeFinishing: false, includeMood: false },
  {
    includeSourceRefs: false,
    includeAudience: false,
    includeReferenceFacts: false,
    visualIdeaMax: 0,
    includeFinishing: false,
    includeMood: false,
    includeHeroTreatment: false,
    headlineMax: 80,
    summaryMax: 100,
    benefitMax: 78,
    descriptionMax: 88,
    titleMax: 50,
  },
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
  visualIdeaMax = 200,
  includeFinishing = true,
  includeMood = true,
  includeHeroTreatment = true,
  includeReferenceFacts = true,
  headlineMax = 120,
  summaryMax = 160,
  benefitMax = 120,
  descriptionMax = 140,
  titleMax = 60,
} = {}) {
  const audience = includeAudience
    ? cleanText((Array.isArray(result.bestFor) ? result.bestFor : [])
      .map((item) => cleanText(item, 100))
      .filter(Boolean)
      .join(', '), 200)
    : '';
  const referenceFacts = includeReferenceFacts ? packageReferenceLines(packageData) : [];
  const packageName = displayPackageName(packageData.name);
  const departureDate = formatIndonesianDate(packageData.departure?.date);
  const offerAnchor = pickOfferAnchor(packageData);
  const visualIdea = visualIdeaMax > 0 ? cleanText(result.visualIdea, visualIdeaMax) : '';
  // Setiap poin membawa jawaban "kenapa menarik"; bukti lengkap hanya tampil
  // pada poin utama supaya hasil tidak kembali terasa seperti brosur.
  const advantageDirectives = result.advantages.slice(0, MAX_PACKAGE_VALUE_ADVANTAGES).map((item, index) => {
    const sourceRef = includeSourceRefs ? cleanText(item.sourceRef, 180) : '';
    const benefit = cleanText(item.benefit, benefitMax);
    const description = cleanText(item.description, descriptionMax);
    const isPrimary = index === 0;
    const internalRef = includeSourceRefs
      ? [!isPrimary ? description : '', sourceRef].filter(Boolean).join(' • ')
      : '';
    return [
      `NILAI PLUS ${index + 1}${isPrimary ? ' — PESAN UTAMA' : ''}`,
      `- Judul yang wajib tampil: “${cleanText(item.title, titleMax)}”`,
      benefit ? `- KENAPA MENARIK — wajib tampil: “${benefit}”` : null,
      isPrimary ? `- BUKTI KONKRET — wajib tampil: “${description}”` : null,
      internalRef ? `- Referensi visual internal, JANGAN tampilkan teks ini di artwork: ${internalRef}` : null,
    ].filter(Boolean).join('\n');
  });
  const offerDirectives = offerAnchor?.type === 'price'
    ? [
      'HARGA — OUTSTANDING NAMUN PROPORSIONAL',
      `- Tampilkan price lockup “${offerAnchor.text}” agar mudah terlihat, tetapi tetap lebih kecil daripada hook dan tidak mengambil alih bagian keunggulan.`,
      `- Kata “MULAI” kecil di atas; “${offerAnchor.qualifier}” sebagai microcopy. Angka tebal, “JUTA” lebih kecil; tinggi seluruh lockup maksimal sekitar 12–15% kanvas. Jangan tulis digit rupiah panjang.`,
    ]
    : offerAnchor?.text
      ? ['ANCHOR PENAWARAN', `- Tampilkan “${offerAnchor.text}” secara ringkas setelah nilai plus.`]
      : [];

  return [
    'Buat SATU ad creative umroh yang scroll-stopping, bukan brosur atau katalog. Output final WAJIB berupa kanvas potret rasio 4:5—bukan 9:16, 1:1, landscape, atau rasio lain. Selesaikan artwork langsung di kanvas 4:5; tanpa area sisa untuk crop.',
    '',
    `ARAH DESAIN — ${activeStyle.name.toLocaleUpperCase('id-ID')}`,
    `- Palet: ${activeStyle.palette}`,
    `- Tipografi: ${activeStyle.typography}`,
    `- Komposisi: ${activeStyle.composition}`,
    includeHeroTreatment ? `- Hero visual: ${activeStyle.heroTreatment}` : null,
    includeMood ? `- Mood: ${activeStyle.mood}` : null,
    includeFinishing ? `- Finishing: ${activeStyle.finishing}` : null,
    '- Ikuti satu gaya ini secara konsisten. Jaga visual lega dan copy menyatu, bukan layout katalog.',
    '',
    'INFORMASI PAKET — WAJIB TAMPIL',
    packageName ? `- Nama paket: “${packageName}”` : null,
    departureDate ? `- Tanggal keberangkatan: “${departureDate}”` : null,
    '- Tampilkan keduanya rapi dekat hook, tetap terbaca tanpa mengalahkan keunggulan.',
    '',
    'BIG IDEA — KENAPA HARUS PILIH PAKET INI?',
    `Hook utama: “${cleanText(result.headline, headlineMax)}”`,
    result.summary ? `Jawaban utama yang wajib tampil: “${cleanText(result.summary, summaryMax)}”` : null,
    visualIdea ? `Adegan hero: ${visualIdea}` : null,
    visualIdea ? '- Terjemahkan adegan hero sepenuhnya ke medium, palet, dan waktu-cahaya ARAH DESAIN di atas; bila keduanya bertentangan, arah desain yang menang.' : null,
    '- Dalam 3 detik audiens harus menangkap alasan spesifik memilih paket ini: hook memancing, jawaban utama memberi manfaat, hero dan NILAI PLUS 1 membuktikan.',
    '- Jangan sekadar memajang destinasi; bangun argumen visual mengapa pengalaman ini berbeda dan layak dipilih.',
    '',
    'ALASAN MEMILIH PAKET INI — INTI IKLAN',
    '- Judul bagian yang WAJIB tampil persis: “Kenapa Paket Ini Menarik?”',
    ...advantageDirectives,
    '- Tampilkan 3–4 NILAI PLUS beserta baris KENAPA MENARIK; jangan ganti dengan kata sifat generik atau chip dekoratif.',
    '- NILAI PLUS 1 menjadi alasan utama; poin 2–4 menguatkan keputusan. Satukan sebagai narasi, bukan daftar spesifikasi atau card terpisah.',
    '',
    'BONUS PAKET — WAJIB TAMPIL',
    '- Tulis persis: “Bonus Ayam Al-Baik” dan “Gratis Zam-Zam 5 Liter”.',
    '- Satukan sebagai satu aksen teks ringkas di bawah keunggulan; bukan hero, bukan dua card, dan jangan mengarang foto produk.',
    '',
    ...offerDirectives,
    offerDirectives.length ? '' : null,
    'LAMPIRAN IDENTITAS AGENT',
    '- Lampiran putih polos berisi logo, foto bila tersedia, nama, WhatsApp, dan URL profil. Ambil persis; tata letak lampiran bukan referensi desain.',
    '- POSISI MUTLAK: logo Alhijaz hanya di POJOK KIRI ATAS, sekitar 14–17% lebar kanvas, proporsi asli dan margin aman.',
    '- Identitas agent hanya di SISI KANAN ATAS: foto lingkaran kecil di kiri blok tiga baris nama, WhatsApp berformat tanda hubung, dan URL. Seluruh cluster rata kanan, center-aligned vertikal, serta tidak menabrak logo, hook, atau hero.',
    '- Foto maksimal setinggi blok tiga baris dan tidak boleh dominan. Bila foto tidak ada jangan membuat wajah. Identitas menyatu tanpa card, badge, atau panel latar.',
    '',
    'BATAS TEKS LAIN YANG BOLEH TERLIHAT',
    '- Selain materi yang diwajibkan di atas, tidak ada CTA, tombol, QR code, atau ajakan menghubungi.',
    '',
    referenceFacts.length ? 'FAKTA ACUAN — HANYA KONTEKS, BUKAN UNTUK DITEMPEL' : null,
    ...referenceFacts,
    audience ? `- Audiens: ${audience}` : null,
    '- Jangan membuat blok spesifikasi paket; nilai plus tetap pesan yang paling menonjol.',
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
    // Logistik transportasi rutin dibuang TANPA pengecualian distinctive:
    // "Transit di Haikou"/"Tiba di Bursa" tetap perpindahan, bukan keunggulan.
    if (source === 'itinerary' && ROUTINE_TRANSPORT_PATTERN.test(cleanFact)) return;
    if (
      source === 'itinerary'
      && GENERIC_UMROH_ACTIVITY_PATTERN.test(cleanFact)
      && !DISTINCTIVE_VALUE_PATTERN.test(cleanFact)
    ) return;
    if (cleanFact) evidence.push({ id, source, fact: cleanFact });
  };

  // Kandidat utama: maskapai, hotel bernama spesifik, dan itinerary unik.
  // Nama paket/tier/tanggal/harga tidak langsung dimasukkan agar model tidak
  // memilih label katalog sebagai pembeda saat empat fakta kuat sudah tersedia.
  // Rute berangkat satu segmen menurunkan fakta "penerbangan langsung tanpa
  // transit" — pembeda yang jauh lebih menjual daripada sekadar nama maskapai.
  // Fakta brosur ditulis dengan kosakata yang boleh ikut tampil. Sebelumnya
  // fakta memuat "Maskapai/penerbangan", "•", dan "tier UHUD" — persis kata yang
  // dilarang muncul pada copy, sehingga model yang patuh menyalin sumbernya
  // selalu ditolak dan setiap analisis terpaksa membayar panggilan AI kedua.
  // Tier tetap dikirim lewat context.package.tier, jadi tidak ada info hilang.
  const directFact = directFlightFactFromRoute(packageData.departure.route);
  const flightHead = [packageData.airline, packageData.departure.flight].filter(Boolean).join(' ');
  add('B03', 'brosur', flightHead
    ? `Penerbangan berangkat: ${[flightHead, directFact].filter(Boolean).join(' — ')}`
    : '');

  let hotelIndex = 1;
  for (const [city, hotel] of Object.entries(packageData.hotel || {})) {
    add(`BH${String(hotelIndex).padStart(2, '0')}`, 'brosur', `Hotel ${city}: ${hotel}`);
    hotelIndex += 1;
  }

  for (const [dayIndex, day] of (itinerary?.days || []).entries()) {
    const dayId = `I${String(dayIndex + 1).padStart(2, '0')}`;
    if (day.activities.length === 0) {
      add(dayId, 'itinerary', [day.dayNumber, day.title, day.location].filter(Boolean).join(' • '));
    }
    for (const [activityIndex, activity] of day.activities.entries()) {
      // Judul hari hanya ikut bila membawa konteks non-rutin yang konkret.
      // Lokasi/rute hari sengaja tidak ditempel utuh karena dapat mencampur kota
      // yang tidak berhubungan langsung dengan aktivitas terpilih.
      const distinctiveDayTitle = day.title
        && (!GENERIC_UMROH_ACTIVITY_PATTERN.test(day.title) || DISTINCTIVE_VALUE_PATTERN.test(day.title))
        && !/\bumr(?:ah|oh)\b.*\b\d+\s*hari\b/i.test(day.title)
        ? day.title
        : '';
      add(`${dayId}A${String(activityIndex + 1).padStart(2, '0')}`, 'itinerary', [
        day.dayNumber,
        distinctiveDayTitle,
        activity.time,
        activity.text,
      ].filter(Boolean).join(' • '));
    }
  }

  // Paket yang datanya sangat tipis tetap memiliki 3–4 fakta grounded. Fallback
  // hanya ditambahkan bila kandidat utama belum cukup, bukan sebagai pilihan
  // default yang menggeser hotel/transportasi/destinasi khas.
  // B04 (rute) sengaja tidak ada: informasi rute sudah terwakili B03 (maskapai
  // + fakta direct-flight) dan sebagai poin sendiri hanya menghasilkan judul
  // kode bandara mentah ("Rute Berangkat: Cgk").
  const priceFacts = Object.entries(packageData.pricing || {}).map(([room, price]) => `${room}: ${price}`);
  const fallbacks = [
    ['B06', packageData.departure.date ? `Tanggal berangkat: ${packageData.departure.date}` : ''],
    ['B09', priceFacts.length ? `Harga paket: ${priceFacts.join(', ')}` : ''],
  ];
  for (const [id, fact] of fallbacks) {
    if (evidence.length >= MAX_PACKAGE_VALUE_ADVANTAGES) break;
    add(id, 'brosur', fact);
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
- Buat ${MIN_PACKAGE_VALUE_ADVANTAGES} sampai ${MAX_PACKAGE_VALUE_ADVANTAGES} poin: utamakan tepat 4; gunakan 3 hanya bila katalog benar-benar tidak memiliki empat evidence unik non-rutin. Jangan pernah mengisi kuota dengan aktivitas rutin; bila perlu gunakan hotel spesifik, transportasi/penerbangan, susunan perjalanan, atau nilai harga yang benar-benar ada sebagai penguat.
- Setiap poin wajib memakai tepat satu evidenceId yang benar-benar ada di katalog evidence pada input. Sistem mengambil teks sumber langsung dari ID tersebut.
- Gunakan evidenceId yang berbeda untuk setiap poin. Jangan mengulang fakta yang sama dengan kata-kata lain.
- SATU ASPEK SATU POIN: maksimal satu poin penerbangan, satu poin kereta, satu poin per hotel/kota, satu poin per destinasi. Dua poin yang intinya sama (misalnya dua kali tentang penerbangan Saudia) dilarang keras.
- IKATAN EVIDENCE MUTLAK: setiap kota, negara, hotel, landmark, moda transportasi, maskapai, nomor, arah perjalanan, dan klaim manfaat pada title/benefit/description wajib tertulis di evidenceId poin ITU SENDIRI. Jangan mengambil satu kata pun dari evidence lain atau dari nama paket.
- Nama paket hanya label metadata untuk banner, BUKAN evidence nilai plus. Contoh fatal yang dilarang: evidence berbunyi "pesawat menuju Istanbul" tetapi title ditulis "Kereta Cepat ke Istanbul" hanya karena nama paket memuat "kereta cepat".
- Moda wajib identik dengan evidence: pesawat tetap pesawat, kereta tetap kereta, cruise tetap cruise. Bila evidence hanya mengatakan "menuju stasiun kereta cepat" tanpa kota tujuan, jangan menambahkan kota tujuan.
- Evidence bersumber dari "brosur" atau "itinerary". DATA BROSUR TERSTRUKTUR mencakup nama paket, tier aktif, jadwal, penerbangan, rute, harga, dan hotel.
- Jangan mencampur hotel atau harga dari tier lain. Gunakan hanya tier yang ada di input.
- Jangan menganggap kota pada rute penerbangan sebagai destinasi wisata. Destinasi/aktivitas wisata hanya boleh disebut jika tertulis pada evidenceId poin tersebut.
- Jangan menyebut "termurah", "terdekat", "terlengkap", "terbaik", "eksklusif", "tanpa transit", "penerbangan langsung", penghematan waktu, atau klaim perbandingan lain tanpa bukti eksplisit.
- Bila evidence penerbangan memuat "Penerbangan langsung tanpa transit", jadikan ITU inti poinnya (contoh title: "Terbang Langsung ke Jeddah") — jauh lebih menjual daripada sekadar nama maskapai. Tanpa fakta itu, poin yang hanya berisi nama maskapai adalah pilihan terakhir.
- Jangan mengarang jarak hotel, durasi perjalanan, kualitas layanan, fasilitas, jumlah umroh, makanan, visa, bagasi, atau aktivitas.
- Seat tersisa bukan nilai plus dan tidak tersedia di input.
- Prioritaskan hal yang paling khas: transportasi khusus, destinasi/aktivitas tambahan, hotel spesifik pada tier aktif, atau susunan perjalanan yang memang terbukti.
- Jika itinerary tersedia dan memiliki aktivitas, transportasi, atau destinasi non-generik yang membedakan, NILAI PLUS 1 wajib memakai evidence dari itinerary. Poin itinerary konkret lebih penting daripada label paket, tanggal, maskapai, atau harga.
- Setiap poin harus lolos uji “jadi apa menariknya bagi jamaah?”: pilih fakta yang memberi pengalaman berbeda dan dapat dijelaskan manfaatnya secara konkret, bukan sekadar item yang tersedia.
- Headline wajib bertumpu langsung pada advantages[0]. Jangan membuat headline dari poin kedua atau ketiga.
- Jangan jadikan aktivitas umum sebagai nilai plus, misalnya Raudhah, ziarah/city tour standar Makkah–Madinah, Jabal Uhud/Rahmah, Masjid Quba/Qiblatain, Tawaf Sunnah/tempat ijabah, ibadah mandiri/rutin, manasik, tiba di bandara, check-in, makan, atau istirahat. Semua itu dilarang sebagai filler meskipun jumlah poin belum terpenuhi.
- Urutkan advantages dari nilai jual yang paling kuat dan spesifik ke yang paling umum.
- Fakta boleh dikemas menjadi pengalaman, tetapi jangan menyimpulkan "nyaman", "lebih cepat", "efisien", "dekat", "mewah", atau kualitas lain bila kata itu tidak tertulis pada evidence poin tersebut.
- "Cocok untuk" boleh berupa preferensi perjalanan yang netral; jangan membuat klaim usia, kesehatan, atau kemampuan fisik.

ATURAN COPYWRITING — KEMASAN, BUKAN SALINAN MENTAH:
- Headline harus berupa hook iklan maksimal 6 kata yang memancing rasa ingin tahu dan membuka argumen mengapa paket ini layak dipilih.
- Jangan memakai nama paket, tier, durasi, harga, atau daftar destinasi sebagai headline. Headline bukan label brosur.
- Summary maksimal 14 kata dan WAJIB menjawab “mengapa pilih paket ini?” dengan pembeda utama serta manfaatnya; bukan rangkuman paket atau slogan generik.
- Title setiap nilai plus maksimal 4 kata dan harus menyebut pembeda konkret, bukan kata sifat seperti “lebih nyaman”, “istimewa”, atau “premium”.
- Benefit setiap nilai plus adalah jawaban “kenapa ini menarik?” maksimal 12 kata. Ubah fakta menjadi manfaat/pengalaman spesifik yang mudah dibayangkan, gunakan kata kerja konkret (melaju, menatap, menginap, menyusuri), dan jangan menambah fakta baru. Contoh: fakta "kereta cepat Haramain" → "Perpindahan Madinah–Makkah menjadi pengalaman khas bersama Haramain".
- Description akan tampil pada artwork: tulis tepat satu kalimat faktual maksimal 12 kata yang menjelaskan bukti keunggulannya. Jangan memakai kalimat manfaat generik.
- Nama spesifik adalah bukti paling meyakinkan: tulis nama hotel, kereta, kota, atau maskapai persis seperti di evidence; satu nama konkret mengalahkan tiga kata sifat.
- Jangan menulis kosakata internal pada title/benefit/description yang akan tampil: kata "tier", nama tier (VIP/HEMAT dll.), kode kamar (Quard/Double/Triple), kode penerbangan (SV 827), atau format mentah evidence. Terjemahkan ke bahasa jamaah, contoh: "Hotel Makkah: FAIRMONT" → "Menginap di Fairmont Makkah".
- Jangan pernah menulis kata "setaraf" atau "setara" pada copy. Bila evidence hotel berbunyi "X ATAU SETARAF", tulis nama hotelnya saja ("Menginap di X Makkah") atau kemas kelas bintangnya bila tercantum ("hotel bintang 4 Makkah") — hedging brosur bukan bahasa iklan.
- visualIdea adalah satu kalimat maksimal 20 kata yang menggambarkan adegan hero untuk membuktikan advantages[0]: sebutkan subjek, aksi, dan sudut pandang saja. Jangan menyebut waktu/cahaya (pagi, senja, malam) ataupun medium (foto, ilustrasi) — keduanya ditentukan arah desain terpisah. Hanya boleh memuat elemen yang ada di evidence.
- Tulis bahasa Indonesia yang hangat, ringkas, dan konkret. Hindari FOMO, CTA, salam, hashtag, serta klaim bombastis.
- Jaga nada khidmat-hangat khas perjalanan ibadah; hindari bahasa gaul seperti "seru". Ejaan konsisten: Makkah, Madinah, Umroh, Jumatain.
- GROUNDING transit: kota yang hanya disinggahi untuk ganti pesawat tidak boleh ditulis sebagai destinasi ("Penerbangan ke Dubai" padahal Dubai transit = menyesatkan).
- Jangan menyalin atau mengarang source/sourceRef sendiri; cukup kembalikan evidenceId paling kuat untuk poin itu.

${itineraryInstruction}

Balas HANYA sebagai JSON valid dengan struktur:
{
  "headline": "hook iklan maksimal 6 kata, bukan nama paket",
  "summary": "maksimal 14 kata, jawaban konkret mengapa paket ini layak dipilih",
  "visualIdea": "adegan hero visual maksimal 20 kata yang membuktikan nilai plus pertama",
  "advantages": [
    {
      "title": "maksimal 4 kata, pembeda konkret",
      "benefit": "maksimal 12 kata, jawaban konkret kenapa pembeda ini menarik",
      "description": "satu kalimat faktual maksimal 12 kata yang layak tampil",
      "evidenceId": "satu ID dari katalog evidence"
    }
  ],
  "bestFor": ["maksimal 2 preferensi audiens"]
}`;

  // Itinerary mentah sengaja tidak dikirim lagi. Seluruh fakta itinerary yang
  // layak sudah dinormalisasi dan disaring ke katalog evidence, sehingga model
  // tidak dapat memilih Raudhah/manasik dari cabang data mentah.
  const groundedContext = {
    package: context.package,
    evidence: context.evidence,
    sourceAvailability: context.sourceAvailability,
  };
  const userPrompt = `Pilih materi nilai plus untuk prompt banner paket berikut. Gunakan hanya ID dari katalog evidence yang telah disaring; jangan gunakan pengetahuan di luar JSON ini:\n${JSON.stringify(groundedContext)}`;
  return { systemPrompt, userPrompt };
}

export function buildPackageValueChatBody({ systemPrompt, userPrompt }, { repair = false } = {}) {
  const repairInstruction = repair
    ? `

PERBAIKAN VALIDASI WAJIB:
- Respons sebelumnya tidak memenuhi kontrak. Susun ulang dari nol.
- Kembalikan TEPAT 4 advantages bila katalog memiliki minimal empat evidence unik non-rutin; gunakan tepat 3 hanya bila memang hanya tiga yang layak.
- Setiap advantage wajib memiliki title, benefit, description, dan evidenceId berbeda yang tercantum persis di katalog.
- Audit setiap poin secara terpisah: semua moda, kota, hotel, landmark, angka, rute, dan klaim pada ketiga field wajib ada pada evidenceId poin itu sendiri. Nama paket dan evidence lain bukan sumber yang sah.
- DILARANG mengubah evidence pesawat menjadi kereta, menghubungkan kereta ke Istanbul tanpa bukti, atau menambahkan kota tujuan yang tidak tertulis pada evidence.
- Jangan menulis nyaman, lebih cepat, efisien, dekat, mewah, menjamin, atau klaim kualitas lain bila tidak tertulis pada evidence poin tersebut.
- Maksimal SATU poin penerbangan dan SATU poin per aspek; jangan menduplikasi aspek yang sama. Jangan menulis kata "setaraf"/"setara" pada copy.
- Keberangkatan, kepulangan, transit, dan perpindahan kota BUKAN nilai plus; jangan menjadikan kota transit sebagai destinasi atau poin.
- Jangan pilih Raudhah, ziarah/city tour standar Makkah–Madinah, Jabal Uhud/Rahmah, Masjid Quba/Qiblatain, Tawaf Sunnah/tempat ijabah, ibadah mandiri/rutin, manasik, atau aktivitas rutin lain.
- Balas hanya JSON valid sesuai struktur, tanpa penjelasan.`
    : '';
  return {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `${userPrompt}${repairInstruction}` },
    ],
    temperature: repair ? 0.2 : 0.4,
    max_tokens: 1800,
    response_format: { type: 'json_object' },
  };
}

/** Parse + batasi output model sebelum dikirim ke browser. */
export function parsePackageValueResult(content, {
  itineraryAvailable = true,
  evidenceCatalog = [],
  packageData = {},
  style = DEFAULT_STYLE,
  allowEvidenceRewrite = false,
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
  const factGroups = buildCatalogFactGroups(evidenceCatalog);

  const mappedAdvantages = (Array.isArray(parsed?.advantages) ? parsed.advantages : [])
    .map((item) => {
      const evidenceId = cleanText(item?.evidenceId, 30);
      const evidence = evidenceById.get(evidenceId) || recoverEvidenceByText(item, evidenceCatalog);
      const source = evidence
        ? evidence.source
        : cleanText(item?.source, 20).toLocaleLowerCase('id-ID');
      let title = cleanText(fixDisplaySpelling(item?.title), 80);
      let benefit = cleanText(fixDisplaySpelling(item?.benefit), 160);
      let description = cleanText(fixDisplaySpelling(item?.description), 420);
      const sourceRef = evidence ? cleanText(evidence.fact, 300) : cleanText(item?.sourceRef, 220);
      const unavailableItinerary = source === 'itinerary' && !itineraryAvailable;
      let complete = Boolean(title && benefit && description && sourceRef && ALLOWED_SOURCES.has(source));
      let bindingText = [title, benefit, description].filter(Boolean).join(' ');
      let bindingIssue = evidence && !unavailableItinerary
        ? findEvidenceBindingIssue(bindingText, sourceRef, factGroups) || copyShapeIssue(title, benefit, description)
        : '';
      let anchoredTitle = evidence && !unavailableItinerary
        ? titleHasEvidenceAnchor(title, sourceRef, factGroups)
        : true;

      if (allowEvidenceRewrite && evidence && !unavailableItinerary && (!complete || bindingIssue || !anchoredTitle)) {
        const fallback = buildEvidenceBoundAdvantage(evidence);
        title = cleanText(fixDisplaySpelling(fallback.title), 80);
        benefit = cleanText(fixDisplaySpelling(fallback.benefit), 160);
        description = cleanText(fixDisplaySpelling(fallback.description), 420);
        complete = Boolean(title && benefit && description && sourceRef && ALLOWED_SOURCES.has(source));
        bindingText = [title, benefit, description].join(' ');
        bindingIssue = findEvidenceBindingIssue(bindingText, sourceRef, factGroups) || copyShapeIssue(title, benefit, description);
        anchoredTitle = titleHasEvidenceAnchor(title, sourceRef, factGroups);
      }
      return {
        title,
        benefit,
        description,
        source,
        sourceRef,
        evidenceId: evidence?.id || '',
        unavailableItinerary,
        bindingValid: complete && !bindingIssue && anchoredTitle,
      };
    });

  // Fail closed: satu poin yang memalsukan relasi evidence dapat mencemari
  // headline, summary, dan visualIdea. Tolak seluruh respons agar server meminta
  // perbaikan dari nol; jangan diam-diam menyisakan tiga poin lain.
  if (enforceEvidenceIds && mappedAdvantages.some((item) => (
    !item.evidenceId || (!item.unavailableItinerary && !item.bindingValid)
  ))) return null;

  const advantages = mappedAdvantages
    .filter((item) => !enforceEvidenceIds || item.evidenceId)
    .filter((item) => !item.unavailableItinerary)
    .filter((item) => item.bindingValid)
    .map(({ unavailableItinerary: _unavailable, bindingValid: _valid, ...item }) => item);

  if (advantages.length === 0) return null;

  const uniqueEvidenceIds = new Set();
  const uniqueAdvantages = advantages.filter((item) => {
    if (!item.evidenceId) return true;
    if (uniqueEvidenceIds.has(item.evidenceId)) return false;
    uniqueEvidenceIds.add(item.evidenceId);
    return true;
  });
  const rankedAdvantages = dedupeAdvantageAspects(rankAdvantagesForCreative(
    uniqueAdvantages,
    cleanText(parsed?.headline, 140),
  )).slice(0, MAX_PACKAGE_VALUE_ADVANTAGES);

  if (rankedAdvantages.length < MIN_PACKAGE_VALUE_ADVANTAGES) return null;

  let headline = cleanText(fixDisplaySpelling(parsed?.headline), 140) || 'Nilai Plus Paket';
  let summary = cleanText(fixDisplaySpelling(parsed?.summary), 600);
  let visualIdea = cleanText(fixDisplaySpelling(parsed?.visualIdea), 220);
  if (enforceEvidenceIds) {
    const primaryFact = rankedAdvantages[0].sourceRef;
    const acceptedFacts = rankedAdvantages.map((item) => item.sourceRef).join(' • ');
    let headlineIssue = findEvidenceBindingIssue(headline, primaryFact, factGroups);
    let summaryIssue = summary ? findEvidenceBindingIssue(summary, acceptedFacts, factGroups) : '';
    let visualIssue = visualIdea ? findEvidenceBindingIssue(visualIdea, primaryFact, factGroups) : '';
    if (allowEvidenceRewrite) {
      if (headlineIssue) {
        headline = /\b(?:harga|tanggal|rute)\b/i.test(rankedAdvantages[0].title)
          ? 'Alasan Paket Ini Layak Dipilih'
          : `${rankedAdvantages[0].title}, Pembeda Perjalanan`;
      }
      if (summaryIssue) summary = rankedAdvantages[0].benefit;
      if (visualIssue) {
        visualIdea = /\b(?:harga|tanggal|rute)\b/i.test(rankedAdvantages[0].title)
          ? ''
          : `Jamaah ${rankedAdvantages[0].benefit.charAt(0).toLocaleLowerCase('id-ID')}${rankedAdvantages[0].benefit.slice(1)}.`;
      }
      headlineIssue = findEvidenceBindingIssue(headline, primaryFact, factGroups);
      summaryIssue = summary ? findEvidenceBindingIssue(summary, acceptedFacts, factGroups) : '';
      visualIssue = visualIdea ? findEvidenceBindingIssue(visualIdea, primaryFact, factGroups) : '';
    }
    if (headlineIssue || summaryIssue || visualIssue) {
      // Jalur rewrite tidak boleh gagal total hanya karena headline/summary:
      // advantages sudah evidence-bound; jatuhkan copy pembuka ke bentuk aman.
      if (!allowEvidenceRewrite) return null;
      if (headlineIssue) headline = 'Alasan Paket Ini Layak Dipilih';
      if (summaryIssue) summary = '';
      if (visualIssue) visualIdea = '';
    }
  }

  const activeStyle = resolvePackageValueStyle(style);
  const result = {
    headline,
    summary,
    visualIdea,
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

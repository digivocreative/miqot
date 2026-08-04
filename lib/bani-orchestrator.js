// Bani — orchestrator function calling untuk asisten AI in-app agent.
//
// Alur: pertanyaan agent → model memilih tool dari BANI_TOOLS (lib/bani-tools.js,
// registry yang sama dengan MCP) → SERVER yang mengeksekusi tool memakai `agent`
// hasil JWT (model TIDAK PERNAH menentukan agent mana yang dibaca) → model
// merangkum → jawaban akhir JSON berisi teks + REFERENSI id.
//
// Anti-halusinasi: model hanya boleh MEMILIH id, tidak pernah menulis isi kartu.
// hydrateBaniCards mengisi kartu dari row hasil tool request ini; id yang tidak
// pernah muncul di hasil tool dibuang diam-diam.
//
// READ-ONLY: modul ini tidak boleh menulis ke database sama sekali — dijaga
// source grep di tests/bani-orchestrator.test.js.
//
// `callOpenAI` sengaja di-inject (bukan fetch langsung) supaya seluruh loop
// bisa diuji tanpa jaringan; implementasi HTTP-nya tinggal di server.js.
import { BANI_TOOLS, BANI_TOOL_BY_NAME } from './bani-tools.js';

// Maks putaran model yang boleh meminta tool. Pertanyaan agent yang wajar
// selesai dalam 1–2 putaran; 3 adalah rem, bukan target.
export const BANI_MAX_ROUNDS = 3;
// Plafon eksekusi tool per request — melindungi DB (IO-sensitif) dari model
// yang menembak tool bertubi-tubi.
export const BANI_MAX_TOOL_CALLS = 6;
// Hemat token: tool daftar dipangkas 20 baris walau MAX_LIMIT registry 50.
export const BANI_TOOL_ROW_LIMIT = 20;
// Kartu dirender sebagai TABEL compact (satu baris ±34px), bukan lagi kartu
// bertumpuk ±86px — 8 baris masih muat sekali layar. Angkanya sengaja sama
// dengan BANI_TELEGRAM_MAX_CARDS supaya yang terkirim ke Telegram persis yang
// terlihat di layar.
export const BANI_MAX_CARDS_PER_TYPE = 8;

// Kolom tabel dipilih per pertanyaan, bukan template tetap: pertanyaan soal
// keberangkatan tidak ada urusannya dengan kolom "Sisa", dan menampilkannya
// membuat jawaban terasa digilas cetakan yang sama terus.
//
// Yang memilih model (dialah yang tahu maksud pertanyaan), tapi HANYA boleh
// menunjuk dari daftar tertutup ini — persis pola package_ids/jamaah_ids: model
// menunjuk, server yang menentukan isinya. Nilai di luar daftar dibuang.
export const BANI_JAMAAH_COLUMNS = ['berangkat', 'sisa', 'bayar', 'paket', 'kode', 'ultah', 'umur'];
export const BANI_PACKAGE_COLUMNS = ['berangkat', 'harga', 'seat', 'maskapai', 'durasi'];
// Dua kolom data adalah batas yang muat bersama nama di layar ponsel (±343px
// area isi: 2 × 74px kolom + 36px aksi menyisakan ±159px untuk nama).
export const BANI_MAX_COLUMNS = 2;
// Dipakai saat model tidak memilih atau pilihannya tidak sah. Sengaja BUKAN
// "sisa": tanggal berangkat bermakna untuk hampir semua pertanyaan, sedangkan
// kolom uang cuma relevan kalau memang ditanya.
const BANI_JAMAAH_COLUMNS_DEFAULT = ['berangkat'];
const BANI_PACKAGE_COLUMNS_DEFAULT = ['berangkat', 'harga'];

// Riwayat percakapan datang DARI KLIEN, bukan disimpan server — modul ini tetap
// stateless dan bisa diuji tanpa penyimpanan. Konsekuensinya riwayat itu tidak
// tepercaya, jadi: hanya pasangan {question, answer} (klien tidak bisa menyisipkan
// peran "system"), dipotong jumlah maupun panjangnya, dan TIDAK PERNAH jadi
// sumber kartu — kartu tetap hanya dari hasil tool putaran ini.
//
// Batas 4 giliran menahan biaya token: tiap jawaban ±70 kata, jadi riwayat penuh
// masih jauh di bawah anggaran prompt.
export const BANI_MAX_HISTORY_TURNS = 4;
const BANI_HISTORY_QUESTION_MAX_LEN = 500;
const BANI_HISTORY_ANSWER_MAX_LEN = 1200;

// Rujukan "paket ini/itu" butuh jangkar: teks jawaban lama sering tidak memuat
// jadwal_id, jadi klien ikut mengirim daftar kartu yang TAMPIL di giliran itu.
// Disaring ketat — id dibersihkan ke [A-Za-z0-9_-], nama dibuang karakter
// perusak format catatan ([ ] " dan baris baru) — lalu ditempel sebagai baris
// "[Kartu di layar: ...]" di pesan assistant.
//
// Kartu KALKULASI ikut jadi jangkar, lengkap dengan parameter hitungannya:
// tanpa itu, giliran kalkulasi (yang sengaja tidak menerbitkan kartu paket)
// meninggalkan riwayat teks polos, dan lanjutan seperti "kasih diskon 1 juta
// per orang" membuat model bertanya ulang paket & jumlahnya.
const BANI_HISTORY_SHOWN_MAX = 6;

const BANI_KALKULASI_INPUT_KEYS = [
  'kamar_quad', 'kamar_triple', 'kamar_double', 'kamar_single',
  'anak_tanpa_kasur', 'infant', 'diskon_per_pax', 'diskon_flat',
];

function sanitizeKalkulasiInput(raw) {
  const input = {};
  const source = raw && typeof raw === 'object' ? raw : {};
  for (const key of BANI_KALKULASI_INPUT_KEYS) {
    const v = Number(source[key]);
    if (Number.isFinite(v) && v > 0 && v <= 10_000_000_000) input[key] = v;
  }
  return input;
}

function sanitizeShownRef(item) {
  if (!item || typeof item !== 'object') return null;
  const type = item.type === 'package' || item.type === 'jamaah' || item.type === 'kalkulasi' ? item.type : null;
  const id = typeof item.id === 'string' ? item.id.replace(/[^\w-]/g, '').slice(0, 30) : '';
  if (!type || !id) return null;
  const cleanText = (value, max) => (typeof value === 'string'
    ? value.replace(/[\[\]"\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
    : '');
  const ref = { type, id, nama: cleanText(item.nama, 80) };
  if (type === 'kalkulasi') {
    ref.tier = cleanText(item.tier, 20);
    ref.input = sanitizeKalkulasiInput(item.input);
    const total = Number(item.total);
    ref.total = Number.isFinite(total) && total >= 0 && total <= 100_000_000_000 ? total : null;
  }
  return ref;
}

export function sanitizeBaniHistory(raw) {
  const turns = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item || typeof item !== 'object') continue;
    const question = typeof item.question === 'string' ? item.question.trim() : '';
    const answer = typeof item.answer === 'string' ? item.answer.trim() : '';
    if (!question || !answer) continue;
    turns.push({
      question: question.slice(0, BANI_HISTORY_QUESTION_MAX_LEN),
      answer: answer.slice(0, BANI_HISTORY_ANSWER_MAX_LEN),
      shown: (Array.isArray(item.shown) ? item.shown : [])
        .map(sanitizeShownRef)
        .filter(Boolean)
        .slice(0, BANI_HISTORY_SHOWN_MAX),
    });
  }
  // Yang dipertahankan giliran TERAKHIR: konteks terdekatlah yang dirujuk kata
  // ganti seperti "itu" atau "mereka".
  return turns.slice(-BANI_MAX_HISTORY_TURNS);
}

function formatShownNote(shown) {
  const parts = shown.map((s) => {
    if (s.type === 'kalkulasi') {
      // Parameter dibuka lengkap supaya lanjutan "kasih diskon"/"tambah anak"
      // tinggal memanggil kalkulasi_harga lagi dengan argumen yang sama.
      const params = Object.entries(s.input || {}).map(([k, v]) => `${k}=${v}`);
      if (s.tier) params.unshift(`tier ${s.tier}`);
      if (s.total !== null && s.total !== undefined) params.push(`total=${s.total}`);
      return `kalkulasi ${s.id}${s.nama ? ` "${s.nama}"` : ''}${params.length ? ` (${params.join(', ')})` : ''}`;
    }
    return `${s.type === 'package' ? 'paket' : 'jamaah'} ${s.id}${s.nama ? ` "${s.nama}"` : ''}`;
  });
  return `[Kartu di layar: ${parts.join(', ')}]`;
}

// Pertanyaan lanjutan menggantikan tombol "Tanya yang lain": setelah membaca
// jawaban, yang berguna bukan mengosongkan layar melainkan tahu apa lagi yang
// bisa ditanyakan. Model yang menyusunnya (dialah yang tahu isi jawabannya),
// tapi hasilnya dibersihkan di sini — teks apa pun dari model tidak tepercaya.
export const BANI_MAX_FOLLOW_UPS = 3;
const BANI_FOLLOW_UP_MAX_LEN = 90;

export function pickBaniFollowUps(requested, question) {
  const asked = String(question || '').trim().toLowerCase();
  const picked = [];
  for (const raw of Array.isArray(requested) ? requested : []) {
    // Wajib string: String(42) dan String({}) menghasilkan "42" / "[object
    // Object]" yang lolos semua pemeriksaan lain lalu tampil sebagai chip.
    if (typeof raw !== 'string') continue;
    const text = raw.replace(/\s+/g, ' ').trim();
    if (!text || text.length > BANI_FOLLOW_UP_MAX_LEN) continue;
    const key = text.toLowerCase();
    if (key === asked || picked.some((t) => t.toLowerCase() === key)) continue;
    picked.push(text);
    if (picked.length >= BANI_MAX_FOLLOW_UPS) break;
  }
  return picked;
}

export function pickBaniColumns(requested, allowed, fallback) {
  const picked = [];
  for (const raw of Array.isArray(requested) ? requested : []) {
    const key = String(raw ?? '').trim().toLowerCase();
    if (!allowed.includes(key) || picked.includes(key)) continue;
    picked.push(key);
    if (picked.length >= BANI_MAX_COLUMNS) break;
  }
  return picked.length ? picked : [...fallback];
}

// Field sumber tiap kolom — dipakai menilai apakah sebuah kolom masih membawa
// informasi untuk kumpulan baris ini.
const BANI_COLUMN_FIELD = {
  berangkat: (card) => card?.berangkat_tgl ?? card?.tgl_berangkat ?? null,
  harga: (card) => card?.harga_mulai ?? null,
  seat: (card) => (card?.sold_out ? 'SOLD_OUT' : card?.seat_sisa ?? null),
  maskapai: (card) => card?.maskapai ?? null,
  durasi: (card) => card?.durasi_hari ?? null,
  sisa: (card) => card?.sisa ?? null,
  bayar: (card) => card?.bayar ?? null,
  paket: (card) => card?.paket_nama ?? card?.paket ?? null,
  kode: (card) => card?.id_umroh ?? null,
  // Keduanya bersumber dari tgl_lahir; "ultah" menampilkan tanggal-bulannya,
  // "umur" menghitung tahunnya. Cukup satu pembaca untuk uji keseragaman.
  ultah: (card) => card?.tgl_lahir ?? null,
  umur: (card) => card?.tgl_lahir ?? null,
};

// Kolom yang KOSONG di semua baris hanya menyisakan deretan "—" dan memakan
// ruang nama. Ini melengkapi dropUniformBaniColumns: kolom kosong memang juga
// "seragam", tapi uji keseragaman sengaja tidak berlaku untuk daftar satu baris
// — sedangkan kolom kosong tidak berguna berapa pun jumlah barisnya.
//
// Jaring pengaman untuk kolom yang bergantung field opsional: "ultah"/"umur"
// butuh tgl_lahir yang hanya ikut di hasil jamaah_birthdays, tidak di list_jamaah.
export function dropEmptyBaniColumns(columns, cards) {
  const rows = Array.isArray(cards) ? cards : [];
  if (!rows.length) return columns;
  return columns.filter((key) => {
    const read = BANI_COLUMN_FIELD[key];
    if (!read) return true;
    return rows.some((row) => {
      const value = read(row);
      return value !== null && value !== undefined && value !== '';
    });
  });
}

// Kolom yang nilainya SAMA di semua baris tidak menjelaskan apa-apa: pertanyaan
// "siapa yang berangkat 5 Agustus" menghasilkan kolom Berangkat berisi tanggal
// yang identik sebanyak jumlah baris, padahal tanggal itu sudah ada di
// pertanyaan dan jawabannya. Dibuang supaya ruangnya kembali ke nama.
//
// Hanya berlaku untuk 2 baris ke atas — satu baris selalu "seragam" secara
// sepele, dan di sana kolomnya justru satu-satunya rincian yang ada.
export function dropUniformBaniColumns(columns, cards) {
  const rows = Array.isArray(cards) ? cards : [];
  if (rows.length < 2) return columns;
  return columns.filter((key) => {
    const read = BANI_COLUMN_FIELD[key];
    if (!read) return true;
    const first = JSON.stringify(read(rows[0]) ?? null);
    return !rows.every((row) => JSON.stringify(read(row) ?? null) === first);
  });
}

export function resolveBaniColumns(parsed, cards) {
  const all = Array.isArray(cards) ? cards : [];
  const bersihkan = (columns, rows) => dropUniformBaniColumns(dropEmptyBaniColumns(columns, rows), rows);
  return {
    paket: bersihkan(
      pickBaniColumns(parsed?.package_columns, BANI_PACKAGE_COLUMNS, BANI_PACKAGE_COLUMNS_DEFAULT),
      all.filter((c) => c?.type === 'package'),
    ),
    jamaah: bersihkan(
      pickBaniColumns(parsed?.jamaah_columns, BANI_JAMAAH_COLUMNS, BANI_JAMAAH_COLUMNS_DEFAULT),
      all.filter((c) => c?.type === 'jamaah'),
    ),
  };
}
// URL brosur/itinerary ikut jadi isi kartu, jadi ia berakhir sebagai href di
// klien. Sumbernya kolom DB kita sendiri, tapi tetap disaring di sini: hanya
// https yang lolos. Fail-closed — apa pun yang lain jadi null, dan tombolnya
// sekadar tidak muncul.
function safeHttpsUrl(value) {
  const raw = String(value || '').trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(raw) ? raw : null;
}

const BANI_FALLBACK_ANSWER = 'Maaf, jawabannya belum bisa dirangkum. Coba tanya ulang dengan lebih spesifik.';

// Tanggal hari ini dalam zona WIB — model TIDAK punya jam, dan tanpa ini
// pertanyaan relatif ("akhir tahun ini", "Desember nanti") diterjemahkan
// memakai tebakan tahun dari data latihnya, yang bisa meleset dan menghasilkan
// filter bulan kosong.
function todayWib(now) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date(now()));
}

export function buildBaniSystemPrompt(agent, { now = Date.now } = {}) {
  const nama = String(agent?.name || agent?.slug || 'agent ini').trim();
  return `Kamu Bani, asisten agent di Alhijaz.co — dashboard kerja agent umroh & haji.
Kamu sedang membantu ${nama}. Semua tool sudah otomatis terbatas pada data milik agent ini.
Hari ini ${todayWib(now)} (WIB). Pakai tanggal ini untuk menerjemahkan kata waktu relatif seperti "bulan ini", "akhir tahun", atau "tahun depan".

SUMBER JAWABAN
- Jawab HANYA dari hasil tool. Panggil tool yang relevan lebih dulu; jangan menebak.
- Dilarang mengarang angka, nama, tanggal, harga, atau ID. Kalau hasil tool kosong atau berisi error, bilang apa adanya bahwa datanya tidak ada, lalu sebut satu langkah lanjutan yang masuk akal.
- Jangan menampilkan nomor paspor atau data pribadi yang tidak ditanyakan.
- Percakapan ini bertahap: pertanyaan lanjutan sering memakai kata ganti ("paket itu", "mereka", "yang tadi") yang merujuk giliran sebelumnya. Pahami rujukannya dari riwayat, TAPI angka, nama, dan tanggal tetap wajib diambil ulang lewat tool putaran ini — jangan menyalin dari jawaban lama, karena datanya bisa sudah berubah dan kartu hanya terbit dari hasil tool putaran ini.
- Giliran lama di riwayat bisa diakhiri baris "[Kartu di layar: ...]" berisi id yang waktu itu tampil. "Paket ini/itu" hampir selalu menunjuk id tersebut — ambil ulang datanya lewat get_jadwal_paket dengan id itu. DILARANG mengganti dengan paket lain yang kebetulan muncul di daftar.
- Jangkar berbentuk "kalkulasi ID (tier ..., kamar_quad=2, ...)" = hitungan yang sedang tampil di layar. Lanjutan yang MENGUBAH hitungan itu ("kasih diskon sekian", "tambah 1 anak", "ganti kamar double", "kalau 3 orang?") WAJIB langsung memanggil kalkulasi_harga lagi memakai jadwal_id + parameter dari jangkar, diubah seperlunya sesuai permintaan — JANGAN bertanya ulang paket atau jumlahnya, jawabannya sudah ada di jangkar.

ISTILAH — pakai kosakata yang dipakai agent Alhijaz, dan pahami versi mereka
- Rombongan keberangkatan disebut "Kloter", BUKAN "grup"/"group"/"rombongan". Tulis "Kloter 21", bukan "grup 21".
- Kata "mutawif" ditulis agent dengan macam-macam ejaan: "muthowif", "mutowif", "muthawwif", "mutawwif", "ustad", "ustadz", "ustadzah", "pembimbing", "pembimbing ibadah". SEMUANYA merujuk orang yang sama, yaitu field "mutawif" di hasil calendar_events. Pahami ejaan mana pun yang dipakai agent, dan tulis balasanmu dengan ejaan "mutawif".
- "TL" = Tour Leader, field "tour_leader". Agent juga menyebutnya "ketua rombongan" atau "leader".
- Jangan mengoreksi ejaan agent dan jangan mengomentarinya — cukup jawab.

GAYA — tulis seperti rekan kerja yang tahu datanya, bukan seperti mesin yang melapor
- Bahasa Indonesia sehari-hari, sapa pembacanya dengan "Anda". Langsung ke jawabannya; jangan membuka dengan mengulang pertanyaan.
- Tulis seperti orang berbicara, bukan seperti dokumen resmi. Hindari kata bergaya administratif: "berstatus", "terdapat", "dilakukan", "sejumlah", "adapun", "tersebut", "guna", "dalam rangka".
  KAKU: "Semua berstatus lunas." / "Terdapat 14 jamaah." / "Pembayaran telah dilakukan seluruhnya."
  LUWES: "Semuanya sudah lunas." / "Ada 14 jamaah." / "Semuanya sudah bayar penuh."
- Pendek: 1–3 kalimat, maksimal sekitar 70 kata. Pertanyaan berupa angka cukup dijawab satu kalimat.
- Begitu kamu mengisi jamaah_ids atau package_ids, isi tabelnya JANGAN diceritakan ulang di answer — bukan namanya, bukan juga angka per barisnya (seat, harga, tanggal masing-masing). Semua itu sudah tampil sebagai kolom tepat di bawah jawabanmu; mengulangnya membuat jawaban jadi paragraf padat angka yang sulit dibaca. Sebut bentuk besarnya saja: ada berapa, rentangnya, atau satu hal yang paling layak disorot.
  BURUK: "Yang terdekat berangkat 22 Agustus: 7 seat tersisa mulai Rp36,9 juta, dan 2 seat tersisa mulai Rp31,9 juta. Berikutnya 29 Agustus masih ada 38 seat mulai Rp31,9 juta."
  BAIK: "Ada 3 paket yang masih terbuka, paling cepat berangkat 22 Agustus. Harganya mulai Rp31,9 juta."
- Kalau tabel ikut terbit, 1–2 kalimat sudah cukup. Kalau yang tampil cuma sebagian dari hasil, tutup dengan "dan N lainnya".
- Satu-dua nama boleh disebut di dalam kalimat kalau memang itu inti jawabannya ("yang paling dekat berangkat Ahmad Fauzi"). Selebihnya biarkan tabel yang bicara.
- Daftar "- " hanya untuk hal yang TIDAK punya kartu, misalnya rincian per bulan atau per kategori. Maksimal 5 baris.
- Sebutkan yang berisi saja: kategori atau periode bernilai nol tidak perlu ditulis.
- Nominal besar boleh diringkas ke satu angka di belakang koma ("Rp31,9 juta", "Rp2,8 miliar") — bukan "Rp2,804 miliar" — dan konsisten dalam satu jawaban.
- Tanpa sapaan waktu (jangan "selamat pagi/siang/malam") dan tanpa kata ber-gender (jangan "Bapak", "Ibu", "beliau").
- JANGAN menyebut cara Anda memperoleh data: tanpa kata "tool", "sistem", "database", "sinkronisasi", "snapshot", "real-time", atau catatan seberapa baru datanya. Sebut angkanya saja seolah memang Anda hafal.
- Jangan menutup dengan basa-basi atau tawaran bantuan ("saya bisa bantu…", "silakan beri tahu…"). Berhenti begitu informasinya lengkap.
- Kalau agent minta BROSUR atau ITINERARY: panggil tool paketnya lalu isi field media — pratinjau brosur / tombol Lihat Itinerary tampil otomatis besar di bawah jawabanmu. Cukup satu kalimat ("Ini brosurnya."), dan kosongkan package_ids kecuali daftar/perbandingan paketnya memang ditanya juga. JANGAN menjawab "brosurnya tersedia" tanpa mengisi media, dan jangan menuliskan URL-nya.
- Kalau agent minta HITUNGAN BIAYA ("berapa untuk 2 orang kamar double", "hitung sekeluarga 4 pax"): panggil kalkulasi_harga — JANGAN menghitung sendiri dari harga paket. Hasilnya otomatis tampil sebagai kartu rincian + total dengan tombol salin teks WA dan PDF, jadi answer cukup 1–2 kalimat; total akhirnya boleh disebut, rincian per barisnya jangan diulang. Kosongkan package_ids kecuali daftar paketnya memang ditanya juga. Kalau jumlah orang/kamarnya tidak ada di pertanyaan MAUPUN di jangkar kalkulasi riwayat, baru tanyakan dalam satu kalimat singkat.
- Markdown terbatas: **tebal** hanya untuk angka/nama/tanggal kunci — secukupnya, bukan tiap kata — lalu baris baru dan daftar "- ". Dilarang heading, tabel, blok kode, dan tautan (link tidak bisa dirender, jadi jangan tulis URL).

FORMAT BALASAN
Selain pemanggilan tool, satu-satunya balasan yang valid adalah JSON polos tanpa pembungkus apa pun:
{"answer": "...", "package_ids": [], "package_columns": [], "jamaah_ids": [], "jamaah_columns": [], "media": [], "follow_ups": []}
- answer: teks jawaban untuk agent, mengikuti aturan GAYA di atas.
- package_ids: jadwal_id dari hasil list_jadwal_paket/get_jadwal_paket yang layak ditampilkan sebagai baris tabel. Maksimal 8, kosongkan bila tidak relevan.
- jamaah_ids: jm_id dari hasil list_jamaah/get_jamaah. Maksimal 8.
- jamaah_columns: kolom tabel jamaah, MAKSIMAL 2, pilih yang menjawab pertanyaannya. Yang sah: "berangkat", "sisa", "bayar", "paket", "kode", "ultah", "umur". Ditanya keberangkatan → ["berangkat"]; ditanya pelunasan/tunggakan → ["sisa"]; ditanya setoran → ["bayar"]; ditanya ULANG TAHUN → ["ultah", "umur"] (tanggal ultah + umurnya, JANGAN "berangkat" — tanggal berangkat tidak ada hubungannya dengan ucapan ulang tahun). JANGAN memasang "sisa" kalau yang ditanya bukan soal uang.
- package_columns: kolom tabel paket, MAKSIMAL 2. Yang sah: "berangkat", "harga", "seat", "maskapai", "durasi". Ditanya jadwal → ["berangkat"]; ditanya harga → ["harga"]; ditanya sisa kursi → ["seat"].
Kolom yang tidak dipilih tidak hilang — nama, tanggal, dan kode tetap tampil di baris keterangan bawah nama. Pilih kolom untuk MENYOROTI, bukan untuk melengkapi.
- media: HANYA saat agent minta brosur/itinerary — [{"type": "brosur", "jadwal_id": "..."}] atau {"type": "itinerary", ...}. Maksimal 4; jadwal_id wajib dari hasil tool putaran ini.
- follow_ups: paling banyak 3 pertanyaan lanjutan yang masuk akal ditanyakan SETELAH membaca jawaban ini, ditulis seolah agent yang mengetik ("Siapa yang belum lunas di paket itu?"). Harus bisa dijawab tool yang ada, nyangkut ke data yang barusan muncul, dan pendek — maksimal 8 kata. Jangan mengulang pertanyaan yang barusan dijawab, dan jangan menawarkan bantuan di dalam answer. Kalau tidak ada yang benar-benar nyangkut, kirim [] — daftar kosong jauh lebih baik daripada pertanyaan yang dikarang supaya kolomnya terisi.
Cantumkan hanya ID yang benar-benar muncul di hasil tool. Kartu dirender terpisah, jadi jangan menyalin seluruh detailnya ke dalam answer.`;
}

// Spesifikasi tool untuk OpenAI dibangun dari registry bersama — deskripsi dan
// JSON Schema-nya sama persis dengan yang dilihat klien MCP.
export function buildBaniToolSpecs() {
  return BANI_TOOLS.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

// Ekstraksi JSON toleran: model kadang membungkus jawabannya dengan ```json
// fence atau menambah kalimat pengantar. Kembalikan null bila tidak ada objek
// dengan `answer` string — pemanggil yang memutuskan retry/degradasi.
export function extractBaniJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let parsed;
  try {
    parsed = JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (typeof parsed.answer !== 'string' || !parsed.answer.trim()) return null;
  return parsed;
}

// Indeks row hasil tool request INI — satu-satunya sumber isi kartu.
function indexToolRows(toolResults) {
  const packages = new Map();
  const jamaah = new Map();
  const addPackage = (row) => { if (row?.jadwal_id) packages.set(String(row.jadwal_id).toUpperCase(), row); };
  const addJamaah = (row) => { if (row?.jm_id) jamaah.set(String(row.jm_id).toUpperCase(), row); };

  for (const result of toolResults || []) {
    if (!result?.ok) continue;
    const data = result.data;
    if (!data || typeof data !== 'object') continue;
    // list_jamaah / list_jadwal_paket / jamaah_birthdays → data.rows
    if (Array.isArray(data.rows)) {
      for (const row of data.rows) { addPackage(row); addJamaah(row); }
    }
    addPackage(data.paket);       // get_jadwal_paket
    addJamaah(data.jamaah);       // get_jamaah
    if (Array.isArray(data.booking_members)) for (const row of data.booking_members) addJamaah(row);
  }
  return { packages, jamaah };
}

// Media yang diminta eksplisit ("minta brosur", "tampilkan itinerary") tidak
// cukup dijawab tombol kecil di baris tabel — pratinjaunya harus tampil.
// Model menunjuk {type, jadwal_id}; server memvalidasi ke hasil tool putaran
// ini dan HANYA meloloskan URL https (safeHttpsUrl). Pola yang sama dengan
// package_ids: model memilih, server menentukan isinya.
export const BANI_MEDIA_TYPES = ['brosur', 'itinerary'];
export const BANI_MAX_MEDIA = 4;

export function hydrateBaniMedia(toolResults, parsed) {
  const { packages } = indexToolRows(toolResults);
  const media = [];
  const seen = new Set();
  for (const item of Array.isArray(parsed?.media) ? parsed.media : []) {
    if (media.length >= BANI_MAX_MEDIA) break;
    if (!item || typeof item !== 'object') continue;
    const type = BANI_MEDIA_TYPES.includes(item.type) ? item.type : null;
    const key = String(item.jadwal_id ?? '').trim().toUpperCase();
    if (!type || !key || seen.has(`${type}:${key}`)) continue;
    const row = packages.get(key);
    if (!row) continue; // id yang tak pernah muncul di hasil tool → dibuang
    const url = safeHttpsUrl(type === 'brosur' ? row.brosur : row.itinerary);
    if (!url) continue;
    seen.add(`${type}:${key}`);
    media.push({ type, jadwal_id: row.jadwal_id ?? key, nama: row.nama ?? row.jadwal_nama ?? null, url });
  }
  return media;
}

// Kartu kalkulasi terbit OTOMATIS dari pemanggilan kalkulasi_harga yang sukses —
// tidak ada field JSON-nya. Angkanya dihitung server (computeKalkulasi, formula
// yang sama dengan halaman Kalkulasi) sehingga tidak pernah lewat tangan model;
// klien merendernya sebagai kartu rincian dengan tombol Salin WA & PDF. Hanya
// dua hasil TERAKHIR yang dipertahankan: pemanggilan terbaru-lah yang paling
// mungkin dirujuk jawaban final (model bisa memanggil beberapa kali saat
// membandingkan tier/paket).
export const BANI_MAX_KALKULASI = 2;

export function hydrateBaniKalkulasi(toolResults) {
  const out = [];
  const seen = new Set();
  for (const result of toolResults || []) {
    if (!result?.ok || result.name !== 'kalkulasi_harga') continue;
    const data = result.data;
    if (!data || typeof data !== 'object' || data.error) continue;

    // FAIL-CLOSED per hasil: satu item cacat membatalkan seluruh kartunya.
    // Kartu berisi angka uang — separuh rincian lebih menyesatkan daripada
    // tidak ada kartu (jawaban teks model tetap tampil).
    const items = [];
    let valid = true;
    for (const item of Array.isArray(data.items) ? data.items : []) {
      const label = typeof item?.label === 'string' ? item.label.trim() : '';
      const qty = Number(item?.qty);
      const hargaSatuan = Number(item?.harga_satuan);
      const total = Number(item?.total);
      if (!label || !Number.isInteger(qty) || qty <= 0
        || !Number.isFinite(hargaSatuan) || hargaSatuan < 0
        || !Number.isFinite(total) || total < 0) {
        valid = false;
        break;
      }
      items.push({
        label: label.slice(0, 60),
        qty,
        harga_satuan: hargaSatuan,
        total,
        catatan: typeof item.catatan === 'string' && item.catatan ? item.catatan.slice(0, 120) : null,
      });
    }

    const subtotal = Number(data.subtotal);
    const diskon = Number(data.diskon);
    const grandTotal = Number(data.grand_total);
    if (!valid || !items.length
      || !Number.isFinite(subtotal) || subtotal < 0
      || !Number.isFinite(diskon) || diskon < 0
      || !Number.isFinite(grandTotal) || grandTotal < 0) continue;

    const jadwalId = typeof data.jadwal_id === 'string' && data.jadwal_id.trim() ? data.jadwal_id.trim() : null;
    const tier = typeof data.tier_dipakai === 'string' ? data.tier_dipakai : '';
    const key = `${jadwalId}:${tier}:${grandTotal}:${items.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      jadwal_id: jadwalId,
      nama: typeof data.paket === 'string' && data.paket ? data.paket : null,
      tier,
      // Gema argumen tool (tersaring whitelist): klien menyimpannya lalu
      // mengirim balik sebagai jangkar riwayat, supaya pertanyaan lanjutan
      // yang mengubah hitungan tak perlu menebak ulang komposisinya.
      input: sanitizeKalkulasiInput(result.args),
      items,
      subtotal,
      diskon,
      grand_total: grandTotal,
      total_pax: Number.isFinite(Number(data.total_pax)) ? Number(data.total_pax) : null,
    });
  }
  return out.slice(-BANI_MAX_KALKULASI);
}

export function hydrateBaniCards(toolResults, parsed) {
  const { packages, jamaah } = indexToolRows(toolResults);
  const cards = [];

  const collect = (ids, index, build) => {
    const seen = new Set();
    for (const id of Array.isArray(ids) ? ids : []) {
      if (seen.size >= BANI_MAX_CARDS_PER_TYPE) break;
      const key = String(id ?? '').trim().toUpperCase();
      if (!key || seen.has(key)) continue;
      const row = index.get(key);
      if (!row) continue; // id yang tidak ada di hasil tool → dibuang diam-diam
      seen.add(key);
      cards.push(build(row));
    }
  };

  collect(parsed?.package_ids, packages, (row) => ({
    type: 'package',
    jadwal_id: row.jadwal_id ?? null,
    nama: row.nama ?? row.jadwal_nama ?? null,
    berangkat_tgl: row.berangkat_tgl ?? null,
    pulang_tgl: row.pulang_tgl ?? null,
    durasi_hari: row.durasi_hari ?? null,
    maskapai: row.maskapai ?? null,
    seat_sisa: row.seat_sisa ?? null,
    sold_out: row.sold_out ?? null,
    harga_mulai: row.harga_mulai ?? null,
    brosur_url: safeHttpsUrl(row.brosur),
    itinerary_url: safeHttpsUrl(row.itinerary),
  }));

  collect(parsed?.jamaah_ids, jamaah, (row) => ({
    type: 'jamaah',
    jm_id: row.jm_id ?? null,
    nama: row.nama ?? null,
    jk: row.jk ?? null,
    id_umroh: row.id_umroh ?? null,
    // `paket` = tier (HEMAT/RAHMAH), `paket_nama` = nama paket lengkap hasil
    // lookup jadwal_id di lib/bani-tools.js. Klien menampilkan yang lengkap dan
    // jatuh ke tier bila lookup-nya kosong.
    paket: row.paket ?? null,
    paket_nama: row.paket_nama ?? null,
    tgl_berangkat: row.tgl_berangkat ?? null,
    // Hanya terisi dari hasil jamaah_birthdays / get_jamaah — bahan kolom
    // "Ultah" & "Umur". Kolomnya otomatis gugur (dropEmptyBaniColumns) kalau
    // hasil tool-nya memang tidak membawa tanggal lahir.
    tgl_lahir: row.tgl_lahir ?? null,
    sisa: row.sisa ?? null,
    bayar: row.bayar ?? null,
    wa: row.wa ?? null,
  }));

  // Kartu "link" (Buka daftar jamaah / kalender / paket) DICABUT 4 Agt 2026 atas
  // permintaan agent: tombolnya menempel di tiap jawaban tanpa pernah dipakai.
  // `link` yang telanjur dikirim model diabaikan begitu saja.
  return cards;
}

// Jaring pengaman untuk aturan "jangan ulang nama kartu di answer". Prompt saja
// tidak pernah 100% dipatuhi, dan tiap pelanggaran terlihat jelas di layar:
// nama yang sama muncul sebagai butir "- " di dalam bubble LALU sekali lagi
// sebagai baris tabel di bawahnya.
//
// Yang dibuang hanya butir yang menyebut entitas yang benar-benar dirender —
// butir tentang hal lain (rincian per bulan, per kategori) tetap utuh. FAIL-OPEN:
// kalau penyaringan menyisakan teks kosong, teks asli yang dipakai. Nama dobel
// jauh lebih baik daripada bubble kosong.
const BANI_ENTITY_MIN_LEN = 3;

function normalizeForMatch(value) {
  return String(value || '').replace(/[*_`]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}

export function stripCardEntityLines(answer, cards) {
  const text = String(answer || '');
  const needles = [];
  for (const card of Array.isArray(cards) ? cards : []) {
    for (const value of [card?.nama, card?.jm_id, card?.jadwal_id, card?.id_umroh]) {
      const needle = normalizeForMatch(value);
      if (needle.length >= BANI_ENTITY_MIN_LEN) needles.push(needle);
    }
  }
  if (!needles.length) return text;

  const kept = [];
  let dropped = false;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) {
      const haystack = normalizeForMatch(trimmed.slice(2));
      if (needles.some((needle) => haystack.includes(needle))) { dropped = true; continue; }
    }
    kept.push(line);
  }
  if (!dropped) return text;

  // "Ada 4 jamaah yang belum lunas:" menggantung setelah butirnya hilang —
  // titik dua yang tidak lagi memperkenalkan apa pun diganti titik.
  const tidied = kept.map((line, i) => {
    if (!/:\s*$/.test(line)) return line;
    const next = kept.slice(i + 1).find((l) => l.trim());
    return next && next.trim().startsWith('- ') ? line : line.replace(/:\s*$/, '.');
  });

  return tidied.join('\n').replace(/\n{3,}/g, '\n\n').trim() || text;
}

// `note` pada hasil tool berisi kalimat provenance ("snapshot hasil sync, bukan
// real-time") — berguna untuk klien MCP, tapi model SELALU menyalinnya mentah ke
// akhir jawaban sehingga tiap balasan Bani ditutup disclaimer. Registry tool
// dipakai bersama MCP, jadi note-nya dibuang di sisi Bani saja, BUKAN di
// lib/bani-tools.js. `truncated_note` sengaja dibiarkan: itu memberi tahu model
// bahwa daftarnya terpotong, bukan basa-basi.
function stripToolProvenance(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const { note, ...rest } = data;
  return rest;
}

// Satu pemanggilan tool. TIDAK PERNAH melempar keluar: error apa pun berubah
// jadi pesan role:'tool' supaya model bisa memperbaiki langkahnya sendiri, dan
// setiap tool_call tetap punya balasan (syarat protokol chat completions).
async function executeBaniToolCall({ call, agent, supabase, log, budgetLeft }) {
  const name = call?.function?.name || '';
  const fail = (error) => ({ name, counted: false, record: null, content: JSON.stringify({ error }) });

  const tool = BANI_TOOL_BY_NAME[name];
  if (!tool) return fail(`Tool "${name || '(kosong)'}" tidak dikenal.`);
  if (budgetLeft <= 0) return fail('Batas jumlah pemanggilan tool tercapai. Rangkum dengan data yang sudah ada.');

  let args;
  try {
    args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
  } catch {
    return fail('Argumen tool bukan JSON valid. Ulangi dengan JSON yang benar.');
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) args = {};

  // Hemat token: paginasi tool daftar dipangkas ke BANI_TOOL_ROW_LIMIT.
  if (tool.parameters?.properties?.limit) {
    const asked = Number(args.limit);
    args.limit = Number.isFinite(asked) && asked > 0 ? Math.min(asked, BANI_TOOL_ROW_LIMIT) : BANI_TOOL_ROW_LIMIT;
  }

  // Log hanya NAMA parameter, tidak pernah nilainya — search/jm_id bisa membawa
  // nama & nomor WA jamaah (PII) ke journald. Cermin logging mcp-server.js.
  log(`[Bani] ${agent?.slug}: ${name} (${Object.keys(args).join(',') || 'no args'})`);

  try {
    const out = await tool.run({ supabase, agent, log }, args);
    if (out?.ok) {
      return {
        name,
        counted: true,
        // `args` ikut direkam: hydrateBaniKalkulasi menggemakan parameter
        // hitungan ke klien sebagai jangkar riwayat. Tetap server-side —
        // hanya proyeksi hasil hydrator yang sampai ke klien.
        record: { name, ok: true, data: out.data, args },
        content: JSON.stringify(stripToolProvenance(out.data)),
      };
    }
    return {
      name,
      counted: true,
      record: { name, ok: false, data: null },
      content: JSON.stringify({ error: out?.error || 'Tool tidak mengembalikan hasil.' }),
    };
  } catch (err) {
    // Error DB/internal tinggal di log server; model cuma dapat pesan generik.
    log(`[Bani] ${agent?.slug}: ${name} ERROR ${err.message}`);
    return {
      name,
      counted: true,
      record: { name, ok: false, data: null },
      content: JSON.stringify({ error: 'Terjadi kesalahan internal saat mengambil data.' }),
    };
  }
}

export async function runBaniConversation({
  question,
  agent,
  supabase,
  log = () => {},
  history,
  callOpenAI,
  model,
  now = Date.now,
} = {}) {
  if (typeof callOpenAI !== 'function') throw new Error('runBaniConversation: callOpenAI wajib diinjeksi');
  const startedAt = now();
  const tools = buildBaniToolSpecs();
  const messages = [
    { role: 'system', content: buildBaniSystemPrompt(agent, { now }) },
    // Giliran sebelumnya masuk sebagai teks biasa: cukup untuk memahami "paket
    // itu", tanpa memberi model jalan menyalin angka lama sebagai jawaban baru
    // (aturannya ditegakkan di SUMBER JAWABAN pada system prompt).
    ...sanitizeBaniHistory(history).flatMap((turn) => [
      { role: 'user', content: turn.question },
      {
        role: 'assistant',
        content: turn.shown.length ? `${turn.answer}\n${formatShownNote(turn.shown)}` : turn.answer,
      },
    ]),
    { role: 'user', content: String(question || '').trim() },
  ];

  const toolResults = [];
  const toolsUsed = [];
  let toolCallCount = 0;
  let finalText = null;

  for (let round = 0; round < BANI_MAX_ROUNDS; round += 1) {
    const completion = await callOpenAI({ model, messages, tools });
    const message = completion?.choices?.[0]?.message;
    if (!message) throw new Error('Balasan OpenAI tidak memuat message');
    messages.push(message);

    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    if (!calls.length) {
      finalText = typeof message.content === 'string' ? message.content : '';
      break;
    }

    for (const call of calls) {
      const outcome = await executeBaniToolCall({
        call,
        agent,
        supabase,
        log,
        budgetLeft: BANI_MAX_TOOL_CALLS - toolCallCount,
      });
      if (outcome.counted) {
        toolCallCount += 1;
        if (!toolsUsed.includes(outcome.name)) toolsUsed.push(outcome.name);
      }
      if (outcome.record) toolResults.push(outcome.record);
      messages.push({ role: 'tool', tool_call_id: call.id, content: outcome.content });
    }
  }

  // response_format sengaja TIDAK dipakai selama putaran tool: pada sebagian
  // model itu menekan tool_call. Kontrak JSON ditegakkan lewat system prompt +
  // ekstraksi toleran, dengan satu kali perbaikan bila gagal.
  let parsed = extractBaniJson(finalText);
  if (!parsed) {
    messages.push({ role: 'user', content: 'Balas ulang HANYA JSON sesuai format yang diminta, tanpa teks atau pembungkus lain.' });
    let retryText = '';
    const retry = await callOpenAI({ model, messages, tools });
    const retryMessage = retry?.choices?.[0]?.message;
    if (typeof retryMessage?.content === 'string') retryText = retryMessage.content;
    parsed = extractBaniJson(retryText);

    if (!parsed) {
      // Degradasi: teks mentah model lebih berguna bagi agent daripada error,
      // tapi TANPA kartu — tidak ada referensi id yang bisa dipercaya.
      const rawAnswer = String(retryText || finalText || '').trim();
      log(`[Bani] ${agent?.slug}: jawaban degradasi ${now() - startedAt}ms, tools=${toolsUsed.join(',') || '-'}`);
      return {
        success: true,
        answer: rawAnswer || BANI_FALLBACK_ANSWER,
        cards: [],
        columns: resolveBaniColumns(null),
        media: [],
        kalkulasi: [],
        follow_ups: [],
        tools_used: toolsUsed,
        degraded: true,
      };
    }
  }

  const cards = hydrateBaniCards(toolResults, parsed);
  const answer = stripCardEntityLines(parsed.answer, cards).trim();
  log(`[Bani] ${agent?.slug}: jawaban siap ${now() - startedAt}ms, tools=${toolsUsed.join(',') || '-'}, cards=${cards.length}`);
  return {
    success: true,
    answer,
    cards,
    columns: resolveBaniColumns(parsed, cards),
    media: hydrateBaniMedia(toolResults, parsed),
    kalkulasi: hydrateBaniKalkulasi(toolResults),
    follow_ups: pickBaniFollowUps(parsed.follow_ups, question),
    tools_used: toolsUsed,
  };
}

// Format pesan "kirim jawaban Bani ke Telegram".
//
// Jawaban Bani hidup di layar yang sekali ganti pertanyaan langsung hilang
// (single-shot, tanpa riwayat) — tombol kirim ini yang membuat jawaban panjang
// bisa disimpan/diteruskan agent. Isi kartu IKUT dikirim karena system prompt
// justru melarang model mengulang detail kartu di dalam teks: pesan tanpa kartu
// akan kehilangan nama paket, tanggal, dan nominalnya.
//
// DIBACA DI LAYAR HP, ±40 kolom. Itu batas yang membentuk hampir semua
// keputusan di bawah: baris detail yang melewatinya akan dilipat Telegram di
// tempat acak, dan daftar yang tiap barisnya patah di tempat berbeda jauh lebih
// sulit dipindai daripada daftar yang sedikit lebih ringkas.
//
// Murni fungsi (tanpa jaringan/DB) supaya bisa diuji di tests/bani-telegram.test.js.

// Batas sendMessage Telegram 4096 karakter; sisakan ruang untuk penanda potong.
export const BANI_TELEGRAM_MAX_LEN = 3900;
export const BANI_TELEGRAM_MAX_CARDS = 8;
// Pertanyaan boleh sampai 500 karakter (BANI_QUESTION_MAX_LEN di server.js).
// Utuh di baris judul, yang setebal itu jadi dinding tebal ±13 baris sebelum
// jawabannya mulai. 120 karakter ≈ 3 baris di layar HP — cukup untuk mengenali
// pertanyaan mana, dan agent-nya toh yang barusan mengetiknya.
export const BANI_TELEGRAM_TITLE_MAX = 120;

// Telegram parse_mode HTML hanya mewajibkan tiga karakter ini di-escape.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

// Urutan sama dengan renderBaniMarkdown di BaniPage: escape SEMUA dulu, baru
// terapkan penanda yang diizinkan. Terbalik, "<b>halo</b>" yang ditulis model
// akan ikut ter-render sebagai tag sungguhan.
function markdownToTelegramHtml(text) {
  return escapeHtml(text)
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      return trimmed.startsWith('- ') ? `• ${trimmed.slice(2).trim()}` : trimmed;
    })
    .join('\n')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function tahunDari(iso) {
  const m = /^(\d{4})-\d{2}-\d{2}/.exec(String(iso || ''));
  return m ? Number(m[1]) : null;
}

/**
 * Keputusan tampil-tahun diambil sekali untuk SELURUH pesan, sama seperti
 * makeTanggalKolom di BaniResultTable: "11 Feb" bersanding dengan "12 Jul 25"
 * di daftar yang sama membuat pembaca baris polos tak punya cara tahu tahunnya.
 * Tahun ditulis dua digit — empat digit memakan lebar yang tidak dibayar
 * kembali oleh informasinya.
 */
function makeTanggal(values, now) {
  const tahunIni = (now instanceof Date ? now : new Date()).getFullYear();
  const perluTahun = values.some((iso) => {
    const tahun = tahunDari(iso);
    return tahun !== null && tahun !== tahunIni;
  });
  return (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return null;
    const bulan = BULAN[Number(m[2]) - 1];
    if (!bulan) return null;
    const dasar = `${Number(m[3])} ${bulan}`;
    return perluTahun ? `${dasar} ${m[1].slice(2)}` : dasar;
  };
}

function rupiah(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `Rp${Math.round(n).toLocaleString('id-ID')}` : null;
}

/**
 * Harga paket dibulatkan ke sepersepuluh juta ("Rp29.500.000" → "29,5 jt").
 * Ini SATU-SATUNYA nominal yang dibulatkan, dan hanya karena baris paket sudah
 * memuat tanggal + durasi + sisa seat: versi penuhnya mendorong baris ke 49
 * kolom dan selalu terlipat. Angka persisnya tetap ada di teks jawaban Bani dan
 * di dashboard. Sisa bayar jamaah TIDAK dibulatkan — itu nominal tagihan, dan
 * barisnya memang muat.
 */
function jutaan(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const jt = Math.round((n / 1_000_000) * 10) / 10;
  return `${jt.toLocaleString('id-ID')} jt`;
}

// Pangkas di batas kata terdekat — memotong di tengah kata ("paket umroh yang
// berangk…") terbaca seperti pesan rusak, bukan pesan yang diringkas.
function potongJudul(text) {
  const satu = text.replace(/\s+/g, ' ').trim();
  if (satu.length <= BANI_TELEGRAM_TITLE_MAX) return satu;
  const potong = satu.slice(0, BANI_TELEGRAM_TITLE_MAX);
  const spasi = potong.lastIndexOf(' ');
  return `${(spasi > BANI_TELEGRAM_TITLE_MAX * 0.6 ? potong.slice(0, spasi) : potong).trimEnd()}…`;
}

function detailLine(parts) {
  const isi = parts.filter(Boolean).join(' · ');
  return isi ? `\n${escapeHtml(isi)}` : '';
}

function packageLine(card, tanggal) {
  const nama = escapeHtml(card.nama || card.jadwal_id || 'Paket');
  const seat = Number(card.seat_sisa);
  const durasi = Number(card.durasi_hari);
  return `• <b>${nama}</b>${detailLine([
    tanggal(card.berangkat_tgl),
    Number.isFinite(durasi) && durasi > 0 ? `${durasi} hari` : null,
    card.sold_out ? 'sold out' : Number.isFinite(seat) ? `sisa ${seat}` : null,
    jutaan(card.harga_mulai),
  ])}`;
}

function jamaahLine(card, tanggal) {
  const nama = escapeHtml(card.nama || card.jm_id || 'Jamaah');
  const sisa = Number(card.sisa);
  return `• <b>${nama}</b>${detailLine([
    tanggal(card.tgl_berangkat),
    // Nol bukan "sisa Rp0" melainkan kabar baik yang berdiri sendiri.
    Number.isFinite(sisa) ? (sisa > 0 ? `sisa bayar ${rupiah(sisa)}` : 'lunas') : null,
  ])}`;
}

// Memotong HTML mentah di tengah tag membuat Telegram menolak seluruh pesan
// ("can't parse entities") — jadi potongannya dirapikan: buang tag yang
// terbelah, lalu tutup tag yang telanjur terbuka.
function truncateTelegramHtml(text, max) {
  if (text.length <= max) return text;
  let cut = text.slice(0, max);
  const lastBreak = cut.lastIndexOf('\n');
  if (lastBreak > max * 0.6) cut = cut.slice(0, lastBreak);
  cut = cut.replace(/<[^>]*$/, '').trimEnd();
  for (const tag of ['b', 'i']) {
    const open = (cut.match(new RegExp(`<${tag}>`, 'g')) || []).length;
    const close = (cut.match(new RegExp(`</${tag}>`, 'g')) || []).length;
    if (open > close) cut += `</${tag}>`.repeat(open - close);
  }
  return `${cut}…`;
}

/**
 * Rangkai pesan Telegram dari satu jawaban Bani.
 * @type {import('./bani-telegram').formatBaniTelegramMessage}
 */
export function formatBaniTelegramMessage({ question, answer, cards, now } = {}) {
  // Baris pertama = yang terbaca di notifikasi kunci layar. Dulu isinya tetap
  // "🤖 Bani" — benar tapi nihil, padahal nama botnya sudah tertera di kepala
  // chat. Pertanyaannya jauh lebih menolong, apalagi saat beberapa jawaban
  // dikirim berturut-turut.
  //
  // Judul di-escape saja, TIDAK lewat markdownToTelegramHtml: hasilnya masuk ke
  // dalam <b>, dan "**tebal**" yang ikut dikonversi akan menyarangkan <b> di
  // dalam <b> — Telegram menolak pesannya.
  //
  // Dipangkas SEBELUM escape supaya batasnya dihitung dalam karakter yang
  // benar-benar terbaca — "&amp;" itu satu karakter di layar, lima di sumber.
  const blocks = [`🤖 <b>${escapeHtml(potongJudul(String(question || ''))) || 'Bani'}</b>`];

  const jawab = markdownToTelegramHtml(String(answer || ''));
  if (jawab) blocks.push(jawab);

  const semua = Array.isArray(cards) ? cards : [];
  const list = semua.slice(0, BANI_TELEGRAM_MAX_CARDS);
  // Kartu link cuma navigasi di dashboard — tidak ada artinya di Telegram.
  const paketCards = list.filter((c) => c?.type === 'package');
  const jamaahCards = list.filter((c) => c?.type === 'jamaah');

  // Satu keputusan tampil-tahun untuk semua tanggal di pesan ini.
  const tanggal = makeTanggal(
    [...paketCards.map((c) => c.berangkat_tgl), ...jamaahCards.map((c) => c.tgl_berangkat)],
    now,
  );

  if (paketCards.length) {
    blocks.push(`<b>📦 ${paketCards.length} paket</b>\n${paketCards.map((c) => packageLine(c, tanggal)).join('\n')}`);
  }
  if (jamaahCards.length) {
    blocks.push(`<b>👤 ${jamaahCards.length} jamaah</b>\n${jamaahCards.map((c) => jamaahLine(c, tanggal)).join('\n')}`);
  }

  // Batas kartu jangan sampai membisu: daftar yang dipotong diam-diam terbaca
  // seolah itulah seluruh hasilnya.
  const relevan = semua.filter((c) => c?.type === 'package' || c?.type === 'jamaah').length;
  const tampil = paketCards.length + jamaahCards.length;
  if (relevan > tampil) blocks.push(`<i>+${relevan - tampil} lainnya, lihat di dashboard</i>`);

  return truncateTelegramHtml(blocks.join('\n\n'), BANI_TELEGRAM_MAX_LEN);
}

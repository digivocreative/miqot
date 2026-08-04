// Format pesan "kirim jawaban Bani ke Telegram".
//
// Jawaban Bani hidup di layar yang sekali ganti pertanyaan langsung hilang
// (single-shot, tanpa riwayat) — tombol kirim ini yang membuat jawaban panjang
// bisa disimpan/diteruskan agent. Isi kartu IKUT dikirim karena system prompt
// justru melarang model mengulang detail kartu di dalam teks: pesan tanpa kartu
// akan kehilangan nama paket, tanggal, dan nominalnya.
//
// Murni fungsi (tanpa jaringan/DB) supaya bisa diuji di tests/bani-telegram.test.js.

// Batas sendMessage Telegram 4096 karakter; sisakan ruang untuk penanda potong.
export const BANI_TELEGRAM_MAX_LEN = 3900;
export const BANI_TELEGRAM_MAX_CARDS = 8;

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

function tanggalPendek(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  const bulan = BULAN[Number(m[2]) - 1];
  return bulan ? `${Number(m[3])} ${bulan} ${m[1]}` : null;
}

function rupiah(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `Rp${Math.round(n).toLocaleString('id-ID')}` : null;
}

function packageLine(card) {
  const nama = escapeHtml(card.nama || card.jadwal_id || 'Paket');
  const detail = [
    tanggalPendek(card.berangkat_tgl),
    Number.isFinite(Number(card.durasi_hari)) && Number(card.durasi_hari) > 0 ? `${Number(card.durasi_hari)} hari` : null,
    card.sold_out ? 'sold out'
      : Number.isFinite(Number(card.seat_sisa)) ? `sisa ${Number(card.seat_sisa)} seat` : null,
    rupiah(card.harga_mulai) ? `mulai ${rupiah(card.harga_mulai)}` : null,
  ].filter(Boolean);
  return `• <b>${nama}</b>${detail.length ? `\n   ${escapeHtml(detail.join(' · '))}` : ''}`;
}

function jamaahLine(card) {
  const nama = escapeHtml(card.nama || card.jm_id || 'Jamaah');
  const sisa = Number(card.sisa);
  const detail = [
    tanggalPendek(card.tgl_berangkat) ? `brgkt ${tanggalPendek(card.tgl_berangkat)}` : null,
    Number.isFinite(sisa) && sisa > 0 ? `sisa ${rupiah(sisa)}` : null,
  ].filter(Boolean);
  return `• <b>${nama}</b>${detail.length ? `\n   ${escapeHtml(detail.join(' · '))}` : ''}`;
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
export function formatBaniTelegramMessage({ question, answer, cards } = {}) {
  const blocks = ['🤖 <b>Bani</b>'];

  const tanya = markdownToTelegramHtml(String(question || '')).replace(/\n+/g, ' ').trim();
  if (tanya) blocks.push(`<i>${tanya}</i>`);

  const jawab = markdownToTelegramHtml(String(answer || ''));
  if (jawab) blocks.push(jawab);

  const list = Array.isArray(cards) ? cards.slice(0, BANI_TELEGRAM_MAX_CARDS) : [];
  const paket = list.filter((c) => c?.type === 'package').map(packageLine);
  // Kartu link cuma navigasi di dashboard — tidak ada artinya di Telegram.
  const jamaah = list.filter((c) => c?.type === 'jamaah').map(jamaahLine);
  if (paket.length) blocks.push(`📦 <b>Paket</b>\n${paket.join('\n')}`);
  if (jamaah.length) blocks.push(`👤 <b>Jamaah</b>\n${jamaah.join('\n')}`);

  return truncateTelegramHtml(blocks.join('\n\n'), BANI_TELEGRAM_MAX_LEN);
}

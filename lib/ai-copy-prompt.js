// Prompt builder untuk /api/ai-copy — dipakai server.js (produksi) dan
// vite.config.ts (dev proxy) supaya prompt tidak pernah drift antar environment.
//
// Dua mode payload:
//   { packageData: {...} }  → caption satu paket (PackageCard / preview brosur)
//   { monthData: {...} }    → caption brosur jadwal berisi banyak paket (Brosur Jadwal)
//
// Satu request menghasilkan TIGA versi caption (Urgensi / Storytelling / Trust)
// dalam JSON mode — frontend menampilkannya sebagai tab agar agent bisa memilih.

const BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// Guard: brosur bulanan bisa berisi banyak baris; batasi yang masuk prompt.
const MAX_MONTH_ROWS = 20;

function formatRupiah(n) {
  return `Rp ${Number(n).toLocaleString('id-ID')}`;
}

function formatTanggalPendek(iso) {
  if (!iso) return '-';
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d || !BULAN_PENDEK[m - 1]) return String(iso);
  return `${d} ${BULAN_PENDEK[m - 1]}`;
}

// Tiga gaya yang diminta dari model — label dipakai sebagai judul tab di frontend.
const TIGA_VERSI = `Buat TIGA versi caption dengan gaya berbeda:
1. "Urgensi" — dorong pembaca cepat ambil keputusan: tonjolkan fakta urgensi yang ADA di data (sisa seat, tanggal keberangkatan yang makin dekat, harga mulai). FOMO tapi jujur.
2. "Storytelling" — hangat dan mengalir: ajak membayangkan suasana ibadah di Tanah Suci, lalu sambungkan ke detail paket. Hook boleh 2-3 kalimat naratif.
3. "Trust" — bangun rasa percaya lewat bukti kualitas yang ADA di data: hotel beserta bintangnya, maskapai & rutenya, jadwal pasti PP, harga transparan, nama travel Alhijaz Indowisata. JANGAN mengarang klaim lain (izin, pengalaman bertahun-tahun, testimoni).`;

const GAYA_BERSAMA = `Format WAJIB untuk SEMUA versi (caption WhatsApp):
- Panjang sekitar 700-1000 karakter. JANGAN menulis semua dalam satu paragraf panjang.
- Struktur: baris hook sesuai gaya → baris kosong → blok info paket (beberapa baris pendek, satu info per baris, tiap baris diawali emoji yang relevan, contoh: 🗓️ ✈️ 🏨 💰 💺 🕋) → baris kosong → baris penutup berisi ajakan menghubungi agent.
- Pakai format WhatsApp: *bold* untuk nama paket, tanggal, dan harga; _italic_ untuk penekanan halus.
- Beri emoji yang relevan juga di hook dan penutup — caption harus terasa hidup, bukan teks polos.

Aturan isi untuk SEMUA versi:
- JANGAN membuka dengan salam atau sapaan (Assalamu'alaikum, Halo, Hai Sahabat, Bapak/Ibu, dsb). Kalimat pertama harus langsung menyebut sesuatu yang konkret dari data: nama paket, tanggal, hotel, atau harga.
- JANGAN memakai kata ganti orang: kamu, Anda, saya, aku, kami, kita, kalian — termasuk bentuk akhiran -mu/-ku (contoh salah: "mengantarkanmu", "amankan seat Anda"). Tulis impersonal, contoh benar: "Yuk amankan seat sekarang", "Segera hubungi", "Perjalanan ibadah jadi lebih tenang".
- Bahas HANYA fakta yang ada di data yang diberikan. JANGAN mengarang fakta di luar data (misal menyebut sold out padahal tidak ada, atau mengarang hotel/harga/diskon/fasilitas/tanggal).
- Tulis dengan gaya ngobrol ke teman — friendly, tidak kaku, tidak terlalu formal.
- Jangan gunakan hashtag. Jangan gunakan markdown selain format WhatsApp.

Balas HANYA dengan JSON valid berstruktur persis:
{"versions":[{"label":"Urgensi","text":"..."},{"label":"Storytelling","text":"..."},{"label":"Trust","text":"..."}]}
Gunakan \\n untuk baris baru di dalam "text".`;

function buildPackagePrompts(pkg, agentName, agentWebsite) {
  const hotelData = pkg.hotel || {};
  const pricing = pkg.harga;
  let pricingInfo = '';
  if (pricing) {
    const prices = [];
    if (pricing.Quard) prices.push(`Quad: ${formatRupiah(pricing.Quard)}`);
    if (pricing.Triple) prices.push(`Triple: ${formatRupiah(pricing.Triple)}`);
    if (pricing.Double) prices.push(`Double: ${formatRupiah(pricing.Double)}`);
    pricingInfo = prices.join(', ');
  }

  const systemPrompt = `Kamu adalah copywriter untuk travel umroh Alhijaz Indowisata.
Tugasmu menulis caption promosi WhatsApp dari data satu paket umroh — persuasif dan enak dibaca di layar HP. Isi caption harus benar-benar membahas isi paket (tanggal, maskapai, hotel, harga, sisa seat).

${TIGA_VERSI}

${GAYA_BERSAMA}`;

  const userPrompt = `Buatkan caption promosi WhatsApp untuk paket umroh ini:

Nama Paket: ${pkg.nama}
Maskapai: ${pkg.maskapai || '-'} (${pkg.keberangkatan?.kodePenerbangan || '-'})
Rute: ${pkg.keberangkatan?.rute || '-'}
Tanggal Berangkat: ${pkg.keberangkatan?.tgl || '-'}
Tanggal Pulang: ${pkg.kepulangan?.tgl || '-'}
Hotel Mekkah: ${hotelData?.mekkah_hotel || '-'} (${hotelData?.mekkah_bintang || '-'} bintang)
Hotel Madinah: ${hotelData?.madinah_hotel || '-'} (${hotelData?.madinah_bintang || '-'} bintang)
Sisa Seat: ${pkg.seatSisa ?? '-'} dari ${pkg.seatTotal ?? '-'}
Harga: ${pricingInfo || 'Hubungi kami'}
${agentName ? `\nAgent: ${agentName}` : ''}
${agentWebsite ? `Website: ${agentWebsite}` : ''}

Buat tiga versi caption yang membuat orang tertarik untuk segera mendaftar.`;

  return { systemPrompt, userPrompt };
}

function buildMonthPrompts(monthData, agentName, agentWebsite) {
  const rows = monthData.packages.slice(0, MAX_MONTH_ROWS).map((p) => {
    const parts = [
      formatTanggalPendek(p.berangkat_tgl),
      p.nama || '-',
      p.maskapai || '-',
    ];
    if (p.hari) parts.push(`${p.hari} hari`);
    parts.push(p.harga ? `mulai ${formatRupiah(p.harga)}` : 'harga hubungi kami');
    let row = `- ${parts.join(' • ')}`;
    if (p.isPromo) row += ' (PROMO)';
    if (p.soldOut) row += ' (SOLD OUT)';
    return row;
  });
  const extra = monthData.packages.length - MAX_MONTH_ROWS;

  const systemPrompt = `Kamu adalah copywriter untuk travel umroh Alhijaz Indowisata.
Tugasmu menulis caption promosi WhatsApp untuk BROSUR JADWAL yang berisi banyak pilihan paket sekaligus.
Caption dikirim bersama gambar brosur berisi daftar lengkap — jadi jangan menulis ulang semua paket. Isi caption harus benar-benar membahas isi brosur: ringkasan jadwal (jumlah pilihan, rentang tanggal, harga mulai) lalu sorot 2-3 paket paling menarik (promo atau termurah).
Paket yang SOLD OUT jangan dipromosikan — boleh disinggung singkat sebagai bukti seat cepat habis.
Data brosur TIDAK memuat sisa seat per paket — JANGAN menyebut jumlah/sisa kursi; bahan urgensi cukup dari tanggal keberangkatan, harga mulai, label PROMO, atau bukti SOLD OUT.

${TIGA_VERSI}

${GAYA_BERSAMA}`;

  const userPrompt = `Buatkan caption promosi WhatsApp untuk jadwal umroh: ${monthData.label}

Daftar paket (${monthData.packages.length} pilihan):
${rows.join('\n')}${extra > 0 ? `\n...dan ${extra} paket lainnya` : ''}
${agentName ? `\nAgent: ${agentName}` : ''}
${agentWebsite ? `Website: ${agentWebsite}` : ''}

Buat tiga versi caption sesuai instruksi.`;

  return { systemPrompt, userPrompt };
}

/**
 * Bangun {systemPrompt, userPrompt} dari body request /api/ai-copy.
 * Return null kalau payload tidak valid (caller balas 400).
 */
export function buildAiCopyPrompts(body = {}) {
  const { packageData: pkg, monthData, agentName = '', agentWebsite = '' } = body;
  if (monthData?.label && Array.isArray(monthData.packages) && monthData.packages.length > 0) {
    return buildMonthPrompts(monthData, agentName, agentWebsite);
  }
  if (pkg?.nama) {
    return buildPackagePrompts(pkg, agentName, agentWebsite);
  }
  return null;
}

/**
 * Body request OpenAI chat completions untuk /api/ai-copy.
 * JSON mode + max_tokens cukup untuk 3 versi caption sekali jalan.
 */
export function buildAiCopyChatBody({ systemPrompt, userPrompt }) {
  return {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.85,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
  };
}

/**
 * Parse konten balasan model → [{label, text}] (maks 3 versi).
 * Toleran terhadap balasan menyimpang:
 * - JSON valid tanpa versions yang terpakai → []
 * - Plain text (model abai JSON mode) → satu versi apa adanya
 * - JSON terpotong max_tokens → [] (jangan tampilkan JSON mentah ke user)
 */
export function parseAiCopyVersions(content) {
  const raw = String(content || '').trim();
  if (!raw) return [];
  try {
    const versions = JSON.parse(raw)?.versions;
    if (Array.isArray(versions)) {
      const clean = versions
        .filter((v) => v && typeof v.text === 'string' && v.text.trim())
        .slice(0, 3)
        .map((v, i) => ({
          label: typeof v.label === 'string' && v.label.trim() ? v.label.trim().slice(0, 24) : `Versi ${i + 1}`,
          text: v.text.trim(),
        }));
      if (clean.length > 0) return clean;
    }
    return [];
  } catch {
    return raw.startsWith('{') ? [] : [{ label: 'Caption', text: raw }];
  }
}

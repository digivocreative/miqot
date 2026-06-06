// Prompt builder untuk /api/ai-copy — dipakai server.js (produksi) dan
// vite.config.ts (dev proxy) supaya prompt tidak pernah drift antar environment.
//
// Dua mode payload:
//   { packageData: {...} }  → caption satu paket (PackageCard / preview brosur)
//   { monthData: {...} }    → caption brosur jadwal berisi banyak paket (Brosur Jadwal)

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

const GAYA_BERSAMA = `Gunakan emoji secukupnya. Gunakan format WhatsApp (*bold*, _italic_) secukupnya.
Tulis dengan gaya ngobrol ke teman — friendly, tidak kaku, tidak terlalu formal.
Jangan gunakan hashtag. Jangan gunakan markdown selain format WhatsApp.
Jangan terlalu banyak baris kosong.
PENTING: Jangan mengarang fakta di luar data yang diberikan (misal menyebut sold out padahal tidak ada, atau mengarang hotel/harga/tanggal).`;

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
Tugas kamu menulis caption promosi WhatsApp yang santai, hangat, dan persuasif tapi tetap islami.
Struktur caption: hook pembuka yang menarik perhatian → info inti paket (tanggal, maskapai, hotel, harga) → sentuhan urgensi sisa seat → ajakan menghubungi agent.
${GAYA_BERSAMA}
Caption harus ringkas dan to the point, mudah dibaca di layar HP (maks 500 karakter).`;

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

Buat caption yang membuat orang tertarik untuk segera mendaftar.`;

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
Tugas kamu menulis caption promosi WhatsApp untuk BROSUR JADWAL yang berisi banyak pilihan paket sekaligus.
Struktur caption: hook pembuka yang menarik perhatian → ringkasan jadwal (jumlah pilihan, rentang tanggal, harga mulai) → sebut 2-3 paket paling menarik (promo atau termurah) → sentuhan urgensi seat terbatas → ajakan menghubungi agent.
Paket yang SOLD OUT jangan dipromosikan — boleh disinggung singkat sebagai bukti seat cepat habis.
${GAYA_BERSAMA}
Caption harus ringkas dan to the point, mudah dibaca di layar HP (maks 600 karakter).`;

  const userPrompt = `Buatkan caption promosi WhatsApp untuk jadwal umroh: ${monthData.label}

Daftar paket (${monthData.packages.length} pilihan):
${rows.join('\n')}${extra > 0 ? `\n...dan ${extra} paket lainnya` : ''}
${agentName ? `\nAgent: ${agentName}` : ''}
${agentWebsite ? `Website: ${agentWebsite}` : ''}

Caption akan dikirim bersama gambar brosur berisi daftar lengkap, jadi tidak perlu menulis ulang semua paket.`;

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

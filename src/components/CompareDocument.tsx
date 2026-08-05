import { Fragment, type ReactNode } from 'react';
import { Document, Page, View, Text, Image, StyleSheet, Font, Svg, Path, pdf } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import type { UmrohPackage } from '@/types';
import type { AgentData } from '@/data/agents';
import { tierRoomPrice, tierHotelInfo, packageCityHotels } from '@/lib/packageTiers';
import { buildCompareVerdict } from '@/lib/compareVerdict';
import type { CompareVerdict } from '@/lib/compareVerdict';
import { hotelStars, hotelDistance, COMPARE_CITIES } from '@/utils/hotelDisplay';
import { getPackageJourneySteps, getLandingStepIndex, getLandingCityName, airportCityName } from '@/utils/journey';
import { getTemperature } from '@/data/temperatureData';
import { destinationPhotosForDays } from '../../lib/itinerary-destinasi.js';

// ── Font Inter dari /public/fonts, sama seperti QuotationDocument ──
// Jangan kembalikan ke fonts.gstatic.com: dokumen ini harus bisa dibuat tanpa
// jaringan pihak ketiga, dan berkasnya sudah ada di repo.
const fontOrigin = typeof window !== 'undefined' ? window.location.origin : '';
Font.register({
  family: 'Inter',
  fonts: [
    { src: `${fontOrigin}/fonts/Inter-Regular.ttf`, fontWeight: 'normal' },
    { src: `${fontOrigin}/fonts/Inter-Bold.ttf`, fontWeight: 'bold' },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

// ── Palet: sama dengan Surat Penawaran (QuotationDocument) ──
// Pembagiannya juga ditiru dari sana: blok besar memakai biru tua, burgundy
// tinggal sebagai aksen — pita atas, lencana judul, dan angka yang menang.
// Dokumen yang seluruhnya merah terasa berat dan boros tinta.
// Pembaca dokumen ini calon jamaah 40+: abu-abunya dua tingkat lebih tua dan
// teks emas di atas putih memakai emas TUA (goldInk) — emas terang #c18f1f
// kontrasnya cuma ~2,9:1, nyaris tak terbaca di cetakan.
const C = {
  burgundy: '#b40200',
  navy: '#0f172a',
  navyLine: '#334155',
  gold: '#c18f1f',
  goldInk: '#8a6410',
  goldSoft: '#fbf3e2',
  ink: '#1f2937',
  gray: '#4b5563',
  grayLight: '#6b7280',
  line: '#e5e7eb',
  bgSoft: '#f8fafc',
  bgTint: '#f3f4f6',
  white: '#ffffff',
  onDark: '#ffffffe6',
  onDarkDim: '#ffffffc4',
  /**
   * Warna padat, BUKAN hex 8-digit. react-pdf menangani alpha-hex dengan benar
   * di `backgroundColor` dan `color` teks, tapi merusaknya di `borderColor` dan
   * `fill` SVG — keluarnya hijau terang. Sudah menggigit dua kali: garis
   * pemisah pita paket dan ikon pesawat penanda landing.
   */
  onDarkSolid: '#94a3b8',
  onDarkFill: '#ffffff1f',
};

const A4W = 595.28;
const LABEL_W = 104;

const b = { fontFamily: 'Inter', fontWeight: 'bold' as const };

// Lantai ukuran font (permintaan user 2026-08-05, pembaca 40+): tak ada teks di
// bawah 7.5pt; keterangan sekunder minimal 8.5pt, nilai utama 11–14pt.
const s = StyleSheet.create({
  page: { fontFamily: 'Inter', fontSize: 9, color: C.ink, backgroundColor: C.white },

  accentBar: { height: 4, backgroundColor: C.burgundy },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 13, paddingHorizontal: 20 },
  // Logo berwarna yang dipakai Jadwal sudah memuat wordmark "ALHIJAZ — Umroh &
  // Haji Khusus", jadi nama perusahaan tidak ditulis ulang di sebelahnya —
  // cukup satu baris alamat di bawah logo.
  headerLogo: { width: 122, height: 21, objectFit: 'contain' as const, marginBottom: 5 },
  address: { fontSize: 7.5, color: C.gray },
  docBadge: { backgroundColor: C.burgundy, borderRadius: 2, paddingVertical: 3.5, paddingHorizontal: 10, marginBottom: 3 },
  docTitle: { ...b, fontSize: 8, color: C.white, letterSpacing: 0.6 },
  docDate: { fontSize: 7.5, color: C.gray },
  rule: { height: 0.5, backgroundColor: C.line },

  // flexGrow menyerap selisih taksiran tinggi halaman: sisa taksiran jadi latar
  // emas pita ini yang sedikit lebih lega, bukan pita putih di bawah footer.
  kesimpulan: { flexGrow: 1, paddingVertical: 12, paddingHorizontal: 20, backgroundColor: C.goldSoft, borderTopWidth: 0.5, borderTopColor: '#e8d9b0' },
  kesimpulanHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  kesimpulanTick: { width: 3.5, height: 3.5, backgroundColor: C.gold },
  kesimpulanLabel: { ...b, fontSize: 9, letterSpacing: 1.2, color: '#6b4e0c' },
  poin: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 4 },
  poinDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.gold, marginTop: 5 },
  poinTeks: { flex: 1, fontSize: 10, lineHeight: 1.4, color: C.ink },
  poinTebal: { ...b, fontSize: 10, color: C.navy },

  band: { flexDirection: 'row', backgroundColor: C.navy },
  bandCol: { flex: 1, paddingVertical: 13, paddingHorizontal: 16 },
  bandColRight: { borderLeftWidth: 0.5, borderLeftColor: C.navyLine },
  bandTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  bandSisi: { ...b, fontSize: 7.5, letterSpacing: 1.4, color: '#ffffffd6' },
  tierBadge: { paddingVertical: 3, paddingHorizontal: 9, borderRadius: 10, backgroundColor: '#ffffff2e' },
  tierText: { ...b, fontSize: 8, letterSpacing: 0.8, color: C.white },
  bandNama: { ...b, fontSize: 14, color: C.white, lineHeight: 1.25, marginBottom: 7 },
  bandMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 7 },
  bandMaskapai: { ...b, fontSize: 8.5, color: C.white },
  bandDot: { fontSize: 8.5, color: '#ffffff99' },
  bandDurasi: { fontSize: 8.5, color: C.onDark },
  rantai: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  panah: { fontSize: 10, color: '#ffffff80' },
  simpul: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 10, backgroundColor: C.onDarkFill },
  simpulText: { ...b, fontSize: 8, color: C.white },
  simpulIkon: { width: 10, height: 10, objectFit: 'contain' as const },
  landingTanda: { flexDirection: 'row', alignItems: 'center', gap: 3.5, marginTop: 6 },
  landingTeks: { fontSize: 7.5, color: C.onDarkDim },

  seksi: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 20, backgroundColor: C.bgSoft, borderTopWidth: 0.5, borderTopColor: C.line },
  seksiTick: { width: 3, height: 3, backgroundColor: C.gold },
  seksiJudul: { ...b, fontSize: 8.5, letterSpacing: 1.2, color: C.navy },

  row: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: C.line },
  labelCell: { width: LABEL_W, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: C.bgTint },
  labelText: { ...b, fontSize: 8, letterSpacing: 0.6, lineHeight: 1.35, color: C.gray },
  cell: { flex: 1, paddingVertical: 9, paddingHorizontal: 14 },
  cellRight: { borderLeftWidth: 0.5, borderLeftColor: C.line },
  cellLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },

  hargaUtama: { ...b, fontSize: 13, color: C.ink },
  hargaBaris: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 3.5 },
  hargaLabel: { fontSize: 9, color: C.gray },
  hargaNilai: { ...b, fontSize: 11, color: C.ink },
  hargaKosong: { fontSize: 8.5, color: C.grayLight },
  tglUtama: { ...b, fontSize: 11, color: C.ink },
  jam: { fontSize: 9, color: C.gray },
  kode: { ...b, fontSize: 9, color: C.goldInk },
  ruteKota: { ...b, fontSize: 9.5, color: C.ink },
  langsung: { ...b, fontSize: 7.5, color: C.goldInk },
  rute: { fontSize: 7.5, color: C.gray },
  hotelNama: { ...b, fontSize: 10, color: C.ink },
  bintangRow: { flexDirection: 'row', gap: 1 },
  jarak: { fontSize: 8.5, color: C.gray },
  kosong: { fontSize: 10, color: C.grayLight },
  seatAngka: { ...b, fontSize: 14, color: C.ink },
  seatKet: { fontSize: 9, color: C.gray },
  suhuKota: { fontSize: 8.5, color: C.gray },
  suhuNilai: { ...b, fontSize: 9.5, color: C.ink },

  qrRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qrImg: { width: 52, height: 52 },
  qrJudul: { ...b, fontSize: 9, lineHeight: 1.3, color: C.ink, marginBottom: 2 },
  qrUrl: { fontSize: 7.5, lineHeight: 1.3, color: C.gray },

  // Label kecil yang membungkus; satu paragraf bertitik-tengah sepanjang sebelas
  // nama tempat susah dipindai dan patah barisnya tak menentu. Jumlah tempatnya
  // TIDAK ditulis di sel — angkanya disandingkan di pita Kesimpulan.
  destPills: { flexDirection: 'row', flexWrap: 'wrap' as const, gap: 3.5 },
  destPill: { paddingVertical: 2.5, paddingHorizontal: 7, borderRadius: 9, backgroundColor: C.bgTint },
  destPillTeks: { fontSize: 8, color: C.ink },

  footerAccent: { height: 3, backgroundColor: C.burgundy },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 20, backgroundColor: C.navy },
  footerKiri: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  avatar: { width: 32, height: 32, borderRadius: 16, objectFit: 'cover' as const },
  avatarKosong: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#ffffff33' },
  agentNama: { ...b, fontSize: 10.5, color: C.white, marginBottom: 2 },
  agentKontak: { fontSize: 8, color: C.onDark },
  footerKanan: { alignItems: 'flex-end' },
  disclaimer: { fontSize: 7.5, color: C.onDark, marginBottom: 2 },
  sumber: { fontSize: 7.5, color: C.onDarkDim },
});

// ============================================
// Types
// ============================================
export interface ComparePdfSide {
  pkg: UmrohPackage;
  tier: string;
  /** URL itinerary web publik; QR hanya dirender bila ini terisi. */
  itineraryUrl?: string;
  qrDataUrl?: string;
  /** Tempat yang dikunjungi, hasil parsing itinerary. Kosong = baris dilewati. */
  destinasi?: string[];
}

export interface CompareDocumentProps {
  a: ComparePdfSide;
  b: ComparePdfSide;
  agent?: AgentData | null;
  agentPhotoBase64?: string;
}

// ============================================
// Helpers
// ============================================
const ROOMS = ['Quard', 'Triple', 'Double'] as const;

/** Rute sebagai nama kota: "CGK-DXB / DXB-MED" → "Jakarta → Dubai → Madinah". */
function ruteKota(rute: string): string {
  const kode = String(rute || '').split(/[/\-]/).map(x => x.trim()).filter(Boolean);
  const nama = kode.map(airportCityName);
  return nama.filter((n, i) => i === 0 || n !== nama[i - 1]).join(' → ');
}

/** Satu ruas berarti tanpa ganti pesawat. Lebih dari itu TIDAK disebut
 *  "transit": pada paket PLUS, kota di tengah justru tujuan yang diinapi. */
const tanpaTransit = (rute: string) => String(rute || '').split('/').filter(Boolean).length === 1;
// Istilah kamar dalam bahasa sehari-hari. Pembaca dokumen ini calon jamaah,
// bukan staf travel — "Quad/Triple/Double" itu kosakata kantor.
const ROOM_LABEL: Record<string, string> = { Quard: 'Berempat', Triple: 'Bertiga', Double: 'Berdua', Single: 'Sendiri' };
/**
 * Baris harga, urut dari yang paling banyak dipakai. Kamar sendiri hanya dijual
 * di 11 dari 101 kombinasi paket-tier dan harga bayi hampir selalu ada, jadi
 * keduanya dirender hanya bila datanya memang ada — baris "—" kembar cuma
 * memanjangkan dokumen tanpa menambah keterangan.
 */
const BARIS_KAMAR = [
  { key: 'Quard' as const, label: 'Berempat' },
  { key: 'Triple' as const, label: 'Bertiga' },
  { key: 'Double' as const, label: 'Berdua' },
  { key: 'Single' as const, label: 'Sendiri' },
];
const KIBLAT_KOTA: Record<string, string> = { mekkah: 'Masjidil Haram', madinah: 'Masjid Nabawi' };
/** "±400m" → "±400 m"; angka dan satuan yang berdempetan susah dibaca di cetak. */
const renggangkanJarak = (teks: string) =>
  String(teks || '').replace(/(\d)\s*(km|m)\b/gi, '$1 $2');

/**
 * Bintang digambar SVG supaya ukuran dan warnanya lepas dari metrik font —
 * deretan ★ 8pt di dalam baris teks 8.5pt duduknya tidak rata.
 *
 * Inter yang di-embed SENDIRI punya glyph ★ (U+2605), sudah diperiksa dengan
 * fontkit; pita Kesimpulan memakai karakternya langsung. Yang perlu diingat
 * untuk simbol lain: glyph yang tidak ada di font ter-embed hilang diam-diam di
 * react-pdf, jadi periksa dulu sebelum memakai simbol yang tidak umum.
 */
const STAR_PATH = 'M12 2l2.94 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.06-1.01L12 2z';

function Bintang({ jumlah }: { jumlah: number }) {
  if (jumlah <= 0) return null;
  return (
    <View style={s.bintangRow}>
      {Array.from({ length: jumlah }).map((_, i) => (
        <Svg key={i} width={8.5} height={8.5} viewBox="0 0 24 24">
          <Path d={STAR_PATH} fill={C.gold} />
        </Svg>
      ))}
    </View>
  );
}

/**
 * Nama dari hulu sering membawa spasi ganda dan tanda kurung yang renggang —
 * "PLUS TURKEY 15HR ( KERETA  CEPAT)", "AL RITZ AL MADINAH /SETARAF". Di layar
 * tak terlalu terlihat, di PDF cetak jadi mencolok.
 */
const rapikanNama = (teks: string) =>
  String(teks || '')
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/(\S)\(/g, '$1 (')
    .replace(/\s+\)/g, ')')
    .replace(/\s*\/\s*/g, '/')
    .trim();

const rapikanRute = (teks: string) => String(teks || '').replace(/\s+/g, ' ').trim();

const fmtRupiah = (v: number) => 'Rp ' + v.toLocaleString('id-ID');
const fmtTanggal = (d: string) =>
  new Date(d).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
const fmtJam = (t: string) => String(t || '').replace('.', ':');
/**
 * Jam dari hulu kadang cuma penanda kalender — " (+7)" alih-alih jam (pola yang
 * sama dengan kartu penerbangan "Perlu Cek"). Yang bukan jam betulan tidak
 * dicetak: "(+7) WIB" di dokumen resmi lebih buruk daripada tanpa jam.
 */
const jamValid = (t: string) => /^\s*\d{1,2}[.:]\d{2}/.test(String(t || ''));

function durasiHari(pkg: UmrohPackage): number {
  const match = pkg.nama.match(/(\d+)\s*HR\b/i);
  if (match) return parseInt(match[1], 10);
  const dep = new Date(pkg.keberangkatan.tgl);
  const ret = new Date(pkg.kepulangan.tgl);
  return Math.round((ret.getTime() - dep.getTime()) / 86400000) + 1;
}

function hotelDiKota(pkg: UmrohPackage, tier: string, cityKey: string) {
  const info = tierHotelInfo(pkg, tier);
  const nama = info?.[`${cityKey}_hotel`] || '';
  if (!nama) return null;
  return {
    nama,
    stars: hotelStars(nama, info?.[`${cityKey}_bintang`]),
    jarak: hotelDistance(nama, info?.[`${cityKey}_jarak`]),
  };
}

/** Sisi untuk compareVerdict — bintang & jarak sudah diresolusi di sini. */
function verdictSide(side: ComparePdfSide) {
  const prices: Record<string, number> = {};
  for (const room of ROOMS) prices[room] = tierRoomPrice(side.pkg, side.tier, room);
  const mekkah = hotelDiKota(side.pkg, side.tier, 'mekkah');
  const madinah = hotelDiKota(side.pkg, side.tier, 'madinah');
  return {
    prices,
    hotels: {
      mekkah: mekkah ? { stars: mekkah.stars, distance: mekkah.jarak } : undefined,
      madinah: madinah ? { stars: madinah.stars, distance: madinah.jarak } : undefined,
    },
    seatSisa: side.pkg.seatSisa,
  };
}

/**
 * Kota untuk suhu diambil dari GABUNGAN semua tier: satu itinerary berlaku untuk
 * seluruh tier paket, jadi jamaah tier hemat tetap ke Cairo walau hotel Cairo-nya
 * hanya terdaftar di tier lain. Lihat packageTiers.js.
 */
function kotaSuhu(pkg: UmrohPackage) {
  const cities = packageCityHotels(pkg);
  const bulan = new Date(pkg.keberangkatan.tgl).getMonth() + 1;
  return COMPARE_CITIES
    .filter(c => c.always || cities[`${c.key}_hotel`])
    .map(c => ({ label: c.label, temp: getTemperature(c.key, bulan) }))
    .filter((c): c is { label: string; temp: NonNullable<ReturnType<typeof getTemperature>> } => Boolean(c.temp));
}

function rantaiPerjalanan(pkg: UmrohPackage) {
  const cities = packageCityHotels(pkg);
  const extra = COMPARE_CITIES.filter(c => !c.always && cities[`${c.key}_hotel`]).map(c => c.key);
  const steps = getPackageJourneySteps(pkg, extra);
  return {
    steps,
    landingIndex: getLandingStepIndex(steps),
    landingCity: getLandingCityName(pkg),
  };
}

/**
 * react-pdf hanya bisa memasang PNG/JPG lewat <Image>; `/flags/palestine.svg`
 * akan gagal diam-diam, jadi simpul tanpa gambar yang layak tampil tanpa ikon.
 */
const ikonBisaDipakai = (src: string) => /\.(png|jpe?g)$/i.test(src || '');

/** Pesawat mendarat, penanda kota tempat rombongan turun dari penerbangan. */
const PLANE_PATH = 'M2.5 19h19v2h-19v-2zm19.57-9.36c-.21-.8-1.04-1.27-1.84-1.06L14.92 10l-6.9-6.43-1.93.51 4.14 7.17-4.97 1.33-1.97-1.54-1.45.39 2.59 4.49L21.01 11.5c.81-.23 1.28-1.05 1.06-1.86z';

function Landing({ kota }: { kota: string }) {
  if (!kota) return null;
  return (
    <View style={s.landingTanda}>
      <Svg width={7.5} height={7.5} viewBox="0 0 24 24">
        <Path d={PLANE_PATH} fill={C.onDarkSolid} />
      </Svg>
      <Text style={s.landingTeks}>Mendarat di {kota}</Text>
    </View>
  );
}

const SISI_LABEL: Record<'a' | 'b', string> = { a: 'PAKET A', b: 'PAKET B' };

/**
 * Poin kesimpulan. Sengaja NETRAL: menyandingkan angka kedua paket, tanpa kata
 * "lebih baik" atau "lebih hemat". Yang termurah atau terdekat belum tentu yang
 * paling cocok — pilihan itu milik jamaah dan agentnya, dokumen ini cukup
 * menaruh angkanya berdampingan supaya mudah ditimbang.
 *
 * Verdict tetap dipakai, tapi hanya untuk menentukan APA yang layak disebut:
 * baris yang datanya tak lengkap atau tak berbeda tidak ikut dicetak.
 */
function poinKesimpulan(verdict: CompareVerdict, a: ComparePdfSide, b: ComparePdfSide) {
  const poin: { tebal: string; sisa: string }[] = [];

  if (verdict.gap) {
    const kamar = ROOM_LABEL[verdict.gap.room].toLowerCase();
    const hargaA = tierRoomPrice(a.pkg, a.tier, verdict.gap.room);
    const hargaB = tierRoomPrice(b.pkg, b.tier, verdict.gap.room);
    const selisih = verdict.gap.diff > 0 ? ` Selisihnya ${fmtRupiah(verdict.gap.diff)}.` : ' Harganya sama.';
    poin.push({
      tebal: `Harga kamar ${kamar}`,
      sisa: `— Paket A ${fmtRupiah(hargaA)}, Paket B ${fmtRupiah(hargaB)}.${selisih}`,
    });
  }

  if (verdict.hotel) {
    // "±400m" jadi "sekitar 400 m" — pita ini bagian yang paling sering dibaca
    // jamaah sendiri, jadi lambangnya dieja.
    const ringkas = (side: ComparePdfSide, kota: string) => {
      const h = hotelDiKota(side.pkg, side.tier, kota);
      if (!h) return '';
      const jarak = renggangkanJarak(h.jarak).replace(/^±\s*/, 'sekitar ');
      const bintang = h.stars > 0 ? `${h.stars} bintang` : '';
      if (bintang && jarak) return `${bintang} (${jarak})`;
      return bintang || jarak;
    };
    const rincian = (['mekkah', 'madinah'] as const)
      .map(kota => {
        const kiri = ringkas(a, kota);
        const kanan = ringkas(b, kota);
        if (!kiri || !kanan || kiri === kanan) return '';
        const nama = kota === 'mekkah' ? 'Mekkah' : 'Madinah';
        // Titik dua, bukan tanda pisah kedua: "Hotel — Mekkah — Paket A ..."
        // membuat dua tanda pisah beruntun dalam satu kalimat.
        return `${nama}: Paket A ${kiri}, Paket B ${kanan}`;
      })
      .filter(Boolean);
    if (rincian.length) {
      poin.push({ tebal: 'Hotel', sisa: `— ${rincian.join('. ')}.` });
    }
  }

  // Angka destinasi disandingkan hanya bila KEDUA itinerary terbaca — "12
  // berbanding —" menyiratkan paket satunya tak ke mana-mana, padahal mungkin
  // sekadar belum ter-cache.
  const destinasiA = a.destinasi?.length || 0;
  const destinasiB = b.destinasi?.length || 0;
  if (destinasiA > 0 && destinasiB > 0) {
    poin.push({
      tebal: 'Tempat yang dikunjungi',
      sisa: `— Paket A ${destinasiA} tempat, Paket B ${destinasiB} tempat.`,
    });
  }

  if (verdict.seat) {
    poin.push({
      tebal: 'Sisa seat',
      sisa: `— Paket A ${verdict.seat.a} dari ${a.pkg.seatTotal}, Paket B ${verdict.seat.b} dari ${b.pkg.seatTotal}.`,
    });
  }

  const hariA = durasiHari(a.pkg);
  const hariB = durasiHari(b.pkg);
  if (hariA !== hariB) {
    poin.push({
      tebal: 'Lama perjalanan',
      sisa: `— Paket A ${hariA} hari, Paket B ${hariB} hari.`,
    });
  }

  if (!poin.length) {
    poin.push({
      tebal: 'Kedua paket sebanding',
      sisa: '— harga, hotel, dan sisa seat-nya tidak berbeda berarti.',
    });
  }
  return poin;
}

// ============================================
// Document
// ============================================
export function CompareDocument({ a, b, agent, agentPhotoBase64 }: CompareDocumentProps) {
  const sides = [a, b];
  const verdict = buildCompareVerdict(verdictSide(a), verdictSide(b));
  const poin = poinKesimpulan(verdict, a, b);
  const rantai = sides.map(side => rantaiPerjalanan(side.pkg));

  const kotaHotel = COMPARE_CITIES.filter(
    c => hotelDiKota(a.pkg, a.tier, c.key) || hotelDiKota(b.pkg, b.tier, c.key),
  );
  const suhu = sides.map(side => kotaSuhu(side.pkg));
  const adaQr = sides.some(side => side.qrDataUrl);
  const adaDestinasi = sides.some(side => side.destinasi?.length);
  // Lima baris terpisah untuk lima tipe kamar bikin seksi harga terasa penuh.
  // Kamar dirangkum jadi satu baris berisi daftar; bayi berdiri sendiri karena
  // itu harga per anak, bukan pilihan kamar.
  const barisKamar = BARIS_KAMAR.filter(
    baris => tierRoomPrice(a.pkg, a.tier, baris.key) > 0 || tierRoomPrice(b.pkg, b.tier, baris.key) > 0,
  );
  const adaBayi = tierRoomPrice(a.pkg, a.tier, 'Infant') > 0 || tierRoomPrice(b.pkg, b.tier, 'Infant') > 0;

  // ── Tinggi halaman ──
  // react-pdf tidak bisa mengukur sebelum merender, jadi tingginya ditaksir per
  // blok — angkanya dikalibrasi dari render nyata JBU1569 vs JBU1491. Taksiran
  // yang KURANG membuat dokumen tumpah ke halaman kedua, jadi bagian yang bisa
  // membungkus (nama paket, nama hotel) selalu dibulatkan ke atas dan ada sisa
  // aman di akhir. Kelebihan sedikit cuma jadi pita putih tipis di bawah.
  const perkiraanBaris = (teks: string, charPerBaris: number) =>
    Math.max(1, Math.ceil((teks || '').length / charPerBaris));
  const barisNama = Math.max(
    perkiraanBaris(a.pkg.nama, 28),
    perkiraanBaris(b.pkg.nama, 28),
  );
  const barisHotel = kotaHotel.reduce((total, kota) => {
    const namaA = hotelDiKota(a.pkg, a.tier, kota.key)?.nama || '';
    const namaB = hotelDiKota(b.pkg, b.tier, kota.key)?.nama || '';
    return total + Math.max(perkiraanBaris(namaA, 36), perkiraanBaris(namaB, 36));
  }, 0);
  const maxKotaSuhu = Math.max(suhu[0].length, suhu[1].length, 1);

  let h = 4 + 64 + 1;                       // accent + header (logo di atas alamat) + rule
  const barisPoin = poin.reduce(
    (total, p) => total + perkiraanBaris(`${p.tebal}  ${p.sisa}`, 70),
    0,
  );
  h += 26 + 14 + poin.length * 4 + Math.ceil(barisPoin * 14); // pita kesimpulan (font 10)
  h += 88 + 18 * barisNama + 15;            // pita paket + penanda landing
  h += 23 + (20 + barisKamar.length * 17) + (adaBayi ? 40 : 0); // seksi + daftar kamar + bayi
  h += 23 + 2 * 48 + 2 * 44;                // seksi penerbangan + 2×(tanggal/jam) + 2×(rute)
  h += 23 + kotaHotel.length * 33 + (barisHotel - kotaHotel.length) * 14;
  h += 23 + 41 + 46;                        // seksi ketersediaan: seat + manasik
  h += 18 + Math.ceil(maxKotaSuhu * 13.5);  // baris suhu
  if (adaDestinasi) {
    // Lebar pil ditaksir dari jumlah huruf + padding 14 + jarak 3,5; sel
    // selebar ~218pt. 5.4pt/huruf pada font 8 — nama tempat ditulis Kapital
    // Setiap Kata, jadi jauh lebih lebar daripada rata-rata teks biasa.
    const barisPil = Math.max(...sides.map(side => {
      const lebar = (side.destinasi || []).reduce((t, nama) => t + nama.length * 5.4 + 17.5, 0);
      return Math.max(1, Math.ceil(lebar / 218));
    }));
    h += 23 + 18 + barisPil * 18;           // seksi + baris pil (tanpa baris jumlah)
  }
  if (adaQr) h += 74;                       // baris itinerary
  h += 3 + 56;                              // aksen + footer
  // Sisa aman 56pt. Taksiran yang KURANG membuat dokumen tumpah ke halaman
  // kedua — sudah terbukti dua kali (sisa 8pt, lalu 24pt setelah baris pil
  // destinasi masuk). Kelebihan puluhan pt cuma pita putih tipis di bawah, jauh
  // lebih murah daripada halaman kedua yang isinya beberapa baris.
  h += 56;
  const pageH = Math.max(420, h);

  const namaAgent = agent?.name || '';
  const teleponAgent = (() => {
    if (!agent?.phone) return '';
    const digits = agent.phone.replace(/\D/g, '');
    const lokal = digits.startsWith('62') ? '0' + digits.slice(2) : digits;
    return lokal.replace(/(\d{4})(\d{4})(\d+)/, '$1-$2-$3');
  })();
  const hariIni = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  // Tabel sengaja tak menandai pemenang: lebih murah atau lebih dekat belum
  // tentu yang paling cocok buat jamaah. Penilaian tinggal di pita Kesimpulan,
  // tabel cukup menyajikan angkanya apa adanya.
  const Sel = ({ children, kanan }: { children: ReactNode; kanan?: boolean }) => (
    <View style={[s.cell, kanan ? s.cellRight : {}]}>{children}</View>
  );

  const Baris = ({ label, children }: { label: string; children: ReactNode }) => (
    <View style={s.row}>
      <View style={s.labelCell}><Text style={s.labelText}>{label}</Text></View>
      {children}
    </View>
  );

  const Seksi = ({ judul }: { judul: string }) => (
    <View style={s.seksi}>
      <View style={s.seksiTick} />
      <Text style={s.seksiJudul}>{judul}</Text>
    </View>
  );

  return (
    <Document>
      <Page size={{ width: A4W, height: pageH }} style={s.page}>
        {/* ─── HEADER ─── */}
        <View style={s.accentBar} />
        <View style={s.header}>
          <View>
            <Image style={s.headerLogo} src={`${origin}/new-logo-alhijaz-colored.png`} />
            <Text style={s.address}>PT Alhijaz Indowisata — Graha Alhijaz, Jl. Dewi Sartika No. 239A, Cawang, Jakarta Timur</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={s.docBadge}><Text style={s.docTitle}>PERBANDINGAN PAKET</Text></View>
            <Text style={s.docDate}>Dibuat {hariIni}</Text>
          </View>
        </View>
        <View style={s.rule} />

        {/* ─── PITA PAKET ─── */}
        <View style={s.band}>
          {sides.map((side, i) => (
            <View key={i} style={[s.bandCol, i === 1 ? s.bandColRight : {}]}>
              <View style={s.bandTop}>
                <Text style={s.bandSisi}>{SISI_LABEL[i === 0 ? 'a' : 'b']}</Text>
                {Boolean(side.tier) && (
                  <View style={s.tierBadge}><Text style={s.tierText}>{side.tier}</Text></View>
                )}
              </View>
              <Text style={s.bandNama}>{rapikanNama(side.pkg.nama)}</Text>
              <View style={s.bandMeta}>
                <Text style={s.bandMaskapai}>{side.pkg.maskapai}</Text>
                <Text style={s.bandDot}>•</Text>
                <Text style={s.bandDurasi}>{durasiHari(side.pkg)} HARI</Text>
              </View>
              <View style={s.rantai}>
                {rantai[i].steps.flatMap((step, k) => [
                  ...(k > 0 ? [<Text key={`panah-${k}`} style={s.panah}>›</Text>] : []),
                  <View key={`simpul-${k}`} style={s.simpul}>
                    {ikonBisaDipakai(step.imageSrc) && (
                      <Image style={s.simpulIkon} src={`${origin}${step.imageSrc}`} />
                    )}
                    <Text style={s.simpulText}>{step.label}</Text>
                  </View>,
                ])}
              </View>
              <Landing kota={rantai[i].landingCity} />
            </View>
          ))}
        </View>

        {/* ─── HARGA ─── */}
        <Seksi judul="HARGA PER JAMAAH" />
        <Baris label="PILIHAN KAMAR">
          {sides.map((side, i) => (
            <Sel key={i} kanan={i === 1}>
              {barisKamar.map(baris => {
                const nilai = tierRoomPrice(side.pkg, side.tier, baris.key);
                return (
                  <View key={baris.key} style={s.hargaBaris}>
                    <Text style={s.hargaLabel}>{baris.label}</Text>
                    <Text style={nilai > 0 ? s.hargaNilai : s.hargaKosong}>
                      {nilai > 0 ? fmtRupiah(nilai) : 'tidak dijual'}
                    </Text>
                  </View>
                );
              })}
            </Sel>
          ))}
        </Baris>
        {adaBayi && (
          <Baris label="BAYI (0–2 TH)">
            {sides.map((side, i) => {
              const nilai = tierRoomPrice(side.pkg, side.tier, 'Infant');
              return (
                <Sel key={i} kanan={i === 1}>
                  <Text style={s.hargaUtama}>{nilai > 0 ? fmtRupiah(nilai) : '—'}</Text>
                </Sel>
              );
            })}
          </Baris>
        )}

        {/* ─── PENERBANGAN ─── */}
        {/* Tiap arah dipecah dua baris — tanggal/jam lalu rutenya — supaya satu
            sel tidak menumpuk empat lapis keterangan. */}
        <Seksi judul="PENERBANGAN" />
        {([
          { label: 'BERANGKAT', ruteLabel: 'RUTE PERGI', ambil: (p: UmrohPackage) => p.keberangkatan },
          { label: 'PULANG', ruteLabel: 'RUTE PULANG', ambil: (p: UmrohPackage) => p.kepulangan },
        ]).map(baris => (
          <Fragment key={baris.label}>
            <Baris label={baris.label}>
              {sides.map((side, i) => {
                const f = baris.ambil(side.pkg);
                return (
                  <Sel key={i} kanan={i === 1}>
                    <Text style={s.tglUtama}>{fmtTanggal(f.tgl)}</Text>
                    <View style={s.cellLine}>
                      {jamValid(f.jam) && <Text style={s.jam}>{fmtJam(f.jam)} WIB</Text>}
                      <Text style={s.kode}>{f.kodePenerbangan}</Text>
                    </View>
                  </Sel>
                );
              })}
            </Baris>
            <Baris label={baris.ruteLabel}>
              {sides.map((side, i) => {
                const f = baris.ambil(side.pkg);
                return (
                  <Sel key={i} kanan={i === 1}>
                    <View style={s.cellLine}>
                      <Text style={s.ruteKota}>{ruteKota(f.rute)}</Text>
                      {tanpaTransit(f.rute) && <Text style={s.langsung}>langsung</Text>}
                    </View>
                    <Text style={s.rute}>{rapikanRute(f.rute)}</Text>
                  </Sel>
                );
              })}
            </Baris>
          </Fragment>
        ))}

        {/* ─── HOTEL ─── */}
        {kotaHotel.length > 0 && <Seksi judul="HOTEL" />}
        {kotaHotel.map(kota => {
          const hA = hotelDiKota(a.pkg, a.tier, kota.key);
          const hB = hotelDiKota(b.pkg, b.tier, kota.key);
          return (
            <Baris key={kota.key} label={kota.label.toUpperCase()}>
              {[hA, hB].map((hotel, i) => (
                <Sel key={i} kanan={i === 1}>
                  {hotel ? (
                    <>
                      <Text style={s.hotelNama}>{rapikanNama(hotel.nama)}</Text>
                      <View style={s.cellLine}>
                        <Bintang jumlah={hotel.stars} />
                        {Boolean(hotel.jarak) && (
                          <Text style={s.jarak}>
                            {renggangkanJarak(hotel.jarak)}{KIBLAT_KOTA[kota.key] ? ` ke ${KIBLAT_KOTA[kota.key]}` : ''}
                          </Text>
                        )}
                      </View>
                    </>
                  ) : (
                    <Text style={s.kosong}>—</Text>
                  )}
                </Sel>
              ))}
            </Baris>
          );
        })}

        {/* ─── TEMPAT YANG DIKUNJUNGI ─── */}
        {adaDestinasi && (
          <>
            <Seksi judul="TEMPAT YANG DIKUNJUNGI" />
            <Baris label="ZIARAH & WISATA">
              {sides.map((side, i) => (
                <Sel key={i} kanan={i === 1}>
                  {side.destinasi?.length ? (
                    <View style={s.destPills}>
                      {side.destinasi.map((nama, k) => (
                        <View key={k} style={s.destPill}>
                          <Text style={s.destPillTeks}>{nama}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={s.kosong}>—</Text>
                  )}
                </Sel>
              ))}
            </Baris>
          </>
        )}

        {/* ─── KETERSEDIAAN & PERSIAPAN ─── */}
        <Seksi judul="SISA SEAT & MANASIK" />
        <Baris label="SISA SEAT">
          {sides.map((side, i) => (
            <Sel key={i} kanan={i === 1}>
              <View style={s.cellLine}>
                <Text style={s.seatAngka}>{side.pkg.seatSisa}</Text>
                <Text style={s.seatKet}>dari {side.pkg.seatTotal} seat</Text>
              </View>
            </Sel>
          ))}
        </Baris>
        <Baris label="MANASIK">
          {sides.map((side, i) => (
            <Sel key={i} kanan={i === 1}>
              {side.pkg.manasikTanggal ? (
                <>
                  <Text style={s.tglUtama}>{fmtTanggal(side.pkg.manasikTanggal)}</Text>
                  {Boolean(side.pkg.manasikJam) && (
                    <Text style={s.jam}>{side.pkg.manasikJam.slice(0, 5)} WIB</Text>
                  )}
                </>
              ) : (
                <Text style={s.kosong}>—</Text>
              )}
            </Sel>
          ))}
        </Baris>
        <Baris label="PERKIRAAN SUHU">
          {suhu.map((kotaList, i) => (
            <Sel key={i} kanan={i === 1}>
              {kotaList.length > 0 ? kotaList.map(kota => (
                <View key={kota.label} style={s.cellLine}>
                  <Text style={s.suhuKota}>{kota.label}</Text>
                  <Text style={s.suhuNilai}>{kota.temp.low}–{kota.temp.high}°C</Text>
                </View>
              )) : <Text style={s.kosong}>—</Text>}
            </Sel>
          ))}
        </Baris>

        {/* ─── ITINERARY ─── */}
        {adaQr && (
          <Baris label="JADWAL HARIAN">
            {sides.map((side, i) => (
              <Sel key={i} kanan={i === 1}>
                {side.qrDataUrl ? (
                  <View style={s.qrRow}>
                    <Image style={s.qrImg} src={side.qrDataUrl} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.qrJudul}>Scan untuk lihat jadwal harian</Text>
                      <Text style={s.qrUrl}>{side.itineraryUrl}</Text>
                    </View>
                  </View>
                ) : (
                  <Text style={s.kosong}>—</Text>
                )}
              </Sel>
            ))}
          </Baris>
        )}

        {/* ─── KESIMPULAN ─── */}
        <View style={s.kesimpulan}>
          <View style={s.kesimpulanHead}>
            <View style={s.kesimpulanTick} />
            <Text style={s.kesimpulanLabel}>KESIMPULAN</Text>
          </View>
          {poin.map((p, i) => (
            <View key={i} style={s.poin}>
              <View style={s.poinDot} />
              <Text style={s.poinTeks}>
                <Text style={s.poinTebal}>{p.tebal}</Text>
                {'  '}{p.sisa}
              </Text>
            </View>
          ))}
        </View>

        {/* ─── FOOTER ─── */}
        <View style={s.footerAccent} />
        <View style={s.footer}>
          <View style={s.footerKiri}>
            {agentPhotoBase64
              ? <Image style={s.avatar} src={agentPhotoBase64} />
              : <View style={s.avatarKosong} />}
            <View>
              <Text style={s.agentNama}>{namaAgent || 'Alhijaz Indowisata'}</Text>
              <Text style={s.agentKontak}>
                {[teleponAgent, agent?.website].filter(Boolean).join('  ·  ') || 'alhijazindonesia.com'}
              </Text>
            </View>
          </View>
          <View style={s.footerKanan}>
            <Text style={s.disclaimer}>Harga & ketersediaan dapat berubah sewaktu-waktu.</Text>
            <Text style={s.sumber}>Data per {hariIni}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

// ============================================
// Generator
// ============================================

/**
 * Foto agent harus lewat canvas → PNG: react-pdf tidak bisa membaca progressive
 * JPEG, dan foto agent dari Bunny sering progressive. Alasan yang sama dengan
 * generateQuotationPdfBlob.
 */
async function fotoAgentPng(url?: string): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    return await new Promise<string>((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = url;
    });
  } catch (e) {
    console.warn('Gagal memuat foto agent untuk PDF:', e);
    return undefined;
  }
}

/** Momen di bandara, bukan tempat wisata — disaring dari daftar destinasi. */
const FOTO_MOMEN = new Set(['keberangkatan-di-bandara.png', 'kepulangan-di-bandara.png']);

/**
 * Tempat yang dikunjungi, dari itinerary yang SUDAH ter-cache di server.
 * `pdfUrl` sengaja tidak dikirim: tanpa itu endpoint hanya membaca cache, jadi
 * pembuatan PDF tak pernah menunggu parsing PDF dari origin yang kronis lambat.
 * Gagal atau belum ter-cache berarti barisnya dilewati, bukan menahan dokumen.
 */
async function ambilDestinasi(jadwalId: string): Promise<string[] | undefined> {
  const batal = new AbortController();
  const jam = setTimeout(() => batal.abort(), 6000);
  try {
    const resp = await fetch(`/api/itinerary/${encodeURIComponent(jadwalId)}`, { signal: batal.signal });
    if (!resp.ok) return undefined;
    const json = await resp.json();
    const days = json?.data?.days;
    if (!Array.isArray(days) || !days.length) return undefined;
    const nama = destinationPhotosForDays(days)
      .flat()
      .filter((foto): foto is { file: string; label: string } => Boolean(foto) && !FOTO_MOMEN.has(foto!.file))
      .map(foto => foto.label);
    return nama.length ? nama : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(jam);
  }
}

async function qrPng(url?: string): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    return await QRCode.toDataURL(url, { scale: 8, margin: 1, errorCorrectionLevel: 'M' });
  } catch (e) {
    console.warn('Gagal membuat QR itinerary:', e);
    return undefined;
  }
}

export async function generateComparePdfBlob({
  a,
  b,
  agent,
}: {
  a: ComparePdfSide;
  b: ComparePdfSide;
  agent?: AgentData | null;
}): Promise<Blob> {
  const [agentPhotoBase64, qrA, qrB, destA, destB] = await Promise.all([
    fotoAgentPng(agent?.photo),
    qrPng(a.itineraryUrl),
    qrPng(b.itineraryUrl),
    ambilDestinasi(a.pkg.jadwalId),
    ambilDestinasi(b.pkg.jadwalId),
  ]);
  return pdf(
    <CompareDocument
      a={{ ...a, qrDataUrl: qrA, destinasi: a.destinasi ?? destA }}
      b={{ ...b, qrDataUrl: qrB, destinasi: b.destinasi ?? destB }}
      agent={agent}
      agentPhotoBase64={agentPhotoBase64}
    />
  ).toBlob();
}

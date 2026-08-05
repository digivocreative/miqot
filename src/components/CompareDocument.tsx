import type { ReactNode } from 'react';
import { Document, Page, View, Text, Image, StyleSheet, Font, Svg, Path, pdf } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import type { UmrohPackage } from '@/types';
import type { AgentData } from '@/data/agents';
import { tierRoomPrice, tierHotelInfo, packageCityHotels } from '@/lib/packageTiers';
import { buildCompareVerdict } from '@/lib/compareVerdict';
import type { CompareVerdict } from '@/lib/compareVerdict';
import { hotelStars, hotelDistance, COMPARE_CITIES } from '@/utils/hotelDisplay';
import { getPackageJourneySteps } from '@/utils/journey';
import { getTemperature } from '@/data/temperatureData';

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
const C = {
  burgundy: '#b40200',
  navy: '#1f2937',
  navySoft: '#374151',
  gold: '#c18f1f',
  goldSoft: '#fbf3e2',
  ink: '#1f2937',
  gray: '#6b7280',
  grayLight: '#9ca3af',
  line: '#e5e7eb',
  bgSoft: '#f8fafc',
  bgTint: '#f3f4f6',
  white: '#ffffff',
  onDark: '#ffffffcc',
  onDarkDim: '#ffffff99',
  onDarkFaint: '#ffffff3d',
  onDarkFill: '#ffffff1f',
};

const A4W = 595.28;
const LABEL_W = 96;

const b = { fontFamily: 'Inter', fontWeight: 'bold' as const };

const s = StyleSheet.create({
  page: { fontFamily: 'Inter', fontSize: 8, color: C.ink, backgroundColor: C.white },

  accentBar: { height: 4, backgroundColor: C.burgundy },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 13, paddingHorizontal: 20 },
  headerKiri: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  headerLogo: { width: 30, height: 30, borderRadius: 5 },
  company: { ...b, fontSize: 12, color: C.burgundy, marginBottom: 2 },
  address: { fontSize: 6.5, color: C.gray },
  docBadge: { backgroundColor: C.burgundy, borderRadius: 2, paddingVertical: 3, paddingHorizontal: 9, marginBottom: 3 },
  docTitle: { ...b, fontSize: 7, color: C.white, letterSpacing: 0.6 },
  docDate: { fontSize: 6.5, color: C.grayLight },
  rule: { height: 0.5, backgroundColor: C.line },

  kesimpulan: { paddingVertical: 11, paddingHorizontal: 20, backgroundColor: C.goldSoft },
  kesimpulanHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  kesimpulanTick: { width: 3, height: 3, backgroundColor: C.gold },
  kesimpulanLabel: { ...b, fontSize: 7, letterSpacing: 1.2, color: C.gold },
  poin: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 3 },
  poinDot: { width: 2.5, height: 2.5, borderRadius: 1.25, backgroundColor: C.burgundy, marginTop: 4 },
  poinTeks: { flex: 1, fontSize: 8, lineHeight: 1.4, color: C.gray },
  poinTebal: { ...b, fontSize: 8, color: C.ink },

  band: { flexDirection: 'row', backgroundColor: C.navySoft },
  bandCol: { flex: 1, paddingVertical: 12, paddingHorizontal: 16 },
  bandColRight: { borderLeftWidth: 0.5, borderLeftColor: C.onDarkFaint },
  bandTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  bandSisi: { ...b, fontSize: 6.5, letterSpacing: 1.4, color: '#ffffffaa' },
  tierBadge: { paddingVertical: 2.5, paddingHorizontal: 8, borderRadius: 9, backgroundColor: '#ffffff2e' },
  tierText: { ...b, fontSize: 7, letterSpacing: 0.8, color: C.white },
  bandNama: { ...b, fontSize: 13, color: C.white, lineHeight: 1.25, marginBottom: 6 },
  bandMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  bandMaskapai: { ...b, fontSize: 7.5, color: C.white },
  bandDot: { fontSize: 7.5, color: '#ffffff80' },
  bandDurasi: { fontSize: 7.5, color: C.onDark },
  rantai: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  panah: { fontSize: 9, color: '#ffffff66' },
  simpul: { paddingVertical: 2.5, paddingHorizontal: 7, borderRadius: 9, backgroundColor: C.onDarkFill },
  simpulText: { ...b, fontSize: 7, color: C.white },

  seksi: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 20, backgroundColor: C.bgSoft, borderTopWidth: 0.5, borderTopColor: C.line },
  seksiTick: { width: 2.5, height: 2.5, backgroundColor: C.gold },
  seksiJudul: { ...b, fontSize: 7, letterSpacing: 1.2, color: C.navy },

  row: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: C.line },
  labelCell: { width: LABEL_W, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: C.bgTint },
  labelText: { ...b, fontSize: 6.8, letterSpacing: 0.8, lineHeight: 1.35, color: C.gray },
  cell: { flex: 1, paddingVertical: 8, paddingHorizontal: 14 },
  cellRight: { borderLeftWidth: 0.5, borderLeftColor: C.line },
  cellWin: { backgroundColor: C.goldSoft },
  cellLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2.5 },

  hargaUtama: { ...b, fontSize: 12, color: C.ink },
  hargaMenang: { ...b, fontSize: 12, color: C.burgundy },
  hemat: { ...b, fontSize: 7, color: C.gold },
  tglUtama: { ...b, fontSize: 9.5, color: C.ink },
  jam: { fontSize: 7.5, color: C.gray },
  kode: { ...b, fontSize: 7.5, color: C.gold },
  rute: { fontSize: 7, color: C.grayLight },
  hotelNama: { ...b, fontSize: 8.5, color: C.ink },
  bintangRow: { flexDirection: 'row', gap: 1 },
  jarak: { fontSize: 7, color: C.gray },
  kosong: { fontSize: 9, color: C.grayLight },
  seatAngka: { ...b, fontSize: 13, color: C.ink },
  seatAngkaMenang: { ...b, fontSize: 13, color: C.burgundy },
  seatKet: { fontSize: 7.5, color: C.gray },
  suhuKota: { fontSize: 7, color: C.gray },
  suhuNilai: { ...b, fontSize: 8, color: C.ink },

  qrRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qrImg: { width: 46, height: 46 },
  qrJudul: { ...b, fontSize: 7.5, lineHeight: 1.3, color: C.ink, marginBottom: 2 },
  qrUrl: { fontSize: 6.5, lineHeight: 1.3, color: C.grayLight },

  footerAccent: { height: 3, backgroundColor: C.burgundy },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 20, backgroundColor: C.navy },
  footerKiri: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  avatar: { width: 30, height: 30, borderRadius: 15, objectFit: 'cover' as const },
  avatarKosong: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#ffffff33' },
  agentNama: { ...b, fontSize: 9.5, color: C.white, marginBottom: 1.5 },
  agentKontak: { fontSize: 7, color: C.onDark },
  footerKanan: { alignItems: 'flex-end' },
  disclaimer: { fontSize: 6.5, color: C.onDark, marginBottom: 1.5 },
  sumber: { fontSize: 6.5, color: C.onDarkDim },
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
const ROOM_LABEL: Record<string, string> = { Quard: 'Quad', Triple: 'Triple', Double: 'Double' };

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
        <Svg key={i} width={7.5} height={7.5} viewBox="0 0 24 24">
          <Path d={STAR_PATH} fill={C.gold} />
        </Svg>
      ))}
    </View>
  );
}

const fmtRupiah = (v: number) => 'Rp ' + v.toLocaleString('id-ID');
const fmtTanggal = (d: string) =>
  new Date(d).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
const fmtJam = (t: string) => String(t || '').replace('.', ':');

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

function rantaiPerjalanan(pkg: UmrohPackage): string[] {
  const cities = packageCityHotels(pkg);
  const extra = COMPARE_CITIES.filter(c => !c.always && cities[`${c.key}_hotel`]).map(c => c.key);
  return getPackageJourneySteps(pkg, extra).map(step => step.label);
}

const SISI_LABEL: Record<'a' | 'b', string> = { a: 'PAKET A', b: 'PAKET B' };

/**
 * Tiga poin kesimpulan, dirakit dari verdict. Poin yang verdict-nya `null`
 * DILEWATI, bukan ditulis "seimbang": pita ini kalimat berita, dan kalimat yang
 * tak punya dasar lebih baik tidak dicetak sama sekali.
 */
function poinKesimpulan(verdict: CompareVerdict, a: ComparePdfSide, b: ComparePdfSide) {
  const poin: { tebal: string; sisa: string }[] = [];
  const pkg = { a: a.pkg, b: b.pkg };

  if (verdict.gap && verdict.gap.diff > 0 && verdict.gap.cheaper) {
    const sisi = verdict.gap.cheaper;
    const hariIni = durasiHari(pkg[sisi]);
    const hariLain = durasiHari(pkg[sisi === 'a' ? 'b' : 'a']);
    const bedaHari = hariIni - hariLain;
    const ekor = bedaHari > 0
      ? `, dan ${bedaHari} hari lebih lama`
      : bedaHari < 0 ? `, tapi ${-bedaHari} hari lebih singkat` : '';
    poin.push({
      tebal: `${SISI_LABEL[sisi]} lebih hemat`,
      sisa: `${fmtRupiah(verdict.gap.diff)} per jamaah (kamar ${ROOM_LABEL[verdict.gap.room]})${ekor}.`,
    });
  } else if (verdict.gap) {
    // `price` masih terisi berarti ada tipe kamar LAIN yang berbeda. Kalau null,
    // tak ada satu pun tipe yang berselisih — jangan menjanjikan selisih yang
    // tidak ada di halaman yang sama.
    poin.push({
      tebal: `Harga kamar ${ROOM_LABEL[verdict.gap.room]} sama`,
      sisa: verdict.price
        ? 'selisihnya ada di tipe kamar lain, bukan di harga dasar.'
        : `${fmtRupiah(tierRoomPrice(a.pkg, a.tier, verdict.gap.room))} per jamaah di kedua paket.`,
    });
  }

  if (verdict.hotel) {
    const sisi = verdict.hotel.side;
    const lawan = sisi === 'a' ? 'b' : 'a';
    const banding = (kota: string) => {
      const menang = hotelDiKota(pkg[sisi], sisi === 'a' ? a.tier : b.tier, kota);
      const kalah = hotelDiKota(pkg[lawan], lawan === 'a' ? a.tier : b.tier, kota);
      if (!menang || !kalah) return '';
      const ringkas = (h: NonNullable<typeof menang>) =>
        [h.stars > 0 ? `${h.stars}★` : '', h.jarak].filter(Boolean).join(' ');
      const kiri = ringkas(menang);
      const kanan = ringkas(kalah);
      if (!kiri || !kanan) return '';
      return `${kota === 'mekkah' ? 'Mekkah' : 'Madinah'} ${kiri} vs ${kanan}`;
    };
    const rincian = ['mekkah', 'madinah'].map(banding).filter(Boolean).join('; ');
    poin.push({
      tebal: `${SISI_LABEL[sisi]} unggul di hotel`,
      sisa: rincian ? `${rincian}.` : (verdict.hotel.reason === 'bintang' ? 'bintangnya lebih tinggi.' : 'jaraknya lebih dekat.'),
    });
  }

  if (verdict.seat) {
    const sisi = verdict.seat.side;
    const lawan = sisi === 'a' ? 'b' : 'a';
    poin.push({
      tebal: `Sisa seat ${SISI_LABEL[sisi]} lebih longgar`,
      sisa: `${verdict.seat[sisi]} dari ${pkg[sisi].seatTotal} kursi, sedangkan ${SISI_LABEL[lawan]} ${verdict.seat[lawan]} dari ${pkg[lawan].seatTotal}.`,
    });
  }

  if (!poin.length) {
    poin.push({
      tebal: 'Kedua paket sebanding',
      sisa: 'harga, hotel, dan ketersediaannya tidak berbeda berarti.',
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

  const hargaA: Record<string, number> = {};
  const hargaB: Record<string, number> = {};
  for (const room of ROOMS) {
    hargaA[room] = tierRoomPrice(a.pkg, a.tier, room);
    hargaB[room] = tierRoomPrice(b.pkg, b.tier, room);
  }

  const kotaHotel = COMPARE_CITIES.filter(
    c => hotelDiKota(a.pkg, a.tier, c.key) || hotelDiKota(b.pkg, b.tier, c.key),
  );
  const suhu = sides.map(side => kotaSuhu(side.pkg));
  const adaQr = sides.some(side => side.qrDataUrl);
  const barisHarga = ROOMS.filter(room => hargaA[room] > 0 || hargaB[room] > 0);

  // ── Tinggi halaman ──
  // react-pdf tidak bisa mengukur sebelum merender, jadi tingginya ditaksir per
  // blok — angkanya dikalibrasi dari render nyata JBU1569 vs JBU1491. Taksiran
  // yang KURANG membuat dokumen tumpah ke halaman kedua, jadi bagian yang bisa
  // membungkus (nama paket, nama hotel) selalu dibulatkan ke atas dan ada sisa
  // aman di akhir. Kelebihan sedikit cuma jadi pita putih tipis di bawah.
  const perkiraanBaris = (teks: string, charPerBaris: number) =>
    Math.max(1, Math.ceil((teks || '').length / charPerBaris));
  const barisNama = Math.max(
    perkiraanBaris(a.pkg.nama, 30),
    perkiraanBaris(b.pkg.nama, 30),
  );
  const barisHotel = kotaHotel.reduce((total, kota) => {
    const namaA = hotelDiKota(a.pkg, a.tier, kota.key)?.nama || '';
    const namaB = hotelDiKota(b.pkg, b.tier, kota.key)?.nama || '';
    return total + Math.max(perkiraanBaris(namaA, 42), perkiraanBaris(namaB, 42));
  }, 0);
  const maxKotaSuhu = Math.max(suhu[0].length, suhu[1].length, 1);

  let h = 4 + 51 + 1;                       // accent + header + rule
  const barisPoin = poin.reduce(
    (total, p) => total + perkiraanBaris(`${p.tebal}  ${p.sisa}`, 88),
    0,
  );
  h += 22 + 12 + poin.length * 3 + Math.ceil(barisPoin * 11.5); // pita kesimpulan
  h += 79 + 17 * barisNama;                 // pita paket
  h += 20 + barisHarga.length * 42;         // seksi harga + baris
  h += 20 + 2 * 44;                         // seksi penerbangan + 2 baris
  h += 20 + kotaHotel.length * 23 + barisHotel * 17;
  h += 20 + 36 + 39;                        // seksi ketersediaan: seat + manasik
  h += 16 + Math.ceil(maxKotaSuhu * 11.5);  // baris suhu
  if (adaQr) h += 65;                       // baris itinerary
  h += 3 + 50;                              // aksen + footer
  h += 8;                                   // sisa aman
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

  const Sel = ({ children, menang, kanan }: { children: ReactNode; menang?: boolean; kanan?: boolean }) => (
    <View style={[s.cell, menang ? s.cellWin : {}, kanan ? s.cellRight : {}]}>{children}</View>
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
          <View style={s.headerKiri}>
            <Image style={s.headerLogo} src={`${origin}/icon-192x192.png`} />
            <View>
              <Text style={s.company}>PT ALHIJAZ INDOWISATA</Text>
              <Text style={s.address}>Graha Alhijaz, Jl. Dewi Sartika No. 239A, Cawang — Jakarta Timur</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={s.docBadge}><Text style={s.docTitle}>PERBANDINGAN PAKET</Text></View>
            <Text style={s.docDate}>Dibuat {hariIni}</Text>
          </View>
        </View>
        <View style={s.rule} />

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
              <Text style={s.bandNama}>{side.pkg.nama}</Text>
              <View style={s.bandMeta}>
                <Text style={s.bandMaskapai}>{side.pkg.maskapai}</Text>
                <Text style={s.bandDot}>•</Text>
                <Text style={s.bandDurasi}>{durasiHari(side.pkg)} HARI</Text>
              </View>
              <View style={s.rantai}>
                {rantaiPerjalanan(side.pkg).flatMap((kota, k) => [
                  ...(k > 0 ? [<Text key={`panah-${k}`} style={s.panah}>›</Text>] : []),
                  <View key={`simpul-${k}`} style={s.simpul}>
                    <Text style={s.simpulText}>{kota}</Text>
                  </View>,
                ])}
              </View>
            </View>
          ))}
        </View>

        {/* ─── HARGA ─── */}
        <Seksi judul="HARGA PER JAMAAH" />
        {barisHarga.map(room => {
          const pa = hargaA[room];
          const pb = hargaB[room];
          const menangA = pa > 0 && pb > 0 && pa < pb;
          const menangB = pa > 0 && pb > 0 && pb < pa;
          const selisih = pa > 0 && pb > 0 ? Math.abs(pa - pb) : 0;
          return (
            <Baris key={room} label={`KAMAR ${ROOM_LABEL[room].toUpperCase()}`}>
              {[{ nilai: pa, menang: menangA }, { nilai: pb, menang: menangB }].map((sisi, i) => (
                <Sel key={i} menang={sisi.menang} kanan={i === 1}>
                  <Text style={sisi.menang ? s.hargaMenang : s.hargaUtama}>
                    {sisi.nilai > 0 ? fmtRupiah(sisi.nilai) : '—'}
                  </Text>
                  {sisi.menang && selisih > 0 && (
                    <Text style={s.hemat}>hemat {fmtRupiah(selisih)}</Text>
                  )}
                </Sel>
              ))}
            </Baris>
          );
        })}

        {/* ─── PENERBANGAN ─── */}
        <Seksi judul="PENERBANGAN" />
        {([
          { label: 'BERANGKAT', ambil: (p: UmrohPackage) => p.keberangkatan },
          { label: 'PULANG', ambil: (p: UmrohPackage) => p.kepulangan },
        ]).map(baris => (
          <Baris key={baris.label} label={baris.label}>
            {sides.map((side, i) => {
              const f = baris.ambil(side.pkg);
              return (
                <Sel key={i} kanan={i === 1}>
                  <Text style={s.tglUtama}>{fmtTanggal(f.tgl)}</Text>
                  <View style={s.cellLine}>
                    <Text style={s.jam}>{fmtJam(f.jam)} WIB</Text>
                    <Text style={s.kode}>{f.kodePenerbangan}</Text>
                  </View>
                  <Text style={s.rute}>{f.rute}</Text>
                </Sel>
              );
            })}
          </Baris>
        ))}

        {/* ─── HOTEL ─── */}
        {kotaHotel.length > 0 && <Seksi judul="HOTEL & AKOMODASI" />}
        {kotaHotel.map(kota => {
          const hA = hotelDiKota(a.pkg, a.tier, kota.key);
          const hB = hotelDiKota(b.pkg, b.tier, kota.key);
          const menang = verdict.hotel && (kota.key === 'mekkah' || kota.key === 'madinah')
            ? verdict.hotel.side
            : null;
          return (
            <Baris key={kota.key} label={kota.label.toUpperCase()}>
              {[hA, hB].map((hotel, i) => (
                <Sel key={i} kanan={i === 1} menang={Boolean(hotel) && menang === (i === 0 ? 'a' : 'b')}>
                  {hotel ? (
                    <>
                      <Text style={s.hotelNama}>{hotel.nama}</Text>
                      <View style={s.cellLine}>
                        <Bintang jumlah={hotel.stars} />
                        {Boolean(hotel.jarak) && <Text style={s.jarak}>{hotel.jarak}</Text>}
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

        {/* ─── KETERSEDIAAN & PERSIAPAN ─── */}
        <Seksi judul="KETERSEDIAAN & PERSIAPAN" />
        <Baris label="SISA SEAT">
          {sides.map((side, i) => {
            const menang = verdict.seat?.side === (i === 0 ? 'a' : 'b');
            return (
              <Sel key={i} kanan={i === 1} menang={menang}>
                <View style={s.cellLine}>
                  <Text style={menang ? s.seatAngkaMenang : s.seatAngka}>{side.pkg.seatSisa}</Text>
                  <Text style={s.seatKet}>dari {side.pkg.seatTotal} kursi</Text>
                </View>
              </Sel>
            );
          })}
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
        <Baris label="SUHU SAAT BERANGKAT">
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
          <Baris label="ITINERARY HARIAN">
            {sides.map((side, i) => (
              <Sel key={i} kanan={i === 1}>
                {side.qrDataUrl ? (
                  <View style={s.qrRow}>
                    <Image style={s.qrImg} src={side.qrDataUrl} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.qrJudul}>Pindai untuk rincian harian</Text>
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
            <Text style={s.sumber}>Data per {hariIni} · {a.pkg.jadwalId} vs {b.pkg.jadwalId}</Text>
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
  const [agentPhotoBase64, qrA, qrB] = await Promise.all([
    fotoAgentPng(agent?.photo),
    qrPng(a.itineraryUrl),
    qrPng(b.itineraryUrl),
  ]);
  return pdf(
    <CompareDocument
      a={{ ...a, qrDataUrl: qrA }}
      b={{ ...b, qrDataUrl: qrB }}
      agent={agent}
      agentPhotoBase64={agentPhotoBase64}
    />
  ).toBlob();
}

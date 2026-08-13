// Dokumen PDF "Rencana Perjalanan" — cetakan tampilan web itinerary.
// Spec: docs/superpowers/specs/2026-08-13-itinerary-pdf-versi-kita-design.md
//
// Render SAJA: tidak mengambil data, tidak memilih foto, tidak memutuskan
// boleh-tidaknya terbit. Semua aset masuk sebagai dataURL dari
// src/utils/itineraryPdfBlob.tsx.
import type { ComponentProps, ComponentType, ReactElement } from 'react';
import { Document, Page, View, Text, Image, StyleSheet, Font, Svg, Path, Rect } from '@react-pdf/renderer';
import { normalizeWaNumber, formatWaDisplay } from '@/utils/phone';
import type { UmrohPackage } from '@/types';
import type { AgentData } from '@/data/agents';
import {
  classifyActivity,
  splitImportantPlaces,
  itineraryDayDates,
  rewriteHomeArrivalTerminal,
  retitleDayWithDate,
  splitDayTitleDate,
  isRedundantDayLocation,
  computeNightSegments,
} from '../../lib/itinerary-view.js';
import { flightLegView, priceRows } from '../../lib/itinerary-pdf.js';

const fontOrigin = typeof window !== 'undefined' ? window.location.origin : '';
Font.register({
  family: 'Inter',
  fonts: [
    { src: `${fontOrigin}/fonts/Inter-Regular.ttf`, fontWeight: 'normal' },
    { src: `${fontOrigin}/fonts/Inter-Bold.ttf`, fontWeight: 'bold' },
  ],
});
Font.registerHyphenationCallback(word => [word]);

/**
 * Desain dikerjakan dalam piksel 96dpi (halaman 400×800, sama dengan lebar
 * tampilan web), sedangkan react-pdf memakai titik (72dpi). Semua ukuran
 * dilewatkan P() supaya angka di berkas ini tetap terbaca sebagai angka desain
 * dan halamannya tetap ≈106×212 mm. `lineHeight` dan `opacity` TIDAK diskalakan
 * — keduanya rasio, bukan panjang.
 */
const P = (px: number) => px * 0.75;

// Palet dikunci spec — nilainya sama persis dengan tampilan web itinerary
// supaya PDF dan halaman yang di-QR terasa satu dokumen.
const C = {
  canvas: '#F6F1EA',
  paper: '#FFFFFF',
  border: '#EAE2D8',
  divider: '#F1EAE1',
  ink: '#1E1512',
  ink2: '#453B35',
  ink3: '#63564D',
  burgundy: '#8A0F0A',
  burgundyDark: '#4A0805',
  gold: '#D4AF37',
  gold50: '#FBF6E6',
  gold700: '#6B550C',
  rail: '#EFE7DC',
  dot: '#C9B18A',
};

const CITY_HEX: Record<string, string> = {
  mekkah: '#2A5C9A', madinah: '#1F5F4B', dubai: '#8A6D12',
  turki: '#8A0F0A', mesir: '#6B3FA0', transit: '#556072', home: '#3D4451',
};

const BADGE_TEXT: Record<string, string> = {
  kumpul: 'TITIK KUMPUL', takeoff: 'TAKE OFF', landing: 'LANDING', transit: 'TRANSIT',
  bus: 'PERJALANAN BUS', kereta: 'KERETA CEPAT', tiba: 'TIBA', perjalanan: 'PERJALANAN',
};

/**
 * Geometri rel timeline. `RAIL_X` DITURUNKAN dari lebar kolom, bukan angka
 * hafalan: sebelumnya rel dipatok P(61.5) sementara pusat titik jatuh di
 * P(14)+P(44)+P(18)/2, sehingga garis lewat di tepi titik — bukan menembus
 * tengahnya. Untuk elemen `position: absolute` react-pdf mengukur `left` dari
 * tepi LUAR induk, jadi padding kiri timeline ikut dihitung di sini.
 */
const TIMELINE_PAD_X = P(14);
const JAM_W = P(44);
const DOT_COL_W = P(18);
const RAIL_W = 1;
const RAIL_X = TIMELINE_PAD_X + JAM_W + DOT_COL_W / 2 - RAIL_W / 2;

const s = StyleSheet.create({
  page: { fontFamily: 'Inter', backgroundColor: C.canvas, paddingTop: P(44), paddingBottom: P(46) },

  hero: {
    backgroundColor: C.burgundyDark, marginTop: -P(44),
    paddingHorizontal: P(20), paddingTop: P(24), paddingBottom: P(20),
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo: { width: P(128), height: P(22), objectFit: 'contain' },
  // borderColor WAJIB opak. react-pdf 4.3.2 merusak warna border semi-transparan
  // — '#FFFFFF4D' MAUPUN 'rgba(255,255,255,0.3)' sama-sama dirender hijau terang
  // #00FF4D (terukur di rasterisasi); warna opak lewat dengan benar. #805250 =
  // hasil campuran putih 30% di atas hero #4A0805, jadi tampilannya tak berubah.
  // Semi-transparan tetap aman untuk color dan backgroundColor (lihat s.pill).
  badge: {
    borderWidth: 1, borderColor: '#805250', borderRadius: P(4),
    paddingVertical: P(4), paddingHorizontal: P(8),
  },
  badgeText: { fontSize: P(9), fontWeight: 'bold', letterSpacing: P(1.3), color: '#FFFFFFCC' },
  heroTitle: { marginTop: P(12), fontSize: P(17), fontWeight: 'bold', lineHeight: 1.5, color: '#FFFFFF' },
  pillRow: { marginTop: P(12), flexDirection: 'row', gap: P(6) },
  pill: { backgroundColor: '#FFFFFF26', borderRadius: P(8), paddingVertical: P(5), paddingHorizontal: P(8) },
  pillText: { fontSize: P(11), fontWeight: 'bold', color: '#FFFFFF' },

  runHead: {
    position: 'absolute', top: 0, left: 0, right: 0, height: P(44),
  },
  runHeadInner: {
    height: P(44), backgroundColor: C.burgundyDark,
    paddingHorizontal: P(18), flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
  },
  runHeadText: { fontSize: P(9), fontWeight: 'bold', letterSpacing: P(1), color: '#FFFFFFCC' },
  runLogo: { width: P(104), height: P(18), objectFit: 'contain' },

  cardWrap: { marginHorizontal: P(12), marginTop: P(10) },
  // Blok bawah menempel ke blok atas — lihat KartuHari. Tumpang-tindih 1pt
  // menutup celah sub-piksel di sambungan; tanpa itu kanvas halaman menembus
  // sebagai garis rambut selebar kartu (terukur #FBF9F6 di rasterisasi 2×).
  cardWrapBawah: { marginHorizontal: P(12), marginTop: -1 },
  // Lebar border ditulis per sisi (bukan shorthand `borderWidth`) supaya
  // cardAtas/cardBawah bisa mematikan sisi yang bertemu di sambungan.
  card: {
    backgroundColor: C.paper, borderRadius: P(16), borderColor: C.border,
    borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderLeftWidth: 1,
  },
  cardAtas: { borderBottomWidth: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  cardBawah: { borderTopWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  cardHead: {
    flexDirection: 'row', alignItems: 'center', gap: P(10),
    paddingHorizontal: P(14), paddingVertical: P(10),
    borderBottomWidth: 1, borderBottomColor: C.divider,
  },
  dayChip: { width: P(32), height: P(32), borderRadius: P(10), backgroundColor: C.burgundy, alignItems: 'center', justifyContent: 'center' },
  dayChipText: { fontSize: P(14), fontWeight: 'bold', color: '#FFFFFF' },
  dayTitle: { fontSize: P(14), fontWeight: 'bold', color: C.ink },
  daySub: { fontSize: P(11.5), color: C.ink3, marginTop: P(1) },
  flag: {
    width: P(22), height: P(15), objectFit: 'cover', borderRadius: P(3),
    borderWidth: 1, borderColor: C.border,
  },

  timeline: { paddingHorizontal: TIMELINE_PAD_X, paddingVertical: P(12), position: 'relative' },
  // Timeline dipecah dua wadah (baris pertama ikut blok header). Padding dan
  // rail dipotong di sambungan supaya gabungannya identik dengan satu wadah.
  timelineAtas: { paddingBottom: 0 },
  timelineBawah: { paddingTop: 0 },
  railLine: { position: 'absolute', left: RAIL_X, top: P(16), bottom: P(16), width: RAIL_W, backgroundColor: C.rail },
  railAtas: { bottom: 0 },
  railBawah: { top: 0 },
  row: { flexDirection: 'row', marginBottom: P(14) },
  // 13,5px — jam ikut naik 1px bersama teks kegiatan (permintaan user).
  jam: { width: JAM_W, fontSize: P(13.5), fontWeight: 'bold', color: C.burgundy },
  dotCol: { width: DOT_COL_W, alignItems: 'center', paddingTop: P(5) },
  dot: { width: P(8), height: P(8), borderRadius: P(4), backgroundColor: C.paper, borderWidth: P(2), borderColor: C.dot },
  rowBody: { flex: 1 },
  // 14,5px — dinaikkan 1px dari nilai web (13,5) atas permintaan user: di
  // halaman selebar 400px teks kegiatan adalah isi utamanya, dan ini satu-satunya
  // ukuran yang sengaja menyimpang dari tampilan web (spec §3).
  actText: { fontSize: P(14.5), lineHeight: 1.5, color: C.ink },

  moment: { backgroundColor: C.gold50, borderRadius: P(12), paddingHorizontal: P(12), paddingVertical: P(10), marginBottom: P(14) },
  momentTop: { flexDirection: 'row', alignItems: 'center', gap: P(8), marginBottom: P(4) },
  momentJam: { fontSize: P(13.5), fontWeight: 'bold', color: C.burgundy },
  momentBadge: { fontSize: P(9.5), fontWeight: 'bold', letterSpacing: P(0.8), color: C.gold700 },

  photo: { marginTop: P(8), width: '100%', height: P(159), borderRadius: P(12), objectFit: 'cover' },
  photoCap: { marginTop: P(4), fontSize: P(9), color: C.ink3 },

  sectionHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: P(14), paddingVertical: P(10),
    borderBottomWidth: 1, borderBottomColor: C.divider,
  },
  sectionTitle: { fontSize: P(13.5), fontWeight: 'bold', color: C.ink },
  sectionBadge: { backgroundColor: '#FAF7F5', borderRadius: P(6), paddingVertical: P(3), paddingHorizontal: P(8) },
  sectionBadgeText: { fontSize: P(10), fontWeight: 'bold', color: C.ink2 },

  legRow: { flexDirection: 'row', alignItems: 'center', gap: P(10), marginTop: P(8) },
  airport: { fontSize: P(17), fontWeight: 'bold', color: C.ink },
  legJam: { fontSize: P(11.5), fontWeight: 'bold', color: C.burgundy, marginTop: P(4) },
  legMid: { flex: 1, alignItems: 'center' },
  legKode: { fontSize: P(10.5), fontWeight: 'bold', color: C.ink2 },
  legLine: { height: 1, width: '100%', backgroundColor: C.border, marginTop: P(5) },
  kicker: { fontSize: P(10), fontWeight: 'bold', letterSpacing: P(0.7), color: C.ink3 },
  tanggal: { fontSize: P(11.5), fontWeight: 'bold', color: C.ink2 },

  hotelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: P(12) },
  kotaDot: { width: P(7), height: P(7), borderRadius: P(4) },
  kotaLabel: { fontSize: P(10), fontWeight: 'bold', letterSpacing: P(0.8), color: C.ink3 },
  hotelNama: { fontSize: P(13.5), fontWeight: 'bold', color: C.ink, marginTop: P(2) },
  bintang: { fontSize: P(12), letterSpacing: P(1.5), color: C.gold },

  tierNama: { fontSize: P(12.5), fontWeight: 'bold', color: C.ink2 },
  tierHarga: { fontSize: P(16), fontWeight: 'bold', color: C.burgundy },
  tierKamar: { fontSize: P(11), color: C.ink3, marginTop: P(3) },
  tierCatatan: { fontSize: P(10), lineHeight: 1.45, color: C.ink3 },

  agentCard: {
    marginHorizontal: P(12), marginTop: P(10), backgroundColor: C.ink, borderRadius: P(16),
    padding: P(14), flexDirection: 'row', alignItems: 'center', gap: P(12),
  },
  avatarWrap: { position: 'relative', width: P(44), height: P(44) },
  avatar: { width: P(44), height: P(44), borderRadius: P(22), objectFit: 'cover' },
  avatarKosong: { width: P(44), height: P(44), borderRadius: P(22), backgroundColor: '#FFFFFF26' },
  avatarBadge: { position: 'absolute', right: -1, bottom: -1 },
  agentName: { fontSize: P(13.5), fontWeight: 'bold', color: '#FFFFFF' },
  agentContact: { fontSize: P(10.5), color: C.gold, marginTop: P(2) },
  agentAjak: { fontSize: P(9.5), color: '#FFFFFF99', marginTop: P(2) },
  qrPlate: { backgroundColor: '#FFFFFF', borderRadius: P(10), padding: P(4) },

  note: { marginTop: P(13), paddingHorizontal: P(24), fontSize: P(10.5), color: C.ink3, textAlign: 'center' },
  foot: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: P(18), paddingVertical: P(12),
    backgroundColor: C.canvas, borderTopWidth: 1, borderTopColor: '#E9E1DD',
  },
  footText: { fontSize: P(7), color: C.ink3 },
});

/**
 * `linebreak.infinity` di @react-pdf/textkit: penalti sebesar ini membuat titik
 * potong DILARANG, bukan sekadar mahal (`node.penalty !== linebreak.infinity`).
 */
const HYPHENATION_TERLARANG = 10000;

/**
 * `hyphenationPenalty` dibaca @react-pdf/layout dari `node.props` saat menyusun
 * opsi tata letak teks, tapi belum tercantum di d.ts react-pdf 4.3.2 — dibungkus
 * di sini supaya pemakaiannya tetap bertipe, bukan `any` yang menyebar.
 */
const TeksParagraf = Text as ComponentType<
  ComponentProps<typeof Text> & { hyphenationPenalty?: number }
>;

/**
 * Nama tempat penting ditebalkan di tengah kalimat. react-pdf mendukungnya
 * lewat <Text> bersarang — teksnya berasal dari PDF pihak ketiga lewat parser
 * LLM, jadi tetap dirender sebagai potongan teks, tidak pernah sebagai markup.
 *
 * `hyphenationPenalty` wajib: textkit menghitung suku kata PER RUN <Text>,
 * sehingga tanda baca yang menempel pada potongan tebal ("Ka'bah" lalu ";")
 * dianggap suku kata baru tanpa spasi di depannya — ditandai sebagai titik
 * hyphenation, dan saat baris kebetulan patah di situ textkit menyisipkan glyph
 * "-" ("…di area Ka'bah-" lalu "; kondisional."). Font.registerHyphenationCallback
 * tidak menolong karena hanya memecah kata DI DALAM satu run.
 */
function ActivityText({ text }: { text: string }) {
  const parts = splitImportantPlaces(text) as Array<{ text: string; bold: boolean }>;
  return (
    <TeksParagraf style={s.actText} hyphenationPenalty={HYPHENATION_TERLARANG}>
      {parts.map((p, i) =>
        p.bold ? <Text key={i} style={{ fontWeight: 'bold' }}>{p.text}</Text> : <Text key={i}>{p.text}</Text>,
      )}
    </TeksParagraf>
  );
}

/**
 * Tanggal dan angka DIRAKIT SENDIRI, tidak lewat toLocaleDateString/toLocaleString.
 * Kelengkapan data lokal 'id-ID' berbeda antar-mesin (build ICU kecil di sebagian
 * Android/WebView memulangkan "August"/"31,900,000"), sehingga PDF yang sama bisa
 * terbit berbeda tergantung perangkat agent. Tabel di bawah membuat hasilnya sama
 * di mana pun.
 */
export interface QrModules {
  /** Sisi matriks dalam modul (tanpa zona tenang). */
  size: number;
  /** Baris demi baris, true = modul gelap. Panjang = size × size. */
  dark: boolean[];
}

/** Sisi kode QR di dokumen, dalam titik (di luar bantalan pelatnya). */
const QR_SISI = P(58);
/**
 * Zona tenang. Standar QR meminta 4 modul; 3 sudah cukup karena pelat putih
 * membulat di belakangnya menambah margin kosong yang sama fungsinya.
 */
const QR_ZONA_TENANG = 3;

/**
 * Kode QR digambar sebagai vektor bermodul membulat, bukan PNG dari qrcode.
 * Alasannya dua: rasternya dulu terbit tanpa zona tenang sama sekali
 * (`margin: 0`) sehingga kodenya menempel di tepi pelat — jelek sekaligus lebih
 * sulit dipindai — dan modul kotak kaku terasa asing di antara kartu-kartu
 * bersudut membulat. Vektor juga tetap tajam berapa pun pembaca PDF menzum.
 *
 * Modul digambar seukuran penuh dengan sudut membulat, BUKAN titik berjarak:
 * modul bertetangga tetap menyatu sehingga ketahanan pindainya tidak berkurang.
 */
function KodeQR({ qr }: { qr: QrModules }) {
  const sisi = qr.size + QR_ZONA_TENANG * 2;
  const kotak: ReactElement[] = [];
  for (let baris = 0; baris < qr.size; baris += 1) {
    for (let kolom = 0; kolom < qr.size; kolom += 1) {
      if (!qr.dark[baris * qr.size + kolom]) continue;
      kotak.push(
        <Rect
          key={`${baris}-${kolom}`}
          x={kolom + QR_ZONA_TENANG}
          y={baris + QR_ZONA_TENANG}
          width={1}
          height={1}
          rx={0.3}
          ry={0.3}
          fill={C.ink}
        />,
      );
    }
  }
  return (
    <View style={s.qrPlate}>
      <Svg width={QR_SISI} height={QR_SISI} viewBox={`0 0 ${sisi} ${sisi}`}>{kotak}</Svg>
    </View>
  );
}

/**
 * Foto agent + centang biru mitra resmi. Bentuknya disamakan dengan lencana di
 * CompareDocument (lingkaran #1d9bf0, centang putih, cincin putih tipis) supaya
 * dua dokumen jualan tidak terasa berbeda.
 *
 * Lingkaran kosong tetap dirender saat fotonya gagal dimuat: ukurannya sama,
 * jadi tata letak kartu — dan tinggi halaman yang diukur darinya — tidak
 * bergeser hanya karena satu perangkat gagal mengunduh foto.
 */
function AvatarTerverifikasi({ foto }: { foto?: string }) {
  return (
    <View style={s.avatarWrap}>
      {foto ? <Image style={s.avatar} src={foto} /> : <View style={s.avatarKosong} />}
      <Svg style={s.avatarBadge} width={P(16)} height={P(16)} viewBox="0 0 26 26">
        <Path d="M13 0a13 13 0 1 1 0 26 13 13 0 1 1 0-26z" fill="#FFFFFF" />
        <Path d="M13 2a11 11 0 1 1 0 22 11 11 0 1 1 0-22z" fill="#1d9bf0" />
        <Path
          d="M8 13.5l3.4 3.4 6.6-7.2"
          stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" fill="none"
        />
      </Svg>
    </View>
  );
}

const ID_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const ID_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const ID_BULAN_SINGKAT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

function tanggalUTC(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Sabtu, 29 Agustus 2026" */
const ID_FULL = (iso: string) => {
  const d = tanggalUTC(iso);
  return d
    ? `${ID_HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${ID_BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`
    : '';
};

/** "29 Agu 2026" */
const ID_SINGKAT = (iso: string) => {
  const d = tanggalUTC(iso);
  return d ? `${d.getUTCDate()} ${ID_BULAN_SINGKAT[d.getUTCMonth()]} ${d.getUTCFullYear()}` : '';
};

const fmtRp = (v: number) =>
  `Rp ${Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

export interface ItineraryFoto {
  dataUrl: string;
  label: string;
}

export interface ItineraryDayData {
  dayNumber: string;
  title: string;
  location?: string | null;
  activities: Array<{ time: string; text: string } | string>;
}

function KartuHari({
  day, index, dateISO, photos, flagDataUrl,
}: {
  day: ItineraryDayData;
  index: number;
  dateISO: string | null;
  photos: Array<ItineraryFoto | null>;
  flagDataUrl?: string;
}) {
  const dayNum = day.dayNumber?.match(/\d[\d\-–]*/)?.[0] || String(index + 1);
  const { title: retitled } = retitleDayWithDate(day.title, dateISO) as { title: string };
  const { rest, dateText } = splitDayTitleDate(retitled) as { rest: string; dateText: string | null };
  const title = rest || day.location || dateText || day.title;
  const dateLabel = dateText
    ? (title === dateText ? null : dateText)
    : dateISO ? ID_FULL(dateISO) : null;
  const showLocation = Boolean(day.location) && !isRedundantDayLocation(title, day.location);
  const subtitle = [showLocation ? day.location : null, dateLabel].filter(Boolean).join('  ·  ');

  // PDF sering menulis jam yang sama di baris beruntun — tampilkan hanya saat
  // jamnya berubah, sama seperti DayRail.
  let lastShownTime = '';

  // Dirakit lebih dulu supaya baris pertama bisa ikut ke dalam blok header;
  // urutan pemanggilan tetap menentukan lastShownTime, jadi jangan diacak.
  const baris = day.activities.map((raw, i) => {
    const act = typeof raw === 'string' ? { time: '-', text: raw } : raw;
    const kind = classifyActivity(act.text, { dayIndex: index, activityIndex: i }) as string;
    const hasTime = Boolean(act.time && act.time !== '-');
    const showTime = hasTime && act.time !== lastShownTime;
    if (showTime) lastShownTime = act.time;
    const foto = photos?.[i] || null;

    if (kind !== 'regular') {
      return (
        <View key={i} style={s.moment} wrap={false}>
          <View style={s.momentTop}>
            {showTime ? <Text style={s.momentJam}>{act.time}</Text> : null}
            <Text style={s.momentBadge}>{BADGE_TEXT[kind]}</Text>
          </View>
          <ActivityText text={act.text} />
          {foto ? <Image src={foto.dataUrl} style={s.photo} /> : null}
        </View>
      );
    }

    return (
      <View key={i} style={s.row} wrap={false}>
        <Text style={s.jam}>{showTime ? act.time : ''}</Text>
        <View style={s.dotCol}><View style={s.dot} /></View>
        <View style={s.rowBody}>
          <ActivityText text={act.text} />
          {foto ? (
            <View wrap={false}>
              <Image src={foto.dataUrl} style={s.photo} />
              <Text style={s.photoCap}>{foto.label}</Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  });
  const [barisPertama, ...sisaBaris] = baris;

  const bersambung = sisaBaris.length > 0;

  /*
    Kartu hari dipecah jadi DUA saudara di tingkat halaman, bukan satu kartu
    dengan blok tak-terpisahkan di dalamnya:

    - Blok atas (header + baris pertama) `wrap={false}` supaya header tidak
      pernah nyangkut sendirian di kaki halaman.
    - Blok bawah menampung sisa baris dan tetap boleh terpotong, karena hari
      yang panjang melebihi satu halaman (spec §8).

    `wrap={false}` HARUS berada di saudara tingkat halaman ini. Menaruhnya di
    dalam kartu justru merusak: sebagai anak pertama kartu yang boleh terpotong,
    react-pdf membuang isi timeline berikutnya (uji JBU1550 kehilangan seluruh
    Hari 2, 10 → 8 halaman); dan bila kartunya yang tetap satu wadah, yang
    tertinggal di kaki halaman adalah cangkang kartu kosong.

    Sambungan dua blok dibuat tak terlihat lewat *Atas/*Bawah: border dan sudut
    membulat dimatikan di sisi yang bertemu, padding timeline serta rail dipotong
    di titik yang sama, jadi saat keduanya sehalaman hasilnya identik dengan satu
    kartu utuh.

    `minPresenceAhead` sengaja TIDAK dipakai lagi di sini: blok atas sudah tak
    terpisahkan, jadi menuntut ruang tambahan sesudahnya hanya menambah halaman
    (JBU1526 11 → 10, JBU1550 12 → 11) tanpa mencegah apa pun.
  */
  return (
    <>
      <View style={s.cardWrap} wrap={false}>
        <View style={[s.card, bersambung ? s.cardAtas : {}]}>
          <View style={s.cardHead}>
            <View style={s.dayChip}><Text style={s.dayChipText}>{dayNum}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.dayTitle}>{title}</Text>
              {subtitle ? <Text style={s.daySub}>{subtitle}</Text> : null}
            </View>
            {flagDataUrl ? <Image src={flagDataUrl} style={s.flag} /> : null}
          </View>
          {barisPertama ? (
            <View style={[s.timeline, bersambung ? s.timelineAtas : {}]}>
              <View style={[s.railLine, bersambung ? s.railAtas : {}]} />
              {barisPertama}
            </View>
          ) : null}
        </View>
      </View>
      {bersambung ? (
        <View style={s.cardWrapBawah}>
          <View style={[s.card, s.cardBawah]}>
            <View style={[s.timeline, s.timelineBawah]}>
              <View style={[s.railLine, s.railBawah]} />
              {sisaBaris}
            </View>
          </View>
        </View>
      ) : null}
    </>
  );
}

function KartuPenerbangan({
  paket, arrivals,
}: {
  paket: UmrohPackage;
  arrivals: { berangkat: string | null; pulang: string | null };
}) {
  const legs = flightLegView(paket, arrivals) as Array<{
    kick: string; tglISO: string; dari: string; ke: string; jam: string; jamTiba: string | null; kode: string;
  }>;
  if (!legs.some(l => l.dari !== '—')) return null;
  return (
    <View style={s.cardWrap} wrap={false}>
      <View style={s.card}>
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>Penerbangan</Text>
          {paket.maskapai ? (
            <View style={s.sectionBadge}><Text style={s.sectionBadgeText}>{paket.maskapai}</Text></View>
          ) : null}
        </View>
        <View style={{ paddingHorizontal: P(14), paddingVertical: P(14), gap: P(14) }}>
          {legs.map(l => (
            <View key={l.kick}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={s.kicker}>{l.kick.toUpperCase()}</Text>
                <Text style={s.tanggal}>{ID_FULL(l.tglISO)}</Text>
              </View>
              <View style={s.legRow}>
                <View style={{ width: P(56) }}>
                  <Text style={s.airport}>{l.dari}</Text>
                  <Text style={s.legJam}>{l.jam}</Text>
                </View>
                <View style={s.legMid}>
                  <Text style={s.legKode}>{l.kode}</Text>
                  <View style={s.legLine} />
                </View>
                <View style={{ width: P(56), alignItems: 'flex-end' }}>
                  <Text style={s.airport}>{l.ke}</Text>
                  {l.jamTiba ? <Text style={s.legJam}>{l.jamTiba}</Text> : null}
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function KartuHotel({ paket }: { paket: UmrohPackage }) {
  const tiers = Object.keys(paket.hotel || {});
  const tier = tiers[0];
  const info = (tier ? paket.hotel[tier] : {}) as Record<string, string | undefined>;
  const rows = Object.entries(info)
    .filter(([k, v]) => k.endsWith('_hotel') && Boolean(v))
    .map(([k, v]) => {
      const city = k.replace(/_hotel$/, '');
      const bintang = parseInt(String(info[`${city}_bintang`] ?? ''), 10);
      return { city, nama: String(v), bintang: Number.isFinite(bintang) ? Math.min(bintang, 5) : 0 };
    });
  if (!rows.length) return null;
  return (
    <View style={s.cardWrap} wrap={false}>
      <View style={s.card}>
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>Hotel</Text>
          {tier ? (
            <View style={s.sectionBadge}><Text style={s.sectionBadgeText}>PAKET {tier.toUpperCase()}</Text></View>
          ) : null}
        </View>
        <View style={{ paddingHorizontal: P(14) }}>
          {rows.map((r, i) => (
            <View
              key={r.city}
              style={[
                s.hotelRow,
                i < rows.length - 1 ? { borderBottomWidth: 1, borderBottomColor: C.divider } : {},
              ]}
            >
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: P(6) }}>
                  <View style={[s.kotaDot, { backgroundColor: CITY_HEX[r.city] || CITY_HEX.transit }]} />
                  <Text style={s.kotaLabel}>{r.city.toUpperCase()}</Text>
                </View>
                <Text style={s.hotelNama}>{r.nama}</Text>
              </View>
              {r.bintang > 0 ? <Text style={s.bintang}>{'★'.repeat(r.bintang)}</Text> : null}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function KartuHarga({ paket }: { paket: UmrohPackage }) {
  const rows = priceRows(paket) as Array<{
    tier: string; mulaiDari: number; kamar: Array<{ label: string; harga: number }>;
  }>;
  if (!rows.length) return null;
  return (
    <View style={s.cardWrap} wrap={false}>
      <View style={s.card}>
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>Harga</Text>
          <View style={s.sectionBadge}><Text style={s.sectionBadgeText}>MULAI DARI</Text></View>
        </View>
        <View style={{ paddingHorizontal: P(14), paddingTop: P(12), paddingBottom: P(13), gap: P(9) }}>
          {rows.map(r => (
            <View key={r.tier}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={s.tierNama}>{r.tier}</Text>
                <Text style={s.tierHarga}>{fmtRp(r.mulaiDari)}</Text>
              </View>
              {r.kamar.length ? (
                <Text style={s.tierKamar}>
                  {r.kamar.map(k => `${k.label} ${fmtRp(k.harga)}`).join('  ·  ')}
                </Text>
              ) : null}
            </View>
          ))}
          <Text style={s.tierCatatan}>
            Harga dapat berubah sewaktu-waktu dan belum termasuk perlengkapan.
            Penawaran resmi diterbitkan terpisah oleh agent Anda.
          </Text>
        </View>
      </View>
    </View>
  );
}

export const ITINERARY_LEBAR = P(400);
export const ITINERARY_TINGGI_PAGINASI = P(800);
/** Batas dimensi halaman PDF 1.x — 200 inci. Isi yang melewatinya tak bisa jadi satu halaman. */
export const ITINERARY_TINGGI_MAKS = 14400;
/** Ruang di bawah isi: cukup untuk kaki dokumen, sama dengan paddingBottom halaman. */
export const ITINERARY_PAD_BAWAH = P(46);

/**
 * - `paginasi` — banyak halaman berukuran tetap (desain awal, spec D-3).
 * - `ukur` — satu halaman setinggi mungkin TANPA kaki, dipakai perakit blob
 *   untuk mengukur tinggi isi sebenarnya lewat posisi teks terakhir.
 * - `utuh` — satu halaman setinggi isinya; nomor halaman ditiadakan karena
 *   selalu "1 / 1".
 */
export type ItineraryPageMode = 'paginasi' | 'ukur' | 'utuh';

export interface ItineraryDocProps {
  content: { days: ItineraryDayData[] };
  paket: UmrohPackage;
  agent?: AgentData | null;
  photosByDay: Array<Array<ItineraryFoto | null>>;
  flagDataUrl?: string;
  logoDataUrl?: string;
  qr?: QrModules;
  /** "alhijaz.co/nikita" — alamat yang dituju QR, ditulis apa adanya di kartu. */
  agentUrlLabel?: string;
  agentPhotoDataUrl?: string;
  mode?: ItineraryPageMode;
  /** Tinggi halaman dalam titik; hanya dipakai saat mode `utuh`. */
  pageHeight?: number;
}

export function ItineraryDocument({
  content, paket, agent, photosByDay, flagDataUrl, logoDataUrl, qr, agentUrlLabel, agentPhotoDataUrl,
  mode = 'paginasi', pageHeight,
}: ItineraryDocProps) {
  // Koreksi terminal kedatangan (T3→T2) SEBELUM semua turunan data supaya teks
  // yang dirender dan yang dipindai konsisten — sama seperti WebItineraryView.
  const days = rewriteHomeArrivalTerminal(content.days) as ItineraryDayData[];
  const dayISO = itineraryDayDates(
    days, paket?.keberangkatan?.tgl, paket?.kepulangan?.tgl,
  ) as Array<string | null>;

  // Jam tiba tak ada di data paket — ambil dari baris kedatangan itinerary,
  // aturan yang sama dengan extractArrivalTimes di WebItineraryView.
  const landings: Array<{ time: string; dayIndex: number }> = [];
  days.forEach((d, di) => d.activities.forEach((raw, ai) => {
    const act = typeof raw === 'string' ? { time: '-', text: raw } : raw;
    if (!act.time || act.time === '-') return;
    const kind = classifyActivity(act.text, { dayIndex: di, activityIndex: ai });
    if (kind === 'landing' || kind === 'tiba') landings.push({ time: act.time, dayIndex: di });
  }));
  const half = days.length / 2;
  const arrivals = {
    berangkat: landings.find(l => l.dayIndex < half)?.time ?? null,
    pulang: [...landings].reverse().find(l => l.dayIndex >= half)?.time ?? null,
  };

  // Ringkasan malam boleh tidak ada (temuan T-1: computeNightSegments fail-closed
  // untuk paket yang lokasi hariannya tak terpetakan). Pil "N malam" ikut hilang,
  // tanpa placeholder.
  const segments = computeNightSegments(days) as Array<{ key: string; nights: number }> | null;
  const totalNights = segments
    ? segments.filter(x => x.key !== 'home').reduce((n, x) => n + x.nights, 0)
    : 0;

  const berangkatLabel = ID_SINGKAT(paket?.keberangkatan?.tgl || '');

  // Nomor agent tersimpan sebagai "628…"; normalizeWaNumber sekalian membetulkan
  // data legacy yang kehilangan angka 8 di depan. Gagal dibaca → tampilkan apa
  // adanya, jangan mengarang nomor.
  const waAgent = agent?.phone ? normalizeWaNumber(agent.phone) : null;
  const teleponAgent = waAgent ? formatWaDisplay(waAgent, '-') : (agent?.phone || '');

  const tinggiHalaman = mode === 'ukur'
    ? ITINERARY_TINGGI_MAKS
    : mode === 'utuh'
      ? (pageHeight || ITINERARY_TINGGI_PAGINASI)
      : ITINERARY_TINGGI_PAGINASI;

  return (
    <Document title={`Rencana Perjalanan — ${paket?.nama || ''}`}>
      <Page size={[ITINERARY_LEBAR, tinggiHalaman]} style={s.page}>
        <View
          style={s.runHead}
          fixed
          render={({ pageNumber }) =>
            pageNumber === 1 ? null : (
              <View style={s.runHeadInner}>
                {logoDataUrl ? <Image src={logoDataUrl} style={s.runLogo} /> : <View />}
                <Text style={s.runHeadText}>ITINERARY</Text>
              </View>
            )
          }
        />

        <View style={s.hero}>
          <View style={s.heroTop}>
            {logoDataUrl ? <Image src={logoDataUrl} style={s.logo} /> : <View />}
            <View style={s.badge}><Text style={s.badgeText}>ITINERARY</Text></View>
          </View>
          <Text style={s.heroTitle}>{paket?.nama || ''}</Text>
          <View style={s.pillRow}>
            {berangkatLabel ? <View style={s.pill}><Text style={s.pillText}>{berangkatLabel}</Text></View> : null}
            {paket?.maskapai ? <View style={s.pill}><Text style={s.pillText}>{paket.maskapai}</Text></View> : null}
            <View style={s.pill}><Text style={s.pillText}>{days.length} hari</Text></View>
            {totalNights > 0 ? <View style={s.pill}><Text style={s.pillText}>{totalNights} malam</Text></View> : null}
          </View>
        </View>

        {days.map((day, i) => (
          <KartuHari
            key={i}
            day={day}
            index={i}
            dateISO={dayISO[i]}
            photos={photosByDay[i] || []}
            flagDataUrl={flagDataUrl}
          />
        ))}

        <KartuPenerbangan paket={paket} arrivals={arrivals} />
        <KartuHotel paket={paket} />
        <KartuHarga paket={paket} />

        {agent ? (
          <View style={s.agentCard} wrap={false}>
            <AvatarTerverifikasi foto={agentPhotoDataUrl} />
            <View style={{ flex: 1 }}>
              <Text style={s.agentName}>{agent.name}</Text>
              {teleponAgent ? <Text style={s.agentContact}>{teleponAgent}</Text> : null}
              {agentUrlLabel ? <Text style={s.agentAjak}>{agentUrlLabel}</Text> : null}
            </View>
            {qr ? <KodeQR qr={qr} /> : null}
          </View>
        ) : null}

        <Text style={s.note}>Jadwal dapat berubah menyesuaikan kondisi di lapangan.</Text>

        {/*
          Kaki sengaja TIDAK dirender saat mengukur: ia melekat di dasar halaman,
          jadi teksnya akan selalu jadi baris terbawah dan menutupi posisi isi
          yang justru ingin diukur.
        */}
        {mode === 'ukur' ? null : (
          <View style={s.foot} fixed>
            <Text style={s.footText}>{paket?.jadwalId} · {paket?.nama}</Text>
            {mode === 'utuh' ? null : (
              <Text
                style={s.footText}
                render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
              />
            )}
          </View>
        )}
      </Page>
    </Document>
  );
}

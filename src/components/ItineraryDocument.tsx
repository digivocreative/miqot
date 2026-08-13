// Dokumen PDF "Rencana Perjalanan" — cetakan tampilan web itinerary.
// Spec: docs/superpowers/specs/2026-08-13-itinerary-pdf-versi-kita-design.md
//
// Render SAJA: tidak mengambil data, tidak memilih foto, tidak memutuskan
// boleh-tidaknya terbit. Semua aset masuk sebagai dataURL dari
// src/utils/itineraryPdfBlob.tsx.
import type { ComponentProps, ComponentType } from 'react';
import { Document, Page, View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer';
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

const s = StyleSheet.create({
  page: { fontFamily: 'Inter', backgroundColor: C.canvas, paddingTop: P(44), paddingBottom: P(46) },

  hero: {
    backgroundColor: C.burgundyDark, marginTop: -P(44),
    paddingHorizontal: P(20), paddingTop: P(24), paddingBottom: P(20),
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo: { width: P(128), height: P(22), objectFit: 'contain' },
  badge: { borderWidth: 1, borderColor: '#FFFFFF4D', borderRadius: P(4), paddingVertical: P(4), paddingHorizontal: P(8) },
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

  timeline: { paddingHorizontal: P(14), paddingVertical: P(12), position: 'relative' },
  // Timeline dipecah dua wadah (baris pertama ikut blok header). Padding dan
  // rail dipotong di sambungan supaya gabungannya identik dengan satu wadah.
  timelineAtas: { paddingBottom: 0 },
  timelineBawah: { paddingTop: 0 },
  railLine: { position: 'absolute', left: P(61.5), top: P(16), bottom: P(16), width: 1, backgroundColor: C.rail },
  railAtas: { bottom: 0 },
  railBawah: { top: 0 },
  row: { flexDirection: 'row', marginBottom: P(14) },
  jam: { width: P(44), fontSize: P(12.5), fontWeight: 'bold', color: C.burgundy },
  dotCol: { width: P(18), alignItems: 'center', paddingTop: P(5) },
  dot: { width: P(8), height: P(8), borderRadius: P(4), backgroundColor: C.paper, borderWidth: P(2), borderColor: C.dot },
  rowBody: { flex: 1 },
  actText: { fontSize: P(13.5), lineHeight: 1.5, color: C.ink },

  moment: { backgroundColor: C.gold50, borderRadius: P(12), paddingHorizontal: P(12), paddingVertical: P(10), marginBottom: P(14) },
  momentTop: { flexDirection: 'row', alignItems: 'center', gap: P(8), marginBottom: P(4) },
  momentJam: { fontSize: P(12.5), fontWeight: 'bold', color: C.burgundy },
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
  agentName: { fontSize: P(13.5), fontWeight: 'bold', color: '#FFFFFF' },
  agentContact: { fontSize: P(10.5), color: C.gold, marginTop: P(2) },
  agentAjak: { fontSize: P(9.5), color: '#FFFFFF99', marginTop: P(2) },
  qr: { width: P(58), height: P(58), backgroundColor: '#FFFFFF', borderRadius: P(4) },

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

const ID_FULL = (iso: string) =>
  iso
    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    })
    : '';

const fmtRp = (v: number) => `Rp ${v.toLocaleString('id-ID')}`;

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

export interface ItineraryDocProps {
  content: { days: ItineraryDayData[] };
  paket: UmrohPackage;
  agent?: AgentData | null;
  photosByDay: Array<Array<ItineraryFoto | null>>;
  flagDataUrl?: string;
  logoDataUrl?: string;
  qrDataUrl?: string;
}

export function ItineraryDocument({
  content, paket, agent, photosByDay, flagDataUrl, logoDataUrl, qrDataUrl,
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

  const berangkatLabel = paket?.keberangkatan?.tgl
    ? new Date(`${paket.keberangkatan.tgl}T00:00:00Z`).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    })
    : '';

  return (
    <Document title={`Rencana Perjalanan — ${paket?.nama || ''}`}>
      <Page size={[P(400), P(800)]} style={s.page}>
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
            <View style={{ flex: 1 }}>
              <Text style={s.agentName}>{agent.name}</Text>
              {agent.phone ? <Text style={s.agentContact}>{agent.phone}</Text> : null}
              {qrDataUrl ? <Text style={s.agentAjak}>Pindai untuk buka itinerary versi web</Text> : null}
            </View>
            {qrDataUrl ? <Image src={qrDataUrl} style={s.qr} /> : null}
          </View>
        ) : null}

        <Text style={s.note}>Jadwal dapat berubah menyesuaikan kondisi di lapangan.</Text>

        <View style={s.foot} fixed>
          <Text style={s.footText}>{paket?.jadwalId} · {paket?.nama}</Text>
          <Text
            style={s.footText}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

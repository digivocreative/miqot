import { Document, Page, View, Text, Image, StyleSheet, Font, Svg, Circle, Path } from '@react-pdf/renderer';
import type { UmrohPackage } from '@/types';
import type { AgentData } from '@/data/agents';

// ── Register Inter font (Google Fonts CDN – works everywhere) ──
Font.register({
  family: 'Inter',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf', fontWeight: 'normal' },
    { src: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf', fontWeight: 'bold' },
  ],
});
// Disable hyphenation
Font.registerHyphenationCallback((word) => [word]);

// ── Types ──
interface SummaryItem {
  label: string;
  qty: number;
  unitPrice: number;
  total: number;
  note?: string;
}

export interface QuotationProps {
  pkg: UmrohPackage | null;
  summary: {
    items: SummaryItem[];
    subtotal: number;
    discount: number;
    grandTotal: number;
  };
  namaLengkap: string;
  agent?: AgentData;
  agentPhotoBase64?: string;
}

// ── Colors ──
const C = {
  primary: '#b40200',
  gold: '#c18f1f',
  dark: '#1f2937',
  gray: '#6b7280',
  lightGray: '#9ca3af',
  bgLight: '#f3f4f6',
  bgBank: '#f9fafb',
  bgCta: '#fff1f2',
  white: '#ffffff',
  divider: '#e5e7eb',
  altRow: '#f8fafc',
};

// ── Helpers ──
const fmtRp = (v: number) => v.toLocaleString('id-ID');
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

// ── Styles ──
const s = StyleSheet.create({
  page: { fontFamily: 'Inter', fontSize: 8, color: C.dark, paddingBottom: 75 },
  watermark: { position: 'absolute' as const, bottom: 35, left: '10%', width: '80%', opacity: 0.04 },

  // Header
  headerAccent: { backgroundColor: C.primary, height: 4 },
  headerBar: { backgroundColor: C.white, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 0.5, borderBottomColor: C.divider },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerLogo: { width: 28, height: 28, borderRadius: 4 },
  headerTextGroup: { flex: 1 },
  headerRight: { alignItems: 'flex-end', flex: 1 },
  companyName: { fontFamily: 'Inter', fontWeight: 'bold' as const, fontSize: 11, color: C.primary, marginBottom: 1 },
  companyIzin: { fontSize: 5, color: C.gray, marginBottom: 0.5 },
  companySub: { fontSize: 5, color: C.lightGray },
  docTitleBadge: { backgroundColor: C.primary, borderRadius: 2, paddingVertical: 2, paddingHorizontal: 6, marginBottom: 3, alignSelf: 'flex-end' as const },
  docTitle: { fontFamily: 'Inter', fontWeight: 'bold' as const, fontSize: 7, color: C.white, textAlign: 'center' as const },
  docSub: { fontSize: 5, color: C.gray, marginBottom: 1.5, textAlign: 'right' as const },
  metaRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 3, marginBottom: 1 },
  metaLabel: { fontSize: 5, color: C.lightGray },
  metaValue: { fontFamily: 'Inter', fontWeight: 'bold' as const, fontSize: 5.5, color: C.dark },

  // Detail Paket card
  card: { marginHorizontal: 14, marginTop: 8, borderRadius: 4, borderWidth: 0.5, borderColor: C.divider },
  cardHeader: { backgroundColor: C.dark, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  detailLabel: { fontFamily: 'Inter', fontWeight: 'bold' as const, fontSize: 5.5, color: '#ffffffaa', marginBottom: 2, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  pkgName: { fontFamily: 'Inter', fontWeight: 'bold' as const, fontSize: 11, color: C.white },
  durationBadge: { alignItems: 'flex-end', backgroundColor: '#ffffff22', borderRadius: 3, paddingVertical: 4, paddingHorizontal: 8 },
  durationNum: { fontFamily: 'Inter', fontWeight: 'bold' as const, fontSize: 14, color: C.white },
  durationLabel: { fontSize: 5, color: '#ffffffaa' },
  cardBody: { backgroundColor: C.bgLight, paddingVertical: 8, paddingHorizontal: 12, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  infoRow: { flexDirection: 'row', gap: 6 },
  infoCol: { flex: 1 },
  infoTitle: { fontSize: 5, color: C.gray, marginBottom: 2, textTransform: 'uppercase' as const },
  infoMain: { fontFamily: 'Inter', fontWeight: 'bold' as const, fontSize: 7, color: C.dark, marginBottom: 1 },
  infoSub: { fontSize: 5.5, color: C.gray },

  // Table section
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginTop: 12, marginBottom: 4, gap: 4 },
  sectionIcon: { width: 3, height: 3, backgroundColor: C.gold },
  sectionTitle: { fontFamily: 'Inter', fontWeight: 'bold' as const, fontSize: 9, color: C.dark },

  // Table
  table: { marginHorizontal: 20 },
  tableHead: { flexDirection: 'row', backgroundColor: C.bgLight, borderBottomWidth: 0.5, borderBottomColor: C.divider, paddingBottom: 5, paddingTop: 5, paddingHorizontal: 4 },
  thText: { fontFamily: 'Inter', fontWeight: 'bold' as const, fontSize: 7, color: C.gray },
  tableRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 0.3, borderBottomColor: '#eeeeee' },
  tdText: { fontSize: 8, color: C.dark },
  tdBold: { fontFamily: 'Inter', fontWeight: 'bold' as const, fontSize: 8, color: C.dark },
  tdNote: { fontSize: 6.5, color: C.gray, marginTop: 1 },
  discountText: { fontFamily: 'Inter', fontSize: 8, color: '#b41e1e' },

  // Column widths (percentage-like flex)
  colDesc: { flex: 5, paddingLeft: 6 },
  colPax: { width: 32, alignItems: 'center' as const },
  colPrice: { width: 72, alignItems: 'flex-end' as const },
  colTotal: { width: 68, alignItems: 'flex-end' as const, paddingRight: 6 },

  // Total bar
  totalBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#374151', marginHorizontal: 20, paddingVertical: 5, paddingHorizontal: 12, marginTop: 0, borderRadius: 2 },
  totalLabel: { fontFamily: 'Inter', fontWeight: 'bold' as const, fontSize: 7, color: C.white },
  totalAmount: { fontFamily: 'Inter', fontWeight: 'bold' as const, fontSize: 10, color: C.white },

  // Bottom 2-column
  bottomRow: { flexDirection: 'row', marginHorizontal: 20, marginTop: 12, gap: 10 },
  bottomLeft: { flex: 1 },
  bottomRight: { flex: 1 },

  // Bank cards
  bankSectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  bankCard: { borderRadius: 4, paddingVertical: 6, paddingHorizontal: 8, marginBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 8 },
  bankLogo: { width: 40, height: 20, objectFit: 'contain' as const },
  bankDivider: { width: 0.5, height: 20, backgroundColor: C.divider },
  bankInfo: { flex: 1 },
  bankName: { fontFamily: 'Inter', fontSize: 5, color: C.gray, marginBottom: 1, textTransform: 'uppercase' as const, letterSpacing: 0.1 },
  bankRek: { fontFamily: 'Inter', fontWeight: 'bold' as const, fontSize: 8.5, color: C.dark, letterSpacing: 0.5 },
  bankAn: { fontSize: 5, color: C.gray, marginTop: 1 },

  // Notice card
  noticeCard: { borderRadius: 4, borderWidth: 0.5, borderColor: C.divider, overflow: 'hidden' as const },
  noticeHeader: { backgroundColor: C.dark, paddingVertical: 5, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 4, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  noticeHeaderIcon: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f59e0b' },
  noticeHeaderText: { fontFamily: 'Inter', fontWeight: 'bold' as const, fontSize: 6, color: C.white, letterSpacing: 0.5 },
  noticeBody: { backgroundColor: C.white, paddingVertical: 8, paddingHorizontal: 10, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  noticeDpLabel: { fontFamily: 'Inter', fontSize: 7, color: C.gray, marginBottom: 2 },
  noticeDpAmount: { fontFamily: 'Inter', fontWeight: 'bold' as const, fontSize: 11, color: C.primary, marginBottom: 8 },
  noticeBulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginBottom: 3 },
  noticeBulletDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.gray, marginTop: 2.5 },
  noticeBulletText: { fontSize: 6.5, color: '#4b5563', flex: 1, lineHeight: 1.4 },
  noticeCta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' as const, gap: 3, marginTop: 6, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: C.divider },
  noticeCtaText: { fontSize: 6, color: C.gray },
  noticeCtaBold: { fontFamily: 'Inter', fontWeight: 'bold' as const, fontSize: 6, color: C.dark },

  // Footer
  footer: { position: 'absolute' as const, bottom: 0, left: 0, right: 0, backgroundColor: C.bgLight, borderTopWidth: 0.3, borderTopColor: C.divider, paddingVertical: 8, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerLeft: {},
  footerAgentLabel: { fontSize: 5.5, color: C.lightGray, marginBottom: 1 },
  footerAgentName: { fontFamily: 'Inter', fontWeight: 'bold' as const, fontSize: 9, color: C.dark },
  footerRight: { alignItems: 'flex-end' as const },
  footerKemenag: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2 },
  footerKemenagText: { fontFamily: 'Inter', fontWeight: 'bold' as const, fontSize: 6.5, color: C.dark },
  footerPtName: { fontFamily: 'Inter', fontWeight: 'bold' as const, fontSize: 5.5, color: C.dark, marginBottom: 2, textAlign: 'right' as const },
  footerPermit: { fontSize: 5.5, color: C.gray, textAlign: 'right' as const },

  // Disclaimer
  disclaimerRow: { flexDirection: 'row', marginHorizontal: 20, marginTop: 10, gap: 10 },
  disclaimerCol: { flex: 1 },
  disclaimerText: { fontFamily: 'Inter', fontSize: 6, color: C.gray, lineHeight: 1.5, textAlign: 'justify' as const },

  // Agent profile footer
  agentFooterAccent: { position: 'absolute' as const, bottom: 52, left: 0, right: 0, height: 7, backgroundColor: C.primary },
  agentFooter: { position: 'absolute' as const, bottom: 0, left: 0, right: 0, backgroundColor: C.bgLight, paddingVertical: 10, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 10 },
  agentPhotoWrap: { position: 'relative' as const, width: 36, height: 36 },
  agentPhoto: { width: 36, height: 36, borderRadius: 18, objectFit: 'cover' as const },
  agentBadge: { position: 'absolute' as const, top: -2, right: -2, width: 14, height: 14, borderRadius: 7, backgroundColor: C.white, alignItems: 'center' as const, justifyContent: 'center' as const },
  agentInfo: { flex: 1 },
  agentName: { fontFamily: 'Inter', fontWeight: 'bold' as const, fontSize: 10, color: C.dark, marginBottom: 1.5 },
  agentWebsite: { fontSize: 6.5, color: C.gray, marginBottom: 1.5 },
  agentContact: { fontFamily: 'Inter', fontWeight: 'bold' as const, fontSize: 7.5, color: C.dark },
});

// ── Banks Data ──
const banks = [
  { bank: 'Bank BCA', rek: '2732211111', logo: '/logo-bank/bca.png', bg: '#e8f4fd' },
  { bank: 'Bank Mandiri', rek: '0060008012225', logo: '/logo-bank/mandiri.png', bg: '#e6edf7' },
  { bank: 'Bank Syariah Indonesia', rek: '7073675598', logo: '/logo-bank/bsi.png', bg: '#e6f5f0' },
];

// ═══════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════
export function QuotationDocument({ pkg, summary, namaLengkap, agent, agentPhotoBase64 }: QuotationProps) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const logoSrc = `${origin}/icon-192x192.png`;
  const now = new Date();
  const docId = `Q-${now.getFullYear()}-${now.toLocaleString('en', { month: 'short' }).toUpperCase()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const todayStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const validDate = new Date(now.getTime() + 7 * 86400000).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  // Duration — extract from package name (e.g. "9HR", "12 HARI") to match advertised duration
  let days = 0;
  if (pkg) {
    const m = pkg.nama.match(/(\d+)\s*(?:HR|HARI)/i);
    if (m) {
      days = parseInt(m[1], 10);
    } else {
      // Fallback: calculate from dates
      const dep = new Date(pkg.keberangkatan.tgl);
      const ret = new Date(pkg.kepulangan.tgl);
      days = Math.ceil((ret.getTime() - dep.getTime()) / 86400000);
    }
  }

  // Hotel info
  const firstTier = pkg ? Object.keys(pkg.hotel)[0] : null;
  const hotelData = firstTier && pkg ? (pkg.hotel[firstTier] as unknown as Record<string, string>) : null;
  const starLabel = hotelData?.mekkah_bintang ? `AKOMODASI HOTEL` : 'AKOMODASI HOTEL';
  const hotelNames = hotelData ? [hotelData.mekkah_hotel, hotelData.madinah_hotel].filter(Boolean).join(' / ') : '—';

  // ── Dynamic page height ──
  // A5 width = 420.94pt. Compute height based on content.
  const A5W = 420.94;
  let h = 0;
  h += 35;   // header accent + header bar
  h += 35;   // doc title / meta rows
  h += 95;   // detail paket card (flight + hotel info)
  h += 20;   // section header "RINCIAN BIAYA"
  h += 18;   // table head
  h += summary.items.length * 18; // each row ~18pt (label + possible note)
  if (summary.discount > 0) h += 18; // discount row
  h += 25;   // total bar
  h += 140;  // bottom 2-column (bank cards + notice/CTA card)
  h += 35;   // disclaimer 2-column
  h += 65;   // footer (absolute positioned, paddingBottom reservation)
  if (agent) h += 50; // agent card (photo + accent)
  h += 25;   // extra breathing room / margins
  // Single-page: no max cap — let it grow as needed, minimum A5 height
  const pageH = Math.max(420, h);

  return (
    <Document>
      <Page size={{ width: A5W, height: pageH }} style={s.page}>

        {/* ─── WATERMARK ─── */}
        <Image style={s.watermark} src={`${origin}/logo-alhijaz-besar.png`} fixed />

        {/* ─── A. HEADER ─── */}
        <View style={s.headerAccent} />
        <View style={s.headerBar}>
          <View style={s.headerLeft}>
            <Image style={s.headerLogo} src={logoSrc} />
            <View style={s.headerTextGroup}>
              <Text style={s.companyName}>PT ALHIJAZ INDOWISATA</Text>
              <Text style={s.companyIzin}>Graha Alhijaz, Jl. Dewi Sartika No. 239A, Cawang, Kramat Jati</Text>
              <Text style={s.companyIzin}>Jakarta Timur, DKI Jakarta, 13630</Text>
            </View>
          </View>
          <View style={s.headerRight}>
            <View style={s.docTitleBadge}>
              <Text style={s.docTitle}>SURAT PENAWARAN</Text>
            </View>
            <Text style={s.docSub}>ESTIMASI BIAYA UMROH</Text>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Terbit:</Text>
              <Text style={s.metaValue}>{todayStr}</Text>
              <Text style={s.metaLabel}>  •  Berlaku s.d:</Text>
              <Text style={s.metaValue}>{validDate}</Text>
            </View>
          </View>
        </View>

        {/* ─── B. DETAIL PAKET CARD ─── */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.detailLabel}>DETAIL PAKET</Text>
              <Text style={s.pkgName}>{pkg?.nama || '—'}</Text>
            </View>
            {pkg && (
              <View style={s.durationBadge}>
                <Text style={s.durationNum}>{days} HARI</Text>
                <Text style={s.durationLabel}>DURASI PERJALANAN</Text>
              </View>
            )}
          </View>

          <View style={s.cardBody}>
          {pkg && (
            <View style={s.infoRow}>
              {/* Col 1: Maskapai */}
              <View style={s.infoCol}>
                <Text style={s.infoTitle}>MASKAPAI PENERBANGAN</Text>
                <Text style={s.infoMain}>{pkg.maskapai}</Text>
                <Text style={s.infoSub}>{pkg.keberangkatan.rute} • {pkg.keberangkatan.kodePenerbangan}</Text>
              </View>
              {/* Col 2: Tanggal */}
              <View style={s.infoCol}>
                <Text style={s.infoTitle}>TANGGAL KEBERANGKATAN</Text>
                <Text style={s.infoMain}>{fmtDate(pkg.keberangkatan.tgl)}</Text>
                <Text style={s.infoSub}>Estimasi {pkg.keberangkatan.jam} WIB</Text>
              </View>
              {/* Col 3: Hotel */}
              <View style={s.infoCol}>
                <Text style={s.infoTitle}>{starLabel}</Text>
                <Text style={s.infoMain}>Makkah &amp; Madinah</Text>
                <Text style={s.infoSub}>{hotelNames}</Text>
              </View>
            </View>
          )}
          </View>
        </View>

        {/* ─── C. PRICING TABLE ─── */}
        <View style={s.sectionHeader}>
          <View style={s.sectionIcon} />
          <Text style={s.sectionTitle}>RINCIAN BIAYA PAKET</Text>
        </View>

        <View style={s.table}>
          {/* Table Head */}
          <View style={s.tableHead}>
            <View style={s.colDesc}><Text style={s.thText}>DESKRIPSI / TIPE KAMAR</Text></View>
            <View style={s.colPax}><Text style={s.thText}>PAX</Text></View>
            <View style={s.colPrice}><Text style={[s.thText, { textAlign: 'right' }]}>HARGA (IDR)</Text></View>
            <View style={s.colTotal}><Text style={[s.thText, { textAlign: 'right' }]}>TOTAL (IDR)</Text></View>
          </View>

          {/* Table Body */}
          {summary.items.map((item, idx) => (
            <View
              key={idx}
              style={[
                s.tableRow,
                idx % 2 === 1 ? { backgroundColor: C.altRow } : {},
              ]}
            >
              <View style={s.colDesc}>
                <Text style={s.tdBold}>{item.label}</Text>
                {item.note && <Text style={s.tdNote}>{item.note}</Text>}
              </View>
              <View style={s.colPax}><Text style={s.tdText}>{item.qty}</Text></View>
              <View style={s.colPrice}><Text style={s.tdText}>{fmtRp(item.unitPrice)}</Text></View>
              <View style={s.colTotal}><Text style={s.tdBold}>{fmtRp(item.total)}</Text></View>
            </View>
          ))}

          {/* Discount Row */}
          {summary.discount > 0 && (
            <View style={[s.tableRow, { backgroundColor: C.altRow }]}>
              <View style={s.colDesc}><Text style={s.discountText}>Potongan Diskon</Text></View>
              <View style={s.colPax}><Text style={s.tdText}></Text></View>
              <View style={s.colPrice}><Text style={s.tdText}></Text></View>
              <View style={s.colTotal}><Text style={s.discountText}>- {fmtRp(summary.discount)}</Text></View>
            </View>
          )}
        </View>

        {/* ─── D. TOTAL BAR ─── */}
        <View style={s.totalBar}>
          <Text style={s.totalLabel}>TOTAL KESELURUHAN</Text>
          <Text style={s.totalAmount}>IDR {fmtRp(summary.grandTotal)}</Text>
        </View>

        {/* ─── E. BOTTOM 2-COLUMN ─── */}
        <View style={s.bottomRow}>
          {/* Left: Bank Accounts */}
          <View style={s.bottomLeft}>
            <View style={s.bankSectionTitle}>
              <View style={s.sectionIcon} />
              <Text style={[s.sectionTitle, { fontSize: 8 }]}>REKENING PEMBAYARAN RESMI</Text>
              <Svg width={8} height={8} viewBox="0 0 24 24">
                <Path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" fill="#22c55e" />
                <Path d="M10 15.5l-3.5-3.5 1.41-1.41L10 12.67l5.59-5.59L17 8.5l-7 7z" fill="white" />
              </Svg>
            </View>

            {banks.map((b, i) => (
              <View key={i} style={[s.bankCard, { backgroundColor: b.bg }]}>
                <Image style={s.bankLogo} src={`${origin}${b.logo}`} />
                <View style={s.bankDivider} />
                <View style={s.bankInfo}>
                  <Text style={s.bankName}>{b.bank}</Text>
                  <Text style={s.bankRek}>{b.rek}</Text>
                  <Text style={s.bankAn}>a.n. PT. Alhijaz Indowisata</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Right: Informasi Pembayaran */}
          <View style={s.bottomRight}>
            <View style={s.noticeCard}>
              <View style={s.noticeHeader}>
                <View style={s.noticeHeaderIcon} />
                <Text style={s.noticeHeaderText}>KONFIRMASI PEMESANAN PAKET</Text>
              </View>
              <View style={s.noticeBody}>
                {/* Block 1: DP Amount — focal point */}
                <Text style={s.noticeDpLabel}>Booking Fee hanya:</Text>
                <Text style={s.noticeDpAmount}>Rp 5.000.000 / Pax</Text>

                {/* Block 2: Bullet points */}
                <View style={s.noticeBulletRow}>
                  <View style={s.noticeBulletDot} />
                  <Text style={s.noticeBulletText}>Kuota terbatas — segera amankan seat Anda</Text>
                </View>
                <View style={s.noticeBulletRow}>
                  <View style={s.noticeBulletDot} />
                  <Text style={s.noticeBulletText}>Langsung konfirmasi seat & jadwal keberangkatan</Text>
                </View>
                <View style={s.noticeBulletRow}>
                  <View style={s.noticeBulletDot} />
                  <Text style={s.noticeBulletText}>Pelunasan bisa dicicil sesuai jadwal yang disepakati</Text>
                </View>
                <View style={s.noticeBulletRow}>
                  <View style={s.noticeBulletDot} />
                  <Text style={s.noticeBulletText}>Travel resmi berizin Kemenag RI (Akreditasi A)</Text>
                </View>

                {/* Block 3: CTA */}
                <View style={s.noticeCta}>
                  <Text style={s.noticeCtaText}>Bantuan? Hubungi</Text>
                  <Text style={s.noticeCtaBold}>{agent?.name || namaLengkap || 'konsultan Anda'}</Text>
                  <Text style={s.noticeCtaText}>di</Text>
                  <Svg width={8} height={8} viewBox="0 0 24 24">
                    <Path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" fill="#25D366" />
                  </Svg>
                  <Text style={s.noticeCtaBold}>{agent ? agent.phone.replace(/^62/, '0').replace(/(\d{4})(\d{4})(\d+)/, '$1-$2-$3') : ''}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ─── DISCLAIMER ─── */}
        <View style={s.disclaimerRow}>
          <View style={s.disclaimerCol}>
            <Text style={s.disclaimerText}>Segala bentuk transaksi hanya dianggap sah apabila dilakukan ke rekening resmi perusahaan yang tertera di dokumen ini. PT Alhijaz Indowisata tidak bertanggung jawab atas transaksi yang dilakukan ke rekening pribadi agen atau pihak lain.</Text>
          </View>
          <View style={s.disclaimerCol}>
            <Text style={s.disclaimerText}>Penawaran ini tidak bersifat mengikat dan bukan merupakan jaminan ketersediaan kuota. Seat dan hotel hanya akan dipastikan (confirm) setelah pembayaran Down Payment (DP) diterima dan diverifikasi.</Text>
          </View>
        </View>

        {/* ─── F. FOOTER ─── */}
        {agent ? (
          <>
          <View style={s.agentFooterAccent} fixed />
          <View style={s.agentFooter} fixed>
            <View style={s.agentPhotoWrap}>
              <Image style={s.agentPhoto} src={agentPhotoBase64 || `${origin}${agent.photo}`} />
              <View style={s.agentBadge}>
                <Svg width={12} height={12} viewBox="0 0 24 24">
                  <Circle cx="12" cy="12" r="12" fill="#1DA1F2" />
                  <Path d="M7.5 12.5L10.5 15.5L16.5 9.5" stroke="white" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </View>
            </View>
            <View style={s.agentInfo}>
              <Text style={s.agentName}>{agent.name}</Text>
              <Text style={s.agentWebsite}>{agent.website}</Text>
              <Text style={s.agentContact}>{agent.phone.replace(/^62/, '0').replace(/(\d{4})(\d{4})(\d+)/, '$1-$2-$3')}</Text>
            </View>
            <View style={s.footerRight}>
              <View style={s.footerKemenag}>
                <Svg width={10} height={10} viewBox="0 0 24 24">
                  <Path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" fill="#22c55e" />
                  <Path d="M10 15.5l-3.5-3.5 1.41-1.41L10 12.67l5.59-5.59L17 8.5l-7 7z" fill="white" />
                </Svg>
                <Text style={s.footerKemenagText}>TERDAFTAR RESMI KEMENAG RI</Text>
              </View>
              <Text style={s.footerPtName}>PT. ALHIJAZ INDOWISATA</Text>
              <Text style={s.footerPermit}>PPIU Nomor U.490 Tahun 2020 • PIHK Nomor 304 Tahun 2022</Text>
            </View>
          </View>
          </>
        ) : (
          <View style={s.footer} fixed>
            <View style={s.footerLeft}>
              <Text style={s.footerAgentLabel}>KONSULTAN PERJALANAN</Text>
              <Text style={s.footerAgentName}>{namaLengkap || 'Konsultan Anda'}</Text>
            </View>
            <View style={s.footerRight}>
              <View style={s.footerKemenag}>
                <Svg width={10} height={10} viewBox="0 0 24 24">
                  <Path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" fill="#22c55e" />
                  <Path d="M10 15.5l-3.5-3.5 1.41-1.41L10 12.67l5.59-5.59L17 8.5l-7 7z" fill="white" />
                </Svg>
                <Text style={s.footerKemenagText}>TERDAFTAR RESMI KEMENAG RI</Text>
              </View>
              <Text style={s.footerPtName}>PT. ALHIJAZ INDOWISATA</Text>
              <Text style={s.footerPermit}>PPIU Nomor U.490 Tahun 2020 • PIHK Nomor 304 Tahun 2022</Text>
            </View>
          </View>
        )}

      </Page>
    </Document>
  );
}

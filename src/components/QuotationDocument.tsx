import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { UmrohPackage } from '@/types';
import type { AgentData } from '@/data/agents';

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
  page: { fontFamily: 'Helvetica', fontSize: 8, color: C.dark, paddingBottom: 60 },

  // Header
  headerBar: { backgroundColor: C.primary, paddingVertical: 14, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerLogo: { width: 40, height: 40, borderRadius: 6 },
  headerTextGroup: { flex: 1 },
  headerRight: { alignItems: 'flex-end', flex: 1 },
  companyName: { fontFamily: 'Helvetica-Bold', fontSize: 16, color: C.white, marginBottom: 2 },
  companyIzin: { fontSize: 7, color: '#ffffffcc', marginBottom: 1 },
  companySub: { fontSize: 6.5, color: '#ffffff99' },
  docTitle: { fontFamily: 'Helvetica-Bold', fontSize: 14, color: C.white, marginBottom: 2 },
  docSub: { fontSize: 6.5, color: '#ffffff99', marginBottom: 6 },
  metaRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 4, marginBottom: 1.5 },
  metaLabel: { fontSize: 6.5, color: '#ffffffaa' },
  metaValue: { fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.white },

  // Detail Paket card
  card: { marginHorizontal: 20, marginTop: 10, backgroundColor: C.bgLight, borderRadius: 4, border: `0.5pt solid ${C.divider}`, padding: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  detailLabel: { fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.primary, marginBottom: 3 },
  pkgName: { fontFamily: 'Helvetica-Bold', fontSize: 13, color: C.dark },
  durationBadge: { alignItems: 'flex-end' },
  durationNum: { fontFamily: 'Helvetica-Bold', fontSize: 18, color: C.primary },
  durationLabel: { fontSize: 6.5, color: C.gray },
  cardDivider: { borderBottomWidth: 0.5, borderBottomColor: C.divider, marginBottom: 8 },
  infoRow: { flexDirection: 'row', gap: 6 },
  infoCol: { flex: 1 },
  infoTitle: { fontSize: 5.5, color: C.lightGray, marginBottom: 2, textTransform: 'uppercase' as const },
  infoMain: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.dark, marginBottom: 1.5 },
  infoSub: { fontSize: 6.5, color: C.gray },

  // Table section
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginTop: 12, marginBottom: 4, gap: 4 },
  sectionIcon: { width: 3, height: 3, backgroundColor: C.primary },
  sectionTitle: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.dark },

  // Table
  table: { marginHorizontal: 20 },
  tableHead: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.divider, paddingBottom: 5, paddingTop: 3 },
  thText: { fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.gray },
  tableRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 0.3, borderBottomColor: '#eeeeee' },
  tdText: { fontSize: 8, color: C.dark },
  tdBold: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.dark },
  tdNote: { fontSize: 6.5, color: C.gray, marginTop: 1 },
  discountText: { fontFamily: 'Helvetica-Oblique', fontSize: 8, color: '#b41e1e' },

  // Column widths (percentage-like flex)
  colDesc: { flex: 5 },
  colPax: { width: 32, alignItems: 'center' as const },
  colPrice: { width: 72, alignItems: 'flex-end' as const },
  colTotal: { width: 68, alignItems: 'flex-end' as const },

  // Total bar
  totalBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.primary, marginHorizontal: 20, paddingVertical: 8, paddingHorizontal: 12, marginTop: 0 },
  totalLabel: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.white },
  totalAmount: { fontFamily: 'Helvetica-Bold', fontSize: 14, color: C.white },

  // Bottom 2-column
  bottomRow: { flexDirection: 'row', marginHorizontal: 20, marginTop: 12, gap: 10 },
  bottomLeft: { flex: 1 },
  bottomRight: { flex: 1 },

  // Bank cards
  bankSectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  bankCard: { backgroundColor: C.bgBank, borderRadius: 3, border: `0.3pt solid ${C.divider}`, borderLeftWidth: 3, borderLeftColor: C.primary, paddingVertical: 5, paddingHorizontal: 8, marginBottom: 4 },
  bankCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  bankName: { fontSize: 5.5, color: C.lightGray, marginBottom: 1.5 },
  bankRek: { fontFamily: 'Helvetica-Bold', fontSize: 9.5, color: C.dark },
  bankAn: { fontFamily: 'Helvetica-Oblique', fontSize: 5.5, color: C.primary },

  // Notice
  noticeTitle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  noticeBadge: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ea580c', alignItems: 'center' as const, justifyContent: 'center' as const },
  noticeBadgeText: { fontFamily: 'Helvetica-Bold', fontSize: 5.5, color: C.white },
  noticeTitleText: { fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.primary },
  noticeBody: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: C.dark, marginBottom: 8, lineHeight: 1.4 },
  noticeDisclaimer: { fontFamily: 'Helvetica-Oblique', fontSize: 6.5, color: C.gray, lineHeight: 1.4 },

  // Footer
  footer: { position: 'absolute' as const, bottom: 0, left: 0, right: 0, backgroundColor: C.bgLight, borderTopWidth: 0.3, borderTopColor: C.divider, paddingVertical: 8, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerLeft: {},
  footerAgentLabel: { fontSize: 5.5, color: C.lightGray, marginBottom: 1 },
  footerAgentName: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.dark },
  footerRight: { alignItems: 'flex-end' as const },
  footerKemenag: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2 },
  footerKemenagDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#22c55e' },
  footerKemenagText: { fontFamily: 'Helvetica-Bold', fontSize: 6.5, color: C.dark },
  footerCopy: { fontFamily: 'Helvetica-Oblique', fontSize: 5.5, color: C.lightGray },

  // Agent profile footer
  agentFooter: { position: 'absolute' as const, bottom: 0, left: 0, right: 0, backgroundColor: C.bgLight, borderTopWidth: 0.5, borderTopColor: C.divider, paddingVertical: 10, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 10 },
  agentPhoto: { width: 36, height: 36, borderRadius: 18, objectFit: 'cover' as const },
  agentInfo: { flex: 1 },
  agentLabel: { fontSize: 5.5, color: C.lightGray, marginBottom: 2, textTransform: 'uppercase' as const },
  agentName: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: C.dark, marginBottom: 2 },
  agentContact: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: C.primary },
});

// ── Banks Data ──
const banks = [
  { bank: 'BANK SYARIAH INDONESIA (BSI)', rek: '711 555 8888' },
  { bank: 'BANK MANDIRI', rek: '123 00 0567890 1' },
  { bank: 'BANK BCA', rek: '883 0456 777' },
];

// ═══════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════
export function QuotationDocument({ pkg, summary, namaLengkap, agent }: QuotationProps) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const logoSrc = `${origin}/icon-192x192.png`;
  const now = new Date();
  const docId = `Q-${now.getFullYear()}-${now.toLocaleString('en', { month: 'short' }).toUpperCase()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const todayStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const validDate = new Date(now.getTime() + 7 * 86400000).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  // Duration
  let days = 0;
  if (pkg) {
    const dep = new Date(pkg.keberangkatan.tgl);
    const ret = new Date(pkg.kepulangan.tgl);
    days = Math.ceil((ret.getTime() - dep.getTime()) / 86400000);
  }

  // Hotel info
  const firstTier = pkg ? Object.keys(pkg.hotel)[0] : null;
  const hotelData = firstTier && pkg ? (pkg.hotel[firstTier] as unknown as Record<string, string>) : null;
  const starLabel = hotelData?.mekkah_bintang ? `AKOMODASI HOTEL (${hotelData.mekkah_bintang} ★)` : 'AKOMODASI HOTEL';
  const hotelNames = hotelData ? [hotelData.mekkah_hotel, hotelData.madinah_hotel].filter(Boolean).join(' / ') : '—';

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ─── A. HEADER BAR ─── */}
        <View style={s.headerBar}>
          <View style={s.headerLeft}>
            <Image style={s.headerLogo} src={logoSrc} />
            <View style={s.headerTextGroup}>
              <Text style={s.companyName}>ALHIJAZ INDOWISATA</Text>
              <Text style={s.companyIzin}>IZIN UMROH NO. U.490 TAHUN 2020</Text>
              <Text style={s.companySub}>Travel Umroh &amp; Haji Plus Resmi Kemenag RI</Text>
            </View>
          </View>
          <View style={s.headerRight}>
            <Text style={s.docTitle}>PENAWARAN RESMI</Text>
            <Text style={s.docSub}>ESTIMASI ITINERARY &amp; BIAYA</Text>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>ID Dokumen:</Text>
              <Text style={s.metaValue}>{docId}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Tanggal Terbit:</Text>
              <Text style={s.metaValue}>{todayStr}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Berlaku Hingga:</Text>
              <Text style={s.metaValue}>{validDate}</Text>
            </View>
          </View>
        </View>

        {/* ─── B. DETAIL PAKET CARD ─── */}
        <View style={s.card}>
          <View style={s.cardTop}>
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

          <View style={s.cardDivider} />

          {pkg && (
            <View style={s.infoRow}>
              {/* Col 1: Maskapai */}
              <View style={s.infoCol}>
                <Text style={s.infoTitle}>MASKAPAI PENERBANGAN</Text>
                <Text style={s.infoMain}>{pkg.maskapai}</Text>
                <Text style={s.infoSub}>{pkg.keberangkatan.rute}</Text>
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
            <View style={s.colPrice}><Text style={[s.thText, { textAlign: 'right' }]}>HARGA SATUAN (IDR)</Text></View>
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
            </View>

            {banks.map((b, i) => (
              <View key={i} style={s.bankCard}>
                <View style={s.bankCardRow}>
                  <View>
                    <Text style={s.bankName}>{b.bank}</Text>
                    <Text style={s.bankRek}>{b.rek}</Text>
                  </View>
                  <Text style={s.bankAn}>PT. ALHIJAZ INDOWISATA</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Right: Pemberitahuan Penting */}
          <View style={s.bottomRight}>
            <View style={s.noticeTitle}>
              <View style={s.noticeBadge}>
                <Text style={s.noticeBadgeText}>i</Text>
              </View>
              <Text style={s.noticeTitleText}>PEMBERITAHUAN PENTING</Text>
            </View>

            <Text style={s.noticeBody}>
              MOHON TRANSFER DP MINIMAL RP 5.000.000 / PAX UNTUK MENGAMANKAN SEAT.
            </Text>

            <Text style={s.noticeDisclaimer}>
              Ketersediaan kursi terbatas. Harga dapat berubah sewaktu-waktu mengikuti kurs valuta asing dan kebijakan maskapai tanpa pemberitahuan tertulis sebelumnya. Silakan konfirmasi bukti bayar kepada konsultan perjalanan Anda.
            </Text>
          </View>
        </View>

        {/* ─── F. FOOTER ─── */}
        {agent ? (
          <View style={s.agentFooter} fixed>
            <Image style={s.agentPhoto} src={`${origin}${agent.photo}`} />
            <View style={s.agentInfo}>
              <Text style={s.agentLabel}>KONSULTAN PERJALANAN</Text>
              <Text style={s.agentName}>{agent.name}</Text>
              <Text style={s.agentContact}>+{agent.phone.replace(/^62/, '62 ').replace(/(\d{3,4})(?=\d)/g, '$1-').replace(/-$/, '')}</Text>
            </View>
            <View style={s.footerRight}>
              <View style={s.footerKemenag}>
                <View style={s.footerKemenagDot} />
                <Text style={s.footerKemenagText}>TERDAFTAR RESMI KEMENAG RI</Text>
              </View>
              <Text style={s.footerCopy}>Dokumen ini dihasilkan secara otomatis dan merupakan ringkasan resmi.</Text>
              <Text style={s.footerCopy}>PT. Alhijaz Indowisata Tours &amp; Travel © {now.getFullYear()}.</Text>
            </View>
          </View>
        ) : (
          <View style={s.footer} fixed>
            <View style={s.footerLeft}>
              <Text style={s.footerAgentLabel}>KONSULTAN PERJALANAN</Text>
              <Text style={s.footerAgentName}>{namaLengkap || 'Konsultan Anda'}</Text>
            </View>
            <View style={s.footerRight}>
              <View style={s.footerKemenag}>
                <View style={s.footerKemenagDot} />
                <Text style={s.footerKemenagText}>TERDAFTAR RESMI KEMENAG RI</Text>
              </View>
              <Text style={s.footerCopy}>Dokumen ini dihasilkan secara otomatis dan merupakan ringkasan resmi.</Text>
              <Text style={s.footerCopy}>PT. Alhijaz Indowisata Tours &amp; Travel © {now.getFullYear()}.</Text>
            </View>
          </View>
        )}

      </Page>
    </Document>
  );
}

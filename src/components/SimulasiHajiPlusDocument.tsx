import { Document, Page, View, Text, Image, StyleSheet, Font, Svg, Path } from '@react-pdf/renderer';

// ── Register Inter font ──
Font.register({
  family: 'Inter',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf', fontWeight: 'normal' },
    { src: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf', fontWeight: 'bold' },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

// ── Types ──
export interface SimulasiDocProps {
  pkg: { id: string; name: string; stars: number; priceUSD: number; hotel: string };
  calc: { totalUSD: number; totalIDR: number; dpUSD: number; dpIDR: number; sisaUSD: number; sisaIDR: number; deadlineLabel: string; diffMonths: number };
  jumlahJamaah: number;
  tahunBerangkat: number;
  namaJamaah: string;
  kursUSD: number;
  kursDate: string;
}

// ── Colors (matching QuotationDocument pattern) ──
const C = {
  primary: '#065f46',
  primaryDark: '#064e3b',
  primaryLight: '#f0fdf4',
  amber: '#92400e',
  amberLight: '#fffbeb',
  dark: '#1f2937',
  gray: '#6b7280',
  lightGray: '#9ca3af',
  bgLight: '#f3f4f6',
  white: '#ffffff',
  divider: '#e5e7eb',
};

// ── Helpers ──
const fmtUSD = (n: number) => `$${n.toLocaleString('en-US')}`;
const fmtRp = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;
const starsStr = (n: number) => '★'.repeat(n);

// ── Styles ──
const s = StyleSheet.create({
  page: { fontFamily: 'Inter', fontSize: 8, color: C.dark, paddingBottom: 60 },
  watermark: { position: 'absolute', bottom: 35, left: '10%', width: '80%', opacity: 0.04 },

  // Header (same pattern as QuotationDocument)
  headerAccent: { backgroundColor: C.primary, height: 4 },
  headerBar: { backgroundColor: C.white, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 0.5, borderBottomColor: C.divider },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerLogo: { width: 28, height: 28, borderRadius: 4 },
  headerTextGroup: { flex: 1 },
  companyName: { fontFamily: 'Inter', fontWeight: 'bold', fontSize: 11, color: C.primary, marginBottom: 1 },
  companyIzin: { fontSize: 5, color: C.gray, marginBottom: 0.5 },
  headerRight: { alignItems: 'flex-end', flex: 1 },
  docTitleBadge: { backgroundColor: C.primary, borderRadius: 2, paddingVertical: 2, paddingHorizontal: 6, marginBottom: 3, alignSelf: 'flex-end' },
  docTitle: { fontFamily: 'Inter', fontWeight: 'bold', fontSize: 7, color: C.white, textAlign: 'center' },
  docSub: { fontSize: 5, color: C.gray, marginBottom: 1.5, textAlign: 'right' },
  metaRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 3, marginBottom: 1 },
  metaLabel: { fontSize: 5, color: C.lightGray },
  metaValue: { fontFamily: 'Inter', fontWeight: 'bold', fontSize: 5.5, color: C.dark },

  // Info row
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 14, marginTop: 10, marginBottom: 12 },
  infoLabel: { fontSize: 6, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.8 },
  infoValue: { fontSize: 13, fontWeight: 'bold', color: C.dark, marginTop: 2 },
  infoSmall: { fontSize: 6, color: C.lightGray, marginTop: 2 },

  // Paket card
  paketCard: { marginHorizontal: 14, borderRadius: 4, borderWidth: 0.5, borderColor: C.divider, marginBottom: 12 },
  paketCardHeader: { backgroundColor: C.primaryDark, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  paketName: { fontFamily: 'Inter', fontWeight: 'bold', fontSize: 11, color: C.white },
  paketStars: { fontSize: 8, color: '#fbbf24' },
  paketCardBody: { backgroundColor: C.bgLight, paddingVertical: 8, paddingHorizontal: 12, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, flexDirection: 'row', justifyContent: 'space-between' },

  // Table
  table: { marginHorizontal: 14, marginBottom: 12 },
  tableHead: { flexDirection: 'row', backgroundColor: C.bgLight, borderBottomWidth: 0.5, borderBottomColor: C.divider, paddingBottom: 5, paddingTop: 5, paddingHorizontal: 4 },
  thText: { fontFamily: 'Inter', fontWeight: 'bold', fontSize: 7, color: C.gray },
  tableRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 0.3, borderBottomColor: '#eeeeee' },
  tdText: { fontSize: 8, color: C.dark },
  tdBold: { fontFamily: 'Inter', fontWeight: 'bold', fontSize: 8, color: C.dark },
  totalBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#374151', marginHorizontal: 14, paddingVertical: 5, paddingHorizontal: 12, borderRadius: 2, marginBottom: 12 },
  totalLabel: { fontFamily: 'Inter', fontWeight: 'bold', fontSize: 7, color: C.white },
  totalAmount: { fontFamily: 'Inter', fontWeight: 'bold', fontSize: 10, color: C.white },

  // Payment boxes
  paymentRow: { flexDirection: 'row', marginHorizontal: 14, gap: 10, marginBottom: 12 },
  paymentBox: { flex: 1, borderRadius: 4, padding: '10 12' },
  paymentStep: { fontSize: 7, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  paymentAmount: { fontSize: 12, fontWeight: 'bold', marginBottom: 2 },
  paymentSub: { fontSize: 7 },
  paymentNote: { fontSize: 7, marginTop: 4 },

  // Timeline
  timelineSection: { marginHorizontal: 14, marginBottom: 12 },
  timelineLabel: { fontSize: 8, fontWeight: 'bold', color: C.gray, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  timelineRow: { flexDirection: 'row', alignItems: 'center' },
  timelineDot: { width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  timelineDotText: { fontSize: 9 },
  timelineContent: { marginLeft: 8, flex: 1, padding: '4 0' },
  timelineTitle: { fontSize: 8, fontWeight: 'bold', color: C.dark },
  timelineDesc: { fontSize: 7, color: C.gray, marginTop: 1 },

  // Notes
  notesBox: { marginHorizontal: 14, backgroundColor: C.bgLight, borderRadius: 4, padding: '10 12', marginBottom: 12 },
  notesTitle: { fontSize: 7, fontWeight: 'bold', color: C.gray, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  noteItem: { fontSize: 6.5, color: '#4b5563', marginBottom: 2, lineHeight: 1.4 },

  // Footer (same as QuotationDocument)
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.bgLight, borderTopWidth: 0.3, borderTopColor: C.divider, paddingVertical: 8, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerLeft: {},
  footerLabel: { fontSize: 5.5, color: C.lightGray, marginBottom: 1 },
  footerName: { fontFamily: 'Inter', fontWeight: 'bold', fontSize: 9, color: C.dark },
  footerRight: { alignItems: 'flex-end' },
  footerKemenag: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2 },
  footerKemenagText: { fontFamily: 'Inter', fontWeight: 'bold', fontSize: 6.5, color: C.dark },
  footerPtName: { fontFamily: 'Inter', fontWeight: 'bold', fontSize: 5.5, color: C.dark, marginBottom: 2, textAlign: 'right' },
  footerPermit: { fontSize: 5.5, color: C.gray, textAlign: 'right' },
});

export default function SimulasiHajiPlusDocument({ pkg, calc, jumlahJamaah, tahunBerangkat, namaJamaah, kursUSD, kursDate }: SimulasiDocProps) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const logoSrc = `${origin}/icon-192x192.png`;
  const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Watermark */}
        <Image style={s.watermark} src={`${origin}/logo-alhijaz-besar.png`} fixed />

        {/* ─── HEADER (same as QuotationDocument) ─── */}
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
              <Text style={s.docTitle}>SIMULASI BIAYA</Text>
            </View>
            <Text style={s.docSub}>ESTIMASI BIAYA HAJI PLUS</Text>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Terbit:</Text>
              <Text style={s.metaValue}>{today}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Kurs USD:</Text>
              <Text style={s.metaValue}>{fmtRp(kursUSD)} ({kursDate})</Text>
            </View>
          </View>
        </View>

        {/* ─── INFO ROW ─── */}
        <View style={s.infoRow}>
          <View>
            <Text style={s.infoLabel}>Disiapkan untuk</Text>
            <Text style={s.infoValue}>{namaJamaah || 'Calon Jamaah'}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.infoLabel}>Tahun Keberangkatan</Text>
            <Text style={s.infoValue}>{tahunBerangkat}</Text>
          </View>
        </View>

        {/* ─── PAKET CARD ─── */}
        <View style={s.paketCard}>
          <View style={s.paketCardHeader}>
            <View>
              <Text style={{ fontSize: 5.5, fontWeight: 'bold', color: '#ffffffaa', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>PAKET HAJI PLUS</Text>
              <Text style={s.paketName}>{pkg.name} {starsStr(pkg.stars)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', backgroundColor: '#ffffff22', borderRadius: 3, paddingVertical: 4, paddingHorizontal: 8 }}>
              <Text style={{ fontFamily: 'Inter', fontWeight: 'bold', fontSize: 14, color: C.white }}>{fmtUSD(pkg.priceUSD)}</Text>
              <Text style={{ fontSize: 5, color: '#ffffffaa' }}>PER JAMAAH</Text>
            </View>
          </View>
          <View style={s.paketCardBody}>
            <View>
              <Text style={{ fontSize: 5, color: C.gray, textTransform: 'uppercase', marginBottom: 2 }}>Akomodasi</Text>
              <Text style={{ fontSize: 7, fontWeight: 'bold', color: C.dark }}>{pkg.hotel}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 5, color: C.gray, textTransform: 'uppercase', marginBottom: 2 }}>Jumlah Jamaah</Text>
              <Text style={{ fontSize: 7, fontWeight: 'bold', color: C.dark }}>{jumlahJamaah} orang</Text>
            </View>
          </View>
        </View>

        {/* ─── RINCIAN TABLE ─── */}
        <View style={s.table}>
          <View style={s.tableHead}>
            <Text style={[s.thText, { flex: 4, paddingLeft: 6 }]}>Keterangan</Text>
            <Text style={[s.thText, { width: 32, textAlign: 'center' }]}>Qty</Text>
            <Text style={[s.thText, { width: 72, textAlign: 'right' }]}>USD</Text>
            <Text style={[s.thText, { width: 72, textAlign: 'right', paddingRight: 6 }]}>Est. IDR</Text>
          </View>
          <View style={s.tableRow}>
            <Text style={[s.tdText, { flex: 4, paddingLeft: 6 }]}>Paket {pkg.name} {starsStr(pkg.stars)}</Text>
            <Text style={[s.tdText, { width: 32, textAlign: 'center' }]}>{jumlahJamaah}</Text>
            <Text style={[s.tdBold, { width: 72, textAlign: 'right' }]}>{fmtUSD(calc.totalUSD)}</Text>
            <Text style={[s.tdText, { width: 72, textAlign: 'right', paddingRight: 6 }]}>{fmtRp(calc.totalIDR)}</Text>
          </View>
        </View>

        {/* ─── TOTAL BAR ─── */}
        <View style={s.totalBar}>
          <Text style={s.totalLabel}>TOTAL BIAYA</Text>
          <Text style={s.totalAmount}>{fmtUSD(calc.totalUSD)}</Text>
        </View>

        {/* ─── PAYMENT BREAKDOWN ─── */}
        <View style={s.paymentRow}>
          <View style={[s.paymentBox, { backgroundColor: C.primaryLight }]}>
            <Text style={[s.paymentStep, { color: C.primary }]}>1 · DP Pendaftaran</Text>
            <Text style={[s.paymentAmount, { color: C.primaryDark }]}>{fmtUSD(calc.dpUSD)}</Text>
            <Text style={[s.paymentSub, { color: C.primary }]}>≈ {fmtRp(calc.dpIDR)}</Text>
            <Text style={[s.paymentNote, { color: C.gray }]}>Dibayar saat mendaftar</Text>
          </View>
          <View style={[s.paymentBox, { backgroundColor: C.amberLight }]}>
            <Text style={[s.paymentStep, { color: C.amber }]}>2 · Pelunasan</Text>
            <Text style={[s.paymentAmount, { color: C.amber }]}>{fmtUSD(calc.sisaUSD)}</Text>
            <Text style={[s.paymentSub, { color: C.amber }]}>≈ {fmtRp(calc.sisaIDR)}</Text>
            <Text style={[s.paymentNote, { color: C.gray }]}>Maks. {calc.deadlineLabel}</Text>
          </View>
        </View>

        {/* ─── TIMELINE ─── */}
        <View style={s.timelineSection}>
          <Text style={s.timelineLabel}>Timeline Perjalanan</Text>
          {[
            { emoji: '📝', label: 'Daftar & Bayar DP', desc: `${fmtUSD(calc.dpUSD)} · Saat pendaftaran`, color: C.primary },
            { emoji: '⏳', label: 'Masa Tunggu', desc: `±${calc.diffMonths} bulan · Persiapan dokumen & manasik`, color: '#2563eb' },
            { emoji: '💰', label: 'Pelunasan', desc: `${fmtUSD(calc.sisaUSD)} · Maks. ${calc.deadlineLabel}`, color: C.amber },
            { emoji: '🕋', label: 'Berangkat Haji!', desc: `Tahun ${tahunBerangkat} · Insya Allah`, color: C.primary },
          ].map((step, i, arr) => (
            <View key={i}>
              <View style={s.timelineRow}>
                <View style={[s.timelineDot, { backgroundColor: step.color }]}>
                  <Text style={s.timelineDotText}>{step.emoji}</Text>
                </View>
                <View style={s.timelineContent}>
                  <Text style={s.timelineTitle}>{step.label}</Text>
                  <Text style={s.timelineDesc}>{step.desc}</Text>
                </View>
              </View>
              {i < arr.length - 1 && (
                <View style={{ height: 8, paddingLeft: 9.5 }}>
                  <View style={{ width: 1, height: 8, backgroundColor: C.divider }} />
                </View>
              )}
            </View>
          ))}
        </View>

        {/* ─── CATATAN ─── */}
        <View style={s.notesBox}>
          <Text style={s.notesTitle}>Catatan</Text>
          <Text style={s.noteItem}>• Harga dalam USD, konversi IDR bersifat estimasi berdasarkan kurs saat ini</Text>
          <Text style={s.noteItem}>• Kurs yang digunakan dapat berubah sewaktu-waktu mengikuti kurs Bank Mandiri</Text>
          <Text style={s.noteItem}>• Biaya tidak termasuk perlengkapan haji, handling, dan tips</Text>
          <Text style={s.noteItem}>• Jadwal keberangkatan dapat berubah sesuai kuota Kementerian Agama</Text>
        </View>

        {/* ─── FOOTER (same as QuotationDocument) ─── */}
        <View style={s.footer} fixed>
          <View style={s.footerLeft}>
            <Text style={s.footerLabel}>SIMULASI UNTUK</Text>
            <Text style={s.footerName}>{namaJamaah || 'Calon Jamaah'}</Text>
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

      </Page>
    </Document>
  );
}

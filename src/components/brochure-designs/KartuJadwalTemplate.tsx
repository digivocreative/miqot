// Desain brosur "Kartu Jadwal" & "Kartu Ringkas" — tiap keberangkatan jadi
// kartu putih melayang: blok tanggal merah di kiri, chip harga di kanan,
// kartu PROMO/HEMAT berlatar emas. Dua varian berbagi kartu & footer:
//  · Kartu Jadwal  — hero merah besar di belakang judul, kartu menumpang
//    di tepi bawahnya.
//  · Kartu Ringkas — pita merah tipis berisi logo, judul satu baris rata kiri;
//    ruang hemat dipakai untuk kartu yang lebih tinggi.
import type { CSSProperties } from 'react';
import { Clock3, Globe, Plane, Users } from 'lucide-react';
import {
  BROCHURE_W,
  BROCHURE_H,
  BROCHURE_FONT_FACE_CSS,
  BROCHURE_FONT_STACK,
  BROCHURE_OSWALD_FONT_STACK,
  BROCHURE_ROBOTO_CONDENSED_FONT_STACK,
  BROCHURE_MONTSERRAT_FONT_STACK,
  landingUrlForAgent,
  type BrochurePackage,
} from '../BrochureScheduleTemplate';
import { brochureRowModel, fitTitleFontSize, type BrochureDesignTemplateProps } from './designShared';
import {
  KABAH_IMAGE,
  LOGO_WHITE_FULL,
  LowerLandmarks,
  NABAWI_WIDE_IMAGE,
  PASTI_UMRAH_IMAGE,
  PackagePills,
  SoldOutStamp,
  TruncationNote,
  WhiteAgentFooter,
} from './designParts';

const RED = '#C8102E';
const DEEP = '#870018';
const DARK = '#5A0010';
const PALE = '#F8DFA1';
const INK = '#241A1C';
const MUTED = '#6F6264';
const CREAM = '#FFF8F0';
const CARD_LINE = '#F0DCC4';
const RED_GRADIENT = `linear-gradient(160deg, ${DEEP} 0%, ${RED} 100%)`;

interface CardMetrics {
  dateW: number;
  day: number;
  mon: number;
  name: number;
  meta: number;
  gap: number;
  priceW: number;
  price: number;
  jt: number;
  minH: number;
  maxH: number;
}

// Kartu adalah flex-item yang membagi rata ruang daftar: paket sedikit →
// mentok maxH (sisa ruang jatuh di atas footer, diisi LowerLandmarks); 10
// paket → menyusut ke arah minH tapi tetap rata.
const HERO_CARD: CardMetrics = { dateW: 92, day: 42, mon: 15, name: 25, meta: 14, gap: 18, priceW: 134, price: 38, jt: 17, minH: 78, maxH: 92 };
const COMPACT_CARD: CardMetrics = { dateW: 100, day: 46, mon: 16, name: 26, meta: 15, gap: 20, priceW: 142, price: 40, jt: 18, minH: 80, maxH: 98 };

function ScheduleCard({ p, displayMode, m }: { p: BrochurePackage; displayMode: 'hari' | 'seat'; m: CardMetrics }) {
  const row = brochureRowModel(p, displayMode);
  const highlighted = !row.soldOut && row.chip !== null;
  const fade: CSSProperties = row.soldOut ? { opacity: 0.58 } : {};
  const metaIcon = Math.round(m.meta * 1.12);

  return (
    <div style={{
      flex: '1 1 0', minHeight: m.minH, maxHeight: m.maxH,
      display: 'flex', alignItems: 'center', gap: m.gap, paddingRight: 16,
      borderRadius: 18, overflow: 'hidden', boxSizing: 'border-box',
      background: row.soldOut ? '#F5F6F8' : highlighted ? '#FFF7E0' : '#FFFFFF',
      border: highlighted ? '2px solid #EEC461' : `1px solid ${row.soldOut ? '#E2E8F0' : CARD_LINE}`,
      boxShadow: '0 8px 22px rgba(90,0,16,0.10)',
    }}>
      <div style={{
        width: m.dateW, alignSelf: 'stretch', flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
        background: row.soldOut ? 'linear-gradient(160deg, #6B7686 0%, #475060 100%)' : RED_GRADIENT,
      }}>
        <span style={{ fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 700, fontSize: m.day, lineHeight: 1, color: '#FFFFFF', whiteSpace: 'nowrap' }}>{row.day}</span>
        <span style={{ fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 500, fontSize: m.mon, lineHeight: 1, letterSpacing: 2, color: row.soldOut ? '#E2E8F0' : PALE, whiteSpace: 'nowrap' }}>{row.monthAbbr}</span>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, ...fade }}>
        <span style={{
          fontFamily: BROCHURE_ROBOTO_CONDENSED_FONT_STACK, fontWeight: 700, fontSize: m.name, lineHeight: 1.04,
          color: row.soldOut ? '#64748B' : INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{row.name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {p.maskapai && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, color: MUTED }}>
              <Plane size={metaIcon} strokeWidth={2.2} />
              <span style={{ fontFamily: BROCHURE_FONT_STACK, fontWeight: 700, fontSize: m.meta, letterSpacing: 0.6, lineHeight: 1, whiteSpace: 'nowrap' }}>{p.maskapai}</span>
            </span>
          )}
          {row.metaLabel && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, color: row.seatCritical ? '#7C2D12' : DEEP,
              ...(row.seatCritical ? { background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 999, padding: '2px 9px' } : {}),
            }}>
              {displayMode === 'seat' ? <Users size={metaIcon} strokeWidth={2.4} /> : <Clock3 size={metaIcon} strokeWidth={2.4} />}
              <span style={{ fontFamily: BROCHURE_FONT_STACK, fontWeight: 800, fontSize: m.meta, letterSpacing: 0.6, lineHeight: 1, whiteSpace: 'nowrap' }}>{row.metaLabel}</span>
            </span>
          )}
          <PackagePills pills={row.pills} soldOut={row.soldOut} />
        </div>
      </div>

      {row.soldOut ? (
        <div style={{ width: m.priceW, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
          <SoldOutStamp />
        </div>
      ) : (
        <div style={{
          width: m.priceW, flexShrink: 0, boxSizing: 'border-box', padding: '10px 16px', borderRadius: 14,
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4,
          background: highlighted ? '#FFFFFF' : '#FDEEF0',
        }}>
          {highlighted && (
            <span style={{ fontFamily: BROCHURE_FONT_STACK, fontWeight: 900, fontSize: 11, letterSpacing: 1.6, lineHeight: 1, color: '#B7791F', whiteSpace: 'nowrap' }}>{row.chip}</span>
          )}
          {row.priceJt ? (
            <span style={{ fontFamily: BROCHURE_MONTSERRAT_FONT_STACK, color: DEEP, lineHeight: 1, whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: m.price, fontWeight: 900, letterSpacing: -0.5 }}>{row.priceJt}</span>
              <span style={{ fontSize: m.jt, fontWeight: 800 }}> Jt</span>
            </span>
          ) : (
            <span style={{ fontFamily: BROCHURE_MONTSERRAT_FONT_STACK, fontSize: 15, fontWeight: 800, color: DEEP, lineHeight: 1.1, whiteSpace: 'nowrap' }}>Hubungi kami</span>
          )}
        </div>
      )}
    </div>
  );
}

function CardList({ packages, displayMode, m, margin }: {
  packages: BrochurePackage[];
  displayMode: 'hari' | 'seat';
  m: CardMetrics;
  margin: string;
}) {
  return (
    <div style={{ position: 'relative', zIndex: 2, flex: '1 1 auto', minHeight: 0, margin, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {packages.map(p => <ScheduleCard key={p.id} p={p} displayMode={displayMode} m={m} />)}
    </div>
  );
}

const ROOT_STYLE: CSSProperties = {
  width: BROCHURE_W,
  height: BROCHURE_H,
  position: 'relative',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: BROCHURE_FONT_STACK,
  fontSynthesis: 'none',
  background: CREAM,
  color: INK,
};

export function KartuJadwalTemplate({ month, agent, displayMode = 'hari' }: BrochureDesignTemplateProps) {
  const title = month.label.toUpperCase();
  return (
    <div style={ROOT_STYLE}>
      <style>{BROCHURE_FONT_FACE_CSS}</style>

      {/* Hero merah di belakang header + judul; kartu pertama menumpang di tepinya. */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 428, zIndex: 0, overflow: 'hidden',
        borderRadius: '0 0 40px 40px',
        background: `linear-gradient(160deg, ${DARK} 0%, #A50A24 55%, ${RED} 100%)`,
      }}>
        <img src={NABAWI_WIDE_IMAGE} alt="" style={{ position: 'absolute', left: 560, top: -92, width: 540, height: 'auto', opacity: 0.17 }} />
        <img src={KABAH_IMAGE} alt="" style={{ position: 'absolute', left: -110, top: 120, width: 310, height: 'auto', opacity: 0.08 }} />
      </div>
      <LowerLandmarks bottom={196} />

      <div style={{ position: 'relative', zIndex: 2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '44px 50px 0' }}>
        <img src={LOGO_WHITE_FULL} alt="Alhijaz" style={{ height: 56, width: 'auto', display: 'block' }} />
        <img src={PASTI_UMRAH_IMAGE} alt="5 Pasti Umrah" style={{ width: 84, height: 'auto', display: 'block' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 2, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '14px 50px 0' }}>
        <span style={{ fontFamily: BROCHURE_MONTSERRAT_FONT_STACK, fontWeight: 800, fontSize: 34, letterSpacing: 6, lineHeight: 1.2, color: PALE, whiteSpace: 'nowrap' }}>PAKET UMROH</span>
        <span style={{
          fontFamily: BROCHURE_MONTSERRAT_FONT_STACK, fontWeight: 900, fontSize: fitTitleFontSize(title, 950, 104, 48),
          lineHeight: 1, letterSpacing: -1, color: '#FFFFFF', whiteSpace: 'nowrap',
        }}>{title}</span>
        <span style={{
          display: 'inline-flex', alignItems: 'center', padding: '10px 24px 11px', borderRadius: 999, marginTop: 4,
          background: '#FFFFFF', color: DEEP, fontSize: 24, fontWeight: 900, lineHeight: 1, whiteSpace: 'nowrap',
        }}>{landingUrlForAgent(agent)}</span>
      </div>

      <CardList packages={month.packages} displayMode={displayMode} m={HERO_CARD} margin="26px 50px 24px" />
      <TruncationNote count={month.truncatedCount} agent={agent} color={DEEP} border="#E8CDB0" />
      <WhiteAgentFooter agent={agent} margin="0 50px 46px" border={CARD_LINE} />
    </div>
  );
}

export function KartuRingkasTemplate({ month, agent, displayMode = 'hari' }: BrochureDesignTemplateProps) {
  const title = month.label.toUpperCase();
  return (
    <div style={ROOT_STYLE}>
      <style>{BROCHURE_FONT_FACE_CSS}</style>
      <LowerLandmarks bottom={196} />

      {/* Pita merah tipis: hanya logo + badge, judul turun ke latar krem. */}
      <div style={{
        position: 'relative', zIndex: 2, flexShrink: 0, height: 168, padding: '0 50px', boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderRadius: '0 0 36px 36px', overflow: 'hidden',
        background: `linear-gradient(110deg, ${DARK} 0%, #A50A24 60%, ${RED} 100%)`,
      }}>
        <img src={NABAWI_WIDE_IMAGE} alt="" aria-hidden="true" style={{ position: 'absolute', left: 470, top: -40, width: 440, height: 'auto', opacity: 0.14 }} />
        <img src={LOGO_WHITE_FULL} alt="Alhijaz" style={{ position: 'relative', height: 56, width: 'auto', display: 'block' }} />
        <img src={PASTI_UMRAH_IMAGE} alt="5 Pasti Umrah" style={{ position: 'relative', width: 80, height: 'auto', display: 'block' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 2, flexShrink: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, padding: '28px 50px 0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ fontFamily: BROCHURE_MONTSERRAT_FONT_STACK, fontWeight: 800, fontSize: 26, letterSpacing: 5, lineHeight: 1.2, color: RED, whiteSpace: 'nowrap' }}>PAKET UMROH</span>
          <span style={{
            fontFamily: BROCHURE_MONTSERRAT_FONT_STACK, fontWeight: 900, fontSize: fitTitleFontSize(title, 660, 66, 34),
            lineHeight: 1, letterSpacing: -0.5, color: DEEP, whiteSpace: 'nowrap',
          }}>{title}</span>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0, marginBottom: 6,
          padding: '10px 20px 11px', borderRadius: 999, background: '#FFFFFF', border: `2px solid ${PALE}`,
          color: DEEP, fontSize: 23, fontWeight: 900, lineHeight: 1, whiteSpace: 'nowrap',
        }}>
          <Globe size={20} color={RED} strokeWidth={2.4} />
          {landingUrlForAgent(agent)}
        </span>
      </div>

      <CardList packages={month.packages} displayMode={displayMode} m={COMPACT_CARD} margin="24px 50px 24px" />
      <TruncationNote count={month.truncatedCount} agent={agent} color={DEEP} border="#E8CDB0" />
      <WhiteAgentFooter agent={agent} margin="0 50px 46px" border={CARD_LINE} />
    </div>
  );
}

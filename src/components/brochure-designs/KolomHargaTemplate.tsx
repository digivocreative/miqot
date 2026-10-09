// Desain brosur "Kolom Harga" — tabel lima kolom ala Klasik dalam satu kartu
// putih, dengan kolom HARGA berupa pita merah yang menyambung dari kepala
// tabel sampai baris terakhir (harga putih di atas merah). Header ringkas di
// latar terang: logo, judul dua warna satu baris, pil URL.
import type { CSSProperties } from 'react';
import WhatsAppIcon from '../bio/WhatsAppIcon';
import {
  BROCHURE_W,
  BROCHURE_H,
  BROCHURE_FONT_FACE_CSS,
  BROCHURE_FONT_STACK,
  BROCHURE_OSWALD_FONT_STACK,
  BROCHURE_ROBOTO_CONDENSED_FONT_STACK,
  BROCHURE_MONTSERRAT_FONT_STACK,
  formatPhoneDisplay,
  landingUrlForAgent,
  type BrochurePackage,
} from '../BrochureScheduleTemplate';
import { brochureRowModel, fitTitleFontSize, splitTitleYear, type BrochureDesignTemplateProps } from './designShared';
import {
  AgentAvatar,
  LOGO_COLORED,
  LowerLandmarks,
  NABAWI_DOME_IMAGE,
  PASTI_UMRAH_IMAGE,
  PackagePills,
  SoldOutStamp,
  TruncationNote,
  agentNameFontSize,
} from './designParts';

const RED = '#C8102E';
const DEEP = '#870018';
const DARK = '#5A0010';
const GOLD = '#C98A2C';
const PALE = '#F8DFA1';
const INK = '#241A1C';
const LINE = '#F2E2D2';
const PROMO_LINE = '#F3DFA6';
const FRAME_LINE = '#EBD3B8';

const COLUMNS = '108px minmax(0, 1fr) 92px 140px 176px';
const HEADER_H = 58;
// Baris membagi rata tinggi kartu tabel; kartu sendiri dibatasi
// HEADER_H + n × ROW_MAX supaya saat paket sedikit tabel tidak melar kosong.
const ROW_MIN = 78;
const ROW_MAX = 104;

const PRICE_COLUMN_BG = `linear-gradient(90deg, ${DEEP} 0%, ${RED} 100%)`;
const SOLD_OUT_COLUMN_BG = 'linear-gradient(90deg, #5B6576 0%, #7A8494 100%)';

function TableRow({ p, displayMode, last }: { p: BrochurePackage; displayMode: 'hari' | 'seat'; last: boolean }) {
  const row = brochureRowModel(p, displayMode);
  const highlighted = !row.soldOut && row.chip !== null;
  const line = highlighted ? PROMO_LINE : LINE;
  const cellBorder: CSSProperties = { borderBottom: last ? 'none' : `1px solid ${line}` };
  const fade: CSSProperties = row.soldOut ? { opacity: 0.55 } : {};
  const center: CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' };

  return (
    <div style={{
      flex: '1 1 0', minHeight: ROW_MIN, maxHeight: ROW_MAX,
      display: 'grid', gridTemplateColumns: COLUMNS,
      background: row.soldOut ? '#F8FAFC' : highlighted ? '#FFF8E3' : '#FFFFFF',
    }}>
      <div style={{ ...center, gap: 2, ...cellBorder, borderRight: `1px solid ${line}`, ...fade }}>
        <span style={{ fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 700, fontSize: 44, lineHeight: 1, color: row.soldOut ? '#64748B' : highlighted ? '#9A5B00' : DEEP, whiteSpace: 'nowrap' }}>{row.day}</span>
        <span style={{ fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 500, fontSize: 15, letterSpacing: 2.5, lineHeight: 1, color: row.soldOut ? '#94A3B8' : GOLD, whiteSpace: 'nowrap' }}>{row.monthAbbr}</span>
      </div>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 7, padding: '0 14px 0 20px', ...cellBorder }}>
        <span style={{
          fontFamily: BROCHURE_ROBOTO_CONDENSED_FONT_STACK, fontWeight: 700, fontSize: 24, lineHeight: 1.04,
          color: row.soldOut ? '#64748B' : INK, ...fade,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{row.name}</span>
        {row.pills.length > 0 && (
          <div style={{ display: 'flex', gap: 6, whiteSpace: 'nowrap', overflow: 'hidden', ...fade }}>
            <PackagePills pills={row.pills} soldOut={row.soldOut} />
          </div>
        )}
      </div>

      <div style={{ ...center, gap: 4, ...cellBorder, ...fade }}>
        <span style={{ fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 500, fontSize: 34, lineHeight: 0.95, color: row.seatCritical ? '#B45309' : DEEP, whiteSpace: 'nowrap' }}>{row.metaValue}</span>
        <span style={{ fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 500, fontSize: 14, letterSpacing: 1, lineHeight: 1, color: row.seatCritical ? '#B45309' : DEEP, whiteSpace: 'nowrap' }}>{displayMode === 'seat' ? 'SEAT' : 'HARI'}</span>
      </div>

      <div style={{ ...center, padding: '0 8px', ...cellBorder, ...fade }}>
        <span style={{
          fontFamily: BROCHURE_ROBOTO_CONDENSED_FONT_STACK, fontWeight: 600, fontSize: 22, lineHeight: 1.05, color: INK, textAlign: 'center',
          overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{p.maskapai || '-'}</span>
      </div>

      <div style={{
        ...center, gap: 5,
        background: row.soldOut ? SOLD_OUT_COLUMN_BG : PRICE_COLUMN_BG,
        borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.15)',
      }}>
        {row.soldOut ? (
          <SoldOutStamp color="#FFFFFF" background="transparent" fontSize={18} />
        ) : (
          <>
            {highlighted && (
              <span style={{ padding: '3px 8px', borderRadius: 4, background: PALE, color: DARK, fontSize: 11, fontWeight: 900, letterSpacing: 1.5, lineHeight: 1, whiteSpace: 'nowrap' }}>{row.chip}</span>
            )}
            {row.priceJt ? (
              <span style={{ fontFamily: BROCHURE_MONTSERRAT_FONT_STACK, lineHeight: 1, whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 40, fontWeight: 900, letterSpacing: -0.5, color: '#FFFFFF' }}>{row.priceJt}</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: PALE }}> Jt</span>
              </span>
            ) : (
              <span style={{ fontFamily: BROCHURE_MONTSERRAT_FONT_STACK, fontSize: 18, fontWeight: 800, color: '#FFFFFF', lineHeight: 1.1, whiteSpace: 'nowrap' }}>Hubungi kami</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function HeaderCell({ label, align = 'center', dark = false }: { label: string; align?: 'center' | 'left'; dark?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: align === 'left' ? 'flex-start' : 'center',
      padding: align === 'left' ? '0 0 0 20px' : 0, background: dark ? DARK : 'transparent',
    }}>
      <span style={{ fontFamily: BROCHURE_ROBOTO_CONDENSED_FONT_STACK, fontWeight: 700, fontSize: 21, letterSpacing: 1.5, lineHeight: 1, color: dark ? PALE : DEEP, whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  );
}

export function KolomHargaTemplate({ month, agent, displayMode = 'hari' }: BrochureDesignTemplateProps) {
  const title = month.label.toUpperCase();
  const { head, year } = splitTitleYear(title);
  const titleSize = fitTitleFontSize(title, 940, 70, 40);
  const phone = formatPhoneDisplay(agent.phone);
  const agentName = agent.name || 'Alhijaz';
  const n = month.packages.length;

  return (
    <div style={{
      width: BROCHURE_W,
      height: BROCHURE_H,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: BROCHURE_FONT_STACK,
      fontSynthesis: 'none',
      background: 'linear-gradient(180deg, #FFF6EC 0%, #FFFFFF 30%, #FFF8EE 100%)',
      color: INK,
    }}>
      <style>{BROCHURE_FONT_FACE_CSS}</style>
      <img src={NABAWI_DOME_IMAGE} alt="" aria-hidden="true" style={{ position: 'absolute', left: 760, top: 90, width: 400, height: 'auto', opacity: 0.08, zIndex: 0 }} />
      <LowerLandmarks bottom={200} />

      <div style={{ position: 'relative', zIndex: 2, flexShrink: 0, height: 10, background: `linear-gradient(90deg, ${DARK} 0%, ${RED} 50%, #F0445F 70%, ${RED} 100%)` }} />

      <div style={{ position: 'relative', zIndex: 2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '30px 50px 0' }}>
        <img src={LOGO_COLORED} alt="Alhijaz" style={{ height: 56, width: 'auto', display: 'block' }} />
        <img src={PASTI_UMRAH_IMAGE} alt="5 Pasti Umrah" style={{ width: 80, height: 'auto', display: 'block' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 2, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 50px 0' }}>
        <span style={{ fontFamily: BROCHURE_MONTSERRAT_FONT_STACK, fontWeight: 800, fontSize: 26, letterSpacing: 6, lineHeight: 1.2, color: RED, whiteSpace: 'nowrap' }}>PAKET UMROH</span>
        <span style={{ fontFamily: BROCHURE_MONTSERRAT_FONT_STACK, fontWeight: 900, fontSize: titleSize, lineHeight: 1, letterSpacing: -0.5, whiteSpace: 'nowrap' }}>
          <span style={{ color: DEEP }}>{head}</span>
          {year && <span style={{ color: RED }}> {year}</span>}
        </span>
        <span style={{
          display: 'inline-flex', alignItems: 'center', marginTop: 6, padding: '8px 18px 9px', borderRadius: 999,
          background: '#FFFFFF', border: `2px solid ${PALE}`, color: DEEP, fontSize: 22, fontWeight: 900, lineHeight: 1, whiteSpace: 'nowrap',
        }}>{landingUrlForAgent(agent)}</span>
      </div>

      <div style={{ position: 'relative', zIndex: 2, flex: '1 1 auto', minHeight: 0, margin: '22px 50px 24px', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          flex: '1 1 auto', minHeight: 0, maxHeight: HEADER_H + n * ROW_MAX + 3,
          display: 'flex', flexDirection: 'column', borderRadius: 24, overflow: 'hidden',
          background: '#FFFFFF', border: `1.5px solid ${FRAME_LINE}`, boxShadow: '0 20px 44px rgba(90,0,16,0.12)',
        }}>
          <div style={{ flexShrink: 0, height: HEADER_H, display: 'grid', gridTemplateColumns: COLUMNS, background: '#FFF3E4', borderBottom: `1.5px solid ${FRAME_LINE}` }}>
            <HeaderCell label="TANGGAL" />
            <HeaderCell label="PAKET" align="left" />
            <HeaderCell label={displayMode === 'seat' ? 'SISA' : 'HARI'} />
            <HeaderCell label="MASKAPAI" />
            <HeaderCell label="HARGA" dark />
          </div>
          {month.packages.map((p, i) => (
            <TableRow key={p.id} p={p} displayMode={displayMode} last={i === n - 1} />
          ))}
        </div>
      </div>

      <TruncationNote count={month.truncatedCount} agent={agent} color={DEEP} border={FRAME_LINE} />

      <div style={{
        position: 'relative', zIndex: 2, flexShrink: 0, margin: '0 50px 46px',
        display: 'flex', alignItems: 'center', gap: 22, padding: '18px 26px 18px 20px', borderRadius: 26,
        border: `3px solid ${PALE}`, boxShadow: '0 16px 32px rgba(90,0,16,0.2)',
        background: `linear-gradient(120deg, ${DARK} 0%, ${DEEP} 45%, ${RED} 100%)`,
      }}>
        <AgentAvatar agent={agent} size={110} ring={PALE} />
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, gap: 2 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: PALE, whiteSpace: 'nowrap' }}>Info &amp; Pendaftaran:</span>
          <strong style={{
            fontSize: agentNameFontSize(agentName, 40), fontWeight: 900, color: '#FFFFFF', lineHeight: 1.05,
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{agentName}</strong>
        </div>
        {phone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, color: '#FFFFFF', whiteSpace: 'nowrap' }}>
            <WhatsAppIcon size={50} />
            <span style={{ fontSize: 36, fontWeight: 900, letterSpacing: 0.4, lineHeight: 1 }}>{phone}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Desain brosur "Kalender" — brosur sebagai lembar kalender meja: spiral di
// tepi atas, kepala lembar merah berisi judul bulan, tiap keberangkatan
// ditandai ikon kalender mini (pita bulan + angka tanggal), harga di label
// gantung (merah biasa, emas untuk PROMO/HEMAT, abu untuk SOLD OUT).
import type { CSSProperties } from 'react';
import { Globe } from 'lucide-react';
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
  LOGO_COLORED,
  LowerLandmarks,
  PASTI_UMRAH_IMAGE,
  PackagePills,
  TruncationNote,
  WhiteAgentFooter,
} from './designParts';

const RED = '#C8102E';
const DEEP = '#870018';
const PALE = '#F8DFA1';
const INK = '#241A1C';
const MUTED = '#6F6264';

const RED_GRADIENT = `linear-gradient(110deg, ${DEEP} 0%, ${RED} 100%)`;
const GOLD_GRADIENT = 'linear-gradient(110deg, #B8781C 0%, #E9B949 100%)';
const GREY_GRADIENT = 'linear-gradient(110deg, #5B6576 0%, #8A93A3 100%)';
const RING_GRADIENT = 'linear-gradient(90deg, #4A4A4A 0%, #B5B5B5 50%, #4A4A4A 100%)';

const SHEET_HEAD_H = 132;
const ENTRIES_PAD_Y = 16;
// Baris membagi rata tinggi lembar; lembar dibatasi kepala + n × ENTRY_MAX
// supaya paket sedikit tidak menyisakan lembar putih kosong.
const ENTRY_MIN = 80;
const ENTRY_MAX = 110;
const RING_COUNT = 12;
const RING_STEP = 76;
const RING_W = 14;

function Entry({ p, displayMode, last }: { p: BrochurePackage; displayMode: 'hari' | 'seat'; last: boolean }) {
  const row = brochureRowModel(p, displayMode);
  const highlighted = !row.soldOut && row.chip !== null;
  const fade: CSSProperties = row.soldOut ? { opacity: 0.55 } : {};
  const tagBg = row.soldOut ? GREY_GRADIENT : highlighted ? GOLD_GRADIENT : RED_GRADIENT;
  // Harga + chip PROMO/HEMAT selalu putih; di label emas (terang di sisi
  // kanan) diberi bayangan tipis supaya tetap terbaca.
  const priceInk: CSSProperties = { color: '#FFFFFF', ...(highlighted ? { textShadow: '0 1px 2px rgba(110,60,0,0.45)' } : {}) };

  return (
    <div style={{
      flex: '1 1 0', minHeight: ENTRY_MIN, maxHeight: ENTRY_MAX,
      display: 'flex', alignItems: 'center', gap: 20, padding: '0 10px',
      borderBottom: last ? 'none' : '1px solid #EFE3D6',
    }}>
      <div style={{
        width: 76, height: 82, flexShrink: 0, boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
        borderRadius: 12, overflow: 'hidden', background: '#FFFFFF',
        border: `1.5px solid ${row.soldOut ? '#CBD5E1' : highlighted ? '#E2B04A' : '#E8CFCF'}`,
        boxShadow: '0 4px 10px rgba(90,0,16,0.08)',
      }}>
        <div style={{ height: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: tagBg }}>
          <span style={{ fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 700, fontSize: 13, letterSpacing: 2.5, lineHeight: 1, color: '#FFFFFF', whiteSpace: 'nowrap' }}>{row.monthAbbr}</span>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 700, fontSize: 38, lineHeight: 1, color: row.soldOut ? '#64748B' : highlighted ? '#8A5300' : DEEP, whiteSpace: 'nowrap' }}>{row.day}</span>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, ...fade }}>
        <span style={{
          fontFamily: BROCHURE_ROBOTO_CONDENSED_FONT_STACK, fontWeight: 700, fontSize: 25, lineHeight: 1.04,
          color: row.soldOut ? '#64748B' : INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{row.name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {row.metaLabel && (
            <span style={{
              flexShrink: 0, fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 700, fontSize: 17, letterSpacing: 1, lineHeight: 1,
              color: row.seatCritical ? '#7C2D12' : DEEP, whiteSpace: 'nowrap',
              ...(row.seatCritical ? { background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 999, padding: '3px 10px' } : {}),
            }}>{row.metaLabel}</span>
          )}
          {row.metaLabel && p.maskapai && <span style={{ width: 1.5, height: 14, flexShrink: 0, background: '#D9C3A0' }} />}
          {p.maskapai && (
            <span style={{ flexShrink: 0, fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 500, fontSize: 17, letterSpacing: 1, lineHeight: 1, color: MUTED, whiteSpace: 'nowrap' }}>{p.maskapai}</span>
          )}
          <PackagePills pills={row.pills} soldOut={row.soldOut} />
        </div>
      </div>

      <div style={{
        width: 168, height: 64, flexShrink: 0, boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px 0 14px',
        borderRadius: '10px 32px 32px 10px', background: tagBg, boxShadow: '0 6px 12px rgba(90,0,16,0.15)',
      }}>
        <span style={{ width: 12, height: 12, flexShrink: 0, borderRadius: '50%', background: '#FFFFFF' }} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          {row.soldOut ? (
            <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: 0.8, lineHeight: 1, color: '#FFFFFF', whiteSpace: 'nowrap' }}>SOLD OUT</span>
          ) : (
            <>
              {highlighted && (
                <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.6, lineHeight: 1, ...priceInk, whiteSpace: 'nowrap' }}>{row.chip}</span>
              )}
              {row.priceJt ? (
                <span style={{ fontFamily: BROCHURE_MONTSERRAT_FONT_STACK, lineHeight: 1, ...priceInk, whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 34, fontWeight: 900, letterSpacing: -0.5 }}>{row.priceJt}</span>
                  <span style={{ fontSize: 16, fontWeight: 800 }}> Jt</span>
                </span>
              ) : (
                <span style={{ fontFamily: BROCHURE_MONTSERRAT_FONT_STACK, fontSize: 15, fontWeight: 800, lineHeight: 1.1, ...priceInk, whiteSpace: 'nowrap' }}>Hubungi kami</span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function KalenderTemplate({ month, agent, displayMode = 'hari' }: BrochureDesignTemplateProps) {
  const title = month.label.toUpperCase();
  const n = month.packages.length;
  const sheetW = BROCHURE_W - 80;
  const ringsLeft = Math.round((sheetW - ((RING_COUNT - 1) * RING_STEP + RING_W)) / 2);

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
      background: 'linear-gradient(180deg, #F7EFE4 0%, #F3EADF 100%)',
      color: INK,
    }}>
      <style>{BROCHURE_FONT_FACE_CSS}</style>
      <LowerLandmarks bottom={196} opacity={0.12} />

      <div style={{ position: 'relative', zIndex: 2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '40px 50px 0' }}>
        <img src={LOGO_COLORED} alt="Alhijaz" style={{ height: 56, width: 'auto', display: 'block' }} />
        <img src={PASTI_UMRAH_IMAGE} alt="5 Pasti Umrah" style={{ width: 80, height: 'auto', display: 'block' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 2, flex: '1 1 auto', minHeight: 0, margin: '34px 40px 24px', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          position: 'relative', flex: '1 1 auto', minHeight: 0, maxHeight: SHEET_HEAD_H + ENTRIES_PAD_Y + n * ENTRY_MAX,
          display: 'flex', flexDirection: 'column', borderRadius: 28, background: '#FFFFFF',
          boxShadow: '0 18px 40px rgba(90,0,16,0.12)',
        }}>
          <div style={{
            position: 'relative', flexShrink: 0, height: SHEET_HEAD_H, boxSizing: 'border-box', padding: '22px 32px 0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20,
            borderRadius: '28px 28px 0 0', overflow: 'hidden', background: RED_GRADIENT,
          }}>
            <img src={KABAH_IMAGE} alt="" aria-hidden="true" style={{ position: 'absolute', left: 560, top: 20, width: 180, height: 'auto', opacity: 0.12 }} />
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontFamily: BROCHURE_MONTSERRAT_FONT_STACK, fontWeight: 800, fontSize: 22, letterSpacing: 5, lineHeight: 1.2, color: PALE, whiteSpace: 'nowrap' }}>PAKET UMROH</span>
              <span style={{ fontFamily: BROCHURE_MONTSERRAT_FONT_STACK, fontWeight: 900, fontSize: fitTitleFontSize(title, 560, 58, 30), lineHeight: 1, color: '#FFFFFF', whiteSpace: 'nowrap' }}>{title}</span>
            </div>
            <span style={{
              position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0,
              padding: '9px 18px 10px', borderRadius: 999, background: '#FFFFFF',
              color: DEEP, fontSize: 22, fontWeight: 900, lineHeight: 1, whiteSpace: 'nowrap',
            }}>
              <Globe size={19} color={RED} strokeWidth={2.4} />
              {landingUrlForAgent(agent)}
            </span>
          </div>

          <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', padding: '6px 24px 10px' }}>
            {month.packages.map((p, i) => (
              <Entry key={p.id} p={p} displayMode={displayMode} last={i === n - 1} />
            ))}
          </div>

          {/* Spiral pengikat yang menembus tepi atas lembar. */}
          {Array.from({ length: RING_COUNT }, (_, k) => (
            <span key={k} aria-hidden="true" style={{
              position: 'absolute', top: -20, left: ringsLeft + k * RING_STEP, width: RING_W, height: 42,
              borderRadius: 7, background: RING_GRADIENT,
            }} />
          ))}
        </div>
      </div>

      <TruncationNote count={month.truncatedCount} agent={agent} color={DEEP} border="#E2CBB0" />
      <WhiteAgentFooter agent={agent} margin="0 40px 44px" />
    </div>
  );
}

// Desain brosur "Serambi Nabawi" — undangan gading premium: kanvas putih-krem,
// foil emas, band payung Masjid Nabawi (SVG), badge tanggal lengkung arcade.
// Opsi desain tambahan; katalog PDF tetap memakai template klasik.
import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import WhatsAppIcon from '../bio/WhatsAppIcon';
import {
  BROCHURE_W,
  BROCHURE_H,
  BROCHURE_FONT_FACE_CSS,
  BROCHURE_FONT_STACK,
  BROCHURE_TABLE_FONT_STACK,
  BROCHURE_OSWALD_FONT_STACK,
  BROCHURE_SERIF_FONT_STACK,
  MONTH_ABBR_ID,
  avatarFallback,
  cleanPackageDisplayName,
  countTripDays,
  detectPackagePills,
  formatDepartureDay,
  formatHargaJt,
  formatPhoneDisplay,
  landingUrlForAgent,
  type BrochurePackage,
} from '../BrochureScheduleTemplate';
import {
  monthAbbrFromIso,
  promoChipLabel,
  stripDurationWord,
  stripPromoWord,
  type BrochureDesignTemplateProps,
} from './designShared';

const INK = '#2E2618';
const INK_DEEP = '#241C0E';
const MUTED = '#8A7D66';
const FADED = '#B5A98F';
const GOLD_DARK = '#B9912F';
const GOLD_MID = '#C9A24B';
const GOLD_LIGHT = '#D9BE7E';
const GOLD_PALE = '#F7F0DE';
const GOLD_PALE_2 = '#FAF5E7';
const CARD_BORDER = '#EFE6D4';
const RED = '#C8102E';

const FOIL = 'linear-gradient(100deg, #7A5A15 0%, #A8842A 30%, #D9BC72 50%, #A8842A 70%, #7A5A15 100%)';
const CANVAS_BG = 'linear-gradient(180deg, #FFFFFF 0%, #FDFBF6 55%, #F7F1E4 100%)';
const WARM_SHADOW = '0 6px 18px rgba(184,146,47,0.10)';

// Subset PlayfairDisplay.woff2 default OLDSTYLE figures (angka naik-turun dari
// baseline) — semua angka ber-font Playfair (tanggal/harga/tahun) wajib
// lining-nums + "lnum" agar baseline rata.

// Band kanopi payung Nabawi: 4 payung @270px. Ribs dari apex (135,-40) terpotong
// viewport — yang terlihat: kanopi scallop + tiang. idPrefix mencegah bentrok id
// saat band dipakai 2x (atas + mirror footer).
function CanopyBand({ idPrefix, style }: { idPrefix: string; style?: CSSProperties }) {
  const id = `${idPrefix}-payung`;
  return (
    <svg width={1080} height={110} viewBox="0 0 1080 110" fill="none" aria-hidden="true" style={{ display: 'block', ...style }}>
      <defs>
        <g id={id}>
          <path
            d="M0,0 L270,0 L270,58 Q236,84 202,58 Q168,84 135,58 Q101,84 67,58 Q34,84 0,58 Z"
            fill="#F8F1E0" fillOpacity={0.6} stroke={GOLD_LIGHT} strokeWidth={1.5} strokeOpacity={0.8}
          />
          <line x1={135} y1={-40} x2={0} y2={58} stroke={GOLD_LIGHT} strokeOpacity={0.5} />
          <line x1={135} y1={-40} x2={67} y2={58} stroke={GOLD_LIGHT} strokeOpacity={0.5} />
          <line x1={135} y1={-40} x2={135} y2={58} stroke={GOLD_LIGHT} strokeOpacity={0.5} />
          <line x1={135} y1={-40} x2={202} y2={58} stroke={GOLD_LIGHT} strokeOpacity={0.5} />
          <line x1={135} y1={-40} x2={270} y2={58} stroke={GOLD_LIGHT} strokeOpacity={0.5} />
        </g>
      </defs>
      <use href={`#${id}`} x={0} />
      <use href={`#${id}`} x={270} />
      <use href={`#${id}`} x={540} />
      <use href={`#${id}`} x={810} />
    </svg>
  );
}

function Diamond({ size = 7, color = GOLD_MID }: { size?: number; color?: string }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, background: color,
      transform: 'rotate(45deg)', flexShrink: 0,
    }} />
  );
}

function GlobeIcon({ size = 20, color = GOLD_DARK }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} aria-hidden="true" style={{ display: 'block' }}>
      <circle cx={12} cy={12} r={9} />
      <ellipse cx={12} cy={12} rx={4} ry={9} />
      <path d="M3 12h18" />
    </svg>
  );
}

export function SerambiNabawiTemplate({ month, agent, displayMode = 'hari' }: BrochureDesignTemplateProps) {
  const photo = agent.photo || avatarFallback(agent.name);
  const phone = formatPhoneDisplay(agent.phone);
  const landingUrl = landingUrlForAgent(agent);
  const agentName = agent.name || 'Alhijaz';

  // "September 2026" → nama bulan Title-case + tahun terpisah.
  const monthName = month.label.replace(/\s*\d{4}\s*$/, '').trim().toLowerCase();
  const monthFontSize = monthName.length >= 10 ? 96 : 108;

  const n = month.packages.length;
  const dense = n > 9;
  const rowH = dense ? 86 : 96;
  const rowGap = dense ? 8 : 12;
  const nameSize = dense ? 24 : 26;
  const badgeH = dense ? 70 : 78;

  return (
    <div style={{
      width: BROCHURE_W,
      height: BROCHURE_H,
      position: 'relative',
      overflow: 'hidden',
      fontFamily: BROCHURE_FONT_STACK,
      fontSynthesis: 'none',
      background: CANVAS_BG,
      color: INK,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <style>{BROCHURE_FONT_FACE_CSS}</style>

      {/* Ornamen background */}
      <CanopyBand idPrefix="top" style={{ position: 'absolute', top: 0, left: 0, zIndex: 0 }} />
      <img
        src="/img-brosur/nabawi-dome.png"
        alt=""
        style={{
          position: 'absolute', top: 210, right: -140, width: 460, height: 'auto',
          opacity: 0.08, filter: 'sepia(1) saturate(0.55) brightness(1.4)',
          mixBlendMode: 'multiply', zIndex: 0,
        }}
      />

      {/* Header */}
      <div style={{
        position: 'relative', zIndex: 1, padding: '36px 48px 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <img src="/logo-alhijaz-besar.png" alt="Alhijaz" style={{ height: 76, width: 'auto', display: 'block' }} />
        <img src="/img-brosur/pasti-umrah.png" alt="5 Pasti Umrah" style={{ width: 100, height: 'auto', display: 'block', filter: 'drop-shadow(0 8px 16px rgba(184,146,47,0.25))' }} />
      </div>
      <div style={{ position: 'relative', zIndex: 1, margin: '10px 48px 0' }}>
        <div style={{ height: 2, background: GOLD_MID }} />
        <div style={{ height: 1, background: '#EFE0BC', marginTop: 3 }} />
      </div>

      {/* Blok judul */}
      <div style={{ position: 'relative', zIndex: 1, padding: '24px 48px 16px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div style={{ width: 60, height: 1.5, background: GOLD_MID }} />
          <Diamond />
          <span style={{
            fontSize: 22, fontWeight: 700, letterSpacing: '0.42em', color: GOLD_DARK,
            textIndent: '0.42em', lineHeight: 1,
          }}>JADWAL UMROH</span>
          <Diamond />
          <div style={{ width: 60, height: 1.5, background: GOLD_MID }} />
        </div>
        <div style={{
          fontFamily: BROCHURE_SERIF_FONT_STACK,
          fontSize: monthFontSize,
          fontWeight: 800,
          lineHeight: 0.95,
          marginTop: 10,
          textTransform: 'capitalize',
          backgroundImage: FOIL,
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          color: 'transparent',
          WebkitTextFillColor: 'transparent',
          filter: 'drop-shadow(0 2px 2px rgba(122,90,21,0.22))',
        }}>{monthName}</div>
        <div style={{
          marginTop: 8, fontSize: 30, fontWeight: 700, letterSpacing: '0.35em',
          textIndent: '0.35em', color: '#7A6A4A', fontVariantNumeric: 'lining-nums',
        }}>— {month.year} —</div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 12, marginTop: 14,
          padding: '12px 28px', borderRadius: 999, background: '#FFFFFF',
          border: `1.5px solid ${GOLD_MID}`, boxShadow: WARM_SHADOW,
          fontSize: 26, fontWeight: 700, color: INK, lineHeight: 1,
        }}>
          <GlobeIcon />
          {landingUrl}
        </div>
      </div>

      {/* Daftar jadwal */}
      <div style={{ position: 'relative', zIndex: 1, margin: '0 48px', display: 'flex', flexDirection: 'column', gap: rowGap }}>
        {month.packages.map(p => {
          const chip = promoChipLabel(p);
          const packageName = stripDurationWord(stripPromoWord(cleanPackageDisplayName(p.nama), chip));
          const pills = detectPackagePills(p.nama, p.umrohDulu).slice(0, 3);
          const tripDays = p.hari ?? countTripDays(p.berangkat_tgl, p.pulang_tgl);
          const isSoldOut = !!p.soldOut;
          const seat = p.seatSisa;
          const showSeat = displayMode === 'seat' && seat != null;
          const toggleValue = showSeat ? seat : (tripDays ?? '-');
          const toggleLabel = showSeat ? 'SEAT' : 'HARI';
          const seatUrgent = showSeat && typeof seat === 'number' && seat > 0 && seat <= 10;
          const pkgNameSize = packageName.length > 32 ? (dense ? 21 : 22) : nameSize;

          const inner = (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '76px 1fr 92px 1px 190px',
              columnGap: 16,
              alignItems: 'center',
              height: chip ? rowH - 4 : rowH,
              padding: '0 22px',
              borderRadius: chip ? 16 : 18,
              background: isSoldOut
                ? '#F6F3EC'
                : chip
                  ? 'linear-gradient(180deg, #FFFDF4, #FBF3DC)'
                  : '#FFFFFF',
              border: isSoldOut ? '1px dashed #D8D2C4' : chip ? 'none' : `1px solid ${CARD_BORDER}`,
              boxShadow: isSoldOut || chip ? 'none' : WARM_SHADOW,
            }}>
              {/* Badge tanggal arcade */}
              <div style={{ position: 'relative', width: 68, height: badgeH, justifySelf: 'center' }}>
                <div style={{
                  position: 'absolute', top: -3, left: '50%', marginLeft: -3.5,
                  width: 7, height: 7, transform: 'rotate(45deg)',
                  background: isSoldOut ? '#D8D2C4' : GOLD_MID,
                }} />
                <div style={{
                  width: '100%', height: '100%',
                  borderRadius: '34px 34px 10px 10px / 44px 44px 10px 10px',
                  background: isSoldOut ? '#EFEAE0' : chip ? FOIL : GOLD_PALE_2,
                  border: `1.5px solid ${isSoldOut ? '#D8D2C4' : GOLD_LIGHT}`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  paddingTop: 6, gap: 1,
                }}>
                  <span style={{
                    fontFamily: BROCHURE_SERIF_FONT_STACK, fontWeight: 800,
                    fontSize: dense ? 34 : 38, lineHeight: 1,
                    fontVariantNumeric: 'lining-nums',
                    fontFeatureSettings: '"lnum" 1',
                    color: isSoldOut ? '#A8A093' : chip ? '#3A2E12' : INK,
                  }}>{formatDepartureDay(p.berangkat_tgl)}</span>
                  <span style={{
                    fontSize: 13, fontWeight: 700, letterSpacing: '0.2em', textIndent: '0.2em', lineHeight: 1,
                    color: isSoldOut ? '#A8A093' : chip ? '#5A4310' : GOLD_DARK,
                  }}>{monthAbbrFromIso(p.berangkat_tgl, MONTH_ABBR_ID)}</span>
                </div>
              </div>

              {/* Nama + chips */}
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
                <span style={{
                  fontSize: pkgNameSize, fontWeight: 800, textTransform: 'uppercase',
                  color: isSoldOut ? '#A8A093' : INK,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.05,
                }}>{packageName}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                  {chip && (
                    <span style={chip === 'PROMO' ? {
                      flexShrink: 0, padding: '3px 12px 4px', borderRadius: 999,
                      background: RED, color: '#FFFFFF',
                      fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', lineHeight: 1.2,
                      boxShadow: '0 4px 10px rgba(200,16,46,0.30)',
                    } : {
                      flexShrink: 0, padding: '3px 12px 4px', borderRadius: 999,
                      background: FOIL, color: '#3A2E12',
                      fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', lineHeight: 1.2,
                    }}>{chip}</span>
                  )}
                  {!isSoldOut && pills.map(pill => (
                    <span key={pill.label} style={{
                      flexShrink: 0, padding: '3px 12px 4px', borderRadius: 999,
                      background: GOLD_PALE, border: '1px solid #EAD9AC',
                      color: '#8A6D1F', fontSize: 15, fontWeight: 600, lineHeight: 1.2,
                      whiteSpace: 'nowrap',
                    }}>{pill.label}</span>
                  ))}
                  {p.maskapai && (
                    <span style={{
                      flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7,
                      padding: '3px 12px 4px', borderRadius: 999,
                      background: '#FFFFFF', border: `1px solid ${isSoldOut ? '#D8D2C4' : GOLD_LIGHT}`,
                      fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 500, fontSize: 15,
                      letterSpacing: '0.12em', color: isSoldOut ? '#A8A093' : MUTED,
                      lineHeight: 1.25, whiteSpace: 'nowrap',
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: isSoldOut ? '#D8D2C4' : GOLD_MID }} />
                      {p.maskapai.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>

              {/* Toggle HARI/SEAT (baris sold-out tetap tampil, teredam) */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <span style={{
                  fontFamily: BROCHURE_TABLE_FONT_STACK, fontSize: 36, lineHeight: 0.95,
                  color: isSoldOut ? '#A8A093' : seatUrgent ? RED : INK,
                }}>{toggleValue}</span>
                <span style={{
                  fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', textIndent: '0.18em',
                  color: isSoldOut ? '#A8A093' : seatUrgent ? RED : GOLD_DARK, lineHeight: 1,
                }}>{toggleLabel}</span>
              </div>
              <div style={{ width: 1, height: 56, background: isSoldOut ? '#E3DED2' : '#EFE0BC' }} />
              {isSoldOut ? (
                <div style={{ justifySelf: 'center' }}>
                  <span style={{
                    display: 'inline-block',
                    fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 700, fontSize: 26,
                    letterSpacing: '0.14em', textIndent: '0.14em', color: '#B0453F',
                    border: '3px double #B0453F', padding: '4px 14px',
                    background: 'rgba(255,255,255,0.6)', transform: 'rotate(-7deg)',
                    lineHeight: 1.2, whiteSpace: 'nowrap',
                  }}>SOLD OUT</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  {typeof p.harga === 'number' ? (
                    <>
                      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.25em', textIndent: '0.25em', color: FADED, lineHeight: 1 }}>MULAI</span>
                      <span style={{ whiteSpace: 'nowrap', lineHeight: 1 }}>
                        <span style={{
                          fontFamily: BROCHURE_SERIF_FONT_STACK, fontWeight: 800,
                          fontSize: chip ? 48 : 46, letterSpacing: -0.5,
                          fontVariantNumeric: 'lining-nums',
                          fontFeatureSettings: '"lnum" 1',
                          color: INK_DEEP,
                        }}>{formatHargaJt(p.harga)}</span>
                        <span style={{ fontSize: 20, fontWeight: 700, color: GOLD_DARK }}> Jt</span>
                      </span>
                    </>
                  ) : (
                    <span style={{ fontSize: 20, fontWeight: 700, color: GOLD_DARK }}>Hubungi kami</span>
                  )}
                </div>
              )}
            </div>
          );

          // Baris promo dibingkai foil tipis (frame emas), tinggi luar tetap rowH.
          return chip ? (
            <div key={p.id} style={{ padding: 2, borderRadius: 18, background: FOIL, boxShadow: WARM_SHADOW }}>
              {inner}
            </div>
          ) : (
            <div key={p.id}>{inner}</div>
          );
        })}
      </div>

      {/* Footnote truncation */}
      {month.truncatedCount > 0 && (
        <div style={{
          position: 'relative', zIndex: 1, margin: '14px 48px 0',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        }}>
          <Diamond size={5} />
          <span style={{ fontSize: 20, fontWeight: 600, color: MUTED }}>
            + {month.truncatedCount} paket lainnya — hubungi {agentName}
          </span>
          <Diamond size={5} />
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 'auto', position: 'relative', zIndex: 1 }}>
        <div style={{ margin: '0 0 0' }}>
          <div style={{ height: 2, background: GOLD_MID }} />
          <div style={{ height: 1, background: '#EFE0BC', marginTop: 3 }} />
        </div>
        <div style={{
          position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(180deg, #FBF6EA, #F3EADC)',
          padding: '20px 48px 26px',
          display: 'flex', alignItems: 'center', gap: 24,
        }}>
          <img
            src="/img-brosur/nabawi-wide.png"
            alt=""
            style={{
              position: 'absolute', bottom: 0, left: '-7%', width: '115%', maxWidth: 'none', height: 'auto',
              opacity: 0.1, filter: 'sepia(1) saturate(0.55) brightness(1.4)', mixBlendMode: 'multiply',
            }}
          />
          <div style={{ position: 'relative', flexShrink: 0, padding: 3, borderRadius: '50%', background: FOIL }}>
            <img
              src={photo}
              alt=""
              onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = avatarFallback(agent.name); }}
              style={{
                width: 96, height: 96, borderRadius: '50%', objectFit: 'cover',
                border: '3px solid #FFFFFF', display: 'block',
              }}
            />
            <span style={{
              position: 'absolute', right: -1, bottom: 1, width: 30, height: 30, borderRadius: '50%',
              background: GOLD_DARK, border: '3px solid #FBF6EA', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Check size={17} strokeWidth={4} />
            </span>
          </div>
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, gap: 3 }}>
            <span style={{
              fontSize: 16, fontWeight: 600, letterSpacing: '0.22em', color: GOLD_DARK, textTransform: 'uppercase',
            }}>Info &amp; Pendaftaran</span>
            <strong style={{
              fontFamily: BROCHURE_SERIF_FONT_STACK, fontWeight: 800,
              fontSize: agentName.length > 22 ? 28 : 34, color: INK, lineHeight: 1.05,
            }}>{agentName}</strong>
          </div>
          {phone && (
            <div style={{
              position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 24px', borderRadius: 999, background: '#FFFFFF',
              border: `1.5px solid ${GOLD_MID}`, boxShadow: WARM_SHADOW, whiteSpace: 'nowrap',
            }}>
              <span style={{ color: '#25D366', display: 'flex' }}><WhatsAppIcon size={26} /></span>
              <span style={{ fontSize: 26, fontWeight: 800, color: INK }}>{phone}</span>
            </div>
          )}
        </div>
        <CanopyBand idPrefix="bottom" style={{ position: 'absolute', bottom: 0, left: 0, transform: 'scaleY(-1)', opacity: 0.35, pointerEvents: 'none' }} />
      </div>
    </div>
  );
}

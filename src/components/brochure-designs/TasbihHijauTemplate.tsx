// Desain brosur "Tasbih Hijau" — kanvas putih→mint segar, tile tanggal zamrud
// berbaris bak manik tasbih, emas dijatah untuk harga & promo. Nol blok gelap.
// Opsi desain tambahan; katalog PDF tetap memakai template klasik.
import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import WhatsAppIcon from '../bio/WhatsAppIcon';
import {
  BROCHURE_W,
  BROCHURE_H,
  BROCHURE_FONT_FACE_CSS,
  BROCHURE_FONT_STACK,
  BROCHURE_OSWALD_FONT_STACK,
  BROCHURE_ROBOTO_CONDENSED_FONT_STACK,
  BROCHURE_MONTSERRAT_FONT_STACK,
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
} from '../BrochureScheduleTemplate';
import {
  monthAbbrFromIso,
  promoChipLabel,
  stripDurationWord,
  stripPromoWord,
  type BrochureDesignTemplateProps,
} from './designShared';

const INK = '#103126';
const INK_2 = '#47635A';
const MINT_MUTED = '#6FA48D';
const EMERALD = '#0E8A5F';
const EMERALD_DEEP = '#0A5C40';
const GOLD = '#D9A83C';
const GOLD_LIGHT = '#E8C36B';
const GOLD_TEXT = '#A97A1F';
const RED = '#C8102E';
const CARD_BORDER = '#DDEEE5';

const CANVAS_BG = [
  'radial-gradient(90% 34% at 50% 0%, rgba(18,164,111,0.10) 0%, rgba(18,164,111,0) 60%)',
  'linear-gradient(180deg, #FFFFFF 0%, #F4FBF7 46%, #EAF6F0 100%)',
].join(', ');

const EMERALD_GRAD = 'linear-gradient(135deg, #12A46F, #0B7A52)';
const EMERALD_TILE_GRAD = 'linear-gradient(150deg, #12A46F, #0B7A52)';
const GOLD_TILE_GRAD = 'linear-gradient(150deg, #E9BE58, #C9962F)';
const PRICE_GOLD_GRAD = 'linear-gradient(180deg, #A8761B, #6E4C0D)';
const TITLE_GRAD = 'linear-gradient(180deg, #12996A 0%, #0C7A52 40%, #084A34 100%)';
const PROMO_WASH = 'linear-gradient(90deg, #FFF8E6 0%, #FFFDF6 60%, #FFFFFF 100%)';
const SAJADAH_STRIP = 'linear-gradient(90deg, #0E8A5F 0%, #17B27C 35%, #E8C36B 50%, #17B27C 65%, #0E8A5F 100%)';

// Pola bintang Zamrud Royal di-recolor zamrud segar.
const STAR_PATTERN_BG = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cg fill='none' stroke='%230F9D6B' stroke-opacity='.33' stroke-width='2'%3E%3Cpath d='M60 6 75 45 114 60 75 75 60 114 45 75 6 60 45 45Z'/%3E%3Cpath d='M60 24 72 60 60 96 48 60Z'/%3E%3Ccircle cx='60' cy='60' r='18'/%3E%3Cpath d='M24 24 45 45M96 24 75 45M96 96 75 75M24 96 45 75'/%3E%3C/g%3E%3Cg fill='none' stroke='%230F9D6B' stroke-opacity='.28' stroke-width='1.5'%3E%3Cpath d='M0 60h120M60 0v120'/%3E%3C/g%3E%3C/svg%3E\")";

const MIHRAB_ARCH_BG = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 360 300'%3E%3Cg fill='none'%3E%3Cpath d='M40 300 V150 Q40 54 180 30 Q320 54 320 150 V300' stroke='%230F9D6B' stroke-opacity='.14' stroke-width='2.5'/%3E%3Cpath d='M56 300 V154 Q56 68 180 46 Q304 68 304 154 V300' stroke='%230F9D6B' stroke-opacity='.09' stroke-width='1.5'/%3E%3C/g%3E%3C/svg%3E\")";

const DUOTONE_FILTER = 'grayscale(1) sepia(1) hue-rotate(96deg) saturate(1.6) brightness(1.15)';

// Restyle pill fitur agar seragam palet Tasbih (abaikan warna bawaan pill).
const PILL_STYLES: Record<string, CSSProperties> = {
  'Hotel Bintang 5': { background: '#FBEFD3', color: '#8A6215', border: '1px solid #E3C983' },
  'Kereta Cepat': { background: '#0F766E', color: '#FFFFFF' },
  '2x Jumatan': { background: '#EAF7F1', color: '#0B6B4A', border: '1px solid #9FD8BF' },
  'Umroh Dulu': { background: EMERALD, color: '#FFFFFF' },
};

function DiamondRule({ width = 260 }: { width?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <div style={{ width, height: 1.5, background: 'linear-gradient(90deg, transparent, #9FD8BF 40%, #0F9D6B)' }} />
      <div style={{ width: 8, height: 8, background: GOLD, transform: 'rotate(45deg)', flexShrink: 0 }} />
      <div style={{ width, height: 1.5, background: 'linear-gradient(90deg, #0F9D6B, #9FD8BF 60%, transparent)' }} />
    </div>
  );
}

export function TasbihHijauTemplate({ month, agent, displayMode = 'hari' }: BrochureDesignTemplateProps) {
  const photo = agent.photo || avatarFallback(agent.name);
  const phone = formatPhoneDisplay(agent.phone);
  const landingUrl = landingUrlForAgent(agent);
  const agentName = agent.name || 'Alhijaz';
  const title = month.label.toUpperCase();
  const titleFontSize = title.length >= 17 ? 84 : title.length >= 14 ? 92 : 102;

  const n = month.packages.length;
  const rowH = n <= 7 ? 100 : Math.max(84, 100 - (n - 7) * 5);
  const rowGap = n >= 9 ? 10 : 14;

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

      {/* Strip sajadah tepi atas */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: SAJADAH_STRIP, zIndex: 6 }} />

      {/* Ornamen background */}
      <div style={{
        position: 'absolute', top: -70, right: -80, width: 480, height: 480,
        backgroundImage: STAR_PATTERN_BG, backgroundSize: '132px 132px',
        transform: 'rotate(7deg)', opacity: 0.1, zIndex: 0,
      }} />
      <div style={{
        position: 'absolute', top: 140, left: '50%', transform: 'translateX(-50%)',
        width: 720, height: 600, backgroundImage: MIHRAB_ARCH_BG,
        backgroundSize: '720px 600px', backgroundRepeat: 'no-repeat', zIndex: 0,
      }} />
      <img
        src="/img-brosur/nabawi-dome.png"
        alt=""
        style={{
          position: 'absolute', top: 150, right: -150, width: 460, height: 'auto',
          opacity: 0.06, filter: DUOTONE_FILTER, mixBlendMode: 'multiply', zIndex: 0,
        }}
      />
      <img
        src="/img-brosur/nabawi-wide.png"
        alt=""
        style={{
          position: 'absolute', bottom: 190, left: '50%', transform: 'translateX(-50%)',
          width: 940, maxWidth: 'none', height: 'auto',
          opacity: 0.1, filter: DUOTONE_FILTER, mixBlendMode: 'multiply', zIndex: 0,
        }}
      />
      {/* Overlay-fade utk nabawi-wide (tanpa mask-image) */}
      <div style={{
        position: 'absolute', bottom: 190, height: 260, left: 0, right: 0, zIndex: 0,
        background: 'linear-gradient(180deg, #F0F9F4 0%, rgba(240,249,244,0) 45%, rgba(234,246,240,0) 70%, #EAF6F0 100%)',
      }} />

      {/* Header */}
      <div style={{
        position: 'relative', zIndex: 1, padding: '42px 54px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <img src="/new-logo-alhijaz-colored.png" alt="Alhijaz" style={{ height: 60, width: 'auto', display: 'block' }} />
        <img src="/img-brosur/pasti-umrah.png" alt="5 Pasti Umrah" style={{ width: 104, height: 'auto', display: 'block', filter: 'drop-shadow(0 8px 16px rgba(10,92,64,0.18))' }} />
      </div>
      <div style={{ position: 'relative', zIndex: 1, margin: '0 54px', height: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 3.5, height: 1.5,
          background: 'linear-gradient(90deg, transparent, #0F9D6B 22%, #D9A83C 50%, #0F9D6B 78%, transparent)',
        }} />
        <div style={{ position: 'relative', width: 8, height: 8, background: GOLD, transform: 'rotate(45deg)' }} />
      </div>

      {/* Blok judul */}
      <div style={{ position: 'relative', zIndex: 1, padding: '18px 54px 0', textAlign: 'center' }}>
        <div style={{
          fontSize: 22, fontWeight: 600, letterSpacing: 7, textIndent: 7,
          color: GOLD_TEXT, lineHeight: 1,
        }}>JADWAL KEBERANGKATAN UMROH</div>
        <div style={{
          fontFamily: BROCHURE_SERIF_FONT_STACK,
          fontSize: titleFontSize, fontWeight: 800, lineHeight: 1.02,
          marginTop: 10, whiteSpace: 'nowrap',
          // Subset Playfair default oldstyle figures — ratakan digit "2026".
          fontVariantNumeric: 'lining-nums',
          fontFeatureSettings: '"lnum" 1',
          backgroundImage: TITLE_GRAD,
          backgroundClip: 'text', WebkitBackgroundClip: 'text',
          color: 'transparent', WebkitTextFillColor: 'transparent',
          filter: 'drop-shadow(0 3px 0 rgba(10,92,64,0.10))',
        }}>{title}</div>
        <div style={{ marginTop: 10 }}>
          <DiamondRule width={240} />
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 14,
          padding: '10px 26px 11px', borderRadius: 999,
          background: EMERALD_GRAD, color: '#FFFFFF',
          boxShadow: '0 10px 24px rgba(15,138,95,0.28)',
          fontSize: 24, fontWeight: 900, lineHeight: 1, whiteSpace: 'nowrap',
        }}>
          {landingUrl}
        </div>
      </div>

      {/* Daftar jadwal */}
      <div style={{ position: 'relative', zIndex: 1, margin: '18px 54px 0', display: 'flex', flexDirection: 'column', gap: rowGap }}>
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
          const nameLong = packageName.length > 34;
          const nameSize = nameLong ? 20 : packageName.length > 28 ? 22 : 25;

          return (
            <div key={p.id} style={{
              display: 'grid',
              gridTemplateColumns: '104px 1fr 92px 150px 180px',
              columnGap: 12,
              alignItems: 'center',
              height: rowH,
              padding: '0 16px',
              borderRadius: 18,
              background: isSoldOut ? '#F4F6F5' : chip ? PROMO_WASH : '#FFFFFF',
              border: isSoldOut ? '1px solid #E2E7E4' : chip ? '1.5px solid #E8C36B' : `1px solid ${CARD_BORDER}`,
              boxShadow: isSoldOut
                ? 'none'
                : chip
                  ? 'inset 6px 0 0 #D9A83C, 0 8px 22px rgba(185,138,46,0.18)'
                  : '0 6px 18px rgba(13,60,40,0.07)',
            }}>
              {/* Tile tanggal (manik tasbih) */}
              <div style={{
                width: 62, height: 58, justifySelf: 'center', borderRadius: 14,
                background: isSoldOut ? '#ADBDB5' : chip ? GOLD_TILE_GRAD : EMERALD_TILE_GRAD,
                boxShadow: isSoldOut ? 'none' : chip
                  ? '0 5px 12px rgba(201,150,47,0.28)'
                  : '0 5px 12px rgba(15,138,95,0.22)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                opacity: isSoldOut ? 0.45 : 1,
              }}>
                <span style={{
                  fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 700, fontSize: 34,
                  lineHeight: 1, color: chip ? '#4A3407' : '#FFFFFF',
                }}>{formatDepartureDay(p.berangkat_tgl)}</span>
                <span style={{
                  fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 500, fontSize: 12,
                  letterSpacing: 1.5, lineHeight: 1, color: chip ? '#6B4E0F' : '#CFF2E2',
                }}>{monthAbbrFromIso(p.berangkat_tgl, MONTH_ABBR_ID)}</span>
              </div>

              {/* Nama + chips */}
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7, overflow: 'hidden', opacity: isSoldOut ? 0.45 : 1 }}>
                <span style={nameLong ? {
                  fontFamily: BROCHURE_ROBOTO_CONDENSED_FONT_STACK, fontWeight: 700,
                  fontSize: nameSize, letterSpacing: -0.3, color: INK, lineHeight: 1.04,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden', overflowWrap: 'anywhere',
                } : {
                  fontFamily: BROCHURE_ROBOTO_CONDENSED_FONT_STACK, fontWeight: 700,
                  fontSize: nameSize, color: INK, lineHeight: 1.05,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{packageName}</span>
                {!isSoldOut && (chip || pills.length > 0) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, overflow: 'hidden' }}>
                    {chip && (
                      <span style={chip === 'PROMO' ? {
                        flexShrink: 0, padding: '2px 12px 3px', borderRadius: 999,
                        background: RED, color: '#FFFFFF',
                        fontSize: 12.5, fontWeight: 800, lineHeight: 1.3,
                        letterSpacing: '0.06em', fontKerning: 'none',
                        boxShadow: '0 3px 8px rgba(200,16,46,0.25)',
                      } : {
                        flexShrink: 0, padding: '2px 12px 3px', borderRadius: 999,
                        background: 'linear-gradient(135deg, #F0CE7E, #D9A83C)', color: '#4A3407',
                        fontSize: 12.5, fontWeight: 800, lineHeight: 1.3,
                        letterSpacing: '0.06em', fontKerning: 'none',
                      }}>{chip}</span>
                    )}
                    {pills.map(pill => (
                      <span key={pill.label} style={{
                        flexShrink: 0, padding: '2px 10px 3px', borderRadius: 999,
                        fontSize: 12.5, fontWeight: 600, lineHeight: 1.3, whiteSpace: 'nowrap',
                        ...(PILL_STYLES[pill.label] || { background: '#EAF7F1', color: '#0B6B4A' }),
                      }}>{pill.label}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* Toggle HARI/SEAT */}
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                opacity: isSoldOut ? 0.45 : 1,
              }}>
                <span style={{
                  fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 500, fontSize: 35,
                  lineHeight: 0.95, color: seatUrgent ? RED : EMERALD,
                }}>{toggleValue}</span>
                <span style={{
                  fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 500, fontSize: 15,
                  letterSpacing: 1.5, lineHeight: 1, color: seatUrgent ? RED : MINT_MUTED,
                }}>{toggleLabel}</span>
              </div>

              {/* Maskapai */}
              <span style={{
                textAlign: 'center',
                fontFamily: BROCHURE_ROBOTO_CONDENSED_FONT_STACK, fontWeight: 600, fontSize: 24,
                color: INK_2, lineHeight: 1.02,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                overflow: 'hidden', minWidth: 0, overflowWrap: 'anywhere',
                opacity: isSoldOut ? 0.45 : 1,
              }}>{p.maskapai || '-'}</span>

              {/* Harga / stempel */}
              {isSoldOut ? (
                <div style={{ justifySelf: 'center' }}>
                  <span style={{
                    display: 'inline-block',
                    fontSize: 20, fontWeight: 900, letterSpacing: 1, color: RED,
                    border: `2.5px solid ${RED}`, borderRadius: 4, padding: '4px 12px',
                    background: 'rgba(255,255,255,0.6)', transform: 'rotate(-7deg)',
                    lineHeight: 1.2, whiteSpace: 'nowrap',
                  }}>SOLD OUT</span>
                </div>
              ) : (
                <span style={{ textAlign: 'center', whiteSpace: 'nowrap', fontFamily: BROCHURE_MONTSERRAT_FONT_STACK, lineHeight: 1 }}>
                  {typeof p.harga === 'number' ? (
                    <>
                      <span style={{
                        fontSize: chip ? 42 : 40, fontWeight: 900, letterSpacing: -0.5,
                        backgroundImage: PRICE_GOLD_GRAD,
                        backgroundClip: 'text', WebkitBackgroundClip: 'text',
                        color: 'transparent', WebkitTextFillColor: 'transparent',
                      }}>{formatHargaJt(p.harga)}</span>
                      <span style={{
                        fontSize: 19, fontWeight: 800,
                        backgroundImage: PRICE_GOLD_GRAD,
                        backgroundClip: 'text', WebkitBackgroundClip: 'text',
                        color: 'transparent', WebkitTextFillColor: 'transparent',
                      }}> Jt</span>
                    </>
                  ) : (
                    <span style={{ fontSize: 20, fontWeight: 800, color: GOLD_TEXT, fontFamily: BROCHURE_FONT_STACK }}>Hubungi kami</span>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Footnote truncation */}
      {month.truncatedCount > 0 && (
        <div style={{
          position: 'relative', zIndex: 1, margin: '12px 54px 0',
          background: '#EAF7F1', border: '1px dashed #7FC7A8', borderRadius: 14,
          padding: '12px 18px', textAlign: 'center',
          fontSize: 20, fontWeight: 700, color: '#0B6B4A',
        }}>
          + {month.truncatedCount} paket lainnya — hubungi {agentName}
        </div>
      )}

      {/* Footer kartu putih melayang */}
      <div style={{
        position: 'absolute', left: 54, right: 54, bottom: 44, zIndex: 2,
        background: '#FFFFFF', borderRadius: 24, padding: '18px 26px',
        boxShadow: `inset 0 0 0 2px ${EMERALD}, inset 0 0 0 5px rgba(232,195,107,0.55), 0 16px 36px rgba(13,60,40,0.14)`,
        display: 'flex', alignItems: 'center', gap: 22,
      }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <img
            src={photo}
            alt=""
            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = avatarFallback(agent.name); }}
            style={{
              width: 108, height: 108, borderRadius: '50%', objectFit: 'cover',
              border: `4px solid ${GOLD_LIGHT}`, display: 'block',
            }}
          />
          <span style={{
            position: 'absolute', right: -2, bottom: 0, width: 30, height: 30, borderRadius: '50%',
            background: EMERALD, border: '3px solid #FFFFFF', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Check size={17} strokeWidth={4} />
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, gap: 2 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: MINT_MUTED }}>Info &amp; Pendaftaran:</span>
          <strong style={{
            fontSize: agentName.length > 22 ? 32 : 38, fontWeight: 900,
            color: EMERALD_DEEP, lineHeight: 1.05,
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{agentName}</strong>
        </div>
        {phone && (
          <div style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 22px', borderRadius: 999, background: EMERALD_GRAD,
            boxShadow: '0 10px 24px rgba(15,138,95,0.28)', whiteSpace: 'nowrap',
          }}>
            <span style={{ color: '#FFFFFF', display: 'flex' }}><WhatsAppIcon size={34} /></span>
            <span style={{
              fontFamily: BROCHURE_MONTSERRAT_FONT_STACK, fontSize: 28, fontWeight: 900, color: '#FFFFFF',
            }}>{phone}</span>
          </div>
        )}
      </div>
    </div>
  );
}

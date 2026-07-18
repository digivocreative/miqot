// Desain brosur "Zamrud Royal" — dark luxury hijau zamrud + emas champagne.
// Opsi desain tambahan (bukan pengganti) dari template klasik; dipilih via
// picker desain di BrochureSchedulePage dan dipakai untuk preview + export
// gambar bulanan. Katalog PDF TETAP memakai template klasik: efek di sini
// (background-clip:text, mask-image, blur shadow) tidak raster-safe.
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
  isHighlightedPackage,
  landingUrlForAgent,
  type BrochureAgent,
  type BrochureMonth,
} from '../BrochureScheduleTemplate';
import {
  monthAbbrFromIso,
  promoChipLabel,
  stripDurationWord,
  stripPromoWord,
  type BrochureDesignTemplateProps,
} from './designShared';

const GOLD = '#E8C36B';
const CHAMP = '#F7E7B2';
const PALE = '#F2DFAE';
const CREAM_TEXT = '#F5EFDC';
const ROW_LINE = 'rgba(220,184,102,0.20)';

const CANVAS_BG = [
  'radial-gradient(88% 40% at 50% 0%, rgba(17,94,66,0.85) 0%, rgba(17,94,66,0) 62%)',
  'radial-gradient(ellipse at 50% 110%, rgba(200,155,69,0.28) 0%, rgba(7,48,31,0) 56%)',
  'linear-gradient(180deg, #062A1D 0%, #07301F 42%, #052519 100%)',
].join(', ');

// Pola bintang geometris yang sama dengan template klasik, di-recolor emas.
const GOLD_PATTERN_BG = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cg fill='none' stroke='%23E8C36B' stroke-opacity='.33' stroke-width='2'%3E%3Cpath d='M60 6 75 45 114 60 75 75 60 114 45 75 6 60 45 45Z'/%3E%3Cpath d='M60 24 72 60 60 96 48 60Z'/%3E%3Ccircle cx='60' cy='60' r='18'/%3E%3Cpath d='M24 24 45 45M96 24 75 45M96 96 75 75M24 96 45 75'/%3E%3C/g%3E%3Cg fill='none' stroke='%23D6B25E' stroke-opacity='.28' stroke-width='1.5'%3E%3Cpath d='M0 60h120M60 0v120'/%3E%3C/g%3E%3C/svg%3E\")";

// Filter emas untuk ghost landmark (foto → siluet keemasan via screen blend).
const GHOST_GOLD_FILTER = 'sepia(1) hue-rotate(62deg) brightness(1.6) saturate(0.55)';

const TABLE_COLUMNS = '106px 1fr 90px 148px 176px';

// Warna pill per label (label datang dari detectPackagePills klasik).
const PILL_STYLES: Record<string, { bg: string; fg: string; border?: string }> = {
  'Hotel Bintang 5': { bg: GOLD, fg: '#123527' },
  'Kereta Cepat':    { bg: '#0F766E', fg: '#FFFFFF' },
  '2x Jumatan':      { bg: 'rgba(247,231,178,0.16)', fg: PALE, border: '1px solid rgba(232,195,107,0.5)' },
  'Umroh Dulu':      { bg: CHAMP, fg: '#5A3A08' },
};

function CornerDiamond({ pos }: { pos: { top?: number; left?: number; right?: number; bottom?: number } }) {
  return (
    <div style={{
      position: 'absolute', ...pos, width: 11, height: 11, zIndex: 6,
      background: `linear-gradient(135deg, ${CHAMP}, #C89B45)`,
      transform: 'rotate(45deg)',
    }} />
  );
}

export function ZamrudRoyalTemplate({ month, agent, displayMode = 'hari' }: BrochureDesignTemplateProps) {
  const photo = agent.photo || avatarFallback(agent.name);
  const phone = formatPhoneDisplay(agent.phone);
  const landingUrl = landingUrlForAgent(agent);
  const agentName = agent.name || 'Alhijaz';
  const title = month.label;
  const titleFontSize = title.length >= 15 ? 84 : title.length >= 13 ? 94 : 102;
  const agentNameFontSize = agentName.length > 28 ? 32 : agentName.length > 22 ? 36 : agentName.length > 16 ? 38 : 41;
  const phoneFontSize = phone.length > 14 ? 32 : 35;

  // Baris melebar saat paket sedikit (spasi diisi ghost landmark), memadat di 10 paket.
  const n = month.packages.length;
  const rowH = Math.max(80, Math.min(108, 106 - (n - 7) * 7));

  return (
    <div style={{
      width: BROCHURE_W,
      height: BROCHURE_H,
      position: 'relative',
      overflow: 'hidden',
      fontFamily: BROCHURE_FONT_STACK,
      fontSynthesis: 'none',
      background: CANVAS_BG,
      color: CREAM_TEXT,
    }}>
      <style>{BROCHURE_FONT_FACE_CSS}</style>

      {/* Pola geometris emas */}
      <div style={{ position: 'absolute', top: -70, right: -80, width: 480, height: 480, backgroundImage: GOLD_PATTERN_BG, backgroundSize: '132px 132px', opacity: 0.16, transform: 'rotate(7deg)', zIndex: 0 }} />
      <div style={{ position: 'absolute', left: -100, bottom: 120, width: 560, height: 560, backgroundImage: GOLD_PATTERN_BG, backgroundSize: '140px 140px', opacity: 0.12, transform: 'rotate(-9deg)', zIndex: 0 }} />

      {/* Ghost landmark keemasan */}
      <img src="/img-brosur/nabawi-dome.png" alt="" style={{ position: 'absolute', top: 150, right: -160, width: 500, opacity: 0.14, filter: GHOST_GOLD_FILTER, mixBlendMode: 'screen', zIndex: 0 }} />
      <img src="/img-brosur/kabah.png" alt="" style={{ position: 'absolute', top: 170, left: -130, width: 330, opacity: 0.11, filter: GHOST_GOLD_FILTER, mixBlendMode: 'screen', zIndex: 0 }} />
      <img src="/img-brosur/nabawi-wide.png" alt="" style={{
        position: 'absolute', bottom: 196, left: '50%', transform: 'translateX(-50%)', width: 940,
        opacity: 0.15, filter: 'sepia(1) hue-rotate(58deg) brightness(1.8) saturate(0.55)', mixBlendMode: 'screen', zIndex: 0,
        WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.9) 30%, rgba(0,0,0,0.75) 70%, transparent 100%)',
        maskImage: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.9) 30%, rgba(0,0,0,0.75) 70%, transparent 100%)',
      }} />

      {/* Bingkai ornamen ganda + berlian sudut */}
      <div style={{ position: 'absolute', inset: 20, border: '1.5px solid rgba(222,186,106,0.55)', borderRadius: 6, zIndex: 5, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 28, border: '1px solid rgba(222,186,106,0.28)', borderRadius: 3, zIndex: 5, pointerEvents: 'none' }} />
      <CornerDiamond pos={{ top: 14.5, left: 14.5 }} />
      <CornerDiamond pos={{ top: 14.5, right: 14.5 }} />
      <CornerDiamond pos={{ bottom: 14.5, left: 14.5 }} />
      <CornerDiamond pos={{ bottom: 14.5, right: 14.5 }} />

      {/* Header: logo di chip krem (logo merah tak terbaca di kanvas gelap) + badge 5 Pasti */}
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '46px 54px 18px' }}>
        <div style={{ background: '#FDF9EE', border: '1.5px solid rgba(222,186,106,0.7)', borderRadius: 18, padding: '11px 20px', boxShadow: '0 10px 26px rgba(0,0,0,0.28)' }}>
          <img src="/logo-alhijaz-besar.png" alt="Alhijaz" style={{ height: 82, display: 'block' }} />
        </div>
        <img src="/img-brosur/pasti-umrah.png" alt="5 Pasti Umrah" style={{ width: 104, display: 'block', filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.35))' }} />
      </div>
      <div style={{ height: 2, margin: '0 54px', background: `linear-gradient(90deg, rgba(232,195,107,0) 0%, ${GOLD} 18%, ${CHAMP} 50%, ${GOLD} 82%, rgba(232,195,107,0) 100%)`, opacity: 0.8, position: 'relative', zIndex: 2 }} />

      {/* Blok judul */}
      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', padding: '22px 60px 12px' }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: 7, color: '#E4C87D' }}>JADWAL KEBERANGKATAN UMROH</div>
        <div style={{
          fontFamily: BROCHURE_SERIF_FONT_STACK,
          fontWeight: 800,
          fontSize: titleFontSize,
          lineHeight: 1.02,
          marginTop: 4,
          backgroundImage: 'linear-gradient(180deg, #FBF0C8 0%, #F0D48C 42%, #E8C36B 62%, #C89B45 100%)',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          filter: 'drop-shadow(0 4px 0 rgba(0,0,0,0.22)) drop-shadow(0 14px 24px rgba(0,0,0,0.3))',
          whiteSpace: 'nowrap',
        }}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 8 }}>
          <span style={{ width: 150, height: 1.5, background: `linear-gradient(90deg, rgba(232,195,107,0), ${GOLD})` }} />
          <span style={{ width: 6, height: 6, background: 'rgba(232,195,107,0.6)', transform: 'rotate(45deg)' }} />
          <span style={{ width: 9, height: 9, background: GOLD, transform: 'rotate(45deg)' }} />
          <span style={{ width: 6, height: 6, background: 'rgba(232,195,107,0.6)', transform: 'rotate(45deg)' }} />
          <span style={{ width: 150, height: 1.5, background: `linear-gradient(90deg, ${GOLD}, rgba(232,195,107,0))` }} />
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', marginTop: 14, padding: '10px 26px 11px',
          borderRadius: 999, border: '1.5px solid #D6B25E', background: 'rgba(232,195,107,0.10)',
          color: CHAMP, fontSize: 24, fontWeight: 900, lineHeight: 1, letterSpacing: 0.5,
        }}>{landingUrl}</div>
      </div>

      {/* Tabel paket */}
      <div style={{
        position: 'relative', zIndex: 2, margin: '14px 54px 0',
        borderRadius: 22, overflow: 'hidden',
        border: '1.5px solid rgba(222,186,106,0.6)',
        background: 'linear-gradient(180deg, rgba(3,22,15,0.72), rgba(4,26,18,0.6))',
        boxShadow: '0 30px 60px rgba(0,0,0,0.35)',
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: TABLE_COLUMNS, alignItems: 'center', height: 62, padding: '0 16px',
          background: 'linear-gradient(90deg, #EFCF85 0%, #E0B65C 55%, #CE9F44 100%)',
          color: '#123527', fontFamily: BROCHURE_ROBOTO_CONDENSED_FONT_STACK, fontWeight: 700, fontSize: 25,
          letterSpacing: 1.2, textAlign: 'center',
        }}>
          <span>TANGGAL</span><span>PAKET</span><span>{displayMode === 'seat' ? 'SISA' : 'HARI'}</span><span>MASKAPAI</span><span>HARGA</span>
        </div>

        {month.packages.map((p, i) => {
          const chip = promoChipLabel(p);
          const packageName = stripDurationWord(stripPromoWord(cleanPackageDisplayName(p.nama), chip));
          const pills = detectPackagePills(p.nama, p.umrohDulu);
          const tripDays = p.hari ?? countTripDays(p.berangkat_tgl, p.pulang_tgl);
          const cellValue = displayMode === 'seat' ? (p.seatSisa == null ? '-' : p.seatSisa) : (tripDays || '-');
          const cellLabel = displayMode === 'seat' ? 'SEAT' : 'HARI';
          const isSoldOut = !!p.soldOut;
          const isHighlighted = !isSoldOut && isHighlightedPackage(p);
          const dimmed = isSoldOut ? 0.42 : 1;

          return (
            <div key={p.id} style={{
              display: 'grid', gridTemplateColumns: TABLE_COLUMNS, alignItems: 'center',
              height: rowH, padding: '0 16px',
              borderTop: i === 0 ? 'none' : `1px solid ${ROW_LINE}`,
              background: isSoldOut
                ? 'rgba(10,16,14,0.5)'
                : isHighlighted
                  ? 'linear-gradient(90deg, rgba(232,195,107,0.30) 0%, rgba(232,195,107,0.10) 70%, rgba(232,195,107,0.04) 100%)'
                  : i % 2 ? 'rgba(255,255,255,0.025)' : 'transparent',
              boxShadow: isHighlighted ? `inset 5px 0 0 ${GOLD}` : undefined,
            }}>
              <span style={{
                width: 60, height: 56, justifySelf: 'center', borderRadius: 11,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: isSoldOut ? 'linear-gradient(145deg, #3A4341, #242B29)' : 'linear-gradient(145deg, #0E4A36 0%, #0A3A2A 100%)',
                border: `1.5px solid ${isSoldOut ? 'rgba(232,195,107,0.35)' : GOLD}`,
                boxShadow: '0 6px 14px rgba(0,0,0,0.35)',
                lineHeight: 0.9,
                opacity: dimmed,
              }}>
                <span style={{ fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 700, fontSize: 34, color: CHAMP, fontSynthesis: 'none', lineHeight: 1 }}>{formatDepartureDay(p.berangkat_tgl)}</span>
                <span style={{ fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 500, fontSize: 12, letterSpacing: 1.5, color: 'rgba(247,231,178,0.8)', fontSynthesis: 'none', marginTop: 2 }}>{monthAbbrFromIso(p.berangkat_tgl, MONTH_ABBR_ID)}</span>
              </span>
              <span style={{ minWidth: 0, padding: '0 12px 0 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, overflow: 'hidden', opacity: dimmed }}>
                <span style={{
                  fontFamily: BROCHURE_ROBOTO_CONDENSED_FONT_STACK, fontWeight: 700,
                  fontSize: packageName.length > 28 ? 21 : 25,
                  lineHeight: 1.05, color: CREAM_TEXT,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{packageName}</span>
                {(chip || pills.length > 0) && (
                  <span style={{ display: 'flex', gap: 6 }}>
                    {chip && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', padding: '4px 11px 5px', borderRadius: 999,
                        background: 'rgba(232,195,107,0.16)', color: CHAMP, border: `1px solid ${GOLD}`,
                        fontFamily: BROCHURE_FONT_STACK, fontSize: 12.5, fontWeight: 800, fontSynthesis: 'none',
                        lineHeight: 1, letterSpacing: 0.8, whiteSpace: 'nowrap',
                      }}>{chip}</span>
                    )}
                    {pills.map(pill => {
                      const st = PILL_STYLES[pill.label] || { bg: 'rgba(255,255,255,0.16)', fg: CREAM_TEXT };
                      return (
                        <span key={pill.label} style={{
                          display: 'inline-flex', alignItems: 'center', padding: '4px 11px 5px', borderRadius: 999,
                          background: isSoldOut ? '#3F4A47' : st.bg,
                          color: isSoldOut ? '#C6CFCB' : st.fg,
                          border: isSoldOut ? undefined : st.border,
                          fontFamily: BROCHURE_FONT_STACK, fontSize: 12.5, fontWeight: 600, fontSynthesis: 'none',
                          lineHeight: 1, letterSpacing: 0.3, whiteSpace: 'nowrap',
                        }}>{pill.label}</span>
                      );
                    })}
                  </span>
                )}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, lineHeight: 0.9, opacity: dimmed }}>
                <span style={{ fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 500, fontSize: 35, color: GOLD, fontSynthesis: 'none' }}>{cellValue}</span>
                <span style={{ fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 500, fontSize: 15, letterSpacing: 1.5, color: 'rgba(232,195,107,0.7)', fontSynthesis: 'none' }}>{cellLabel}</span>
              </span>
              <span style={{ fontFamily: BROCHURE_ROBOTO_CONDENSED_FONT_STACK, fontWeight: 600, fontSize: 24, textAlign: 'center', color: '#DCE8E0', lineHeight: 1.05, opacity: dimmed, overflowWrap: 'anywhere', wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {p.maskapai || '-'}
              </span>
              <span style={{ textAlign: 'center', whiteSpace: 'nowrap', fontFamily: BROCHURE_MONTSERRAT_FONT_STACK }}>
                {isSoldOut ? (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '9px 16px',
                    borderRadius: 3, background: '#B3121F', color: '#fff',
                    border: '2.5px solid rgba(255,255,255,0.92)', boxShadow: '0 0 0 2.5px #B3121F',
                    fontFamily: BROCHURE_FONT_STACK, fontSize: 20, fontWeight: 900, letterSpacing: 0.5,
                    transform: 'rotate(-7deg)',
                  }}>SOLD OUT</span>
                ) : typeof p.harga === 'number' ? (
                  <>
                    <span style={{ fontSize: 39, fontWeight: 900, color: '#F7DF9C', letterSpacing: -0.4 }}>{formatHargaJt(p.harga)}</span>
                    <span style={{ fontSize: 19, fontWeight: 800, color: '#F7DF9C' }}> Jt</span>
                  </>
                ) : (
                  <span style={{ fontSize: 20, fontWeight: 800, color: '#F7DF9C' }}>Hubungi kami</span>
                )}
              </span>
            </div>
          );
        })}

        {month.truncatedCount > 0 && (
          <div style={{
            borderTop: '1px dashed rgba(232,195,107,0.55)', background: 'rgba(232,195,107,0.10)',
            color: PALE, fontWeight: 700, fontSize: 20, textAlign: 'center', padding: '13px 18px',
          }}>
            + {month.truncatedCount} paket lainnya — hubungi {agent.name?.trim() || 'kami'}
          </div>
        )}
      </div>

      {/* Footer champagne — kontak agent */}
      <div style={{
        position: 'absolute', left: 54, right: 54, bottom: 50, zIndex: 3,
        display: 'flex', alignItems: 'center', gap: 24, padding: '19px 28px', borderRadius: 24,
        background: 'linear-gradient(135deg, #F6E7B4 0%, #EBCB79 52%, #DDB258 100%)',
        border: '2px solid #FBF3D8',
        boxShadow: '0 24px 48px rgba(0,0,0,0.42)',
      }}>
        <div style={{ position: 'relative', width: 118, height: 118, flexShrink: 0 }}>
          <img
            src={photo}
            alt=""
            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = avatarFallback(agent.name); }}
            style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: '4px solid #0A3A2A', boxShadow: '0 10px 24px rgba(0,0,0,0.3)' }}
          />
          <span style={{
            position: 'absolute', right: -2, bottom: 0, width: 36, height: 36, borderRadius: '50%',
            background: '#1D9BF0', border: '3.5px solid #FBF3D8', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Check size={22} strokeWidth={4} />
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#7A5810' }}>Info &amp; Pendaftaran:</span>
          <strong style={{ fontSize: agentNameFontSize, fontWeight: 900, color: '#1E1503', lineHeight: 1.05, marginTop: 2 }}>{agentName}</strong>
        </div>
        {phone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 15, flexShrink: 0, whiteSpace: 'nowrap', color: '#113B2C' }}>
            <WhatsAppIcon size={52} />
            <span style={{ fontSize: phoneFontSize, fontWeight: 900, letterSpacing: 0.4 }}>{phone}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Desain brosur "Senja Haramain" — langit maghrib gradasi ungu→oranye, bulan
// sabit + bintang, siluet Nabawi di ufuk, baris paket berupa kartu kaca
// (glassmorphism). Opsi desain tambahan; katalog PDF tetap template klasik.
//
// Catatan export: backdrop-filter TIDAK bertahan melewati capture
// modern-screenshot (SVG foreignObject) — diverifikasi pixel-diff 18 Jul 2026.
// Karena preview wajib identik dgn hasil export (WYSIWYG), desain ini sengaja
// TANPA backdrop-filter: efek "kaca" datang dari under-layer ungu translusen
// (kontras teks aman) + border putih; jangan tambahkan blur di sini.
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

const AMBER = '#FFC46B';
const AMBER_SOFT = '#FFD79A';
const PRICE_GOLD = '#FFE1A8';

const SKY_BG = 'linear-gradient(180deg, #150D36 0%, #2C1656 24%, #57215F 44%, #8E3059 61%, #C24A48 75%, #E67D4C 87%, #F5A85C 95%, #FFC46B 100%)';

// Under-layer ungu di tiap kartu: menjaga kontras teks putih di band oranye
// bawah, tidak bergantung pada backdrop-filter (lihat catatan di atas).
const GLASS_BASE = 'linear-gradient(rgba(255,255,255,0.14), rgba(255,255,255,0.14)), linear-gradient(rgba(38,20,62,0.30), rgba(38,20,62,0.30))';
const GLASS_HI = 'linear-gradient(rgba(255,190,90,0.24), rgba(255,190,90,0.16)), linear-gradient(rgba(38,20,62,0.30), rgba(38,20,62,0.30))';
const GLASS_SO = 'linear-gradient(rgba(14,7,28,0.5), rgba(14,7,28,0.5))';

const TABLE_COLUMNS = '104px 1fr 88px 148px 176px';

// Bintang via box-shadow satu titik — murah dan deterministik.
const STAR_SHADOW = [
  '210px 34px 0 rgba(255,255,255,0.85)', '420px 90px 0 rgba(255,255,255,0.6)', '610px 22px 0 rgba(255,255,255,0.8)',
  '760px 120px 0 rgba(255,255,255,0.55)', '905px 60px 0 rgba(255,255,255,0.85)', '90px 150px 0 rgba(255,255,255,0.55)',
  '330px 205px 0 rgba(255,255,255,0.5)', '545px 168px 0 rgba(255,255,255,0.65)', '850px 230px 0 rgba(255,255,255,0.45)',
  '150px 320px 0 rgba(255,255,255,0.4)', '690px 320px 0 rgba(255,255,255,0.5)', '960px 350px 0 rgba(255,255,255,0.55)',
  '260px 430px 0 rgba(255,255,255,0.35)', '500px 470px 0 rgba(255,255,255,0.4)', '795px 445px 0 rgba(255,255,255,0.35)',
].join(', ');

export function SenjaHaramainTemplate({ month, agent, displayMode = 'hari' }: BrochureDesignTemplateProps) {
  const photo = agent.photo || avatarFallback(agent.name);
  const phone = formatPhoneDisplay(agent.phone);
  const landingUrl = landingUrlForAgent(agent);
  const agentName = agent.name || 'Alhijaz';
  const title = month.label.toUpperCase();
  const titleFontSize = title.length >= 15 ? 74 : title.length >= 13 ? 82 : 88;
  const agentNameFontSize = agentName.length > 28 ? 31 : agentName.length > 22 ? 35 : 39;
  const phoneFontSize = phone.length > 14 ? 30 : 33;

  const n = month.packages.length;
  const cardH = Math.max(85, Math.min(106, 85 + (10 - n) * 7));

  return (
    <div style={{
      width: BROCHURE_W,
      height: BROCHURE_H,
      position: 'relative',
      overflow: 'hidden',
      fontFamily: BROCHURE_FONT_STACK,
      fontSynthesis: 'none',
      background: SKY_BG,
      color: '#fff',
    }}>
      <style>{BROCHURE_FONT_FACE_CSS}</style>

      {/* Bintang + bulan sabit + glow matahari terbenam */}
      <div style={{ position: 'absolute', top: 40, left: 40, width: 2.6, height: 2.6, borderRadius: '50%', background: '#fff', opacity: 0.9, boxShadow: STAR_SHADOW, zIndex: 0 }} />
      <svg width="74" height="74" viewBox="0 0 100 100" aria-hidden="true" style={{ position: 'absolute', top: 54, right: 252, zIndex: 0, filter: 'drop-shadow(0 0 26px rgba(255,215,154,0.75))' }}>
        <path d="M66 8a44 44 0 1 0 0 84 46.5 46.5 0 0 1-14.5-33.6A46.5 46.5 0 0 1 66 8z" fill={AMBER_SOFT} />
      </svg>
      <div style={{
        position: 'absolute', left: '50%', top: '72%', transform: 'translate(-50%, -50%)', width: 900, height: 900, zIndex: 0,
        background: 'radial-gradient(circle, rgba(255,196,107,0.55) 0%, rgba(255,170,90,0.24) 34%, rgba(255,170,90,0) 62%)',
      }} />
      {/* Siluet Nabawi di ufuk */}
      <img src="/img-brosur/nabawi-wide.png" alt="" style={{
        position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)', width: 1150, zIndex: 1,
        filter: 'brightness(0)', opacity: 0.62,
        WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,1) 30%)',
        maskImage: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,1) 30%)',
      }} />

      {/* Header: logo di chip putih + badge 5 Pasti */}
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '44px 50px 6px' }}>
        <div style={{ background: 'rgba(255,255,255,0.94)', borderRadius: 16, padding: '10px 18px', boxShadow: '0 12px 30px rgba(10,4,28,0.35)' }}>
          <img src="/logo-alhijaz-besar.png" alt="Alhijaz" style={{ height: 76, display: 'block' }} />
        </div>
        <img src="/img-brosur/pasti-umrah.png" alt="5 Pasti Umrah" style={{ width: 98, display: 'block', filter: 'drop-shadow(0 10px 22px rgba(10,4,28,0.4))' }} />
      </div>

      {/* Blok judul */}
      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', padding: '16px 50px 14px' }}>
        <div style={{ fontSize: 21, fontWeight: 600, letterSpacing: 9, color: 'rgba(255,255,255,0.88)' }}>JADWAL KEBERANGKATAN UMROH</div>
        <div style={{
          fontFamily: BROCHURE_MONTSERRAT_FONT_STACK, fontWeight: 900, fontSize: titleFontSize, lineHeight: 1,
          marginTop: 10, color: '#fff', letterSpacing: -1, whiteSpace: 'nowrap',
          textShadow: '0 0 44px rgba(255,170,80,0.55), 0 6px 22px rgba(10,4,28,0.45)',
        }}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 12 }}>
          <span style={{ width: 140, height: 1.5, background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.75))' }} />
          <svg width="17" height="17" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)" aria-hidden="true">
            <path d="M12 1.8 14.7 9l7.5 2.9-7.5 2.9L12 22l-2.7-7.2L1.8 12l7.5-2.9z" />
          </svg>
          <span style={{ width: 140, height: 1.5, background: 'linear-gradient(90deg, rgba(255,255,255,0.75), rgba(255,255,255,0))' }} />
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', marginTop: 14, padding: '10px 25px 11px', borderRadius: 999,
          background: 'rgba(255,255,255,0.16)', border: '1.5px solid rgba(255,255,255,0.5)',
          color: '#fff', fontSize: 23, fontWeight: 900, lineHeight: 1, letterSpacing: 0.5,
          boxShadow: '0 10px 26px rgba(10,4,28,0.25)',
        }}>{landingUrl}</div>
      </div>

      {/* Label kolom */}
      <div style={{
        position: 'relative', zIndex: 2, display: 'grid', gridTemplateColumns: TABLE_COLUMNS, alignItems: 'center',
        margin: '4px 54px 8px', padding: '0 16px', fontSize: 14.5, fontWeight: 600, letterSpacing: 2.5,
        color: 'rgba(255,255,255,0.78)', textAlign: 'center',
      }}>
        <span>TANGGAL</span>
        <span style={{ textAlign: 'left', paddingLeft: 16 }}>PAKET</span>
        <span>{displayMode === 'seat' ? 'SISA' : 'HARI'}</span>
        <span>MASKAPAI</span>
        <span>HARGA</span>
      </div>

      {/* Kartu kaca per paket */}
      <div style={{ position: 'relative', zIndex: 2, margin: '0 50px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {month.packages.map(p => {
          const chip = promoChipLabel(p);
          const packageName = stripDurationWord(stripPromoWord(cleanPackageDisplayName(p.nama), chip));
          const pills = detectPackagePills(p.nama, p.umrohDulu);
          const tripDays = p.hari ?? countTripDays(p.berangkat_tgl, p.pulang_tgl);
          const cellValue = displayMode === 'seat' ? (p.seatSisa == null ? '-' : p.seatSisa) : (tripDays || '-');
          const cellLabel = displayMode === 'seat' ? 'SEAT' : 'HARI';
          const isSoldOut = !!p.soldOut;
          const isHighlighted = !isSoldOut && isHighlightedPackage(p);
          const dimmed = isSoldOut ? 0.5 : 1;

          return (
            <div key={p.id} style={{
              display: 'grid', gridTemplateColumns: TABLE_COLUMNS, alignItems: 'center',
              height: cardH, padding: '0 16px', borderRadius: 18,
              background: isSoldOut ? GLASS_SO : isHighlighted ? GLASS_HI : GLASS_BASE,
              border: `1px solid ${isSoldOut ? 'rgba(255,255,255,0.15)' : isHighlighted ? 'rgba(255,205,120,0.85)' : 'rgba(255,255,255,0.32)'}`,
              boxShadow: isHighlighted
                ? `inset 5px 0 0 ${AMBER}, 0 12px 28px rgba(16,6,38,0.28)`
                : '0 12px 28px rgba(16,6,38,0.28)',
            }}>
              <span style={{
                width: 62, height: 62, justifySelf: 'center', borderRadius: '50%',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(255,255,255,0.2)', border: '1.5px solid rgba(255,255,255,0.6)', lineHeight: 1,
                opacity: dimmed,
              }}>
                <span style={{ fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 700, fontSize: 29, color: '#fff', fontSynthesis: 'none' }}>{formatDepartureDay(p.berangkat_tgl)}</span>
                <span style={{ fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 500, fontSize: 11, letterSpacing: 1.6, color: 'rgba(255,255,255,0.85)', fontSynthesis: 'none', marginTop: 1 }}>{monthAbbrFromIso(p.berangkat_tgl, MONTH_ABBR_ID)}</span>
              </span>
              <span style={{ minWidth: 0, padding: '0 12px 0 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, overflow: 'hidden', opacity: dimmed }}>
                <span style={{
                  fontFamily: BROCHURE_ROBOTO_CONDENSED_FONT_STACK, fontWeight: 700,
                  fontSize: packageName.length > 28 ? 21 : 25,
                  lineHeight: 1.05, color: '#fff',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{packageName}</span>
                {(chip || pills.length > 0) && (
                  <span style={{ display: 'flex', gap: 6 }}>
                    {chip && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', padding: '3.5px 10px 4.5px', borderRadius: 999,
                        background: AMBER, color: '#4A1D06',
                        fontFamily: BROCHURE_FONT_STACK, fontSize: 12, fontWeight: 800, fontSynthesis: 'none',
                        lineHeight: 1, letterSpacing: 0.5, whiteSpace: 'nowrap',
                      }}>{chip}</span>
                    )}
                    {pills.map(pill => (
                      <span key={pill.label} style={{
                        display: 'inline-flex', alignItems: 'center', padding: '3.5px 10px 4.5px', borderRadius: 999,
                        background: isSoldOut ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.24)',
                        color: isSoldOut ? 'rgba(255,255,255,0.75)' : '#fff',
                        fontFamily: BROCHURE_FONT_STACK, fontSize: 12, fontWeight: 600, fontSynthesis: 'none',
                        lineHeight: 1, letterSpacing: 0.3, whiteSpace: 'nowrap',
                      }}>{pill.label}</span>
                    ))}
                  </span>
                )}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, lineHeight: 0.9, opacity: dimmed }}>
                <span style={{ fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 500, fontSize: 34, color: '#fff', fontSynthesis: 'none' }}>{cellValue}</span>
                <span style={{ fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 500, fontSize: 14, letterSpacing: 1.6, color: 'rgba(255,255,255,0.75)', fontSynthesis: 'none' }}>{cellLabel}</span>
              </span>
              <span style={{ fontFamily: BROCHURE_ROBOTO_CONDENSED_FONT_STACK, fontWeight: 600, fontSize: 23, textAlign: 'center', color: 'rgba(255,255,255,0.94)', lineHeight: 1.05, opacity: dimmed, overflowWrap: 'anywhere', wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {p.maskapai || '-'}
              </span>
              <span style={{ textAlign: 'center', whiteSpace: 'nowrap', fontFamily: BROCHURE_MONTSERRAT_FONT_STACK, textShadow: '0 2px 14px rgba(10,4,28,0.4)' }}>
                {isSoldOut ? (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '8px 14px',
                    borderRadius: 5, background: 'rgba(190,28,40,0.9)', color: '#fff',
                    border: '2.5px solid rgba(255,255,255,0.92)',
                    fontFamily: BROCHURE_FONT_STACK, fontSize: 19, fontWeight: 900, letterSpacing: 0.6,
                    transform: 'rotate(-8deg)', textShadow: 'none',
                  }}>SOLD OUT</span>
                ) : typeof p.harga === 'number' ? (
                  <>
                    <span style={{ fontSize: 38, fontWeight: 900, color: PRICE_GOLD, letterSpacing: -0.4 }}>{formatHargaJt(p.harga)}</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: PRICE_GOLD }}> Jt</span>
                  </>
                ) : (
                  <span style={{ fontSize: 19, fontWeight: 800, color: PRICE_GOLD }}>Hubungi kami</span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {month.truncatedCount > 0 && (
        <div style={{
          margin: '10px 50px 0', position: 'relative', zIndex: 2,
          border: '1.5px dashed rgba(255,255,255,0.45)', borderRadius: 14,
          background: 'linear-gradient(rgba(255,255,255,0.12), rgba(255,255,255,0.12)), linear-gradient(rgba(38,20,62,0.25), rgba(38,20,62,0.25))',
          color: 'rgba(255,255,255,0.92)', fontWeight: 700, fontSize: 19, textAlign: 'center', padding: 11,
        }}>
          + {month.truncatedCount} paket lainnya — hubungi {agent.name?.trim() || 'kami'}
        </div>
      )}

      {/* Footer kaca gelap di atas siluet */}
      <div style={{
        position: 'absolute', left: 50, right: 50, bottom: 46, zIndex: 3,
        display: 'flex', alignItems: 'center', gap: 22, padding: '18px 26px', borderRadius: 24,
        background: 'rgba(26,11,48,0.72)', border: '1.5px solid rgba(255,255,255,0.32)',
        boxShadow: '0 24px 50px rgba(10,4,28,0.45)',
      }}>
        <div style={{ position: 'relative', width: 114, height: 114, flexShrink: 0 }}>
          <img
            src={photo}
            alt=""
            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = avatarFallback(agent.name); }}
            style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: `3.5px solid ${AMBER}`, boxShadow: '0 10px 24px rgba(0,0,0,0.4)' }}
          />
          <span style={{
            position: 'absolute', right: -2, bottom: 0, width: 34, height: 34, borderRadius: '50%',
            background: '#1D9BF0', border: '3.5px solid rgba(26,11,48,1)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Check size={20} strokeWidth={4} />
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: AMBER_SOFT }}>Info &amp; Pendaftaran:</span>
          <strong style={{ fontSize: agentNameFontSize, fontWeight: 900, color: '#fff', lineHeight: 1.05, marginTop: 2 }}>{agentName}</strong>
        </div>
        {phone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, whiteSpace: 'nowrap' }}>
            <span style={{ color: '#25D366', display: 'flex' }}><WhatsAppIcon size={50} /></span>
            <span style={{ fontSize: phoneFontSize, fontWeight: 900, color: '#fff', letterSpacing: 0.4 }}>{phone}</span>
          </div>
        )}
      </div>
    </div>
  );
}

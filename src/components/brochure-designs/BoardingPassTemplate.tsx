// Desain brosur "Boarding Pass" — setiap jadwal dirender sebagai tiket
// pesawat: stub tanggal + perforasi/notch, rute CGK ✈ kode landing, chip
// maskapai & durasi, barcode CSS, plus info sisa seat (badge kuning saat
// kritis). Opsi desain tambahan; katalog PDF tetap memakai template klasik.
import { Check } from 'lucide-react';
import WhatsAppIcon from '../bio/WhatsAppIcon';
import {
  BROCHURE_W,
  BROCHURE_H,
  BROCHURE_FONT_FACE_CSS,
  BROCHURE_FONT_STACK,
  BROCHURE_TABLE_FONT_STACK,
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
  landingUrlForAgent,
  type BrochurePackage,
} from '../BrochureScheduleTemplate';
import {
  landingIata,
  monthAbbrFromIso,
  promoChipLabel,
  stripPromoWord,
  yearFromIso,
  type BrochureDesignTemplateProps,
} from './designShared';

const INK = '#101828';
const RED = '#C8102E';
const PAGE_BG = '#F4F6F8';
const BORDER = '#E2E8F0';

const CANVAS_BG = [
  'radial-gradient(circle at 14% 8%, rgba(200,16,46,0.05) 0%, rgba(200,16,46,0) 34%)',
  'radial-gradient(circle at 88% 90%, rgba(30,58,138,0.05) 0%, rgba(30,58,138,0) 36%)',
  'radial-gradient(rgba(15,23,42,0.045) 1px, transparent 1.45px)',
  'linear-gradient(180deg, #F7F8FA 0%, #F2F4F7 100%)',
].join(', ');

const AIRMAIL_BG = 'repeating-linear-gradient(135deg, #C8102E 0 26px, #F8FAFC 26px 50px, #1E3A8A 50px 76px, #F8FAFC 76px 100px)';

const BARCODE_BG = 'repeating-linear-gradient(180deg, #0F172A 0 3px, transparent 3px 6px, #0F172A 6px 8px, transparent 8px 12px, #0F172A 12px 13px, transparent 13px 17px)';

const STUB_W = 142;

function PlaneIcon({ size = 20, color = RED }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ transform: 'rotate(90deg)', display: 'block' }} aria-hidden="true">
      <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
    </svg>
  );
}

function TicketRow({ p, ticketH, displayMode }: { p: BrochurePackage; ticketH: number; displayMode: 'hari' | 'seat' }) {
  const chip = promoChipLabel(p);
  const packageName = stripPromoWord(cleanPackageDisplayName(p.nama), chip);
  const pills = detectPackagePills(p.nama, p.umrohDulu);
  const tripDays = p.hari ?? countTripDays(p.berangkat_tgl, p.pulang_tgl);
  const dest = landingIata(p.landing);
  const isSoldOut = !!p.soldOut;
  const seat = p.seatSisa;
  const seatCritical = typeof seat === 'number' && seat > 0 && seat <= 5;
  // Konsep tiket menampilkan durasi DAN sisa seat sekaligus — toggle HARI/SEAT
  // hanya menentukan mana yang tampil saat data seat tidak tersedia.
  const showSeat = !isSoldOut && (typeof seat === 'number' || displayMode === 'seat');

  const stubBg = isSoldOut
    ? 'linear-gradient(150deg, #6B7686 0%, #475060 100%)'
    : chip
      ? 'linear-gradient(150deg, #F59E0B 0%, #C2670A 100%)'
      : 'linear-gradient(150deg, #D31530 0%, #A50D24 100%)';

  return (
    <div style={{
      position: 'relative', display: 'grid', gridTemplateColumns: `${STUB_W}px 1fr 196px`,
      height: ticketH, borderRadius: 15, overflow: 'hidden',
      background: isSoldOut ? '#F5F7F9' : chip ? '#FFFBF0' : '#fff',
      border: `1px solid ${BORDER}`, boxShadow: '0 7px 16px rgba(15,23,42,0.07)',
    }}>
      {/* Stub tanggal */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, background: stubBg, color: '#fff' }}>
        <span style={{ fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 700, fontSize: 42, lineHeight: 1, fontSynthesis: 'none' }}>{formatDepartureDay(p.berangkat_tgl)}</span>
        <span style={{ fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 500, fontSize: 13, letterSpacing: 2.5, opacity: 0.9, fontSynthesis: 'none' }}>
          {monthAbbrFromIso(p.berangkat_tgl, MONTH_ABBR_ID)} {yearFromIso(p.berangkat_tgl)}
        </span>
        {chip && (
          <span style={{ marginTop: 3, fontSize: 10.5, fontWeight: 800, letterSpacing: 1.5, background: 'rgba(255,255,255,0.25)', borderRadius: 999, padding: '2px 8px' }}>{chip}</span>
        )}
      </div>
      {/* Notch perforasi di batas stub */}
      <span style={{ position: 'absolute', left: STUB_W - 7, top: -8.5, width: 15, height: 15, borderRadius: '50%', background: PAGE_BG, border: `1px solid ${BORDER}`, zIndex: 3 }} />
      <span style={{ position: 'absolute', left: STUB_W - 7, bottom: -8.5, width: 15, height: 15, borderRadius: '50%', background: PAGE_BG, border: `1px solid ${BORDER}`, zIndex: 3 }} />

      {/* Isi tiket */}
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 7, padding: '10px 14px 10px 20px', borderLeft: '2px dashed #CBD5E1' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          <span style={{
            fontFamily: BROCHURE_ROBOTO_CONDENSED_FONT_STACK, fontWeight: 700,
            fontSize: packageName.length > 28 ? 21 : 25,
            color: isSoldOut ? '#8B95A5' : INK,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{packageName}</span>
          {pills.map(pill => (
            <span key={pill.label} style={{
              display: 'inline-flex', alignItems: 'center', flexShrink: 0, padding: '3.5px 10px 4.5px', borderRadius: 999,
              background: isSoldOut ? '#94A3B8' : pill.bg,
              color: isSoldOut ? '#fff' : pill.fg,
              fontFamily: BROCHURE_FONT_STACK, fontSize: 12, fontWeight: 600, fontSynthesis: 'none',
              lineHeight: 1, letterSpacing: 0.3, whiteSpace: 'nowrap',
            }}>{pill.label}</span>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
          {dest && (
            <>
              <span style={{ fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 700, fontSize: 21, color: isSoldOut ? '#8B95A5' : INK, letterSpacing: 1, fontSynthesis: 'none' }}>CGK</span>
              <span style={{ position: 'relative', width: 86, alignSelf: 'center', borderTop: '2.5px dotted #94A3B8' }}>
                <span style={{ position: 'absolute', left: '50%', top: -11, transform: 'translateX(-50%)' }}>
                  <PlaneIcon color={isSoldOut ? '#94A3B8' : RED} />
                </span>
              </span>
              <span style={{ fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 700, fontSize: 21, color: isSoldOut ? '#8B95A5' : INK, letterSpacing: 1, fontSynthesis: 'none' }}>{dest}</span>
            </>
          )}
          {p.maskapai && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', padding: '4px 11px 5px', borderRadius: 7,
              background: '#F1F5F9', border: `1px solid ${BORDER}`,
              fontFamily: BROCHURE_ROBOTO_CONDENSED_FONT_STACK, fontWeight: 600, fontSize: 15.5, letterSpacing: 0.6,
              color: isSoldOut ? '#8B95A5' : '#334155',
            }}>{p.maskapai}</span>
          )}
          {tripDays && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', padding: '3.5px 10px 4.5px', borderRadius: 7,
              border: `1.5px solid ${isSoldOut ? '#AAB2BF' : RED}`, color: isSoldOut ? '#8B95A5' : RED,
              fontFamily: BROCHURE_ROBOTO_CONDENSED_FONT_STACK, fontWeight: 700, fontSize: 14.5, letterSpacing: 0.5,
            }}>{tripDays} HARI</span>
          )}
        </div>
      </div>

      {/* Blok harga + barcode */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, borderLeft: '2px dashed #CBD5E1', paddingRight: 30 }}>
        {isSoldOut ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '7px 13px',
            borderRadius: 5, border: '3px solid #DC2626', color: '#DC2626', background: 'rgba(255,255,255,0.85)',
            fontFamily: BROCHURE_FONT_STACK, fontSize: 19, fontWeight: 900, letterSpacing: 0.8, transform: 'rotate(-8deg)',
          }}>SOLD OUT</span>
        ) : (
          <>
            <span style={{ fontFamily: BROCHURE_MONTSERRAT_FONT_STACK, whiteSpace: 'nowrap' }}>
              {typeof p.harga === 'number' ? (
                <>
                  <span style={{ fontSize: 36, fontWeight: 900, color: RED, letterSpacing: -0.5 }}>{formatHargaJt(p.harga)}</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: RED }}> Jt</span>
                </>
              ) : (
                <span style={{ fontSize: 19, fontWeight: 800, color: RED }}>Hubungi kami</span>
              )}
            </span>
            {showSeat && (
              <span style={seatCritical ? {
                fontSize: 13, fontWeight: 800, color: '#92400E', letterSpacing: 0.3,
                background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 999, padding: '2.5px 10px',
              } : {
                fontSize: 13, fontWeight: 600, color: '#64748B', letterSpacing: 0.3,
              }}>
                {typeof seat === 'number' ? `SISA ${seat} SEAT${seatCritical ? '!' : ''}` : 'SISA -'}
              </span>
            )}
          </>
        )}
        <span style={{ position: 'absolute', right: 9, top: 14, bottom: 14, width: 17, opacity: isSoldOut ? 0.18 : 0.8, background: BARCODE_BG }} />
      </div>
    </div>
  );
}

export function BoardingPassTemplate({ month, agent, displayMode = 'hari' }: BrochureDesignTemplateProps) {
  const photo = agent.photo || avatarFallback(agent.name);
  const phone = formatPhoneDisplay(agent.phone);
  const landingUrl = landingUrlForAgent(agent);
  const agentName = agent.name || 'Alhijaz';
  const title = month.label.toUpperCase();
  const titleFontSize = title.length >= 17 ? 100 : 114;
  const agentNameFontSize = agentName.length > 28 ? 30 : agentName.length > 22 ? 34 : 38;

  const n = month.packages.length;
  const ticketH = Math.max(85, Math.min(106, 85 + (10 - n) * 7));

  return (
    <div style={{
      width: BROCHURE_W,
      height: BROCHURE_H,
      position: 'relative',
      overflow: 'hidden',
      fontFamily: BROCHURE_FONT_STACK,
      fontSynthesis: 'none',
      background: CANVAS_BG,
      backgroundSize: 'auto, auto, 26px 26px, auto',
      color: INK,
    }}>
      <style>{BROCHURE_FONT_FACE_CSS}</style>

      {/* Strip airmail atas & bawah */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 14, zIndex: 10, background: AIRMAIL_BG }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 14, zIndex: 10, background: AIRMAIL_BG }} />

      {/* Header */}
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '34px 50px 8px' }}>
        <img src="/logo-alhijaz-besar.png" alt="Alhijaz" style={{ height: 96, display: 'block' }} />
        <img src="/img-brosur/pasti-umrah.png" alt="5 Pasti Umrah" style={{ width: 102, display: 'block', filter: 'drop-shadow(0 8px 16px rgba(16,24,40,0.14))' }} />
      </div>

      {/* Blok judul ala papan departures */}
      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', padding: '6px 50px 10px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, background: '#0F172A', borderRadius: 12, padding: '11px 24px', boxShadow: '0 10px 22px rgba(15,23,42,0.18)' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="#FFB300" aria-hidden="true" style={{ display: 'block' }}>
            <path d="M21.48 13.7 13.5 11V4.5A1.5 1.5 0 0 0 12 3a1.5 1.5 0 0 0-1.5 1.5V11l-7.98 2.7a.75.75 0 0 0-.52.71v1.09a.75.75 0 0 0 .9.73l7.6-1.73v4.13l-1.8 1.35a.6.6 0 0 0-.24.48v.94a.6.6 0 0 0 .74.58L12 21.5l2.8.48a.6.6 0 0 0 .74-.58v-.94a.6.6 0 0 0-.24-.48l-1.8-1.35V14.5l7.6 1.73a.75.75 0 0 0 .9-.73v-1.09a.75.75 0 0 0-.52-.71z" />
          </svg>
          <span style={{ fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 500, fontSize: 21, letterSpacing: 4, color: '#FFB300', fontSynthesis: 'none' }}>DEPARTURES — JADWAL KEBERANGKATAN UMROH</span>
        </div>
        <div style={{ fontFamily: BROCHURE_TABLE_FONT_STACK, fontSize: titleFontSize, lineHeight: 0.94, marginTop: 10, color: INK, letterSpacing: 2, whiteSpace: 'nowrap' }}>
          {title.replace(/\s+(\d{4})$/, '')}{/\d{4}$/.test(title) ? ' ' : ''}
          {/\d{4}$/.test(title) && <span style={{ color: RED }}>{title.match(/\d{4}$/)?.[0]}</span>}
        </div>
        <div style={{ width: 230, height: 7, borderRadius: 4, background: 'linear-gradient(90deg, #C8102E, #F0445F)', margin: '2px auto 12px' }} />
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 10, padding: '9px 22px 10px', borderRadius: 999,
          background: '#fff', border: '1.5px solid #D8DEE7', boxShadow: '0 6px 16px rgba(15,23,42,0.07)',
          color: RED, fontSize: 23, fontWeight: 900, lineHeight: 1,
        }}>
          <PlaneIcon size={19} />
          {landingUrl}
        </div>
      </div>

      {/* Daftar tiket */}
      <div style={{ position: 'relative', zIndex: 2, margin: '4px 50px 0', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {month.packages.map(p => (
          <TicketRow key={p.id} p={p} ticketH={ticketH} displayMode={displayMode} />
        ))}
      </div>

      {month.truncatedCount > 0 && (
        <div style={{
          margin: '10px 50px 0', position: 'relative', zIndex: 2,
          border: '2px dashed #C3CCD9', borderRadius: 13, background: 'rgba(255,255,255,0.75)',
          color: '#475569', fontWeight: 700, fontSize: 19, textAlign: 'center', padding: 11,
        }}>
          + {month.truncatedCount} keberangkatan lainnya — hubungi {agent.name?.trim() || 'kami'}
        </div>
      )}

      {/* Footer gelap dengan aksen merah */}
      <div style={{
        position: 'absolute', left: 50, right: 50, bottom: 44, zIndex: 3,
        display: 'flex', alignItems: 'center', gap: 22, padding: '17px 26px', borderRadius: 20,
        background: '#0F172A',
        boxShadow: `inset 6px 0 0 ${RED}, 0 18px 38px rgba(15,23,42,0.28)`,
      }}>
        <div style={{ position: 'relative', width: 110, height: 110, flexShrink: 0 }}>
          <img
            src={photo}
            alt=""
            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = avatarFallback(agent.name); }}
            style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: `4px solid ${RED}`, boxShadow: '0 8px 20px rgba(0,0,0,0.4)' }}
          />
          <span style={{
            position: 'absolute', right: -2, bottom: 0, width: 34, height: 34, borderRadius: '50%',
            background: '#1D9BF0', border: '3.5px solid #0F172A', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Check size={20} strokeWidth={4} />
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#94A3B8' }}>Info &amp; Pendaftaran:</span>
          <strong style={{ fontSize: agentNameFontSize, fontWeight: 900, color: '#fff', lineHeight: 1.05, marginTop: 2 }}>{agentName}</strong>
        </div>
        {phone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, whiteSpace: 'nowrap' }}>
            <span style={{ color: '#25D366', display: 'flex' }}><WhatsAppIcon size={50} /></span>
            <span style={{ fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 600, fontSize: 34, color: '#fff', letterSpacing: 1, fontSynthesis: 'none' }}>{phone}</span>
          </div>
        )}
      </div>
    </div>
  );
}

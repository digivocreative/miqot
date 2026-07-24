// Desain brosur "Boarding Pass" — setiap jadwal dirender sebagai tiket
// pesawat: stub tanggal + perforasi/notch, chip maskapai & durasi, barcode
// CSS, plus info sisa seat (badge kuning saat kritis). Opsi desain tambahan;
// katalog PDF tetap memakai template klasik.
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
  landingUrlForAgent,
  type BrochurePackage,
} from '../BrochureScheduleTemplate';
import {
  monthAbbrFromIso,
  promoChipLabel,
  stripDurationWord,
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
// Tinggi tiket adaptif: tiap tiket jadi flex-item yang membagi rata ruang
// daftar. Sedikit (n kecil) → mentok TICKET_MAX_H, sisa ruang jatuh di bawah;
// penuh (n=10) → mengecil ke arah TICKET_MIN_H sambil mengisi penuh & rata,
// jadi tidak lagi mepet/berantakan.
const TICKET_MIN_H = 82;
const TICKET_MAX_H = 106;

function PlaneIcon({ size = 20, color = RED }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ transform: 'rotate(90deg)', display: 'block' }} aria-hidden="true">
      <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
    </svg>
  );
}

function TicketRow({ p, displayMode }: { p: BrochurePackage; displayMode: 'hari' | 'seat' }) {
  const chip = promoChipLabel(p);
  const packageName = stripDurationWord(stripPromoWord(cleanPackageDisplayName(p.nama), chip));
  const pills = detectPackagePills(p.nama, p.umrohDulu);
  const tripDays = p.hari ?? countTripDays(p.berangkat_tgl, p.pulang_tgl);
  const isSoldOut = !!p.soldOut;
  const seat = p.seatSisa;
  const seatCritical = typeof seat === 'number' && seat > 0 && seat <= 5;
  // Toggle HARI/SEAT eksklusif (selaras desain lain): mode 'hari' → durasi di
  // bawah harga; mode 'seat' → sisa seat di bawah harga. Tidak pernah keduanya
  // dalam satu brosur.
  const showDuration = displayMode !== 'seat' && !!tripDays;
  const showSeat = displayMode === 'seat' && !isSoldOut;

  const stubBg = isSoldOut
    ? 'linear-gradient(150deg, #6B7686 0%, #475060 100%)'
    : chip
      ? 'linear-gradient(150deg, #F59E0B 0%, #C2670A 100%)'
      : 'linear-gradient(150deg, #D31530 0%, #A50D24 100%)';

  return (
    <div style={{
      position: 'relative', display: 'grid', gridTemplateColumns: `${STUB_W}px 1fr 196px`,
      flex: '1 1 0', minHeight: TICKET_MIN_H, maxHeight: TICKET_MAX_H, borderRadius: 15, overflow: 'hidden',
      background: isSoldOut ? '#F5F7F9' : chip ? '#FFFBF0' : '#fff',
      border: `1px solid ${BORDER}`, boxShadow: '0 7px 16px rgba(15,23,42,0.07)',
    }}>
      {/* Stub tanggal */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, background: stubBg, color: '#fff' }}>
        <span style={{ fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 700, fontSize: 42, lineHeight: 1, fontSynthesis: 'none' }}>{formatDepartureDay(p.berangkat_tgl)}</span>
        <span style={{ fontFamily: BROCHURE_OSWALD_FONT_STACK, fontWeight: 500, fontSize: 15, letterSpacing: 2, opacity: 0.92, fontSynthesis: 'none' }}>
          {monthAbbrFromIso(p.berangkat_tgl, MONTH_ABBR_ID)} {yearFromIso(p.berangkat_tgl)}
        </span>
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
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
          {p.maskapai && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', flexShrink: 0, padding: '4px 11px 5px', borderRadius: 7,
              background: '#F1F5F9', border: `1px solid ${BORDER}`,
              fontFamily: BROCHURE_ROBOTO_CONDENSED_FONT_STACK, fontWeight: 600, fontSize: 15.5, letterSpacing: 0.6,
              color: isSoldOut ? '#8B95A5' : '#334155',
            }}>{p.maskapai}</span>
          )}
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
                  <span style={{ fontSize: 33, fontWeight: 900, color: RED, letterSpacing: -0.5 }}>{formatHargaJt(p.harga)}</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: RED }}> Jt</span>
                </>
              ) : (
                <span style={{ fontSize: 19, fontWeight: 800, color: RED }}>Hubungi kami</span>
              )}
            </span>
            {showSeat && (
              <span style={seatCritical ? {
                fontSize: 15, fontWeight: 800, color: '#7C2D12', letterSpacing: 0.3,
                background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 999, padding: '2.5px 10px',
              } : {
                fontSize: 15, fontWeight: 700, color: '#334155', letterSpacing: 0.3,
              }}>
                {typeof seat === 'number' ? `SISA ${seat} SEAT${seatCritical ? '!' : ''}` : 'SISA - SEAT'}
              </span>
            )}
            {showDuration && (
              <span style={{ fontSize: 15, fontWeight: 700, color: '#334155', letterSpacing: 0.3 }}>
                {tripDays} HARI
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
  // Montserrat Black jauh lebih lebar & berisi dari Bebas Neue (yang tinggi-kurus):
  // ukur agar judul tetap muat satu baris (nowrap) di lebar area ~980px, lalu
  // batasi maksimum supaya nama bulan pendek tak berlebihan.
  const titleFontSize = Math.max(50, Math.min(96, Math.floor(900 / (title.length * 0.66))));
  const agentNameFontSize = agentName.length > 28 ? 30 : agentName.length > 22 ? 34 : 38;

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
      background: CANVAS_BG,
      backgroundSize: 'auto, auto, 26px 26px, auto',
      color: INK,
    }}>
      <style>{BROCHURE_FONT_FACE_CSS}</style>

      {/* Strip airmail atas & bawah */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 14, zIndex: 10, background: AIRMAIL_BG }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 14, zIndex: 10, background: AIRMAIL_BG }} />

      {/* Header */}
      <div style={{ position: 'relative', zIndex: 2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '34px 50px 8px' }}>
        <img src="/logo-alhijaz-besar.png" alt="Alhijaz" style={{ height: 96, display: 'block' }} />
        <img src="/img-brosur/pasti-umrah.png" alt="5 Pasti Umrah" style={{ width: 102, display: 'block', filter: 'drop-shadow(0 8px 16px rgba(16,24,40,0.14))' }} />
      </div>

      {/* Blok judul ala papan departures */}
      <div style={{ position: 'relative', zIndex: 2, flexShrink: 0, textAlign: 'center', padding: '6px 50px 10px' }}>
        {/* Eyebrow ringan: caps ber-tracking diapit garis rambut — memberi napas
            untuk headline, tanpa kotak gelap yang beradu dengan poster. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 15 }}>
          <span style={{ width: 58, height: 2, borderRadius: 2, background: 'linear-gradient(90deg, rgba(203,213,225,0) 0%, #CBD5E1 100%)' }} />
          <PlaneIcon size={17} />
          <span style={{ fontFamily: BROCHURE_OSWALD_FONT_STACK, fontSize: 17, letterSpacing: 3, fontSynthesis: 'none', whiteSpace: 'nowrap' }}>
            <span style={{ fontWeight: 700, color: '#1E293B' }}>DEPARTURES</span>
            <span style={{ color: '#CBD5E1', fontWeight: 500, margin: '0 9px' }}>|</span>
            <span style={{ fontWeight: 500, color: '#64748B' }}>JADWAL KEBERANGKATAN UMROH</span>
          </span>
          <span style={{ width: 58, height: 2, borderRadius: 2, background: 'linear-gradient(270deg, rgba(203,213,225,0) 0%, #CBD5E1 100%)' }} />
        </div>
        <div style={{ fontFamily: BROCHURE_MONTSERRAT_FONT_STACK, fontWeight: 900, fontSize: titleFontSize, lineHeight: 1, marginTop: 12, color: INK, letterSpacing: -0.5, whiteSpace: 'nowrap' }}>
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

      {/* Daftar tiket — flex-grow: mengisi ruang antara judul & footer, tiap
          tiket membagi rata (lihat TICKET_MIN_H/TICKET_MAX_H). */}
      <div style={{ position: 'relative', zIndex: 2, flex: '1 1 auto', minHeight: 0, margin: '8px 50px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {month.packages.map(p => (
          <TicketRow key={p.id} p={p} displayMode={displayMode} />
        ))}
      </div>

      {month.truncatedCount > 0 && (
        <div style={{
          flexShrink: 0, margin: '0 50px 12px', position: 'relative', zIndex: 2,
          border: '2px dashed #C3CCD9', borderRadius: 13, background: 'rgba(255,255,255,0.75)',
          color: '#475569', fontWeight: 700, fontSize: 19, textAlign: 'center', padding: 11,
        }}>
          + {month.truncatedCount} keberangkatan lainnya — hubungi {agent.name?.trim() || 'kami'}
        </div>
      )}

      {/* Footer gelap dengan aksen merah */}
      <div style={{
        flexShrink: 0, margin: '0 50px 44px', zIndex: 3,
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

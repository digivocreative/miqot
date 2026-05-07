import { Check } from 'lucide-react';
import { normalizeWaNumber } from '../utils/phone';
import WhatsAppIcon from './bio/WhatsAppIcon';

export interface BrochurePackage {
  id: string;
  nama: string;
  maskapai: string;
  berangkat_tgl: string; // YYYY-MM-DD
  pulang_tgl: string;
  hari?: number | null;
  hotel?: BrochureHotel[];
  harga: number | null;
  soldOut?: boolean;
}

export interface BrochureHotel {
  city: string;
  name: string;
  stars: number | null;
}

export interface BrochureMonth {
  key: string;
  label: string;
  monthIndexId: number;
  year: number;
  packages: BrochurePackage[];
  truncatedCount: number;
}

export interface BrochureAgent {
  slug?: string;
  name: string;
  phone: string;
  photo: string;
  website: string;
}

export interface BrochureScheduleTemplateProps {
  month: BrochureMonth;
  agent: BrochureAgent;
}

export const BROCHURE_W = 1080;
export const BROCHURE_H = 1920;

export const BROCHURE_FONT_STACK = "'Inter', 'Inter var', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
export const BROCHURE_TABLE_FONT_STACK = "'Bebas Neue', 'Inter', 'Arial Narrow', system-ui, sans-serif";
export const BROCHURE_FONT_WEIGHTS = [400, 600, 700, 800, 900] as const;

const MONTH_ABBR_ID = ['JAN','FEB','MAR','APR','MEI','JUN','JUL','AGT','SEP','OKT','NOV','DES'];
const BRAND_RED = '#C8102E';
const DEEP_RED = '#870018';
const DARK_RED = '#5A0010';
const GOLD = '#C98A2C';
const PALE_GOLD = '#F8DFA1';
const CREAM = '#FFF8EC';
const ROW_LINE = '#F0D8B5';
const INK = '#241A1C';
const MUTED = '#6F6264';
const ISLAMIC_PATTERN_BG = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cg fill='none' stroke='%23C8102E' stroke-opacity='.28' stroke-width='2'%3E%3Cpath d='M60 6 75 45 114 60 75 75 60 114 45 75 6 60 45 45Z'/%3E%3Cpath d='M60 24 72 60 60 96 48 60Z'/%3E%3Ccircle cx='60' cy='60' r='18'/%3E%3Cpath d='M24 24 45 45M96 24 75 45M96 96 75 75M24 96 45 75'/%3E%3C/g%3E%3Cg fill='none' stroke='%23C98A2C' stroke-opacity='.35' stroke-width='1.5'%3E%3Cpath d='M0 60h120M60 0v120'/%3E%3C/g%3E%3C/svg%3E\")";
const DOME_IMAGE = '/img-brosur/nabawi-dome.png';
const KABAH_IMAGE = '/img-brosur/kabah.png';
const NABAWI_WIDE_IMAGE = '/img-brosur/nabawi-wide.png';
const TABLE_COLUMNS = '74px 276px 64px 374px 160px';
const PACKAGE_NAME_FONT_SIZE = 25;

function formatHargaJt(harga: number): string {
  // Round to nearest 100k juta-precision (e.g. 33_950_000 → 34.0, 33_949_999 → 33.9).
  const jt = Math.round(harga / 100_000) / 10;
  return jt.toFixed(1);
}

function formatTglID(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return '';
  // Round-trip check: detect calendar overflow (e.g., 2025-02-29 → Mar 1)
  if (d.getUTCDate() !== parseInt(iso.slice(8, 10), 10)) return '';
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTH_ABBR_ID[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function formatDepartureDay(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '-';
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return '-';
  if (d.getUTCDate() !== parseInt(iso.slice(8, 10), 10)) return '-';
  return String(d.getUTCDate());
}

function formatPhoneDisplay(rawPhone: string): string {
  // normalizeWaNumber returns 62-prefixed digits (e.g. "6282290002").
  // Brochure displays the local 0-prefixed grouping: "0822-9000-20".
  const norm = normalizeWaNumber(rawPhone);
  if (!norm) return '';
  const local = '0' + norm.slice(2); // "62..." → "0..."
  // Ungrouped fallback for inputs too short to group meaningfully.
  if (local.length < 10) return local;
  return `${local.slice(0, 4)}-${local.slice(4, 8)}-${local.slice(8)}`;
}

function avatarFallback(name: string): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'A')}&background=8B0000&color=fff&size=192`;
}

function cleanWebsite(website: string): string {
  return (website || '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/g, '')
    .toLowerCase();
}

function landingUrlForAgent(agent: BrochureAgent): string {
  const slug = (agent.slug || '').trim().replace(/^\/+|\/+$/g, '').toLowerCase();
  if (slug) return `alhijaz.co/${slug}`;

  const website = cleanWebsite(agent.website);
  if (website.startsWith('alhijaz.co/') && website.length > 'alhijaz.co/'.length) {
    return website;
  }
  return 'alhijaz.co';
}

function hotelNameFontSize(name: string): number {
  const len = name.length;
  if (len > 38) return 18;
  if (len > 30) return 19;
  return 21;
}

function starCount(stars: number | null | undefined): number {
  const n = Number(stars);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(5, Math.round(n)));
}

function cleanPackageDisplayName(name: string): string {
  return String(name || '')
    .replace(/\bMIX\s+(?:PAKET\s+)?(?:RAHMAH\s*&\s*UHUD|UHUD\s*&\s*RAHMAH|RAHMAH\s+UHUD|UHUD\s+RAHMAH)\b/gi, '')
    .replace(/\b\d+\s*HR\b/gi, '')
    .replace(/\s+\(/g, ' (')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s{2,}/g, ' ')
    .replace(/\+\s*$/g, '')
    .trim();
}

function countTripDays(berangkat: string, pulang: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(berangkat) || !/^\d{4}-\d{2}-\d{2}$/.test(pulang)) return null;
  const start = new Date(`${berangkat}T00:00:00.000Z`);
  const end = new Date(`${pulang}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return days > 0 ? days : null;
}

function orderedHotels(hotels: BrochureHotel[]): BrochureHotel[] {
  const cityRank = (city: string) => {
    const normalized = city.toLowerCase();
    if (normalized.includes('mekkah')) return 0;
    if (normalized.includes('madinah')) return 1;
    return 2;
  };
  return [...hotels].sort((a, b) => cityRank(a.city) - cityRank(b.city)).slice(0, 2);
}

export function BrochureScheduleTemplate({ month, agent }: BrochureScheduleTemplateProps) {
  const photo = agent.photo || avatarFallback(agent.name);
  const phone = formatPhoneDisplay(agent.phone);
  const landingUrl = landingUrlForAgent(agent);
  const agentName = agent.name || 'Alhijaz';
  const monthTitle = month.label.toUpperCase();
  const monthTitleFontSize = monthTitle.length >= 14 ? 92 : monthTitle.length >= 12 ? 100 : 108;
  const agentNameFontSize = agentName.length > 28 ? 32 : agentName.length > 22 ? 36 : agentName.length > 16 ? 39 : 42;
  const phoneFontSize = phone.length > 14 ? 26 : 28;

  // Row height adapts: 7 rows = 110px, 10 rows = 90px (linear). Cap min 80px.
  const n = month.packages.length;
  const rowH = Math.max(80, Math.round(110 - (n - 7) * 5));
  const landmarkMaxH = Math.max(188, 282 - Math.max(0, n - 7) * 30);

  return (
    <div style={{
      width: BROCHURE_W,
      height: BROCHURE_H,
      position: 'relative',
      overflow: 'hidden',
      fontFamily: BROCHURE_FONT_STACK,
      background: '#FFFFFF',
      color: INK,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        position: 'absolute',
        top: -78,
        right: -90,
        width: 500,
        height: 500,
        backgroundImage: ISLAMIC_PATTERN_BG,
        backgroundSize: '132px 132px',
        opacity: 0.18,
        transform: 'rotate(7deg)',
        zIndex: 0,
      }} />
      <div style={{
        position: 'absolute',
        left: -110,
        bottom: 104,
        width: 620,
        height: 620,
        backgroundImage: ISLAMIC_PATTERN_BG,
        backgroundSize: '140px 140px',
        opacity: 0.12,
        transform: 'rotate(-9deg)',
        zIndex: 0,
      }} />
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(circle at 50% 14%, rgba(200,16,46,0.08) 0%, rgba(200,16,46,0) 42%), linear-gradient(180deg, rgba(255,248,236,0.9) 0%, rgba(255,255,255,0) 28%, rgba(255,248,236,0.65) 100%)',
        zIndex: 0,
      }} />
      <img
        src={DOME_IMAGE}
        alt=""
        style={{
          position: 'absolute',
          top: 132,
          right: -190,
          width: 540,
          height: 'auto',
          objectFit: 'contain',
          opacity: 0.07,
          filter: 'saturate(0.85)',
          zIndex: 0,
        }}
      />
      <img
        src={KABAH_IMAGE}
        alt=""
        style={{
          position: 'absolute',
          top: 130,
          left: -152,
          width: 360,
          height: 'auto',
          objectFit: 'contain',
          opacity: 0.04,
          filter: 'saturate(0.7)',
          zIndex: 0,
        }}
      />

      {/* Header bar — uniform 50px insets on all sides */}
      <div style={{
        height: 166,
        position: 'relative',
        zIndex: 2,
      }}>
        <img
          src="/logo-alhijaz-besar.png"
          alt="Alhijaz"
          style={{
            position: 'absolute',
            top: 42,
            left: 50,
            height: 108,
            width: 'auto',
            objectFit: 'contain',
          }}
        />
        <div style={{
          position: 'absolute',
          left: 50,
          right: 50,
          bottom: 0,
          height: 2,
          background: `linear-gradient(90deg, ${BRAND_RED} 0%, ${PALE_GOLD} 48%, rgba(200,16,46,0) 100%)`,
          opacity: 0.75,
        }} />
        <img
          src="https://alhijaz.b-cdn.net/png/pasti-umrah.png"
          crossOrigin="anonymous"
          alt="5 Pasti Umrah"
          style={{
            position: 'absolute',
            top: 48,
            right: 50,
            width: 112,
            height: 'auto',
            objectFit: 'contain',
            filter: 'drop-shadow(0 10px 18px rgba(90,0,16,0.18))',
          }}
        />
      </div>

      {/* Title block */}
      <div style={{
        padding: '34px 60px 18px',
        textAlign: 'center',
        position: 'relative',
        zIndex: 2,
      }}>
        <div style={{
          fontSize: 88, fontWeight: 900, lineHeight: 0.92, letterSpacing: 0,
          color: BRAND_RED,
          textShadow: '0 5px 0 rgba(248,223,161,0.65)',
        }}>PAKET UMROH</div>
        <div style={{
          position: 'relative',
          display: 'inline-block',
          fontSize: monthTitleFontSize,
          fontWeight: 900,
          lineHeight: 0.96,
          letterSpacing: 0,
          marginTop: 4,
          padding: '0 24px 12px',
        }}>
          <span aria-hidden="true" style={{
            position: 'absolute',
            inset: '0 24px 12px',
            transform: 'translateY(7px)',
            color: PALE_GOLD,
            opacity: 0.95,
            zIndex: 0,
          }}>{monthTitle}</span>
          <span aria-hidden="true" style={{
            position: 'absolute',
            inset: '0 24px 12px',
            color: 'transparent',
            WebkitTextStroke: `7px ${PALE_GOLD}`,
            zIndex: 1,
          }}>{monthTitle}</span>
          <span style={{
            position: 'relative',
            zIndex: 3,
            color: BRAND_RED,
            WebkitTextStroke: `2px ${DEEP_RED}`,
            textShadow: '0 2px 0 rgba(255,255,255,0.38), 0 12px 24px rgba(90,0,16,0.16)',
          }}>{monthTitle}</span>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 'max-content',
          maxWidth: '100%',
          padding: '9px 22px 10px',
          margin: '6px auto 0',
          borderRadius: 999,
          background: 'rgba(255,255,255,0.78)',
          border: `2px solid ${PALE_GOLD}`,
          boxShadow: '0 10px 28px rgba(90,0,16,0.08)',
          color: DEEP_RED,
          fontSize: 26,
          fontWeight: 900,
          lineHeight: 1,
        }}>
          {landingUrl}
        </div>
      </div>

      {/* Package table */}
      <div style={{
        margin: '0 50px',
        borderRadius: 26,
        overflow: 'hidden',
        background: '#FFFFFF',
        border: `2px solid ${ROW_LINE}`,
        boxShadow: '0 26px 54px rgba(90,0,16,0.14)',
        position: 'relative',
        zIndex: 2,
        fontFamily: BROCHURE_TABLE_FONT_STACK,
      }}>
        {/* Header row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: TABLE_COLUMNS,
          background: `linear-gradient(90deg, ${DEEP_RED} 0%, ${BRAND_RED} 100%)`,
          color: '#fff',
          fontWeight: 400,
          fontSize: 28,
          height: 70,
          alignItems: 'center',
          padding: '0 14px',
          letterSpacing: 0.5,
        }}>
          <span style={{ textAlign: 'center' }}>TGL</span>
          <span style={{ textAlign: 'center' }}>PAKET</span>
          <span style={{ textAlign: 'center' }}>HARI</span>
          <span style={{ textAlign: 'center' }}>HOTEL</span>
          <span style={{ textAlign: 'center' }}>HARGA</span>
        </div>

        {/* Data rows */}
        {month.packages.map((p, i) => {
          const packageName = cleanPackageDisplayName(p.nama);
          const tripDays = p.hari ?? countTripDays(p.berangkat_tgl, p.pulang_tgl);
          const hotels = orderedHotels(p.hotel || []);
          const departureDay = formatDepartureDay(p.berangkat_tgl);

          return (
            <div key={p.id} style={{
              display: 'grid',
              gridTemplateColumns: TABLE_COLUMNS,
              background: i % 2 === 0 ? '#FFFFFF' : CREAM,
              color: INK,
              fontWeight: 400,
              fontSize: 24,
              height: rowH,
              alignItems: 'center',
              padding: '0 14px',
              borderTop: i === 0 ? 'none' : `1px solid ${ROW_LINE}`,
              letterSpacing: 0.15,
            }}>
              <span style={{
                width: 58,
                height: 54,
                justifySelf: 'center',
                borderRadius: 10,
                background: `linear-gradient(145deg, ${DEEP_RED} 0%, ${BRAND_RED} 100%)`,
                color: '#fff',
                border: `2px solid ${PALE_GOLD}`,
                boxShadow: '0 8px 16px rgba(90,0,16,0.18)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 0.9,
                overflow: 'hidden',
              }}>
                <span style={{ fontSize: 42, fontWeight: 400 }}>{departureDay}</span>
              </span>
              <span style={{
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                paddingLeft: 16,
                paddingRight: 12,
                lineHeight: 1.04,
                fontSize: PACKAGE_NAME_FONT_SIZE,
                fontWeight: 400,
              }}>
                {packageName}
              </span>
              <span style={{
                textAlign: 'center',
                color: DEEP_RED,
                fontWeight: 400,
                lineHeight: 0.9,
                whiteSpace: 'nowrap',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <span style={{ fontSize: 36 }}>{tripDays || '-'}</span>
                <span style={{ fontSize: 15, letterSpacing: 0.8 }}>HARI</span>
              </span>
              <span style={{
                minWidth: 0,
                display: 'grid',
                gridTemplateColumns: hotels.length > 1 ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)',
                columnGap: 18,
                paddingRight: 12,
              }}>
                {hotels.length > 0 ? hotels.map((h) => {
                  const stars = starCount(h.stars);
                  return (
                    <span key={`${p.id}-${h.city}`} style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 5,
                      minWidth: 0,
                    }}>
                      <span style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        minWidth: 0,
                        lineHeight: 0.95,
                      }}>
                        <span style={{ color: MUTED, fontSize: 20, fontWeight: 400, textTransform: 'uppercase' }}>{h.city}</span>
                        {stars > 0 && (
                          <span style={{
                            color: GOLD,
                            fontFamily: BROCHURE_FONT_STACK,
                            fontSize: 14,
                            letterSpacing: -1,
                            fontWeight: 900,
                            whiteSpace: 'nowrap',
                          }}>
                            {'★'.repeat(stars)}
                          </span>
                        )}
                      </span>
                      <span style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        fontSize: hotelNameFontSize(h.name),
                        fontWeight: 400,
                        color: INK,
                        lineHeight: 0.92,
                      }}>
                        {h.name}
                      </span>
                    </span>
                  );
                }) : (
                  <span style={{ color: MUTED, fontSize: 23, fontWeight: 400 }}>Hotel menyusul</span>
                )}
              </span>
              <span style={{
                textAlign: 'center',
                whiteSpace: 'nowrap',
                fontFamily: BROCHURE_FONT_STACK,
              }}>
                {p.soldOut ? (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '7px 11px 8px',
                    borderRadius: 2,
                    background: '#F01822',
                    color: '#fff',
                    border: '3px solid rgba(255,255,255,0.92)',
                    outline: '3px solid #F01822',
                    outlineOffset: 1,
                    fontFamily: BROCHURE_TABLE_FONT_STACK,
                    fontSize: 31,
                    fontWeight: 400,
                    letterSpacing: 1.2,
                    lineHeight: 0.92,
                    textTransform: 'uppercase',
                    transform: 'rotate(-7deg)',
                    boxShadow: '0 10px 18px rgba(90,0,16,0.2)',
                    textShadow: '0 1px 0 rgba(90,0,16,0.24)',
                  }}>
                    SOLD OUT
                  </span>
                ) : typeof p.harga === 'number' ? (
                  <>
                    <span style={{ fontSize: 40, color: DEEP_RED, fontWeight: 900, letterSpacing: -0.4 }}>{formatHargaJt(p.harga)}</span>
                    <span style={{ fontSize: 20, color: DEEP_RED, fontWeight: 800 }}> Jt</span>
                  </>
                ) : (
                  <span style={{ fontSize: 22, color: DEEP_RED, fontWeight: 800 }}>Hubungi kami</span>
                )}
              </span>
            </div>
          );
        })}

        {/* Truncation footnote */}
        {month.truncatedCount > 0 && (
          <div style={{
            background: CREAM,
            color: DEEP_RED,
            fontWeight: 700,
            fontSize: 20,
            padding: '14px 18px',
            textAlign: 'center',
            borderTop: `1px dashed ${GOLD}`,
          }}>
            + {month.truncatedCount} paket lainnya — hubungi {agent.name?.trim() || 'kami'}
          </div>
        )}
      </div>

      {/* Mecca + Madinah backdrop — fills remaining space, images stay fully visible */}
      <div style={{
        flex: 1,
        position: 'relative',
        zIndex: 1,
        marginTop: 12,
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 214,
          background: `linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,248,236,0.58) 48%, rgba(248,223,161,0.52) 100%)`,
        }} />
        <img
          src={KABAH_IMAGE}
          alt=""
          style={{
            position: 'absolute',
            left: 128,
            bottom: -42,
            maxHeight: landmarkMaxH + 112,
            width: 'auto',
            objectFit: 'contain',
            opacity: 0.34,
            filter: 'saturate(0.74) contrast(0.88) brightness(1.08) drop-shadow(0 18px 34px rgba(90,0,16,0.06))',
            WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 22%, #000 72%, transparent 100%)',
            maskImage: 'linear-gradient(180deg, transparent 0%, #000 22%, #000 72%, transparent 100%)',
          }}
        />
        <img
          src={NABAWI_WIDE_IMAGE}
          alt=""
          style={{
            position: 'absolute',
            right: 100,
            bottom: -54,
            maxHeight: landmarkMaxH + 124,
            width: 'auto',
            objectFit: 'contain',
            opacity: 0.32,
            filter: 'saturate(0.74) contrast(0.88) brightness(1.08) drop-shadow(0 18px 34px rgba(90,0,16,0.06))',
            WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 22%, #000 72%, transparent 100%)',
            maskImage: 'linear-gradient(180deg, transparent 0%, #000 22%, #000 72%, transparent 100%)',
          }}
        />
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.52) 28%, rgba(255,248,236,0.2) 58%, rgba(248,223,161,0.24) 100%)',
        }} />
      </div>

      {/* Footer pill — agent info */}
      <div style={{
        margin: '0 50px 42px',
        padding: '22px 28px',
        borderRadius: 26,
        background: `linear-gradient(135deg, ${DARK_RED} 0%, ${DEEP_RED} 44%, ${BRAND_RED} 100%)`,
        border: `3px solid ${PALE_GOLD}`,
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        position: 'relative',
        zIndex: 2,
        boxShadow: '0 18px 40px rgba(90,0,16,0.26)',
      }}>
        <div style={{ position: 'relative', width: 126, height: 126, flexShrink: 0 }}>
          <img
            src={photo}
            alt=""
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = avatarFallback(agent.name);
            }}
            style={{
              width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover',
              border: `5px solid ${PALE_GOLD}`,
              boxShadow: '0 10px 26px rgba(0,0,0,0.24)',
            }}
          />
          <span style={{
            position: 'absolute',
            right: -3,
            bottom: 0,
            width: 38,
            height: 38,
            borderRadius: '50%',
            background: '#1D9BF0',
            border: '4px solid #fff',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 16px rgba(0,0,0,0.28)',
          }}>
            <Check size={24} strokeWidth={4} />
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 24, color: PALE_GOLD, fontWeight: 800, letterSpacing: 0 }}>
            Info &amp; Pendaftaran:
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 3 }}>
            <strong style={{ fontSize: agentNameFontSize, fontWeight: 900, color: '#fff', lineHeight: 1.05 }}>
              {agentName}
            </strong>
            {phone && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 13px 9px 9px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(248,223,161,0.52)',
                color: '#fff',
                fontWeight: 900,
                lineHeight: 1,
              }}>
                <span style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: '#25D366',
                  color: '#fff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.16)',
                }}>
                  <WhatsAppIcon size={24} />
                </span>
                <span style={{ fontSize: phoneFontSize }}>{phone}</span>
              </span>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

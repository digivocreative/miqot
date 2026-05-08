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
  umrohDulu?: boolean;
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
  /**
   * When true, the date badge stacks day + full month name. Used when the
   * filter spans multiple months (Tipe Paket / Maskapai) so each row stays
   * unambiguous. Defaults to false (day-only) for the Bulan filter.
   */
  showFullDate?: boolean;
}

// Order matters: the first matching pattern wins. Foreign extensions are
// listed before in-KSA local extensions (Taif, Badar) so a "PLUS DUBAI + TAIF"
// package categorises as Dubai, not Taif.
export const PACKAGE_TYPES: ReadonlyArray<{ value: string; pattern: RegExp }> = [
  { value: 'PLUS TURKI',  pattern: /\b(TURK[IY]|TURKEY)\b/i },
  { value: 'PLUS DUBAI',  pattern: /\bDUBAI\b/i },
  { value: 'PLUS MESIR',  pattern: /\b(MESIR|CAIRO|ALEXANDRIA|EGYPT)\b/i },
  { value: 'PLUS HAIKOU', pattern: /\bHAIKOU\b/i },
  { value: 'PLUS REDSEA', pattern: /\bREDSEA\b/i },
  { value: 'PLUS TAIF',   pattern: /\bTAIF\b/i },
  { value: 'PLUS BADAR',  pattern: /\bBADAR\b/i },
];

export function derivePackageType(rawName: string | undefined | null): string {
  const s = String(rawName || '');
  for (const t of PACKAGE_TYPES) {
    if (t.pattern.test(s)) return t.value;
  }
  return 'UMROH SAJA';
}

export const BROCHURE_W = 1080;
export const BROCHURE_H = 1620;

export const BROCHURE_FONT_STACK = "'Inter', 'Inter var', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
export const BROCHURE_TABLE_FONT_STACK = "'Bebas Neue', 'Inter', 'Arial Narrow', system-ui, sans-serif";
export const BROCHURE_OSWALD_FONT_STACK = "'Oswald', 'Inter', 'Arial Narrow', system-ui, sans-serif";
export const BROCHURE_ROBOTO_CONDENSED_FONT_STACK = "'Roboto Condensed', 'Inter', 'Arial Narrow', system-ui, sans-serif";
export const BROCHURE_MONTSERRAT_FONT_STACK = "'Montserrat', 'Inter', system-ui, -apple-system, sans-serif";
export const BROCHURE_FONT_WEIGHTS = [400, 600, 700, 800, 900] as const;

const MONTH_ABBR_ID = ['JAN','FEB','MAR','APR','MEI','JUN','JUL','AGT','SEP','OKT','NOV','DES'];
const MONTH_FULL_ID = ['JANUARI','FEBRUARI','MARET','APRIL','MEI','JUNI','JULI','AGUSTUS','SEPTEMBER','OKTOBER','NOVEMBER','DESEMBER'];
const BRAND_RED = '#C8102E';
const DEEP_RED = '#870018';
const DARK_RED = '#5A0010';
const GOLD = '#C98A2C';
const PALE_GOLD = '#F8DFA1';
const CREAM = '#FFF8EC';
const ROW_LINE = '#F0D8B5';
const INK = '#241A1C';
const MUTED = '#6F6264';
const CANVAS_BACKGROUND = [
  'radial-gradient(circle at 50% 14%, rgba(200,16,46,0.08) 0%, rgba(200,16,46,0) 42%)',
  'radial-gradient(ellipse at 50% 103%, rgba(150,166,142,0.34) 0%, rgba(231,210,158,0.26) 42%, rgba(255,248,236,0) 76%)',
  'linear-gradient(180deg, rgba(255,248,236,0.94) 0%, #FFFFFF 31%, rgba(255,248,236,0.58) 67%, rgba(236,216,164,0.46) 84%, rgba(182,195,169,0.38) 100%)',
].join(', ');
const ISLAMIC_PATTERN_BG = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cg fill='none' stroke='%23C8102E' stroke-opacity='.28' stroke-width='2'%3E%3Cpath d='M60 6 75 45 114 60 75 75 60 114 45 75 6 60 45 45Z'/%3E%3Cpath d='M60 24 72 60 60 96 48 60Z'/%3E%3Ccircle cx='60' cy='60' r='18'/%3E%3Cpath d='M24 24 45 45M96 24 75 45M96 96 75 75M24 96 45 75'/%3E%3C/g%3E%3Cg fill='none' stroke='%23C98A2C' stroke-opacity='.35' stroke-width='1.5'%3E%3Cpath d='M0 60h120M60 0v120'/%3E%3C/g%3E%3C/svg%3E\")";
const DOME_IMAGE = '/img-brosur/nabawi-dome.png';
const KABAH_IMAGE = '/img-brosur/kabah.png';
const NABAWI_WIDE_IMAGE = '/img-brosur/nabawi-wide.png';
const TABLE_COLUMNS = '104px 444px 88px 140px 172px';
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
  const initials = String(name || 'A')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('') || 'A';
  const safeInitials = initials.replace(/[<>&"']/g, '') || 'A';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192"><rect width="192" height="192" rx="96" fill="#8B0000"/><text x="96" y="104" text-anchor="middle" dominant-baseline="middle" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="700">${safeInitials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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

// Phrases below are surfaced as pills under the package name; strip them from
// the title so they don't appear twice. Keep this list aligned with PILL_TAGS.
function cleanPackageDisplayName(name: string): string {
  const cleaned = String(name || '')
    .replace(/\bMIX\s+(?:PAKET\s+)?(?:RAHMAH\s*&\s*UHUD|UHUD\s*&\s*RAHMAH|RAHMAH\s+UHUD|UHUD\s+RAHMAH)\b/gi, '')
    .replace(/\b\d+\s*HR\b/gi, '')
    // Pill keywords — strip from the title.
    .replace(/\bUMR[OA]H\s+DULU\b/gi, '')
    .replace(/\bMEK+AH\s+DULU\b/gi, '')
    .replace(/\s*\(?\s*KERETA\s+CEPAT\s*\)?\s*/gi, ' ')
    .replace(/\bRAHMAH\b/gi, '')
    .replace(/\bJUM['‘’]?ATAIN\b/gi, '')
    // Tidy parens, plus signs, and whitespace left behind by the strips.
    .replace(/\s+\(/g, ' (')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\(\s*\)/g, '')           // empty parens
    .replace(/\s*\+\s*\+\s*/g, ' + ')  // doubled plus
    .replace(/^\s*\+\s*/g, '')          // leading plus
    .replace(/\s*\+\s*$/g, '')          // trailing plus
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Ensure every title leads with the trip type. If the source name already
  // contains UMRAH/UMROH (any spelling/case), leave it alone; otherwise prepend.
  if (cleaned && !/\bUMR[OA]H\b/i.test(cleaned)) {
    return `UMROH ${cleaned}`;
  }
  return cleaned;
}

// Order of definitions = display order of pills under the title.
type PillTag = { label: string; pattern: RegExp; bg: string; fg: string };
const UMROH_DULU_PILL: PillTag = {
  label: 'Umroh Dulu',
  pattern: /\b(?:UMR[OA]H|MEK+AH)\s+DULU\b/i,
  bg: PALE_GOLD,
  fg: DARK_RED,
};
const PILL_TAGS: ReadonlyArray<PillTag> = [
  { label: 'Hotel Bintang 5', pattern: /\bRAHMAH\b/i,            bg: '#7A4F12', fg: '#FFFFFF' },
  UMROH_DULU_PILL,
  { label: 'Kereta Cepat',    pattern: /\bKERETA\s+CEPAT\b/i,    bg: '#0F766E', fg: '#FFFFFF' },
  { label: '2x Jumatan',      pattern: /\bJUM['‘’]?ATAIN\b/i,    bg: DARK_RED,  fg: '#FFFFFF' },
];

function detectPackagePills(rawName: string, umrohDulu?: boolean): PillTag[] {
  const s = String(rawName || '');
  const pills = PILL_TAGS.filter(t => t.pattern.test(s));
  if (umrohDulu && !pills.some(p => p.label === UMROH_DULU_PILL.label)) {
    const insertAt = pills.findIndex(p => p.label === 'Kereta Cepat');
    if (insertAt >= 0) pills.splice(insertAt, 0, UMROH_DULU_PILL);
    else pills.push(UMROH_DULU_PILL);
  }
  return pills;
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

function formatDepartureMonthName(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return '';
  if (d.getUTCDate() !== parseInt(iso.slice(8, 10), 10)) return '';
  return MONTH_FULL_ID[d.getUTCMonth()];
}

export function BrochureScheduleTemplate({ month, agent, showFullDate = false }: BrochureScheduleTemplateProps) {
  const photo = agent.photo || avatarFallback(agent.name);
  const phone = formatPhoneDisplay(agent.phone);
  const landingUrl = landingUrlForAgent(agent);
  const agentName = agent.name || 'Alhijaz';
  const monthTitle = month.label.toUpperCase();
  const monthTitleFontSize = monthTitle.length >= 14 ? 80 : monthTitle.length >= 12 ? 86 : 92;
  const agentNameFontSize = agentName.length > 28 ? 32 : agentName.length > 22 ? 36 : agentName.length > 16 ? 39 : 42;
  const phoneFontSize = phone.length > 14 ? 28 : 32;

  // Row height adapts to fit a 1080×1620 (2:3) canvas. With max 10 packages/image:
  // n=7 → 105px, n=10 → 87px. Floor 80px / cap 110px keep rows legible without wasting space.
  const n = month.packages.length;
  const rowH = Math.max(80, Math.min(110, Math.round(105 - (n - 7) * 6)));
  const landmarkMaxH = Math.max(160, 230 - Math.max(0, n - 7) * 26);

  return (
    <div style={{
      width: BROCHURE_W,
      height: BROCHURE_H,
      position: 'relative',
      overflow: 'hidden',
      fontFamily: BROCHURE_FONT_STACK,
      fontSynthesis: 'none',
      background: CANVAS_BACKGROUND,
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
        height: 150,
        position: 'relative',
        zIndex: 2,
      }}>
        <img
          src="/logo-alhijaz-besar.png"
          alt="Alhijaz"
          style={{
            position: 'absolute',
            top: 38,
            left: 50,
            height: 96,
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
          src="/img-brosur/pasti-umrah.png"
          alt="5 Pasti Umrah"
          style={{
            position: 'absolute',
            top: 42,
            right: 50,
            width: 100,
            height: 'auto',
            objectFit: 'contain',
            filter: 'drop-shadow(0 10px 18px rgba(90,0,16,0.18))',
          }}
        />
      </div>

      {/* Title block */}
      <div style={{
        padding: '26px 60px 14px',
        textAlign: 'center',
        position: 'relative',
        zIndex: 2,
      }}>
        <div style={{
          fontSize: 78, fontWeight: 900, lineHeight: 0.92, letterSpacing: 0,
          color: BRAND_RED,
          textShadow: '0 4px 0 rgba(248,223,161,0.65)',
        }}>PAKET UMROH</div>
        <div style={{
          position: 'relative',
          display: 'inline-block',
          fontSize: monthTitleFontSize,
          fontWeight: 900,
          lineHeight: 0.96,
          letterSpacing: 0,
          marginTop: 3,
          padding: '0 22px 11px',
        }}>
          <span aria-hidden="true" style={{
            position: 'absolute',
            inset: '0 22px 11px',
            transform: 'translateY(6px)',
            color: PALE_GOLD,
            opacity: 0.95,
            zIndex: 0,
          }}>{monthTitle}</span>
          <span aria-hidden="true" style={{
            position: 'absolute',
            inset: '0 22px 11px',
            color: 'transparent',
            WebkitTextStroke: `7px ${PALE_GOLD}`,
            zIndex: 1,
          }}>{monthTitle}</span>
          <span style={{
            position: 'relative',
            zIndex: 3,
            color: BRAND_RED,
            WebkitTextStroke: `2px ${DEEP_RED}`,
            textShadow: '0 2px 0 rgba(255,255,255,0.38), 0 11px 22px rgba(90,0,16,0.16)',
          }}>{monthTitle}</span>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 'max-content',
          maxWidth: '100%',
          padding: '8px 20px 9px',
          margin: '5px auto 0',
          borderRadius: 999,
          background: 'rgba(255,255,255,0.78)',
          border: `2px solid ${PALE_GOLD}`,
          boxShadow: '0 9px 25px rgba(90,0,16,0.08)',
          color: DEEP_RED,
          fontSize: 24,
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
          fontFamily: BROCHURE_ROBOTO_CONDENSED_FONT_STACK,
          fontWeight: 600,
          fontSize: 28,
          height: 70,
          alignItems: 'center',
          padding: '0 14px',
          letterSpacing: 0.5,
        }}>
          <span style={{ textAlign: 'center' }}>TANGGAL</span>
          <span style={{ textAlign: 'center' }}>PAKET</span>
          <span style={{ textAlign: 'center' }}>HARI</span>
          <span style={{ textAlign: 'center' }}>MASKAPAI</span>
          <span style={{ textAlign: 'center' }}>HARGA</span>
        </div>

        {/* Data rows */}
        {month.packages.map((p, i) => {
          const packageName = cleanPackageDisplayName(p.nama);
          const packagePills = detectPackagePills(p.nama, p.umrohDulu);
          const tripDays = p.hari ?? countTripDays(p.berangkat_tgl, p.pulang_tgl);
          const departureDay = formatDepartureDay(p.berangkat_tgl);
          const departureMonthName = showFullDate ? formatDepartureMonthName(p.berangkat_tgl) : '';
          const isSoldOut = !!p.soldOut;
          const soldOutContentOpacity = isSoldOut ? 0.58 : 1;

          return (
            <div key={p.id} style={{
              display: 'grid',
              gridTemplateColumns: TABLE_COLUMNS,
              background: isSoldOut
                ? 'linear-gradient(90deg, rgba(248,250,252,0.92) 0%, rgba(255,248,236,0.7) 100%)'
                : '#FFFFFF',
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
                width: showFullDate ? 92 : 58,
                height: showFullDate ? 62 : 54,
                justifySelf: 'center',
                borderRadius: 10,
                background: isSoldOut
                  ? 'linear-gradient(145deg, #475569 0%, #1F2937 100%)'
                  : `linear-gradient(145deg, ${DEEP_RED} 0%, ${BRAND_RED} 100%)`,
                color: '#fff',
                border: `2px solid ${PALE_GOLD}`,
                boxShadow: '0 8px 16px rgba(90,0,16,0.18)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 0.9,
                overflow: 'hidden',
                gap: showFullDate ? 1 : 0,
                opacity: soldOutContentOpacity,
                filter: isSoldOut ? 'saturate(0.7)' : 'none',
              }}>
                <span style={{ fontSize: showFullDate ? 31 : 42, fontWeight: 400 }}>{departureDay}</span>
                {showFullDate && departureMonthName && (
                  <span style={{
                    fontFamily: BROCHURE_OSWALD_FONT_STACK,
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: 0.2,
                    lineHeight: 0.95,
                    whiteSpace: 'nowrap',
                    textShadow: '0 1px 0 rgba(90,0,16,0.22)',
                  }}>{departureMonthName}</span>
                )}
              </span>
              <span style={{
                minWidth: 0,
                paddingLeft: 16,
                paddingRight: 12,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: 6,
                overflow: 'hidden',
                opacity: soldOutContentOpacity,
              }}>
                <span style={{
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontFamily: BROCHURE_ROBOTO_CONDENSED_FONT_STACK,
                  fontSize: PACKAGE_NAME_FONT_SIZE,
                  fontWeight: 700,
                  lineHeight: 1.04,
                }}>
                  {packageName}
                </span>
                {packagePills.length > 0 && (
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {packagePills.map(pill => (
                      <span key={pill.label} style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '4px 11px 5px',
                        borderRadius: 999,
                        background: isSoldOut ? '#64748B' : pill.bg,
                        color: isSoldOut ? '#FFFFFF' : pill.fg,
                        fontFamily: BROCHURE_MONTSERRAT_FONT_STACK,
                        fontSize: 13,
                        fontWeight: 700,
                        lineHeight: 1,
                        letterSpacing: 0.3,
                        whiteSpace: 'nowrap',
                        boxShadow: isSoldOut ? 'none' : '0 1px 3px rgba(0,0,0,0.14)',
                      }}>
                        {pill.label}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              <span style={{
                textAlign: 'center',
                color: isSoldOut ? '#374151' : DEEP_RED,
                fontFamily: BROCHURE_OSWALD_FONT_STACK,
                fontWeight: 500,
                lineHeight: 0.9,
                whiteSpace: 'nowrap',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                opacity: soldOutContentOpacity,
              }}>
                <span style={{ fontSize: 36 }}>{tripDays || '-'}</span>
                <span style={{ fontSize: 17, letterSpacing: 0.8 }}>HARI</span>
              </span>
              <span style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 0,
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
                textAlign: 'center',
                fontFamily: BROCHURE_ROBOTO_CONDENSED_FONT_STACK,
                fontSize: 24,
                // Roboto Condensed is self-hosted at 600 + 700 only. Asking for 500
                // makes the browser synthesise (or worse, fall back per character),
                // producing the "S big, AUDIA small" look in the export. Pin to 600.
                fontWeight: 600,
                color: INK,
                lineHeight: 1.02,
                paddingLeft: 6,
                paddingRight: 6,
                opacity: soldOutContentOpacity,
              }}>
                {p.maskapai || '-'}
              </span>
              <span style={{
                textAlign: 'center',
                whiteSpace: 'nowrap',
                fontFamily: BROCHURE_MONTSERRAT_FONT_STACK,
              }}>
                {p.soldOut ? (
                  <span style={{
                    width: 150,
                    height: 62,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    overflow: 'visible',
                  }}>
                    <span style={{
                      width: 132,
                      height: 42,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxSizing: 'border-box',
                      borderRadius: 2,
                      background: '#D71920',
                      color: '#fff',
                      border: '3px solid rgba(255,255,255,0.94)',
                      boxShadow: '0 0 0 3px #D71920, 0 8px 14px rgba(90,0,16,0.14)',
                      fontFamily: BROCHURE_FONT_STACK,
                      fontSize: 23,
                      fontWeight: 900,
                      letterSpacing: 0.4,
                      lineHeight: 1,
                      textTransform: 'uppercase',
                      transform: 'rotate(-7deg)',
                      transformOrigin: 'center center',
                      textShadow: '0 1px 0 rgba(90,0,16,0.24)',
                      whiteSpace: 'nowrap',
                    }}>
                      SOLD OUT
                    </span>
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

      {/* Soft lower backdrop between table and footer */}
      <div style={{
        flex: 1,
        position: 'relative',
        zIndex: 1,
        marginTop: 4,
        overflow: 'visible',
      }}>
        <div style={{
          position: 'absolute',
          inset: '-92px -80px -146px',
          background: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,248,236,0.2) 38%, rgba(236,216,164,0.18) 64%, rgba(150,166,142,0.2) 100%)',
        }} />
        <img
          src={KABAH_IMAGE}
          alt=""
          style={{
            position: 'absolute',
            left: 118,
            bottom: -86,
            maxHeight: landmarkMaxH + 150,
            width: 'auto',
            objectFit: 'contain',
            opacity: 0.18,
            filter: 'saturate(0.62) contrast(0.82) brightness(1.14) drop-shadow(0 18px 34px rgba(90,0,16,0.04))',
            WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.42) 34%, rgba(0,0,0,0.34) 68%, transparent 100%)',
            maskImage: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.42) 34%, rgba(0,0,0,0.34) 68%, transparent 100%)',
          }}
        />
        <img
          src={NABAWI_WIDE_IMAGE}
          alt=""
          style={{
            position: 'absolute',
            right: 78,
            bottom: -94,
            maxHeight: landmarkMaxH + 164,
            width: 'auto',
            objectFit: 'contain',
            opacity: 0.18,
            filter: 'saturate(0.62) contrast(0.82) brightness(1.14) drop-shadow(0 18px 34px rgba(90,0,16,0.04))',
            WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.42) 34%, rgba(0,0,0,0.34) 68%, transparent 100%)',
            maskImage: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.42) 34%, rgba(0,0,0,0.34) 68%, transparent 100%)',
          }}
        />
        <div style={{
          position: 'absolute',
          inset: '-72px 0 -132px',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0.52) 31%, rgba(255,248,236,0.16) 62%, rgba(150,166,142,0.13) 100%)',
        }} />
      </div>

      {/* Footer pill — agent info */}
      <div style={{
        margin: '0 50px 56px',
        padding: '20px 26px',
        borderRadius: 26,
        background: `linear-gradient(135deg, ${DARK_RED} 0%, ${DEEP_RED} 44%, ${BRAND_RED} 100%)`,
        border: `3px solid ${PALE_GOLD}`,
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        position: 'relative',
        zIndex: 2,
        boxShadow: '0 -18px 46px -30px rgba(150,166,142,0.34), 0 18px 38px rgba(72,43,30,0.2)',
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
          <strong style={{ fontSize: agentNameFontSize, fontWeight: 900, color: '#fff', lineHeight: 1.05, marginTop: 3 }}>
            {agentName}
          </strong>
        </div>
        {phone && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexShrink: 0,
            color: '#fff',
            // Hyphens in 0822-9000-2034 are soft break opportunities — keep the digits together
            // so the number never splits onto two lines.
            whiteSpace: 'nowrap',
          }}>
            <WhatsAppIcon size={44} />
            <span style={{
              fontSize: phoneFontSize,
              fontWeight: 900,
              letterSpacing: 0.4,
              lineHeight: 1,
            }}>
              {phone}
            </span>
          </div>
        )}
      </div>

    </div>
  );
}

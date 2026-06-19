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
  isPromo?: boolean;
  umrohDulu?: boolean;
  /** Kota landing (arrival terakhir penerbangan berangkat), mis. "Jeddah" / "Madinah" */
  landing?: string;
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
  /**
   * Visual theme. 'winter' switches the brand-chrome palette to icy blue and
   * enables winter-only decorations (snowflakes, drift, ribbon). Defaults to
   * 'default' (the classic red/gold brochure). See CLASSIC_THEME / WINTER_THEME.
   */
  variant?: 'default' | 'winter';
  /**
   * When true, render with raster-deterministic primitives only (flat title fill
   * instead of background-clip:text + drop-shadow; solid footer shadow instead of
   * negative-spread). Used for the catalog PDF pages so the exported document looks
   * identical across device browser engines. The standalone monthly brochure keeps
   * its richer styling (default false).
   */
  rasterSafe?: boolean;
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

export const BROCHURE_INTER_FONT = 'AIW Inter';
export const BROCHURE_BEBAS_FONT = 'AIW Bebas Neue';
export const BROCHURE_OSWALD_FONT = 'AIW Oswald';
export const BROCHURE_ROBOTO_CONDENSED_FONT = 'AIW Roboto Condensed';
export const BROCHURE_MONTSERRAT_FONT = 'AIW Montserrat';
export const BROCHURE_PLAYFAIR_FONT = 'AIW Playfair';

export const BROCHURE_FONT_STACK = `'${BROCHURE_INTER_FONT}', 'Inter', 'Inter var', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
export const BROCHURE_TABLE_FONT_STACK = `'${BROCHURE_BEBAS_FONT}', 'Bebas Neue', '${BROCHURE_INTER_FONT}', 'Inter', 'Arial Narrow', system-ui, sans-serif`;
export const BROCHURE_OSWALD_FONT_STACK = `'${BROCHURE_OSWALD_FONT}', 'Oswald', '${BROCHURE_INTER_FONT}', 'Inter', 'Arial Narrow', system-ui, sans-serif`;
export const BROCHURE_ROBOTO_CONDENSED_FONT_STACK = `'${BROCHURE_ROBOTO_CONDENSED_FONT}', 'Roboto Condensed', '${BROCHURE_INTER_FONT}', 'Inter', 'Arial Narrow', system-ui, sans-serif`;
export const BROCHURE_MONTSERRAT_FONT_STACK = `'${BROCHURE_MONTSERRAT_FONT}', 'Montserrat', '${BROCHURE_INTER_FONT}', 'Inter', system-ui, -apple-system, sans-serif`;
export const BROCHURE_SERIF_FONT_STACK = `'${BROCHURE_PLAYFAIR_FONT}', 'Playfair Display', Georgia, 'Times New Roman', serif`;
export const BROCHURE_FONT_WEIGHTS = [400, 600, 700, 800, 900] as const;
export const BROCHURE_LOCAL_FONTS = [
  { family: BROCHURE_BEBAS_FONT, src: '/fonts/brochure/BebasNeue-Regular.woff2', weight: 400, style: 'normal' },
  { family: BROCHURE_INTER_FONT, src: '/fonts/brochure/Inter-Regular.woff2', weight: 400, style: 'normal' },
  { family: BROCHURE_INTER_FONT, src: '/fonts/brochure/Inter-SemiBold.woff2', weight: 600, style: 'normal' },
  { family: BROCHURE_INTER_FONT, src: '/fonts/brochure/Inter-Bold.woff2', weight: 700, style: 'normal' },
  { family: BROCHURE_INTER_FONT, src: '/fonts/brochure/Inter-ExtraBold.woff2', weight: 800, style: 'normal' },
  { family: BROCHURE_INTER_FONT, src: '/fonts/brochure/Inter-Black.woff2', weight: 900, style: 'normal' },
  { family: BROCHURE_OSWALD_FONT, src: '/fonts/brochure/Oswald-Regular.woff2', weight: 400, style: 'normal' },
  { family: BROCHURE_OSWALD_FONT, src: '/fonts/brochure/Oswald-Medium.woff2', weight: 500, style: 'normal' },
  { family: BROCHURE_OSWALD_FONT, src: '/fonts/brochure/Oswald-Bold.woff2', weight: 700, style: 'normal' },
  { family: BROCHURE_MONTSERRAT_FONT, src: '/fonts/brochure/Montserrat-Bold.woff2', weight: 700, style: 'normal' },
  { family: BROCHURE_MONTSERRAT_FONT, src: '/fonts/brochure/Montserrat-ExtraBold.woff2', weight: 800, style: 'normal' },
  { family: BROCHURE_MONTSERRAT_FONT, src: '/fonts/brochure/Montserrat-Black.woff2', weight: 900, style: 'normal' },
  { family: BROCHURE_ROBOTO_CONDENSED_FONT, src: '/fonts/brochure/RobotoCondensed-SemiBold.woff2', weight: 600, style: 'normal' },
  { family: BROCHURE_ROBOTO_CONDENSED_FONT, src: '/fonts/brochure/RobotoCondensed-Bold.woff2', weight: 700, style: 'normal' },
  { family: BROCHURE_PLAYFAIR_FONT, src: '/fonts/brochure/PlayfairDisplay.woff2', weight: 800, style: 'normal' },
] as const;

export const BROCHURE_FONT_FACE_CSS = BROCHURE_LOCAL_FONTS.map(font => (
  `@font-face{font-family:'${font.family}';font-style:${font.style};font-weight:${font.weight};font-display:swap;src:url('${font.src}') format('woff2');}`
)).join('\n');

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
// Full-bleed designed cover artwork (Alhijaz logo, landmarks & jamaah photo baked
// in) synced from the agency CDN into public/. A real PNG → renders identically
// across capture engines. Re-sync from https://alhijaz.b-cdn.net/png/cover-katalog.png
// if the agency updates it.
const CATALOG_HERO_IMAGE = '/img-brosur/cover-katalog.png';

// Winter palette (Direction B — "Winter Wonderland"). Tunable; values mirror the
// approved visual-companion mockup.
const W_NAVY_DARK = '#172554';
const W_NAVY = '#1E3A8A';
const W_BLUE = '#1D4ED8';
const W_BLUE_BRIGHT = '#2563EB';
const W_SKY = '#7DD3FC';
const W_FROST = '#BFDBFE';
const W_FROST_2 = '#CFE0FB';

// Winter geometric pattern: same paths as ISLAMIC_PATTERN_BG but blue strokes.
const WINTER_PATTERN_BG = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cg fill='none' stroke='%232563EB' stroke-opacity='.30' stroke-width='2'%3E%3Cpath d='M60 6 75 45 114 60 75 75 60 114 45 75 6 60 45 45Z'/%3E%3Cpath d='M60 24 72 60 60 96 48 60Z'/%3E%3Ccircle cx='60' cy='60' r='18'/%3E%3Cpath d='M24 24 45 45M96 24 75 45M96 96 75 75M24 96 45 75'/%3E%3C/g%3E%3Cg fill='none' stroke='%231E3A8A' stroke-opacity='.30' stroke-width='1.5'%3E%3Cpath d='M0 60h120M60 0v120'/%3E%3C/g%3E%3C/svg%3E\")";

const WINTER_CANVAS_BACKGROUND = [
  'radial-gradient(circle at 50% 14%, rgba(37,99,235,0.10) 0%, rgba(37,99,235,0) 44%)',
  'radial-gradient(ellipse at 50% 103%, rgba(191,219,254,0.55) 0%, rgba(207,224,251,0.4) 42%, rgba(247,251,255,0) 76%)',
  'linear-gradient(180deg, #CFE0FB 0%, #EAF2FF 28%, #F7FBFF 60%, #E3EDFF 100%)',
].join(', ');

interface BrochureTheme {
  canvasBackground: string;   // full-page background
  topBar: string;             // 10px accent bar at the very top
  patternUrl: string;         // geometric pattern data-URI
  landmarkFilter: string;     // APPENDED to each landmark img's existing filter ('' = classic). MUST start with a leading space when non-empty (it concatenates onto an existing filter string).
  paketUmrohColor: string;    // "PAKET UMROH" text
  paketUmrohShadow: string;   // textShadow on "PAKET UMROH"
  titleShadowColor: string;   // offset duplicate layer behind the big title
  titleOutline: string;       // 7px outer stroke on the big title
  titleGradient: string;      // fill gradient of the big title
  titleStroke: string;        // 2px inner stroke on the big title
  titleDropShadow: string;    // drop-shadow filter on the big title
  headerDivider: string;      // gradient line under the logo
  urlPillBorder: string;      // border of the URL pill
  urlPillText: string;        // URL pill text color
  tableBorder: string;        // table outer border
  tableHeader: string;        // table header row gradient
  rowLine: string;            // row separators
  badgeGradient: string;      // date badge gradient (non-sold-out)
  badgeBorder: string;        // date badge border
  dayCountColor: string;      // "HARI" number (non-sold-out)
  priceColor: string;         // price + "Jt" + "Hubungi kami"
  footnoteBg: string;         // truncation footnote background
  footnoteText: string;       // truncation footnote text
  footnoteDivider: string;    // dashed divider above footnote
  footerGradient: string;     // agent footer pill gradient
  footerBorder: string;       // agent footer pill border
  avatarBorder: string;       // border ring around agent photo
  footerLabel: string;        // "Info & Pendaftaran:" + agent name accent
}

// CLASSIC = exact current values → non-winter render is unchanged.
const CLASSIC_THEME: BrochureTheme = {
  canvasBackground: CANVAS_BACKGROUND,
  topBar: `linear-gradient(90deg, ${DARK_RED} 0%, ${BRAND_RED} 42%, #F0445F 62%, ${BRAND_RED} 100%)`,
  patternUrl: ISLAMIC_PATTERN_BG,
  landmarkFilter: '',
  paketUmrohColor: BRAND_RED,
  paketUmrohShadow: '0 4px 0 rgba(248,223,161,0.65)',
  titleShadowColor: PALE_GOLD,
  titleOutline: PALE_GOLD,
  titleGradient: `linear-gradient(180deg, #FF5A70 0%, ${BRAND_RED} 34%, #A4001D 68%, ${DARK_RED} 100%)`,
  titleStroke: DEEP_RED,
  titleDropShadow: 'drop-shadow(0 2px 0 rgba(255,255,255,0.38)) drop-shadow(0 11px 15px rgba(90,0,16,0.18))',
  headerDivider: `linear-gradient(90deg, ${BRAND_RED} 0%, ${PALE_GOLD} 48%, rgba(200,16,46,0) 100%)`,
  urlPillBorder: PALE_GOLD,
  urlPillText: DEEP_RED,
  tableBorder: ROW_LINE,
  tableHeader: `linear-gradient(90deg, ${DEEP_RED} 0%, ${BRAND_RED} 100%)`,
  rowLine: ROW_LINE,
  badgeGradient: `linear-gradient(145deg, ${DEEP_RED} 0%, ${BRAND_RED} 100%)`,
  badgeBorder: PALE_GOLD,
  dayCountColor: DEEP_RED,
  priceColor: DEEP_RED,
  footnoteBg: CREAM,
  footnoteText: DEEP_RED,
  footnoteDivider: GOLD,
  footerGradient: `linear-gradient(135deg, ${DARK_RED} 0%, ${DEEP_RED} 44%, ${BRAND_RED} 100%)`,
  footerBorder: PALE_GOLD,
  avatarBorder: PALE_GOLD,
  footerLabel: PALE_GOLD,
};

const WINTER_THEME: BrochureTheme = {
  canvasBackground: WINTER_CANVAS_BACKGROUND,
  topBar: `linear-gradient(90deg, ${W_NAVY_DARK} 0%, ${W_BLUE_BRIGHT} 55%, ${W_SKY} 100%)`,
  patternUrl: WINTER_PATTERN_BG,
  landmarkFilter: ' grayscale(0.4) sepia(1) hue-rotate(178deg) saturate(1.9) brightness(1.05)',
  paketUmrohColor: W_NAVY,
  paketUmrohShadow: '0 4px 0 rgba(255,255,255,0.7)',
  titleShadowColor: W_FROST_2,
  titleOutline: '#FFFFFF',
  titleGradient: `linear-gradient(180deg, #60A5FA 0%, ${W_BLUE} 38%, ${W_NAVY} 72%, ${W_NAVY_DARK} 100%)`,
  titleStroke: W_NAVY,
  titleDropShadow: 'drop-shadow(0 2px 0 rgba(255,255,255,0.6)) drop-shadow(0 11px 15px rgba(23,37,84,0.18))',
  headerDivider: `linear-gradient(90deg, ${W_BLUE_BRIGHT} 0%, ${W_FROST} 48%, rgba(37,99,235,0) 100%)`,
  urlPillBorder: W_FROST,
  urlPillText: W_NAVY,
  tableBorder: W_FROST_2,
  tableHeader: `linear-gradient(90deg, ${W_NAVY_DARK} 0%, ${W_BLUE_BRIGHT} 100%)`,
  rowLine: '#E5EDFB',
  badgeGradient: `linear-gradient(145deg, ${W_NAVY} 0%, ${W_BLUE_BRIGHT} 100%)`,
  badgeBorder: '#FFFFFF',
  dayCountColor: W_BLUE,
  priceColor: W_BLUE,
  footnoteBg: '#EAF2FF',
  footnoteText: W_NAVY,
  footnoteDivider: W_BLUE_BRIGHT,
  footerGradient: `linear-gradient(135deg, ${W_NAVY_DARK} 0%, ${W_NAVY} 45%, ${W_BLUE_BRIGHT} 100%)`,
  footerBorder: W_FROST,
  avatarBorder: W_FROST,
  footerLabel: W_FROST,
};

function getTheme(variant: 'default' | 'winter'): BrochureTheme {
  return variant === 'winter' ? WINTER_THEME : CLASSIC_THEME;
}

// Moderate snow over the 1080x1620 art. Positions (template px) are chosen so
// every flake stays visible regardless of table height: see WINTER_SNOWFLAKES.
interface SnowflakeSpec {
  top?: number; left?: number; right?: number; bottom?: number;
  size: number; color: string; opacity: number; stroke: number;
}
// Six-point star, shared by the scattered Snowflake component and the inline
// ribbon flakes (single source of truth for the shape).
const SNOWFLAKE_PATH = 'M12 2v20M2 12h20M5 5l14 14M19 5L5 19';

const WINTER_SNOWFLAKES: ReadonlyArray<SnowflakeSpec> = [
  // Top three sit above the table top (~440px) — always clear of the table,
  // placed off-centre so they never collide with the centred title text.
  { top: 110, right: 150, size: 60, color: '#BCD9FF', opacity: 0.85, stroke: 1.6 },
  { top: 250, left: 78,   size: 38, color: '#9EC3F5', opacity: 0.8,  stroke: 1.8 },
  { top: 380, right: 116, size: 42, color: '#BCD9FF', opacity: 0.75, stroke: 1.6 },
  // Lower three hug the ~50px side margins beside the table, so they stay
  // visible regardless of how many rows the table grows to.
  { top: 660,    left: 8,  size: 30, color: '#9EC3F5', opacity: 0.7,  stroke: 1.8 },
  { top: 980,    right: 8, size: 28, color: '#BCD9FF', opacity: 0.7,  stroke: 1.7 },
  { bottom: 250, left: 10, size: 32, color: '#9EC3F5', opacity: 0.72, stroke: 1.8 },
];

function Snowflake({ spec }: { spec: SnowflakeSpec }) {
  return (
    <svg
      aria-hidden="true"
      width={spec.size}
      height={spec.size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={spec.color}
      strokeWidth={spec.stroke}
      strokeLinecap="round"
      style={{
        position: 'absolute',
        top: spec.top, left: spec.left, right: spec.right, bottom: spec.bottom,
        opacity: spec.opacity,
        zIndex: 1,
        pointerEvents: 'none',
        filter: 'drop-shadow(0 1px 2px rgba(80,130,200,0.25))',
      }}
    >
      <path d={SNOWFLAKE_PATH} />
    </svg>
  );
}

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

export function BrochureScheduleTemplate({ month, agent, showFullDate = false, variant = 'default', rasterSafe = false }: BrochureScheduleTemplateProps) {
  const theme = getTheme(variant);
  const photo = agent.photo || avatarFallback(agent.name);
  const phone = formatPhoneDisplay(agent.phone);
  const landingUrl = landingUrlForAgent(agent);
  const agentName = agent.name || 'Alhijaz';
  const monthTitle = month.label.toUpperCase();
  const monthTitleFontSize = monthTitle.length >= 14 ? 80 : monthTitle.length >= 12 ? 86 : 92;
  const agentNameFontSize = agentName.length > 28 ? 32 : agentName.length > 22 ? 36 : agentName.length > 16 ? 39 : 42;
  const phoneFontSize = phone.length > 14 ? 34 : 38;

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
      background: theme.canvasBackground,
      color: INK,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <style>{BROCHURE_FONT_FACE_CSS}</style>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 10,
          background: theme.topBar,
          zIndex: 10,
        }}
      />
      <div style={{
        position: 'absolute',
        top: -78,
        right: -90,
        width: 500,
        height: 500,
        backgroundImage: theme.patternUrl,
        backgroundSize: '132px 132px',
        opacity: 0.24,
        transform: 'rotate(7deg)',
        zIndex: 0,
      }} />
      <div style={{
        position: 'absolute',
        left: -110,
        bottom: 104,
        width: 620,
        height: 620,
        backgroundImage: theme.patternUrl,
        backgroundSize: '140px 140px',
        opacity: 0.17,
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
          opacity: 0.11,
          filter: rasterSafe ? 'none' : `saturate(0.85)${theme.landmarkFilter}`,
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
          opacity: 0.07,
          filter: rasterSafe ? 'none' : `saturate(0.7)${theme.landmarkFilter}`,
          zIndex: 0,
        }}
      />

      {variant === 'winter' && (
        <>
          {WINTER_SNOWFLAKES.map((spec, i) => (
            <Snowflake key={`flake-${i}`} spec={spec} />
          ))}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 220,
              zIndex: 1,
              pointerEvents: 'none',
              background: 'radial-gradient(130% 100% at 50% 135%, #EEF5FF 42%, rgba(238,245,255,0) 72%)',
            }}
          />
        </>
      )}

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
            top: 34,
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
          background: theme.headerDivider,
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
            filter: rasterSafe ? 'none' : 'drop-shadow(0 10px 18px rgba(90,0,16,0.18))',
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
          color: theme.paketUmrohColor,
          textShadow: theme.paketUmrohShadow,
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
            color: theme.titleShadowColor,
            opacity: 0.95,
            zIndex: 0,
          }}>{monthTitle}</span>
          {!rasterSafe && (
            <span aria-hidden="true" style={{
              position: 'absolute',
              inset: '0 22px 11px',
              color: 'transparent',
              WebkitTextStroke: `7px ${theme.titleOutline}`,
              zIndex: 1,
            }}>{monthTitle}</span>
          )}
          <span style={rasterSafe ? {
            position: 'relative',
            zIndex: 3,
            color: theme.paketUmrohColor,
          } : {
            position: 'relative',
            zIndex: 3,
            color: theme.paketUmrohColor,
            backgroundImage: theme.titleGradient,
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            WebkitTextStroke: `2px ${theme.titleStroke}`,
            filter: theme.titleDropShadow,
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
          border: `2px solid ${theme.urlPillBorder}`,
          boxShadow: rasterSafe ? 'none' : '0 9px 25px rgba(90,0,16,0.08)',
          color: theme.urlPillText,
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
        border: `2px solid ${theme.tableBorder}`,
        boxShadow: rasterSafe ? 'none' : '0 26px 54px rgba(90,0,16,0.14)',
        position: 'relative',
        zIndex: 2,
        fontFamily: BROCHURE_TABLE_FONT_STACK,
      }}>
        {/* Header row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: TABLE_COLUMNS,
          background: theme.tableHeader,
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
              borderTop: i === 0 ? 'none' : `1px solid ${theme.rowLine}`,
              letterSpacing: 0.15,
            }}>
              <span style={{
                width: showFullDate ? 92 : 58,
                height: showFullDate ? 62 : 54,
                justifySelf: 'center',
                borderRadius: 10,
                background: isSoldOut
                  ? 'linear-gradient(145deg, #475569 0%, #1F2937 100%)'
                  : theme.badgeGradient,
                color: '#fff',
                border: `2px solid ${theme.badgeBorder}`,
                boxShadow: rasterSafe ? '0 3px 0 rgba(90,0,16,0.22)' : '0 8px 16px rgba(90,0,16,0.18)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: BROCHURE_TABLE_FONT_STACK,
                fontSynthesis: 'none',
                lineHeight: 0.9,
                overflow: 'hidden',
                gap: showFullDate ? 1 : 0,
                opacity: soldOutContentOpacity,
                filter: rasterSafe ? 'none' : (isSoldOut ? 'saturate(0.7)' : 'none'),
              }}>
                <span style={{
                  display: 'block',
                  fontFamily: BROCHURE_TABLE_FONT_STACK,
                  fontSize: showFullDate ? 31 : 42,
                  fontWeight: 400,
                  fontSynthesis: 'none',
                  lineHeight: 0.9,
                  letterSpacing: 0,
                }}>{departureDay}</span>
                {showFullDate && departureMonthName && (
                  <span style={{
                    fontFamily: BROCHURE_OSWALD_FONT_STACK,
                    fontSize: 14,
                    fontWeight: 700,
                    fontSynthesis: 'none',
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
                        fontFamily: BROCHURE_FONT_STACK,
                        fontSize: 13,
                        fontWeight: 600,
                        fontSynthesis: 'none',
                        lineHeight: 1,
                        letterSpacing: 0.3,
                        whiteSpace: 'nowrap',
                        boxShadow: rasterSafe ? 'none' : (isSoldOut ? 'none' : '0 1px 3px rgba(0,0,0,0.14)'),
                      }}>
                        {pill.label}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              <span style={{
                textAlign: 'center',
                color: isSoldOut ? '#374151' : theme.dayCountColor,
                fontFamily: BROCHURE_OSWALD_FONT_STACK,
                fontWeight: 500,
                fontSynthesis: 'none',
                lineHeight: 0.9,
                whiteSpace: 'nowrap',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                opacity: soldOutContentOpacity,
              }}>
                <span style={{
                  display: 'block',
                  fontFamily: BROCHURE_OSWALD_FONT_STACK,
                  fontSize: 36,
                  fontWeight: 500,
                  fontSynthesis: 'none',
                  lineHeight: 0.9,
                  letterSpacing: 0,
                }}>{tripDays || '-'}</span>
                <span style={{
                  display: 'block',
                  fontFamily: BROCHURE_OSWALD_FONT_STACK,
                  fontSize: 17,
                  fontWeight: 500,
                  fontSynthesis: 'none',
                  lineHeight: 0.9,
                  letterSpacing: 0.8,
                }}>HARI</span>
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
                      boxShadow: rasterSafe ? '0 0 0 3px #D71920' : '0 0 0 3px #D71920, 0 8px 14px rgba(90,0,16,0.14)',
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
                    <span style={{ fontSize: 40, color: theme.priceColor, fontWeight: 900, letterSpacing: -0.4 }}>{formatHargaJt(p.harga)}</span>
                    <span style={{ fontSize: 20, color: theme.priceColor, fontWeight: 800 }}> Jt</span>
                  </>
                ) : (
                  <span style={{ fontSize: 22, color: theme.priceColor, fontWeight: 800 }}>Hubungi kami</span>
                )}
              </span>
            </div>
          );
        })}

        {/* Truncation footnote */}
        {month.truncatedCount > 0 && (
          <div style={{
            background: theme.footnoteBg,
            color: theme.footnoteText,
            fontWeight: 700,
            fontSize: 20,
            padding: '14px 18px',
            textAlign: 'center',
            borderTop: `1px dashed ${theme.footnoteDivider}`,
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
            opacity: 0.23,
            filter: rasterSafe ? 'none' : `saturate(0.62) contrast(0.82) brightness(1.14) drop-shadow(0 18px 34px rgba(90,0,16,0.04))${theme.landmarkFilter}`,
            WebkitMaskImage: rasterSafe ? undefined : 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.42) 34%, rgba(0,0,0,0.34) 68%, transparent 100%)',
            maskImage: rasterSafe ? undefined : 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.42) 34%, rgba(0,0,0,0.34) 68%, transparent 100%)',
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
            opacity: 0.23,
            filter: rasterSafe ? 'none' : `saturate(0.62) contrast(0.82) brightness(1.14) drop-shadow(0 18px 34px rgba(90,0,16,0.04))${theme.landmarkFilter}`,
            WebkitMaskImage: rasterSafe ? undefined : 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.42) 34%, rgba(0,0,0,0.34) 68%, transparent 100%)',
            maskImage: rasterSafe ? undefined : 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.42) 34%, rgba(0,0,0,0.34) 68%, transparent 100%)',
          }}
        />
        <div style={{
          position: 'absolute',
          inset: '-72px 0 -132px',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.44) 31%, rgba(255,248,236,0.12) 62%, rgba(150,166,142,0.1) 100%)',
        }} />
      </div>

      {/* Footer pill — agent info */}
      <div style={{
        margin: '0 50px 56px',
        padding: '20px 26px',
        borderRadius: 26,
        background: theme.footerGradient,
        border: `3px solid ${theme.footerBorder}`,
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        position: 'relative',
        zIndex: 2,
        boxShadow: rasterSafe ? '0 16px 30px rgba(72,43,30,0.22)' : '0 -18px 46px -30px rgba(150,166,142,0.34), 0 18px 38px rgba(72,43,30,0.2)',
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
              border: `5px solid ${theme.avatarBorder}`,
              boxShadow: rasterSafe ? 'none' : '0 10px 26px rgba(0,0,0,0.24)',
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
            boxShadow: rasterSafe ? 'none' : '0 6px 16px rgba(0,0,0,0.28)',
          }}>
            <Check size={24} strokeWidth={4} />
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 24, color: theme.footerLabel, fontWeight: 800, letterSpacing: 0 }}>
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
            gap: 18,
            flexShrink: 0,
            color: '#fff',
            // Hyphens in 0822-9000-2034 are soft break opportunities — keep the digits together
            // so the number never splits onto two lines.
            whiteSpace: 'nowrap',
          }}>
            <WhatsAppIcon size={54} />
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

export interface BrochureCatalogCoverProps {
  agent: BrochureAgent;
  /** One entry per included month, in catalog (departure) order. */
  months: ReadonlyArray<{ label: string; count: number }>;
}

// "Juni 2026 – Desember 2026" → "Juni – Desember 2026" when years match.
function catalogRangeLabel(months: ReadonlyArray<{ label: string }>): string {
  if (months.length === 0) return '';
  if (months.length === 1) return months[0].label;
  const first = months[0].label;
  const last = months[months.length - 1].label;
  const fy = first.match(/\d{4}$/)?.[0];
  const ly = last.match(/\d{4}$/)?.[0];
  if (fy && ly && fy === ly) return `${first.replace(/\s*\d{4}$/, '')} – ${last}`;
  return `${first} – ${last}`;
}

// Cover page for the multi-month "Unduh Katalog" PDF. Uses the agency's designed
// cover artwork (CATALOG_HERO_IMAGE — logo, landmarks & jamaah photo baked in) as a
// full-bleed background; we overlay only the headline (over the red sky) and the
// agent contact ribbon (bottom). Raster-safe by construction: real <img>, CSS
// gradients, flat fills, solid borders — no box-shadow blur / drop-shadow /
// background-clip:text / mask-image / filter.
export function BrochureCatalogCover({ agent, months }: BrochureCatalogCoverProps) {
  const photo = agent.photo || avatarFallback(agent.name);
  const phone = formatPhoneDisplay(agent.phone);
  const agentName = agent.name || 'Alhijaz';
  const agentNameFontSize = agentName.length > 26 ? 30 : agentName.length > 20 ? 34 : 38;
  const rangeLabel = catalogRangeLabel(months);
  const GOLD = '#E8C36B';

  return (
    <div style={{
      width: BROCHURE_W, height: BROCHURE_H, position: 'relative', overflow: 'hidden',
      fontFamily: BROCHURE_FONT_STACK, fontSynthesis: 'none', color: '#fff', background: '#7a0f1a',
    }}>
      <style>{BROCHURE_FONT_FACE_CSS}</style>

      {/* Full-bleed designed cover artwork */}
      <img src={CATALOG_HERO_IMAGE} alt="" aria-hidden="true" style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0,
      }} />

      {/* Soft scrim behind the headline for legibility on the red sky (raster-safe gradient) */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 600, zIndex: 1,
        background: 'radial-gradient(58% 64% at 50% 30%, rgba(90,0,16,0.45) 0%, rgba(90,0,16,0) 72%)',
      }} />

      {/* Headline over the red sky */}
      <div style={{ position: 'absolute', top: 150, left: 90, right: 90, zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: 13, color: GOLD }}>KATALOG UMROH</div>
        <div style={{ marginTop: 10, fontFamily: BROCHURE_SERIF_FONT_STACK, fontWeight: 800, fontSize: 112, lineHeight: 0.95, color: '#fff' }}>Paket<br />Umroh</div>
        <div style={{ width: 96, height: 3, borderRadius: 2, background: GOLD, margin: '22px 0 14px' }} />
        {rangeLabel && <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: 4, color: '#FBF3DF' }}>{rangeLabel}</div>}
      </div>

      {/* Agent contact ribbon at the very bottom */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 2, height: 158, padding: '0 56px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'linear-gradient(180deg, rgba(74,0,11,0) 0%, rgba(74,0,11,0.92) 28%, #3c0008 100%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <img
            src={photo}
            alt=""
            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = avatarFallback(agent.name); }}
            style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${GOLD}` }}
          />
          <div style={{ textAlign: 'left', minWidth: 0 }}>
            <div style={{ fontFamily: BROCHURE_SERIF_FONT_STACK, fontWeight: 800, fontSize: agentNameFontSize, color: '#fff', lineHeight: 1.05 }}>{agentName}</div>
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: 2, color: '#E8D6A8', marginTop: 4 }}>KONSULTAN UMROH ALHIJAZ</div>
          </div>
        </div>
        {phone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: GOLD }}>
            <WhatsAppIcon size={40} />
            <span style={{ fontSize: 32, fontWeight: 700, color: '#fff' }}>{phone}</span>
          </div>
        )}
      </div>
    </div>
  );
}

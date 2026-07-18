// src/components/BrochureSchedulePage.tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Options as ModernScreenshotOptions } from 'modern-screenshot';
import { Download, Share2, Loader2, FileDown, Check, Wand2, ChevronDown } from 'lucide-react';
import FilterDropdown from './FilterDropdown';
import {
  BrochureScheduleTemplate,
  BrochureCatalogCover,
  BROCHURE_W,
  BROCHURE_H,
  BROCHURE_BEBAS_FONT,
  BROCHURE_INTER_FONT,
  BROCHURE_LOCAL_FONTS,
  BROCHURE_MONTSERRAT_FONT,
  BROCHURE_OSWALD_FONT,
  BROCHURE_ROBOTO_CONDENSED_FONT,
  BROCHURE_PLAYFAIR_FONT,
  PACKAGE_TYPES,
  derivePackageType,
  type BrochureMonth,
  type BrochurePackage,
  type BrochureAgent,
  type BrochureHotel,
} from './BrochureScheduleTemplate';
import { BrochurePromptModal } from './BrochurePromptModal';
import { formatBrochurePrice, type BrochurePromptSchedule } from './brochure-prompt/buildBrochurePrompt';
import { getAuthHeaders } from './LoginPage';
import { canShareFiles, downloadBlob, isTouchPrimary } from '../utils/share';
import { CatalogLoadingModal } from './CatalogLoadingModal';
import { CatalogCoverPicker } from './CatalogCoverPicker';
import { getCatalogCover, DEFAULT_COVER_ID } from '@/lib/catalogCovers';
import { BROCHURE_DESIGNS, getBrochureDesign, normalizeBrochureDesignId, type BrochureDesignId } from './brochure-designs';

const EXPORT_MIME = 'image/jpeg';
const EXPORT_EXT = 'jpg';
const EXPORT_QUALITY = 0.9;
// The template is already authored at 1080px wide. Exporting at 2x makes the
// browser rasterize 6.9M pixels and produces multi-MB PNGs; 1x JPG is enough
// for WhatsApp/status sharing and keeps mobile clicks responsive.
const EXPORT_SCALE = 1;
// Catalog PDF renders at 1.5× (1620px wide) so pages stay crisp when zoomed in a
// PDF viewer, without the ~4× file-size hit of full 2×. Slightly lower JPEG
// quality offsets the larger dimensions to keep the overall file manageable.
const CATALOG_SCALE = 1.5;
const CATALOG_JPEG_QUALITY = 0.9;
const EXPORT_CACHE_LIMIT = 3;
const PACKAGES_PER_IMAGE = 10;

let embeddedBrochureFontCssPromise: Promise<string> | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function getEmbeddedBrochureFontCss(): Promise<string> {
  if (!embeddedBrochureFontCssPromise) {
    embeddedBrochureFontCssPromise = Promise.all(BROCHURE_LOCAL_FONTS.map(async font => {
      const res = await fetch(font.src, { cache: 'force-cache' });
      if (!res.ok) throw new Error(`font-load-failed:${font.src}`);
      const dataUrl = `data:font/woff2;base64,${arrayBufferToBase64(await res.arrayBuffer())}`;
      return `@font-face{font-family:'${font.family}';font-style:${font.style};font-weight:${font.weight};font-display:block;src:url('${dataUrl}') format('woff2');}`;
    })).then(lines => lines.join('\n'));
  }
  return embeddedBrochureFontCssPromise;
}

interface ExportedImage {
  blob: Blob;
  ext: string;
  mime: string;
}

interface BrochureSchedulePageProps {
  agent: BrochureAgent;
  /** Kolom ke-3 brosur: 'hari' (default) atau 'seat'. Dikontrol oleh toggle di
   *  header dashboard (DashboardLayout), yang juga memiliki state-nya. */
  displayMode?: 'hari' | 'seat';
}

interface ApiResponse {
  months: BrochureMonth[];
  agent: BrochureAgent;
}

function mergeAgentProfile(base: BrochureAgent, incoming?: BrochureAgent | null): BrochureAgent {
  const merged = { ...base, ...(incoming || {}) };
  return {
    ...merged,
    slug: (incoming?.slug || base.slug || '').trim(),
  };
}

function BrochureSkeleton() {
  return (
    <div
      className="animate-pulse w-full"
      style={{
        maxWidth: 480,
        aspectRatio: `${BROCHURE_W} / ${BROCHURE_H}`,
        borderRadius: 16,
        overflow: 'hidden',
        background: 'linear-gradient(180deg, #ffffff 0%, #fff8ec 100%)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
      }}
    >
      <div className="flex items-center justify-between p-5">
        <div className="h-8 w-24 rounded bg-rose-100" />
        <div className="flex gap-2">
          <div className="w-10 h-10 rounded-full bg-amber-100" />
          <div className="w-10 h-10 rounded-full bg-rose-100" />
        </div>
      </div>
      <div className="px-6 mt-2 flex flex-col items-center gap-2">
        <div className="h-7 w-3/5 rounded bg-amber-100" />
        <div className="h-9 w-2/3 rounded bg-rose-100" />
      </div>
      <div className="mt-6 mx-5 rounded-2xl bg-white overflow-hidden border border-amber-100">
        <div className="h-7 bg-rose-900/80" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-9 border-t border-rose-100/70 px-3 flex items-center gap-3">
            <div className="h-3 w-4 rounded bg-rose-200" />
            <div className="h-3 flex-1 rounded bg-rose-100" />
            <div className="h-3 w-12 rounded bg-rose-200" />
          </div>
        ))}
      </div>
    </div>
  );
}

function splitPackagesIntoPages(
  packages: BrochurePackage[],
  pageKeyPrefix: string,
  label: string,
): BrochureMonth[] {
  const pages: BrochureMonth[] = [];
  for (let start = 0; start < packages.length; start += PACKAGES_PER_IMAGE) {
    pages.push({
      key: `${pageKeyPrefix}-page-${pages.length + 1}`,
      label,
      monthIndexId: -1,
      year: 0,
      packages: packages.slice(start, start + PACKAGES_PER_IMAGE),
      truncatedCount: 0,
    });
  }
  return pages;
}

function catalogFilename(agent: BrochureAgent): string {
  const who = (agent.slug || agent.name || 'alhijaz')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'alhijaz';
  const d = new Date();
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `katalog-umroh-${who}-${ym}.pdf`;
}

type FilterDim = 'bulan' | 'tipe' | 'maskapai' | 'landing';
type CatalogMode = 'active-filter' | 'all-ready';
type CatalogStage =
  | { kind: 'cover' }
  | { kind: 'page'; page: BrochureMonth; showFullDate: boolean; variant: 'default' | 'winter' };

function catalogFilenameWithLabel(agent: BrochureAgent, label?: string | null): string {
  if (!label) return catalogFilename(agent);
  const who = (agent.slug || agent.name || 'alhijaz')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'alhijaz';
  const slug = label
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'filter';
  const d = new Date();
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `katalog-umroh-${who}-${slug}-${ym}.pdf`;
}

const FILTER_DIM_LABELS: Record<FilterDim, string> = {
  bulan: 'Bulan',
  tipe: 'Tipe Paket',
  maskapai: 'Maskapai',
  landing: 'Landing',
};

const TYPE_UMROH_SAJA = 'UMROH SAJA';
const TYPE_UMROH_RAHMAH = 'UMROH RAHMAH';
const TYPE_UMROH_PROMO = 'UMROH PROMO';
const TYPE_UMROH_MUSIM_DINGIN = 'UMROH MUSIM DINGIN';

interface MusimDinginWindow {
  yearOfDec: number;
}

// Pilih musim dingin terdekat relatif "today".
//   - Today di bulan Des  → window = Des(year)   + Jan(year+1)
//   - Today di bulan Jan  → window = Des(year-1) + Jan(year)        (current winter)
//   - Today Feb–Nov       → window = Des(year)   + Jan(year+1)      (next winter)
function getMusimDinginWindow(today: Date): MusimDinginWindow {
  const month = today.getUTCMonth(); // 0=Jan, 11=Des
  const year = today.getUTCFullYear();
  if (month === 11) return { yearOfDec: year };
  if (month === 0) return { yearOfDec: year - 1 };
  return { yearOfDec: year };
}

function isMusimDinginPackage(pkg: BrochurePackage, dinginWindow: MusimDinginWindow): boolean {
  const iso = pkg.berangkat_tgl;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const dt = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(dt.getTime())) return false;
  // Round-trip check: reject calendar overflow like '2026-11-31' (parses to Dec 1).
  // Same pattern as formatTglID in BrochureScheduleTemplate.tsx.
  const [, mm, dd] = iso.split('-').map(Number);
  if (dt.getUTCMonth() + 1 !== mm || dt.getUTCDate() !== dd) return false;
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth();
  return (y === dinginWindow.yearOfDec && m === 11) || (y === dinginWindow.yearOfDec + 1 && m === 0);
}

function isRahmahPackage(pkg: BrochurePackage): boolean {
  return /\bRAHMAH\b/i.test(pkg.nama);
}

function isPromoPackage(pkg: BrochurePackage): boolean {
  return pkg.isPromo === true || /\bPROMO\b/i.test(pkg.nama);
}

function matchesPackageType(pkg: BrochurePackage, type: string, musimDinginWindow: MusimDinginWindow): boolean {
  if (type === TYPE_UMROH_MUSIM_DINGIN) return isMusimDinginPackage(pkg, musimDinginWindow);
  if (type === TYPE_UMROH_RAHMAH) return isRahmahPackage(pkg);
  if (type === TYPE_UMROH_PROMO) return isPromoPackage(pkg);
  return derivePackageType(pkg.nama) === type;
}

function brochureLabelForType(type: string, fallback: string): string {
  if (type === TYPE_UMROH_SAJA) return 'REGULER';
  if (type === TYPE_UMROH_RAHMAH) return 'RAHMAH';
  if (type === TYPE_UMROH_PROMO) return 'PROMO';
  if (type === TYPE_UMROH_MUSIM_DINGIN) return 'MUSIM DINGIN';
  return fallback || type;
}

function airlineOptionRank(maskapai: string): number {
  const normalized = maskapai.trim().toLowerCase();
  if (normalized.includes('saudia')) return 0;
  if (normalized.includes('garuda')) return 1;
  return 2;
}

function compareAirlineOptions(a: string, b: string): number {
  const rankDiff = airlineOptionRank(a) - airlineOptionRank(b);
  if (rankDiff !== 0) return rankDiff;
  return a.localeCompare(b, 'id', { sensitivity: 'base' });
}

const PROMPT_MONTH_LONG_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

function formatPromptDate(iso: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  if (d.getUTCDate() !== parseInt(iso.slice(8, 10), 10)) return undefined;
  return `${d.getUTCDate()} ${PROMPT_MONTH_LONG_ID[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function countPromptTripDays(startIso: string, endIso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startIso) || !/^\d{4}-\d{2}-\d{2}$/.test(endIso)) return null;
  const start = new Date(`${startIso}T00:00:00.000Z`);
  const end = new Date(`${endIso}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return diff > 0 ? diff : null;
}

function formatPromptPrice(harga: number | null): string | undefined {
  if (typeof harga !== 'number' || !Number.isFinite(harga) || harga <= 0) return undefined;
  return formatBrochurePrice(`mulai Rp ${Math.round(harga).toLocaleString('id-ID')}`);
}

function formatPromptHotels(hotels?: BrochureHotel[]): string[] {
  if (!hotels?.length) return [];
  return hotels
    .filter(h => h?.name?.trim())
    .map(h => {
      const city = h.city?.trim() || 'Hotel';
      const stars = typeof h.stars === 'number' && h.stars > 0 ? ` (${'★'.repeat(Math.min(5, h.stars))})` : '';
      return `${city}: ${h.name.trim()}${stars}`;
    });
}

// FilterDropdown (custom, animated) now lives in ./FilterDropdown and is shared
// with the public jadwal-paket header. See docs/DESIGN-SYSTEM.md.

export default function BrochureSchedulePage({ agent: agentProp, displayMode = 'hari' }: BrochureSchedulePageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [months, setMonths] = useState<BrochureMonth[]>([]);
  const [agent, setAgent] = useState<BrochureAgent>(agentProp);
  const [filterDim, setFilterDim] = useState<FilterDim>('bulan');
  const [filterValue, setFilterValue] = useState<string | null>(null);
  const [availableOnly, setAvailableOnly] = useState(true);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const [previewScale, setPreviewScale] = useState(0);
  const exportPageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [busy, setBusy] = useState<null | { kind: 'share' | 'download'; pageIndex: number }>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [promptPageIndex, setPromptPageIndex] = useState<number | null>(null);
  const [saveMenuPageIndex, setSaveMenuPageIndex] = useState<number | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveMenuRef = useRef<HTMLDivElement | null>(null);
  // Export blobs are intentionally kept outside React state. They can be large,
  // and state updates would re-render every preview card for no UI benefit.
  const exportCacheRef = useRef<Map<string, ExportedImage>>(new Map());

  // ── "Unduh Katalog" (multi-page PDF) state ──
  // Catalog export can use either the active on-screen filter or the legacy
  // "all ready packages" source. Pages are rendered one at a time into a
  // dedicated off-screen stage to cap memory; catalogStage drives that stage.
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogProgress, setCatalogProgress] = useState<{ done: number; total: number } | null>(null);
  const [catalogMode, setCatalogMode] = useState<CatalogMode>('all-ready');
  const [catalogStage, setCatalogStage] = useState<CatalogStage | null>(null);
  const [coverId, setCoverId] = useState<string>(() => {
    try { return getCatalogCover(localStorage.getItem('catalogCoverId')).id; }
    catch { return DEFAULT_COVER_ID; }
  });
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const selectCover = (id: string) => {
    setCoverId(id);
    try { localStorage.setItem('catalogCoverId', id); } catch { /* private mode: ignore */ }
  };
  const openCatalogPicker = (mode: CatalogMode) => {
    setCatalogMode(mode);
    setCoverPickerOpen(true);
  };

  // ── Desain brosur: klasik default + 3 desain alternatif (opsi, dipilih via
  // chip picker). Berlaku untuk preview & export gambar bulanan; katalog PDF
  // tetap klasik (lihat catalog stage di bawah). ──
  const [designId, setDesignId] = useState<BrochureDesignId>(() => {
    try { return normalizeBrochureDesignId(localStorage.getItem('brosurDesignId')); }
    catch { return 'classic'; }
  });
  const selectDesign = (id: BrochureDesignId) => {
    setDesignId(id);
    try { localStorage.setItem('brosurDesignId', id); } catch { /* private mode: ignore */ }
  };
  const DesignTemplate = getBrochureDesign(designId).Component;
  const [catalogMeta, setCatalogMeta] = useState<{ summary: Array<{ label: string; count: number }>; dateLabel: string }>({ summary: [], dateLabel: '' });
  // Loading-modal result (success/error) shown after the busy phase ends.
  const [catalogResult, setCatalogResult] = useState<{ status: 'success' | 'error'; message?: string } | null>(null);
  useEffect(() => {
    if (catalogResult?.status !== 'success') return;
    const t = setTimeout(() => setCatalogResult(null), 1600);
    return () => clearTimeout(t);
  }, [catalogResult]);
  const catalogStageRef = useRef<HTMLDivElement | null>(null);

  // Measure the dashboard's own sticky header at runtime so the filter row's
  // sticky offset matches it exactly. Hardcoded values broke when the header's
  // padding/content shifted (e.g. font scaling, browser zoom, additional right-
  // side toolbar buttons). 60 is a sensible default for the first paint.
  const [headerOffset, setHeaderOffset] = useState(60);
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('header.sticky');
    if (!header) return;
    const measure = () => setHeaderOffset(header.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(header);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // Flatten all months into a single list — used for tipe/maskapai filtering.
  const allPackages = useMemo<BrochurePackage[]>(
    () => months.flatMap(m => m.packages),
    [months],
  );
  // Catalog is only meaningful when at least one month has a non-sold-out package.
  const hasAnyAvailable = useMemo(
    () => months.some(m => m.packages.some(p => !p.soldOut)),
    [months],
  );
  // Catalog export (PDF) is available to all agents.
  const catalogAllowed = true;
  const optionPackages = useMemo<BrochurePackage[]>(
    () => availableOnly ? allPackages.filter(p => !p.soldOut) : allPackages,
    [availableOnly, allPackages],
  );

  // Musim Dingin window dihitung sekali per session (window tidak bergeser
  // mid-day untuk use case ini). Deps kosong intentional.
  const musimDinginWindow = useMemo(() => getMusimDinginWindow(new Date()), []);

  // Available right-side options per filter dimension. Only includes values
  // that actually have at least one matching package, so users can't pick a
  // dead end. Months whose packages are ALL sold out are always hidden —
  // nothing left to sell there (sold-out rows still render as social proof
  // inside months that have availability). When "Tersedia saja" is active,
  // tipe/maskapai options are also based only on non-sold-out packages.
  // Order: months ascending, types in PACKAGE_TYPES priority, airlines
  // priority then alphabetical.
  const availableValues = useMemo<Array<{ value: string; label: string }>>(() => {
    if (filterDim === 'bulan') {
      return months
        .filter(m => m.packages.some(p => !p.soldOut))
        .map(m => ({ value: m.key, label: m.label }));
    }
    if (filterDim === 'tipe') {
      const present = new Set(optionPackages.map(p => derivePackageType(p.nama)));
      const ordered: Array<{ value: string; label: string }> = [];
      if (present.has(TYPE_UMROH_SAJA)) ordered.push({ value: TYPE_UMROH_SAJA, label: 'Umroh Saja' });
      if (optionPackages.some(p => isMusimDinginPackage(p, musimDinginWindow))) {
        ordered.push({ value: TYPE_UMROH_MUSIM_DINGIN, label: 'Umroh Musim Dingin' });
      }
      if (optionPackages.some(isRahmahPackage)) ordered.push({ value: TYPE_UMROH_RAHMAH, label: 'Umroh Rahmah' });
      if (optionPackages.some(isPromoPackage)) ordered.push({ value: TYPE_UMROH_PROMO, label: 'Umroh Promo' });
      for (const t of PACKAGE_TYPES) {
        if (present.has(t.value)) ordered.push({ value: t.value, label: t.value.replace(/^PLUS /, 'Plus ') });
      }
      return ordered;
    }
    if (filterDim === 'maskapai') {
      const set = new Set(optionPackages.map(p => p.maskapai).filter((m): m is string => !!m && m.trim().length > 0));
      return [...set].sort(compareAirlineOptions).map(m => ({ value: m, label: m }));
    }
    if (filterDim === 'landing') {
      const set = new Set(optionPackages.map(p => p.landing).filter((c): c is string => !!c && c.trim().length > 0));
      return [...set]
        .sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }))
        .map(c => ({ value: c, label: c }));
    }
    return [];
  }, [filterDim, months, optionPackages, musimDinginWindow]);

  // Whenever the dimension changes (or the available values list refreshes),
  // make sure the selected value is still valid; otherwise pick the first.
  useEffect(() => {
    if (availableValues.length === 0) {
      if (filterValue !== null) setFilterValue(null);
      return;
    }
    if (!filterValue || !availableValues.some(v => v.value === filterValue)) {
      setFilterValue(availableValues[0].value);
    }
  }, [availableValues, filterValue]);

  // Compute preview scale once container is in DOM (after loading flips off).
  // useLayoutEffect runs synchronously before paint, so we never paint at the wrong scale.
  useLayoutEffect(() => {
    if (loading) return;
    function recompute() {
      const w = previewContainerRef.current?.clientWidth;
      if (w && w > 0) setPreviewScale(w / BROCHURE_W);
    }
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, [loading]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/ai-tools/brosur-jadwal-bulan', { headers: getAuthHeaders() });
        if (!res.ok) {
          let payload: any = null;
          try { payload = await res.json(); } catch { /* ignore non-JSON errors */ }
          if (res.status === 403) throw new Error(payload?.message || 'Anda tidak memiliki akses ke fitur ini.');
          if (res.status === 401) throw new Error('Sesi login berakhir. Silakan login ulang.');
          throw new Error(payload?.message || 'Gagal memuat jadwal, coba lagi.');
        }
        const json: ApiResponse = await res.json();
        if (!alive) return;
        setMonths(json.months || []);
        setAgent(mergeAgentProfile(agentProp, json.agent));
        // Default selection: first (= nearest upcoming) month that still has
        // available (non-sold-out) packages — fully sold-out months are hidden
        // from the dropdown. The auto-select effect normalizes if needed.
        if (json.months?.length) {
          setFilterDim('bulan');
          const firstAvailable = json.months.find(m => m.packages.some(p => !p.soldOut));
          setFilterValue((firstAvailable ?? json.months[0]).key);
        }
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || 'Gagal memuat brosur');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (loading || !months.length) return;
    const timer = window.setTimeout(() => {
      getEmbeddedBrochureFontCss().catch(err => {
        console.warn('[brosur] font prewarm failed:', err);
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [loading, months.length]);

  // Resolve the current filter into:
  //   - filterLabel: human-readable subtitle that ends up on the brochure title row
  //   - filteredPackages: the rows that survive the filter
  //   - showFullDate: whether the date badge should also include the month name
  const { filterLabel, filteredPackages, showFullDate } = useMemo(() => {
    const applyAvailability = (packages: BrochurePackage[]) => (
      availableOnly ? packages.filter(p => !p.soldOut) : packages
    );

    if (!filterValue) {
      return { filterLabel: '', filteredPackages: [] as BrochurePackage[], showFullDate: false };
    }
    if (filterDim === 'bulan') {
      const m = months.find(x => x.key === filterValue);
      return {
        filterLabel: m?.label || '',
        filteredPackages: applyAvailability(m?.packages ?? []),
        showFullDate: false,
      };
    }
    if (filterDim === 'tipe') {
      const opt = availableValues.find(v => v.value === filterValue);
      const brochureLabel = brochureLabelForType(filterValue, opt?.label || filterValue);
      const matches = allPackages
        .filter(p => matchesPackageType(p, filterValue, musimDinginWindow))
        // Span multiple months → sort by departure date so rows read chronologically.
        .sort((a, b) => String(a.berangkat_tgl).localeCompare(String(b.berangkat_tgl)));
      return { filterLabel: brochureLabel, filteredPackages: applyAvailability(matches), showFullDate: true };
    }
    if (filterDim === 'landing') {
      const matches = allPackages
        .filter(p => p.landing === filterValue)
        .sort((a, b) => String(a.berangkat_tgl).localeCompare(String(b.berangkat_tgl)));
      return { filterLabel: `Landing ${filterValue}`, filteredPackages: applyAvailability(matches), showFullDate: true };
    }
    // maskapai
    const matches = allPackages
      .filter(p => p.maskapai === filterValue)
      .sort((a, b) => String(a.berangkat_tgl).localeCompare(String(b.berangkat_tgl)));
    return { filterLabel: filterValue, filteredPackages: applyAvailability(matches), showFullDate: true };
  }, [filterDim, filterValue, months, allPackages, availableValues, availableOnly, musimDinginWindow]);

  const activeImagePages = useMemo(
    () => splitPackagesIntoPages(filteredPackages, `${filterDim}-${filterValue ?? 'none'}${availableOnly ? '-available' : ''}`, filterLabel),
    [filteredPackages, filterDim, filterValue, filterLabel, availableOnly],
  );
  const showShareButton = isTouchPrimary() && typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const filenameForBrochure = (label: string, pageIndex = 1, pageCount = 1, ext = EXPORT_EXT) => {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'brosur';
    const base = `brosur-paket-umroh-${slug}`;
    return `${base}${pageCount > 1 ? `-gambar-${pageIndex}` : ''}.${ext}`;
  };
  const exportLabel = availableOnly && filterLabel ? `${filterLabel} tersedia` : filterLabel;
  const catalogFilterLabel = filterLabel || 'Filter aktif';

  useEffect(() => {
    if (promptPageIndex !== null && !activeImagePages[promptPageIndex]) {
      setPromptPageIndex(null);
    }
  }, [activeImagePages, promptPageIndex]);

  useEffect(() => {
    if (saveMenuPageIndex !== null && !activeImagePages[saveMenuPageIndex]) {
      setSaveMenuPageIndex(null);
    }
  }, [activeImagePages, saveMenuPageIndex]);

  useEffect(() => {
    if (saveMenuPageIndex === null) return;
    const onPointer = (e: PointerEvent) => {
      if (!saveMenuRef.current?.contains(e.target as Node)) setSaveMenuPageIndex(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSaveMenuPageIndex(null);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [saveMenuPageIndex]);

  const promptPage = promptPageIndex === null ? null : activeImagePages[promptPageIndex] ?? null;
  const titleForPromptPage = (pageIndex: number) => {
    const base = `Brosur Paket Umroh ${exportLabel || filterLabel || 'Jadwal'}`;
    return activeImagePages.length > 1 ? `${base} - Halaman ${pageIndex + 1}` : base;
  };
  const buildSchedulePromptData = (page: BrochureMonth, pageIndex: number): BrochurePromptSchedule => ({
    title: titleForPromptPage(pageIndex),
    filterLabel: exportLabel || filterLabel || page.label,
    pageIndex: pageIndex + 1,
    pageCount: activeImagePages.length,
    displayMode,
    packages: page.packages.map(p => ({
      nama: p.nama,
      tgl: formatPromptDate(p.berangkat_tgl),
      hari: p.hari ?? countPromptTripDays(p.berangkat_tgl, p.pulang_tgl),
      seatSisa: p.seatSisa ?? null,
      harga: p.soldOut ? undefined : formatPromptPrice(p.harga),
      maskapai: p.maskapai || undefined,
      landing: p.landing || undefined,
      hotel: formatPromptHotels(p.hotel),
      soldOut: !!p.soldOut,
    })),
    truncatedCount: page.truncatedCount,
  });

  // Winter brochure theme: only the Tipe Paket -> Umroh Musim Dingin filter.
  const brochureVariant: 'default' | 'winter' =
    filterDim === 'tipe' && filterValue === TYPE_UMROH_MUSIM_DINGIN ? 'winter' : 'default';

  function showToast(message: string) {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  }

  function waitForNextPaint(): Promise<void> {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
  }

  async function waitForFonts() {
    if (!document.fonts) return;
    try {
      // Probe at the actual sizes used in the brochure, not 16px. Some browsers cache
      // font metrics per size — probing at 16 doesn't guarantee 25/40/etc are decoded
      // by the time the export renderer serializes the SVG. Also: only probe weights that are
      // actually self-hosted — asking for weights that do not exist makes the
      // browser synthesize or fall back per character during capture.
      await Promise.all([
        ...[400, 600, 700, 800, 900].map(w => document.fonts.load(`${w} 32px "${BROCHURE_INTER_FONT}"`).catch(() => null)),
        ...[400, 600, 700, 800, 900].map(w => document.fonts.load(`${w} 88px "${BROCHURE_INTER_FONT}"`).catch(() => null)),
        document.fonts.load(`600 13px "${BROCHURE_INTER_FONT}"`).catch(() => null),
        document.fonts.load(`400 25px "${BROCHURE_BEBAS_FONT}"`).catch(() => null),
        document.fonts.load(`400 42px "${BROCHURE_BEBAS_FONT}"`).catch(() => null),
        document.fonts.load(`500 25px "${BROCHURE_OSWALD_FONT}"`).catch(() => null),
        document.fonts.load(`700 17px "${BROCHURE_OSWALD_FONT}"`).catch(() => null),
        document.fonts.load(`700 44px "${BROCHURE_OSWALD_FONT}"`).catch(() => null),
        document.fonts.load(`600 24px "${BROCHURE_ROBOTO_CONDENSED_FONT}"`).catch(() => null),
        document.fonts.load(`600 28px "${BROCHURE_ROBOTO_CONDENSED_FONT}"`).catch(() => null),
        document.fonts.load(`700 25px "${BROCHURE_ROBOTO_CONDENSED_FONT}"`).catch(() => null),
        document.fonts.load(`800 20px "${BROCHURE_MONTSERRAT_FONT}"`).catch(() => null),
        document.fonts.load(`900 40px "${BROCHURE_MONTSERRAT_FONT}"`).catch(() => null),
        document.fonts.load(`800 150px "${BROCHURE_PLAYFAIR_FONT}"`).catch(() => null),
        // Desain alternatif: judul Playfair (Zamrud) / Bebas (Boarding) / Montserrat (Senja).
        document.fonts.load(`800 102px "${BROCHURE_PLAYFAIR_FONT}"`).catch(() => null),
        document.fonts.load(`400 114px "${BROCHURE_BEBAS_FONT}"`).catch(() => null),
        document.fonts.load(`900 88px "${BROCHURE_MONTSERRAT_FONT}"`).catch(() => null),
      ]);
      await document.fonts.ready;
      // iOS Safari sometimes resolves `fonts.ready` while individual FontFace entries
      // are still in `loading`. Poll up to ~3 s to catch that race before the renderer
      // captures the DOM with half the glyphs swapped to fallback.
      for (let i = 0; i < 30; i++) {
        const stillLoading = Array.from(document.fonts).some(f => f.status === 'loading');
        if (!stillLoading) break;
        await new Promise(r => setTimeout(r, 100));
      }
      await waitForNextPaint();
      await waitForNextPaint();
    } catch {
      // Best effort: export should continue even if one font load probe fails.
    }
  }

  function rememberExport(pageKey: string, image: ExportedImage) {
    const cache = exportCacheRef.current;
    cache.set(pageKey, image);
    while (cache.size > EXPORT_CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (!oldest) break;
      cache.delete(oldest);
    }
  }

  async function waitForImages(target: HTMLElement) {
    const images = Array.from(target.querySelectorAll('img'));
    await Promise.all(images.map(img => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>(resolve => {
        const done = () => resolve();
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      });
    }));
  }

  function isMostlyBlank(canvas: HTMLCanvasElement): boolean {
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const sampleW = Math.max(1, Math.floor(canvas.width / 8));
    const sampleH = Math.max(1, Math.floor(canvas.height / 8));
    const sample = document.createElement('canvas');
    sample.width = sampleW;
    sample.height = sampleH;
    const sampleCtx = sample.getContext('2d');
    if (!sampleCtx) return false;
    sampleCtx.drawImage(canvas, 0, 0, sampleW, sampleH);
    const data = sampleCtx.getImageData(0, 0, sampleW, sampleH).data;
    let nearWhite = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 248 && data[i + 1] > 248 && data[i + 2] > 248 && data[i + 3] > 248) {
        nearWhite++;
      }
    }
    return nearWhite / (sampleW * sampleH) > 0.97;
  }

  function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob && blob.size > 0) resolve(blob);
        else reject(new Error('canvas-to-blob-failed'));
      }, EXPORT_MIME, EXPORT_QUALITY);
    });
  }

  // Rasterize a single full-size brochure node to a canvas. Shared by the
  // per-image export (captureBlob) and the catalog PDF builder so both go
  // through the exact same font/image-wait + blank-detection + retry path.
  async function captureCanvasFromElement(target: HTMLElement, scale: number = EXPORT_SCALE): Promise<HTMLCanvasElement> {
    await waitForFonts();
    await waitForImages(target);
    await waitForNextPaint();
    await waitForNextPaint();

    const { domToCanvas } = await import('modern-screenshot');
    let fontCss = '';
    try {
      fontCss = await getEmbeddedBrochureFontCss();
    } catch (err) {
      console.warn('[brosur] embedded font css failed:', err);
      fontCss = Array.from(target.querySelectorAll('style'))
        .map(style => style.textContent || '')
        .filter(Boolean)
        .join('\n');
    }
    const captureOptions: ModernScreenshotOptions = {
      scale,
      width: BROCHURE_W,
      height: BROCHURE_H,
      type: EXPORT_MIME,
      quality: EXPORT_QUALITY,
      backgroundColor: '#FFFFFF',
      font: {
        cssText: fontCss,
        preferredFormat: 'woff2',
      },
      timeout: 15_000,
      fetch: {
        requestInit: { cache: 'force-cache' },
      },
      features: {
        copyScrollbar: false,
        removeAbnormalAttributes: true,
        removeControlCharacter: true,
        fixSvgXmlDecode: true,
      },
    };
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const canvas = await domToCanvas(target, captureOptions);
        if (canvas.width !== BROCHURE_W * scale || canvas.height !== BROCHURE_H * scale) {
          console.warn('[brosur] unexpected canvas size:', canvas.width, canvas.height);
        }
        if (isMostlyBlank(canvas)) {
          throw new Error('blank-export');
        }
        return canvas;
      } catch (err) {
        lastError = err;
        console.warn(`[brosur] capture attempt ${attempt + 1} failed:`, err);
        await waitForFonts();
        await waitForImages(target);
        await waitForNextPaint();
      }
    }

    throw lastError ?? new Error('capture-failed');
  }

  async function captureBlob(pageIndex: number): Promise<ExportedImage | null> {
    const target = exportPageRefs.current[pageIndex];
    if (!target) return null;
    const canvas = await captureCanvasFromElement(target);
    const blob = await canvasToBlob(canvas);
    return { blob, ext: EXPORT_EXT, mime: blob.type || EXPORT_MIME };
  }

  async function buildPromptReferenceFile(pageIndex: number): Promise<File | null> {
    if (!exportLabel) return null;
    const page = activeImagePages[pageIndex];
    if (!page) return null;

    const cached = exportCacheRef.current.get(page.key);
    const image = cached || await captureBlob(pageIndex);
    if (!image) return null;
    if (!cached) rememberExport(page.key, image);

    const filename = filenameForBrochure(exportLabel, pageIndex + 1, activeImagePages.length, image.ext);
    return new File([image.blob], filename, { type: image.mime });
  }

  function buildCatalogPlan(mode: CatalogMode): {
    summary: Array<{ label: string; count: number }>;
    pages: BrochureMonth[];
    showFullDate: boolean;
    variant: 'default' | 'winter';
    emptyMessage: string;
    filenameLabel?: string | null;
  } {
    if (mode === 'active-filter') {
      const label = catalogFilterLabel;
      return {
        summary: [{ label, count: filteredPackages.length }],
        pages: activeImagePages,
        showFullDate,
        variant: brochureVariant,
        emptyMessage: availableOnly
          ? 'Tidak ada paket tersedia untuk filter ini'
          : 'Tidak ada paket untuk filter ini',
        filenameLabel: label,
      };
    }

    const summary: Array<{ label: string; count: number }> = [];
    const pages: BrochureMonth[] = [];
    for (const m of months) {
      const available = m.packages.filter(p => !p.soldOut);
      if (available.length === 0) continue;
      summary.push({ label: m.label, count: available.length });
      for (const pg of splitPackagesIntoPages(available, `catalog-${m.key}`, m.label)) pages.push(pg);
    }
    return {
      summary,
      pages,
      showFullDate: false,
      variant: 'default',
      emptyMessage: 'Tidak ada paket tersedia untuk katalog',
      filenameLabel: null,
    };
  }

  // Build the catalog PDF: cover page + selected package pages (10/page)
  // rendered sequentially off-screen and stitched with jsPDF.
  async function handleDownloadCatalog(mode: CatalogMode = catalogMode) {
    if (!catalogAllowed || catalogBusy || busy !== null) return;

    const plan = buildCatalogPlan(mode);
    if (plan.pages.length === 0) {
      showToast(plan.emptyMessage);
      return;
    }

    const dateLabel = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
    const total = plan.pages.length + 1; // + cover
    setCatalogBusy(true);
    setCatalogResult(null);
    setCatalogProgress({ done: 0, total });

    // Render the current catalogStage into the off-screen node, then capture it.
    // flushSync guarantees the DOM is committed before modern-screenshot reads it.
    const renderAndCapture = async (stage: CatalogStage): Promise<HTMLCanvasElement> => {
      flushSync(() => setCatalogStage(stage));
      const el = catalogStageRef.current;
      if (!el) throw new Error('catalog-stage-missing');
      return captureCanvasFromElement(el, CATALOG_SCALE);
    };

    let added = 0;
    let failed = 0;
    try {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [BROCHURE_W, BROCHURE_H], compress: true });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();

      const addCanvas = (canvas: HTMLCanvasElement) => {
        if (added > 0) pdf.addPage([BROCHURE_W, BROCHURE_H], 'portrait');
        pdf.addImage(canvas.toDataURL(EXPORT_MIME, CATALOG_JPEG_QUALITY), 'JPEG', 0, 0, pw, ph);
        added += 1;
      };

      // Cover first. Set meta + stage together so the cover renders with data.
      try {
        flushSync(() => { setCatalogMeta({ summary: plan.summary, dateLabel }); setCatalogStage({ kind: 'cover' }); });
        const el = catalogStageRef.current;
        if (!el) throw new Error('catalog-stage-missing');
        addCanvas(await captureCanvasFromElement(el, CATALOG_SCALE));
      } catch (e) {
        failed += 1;
        console.error('[katalog] cover failed:', e);
      }
      setCatalogProgress({ done: 1, total });

      for (let i = 0; i < plan.pages.length; i++) {
        try {
          addCanvas(await renderAndCapture({
            kind: 'page',
            page: plan.pages[i],
            showFullDate: plan.showFullDate,
            variant: plan.variant,
          }));
        } catch (e) {
          failed += 1;
          console.error(`[katalog] page ${i + 1} failed:`, e);
        }
        setCatalogProgress({ done: i + 2, total });
      }

      if (added === 0) throw new Error('semua halaman gagal dibuat');
      pdf.save(mode === 'active-filter'
        ? catalogFilenameWithLabel(agent, plan.filenameLabel)
        : catalogFilename(agent));
      showToast(failed > 0 ? `Katalog selesai — ${failed} halaman dilewati` : 'Katalog PDF berhasil diunduh');
      setCatalogResult({ status: 'success' });
    } catch (e) {
      console.error('[katalog] failed:', e);
      showToast(`Gagal membuat katalog: ${errMsg(e)}`);
      setCatalogResult({ status: 'error', message: errMsg(e) });
    } finally {
      setCatalogBusy(false);
      setCatalogProgress(null);
      setCatalogStage(null);
    }
  }

  const pageKeys = activeImagePages.map(p => p.key).join('|');
  useEffect(() => {
    const valid = new Set(activeImagePages.map(p => p.key));
    for (const key of exportCacheRef.current.keys()) {
      if (!valid.has(key)) {
        exportCacheRef.current.delete(key);
      }
    }
    exportPageRefs.current = exportPageRefs.current.slice(0, activeImagePages.length);
  }, [pageKeys, activeImagePages]);

  // HARI/SEAT switch dan ganti desain mengubah render brosur, sedangkan cache
  // export hanya di-key page.key — drop agar download/share berikutnya
  // re-capture sesuai mode + desain aktif.
  useEffect(() => {
    exportCacheRef.current.clear();
  }, [displayMode, designId]);

  // Surface the underlying error in the toast so iPhone users — who can't open
  // a console — still have a starting point for diagnosis. Truncate to keep
  // the toast bubble from overflowing.
  function errMsg(e: unknown): string {
    const raw = e instanceof Error ? (e.message || e.name) : String(e);
    return raw.length > 90 ? raw.slice(0, 87) + '…' : raw;
  }

  function isShareActivationError(e: unknown): boolean {
    const err = e as { name?: string; message?: string } | null;
    const text = `${err?.name || ''} ${err?.message || ''}`;
    return /NotAllowedError|user activation|user gesture|permission/i.test(text);
  }

  function handleDownload(pageIndex: number) {
    if (!exportLabel) return;
    const page = activeImagePages[pageIndex];
    if (!page) return;
    const cached = exportCacheRef.current.get(page.key);
    if (cached) {
      // Cache hit — fire download immediately, no await between click & action.
      downloadBlob(cached.blob, filenameForBrochure(exportLabel, pageIndex + 1, activeImagePages.length, cached.ext));
      return;
    }
    // Cache miss — capture inline and download. Spinner shown during wait.
    setBusy({ kind: 'download', pageIndex });
    (async () => {
      try {
        const image = await captureBlob(pageIndex);
        if (!image) throw new Error('capture-failed');
        rememberExport(page.key, image);
        downloadBlob(image.blob, filenameForBrochure(exportLabel, pageIndex + 1, activeImagePages.length, image.ext));
      } catch (e) {
        console.error('[brosur] download failed:', e);
        showToast(`Gagal generate gambar: ${errMsg(e)}`);
      } finally {
        setBusy(null);
      }
    })();
  }

  // Synchronous when cached. iOS Safari requires navigator.share() to be called
  // inside the click's user-activation window; if the first capture misses that
  // window, we keep the blob so the next Share tap can open the sheet instantly.
  function handleShare(pageIndex: number) {
    if (!exportLabel) return;
    const page = activeImagePages[pageIndex];
    if (!page) return;
    const cached = exportCacheRef.current.get(page.key);

    if (cached) {
      const filename = filenameForBrochure(exportLabel, pageIndex + 1, activeImagePages.length, cached.ext);
      const file = new File([cached.blob], filename, { type: cached.mime });
      if (canShareFiles([file])) {
        // Fire-and-forget within the click handler. No await above this line.
        navigator.share({
          files: [file],
          title: `Brosur Paket Umroh ${exportLabel}`,
          text: `Paket Umroh ${exportLabel} dari ${agent.name || 'Alhijaz'}`,
        }).catch((err: any) => {
          if (err?.name === 'AbortError') return; // user cancelled — silent
          console.error('[brosur] share failed:', err);
          showToast(`Gagal share: ${errMsg(err)}`);
        });
      } else {
        downloadBlob(cached.blob, filename);
        showToast(`Share tidak didukung, ${cached.ext.toUpperCase()} diunduh`);
      }
      return;
    }

    // Cache miss — capture inline. iOS will likely lose user activation here
    // and surface NotAllowedError; we report it instead of silently swallowing.
    setBusy({ kind: 'share', pageIndex });
    (async () => {
      try {
        const image = await captureBlob(pageIndex);
        if (!image) throw new Error('capture-failed');
        rememberExport(page.key, image);
        const filename = filenameForBrochure(exportLabel, pageIndex + 1, activeImagePages.length, image.ext);
        const file = new File([image.blob], filename, { type: image.mime });
        if (canShareFiles([file])) {
          try {
            await navigator.share({
              files: [file],
              title: `Brosur Paket Umroh ${exportLabel}`,
              text: `Paket Umroh ${exportLabel} dari ${agent.name || 'Alhijaz'}`,
            });
          } catch (err: any) {
            if (err?.name === 'AbortError') return;
            if (isShareActivationError(err)) {
              showToast('Gambar siap, klik Share sekali lagi');
              return;
            }
            throw err;
          }
        } else {
          downloadBlob(image.blob, filename);
          showToast(`Share tidak didukung, ${image.ext.toUpperCase()} diunduh`);
        }
      } catch (e) {
        console.error('[brosur] share failed:', e);
        showToast(`Gagal share: ${errMsg(e)}`);
      } finally {
        setBusy(null);
      }
    })();
  }

  // ── Loading: skeleton placeholder ───────────────────────────────
  if (loading) {
    return (
      <div className="pb-8">
        {/* Tab bar skeleton */}
        <div
          className="sticky z-10 backdrop-blur-md bg-white/90 dark:bg-slate-900/90 border-b border-gray-100 dark:border-slate-700/50"
          style={{ top: headerOffset }}
        >
          <div className="flex gap-2 px-4 py-3 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-7 rounded-full bg-gray-100 dark:bg-slate-800 animate-pulse"
                style={{ width: 90 }}
              />
            ))}
          </div>
        </div>
        {/* Brochure skeleton */}
        <div className="flex justify-center px-4 pt-5">
          <BrochureSkeleton />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 pt-10 pb-8 text-center">
        <p className="text-sm font-bold text-gray-800 dark:text-white">Gagal memuat brosur</p>
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1.5 leading-relaxed">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold active:scale-95 transition"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  if (!months.length) {
    return (
      <div className="px-4 pt-10 pb-8 text-center">
        <p className="text-sm font-bold text-gray-800 dark:text-white">Belum ada jadwal paket yang aktif</p>
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1.5 leading-relaxed">
          Jadwal akan muncul otomatis saat ada paket mendatang dengan harga aktif.
        </p>
      </div>
    );
  }

  const previewReady = previewScale > 0;
  const hasResults = filteredPackages.length > 0;
  const activeFilterCatalogBusy = catalogBusy && catalogMode === 'active-filter';
  const allReadyCatalogBusy = catalogBusy && catalogMode === 'all-ready';
  const canDownloadSelectedCatalog = catalogMode === 'active-filter' ? hasResults : hasAnyAvailable;

  return (
    <div style={{ paddingBottom: '2rem' }}>
      {/* Filter row: dimension + value + availability toggle. Sticks just below
          the dashboard's own sticky header (height measured at runtime). */}
      <div
        className="sticky z-10 backdrop-blur-md bg-white/90 dark:bg-slate-900/90 border-b border-gray-100 dark:border-slate-700/50"
        style={{ top: headerOffset }}
      >
        <div className="flex gap-2 px-4 py-3">
          <FilterDropdown
            variant="compact"
            value={filterDim}
            onChange={(v) => setFilterDim(v as FilterDim)}
            options={(['bulan', 'tipe', 'maskapai', 'landing'] as FilterDim[]).map(d => ({ value: d, label: FILTER_DIM_LABELS[d] }))}
            ariaLabel="Filter berdasarkan"
            widthClass="flex-1 min-w-0"
          />
          <FilterDropdown
            variant="compact"
            value={filterValue ?? ''}
            onChange={setFilterValue}
            options={availableValues}
            ariaLabel={`Pilih ${FILTER_DIM_LABELS[filterDim]}`}
            widthClass="flex-1 min-w-0"
            disabled={availableValues.length === 0}
          />
          <button
            type="button"
            onClick={() => setAvailableOnly(v => !v)}
            aria-label={availableOnly ? 'Tampilkan semua paket' : 'Tampilkan paket tersedia saja'}
            aria-pressed={availableOnly}
            title={availableOnly ? 'Tampilkan semua paket' : 'Tampilkan paket tersedia saja'}
            className={`h-9 shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl border pl-2 pr-2.5 text-[11px] font-black leading-none tracking-wide transition-all duration-200 active:scale-[0.98] ${
              availableOnly
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 border-emerald-400 text-white shadow-md shadow-emerald-500/20'
                : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400'
            }`}
          >
            <span
              aria-hidden="true"
              className={`relative inline-flex h-[18px] w-[32px] items-center rounded-full p-[2px] transition-colors duration-200 ${
                availableOnly ? 'bg-white/25' : 'bg-gray-200 dark:bg-slate-700'
              }`}
            >
              <span
                className={`inline-flex h-[14px] w-[14px] items-center justify-center rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  availableOnly ? 'translate-x-[14px] text-emerald-600' : 'translate-x-0 text-transparent'
                }`}
              >
                <Check size={10} strokeWidth={4} />
              </span>
            </span>
            <span>{availableOnly ? 'Ready' : 'Semua'}</span>
          </button>
        </div>
      </div>

      {/* Katalog PDF: compact mode switch + one download action. */}
      <div className="px-4 pt-3">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 min-w-0 h-10 rounded-xl bg-gray-100 dark:bg-slate-800 p-1">
            {([
              ['active-filter', 'Filter Ini'],
              ['all-ready', 'Semua'],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setCatalogMode(mode)}
                aria-pressed={catalogMode === mode}
                disabled={catalogBusy || busy !== null}
                className={`flex-1 min-w-0 inline-flex items-center justify-center rounded-lg px-2 text-[11px] font-bold transition-all duration-200 disabled:opacity-60 ${
                  catalogMode === mode
                    ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm'
                    : 'text-gray-500 dark:text-slate-400'
                }`}
              >
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => openCatalogPicker(catalogMode)}
            disabled={!catalogAllowed || !canDownloadSelectedCatalog || catalogBusy || busy !== null}
            className="h-10 shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 px-4 text-xs font-bold text-white shadow-md shadow-emerald-500/20 transition-all duration-200 active:scale-95 disabled:opacity-70"
          >
            {activeFilterCatalogBusy || allReadyCatalogBusy
              ? <Loader2 size={16} className="animate-spin" />
              : <FileDown size={16} />}
            <span>Unduh PDF</span>
          </button>
        </div>
      </div>

      {/* Picker desain brosur — Klasik default + 3 desain alternatif (opsi).
          Pilihan tersimpan di localStorage dan berlaku utk preview + export
          gambar; katalog PDF tetap klasik. */}
      <div className="px-4 pt-3">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[11px] font-black uppercase tracking-wide text-gray-400 dark:text-slate-500">Desain</span>
          <div className="flex-1 min-w-0 flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {BROCHURE_DESIGNS.map(d => (
              <button
                key={d.id}
                type="button"
                onClick={() => selectDesign(d.id)}
                aria-pressed={designId === d.id}
                disabled={catalogBusy || busy !== null}
                className={`shrink-0 inline-flex items-center gap-1.5 h-8 rounded-full border pl-1.5 pr-3 text-[11px] font-bold transition-all duration-200 active:scale-[0.98] disabled:opacity-60 ${
                  designId === d.id
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-400 dark:border-emerald-600 text-emerald-700 dark:text-emerald-300 shadow-sm'
                    : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300'
                }`}
              >
                <span aria-hidden="true" className="h-5 w-5 rounded-full border border-black/10 dark:border-white/15" style={{ background: d.swatch }} />
                <span className="whitespace-nowrap">{d.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <CatalogLoadingModal
        open={catalogBusy || catalogResult !== null}
        status={catalogResult ? catalogResult.status : 'loading'}
        stageLabel={
          catalogStage?.kind === 'cover'
            ? 'Menyusun sampul…'
            : catalogStage?.kind === 'page'
              ? `Menyiapkan ${catalogStage.page.label}…`
              : 'Menyiapkan halaman…'
        }
        done={catalogProgress?.done ?? 0}
        total={catalogProgress?.total ?? 0}
        message={catalogResult?.message}
        onClose={() => setCatalogResult(null)}
      />
      <CatalogCoverPicker
        open={coverPickerOpen}
        selectedId={coverId}
        onSelect={selectCover}
        onClose={() => setCoverPickerOpen(false)}
        description={
          catalogMode === 'active-filter'
            ? `Filter: ${catalogFilterLabel}`
            : 'Semua paket ready'
        }
        downloadLabel="Unduh PDF"
        onDownload={() => { setCoverPickerOpen(false); handleDownloadCatalog(catalogMode); }}
      />

      {/* Brochure previews + per-image actions */}
      <div className="flex justify-center px-4 pt-5">
        <div
          ref={previewContainerRef}
          style={{
            width: '100%',
            maxWidth: 480,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          {!hasResults ? (
            <div className="text-center py-10">
              <p className="text-sm font-bold text-gray-800 dark:text-white">
                {availableOnly ? 'Tidak ada paket tersedia untuk filter ini' : 'Tidak ada paket untuk filter ini'}
              </p>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                Coba pilih nilai lain atau ganti dimensi filter.
              </p>
            </div>
          ) : previewReady ? (
            activeImagePages.map((page, index) => {
              const shareBusy = busy?.kind === 'share' && busy.pageIndex === index;
              const downloadBusy = busy?.kind === 'download' && busy.pageIndex === index;
              const saveMenuOpen = saveMenuPageIndex === index;

              return (
                <div
                  key={page.key}
                  style={{
                    width: '100%',
                    overflow: 'hidden',
                    borderRadius: 18,
                    boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
                    background: '#fff',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: `${BROCHURE_W} / ${BROCHURE_H}`,
                      position: 'relative',
                      overflow: 'hidden',
                      background: '#fff',
                    }}
                  >
                    <div
                      style={{
                        width: BROCHURE_W,
                        height: BROCHURE_H,
                        transform: `scale(${previewScale})`,
                        transformOrigin: 'top left',
                      }}
                    >
                      <DesignTemplate month={page} agent={agent} showFullDate={showFullDate} variant={brochureVariant} displayMode={displayMode} />
                    </div>
                  </div>

                  <div
                    style={{
                      padding: 10,
                      borderTop: '1px solid rgba(15, 23, 42, 0.08)',
                      background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                    }}
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPromptPageIndex(index)}
                        disabled={busy !== null || catalogBusy}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-slate-800 border border-emerald-200 dark:border-emerald-700/70 transition-all duration-200 active:scale-[0.98] disabled:opacity-70"
                      >
                        <Wand2 size={16} />
                        <span className="whitespace-nowrap">Buat Ulang AI</span>
                      </button>
                      {showShareButton ? (
                        <div className="relative" ref={saveMenuOpen ? saveMenuRef : undefined}>
                          <div
                            role="menu"
                            className={`absolute bottom-full right-0 mb-2 w-44 rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl overflow-hidden origin-bottom-right transition-all duration-150 z-20 ${
                              saveMenuOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-1 pointer-events-none'
                            }`}
                          >
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setSaveMenuPageIndex(null);
                                handleShare(index);
                              }}
                              disabled={busy !== null || catalogBusy}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm font-semibold text-gray-700 dark:text-slate-100 hover:bg-gray-50 dark:hover:bg-slate-700/60 transition-colors disabled:opacity-70"
                            >
                              {shareBusy ? <Loader2 size={16} className="animate-spin text-emerald-600 dark:text-emerald-400" /> : <Share2 size={16} className="text-emerald-600 dark:text-emerald-400" />}
                              <span>Share</span>
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setSaveMenuPageIndex(null);
                                handleDownload(index);
                              }}
                              disabled={busy !== null || catalogBusy}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm font-semibold text-gray-700 dark:text-slate-100 hover:bg-gray-50 dark:hover:bg-slate-700/60 transition-colors disabled:opacity-70"
                            >
                              {downloadBusy ? <Loader2 size={16} className="animate-spin text-emerald-600 dark:text-emerald-400" /> : <Download size={16} className="text-emerald-600 dark:text-emerald-400" />}
                              <span>Download</span>
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSaveMenuPageIndex(saveMenuOpen ? null : index)}
                            disabled={busy !== null || catalogBusy}
                            aria-haspopup="menu"
                            aria-expanded={saveMenuOpen}
                            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 shadow-sm shadow-emerald-500/20 transition-all duration-200 active:scale-[0.98] disabled:opacity-70"
                          >
                            {(shareBusy || downloadBusy) ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}
                            <span>Simpan</span>
                            <ChevronDown size={15} className={`transition-transform duration-200 ${saveMenuOpen ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleDownload(index)}
                          disabled={busy !== null || catalogBusy}
                          className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 shadow-sm shadow-emerald-500/20 transition-all duration-200 active:scale-[0.98] disabled:opacity-70"
                        >
                          {downloadBusy ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}
                          <span>Download</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <BrochureSkeleton />
          )}
        </div>
      </div>

      {toast && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-30 bg-gray-900 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-xl max-w-[90vw] whitespace-nowrap"
          style={{ bottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
        >
          {toast}
        </div>
      )}

      <BrochurePromptModal
        isOpen={promptPageIndex !== null && !!promptPage}
        onClose={() => setPromptPageIndex(null)}
        agent={{ name: agent.name || '', phone: agent.phone || '', website: agent.website || '' }}
        pkg={null}
        schedule={promptPage && promptPageIndex !== null ? buildSchedulePromptData(promptPage, promptPageIndex) : null}
        getReferenceImageFile={promptPageIndex !== null ? () => buildPromptReferenceFile(promptPageIndex) : null}
        context="schedule"
        title={promptPage && promptPageIndex !== null ? titleForPromptPage(promptPageIndex) : 'Brosur Paket Umroh'}
      />

      {/* Off-screen full-size export node. Keep it rendered, not transparent, so export matches preview. */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: -(BROCHURE_W + 80),
          top: 0,
          width: BROCHURE_W,
          pointerEvents: 'none',
        }}
      >
        {activeImagePages.map((page, index) => (
          <div
            key={page.key}
            ref={(node) => { exportPageRefs.current[index] = node; }}
            style={{ width: BROCHURE_W, height: BROCHURE_H }}
          >
            <DesignTemplate month={page} agent={agent} showFullDate={showFullDate} variant={brochureVariant} displayMode={displayMode} />
          </div>
        ))}
      </div>

      {/* Off-screen catalog stage — exactly one page (cover or month) is mounted
          here at a time during PDF export, keeping peak memory to a single canvas. */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: -(BROCHURE_W + 80),
          top: BROCHURE_H + 80,
          width: BROCHURE_W,
          pointerEvents: 'none',
        }}
      >
        <div ref={catalogStageRef} style={{ width: BROCHURE_W, height: BROCHURE_H }}>
          {catalogStage?.kind === 'cover' && (
            <BrochureCatalogCover agent={agent} months={catalogMeta.summary} cover={getCatalogCover(coverId)} />
          )}
          {catalogStage?.kind === 'page' && (
            /* Katalog PDF selalu memakai template klasik: mode rasterSafe-nya
               menjamin hasil identik antar engine; desain alternatif memakai
               efek (clip-text, mask, backdrop-filter) yang tidak raster-safe. */
            <BrochureScheduleTemplate
              month={catalogStage.page}
              agent={agent}
              showFullDate={catalogStage.showFullDate}
              variant={catalogStage.variant}
              rasterSafe
              displayMode={displayMode}
            />
          )}
        </div>
      </div>
    </div>
  );
}

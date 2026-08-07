// src/components/BrochureSchedulePage.tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Download, Share2, Loader2, FileDown, Check, Wand2, ChevronDown } from 'lucide-react';
import FilterDropdown from './FilterDropdown';
import { brosurModePath, readBrosurModeFromPath, type BrosurMode } from '../lib/brosur-mode';
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
  hasKeretaCepat,
  type BrochureMonth,
  type BrochurePackage,
  type BrochureAgent,
  type BrochureHotel,
} from './BrochureScheduleTemplate';
import { brochurePackageSellsTier, isWaitingListPackageName, projectBrochurePackageToTier } from '../../lib/brochure-schedule.js';
import { BrochurePromptModal } from './BrochurePromptModal';
import BrochurePaketGrid, { BrochurePaketGridSkeleton } from './BrochurePaketGrid';
import SegmentedControl from './common/SegmentedControl';
import { formatBrochurePrice, type BrochurePromptSchedule } from './brochure-prompt/buildBrochurePrompt';
import { getAuthHeaders } from './LoginPage';
import { trackEvent } from '../utils/analytics';
import { canShareFiles, downloadBlob, isTouchPrimary } from '../utils/share';
import { CatalogLoadingModal } from './CatalogLoadingModal';
import { CatalogCoverPicker } from './CatalogCoverPicker';
import { getCatalogCover, DEFAULT_COVER_ID } from '@/lib/catalogCovers';
import { BROCHURE_DESIGNS, getBrochureDesign, normalizeBrochureDesignId, type BrochureDesignId } from './brochure-designs';
// Dipakai bersama brosur jadwal yang dirender di dalam Bani — pemenggalan
// halaman dan rasterisasinya harus identik di kedua tempat.
import { PACKAGES_PER_IMAGE, splitPackagesIntoPages } from '@/lib/brosurJadwalPages';
import {
  captureCanvasFromElement,
  canvasToBlob,
  waitForNextPaint,
  BROSUR_EXPORT_MIME,
  BROSUR_EXPORT_EXT,
  BROSUR_EXPORT_QUALITY,
  BROSUR_EXPORT_SCALE,
} from '../utils/brosurCapture';

const EXPORT_MIME = BROSUR_EXPORT_MIME;
const EXPORT_EXT = BROSUR_EXPORT_EXT;
const EXPORT_QUALITY = BROSUR_EXPORT_QUALITY;
const EXPORT_SCALE = BROSUR_EXPORT_SCALE;
// Catalog PDF renders at 1.5× (1620px wide) so pages stay crisp when zoomed in a
// PDF viewer, without the ~4× file-size hit of full 2×. Slightly lower JPEG
// quality offsets the larger dimensions to keep the overall file manageable.
const CATALOG_SCALE = 1.5;
const CATALOG_JPEG_QUALITY = 0.9;

interface ExportedImage {
  blob: Blob;
  ext: string;
  mime: string;
}

interface CanonicalPreview {
  image: ExportedImage;
  renderKey: string;
}

interface CanonicalPreviewError {
  message: string;
  renderKey: string;
}

interface BrochureSchedulePageProps {
  agent: BrochureAgent;
  /** Kolom ke-3 brosur: 'hari' (default) atau 'seat'. Dikontrol oleh toggle di
   *  header dashboard (DashboardLayout), yang juga memiliki state-nya. */
  displayMode?: 'hari' | 'seat';
  /** Dipanggil saat mode efektif berubah (termasuk sekali saat mount). Dipakai
   *  DashboardLayout untuk menyembunyikan toggle HARI/SEAT di mode Paket:
   *  perubahan mode memakai replaceState yang tidak lewat navigatePath, jadi
   *  header tidak punya cara lain untuk tahu ia harus render ulang. */
  onModeChange?: (mode: BrosurMode) => void;
}

interface ApiResponse {
  months: BrochureMonth[];
  agent: BrochureAgent;
}

function withoutWaitingListMonths(months: BrochureMonth[]): BrochureMonth[] {
  return months.reduce<BrochureMonth[]>((visible, month) => {
    const packages = month.packages.filter(pkg => !isWaitingListPackageName(pkg.nama));
    if (packages.length > 0) visible.push({ ...month, packages });
    return visible;
  }, []);
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

type FilterDim = 'bulan' | 'tipe' | 'maskapai' | 'landing';
type BrochureMode = BrosurMode;

const BROCHURE_MODE_OPTIONS: Array<{ value: BrochureMode; label: string }> = [
  { value: 'jadwal', label: 'Brosur Jadwal' },
  { value: 'paket', label: 'Brosur Paket' },
];

type CatalogStage =
  | { kind: 'cover' }
  | { kind: 'page'; page: BrochureMonth; showFullDate: boolean; variant: 'default' | 'winter' }
  | { kind: 'package'; label: string };

function catalogFilenameWithLabel(agent: BrochureAgent, label: string): string {
  const who = (agent.slug || agent.name || 'alhijaz')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'alhijaz';
  const slug = label
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'filter';
  const d = new Date();
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `katalog-umroh-${who}-${slug}-${ym}.pdf`;
}

function packageCatalogFilename(agent: BrochureAgent, label: string): string {
  const who = (agent.slug || agent.name || 'alhijaz')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'alhijaz';
  const slug = label
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'filter';
  const d = new Date();
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `katalog-brosur-paket-${who}-${slug}-${ym}.pdf`;
}

function brochureFetchUrl(imageUrl: string): string {
  if (imageUrl.includes('.b-cdn.net') || imageUrl.includes('bunnycdn')) return imageUrl;
  return imageUrl.replace(/^https?:\/\/(?:jadwal\.(?:miqot\.com|alhijaz\.co)|115\.124\.86\.220)/i, '');
}

type PackageWithBrochure = BrochurePackage & { brosur: string };

const PACKAGE_CATALOG_FETCH_BATCH = 4;

/** Thumbnail 400px sudah cukup untuk katalog yang dibaca/dibagikan lewat HP
 * dan ukurannya puluhan kali lebih kecil dari sumber cetak. File penuh tetap
 * menjadi fallback bila thumbnail belum tersedia atau gagal diambil. */
async function fetchPackageBrochureBlob(pkg: PackageWithBrochure): Promise<Blob> {
  const candidates = [pkg.brosurThumb, pkg.brosur]
    .filter((url): url is string => !!url)
    .filter((url, index, urls) => urls.indexOf(url) === index);
  let lastStatus: number | null = null;
  for (const imageUrl of candidates) {
    try {
      const response = await fetch(brochureFetchUrl(imageUrl), { cache: 'force-cache' });
      lastStatus = response.status;
      if (response.ok) return await response.blob();
    } catch {
      // Coba kandidat berikutnya (biasanya brosur penuh).
    }
  }
  throw new Error(lastStatus ? `Gagal mengambil brosur (${lastStatus})` : 'Gagal mengambil brosur');
}

/** Pasang brosur resmi ke halaman katalog 2:3 tanpa crop. Brosur AWAPI
 * umumnya 3:4, sehingga sisa ruang ditempatkan merata di atas/bawah. */
async function renderPackageBrochureCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const blobUrl = URL.createObjectURL(blob);

  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Gambar brosur tidak dapat dibaca'));
      image.src = blobUrl;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Ukuran brosur tidak valid');

    const canvas = document.createElement('canvas');
    canvas.width = BROCHURE_W;
    canvas.height = BROCHURE_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas katalog tidak tersedia');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    ctx.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function catalogAgentPhotoUrl(agent: BrochureAgent): string {
  const slug = String(agent.slug || '').trim().toLowerCase();
  if (/^[a-z0-9-]{1,64}$/.test(slug)) return `/agents/${encodeURIComponent(slug)}.jpg`;
  return agent.photo || '';
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
const TYPE_KERETA_CEPAT = 'KERETA CEPAT';

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

/**
 * Keanggotaan filter Tipe Paket yang menunjuk sebuah tier (lihat
 * TIER_FOR_PACKAGE_TYPE) mengikuti apa yang benar-benar DIJUAL paket, bukan
 * namanya. Nama tak bisa dipercaya: cleanBrochurePackageName membuang frasa
 * "MIX PAKET RAHMAH & UHUD" utuh, jadi paket yang menjual tier RAHMAH
 * kehilangan tokennya dan tak pernah muncul di filter "Umroh Rahmah" —
 * sementara bentuk tanpa "&" tetap lolos. Sumbernya sama dengan yang memasang
 * harga (projectBrochurePackageToTier), jadi keanggotaan dan harga tak bisa
 * berselisih: setiap paket di filter RAHMAH dijamin punya harga RAHMAH.
 */
function packageSellsTier(pkg: BrochurePackage, tier: string): boolean {
  const sells = brochurePackageSellsTier(pkg, tier);
  if (sells !== null) return sells;
  // null = backend belum mengirim `tiers` (respons API versi lama). Tidak tahu
  // ≠ tidak punya, jadi jatuh balik ke uji nama supaya filter tidak mendadak
  // kosong sebelum server ter-deploy.
  return pkg.nama.toUpperCase().split(/[^A-Z0-9]+/).includes(tier.toUpperCase());
}

function isPromoPackage(pkg: BrochurePackage): boolean {
  return pkg.isPromo === true || /\bPROMO\b/i.test(pkg.nama);
}

function matchesPackageType(pkg: BrochurePackage, type: string, musimDinginWindow: MusimDinginWindow): boolean {
  if (type === TYPE_UMROH_MUSIM_DINGIN) return isMusimDinginPackage(pkg, musimDinginWindow);
  if (type === TYPE_UMROH_PROMO) return isPromoPackage(pkg);
  // Kereta Cepat itu fasilitas, bukan tier maupun destinasi: sebuah paket bisa
  // sekaligus PLUS TURKI dan Kereta Cepat, jadi ia tidak lewat derivePackageType
  // (yang memilih SATU tipe per paket) dan tidak menggeser harga ke tier lain.
  if (type === TYPE_KERETA_CEPAT) return hasKeretaCepat(pkg.nama);
  const tier = TIER_FOR_PACKAGE_TYPE[type];
  if (tier) return packageSellsTier(pkg, tier);
  return derivePackageType(pkg.nama) === type;
}

// Tipe paket yang sebetulnya menunjuk sebuah TIER harga di paket_harga AWAPI.
// Paket "MIX" menjual dua tier sekaligus (mis. RAHMAH + UHUD), dan backend
// mengirim harga tier TERMURAH sebagai "mulai dari" — di bawah filter ini itu
// jadi harga UHUD berlabel RAHMAH, selisihnya sampai belasan juta. Filter lain
// (Promo, Musim Dingin, Plus …) bukan tier, jadi tidak dipetakan ke sini.
const TIER_FOR_PACKAGE_TYPE: Record<string, string> = {
  [TYPE_UMROH_RAHMAH]: 'RAHMAH',
};

function brochureLabelForType(type: string, fallback: string): string {
  if (type === TYPE_UMROH_SAJA) return 'REGULER';
  if (type === TYPE_UMROH_RAHMAH) return 'RAHMAH';
  if (type === TYPE_UMROH_PROMO) return 'PROMO';
  if (type === TYPE_UMROH_MUSIM_DINGIN) return 'MUSIM DINGIN';
  if (type === TYPE_KERETA_CEPAT) return 'KERETA CEPAT';
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

export default function BrochureSchedulePage({ agent: agentProp, displayMode = 'hari', onModeChange }: BrochureSchedulePageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [months, setMonths] = useState<BrochureMonth[]>([]);
  const [agent, setAgent] = useState<BrochureAgent>(agentProp);
  const [mode, setMode] = useState<BrochureMode>(readBrosurModeFromPath);
  const [filterDim, setFilterDim] = useState<FilterDim>('bulan');
  const [filterValue, setFilterValue] = useState<string | null>(null);
  const [availableOnly, setAvailableOnly] = useState(true);
  // URL ⇄ mode. replaceState (bukan push) mengikuti pola tab StatistikPage:
  // ganti mode itu berganti tampilan, bukan berpindah halaman — tombol back
  // tetap berarti "keluar dari Brosur" dan tidak menumpuk satu entri per klik.
  useEffect(() => {
    if (readBrosurModeFromPath() !== mode) {
      window.history.replaceState(window.history.state, '', brosurModePath(mode));
    }
    // Setelah URL benar, baru beri tahu header — DashboardLayout membaca mode
    // dari path, jadi urutannya tidak boleh terbalik.
    onModeChange?.(mode);
  }, [mode, onModeChange]);

  // Back/forward browser (mis. dari halaman lain kembali ke …/paket) tidak
  // me-remount komponen ini kalau tab dashboard-nya sama, jadi mode harus
  // dibaca ulang dari URL.
  useEffect(() => {
    const onPopState = () => setMode(readBrosurModeFromPath());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const [previewScale, setPreviewScale] = useState(0);
  const exportPageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [canonicalPreviews, setCanonicalPreviews] = useState<Array<CanonicalPreview | null>>([]);
  const [previewErrors, setPreviewErrors] = useState<Array<CanonicalPreviewError | null>>([]);
  const [previewRetryNonce, setPreviewRetryNonce] = useState(0);
  const previewGenerationRef = useRef(0);
  const [busy, setBusy] = useState<null | { kind: 'share'; pageIndex: number }>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [promptPageIndex, setPromptPageIndex] = useState<number | null>(null);
  const [saveMenuPageIndex, setSaveMenuPageIndex] = useState<number | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveMenuRef = useRef<HTMLDivElement | null>(null);

  const mountTracked = useRef(false);
  useEffect(() => { if (!mountTracked.current) { trackEvent('feature', 'open_brosur'); mountTracked.current = true; } }, []);

  // ── "Unduh Katalog" (multi-page PDF) state ──
  // Catalog export always follows the active on-screen filter. Pages are
  // rendered one at a time into a dedicated off-screen stage to cap memory;
  // catalogStage drives that stage.
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogProgress, setCatalogProgress] = useState<{ done: number; total: number } | null>(null);
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
  const openCatalogPicker = () => setCoverPickerOpen(true);

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
      // Lewat matchesPackageType, bukan predikat sendiri: daftar opsi dan isi
      // filter wajib memakai aturan keanggotaan yang sama persis.
      if (optionPackages.some(p => matchesPackageType(p, TYPE_UMROH_RAHMAH, musimDinginWindow))) {
        ordered.push({ value: TYPE_UMROH_RAHMAH, label: 'Umroh Rahmah' });
      }
      if (optionPackages.some(isPromoPackage)) ordered.push({ value: TYPE_UMROH_PROMO, label: 'Umroh Promo' });
      if (optionPackages.some(p => matchesPackageType(p, TYPE_KERETA_CEPAT, musimDinginWindow))) {
        ordered.push({ value: TYPE_KERETA_CEPAT, label: 'Kereta Cepat' });
      }
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

  // The actual brochure DOM remains the preview. Scale the authored 1080px
  // canvas into the available card width without rasterizing the UI first.
  useLayoutEffect(() => {
    if (loading) return;
    const recompute = () => {
      const width = previewContainerRef.current?.clientWidth;
      if (width && width > 0) setPreviewScale(width / BROCHURE_W);
    };
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
    // `mode` ikut: container preview di-unmount di mode paket, jadi skala harus
    // diukur ulang saat kembali ke mode jadwal.
  }, [loading, mode]);

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
        // Defensive client-side filter: production/API processes can briefly
        // lag behind the SPA during a rolling deploy. A WAITINGLIST placeholder
        // must never keep an otherwise empty month visible in the dashboard.
        const visibleMonths = withoutWaitingListMonths(json.months || []);
        setMonths(visibleMonths);
        setAgent(mergeAgentProfile(agentProp, json.agent));
        // Default selection: first (= nearest upcoming) month that still has
        // available (non-sold-out) packages — fully sold-out months are hidden
        // from the dropdown. The auto-select effect normalizes if needed.
        if (visibleMonths.length) {
          setFilterDim('bulan');
          const firstAvailable = visibleMonths.find(m => m.packages.some(p => !p.soldOut));
          setFilterValue((firstAvailable ?? visibleMonths[0]).key);
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
      const tier = TIER_FOR_PACKAGE_TYPE[filterValue] ?? null;
      const matches = allPackages
        .filter(p => matchesPackageType(p, filterValue, musimDinginWindow))
        // Harga & hotel mengikuti tier yang sedang difilter — tanpa ini paket
        // MIX tampil dengan harga tier termurahnya (UHUD/HEMAT) padahal
        // judulnya RAHMAH.
        .map(p => projectBrochurePackageToTier(p, tier))
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
  const packageCatalogPackages = useMemo(
    () => filteredPackages.filter((pkg): pkg is PackageWithBrochure => !!pkg.brosur),
    [filteredPackages],
  );
  const catalogAgent = useMemo<BrochureAgent>(
    () => ({ ...agent, photo: catalogAgentPhotoUrl(agent) }),
    [agent],
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

  async function captureBlob(pageIndex: number, signal?: AbortSignal): Promise<ExportedImage | null> {
    const target = exportPageRefs.current[pageIndex];
    if (!target) return null;
    const canvas = await captureCanvasFromElement(target, EXPORT_SCALE, signal);
    const blob = await canvasToBlob(canvas);
    return { blob, ext: EXPORT_EXT, mime: blob.type || EXPORT_MIME };
  }

  // Tunggu blob kanonik halaman ini siap (atau gagal). Dipakai modal "Buat
  // Ulang AI": tombolnya aktif segera setelah halaman tampil, modal punya UI
  // pending sendiri, dan file referensi tetap byte-identik dengan hasil Simpan.
  async function waitForCanonicalImage(pageIndex: number, timeoutMs = 45_000): Promise<ExportedImage | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const renderKey = canonicalRenderKeyRef.current;
      const preview = canonicalPreviewsRef.current[pageIndex];
      if (preview?.renderKey === renderKey) return preview.image;
      const previewError = previewErrorsRef.current[pageIndex];
      if (previewError?.renderKey === renderKey) return null;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    return null;
  }

  async function buildPromptReferenceFile(pageIndex: number): Promise<File | null> {
    if (!exportLabel) return null;
    const image = await waitForCanonicalImage(pageIndex);
    if (!image) return null;

    const filename = filenameForBrochure(exportLabel, pageIndex + 1, activeImagePages.length, image.ext);
    return new File([image.blob], filename, { type: image.mime });
  }

  function buildCatalogPlan(): {
    summary: Array<{ label: string; count: number }>;
    pages: BrochureMonth[];
    showFullDate: boolean;
    variant: 'default' | 'winter';
    emptyMessage: string;
    filenameLabel: string;
  } {
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

  async function handleDownloadPackageCatalog() {
    if (packageCatalogPackages.length === 0) {
      showToast('Belum ada brosur paket untuk filter ini');
      return;
    }

    const dateLabel = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
    const total = packageCatalogPackages.length + 1; // + cover
    setCatalogBusy(true);
    setCatalogResult(null);
    setCatalogProgress({ done: 0, total });

    let added = 0;
    let addedPackages = 0;
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

      try {
        flushSync(() => {
          setCatalogMeta({ summary: [{ label: catalogFilterLabel, count: packageCatalogPackages.length }], dateLabel });
          setCatalogStage({ kind: 'cover' });
        });
        const el = catalogStageRef.current;
        if (!el) throw new Error('catalog-stage-missing');
        addCanvas(await captureCanvasFromElement(el, CATALOG_SCALE));
      } catch (e) {
        failed += 1;
        console.error('[katalog-paket] cover failed:', e);
      }
      setCatalogProgress({ done: 1, total });

      for (let offset = 0; offset < packageCatalogPackages.length; offset += PACKAGE_CATALOG_FETCH_BATCH) {
        const batch = packageCatalogPackages.slice(offset, offset + PACKAGE_CATALOG_FETCH_BATCH);
        flushSync(() => setCatalogStage({
          kind: 'package',
          label: batch.length === 1 ? batch[0].nama : `${batch.length} brosur`,
        }));
        await waitForNextPaint();

        // Paralel terbatas: memangkas waktu tunggu jaringan tanpa menahan
        // puluhan gambar/canvas sekaligus di memori ponsel.
        const fetched = await Promise.allSettled(batch.map(fetchPackageBrochureBlob));
        for (let index = 0; index < batch.length; index++) {
          const pkg = batch[index];
          try {
            const result = fetched[index];
            if (result.status === 'rejected') throw result.reason;
            addCanvas(await renderPackageBrochureCanvas(result.value));
            addedPackages += 1;
          } catch (e) {
            failed += 1;
            console.error(`[katalog-paket] ${pkg.id} failed:`, e);
          }
          setCatalogProgress({ done: offset + index + 2, total });
        }
      }

      if (addedPackages === 0) throw new Error('semua gambar brosur gagal dimuat');
      pdf.save(packageCatalogFilename(agent, catalogFilterLabel));
      showToast(failed > 0 ? `Katalog selesai — ${failed} halaman dilewati` : 'Katalog PDF berhasil diunduh');
      setCatalogResult({ status: 'success' });
    } catch (e) {
      console.error('[katalog-paket] failed:', e);
      showToast(`Gagal membuat katalog: ${errMsg(e)}`);
      setCatalogResult({ status: 'error', message: errMsg(e) });
    } finally {
      setCatalogBusy(false);
      setCatalogProgress(null);
      setCatalogStage(null);
    }
  }

  // Build the catalog PDF: cover page + selected package pages (10/page)
  // rendered sequentially off-screen and stitched with jsPDF.
  async function handleDownloadCatalog() {
    if (!catalogAllowed || catalogBusy || busy !== null) return;
    if (mode === 'paket') {
      await handleDownloadPackageCatalog();
      return;
    }

    const plan = buildCatalogPlan();
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
    // flushSync guarantees the DOM is committed before the canonical renderer reads it.
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
      pdf.save(catalogFilenameWithLabel(agent, plan.filenameLabel));
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
  // Tie every prepared export to the exact input that produced it. This keeps
  // a previous filter/design Blob from being downloadable after the live
  // preview has already changed.
  const canonicalRenderKey = useMemo(() => JSON.stringify({
    pages: activeImagePages,
    designId,
    displayMode,
    showFullDate,
    brochureVariant,
    agent,
  }), [activeImagePages, designId, displayMode, showFullDate, brochureVariant, agent]);
  const previewReady = previewScale > 0;

  // Cermin state utk fungsi async yang menunggu blob siap (waitForCanonicalImage)
  // tanpa perlu re-subscribe React state.
  const canonicalPreviewsRef = useRef<Array<CanonicalPreview | null>>([]);
  const previewErrorsRef = useRef<Array<CanonicalPreviewError | null>>([]);
  const canonicalRenderKeyRef = useRef(canonicalRenderKey);
  useEffect(() => { canonicalPreviewsRef.current = canonicalPreviews; }, [canonicalPreviews]);
  useEffect(() => { previewErrorsRef.current = previewErrors; }, [previewErrors]);
  useEffect(() => { canonicalRenderKeyRef.current = canonicalRenderKey; }, [canonicalRenderKey]);

  function canonicalImageAt(pageIndex: number): ExportedImage | null {
    const preview = canonicalPreviews[pageIndex];
    return preview?.renderKey === canonicalRenderKey ? preview.image : null;
  }

  useEffect(() => {
    exportPageRefs.current = exportPageRefs.current.slice(0, activeImagePages.length);
  }, [pageKeys, activeImagePages]);

  // Prepare one JPEG for every visible page in the background. The live DOM
  // remains visible immediately; download/share then reuse this Blob byte-for-
  // byte instead of triggering a second, potentially different capture.
  useEffect(() => {
    const generation = ++previewGenerationRef.current;
    let cancelled = false;
    // Ganti desain/filter membatalkan capture generasi lama: item antrean yang
    // basi dilepas begitu gilirannya tiba, sehingga tap desain beruntun tidak
    // menumpuk belasan capture (di WebKit satu capture bisa berdetik-detik).
    const abortController = new AbortController();

    // Mode paket tidak me-mount DOM preview, jadi tidak ada yang bisa (atau
    // perlu) di-capture — jangan bakar CPU/log error untuk target yang absen.
    if (loading || mode !== 'jadwal' || !previewReady || activeImagePages.length === 0) {
      setCanonicalPreviews([]);
      setPreviewErrors([]);
      return () => { cancelled = true; };
    }

    setCanonicalPreviews(Array.from({ length: activeImagePages.length }, () => null));
    setPreviewErrors(Array.from({ length: activeImagePages.length }, () => null));

    (async () => {
      // Let the live preview DOM commit the newly selected design first.
      await waitForNextPaint();
      await waitForNextPaint();

      for (let pageIndex = 0; pageIndex < activeImagePages.length; pageIndex++) {
        if (cancelled || previewGenerationRef.current !== generation) break;
        try {
          const image = await captureBlob(pageIndex, abortController.signal);
          if (!image) throw new Error('capture-target-not-ready');
          if (cancelled || previewGenerationRef.current !== generation) break;
          setCanonicalPreviews(current => {
            if (previewGenerationRef.current !== generation) return current;
            const next = [...current];
            next[pageIndex] = { image, renderKey: canonicalRenderKey };
            return next;
          });
        } catch (captureError) {
          if (cancelled || previewGenerationRef.current !== generation) break;
          console.error(`[brosur] export preparation ${pageIndex + 1} failed:`, captureError);
          setPreviewErrors(current => {
            const next = [...current];
            next[pageIndex] = { message: errMsg(captureError), renderKey: canonicalRenderKey };
            return next;
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [
    loading,
    mode,
    previewReady,
    activeImagePages,
    canonicalRenderKey,
    previewRetryNonce,
  ]);

  // Surface the underlying error in the toast so iPhone users — who can't open
  // a console — still have a starting point for diagnosis. Truncate to keep
  // the toast bubble from overflowing.
  function errMsg(e: unknown): string {
    const raw = e instanceof Error ? (e.message || e.name) : String(e);
    return raw.length > 90 ? raw.slice(0, 87) + '…' : raw;
  }

  function handleDownload(pageIndex: number) {
    if (!exportLabel) return;
    const image = canonicalImageAt(pageIndex);
    if (!image) {
      showToast('File ekspor masih disiapkan, coba lagi sebentar');
      return;
    }
    downloadBlob(image.blob, filenameForBrochure(exportLabel, pageIndex + 1, activeImagePages.length, image.ext));
  }

  // The background export is already a Blob, so navigator.share remains inside
  // the original user-activation window on iOS.
  function handleShare(pageIndex: number) {
    if (!exportLabel) return;
    const image = canonicalImageAt(pageIndex);
    if (!image) {
      showToast('File ekspor masih disiapkan, coba lagi sebentar');
      return;
    }
    const filename = filenameForBrochure(exportLabel, pageIndex + 1, activeImagePages.length, image.ext);
    const file = new File([image.blob], filename, { type: image.mime });
    if (!canShareFiles([file])) {
      downloadBlob(image.blob, filename);
      showToast(`Share tidak didukung, ${image.ext.toUpperCase()} diunduh`);
      return;
    }
    setBusy({ kind: 'share', pageIndex });
    try {
      navigator.share({
        files: [file],
        title: `Brosur Paket Umroh ${exportLabel}`,
        text: `Paket Umroh ${exportLabel} dari ${agent.name || 'Alhijaz'}`,
      }).catch((shareError: any) => {
        if (shareError?.name === 'AbortError') return;
        console.error('[brosur] share failed:', shareError);
        showToast(`Gagal share: ${errMsg(shareError)}`);
      }).finally(() => setBusy(null));
    } catch (shareError) {
      setBusy(null);
      console.error('[brosur] share failed:', shareError);
      showToast(`Gagal share: ${errMsg(shareError)}`);
    }
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
        {/* Skeleton mengikuti bentuk mode yang sedang aktif — di mode Paket
            brosur tunggal salah bentuk, yang datang nanti adalah grid. */}
        {mode === 'paket' ? (
          <BrochurePaketGridSkeleton />
        ) : (
          <div className="flex justify-center px-4 pt-5">
            <BrochureSkeleton />
          </div>
        )}
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

  const hasResults = filteredPackages.length > 0;

  return (
    <div style={{ paddingBottom: '2rem' }}>
      {/* Filter row: dimension + value + availability toggle. Sticks just below
          the dashboard's own sticky header (height measured at runtime). */}
      <div
        className="sticky z-10 backdrop-blur-md bg-white/90 dark:bg-slate-900/90 border-b border-gray-100 dark:border-slate-700/50"
        style={{ top: headerOffset }}
      >
        <div className="px-4 pt-3">
          <SegmentedControl
            options={BROCHURE_MODE_OPTIONS}
            value={mode}
            onChange={setMode}
            accent="emerald"
          />
        </div>
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

      {/* Kedua mode memakai aksi katalog yang sama, tetapi sumber halamannya
          mengikuti mode + filter aktif: template jadwal atau brosur resmi. */}
      <div className="px-4 pt-3">
        <button
          type="button"
          onClick={openCatalogPicker}
          disabled={
            !catalogAllowed
            || (mode === 'paket' ? packageCatalogPackages.length === 0 : !hasResults)
            || catalogBusy
            || busy !== null
          }
          className="h-10 w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 px-4 text-xs font-bold text-white shadow-md shadow-emerald-500/20 transition-all duration-200 active:scale-[0.99] disabled:opacity-70"
        >
          {catalogBusy
            ? <Loader2 size={16} className="animate-spin" />
            : <FileDown size={16} />}
          <span>Unduh Katalog PDF</span>
        </button>
      </div>

      {mode === 'paket' ? (
        /* Mode Brosur Paket: grid brosur resmi per paket. Filter row di atas
           tetap dipakai apa adanya — grid hanya menerima hasilnya. */
        <BrochurePaketGrid packages={filteredPackages} filterLabel={filterLabel} agent={agent} />
      ) : (
        <>
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
            ) : (
              activeImagePages.map((page, index) => {
                const previewCandidate = canonicalPreviews[index];
                const errorCandidate = previewErrors[index];
                const canonicalPreview = previewCandidate?.renderKey === canonicalRenderKey ? previewCandidate : null;
                const previewError = errorCandidate?.renderKey === canonicalRenderKey ? errorCandidate.message : null;
                const previewAvailable = !!canonicalPreview;
                const shareBusy = busy?.kind === 'share' && busy.pageIndex === index;
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
                        <div
                          ref={(node) => { exportPageRefs.current[index] = node; }}
                          data-brochure-preview-page={index}
                          data-brochure-design={designId}
                          style={{ width: BROCHURE_W, height: BROCHURE_H }}
                        >
                          <DesignTemplate month={page} agent={agent} showFullDate={showFullDate} variant={brochureVariant} displayMode={displayMode} />
                        </div>
                      </div>
                    </div>

                    {previewError && (
                      <div className="flex items-center justify-between gap-3 border-t border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                        <span>File ekspor belum siap.</span>
                        <button
                          type="button"
                          onClick={() => setPreviewRetryNonce(value => value + 1)}
                          className="shrink-0 font-bold underline underline-offset-2"
                        >
                          Coba lagi
                        </button>
                      </div>
                    )}

                    <div
                      style={{
                        padding: 10,
                        borderTop: '1px solid rgba(15, 23, 42, 0.08)',
                        background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                      }}
                    >
                      <div className="grid grid-cols-2 gap-2">
                        {/* Tidak menunggu blob ekspor: modal punya UI pending
                            sendiri dan file referensi ditunggu di sana
                            (waitForCanonicalImage), tetap identik dgn Simpan. */}
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
                                disabled={!previewAvailable || busy !== null || catalogBusy}
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
                                disabled={!previewAvailable || busy !== null || catalogBusy}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm font-semibold text-gray-700 dark:text-slate-100 hover:bg-gray-50 dark:hover:bg-slate-700/60 transition-colors disabled:opacity-70"
                              >
                                {!previewAvailable && !previewError
                                  ? <Loader2 size={16} className="animate-spin text-emerald-600 dark:text-emerald-400" />
                                  : <Download size={16} className="text-emerald-600 dark:text-emerald-400" />}
                                <span>Download</span>
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSaveMenuPageIndex(saveMenuOpen ? null : index)}
                              disabled={!previewAvailable || busy !== null || catalogBusy}
                              aria-haspopup="menu"
                              aria-expanded={saveMenuOpen}
                              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 shadow-sm shadow-emerald-500/20 transition-all duration-200 active:scale-[0.98] disabled:opacity-70"
                            >
                              {(shareBusy || (!previewAvailable && !previewError))
                                ? <Loader2 size={17} className="animate-spin" />
                                : <Download size={17} />}
                              <span>Simpan</span>
                              <ChevronDown size={15} className={`transition-transform duration-200 ${saveMenuOpen ? 'rotate-180' : ''}`} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleDownload(index)}
                            disabled={!previewAvailable || busy !== null || catalogBusy}
                            className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 shadow-sm shadow-emerald-500/20 transition-all duration-200 active:scale-[0.98] disabled:opacity-70"
                          >
                            {!previewAvailable && !previewError
                              ? <Loader2 size={17} className="animate-spin" />
                              : <Download size={17} />}
                            <span>Download</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        </>
      )}

      <CatalogLoadingModal
        open={catalogBusy || catalogResult !== null}
        status={catalogResult ? catalogResult.status : 'loading'}
        stageLabel={
          catalogStage?.kind === 'cover'
            ? 'Menyusun sampul…'
            : catalogStage?.kind === 'page'
              ? `Menyiapkan ${catalogStage.page.label}…`
              : catalogStage?.kind === 'package'
                ? `Menyiapkan ${catalogStage.label}…`
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
        description={`Filter: ${catalogFilterLabel}${mode === 'paket' ? ` · ${packageCatalogPackages.length} brosur` : ''}`}
        downloadLabel="Unduh Katalog PDF"
        onDownload={() => { setCoverPickerOpen(false); handleDownloadCatalog(); }}
      />

      {toast && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-30 bg-gray-900 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-xl max-w-[90vw] whitespace-nowrap"
          style={{ bottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
        >
          {toast}
        </div>
      )}

      {mode === 'jadwal' && (
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
      )}

      {/* Off-screen catalog stage — cover dipakai kedua mode; halaman template
          hanya dipasang untuk katalog Brosur Jadwal. */}
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
            <BrochureCatalogCover agent={catalogAgent} months={catalogMeta.summary} cover={getCatalogCover(coverId)} />
          )}
          {catalogStage?.kind === 'page' && (
            /* Katalog PDF selalu memakai template klasik: mode rasterSafe-nya
               menjamin hasil identik antar engine; desain alternatif memakai
               efek (clip-text, mask, backdrop-filter) yang tidak raster-safe. */
            <BrochureScheduleTemplate
              month={catalogStage.page}
              agent={catalogAgent}
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

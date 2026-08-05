import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { trackEvent } from '../utils/analytics';
// Modal hasil + generator PDF quotation dipindah ke KalkulasiResultModal.tsx
// (dipakai bersama kartu kalkulasi Bani) — react-pdf/@react-pdf ikut pindah.
import { KalkulasiResultModal, generateQuotationPdfBlob } from './KalkulasiResultModal';
import { motion, AnimatePresence } from 'framer-motion';
import type { AgentData } from '@/data/agents';
import {
  ArrowLeft,
  User,
  Search,
  ChevronDown,
  Baby,
  Users,
  BedDouble,
  Minus,
  Plus,
  Tag,
  FileText,
  Calendar,
  CheckCircle2,
  Loader2,
  Plane,
  ChevronRight,
  AlertCircle,
  Sparkles,
  Sun,
  Moon,
} from 'lucide-react';
import { getPackages } from '@/services';
import type { UmrohPackage } from '@/types';
import {
  cheapestPackageTier,
  packageCityHotels,
  tierHotelInfo,
  tierRoomPrice,
  tierStartingPrice,
} from '@/lib/packageTiers';

function getLocalStorageItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setLocalStorageItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // unavailable storage should not block the calculator
  }
}

// ============================================
// Types
// ============================================
interface JamaahCounts {
  dewasa: number;
  balitaKasur: number;
  balitaTanpaKasur: number;
  infant: number;
}

interface RoomCounts {
  single: number;
  double: number;
  triple: number;
  quad: number;
}

interface SelectOption {
  id: string;
  label: string;
  flags?: string[];     // country flag emojis
  colorClass?: string;  // icon color class by package type
  searchText?: string;  // extra searchable text (hotels, airline, etc.)
}

const INFANT_PRICE = 8_500_000;

const ROOM_PRICES_FALLBACK = {
  single: 0,
  double: 0,
  triple: 0,
  quad: 0,
  infant: INFANT_PRICE,
};

const ANAK_TANPA_KASUR_DISC_NORMAL = 3_500_000;
const ANAK_TANPA_KASUR_DISC_PROMO  = 3_000_000;
const ANAK_TANPA_KASUR_DISC_RAHMAH = 5_500_000;


// ============================================
// Helper: Format Rupiah
// ============================================
function formatRupiah(value: number): string {
  return 'Rp ' + value.toLocaleString('id-ID');
}

// ============================================
// Counter Component (Pill-Shaped)
// ============================================
function Counter({
  value,
  onChange,
  min = 0,
  max = 99,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="inline-flex items-center bg-white dark:bg-slate-800 rounded-full border-2 border-slate-200 dark:border-slate-600 p-0.5 shadow-sm transition-all duration-300">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="w-8 h-8 flex items-center justify-center rounded-full text-emerald-500 hover:bg-emerald-100 hover:text-emerald-600 transition-all duration-300 disabled:opacity-30 disabled:text-slate-300 disabled:cursor-not-allowed active:scale-90"
      >
        <Minus size={14} strokeWidth={2.5} />
      </button>
      <span className="w-8 text-center font-bold text-slate-800 dark:text-slate-100 text-sm tabular-nums select-none">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="w-8 h-8 flex items-center justify-center rounded-full text-emerald-500 hover:bg-emerald-100 hover:text-emerald-600 transition-all duration-300 disabled:opacity-30 disabled:text-slate-300 disabled:cursor-not-allowed active:scale-90"
      >
        <Plus size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
}

// ============================================
// Searchable Select Component
// ============================================
function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  loading,
}: {
  options: SelectOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  loading?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = options.filter((o) => {
    const q = search.toLowerCase();
    return o.label.toLowerCase().includes(q) || (o.searchText && o.searchText.toLowerCase().includes(q));
  });

  const selectedLabel = options.find((o) => o.id === value)?.label || '';

  // Parse selected label for "boarding pass" look
  const parsed = selectedLabel
    ? (() => {
        const parts = selectedLabel.split(' — ');
        return { date: parts[0] || '', name: parts[1] || '' };
      })()
    : null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading}
        className="w-full text-left rounded-2xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-sm transition-all duration-300 hover:border-emerald-300 dark:hover:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 disabled:opacity-60 overflow-hidden"
      >
        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm px-4 py-4">
            <Loader2 size={16} className="animate-spin" />
            Memuat paket...
          </div>
        ) : parsed ? (
          /* Boarding Pass Style */
          <div className="flex items-stretch">
            <div className="flex-1 min-w-0 p-4">
              <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">Keberangkatan</p>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-tight">{parsed.date}</p>
              {parsed.name && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{parsed.name}</p>
              )}
            </div>
            <div className="w-px bg-slate-200 my-3 border-l border-dashed border-slate-300" />
            <div className="flex items-center justify-center px-4 flex-shrink-0">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center border border-amber-100">
                <Plane size={18} className="text-amber-600 rotate-45" />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 py-4">
            <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">{placeholder}</span>
            <ChevronDown size={18} className="text-emerald-500" />
          </div>
        )}
      </button>

      {isOpen && !loading && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 right-0 z-50 mt-2 rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xl overflow-hidden">
            <div className="p-2.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari tanggal, paket, hotel, maskapai..."
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-slate-400">
                  Tidak ditemukan
                </div>
              ) : (
                filtered.map((opt) => {
                  const parts = opt.label.split(' — ');
                  const isSelected = value === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        onChange(opt.id);
                        setIsOpen(false);
                        setSearch('');
                      }}
                      className={`w-full text-left px-4 py-3 transition-all duration-300 flex items-center gap-3 border-b border-slate-50 dark:border-slate-700/50 last:border-0 ${
                        isSelected ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${
                        isSelected ? 'bg-emerald-100' : opt.colorClass === 'red' ? 'bg-red-50' : opt.colorClass === 'blue' ? 'bg-blue-50' : opt.colorClass === 'green' ? 'bg-green-50' : 'bg-slate-100'
                      }`}>
                        <Calendar size={14} className={isSelected ? 'text-emerald-600' : opt.colorClass === 'red' ? 'text-red-500' : opt.colorClass === 'blue' ? 'text-blue-500' : opt.colorClass === 'green' ? 'text-green-500' : 'text-slate-400'} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className={`text-sm font-semibold ${isSelected ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100'}`}>
                            {parts[0]}
                          </p>
                          {opt.flags && opt.flags.length > 0 && (
                            <span className="text-sm flex-shrink-0">{opt.flags.join('')}</span>
                          )}
                        </div>
                        {parts[1] && (
                          <p className={`text-xs truncate ${isSelected ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                            {parts[1]}
                          </p>
                        )}
                      </div>
                      {isSelected && <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================
// Section Divider
// ============================================
function SectionDivider() {
  return <div className="border-b border-slate-100 dark:border-slate-700/50 mx-0" />;
}

// ============================================
// Section Header
// ============================================
function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 tracking-tight mb-3 flex items-center gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center border border-amber-100/80 dark:border-amber-700/50">
        <Icon size={14} className="text-amber-600" />
      </div>
      {label}
    </h2>
  );
}

// ============================================
// Main Page Component
// ============================================
export default function KalkulasiPage({ agent, hideHeader = false, hideDiscount = false }: { agent?: AgentData | null; hideHeader?: boolean; hideDiscount?: boolean }) {
  // --- API Data ---
  const [packages, setPackages] = useState<UmrohPackage[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(true);
  const [isGoingBack, setIsGoingBack] = useState(false);

  // ── Dark Mode (synced with App via localStorage) ──
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = getLocalStorageItem('darkMode');
    return saved === 'true';
  });
  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) { root.classList.add('dark'); } else { root.classList.remove('dark'); }
    setLocalStorageItem('darkMode', isDarkMode.toString());
  }, [isDarkMode]);

  useEffect(() => {
    document.title = 'Kalkulasi Harga Paket';
  }, []);

  // Fetch packages from API (year 1448 only)
  const fetchPackages = useCallback(async () => {
    setLoadingPackages(true);
    const result = await getPackages({ yearCode: '1448' });
    if (result.success) {
      setPackages(result.packages);
    }
    setLoadingPackages(false);
  }, []);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  // Auto-select package from URL query param (?paket=<jadwalId>)
  useEffect(() => {
    if (loadingPackages || packages.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const paketId = params.get('paket');
    if (paketId) {
      const match = packages.find((p) => p.jadwalId === paketId);
      if (match) {
        setSelectedPackage(paketId);
      }
      // Clean up the URL param
      params.delete('paket');
      const cleanUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
      window.history.replaceState(null, '', cleanUrl);
    }
  }, [loadingPackages, packages]);

  // Build dropdown options from API data
  const packageOptions: SelectOption[] = useMemo(() => {
    return packages.map((pkg) => {
      const depDate = new Date(pkg.keberangkatan.tgl);
      const dateStr = depDate.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

      // Bendera & teks pencarian berlaku SEJADWAL, jadi gabungan semua tier:
      // paket yang hotel Cairo-nya cuma terdaftar di satu tier tetap harus
      // berbendera 🇪🇬 dan tetap ketemu saat agent mengetik nama hotel itu.
      // Nama hotel yang ditampilkan tetap per tier (lihat packageTiers.js).
      const cityHotels = packageCityHotels(pkg);

      // Determine country flags from hotel data
      const flags: string[] = ['🇸🇦']; // Saudi always present
      if (cityHotels.cairo_hotel) flags.push('🇪🇬');
      if (cityHotels.istanbul_hotel || cityHotels.bursa_hotel || cityHotels.cappadocia_hotel || cityHotels.ankara_hotel) {
        flags.push('🇹🇷');
      }

      // Determine color class from package name + tier keys
      const namaLower = pkg.nama.toLowerCase();
      const tierKeys = Object.keys(pkg.harga).map(k => k.toLowerCase()).join(' ');
      const combined = `${namaLower} ${tierKeys}`;
      const colorClass = combined.includes('promo') || combined.includes('hemat')
        ? (combined.includes('rahmah') ? 'green' : combined.includes('uhud') ? 'blue' : 'red')
        : combined.includes('rahmah')
        ? 'green'
        : combined.includes('uhud')
        ? 'blue'
        : '';

      // Build extra search text (hotels, airline, etc.)
      const searchParts: string[] = [pkg.maskapai];
      for (const key of ['mekkah_hotel', 'madinah_hotel', 'cairo_hotel', 'istanbul_hotel', 'bursa_hotel', 'cappadocia_hotel', 'ankara_hotel']) {
        if (cityHotels[key]) searchParts.push(cityHotels[key]);
      }

      return {
        id: pkg.jadwalId,
        label: `${dateStr} — ${pkg.nama}`,
        flags,
        colorClass,
        searchText: searchParts.join(' '),
      };
    });
  }, [packages]);

  // --- Form State ---
  const [namaLengkap, setNamaLengkap] = useState('');
  const [selectedPackage, setSelectedPackage] = useState('');
  const [selectedTier, setSelectedTier] = useState('');
  const [jamaah, setJamaah] = useState<JamaahCounts>({
    dewasa: 1,
    balitaKasur: 0,
    balitaTanpaKasur: 0,
    infant: 0,
  });
  const [rooms, setRooms] = useState<RoomCounts>({
    single: 0,
    double: 0,
    triple: 0,
    quad: 0,
  });
  const [isDiscountActive, setIsDiscountActive] = useState(false);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountType, setDiscountType] = useState<'per-pax' | 'flat'>('per-pax');
  const [isManualDiscount, setIsManualDiscount] = useState(false);
  const [discountLabel, setDiscountLabel] = useState('');
  const [catatan, setCatatan] = useState('');
  const [showResultModal, setShowResultModal] = useState(false);
  const [autoFillFlash, setAutoFillFlash] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfNumPages, setPdfNumPages] = useState<number | null>(null);
  const pdfBlobRef = useRef<Blob | null>(null);

  // Find the selected package object
  const selectedPkg = useMemo(() => {
    if (!selectedPackage) return null;
    return packages.find((p) => p.jadwalId === selectedPackage) || null;
  }, [packages, selectedPackage]);

  // Available pricing tiers for the selected package (e.g. UHUD, RAHMAH)
  const tierKeys = useMemo(() => {
    if (!selectedPkg) return [] as string[];
    return Object.keys(selectedPkg.harga);
  }, [selectedPkg]);

  // Reset selected tier when package changes — default ke tier TERMURAH, angka
  // "mulai dari" yang sama dipakai PackageCard, endpoint Brosur, dan Bandingkan
  // Paket. Urutan kunci dari hulu bukan urutan harga (JBU1500: UHUD dulu, HEMAT
  // yang termurah).
  useEffect(() => {
    if (tierKeys.length === 0) {
      setSelectedTier('');
      return;
    }
    if (!tierKeys.includes(selectedTier)) {
      setSelectedTier(cheapestPackageTier(selectedPkg));
    }
  }, [tierKeys, selectedTier, selectedPkg]);

  // Extract room prices from the active pricing tier
  const roomPrices = useMemo(() => {
    if (!selectedPkg) return ROOM_PRICES_FALLBACK;
    // Tier yang benar-benar ada di `harga` dipakai apa adanya — termasuk tier
    // yang semua kamarnya 'N/A' — supaya angka di layar selalu milik chip yang
    // ditekan agent. Yang jatuh ke termurah hanya state kosong/basi.
    const tierKey = selectedTier && selectedPkg.harga[selectedTier]
      ? selectedTier
      : cheapestPackageTier(selectedPkg);
    if (!selectedPkg.harga[tierKey]) return ROOM_PRICES_FALLBACK;
    return {
      quad: tierRoomPrice(selectedPkg, tierKey, 'Quard'),
      triple: tierRoomPrice(selectedPkg, tierKey, 'Triple'),
      double: tierRoomPrice(selectedPkg, tierKey, 'Double'),
      single: tierRoomPrice(selectedPkg, tierKey, 'Single'),
      infant: tierRoomPrice(selectedPkg, tierKey, 'Infant') || INFANT_PRICE,
    };
  }, [selectedPkg, selectedTier]);

  // Reset room counts for unavailable room types when package changes
  useEffect(() => {
    setRooms((prev) => ({
      quad: roomPrices.quad > 0 ? prev.quad : 0,
      triple: roomPrices.triple > 0 ? prev.triple : 0,
      double: roomPrices.double > 0 ? prev.double : 0,
      single: roomPrices.single > 0 ? prev.single : 0,
    }));
  }, [roomPrices]);

  // --- Summary Calculation ---
  const summary = useMemo(() => {
    const items: { label: string; qty: number; unitPrice: number; total: number; note?: string }[] = [];

    if (rooms.quad > 0 && roomPrices.quad > 0) {
      items.push({ label: 'Dewasa Quad Room', qty: rooms.quad, unitPrice: roomPrices.quad, total: rooms.quad * roomPrices.quad });
    }
    if (rooms.triple > 0 && roomPrices.triple > 0) {
      items.push({ label: 'Dewasa Triple Room', qty: rooms.triple, unitPrice: roomPrices.triple, total: rooms.triple * roomPrices.triple });
    }
    if (rooms.double > 0 && roomPrices.double > 0) {
      items.push({ label: 'Dewasa Double Room', qty: rooms.double, unitPrice: roomPrices.double, total: rooms.double * roomPrices.double });
    }
    if (rooms.single > 0 && roomPrices.single > 0) {
      items.push({ label: 'Dewasa Single Room', qty: rooms.single, unitPrice: roomPrices.single, total: rooms.single * roomPrices.single });
    }
    // Anak tanpa kasur: harga quad minus diskon (varies by package type)
    if (jamaah.balitaTanpaKasur > 0 && roomPrices.quad > 0) {
      const pkgName = selectedPkg?.nama?.toUpperCase() ?? '';
      const activeTier = selectedTier.toUpperCase();
      // Detect RAHMAH from the active tier first; fall back to nama for legacy single-tier packages
      const isRahmah = activeTier.includes('RAHMAH') || (!activeTier && pkgName.includes('RAHMAH'));
      const isPromo = selectedPkg?.isPromo ?? pkgName.includes('PROMO');
      const disc = isRahmah
        ? ANAK_TANPA_KASUR_DISC_RAHMAH
        : isPromo
          ? ANAK_TANPA_KASUR_DISC_PROMO
          : ANAK_TANPA_KASUR_DISC_NORMAL;
      const anakPrice = Math.max(0, roomPrices.quad - disc);
      items.push({ label: 'Anak (tanpa Kasur)', qty: jamaah.balitaTanpaKasur, unitPrice: anakPrice, total: jamaah.balitaTanpaKasur * anakPrice, note: `${formatRupiah(roomPrices.quad)} - ${formatRupiah(disc)}` });
    }
    if (jamaah.infant > 0) {
      const infantPrice = roomPrices.infant;
      items.push({ label: 'Infant (0-23 bln)', qty: jamaah.infant, unitPrice: infantPrice, total: jamaah.infant * infantPrice });
    }

    const subtotal = items.reduce((sum, i) => sum + i.total, 0);
    const totalJamaah = jamaah.dewasa + jamaah.balitaKasur + jamaah.balitaTanpaKasur; // Infant excluded from discount
    const discount = isDiscountActive
      ? (discountType === 'per-pax' ? discountAmount * totalJamaah : discountAmount)
      : 0;
    const grandTotal = Math.max(0, subtotal - discount);

    return { items, subtotal, discount, grandTotal };
  }, [rooms, jamaah, isDiscountActive, discountAmount, discountType, roomPrices, selectedPkg, selectedTier]);

  // --- Room / Jamaah balance validation ---
  // Anak dengan kasur = counted as dewasa (needs bed)
  // Anak tanpa kasur = shares bed, NOT counted
  const totalJamaahNeedRoom = jamaah.dewasa + jamaah.balitaKasur;
  const totalRoomPax = rooms.quad + rooms.triple + rooms.double + rooms.single;
  const roomDiff = totalJamaahNeedRoom - totalRoomPax; // positive = need more rooms
  const roomBalanced = totalJamaahNeedRoom > 0 && roomDiff === 0;

  const hasSelection = summary.items.length > 0 && roomBalanced;

  // --- Smart Room Suggestion ---
  const handleAutoCalculateRooms = useCallback(() => {
    const total = totalJamaahNeedRoom;
    if (total <= 0) return;

    const quadRooms = Math.floor(total / 4);
    const remainder = total % 4;

    // Avoid single rooms — remainder 1 goes into quad
    setRooms({
      quad: remainder === 1 ? (quadRooms * 4) + 1 : quadRooms * 4,
      triple: remainder === 3 ? 3 : 0,
      double: remainder === 2 ? 2 : 0,
      single: 0,
    });

    // Visual feedback
    setAutoFillFlash(true);
    setTimeout(() => setAutoFillFlash(false), 1200);
  }, [totalJamaahNeedRoom]);

  // --- PDF Quotation Generator (React-PDF) ---
  const [pdfLoading, setPdfLoading] = useState(false);
  const handleDownloadPDF = useCallback(async () => {
    setPdfLoading(true);
    try {
      const blob = await generateQuotationPdfBlob({
        pkg: selectedPkg,
        tier: selectedTier,
        summary,
        namaLengkap,
        agent,
        discountLabel,
      });
      pdfBlobRef.current = blob;
      const url = URL.createObjectURL(blob);
      setPdfNumPages(null);
      setPdfPreviewUrl(url);
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setPdfLoading(false);
    }
  }, [summary, selectedPkg, selectedTier, namaLengkap, agent, discountLabel]);

  // ============================================
  // Render
  // ============================================
  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 transition-colors duration-300">

      {/* ══════════════════════════════ */}
      {/* STICKY HEADER                 */}
      {/* ══════════════════════════════ */}
      {!hideHeader && (
      <div className="sticky top-0 z-30 backdrop-blur-md bg-white/90 dark:bg-slate-900/90 border-b border-slate-100 dark:border-slate-700/50">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center gap-3">
          <button
            type="button"
            disabled={isGoingBack}
            onClick={() => {
              setIsGoingBack(true);
              document.body.classList.add('navigating');
              const seg = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean)[0];
              const expandParam = selectedPackage ? `&expand=${encodeURIComponent(selectedPackage)}` : '';
              setTimeout(() => {
                window.location.href = seg ? `/${seg}?transition=1${expandParam}` : `/?transition=1${expandParam}`;
              }, 280);
            }}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100/80 dark:bg-slate-800/80 hover:bg-emerald-50 dark:hover:bg-slate-700/80 text-slate-500 dark:text-slate-400 hover:text-emerald-600 transition-all duration-300 active:scale-95"
            title="Kembali"
          >
            {isGoingBack ? <Loader2 size={18} className="animate-spin" /> : <ArrowLeft size={18} />}
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Kalkulasi Harga Paket
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setIsDarkMode(prev => !prev)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 text-slate-500 dark:text-slate-300 transition-all duration-200 active:scale-95"
            aria-label="Toggle Dark Mode"
          >
            {isDarkMode ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>
      </div>
      )}

      {/* ══════════════════════════════ */}
      {/* MAIN CONTENT                  */}
      {/* ══════════════════════════════ */}
      <div className="max-w-3xl mx-auto px-4 pb-10">

          {/* ══════════════════════════════ */}
          {/* SECTION: Pilih Paket          */}
          {/* ══════════════════════════════ */}
          <div className="py-6">
            <SectionHeader icon={Plane} label="Jadwal & Paket" />
            <SearchableSelect
              options={packageOptions}
              value={selectedPackage}
              onChange={setSelectedPackage}
              placeholder="Cari dan pilih paket..."
              loading={loadingPackages}
            />
          </div>

          <AnimatePresence>
          {selectedPkg && (
            <>
            {/* ══════════════════════════════ */}
            {/* SECTION: Tipe Paket (Tier)    */}
            {/* ══════════════════════════════ */}
            {tierKeys.length > 1 && (
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 24 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0 }}
              >
                <SectionDivider />
                <div className="py-6">
                  <SectionHeader icon={Tag} label="Tipe Paket" />
                  <div className="grid grid-cols-2 gap-2">
                    {tierKeys.map((tierKey) => {
                      const isSelected = selectedTier === tierKey;
                      const tierHotel = tierHotelInfo(selectedPkg, tierKey);
                      const mekkahStar = tierHotel?.mekkah_bintang ? parseInt(tierHotel.mekkah_bintang, 10) : 0;
                      const madinahStar = tierHotel?.madinah_bintang ? parseInt(tierHotel.madinah_bintang, 10) : 0;
                      const startingFrom = tierStartingPrice(selectedPkg, tierKey);
                      return (
                        <button
                          key={tierKey}
                          type="button"
                          onClick={() => setSelectedTier(tierKey)}
                          className={`relative text-left rounded-2xl border-2 p-3.5 transition-all duration-300 active:scale-[0.98] ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-900/25 shadow-sm'
                              : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-emerald-300 dark:hover:border-emerald-500'
                          }`}
                        >
                          {isSelected && (
                            <CheckCircle2 size={16} className="absolute top-2.5 right-2.5 text-emerald-600" />
                          )}
                          <p className={`text-sm font-bold tracking-tight ${
                            isSelected ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100'
                          }`}>
                            {tierKey}
                          </p>
                          {(mekkahStar > 0 || madinahStar > 0) && (
                            <div className="mt-2 space-y-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                              {mekkahStar > 0 && (
                                <div className="flex items-center justify-between gap-2">
                                  <span>Mekkah</span>
                                  <span className="flex tracking-tight">
                                    {Array.from({ length: mekkahStar }).map((_, i) => (
                                      <span key={i} className="text-amber-400 leading-none">★</span>
                                    ))}
                                  </span>
                                </div>
                              )}
                              {madinahStar > 0 && (
                                <div className="flex items-center justify-between gap-2">
                                  <span>Madinah</span>
                                  <span className="flex tracking-tight">
                                    {Array.from({ length: madinahStar }).map((_, i) => (
                                      <span key={i} className="text-amber-400 leading-none">★</span>
                                    ))}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                          {startingFrom > 0 && (
                            <div className={`mt-2 pt-2 border-t border-dashed ${
                              isSelected ? 'border-emerald-200 dark:border-emerald-800/50' : 'border-slate-200 dark:border-slate-700'
                            }`}>
                              <p className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">Mulai dari</p>
                              <p className={`text-[12px] font-bold tabular-nums leading-tight ${
                                isSelected ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'
                              }`}>
                                {formatRupiah(startingFrom)}
                              </p>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ══════════════════════════════ */}
            {/* SECTION: Komposisi Jamaah     */}
            {/* ══════════════════════════════ */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0 }}
            >
          <SectionDivider />
          <div className="py-6">
            <SectionHeader icon={Users} label="Komposisi Jamaah" />
            <div className="space-y-0">
              {/* Dewasa */}
              <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-700/60 flex items-center justify-center">
                    <User size={15} className="text-slate-600 dark:text-slate-300" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Dewasa</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-300">12 tahun ke atas</p>
                  </div>
                </div>
                <Counter
                  value={jamaah.dewasa}
                  onChange={(v) => setJamaah((s) => ({ ...s, dewasa: v }))}
                  min={1}
                />
              </div>
              {/* Anak + Kasur */}
              <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-700/50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-pink-50 dark:bg-pink-500/15 flex items-center justify-center">
                    <Baby size={15} className="text-pink-500 dark:text-pink-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Anak + Kasur</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-300">2 – 5 tahun, dengan kasur</p>
                  </div>
                </div>
                <Counter
                  value={jamaah.balitaKasur}
                  onChange={(v) => setJamaah((s) => ({ ...s, balitaKasur: v }))}
                />
              </div>
              {/* Anak tanpa Kasur */}
              <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-700/50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-violet-50 dark:bg-violet-500/15 flex items-center justify-center">
                    <Baby size={15} className="text-violet-500 dark:text-violet-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Anak tanpa Kasur</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-300">2 – 5 tahun, tanpa kasur</p>
                  </div>
                </div>
                <Counter
                  value={jamaah.balitaTanpaKasur}
                  onChange={(v) => setJamaah((s) => ({ ...s, balitaTanpaKasur: v }))}
                />
              </div>
              {/* Infant */}
              <div className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-sky-50 dark:bg-sky-500/15 flex items-center justify-center">
                    <Baby size={15} className="text-sky-500 dark:text-sky-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Infant</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-300">0 – 23 bulan</p>
                  </div>
                </div>
                <Counter
                  value={jamaah.infant}
                  onChange={(v) => setJamaah((s) => ({ ...s, infant: v }))}
                />
              </div>
            </div>
          </div>
            </motion.div>

            {/* ══════════════════════════════ */}
            {/* SECTION: Pilihan Kamar        */}
            {/* ══════════════════════════════ */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            >
          <SectionDivider />
          <div className="py-6">
            <div className="flex items-start justify-between">
              <SectionHeader icon={BedDouble} label="Pilihan Kamar" />
              {totalJamaahNeedRoom > 0 && selectedPkg && (
                <button
                  type="button"
                  onClick={handleAutoCalculateRooms}
                  className="group relative flex items-center gap-1.5 text-[11px] font-bold px-4 py-2 rounded-full transition-all duration-300 cursor-pointer active:scale-95 overflow-hidden"
                  style={{
                    border: '1.5px solid transparent',
                    backgroundImage: `linear-gradient(${isDarkMode ? '#1e293b' : 'white'}, ${isDarkMode ? '#1e293b' : 'white'}), linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)`,
                    backgroundOrigin: 'border-box',
                    backgroundClip: 'padding-box, border-box',
                  }}
                >
                  <span className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-indigo-400/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  <Sparkles size={13} className="relative z-10 text-indigo-500 dark:text-indigo-400" />
                  <span className="relative z-10 bg-gradient-to-r from-indigo-500 to-purple-500 dark:from-indigo-400 dark:to-purple-400 bg-clip-text text-transparent">Atur Otomatis</span>
                </button>
              )}
            </div>
            <div className="space-y-0">
              {([
                { key: 'quad' as const, label: 'Quad', desc: '4 orang / kamar', beds: 4, color: 'bg-emerald-50 text-emerald-500' },
                { key: 'triple' as const, label: 'Triple', desc: '3 orang / kamar', beds: 3, color: 'bg-amber-50 text-amber-500' },
                { key: 'double' as const, label: 'Double', desc: '2 orang / kamar', beds: 2, color: 'bg-sky-50 text-sky-500' },
                { key: 'single' as const, label: 'Single', desc: '1 orang / kamar', beds: 1, color: 'bg-violet-50 text-violet-500' },
              ]).filter((room) => !selectedPkg || roomPrices[room.key] > 0).map((room, idx, arr) => {
                const isSelected = rooms[room.key] > 0;
                const price = roomPrices[room.key];
                const isLast = idx === arr.length - 1;
                return (
                  <div
                    key={room.key}
                    className={`flex items-center justify-between py-3 transition-all duration-300 ${!isLast ? 'border-b border-slate-100 dark:border-slate-700/50' : ''} ${isSelected ? 'bg-emerald-50/40 dark:bg-emerald-900/20 -mx-5 px-5 rounded-lg' : ''} ${autoFillFlash && isSelected ? 'animate-pulse' : ''}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${room.color}`}>
                        <BedDouble size={15} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{room.label}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] text-slate-400 dark:text-slate-300">{room.desc}</p>
                          {selectedPkg && price > 0 && (
                            <span className="text-[10px] font-semibold text-emerald-600 tabular-nums">
                              {formatRupiah(price)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Counter
                      value={rooms[room.key]}
                      onChange={(v) => setRooms((s) => ({ ...s, [room.key]: v }))}
                    />
                  </div>
                );
              })}
            </div>

            {/* Room balance indicator */}
            {totalJamaahNeedRoom > 0 && (
              <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-300 ${
                roomBalanced
                  ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
              }`}>
                {roomBalanced ? (
                  <><CheckCircle2 size={14} /> Kamar sesuai — {totalRoomPax} bed</>
                ) : roomDiff > 0 ? (
                  <><AlertCircle size={14} /> Kurang {roomDiff} bed — butuh {totalJamaahNeedRoom}, sudah {totalRoomPax}</>
                ) : (
                  <><AlertCircle size={14} /> Kelebihan {Math.abs(roomDiff)} bed — butuh {totalJamaahNeedRoom}, sudah {totalRoomPax}</>
                )}
              </div>
            )}
          </div>
            </motion.div>

            {/* ══════════════════════════════ */}
            {/* SECTION: Diskon & Catatan     */}
            {/* ══════════════════════════════ */}
            {!hideDiscount && (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
            >
          <SectionDivider />
          <div className="py-6">
            <SectionHeader icon={Tag} label="Diskon" />
            <div className="space-y-4">
              {/* Toggle Diskon */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Aktifkan Diskon
                </label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isDiscountActive}
                  onClick={() => setIsDiscountActive(!isDiscountActive)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                    isDiscountActive ? 'bg-emerald-600' : 'bg-slate-200 dark:bg-slate-600'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-300 ease-in-out ${
                      isDiscountActive ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {isDiscountActive && (
                <div className="space-y-4">
                  {/* Discount Type Selector */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 ml-0.5">
                      Jenis Diskon
                    </label>
                    <div className="flex rounded-xl border border-slate-200 dark:border-slate-600 overflow-hidden">
                      {([
                        { value: 'per-pax' as const, label: 'Setiap Jamaah' },
                        { value: 'flat' as const, label: 'Sebagian Jamaah' },
                      ]).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setDiscountType(opt.value)}
                          className={`flex-1 py-2.5 text-xs font-semibold transition-all duration-300 ${
                            discountType === opt.value
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 ml-0.5">
                      {discountType === 'per-pax'
                        ? 'Diskon dikalikan jumlah seluruh jamaah'
                        : 'Diskon berlaku sebagai potongan langsung'}
                    </p>
                  </div>

                  {/* Discount Amount */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 ml-0.5">
                      Nominal Diskon{discountType === 'per-pax' ? ' per Jamaah' : ''} (Rp)
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {([300_000, 500_000, 800_000] as const).map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => { setDiscountAmount(preset); setIsManualDiscount(false); }}
                          className={`py-2.5 rounded-xl text-xs font-semibold text-center transition-all duration-300 ${
                            !isManualDiscount && discountAmount === preset
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                          }`}
                        >
                          {formatRupiah(preset)}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => { setIsManualDiscount(true); setDiscountAmount(0); }}
                        className={`py-2.5 rounded-xl text-xs font-semibold text-center transition-all duration-300 ${
                          isManualDiscount
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        Input Manual
                      </button>
                    </div>
                    {isManualDiscount && (
                      <div className="mt-2 flex items-center rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 overflow-hidden transition-all duration-300 focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-400">
                        <span className="pl-4 pr-2 text-sm font-semibold text-slate-400 select-none">Rp</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={discountAmount ? discountAmount.toLocaleString('id-ID') : ''}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, '');
                            setDiscountAmount(Math.min(parseInt(raw) || 0, 19_999_999));
                          }}
                          placeholder="Masukkan nominal"
                          className="flex-1 py-3.5 pr-4 bg-transparent text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none tabular-nums"
                        />
                      </div>
                    )}
                  </div>

                  {/* Discount Label / Keterangan */}
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 ml-0.5">
                      Keterangan <span className="text-slate-400 font-normal">(opsional)</span>
                    </label>
                    <input
                      type="text"
                      value={discountLabel}
                      onChange={(e) => setDiscountLabel(e.target.value)}
                      placeholder="Potongan Diskon"
                      className="w-full py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all duration-300"
                    />
                  </div>
                </div>
              )}

            </div>
          </div>
            </motion.div>
            )}
            </>
          )}
          </AnimatePresence>

          <SectionDivider />

          {/* ══════════════════════════════ */}
          {/* SECTION: Rincian Biaya        */}
          {/* ══════════════════════════════ */}
          <div className="py-8">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 tracking-tight mb-4 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center border border-amber-100/80 dark:border-amber-700/50">
                <FileText size={14} className="text-amber-600" />
              </div>
              Rincian Biaya
            </h2>

            {/* Line items */}
            {summary.items.length === 0 ? (
              <div className="text-center py-6">
                <div className="w-11 h-11 mx-auto rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center mb-2">
                  <FileText size={18} className="text-slate-300" />
                </div>
                <p className="text-xs text-slate-400">
                  Pilih kamar untuk melihat ringkasan.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2.5 mb-4">
                  {summary.items.map((item, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">
                          {item.qty}× {item.label}
                        </span>
                        <span className="text-slate-800 dark:text-slate-100 font-medium tabular-nums">
                          {formatRupiah(item.total)}
                        </span>
                      </div>
                      {item.note && (
                        <p className="text-[10px] text-slate-400 ml-6 mt-0.5 tabular-nums">
                          {item.note}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                <div className="border-t border-dashed border-slate-200 dark:border-slate-600 my-4" />

                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
                    <span className="text-slate-700 dark:text-slate-200 font-medium tabular-nums">
                      {formatRupiah(summary.subtotal)}
                    </span>
                  </div>
                  {summary.discount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-emerald-500">{discountLabel || 'Potongan Diskon'}</span>
                      <span className="text-emerald-500 font-medium tabular-nums">
                        - {formatRupiah(summary.discount)}
                      </span>
                    </div>
                  )}
                </div>
                {/* Grand Total */}
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Grand Total</span>
                    <span className="text-3xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums tracking-tight">
                      {formatRupiah(summary.grandTotal)}
                    </span>
                  </div>
                </div>
              </>
            )}
            {/* Action Button */}
            <div className="mt-6">
              <button
                type="button"
                onClick={() => setShowResultModal(true)}
                disabled={!hasSelection}
                className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-emerald-700 shadow-lg shadow-emerald-600/25 transition-all duration-200 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CheckCircle2 size={16} />
                Kalkulasi
              </button>
            </div>
          </div>

      </div>
      {/* End of main content */}

      {/* Result Modal */}
      <KalkulasiResultModal
        isOpen={showResultModal}
        onClose={() => setShowResultModal(false)}
        pkg={selectedPkg}
        tier={selectedTier}
        summary={summary}
        catatan={catatan}
        namaLengkap={namaLengkap}
        discountLabel={discountLabel}
        onGeneratePDF={handleDownloadPDF}
        pdfBlobRef={pdfBlobRef}
        pdfPreviewUrl={pdfPreviewUrl}
        pdfLoading={pdfLoading}
        pdfNumPages={pdfNumPages}
        setPdfNumPages={setPdfNumPages}
        pdfEnabled={true}
      />

    </div>
  );
}

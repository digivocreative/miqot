import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { trackEvent } from '../utils/analytics';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Document as PdfDoc, Page as PdfPage, pdfjs } from 'react-pdf';
import type { AgentData } from '@/data/agents';
import {
  ArrowLeft,
  Search,
  ChevronDown,
  Loader2,
  Plane,
  Sun,
  Moon,
  FileText,
  AlertCircle,
  ArrowLeftRight,
  CheckCircle2,
  Download,
  X,
  Share2,
} from 'lucide-react';
import { getPackages } from '@/services';
import type { UmrohPackage } from '@/types';
import {
  listPackageTiers,
  cheapestPackageTier,
  resolvePackageTier,
  tierHotelInfo,
  tierStartingPrice,
  packageCityHotels,
} from '@/lib/packageTiers';
import { hotelStars } from '@/utils/hotelDisplay';
import { canShareFiles, downloadBlob, isTouchPrimary } from '../utils/share';
import { generateComparePdfBlob } from './CompareDocument';

// Worker pdf.js untuk pratinjau. Halaman ini bisa dibuka tanpa pernah menyentuh
// modal Kalkulasi, jadi worker-nya diatur di sini juga — jangan mengandalkan
// KalkulasiResultModal kebetulan sudah dimuat.
try {
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
} catch {
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
}

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
    // unavailable storage should not block compare page rendering
  }
}

// ============================================
// Types
// ============================================
interface SelectOption {
  id: string;
  label: string;
  flags?: string[];
  colorClass?: string;
  searchText?: string;
}

// ============================================
// Helper: Format Rupiah
// ============================================
function formatRupiah(value: number): string {
  return 'Rp ' + value.toLocaleString('id-ID');
}

// ============================================
// Searchable Select (adapted from KalkulasiPage)
// ============================================
function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  loading,
  label,
}: {
  options: SelectOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  loading?: boolean;
  label: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = options.filter((o) => {
    const q = search.toLowerCase();
    return o.label.toLowerCase().includes(q) || (o.searchText && o.searchText.toLowerCase().includes(q));
  });

  const selectedLabel = options.find((o) => o.id === value)?.label || '';
  const parsed = selectedLabel
    ? (() => {
        const parts = selectedLabel.split(' — ');
        return { date: parts[0] || '', name: parts[1] || '' };
      })()
    : null;

  return (
    <div className="relative">
      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">{label}</p>
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
                <div className="px-4 py-6 text-center text-sm text-slate-400">Tidak ditemukan</div>
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
                        isSelected
                          ? 'bg-emerald-50 dark:bg-emerald-900/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${isSelected ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100'}`}>
                          {parts[0]}
                        </p>
                        {parts[1] && (
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">{parts[1]}</p>
                        )}
                      </div>
                      {opt.flags && (
                        <div className="flex gap-0.5 text-sm shrink-0">{opt.flags.map((f, i) => <span key={i}>{f}</span>)}</div>
                      )}
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
// Tier Picker (adapted from KalkulasiPage "Tipe Paket")
// ============================================
function TierPicker({
  pkg,
  value,
  onChange,
}: {
  pkg: UmrohPackage | null;
  value: string;
  onChange: (tier: string) => void;
}) {
  const tiers = pkg ? listPackageTiers(pkg) : [];
  // Satu tier berarti tak ada yang bisa dipilih; namanya tetap terbaca sebagai
  // lencana di modal dan di gambar unduhan.
  if (!pkg || tiers.length <= 1) return null;

  return (
    <div className="mt-3">
      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Tipe Paket</p>
      <div className="grid grid-cols-2 gap-2">
        {tiers.map((tier) => {
          const hotel = tierHotelInfo(pkg, tier);
          const mekkahStar = hotel?.mekkah_hotel ? hotelStars(hotel.mekkah_hotel, hotel.mekkah_bintang) : 0;
          const madinahStar = hotel?.madinah_hotel ? hotelStars(hotel.madinah_hotel, hotel.madinah_bintang) : 0;
          const startingFrom = tierStartingPrice(pkg, tier);
          const isSelected = value === tier;
          return (
            <button
              key={tier}
              type="button"
              onClick={() => onChange(tier)}
              className={`relative text-left rounded-2xl border-2 p-3 transition-all duration-300 active:scale-[0.98] ${
                isSelected
                  ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-900/25 shadow-sm'
                  : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-emerald-300 dark:hover:border-emerald-500'
              }`}
            >
              {isSelected && <CheckCircle2 size={15} className="absolute top-2.5 right-2.5 text-emerald-600" />}
              <p className={`text-sm font-bold tracking-tight ${
                isSelected ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100'
              }`}>
                {tier}
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
  );
}

// ============================================
// Main Page Component
// ============================================
export default function ComparePage({ agent, agentSlug, hideHeader = false }: {
  agent?: AgentData | null;
  /** Slug agent untuk membangun tautan itinerary di QR. Tanpa ini, QR dilewati. */
  agentSlug?: string;
  hideHeader?: boolean;
}) {
  const [packages, setPackages] = useState<UmrohPackage[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(true);
  const [isGoingBack, setIsGoingBack] = useState(false);
  const [paketA, setPaketA] = useState('');
  const [paketB, setPaketB] = useState('');
  const [tierA, setTierA] = useState('');
  const [tierB, setTierB] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfNumPages, setPdfNumPages] = useState<number | null>(null);
  const [pdfPageWidth, setPdfPageWidth] = useState(0);
  const [pdfSharing, setPdfSharing] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const pdfBlobRef = useRef<Blob | null>(null);
  const pdfContentRef = useRef<HTMLDivElement>(null);
  const mountTracked = useRef(false);
  useEffect(() => { if (!mountTracked.current) { trackEvent('feature', 'open_compare'); mountTracked.current = true; } }, []);

  // ── Dark Mode ──
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return getLocalStorageItem('darkMode') === 'true';
  });
  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) root.classList.add('dark'); else root.classList.remove('dark');
    setLocalStorageItem('darkMode', isDarkMode.toString());
  }, [isDarkMode]);

  useEffect(() => { document.title = 'Bandingkan Paket'; }, []);

  // ── Fetch Packages ──
  const fetchPackages = useCallback(async () => {
    setLoadingPackages(true);
    const result = await getPackages({ yearCode: '1448' });
    if (result.success) setPackages(result.packages);
    setLoadingPackages(false);
  }, []);
  useEffect(() => { fetchPackages(); }, [fetchPackages]);

  // ── Auto-select from URL ──
  useEffect(() => {
    if (loadingPackages || packages.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const a = params.get('paketA');
    const b = params.get('paketB');
    // Tier ikut di tautan share; yang tak dikenal atau tak ada jatuh ke termurah,
    // jadi tautan lama tanpa tierA/tierB tetap membuka paket yang benar.
    const pkgFromA = a ? packages.find(p => p.jadwalId === a) : undefined;
    const pkgFromB = b ? packages.find(p => p.jadwalId === b) : undefined;
    if (pkgFromA) { setPaketA(a as string); setTierA(resolvePackageTier(pkgFromA, params.get('tierA'))); }
    if (pkgFromB) { setPaketB(b as string); setTierB(resolvePackageTier(pkgFromB, params.get('tierB'))); }
    if (a || b) {
      params.delete('paketA');
      params.delete('paketB');
      params.delete('tierA');
      params.delete('tierB');
      const cleanUrl = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname;
      window.history.replaceState(null, '', cleanUrl);
    }
  }, [loadingPackages, packages]);

  // ── Build options ──
  const packageOptions: SelectOption[] = useMemo(() => {
    return packages.map((pkg) => {
      const depDate = new Date(pkg.keberangkatan.tgl);
      const dateStr = depDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      // Bendera & teks pencarian memakai gabungan semua tier: negara tujuan itu
      // urusan jadwal, dan paket yang hotel Cairo-nya cuma ada di satu tier tetap
      // harus ketemu saat agent mengetik nama hotel itu.
      const cities = packageCityHotels(pkg);
      const flags: string[] = ['🇸🇦'];
      if (cities.cairo_hotel) flags.push('🇪🇬');
      if (cities.istanbul_hotel || cities.bursa_hotel || cities.cappadocia_hotel || cities.ankara_hotel) flags.push('🇹🇷');
      const searchParts: string[] = [pkg.maskapai, ...listPackageTiers(pkg)];
      ['mekkah_hotel', 'madinah_hotel', 'cairo_hotel', 'istanbul_hotel'].forEach(k => { if (cities[k]) searchParts.push(cities[k]); });
      return { id: pkg.jadwalId, label: `${dateStr} — ${pkg.nama}`, flags, searchText: searchParts.join(' ') };
    });
  }, [packages]);

  const pkgA = useMemo(() => packages.find(p => p.jadwalId === paketA) || null, [packages, paketA]);
  const pkgB = useMemo(() => packages.find(p => p.jadwalId === paketB) || null, [packages, paketB]);

  // Satu pilihan = paket + tier. resolvePackageTier jadi jaring pengaman: nilai
  // basi atau tier yang tak dijual paket ini selalu jatuh ke yang termurah.
  const activeTierA = useMemo(() => (pkgA ? resolvePackageTier(pkgA, tierA) : ''), [pkgA, tierA]);
  const activeTierB = useMemo(() => (pkgB ? resolvePackageTier(pkgB, tierB) : ''), [pkgB, tierB]);

  // Ganti paket berarti tiernya balik ke termurah milik paket baru. Dikerjakan di
  // handler, bukan effect, supaya tidak balapan dengan pemulihan tier dari URL.
  const selectPaket = (
    id: string,
    setPaket: (v: string) => void,
    setTier: (v: string) => void,
  ) => {
    setPaket(id);
    const pkg = packages.find(p => p.jadwalId === id) || null;
    setTier(pkg ? cheapestPackageTier(pkg) : '');
  };

  // Jadwal yang sama dengan tier berbeda justru perbandingan yang paling sering
  // ditanya jamaah — pesawat & tanggal sama, hotelnya beda berapa.
  const sameSelection = Boolean(paketA) && paketA === paketB && activeTierA === activeTierB;

  // Tautan itinerary web yang sudah live; QR dilewati kalau paketnya belum punya
  // itinerary atau slug agent tak diketahui — halaman kosong lebih buruk daripada
  // tanpa QR sama sekali.
  const itineraryUrlFor = useCallback((pkg: UmrohPackage | null) => {
    if (!pkg || !agentSlug || !pkg.itineraryUrl) return undefined;
    return `${window.location.origin}/${agentSlug}/${pkg.jadwalId}/itinerary`;
  }, [agentSlug]);

  const releasePdf = useCallback(() => {
    setPdfUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    pdfBlobRef.current = null;
    setPdfNumPages(null);
    setPdfError(false);
  }, []);

  const handleCompare = useCallback(async () => {
    if (!pkgA || !pkgB || sameSelection || comparing) return;
    setComparing(true);
    setPdfError(false);
    setShowModal(true);
    setPdfLoading(true);
    trackEvent('action', 'generate_pdf', { paket: `${pkgA.jadwalId} vs ${pkgB.jadwalId}` });
    try {
      const blob = await generateComparePdfBlob({
        a: { pkg: pkgA, tier: activeTierA, itineraryUrl: itineraryUrlFor(pkgA) },
        b: { pkg: pkgB, tier: activeTierB, itineraryUrl: itineraryUrlFor(pkgB) },
        agent,
      });
      pdfBlobRef.current = blob;
      setPdfNumPages(null);
      setPdfUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
    } catch (err) {
      console.error('Gagal membuat PDF perbandingan:', err);
      setPdfError(true);
    } finally {
      setPdfLoading(false);
      setComparing(false);
    }
  }, [pkgA, pkgB, activeTierA, activeTierB, sameSelection, comparing, agent, itineraryUrlFor]);

  // Pilihan berubah berarti PDF lama sudah tidak mewakili apa pun.
  useEffect(() => {
    setShowModal(false);
    releasePdf();
  }, [paketA, paketB, tierA, tierB, releasePdf]);

  // Lebar halaman untuk viewer react-pdf, sama seperti modal Kalkulasi.
  useEffect(() => {
    const el = pdfContentRef.current;
    if (!el || !showModal) return;
    const measure = () => setPdfPageWidth(Math.max(el.clientWidth - 32, 280));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showModal, pdfUrl]);

  useEffect(() => () => { if (pdfBlobRef.current) pdfBlobRef.current = null; }, []);

  const handleSharePdf = useCallback(async () => {
    if (!pdfBlobRef.current || !pkgA || !pkgB) return;
    setPdfSharing(true);
    try {
      const fileName = `PERBANDINGAN_${pkgA.jadwalId}_vs_${pkgB.jadwalId}.pdf`;
      const file = new File([pdfBlobRef.current], fileName, { type: 'application/pdf' });
      if (canShareFiles([file])) {
        try {
          await navigator.share({
            title: 'Perbandingan Paket Umroh',
            text: `Perbandingan ${pkgA.nama} dengan ${pkgB.nama}`,
            files: [file],
          });
        } catch (err) {
          if ((err as { name?: string })?.name !== 'AbortError') {
            downloadBlob(pdfBlobRef.current, fileName);
          }
        }
      } else {
        downloadBlob(pdfBlobRef.current, fileName);
      }
    } catch (err) {
      console.error('Gagal membagikan PDF:', err);
    } finally {
      setPdfSharing(false);
    }
  }, [pkgA, pkgB]);

  const shareLabel = isTouchPrimary() && typeof navigator !== 'undefined' && typeof navigator.share === 'function';


  // ============================================
  // Render
  // ============================================
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 transition-colors duration-300">
      {/* ── STICKY HEADER ── */}
      {!hideHeader && (
      <div className="sticky top-0 z-30 backdrop-blur-md bg-white/90 dark:bg-slate-900/90 border-b border-slate-100 dark:border-slate-700/50 shadow-sm">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center gap-3">
          <button
            type="button"
            disabled={isGoingBack}
            onClick={() => {
              setIsGoingBack(true);
              document.body.classList.add('navigating');
              const seg = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean)[0];
              setTimeout(() => {
                window.location.href = seg ? `/${seg}?transition=1` : `/?transition=1`;
              }, 280);
            }}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100/80 dark:bg-slate-800/80 hover:bg-emerald-50 dark:hover:bg-slate-700/80 text-slate-500 dark:text-slate-400 hover:text-emerald-600 transition-all duration-300 active:scale-95"
            title="Kembali"
          >
            {isGoingBack ? <Loader2 size={18} className="animate-spin" /> : <ArrowLeft size={18} />}
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Bandingkan Paket
            </h1>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Pilih 2 paket untuk dibandingkan</p>
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

      {/* ── MAIN CONTENT ── */}
      <div className="max-w-3xl mx-auto px-4 pb-10">
        {/* Package Selectors Card */}
        <div className="mt-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-5">
          <SearchableSelect
            options={packageOptions}
            value={paketA}
            onChange={(id) => selectPaket(id, setPaketA, setTierA)}
            placeholder="Pilih Paket A..."
            loading={loadingPackages}
            label="Paket A"
          />
          <TierPicker pkg={pkgA} value={activeTierA} onChange={setTierA} />

          {/* VS Divider */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-600 to-transparent" />
            <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-900/30 border-2 border-emerald-200 dark:border-emerald-700 flex items-center justify-center">
              <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">VS</span>
            </div>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-600 to-transparent" />
          </div>

          <SearchableSelect
            options={packageOptions}
            value={paketB}
            onChange={(id) => selectPaket(id, setPaketB, setTierB)}
            placeholder="Pilih Paket B..."
            loading={loadingPackages}
            label="Paket B"
          />
          <TierPicker pkg={pkgB} value={activeTierB} onChange={setTierB} />

          {/* Compare Button */}
          <button
            type="button"
            onClick={handleCompare}
            disabled={!paketA || !paketB || sameSelection || comparing}
            className="w-full mt-5 flex items-center justify-center gap-2.5 py-4 rounded-2xl font-bold text-white text-base bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/20 transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {comparing ? (
              <><Loader2 size={20} className="animate-spin" /> Membandingkan...</>
            ) : (
              <><ArrowLeftRight size={20} /> Bandingkan</>
            )}
          </button>
          {sameSelection && (
            <p className="text-xs text-center text-red-500 mt-2">
              {listPackageTiers(pkgA).length > 1
                ? 'Pilih tipe paket yang berbeda, atau paket lain'
                : 'Pilih 2 paket yang berbeda'}
            </p>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════ */}
      {/* FULL-SCREEN COMPARISON MODAL              */}
      {/* ══════════════════════════════════════════ */}
      {createPortal(
        <AnimatePresence>
          {showModal && pkgA && pkgB && (
            <motion.div
              className="fixed inset-0 z-[9999] bg-white dark:bg-slate-900 flex flex-col"
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            >
              {/* ── Kepala Modal ── */}
              <div className="flex-none flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-700/50">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                  <FileText size={17} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight">Perbandingan Paket</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                    {pkgA.nama} {activeTierA ? `(${activeTierA})` : ''} vs {pkgB.nama} {activeTierB ? `(${activeTierB})` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100/80 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 transition-all duration-200 active:scale-95 shrink-0"
                  aria-label="Tutup"
                >
                  <X size={17} />
                </button>
              </div>

              {/* ── Pratinjau PDF ── */}
              <div ref={pdfContentRef} className="flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-gray-100 to-gray-200/60 dark:from-slate-950 dark:to-slate-900 px-4 py-4">
                {pdfLoading ? (
                  <div className="flex flex-col items-center gap-4 py-24">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full border-4 border-emerald-100 dark:border-emerald-900/40 border-t-emerald-500 animate-spin" />
                      <FileText className="absolute inset-0 m-auto w-6 h-6 text-emerald-600" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Menyusun perbandingan...</p>
                      <p className="text-xs text-slate-400 mt-1">Mohon tunggu sebentar</p>
                    </div>
                  </div>
                ) : pdfError || !pdfUrl ? (
                  <div className="flex flex-col items-center gap-3 py-24 text-red-500">
                    <AlertCircle className="w-8 h-8" />
                    <span className="text-sm font-semibold">Gagal membuat PDF.</span>
                    <button
                      type="button"
                      onClick={handleCompare}
                      className="mt-1 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
                    >
                      Coba lagi
                    </button>
                  </div>
                ) : (
                  <div className="max-w-2xl mx-auto">
                    <PdfDoc
                      file={pdfUrl}
                      onLoadSuccess={({ numPages }) => setPdfNumPages(numPages)}
                      onLoadError={(err) => { console.error('react-pdf error:', err); setPdfError(true); }}
                      loading={
                        <div className="flex flex-col items-center gap-3 py-16">
                          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                          <span className="text-sm text-gray-500">Memuat dokumen...</span>
                        </div>
                      }
                      error={
                        <div className="flex flex-col items-center gap-2 py-16 text-red-500">
                          <AlertCircle className="w-8 h-8" />
                          <span className="text-sm">Gagal memuat PDF.</span>
                        </div>
                      }
                      className="w-full flex flex-col items-center gap-4"
                    >
                      {pdfNumPages && Array.from(new Array(pdfNumPages), (_, i) => (
                        <PdfPage
                          key={`cpage_${i + 1}`}
                          pageNumber={i + 1}
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                          className="shadow-lg rounded-lg overflow-hidden w-full max-w-full"
                          width={pdfPageWidth || 400}
                        />
                      ))}
                    </PdfDoc>
                  </div>
                )}
              </div>

              {/* ── Modal Footer ── */}
              <div className="flex-none sticky bottom-0 bg-white dark:bg-slate-900 border-t border-gray-200/60 dark:border-slate-700/60 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                <div className="flex gap-3 max-w-2xl mx-auto">
                  <button
                    onClick={handleSharePdf}
                    disabled={pdfLoading || pdfSharing || !pdfUrl}
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/20 transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                  >
                    {pdfSharing
                      ? <><Loader2 size={18} className="animate-spin" /> Menyiapkan...</>
                      : shareLabel
                        ? <><Share2 size={18} /> Bagikan PDF</>
                        : <><Download size={18} /> Unduh PDF</>}
                  </button>
                  <button
                    onClick={() => setShowModal(false)}
                    className="w-[30%] flex items-center justify-center py-3.5 rounded-xl font-semibold text-sm border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all duration-200 active:scale-[0.97]"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

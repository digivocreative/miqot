import { useState, useEffect, useCallback, useMemo } from 'react';
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
  Save,
  CheckCircle2,
  Loader2,
  Plane,
  ChevronRight,
  X,
  Copy,
  Share2,
  MessageCircle,
  AlertCircle,
} from 'lucide-react';
import { getPackages } from '@/services';
import type { UmrohPackage, HotelInfo } from '@/types';

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
}

const ROOM_PRICES_FALLBACK = {
  single: 0,
  double: 0,
  triple: 0,
  quad: 0,
};

const BALITA_KASUR_PRICE = 32_000_000;
const BALITA_TANPA_KASUR_PRICE = 28_000_000;
const INFANT_PRICE = 8_500_000;

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
    <div className="inline-flex items-center bg-slate-50 rounded-full border border-slate-200 p-0.5 transition-all duration-300">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="w-8 h-8 flex items-center justify-center rounded-full text-slate-500 hover:bg-emerald-100 hover:text-emerald-600 transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed active:scale-90"
      >
        <Minus size={14} strokeWidth={2.5} />
      </button>
      <span className="w-8 text-center font-bold text-slate-800 text-sm tabular-nums select-none">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="w-8 h-8 flex items-center justify-center rounded-full text-slate-500 hover:bg-emerald-100 hover:text-emerald-600 transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed active:scale-90"
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

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

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
        className="w-full text-left rounded-2xl border border-slate-200 bg-slate-50 transition-all duration-300 hover:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 disabled:opacity-60 overflow-hidden"
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
              <p className="text-lg font-bold text-slate-900 tracking-tight leading-tight">{parsed.date}</p>
              {parsed.name && (
                <p className="text-xs text-slate-500 mt-0.5 truncate">{parsed.name}</p>
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
            <span className="text-slate-400 text-sm">{placeholder}</span>
            <ChevronDown size={18} className="text-slate-400" />
          </div>
        )}
      </button>

      {isOpen && !loading && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 right-0 z-50 mt-2 rounded-2xl border border-slate-100 bg-white shadow-2xl overflow-hidden">
            <div className="p-2.5 border-b border-slate-100 bg-slate-50/50">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari tanggal atau paket..."
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
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
                      className={`w-full text-left px-4 py-3 transition-all duration-300 flex items-center gap-3 border-b border-slate-50 last:border-0 ${
                        isSelected ? 'bg-emerald-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${
                        isSelected ? 'bg-emerald-100' : 'bg-slate-100'
                      }`}>
                        <Calendar size={14} className={isSelected ? 'text-emerald-600' : 'text-slate-400'} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-semibold ${isSelected ? 'text-emerald-700' : 'text-slate-800'}`}>
                          {parts[0]}
                        </p>
                        {parts[1] && (
                          <p className={`text-xs truncate ${isSelected ? 'text-emerald-500' : 'text-slate-400'}`}>
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
  return <div className="border-b border-dashed border-slate-200 mx-1" />;
}

// ============================================
// Section Header
// ============================================
function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <h2 className="text-sm font-bold text-slate-800 tracking-tight mb-3 flex items-center gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center border border-amber-100/80">
        <Icon size={14} className="text-amber-600" />
      </div>
      {label}
    </h2>
  );
}

// ============================================
// Result Modal Component
// ============================================
function ResultModal({
  isOpen,
  onClose,
  pkg,
  rooms,
  jamaah,
  summary,
  catatan,
  namaLengkap,
}: {
  isOpen: boolean;
  onClose: () => void;
  pkg: UmrohPackage | null;
  rooms: RoomCounts;
  jamaah: JamaahCounts;
  summary: { items: { label: string; qty: number; unitPrice: number; total: number }[]; subtotal: number; discount: number; grandTotal: number };
  catatan: string;
  namaLengkap: string;
}) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const fmtDate = (d: string) => {
    const dt = new Date(d);
    return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const fmtRp = (v: number) => 'Rp. ' + v.toLocaleString('id-ID');

  // Build WA-style text
  const buildWaText = () => {
    const lines: string[] = [];
    lines.push('*ALHIJAZ INDOWISATA*');
    lines.push('──────────────────');
    if (pkg) {
      lines.push(`*${pkg.maskapai}*, *${pkg.nama}*`);
      lines.push('');
      lines.push('```BERANGKAT```');
      lines.push(`*${fmtDate(pkg.keberangkatan.tgl)}*, *${pkg.keberangkatan.jam}*`);
      lines.push(`*${pkg.keberangkatan.kodePenerbangan}* ─ *${pkg.keberangkatan.rute}*`);
      lines.push('');
      lines.push('```PULANG```');
      lines.push(`*${fmtDate(pkg.kepulangan.tgl)}*, *${pkg.kepulangan.jam}*`);
      lines.push(`*${pkg.kepulangan.kodePenerbangan}* ─ *${pkg.kepulangan.rute}*`);
      lines.push('');
      // Hotels from first tier
      const firstTier = Object.keys(pkg.hotel)[0];
      if (firstTier) {
        const h = pkg.hotel[firstTier] as HotelInfo & Record<string, string>;
        lines.push(`*[ PAKET ${firstTier} ]*`);
        lines.push('─────────────');
        if (h.mekkah_hotel) {
          lines.push('```HOTEL MEKKAH```');
          lines.push(`*${h.mekkah_hotel} [ *${h.mekkah_bintang} ]*`);
        }
        if (h.madinah_hotel) {
          lines.push('');
          lines.push('```HOTEL MADINAH```');
          lines.push(`*${h.madinah_hotel} [ *${h.madinah_bintang} ]*`);
        }
        lines.push('');
        lines.push('');
      }
    }

    // Room & jamaah breakdowns - use summary items which already have correct prices
    for (const item of summary.items) {
      const typeLabel = item.label.toUpperCase();
      lines.push(`*PERHITUNGAN ${typeLabel}*`);
      lines.push(`\`\`\`${fmtRp(item.unitPrice)} ${typeLabel}\`\`\``);
      lines.push('```Rp. 0 (PROMO)```');
      lines.push('```________________+```');
      lines.push(`\`\`\`${fmtRp(item.unitPrice)}\`\`\``);
      lines.push(`\`\`\`________________×${item.qty} PAX\`\`\``);
      lines.push(`\`\`\`${fmtRp(item.total)}\`\`\``);
      lines.push('');
      lines.push('');
    }

    lines.push(`\`\`\`Total = ${fmtRp(summary.subtotal)}(sebelum diskon)\`\`\``);
    lines.push(`\`\`\`Diskon = ${fmtRp(summary.discount)}\`\`\``);
    lines.push('');
    lines.push(`*TOTAL BIAYA UMROH  = ${fmtRp(summary.grandTotal)}*`);
    lines.push('');
    if (catatan) {
      lines.push('```Keterangan : ```');
      lines.push(catatan);
      lines.push('');
    }
    lines.push('_Tanpa mengurangi nilai ibadah, harga dan jadwal sewaktu waktu dapat berubah sesuai dengan kondisi penerbangan dan regulasi dari pemerintah Indonesia dan Arab Saudi_');
    return lines.join('\n');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildWaText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* fallback */ }
  };

  const handleShareWA = () => {
    const text = encodeURIComponent(buildWaText());
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  // First tier for hotel display
  const firstTier = pkg ? Object.keys(pkg.hotel)[0] : null;
  const hotelData = firstTier && pkg ? (pkg.hotel[firstTier] as HotelInfo & Record<string, string>) : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      {/* Modal */}
      <div className="relative w-full max-w-lg max-h-[92vh] bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col animate-[slideUp_0.3s_ease-out]">
        {/* Modal Header */}
        <div className="flex-shrink-0 px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">Hasil Kalkulasi</h2>
            <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 transition-colors"><X size={18} className="text-slate-500" /></button>
          </div>
          {namaLengkap && <p className="text-xs text-slate-400 mt-0.5">untuk <span className="font-medium text-slate-600">{namaLengkap}</span></p>}
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Company Header */}
          <div className="text-center">
            <p className="text-sm font-extrabold text-emerald-700 tracking-wide">ALHIJAZ INDOWISATA</p>
            <div className="mt-1.5 border-t-2 border-dashed border-slate-200" />
          </div>

          {/* Package & Flight Info */}
          {pkg && (
            <div className="space-y-4">
              <p className="text-xs font-bold text-center text-slate-800 leading-relaxed">
                {pkg.maskapai} — {pkg.nama}
              </p>
              {/* Departure */}
              <div className="bg-slate-50 rounded-xl p-3.5">
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">Berangkat</p>
                <p className="text-sm font-bold text-slate-900">{fmtDate(pkg.keberangkatan.tgl)}, {pkg.keberangkatan.jam}</p>
                <p className="text-xs text-slate-500 mt-0.5">{pkg.keberangkatan.kodePenerbangan} ─ {pkg.keberangkatan.rute}</p>
              </div>
              {/* Return */}
              <div className="bg-slate-50 rounded-xl p-3.5">
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">Pulang</p>
                <p className="text-sm font-bold text-slate-900">{fmtDate(pkg.kepulangan.tgl)}, {pkg.kepulangan.jam}</p>
                <p className="text-xs text-slate-500 mt-0.5">{pkg.kepulangan.kodePenerbangan} ─ {pkg.kepulangan.rute}</p>
              </div>
              {/* Hotels */}
              {hotelData && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest text-center">Paket {firstTier}</p>
                  <div className="border-t border-dashed border-slate-200" />
                  {hotelData.mekkah_hotel && (
                    <div className="flex items-center justify-between text-xs py-1">
                      <span className="text-slate-500 font-medium">Hotel Mekkah</span>
                      <span className="text-slate-800 font-semibold text-right">{hotelData.mekkah_hotel} <span className="text-amber-500">★{hotelData.mekkah_bintang}</span></span>
                    </div>
                  )}
                  {hotelData.madinah_hotel && (
                    <div className="flex items-center justify-between text-xs py-1">
                      <span className="text-slate-500 font-medium">Hotel Madinah</span>
                      <span className="text-slate-800 font-semibold text-right">{hotelData.madinah_hotel} <span className="text-amber-500">★{hotelData.madinah_bintang}</span></span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Price Breakdown */}
          <div>
            <div className="border-t-2 border-dashed border-slate-200 mb-4" />
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Rincian Perhitungan</p>
            <div className="space-y-3">
              {summary.items.map((item, i) => (
                <div key={i} className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs font-bold text-slate-700 mb-1.5">{item.label}</p>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{formatRupiah(item.unitPrice)} × {item.qty} pax</span>
                    <span className="font-bold text-slate-800 tabular-nums">{formatRupiah(item.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div>
            <div className="border-t-2 border-dashed border-slate-200 pt-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Subtotal</span>
                <span className="text-slate-700 font-medium tabular-nums">{formatRupiah(summary.subtotal)}</span>
              </div>
              {summary.discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-emerald-500">Diskon</span>
                  <span className="text-emerald-500 font-medium tabular-nums">- {formatRupiah(summary.discount)}</span>
                </div>
              )}
              <div className="border-t border-slate-200 pt-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm font-bold text-slate-600">TOTAL BIAYA UMROH</span>
                  <span className="text-2xl font-extrabold text-emerald-700 tabular-nums">{formatRupiah(summary.grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Catatan */}
          {catatan && (
            <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
              <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">Keterangan</p>
              <p className="text-xs text-amber-800">{catatan}</p>
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-[10px] text-slate-400 italic text-center leading-relaxed">
            Tanpa mengurangi nilai ibadah, harga dan jadwal sewaktu waktu dapat berubah sesuai dengan kondisi penerbangan dan regulasi dari pemerintah Indonesia dan Arab Saudi
          </p>
        </div>

        {/* Modal Footer */}
        <div className="flex-shrink-0 px-5 py-4 bg-slate-50 border-t border-slate-100 flex gap-2">
          <button onClick={handleCopy} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl text-sm font-semibold border transition-all duration-300 active:scale-[0.97] ${copied ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
            {copied ? <><CheckCircle2 size={16} /> Tersalin!</> : <><Copy size={16} /> Copy</>}
          </button>
          <button onClick={handleShareWA} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-green-600 to-green-700 shadow-lg shadow-green-600/20 transition-all duration-300 active:scale-[0.97]">
            <MessageCircle size={16} /> WhatsApp
          </button>
        </div>
      </div>
      <style>{`@keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
    </div>
  );
}

// ============================================
// Main Page Component
// ============================================
export default function KalkulasiPage() {
  // --- API Data ---
  const [packages, setPackages] = useState<UmrohPackage[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(true);

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

  // Build dropdown options from API data
  const packageOptions: SelectOption[] = useMemo(() => {
    return packages.map((pkg) => {
      const depDate = new Date(pkg.keberangkatan.tgl);
      const dateStr = depDate.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      return {
        id: pkg.jadwalId,
        label: `${dateStr} — ${pkg.nama}`,
      };
    });
  }, [packages]);

  // --- Form State ---
  const [namaLengkap, setNamaLengkap] = useState('');
  const [selectedPackage, setSelectedPackage] = useState('');
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
  const [catatan, setCatatan] = useState('');
  const [showResultModal, setShowResultModal] = useState(false);

  // Find the selected package object
  const selectedPkg = useMemo(() => {
    if (!selectedPackage) return null;
    return packages.find((p) => p.jadwalId === selectedPackage) || null;
  }, [packages, selectedPackage]);

  // Extract room prices from the selected package's first tier
  const roomPrices = useMemo(() => {
    if (!selectedPkg) return ROOM_PRICES_FALLBACK;
    const firstTier = Object.keys(selectedPkg.harga)[0];
    if (!firstTier) return ROOM_PRICES_FALLBACK;
    const tierPricing = selectedPkg.harga[firstTier];
    return {
      quad: parseInt(tierPricing.Quard || '0', 10),
      triple: parseInt(tierPricing.Triple || '0', 10),
      double: parseInt(tierPricing.Double || '0', 10),
      single: parseInt(tierPricing.Single || '0', 10),
    };
  }, [selectedPkg]);

  // --- Summary Calculation ---
  const summary = useMemo(() => {
    const items: { label: string; qty: number; unitPrice: number; total: number }[] = [];

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
    if (jamaah.balitaKasur > 0) {
      items.push({ label: 'Anak (dengan Kasur)', qty: jamaah.balitaKasur, unitPrice: BALITA_KASUR_PRICE, total: jamaah.balitaKasur * BALITA_KASUR_PRICE });
    }
    if (jamaah.balitaTanpaKasur > 0) {
      items.push({ label: 'Anak (tanpa Kasur)', qty: jamaah.balitaTanpaKasur, unitPrice: BALITA_TANPA_KASUR_PRICE, total: jamaah.balitaTanpaKasur * BALITA_TANPA_KASUR_PRICE });
    }
    if (jamaah.infant > 0) {
      items.push({ label: 'Infant (0-23 bln)', qty: jamaah.infant, unitPrice: INFANT_PRICE, total: jamaah.infant * INFANT_PRICE });
    }

    const subtotal = items.reduce((sum, i) => sum + i.total, 0);
    const totalJamaah = jamaah.dewasa + jamaah.balitaKasur + jamaah.balitaTanpaKasur + jamaah.infant;
    const discount = isDiscountActive
      ? (discountType === 'per-pax' ? discountAmount * totalJamaah : discountAmount)
      : 0;
    const grandTotal = Math.max(0, subtotal - discount);

    return { items, subtotal, discount, grandTotal };
  }, [rooms, jamaah, isDiscountActive, discountAmount, discountType, roomPrices]);

  // --- Room / Jamaah balance validation ---
  const totalJamaahNeedRoom = jamaah.dewasa + jamaah.balitaKasur + jamaah.balitaTanpaKasur;
  const totalRoomPax = rooms.quad + rooms.triple + rooms.double + rooms.single;
  const roomDiff = totalJamaahNeedRoom - totalRoomPax; // positive = need more rooms
  const roomBalanced = totalJamaahNeedRoom > 0 && roomDiff === 0;

  const hasSelection = summary.items.length > 0 && roomBalanced;

  // ============================================
  // Render
  // ============================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/30 via-slate-50 to-slate-50">
      <div className="max-w-lg mx-auto px-4 py-6 pb-10">

        {/* ════════════════════════════════════════════ */}
        {/* THE UNIFIED SUPER-CARD                      */}
        {/* ════════════════════════════════════════════ */}
        <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200/50 overflow-hidden border border-slate-100">

          {/* ── Decorative Top Gradient ── */}
          <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-emerald-600 to-emerald-700" />

          {/* ══════════════════════════════ */}
          {/* CARD HEADER                   */}
          {/* ══════════════════════════════ */}
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => (window.location.href = '/')}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100/80 hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 transition-all duration-300 active:scale-95"
                title="Kembali"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                  Kalkulasi Umroh
                </h1>
                <p className="text-[11px] text-slate-400">
                  Estimasi biaya paket untuk calon jamaah
                </p>
              </div>
            </div>
            {/* Progress Line */}
            <div className="mt-4 flex items-center gap-1.5">
              <div className="flex-1 h-1 rounded-full bg-emerald-600" />
              <div className="flex-1 h-1 rounded-full bg-slate-200" />
              <div className="flex-1 h-1 rounded-full bg-slate-200" />
              <div className="flex-1 h-1 rounded-full bg-slate-200" />
            </div>
          </div>



          <SectionDivider />

          {/* ══════════════════════════════ */}
          {/* SECTION: Pilih Paket          */}
          {/* ══════════════════════════════ */}
          <div className="px-5 py-5">
            <SectionHeader icon={Plane} label="Jadwal & Paket" />
            <SearchableSelect
              options={packageOptions}
              value={selectedPackage}
              onChange={setSelectedPackage}
              placeholder="Cari dan pilih paket..."
              loading={loadingPackages}
            />
          </div>

          <SectionDivider />

          {/* ══════════════════════════════ */}
          {/* SECTION: Komposisi Jamaah     */}
          {/* ══════════════════════════════ */}
          <div className="px-5 py-5">
            <SectionHeader icon={Users} label="Komposisi Jamaah" />
            <div className="space-y-0">
              {/* Dewasa */}
              <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                    <User size={15} className="text-slate-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Dewasa</p>
                    <p className="text-[10px] text-slate-400">12 tahun ke atas</p>
                  </div>
                </div>
                <Counter
                  value={jamaah.dewasa}
                  onChange={(v) => setJamaah((s) => ({ ...s, dewasa: v }))}
                  min={1}
                />
              </div>
              {/* Anak + Kasur */}
              <div className="flex items-center justify-between py-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-pink-50 flex items-center justify-center">
                    <Baby size={15} className="text-pink-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Anak + Kasur</p>
                    <p className="text-[10px] text-slate-400">2 – 11 tahun, dengan kasur</p>
                  </div>
                </div>
                <Counter
                  value={jamaah.balitaKasur}
                  onChange={(v) => setJamaah((s) => ({ ...s, balitaKasur: v }))}
                />
              </div>
              {/* Anak tanpa Kasur */}
              <div className="flex items-center justify-between py-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-violet-50 flex items-center justify-center">
                    <Baby size={15} className="text-violet-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Anak tanpa Kasur</p>
                    <p className="text-[10px] text-slate-400">2 – 11 tahun, tanpa kasur</p>
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
                  <div className="w-9 h-9 rounded-full bg-sky-50 flex items-center justify-center">
                    <Baby size={15} className="text-sky-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Infant</p>
                    <p className="text-[10px] text-slate-400">0 – 23 bulan</p>
                  </div>
                </div>
                <Counter
                  value={jamaah.infant}
                  onChange={(v) => setJamaah((s) => ({ ...s, infant: v }))}
                />
              </div>
            </div>
          </div>

          <SectionDivider />

          {/* ══════════════════════════════ */}
          {/* SECTION: Pilihan Kamar        */}
          {/* ══════════════════════════════ */}
          <div className="px-5 py-5">
            <SectionHeader icon={BedDouble} label="Pilihan Kamar" />
            <div className="space-y-0">
              {([
                { key: 'quad' as const, label: 'Quad', desc: '4 orang / kamar', beds: 4, color: 'bg-emerald-50 text-emerald-500' },
                { key: 'triple' as const, label: 'Triple', desc: '3 orang / kamar', beds: 3, color: 'bg-amber-50 text-amber-500' },
                { key: 'double' as const, label: 'Double', desc: '2 orang / kamar', beds: 2, color: 'bg-sky-50 text-sky-500' },
                { key: 'single' as const, label: 'Single', desc: '1 orang / kamar', beds: 1, color: 'bg-violet-50 text-violet-500' },
              ]).map((room, idx, arr) => {
                const isSelected = rooms[room.key] > 0;
                const price = roomPrices[room.key];
                const isLast = idx === arr.length - 1;
                return (
                  <div
                    key={room.key}
                    className={`flex items-center justify-between py-3 transition-all duration-300 ${!isLast ? 'border-b border-slate-100' : ''} ${isSelected ? 'bg-emerald-50/40 -mx-5 px-5 rounded-lg' : ''}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${room.color}`}>
                        <BedDouble size={15} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{room.label}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] text-slate-400">{room.desc}</p>
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
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700'
              }`}>
                {roomBalanced ? (
                  <><CheckCircle2 size={14} /> Kamar sesuai — {totalRoomPax} pax</>
                ) : roomDiff > 0 ? (
                  <><AlertCircle size={14} /> Kurang {roomDiff} pax — butuh {totalJamaahNeedRoom}, sudah {totalRoomPax}</>
                ) : (
                  <><AlertCircle size={14} /> Kelebihan {Math.abs(roomDiff)} pax — butuh {totalJamaahNeedRoom}, sudah {totalRoomPax}</>
                )}
              </div>
            )}
          </div>

          <SectionDivider />

          {/* ══════════════════════════════ */}
          {/* SECTION: Diskon & Catatan     */}
          {/* ══════════════════════════════ */}
          <div className="px-5 py-5">
            <SectionHeader icon={Tag} label="Diskon" />
            <div className="space-y-4">
              {/* Toggle Diskon */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">
                  Aktifkan Diskon
                </label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isDiscountActive}
                  onClick={() => setIsDiscountActive(!isDiscountActive)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                    isDiscountActive ? 'bg-emerald-600' : 'bg-slate-200'
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
                    <label className="block text-xs font-medium text-slate-500 mb-1.5 ml-0.5">
                      Jenis Diskon
                    </label>
                    <div className="flex rounded-xl border border-slate-200 overflow-hidden">
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
                              : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5 ml-0.5">
                      {discountType === 'per-pax'
                        ? 'Diskon dikalikan jumlah seluruh jamaah'
                        : 'Diskon berlaku sebagai potongan langsung'}
                    </p>
                  </div>

                  {/* Discount Amount */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5 ml-0.5">
                      Nominal Diskon{discountType === 'per-pax' ? ' per Jamaah' : ''} (Rp)
                    </label>
                    <input
                      type="number"
                      value={discountAmount || ''}
                      onChange={(e) => setDiscountAmount(parseInt(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full px-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 placeholder:text-slate-400 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 tabular-nums"
                    />
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* ══════════════════════════════ */}
          {/* SUMMARY FOOTER ("Tear-Off")   */}
          {/* ══════════════════════════════ */}
          {/* Zigzag / Tear-off border effect */}
          <div className="relative">
            <div className="absolute inset-x-0 top-0 h-3 overflow-hidden">
              <svg className="w-full h-3 text-slate-50" viewBox="0 0 100 6" preserveAspectRatio="none">
                <path d="M0,6 L2.5,0 L5,6 L7.5,0 L10,6 L12.5,0 L15,6 L17.5,0 L20,6 L22.5,0 L25,6 L27.5,0 L30,6 L32.5,0 L35,6 L37.5,0 L40,6 L42.5,0 L45,6 L47.5,0 L50,6 L52.5,0 L55,6 L57.5,0 L60,6 L62.5,0 L65,6 L67.5,0 L70,6 L72.5,0 L75,6 L77.5,0 L80,6 L82.5,0 L85,6 L87.5,0 L90,6 L92.5,0 L95,6 L97.5,0 L100,6" fill="currentColor" />
              </svg>
            </div>
          </div>

          <div className="bg-slate-50 px-5 pt-6 pb-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <FileText size={13} className="text-amber-500" />
              Rincian Biaya
            </h3>

            {/* Line items */}
            {!hasSelection ? (
              <div className="text-center py-6">
                <div className="w-11 h-11 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-2">
                  <FileText size={18} className="text-slate-300" />
                </div>
                <p className="text-xs text-slate-400">
                  Pilih kamar untuk melihat ringkasan.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2 mb-4">
                  {summary.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">
                        {item.qty}× {item.label}
                      </span>
                      <span className="text-slate-800 font-medium tabular-nums">
                        {formatRupiah(item.total)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="border-t-2 border-dashed border-slate-200 my-4" />

                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Subtotal</span>
                    <span className="text-slate-700 font-medium tabular-nums">
                      {formatRupiah(summary.subtotal)}
                    </span>
                  </div>
                  {summary.discount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-emerald-500">Diskon</span>
                      <span className="text-emerald-500 font-medium tabular-nums">
                        - {formatRupiah(summary.discount)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Grand Total */}
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-bold text-slate-600">Grand Total</span>
                    <span className="text-3xl font-bold text-emerald-700 tabular-nums tracking-tight">
                      {formatRupiah(summary.grandTotal)}
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* Action Buttons */}
            <div className="mt-6 space-y-2.5">
              <button
                type="button"
                onClick={() => setShowResultModal(true)}
                disabled={!hasSelection}
                className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-emerald-700 shadow-lg shadow-emerald-700/30 transition-all duration-300 hover:from-emerald-600 hover:to-emerald-700 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CheckCircle2 size={18} />
                Proses Kalkulasi
                <ChevronRight size={16} strokeWidth={3} />
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all duration-300 active:scale-[0.98]"
                >
                  <Save size={13} />
                  Simpan Draft
                </button>
                <button
                  type="button"
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200/80 hover:bg-amber-100 transition-all duration-300 active:scale-[0.98]"
                >
                  <Calendar size={13} />
                  Followup
                </button>
              </div>
            </div>
          </div>

        </div>
        {/* End of Super-Card */}

      </div>

      {/* Result Modal */}
      <ResultModal
        isOpen={showResultModal}
        onClose={() => setShowResultModal(false)}
        pkg={selectedPkg}
        rooms={rooms}
        jamaah={jamaah}
        summary={summary}
        catatan={catatan}
        namaLengkap={namaLengkap}
      />
    </div>
  );
}

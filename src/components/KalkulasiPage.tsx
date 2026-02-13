import { useState, useEffect, useCallback, useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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

  Download,
  CheckCircle2,
  Loader2,
  Plane,
  PlaneTakeoff,
  PlaneLanding,
  ChevronRight,
  X,
  Copy,
  Share2,
  MessageCircle,
  AlertCircle,
  Sparkles,
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
  return <div className="border-b border-slate-100 mx-0" />;
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
  onDownloadPDF,
}: {
  isOpen: boolean;
  onClose: () => void;
  pkg: UmrohPackage | null;
  rooms: RoomCounts;
  jamaah: JamaahCounts;
  summary: { items: { label: string; qty: number; unitPrice: number; total: number }[]; subtotal: number; discount: number; grandTotal: number };
  catatan: string;
  namaLengkap: string;
  onDownloadPDF: () => void;
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
      lines.push(`\`\`\`________________×${item.qty} PAX\`\`\``);
      lines.push(`\`\`\`${fmtRp(item.total)}\`\`\``);
      lines.push('');
      lines.push('');
    }

    if (summary.discount > 0) {
      lines.push(`\`\`\`Total = ${fmtRp(summary.subtotal)}(sebelum diskon)\`\`\``);
      lines.push(`\`\`\`Diskon = ${fmtRp(summary.discount)}\`\`\``);
      lines.push('');
    }
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

          {/* Package & Flight Info — Compact Card Style */}
          {pkg && (
            <div className="space-y-3">
              {hotelData && (
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest text-center">Paket {firstTier}</p>
              )}
              <p className="text-sm font-bold text-center text-slate-800 leading-relaxed">
                {pkg.maskapai} — {pkg.nama}
              </p>

              {/* Flight info — 2-column compact grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Departure */}
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 flex items-center justify-center text-emerald-600 mt-0.5">
                    <PlaneTakeoff size={16} />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Berangkat</p>
                    <p className="text-xs font-bold text-slate-800">{fmtDate(pkg.keberangkatan.tgl)}</p>
                    <p className="text-[10px] text-slate-500">{pkg.keberangkatan.kodePenerbangan} · {pkg.keberangkatan.jam}</p>
                  </div>
                </div>

                {/* Return */}
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 flex items-center justify-center text-emerald-600 mt-0.5">
                    <PlaneLanding size={16} />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Pulang</p>
                    <p className="text-xs font-bold text-slate-800">{fmtDate(pkg.kepulangan.tgl)}</p>
                    <p className="text-[10px] text-slate-500">{pkg.kepulangan.kodePenerbangan} · {pkg.kepulangan.jam}</p>
                  </div>
                </div>
              </div>

              {/* Hotel info — 2-column compact grid */}
              {hotelData && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {hotelData.mekkah_hotel && (
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Mekkah</p>
                        <p className="text-xs text-slate-700 font-medium truncate">{hotelData.mekkah_hotel}</p>
                        {hotelData.mekkah_bintang && (
                          <div className="flex items-center gap-0.5">
                            {Array.from({ length: parseInt(hotelData.mekkah_bintang) }).map((_, i) => (
                              <span key={i} className="text-[10px] text-amber-400">★</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {hotelData.madinah_hotel && (
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Madinah</p>
                        <p className="text-xs text-slate-700 font-medium truncate">{hotelData.madinah_hotel}</p>
                        {hotelData.madinah_bintang && (
                          <div className="flex items-center gap-0.5">
                            {Array.from({ length: parseInt(hotelData.madinah_bintang) }).map((_, i) => (
                              <span key={i} className="text-[10px] text-amber-400">★</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
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
          <button onClick={onDownloadPDF} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl text-sm font-semibold border-2 border-slate-200 text-emerald-600 bg-white transition-all duration-200 active:scale-[0.97]">
            <Download size={16} /> PDF
          </button>
          <button onClick={handleCopy} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl text-sm font-semibold border-2 border-slate-200 text-indigo-600 bg-white transition-all duration-200 active:scale-[0.97]">
            {copied ? <><CheckCircle2 size={16} /> Tersalin!</> : <><Copy size={16} /> Copy</>}
          </button>
          <button onClick={handleShareWA} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl text-sm font-semibold border-2 border-slate-200 text-green-600 bg-white transition-all duration-200 active:scale-[0.97]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> Share
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
  const [autoFillFlash, setAutoFillFlash] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

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
      infant: parseInt(tierPricing.Infant || '0', 10) || INFANT_PRICE,
    };
  }, [selectedPkg]);

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
      const firstTier = selectedPkg ? Object.keys(selectedPkg.harga)[0]?.toUpperCase() ?? '' : '';
      const isRahmah = pkgName.includes('RAHMAH') || firstTier.includes('RAHMAH');
      const isPromo = selectedPkg?.isPromo ?? pkgName.includes('PROMO');
      const disc = isRahmah
        ? ANAK_TANPA_KASUR_DISC_RAHMAH
        : isPromo
          ? ANAK_TANPA_KASUR_DISC_PROMO
          : ANAK_TANPA_KASUR_DISC_NORMAL;
      const anakPrice = Math.max(0, roomPrices.quad - disc);
      items.push({ label: 'Anak (tanpa Kasur)', qty: jamaah.balitaTanpaKasur, unitPrice: anakPrice, total: jamaah.balitaTanpaKasur * anakPrice, note: `${formatRupiah(roomPrices.quad)} − ${formatRupiah(disc)}` });
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
  }, [rooms, jamaah, isDiscountActive, discountAmount, discountType, roomPrices, selectedPkg]);

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

  // --- PDF Quotation Generator ---
  const handleDownloadPDF = useCallback(() => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 18;

    // Helper: format rupiah for PDF
    const pdfRp = (v: number) => 'Rp ' + v.toLocaleString('id-ID');

    // ─── HEADER ───
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('OFFICIAL QUOTATION', pageWidth / 2, y, { align: 'center' });
    y += 6;
    doc.setFontSize(10);
    doc.text('ALHIJAZ INDOWISATA', pageWidth / 2, y, { align: 'center' });
    y += 8;
    doc.setDrawColor(200);
    doc.line(14, y, pageWidth - 14, y);
    y += 8;

    // ─── CUSTOMER INFO ───
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.text(`Tanggal: ${today}`, 14, y);
    y += 5;
    if (namaLengkap) {
      doc.text(`Nama Customer: ${namaLengkap}`, 14, y);
      y += 5;
    }
    y += 3;

    // ─── PACKAGE INFO ───
    if (selectedPkg) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`Paket: ${selectedPkg.nama}`, 14, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Maskapai: ${selectedPkg.maskapai}`, 14, y);
      y += 4;
      const depDate = new Date(selectedPkg.keberangkatan.tgl).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      doc.text(`Keberangkatan: ${depDate}, ${selectedPkg.keberangkatan.jam}`, 14, y);
      y += 8;
    }

    // ─── PRICING TABLE ───
    const tableBody = summary.items.map((item) => [
      item.label,
      String(item.qty),
      pdfRp(item.unitPrice),
      pdfRp(item.total),
    ]);

    // Add discount row if applicable
    if (summary.discount > 0) {
      tableBody.push(['Diskon', '', '', `- ${pdfRp(summary.discount)}`]);
    }

    autoTable(doc, {
      startY: y,
      head: [['Deskripsi', 'Qty', 'Harga/Unit', 'Total']],
      body: tableBody,
      theme: 'striped',
      headStyles: { fillColor: [5, 150, 105], fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { halign: 'center', cellWidth: 20 },
        2: { halign: 'right', cellWidth: 45 },
        3: { halign: 'right', cellWidth: 45 },
      },
    });

    // @ts-ignore jspdf-autotable adds lastAutoTable
    y = (doc as any).lastAutoTable.finalY + 6;

    // ─── GRAND TOTAL ───
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`GRAND TOTAL: ${pdfRp(summary.grandTotal)}`, pageWidth - 14, y, { align: 'right' });
    y += 12;

    // ─── REKENING PEMBAYARAN ───
    doc.setDrawColor(200);
    doc.line(14, y, pageWidth - 14, y);
    y += 7;
    doc.setFontSize(10);
    doc.text('REKENING PEMBAYARAN (PT. ALHIJAZ INDOWISATA)', 14, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const banks = [
      'BSI       : 1234-5678-90  (a.n PT Alhijaz)',
      'Mandiri   : 9876-5432-10',
      'BCA       : 5555-4444-33',
      'BNI       : 1111-2222-33',
      'BRI       : 9999-8888-77',
    ];
    banks.forEach((b) => {
      doc.text(b, 14, y);
      y += 5;
    });
    y += 6;

    // ─── IMPORTANT NOTE ───
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(220, 38, 38);
    doc.text(
      'MOHON TRANSFER DP MINIMAL RP 5.000.000 / PAX UNTUK MENGAMANKAN SEAT.',
      14, y, { maxWidth: pageWidth - 28 }
    );
    doc.setTextColor(0);

    // ─── PREVIEW instead of save ───
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    setPdfPreviewUrl(url);
  }, [summary, selectedPkg, namaLengkap]);

  // ============================================
  // Render
  // ============================================
  return (
    <div className="min-h-screen bg-white">

      {/* ══════════════════════════════ */}
      {/* STICKY HEADER                 */}
      {/* ══════════════════════════════ */}
      <div className="sticky top-0 z-30 backdrop-blur-md bg-white/90 border-b border-slate-100">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => (window.location.href = '/')}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100/80 hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 transition-all duration-300 active:scale-95"
            title="Kembali"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">
              Kalkulasi Harga
            </h1>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════ */}
      {/* MAIN CONTENT                  */}
      {/* ══════════════════════════════ */}
      <div className="max-w-3xl mx-auto px-5 pb-10">

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

          <SectionDivider />

          {/* ══════════════════════════════ */}
          {/* SECTION: Komposisi Jamaah     */}
          {/* ══════════════════════════════ */}
          <div className="relative">
            {!selectedPkg && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 rounded-xl">
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 border border-amber-200">
                  <AlertCircle size={14} className="text-amber-500" />
                  <span className="text-xs font-semibold text-amber-700">Pilih paket terlebih dahulu</span>
                </div>
              </div>
            )}
          <div className="py-6">
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
                    <p className="text-[10px] text-slate-400">2 – 5 tahun, dengan kasur</p>
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
                    <p className="text-[10px] text-slate-400">2 – 5 tahun, tanpa kasur</p>
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
          </div>

          <SectionDivider />

          {/* ══════════════════════════════ */}
          {/* SECTION: Pilihan Kamar        */}
          {/* ══════════════════════════════ */}
          <div className="relative">
            {!selectedPkg && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 rounded-xl">
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 border border-amber-200">
                  <AlertCircle size={14} className="text-amber-500" />
                  <span className="text-xs font-semibold text-amber-700">Pilih paket terlebih dahulu</span>
                </div>
              </div>
            )}
          <div className="py-6">
            <div className="flex items-start justify-between">
              <SectionHeader icon={BedDouble} label="Pilihan Kamar" />
              {totalJamaahNeedRoom > 0 && selectedPkg && (
                <button
                  type="button"
                  onClick={handleAutoCalculateRooms}
                  className="group relative flex items-center gap-1.5 text-[11px] font-bold px-4 py-2 rounded-full bg-white transition-all duration-300 cursor-pointer active:scale-95 overflow-hidden"
                  style={{
                    border: '1.5px solid transparent',
                    backgroundImage: 'linear-gradient(white, white), linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)',
                    backgroundOrigin: 'border-box',
                    backgroundClip: 'padding-box, border-box',
                  }}
                >
                  <span className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-indigo-400/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  <Sparkles size={13} className="relative z-10 text-indigo-500" />
                  <span className="relative z-10 bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">Atur Otomatis</span>
                </button>
              )}
            </div>
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
                    className={`flex items-center justify-between py-3 transition-all duration-300 ${!isLast ? 'border-b border-slate-100' : ''} ${isSelected ? 'bg-emerald-50/40 -mx-5 px-5 rounded-lg' : ''} ${autoFillFlash && isSelected ? 'animate-pulse' : ''}`}
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
                  <><CheckCircle2 size={14} /> Kamar sesuai — {totalRoomPax} bed</>
                ) : roomDiff > 0 ? (
                  <><AlertCircle size={14} /> Kurang {roomDiff} bed — butuh {totalJamaahNeedRoom}, sudah {totalRoomPax}</>
                ) : (
                  <><AlertCircle size={14} /> Kelebihan {Math.abs(roomDiff)} bed — butuh {totalJamaahNeedRoom}, sudah {totalRoomPax}</>
                )}
              </div>
            )}
          </div>
          </div>

          <SectionDivider />

          {/* ══════════════════════════════ */}
          {/* SECTION: Diskon & Catatan     */}
          {/* ══════════════════════════════ */}
          <div className="py-6">
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

          <SectionDivider />

          {/* ══════════════════════════════ */}
          {/* SECTION: Rincian Biaya        */}
          {/* ══════════════════════════════ */}
          <div className="py-8">
            <h2 className="text-sm font-bold text-slate-800 tracking-tight mb-4 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center border border-amber-100/80">
                <FileText size={14} className="text-amber-600" />
              </div>
              Rincian Biaya
            </h2>

            {/* Line items */}
            {summary.items.length === 0 ? (
              <div className="text-center py-6">
                <div className="w-11 h-11 mx-auto rounded-full bg-slate-50 flex items-center justify-center mb-2">
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
                        <span className="text-slate-600">
                          {item.qty}× {item.label}
                        </span>
                        <span className="text-slate-800 font-medium tabular-nums">
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

                <div className="border-t border-dashed border-slate-200 my-4" />

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
      <ResultModal
        isOpen={showResultModal}
        onClose={() => setShowResultModal(false)}
        pkg={selectedPkg}
        rooms={rooms}
        jamaah={jamaah}
        summary={summary}
        catatan={catatan}
        namaLengkap={namaLengkap}
        onDownloadPDF={handleDownloadPDF}
      />

      {/* PDF Preview Modal — matches ItineraryModal design */}
      {pdfPreviewUrl && (
        <div className="fixed inset-0 z-[9999] bg-white flex flex-col animate-[slideUpFull_0.35s_ease-out]">

          {/* ─── HEADER ─── */}
          <div className="flex-none sticky top-0 z-10 bg-white/90 backdrop-blur-xl border-b border-gray-200/60 px-5 py-4 flex justify-between items-center shadow-sm">
            <div className="flex flex-col">
              <h2 className="text-lg font-bold text-gray-900">Preview Quotation</h2>
              <span className="text-xs text-gray-500 font-medium">Dokumen PDF</span>
            </div>
            <button
              onClick={() => { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }}
              className="p-2 bg-gray-100 rounded-full text-gray-600 hover:bg-gray-200 transition-colors shrink-0"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* ─── SCROLLABLE CONTENT ─── */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-100 px-4 pb-6">
            <div className="flex justify-center pt-4">
              <div className="bg-white p-2 rounded-xl shadow-lg max-w-2xl w-full min-h-[60vh]">
                <iframe
                  src={pdfPreviewUrl}
                  className="w-full h-[80vh] border-0 rounded-lg"
                  title="PDF Preview"
                />
              </div>
            </div>
          </div>

          {/* ─── FOOTER ─── */}
          <div className="flex-none sticky bottom-0 bg-white border-t border-gray-200/60 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <a
              href={pdfPreviewUrl}
              download={selectedPkg ? `Quotation-${selectedPkg.nama.replace(/\s+/g, '-').substring(0, 30)}.pdf` : 'Quotation-Alhijaz.pdf'}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 transition-all duration-200 active:scale-[0.98]"
            >
              <Share2 size={20} />
              <span>Bagikan / Download PDF</span>
            </a>
          </div>

          <style>{`@keyframes slideUpFull{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:translateY(0)}}`}</style>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import {
  Loader2, Users, Plane, UserPlus, Wallet,
  Check, ChevronDown, X, RefreshCw, BarChart3, TrendingUp, Lock, ArrowLeft,
} from 'lucide-react';
import { getAuthHeaders } from './LoginPage';
import PinInput from './PinInput';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, CartesianGrid,
  XAxis, YAxis, Tooltip,
} from 'recharts';

const TrenDaftarSection = lazy(() => import('./TrenDaftarSection'));
const StatistikHajiSection = lazy(() => import('./StatistikHajiSection'));

// ── Types ──
interface BerangkatItem {
  nama: string;
  paket: string | null;
  jk: string | null;
  tgl_berangkat: string;
  hari_lagi: number;
  lunas: boolean;
  sisa: number;
  wa: string | null;
}

interface OutstandingItem {
  nama: string;
  paket: string | null;
  jk: string | null;
  sisa: number;
  tgl_berangkat: string | null;
  hari_lagi: number | null;
  wa: string | null;
}

interface ComparisonField {
  prev: number | null;
  diff: number | null;
}

interface StatsData {
  totalJamaah: number;
  lunas: number;
  belumLunas: number;
  totalOutstanding: number;
  berangkatSegera: number;
  berangkatBulan: string | null;
  jamaahBaru: number;
  lunasPercent: number;
  comparison: {
    totalJamaah: ComparisonField;
    komisiCair: ComparisonField | null;
    berangkatSegera: ComparisonField;
    jamaahBaru: ComparisonField;
  };
  trend: { bulan: string; count: number }[];
  berangkatBulanIni: BerangkatItem[];
  outstandingList: OutstandingItem[];
  availableYears: string[];
  komisi: {
    totalKomisi: number;
    sudahCair: number;
    sudahCairCount: number;
    belumCair: number;
    belumCairCount: number;
    potensi: number;
    potensiCount: number;
    breakdown: {
      hemat: { count: number; rate: number; total: number };
      reguler: { count: number; rate: number; total: number };
    };
    chartBulanan: { bulan: string; total: number; count: number }[];
  };
  hijriahYear: string | null;
  lastSync: string | null;
}

// ── Helpers ──
const BULAN_LABEL: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'Mei', '06': 'Jun', '07': 'Jul', '08': 'Agu',
  '09': 'Sep', '10': 'Okt', '11': 'Nov', '12': 'Des',
};
const BULAN_FULL: Record<string, string> = {
  '01': 'Januari', '02': 'Februari', '03': 'Maret', '04': 'April',
  '05': 'Mei', '06': 'Juni', '07': 'Juli', '08': 'Agustus',
  '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Desember',
};

function fmtRpShort(n: number): string {
  if (!n) return 'Rp0';
  if (n >= 1_000_000_000) return `Rp${(n / 1_000_000_000).toFixed(1).replace('.0', '')}M`;
  if (n >= 1_000_000) {
    const jt = n / 1_000_000;
    return jt % 1 === 0 ? `Rp${jt}jt` : `Rp${jt.toFixed(1).replace('.0', '')}jt`;
  }
  if (n >= 1_000) return `Rp${Math.round(n / 1_000).toLocaleString('id-ID')}rb`;
  return `Rp${n.toLocaleString('id-ID')}`;
}

function fmtRp(n: number): string {
  if (!n) return 'Rp0';
  return `Rp${n.toLocaleString('id-ID')}`;
}

function fmtTgl(d: string): string {
  try {
    return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return d; }
}

function fmtSync(d: string | null): string {
  if (!d) return '-';
  try {
    const date = new Date(d);
    return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ', ' + date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) + ' WIB';
  } catch { return d; }
}

function fmtHariLagi(n: number | null): string {
  if (n === null || n === undefined) return '-';
  if (n <= 30) return `${n} hari lagi`;
  return `${Math.floor(n / 30)} bulan lagi`;
}

function getInitials(name: string): string {
  return (name || '?').split(' ').slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('');
}

function bulanLabel(ym: string): string {
  const mm = ym.split('-')[1];
  return BULAN_LABEL[mm] || mm;
}

function bulanFull(ym: string): string {
  const [yyyy, mm] = ym.split('-');
  return `${BULAN_FULL[mm] || mm} ${yyyy}`;
}

// ── Comparison indicator ──
function DiffBadge({ diff }: { diff: number | null }) {
  if (diff === null || diff === undefined) return null;
  if (diff > 0) return <p className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">↑ {diff} dari bulan lalu</p>;
  if (diff < 0) return <p className="text-[9px] font-semibold text-red-500 dark:text-red-400 mt-0.5">↓ {Math.abs(diff)} dari bulan lalu</p>;
  return <p className="text-[9px] font-semibold text-gray-400 mt-0.5">= sama dengan bulan lalu</p>;
}

// ── WhatsApp SVG icon ──
function WaIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// ── Reusable modal ──
function StatListModal({ isOpen, onClose, title, subtitle, children }: {
  isOpen: boolean; onClose: () => void; title: string; subtitle: string; children: React.ReactNode;
}) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);
  if (!isOpen) return null;
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-[fadeIn_150ms_ease-out]" onClick={onClose} />
      <div className="fixed inset-x-4 top-8 bottom-8 z-50 max-w-lg mx-auto bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-2xl flex flex-col overflow-hidden animate-[slideUp_200ms_ease-out]">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700/50 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-sm font-bold text-gray-800 dark:text-white">{title}</p>
            <p className="text-[10px] text-gray-400 dark:text-slate-400">{subtitle}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors active:scale-95">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
      <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </>
  );
}

// ── Custom tooltips ──
function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-800 shadow-lg border border-gray-100 dark:border-slate-700 rounded-xl px-3 py-2 text-xs">
      <p className="font-bold text-gray-700 dark:text-white">{bulanLabel(label)} {label.split('-')[0]}</p>
      <p className="text-emerald-600 dark:text-emerald-400 font-semibold">{payload[0].value} jamaah baru</p>
    </div>
  );
}

function KomisiTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const raw = payload[0].payload;
  return (
    <div className="bg-white dark:bg-slate-800 shadow-lg border border-gray-100 dark:border-slate-700 rounded-xl px-3 py-2">
      <p className="text-[10px] text-gray-400 dark:text-slate-400 font-medium">{bulanFull(raw.bulan)}</p>
      <p className="text-sm font-bold text-gray-800 dark:text-white">{fmtRp(payload[0].value)}</p>
      <p className="text-[10px] text-gray-400 dark:text-slate-400">{raw.count} jamaah</p>
    </div>
  );
}

// ── Row renderers ──
function BerangkatRow({ item }: { item: BerangkatItem }) {
  const initials = getInitials(item.nama);
  const isFemale = item.jk === 'P';
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="relative shrink-0">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold ${
          isFemale ? 'bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 ring-2 ring-pink-300'
                   : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 ring-2 ring-blue-300'
        }`}>{initials}</div>
        {item.lunas && (
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-800 flex items-center justify-center">
            <Check size={9} className="text-white" strokeWidth={3} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-gray-800 dark:text-white truncate">{item.nama}</p>
        <p className="text-[10px] text-gray-400 dark:text-slate-500 truncate">{item.paket || '-'}</p>
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
          item.hari_lagi <= 15 ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                               : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
        }`}>✈ {item.hari_lagi} hari</span>
        <span className="text-[10px] text-gray-400 dark:text-slate-500">{fmtTgl(item.tgl_berangkat)}</span>
      </div>
    </div>
  );
}

function OutstandingRow({ item }: { item: OutstandingItem }) {
  const initials = getInitials(item.nama);
  const isFemale = item.jk === 'P';
  const daysLabel = fmtHariLagi(item.hari_lagi);
  const waUrl = item.wa
    ? `https://wa.me/${item.wa.replace(/^0/, '62').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Assalamualaikum ${item.nama}, ini reminder untuk pelunasan umroh ya. Terima kasih.`)}`
    : null;
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
        isFemale ? 'bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 ring-2 ring-pink-300'
                 : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 ring-2 ring-blue-300'
      }`}>{initials}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-gray-800 dark:text-white truncate">{item.nama}</p>
        <p className="text-[10px] text-gray-400 dark:text-slate-500 truncate">{item.paket || '-'} · ✈ {daysLabel}</p>
      </div>
      <span className="text-xs font-bold text-amber-600 dark:text-amber-400 shrink-0">{fmtRpShort(item.sisa)}</span>
      {waUrl && (
        <a href={waUrl} target="_blank" rel="noopener noreferrer"
          className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-800/30 active:scale-95 flex items-center justify-center shrink-0 transition-colors border border-emerald-100 dark:border-emerald-800/40">
          <WaIcon size={14} />
        </a>
      )}
    </div>
  );
}

// ── Skeleton ──
function StatistikSkeleton() {
  const pulse = 'bg-gray-200 dark:bg-slate-700 animate-pulse';
  const pulseFaint = 'bg-gray-100 dark:bg-slate-700/60 animate-pulse';
  const card = 'bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm';

  return (
    <div className="px-4 pt-4 pb-8 space-y-3 max-w-lg mx-auto">

      {/* Section 1: Headline Stats */}
      <div className="grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`${card} p-3.5`}>
            <div className={`w-8 h-8 rounded-lg ${pulse}`} />
            <div className={`h-7 w-16 rounded-md ${pulse} mt-3`} />
            <div className={`h-3 w-24 rounded-md ${pulseFaint} mt-2`} />
          </div>
        ))}
      </div>

      {/* Section 2: Estimasi Komisi */}
      <div className={`${card} p-4`}>
        <div className="flex items-center justify-between">
          <div className={`h-3 w-28 rounded-md ${pulse}`} />
          <div className={`h-3 w-16 rounded-md ${pulse}`} />
        </div>
        <div className={`h-8 w-44 rounded-md ${pulse} mt-3`} />
        <div className={`h-3 w-32 rounded-md ${pulseFaint} mt-1.5`} />
        <div className={`h-3 w-full rounded-full ${pulse} mt-4`} />
        <div className="flex justify-between mt-3">
          <div className={`h-3 w-20 rounded-md ${pulse}`} />
          <div className={`h-3 w-20 rounded-md ${pulse}`} />
          <div className={`h-3 w-20 rounded-md ${pulse}`} />
        </div>
        <div className="mt-3 space-y-2">
          <div className={`h-12 w-full rounded-xl ${pulseFaint}`} />
          <div className={`h-12 w-full rounded-xl ${pulseFaint}`} />
          <div className={`h-12 w-full rounded-xl ${pulseFaint}`} />
        </div>
      </div>

      {/* Section 3: Tren Jamaah Baru */}
      <div className={`${card} p-4`}>
        <div className={`h-3 w-32 rounded-md ${pulse}`} />
        <div className={`h-3 w-52 rounded-md ${pulseFaint} mt-1`} />
        <div className={`h-[160px] w-full rounded-xl ${pulseFaint} mt-4`} />
      </div>

      {/* Section 4: Berangkat Mendatang */}
      <div className={`${card} overflow-hidden`}>
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <div className={`h-3 w-36 rounded-md ${pulse}`} />
          <div className={`w-5 h-5 rounded ${pulse}`} />
        </div>
        {[0, 1, 2].map(i => (
          <div key={i} className="px-4 py-3 flex items-center gap-3 border-b border-gray-50 dark:border-slate-700/50">
            <div className={`w-9 h-9 rounded-full ${pulse} shrink-0`} />
            <div className="flex-1">
              <div className={`h-3.5 w-36 rounded-md ${pulse}`} />
              <div className={`h-3 w-24 rounded-md ${pulseFaint} mt-1.5`} />
            </div>
            <div className={`h-5 w-14 rounded-md ${pulse}`} />
          </div>
        ))}
      </div>

      {/* Section 5: Jamaah Belum Lunas */}
      <div className={`${card} overflow-hidden`}>
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <div className={`h-3 w-36 rounded-md ${pulse}`} />
          <div className={`w-5 h-5 rounded ${pulse}`} />
        </div>
        {[0, 1, 2].map(i => (
          <div key={i} className="px-4 py-3 flex items-center gap-3 border-b border-gray-50 dark:border-slate-700/50">
            <div className={`w-9 h-9 rounded-full ${pulse} shrink-0`} />
            <div className="flex-1">
              <div className={`h-3.5 w-36 rounded-md ${pulse}`} />
              <div className={`h-3 w-24 rounded-md ${pulseFaint} mt-1.5`} />
            </div>
            <div className={`h-5 w-14 rounded-md ${pulse}`} />
          </div>
        ))}
      </div>

      {/* Section 6: Status Pembayaran */}
      <div className={`${card} p-4`}>
        <div className="flex items-center justify-between">
          <div className={`h-3 w-32 rounded-md ${pulse}`} />
          <div className={`h-3 w-16 rounded-md ${pulse}`} />
        </div>
        <div className={`h-3 w-full rounded-full ${pulse} mt-3`} />
        <div className="flex justify-between mt-2">
          <div className={`h-3 w-28 rounded-md ${pulse}`} />
          <div className={`h-3 w-28 rounded-md ${pulse}`} />
        </div>
        <div className={`h-12 w-full rounded-xl ${pulseFaint} mt-3`} />
      </div>
    </div>
  );
}

// ── Component ──
export default function StatistikPage({ agentSlug, role, onHeaderRight, initialStatTab }: {
  agentSlug: string;
  role?: string;
  onHeaderRight?: (node: React.ReactNode) => void;
  initialStatTab?: 'umroh' | 'haji' | 'tren';
}) {
  const isAdmin = role === 'admin';
  // Coerce non-admin landing on 'tren' (admin-only) to 'umroh'
  const safeInitialTab = initialStatTab === 'tren' && role !== 'admin' ? 'umroh' : (initialStatTab || 'umroh');
  const [statTab, setStatTab] = useState<'umroh' | 'haji' | 'tren'>(safeInitialTab);
  // Year state split: hijriah for Umroh+Tren, masehi for Haji
  const [selectedYearMasehi, setSelectedYearMasehi] = useState('');
  const [hajiAvailableYears, setHajiAvailableYears] = useState<string[]>([]);
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [showBerangkatModal, setShowBerangkatModal] = useState(false);
  const [showOutstandingModal, setShowOutstandingModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [backgroundSyncing, setBackgroundSyncing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bgPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasAutoSynced = useRef(false);
  // Admin: all years across all agents (for Tren Daftar dropdown)
  const [allYears, setAllYears] = useState<string[]>([]);

  // ── PIN Gate state ──
  const [pinRequired, setPinRequired] = useState(false);
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [pinChecking, setPinChecking] = useState(true);
  const [gatePin, setGatePin] = useState('');
  const [gateError, setGateError] = useState('');
  const [gateAttempts, setGateAttempts] = useState(0);
  const [gateCooldown, setGateCooldown] = useState(0);

  useEffect(() => {
    const checkPinGate = async () => {
      // 1. Check sessionStorage unlock (1 hour TTL)
      const unlockData = sessionStorage.getItem('pin_unlocked');
      if (unlockData) {
        try {
          const { timestamp } = JSON.parse(unlockData);
          if (Date.now() - timestamp < 60 * 60 * 1000) {
            setPinUnlocked(true);
            setPinChecking(false);
            return;
          }
        } catch { /* invalid data */ }
        sessionStorage.removeItem('pin_unlocked');
      }

      // 2. Fetch pin-status from server
      try {
        const res = await fetch('/api/auth/pin-status', { headers: { ...getAuthHeaders() } });
        const data = await res.json();
        if (data.hasPIN) {
          setPinRequired(true);
        } else {
          setPinUnlocked(true);
        }
      } catch {
        setPinUnlocked(true); // fail-open
      }
      setPinChecking(false);
    };
    checkPinGate();
  }, []);

  const startCooldown = useCallback((seconds: number) => {
    setGateCooldown(seconds);
    const interval = setInterval(() => {
      setGateCooldown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleGatePinChange = useCallback(async (val: string) => {
    setGatePin(val);
    setGateError('');

    if (val.length === 6) {
      try {
        const res = await fetch('/api/auth/verify-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ pin: val }),
        });
        const data = await res.json();

        if (res.ok && data.success) {
          sessionStorage.setItem('pin_unlocked', JSON.stringify({ timestamp: Date.now() }));
          setPinUnlocked(true);
        } else {
          const newAttempts = gateAttempts + 1;
          setGateAttempts(newAttempts);

          if (res.status === 429) {
            setGateError(data.error);
            startCooldown(30);
          } else if (newAttempts >= 3) {
            setGateError('Terlalu banyak percobaan');
            startCooldown(30);
          } else {
            setGateError(`PIN salah. ${3 - newAttempts} percobaan tersisa.`);
          }
          setTimeout(() => setGatePin(''), 600);
        }
      } catch {
        setGateError('Gagal memverifikasi PIN');
        setTimeout(() => setGatePin(''), 600);
      }
    }
  }, [gateAttempts, startCooldown]);

  const fetchStats = useCallback(async (year?: string) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      const yr = year !== undefined ? year : selectedYear;
      if (yr) params.set('year', yr);
      const res = await fetch(`/api/laporan/stats?${params}`, { headers: { ...getAuthHeaders() } });
      const result = await res.json();
      if (result.success) {
        setData(result.data);
        if (!selectedYear && result.data.hijriahYear) setSelectedYear(result.data.hijriahYear);
      } else {
        setError(result.error || 'Gagal memuat statistik');
      }
    } catch {
      setError('Gagal menghubungi server');
    }
    setLoading(false);
  }, [selectedYear]);

  useEffect(() => {
    fetchStats();
    // Check if a background sync (CRON or manual from JamaahPage) is running
    (async () => {
      try {
        const sr = await fetch('/api/laporan/sync-status', { headers: { ...getAuthHeaders() } });
        const st = await sr.json();
        if (st.success && st.data.isSyncing) {
          // If Phase 1 already done (completedYears populated), show stats immediately
          if (st.data.completedYears && st.data.completedYears.length > 0) {
            setBackgroundSyncing(false); // Don't block — Phase 1 data is ready
          } else {
            setBackgroundSyncing(true); // Block — Phase 1 still running
          }
          // Poll until sync finishes or Phase 1 completes
          bgPollRef.current = setInterval(async () => {
            try {
              const r = await fetch('/api/laporan/sync-status', { headers: { ...getAuthHeaders() }, signal: AbortSignal.timeout(10000) });
              const s = await r.json();
              if (s.success) {
                if (!s.data.isSyncing) {
                  // Sync fully done
                  setBackgroundSyncing(false);
                  if (bgPollRef.current) clearInterval(bgPollRef.current);
                  bgPollRef.current = null;
                  fetchStats(selectedYear);
                } else if (s.data.completedYears && s.data.completedYears.length > 0) {
                  // Phase 1 done — unblock and refresh stats
                  setBackgroundSyncing(false);
                  fetchStats(selectedYear);
                  // Keep polling until full sync done (for final refresh)
                }
              }
            } catch { /* ignore */ }
          }, 5000);
        }
      } catch { /* ignore */ }
    })();
    // Admin: fetch all company-wide years for Tren Daftar
    if (isAdmin) {
      fetch('/api/laporan/tren-daftar/years', { headers: { ...getAuthHeaders() } })
        .then(r => r.json())
        .then(json => { if (json.success) setAllYears(json.data); })
        .catch(() => {});
    }
  }, []);

  const initialMount = useRef(true);
  useEffect(() => {
    if (initialMount.current) { initialMount.current = false; return; }
    fetchStats(selectedYear);
  }, [selectedYear]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (bgPollRef.current) clearInterval(bgPollRef.current);
      onHeaderRight?.(null);
    };
  }, []);

  // Auto-refresh stats every 5 minutes
  useEffect(() => {
    const autoRef = setInterval(() => {
      if (!syncing && !loading) fetchStats(selectedYear);
    }, 5 * 60 * 1000);
    return () => clearInterval(autoRef);
  }, [syncing, loading, fetchStats, selectedYear]);

  // ── Auto-sync on first load if no data (umroh tab only) ──
  useEffect(() => {
    if (statTab !== 'umroh') return;
    if (!loading && !syncing && !hasAutoSynced.current && data && data.totalJamaah === 0) {
      hasAutoSynced.current = true;
      handleSync();
    }
  }, [loading, data, statTab]);

  // Hijriah years (Umroh + Tren tabs)
  const hijriahDropdownYears = useMemo(() => {
    if (!data) return [];
    const merged = [...new Set([...data.availableYears, ...allYears])];
    return merged.filter(y => Number(y) >= 1447).sort((a, b) => b.localeCompare(a));
  }, [data, allYears]);

  useEffect(() => {
    if (!onHeaderRight) return;

    if (statTab === 'haji') {
      if (hajiAvailableYears.length === 0) { onHeaderRight(null); return; }
      onHeaderRight(
        <select
          value={selectedYearMasehi}
          onChange={e => setSelectedYearMasehi(e.target.value)}
          className="h-8 text-[10px] font-bold text-gray-600 dark:text-slate-300 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-2 pr-6 outline-none appearance-none cursor-pointer shrink-0"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
        >
          {hajiAvailableYears.map(y => <option key={y} value={y}>{y} M</option>)}
        </select>
      );
      return;
    }

    // Umroh + Tren tabs use hijriah dropdown
    if (!data || hijriahDropdownYears.length === 0) { onHeaderRight(null); return; }
    onHeaderRight(
      <select
        value={selectedYear}
        onChange={e => setSelectedYear(e.target.value)}
        className="h-8 text-[10px] font-bold text-gray-600 dark:text-slate-300 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-2 pr-6 outline-none appearance-none cursor-pointer shrink-0"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
      >
        {hijriahDropdownYears.map(y => <option key={y} value={y}>{y} H</option>)}
      </select>
    );
  }, [statTab, data, selectedYear, selectedYearMasehi, hijriahDropdownYears, hajiAvailableYears, onHeaderRight]);

  // Sync handler
  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/laporan/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ hijriahYear: null }),
      });
      const result = await res.json();
      if (!result.success) { setSyncing(false); return; }
      if (result.data?.syncing) {
        if (pollRef.current) clearInterval(pollRef.current);
        let errorCount = 0;
        const pollStart = Date.now();

        pollRef.current = setInterval(async () => {
          // Max polling duration: 5 minutes
          if (Date.now() - pollStart > 5 * 60 * 1000) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setSyncing(false);
            fetchStats(selectedYear);
            return;
          }

          try {
            const sr = await fetch('/api/laporan/sync-status', {
              headers: { ...getAuthHeaders() },
              signal: AbortSignal.timeout(10000),
            });
            const st = await sr.json();
            errorCount = 0;
            if (st.success && !st.data.isSyncing) {
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;
              setSyncing(false);
              fetchStats(selectedYear);
            }
          } catch {
            errorCount++;
            if (errorCount >= 5) {
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;
              setSyncing(false);
              fetchStats(selectedYear);
            }
          }
        }, 3000);
      } else {
        setSyncing(false);
        fetchStats(selectedYear);
      }
    } catch { setSyncing(false); }
  };

  // Determine which view mode to show (no early returns to avoid React DOM conflicts)
  const isEmpty = !!(data && data.totalJamaah === 0 && !data.lastSync && !syncing && !backgroundSyncing);
  const showSkeleton = loading && !data;
  const showError = !!(error && !data);
  const showData = !!(data && !showSkeleton && !showError);

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const gridStroke = isDark ? '#1e293b' : '#f1f5f9';
  const chartData = data ? data.trend.map(t => ({ bulan: t.bulan, label: bulanLabel(t.bulan), count: t.count })) : [];
  const komisiChartData = data ? data.komisi.chartBulanan.map(t => ({ ...t, label: bulanLabel(t.bulan) })) : [];
  const depMonth = data && data.berangkatBulanIni.length > 0
    ? new Date(data.berangkatBulanIni[0].tgl_berangkat).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
    : '';
  const berangkatPreview = data ? data.berangkatBulanIni.slice(0, 3) : [];
  const outstandingPreview = data ? data.outstandingList.slice(0, 3) : [];

  const pinGateActive = pinRequired && !pinUnlocked && !pinChecking;

  return (
    <div className="max-w-lg mx-auto">

      {pinGateActive ? (
      /* ── PIN Gate View ── */
      <main className="max-w-lg mx-auto px-4 flex flex-col items-center" style={{ minHeight: 'calc(100vh - 53px)' }}>
        <div className="flex-1 flex flex-col items-center justify-center w-full pb-8">
          <div className="w-12 h-12 rounded-full bg-emerald-50/80 dark:bg-emerald-500/[0.06] border border-emerald-200 dark:border-emerald-500/[0.12] flex items-center justify-center mb-4">
            <Lock size={20} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-[15px] font-bold text-gray-800 dark:text-white mb-1">Masukkan PIN</h2>
          <p className="text-xs text-gray-400 dark:text-slate-500 mb-7">Untuk mengakses data Statistik</p>
          <PinInput value={gatePin} onChange={gateCooldown > 0 ? () => {} : handleGatePinChange} autoFocus error={!!gateError} />
          {gateError && <p className="text-xs text-red-500 dark:text-red-400 mt-3 text-center">{gateError}</p>}
          {gateCooldown > 0 && <p className="text-xs text-red-500 dark:text-red-400 mt-3">Coba lagi dalam {gateCooldown} detik</p>}
          <p className="text-[11px] text-gray-400 dark:text-slate-600 mt-7">
            Lupa PIN?{' '}
            <button onClick={() => {
              window.history.pushState({ tab: 'settings' }, '', '/dashboard/settings#pin-keamanan');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }} className="text-gray-500 dark:text-slate-500 underline underline-offset-2">
              Nonaktifkan di Profil
            </button>
          </p>
        </div>
        <div className="w-full pb-6">
          <button
            onClick={() => window.history.back()}
            className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl bg-gray-100/80 dark:bg-slate-800/80 text-gray-500 dark:text-slate-300 text-xs font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 active:scale-[0.97] transition-all"
          >
            <ArrowLeft size={15} />
            Kembali
          </button>
        </div>
      </main>
      ) : (
      <div>

      {/* ── Loading ── */}
      {showSkeleton && <StatistikSkeleton />}

      {/* ── Error ── */}
      {showError && (
        <div className="px-4 pt-6">
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-2xl text-center">
            <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-3">{error}</p>
            <button onClick={() => fetchStats(selectedYear)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-red-500 text-white shadow-md shadow-red-500/20 hover:bg-red-600 transition-all active:scale-95">
              Coba Lagi
            </button>
          </div>
        </div>
      )}



      {/* ── Data view ── */}
      {showData && data && (
      <>

      {/* ── Tab Bar (Umroh + Haji always; Tren admin-only) ── */}
      <div className="sticky top-[53px] z-20 bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700">
        <div className="px-4 py-2">
          <div className="flex gap-1 p-1 bg-gray-100 dark:bg-slate-800 rounded-xl w-full">
            {([
              { id: 'umroh' as const, label: 'Umroh', Icon: BarChart3 },
              { id: 'haji' as const, label: 'Haji', Icon: Plane },
              ...(isAdmin ? [{ id: 'tren' as const, label: 'Tren Daftar', Icon: TrendingUp }] : []),
            ]).map(tab => {
              const active = statTab === tab.id;
              return (
                <button key={tab.id} onClick={() => {
                  setStatTab(tab.id);
                  window.scrollTo({ top: 0 });
                  const slug = tab.id === 'tren' ? '/dashboard/statistik/tren-daftar'
                    : tab.id === 'haji' ? '/dashboard/statistik/haji'
                    : '/dashboard/statistik';
                  window.history.replaceState({ tab: 'statistik' }, '', slug);
                }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all duration-200 active:opacity-70 ${
                    active ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-500 dark:text-emerald-400 font-semibold' : 'bg-transparent text-gray-400 dark:text-slate-500 font-medium'
                  }`}
                  style={active ? { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : undefined}
                >
                  <tab.Icon size={13} strokeWidth={2.2} />
                  <span className="text-[11px]">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Ringkasan Tab (existing content) ── */}
      {statTab === 'umroh' && (
        isEmpty ? (
          <div className="px-4 pt-10 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center">
              <Users size={28} className="text-gray-300 dark:text-slate-600" />
            </div>
            <p className="text-sm font-semibold text-gray-600 dark:text-slate-300">Belum ada data jamaah</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Sync di halaman Jamaah dulu.</p>
          </div>
        ) : (
      <div className={`px-4 pt-4 pb-8 space-y-3 transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`}>

      {/* ── 1. Headline Stats ── */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Total Jamaah */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center border border-emerald-100 dark:border-emerald-800/40 mb-2">
            <Users size={16} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-gray-800 dark:text-white">{data.totalJamaah}</p>
          <p className="text-[10px] text-gray-400 dark:text-slate-400 font-medium">Total Jamaah</p>
          <DiffBadge diff={data.comparison.totalJamaah.diff} />
        </div>

        {/* Komisi Cair */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center border border-emerald-100 dark:border-emerald-800/40 mb-2">
            <Wallet size={16} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{fmtRpShort(data.komisi.sudahCair)}</p>
          <p className="text-[10px] text-gray-400 dark:text-slate-400 font-medium">Komisi Cair</p>
        </div>

        {/* Berangkat Segera */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center border border-blue-100 dark:border-blue-800/40 mb-2">
            <Plane size={16} className="text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-gray-800 dark:text-white">{data.berangkatSegera}</p>
          <p className="text-[10px] text-gray-400 dark:text-slate-400 font-medium">Berangkat Segera</p>
          {data.berangkatBulan && (
            <p className="text-[9px] text-gray-400 dark:text-slate-500 mt-0.5">{data.berangkatBulan}</p>
          )}
        </div>

        {/* Jamaah Baru */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3.5">
          <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center border border-violet-100 dark:border-violet-800/40 mb-2">
            <UserPlus size={16} className="text-violet-600 dark:text-violet-400" />
          </div>
          <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">+{data.jamaahBaru}</p>
          <p className="text-[10px] text-gray-400 dark:text-slate-400 font-medium">Jamaah Baru · bulan ini</p>
          <DiffBadge diff={data.comparison.jamaahBaru.diff} />
        </div>
      </div>

      {/* ── 2. Estimasi Komisi ── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <span className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wide">Estimasi Komisi</span>
          <span className="text-[10px] text-gray-400 dark:text-slate-400">{data.totalJamaah} jamaah</span>
        </div>
        <div className="px-4 pb-3">
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{fmtRp(data.komisi.totalKomisi)}</p>
          <p className="text-[10px] text-gray-400 dark:text-slate-400 mt-0.5">Total estimasi komisi</p>
        </div>
        {/* 3-segment bar */}
        <div className="px-4 pb-2">
          <div className="h-3 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden flex">
            {data.komisi.totalKomisi > 0 && (
              <>
                <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${Math.round(data.komisi.sudahCair / data.komisi.totalKomisi * 100)}%` }} />
                <div className="h-full bg-blue-400 transition-all duration-500" style={{ width: `${Math.round(data.komisi.belumCair / data.komisi.totalKomisi * 100)}%` }} />
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
            <span className="flex items-center gap-1.5 text-[10px]"><span className="w-2 h-2 rounded-full bg-emerald-500" /><span className="font-medium text-gray-600 dark:text-slate-300">Sudah Cair</span></span>
            <span className="flex items-center gap-1.5 text-[10px]"><span className="w-2 h-2 rounded-full bg-blue-400" /><span className="font-medium text-gray-600 dark:text-slate-300">Belum Cair</span></span>
            <span className="flex items-center gap-1.5 text-[10px]"><span className="w-2 h-2 rounded-full bg-gray-200 dark:bg-slate-600" /><span className="font-medium text-gray-600 dark:text-slate-300">Potensi</span></span>
          </div>
        </div>
        {/* Detail rows */}
        <div className="px-4 pb-3 space-y-2">
          <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800/40 px-3 py-2.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              Sudah Cair <span className="text-[10px] font-normal text-emerald-600/70 dark:text-emerald-400/60 ml-1">({data.komisi.sudahCairCount} jamaah)</span>
            </span>
            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{fmtRp(data.komisi.sudahCair)}</span>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/40 px-3 py-2.5 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                Belum Cair <span className="text-[10px] font-normal text-blue-600/70 dark:text-blue-400/60 ml-1">({data.komisi.belumCairCount} jamaah)</span>
              </span>
              <p className="text-[9px] text-blue-500/70 dark:text-blue-400/50">Lunas, menunggu keberangkatan</p>
            </div>
            <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{fmtRp(data.komisi.belumCair)}</span>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800/40 px-3 py-2.5 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                Potensi <span className="text-[10px] font-normal text-amber-600/70 dark:text-amber-400/60 ml-1">({data.komisi.potensiCount} jamaah)</span>
              </span>
              <p className="text-[9px] text-amber-500/70 dark:text-amber-400/50">Jika jamaah melunasi pembayaran</p>
            </div>
            <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{fmtRp(data.komisi.potensi)}</span>
          </div>
        </div>
        {/* Komisi Cair per Bulan chart */}
        <div className="border-t border-gray-50 dark:border-slate-700/50">
          <div className="px-4 pt-3 pb-1">
            <p className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Komisi Cair Per Bulan</p>
            <p className="text-[10px] text-gray-400 dark:text-slate-500">Berdasarkan tanggal keberangkatan, 7 bulan terakhir</p>
          </div>
          {komisiChartData.every(c => c.total === 0) ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[11px] text-gray-400 dark:text-slate-500">Belum ada data keberangkatan</p>
            </div>
          ) : (
            <div className="px-2 pb-3">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={komisiChartData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                    tickFormatter={(v: number) => v >= 1000000 ? `${v / 1000000}jt` : String(v)} />
                  <Tooltip content={<KomisiTooltip />} />
                  <Bar dataKey="total" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── 3. Tren Jamaah Baru ── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-700/50">
          <p className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wide">Tren Jamaah Baru</p>
          <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">Berdasarkan tanggal pendaftaran, 7 bulan terakhir</p>
        </div>
        {chartData.length === 0 ? (
          <div className="px-4 py-8 text-center"><p className="text-xs text-gray-400 dark:text-slate-500">Belum ada data pendaftaran</p></div>
        ) : (
          <div className="px-2 py-3">
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={chartData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="emeraldGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid horizontal vertical={false} strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<TrendTooltip />} />
                <Area type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2.5} fill="url(#emeraldGrad)"
                  dot={{ r: 3.5, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── 4. Berangkat Mendatang ── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-700/50 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wide">Berangkat Mendatang</p>
            {data.berangkatBulanIni.length > 0 && (
              <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">{data.berangkatBulanIni.length} jamaah · {depMonth}</p>
            )}
          </div>
          <Plane size={16} className="text-blue-500 dark:text-blue-400" />
        </div>
        {data.berangkatBulanIni.length === 0 ? (
          <div className="px-4 py-6 text-center"><p className="text-sm text-gray-400 dark:text-slate-500">Tidak ada keberangkatan mendatang</p></div>
        ) : (
          <>
            <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
              {berangkatPreview.map((item, i) => <BerangkatRow key={i} item={item} />)}
            </div>
            {data.berangkatBulanIni.length > 3 && (
              <button onClick={() => setShowBerangkatModal(true)}
                className="w-full py-2.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20 transition-colors border-t border-gray-50 dark:border-slate-700/50 flex items-center justify-center gap-1">
                Lihat semua {data.berangkatBulanIni.length} jamaah <ChevronDown size={12} />
              </button>
            )}
          </>
        )}
      </div>

      {/* ── 5. Jamaah Belum Lunas ── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-700/50 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wide">Jamaah Belum Lunas</p>
            <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">{data.outstandingList.length} jamaah belum lunas</p>
          </div>
          <span className="text-xs font-bold text-amber-600 dark:text-amber-400">{fmtRpShort(data.totalOutstanding)}</span>
        </div>
        {data.outstandingList.length === 0 ? (
          <div className="px-4 py-6 text-center"><p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">Semua jamaah sudah lunas ✓</p></div>
        ) : (
          <>
            <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
              {outstandingPreview.map((item, i) => <OutstandingRow key={i} item={item} />)}
            </div>
            {data.outstandingList.length > 3 && (
              <button onClick={() => setShowOutstandingModal(true)}
                className="w-full py-2.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20 transition-colors border-t border-gray-50 dark:border-slate-700/50 flex items-center justify-center gap-1">
                Lihat semua {data.outstandingList.length} jamaah <ChevronDown size={12} />
              </button>
            )}
          </>
        )}
      </div>

      {/* ── 6. Status Pembayaran ── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wide">Status Pembayaran</span>
          <span className="text-[10px] text-gray-400 dark:text-slate-500">{data.totalJamaah} jamaah</span>
        </div>
        <div className="h-3 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500" style={{ width: `${data.lunasPercent}%` }} />
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />{data.lunas} Lunas ({data.lunasPercent}%)
          </span>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-slate-600" />{data.belumLunas} Belum ({100 - data.lunasPercent}%)
          </span>
        </div>
        {data.totalOutstanding > 0 && (
          <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800/40 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-gray-600 dark:text-slate-300">Jumlah Belum Lunas</span>
            <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{fmtRp(data.totalOutstanding)}</span>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] text-gray-300 dark:text-slate-500">Data per sync terakhir · {fmtSync(data.lastSync)}</span>
        <button onClick={handleSync} disabled={syncing}
          className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors disabled:opacity-50">
          <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
          <span className={syncing ? 'animate-pulse' : ''}>{syncing ? 'Syncing...' : 'Sync Ulang'}</span>
        </button>
      </div>

      {/* ── Modals ── */}
      <StatListModal isOpen={showBerangkatModal} onClose={() => setShowBerangkatModal(false)}
        title="Berangkat Mendatang" subtitle={`${data.berangkatBulanIni.length} jamaah · ${depMonth}`}>
        <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
          {data.berangkatBulanIni.map((item, i) => <BerangkatRow key={i} item={item} />)}
        </div>
      </StatListModal>

      <StatListModal isOpen={showOutstandingModal} onClose={() => setShowOutstandingModal(false)}
        title="Jamaah Belum Lunas" subtitle={`${data.outstandingList.length} jamaah · ${fmtRpShort(data.totalOutstanding)}`}>
        <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
          {data.outstandingList.map((item, i) => <OutstandingRow key={i} item={item} />)}
        </div>
      </StatListModal>
      </div>
        )
      )}

      {/* ── Haji Tab ── */}
      {statTab === 'haji' && (
        <Suspense fallback={
          <div className="px-4 pt-4 pb-8 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {[1,2,3,4].map(i => <div key={i} className="h-24 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />)}
            </div>
            <div className="h-52 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />
            <div className="h-40 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />
          </div>
        }>
          <StatistikHajiSection
            selectedYear={selectedYearMasehi}
            onYearsLoaded={(years) => {
              setHajiAvailableYears(years);
              if (!selectedYearMasehi && years.length > 0) {
                setSelectedYearMasehi(years[0]);
              }
            }}
          />
        </Suspense>
      )}

      {/* ── Tren Daftar Tab ── */}
      {isAdmin && statTab === 'tren' && (
        <Suspense fallback={
          <div className="px-4 pt-4 pb-8 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {[1,2,3,4].map(i => <div key={i} className="h-24 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />)}
            </div>
            <div className="h-52 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />
            <div className="h-40 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />
          </div>
        }>
          <TrenDaftarSection selectedYear={selectedYear} />
        </Suspense>
      )}
      </>
      )}
      </div>
      )}
    </div>
  );
}

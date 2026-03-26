import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Clock, MessageSquare, CheckCircle,
  Search, ChevronDown, Trash2, X, ChevronUp, Send, UserPlus,
} from 'lucide-react';
import { getAuthHeaders, getStoredSession } from './LoginPage';

// ── Types ──

interface QuizLead {
  id: string;
  agent_slug: string;
  nama: string;
  wa: string;
  answers: {
    departure?: string;
    packageClass?: string;
    destination?: string;
    budget?: string;
    priority?: string[];
    room?: string;
    pax?: string;
  };
  recommended: {
    jadwal_id?: string;
    name?: string;
    price?: number | string;
    match?: number;
  }[];
  status: 'baru' | 'dihubungi' | 'closing' | 'tidak_berminat';
  created_at: string;
}

interface LeadStats {
  total: number;
  baru: number;
  dihubungi: number;
  closing: number;
  tidak_berminat: number;
}

type FilterStatus = 'all' | 'baru' | 'dihubungi' | 'closing' | 'tidak_berminat';

// ── Status config ──

const STATUS_CONFIG: Record<string, { label: string; color: string; bgLight: string; bgDark: string; borderLight: string; borderDark: string; dotColor: string }> = {
  baru: { label: 'Baru', color: 'text-blue-500', bgLight: 'bg-blue-50', bgDark: 'dark:bg-blue-900/20', borderLight: 'border-blue-100', borderDark: 'dark:border-blue-800/40', dotColor: 'bg-blue-500' },
  dihubungi: { label: 'Dihubungi', color: 'text-amber-500', bgLight: 'bg-amber-50', bgDark: 'dark:bg-amber-900/20', borderLight: 'border-amber-100', borderDark: 'dark:border-amber-800/40', dotColor: 'bg-amber-500' },
  closing: { label: 'Closing', color: 'text-emerald-500', bgLight: 'bg-emerald-50', bgDark: 'dark:bg-emerald-900/20', borderLight: 'border-emerald-100', borderDark: 'dark:border-emerald-800/40', dotColor: 'bg-emerald-500' },
  tidak_berminat: { label: 'Tidak Berminat', color: 'text-gray-400', bgLight: 'bg-gray-50', bgDark: 'dark:bg-gray-800/30', borderLight: 'border-gray-200', borderDark: 'dark:border-gray-700/40', dotColor: 'bg-gray-400' },
};

const PRIORITY_MAP: Record<string, string> = {
  hotel: 'Hotel Dekat Masjid',
  duration: 'Durasi Lebih Lama',
  soon: 'Keberangkatan Cepat',
  flexible: 'Jadwal Fleksibel',
  // backward compat
  price: 'Harga Terjangkau',
  airline: 'Maskapai Nyaman',
  schedule: 'Jadwal Fleksibel',
};

// ── Display formatters (for backward compat with raw data in DB) ──

const BULAN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function formatDeparture(raw: string): string {
  if (!raw || raw === '-') return '-';
  if (raw === 'flexible') return 'Fleksibel';
  const rangeMatch = raw.match(/(\d{4})-(\d{1,2})_(\d{4})-(\d{1,2})/);
  if (rangeMatch) {
    const [, y1, m1, y2, m2] = rangeMatch;
    const bulan1 = BULAN[parseInt(m1)] || m1;
    const bulan2 = BULAN[parseInt(m2)] || m2;
    if (y1 === y2) return `${bulan1} – ${bulan2} ${y1}`;
    return `${bulan1} ${y1} – ${bulan2} ${y2}`;
  }
  const singleMatch = raw.match(/(\d{4})-(\d{1,2})/);
  if (singleMatch) {
    const [, y, m] = singleMatch;
    return `${BULAN[parseInt(m)] || m} ${y}`;
  }
  return raw;
}

function formatBudget(raw: string): string {
  if (!raw || raw === '-') return '-';
  if (raw === 'flexible') return 'Fleksibel';
  const match = raw.match(/^(\d+)-(\d+)$/);
  if (match) {
    const low = parseInt(match[1]);
    const high = parseInt(match[2]);
    const fmtJt = (n: number) => {
      const jt = n / 1000000;
      return jt % 1 === 0 ? `${jt}jt` : `${jt.toFixed(1)}jt`;
    };
    if (low === 0) return `Di bawah ${fmtJt(high)}`;
    return `${fmtJt(low)} – ${fmtJt(high)}`;
  }
  return raw;
}

function formatRoom(raw: string): string {
  const map: Record<string, string> = {
    quad: 'Quad (4 orang)',
    triple: 'Triple (3 orang)',
    double: 'Double (2 orang)',
    unsure: 'Belum tahu',
  };
  return map[raw?.toLowerCase()] || raw || '-';
}

function formatPax(raw: string): string {
  const map: Record<string, string> = {
    '1': 'Sendiri',
    '2': '2 orang',
    '3-5': '3–5 orang',
    '6+': '6+ orang',
  };
  return map[raw] || raw || '-';
}

function formatPackageClass(raw: string): string {
  const map: Record<string, string> = { hemat: 'Hemat / Promo', reguler: 'Reguler', premium: 'Premium / VIP', all: 'Semua' };
  return map[raw?.toLowerCase()] || raw || '-';
}

function formatDestination(raw: string): string {
  const map: Record<string, string> = { umroh_only: 'Umroh Saja', plus_turki: 'Plus Turki', plus_other: 'Plus Dubai / Lainnya', all: 'Semua' };
  return map[raw?.toLowerCase()] || raw || '-';
}

function formatPrice(price: number | string | undefined): string {
  if (!price) return '-';
  if (typeof price === 'string') {
    if (price.startsWith('Rp')) return price;
    const num = parseInt(price);
    if (!isNaN(num)) return `Rp ${new Intl.NumberFormat('id-ID').format(num)}`;
    return price;
  }
  return `Rp ${new Intl.NumberFormat('id-ID').format(price)}`;
}

function formatWa(wa: string): string {
  if (!wa) return '-';
  const clean = wa.replace(/\D/g, '');
  if (clean.startsWith('62')) {
    const rest = clean.slice(2);
    return `+62 ${rest.slice(0, 3)}-${rest.slice(3, 7)}-${rest.slice(7)}`;
  }
  return wa;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Baru saja';
  if (mins < 60) return `${mins} menit lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} jam lalu`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} hari lalu`;
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

// ── Component ──

export default function LeadsPage() {
  const [leads, setLeads] = useState<QuizLead[]>([]);
  const [stats, setStats] = useState<LeadStats>({ total: 0, baru: 0, dihubungi: 0, closing: 0, tidak_berminat: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QuizLead | null>(null);
  const [deleteClosing, setDeleteClosing] = useState(false);
  const [statusDropdownId, setStatusDropdownId] = useState<string | null>(null);
  const [waSheetLead, setWaSheetLead] = useState<QuizLead | null>(null);
  const [waSheetClosing, setWaSheetClosing] = useState(false);
  const agentName = getStoredSession()?.user?.name || 'Alhijaz';

  // Mark leads as seen (reset badge) when this page mounts
  useEffect(() => {
    const slug = getStoredSession()?.user?.slug;
    if (slug) localStorage.setItem(`leads_last_seen_${slug}`, new Date().toISOString());
  }, []);

  // Body scroll lock for WA template sheet
  useEffect(() => {
    if (waSheetLead) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [waSheetLead]);

  const closeWaSheet = useCallback(() => {
    setWaSheetClosing(true);
    setTimeout(() => {
      setWaSheetLead(null);
      setWaSheetClosing(false);
    }, 200);
  }, []);

  const openWaTemplate = useCallback((lead: QuizLead, message: string) => {
    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/${lead.wa}?text=${encoded}`, '_blank');
    setWaSheetClosing(true);
    setTimeout(() => {
      setWaSheetLead(null);
      setWaSheetClosing(false);
    }, 200);
  }, []);

  // Fetch data
  const fetchLeads = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('status', filter);
      if (search) params.set('search', search);
      params.set('limit', '100');

      const res = await fetch(`/api/leads?${params}`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (json.success) setLeads(json.data);
    } catch {
      // silent
    }
  }, [filter, search]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/leads/stats', { headers: getAuthHeaders() });
      const json = await res.json();
      if (json.success) setStats(json.data);
    } catch {
      // silent
    }
  }, []);

  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (!initialLoadDone.current) setLoading(true);
    Promise.all([fetchLeads(), fetchStats()]).finally(() => {
      setLoading(false);
      initialLoadDone.current = true;
    });
  }, [fetchLeads, fetchStats]);

  // Status update
  const updateStatus = useCallback(async (id: string, status: string) => {
    try {
      await fetch(`/api/leads/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ status }),
      });
      setLeads(prev => prev.map(l => l.id === id ? { ...l, status: status as QuizLead['status'] } : l));
      setStatusDropdownId(null);
      fetchStats();
    } catch {
      // silent
    }
  }, [fetchStats]);

  // Delete
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await fetch(`/api/leads/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      setLeads(prev => prev.filter(l => l.id !== deleteTarget.id));
      setDeleteClosing(true);
      setTimeout(() => {
        setDeleteTarget(null);
        setDeleteClosing(false);
      }, 200);
      fetchStats();
    } catch {
      // silent
    }
  }, [deleteTarget, fetchStats]);

  const closeDeleteModal = useCallback(() => {
    setDeleteClosing(true);
    setTimeout(() => {
      setDeleteTarget(null);
      setDeleteClosing(false);
    }, 200);
  }, []);

  // Stat cards config
  const statCards: { key: FilterStatus; label: string; icon: React.ElementType; color: string; activeColor: string; value: number }[] = [
    { key: 'all', label: 'SEMUA', icon: User, color: 'text-gray-500', activeColor: 'border-emerald-500', value: stats.total },
    { key: 'baru', label: 'BARU', icon: Clock, color: 'text-blue-500', activeColor: 'border-blue-500', value: stats.baru },
    { key: 'dihubungi', label: 'PROSES', icon: MessageSquare, color: 'text-amber-500', activeColor: 'border-amber-500', value: stats.dihubungi },
    { key: 'closing', label: 'CLOSING', icon: CheckCircle, color: 'text-emerald-500', activeColor: 'border-emerald-500', value: stats.closing },
  ];

  return (
    <div className="px-4 pt-4 pb-8 max-w-lg mx-auto">
      {/* Stat filter cards */}
      {loading ? (
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-3 text-center">
              <div className="w-7 h-7 rounded-lg bg-gray-200 dark:bg-slate-700 animate-pulse mx-auto mb-1.5" />
              <div className="h-6 w-8 bg-gray-200 dark:bg-slate-700 animate-pulse rounded-md mx-auto mb-1" />
              <div className="h-2 w-10 bg-gray-100 dark:bg-slate-700 animate-pulse rounded mx-auto" />
            </div>
          ))}
        </div>
      ) : (
      <div className="grid grid-cols-4 gap-2 mb-3">
        {statCards.map(card => {
          const Icon = card.icon;
          const isActive = filter === card.key;
          return (
            <button
              key={card.key}
              onClick={() => setFilter(f => f === card.key ? 'all' : card.key)}
              className={`bg-white dark:bg-slate-800 rounded-2xl border shadow-sm p-3 text-center transition-all duration-200 active:scale-95 ${
                isActive
                  ? `border-2 ${card.activeColor} scale-[1.02] shadow-sm`
                  : 'border-gray-100 dark:border-slate-700'
              }`}
              style={isActive ? { boxShadow: `0 0 0 3px ${card.key === 'all' ? '#10b98122' : card.key === 'baru' ? '#3b82f622' : card.key === 'dihubungi' ? '#f59e0b22' : '#10b98122'}` } : undefined}
            >
              <div className={`w-7 h-7 mx-auto rounded-lg flex items-center justify-center border mb-1.5 ${
                isActive
                  ? card.key === 'all' ? 'bg-emerald-500 border-emerald-500' : card.key === 'baru' ? 'bg-blue-500 border-blue-500' : card.key === 'dihubungi' ? 'bg-amber-500 border-amber-500' : 'bg-emerald-500 border-emerald-500'
                  : card.key === 'all' ? 'bg-gray-50 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700' : card.key === 'baru' ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/40' : card.key === 'dihubungi' ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800/40' : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/40'
              }`}>
                <Icon size={14} className={isActive ? 'text-white' : card.color} strokeWidth={2} />
              </div>
              <p className="text-2xl font-bold text-gray-800 dark:text-white">{card.value}</p>
              <p className="text-[9px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">{card.label}</p>
            </button>
          );
        })}
      </div>
      )}

      {/* Search bar */}
      {loading ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm h-11 mb-3 animate-pulse" />
      ) : (
      <>
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm flex items-center gap-2 px-3 h-11 mb-1">
        <Search size={16} className="text-gray-400 dark:text-slate-500 flex-shrink-0" />
        <input
          type="text"
          placeholder="Cari nama lead..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-transparent text-sm text-gray-800 dark:text-white placeholder-gray-300 dark:placeholder-slate-600 outline-none"
        />
        {filter !== 'all' && (
          <button
            onClick={() => setFilter('all')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold ${STATUS_CONFIG[filter]?.bgLight || 'bg-gray-50'} ${STATUS_CONFIG[filter]?.bgDark || ''} border ${STATUS_CONFIG[filter]?.borderLight || 'border-gray-100'} ${STATUS_CONFIG[filter]?.borderDark || ''} ${STATUS_CONFIG[filter]?.color || 'text-gray-500'}`}
          >
            {STATUS_CONFIG[filter]?.label || filter}
            <X size={10} />
          </button>
        )}
      </div>
      <div className="text-[10px] text-gray-400 dark:text-slate-500 text-center mb-3">
        {stats.total} lead · Terakhir diperbarui: baru saja
      </div>
      </>
      )}

      {/* Lead cards */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-slate-700 animate-pulse" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="h-3.5 w-16 bg-gray-200 dark:bg-slate-700 animate-pulse rounded-md" />
                    <div className="h-4 w-12 bg-gray-100 dark:bg-slate-700 animate-pulse rounded-md" />
                  </div>
                  <div className="h-2.5 w-32 bg-gray-100 dark:bg-slate-700 animate-pulse rounded" />
                </div>
                <div className="w-4 h-4 bg-gray-100 dark:bg-slate-700 animate-pulse rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm py-12 px-4 text-center">
          {(filter !== 'all' || search) ? (
            <>
              <div className="w-12 h-12 rounded-2xl bg-gray-50 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
                <Search size={22} strokeWidth={1.5} className="text-gray-300 dark:text-slate-500" />
              </div>
              <p className="text-sm font-semibold text-gray-400 dark:text-slate-500">Tidak ditemukan</p>
              <p className="text-[11px] text-gray-300 dark:text-slate-600 mt-1">Coba ubah filter atau kata kunci pencarian</p>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-2xl bg-gray-50 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
                <UserPlus size={22} strokeWidth={1.5} className="text-gray-300 dark:text-slate-500" />
              </div>
              <p className="text-sm font-semibold text-gray-400 dark:text-slate-500">Belum ada lead</p>
              <p className="text-[11px] text-gray-300 dark:text-slate-600 mt-1">Lead akan muncul saat calon jamaah mengisi quiz di halaman Anda</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {leads.map(lead => {
            const isExpanded = expandedId === lead.id;
            const sc = STATUS_CONFIG[lead.status] || STATUS_CONFIG.baru;
            const initial = lead.nama.charAt(0).toUpperCase();

            // Avatar gradient by status
            const avatarGradient = lead.status === 'baru' ? 'from-blue-400 to-blue-500'
              : lead.status === 'dihubungi' ? 'from-amber-400 to-amber-500'
              : lead.status === 'closing' ? 'from-emerald-400 to-emerald-500'
              : 'from-gray-300 to-gray-400';

            return (
              <div key={lead.id} className={`bg-white dark:bg-slate-800 rounded-2xl border shadow-sm overflow-hidden transition-all duration-200 ${
                    isExpanded
                      ? 'border-blue-200 dark:border-blue-800/40 shadow-md shadow-blue-500/5'
                      : 'border-gray-100 dark:border-slate-700'
                  }`}>
                {/* Collapsed header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : lead.id)}
                  className="w-full flex items-center gap-2.5 p-3 text-left active:bg-gray-50 dark:active:bg-slate-700/50 transition-colors"
                >
                  {/* Avatar */}
                  <div className="relative w-10 h-10 flex-shrink-0">
                    <div className={`w-full h-full rounded-full bg-gradient-to-br ${avatarGradient} flex items-center justify-center ring-2 ${
                      lead.status === 'baru' ? 'ring-blue-300 dark:ring-blue-500'
                      : lead.status === 'dihubungi' ? 'ring-amber-300 dark:ring-amber-500'
                      : lead.status === 'closing' ? 'ring-emerald-300 dark:ring-emerald-500'
                      : 'ring-gray-200 dark:ring-slate-600'
                    }`}>
                      <span className="text-white text-sm font-bold">{initial}</span>
                    </div>
                    {lead.status === 'baru' && (
                      <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-blue-500 border-2 border-white dark:border-slate-800" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-800 dark:text-white truncate">{lead.nama}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${sc.bgLight} ${sc.bgDark} ${sc.color}`}>
                        {sc.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 dark:text-slate-500 truncate mt-0.5">
                      {formatBudget(lead.answers?.budget || '')} · {formatDeparture(lead.answers?.departure || '')}
                    </p>
                  </div>

                  {/* Chevron */}
                  <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="text-gray-300 dark:text-slate-600 shrink-0"
                  >
                    <ChevronDown size={14} />
                  </motion.div>
                </button>

                {/* Expanded content */}
                <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    key="expanded-content"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{
                      height: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
                      opacity: { duration: 0.2, ease: 'easeInOut' }
                    }}
                    style={{ overflow: 'hidden' }}
                  >
                  <div className="border-t border-gray-50 dark:border-slate-700/50">
                  <div className="px-3 pb-3 pt-2 space-y-3">
                    {/* Meta */}
                    <p className="text-[10px] text-gray-400 dark:text-slate-500">
                      🕐 {timeAgo(lead.created_at)} · 📱 {formatWa(lead.wa)}
                    </p>

                    {/* Quiz answers */}
                    <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-2">Jawaban Quiz</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl border border-gray-100 dark:border-slate-600/50 p-2">
                        <p className="text-[9px] uppercase text-gray-400 dark:text-slate-500 font-bold">Keberangkatan</p>
                        <p className="text-xs font-semibold text-gray-800 dark:text-white mt-0.5">{formatDeparture(lead.answers?.departure || '')}</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl border border-gray-100 dark:border-slate-600/50 p-2">
                        <p className="text-[9px] uppercase text-gray-400 dark:text-slate-500 font-bold">Budget</p>
                        <p className="text-xs font-semibold text-gray-800 dark:text-white mt-0.5">{formatBudget(lead.answers?.budget || '')}</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl border border-gray-100 dark:border-slate-600/50 p-2">
                        <p className="text-[9px] uppercase text-gray-400 dark:text-slate-500 font-bold">Kelas Paket</p>
                        <p className="text-xs font-semibold text-gray-800 dark:text-white mt-0.5">{formatPackageClass(lead.answers?.packageClass || '')}</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl border border-gray-100 dark:border-slate-600/50 p-2">
                        <p className="text-[9px] uppercase text-gray-400 dark:text-slate-500 font-bold">Destinasi</p>
                        <p className="text-xs font-semibold text-gray-800 dark:text-white mt-0.5">{formatDestination(lead.answers?.destination || '')}</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl border border-gray-100 dark:border-slate-600/50 p-2">
                        <p className="text-[9px] uppercase text-gray-400 dark:text-slate-500 font-bold">Tipe Kamar</p>
                        <p className="text-xs font-semibold text-gray-800 dark:text-white mt-0.5">{formatRoom(lead.answers?.room || '')}</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl border border-gray-100 dark:border-slate-600/50 p-2">
                        <p className="text-[9px] uppercase text-gray-400 dark:text-slate-500 font-bold">Rombongan</p>
                        <p className="text-xs font-semibold text-gray-800 dark:text-white mt-0.5">{formatPax(lead.answers?.pax || '')}</p>
                      </div>
                    </div>
                    </div>

                    {/* Priority tags */}
                    {lead.answers?.priority && lead.answers.priority.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {lead.answers.priority.map(p => (
                          <span key={p} className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 rounded-md px-2 py-0.5 text-[10px] font-semibold text-emerald-500 dark:text-emerald-400">
                            🎯 {PRIORITY_MAP[p] || p}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Recommended packages */}
                    {lead.recommended && lead.recommended.length > 0 && (
                      <div>
                        <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl border border-gray-100 dark:border-slate-600/50 overflow-hidden">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500 px-2.5 py-2 border-b border-gray-100 dark:border-slate-600/50">
                            Paket Ditampilkan
                          </p>
                          {lead.recommended.map((rec, i) => (
                            <div key={i} className={`flex items-center justify-between px-2.5 py-2 ${i === 0 ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''} ${i < lead.recommended.length - 1 ? 'border-b border-gray-100/50 dark:border-slate-600/30' : ''}`}>
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-semibold text-gray-800 dark:text-white truncate">{rec.name || '-'}</p>
                                <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                  {formatPrice(rec.price)}
                                </p>
                              </div>
                              {rec.match && (
                                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0 ml-2 ${rec.match >= 90 ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'}`}>
                                  {rec.match}%
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action row */}
                    <div className="flex items-center gap-1.5 h-9">
                      {/* WhatsApp split button */}
                      <div className="flex-[5] flex h-full rounded-xl overflow-hidden" style={{ boxShadow: '0 4px 12px rgba(16,185,129,0.2)' }}>
                        <a
                          href={`https://wa.me/${lead.wa}?text=${encodeURIComponent(`Assalamualaikum ${lead.nama}, saya ${agentName} dari Alhijaz \u{1F60A}\n\nSaya lihat Anda tertarik dengan paket umroh sekitar bulan ${formatDeparture(lead.answers?.departure || '')}. Kebetulan ada beberapa pilihan bagus yang pas dengan keinginan Anda.\n\nBoleh saya bantu jelaskan lebih lanjut?`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold transition-all active:scale-95"
                        >
                          <svg className="w-3.5 h-3.5 fill-white" viewBox="0 0 24 24">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                          </svg>
                          WhatsApp
                        </a>
                        <button
                          onClick={() => setWaSheetLead(lead)}
                          className="w-8 flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 border-l border-white/20 text-white transition-all active:scale-95"
                        >
                          <ChevronUp size={12} />
                        </button>
                      </div>

                      {/* Status dropdown */}
                      <div className="relative">
                        <button
                          onClick={() => setStatusDropdownId(statusDropdownId === lead.id ? null : lead.id)}
                          className="flex items-center gap-1.5 h-9 px-2.5 rounded-xl bg-gray-50 dark:bg-slate-700/50 border border-gray-200 dark:border-slate-600 text-xs font-semibold text-gray-600 dark:text-slate-300 transition-all active:scale-95"
                        >
                          <div className={`w-2 h-2 rounded-full ${sc.dotColor}`} />
                          <span className="hidden sm:inline">{sc.label}</span>
                          <ChevronDown size={12} />
                        </button>

                        {statusDropdownId === lead.id && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setStatusDropdownId(null)} />
                            <div className="absolute bottom-full right-0 mb-1 z-50 bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 shadow-xl overflow-hidden min-w-[140px]">
                              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                                <button
                                  key={key}
                                  onClick={() => updateStatus(lead.id, key)}
                                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors ${lead.status === key ? cfg.color : 'text-gray-600 dark:text-slate-300'}`}
                                >
                                  <div className={`w-2 h-2 rounded-full ${cfg.dotColor}`} />
                                  {cfg.label}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Delete button */}
                      <button
                        onClick={() => setDeleteTarget(lead)}
                        className="w-9 h-9 flex items-center justify-center rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-all active:scale-95 flex-shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  </div>
                  </motion.div>
                )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* WA Template Bottom Sheet */}
      {waSheetLead && (() => {
        const lead = waSheetLead;
        const departure = formatDeparture(lead.answers?.departure || '');
        const rec1 = lead.recommended?.[0]?.name || 'paket umroh pilihan Anda';
        const templates = [
          {
            emoji: '👋', label: 'Perkenalan',
            text: `Assalamualaikum ${lead.nama}, saya ${agentName} dari Alhijaz \u{1F60A}\n\nSaya lihat Anda tertarik dengan paket umroh sekitar bulan ${departure}. Kebetulan ada beberapa pilihan bagus yang pas dengan keinginan Anda.\n\nBoleh saya bantu jelaskan lebih lanjut?`,
          },
          {
            emoji: '🔄', label: 'Follow Up',
            text: `Halo ${lead.nama}, apa kabar? \u{1F60A}\n\nSaya ${agentName}, yang kemarin bantu carikan paket umroh. Gimana, sudah ada yang menarik? Kalau masih bingung atau mau tanya-tanya dulu, santai aja hubungi saya ya.\n\nInsya Allah saya bantu carikan yang paling cocok \u{1F932}`,
          },
          {
            emoji: '🎯', label: 'Soft Close',
            text: `Assalamualaikum ${lead.nama}, sekedar info — paket ${rec1} yang kemarin kita obrolin ternyata cukup diminati, sisa seat-nya tinggal sedikit.\n\nKalau memang sudah cocok, bisa saya bantu amankan dulu kursinya. Tapi kalau masih mau pikir-pikir, no problem sama sekali \u{1F60A}`,
          },
        ];
        return (
          <>
            <div
              className={`fixed inset-0 z-50 ${waSheetClosing ? 'wa-backdrop-exit' : 'wa-backdrop-enter'}`}
              style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
              onClick={closeWaSheet}
            />
            <div
              className={`fixed inset-x-0 bottom-0 z-50 max-w-lg mx-auto bg-white dark:bg-slate-800 rounded-t-2xl border-t border-x border-gray-100 dark:border-slate-700 shadow-2xl ${waSheetClosing ? 'wa-sheet-exit' : 'wa-sheet-enter'}`}
              onClick={e => e.stopPropagation()}
            >
              {/* Handle bar */}
              <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-slate-600 mx-auto mt-3 mb-1" />

              {/* Header */}
              <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700/50 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-800 dark:text-white">Follow Up {lead.nama}</p>
                  <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">Pilih template pesan WhatsApp</p>
                </div>
                <button
                  onClick={closeWaSheet}
                  className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-gray-500 dark:text-slate-400"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Templates */}
              <div className="pb-6">
                {templates.map((tpl, i) => (
                  <button
                    key={i}
                    onClick={() => openWaTemplate(lead, tpl.text)}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 active:bg-gray-100 dark:active:bg-slate-700 transition-colors ${i < templates.length - 1 ? 'border-b border-gray-100 dark:border-slate-700/50' : ''}`}
                  >
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 flex items-center justify-center text-base flex-shrink-0">
                      {tpl.emoji}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-bold text-gray-800 dark:text-white">{tpl.label}</p>
                      <p className="text-[11px] text-gray-400 dark:text-slate-500 truncate mt-0.5">{tpl.text.split('\n')[0]}</p>
                    </div>
                    <Send size={13} className="text-emerald-500 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </>
        );
      })()}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center px-6 ${deleteClosing ? 'dc-backdrop-exit' : 'dc-backdrop-enter'}`}
          onClick={closeDeleteModal}
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
        >
          <div
            className={`bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-700 w-full max-w-sm p-5 text-center ${deleteClosing ? 'dc-card-exit' : 'dc-card-enter'}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-xl">
              🗑️
            </div>
            <p className="text-sm font-bold text-gray-800 dark:text-white">Hapus Lead</p>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1.5">
              Data lead <strong>{deleteTarget.nama}</strong> akan dihapus permanen. Yakin?
            </p>
            <div className="flex gap-2 mt-4">
              <button
                onClick={closeDeleteModal}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-semibold text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-all active:scale-95"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes dc-backdrop-enter { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dc-backdrop-exit { from { opacity: 1; } to { opacity: 0; } }
        @keyframes dc-card-enter { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
        @keyframes dc-card-exit { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.92); } }
        .dc-backdrop-enter { animation: dc-backdrop-enter 0.2s ease-out forwards; }
        .dc-backdrop-exit { animation: dc-backdrop-exit 0.2s ease-in forwards; }
        .dc-card-enter { animation: dc-card-enter 0.25s ease-out forwards; }
        .dc-card-exit { animation: dc-card-exit 0.2s ease-in forwards; }
        @keyframes wa-sheet-up { from { transform: translateY(100%); } to { transform: none; } }
        @keyframes wa-sheet-down { from { transform: none; } to { transform: translateY(100%); } }
        .wa-backdrop-enter { animation: dc-backdrop-enter 0.2s ease-out forwards; }
        .wa-backdrop-exit { animation: dc-backdrop-exit 0.2s ease-in forwards; }
        .wa-sheet-enter { animation: wa-sheet-up 0.25s cubic-bezier(0.4,0,0.2,1) forwards; }
        .wa-sheet-exit { animation: wa-sheet-down 0.2s ease-in forwards; }
      `}</style>
    </div>
  );
}

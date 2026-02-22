import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import logoAlhijaz from '@/logo-alhijaz.webp';
import type { AgentData } from '@/data/agents';
import {
  ArrowLeft,
  Search,
  ChevronDown,
  Loader2,
  Plane,
  PlaneTakeoff,
  PlaneLanding,
  Sun,
  Moon,
  FileText,
  Share2,
  ArrowLeftRight,
  X,
  Download,
} from 'lucide-react';
import { getPackages } from '@/services';
import type { UmrohPackage, HotelInfo } from '@/types';
import { getDistance } from '@/data/hotelService';
import { getTemperature } from '@/data/temperatureData';

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
// Comparison Row Component
// ============================================
function CompareRow({
  label,
  valueA,
  valueB,
  highlight,
}: {
  label: string;
  valueA: string;
  valueB: string;
  highlight?: 'a' | 'b' | null;
}) {
  return (
    <div className="grid grid-cols-[1fr_2fr_2fr] items-center border-b border-slate-100 dark:border-slate-700/50">
      <div className="px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
        {label}
      </div>
      <div className={`px-3 py-3 text-sm font-medium text-center ${
        highlight === 'a' ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/20' : 'text-slate-800 dark:text-slate-100'
      }`}>
        {valueA || '—'}
      </div>
      <div className={`px-3 py-3 text-sm font-medium text-center ${
        highlight === 'b' ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/20' : 'text-slate-800 dark:text-slate-100'
      }`}>
        {valueB || '—'}
      </div>
    </div>
  );
}

// ============================================
// Main Page Component
// ============================================
export default function ComparePage({ agent }: { agent?: AgentData | null }) {
  const [packages, setPackages] = useState<UmrohPackage[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(true);
  const [paketA, setPaketA] = useState('');
  const [paketB, setPaketB] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  // ── Dark Mode ──
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });
  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) root.classList.add('dark'); else root.classList.remove('dark');
    localStorage.setItem('darkMode', isDarkMode.toString());
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
    if (a && packages.find(p => p.jadwalId === a)) setPaketA(a);
    if (b && packages.find(p => p.jadwalId === b)) setPaketB(b);
    if (a || b) {
      params.delete('paketA');
      params.delete('paketB');
      const cleanUrl = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname;
      window.history.replaceState(null, '', cleanUrl);
    }
  }, [loadingPackages, packages]);

  // ── Build options ──
  const packageOptions: SelectOption[] = useMemo(() => {
    return packages.map((pkg) => {
      const depDate = new Date(pkg.keberangkatan.tgl);
      const dateStr = depDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      const flags: string[] = ['🇸🇦'];
      const firstTier = Object.keys(pkg.hotel)[0];
      if (firstTier) {
        const h = pkg.hotel[firstTier] as unknown as Record<string, string>;
        if (h.cairo_hotel) flags.push('🇪🇬');
        if (h.istanbul_hotel || h.bursa_hotel || h.cappadocia_hotel || h.ankara_hotel) flags.push('🇹🇷');
      }
      const searchParts: string[] = [pkg.maskapai];
      if (firstTier) {
        const h = pkg.hotel[firstTier] as unknown as Record<string, string>;
        ['mekkah_hotel', 'madinah_hotel', 'cairo_hotel', 'istanbul_hotel'].forEach(k => { if (h[k]) searchParts.push(h[k]); });
      }
      return { id: pkg.jadwalId, label: `${dateStr} — ${pkg.nama}`, flags, searchText: searchParts.join(' ') };
    });
  }, [packages]);

  const pkgA = useMemo(() => packages.find(p => p.jadwalId === paketA) || null, [packages, paketA]);
  const pkgB = useMemo(() => packages.find(p => p.jadwalId === paketB) || null, [packages, paketB]);

  // ── Helpers ──
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtTime = (t: string) => t.replace('.', ':');

  const getMinPrice = (pkg: UmrohPackage) => {
    let min = Infinity;
    for (const tp of Object.values(pkg.harga)) {
      for (const p of [tp.Quard, tp.Triple, tp.Double]) {
        if (p) { const v = parseInt(p, 10); if (v > 0 && v < min) min = v; }
      }
    }
    return min === Infinity ? 0 : min;
  };

  const getHotelInfo = (pkg: UmrohPackage): Record<string, string> | null => {
    const tiers = Object.keys(pkg.hotel);
    if (!tiers.length) return null;
    // Merge all tiers so we capture every city's hotel data
    const merged: Record<string, string> = {};
    for (const tier of tiers) {
      const h = pkg.hotel[tier] as unknown as Record<string, string>;
      if (!h) continue;
      for (const [k, v] of Object.entries(h)) {
        if (v && !merged[k]) merged[k] = v;
      }
    }
    return merged;
  };

  const getPriceForType = (pkg: UmrohPackage, type: 'Quard' | 'Triple' | 'Double') => {
    const firstTier = Object.keys(pkg.harga)[0];
    if (!firstTier) return 0;
    return parseInt(pkg.harga[firstTier][type] || '0', 10);
  };

  const priceHighlight = (a: number, b: number): 'a' | 'b' | null => {
    if (a > 0 && b > 0) { if (a < b) return 'a'; if (b < a) return 'b'; }
    return null;
  };

  const seatHighlight = (a: number, b: number): 'a' | 'b' | null => {
    if (a > b) return 'a'; if (b > a) return 'b'; return null;
  };

  const handleCompare = () => {
    if (!paketA || !paketB || paketA === paketB) return;
    setComparing(true);
    setTimeout(() => {
      setComparing(false);
      setShowModal(true);
    }, 1000);
  };

  // Reset modal when selection changes
  useEffect(() => { setShowModal(false); }, [paketA, paketB]);

  // ── Screenshot Export ──
  const handleExportPDF = useCallback(async () => {
    if (!pkgA || !pkgB) return;
    setPdfLoading(true);
    try {

      // ── Helpers ──
      const hA = getHotelInfo(pkgA) as Record<string, string> | null;
      const hB = getHotelInfo(pkgB) as Record<string, string> | null;
      const tierA = Object.keys(pkgA.harga)[0] || '';
      const tierB = Object.keys(pkgB.harga)[0] || '';
      const starsA = hA ? parseInt(hA['mekkah_bintang'] || '0') : 0;
      const starsB = hB ? parseInt(hB['mekkah_bintang'] || '0') : 0;
      const starStr = (n: number) => n > 0 ? '★'.repeat(n) : '';
      const depMonthA = new Date(pkgA.keberangkatan.tgl).getMonth() + 1;
      const depMonthB = new Date(pkgB.keberangkatan.tgl).getMonth() + 1;
      const depDays = (pkg: UmrohPackage) => {
        const dep = new Date(pkg.keberangkatan.tgl);
        const ret = new Date(pkg.kepulangan.tgl);
        return Math.round((ret.getTime() - dep.getTime()) / 86400000);
      };
      const fmt = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

      // Colors
      const C = {
        headerBg: '#0F4C3A',
        titleBg: '#D4AF37',
        titleText: '#ffffff',
        rowBg1: '#ffffff',
        rowBg2: '#F8F9FA',
        labelBg: '#1B5E3B',
        labelText: '#ffffff',
        cellText: '#1F2937',
        starColor: '#F59E0B',
        border: '#E5E7EB',
      };

      // ── Build Table HTML ──
      const rows: Array<{ label: string; a: string; b: string }> = [];

      // Harga
      const pQ_A = getPriceForType(pkgA, 'Quard');
      const pT_A = getPriceForType(pkgA, 'Triple');
      const pD_A = getPriceForType(pkgA, 'Double');
      const pQ_B = getPriceForType(pkgB, 'Quard');
      const pT_B = getPriceForType(pkgB, 'Triple');
      const pD_B = getPriceForType(pkgB, 'Double');

      const fmtP = (q: number, t: number, d: number) => {
        const parts: string[] = [];
        if (q > 0) parts.push(`Quad: ${formatRupiah(q)}`);
        if (t > 0) parts.push(`Triple: ${formatRupiah(t)}`);
        if (d > 0) parts.push(`Double: ${formatRupiah(d)}`);
        return parts.join('<br/>');
      };
      rows.push({ label: 'HARGA', a: fmtP(pQ_A, pT_A, pD_A), b: fmtP(pQ_B, pT_B, pD_B) });

      // Lama Perjalanan (+1 hari)
      rows.push({ label: 'LAMA<br/>PERJALANAN', a: `${depDays(pkgA) + 1} HARI`, b: `${depDays(pkgB) + 1} HARI` });

      // Keberangkatan
      rows.push({ label: 'KEBERANGKATAN', a: fmt(pkgA.keberangkatan.tgl), b: fmt(pkgB.keberangkatan.tgl) });

      // Maskapai
      rows.push({ label: 'MASKAPAI', a: pkgA.maskapai, b: pkgB.maskapai });

      // Hotel Mekkah
      const mekA = hA?.mekkah_hotel || '—';
      const mekB = hB?.mekkah_hotel || '—';
      rows.push({ label: 'HOTEL<br/>MEKKAH', a: mekA, b: mekB });

      // Hotel Madinah
      const madA = hA?.madinah_hotel || '—';
      const madB = hB?.madinah_hotel || '—';
      rows.push({ label: 'HOTEL<br/>MADINAH', a: madA, b: madB });

      // Jarak Hotel-Masjid
      const jMekA = mekA !== '—' ? getDistance(mekA) : '';
      const jMekB = mekB !== '—' ? getDistance(mekB) : '';
      const jMadA = madA !== '—' ? getDistance(madA) : '';
      const jMadB = madB !== '—' ? getDistance(madB) : '';
      const jA = [jMekA ? `Mekkah: ${jMekA}` : '', jMadA ? `Madinah: ${jMadA}` : ''].filter(Boolean).join('<br/>') || '—';
      const jB = [jMekB ? `Mekkah: ${jMekB}` : '', jMadB ? `Madinah: ${jMadB}` : ''].filter(Boolean).join('<br/>') || '—';
      rows.push({ label: 'JARAK<br/>HOTEL - MASJID', a: jA, b: jB });

      // Suhu
      const tempA_mek = getTemperature('mekkah', depMonthA);
      const tempA_mad = getTemperature('madinah', depMonthA);
      const tempB_mek = getTemperature('mekkah', depMonthB);
      const tempB_mad = getTemperature('madinah', depMonthB);
      const fmtTemp = (mek: any, mad: any) => {
        const parts: string[] = [];
        if (mek) parts.push(`Mekkah: ${mek.low}–${mek.high}°C`);
        if (mad) parts.push(`Madinah: ${mad.low}–${mad.high}°C`);
        return parts.join('<br/>') || '—';
      };
      rows.push({ label: 'SUHU SAAT<br/>KEBERANGKATAN', a: fmtTemp(tempA_mek, tempA_mad), b: fmtTemp(tempB_mek, tempB_mad) });

      // Seat
      rows.push({ label: 'SISA SEAT', a: `${pkgA.seatSisa} / ${pkgA.seatTotal}`, b: `${pkgB.seatSisa} / ${pkgB.seatTotal}` });

      // Manasik
      rows.push({
        label: 'MANASIK',
        a: pkgA.manasikTanggal ? `${fmt(pkgA.manasikTanggal)}${pkgA.manasikJam ? '<br/>' + pkgA.manasikJam.slice(0, 5) + ' WIB' : ''}` : '—',
        b: pkgB.manasikTanggal ? `${fmt(pkgB.manasikTanggal)}${pkgB.manasikJam ? '<br/>' + pkgB.manasikJam.slice(0, 5) + ' WIB' : ''}` : '—',
      });

      // ── Build DOM ──
      const wrapper = document.createElement('div');
      Object.assign(wrapper.style, {
        position: 'fixed', top: '0', left: '0', width: '800px',
        zIndex: '-9999', opacity: '1', pointerEvents: 'none',
        background: 'linear-gradient(180deg, #F0FAF4 0%, #E8F5EC 100%)',
        fontFamily: "'Inter', Arial, Helvetica, sans-serif",
        boxSizing: 'border-box', padding: '24px',
      });

      // Outer card container with rounded corners
      const card = document.createElement('div');
      Object.assign(card.style, {
        borderRadius: '20px', overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        background: '#ffffff',
      });

      // Agent header
      const agentHeader = document.createElement('div');
      Object.assign(agentHeader.style, {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '24px', background: '#ffffff',
      });
      const logoEl = document.createElement('img');
      logoEl.src = logoAlhijaz;
      Object.assign(logoEl.style, { height: '38px', width: 'auto' });
      agentHeader.appendChild(logoEl);
      if (agent) {
        const agInfo = document.createElement('div');
        Object.assign(agInfo.style, { display: 'flex', alignItems: 'center', gap: '12px' });
        const agText = document.createElement('div');
        Object.assign(agText.style, { textAlign: 'right' });
        // Format phone: 62xxx -> 0xxx-xxxx-xxxx
        const rawPh = agent.phone.replace(/\D/g, '');
        const localPh = rawPh.startsWith('62') ? '0' + rawPh.slice(2) : rawPh;
        const fmtPh = localPh.replace(/(\d{4})(\d{4})(\d+)/, '$1-$2-$3');
        agText.innerHTML = `<div style="font-weight:700;font-size:15px;color:#111827">${agent.name}</div><div style="font-size:12px;color:#6B7280;margin-top:2px">${agent.website}</div><div style="font-size:12px;font-weight:600;color:#059669;margin-top:2px">${fmtPh}</div>`;
        // Avatar with verified badge
        const avatarWrap = document.createElement('div');
        Object.assign(avatarWrap.style, { position: 'relative', width: '52px', height: '52px', flexShrink: '0' });
        const agAvatar = document.createElement('img');
        agAvatar.src = agent.photo;
        Object.assign(agAvatar.style, { width: '52px', height: '52px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #D1FAE5' });
        avatarWrap.appendChild(agAvatar);
        // Blue checkmark badge
        const badge = document.createElement('div');
        Object.assign(badge.style, { position: 'absolute', bottom: '-1px', right: '-1px', width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' });
        badge.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="12" fill="#1DA1F2"/><path d="M9.5 12.5L11 14L15 10" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        avatarWrap.appendChild(badge);
        agInfo.appendChild(agText);
        agInfo.appendChild(avatarWrap);
        agentHeader.appendChild(agInfo);
      }
      card.appendChild(agentHeader);

      // Package names header row (no title banner, no tier, no stars)
      const tierRow = document.createElement('div');
      Object.assign(tierRow.style, {
        display: 'grid', gridTemplateColumns: '1fr 150px 1fr',
        background: 'linear-gradient(135deg, #065F46 0%, #047857 50%, #059669 100%)',
        color: '#ffffff',
      });
      tierRow.innerHTML = `
        <div style="padding:24px 20px;text-align:center">
          <div style="font-size:18px;font-weight:800;color:#ffffff;line-height:1.4;letter-spacing:0.3px">${pkgA.nama}</div>
        </div>
        <div style="display:flex;align-items:center;justify-content:center">
          <div style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:rgba(255,255,255,0.7)">VS</div>
        </div>
        <div style="padding:24px 20px;text-align:center">
          <div style="font-size:18px;font-weight:800;color:#ffffff;line-height:1.4;letter-spacing:0.3px">${pkgB.nama}</div>
        </div>
      `;
      card.appendChild(tierRow);

      // Data rows with premium styling
      const rowIcons = ['💰', '📅', '🛫', '✈️', '🕋', '🕌', '📍', '🌡️', '💺', '📖'];
      rows.forEach((row, idx) => {
        const rowEl = document.createElement('div');
        const isEven = idx % 2 === 0;
        Object.assign(rowEl.style, {
          display: 'grid', gridTemplateColumns: '1fr 150px 1fr',
          background: isEven ? '#ffffff' : '#F8FAF9',
          borderBottom: '1px solid #E5E7EB',
        });

        const cellStyle = `padding:16px 20px;font-size:15px;font-weight:600;color:#1F2937;text-align:center;display:flex;align-items:center;justify-content:center;line-height:1.6;`;
        const icon = rowIcons[idx] || '📋';
        const labelHtml = `
          <div style="padding:12px 14px;min-width:130px;background:linear-gradient(135deg,#065F46,#059669);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px">
            <div style="font-size:16px">${icon}</div>
            <div style="font-size:10px;font-weight:800;color:#ffffff;text-transform:uppercase;letter-spacing:1.5px;line-height:1.4;text-align:center">${row.label}</div>
          </div>
        `;

        rowEl.innerHTML = `
          <div style="${cellStyle}">${row.a}</div>
          ${labelHtml}
          <div style="${cellStyle}">${row.b}</div>
        `;
        card.appendChild(rowEl);
      });

      // Footer with agent info (single line)
      const footer = document.createElement('div');
      Object.assign(footer.style, {
        background: 'linear-gradient(135deg, #065F46, #059669)',
        padding: '14px 24px', textAlign: 'center',
      });
      if (agent) {
        const rawPh2 = agent.phone.replace(/\D/g, '');
        const localPh2 = rawPh2.startsWith('62') ? '0' + rawPh2.slice(2) : rawPh2;
        const fmtPh2 = localPh2.replace(/(\d{4})(\d{4})(\d+)/, '$1-$2-$3');
        footer.innerHTML = `<div style="font-size:12px;color:#ffffff;font-weight:600;display:flex;align-items:center;justify-content:center;gap:16px">
          <span>👤 ${agent.name}</span>
          <span>🌐 ${agent.website}</span>
          <span>📞 ${fmtPh2}</span>
        </div>`;
      } else {
        footer.innerHTML = `<div style="font-size:12px;color:#ffffff;font-weight:500">🌐 alhijazindonesia.com</div>`;
      }
      card.appendChild(footer);

      wrapper.appendChild(card);

      document.body.appendChild(wrapper);
      await document.fonts.ready;
      await new Promise(resolve => setTimeout(resolve, 300));

      const { domToPng } = await import('modern-screenshot');
      const imageDataUrl = await domToPng(wrapper, { scale: 2, backgroundColor: '#ffffff' });

      document.body.removeChild(wrapper);

      // Share or download
      const blob = await (await fetch(imageDataUrl)).blob();
      const file = new File([blob], 'Perbandingan_Paket.png', { type: 'image/png' });
      const shareData = { title: 'Perbandingan Paket Umroh', files: [file] };
      if (navigator.canShare && navigator.canShare(shareData)) {
        try { await navigator.share(shareData); } catch { /* cancelled */ }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'Perbandingan_Paket.png';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Screenshot export failed:', err);
    } finally {
      setPdfLoading(false);
    }
  }, [pkgA, pkgB, agent]);

  // ============================================
  // Render
  // ============================================
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 transition-colors duration-300">
      {/* ── STICKY HEADER ── */}
      <div className="sticky top-0 z-30 backdrop-blur-md bg-white/90 dark:bg-slate-900/90 border-b border-slate-100 dark:border-slate-700/50 shadow-sm">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              document.body.classList.add('navigating');
              const seg = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean)[0];
              setTimeout(() => {
                window.location.href = seg ? `/${seg}?transition=1` : `/?transition=1`;
              }, 280);
            }}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100/80 dark:bg-slate-800/80 hover:bg-emerald-50 dark:hover:bg-slate-700/80 text-slate-500 dark:text-slate-400 hover:text-emerald-600 transition-all duration-300 active:scale-95"
            title="Kembali"
          >
            <ArrowLeft size={18} />
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

      {/* ── MAIN CONTENT ── */}
      <div className="max-w-3xl mx-auto px-5 pb-10">
        {/* Package Selectors Card */}
        <div className="mt-6 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-5">
          <SearchableSelect
            options={packageOptions}
            value={paketA}
            onChange={setPaketA}
            placeholder="Pilih Paket A..."
            loading={loadingPackages}
            label="Paket A"
          />

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
            onChange={setPaketB}
            placeholder="Pilih Paket B..."
            loading={loadingPackages}
            label="Paket B"
          />

          {/* Compare Button */}
          <button
            type="button"
            onClick={handleCompare}
            disabled={!paketA || !paketB || paketA === paketB || comparing}
            className="w-full mt-5 flex items-center justify-center gap-2.5 py-4 rounded-2xl font-bold text-white text-base bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/20 transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {comparing ? (
              <><Loader2 size={20} className="animate-spin" /> Membandingkan...</>
            ) : (
              <><ArrowLeftRight size={20} /> Bandingkan</>
            )}
          </button>
          {paketA && paketB && paketA === paketB && (
            <p className="text-xs text-center text-red-500 mt-2">Pilih 2 paket yang berbeda</p>
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
              {/* ── Modal Body (scrollable) ── */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-gray-50 to-gray-100/50 dark:from-slate-950 dark:to-slate-900 px-4 pb-6">
                {/* ─── STICKY PACKAGE NAMES ─── */}
                <div className="sticky top-0 z-10 -mx-4 px-4 pt-3 pb-2 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-700/50 shadow-sm">
                  <div className="max-w-2xl mx-auto grid grid-cols-2 gap-2">
                    {[pkgA, pkgB].map((pkg, idx) => (
                      <div key={idx} className="flex items-start gap-2 bg-gray-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 px-3 py-2.5">
                        <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${idx === 0 ? 'bg-emerald-500' : 'bg-sky-500'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Paket {idx === 0 ? 'A' : 'B'}</p>
                          <p className="text-[11px] font-bold text-slate-800 dark:text-slate-100 leading-snug line-clamp-2">{pkg.nama}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div ref={tableRef} className="max-w-2xl mx-auto pt-2 space-y-3">

                  {/* ─── PENERBANGAN ─── */}
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden shadow-sm">
                    <div className="px-4 py-3 bg-gradient-to-r from-slate-800 to-slate-700 dark:from-slate-700 dark:to-slate-600">
                      <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest flex items-center gap-1.5">
                        <PlaneTakeoff size={12} /> Penerbangan
                      </p>
                    </div>
                    <div className="grid grid-cols-2 divide-x divide-slate-100 dark:divide-slate-700/50">
                      {[pkgA, pkgB].map((pkg, idx) => {
                        const dep = new Date(pkg.keberangkatan.tgl);
                        const ret = new Date(pkg.kepulangan.tgl);
                        const days = Math.round((ret.getTime() - dep.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                        const depParts = pkg.keberangkatan.rute.split(' - ');
                        const retParts = pkg.kepulangan.rute.split(' - ');
                        return (
                          <div key={idx} className="p-4 space-y-4">
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300">{pkg.maskapai}</span>
                              <span className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">{days} Hari</span>
                            </div>
                            <div>
                              <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Berangkat</p>
                              <p className="text-[13px] font-bold text-slate-900 dark:text-white">{fmtDate(pkg.keberangkatan.tgl)}</p>
                              <div className="flex items-center gap-1.5 mt-2">
                                <div className="text-center"><p className="text-xs font-black text-slate-800 dark:text-slate-100">{depParts[0]?.trim()}</p><p className="text-[10px] text-slate-400">{fmtTime(pkg.keberangkatan.jam)}</p></div>
                                <div className="flex-1 flex items-center px-1">
                                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                  <div className="flex-1 border-t border-dashed border-slate-300 dark:border-slate-600 mx-0.5 relative">
                                    <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-[8px] text-slate-400">{pkg.keberangkatan.kodePenerbangan}</span>
                                  </div>
                                  <PlaneTakeoff size={10} className="text-emerald-500 shrink-0" />
                                </div>
                                <div className="text-center"><p className="text-xs font-black text-slate-800 dark:text-slate-100">{depParts[1]?.trim() || depParts[0]?.trim()}</p></div>
                              </div>
                            </div>
                            <div>
                              <p className="text-[9px] font-bold text-amber-600 uppercase tracking-widest mb-1">Pulang</p>
                              <p className="text-[13px] font-bold text-slate-900 dark:text-white">{fmtDate(pkg.kepulangan.tgl)}</p>
                              <div className="flex items-center gap-1.5 mt-2">
                                <div className="text-center"><p className="text-xs font-black text-slate-800 dark:text-slate-100">{retParts[0]?.trim()}</p><p className="text-[10px] text-slate-400">{fmtTime(pkg.kepulangan.jam)}</p></div>
                                <div className="flex-1 flex items-center px-1">
                                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                  <div className="flex-1 border-t border-dashed border-slate-300 dark:border-slate-600 mx-0.5 relative">
                                    <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-[8px] text-slate-400">{pkg.kepulangan.kodePenerbangan}</span>
                                  </div>
                                  <PlaneLanding size={10} className="text-amber-500 shrink-0" />
                                </div>
                                <div className="text-center"><p className="text-xs font-black text-slate-800 dark:text-slate-100">{retParts[1]?.trim() || retParts[0]?.trim()}</p></div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ─── HOTEL ─── */}
                  {(() => {
                    const hotelKeys = [
                      { key: 'mekkah_hotel', starKey: 'mekkah_bintang', label: 'Mekkah', emoji: '🕋' },
                      { key: 'madinah_hotel', starKey: 'madinah_bintang', label: 'Madinah', emoji: '🕌' },
                      { key: 'cairo_hotel', starKey: 'cairo_bintang', label: 'Cairo', emoji: '🇪🇬' },
                      { key: 'istanbul_hotel', starKey: 'istanbul_bintang', label: 'Istanbul', emoji: '🇹🇷' },
                      { key: 'bursa_hotel', starKey: 'bursa_bintang', label: 'Bursa', emoji: '🇹🇷' },
                      { key: 'cappadocia_hotel', starKey: 'cappadocia_bintang', label: 'Cappadocia', emoji: '🇹🇷' },
                      { key: 'ankara_hotel', starKey: 'ankara_bintang', label: 'Ankara', emoji: '🇹🇷' },
                    ];
                    const hA = getHotelInfo(pkgA) as Record<string, string> | null;
                    const hB = getHotelInfo(pkgB) as Record<string, string> | null;
                    const visible = hotelKeys.filter(hk => (hA && hA[hk.key]) || (hB && hB[hk.key]));
                    if (!visible.length) return null;
                    return (
                      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden shadow-sm">
                        <div className="px-4 py-3 bg-gradient-to-r from-amber-600 to-amber-500">
                          <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest">🏨 Hotel & Akomodasi</p>
                        </div>
                        {visible.map((hk) => (
                          <div key={hk.key} className="border-b border-slate-50 dark:border-slate-700/50 last:border-0">
                            <div className="px-4 py-1.5 bg-slate-50/80 dark:bg-slate-900/30">
                              <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{hk.emoji} {hk.label}</span>
                            </div>
                            <div className="grid grid-cols-2 divide-x divide-slate-100 dark:divide-slate-700/50">
                              {[hA, hB].map((h, idx) => {
                                const name = h?.[hk.key] || '';
                                const stars = parseInt(h?.[hk.starKey] || '0');
                                const jarak = name ? getDistance(name) : '';
                                return (
                                  <div key={idx} className="px-4 py-2.5">
                                    {name ? (
                                      <>
                                        <p className="text-[11px] font-semibold text-slate-800 dark:text-slate-100 leading-snug">{name}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                          {stars > 0 && (
                                            <div className="flex items-center gap-0.5">
                                              {Array.from({ length: stars }).map((_, i) => (
                                                <span key={i} className="text-amber-400 text-xs">★</span>
                                              ))}
                                            </div>
                                          )}
                                          {jarak && (
                                            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">📍 {jarak}</span>
                                          )}
                                        </div>
                                      </>
                                    ) : (
                                      <p className="text-[11px] text-slate-300 dark:text-slate-600">—</p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}


                  {/* ─── HARGA ─── */}
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden shadow-sm">
                    <div className="px-4 py-3 bg-gradient-to-r from-emerald-700 to-emerald-600">
                      <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest">💰 Perbandingan Harga</p>
                    </div>
                    <div className="grid grid-cols-2 divide-x divide-slate-100 dark:divide-slate-700/50 border-b border-slate-100 dark:border-slate-700">
                      {[pkgA, pkgB].map((pkg, idx) => (
                        <div key={idx} className="px-4 py-2.5 flex flex-wrap gap-1">
                          {Object.keys(pkg.harga).map(tier => (
                            <span key={tier} className="px-2 py-0.5 text-[8px] font-black rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 uppercase tracking-wide">{tier}</span>
                          ))}
                        </div>
                      ))}
                    </div>
                    {(['Quard', 'Triple', 'Double'] as const).map((type) => {
                      const pA = getPriceForType(pkgA, type);
                      const pB = getPriceForType(pkgB, type);
                      if (pA === 0 && pB === 0) return null;
                      const label = type === 'Quard' ? 'Quad' : type;
                      const hl = priceHighlight(pA, pB);
                      const diff = pA > 0 && pB > 0 ? Math.abs(pA - pB) : 0;
                      return (
                        <div key={type} className="border-b border-slate-50 dark:border-slate-700/50 last:border-0">
                          <div className="px-4 py-1.5 bg-slate-50/80 dark:bg-slate-900/30">
                            <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Kamar {label}</span>
                          </div>
                          <div className="grid grid-cols-2 divide-x divide-slate-100 dark:divide-slate-700/50">
                            {[pA, pB].map((price, idx) => (
                              <div key={idx} className="px-4 py-3">
                                <p className="text-base font-black tabular-nums text-slate-800 dark:text-slate-100">
                                  {price > 0 ? formatRupiah(price) : '—'}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* ─── SUHU SAAT KEBERANGKATAN ─── */}
                  {(() => {
                    const cityKeys = [
                      { key: 'mekkah', label: 'Mekkah' },
                      { key: 'madinah', label: 'Madinah' },
                      { key: 'cairo', hotelKey: 'cairo_hotel', label: 'Cairo' },
                      { key: 'istanbul', hotelKey: 'istanbul_hotel', label: 'Istanbul' },
                      { key: 'bursa', hotelKey: 'bursa_hotel', label: 'Bursa' },
                      { key: 'cappadocia', hotelKey: 'cappadocia_hotel', label: 'Cappadocia' },
                      { key: 'ankara', hotelKey: 'ankara_hotel', label: 'Ankara' },
                    ];
                    const hA2 = getHotelInfo(pkgA) as Record<string, string> | null;
                    const hB2 = getHotelInfo(pkgB) as Record<string, string> | null;
                    const depMonthA = new Date(pkgA.keberangkatan.tgl).getMonth() + 1;
                    const depMonthB = new Date(pkgB.keberangkatan.tgl).getMonth() + 1;
                    const visibleCities = cityKeys.filter(c => {
                      if (c.key === 'mekkah' || c.key === 'madinah') return true;
                      const hk = (c as any).hotelKey;
                      return (hA2 && hA2[hk]) || (hB2 && hB2[hk]);
                    }).filter(c => getTemperature(c.key, depMonthA) || getTemperature(c.key, depMonthB));
                    if (!visibleCities.length) return null;
                    return (
                      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden shadow-sm">
                        <div className="px-4 py-3 bg-gradient-to-r from-orange-600 to-amber-500">
                          <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest">🌡️ Suhu Saat Keberangkatan</p>
                        </div>
                        {visibleCities.map(city => (
                          <div key={city.key} className="border-b border-slate-50 dark:border-slate-700/50 last:border-0">
                            <div className="px-4 py-1.5 bg-slate-50/80 dark:bg-slate-900/30">
                              <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{city.label}</span>
                            </div>
                            <div className="grid grid-cols-2 divide-x divide-slate-100 dark:divide-slate-700/50">
                              {[{ pkg: pkgA, month: depMonthA }, { pkg: pkgB, month: depMonthB }].map((item, idx) => {
                                const temp = getTemperature(city.key, item.month);
                                return (
                                  <div key={idx} className="px-4 py-2.5">
                                    {temp ? (
                                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                                        {temp.low}<span className="text-slate-400 font-normal mx-0.5">–</span>{temp.high}<span className="text-xs ml-0.5 text-slate-400">°C</span>
                                      </p>
                                    ) : (
                                      <p className="text-[11px] text-slate-300 dark:text-slate-600">—</p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* ─── SEAT & MANASIK ─── */}
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden shadow-sm">
                    <div className="px-4 py-3 bg-gradient-to-r from-teal-700 to-cyan-600">
                      <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest">📋 Ketersediaan & Manasik</p>
                    </div>
                    <div className="grid grid-cols-2 divide-x divide-slate-100 dark:divide-slate-700/50">
                      {[pkgA, pkgB].map((pkg, idx) => {
                        const pct = pkg.seatTotal > 0 ? Math.round((pkg.seatSisa / pkg.seatTotal) * 100) : 0;
                        const strokeColor = pct > 50 ? '#10b981' : pct > 20 ? '#f59e0b' : '#ef4444';
                        const r = 28, c = 2 * Math.PI * r;
                        return (
                          <div key={idx} className="p-4 text-center">
                            {/* Gauge */}
                            <div className="relative w-20 h-20 mx-auto mb-3">
                              <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
                                <circle cx="32" cy="32" r={r} fill="none" strokeWidth="5" className="stroke-slate-100 dark:stroke-slate-700" />
                                <circle cx="32" cy="32" r={r} fill="none" strokeWidth="5" strokeLinecap="round" stroke={strokeColor} strokeDasharray={`${(pct / 100) * c} ${c}`} />
                              </svg>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-base font-black text-slate-800 dark:text-slate-100">{pct}%</span>
                              </div>
                            </div>
                            {/* Seat count */}
                            <p className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">{pkg.seatSisa}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">dari {pkg.seatTotal} seat</p>

                            {/* Manasik */}
                            {pkg.manasikTanggal && (
                              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
                                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">📖 Manasik</p>
                                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{fmtDate(pkg.manasikTanggal)}</p>
                                {pkg.manasikJam && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{pkg.manasikJam.slice(0, 5)} WIB</p>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              </div>

              {/* ── Modal Footer ── */}
              <div className="flex-none sticky bottom-0 bg-white dark:bg-slate-900 border-t border-gray-200/60 dark:border-slate-700/60 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                <div className="flex gap-3 max-w-2xl mx-auto">
                  <button
                    onClick={handleExportPDF}
                    disabled={pdfLoading}
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/20 transition-all duration-200 active:scale-[0.98] disabled:opacity-70"
                  >
                    {pdfLoading ? <><Loader2 size={18} className="animate-spin" /> Memproses...</> : <><Download size={18} /> Unduh</>}
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

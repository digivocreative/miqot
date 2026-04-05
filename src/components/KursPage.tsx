import { useState, useEffect, useRef } from 'react';
import { trackEvent } from '../utils/analytics';
import { ChevronDown, TrendingUp, Search } from 'lucide-react';

// Currency → Country flag emoji
const FLAG: Record<string, string> = {
  AUD: '🇦🇺', CAD: '🇨🇦', CHF: '🇨🇭', CNY: '🇨🇳', DKK: '🇩🇰',
  EUR: '🇪🇺', GBP: '🇬🇧', HKD: '🇭🇰', JPY: '🇯🇵', MYR: '🇲🇾',
  NOK: '🇳🇴', NZD: '🇳🇿', SAR: '🇸🇦', SEK: '🇸🇪', SGD: '🇸🇬',
  THB: '🇹🇭', USD: '🇺🇸',
};

interface KursData {
  rates: Record<string, number>;
  names: Record<string, string>;
  updatedAt: string;
}

const fmtRp = (n: number) => 'Rp' + Math.round(n).toLocaleString('id-ID');
const fmtNum = (n: number) => n.toLocaleString('id-ID');

export default function KursPage() {
  const [kursData, setKursData] = useState<KursData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState('USD');
  const [amount, setAmount] = useState(4500);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownClosing, setDropdownClosing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mountTracked = useRef(false);
  useEffect(() => { if (!mountTracked.current) { trackEvent('feature', 'open_kurs'); mountTracked.current = true; } }, []);

  useEffect(() => {
    fetch('/api/kurs')
      .then(r => r.json())
      .then(d => {
        if (d.success) setKursData(d.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const rate = kursData?.rates[currency] || 0;
  const result = amount * rate;

  const handleInput = (val: string) => {
    const num = parseInt(val.replace(/[^\d]/g, '')) || 0;
    setAmount(num);
  };

  const openDropdown = () => {
    setDropdownClosing(false);
    setDropdownOpen(true);
    setSearchQuery('');
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const closeDropdown = () => {
    setDropdownClosing(true);
    setTimeout(() => {
      setDropdownOpen(false);
      setDropdownClosing(false);
      setSearchQuery('');
    }, 150);
  };

  // Dropdown currencies: pinned first, then alphabetical
  const PINNED = ['USD', 'SAR', 'SGD', 'MYR'];
  const dropdownCurrencies = Object.keys(kursData?.rates || {}).sort((a, b) => {
    const ai = PINNED.indexOf(a), bi = PINNED.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  // Table currencies: exclude USD & SAR, sort by rate descending
  const tableCurrencies = Object.keys(kursData?.rates || {})
    .filter(c => c !== 'USD' && c !== 'SAR')
    .sort((a, b) => (kursData?.rates[b] || 0) - (kursData?.rates[a] || 0));



  // ── Loading ──
  if (loading) {
    return (
      <div className="px-4 pt-4 pb-8 space-y-4">
        <div className="h-32 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />
        <div className="h-72 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />
        <div className="h-48 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />
      </div>
    );
  }

  // ── Error ──
  if (!kursData) {
    return (
      <div className="px-4 pt-4 pb-8">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-8 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center mb-3">
            <TrendingUp size={20} className="text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400">
            Kurs belum tersedia
          </p>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
            Coba refresh halaman beberapa saat lagi
          </p>
        </div>
      </div>
    );
  }

  const usdRate = kursData.rates['USD'];
  const sarRate = kursData.rates['SAR'];

  return (
    <div className="px-4 pt-4 pb-8 space-y-4">

      {/* ═══ Section 1: Spotlight USD & SAR ═══ */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-2 px-1">
          Kurs Hari Ini
        </p>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
          {/* USD row */}
          {usdRate && (
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl leading-none">🇺🇸</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800 dark:text-white">USD</p>
                <p className="text-[10px] text-gray-400 dark:text-slate-500 font-medium">US Dollar</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xl font-extrabold text-gray-800 dark:text-white">{fmtRp(usdRate)}</p>
                <p className="text-[9px] text-gray-400 dark:text-slate-500">per 1 USD</p>
              </div>
            </div>
          )}

          {/* Divider */}
          {usdRate && sarRate && (
            <div className="mx-4 h-px bg-gray-100 dark:bg-slate-700" />
          )}

          {/* SAR row */}
          {sarRate && (
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl leading-none">🇸🇦</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800 dark:text-white">SAR</p>
                <p className="text-[10px] text-gray-400 dark:text-slate-500 font-medium">Saudi Riyal</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xl font-extrabold text-gray-800 dark:text-white">{fmtRp(sarRate)}</p>
                <p className="text-[9px] text-gray-400 dark:text-slate-500">per 1 SAR</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Section 2: Kalkulator ═══ */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-2 px-1">
          Kalkulator
        </p>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-4">

          {/* Currency selector + Input */}
          <div className="flex items-center gap-2">
            {/* Dropdown button */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={(e) => { e.stopPropagation(); dropdownOpen ? closeDropdown() : openDropdown(); }}
                className="flex items-center gap-1.5 px-3.5 h-[46px] bg-gray-800 dark:bg-slate-700 rounded-xl active:scale-95 transition-transform"
              >
                <span className="text-sm font-extrabold text-white">{currency}</span>
                <ChevronDown size={12} className={`text-gray-400 transition-transform duration-200 ${dropdownOpen && !dropdownClosing ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown menu */}
              {dropdownOpen && (
                <div
                  className={`absolute top-full left-0 mt-1 z-20 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden ${
                    dropdownClosing ? 'animate-dropdown-close' : 'animate-dropdown-open'
                  }`}
                >
                  {/* Search */}
                  <div className="p-2 border-b border-gray-100 dark:border-slate-700">
                    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 dark:bg-slate-900 rounded-lg">
                      <Search size={13} className="text-gray-400 dark:text-slate-500 flex-shrink-0" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-transparent text-xs text-gray-800 dark:text-white outline-none placeholder:text-gray-400 dark:placeholder:text-slate-500"
                        placeholder="Cari mata uang..."
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>

                  {/* Currency list */}
                  <div className="max-h-52 overflow-y-auto py-1">
                    {dropdownCurrencies
                      .filter(c => {
                        if (!searchQuery) return true;
                        const q = searchQuery.toLowerCase();
                        return c.toLowerCase().includes(q) || (kursData.names[c] || '').toLowerCase().includes(q);
                      })
                      .map(c => (
                        <button
                          key={c}
                          onClick={() => { setCurrency(c); closeDropdown(); }}
                          className={`w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors ${
                            c === currency ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''
                          }`}
                        >
                          <span className="text-base leading-none">{FLAG[c] || '💱'}</span>
                          <span className={`text-xs font-bold ${c === currency ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-800 dark:text-white'}`}>
                            {c}
                          </span>
                          <span className="text-[10px] text-gray-400 dark:text-slate-500">
                            {kursData.names[c] || c}
                          </span>
                        </button>
                      ))}
                    {dropdownCurrencies.filter(c => {
                      if (!searchQuery) return true;
                      const q = searchQuery.toLowerCase();
                      return c.toLowerCase().includes(q) || (kursData.names[c] || '').toLowerCase().includes(q);
                    }).length === 0 && (
                      <div className="px-3 py-3 text-center text-[11px] text-gray-400 dark:text-slate-500">
                        Tidak ditemukan
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <style>{`
              @keyframes dropdownOpen {
                from { opacity: 0; transform: scale(0.95) translateY(-4px); }
                to { opacity: 1; transform: scale(1) translateY(0); }
              }
              @keyframes dropdownClose {
                from { opacity: 1; transform: scale(1) translateY(0); }
                to { opacity: 0; transform: scale(0.95) translateY(-4px); }
              }
              .animate-dropdown-open { animation: dropdownOpen 0.15s ease-out forwards; }
              .animate-dropdown-close { animation: dropdownClose 0.12s ease-in forwards; }
            `}</style>

            {/* Input */}
            <div className="flex-1 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-3.5 h-[46px] flex items-center focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/10 transition-all">
              <input
                type="text"
                inputMode="numeric"
                value={amount > 0 ? fmtNum(amount) : ''}
                onChange={(e) => handleInput(e.target.value)}
                className="w-full bg-transparent text-lg font-bold text-gray-800 dark:text-white outline-none"
                placeholder="Masukkan nominal"
              />
            </div>
          </div>

          {/* Divider with rate info */}
          <div className="flex items-center gap-3 my-3 px-1">
            <div className="flex-1 h-px bg-gray-200 dark:bg-slate-700" />
            <span className="text-[10px] font-semibold text-gray-400 dark:text-slate-500 whitespace-nowrap">
              1 {currency} = {fmtRp(rate)}
            </span>
            <div className="flex-1 h-px bg-gray-200 dark:bg-slate-700" />
          </div>

          {/* Result card */}
          <div className="bg-gradient-to-br from-emerald-900 to-emerald-600 rounded-2xl p-5 text-center">
            <div className="text-[10px] font-semibold text-white/60 uppercase tracking-wide">
              Indonesian Rupiah
            </div>
            <div className="text-3xl font-extrabold text-white mt-1 tracking-tight">
              {amount > 0 ? fmtRp(result) : 'Rp0'}
            </div>
            <div className="text-[11px] text-white/50 mt-2 font-medium">
              Kurs Bank Mandiri
            </div>
          </div>


        </div>
      </div>

      {/* ═══ Section 3: Mata Uang Lainnya ═══ */}
      {tableCurrencies.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-2 px-1">
            Mata Uang Lainnya
          </p>
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-700 dark:text-slate-200">Semua kurs</span>
                <span className="text-[9px] font-bold bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 px-1.5 py-0.5 rounded-full">
                  {tableCurrencies.length}
                </span>
              </div>
              <span className="text-[10px] text-gray-400 dark:text-slate-500 font-medium">
                {kursData.updatedAt}
              </span>
            </div>

            {/* Currency rows */}
            <div className="px-3 pb-1">
              {(expanded ? tableCurrencies : tableCurrencies.slice(0, 6)).map((c, i) => (
                <div
                  key={c}
                  className={`flex items-center gap-3 py-2.5 ${
                    i > 0 ? 'border-t border-gray-50 dark:border-slate-700/50' : ''
                  }`}
                >
                  <div className="w-7 h-7 rounded-lg bg-gray-50 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                    <span className="text-base leading-none">{FLAG[c] || '💱'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-800 dark:text-white">{c}</p>
                    <p className="text-[9px] text-gray-400 dark:text-slate-500">{kursData.names[c] || c}</p>
                  </div>
                  <span className="text-[13px] font-bold tabular-nums text-gray-800 dark:text-white flex-shrink-0">
                    {fmtRp(kursData.rates[c])}
                  </span>
                </div>
              ))}
            </div>

            {/* Expand/collapse button */}
            {tableCurrencies.length > 6 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-center gap-1 py-2.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 border-t border-gray-50 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors"
              >
                {expanded ? 'Sembunyikan' : 'Lihat semua'}
                <ChevronDown
                  size={12}
                  className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ═══ Footer ═══ */}
      <div className="text-center py-3">
        <span className="text-[10px] text-gray-400 dark:text-slate-500 font-medium">
          Sumber: bankmandiri.co.id · Update otomatis setiap 1 jam
        </span>
      </div>
    </div>
  );
}

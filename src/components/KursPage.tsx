import { useState, useEffect, useRef } from 'react';
import { ChevronDown, TrendingUp } from 'lucide-react';

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
  const [amount, setAmount] = useState(1000);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
        setDropdownOpen(false);
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

  // Dropdown currencies: USD & SAR first, then alphabetical
  const dropdownCurrencies = Object.keys(kursData?.rates || {}).sort((a, b) => {
    if (a === 'USD') return -1;
    if (b === 'USD') return 1;
    if (a === 'SAR') return -1;
    if (b === 'SAR') return 1;
    return a.localeCompare(b);
  });

  // Table currencies: exclude USD & SAR, sort by rate descending
  const tableCurrencies = Object.keys(kursData?.rates || {})
    .filter(c => c !== 'USD' && c !== 'SAR')
    .sort((a, b) => (kursData?.rates[b] || 0) - (kursData?.rates[a] || 0));

  const quickAmounts = [1000, 5000, 10000, 25000];

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
          Kurs Jual
        </p>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
          {/* USD row */}
          {usdRate && (
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-lg font-extrabold">$</span>
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
              <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-extrabold">SR</span>
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
                onClick={(e) => { e.stopPropagation(); setDropdownOpen(!dropdownOpen); }}
                className="flex items-center gap-1.5 px-3.5 py-2.5 bg-gray-800 dark:bg-slate-700 rounded-xl active:scale-95 transition-transform"
              >
                <span className="text-sm font-extrabold text-white">{currency}</span>
                <ChevronDown size={12} className="text-gray-400" />
              </button>

              {/* Dropdown menu */}
              {dropdownOpen && (
                <div className="absolute top-full left-0 mt-1 z-20 w-56 max-h-64 overflow-y-auto bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 py-1">
                  {dropdownCurrencies.map(c => (
                    <button
                      key={c}
                      onClick={() => { setCurrency(c); setDropdownOpen(false); }}
                      className={`w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors ${
                        c === currency ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''
                      }`}
                    >
                      <span className={`text-xs font-bold ${c === currency ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-800 dark:text-white'}`}>
                        {c}
                      </span>
                      <span className="text-[10px] text-gray-400 dark:text-slate-500">
                        {kursData.names[c] || c}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Input */}
            <div className="flex-1 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/10 transition-all">
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
              Kurs jual TT Counter · Bank Mandiri
            </div>
          </div>

          {/* Quick amount buttons */}
          <div className="flex gap-1.5 mt-3 justify-center">
            {quickAmounts.map(n => (
              <button
                key={n}
                className={`px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-all active:scale-95 ${
                  amount === n
                    ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                    : 'border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 bg-white dark:bg-slate-800'
                }`}
                onClick={() => setAmount(n)}
              >
                {fmtNum(n)}
              </button>
            ))}
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
                <span className="text-xs font-bold text-gray-700 dark:text-slate-200">Semua kurs jual</span>
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
                  <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-extrabold text-gray-500 dark:text-slate-400">{c}</span>
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

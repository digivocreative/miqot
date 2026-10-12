import { lazy, Suspense, useState, useEffect } from 'react';
import { Share2 } from 'lucide-react';
import { getAuthHeaders } from '../lib/authSession';
import { cityTemperatureData } from '../data/temperatureData';
import { SEASONAL_NOTES } from '../../lib/weather-seasonal-notes.js';
import type { CuacaShareCity } from '../../lib/cuaca-share-data.js';
import type { CuacaShareAgent } from './ShareCuacaModal';

const ShareCuacaModal = lazy(() => import('./ShareCuacaModal'));

// ─── Types ───────────────────────────────────────────────────────
type CityWeather = CuacaShareCity & { flag: string };

// ─── Helper ───────────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];

export default function CuacaWidget({ agent }: { agent?: CuacaShareAgent }) {
  const [cities, setCities] = useState<CityWeather[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareMounted, setShareMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const fetchWeather = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch('/api/weather/cities', {
        headers: getAuthHeaders(),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setCities(json.data);
      setSyncedAt(json.syncedAt ?? null);
      setError('');
    } catch (e: any) {
      // Refresh (mis. saat Share diketuk) yang gagal tetap memakai data lama —
      // jangan ganti widget (dan sheet Share di dalamnya) dengan layar galat.
      if (!isRefresh) setError('Gagal memuat data cuaca');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchWeather(); }, []);

  const city = cities[selectedIdx];
  const currentMonth = new Date().getMonth();
  const seasonalNote = city ? (SEASONAL_NOTES[city.key]?.[currentMonth] ?? '') : '';
  const monthlyTemps = city ? (cityTemperatureData[city.key] ?? []) : [];

  // ─── Skeleton ────────────────────────────────────────────────────
  if (loading) return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-50 dark:border-slate-700/50 flex items-center justify-between">
        <div className="h-3 w-28 rounded-md bg-gray-200 dark:bg-slate-700 animate-pulse" />
        <div className="h-3 w-16 rounded-md bg-gray-200 dark:bg-slate-700 animate-pulse" />
      </div>
      <div className="p-4 space-y-3">
        {/* Tab skeleton */}
        <div className="flex gap-2 overflow-hidden">
          {[80,70,80,90,60,70].map((w, i) => (
            <div key={i} className={`h-7 rounded-full bg-gray-200 dark:bg-slate-700 animate-pulse flex-shrink-0`} style={{ width: w }} />
          ))}
        </div>
        {/* Hero skeleton */}
        <div className="h-36 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />
        {/* Forecast skeleton */}
        <div className="h-24 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />
        {/* Chart skeleton */}
        <div className="h-20 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />
      </div>
    </div>
  );

  // ─── Error ────────────────────────────────────────────────────────
  if (error) return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-4">
      <p className="text-xs text-center text-red-500 dark:text-red-400">{error}</p>
      <button
        onClick={() => { setLoading(true); fetchWeather(); }}
        className="mt-2 w-full py-2 text-xs text-emerald-600 dark:text-emerald-400 font-semibold"
      >
        Coba lagi
      </button>
    </div>
  );

  if (!city) return null;

  // ─── Monthly bar chart ────────────────────────────────────────────
  const maxTemp = Math.max(...monthlyTemps);
  const minTemp = Math.min(...monthlyTemps);
  const range = maxTemp - minTemp || 1;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-50 dark:border-slate-700/50 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">
          Cuaca Kota Tujuan
        </h3>
        {agent && (
          <button
            onClick={() => { fetchWeather(true); setShareMounted(true); setShareOpen(true); }}
            aria-label="Bagikan cuaca"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors active:scale-95"
          >
            <Share2 size={10} strokeWidth={2.5} />
            Share
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* City tabs */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {cities.map((c, i) => (
            <button
              key={c.key}
              onClick={() => setSelectedIdx(i)}
              className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all active:scale-95 ${
                i === selectedIdx
                  ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-500/20'
                  : 'bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400'
              }`}
            >
              <span>{c.flag}</span>
              <span>{c.name}</span>
            </button>
          ))}
        </div>

        {/* Hero card */}
        <div
          className="rounded-2xl p-4 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #064e3b, #0F6E56, #065f46)' }}
        >
          {/* Background icon */}
          <div className="absolute right-3 top-1 text-[64px] opacity-10 pointer-events-none leading-none select-none">
            {city.icon}
          </div>

          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300 mb-0.5">
            Hari ini · {city.flag} {city.name}, {city.country}
          </div>

          <div className="flex items-end gap-3 mt-1">
            <div className="text-5xl font-bold text-white leading-none">{city.temp}°</div>
            <div>
              <div className="text-sm font-semibold text-white">{city.label}</div>
              <div className="text-[11px] text-emerald-300">Terasa {city.feelsLike}°C</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
            <div className="text-[10px] text-emerald-300">💧 <span className="text-white font-semibold">{city.humidity}%</span></div>
            <div className="text-[10px] text-emerald-300">💨 <span className="text-white font-semibold">{city.windSpeed} km/j</span></div>
            <div className="text-[10px] text-emerald-300">🌡️ <span className="text-white font-semibold">{city.tempMin}–{city.tempMax}°C</span></div>
            <div className="text-[10px] text-emerald-300">☀️ UV <span className="text-white font-semibold">{city.uvIndex} ({city.uvLabel})</span></div>
          </div>
        </div>

        {/* 3-day forecast */}
        <div className="bg-gray-50 dark:bg-slate-900 rounded-2xl p-3 border border-gray-100 dark:border-slate-700/50">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400 mb-2.5">
            Prakiraan 3 Hari ke Depan
          </div>
          <div className="space-y-1.5">
            {city.forecast.map((fc) => {
              // Normalize bar width based on day's max temp relative to city's monthly extremes
              const barPct = Math.round(((fc.tempMax - minTemp) / range) * 100);
              return (
                <div key={fc.day} className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-gray-600 dark:text-slate-300 w-7">{fc.day}</span>
                  <span className="text-sm w-5">{fc.icon}</span>
                  <div className="flex-1 h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(barPct, 15)}%`,
                        background: 'linear-gradient(to right, #3b82f6, #f97316)',
                      }}
                    />
                  </div>
                  <div className="flex gap-1.5 text-[10px]">
                    <span className="text-gray-500 dark:text-slate-400">{fc.tempMin}°</span>
                    <span className="text-gray-800 dark:text-slate-100 font-bold">{fc.tempMax}°C</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Monthly temperature chart */}
        {monthlyTemps.length === 12 && (
          <div className="bg-gray-50 dark:bg-slate-900 rounded-2xl p-3 border border-gray-100 dark:border-slate-700/50">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400 mb-2.5">
              Suhu Rata-rata Bulanan
            </div>
            <div className="flex items-end gap-1 h-10">
              {monthlyTemps.map((t, i) => {
                const heightPct = ((t - minTemp) / range) * 100;
                const barH = Math.round(8 + heightPct * 0.24);
                const isCurrent = i === currentMonth;
                // Color by temperature: red (very hot ≥35), orange (warm 20-34), blue (cold <20)
                const barColor = t >= 35 ? '#ef4444' : t >= 20 ? '#f97316' : '#3b82f6';
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                    <div
                      className="w-full rounded-sm"
                      style={{
                        height: `${barH}px`,
                        background: barColor,
                        opacity: isCurrent ? 1 : 0.55,
                        outline: isCurrent ? `1.5px solid ${barColor}` : 'none',
                        outlineOffset: '1px',
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex gap-1 mt-1">
              {MONTHS.map((m, i) => (
                <div
                  key={m}
                  className="flex-1 text-center"
                  style={{
                    fontSize: '7px',
                    fontWeight: i === currentMonth ? 700 : 500,
                    color: i === currentMonth ? '#10b981' : '#374151',
                  }}
                >
                  {m}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Seasonal note */}
        {seasonalNote && (
          <div
            className="px-3 py-2.5 rounded-xl text-[11px] leading-relaxed text-emerald-700 dark:text-emerald-300"
            style={{ borderLeft: '3px solid #10b981', background: 'rgba(16,185,129,0.06)' }}
          >
            {seasonalNote}
          </div>
        )}

      </div>

      {agent && shareMounted && (
        <Suspense fallback={null}>
          <ShareCuacaModal
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            city={city}
            syncedAt={syncedAt}
            agent={agent}
          />
        </Suspense>
      )}
    </div>
  );
}

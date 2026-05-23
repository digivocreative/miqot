import { useState, useEffect, useCallback } from 'react';
import { Sparkles, Plane, Calendar, Users, ChevronRight, X, AlertTriangle } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { getAuthHeaders } from './LoginPage';

interface InsightData {
  today: string;
  weekly: string;
  cuaca: string;
  generatedAt: string;
}

interface JamaahStats {
  totalBulanIni: number;
  totalBelumLunas: number;
  totalSisa: number;
  belumPaspor: number;
  pasporExpired: number;
  berangkat7Hari: number;
}

/** Parse **bold** markdown to <strong> elements */
function renderBold(text: string) {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-bold text-gray-700 dark:text-slate-200">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

function formatInsightDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}

/** Truncate text to ~50 chars, strip bold markers */
function truncateForBar(text: string, max = 50) {
  if (!text) return '';
  const clean = text.replace(/\*\*/g, '');
  if (clean.length <= max) return clean;
  return clean.slice(0, max).trim() + '…';
}

function formatRupiah(amount: number): string {
  if (amount >= 1_000_000) return `Rp${(amount / 1_000_000).toFixed(1).replace('.0', '')} jt`;
  if (amount >= 1_000) return `Rp${(amount / 1_000).toFixed(0)} rb`;
  return `Rp${amount}`;
}

interface CalendarInsightProps {
  onNavigate?: (tab: string) => void;
}

export default function CalendarInsight({ onNavigate }: CalendarInsightProps) {
  const [insight, setInsight] = useState<InsightData | null>(null);
  const [jamaahStats, setJamaahStats] = useState<JamaahStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAlert, setShowAlert] = useState(() => {
    const dismissed = localStorage.getItem('insightDismissedDate');
    if (!dismissed) return true;
    // Show again if dismissed date is not today
    const today = new Date().toISOString().slice(0, 10);
    return dismissed !== today;
  });
  const [showPopup, setShowPopup] = useState(false);

  const fetchInsight = useCallback(async () => {
    try {
      const [insightRes, jamaahRes] = await Promise.all([
        fetch('/api/calendar/insight', { headers: getAuthHeaders() }),
        fetch('/api/calendar/insight-jamaah', { headers: getAuthHeaders() }),
      ]);
      const insightData = await insightRes.json();
      if (insightData.success && insightData.data) {
        setInsight(insightData.data);
      }
      const jamaahData = await jamaahRes.json();
      if (jamaahData.success && jamaahData.data) {
        setJamaahStats(jamaahData.data);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchInsight(); }, [fetchInsight]);

  // Lock scroll when popup is open
  useEffect(() => {
    document.body.style.overflow = showPopup ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showPopup]);

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowAlert(false);
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem('insightDismissedDate', today);
  };

  // Don't show anything while loading or if no data
  if (loading || !insight) return null;

  // Summary text for alert bar
  const barText = truncateForBar(insight.today || insight.weekly);

  // Jamaah status: compute alert items
  const jamaahAlerts: string[] = [];
  if (jamaahStats) {
    if (jamaahStats.pasporExpired > 0) jamaahAlerts.push(`${jamaahStats.pasporExpired} paspor expired`);
    if (jamaahStats.belumPaspor > 0) jamaahAlerts.push(`${jamaahStats.belumPaspor} belum kumpul paspor`);
    if (jamaahStats.totalBelumLunas > 0) jamaahAlerts.push(`${jamaahStats.totalBelumLunas} belum lunas`);
  }
  const hasJamaahData = jamaahStats && jamaahStats.totalBulanIni > 0;

  return (
    <>
      {/* ── Alert Bar ── */}
      {showAlert && (
        <div
          onClick={() => setShowPopup(true)}
          className="flex items-center gap-2.5 px-3 py-2.5 mb-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 cursor-pointer hover:bg-emerald-100/60 dark:hover:bg-emerald-800/30 active:scale-[0.98] transition-all"
        >
          {/* Pulsing dot */}
          <div className="relative flex-shrink-0">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-glow" />
          </div>

          {/* Sparkle icon */}
          <div className="w-5 h-5 rounded-md bg-emerald-100 dark:bg-emerald-800/40 flex items-center justify-center flex-shrink-0">
            <Sparkles size={11} className="text-emerald-500 dark:text-emerald-400" />
          </div>

          {/* Text */}
          <p className="flex-1 text-[11px] text-gray-600 dark:text-slate-300 font-medium truncate">
            {barText}
          </p>

          {/* Close */}
          <button
            onClick={handleDismiss}
            className="w-5 h-5 rounded-md flex items-center justify-center text-emerald-400 dark:text-emerald-500 hover:text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-800/40 transition-colors flex-shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Bottom Sheet Popup ── */}
      <AnimatePresence>
        {showPopup && (
          <>
            <motion.div
              key="insight-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowPopup(false)}
            />

            <motion.div
              key="insight-sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="fixed inset-x-0 bottom-0 z-50 max-w-lg mx-auto bg-white dark:bg-slate-800 rounded-t-2xl border-t border-x border-gray-100 dark:border-slate-700 shadow-2xl max-h-[85vh] overflow-y-auto"
            >
              {/* Handle bar */}
              <div className="py-2 flex justify-center">
                <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-slate-600" />
              </div>

              {/* Header */}
              <div className="px-4 pb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 flex items-center justify-center flex-shrink-0">
                    <Sparkles size={14} className="text-amber-500 dark:text-amber-400" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-gray-800 dark:text-white">AI Insight</span>
                    {insight?.generatedAt && (
                      <p className="text-[9px] text-gray-400 dark:text-slate-500">{formatInsightDate(insight.generatedAt)}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setShowPopup(false)}
                  className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-gray-400 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors active:scale-95 flex-shrink-0 ml-2"
                >
                  <X size={16} />
                </button>
              </div>


              {/* Body */}
              <div className="flex-1 overflow-y-auto px-4 pb-5 space-y-2">
                {/* Card 1 — Hari Ini (emerald) */}
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800/40 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Plane size={12} className="text-emerald-500 dark:text-emerald-400" />
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">HARI INI</span>
                  </div>
                  <p className="text-[12px] text-gray-600 dark:text-slate-300 leading-relaxed">
                    {renderBold(insight.today)}
                  </p>
                </div>

                {/* Card 2 — 7 Hari ke Depan (blue) */}
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/40 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Calendar size={12} className="text-blue-500 dark:text-blue-400" />
                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide">7 HARI KE DEPAN</span>
                  </div>
                  <p className="text-[12px] text-gray-600 dark:text-slate-300 leading-relaxed">
                    {renderBold(insight.weekly)}
                  </p>
                </div>

                {/* Card 3 — Status Jamaah (amber, personalized & narrative) */}
                {hasJamaahData && (() => {
                  const s = jamaahStats!;
                  // Build narrative summary
                  const narrativeParts: string[] = [];
                  narrativeParts.push(`Bulan ini kamu punya **${s.totalBulanIni} jamaah** yang akan berangkat`);
                  if (s.berangkat7Hari > 0) {
                    narrativeParts[0] += `, **${s.berangkat7Hari}** di antaranya dalam 7 hari ke depan.`;
                  } else {
                    narrativeParts[0] += '.';
                  }
                  if (s.totalBelumLunas > 0) {
                    narrativeParts.push(`Ada **${s.totalBelumLunas} jamaah** yang pembayarannya belum lunas — yuk di-follow up!`);
                  }
                  if (s.belumPaspor > 0) {
                    narrativeParts.push(`**${s.belumPaspor} jamaah** belum kumpul paspor, pastikan segera diurus ya.`);
                  }
                  if (s.pasporExpired > 0) {
                    narrativeParts.push(`⚠️ **${s.pasporExpired} jamaah** paspornya expired sebelum keberangkatan!`);
                  }
                  if (s.totalBelumLunas === 0 && s.belumPaspor === 0 && s.pasporExpired === 0) {
                    narrativeParts.push('Semua dokumen dan pembayaran sudah aman 👍');
                  }

                  const hasIssues = s.totalBelumLunas > 0 || s.belumPaspor > 0 || s.pasporExpired > 0;

                  return (
                    <div
                      className={`bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800/40 px-3 py-2.5 ${onNavigate ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''}`}
                      onClick={() => {
                        if (onNavigate) {
                          setShowPopup(false);
                          setTimeout(() => onNavigate('jamaah'), 250);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <Users size={12} className="text-amber-500 dark:text-amber-400" />
                          <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">STATUS JAMAAH KAMU</span>
                        </div>
                        {hasIssues && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-[9px] font-bold text-red-600 dark:text-red-400">
                            <AlertTriangle size={9} />
                            {(s.totalBelumLunas > 0 ? 1 : 0) + (s.belumPaspor > 0 ? 1 : 0) + (s.pasporExpired > 0 ? 1 : 0)} perlu tindakan
                          </span>
                        )}
                      </div>

                      {/* Narrative text */}
                      <div className="text-[12px] text-gray-600 dark:text-slate-300 leading-relaxed space-y-1">
                        {narrativeParts.map((text, i) => (
                          <p key={i}>{renderBold(text)}</p>
                        ))}
                      </div>

                      {/* Navigate link */}
                      {onNavigate && (
                        <div className="flex items-center justify-end gap-0.5 mt-2 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                          <span>Lihat Detail di Jamaah</span>
                          <ChevronRight size={12} />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

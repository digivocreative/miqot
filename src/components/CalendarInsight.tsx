import { useState, useEffect, useCallback } from 'react';
import { Sparkles, Plane, Calendar, CloudSun, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { getAuthHeaders } from './LoginPage';

interface InsightData {
  today: string;
  weekly: string;
  cuaca: string;
  generatedAt: string;
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

export default function CalendarInsight() {
  const [insight, setInsight] = useState<InsightData | null>(null);
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
      const res = await fetch('/api/calendar/insight', { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success && data.data) {
        setInsight(data.data);
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
            <div className="w-2 h-2 rounded-full bg-emerald-500" style={{ animation: 'pulse-glow 2s ease-in-out infinite' }} />
          </div>

          {/* Sparkle icon */}
          <div className="w-5 h-5 rounded-md bg-emerald-100 dark:bg-emerald-800/40 flex items-center justify-center flex-shrink-0">
            <Sparkles size={11} className="text-emerald-500 dark:text-emerald-400" />
          </div>

          {/* Text */}
          <p className="flex-1 text-[11px] text-gray-600 dark:text-slate-300 font-medium truncate">
            <span className="font-bold text-emerald-600 dark:text-emerald-400">AI Insight</span>
            {' — '}{barText}
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
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 flex items-center justify-center">
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
                  className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-gray-400 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors active:scale-95"
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

                {/* Card 3 — Cuaca Tanah Suci (amber) */}
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800/40 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CloudSun size={12} className="text-amber-500 dark:text-amber-400" />
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">CUACA TANAH SUCI</span>
                  </div>
                  <p className="text-[12px] text-gray-600 dark:text-slate-300 leading-relaxed">
                    {renderBold(insight.cuaca)}
                  </p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Pulse glow animation */}
      <style>{`
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.3); }
          50% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
        }
      `}</style>
    </>
  );
}

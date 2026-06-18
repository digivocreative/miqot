'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, Copy, ClipboardCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSessionAuthHeaders } from '@/utils/authUtils';
import { shareCaption } from '@/utils/share';
import WhatsAppIcon from './common/WhatsAppIcon';

// Rate limiting: shared across every Caption AI entry point (15 generates per 2 hours per device)
const AI_RATE_KEY = 'ai_copy_timestamps';
const AI_RATE_LIMIT = 15;
const AI_RATE_WINDOW = 2 * 60 * 60 * 1000; // 2 hours in ms

// Loading status — bergeser tiap 2 detik dan berhenti di pesan terakhir
const LOADING_STEPS = [
  'Membaca isi brosur…',
  'Menyusun 3 gaya caption…',
  'Memoles kata-kata…',
];

// Skeleton "caption sedang ditulis" — lebar baris meniru paragraf caption WA
const SKELETON_WIDTHS = ['w-3/4', 'w-full', 'w-5/6', 'w-2/3', 'w-11/12', 'w-1/2'];

interface CaptionVersion {
  label: string;
  text: string;
}

interface CaptionAIModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Shown in the idle state ("Buat caption promosi WhatsApp untuk …") */
  subject: string;
  /** Request body for POST /api/ai-copy (packageData or monthData shape) */
  buildPayload: () => Record<string, unknown>;
  /** Local template shown (clearly labeled) when the API call fails */
  buildFallbackText?: () => string;
}

/**
 * Caption AI modal — generates WhatsApp promo captions via /api/ai-copy.
 * One generate returns 3 styled versions (Singkat / Storytelling / Promosi)
 * shown as tabs so the agent can pick the copywriting they prefer.
 * Generate is manual (idle state) so opening the modal doesn't burn the rate limit.
 * Used by PackageCard (per-package) and BrochureSchedulePage (per-month brochure).
 */
export function CaptionAIModal({ isOpen, onClose, subject, buildPayload, buildFallbackText }: CaptionAIModalProps) {
  const [versions, setVersions] = useState<CaptionVersion[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Payload snapshot behind the current captions — to detect stale data on reopen
  const lastPayloadRef = useRef<string | null>(null);

  const text = versions[activeIdx]?.text ?? '';

  // Subject changed (e.g. brochure filter switched) → stale captions, back to idle
  useEffect(() => {
    setVersions([]);
    setActiveIdx(0);
    setError(null);
    lastPayloadRef.current = null;
  }, [subject]);

  // Reopened after the underlying data changed (e.g. background package refresh
  // updated seats/prices while the label stayed the same) → stale, back to idle
  useEffect(() => {
    if (!isOpen || versions.length === 0 || !lastPayloadRef.current) return;
    if (JSON.stringify(buildPayload()) !== lastPayloadRef.current) {
      setVersions([]);
      setActiveIdx(0);
      setError(null);
      lastPayloadRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Cycle loading status messages while generating, clamped at the last step
  useEffect(() => {
    if (!loading) return;
    setLoadingStep(0);
    const id = setInterval(() => {
      setLoadingStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1));
    }, 2000);
    return () => clearInterval(id);
  }, [loading]);

  const generate = async () => {
    // Rate limiting check (skip on localhost)
    const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const now = Date.now();
    let timestamps: number[] = [];
    try {
      timestamps = JSON.parse(localStorage.getItem(AI_RATE_KEY) || '[]');
    } catch { timestamps = []; }

    // Keep only timestamps within the 2-hour window
    timestamps = timestamps.filter((t) => now - t < AI_RATE_WINDOW);

    if (!isLocal && timestamps.length >= AI_RATE_LIMIT) {
      const oldestInWindow = Math.min(...timestamps);
      const resetTime = new Date(oldestInWindow + AI_RATE_WINDOW);
      const minutesLeft = Math.ceil((resetTime.getTime() - now) / 60000);
      setError(`Limit generate caption telah tercapai. Coba lagi dalam ${minutesLeft} menit.`);
      return;
    }

    setLoading(true);
    setError(null);
    setCopied(false);

    try {
      const payloadJson = JSON.stringify(buildPayload());
      lastPayloadRef.current = payloadJson;

      // Add timeout to prevent hanging fetch (3 versions take a bit longer than 1)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      const res = await fetch('/api/ai-copy', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...getSessionAuthHeaders() },
        body: payloadJson,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.details || errData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const fresh: CaptionVersion[] = (Array.isArray(data.versions) ? data.versions : [])
        .filter((v: any) => v && typeof v.text === 'string' && v.text.trim())
        .map((v: any, i: number) => ({
          label: typeof v.label === 'string' && v.label.trim() ? v.label : `Versi ${i + 1}`,
          text: v.text,
        }));
      // Backward compat: server lama membalas single-text
      if (fresh.length === 0 && typeof data.text === 'string' && data.text.trim()) {
        fresh.push({ label: 'Caption', text: data.text });
      }
      if (fresh.length === 0) throw new Error('Empty response');
      setVersions(fresh);
      setActiveIdx(0);

      // Record successful generation only
      timestamps.push(now);
      localStorage.setItem(AI_RATE_KEY, JSON.stringify(timestamps));
    } catch (err: any) {
      console.error('Caption AI error:', err);
      const isTimeout = err.name === 'AbortError';
      // Show error + provide fallback text (clearly labeled) — don't count toward rate limit
      setError(isTimeout ? 'Koneksi timeout. Silakan coba lagi.' : 'Gagal generate dari AI. Silakan coba lagi atau gunakan template di bawah.');
      if (buildFallbackText) {
        setVersions([{ label: 'Template', text: buildFallbackText() }]);
        setActiveIdx(0);
      }
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal Content */}
          <motion.div
            className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-indigo-500" />
                <h2 className="text-sm font-bold text-gray-900 dark:text-white">Caption AI</h2>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {loading ? (
                /* Loading state — sparkle orb + cycling status + shimmering skeleton caption */
                <div className="flex flex-col items-center justify-center py-4 gap-4">
                  <div className="relative w-16 h-16">
                    {/* Pulsing gradient halo */}
                    <motion.div
                      className="absolute inset-0 rounded-full bg-gradient-to-tr from-indigo-400 via-purple-400 to-fuchsia-400"
                      animate={{ scale: [1, 1.3, 1], opacity: [0.25, 0.5, 0.25] }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <div className="absolute inset-2 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
                      <motion.div
                        animate={{ rotate: [0, 14, -14, 0], scale: [1, 1.12, 1] }}
                        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                      >
                        <Sparkles size={26} className="text-indigo-500" />
                      </motion.div>
                    </div>
                  </div>

                  {/* Cycling status message */}
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={loadingStep}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      transition={{ duration: 0.25 }}
                      className="text-sm text-gray-500 dark:text-slate-400 font-medium"
                    >
                      {LOADING_STEPS[loadingStep]}
                    </motion.p>
                  </AnimatePresence>

                  {/* Skeleton caption with shimmer sweep */}
                  <div className="relative w-full overflow-hidden bg-gray-50 dark:bg-slate-900/60 border border-gray-100 dark:border-slate-700 rounded-xl p-4">
                    <div className="space-y-2.5">
                      {SKELETON_WIDTHS.map((w) => (
                        <div key={w} className={`h-2.5 rounded-full bg-gray-200/90 dark:bg-slate-700/70 ${w}`} />
                      ))}
                    </div>
                    <motion.div
                      className="absolute inset-0 pointer-events-none"
                      animate={{ x: ['-100%', '100%'] }}
                      transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
                    >
                      <div className="h-full w-1/2 bg-gradient-to-r from-transparent via-white/70 dark:via-slate-300/10 to-transparent" />
                    </motion.div>
                  </div>
                </div>
              ) : error && versions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                  <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                    <X size={24} className="text-red-500" />
                  </div>
                  <p className="text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>
                  <button
                    onClick={generate}
                    className="text-sm text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                  >
                    Coba lagi
                  </button>
                </div>
              ) : versions.length === 0 ? (
                /* Idle state — generate is manual so opening the modal doesn't burn the rate limit */
                <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
                  <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center">
                    <Sparkles size={22} className="text-indigo-500" />
                  </div>
                  <p className="text-sm text-gray-600 dark:text-slate-300 max-w-[280px]">
                    Buat caption promosi WhatsApp untuk <span className="font-semibold">{subject}</span> — AI menyiapkan 3 gaya caption, tinggal pilih yang paling pas.
                  </p>
                  <button
                    onClick={generate}
                    className="
                      flex items-center justify-center gap-2 py-3 px-6
                      rounded-xl text-sm font-bold text-white
                      bg-indigo-600 hover:bg-indigo-700
                      shadow-md shadow-indigo-500/20
                      transition-all duration-200 active:scale-95
                    "
                  >
                    <Sparkles size={16} />
                    <span>Buat Caption</span>
                  </button>
                </div>
              ) : (
                <>
                  {/* Error banner with fallback text shown below */}
                  {error && (
                    <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl flex items-start gap-2">
                      <span className="text-amber-500 mt-0.5 flex-shrink-0">⚠️</span>
                      <div className="flex-1">
                        <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">{error}</p>
                        <button
                          onClick={generate}
                          disabled={loading}
                          className="mt-1 text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                        >
                          🔄 Coba Lagi dengan AI
                        </button>
                      </div>
                    </div>
                  )}
                  {error && (
                    <p className="text-[11px] text-gray-400 dark:text-slate-500 mb-2 italic">* Teks di bawah adalah template, bukan hasil AI</p>
                  )}

                  {/* Version tabs — segmented control, only when there's a choice */}
                  {versions.length > 1 && (
                    <div className="mb-3 bg-gray-100 dark:bg-slate-900/60 rounded-xl p-1 flex gap-1">
                      {versions.map((v, i) => (
                        <button
                          key={`${v.label}-${i}`}
                          onClick={() => { setActiveIdx(i); setCopied(false); }}
                          className={`
                            flex-1 py-2 px-1 rounded-lg text-[11px] transition-all duration-200
                            ${i === activeIdx
                              ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 font-semibold shadow-sm'
                              : 'text-gray-400 dark:text-slate-500 font-medium active:opacity-70'}
                          `}
                        >
                          {v.label}
                        </button>
                      ))}
                    </div>
                  )}

                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={activeIdx}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.15 }}
                      className="bg-gray-50 dark:bg-slate-900/60 border border-gray-100 dark:border-slate-700 rounded-xl p-4 text-sm text-gray-700 dark:text-slate-200 leading-relaxed whitespace-pre-line"
                    >
                      {text}
                    </motion.div>
                  </AnimatePresence>
                </>
              )}
            </div>

            {/* Footer — hidden in idle state (no caption yet) */}
            {(versions.length > 0 || loading) && (
              <div className="px-4 py-3 border-t border-gray-200 dark:border-slate-700 flex gap-2">
                {/* Salin Teks Button */}
                <button
                  disabled={loading || !text}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(text);
                    } catch {
                      const ta = document.createElement('textarea');
                      ta.value = text;
                      document.body.appendChild(ta);
                      ta.select();
                      document.execCommand('copy');
                      document.body.removeChild(ta);
                    }
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className={`
                    flex-1 flex items-center justify-center gap-1.5 py-3
                    rounded-xl text-sm font-bold
                    bg-gray-100 text-gray-700 hover:bg-gray-200
                    dark:bg-slate-700/60 dark:text-slate-200 dark:hover:bg-slate-700
                    transition-all duration-200 active:scale-95
                    ${loading || !text ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  {copied ? (
                    <><ClipboardCheck size={17} className="text-emerald-500" /><span>Tersalin</span></>
                  ) : (
                    <><Copy size={17} /><span>Salin</span></>
                  )}
                </button>

                {/* Kirim WA Button */}
                <button
                  disabled={loading || !text}
                  onClick={() => shareCaption(text)}
                  className={`
                    flex-1 flex items-center justify-center gap-1.5 py-3
                    rounded-xl text-sm font-bold text-white
                    bg-emerald-500 hover:bg-emerald-600
                    shadow-md shadow-emerald-500/20
                    transition-all duration-200 active:scale-95
                    ${loading || !text ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  <WhatsAppIcon size={17} />
                  <span>Kirim WA</span>
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export default CaptionAIModal;

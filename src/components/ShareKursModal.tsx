import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Share2, Copy } from 'lucide-react';
import {
  KURS_TEMPLATES,
  formatKurs,
  normalizePhone,
  type KursTemplateId,
  type KursTemplateProps,
} from './KursShareTemplates';
import { trackEvent } from '../utils/analytics';

export interface ShareKursModalProps {
  open: boolean;
  onClose: () => void;
  kurs: { usd: number; sar: number; updatedAt: string };
  agent: { name: string; phone: string; photo: string; slug: string };
}

const PREVIEW_WIDTH = 360;
const CANVAS_SIZE = 1080;
const PREVIEW_SCALE = PREVIEW_WIDTH / CANVAS_SIZE;
const THUMB_WIDTH = 72;
const THUMB_SCALE = THUMB_WIDTH / CANVAS_SIZE;

export default function ShareKursModal({ open, onClose, kurs, agent }: ShareKursModalProps) {
  const [selectedId, setSelectedId] = useState<KursTemplateId>('minimalist');
  const [isExporting, setIsExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    if (open) trackEvent('feature', 'open_share_kurs');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const fonts = ['DM Serif Display', 'Amiri'];
    fonts.forEach(f => {
      try { document.fonts?.load(`16px "${f}"`); } catch {}
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const templateProps: KursTemplateProps = useMemo(() => ({ kurs, agent }), [kurs, agent]);
  const current = KURS_TEMPLATES.find(t => t.id === selectedId) || KURS_TEMPLATES[0];
  const Renderer = current.Renderer;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const waitForFonts = async () => {
    try { await document.fonts?.ready; } catch {}
  };

  const yyyymmdd = () => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  };

  const handleDownload = async () => {
    if (!exportRef.current || isExporting) return;
    setIsExporting(true);
    try {
      await waitForFonts();
      const { snapdom } = await import('@zumer/snapdom');
      const result = await snapdom(exportRef.current, { scale: 2 });
      await result.download({ type: 'png', filename: `kurs-${selectedId}-${yyyymmdd()}` });
      trackEvent('action', 'download_share_kurs', { template: selectedId });
    } catch (e) {
      console.error('[ShareKurs] Download gagal:', e);
      showToast('Gagal generate gambar, coba lagi');
    } finally {
      setIsExporting(false);
    }
  };

  const handleShare = async () => {
    if (!exportRef.current || isExporting) return;
    setIsExporting(true);
    try {
      await waitForFonts();
      const { snapdom } = await import('@zumer/snapdom');
      const result = await snapdom(exportRef.current, { scale: 2 });
      const blob = await result.toBlob({ type: 'png' });
      const file = new File([blob], `kurs-${selectedId}-${yyyymmdd()}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        trackEvent('action', 'share_kurs', { template: selectedId });
      } else {
        await result.download({ type: 'png', filename: `kurs-${selectedId}-${yyyymmdd()}` });
        showToast('Share tidak didukung, gambar diunduh');
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error('[ShareKurs] Share gagal:', e);
        showToast('Share gagal, coba lagi');
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyCaption = async () => {
    const wa = normalizePhone(agent.phone);
    const web = `${agent.slug || 'agent'}.alhijaz.co`;
    const caption = [
      `📊 Update Kurs Bank Mandiri — ${kurs.updatedAt}`,
      '',
      `💵 USD: Rp ${formatKurs(kurs.usd)}`,
      `🇸🇦 SAR: Rp ${formatKurs(kurs.sar)}`,
      '',
      'Info paket Umroh & Haji:',
      agent.name,
      `wa.me/${wa}`,
      web,
    ].join('\n');

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(caption);
      } else {
        const ta = document.createElement('textarea');
        ta.value = caption;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      showToast('Caption tersalin');
      trackEvent('action', 'copy_kurs_caption');
    } catch (e) {
      console.error('[ShareKurs] Copy gagal:', e);
      showToast('Gagal menyalin caption');
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[9999] bg-white dark:bg-slate-900 flex flex-col"
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        >
          {/* ─── STICKY HEADER ─── */}
          <div className="flex-none sticky top-0 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-gray-200/60 dark:border-slate-700/60 px-5 py-4 flex justify-between items-center shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate pr-4">
              Bagikan Kurs
            </h2>
            <button
              onClick={onClose}
              aria-label="Tutup"
              className="p-2 bg-gray-100 dark:bg-slate-800 rounded-full text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors shrink-0"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* ─── SCROLLABLE CONTENT ─── */}
          <div className="flex-1 overflow-y-auto bg-gray-100 dark:bg-slate-950 px-5 py-5">
            <div className="max-w-md mx-auto space-y-5">
              {/* Preview card */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-4 flex justify-center">
                <div style={{ width: PREVIEW_WIDTH, height: PREVIEW_WIDTH, position: 'relative', borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
                  <div style={{ transform: `scale(${PREVIEW_SCALE})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
                    <div ref={exportRef}>
                      <Renderer {...templateProps} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Thumbnail picker card */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-3">Pilih Desain</div>
                <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
                  {KURS_TEMPLATES.map(t => {
                    const T = t.Renderer;
                    const active = t.id === selectedId;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setSelectedId(t.id)}
                        className={`flex-shrink-0 rounded-xl overflow-hidden transition-all active:scale-95 ${active ? 'ring-2 ring-emerald-500' : 'ring-1 ring-gray-200 dark:ring-slate-700'}`}
                        style={{ width: THUMB_WIDTH, height: THUMB_WIDTH, position: 'relative' }}
                        aria-label={t.name}
                      >
                        <div style={{ transform: `scale(${THUMB_SCALE})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
                          <T {...templateProps} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ─── STICKY FOOTER ─── */}
          <div className="flex-none sticky bottom-0 bg-white dark:bg-slate-900 border-t border-gray-200/60 dark:border-slate-700/60 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <div className="max-w-md mx-auto space-y-2">
              <div className={`grid ${canShare ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
                <button
                  onClick={handleDownload}
                  disabled={isExporting}
                  className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition"
                >
                  <Download size={16} strokeWidth={2.5} />
                  {isExporting ? 'Menyimpan...' : 'Download'}
                </button>
                {canShare && (
                  <button
                    onClick={handleShare}
                    disabled={isExporting}
                    className="flex items-center justify-center gap-2 py-3.5 rounded-xl border border-emerald-500 text-emerald-600 dark:text-emerald-400 text-sm font-bold hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-50 active:scale-95 transition"
                  >
                    <Share2 size={16} strokeWidth={2.5} />
                    Bagikan
                  </button>
                )}
              </div>
              <button
                onClick={handleCopyCaption}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-slate-800 active:scale-95 transition"
              >
                <Copy size={16} strokeWidth={2.5} />
                Salin Caption
              </button>
            </div>
          </div>

          {/* Toast */}
          {toast && (
            <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[10000] bg-gray-900 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-xl">
              {toast}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

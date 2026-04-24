import { useState, useRef, useEffect, useMemo } from 'react';
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
    // Prime font loading untuk semua template
    const fonts = ['DM Serif Display', 'Amiri'];
    fonts.forEach(f => {
      try { (document as any).fonts?.load?.(`16px "${f}"`); } catch {}
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
    try { await (document as any).fonts?.ready; } catch {}
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
        // Fallback — trigger download
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
        // Legacy fallback
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-slate-800 active:scale-95 transition">
            <X size={20} className="text-gray-700 dark:text-slate-300" />
          </button>
          <div className="text-sm font-bold text-gray-800 dark:text-white">Bagikan Kurs</div>
          <div className="w-9" />
        </div>

        {/* Preview */}
        <div className="px-5 pt-5 pb-4 flex justify-center">
          <div style={{ width: PREVIEW_WIDTH, height: PREVIEW_WIDTH, position: 'relative', borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
            {/* Scaler wrapper — apply transform only for visuals */}
            <div style={{ transform: `scale(${PREVIEW_SCALE})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
              {/* exportRef on unscaled 1080×1080 element so snapdom captures full size */}
              <div ref={exportRef}>
                <Renderer {...templateProps} />
              </div>
            </div>
          </div>
        </div>

        {/* Thumbnail picker */}
        <div className="px-5 pb-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2">Pilih Desain</div>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
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

        {/* Actions */}
        <div className="px-5 pb-6 space-y-2">
          <div className={`grid ${canShare ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
            <button
              onClick={handleDownload}
              disabled={isExporting}
              className="flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-bold shadow-md shadow-emerald-500/20 active:scale-95 transition"
            >
              <Download size={16} strokeWidth={2.5} />
              {isExporting ? 'Menyimpan...' : 'Download'}
            </button>
            {canShare && (
              <button
                onClick={handleShare}
                disabled={isExporting}
                className="flex items-center justify-center gap-2 py-3 rounded-xl border border-emerald-500 text-emerald-600 dark:text-emerald-400 text-sm font-bold hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-50 active:scale-95 transition"
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

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-xl">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Copy, Download, Loader2, RotateCcw, Share2, X } from 'lucide-react';
import { CuacaShareTemplate } from './cuaca-share/CuacaShareTemplate';
import type { CuacaShareAssets } from './cuaca-share/CuacaShareTemplate';
import { buildCuacaCaption, buildCuacaShareProps, CUACA_SHARE_H, CUACA_SHARE_W } from '../../lib/cuaca-share-data.js';
import type { CuacaShareCity } from '../../lib/cuaca-share-data.js';
import { trackEvent } from '../utils/analytics';
import { canShareFiles, downloadBlob, isTouchPrimary } from '../utils/share';
import { normalizeWaNumber } from '../utils/phone';
import { useBackToClose } from '../hooks/useBackToClose';
import { lockDocumentScroll } from '../lib/scrollLock';
import { getAuthHeaders } from '../lib/authSession';

export interface CuacaShareAgent {
  name: string;
  phone: string;
  photo: string;
  slug: string;
}

export interface ShareCuacaModalProps {
  open: boolean;
  onClose: () => void;
  city: CuacaShareCity;
  syncedAt: string | null;
  agent: CuacaShareAgent;
}

const PREVIEW_MAX_WIDTH = 420;
const PREVIEW_MIN_WIDTH = 260;
const PREVIEW_FRAME_INSET = 32;
const LOGO_SRC = '/logo-alhijaz-besar.svg';

type ImageState = 'loading' | 'ready' | 'error';

/** Gestur ketuk sudah kedaluwarsa → share sheet pasti ditolak (pola ShareKursModal). */
function tapActivationExpired(): boolean {
  const activation = (navigator as { userActivation?: UserActivation }).userActivation;
  return activation ? !activation.isActive : false;
}

export default function ShareCuacaModal({ open, onClose, city, syncedAt, agent }: ShareCuacaModalProps) {
  const [imageState, setImageState] = useState<ImageState>('loading');
  const [attempt, setAttempt] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [readyFile, setReadyFile] = useState<File | null>(null);
  const [previewScale, setPreviewScale] = useState(PREVIEW_MAX_WIDTH / CUACA_SHARE_W);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const blobRef = useRef<Blob | null>(null);

  const data = useMemo(() => buildCuacaShareProps(city, agent, { syncedAt }), [city, agent, syncedAt]);
  const previewAssets: CuacaShareAssets = useMemo(() => ({
    photoSrc: data.photo ? `/cuaca-share/${data.photo}` : null,
    logoSrc: LOGO_SRC,
    agentPhotoSrc: agent.photo || null,
  }), [data.photo, agent.photo]);
  const fileName = `cuaca-${data.cityKey}-${data.dateKey}.jpg`;
  const showShareButton = isTouchPrimary() && typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useBackToClose(open, onClose);
  useEffect(() => (open ? lockDocumentScroll() : undefined), [open]);

  useEffect(() => {
    if (open) trackEvent('feature', 'open_share_cuaca', { city: city.key });
  }, [open, city.key]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Ambil JPEG server di latar begitu sheet terbuka: saat tombol diketuk berkas
  // sudah siap, jadi navigator.share() dipanggil tanpa await (gestur iOS aman).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    blobRef.current = null;
    setReadyFile(null);
    setImageState('loading');
    (async () => {
      try {
        const res = await fetch(`/api/weather/share-image?city=${encodeURIComponent(city.key)}`, {
          headers: getAuthHeaders(),
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        blobRef.current = blob;
        setImageState('ready');
      } catch (err) {
        if (cancelled) return;
        console.error('[ShareCuaca] Gambar gagal:', err);
        setImageState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [open, city.key, syncedAt, attempt]);

  const computeScale = useCallback(() => {
    if (!previewContainerRef.current) return;
    const available = Math.max(0, previewContainerRef.current.clientWidth - PREVIEW_FRAME_INSET);
    setPreviewScale(Math.max(PREVIEW_MIN_WIDTH, Math.min(available, PREVIEW_MAX_WIDTH)) / CUACA_SHARE_W);
  }, []);

  useEffect(() => {
    if (!open) return;
    computeScale();
    window.addEventListener('resize', computeScale);
    return () => window.removeEventListener('resize', computeScale);
  }, [open, computeScale]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleDownload = () => {
    const blob = blobRef.current;
    if (!blob) return;
    downloadBlob(blob, fileName);
    trackEvent('action', 'download_share_cuaca', { city: city.key });
  };

  const shareFile = async (file: File) => {
    try {
      await navigator.share({ files: [file] });
      trackEvent('action', 'share_cuaca', { city: city.key });
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      if (e?.name === 'NotAllowedError') {
        setReadyFile(file);
        return;
      }
      console.error('[ShareCuaca] Share gagal:', e);
      downloadBlob(file, file.name);
      showToast('Gagal membuka menu bagikan. Gambar diunduh sebagai gantinya.');
    }
  };

  const handleShare = () => {
    if (readyFile) {
      const file = readyFile;
      setReadyFile(null);
      void shareFile(file);
      return;
    }
    const blob = blobRef.current;
    if (!blob) return;
    const file = new File([blob], fileName, { type: 'image/jpeg' });
    if (!canShareFiles([file])) {
      downloadBlob(blob, fileName);
      showToast('Perangkat ini tidak bisa berbagi langsung. Gambar diunduh.');
      return;
    }
    if (tapActivationExpired()) {
      setReadyFile(file);
      return;
    }
    void shareFile(file);
  };

  const handleCopyCaption = async () => {
    const caption = buildCuacaCaption(data, { waNumber: normalizeWaNumber(agent.phone) });
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
      trackEvent('action', 'copy_cuaca_caption', { city: city.key });
    } catch (e) {
      console.error('[ShareCuaca] Copy gagal:', e);
      showToast('Gagal menyalin caption');
    }
  };

  const busy = imageState !== 'ready';
  const previewW = CUACA_SHARE_W * previewScale;
  const previewH = CUACA_SHARE_H * previewScale;

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
          <div className="flex-none sticky top-0 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-gray-200/60 dark:border-slate-700/60 px-5 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] flex justify-between items-center shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate pr-4">Bagikan Cuaca</h2>
            <button
              onClick={onClose}
              aria-label="Tutup"
              className="touch-hit relative p-2 bg-gray-100 dark:bg-slate-800 rounded-full text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors shrink-0"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto bg-gray-100 dark:bg-slate-950 px-5 py-6">
            <div ref={previewContainerRef} className="max-w-xl mx-auto">
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3 flex justify-center">
                <div style={{ width: previewW, height: previewH, position: 'relative', borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
                  <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0, width: CUACA_SHARE_W, height: CUACA_SHARE_H }}>
                    <CuacaShareTemplate data={data} assets={previewAssets} />
                  </div>
                </div>
              </div>
              {imageState === 'error' && (
                <div role="alert" className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-4 py-3">
                  <span className="text-xs font-semibold text-red-700 dark:text-red-300">Gagal membuat gambar</span>
                  <button
                    onClick={() => setAttempt(n => n + 1)}
                    className="flex items-center gap-1.5 text-xs font-bold text-red-700 dark:text-red-300 active:scale-95"
                  >
                    <RotateCcw size={14} strokeWidth={2.5} />
                    Coba lagi
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex-none sticky bottom-0 bg-white dark:bg-slate-900 border-t border-gray-200/60 dark:border-slate-700/60 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <div className="max-w-md mx-auto space-y-2">
              <div className={`grid ${showShareButton ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
                <button
                  onClick={handleDownload}
                  disabled={busy}
                  className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition"
                >
                  {imageState === 'loading' ? <Loader2 size={16} strokeWidth={2.5} className="animate-spin" /> : <Download size={16} strokeWidth={2.5} />}
                  {imageState === 'loading' ? 'Menyiapkan gambar…' : 'Download'}
                </button>
                {showShareButton && (
                  <button
                    onClick={handleShare}
                    disabled={busy}
                    className="flex items-center justify-center gap-2 whitespace-nowrap py-3.5 rounded-xl border border-emerald-500 text-emerald-600 dark:text-emerald-400 text-sm font-bold hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-50 active:scale-95 transition"
                  >
                    <Share2 size={16} strokeWidth={2.5} />
                    {readyFile ? 'Bagikan sekarang' : 'Bagikan'}
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

          {toast && (
            <div role="status" className="fixed bottom-[calc(7rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[10000] w-max max-w-[calc(100vw-2rem)] text-center bg-gray-900 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-xl">
              {toast}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

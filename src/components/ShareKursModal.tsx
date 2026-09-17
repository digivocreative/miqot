import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Share2, Copy } from 'lucide-react';
import {
  KursTemplate,
  TEMPLATE_W,
  TEMPLATE_H,
  formatKurs,
  normalizePhone,
} from './KursShareTemplates';
import { trackEvent } from '../utils/analytics';
import { canShareFiles, downloadBlob, isTouchPrimary } from '../utils/share';
import { useBackToClose } from '../hooks/useBackToClose';
import { describeLoadError } from '../lib/loadError';
import { getAuthHeaders } from './LoginPage';

export interface ShareKursModalProps {
  open: boolean;
  onClose: () => void;
  kurs: { usd: number; updatedAt: string };
  agent: { name: string; phone: string; photo: string; slug: string; website?: string };
}

const PREVIEW_MAX_WIDTH = 520;
const PREVIEW_MIN_WIDTH = 280;
const PREVIEW_FRAME_INSET = 32;
const EXPORT_MIME = 'image/jpeg';

/** Galat yang pesannya sudah berupa kalimat untuk pengguna (bukan teks teknis). */
class KursImageError extends Error {}

function kursErrorCopy(error: unknown): string {
  return error instanceof KursImageError ? error.message : 'Gambar kurs belum bisa dibuat. Coba lagi.';
}

/** Gestur ketuk sudah kedaluwarsa, share sheet pasti ditolak (navigator.userActivation belum ada di semua peramban). */
function tapActivationExpired(): boolean {
  const activation = (navigator as { userActivation?: UserActivation }).userActivation;
  return activation ? !activation.isActive : false;
}

export default function ShareKursModal({ open, onClose, kurs, agent }: ShareKursModalProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [previewScale, setPreviewScale] = useState(PREVIEW_MAX_WIDTH / TEMPLATE_W);
  // Gambar dari server menunggu satu ketukan lagi: iOS menolak share sheet
  // (NotAllowedError) bila gestur ketuk sudah "habis" dipakai menunggu server.
  // Ketukan berikutnya adalah gestur baru → navigator.share() langsung, tanpa await.
  const [readyFile, setReadyFile] = useState<File | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  // Gambar yang sudah diambil dipakai ulang selama modal terbuka (Download lalu
  // Bagikan tidak meminta server dua kali).
  const blobRef = useRef<Blob | null>(null);

  const showShareButton = isTouchPrimary() && typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    if (open) trackEvent('feature', 'open_share_kurs');
  }, [open]);

  // Back Android menutup modal, bukan dashboard di bawahnya.
  useBackToClose(open, onClose);

  useEffect(() => {
    blobRef.current = null;
    setReadyFile(null);
  }, [open, kurs.usd, kurs.updatedAt]);

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

  const computeScale = useCallback(() => {
    if (!previewContainerRef.current) return;
    const containerW = previewContainerRef.current.clientWidth;
    const availableW = Math.max(0, containerW - PREVIEW_FRAME_INSET);
    const targetW = Math.max(PREVIEW_MIN_WIDTH, Math.min(availableW, PREVIEW_MAX_WIDTH));
    setPreviewScale(targetW / TEMPLATE_W);
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

  const yyyymmdd = () => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  };

  const captureKursBlob = async (): Promise<Blob> => {
    if (blobRef.current) return blobRef.current;
    let res: Response;
    try {
      res = await fetch('/api/kurs/share-image', {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
    } catch (err) {
      throw new KursImageError(describeLoadError(err));
    }
    if (!res.ok) {
      // 503 = kurs hari ini belum masuk; selain itu diterjemahkan dari status
      // HTTP — teks galat server tidak ditampilkan apa adanya.
      throw new KursImageError(res.status === 503
        ? 'Kurs belum tersedia. Coba lagi nanti.'
        : describeLoadError(new Error(`HTTP status: ${res.status}`)));
    }
    const blob = await res.blob();
    blobRef.current = blob;
    return blob;
  };

  const handleDownload = async () => {
    if (!exportRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const blob = await captureKursBlob();
      downloadBlob(blob, `kurs-${yyyymmdd()}.jpg`);
      trackEvent('action', 'download_share_kurs');
    } catch (e) {
      console.error('[ShareKurs] Download gagal:', e);
      showToast(kursErrorCopy(e));
    } finally {
      setIsExporting(false);
    }
  };

  // Share sheet ditolak bukan karena dibatalkan → berkas tetap sampai lewat unduhan.
  const fallbackToDownload = (file: File) => {
    downloadBlob(file, file.name);
    showToast('Gagal membuka menu bagikan. Gambar diunduh sebagai gantinya.');
  };

  // Ketukan kedua: berkas sudah siap, share dipanggil sebelum await apa pun.
  const shareReadyFile = async () => {
    const file = readyFile;
    if (!file) return;
    setReadyFile(null);
    try {
      await navigator.share({ files: [file] });
      trackEvent('action', 'share_kurs');
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.error('[ShareKurs] Share gagal:', e);
      fallbackToDownload(file);
    }
  };

  const handleShare = async () => {
    if (!exportRef.current || isExporting) return;
    if (readyFile) {
      void shareReadyFile();
      return;
    }
    setIsExporting(true);
    try {
      const blob = await captureKursBlob();
      const file = new File([blob], `kurs-${yyyymmdd()}.jpg`, { type: EXPORT_MIME });
      if (!canShareFiles([file])) {
        downloadBlob(blob, file.name);
        showToast('Perangkat ini tidak bisa berbagi langsung. Gambar diunduh.');
        return;
      }
      if (tapActivationExpired()) {
        setReadyFile(file);
        return;
      }
      try {
        await navigator.share({ files: [file] });
        trackEvent('action', 'share_kurs');
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        if (e?.name === 'NotAllowedError') {
          setReadyFile(file);
          return;
        }
        console.error('[ShareKurs] Share gagal:', e);
        fallbackToDownload(file);
      }
    } catch (e) {
      console.error('[ShareKurs] Share gagal:', e);
      showToast(kursErrorCopy(e));
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyCaption = async () => {
    const wa = normalizePhone(agent.phone);
    const web = agent.website?.trim()
      ? agent.website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/g, '')
      : `wa.me/${wa}`;
    const caption = [
      `📊 Update Kurs Bank Mandiri — ${kurs.updatedAt}`,
      '',
      `💵 USD: Rp ${formatKurs(kurs.usd)}`,
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

  const previewW = TEMPLATE_W * previewScale;
  const previewH = TEMPLATE_H * previewScale;

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
          {/* ─── STICKY HEADER ─── (pt safe-area: app terpasang di iOS digambar
              di bawah status bar; tombol X yang tertutup tidak bisa diketuk) */}
          <div className="flex-none sticky top-0 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-gray-200/60 dark:border-slate-700/60 px-5 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] flex justify-between items-center shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate pr-4">
              Bagikan Kurs
            </h2>
            <button
              onClick={onClose}
              aria-label="Tutup"
              className="touch-hit relative p-2 bg-gray-100 dark:bg-slate-800 rounded-full text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors shrink-0"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* ─── SCROLLABLE CONTENT ─── */}
          <div className="flex-1 overflow-y-auto bg-gray-100 dark:bg-slate-950 px-5 py-6">
            <div ref={previewContainerRef} className="max-w-xl mx-auto">
              <div
                className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3 flex justify-center"
              >
                <div
                  style={{
                    width: previewW,
                    height: previewH,
                    position: 'relative',
                    borderRadius: 12,
                    overflow: 'hidden',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                  }}
                >
                  <div
                    style={{
                      transform: `scale(${previewScale})`,
                      transformOrigin: 'top left',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: TEMPLATE_W,
                      height: TEMPLATE_H,
                    }}
                  >
                    <div ref={exportRef}>
                      <KursTemplate kurs={kurs} agent={agent} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ─── STICKY FOOTER ─── */}
          <div className="flex-none sticky bottom-0 bg-white dark:bg-slate-900 border-t border-gray-200/60 dark:border-slate-700/60 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <div className="max-w-md mx-auto space-y-2">
              <div className={`grid ${showShareButton ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
                <button
                  onClick={handleDownload}
                  disabled={isExporting}
                  className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition"
                >
                  <Download size={16} strokeWidth={2.5} />
                  {isExporting ? 'Menyimpan...' : 'Download'}
                </button>
                {showShareButton && (
                  <button
                    onClick={handleShare}
                    disabled={isExporting}
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

          {/* Toast */}
          {toast && (
            <div role="status" className="fixed bottom-[calc(7rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[10000] w-max max-w-[calc(100vw-2rem)] text-center bg-gray-900 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-xl">
              {toast}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

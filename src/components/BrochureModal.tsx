'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Share2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================
// Types
// ============================================

interface BrochureModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  title: string;
}

// ============================================
// Component
// ============================================

export function BrochureModal({ isOpen, onClose, imageUrl, title }: BrochureModalProps) {
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  // In dev: use Vite proxy path. In prod: use original URL directly.
  const displayUrl = imageUrl
    ? (import.meta.env.DEV
        ? imageUrl.replace(/^https?:\/\/jadwal\.miqot\.com/i, '')
        : imageUrl.replace(/^http:\/\//i, 'https://'))
    : '';

  // Share First, Download Fallback handler
  const handleShareBrosur = async () => {
    if (isSharing || !displayUrl) return;
    setIsSharing(true);

    const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-');
    const fileName = `Brosur-${safeTitle}.png`;

    try {
      // 1. Fetch image (via proxy in dev, direct in prod)
      const response = await fetch(displayUrl);
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      // 2. Convert to PNG via canvas (source may be WebP)
      const img = new Image();
      img.crossOrigin = 'anonymous';

      const pngBlob = await new Promise<Blob>((resolve, reject) => {
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas context not available');
            ctx.drawImage(img, 0, 0);

            canvas.toBlob((b) => {
              if (!b) { reject(new Error('PNG conversion failed')); return; }
              resolve(b);
            }, 'image/png');
          } catch (err) { reject(err); }
        };
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = blobUrl;
      });

      window.URL.revokeObjectURL(blobUrl);

      // 3. Create File & try Share API
      const file = new File([pngBlob], fileName, { type: 'image/png' });
      const shareData = {
        title: `Brosur - ${title}`,
        text: 'Berikut brosur paket umrah pilihan Anda.',
        files: [file],
      };

      if (navigator.canShare && navigator.canShare(shareData)) {
        try {
          await navigator.share(shareData);
        } catch (err: any) {
          if (err?.name !== 'AbortError') {
            console.warn('Share error, falling back to download:', err);
            triggerDownload(pngBlob, fileName);
          }
        }
      } else {
        triggerDownload(pngBlob, fileName);
      }
    } catch (error) {
      console.error('Gagal share brosur:', error);
      // CORS fallback: open original URL in new tab
      const fullUrl = imageUrl.replace(/^http:\/\//i, 'https://');
      window.open(fullUrl, '_blank');
    } finally {
      setIsSharing(false);
    }
  };

  // Helper: trigger download from blob
  const triggerDownload = (blob: Blob, name: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return createPortal(
    <AnimatePresence onExitComplete={() => setIsImageLoaded(false)}>
      {isOpen && (
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
              Preview Brosur
            </h2>
            <button
              onClick={onClose}
              className="p-2 bg-gray-100 dark:bg-slate-800 rounded-full text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors shrink-0"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* ─── SCROLLABLE CONTENT ─── */}
          <div className="flex-1 overflow-y-auto bg-gray-100 dark:bg-slate-950 p-4 flex justify-center items-start">
            <div className="relative bg-white dark:bg-slate-800 p-2 rounded-xl shadow-lg max-w-md w-full">
              {/* Loading Spinner */}
              {!isImageLoaded && displayUrl && (
                <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-slate-800 rounded-xl z-10">
                  <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                </div>
              )}

              {/* Brochure Image — NO crossOrigin so it loads cross-domain */}
              {displayUrl && (
                <img
                  src={displayUrl}
                  alt={`Brosur ${title}`}
                  className={`w-full h-auto rounded-lg transition-opacity duration-300 ${isImageLoaded ? 'opacity-100' : 'opacity-0'}`}
                  onLoad={() => setIsImageLoaded(true)}
                  onError={() => setIsImageLoaded(true)}
                />
              )}

              {/* Empty State */}
              {!displayUrl && (
                <div className="py-20 text-center">
                  <p className="text-gray-400 dark:text-slate-500">Brosur tidak tersedia</p>
                </div>
              )}
            </div>
          </div>

          {/* ─── FIXED FOOTER ─── */}
          {displayUrl && (
            <div className="flex-none sticky bottom-0 bg-white dark:bg-slate-900 border-t border-gray-200/60 dark:border-slate-700/60 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
              <button
                onClick={handleShareBrosur}
                disabled={isSharing}
                className="
                  w-full flex items-center justify-center gap-2 py-3.5 px-4
                  rounded-xl font-bold text-white
                  bg-emerald-600 hover:bg-emerald-700
                  shadow-lg shadow-emerald-500/20
                  transition-all duration-200 active:scale-[0.98] disabled:opacity-70
                "
              >
                {isSharing ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <>
                    <Share2 size={20} />
                    <span>Bagikan Brosur</span>
                  </>
                )}
              </button>
            </div>
          )}

        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export default BrochureModal;

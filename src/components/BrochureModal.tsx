'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Share2, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
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
  const [scale, setScale] = useState(1);
  const pinchRef = useRef({ startDist: 0, startScale: 1 });

  // Use CDN URL directly if available, otherwise use proxy path
  const isCdnUrl = imageUrl && (imageUrl.includes('.b-cdn.net') || imageUrl.includes('bunnycdn'));
  const displayUrl = isCdnUrl
    ? imageUrl
    : imageUrl
      ? imageUrl.replace(/^https?:\/\/(?:jadwal\.(?:miqot\.com|alhijaz\.co)|115\.124\.86\.220)/i, '')
      : '';

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setScale(1);
      setIsImageLoaded(false);
    }
  }, [isOpen, imageUrl]);

  // ── Pinch-to-zoom ──
  const getTouchDistance = (touches: React.TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchRef.current.startDist = getTouchDistance(e.touches);
      pinchRef.current.startScale = scale;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = getTouchDistance(e.touches);
      const ratio = dist / pinchRef.current.startDist;
      setScale(Math.min(3, Math.max(1, pinchRef.current.startScale * ratio)));
    }
  };

  const handleTouchEnd = () => {
    if (scale < 1.1) setScale(1);
  };

  // Share handler
  const handleShareBrosur = async () => {
    if (isSharing || !displayUrl) return;
    setIsSharing(true);

    const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-');
    const fileName = `Brosur-${safeTitle}.png`;

    try {
      const response = await fetch(displayUrl);
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

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

      const file = new File([pngBlob], fileName, { type: 'image/png' });
      const shareData = {
        title: `Brosur - ${title}`,
        text: `Berikut brosur untuk Paket ${title}`,
        files: [file],
      };

      if (navigator.canShare && navigator.canShare(shareData)) {
        try {
          await navigator.share(shareData);
        } catch (err: any) {
          if (err?.name !== 'AbortError') {
            triggerDownload(pngBlob, fileName);
          }
        }
      } else {
        triggerDownload(pngBlob, fileName);
      }
    } catch {
      const fullUrl = imageUrl.replace(/^http:\/\//i, 'https://');
      window.open(fullUrl, '_blank');
    } finally {
      setIsSharing(false);
    }
  };

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
    <AnimatePresence onExitComplete={() => { setIsImageLoaded(false); setScale(1); }}>
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
          <div
            className="flex-1 overflow-auto bg-gray-100 dark:bg-slate-950 p-4"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="flex justify-center">
              <div className="relative bg-white dark:bg-slate-800 p-2 rounded-xl shadow-lg max-w-md w-full">
                {/* Loading Spinner */}
                {!isImageLoaded && displayUrl && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-slate-800 rounded-xl z-10">
                    <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                  </div>
                )}

                {displayUrl && (
                  <img
                    src={displayUrl}
                    alt={`Brosur ${title}`}
                    className={`w-full h-auto rounded-lg transition-opacity duration-300 ${isImageLoaded ? 'opacity-100' : 'opacity-0'}`}
                    style={{
                      transform: `scale(${scale})`,
                      transformOrigin: 'top left',
                      transition: scale === 1 ? 'transform 0.2s ease-out' : 'none',
                    }}
                    onLoad={() => setIsImageLoaded(true)}
                    onError={() => setIsImageLoaded(true)}
                  />
                )}

                {!displayUrl && (
                  <div className="py-20 text-center">
                    <p className="text-gray-400 dark:text-slate-500">Brosur tidak tersedia</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ─── ZOOM CONTROLS — bottom right ─── */}
          {isImageLoaded && (
            <div className="fixed bottom-24 right-4 z-[10000] pointer-events-none">
              <div className="pointer-events-auto flex items-center gap-0.5 bg-black/70 backdrop-blur-md rounded-full px-1 py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => setScale(s => Math.max(1, +(s - 0.25).toFixed(2)))}
                  disabled={scale <= 1}
                  className="p-1.5 rounded-full text-white hover:bg-white/20 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                  aria-label="Zoom out"
                >
                  <ZoomOut size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setScale(1)}
                  className="min-w-[44px] text-center text-xs font-semibold text-white px-1 py-1 rounded-full hover:bg-white/20 transition-colors"
                  aria-label="Reset zoom"
                >
                  {Math.round(scale * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => setScale(s => Math.min(3, +(s + 0.25).toFixed(2)))}
                  disabled={scale >= 3}
                  className="p-1.5 rounded-full text-white hover:bg-white/20 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                  aria-label="Zoom in"
                >
                  <ZoomIn size={18} />
                </button>
              </div>
            </div>
          )}

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

'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Share2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================
// Types
// ============================================

interface ItineraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string;
  title: string;
}

// ============================================
// Component
// ============================================

export function ItineraryModal({ isOpen, onClose, fileUrl, title }: ItineraryModalProps) {
  const [isContentLoaded, setIsContentLoaded] = useState(false);
  const [fileType, setFileType] = useState<'pdf' | 'image' | 'unknown'>('unknown');
  const [isSharing, setIsSharing] = useState(false);

  // Determine file type when fileUrl changes
  useEffect(() => {
    if (!fileUrl) {
      setFileType('unknown');
      return;
    }

    const urlLower = fileUrl.toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.webp'].some(ext => urlLower.includes(ext));

    if (isImage) {
      setFileType('image');
    } else {
      // Default assume PDF / Document
      setFileType('pdf');
    }
  }, [fileUrl]);

  // Ensure URL is HTTPS to avoid Mixed Content errors
  const secureUrl = fileUrl ? fileUrl.replace(/^http:\/\//i, 'https://') : '';

  // Share First, Download Fallback handler
  const handleShareItinerary = async () => {
    if (!secureUrl) return;
    setIsSharing(true);

    try {
      // 1. Fetch the file as blob
      const response = await fetch(secureUrl, { mode: 'cors', cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();

      // 2. Determine filename & MIME type
      const isImage = fileType === 'image';
      const ext = isImage ? 'png' : 'pdf';
      const mimeType = isImage ? 'image/png' : 'application/pdf';
      const safeTitle = title.replace(/\s+/g, '-').toLowerCase();
      const fileName = `itinerary-${safeTitle}.${ext}`;

      // 3. Create File object
      const file = new File([blob], fileName, { type: mimeType });
      const shareData = {
        title: `Itinerary - ${title}`,
        text: 'Berikut adalah jadwal perjalanan paket umrah.',
        files: [file],
      };

      // 4. Share or Download
      if (navigator.canShare && navigator.canShare(shareData)) {
        try {
          await navigator.share(shareData);
        } catch (err: any) {
          if (err?.name !== 'AbortError') {
            console.warn('Share error, falling back to open:', err);
            window.open(secureUrl, '_blank');
          }
        }
      } else {
        // Desktop / Browser Lama: Open in new tab
        window.open(secureUrl, '_blank');
      }
    } catch (error) {
      console.error('Gagal share itinerary:', error);
      // Ultimate fallback: just open the URL
      window.open(secureUrl, '_blank');
    } finally {
      setIsSharing(false);
    }
  };

  return createPortal(
    <AnimatePresence onExitComplete={() => setIsContentLoaded(false)}>
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
              Detail Itinerary
            </h2>
            <button
              onClick={onClose}
              className="p-2 bg-gray-100 dark:bg-slate-800 rounded-full text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors shrink-0"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* ─── SCROLLABLE CONTENT AREA ─── */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-100 dark:bg-slate-950 relative">
            {/* Loading Spinner */}
            {!isContentLoaded && secureUrl && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-slate-950 z-10">
                <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
              </div>
            )}

            {/* Empty State */}
            {!secureUrl && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-gray-400 dark:text-slate-500">Itinerary tidak tersedia</p>
              </div>
            )}

            {/* Main Preview */}
            {secureUrl && (
              fileType === 'image' ? (
                <div className="p-4 flex justify-center items-start">
                  <div className="bg-white dark:bg-slate-800 p-2 rounded-xl shadow-lg max-w-md w-full">
                    <img
                      src={secureUrl}
                      alt={`Itinerary ${title}`}
                      className={`w-full h-auto rounded-lg transition-opacity duration-300 ${isContentLoaded ? 'opacity-100' : 'opacity-0'}`}
                      onLoad={() => setIsContentLoaded(true)}
                    />
                  </div>
                </div>
              ) : (
                <iframe
                  src={secureUrl}
                  className="w-full h-full border-0"
                  onLoad={() => setIsContentLoaded(true)}
                  onError={() => console.error('Failed to load iframe content')}
                  title={`Itinerary ${title}`}
                />
              )
            )}
          </div>

          {/* ─── FIXED FOOTER ─── */}
          {secureUrl && (
            <div className="flex-none sticky bottom-0 bg-white dark:bg-slate-900 border-t border-gray-200/60 dark:border-slate-700/60 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
              <button
                onClick={handleShareItinerary}
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
                    <span>Bagikan Itinerary</span>
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

export default ItineraryModal;

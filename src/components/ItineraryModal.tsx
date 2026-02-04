'use client';

import { useState, useEffect } from 'react';
import { X, Download, Loader2 } from 'lucide-react';
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

  // Reset state when modal opens
  const handleModalOpen = () => {
    setIsContentLoaded(false);
  };

  // Download handler
  const handleDownload = () => {
    if (secureUrl) {
      window.open(secureUrl, '_blank');
    }
  };

  return (
    <AnimatePresence onExitComplete={() => setIsContentLoaded(false)}>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            onAnimationStart={handleModalOpen}
          />

          {/* Modal Content */}
          <motion.div
            className="fixed inset-0 z-[71] flex items-center justify-center p-4"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', damping: 25, stiffness: 400 }}
          >
            <div className="relative w-11/12 h-[85vh] flex flex-col bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden">
              
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-slate-700 shrink-0">
                <h3 className="font-bold text-gray-900 dark:text-white truncate pr-4">{title}</h3>
                <button
                  onClick={onClose}
                  className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-500 dark:text-slate-300 transition-colors shrink-0"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Preview Area */}
              <div className="relative flex-1 overflow-hidden bg-gray-50 dark:bg-slate-900">
                {/* Loading Spinner */}
                {!isContentLoaded && secureUrl && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-slate-900">
                    <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                  </div>
                )}
                
                {/* Empty State */}
                {!secureUrl && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-gray-500 dark:text-slate-400">Itinerary tidak tersedia</p>
                    </div>
                  </div>
                )}

                {/* Main Preview (Iframe for PDF/Docs, Img for Images) */}
                {secureUrl && (
                  fileType === 'image' ? (
                    <div className="w-full h-full overflow-auto p-4 flex items-center justify-center">
                      <img
                        src={secureUrl}
                        alt={`Itinerary ${title}`}
                        className={`max-w-full h-auto rounded-lg shadow-md transition-opacity duration-300 ${isContentLoaded ? 'opacity-100' : 'opacity-0'}`}
                        onLoad={() => setIsContentLoaded(true)}
                      />
                    </div>
                  ) : (
                    <iframe
                      src={secureUrl}
                      className="w-full h-full rounded"
                      onLoad={() => setIsContentLoaded(true)}
                      onError={() => console.error('Failed to load iframe content')}
                      title={`Itinerary ${title}`}
                    />
                  )
                )}
              </div>

              {/* Footer Actions */}
              {secureUrl && (
                <div className="p-4 border-t border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0">
                  <button
                    onClick={handleDownload}
                    className="
                      w-full flex items-center justify-center gap-2 py-3 px-4
                      rounded-xl font-bold text-white
                      bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200 dark:shadow-emerald-900/30
                      transition-all duration-200 active:scale-98
                    "
                  >
                    <Download size={18} />
                    <span>Download Itinerary</span>
                  </button>
                </div>
              )}

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default ItineraryModal;

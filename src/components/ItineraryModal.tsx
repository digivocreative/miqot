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
// Helper Functions
// ============================================

/**
 * Check if URL is a PDF file
 */
const isPdfFile = (url: string): boolean => {
  if (!url) return false;
  const urlLower = url.toLowerCase();
  return urlLower.endsWith('.pdf') || urlLower.includes('.pdf?') || urlLower.includes('pdf');
};

/**
 * Check if URL is an image file
 */
const isImageFile = (url: string): boolean => {
  if (!url) return false;
  const urlLower = url.toLowerCase();
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
  return imageExtensions.some(ext => urlLower.includes(ext));
};

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

    if (isPdfFile(fileUrl)) {
      setFileType('pdf');
    } else if (isImageFile(fileUrl)) {
      setFileType('image');
    } else {
      setFileType('unknown');
    }
  }, [fileUrl]);

  // Reset state when modal opens
  const handleModalOpen = () => {
    setIsContentLoaded(false);
  };

  // Download handler
  const handleDownload = () => {
    window.open(fileUrl, '_blank');
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
                {!isContentLoaded && fileUrl && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-slate-900">
                    <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                  </div>
                )}
                
                {/* Empty State */}
                {!fileUrl && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-gray-500 dark:text-slate-400">Itinerary tidak tersedia</p>
                    </div>
                  </div>
                )}

                {/* PDF Preview */}
                {fileUrl && fileType === 'pdf' && (
                  <iframe
                    src={fileUrl}
                    className="w-full h-full rounded"
                    onLoad={() => setIsContentLoaded(true)}
                    title={`Itinerary ${title}`}
                  />
                )}

                {/* Image Preview */}
                {fileUrl && fileType === 'image' && (
                  <div className="w-full h-full overflow-auto p-4 flex items-center justify-center">
                    <img
                      src={fileUrl}
                      alt={`Itinerary ${title}`}
                      className={`max-w-full h-auto rounded-lg shadow-md transition-opacity duration-300 ${isContentLoaded ? 'opacity-100' : 'opacity-0'}`}
                      onLoad={() => setIsContentLoaded(true)}
                    />
                  </div>
                )}

                {/* Unknown File Type */}
                {fileUrl && fileType === 'unknown' && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-gray-500 dark:text-slate-400 mb-4">
                        Preview tidak tersedia untuk tipe file ini
                      </p>
                      <button
                        onClick={handleDownload}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                      >
                        Buka File
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              {fileUrl && (
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

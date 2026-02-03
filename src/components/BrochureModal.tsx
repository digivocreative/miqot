'use client';

import { useState } from 'react';
import { X, Download, Loader2 } from 'lucide-react';
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
  const [isDownloading, setIsDownloading] = useState(false);

  // Reset state when modal opens
  const handleModalOpen = () => {
    setIsImageLoaded(false);
  };

  // Download handler - Convert WebP to PNG
  const handleDownload = async () => {
    if (isDownloading) return;
    
    const fileName = `Brosur-${title.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-')}.png`;
    
    setIsDownloading(true);
    try {
      // Use proxy to bypass CORS
      const proxyUrl = `/brosur?url=${encodeURIComponent(imageUrl)}`;
      const response = await fetch(proxyUrl);
      
      if (!response.ok) throw new Error('Fetch failed');
      
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      
      // Convert WebP to PNG using canvas
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas context not available');
            
            ctx.drawImage(img, 0, 0);
            
            canvas.toBlob((pngBlob) => {
              if (!pngBlob) {
                reject(new Error('PNG conversion failed'));
                return;
              }
              
              const pngUrl = window.URL.createObjectURL(pngBlob);
              const link = document.createElement('a');
              link.href = pngUrl;
              link.download = fileName;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              
              window.URL.revokeObjectURL(pngUrl);
              resolve();
            }, 'image/png');
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = blobUrl;
      });
      
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      // Fallback: try downloading original file
      try {
        const proxyUrl = `/brosur?url=${encodeURIComponent(imageUrl)}`;
        const response = await fetch(proxyUrl);
        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName.replace('.png', '.webp');
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        } else {
          alert(`Download gagal. Silakan buka link ini di browser:\n${imageUrl}`);
        }
      } catch {
        alert(`Download gagal. Silakan buka link ini di browser:\n${imageUrl}`);
      }
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <AnimatePresence onExitComplete={() => setIsImageLoaded(false)}>
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
            <div className="relative max-w-lg w-full max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden">
              
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <h3 className="font-bold text-gray-900 truncate pr-4">{title}</h3>
                <button
                  onClick={onClose}
                  className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors shrink-0"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Image Container */}
              <div className="relative flex-1 overflow-auto bg-gray-50 p-4">
                {/* Loading Spinner */}
                {!isImageLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
                    <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                  </div>
                )}
                
                {/* Brochure Image */}
                <img
                  src={`/brosur?url=${encodeURIComponent(imageUrl)}`}
                  alt={`Brosur ${title}`}
                  className={`w-full h-auto rounded-lg shadow-md transition-opacity duration-300 ${isImageLoaded ? 'opacity-100' : 'opacity-0'}`}
                  onLoad={() => setIsImageLoaded(true)}
                  crossOrigin="anonymous"
                />
              </div>

              {/* Footer Actions */}
              <div className="p-4 border-t border-gray-100 bg-white">
                <button
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className={`
                    w-full flex items-center justify-center gap-2 py-3 px-4
                    rounded-xl font-bold text-white
                    transition-all duration-200
                    ${isDownloading 
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200 active:scale-98'
                    }
                  `}
                >
                  {isDownloading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Mengunduh...</span>
                    </>
                  ) : (
                    <>
                      <Download size={18} />
                      <span>Download Brosur (PNG)</span>
                    </>
                  )}
                </button>
              </div>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default BrochureModal;

'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Share2, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Setup PDF.js Worker from CDN
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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
  const [numPages, setNumPages] = useState<number | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [isPdfLoading, setIsPdfLoading] = useState(true);
  const [fileType, setFileType] = useState<'pdf' | 'image' | 'unknown'>('unknown');
  const [pdfWidth, setPdfWidth] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  // ── Pinch-to-zoom state ──
  const [scale, setScale] = useState(1);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const pinchRef = useRef({ startDist: 0, startScale: 1 });

  // Always use proxy path: Vite proxy in dev, Cloudflare Pages Function in prod
  const originalUrl = fileUrl ? fileUrl.replace(/^http:\/\//i, 'https://') : '';
  const proxyUrl = originalUrl
    ? originalUrl.replace(/^https?:\/\/(?:jadwal\.(?:miqot\.com|alhijaz\.co)|115\.124\.86\.220)/i, '')
    : '';

  // Determine file type
  useEffect(() => {
    if (!fileUrl) {
      setFileType('unknown');
      return;
    }
    const urlLower = fileUrl.toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.webp'].some(ext => urlLower.includes(ext));
    setFileType(isImage ? 'image' : 'pdf');
  }, [fileUrl]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsPdfLoading(true);
      setNumPages(null);
      setScale(1);
      setOrigin({ x: 50, y: 50 });
    }
  }, [isOpen, fileUrl]);

  // Dynamically measure the container width for the PDF renderer
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !isOpen) return;

    const measure = () => {
      // container padding (p-4 = 16px each side) + card padding (p-2 = 8px each side) = 48px total
      const availableWidth = el.clientWidth - 48;
      setPdfWidth(Math.max(availableWidth, 280));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen]);

  // PDF load success handler
  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setIsPdfLoading(false);
  }

  // PDF load error handler
  function onDocumentLoadError(error: Error) {
    console.error('react-pdf load error:', error);
    setIsPdfLoading(false);
  }

  // ── Pinch-to-zoom helpers ──
  const getTouchDistance = (touches: TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchRef.current.startDist = getTouchDistance(e.touches);
      pinchRef.current.startScale = scale;
      const rect = contentRef.current?.getBoundingClientRect();
      if (rect) {
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        setOrigin({
          x: ((midX - rect.left) / rect.width) * 100,
          y: ((midY - rect.top) / rect.height) * 100,
        });
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = getTouchDistance(e.touches);
      const ratio = dist / pinchRef.current.startDist;
      const newScale = Math.min(3, Math.max(1, pinchRef.current.startScale * ratio));
      setScale(newScale);
    }
  };

  const handleTouchEnd = () => {
    if (scale < 1.1) setScale(1);
  };

  // Share First, Download Fallback handler
  const handleShareItinerary = async () => {
    if (!originalUrl) return;
    setIsSharing(true);

    try {
      // Fetch file as blob via proxy (Vite in dev, CF Function in prod)
      const response = await fetch(proxyUrl, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();

      // Determine filename & MIME type
      const isImage = fileType === 'image';
      const ext = isImage ? 'png' : 'pdf';
      const mimeType = isImage ? 'image/png' : 'application/pdf';
      const safeTitle = title.replace(/\s+/g, '_');
      const fileName = `${safeTitle}_Itinerary.${ext}`;

      // Create File object
      const file = new File([blob], fileName, { type: mimeType });
      const shareData = {
        title: `Itinerary - ${title}`,
        text: `Berikut itinerary untuk paket: ${title}`,
        files: [file],
      };

      // Share or Fallback
      if (navigator.canShare && navigator.canShare(shareData)) {
        try {
          await navigator.share(shareData);
        } catch (err: any) {
          if (err?.name !== 'AbortError') {
            console.warn('Share error, falling back:', err);
            triggerDownload(blob, fileName);
          }
        }
      } else {
        triggerDownload(blob, fileName);
      }
    } catch (error) {
      console.error('Gagal share itinerary:', error);
      // CORS fallback: open original URL in new tab
      window.open(originalUrl, '_blank');
    } finally {
      setIsSharing(false);
    }
  };

  // Helper: trigger download
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
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[9999] bg-white dark:bg-slate-900 flex flex-col"
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        >

      {/* ─── HEADER ─── */}
      <div className="flex-none sticky top-0 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-gray-200/60 dark:border-slate-700/60 px-5 py-4 flex justify-between items-center shadow-sm">
        <div className="flex flex-col">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Detail Itinerary</h2>
          <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">
            {fileType === 'pdf' ? 'Dokumen PDF' : 'Gambar'}
            {numPages && fileType === 'pdf' ? ` · ${numPages} halaman` : ''}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-2 bg-gray-100 dark:bg-slate-800 rounded-full text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors shrink-0"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* ─── SCROLLABLE CONTENT (PDF/IMAGE VIEWER) ─── */}
      <div
        ref={contentRef}
        className="flex-1 overflow-auto bg-gray-100 dark:bg-slate-950 px-4 pb-6 relative"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Zoom indicator */}
        {scale > 1.05 && (
          <div className="sticky top-2 z-10 flex justify-center pointer-events-none" style={{ marginBottom: -32 }}>
            <button
              type="button"
              onClick={() => setScale(1)}
              className="pointer-events-auto px-3 py-1 bg-black/60 text-white text-xs font-medium rounded-full backdrop-blur-sm"
            >
              {Math.round(scale * 100)}% · Ketuk untuk reset
            </button>
          </div>
        )}

        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: `${origin.x}% ${origin.y}%`,
            transition: scale === 1 ? 'transform 0.2s ease-out' : 'none',
          }}
        >
        <div className="flex justify-center pt-4">

        {/* Empty State */}
        {!proxyUrl && (
          <div className="flex flex-col items-center text-gray-400 dark:text-slate-500 gap-2 py-10 self-center">
            <AlertCircle className="w-10 h-10" />
            <p>File Itinerary belum tersedia.</p>
          </div>
        )}

        {/* PDF Renderer via react-pdf */}
        {proxyUrl && fileType === 'pdf' && (
          <div className="bg-white dark:bg-slate-800 p-2 rounded-xl shadow-lg max-w-2xl w-full min-h-[50vh] flex flex-col items-center justify-center relative">
            <Document
              file={proxyUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div className="flex flex-col items-center gap-3 py-10">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                  <span className="text-sm text-gray-500 dark:text-slate-400">Memuat Dokumen...</span>
                </div>
              }
              error={
                <div className="flex flex-col items-center gap-2 py-10 text-red-500">
                  <AlertCircle className="w-8 h-8" />
                  <span className="text-sm">Gagal memuat PDF.</span>
                </div>
              }
              className="w-full flex flex-col items-center gap-4"
            >
              {numPages && Array.from(new Array(numPages), (_, index) => (
                <Page
                  key={`page_${index + 1}`}
                  pageNumber={index + 1}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  className="shadow-md rounded-lg overflow-hidden w-full max-w-full"
                  width={pdfWidth || 400}
                />
              ))}
            </Document>
          </div>
        )}

        {/* Image Renderer (fallback for .jpg/.png) */}
        {proxyUrl && fileType === 'image' && (
          <div className="bg-white dark:bg-slate-800 p-2 rounded-xl shadow-lg max-w-md w-full">
            <img
              src={proxyUrl}
              alt={`Itinerary ${title}`}
              className="w-full h-auto rounded-lg"
              onLoad={() => setIsPdfLoading(false)}
            />
          </div>
        )}
        </div>
        </div>
      </div>

      {/* ─── FOOTER ─── */}
      <div className="flex-none sticky bottom-0 bg-white dark:bg-slate-900 border-t border-gray-200/60 dark:border-slate-700/60 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <button
          onClick={handleShareItinerary}
          disabled={isSharing || !proxyUrl}
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
              <span>Menyiapkan File...</span>
            </>
          ) : (
            <>
              <Share2 size={20} />
              <span>Bagikan Itinerary</span>
            </>
          )}
        </button>
      </div>

        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export default ItineraryModal;

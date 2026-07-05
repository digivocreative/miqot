'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Share2, Download, Loader2, AlertCircle, ZoomIn, ZoomOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import type { UmrohPackage } from '@/types';
import { trackEvent } from '../utils/analytics';
import { canShareFiles, downloadBlob, isTouchPrimary } from '../utils/share';

// Setup PDF.js Worker — primary CDN with fallback
try {
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
} catch {
  // Fallback to cdnjs if unpkg fails
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
}

// ============================================
// Types
// ============================================

interface ItineraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string;
  title: string;
  paket?: UmrohPackage;
  agentSlug?: string | null;
  agentName?: string | null;
  agentPhone?: string | null;
  agentPhoto?: string | null;
}

function clampItineraryScale(nextScale: number) {
  return Math.min(3, Math.max(1, +nextScale.toFixed(2)));
}

function PdfLoadingPlaceholder({ pageWidth }: { pageWidth: number }) {
  return (
    <div className="w-full px-1 py-2">
      <div
        className="relative mx-auto w-full overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
        style={{ maxWidth: pageWidth, aspectRatio: '210 / 297', minHeight: 380 }}
      >
        <div className="absolute inset-x-6 top-7 h-3 rounded-full bg-gray-100 dark:bg-slate-800" />
        <div className="absolute inset-x-6 top-14 h-2 rounded-full bg-gray-100 dark:bg-slate-800" />
        <div className="absolute inset-x-10 top-20 h-2 rounded-full bg-gray-100 dark:bg-slate-800" />
        <div className="absolute left-6 right-6 top-32 grid grid-cols-2 gap-3">
          <div className="h-20 rounded-lg bg-gray-50 dark:bg-slate-800/70" />
          <div className="h-20 rounded-lg bg-gray-50 dark:bg-slate-800/70" />
        </div>
        <div className="absolute inset-x-6 top-60 space-y-3">
          <div className="h-2 rounded-full bg-gray-100 dark:bg-slate-800" />
          <div className="h-2 rounded-full bg-gray-100 dark:bg-slate-800" />
          <div className="h-2 w-2/3 rounded-full bg-gray-100 dark:bg-slate-800" />
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/70 backdrop-blur-[1px] dark:bg-slate-900/70">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <span className="text-sm font-medium text-gray-500 dark:text-slate-400">Memuat Dokumen...</span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Component
// ============================================

export function ItineraryModal({ isOpen, onClose, fileUrl, title }: ItineraryModalProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const useShareLabel = isTouchPrimary() && typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const [isPdfLoading, setIsPdfLoading] = useState(true);
  const [fileType, setFileType] = useState<'pdf' | 'image' | 'unknown'>('unknown');
  const [pdfWidth, setPdfWidth] = useState(0);
  const [contentSize, setContentSize] = useState({ width: 0, height: 0 });
  const contentRef = useRef<HTMLDivElement>(null);
  const zoomAlignRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const zoomContentRef = useRef<HTMLDivElement>(null);
  const contentSizeRef = useRef({ width: 0, height: 0 });
  const scaleRafRef = useRef<number | null>(null);
  const zoomRafRef = useRef<number | null>(null);
  const pendingScaleRef = useRef(1);
  const pendingZoomFrameRef = useRef<{
    scale: number;
    center?: { x: number; y: number };
    anchorX: number;
    anchorY: number;
    syncState: boolean;
  } | null>(null);

  // ── Zoom state (visual transform only; PDF is not re-rendered during pinch) ──
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  const pinchRef = useRef({
    startDist: 0,
    startScale: 1,
    anchorX: 0,
    anchorY: 0,
  });
  const clampedScale = clampItineraryScale(scale);
  const hasMeasuredContent = contentSize.width > 0 && contentSize.height > 0;
  const pdfShellWidth = Math.min(Math.max((pdfWidth || 400) + 16, 296), 672);
  const pdfPageWidth = pdfShellWidth - 16;

  // Use CDN URL directly if it's a CDN URL, otherwise use proxy path
  const originalUrl = fileUrl ? fileUrl.replace(/^http:\/\//i, 'https://') : '';
  const isCdnUrl = originalUrl.includes('.b-cdn.net') || originalUrl.includes('bunnycdn');
  const proxyUrl = isCdnUrl
    ? originalUrl
    : originalUrl
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
      scaleRef.current = 1;
      pendingScaleRef.current = 1;
      setContentSize({ width: 0, height: 0 });
    }
  }, [isOpen, fileUrl]);

  useEffect(() => {
    scaleRef.current = clampedScale;
  }, [clampedScale]);

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

  useEffect(() => {
    const el = zoomContentRef.current;
    if (!el || !isOpen) return;

    const measure = () => {
      const nextSize = {
        width: Math.ceil(el.offsetWidth),
        height: Math.ceil(el.offsetHeight),
      };
      if (nextSize.width <= 0 || nextSize.height <= 0) return;
      contentSizeRef.current = nextSize;
      setContentSize(prev => (
        prev.width === nextSize.width && prev.height === nextSize.height ? prev : nextSize
      ));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen, fileType, numPages, pdfWidth]);

  useEffect(() => () => {
    if (scaleRafRef.current !== null) cancelAnimationFrame(scaleRafRef.current);
    if (zoomRafRef.current !== null) cancelAnimationFrame(zoomRafRef.current);
  }, []);

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

  const getTouchDistance = (touches: TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getTouchCenter = (touches: TouchList, el: HTMLDivElement) => {
    const rect = el.getBoundingClientRect();
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2 - rect.left,
      y: (touches[0].clientY + touches[1].clientY) / 2 - rect.top,
    };
  };

  const applyZoomStyles = (nextScale: number) => {
    const align = zoomAlignRef.current;
    const stage = stageRef.current;
    const content = zoomContentRef.current;
    const size = contentSizeRef.current;
    if (align) {
      const isZoomed = nextScale > 1.01;
      align.classList.toggle('justify-start', isZoomed);
      align.classList.toggle('justify-center', !isZoomed);
    }
    if (!stage || !content || size.width <= 0 || size.height <= 0) return;

    stage.style.width = `${size.width * nextScale}px`;
    stage.style.height = `${size.height * nextScale}px`;
    content.style.transform = `translate3d(0, 0, 0) scale(${nextScale})`;
  };

  const scheduleScaleState = (nextScale: number) => {
    pendingScaleRef.current = nextScale;
    if (scaleRafRef.current !== null) return;
    scaleRafRef.current = window.requestAnimationFrame(() => {
      scaleRafRef.current = null;
      setScale(pendingScaleRef.current);
    });
  };

  const scheduleZoomFrame = (
    nextScale: number,
    center?: { x: number; y: number },
    syncState = true,
  ) => {
    const anchor = pinchRef.current;
    pendingZoomFrameRef.current = {
      scale: nextScale,
      center,
      anchorX: anchor.anchorX,
      anchorY: anchor.anchorY,
      syncState,
    };

    if (zoomRafRef.current !== null) return;

    zoomRafRef.current = window.requestAnimationFrame(() => {
      zoomRafRef.current = null;
      const frame = pendingZoomFrameRef.current;
      pendingZoomFrameRef.current = null;
      if (!frame) return;

      applyZoomStyles(frame.scale);

      const el = contentRef.current;
      if (frame.center && el) {
        el.scrollLeft = Math.max(0, (frame.anchorX * frame.scale) - frame.center.x);
        el.scrollTop = Math.max(0, (frame.anchorY * frame.scale) - frame.center.y);
      }

      if (frame.syncState) scheduleScaleState(frame.scale);
    });
  };

  const setViewerScale = (
    nextScale: number,
    center?: { x: number; y: number },
    options?: { syncState?: boolean },
  ) => {
    const clamped = clampItineraryScale(nextScale);
    scaleRef.current = clamped;
    scheduleZoomFrame(clamped, center, options?.syncState ?? true);
    return clamped;
  };

  const commitScaleState = () => {
    const nextScale = scaleRef.current;
    pendingScaleRef.current = nextScale;
    if (scaleRafRef.current !== null) {
      cancelAnimationFrame(scaleRafRef.current);
      scaleRafRef.current = null;
    }
    setScale(nextScale);
  };

  const cancelScheduledZoomFrame = () => {
    if (zoomRafRef.current !== null) {
      cancelAnimationFrame(zoomRafRef.current);
      zoomRafRef.current = null;
    }
    pendingZoomFrameRef.current = null;
  };

  const setViewerScaleImmediate = (nextScale: number) => {
    const clamped = clampItineraryScale(nextScale);
    scaleRef.current = clamped;
    cancelScheduledZoomFrame();
    applyZoomStyles(clamped);
    setScale(clamped);
    return clamped;
  };

  useEffect(() => {
    applyZoomStyles(clampedScale);
  }, [clampedScale]);

  useEffect(() => {
    applyZoomStyles(scaleRef.current);
  }, [contentSize]);

  // Native non-passive listeners are needed on mobile Safari/Chrome so the
  // preview can own a two-finger pinch while one-finger scroll stays native.
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !isOpen) return;

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      if (event.cancelable) event.preventDefault();
      const center = getTouchCenter(event.touches, el);
      pinchRef.current = {
        startDist: getTouchDistance(event.touches),
        startScale: scaleRef.current,
        anchorX: (el.scrollLeft + center.x) / scaleRef.current,
        anchorY: (el.scrollTop + center.y) / scaleRef.current,
      };
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2 || pinchRef.current.startDist <= 0) return;
      if (event.cancelable) event.preventDefault();
      const dist = getTouchDistance(event.touches);
      const center = getTouchCenter(event.touches, el);
      setViewerScale(pinchRef.current.startScale * (dist / pinchRef.current.startDist), center, { syncState: false });
    };

    const handleTouchEnd = () => {
      pinchRef.current.startDist = 0;
      if (scaleRef.current < 1.1) setViewerScaleImmediate(1);
      else commitScaleState();
    };

    const handleGestureStart = (event: Event) => {
      event.preventDefault();
      pinchRef.current.startScale = scaleRef.current;
    };

    const handleGestureChange = (event: Event) => {
      event.preventDefault();
      const gestureScale = Number((event as Event & { scale?: number }).scale || 1);
      setViewerScale(pinchRef.current.startScale * gestureScale, undefined, { syncState: false });
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);
    el.addEventListener('touchcancel', handleTouchEnd);
    el.addEventListener('gesturestart', handleGestureStart, { passive: false });
    el.addEventListener('gesturechange', handleGestureChange, { passive: false });
    el.addEventListener('gestureend', handleTouchEnd);
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
      el.removeEventListener('gesturestart', handleGestureStart);
      el.removeEventListener('gesturechange', handleGestureChange);
      el.removeEventListener('gestureend', handleTouchEnd);
    };
  }, [isOpen]);

  const zoomFromCenter = (nextScale: number) => {
    const el = contentRef.current;
    if (!el) {
      setViewerScaleImmediate(nextScale);
      return;
    }
    const center = { x: el.clientWidth / 2, y: el.clientHeight / 2 };
    pinchRef.current.anchorX = (el.scrollLeft + center.x) / scaleRef.current;
    pinchRef.current.anchorY = (el.scrollTop + center.y) / scaleRef.current;
    setViewerScale(nextScale, center);
  };

  const zoomIn = () => zoomFromCenter(scaleRef.current + 0.25);
  const zoomOut = () => zoomFromCenter(scaleRef.current - 0.25);
  const resetZoom = () => setViewerScaleImmediate(1);

  // Share First, Download Fallback handler
  const handleShareItinerary = async () => {
    if (!originalUrl) return;
    setIsSharing(true);

    try {
      // Fetch file as blob (CDN URL directly, or via proxy)
      const fetchUrl = isCdnUrl ? originalUrl : proxyUrl;
      const response = await fetch(fetchUrl, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();

      // Determine filename & MIME type
      const isImage = fileType === 'image';
      const ext = isImage ? 'png' : 'pdf';
      const mimeType = isImage ? 'image/png' : 'application/pdf';
      const safeTitle = title.replace(/\s+/g, '_');
      const fileName = `${safeTitle}_Itinerary.${ext}`;

      const file = new File([blob], fileName, { type: mimeType });

      if (canShareFiles([file])) {
        try {
          await navigator.share({
            title: `Itinerary - ${title}`,
            text: `Berikut itinerary untuk paket: ${title}`,
            files: [file],
          });
        } catch (err: any) {
          if (err?.name !== 'AbortError') {
            console.warn('Share error, falling back:', err);
            downloadBlob(blob, fileName);
          }
        }
      } else {
        downloadBlob(blob, fileName);
      }
    } catch (error) {
      console.error('Gagal share itinerary:', error);
      window.open(originalUrl, '_blank');
    } finally {
      setIsSharing(false);
    }
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
        className="flex-1 min-h-0 min-w-0 overflow-auto bg-gray-100 dark:bg-slate-950 px-4 pb-6 relative"
        style={{
          touchAction: 'pan-x pan-y',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* Floating Zoom Controls — bottom center */}
        {proxyUrl && !isPdfLoading && (
          <div className="fixed bottom-24 right-4 z-20 flex justify-end pointer-events-none">
            <div className="pointer-events-auto flex items-center gap-0.5 bg-black/70 backdrop-blur-md rounded-full px-1 py-1 shadow-lg">
              <button
                type="button"
                onClick={zoomOut}
                disabled={scale <= 1}
                className="p-1.5 rounded-full text-white hover:bg-white/20 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="Zoom out"
              >
                <ZoomOut size={18} />
              </button>
              <button
                type="button"
                onClick={resetZoom}
                className="min-w-[44px] text-center text-xs font-semibold text-white px-1 py-1 rounded-full hover:bg-white/20 transition-colors"
                aria-label="Reset zoom"
              >
                {Math.round(clampedScale * 100)}%
              </button>
              <button
                type="button"
                onClick={zoomIn}
                disabled={scale >= 3}
                className="p-1.5 rounded-full text-white hover:bg-white/20 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="Zoom in"
              >
                <ZoomIn size={18} />
              </button>
            </div>
          </div>
        )}

        <div ref={zoomAlignRef} className={`flex pt-4 ${clampedScale > 1 ? 'justify-start' : 'justify-center'}`}>
          <div
            ref={stageRef}
            className="relative shrink-0"
            style={hasMeasuredContent ? {
              width: contentSize.width * clampedScale,
              height: contentSize.height * clampedScale,
            } : undefined}
          >
            <div
              ref={zoomContentRef}
              className={hasMeasuredContent ? 'absolute left-0 top-0 will-change-transform' : 'will-change-transform'}
              style={{
                transform: `translate3d(0, 0, 0) scale(${clampedScale})`,
                transformOrigin: 'top left',
              }}
            >

        {/* Empty State */}
        {!proxyUrl && (
          <div className="flex flex-col items-center text-gray-400 dark:text-slate-500 gap-2 py-10 self-center">
            <AlertCircle className="w-10 h-10" />
            <p>File Itinerary belum tersedia.</p>
          </div>
        )}

        {/* PDF Renderer via react-pdf */}
        {proxyUrl && fileType === 'pdf' && (
          <div
            className="bg-white dark:bg-slate-800 p-2 rounded-xl shadow-lg min-h-[50vh] flex flex-col relative items-center shrink-0"
            style={{ width: pdfShellWidth }}
          >
            <Document
              file={proxyUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={<PdfLoadingPlaceholder pageWidth={pdfPageWidth} />}
              error={
                <div className="flex flex-col items-center gap-2 py-10 text-red-500">
                  <AlertCircle className="w-8 h-8" />
                  <span className="text-sm">Gagal memuat PDF.</span>
                </div>
              }
              className="flex flex-col gap-4 w-full items-center"
            >
              {numPages && Array.from(new Array(numPages), (_, index) => (
                <Page
                  key={`page_${index + 1}`}
                  pageNumber={index + 1}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  className="shadow-md rounded-lg overflow-hidden w-full max-w-full"
                  width={pdfPageWidth}
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
          ) : useShareLabel ? (
            <>
              <Share2 size={20} />
              <span>Bagikan Itinerary</span>
            </>
          ) : (
            <>
              <Download size={20} />
              <span>Download Itinerary</span>
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

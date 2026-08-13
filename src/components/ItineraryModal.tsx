'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Loader2, AlertCircle, ZoomIn, ZoomOut, Link2, ClipboardCheck, Route, FileText } from 'lucide-react';
import { motion, AnimatePresence, useAnimationControls, useReducedMotion } from 'framer-motion';
import { Document, Page, pdfjs } from 'react-pdf';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import type { UmrohPackage } from '@/types';
import { trackEvent } from '../utils/analytics';
import { canShareFiles, downloadBlob } from '../utils/share';
import { getPackageById } from '@/services/data-service';
import { AGENTS_DATA } from '@/data/agents';
import { canRenderItineraryPdf } from '../../lib/itinerary-pdf.js';
import { generateItineraryPdfBlob, itineraryPdfFileName } from '../utils/itineraryPdfBlob';
import SegmentedControl, { type SegmentedOption } from './common/SegmentedControl';
import WebItineraryView, { type ItineraryContent } from './WebItineraryView';

// Worker pdf.js DARI BUNDEL, bukan CDN. Selain menghapus kebergantungan jaringan
// pihak ketiga untuk pratinjau, ini yang membuat ekspor "Rencana Perjalanan"
// konsisten antar-perangkat: perakit blob memakai pdf.js untuk mengukur tinggi
// isi, dan bila workernya gagal dimuat dokumen jatuh ke paginasi — sehingga
// agent yang CDN-nya terblokir bisa mendapat bentuk dokumen yang berbeda.
// Versinya juga otomatis sepadan dengan react-pdf, tak bisa selisih seperti URL
// CDN yang dipatok manual. Pola yang sama dengan UmrohPernyataanPdfPreview.
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

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
  /** Fallback bila `paket` tak tersedia (AskAI attachment, UpcomingSchedule) */
  jadwalId?: string | null;
}

type ItineraryTab = 'itinerary' | 'pdf';

const TAB_OPTIONS: SegmentedOption<ItineraryTab>[] = [
  { value: 'itinerary', label: 'Itinerary', icon: Route },
  { value: 'pdf', label: 'Versi PDF', icon: FileText },
];

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

export function ItineraryModal({
  isOpen, onClose, fileUrl, title, paket, agentSlug, jadwalId,
}: ItineraryModalProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  // Link share halaman jadwal harian publik (/:slug/:jadwalId/itinerary)
  const [linkCopied, setLinkCopied] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const copyPop = useAnimationControls();
  const effectiveJadwalId = paket?.jadwalId ?? jadwalId ?? null;
  // ── Tab: "Itinerary" (tampilan web hasil parsing, default) | "Preview PDF" ──
  // Tanpa jadwalId (sebagian attachment AskAI) tab bar disembunyikan → PDF-only spt semula.
  const hasTabs = Boolean(effectiveJadwalId);
  const [activeTab, setActiveTab] = useState<ItineraryTab>(hasTabs ? 'itinerary' : 'pdf');
  // Auto-fallback ke PDF hanya boleh terjadi sebelum user memilih tab sendiri —
  // fetch yang selesai belakangan tidak boleh membajak pilihan manual.
  const userTouchedTabRef = useRef(false);
  // Pane PDF di-mount saat pertama kali tab-nya aktif lalu keep-mounted (hidden):
  // sesi yang hanya membaca tampilan web tidak mengunduh/merender PDF sama sekali,
  // dan pindah tab bolak-balik tidak me-render ulang halaman PDF.
  const [pdfEverActive, setPdfEverActive] = useState(!hasTabs);
  const [webContent, setWebContent] = useState<ItineraryContent | null>(null);
  const [webStatus, setWebStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [webSha, setWebSha] = useState<string | null>(null);
  const [resolvedPaket, setResolvedPaket] = useState<UmrohPackage | null>(null);
  const effectivePaket = paket ?? resolvedPaket ?? null;
  const [isSharing, setIsSharing] = useState(false);
  const [buildingOwnPdf, setBuildingOwnPdf] = useState(false);
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

  // Defense-in-depth untuk rolling deploy/race: server sudah menolak atau
  // me-refresh cache yang hash-nya berbeda, lalu klien tetap membandingkan sha16
  // versi CDN dengan hasil parse. URL tanpa ?v= atau respons tanpa sha → fail-open.
  const fileSha16 = /[?&]v=([0-9a-f]{8,})/i.exec(fileUrl || '')?.[1]?.toLowerCase() ?? null;
  const parsedStale = Boolean(
    webStatus === 'ready' && fileSha16 && webSha && !webSha.toLowerCase().startsWith(fileSha16),
  );

  // ── Link share publik (halaman /:slug/:jadwalId/itinerary) ──
  const shareUrl = agentSlug && effectiveJadwalId
    ? `${window.location.origin}/${agentSlug}/${effectiveJadwalId}/itinerary`
    : null;
  const copyShareLink = async () => {
    if (!shareUrl) return;
    trackEvent('action', 'copy_itinerary_link', { paket: title });
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      window.prompt('Salin link:', shareUrl);
      return;
    }
    setLinkCopied(true);
    // "Pop" singkat: tekan lalu memantul balik — memberi rasa tombol benar-benar bekerja
    if (!prefersReducedMotion) {
      copyPop.start({
        scale: [1, 0.95, 1.04, 1],
        transition: { duration: 0.28, times: [0, 0.2, 0.55, 1], ease: 'easeOut' },
      });
    }
    setTimeout(() => setLinkCopied(false), 2000);
  };

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
      setLinkCopied(false);
      userTouchedTabRef.current = false;
      setActiveTab(effectiveJadwalId ? 'itinerary' : 'pdf');
      setPdfEverActive(!effectiveJadwalId);
    }
  }, [isOpen, fileUrl]);

  // Mount-on-first-activate pane PDF (lalu keep-mounted via `hidden`)
  useEffect(() => {
    if (activeTab === 'pdf') setPdfEverActive(true);
  }, [activeTab]);

  // Data tab Itinerary sengaja TANPA ?pdfUrl. Bila cache belum ada/basi, server
  // hanya boleh memproses ulang URL tepercaya dari row jadwal; ini menutup vektor
  // cache-poisoning sekaligus menjaga tampilan web mengikuti fingerprint PDF.
  useEffect(() => {
    if (!isOpen || !effectiveJadwalId) return;
    let cancelled = false;
    setWebStatus('loading');
    setWebContent(null);
    setWebSha(null);
    fetch(`/api/itinerary/${encodeURIComponent(effectiveJadwalId)}`)
      .then(r => r.json())
      .then(body => {
        if (cancelled) return;
        const data: ItineraryContent | null = body?.success ? body.data : null;
        if (data?.days?.length) {
          setWebContent(data);
          setWebSha(typeof body.source_sha256 === 'string' ? body.source_sha256 : null);
          setWebStatus('ready');
        } else {
          setWebStatus('error');
          if (!userTouchedTabRef.current) setActiveTab('pdf');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setWebStatus('error');
        if (!userTouchedTabRef.current) setActiveTab('pdf');
      });
    // Call-site tanpa objek paket (AskAI/UpcomingSchedule/Bani) → resolve dari cache
    // getPackages supaya FlightCard/HotelCard/tanggal-per-hari muncul; gagal = days-only.
    if (!paket) {
      getPackageById(effectiveJadwalId)
        .then(p => { if (!cancelled && p) setResolvedPaket(p); })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [isOpen, effectiveJadwalId]);

  useEffect(() => {
    scaleRef.current = clampedScale;
  }, [clampedScale]);

  // Dynamically measure the container width for the PDF renderer
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !isOpen) return;

    const measure = () => {
      // Pane PDF disembunyikan via display:none saat tab Itinerary aktif → clientWidth 0.
      // Tanpa guard ini pdfWidth kolaps ke minimum 280 dan react-pdf me-render ulang
      // semua halaman 2× tiap pindah tab.
      if (el.clientWidth <= 0) return;
      // container padding (p-4 = 16px each side) + card padding (p-2 = 8px each side) = 48px total
      const availableWidth = el.clientWidth - 48;
      setPdfWidth(Math.max(availableWidth, 280));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen, pdfEverActive]);

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
  }, [isOpen, fileType, numPages, pdfWidth, pdfEverActive]);

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
  }, [isOpen, pdfEverActive]);

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

  // ── PDF "Rencana Perjalanan" (versi kita) ──
  // Dirakit di klien dari data yang sama dengan tampilan web, jadi tombolnya
  // mengikuti tab aktif: yang diunduh adalah yang sedang dilihat.
  // Gerbang canRenderItineraryPdf memastikan tanggal per hari bisa ditambatkan
  // ke jadwal — PDF bertanggal salah beredar di WA tanpa bisa ditarik kembali.
  const ownPdfMode = hasTabs && activeTab === 'itinerary';
  const ownPdfReady = Boolean(
    effectivePaket && webContent && canRenderItineraryPdf(webContent, effectivePaket),
  );

  const handleOwnPdf = async () => {
    if (!ownPdfReady || buildingOwnPdf || !effectivePaket || !webContent) return;
    setBuildingOwnPdf(true);
    try {
      const blob = await generateItineraryPdfBlob({
        content: webContent,
        paket: effectivePaket,
        agent: agentSlug ? AGENTS_DATA[agentSlug] : null,
        shareUrl: shareUrl || undefined,
      });
      const fileName = itineraryPdfFileName(effectivePaket.nama, effectivePaket.jadwalId);
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (canShareFiles([file])) {
        try {
          await navigator.share({ title: `Rencana Perjalanan - ${title}`, files: [file] });
        } catch (err: any) {
          // Batal share = keputusan pengguna; selain itu jatuh ke unduhan biasa.
          if (err?.name !== 'AbortError') downloadBlob(blob, fileName);
        }
      } else {
        downloadBlob(blob, fileName);
      }
      trackEvent('action', 'itinerary_own_pdf_download', { paket: effectivePaket.jadwalId });
    } catch (error) {
      console.error('Gagal menyusun PDF rencana perjalanan:', error);
    } finally {
      setBuildingOwnPdf(false);
    }
  };

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
          // Portal tetap bubble lewat pohon React — tahan klik di sini supaya tidak
          // sampai ke onClick pemanggil (mis. toggle expand PackageCard).
          onClick={(e) => e.stopPropagation()}
        >

      {/* ─── HEADER ───
          Dengan tab: judul+subtitle diganti tab bar langsung di header — hemat satu
          baris supaya area konten lebih lega. Tanpa jadwalId: PDF-only spt semula. */}
      <div className={`flex-none sticky top-0 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-gray-200/60 dark:border-slate-700/60 flex justify-between items-center gap-3 shadow-sm ${hasTabs ? 'px-4 py-3' : 'px-5 py-4'}`}>
        {hasTabs ? (
          <div className="flex-1 min-w-0">
            <SegmentedControl
              options={TAB_OPTIONS}
              value={activeTab}
              onChange={(tab) => {
                userTouchedTabRef.current = true;
                setActiveTab(tab);
                trackEvent('action', 'itinerary_tab_switch', { tab, paket: title });
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Detail Itinerary</h2>
            <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">
              {fileType === 'pdf' ? 'Dokumen PDF' : 'Gambar'}
              {numPages && fileType === 'pdf' ? ` · ${numPages} halaman` : ''}
            </span>
          </div>
        )}
        <button
          onClick={onClose}
          className="p-2 bg-gray-100 dark:bg-slate-800 rounded-full text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors shrink-0"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* ─── PANE ITINERARY (tampilan web hasil parsing) ───
          Light-only by design (token itin-*): diperlakukan sebagai dokumen terang
          di atas modal gelap, sama seperti kertas PDF putih. JANGAN hapus kelas
          `dark` dari <html> ala SharePage — itu mengubah tema seluruh app. */}
      {hasTabs && (
        <div className={`flex-1 min-h-0 overflow-y-auto overscroll-contain bg-[#F6F1EA] ${activeTab === 'itinerary' ? '' : 'hidden'}`}>
          {parsedStale && (
            <div className="mx-auto w-full max-w-md px-3 pt-3">
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11.5px] leading-5 text-amber-800">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>PDF itinerary baru diperbarui — tampilan web sedang disinkronkan otomatis. Versi terbaru ada di tab Preview PDF.</span>
              </div>
            </div>
          )}
          <div className="mx-auto w-full max-w-md">
            <WebItineraryView
              content={webContent}
              loading={webStatus === 'loading'}
              error={webStatus === 'error' ? 'Itinerary belum bisa dimuat.' : null}
              paket={effectivePaket}
              hideDocActions
              summaryAtBottom
              onRetryPdf={() => {
                userTouchedTabRef.current = true;
                setActiveTab('pdf');
              }}
            />
          </div>
        </div>
      )}

      {/* ─── SCROLLABLE CONTENT (PDF/IMAGE VIEWER) ───
          Mount saat pertama kali tab PDF aktif, lalu keep-mounted via `hidden` —
          pinch/zoom state & halaman ter-render bertahan saat bolak-balik tab. */}
      {pdfEverActive && (
      <div
        ref={contentRef}
        className={`flex-1 min-h-0 min-w-0 overflow-auto bg-gray-100 dark:bg-slate-950 px-4 pb-6 relative ${!hasTabs || activeTab === 'pdf' ? '' : 'hidden'}`}
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
              // Tanpa ini gambar gagal muat membuat isPdfLoading macet true
              onError={() => setIsPdfLoading(false)}
            />
          </div>
        )}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* ─── FOOTER ─── */}
      <div className="flex-none sticky bottom-0 bg-white dark:bg-slate-900 border-t border-gray-200/60 dark:border-slate-700/60 px-4 py-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] flex gap-2.5">
        {shareUrl && (
          <div className="relative flex-1">
            {/* Konfirmasi in-place (konvensi repo: label jadi "Tersalin"), bukan tooltip */}
            <span role="status" aria-live="polite" className="sr-only">
              {linkCopied ? 'Link itinerary tersalin' : ''}
            </span>
            <motion.button
              onClick={copyShareLink}
              animate={copyPop}
              whileTap={{ scale: 0.97 }}
              className={`relative flex h-full w-full items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-bold border transition-colors duration-300 ${
                linkCopied
                  ? 'border-emerald-300 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300'
                  : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300'
              }`}
              aria-label="Salin link itinerary"
            >
              {/* Gelombang konfirmasi yang melebar lalu memudar */}
              <AnimatePresence>
                {linkCopied && !prefersReducedMotion && (
                  <motion.span
                    key="ring"
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-emerald-400/70"
                    initial={{ opacity: 0.75, scale: 0.94 }}
                    animate={{ opacity: 0, scale: 1.25 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  />
                )}
              </AnimatePresence>
              {/* Ikon bertukar di ruang tetap 20×20 agar lebar tombol tak bergeser */}
              <span className="relative block h-5 w-5 shrink-0">
                <AnimatePresence initial={false}>
                  {linkCopied ? (
                    <motion.span
                      key="check"
                      className="absolute inset-0 flex items-center justify-center"
                      initial={{ opacity: 0, scale: 0.4, rotate: -25 }}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }}
                      exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.12 } }}
                      transition={{ type: 'spring', stiffness: 620, damping: 18 }}
                    >
                      <ClipboardCheck size={20} className="text-emerald-600 dark:text-emerald-400" />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="link"
                      className="absolute inset-0 flex items-center justify-center"
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.12 } }}
                      transition={{ type: 'spring', stiffness: 620, damping: 24 }}
                    >
                      <Link2 size={20} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              {/* Label bertukar di atas sizer tersembunyi → lebar tombol tetap */}
              <span className="relative grid place-items-center text-sm">
                <span aria-hidden className="invisible col-start-1 row-start-1">Copy Link</span>
                <AnimatePresence initial={false}>
                  <motion.span
                    key={linkCopied ? 'copied' : 'idle'}
                    className="col-start-1 row-start-1 whitespace-nowrap"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                  >
                    {linkCopied ? 'Tersalin' : 'Copy Link'}
                  </motion.span>
                </AnimatePresence>
              </span>
            </motion.button>
          </div>
        )}
        {/* Wording SERAGAM mobile/desktop (pola JourneyStrip 2026-07-31): label
            "Unduh PDF", fungsinya tetap share-sheet dulu di perangkat sentuh. */}
        <button
          onClick={ownPdfMode ? handleOwnPdf : handleShareItinerary}
          disabled={ownPdfMode ? !ownPdfReady || buildingOwnPdf : isSharing || !proxyUrl}
          className="
            flex-1 flex items-center justify-center gap-2 py-2.5 px-3
            rounded-xl text-sm font-bold text-white
            bg-emerald-600 hover:bg-emerald-700
            shadow-lg shadow-emerald-500/20
            transition-all duration-200 active:scale-[0.98] disabled:opacity-70
          "
        >
          {(ownPdfMode ? buildingOwnPdf : isSharing) ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              <span>Sebentar...</span>
            </>
          ) : (
            <>
              <Download size={20} />
              <span>Unduh PDF</span>
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

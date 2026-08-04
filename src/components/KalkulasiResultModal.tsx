// Modal "Hasil Kalkulasi" — dipindah utuh dari KalkulasiPage.tsx supaya bisa
// dipakai dua tempat: halaman Kalkulasi (/:slug/kalkulasi) dan kartu kalkulasi
// Bani (/dashboard/bani). Teks WA (buildKalkulasiWaText) dan generator PDF
// quotation (generateQuotationPdfBlob) ikut diekspor dari sini agar kedua
// pemanggil menghasilkan copywriting & dokumen yang PERSIS sama.
//
// Modul ini menyeret react-pdf + @react-pdf/renderer — berat. Jangan diimpor
// statis dari jalur render awal dashboard; Bani memuatnya lazy saat kartu
// kalkulasi benar-benar tampil (pola yang sama dengan main.tsx → KalkulasiPage).
import { Buffer } from 'buffer';
if (typeof window !== 'undefined' && !window.Buffer) {
  (window as unknown as Record<string, unknown>).Buffer = Buffer;
}
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { pdf } from '@react-pdf/renderer';
import { motion, AnimatePresence } from 'framer-motion';
import { Document as PdfDoc, Page as PdfPage, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
  X,
  ChevronLeft,
  PlaneTakeoff,
  PlaneLanding,
  FileText,
  Loader2,
  AlertCircle,
  Copy,
  CheckCircle2,
  Share2,
  Download,
} from 'lucide-react';
import { QuotationDocument } from './QuotationDocument';
import { trackEvent } from '../utils/analytics';
import { canShareFiles, downloadBlob, isTouchPrimary } from '../utils/share';
import type { AgentData } from '@/data/agents';
import type { UmrohPackage, HotelInfo } from '@/types';

try {
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
} catch {
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
}

export interface KalkulasiSummary {
  items: { label: string; qty: number; unitPrice: number; total: number; note?: string }[];
  subtotal: number;
  discount: number;
  grandTotal: number;
}

function formatRupiah(value: number): string {
  return 'Rp ' + value.toLocaleString('id-ID');
}

const fmtDate = (d: string) => {
  const dt = new Date(d);
  return dt.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

const fmtRp = (v: number) => 'Rp. ' + v.toLocaleString('id-ID');

// Build WA-style text
export function buildKalkulasiWaText({
  pkg,
  tier,
  summary,
  catatan,
  discountLabel,
}: {
  pkg: UmrohPackage | null;
  tier: string;
  summary: KalkulasiSummary;
  catatan?: string;
  discountLabel?: string;
}): string {
  const lines: string[] = [];
  lines.push('🕋 *ALHIJAZ INDOWISATA*');
  lines.push('───────────────');
  if (pkg) {
    lines.push(`*${pkg.nama}*`);
    lines.push(`Flight by *${pkg.maskapai}*`);
    lines.push('');
    lines.push('```🛫 BERANGKAT```');
    lines.push(`*${fmtDate(pkg.keberangkatan.tgl)}*, *${pkg.keberangkatan.jam} WIB*`);
    lines.push(`*${pkg.keberangkatan.kodePenerbangan}* ─ *${pkg.keberangkatan.rute}*`);
    lines.push('');
    lines.push('```🛬 PULANG```');
    lines.push(`*${fmtDate(pkg.kepulangan.tgl)}*, *${pkg.kepulangan.jam} WIB*`);
    lines.push(`*${pkg.kepulangan.kodePenerbangan}* ─ *${pkg.kepulangan.rute}*`);
    lines.push('');
    // Hotels for the active tier
    const activeTier = tier && pkg.hotel[tier] ? tier : Object.keys(pkg.hotel)[0];
    if (activeTier) {
      const h = pkg.hotel[activeTier] as HotelInfo & Record<string, string>;
      lines.push(`*PAKET ${activeTier}*`);
      lines.push('─────────────');
      const hotelKeys: { key: string; starKey: string; label: string }[] = [
        { key: 'mekkah_hotel', starKey: 'mekkah_bintang', label: '🇸🇦 HOTEL MEKKAH' },
        { key: 'madinah_hotel', starKey: 'madinah_bintang', label: '🇸🇦 HOTEL MADINAH' },
        { key: 'cairo_hotel', starKey: 'cairo_bintang', label: '🇪🇬 HOTEL CAIRO' },
        { key: 'istanbul_hotel', starKey: 'istanbul_bintang', label: '🇹🇷 HOTEL ISTANBUL' },
        { key: 'bursa_hotel', starKey: 'bursa_bintang', label: '🇹🇷 HOTEL BURSA' },
        { key: 'cappadocia_hotel', starKey: 'cappadocia_bintang', label: '🇹🇷 HOTEL CAPPADOCIA' },
        { key: 'ankara_hotel', starKey: 'ankara_bintang', label: '🇹🇷 HOTEL ANKARA' },
      ];
      hotelKeys.forEach(({ key, starKey, label }, idx) => {
        if (h[key]) {
          if (idx > 0) lines.push('');
          lines.push(`\`\`\`${label}\`\`\``);
          const star = h[starKey] ? ` ⭐${h[starKey]}` : '';
          lines.push(`*${h[key]}*${star}`);
        }
      });
      lines.push('');
      lines.push('');
    }
  }

  // Rincian biaya
  lines.push('📋 *RINCIAN BIAYA UMROH*');
  lines.push('─────────────');

  for (const item of summary.items) {
    const emoji = item.label.toLowerCase().includes('infant') ? '👶'
      : item.label.toLowerCase().includes('anak') || item.label.toLowerCase().includes('balita') ? '🧒'
      : '🧑';
    lines.push(`${emoji} *${item.label}*`);
    if (item.note) {
      lines.push(`${item.note}`);
      lines.push(`= ${fmtRp(item.unitPrice)} × ${item.qty} pax`);
    } else {
      lines.push(`${fmtRp(item.unitPrice)} × ${item.qty} pax`);
    }
    lines.push(`*${fmtRp(item.total)}*`);
    lines.push('');
  }
  lines.push('─────────────');
  if (summary.discount > 0) {
    lines.push(`🧾 Subtotal    ${fmtRp(summary.subtotal)}`);
    lines.push(`🏷️ ${discountLabel || 'Potongan Diskon'}       -${fmtRp(summary.discount)}`);
    lines.push('─────────────');
  }
  lines.push(`💰 *TOTAL BIAYA UMROH*`);
  lines.push(`👉 *${fmtRp(summary.grandTotal)}*`);
  lines.push('');
  if (catatan) {
    lines.push('📝 *Keterangan :*');
    lines.push(catatan);
    lines.push('');
  }
  return lines.join('\n');
}

// PDF quotation — logika persis handleDownloadPDF lama di KalkulasiPage
// (pre-fetch foto agent sebagai baseline PNG karena react-pdf tidak bisa
// membaca progressive JPEG), sekarang dipakai bersama oleh KalkulasiPage & Bani.
export async function generateQuotationPdfBlob({
  pkg,
  tier,
  summary,
  namaLengkap,
  agent,
  discountLabel,
}: {
  pkg: UmrohPackage | null;
  tier: string;
  summary: KalkulasiSummary;
  namaLengkap: string;
  agent?: AgentData | null;
  discountLabel?: string;
}): Promise<Blob> {
  let agentPhotoBase64: string | undefined;
  if (agent?.photo) {
    try {
      agentPhotoBase64 = await new Promise<string>((resolve, reject) => {
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = agent.photo;
      });
    } catch (e) {
      console.warn('Failed to load agent photo for PDF:', e);
    }
  }
  return pdf(
    <QuotationDocument
      pkg={pkg}
      tier={tier}
      summary={summary}
      namaLengkap={namaLengkap}
      agent={agent || undefined}
      agentPhotoBase64={agentPhotoBase64}
      discountLabel={discountLabel}
    />
  ).toBlob();
}

// ============================================
// Result Modal Component
// ============================================
export function KalkulasiResultModal({
  isOpen,
  onClose,
  pkg,
  tier,
  summary,
  catatan,
  namaLengkap,
  discountLabel,
  onGeneratePDF,
  pdfBlobRef,
  pdfPreviewUrl,
  pdfLoading,
  pdfNumPages,
  setPdfNumPages,
  pdfEnabled,
}: {
  isOpen: boolean;
  onClose: () => void;
  pkg: UmrohPackage | null;
  tier: string;
  summary: KalkulasiSummary;
  catatan: string;
  namaLengkap: string;
  discountLabel: string;
  onGeneratePDF: () => void;
  pdfBlobRef: React.RefObject<Blob | null>;
  pdfPreviewUrl: string | null;
  pdfLoading: boolean;
  pdfNumPages: number | null;
  setPdfNumPages: (n: number | null) => void;
  pdfEnabled: boolean;
}) {
  const [view, setView] = useState<'results' | 'pdf'>('results');
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [pdfSharing, setPdfSharing] = useState(false);
  const [pdfBtnLoading, setPdfBtnLoading] = useState(false);
  const [pdfPageWidth, setPdfPageWidth] = useState(0);
  const pdfContentRef = useRef<HTMLDivElement>(null);
  const useShareLabel = isTouchPrimary() && typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  // Reset view when modal re-opens
  useEffect(() => {
    if (isOpen) setView('results');
  }, [isOpen]);

  // Measure container width for react-pdf pages
  useEffect(() => {
    const el = pdfContentRef.current;
    if (!el || view !== 'pdf') return;
    const measure = () => {
      const availableWidth = el.clientWidth - 48;
      setPdfPageWidth(Math.max(availableWidth, 280));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [view, pdfPreviewUrl]);

  const buildWaText = () => buildKalkulasiWaText({ pkg, tier, summary, catatan, discountLabel });

  const handleShare = async () => {
    const text = buildWaText();
    if (navigator.share) {
      setSharing(true);
      try { await navigator.share({ text }); } catch { /* user cancelled */ } finally { setSharing(false); }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  };

  const handleCopy = async () => {
    const text = buildWaText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard failed */ }
  };

  const handlePdfClick = () => {
    setPdfBtnLoading(true);
    trackEvent('action', 'generate_pdf', { paket: pkg?.nama || '' });
    onGeneratePDF(); // start generating in the background
    setTimeout(() => {
      setPdfBtnLoading(false);
      setView('pdf');
    }, 1500);
  };

  const handleSharePdf = async () => {
    if (!pdfBlobRef.current) return;
    setPdfSharing(true);
    try {
      const safeTitle = pkg ? pkg.nama.replace(/\s+/g, '_').substring(0, 30).toUpperCase() : 'ALHIJAZ';
      const fileName = `QUOTATION_${safeTitle}.pdf`;
      const file = new File([pdfBlobRef.current], fileName, { type: 'application/pdf' });

      if (canShareFiles([file])) {
        try {
          await navigator.share({
            title: `Quotation - ${pkg?.nama || 'Alhijaz'}`,
            text: 'Berikut quotation penawaran umroh',
            files: [file],
          });
        } catch (err: any) {
          if (err?.name !== 'AbortError') {
            downloadBlob(pdfBlobRef.current, fileName);
          }
        }
      } else {
        downloadBlob(pdfBlobRef.current, fileName);
      }
    } catch (err) {
      console.error('Share failed:', err);
    } finally {
      setPdfSharing(false);
    }
  };

  const activeTier = pkg ? (tier && pkg.hotel[tier] ? tier : Object.keys(pkg.hotel)[0]) : null;
  const hotelData = activeTier && pkg ? (pkg.hotel[activeTier] as HotelInfo & Record<string, string>) : null;

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
          <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">
            {view === 'results' ? 'Hasil Kalkulasi' : 'Preview Quotation'}
          </h2>
          <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">
            {view === 'results'
              ? (namaLengkap ? <>untuk <span className="font-semibold text-gray-700 dark:text-slate-300">{namaLengkap}</span></> : 'Perhitungan Harga Paket Umroh')
              : `Dokumen PDF${pdfNumPages ? ` · ${pdfNumPages} halaman` : ''}`
            }
          </span>
        </div>
        <button onClick={onClose} className="p-2 bg-gray-100 dark:bg-slate-800 rounded-full text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors shrink-0">
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* ─── SCROLLABLE BODY ─── */}
      {view === 'results' ? (
        <div className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-100 dark:bg-slate-950 px-4 pb-6">
          <div className="max-w-2xl mx-auto pt-4 space-y-4">
            {pkg && (
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-4 space-y-3">
                <p className="font-bold text-center text-slate-800 dark:text-slate-100 leading-relaxed">{pkg.nama}</p>
                <p className="text-xs text-center text-slate-500 dark:text-slate-300">Flight by {pkg.maskapai}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 flex items-center justify-center text-emerald-600 mt-0.5"><PlaneTakeoff size={16} /></div>
                    <div>
                      <p className="text-[10px] text-slate-400 dark:text-slate-400 uppercase tracking-wide">Berangkat</p>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{fmtDate(pkg.keberangkatan.tgl)}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-300">{pkg.keberangkatan.kodePenerbangan} · {pkg.keberangkatan.jam}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 flex items-center justify-center text-emerald-600 mt-0.5"><PlaneLanding size={16} /></div>
                    <div>
                      <p className="text-[10px] text-slate-400 dark:text-slate-400 uppercase tracking-wide">Pulang</p>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{fmtDate(pkg.kepulangan.tgl)}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-300">{pkg.kepulangan.kodePenerbangan} · {pkg.kepulangan.jam}</p>
                    </div>
                  </div>
                </div>
                {hotelData && (
                  <div className="grid grid-cols-2 gap-3">
                    {hotelData.mekkah_hotel && (
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-400 dark:text-slate-400 uppercase tracking-wide">Mekkah</p>
                        <p className="text-xs text-slate-700 dark:text-slate-200 font-medium truncate">{hotelData.mekkah_hotel}</p>
                        {hotelData.mekkah_bintang && (<div className="flex items-center gap-0.5">{Array.from({ length: parseInt(hotelData.mekkah_bintang) }).map((_, i) => (<span key={i} className="text-[10px] text-amber-400">★</span>))}</div>)}
                      </div>
                    )}
                    {hotelData.madinah_hotel && (
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-400 dark:text-slate-400 uppercase tracking-wide">Madinah</p>
                        <p className="text-xs text-slate-700 dark:text-slate-200 font-medium truncate">{hotelData.madinah_hotel}</p>
                        {hotelData.madinah_bintang && (<div className="flex items-center gap-0.5">{Array.from({ length: parseInt(hotelData.madinah_bintang) }).map((_, i) => (<span key={i} className="text-[10px] text-amber-400">★</span>))}</div>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-4">
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-widest mb-3">Rincian Perhitungan</p>
              <div className="space-y-3">
                {summary.items.map((item, i) => (
                  <div key={i} className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">{item.label}</p>
                    <div className="flex justify-between text-xs text-slate-500 dark:text-slate-300">
                      <span>{formatRupiah(item.unitPrice)} × {item.qty} pax</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100 tabular-nums">{formatRupiah(item.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t-2 border-dashed border-slate-200 dark:border-slate-600 pt-3 mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-300">Subtotal</span>
                  <span className="text-slate-700 dark:text-slate-200 font-medium tabular-nums">{formatRupiah(summary.subtotal)}</span>
                </div>
                {summary.discount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-emerald-500">{discountLabel || 'Potongan Diskon'}</span>
                    <span className="text-emerald-500 font-medium tabular-nums">- {formatRupiah(summary.discount)}</span>
                  </div>
                )}
                <div className="border-t border-slate-200 dark:border-slate-600 pt-3">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-bold text-slate-600 dark:text-white">TOTAL BIAYA</span>
                    <span className="text-lg font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">{formatRupiah(summary.grandTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
            {catatan && (
              <div className="bg-amber-50 dark:bg-amber-900/30 rounded-xl p-3 border border-amber-100 dark:border-amber-800/40">
                <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-1">Keterangan</p>
                <p className="text-xs text-amber-800 dark:text-amber-300">{catatan}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div ref={pdfContentRef} className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-100 dark:bg-slate-950 px-4 pb-6">
          <div className="flex justify-center pt-4">
            {pdfLoading ? (
              <div className="flex flex-col items-center gap-4 py-20">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full border-4 border-emerald-100 border-t-emerald-500 animate-spin" />
                  <FileText className="absolute inset-0 m-auto w-6 h-6 text-emerald-600" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-700">Membuat PDF...</p>
                  <p className="text-xs text-slate-400 mt-1">Mohon tunggu sebentar</p>
                </div>
              </div>
            ) : pdfPreviewUrl ? (
              <div className="bg-white dark:bg-slate-800 p-2 rounded-xl shadow-lg max-w-2xl w-full min-h-[50vh] flex flex-col items-center justify-center relative">
                <PdfDoc
                  file={pdfPreviewUrl}
                  onLoadSuccess={({ numPages }) => setPdfNumPages(numPages)}
                  onLoadError={(err) => console.error('react-pdf error:', err)}
                  loading={
                    <div className="flex flex-col items-center gap-3 py-10">
                      <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                      <span className="text-sm text-gray-500">Memuat Dokumen...</span>
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
                  {pdfNumPages && Array.from(new Array(pdfNumPages), (_, i) => (
                    <PdfPage
                      key={`qpage_${i + 1}`}
                      pageNumber={i + 1}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      className="shadow-md rounded-lg overflow-hidden w-full max-w-full"
                      width={pdfPageWidth || 400}
                    />
                  ))}
                </PdfDoc>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-10 text-red-500">
                <AlertCircle className="w-8 h-8" />
                <span className="text-sm">Gagal membuat PDF.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── FOOTER ─── */}
      <div className="flex-none sticky bottom-0 bg-white dark:bg-slate-900 border-t border-gray-200/60 dark:border-slate-700/60 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        {view === 'results' ? (
          <div className="flex gap-2">
            <button
              onClick={() => { if (pdfEnabled && !pdfBtnLoading) handlePdfClick(); }}
              disabled={!pdfEnabled || pdfBtnLoading}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-xl text-sm font-semibold border-2 transition-all duration-200 active:scale-[0.97] ${
                pdfBtnLoading ? 'border-emerald-200 dark:border-emerald-800 text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30' : pdfEnabled ? 'border-slate-200 dark:border-slate-700 text-emerald-600 dark:text-white bg-white dark:bg-slate-800' : 'border-slate-100 dark:border-slate-700 text-slate-300 dark:text-slate-600 bg-slate-50 dark:bg-slate-800 cursor-not-allowed'
              }`}
            >
              {pdfBtnLoading ? <><Loader2 size={16} className="animate-spin" /> Bentar...</> : <><FileText size={16} /> PDF</>}
            </button>
            <button onClick={handleCopy} className="flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-xl text-sm font-semibold border-2 border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-white bg-white dark:bg-slate-800 transition-all duration-200 active:scale-[0.97]">
              {copied ? <><CheckCircle2 size={16} /> Copied!</> : <><Copy size={16} /> Copy</>}
            </button>
            <button onClick={handleShare} disabled={sharing} className="flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-xl text-sm font-semibold border-2 border-slate-200 dark:border-slate-700 text-green-600 dark:text-white bg-white dark:bg-slate-800 transition-all duration-200 active:scale-[0.97] disabled:opacity-70">
              {sharing ? <><Loader2 size={16} className="animate-spin" /> Bentar...</> : <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Share
            </>}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setView('results')} className="w-[20%] flex items-center justify-center py-3.5 rounded-xl text-sm font-semibold border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 transition-all duration-200 active:scale-[0.97]">
              <ChevronLeft size={20} />
            </button>
            <button onClick={handleSharePdf} disabled={pdfSharing || pdfLoading} className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 transition-all duration-200 active:scale-[0.98] disabled:opacity-70">
              {pdfSharing ? (
                <><Loader2 size={20} className="animate-spin" /><span>Bentar...</span></>
              ) : useShareLabel ? (
                <><Share2 size={20} /><span>Bagikan PDF</span></>
              ) : (
                <><Download size={20} /><span>Unduh PDF</span></>
              )}
            </button>
          </div>
        )}
      </div>

        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export default KalkulasiResultModal;

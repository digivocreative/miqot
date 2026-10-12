// Modal "Preview Quotation" (dulu "Hasil Kalkulasi") — dipindah dari
// KalkulasiPage.tsx; dulu juga dipakai kartu kalkulasi Bani (sudah dihapus). Teks WA (buildKalkulasiWaText) dan generator PDF
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
  FileText,
  Loader2,
  AlertCircle,
  Copy,
  CheckCircle2,
  Share2,
  Download,
} from 'lucide-react';
import { QuotationDocument } from './QuotationDocument';
import { useBackToClose } from '../hooks/useBackToClose';
import { trackEvent } from '../utils/analytics';
import { canShareFiles, downloadBlob, isTouchPrimary } from '../utils/share';
import type { AgentData } from '@/data/agents';
import type { UmrohPackage } from '@/types';
import { resolvePackageTier, tierHotelInfo } from '@/lib/packageTiers';

try {
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
} catch {
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
}

export interface KalkulasiSummary {
  // addon: baris Add-on manual agent — emoji ➕ di teks WA.
  // flat: add-on pax 0 → harga apa adanya, tanpa "× N pax".
  items: { label: string; qty: number; unitPrice: number; total: number; note?: string; addon?: boolean; flat?: boolean }[];
  subtotal: number;
  discount: number;
  grandTotal: number;
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
    // Hotel tier terpilih SAJA — meminjam hotel tier lain berarti teks WA yang
    // dikirim ke jamaah memasang hotel UHUD di bawah judul PAKET HEMAT.
    const activeTier = resolvePackageTier(pkg, tier);
    const h = tierHotelInfo(pkg, activeTier);
    if (activeTier && h) {
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
    const emoji = item.addon ? '➕'
      : item.label.toLowerCase().includes('infant') ? '👶'
      : item.label.toLowerCase().includes('anak') || item.label.toLowerCase().includes('balita') ? '🧒'
      : '🧑';
    lines.push(`${emoji} *${item.label}*`);
    if (item.note) {
      lines.push(`${item.note}`);
      lines.push(`= ${fmtRp(item.unitPrice)} × ${item.qty} pax`);
    } else if (!item.flat) {
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
// Result Modal Component — Preview Quotation
// ============================================
// Tombol Kalkulasi langsung membuka pratinjau PDF (halaman "Hasil Kalkulasi"
// & tombol Share teks dihapus); teks WA tinggal lewat tombol Copy WA.
export function KalkulasiResultModal({
  isOpen,
  onClose,
  pkg,
  tier,
  summary,
  catatan,
  discountLabel,
  pdfBlobRef,
  pdfPreviewUrl,
  pdfLoading,
  pdfNumPages,
  setPdfNumPages,
}: {
  isOpen: boolean;
  onClose: () => void;
  pkg: UmrohPackage | null;
  tier: string;
  summary: KalkulasiSummary;
  catatan: string;
  discountLabel: string;
  pdfBlobRef: React.RefObject<Blob | null>;
  pdfPreviewUrl: string | null;
  pdfLoading: boolean;
  pdfNumPages: number | null;
  setPdfNumPages: (n: number | null) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [pdfSharing, setPdfSharing] = useState(false);
  const [pdfPageWidth, setPdfPageWidth] = useState(0);
  const pdfContentRef = useRef<HTMLDivElement>(null);
  const useShareLabel = isTouchPrimary() && typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  // Back Android menutup modal, bukan halaman Kalkulasi di bawahnya.
  useBackToClose(isOpen, onClose);

  // Measure container width for react-pdf pages
  useEffect(() => {
    const el = pdfContentRef.current;
    if (!el || !isOpen) return;
    const measure = () => {
      const availableWidth = el.clientWidth - 48;
      setPdfPageWidth(Math.max(availableWidth, 280));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen, pdfPreviewUrl]);

  const handleCopy = async () => {
    const text = buildKalkulasiWaText({ pkg, tier, summary, catatan, discountLabel });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      trackEvent('action', 'share_kalkulasi_text', { method: 'copy' });
    } catch { /* clipboard failed */ }
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
          trackEvent('action', 'share_quotation_pdf', { source: 'kalkulasi', method: 'share' });
        } catch (err: any) {
          if (err?.name !== 'AbortError') {
            downloadBlob(pdfBlobRef.current, fileName);
            trackEvent('action', 'share_quotation_pdf', { source: 'kalkulasi', method: 'download' });
          }
        }
      } else {
        downloadBlob(pdfBlobRef.current, fileName);
        trackEvent('action', 'share_quotation_pdf', { source: 'kalkulasi', method: 'download' });
      }
    } catch (err) {
      console.error('Share failed:', err);
    } finally {
      setPdfSharing(false);
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

      {/* ─── HEADER ─── (pt safe-area: di app terpasang iOS header berada di bawah status bar) */}
      <div className="flex-none sticky top-0 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-gray-200/60 dark:border-slate-700/60 px-5 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] flex justify-between items-center shadow-sm">
        <div className="flex flex-col">
          <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Preview Quotation</h2>
          <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">
            {`Dokumen PDF${pdfNumPages ? ` · ${pdfNumPages} halaman` : ''}`}
          </span>
        </div>
        <button onClick={onClose} aria-label="Tutup" className="touch-hit relative p-2 bg-gray-100 dark:bg-slate-800 rounded-full text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors shrink-0">
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* ─── SCROLLABLE BODY ─── */}
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

      {/* ─── FOOTER ─── */}
      <div className="flex-none sticky bottom-0 bg-white dark:bg-slate-900 border-t border-gray-200/60 dark:border-slate-700/60 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="flex gap-2">
          <button onClick={handleSharePdf} disabled={pdfSharing || pdfLoading || !pdfPreviewUrl} className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 transition-all duration-200 active:scale-[0.98] disabled:opacity-70">
            {pdfSharing ? (
              <><Loader2 size={20} className="animate-spin" /><span>Bentar...</span></>
            ) : useShareLabel ? (
              <><Share2 size={20} /><span>Bagikan PDF</span></>
            ) : (
              <><Download size={20} /><span>Unduh PDF</span></>
            )}
          </button>
          <button onClick={handleCopy} className="shrink-0 flex items-center justify-center gap-1.5 px-5 py-3.5 rounded-xl text-sm font-semibold border-2 border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-white bg-white dark:bg-slate-800 transition-all duration-200 active:scale-[0.97]">
            {copied ? <><CheckCircle2 size={16} /> Copied!</> : <><Copy size={16} /> Copy WA</>}
          </button>
        </div>
      </div>

        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export default KalkulasiResultModal;

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Info, User, Calendar, Users, FileText, ChevronLeft, Share2, Loader2, AlertCircle, X } from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { Document as PdfDoc, Page as PdfPage, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import SimulasiHajiPlusDocument from './SimulasiHajiPlusDocument';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// ── Constants ──
const PACKAGES = [
  { id: 'rahmah', name: 'RAHMAH', stars: 5, priceUSD: 15700, hotel: 'Hotel Bintang 5 · Walking distance ke Masjidil Haram & Nabawi' },
  { id: 'uhud', name: 'UHUD', stars: 4, priceUSD: 12500, hotel: 'Hotel Bintang 4 · Lokasi strategis di Makkah & Madinah' },
];
const DP_USD = 4500;
const PELUNASAN_BULAN = 6;

// ── Helpers ──
const fmtUSD = (n: number) => `$${n.toLocaleString('en-US')}`;
const fmtRp = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;

export default function SimulasiHajiPlus() {
  const currentYear = new Date().getFullYear();

  // ── State ──
  const [selectedPkg, setSelectedPkg] = useState<string | null>(null);
  const [tahunBerangkat, setTahunBerangkat] = useState(2035);
  const [jumlahJamaah, setJumlahJamaah] = useState(1);
  const [namaJamaah, setNamaJamaah] = useState('');
  const [kursUSD, setKursUSD] = useState<number | null>(null);
  const [kursDate, setKursDate] = useState('');
  const [kursLoading, setKursLoading] = useState(true);

  // PDF modal state
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfSharing, setPdfSharing] = useState(false);
  const [pdfNumPages, setPdfNumPages] = useState<number | null>(null);
  const [pdfPageWidth, setPdfPageWidth] = useState(0);
  const pdfBlobRef = useRef<Blob | null>(null);
  const pdfContentRef = useRef<HTMLDivElement>(null);

  // ── Fetch Kurs ──
  useEffect(() => {
    const fetchKurs = async () => {
      try {
        const res = await fetch('/api/kurs');
        const data = await res.json();
        if (data.success && data.data?.rates?.USD) {
          setKursUSD(data.data.rates.USD);
          if (data.data.updatedAt) {
            const raw = data.data.updatedAt.split(' ')[0];
            const parts = raw?.split('/');
            if (parts?.length === 3) {
              const d = new Date(2000 + Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
              setKursDate(d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }));
            } else {
              setKursDate(raw || data.data.updatedAt);
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch kurs:', err);
      } finally {
        setKursLoading(false);
      }
    };
    fetchKurs();
  }, []);

  // ── Measure PDF container width ──
  useEffect(() => {
    const el = pdfContentRef.current;
    if (!el || !pdfPreviewUrl) return;
    const measure = () => {
      const availableWidth = el.clientWidth - 48;
      setPdfPageWidth(Math.max(availableWidth, 280));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pdfPreviewUrl]);

  // ── Body scroll lock for modal ──
  useEffect(() => {
    if (pdfModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [pdfModalOpen]);

  // ── Derived ──
  const pkg = PACKAGES.find(p => p.id === selectedPkg) || null;

  const calc = useMemo(() => {
    if (!pkg || !kursUSD) return null;
    const totalUSD = pkg.priceUSD * jumlahJamaah;
    const totalIDR = totalUSD * kursUSD;
    const dpUSD = DP_USD * jumlahJamaah;
    const dpIDR = dpUSD * kursUSD;
    const sisaUSD = totalUSD - dpUSD;
    const sisaIDR = sisaUSD * kursUSD;
    const deadlineDate = new Date(tahunBerangkat, 0, 1);
    deadlineDate.setMonth(deadlineDate.getMonth() - PELUNASAN_BULAN);
    const deadlineLabel = deadlineDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    const diffMonths = Math.max(0, Math.round((new Date(tahunBerangkat, 0, 1).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)));
    return { totalUSD, totalIDR, dpUSD, dpIDR, sisaUSD, sisaIDR, deadlineLabel, diffMonths };
  }, [pkg, tahunBerangkat, jumlahJamaah, kursUSD]);

  // ── Accent colors ──
  const isRahmah = selectedPkg === 'rahmah';

  // ── Open PDF modal & generate ──
  const handleOpenPdfModal = useCallback(async () => {
    if (!pkg || !calc || !kursUSD) return;
    setPdfModalOpen(true);
    setPdfLoading(true);
    setPdfNumPages(null);
    setPdfPreviewUrl(null);
    try {
      const blob = await pdf(
        <SimulasiHajiPlusDocument
          pkg={pkg}
          calc={calc}
          jumlahJamaah={jumlahJamaah}
          tahunBerangkat={tahunBerangkat}
          namaJamaah={namaJamaah}
          kursUSD={kursUSD}
          kursDate={kursDate}
        />
      ).toBlob();
      pdfBlobRef.current = blob;
      setPdfPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setPdfLoading(false);
    }
  }, [pkg, calc, jumlahJamaah, tahunBerangkat, namaJamaah, kursUSD, kursDate]);

  // ── Close modal ──
  const handleClosePdfModal = () => {
    setPdfModalOpen(false);
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
    pdfBlobRef.current = null;
    setPdfNumPages(null);
  };

  // ── Share PDF (Web Share API + fallback) ──
  const handleSharePdf = async () => {
    if (!pdfBlobRef.current) return;
    setPdfSharing(true);
    try {
      const fileName = `Simulasi_Haji_Plus_${(namaJamaah || 'Alhijaz').replace(/\s+/g, '_').substring(0, 30)}.pdf`;
      const file = new File([pdfBlobRef.current], fileName, { type: 'application/pdf' });
      const shareData = { title: 'Simulasi Haji Plus', text: 'Simulasi biaya haji plus Alhijaz', files: [file] };

      if (navigator.canShare && navigator.canShare(shareData)) {
        try {
          await navigator.share(shareData);
        } catch (err: any) {
          if (err?.name !== 'AbortError') downloadBlob(fileName);
        }
      } else {
        downloadBlob(fileName);
      }
    } catch (err) {
      console.error('Share failed:', err);
    } finally {
      setPdfSharing(false);
    }
  };

  const downloadBlob = (fileName: string) => {
    if (!pdfBlobRef.current) return;
    const url = URL.createObjectURL(pdfBlobRef.current);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── WhatsApp share ──
  const handleShare = () => {
    if (!pkg || !calc || !kursUSD) return;
    const shareText = `*Simulasi Biaya Haji Plus Alhijaz*\n\nNama: ${namaJamaah || '-'}\nPaket: ${pkg.name} ★${pkg.stars}\nTahun Berangkat: ${tahunBerangkat}\nJumlah: ${jumlahJamaah} jamaah\n\n*Total: ${fmtUSD(calc.totalUSD)}* (≈ ${fmtRp(calc.totalIDR)})\nDP: ${fmtUSD(calc.dpUSD)}\nPelunasan: ${fmtUSD(calc.sisaUSD)} (maks. ${calc.deadlineLabel})\n\nKurs USD: ${fmtRp(kursUSD)} (${kursDate})\n\n_Hubungi kami untuk info lebih lanjut_`;
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
  };

  // ── PDF Modal (portal) ──
  const pdfModal = createPortal(
    <AnimatePresence>
      {pdfModalOpen && (
        <motion.div
          className="fixed inset-0 z-[9999] bg-white dark:bg-slate-900 flex flex-col"
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        >
          {/* Header */}
          <div className="flex-none sticky top-0 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-gray-200/60 dark:border-slate-700/60 px-5 py-4 flex justify-between items-center shadow-sm">
            <div className="flex flex-col">
              <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Simulasi Haji Plus</h2>
              <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">
                {pdfNumPages ? `Dokumen PDF · ${pdfNumPages} halaman` : 'Preview Dokumen PDF'}
              </span>
            </div>
            <button onClick={handleClosePdfModal} className="p-2 bg-gray-100 dark:bg-slate-800 rounded-full text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors shrink-0">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Body */}
          <div ref={pdfContentRef} className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-100 dark:bg-slate-950 px-4 pb-6">
            <div className="flex justify-center pt-4">
              {pdfLoading ? (
                <div className="flex flex-col items-center gap-4 py-20">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-emerald-100 border-t-emerald-500 animate-spin" />
                    <FileText className="absolute inset-0 m-auto w-6 h-6 text-emerald-600" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">Membuat PDF...</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Mohon tunggu sebentar</p>
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
                        key={`spage_${i + 1}`}
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

          {/* Footer */}
          <div className="flex-none sticky bottom-0 bg-white dark:bg-slate-900 border-t border-gray-200/60 dark:border-slate-700/60 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <div className="flex gap-2">
              <button onClick={handleClosePdfModal} className="w-[20%] flex items-center justify-center py-3.5 rounded-xl text-sm font-semibold border-2 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800 transition-all duration-200 active:scale-[0.97]">
                <ChevronLeft size={20} />
              </button>
              <button onClick={handleSharePdf} disabled={pdfSharing || pdfLoading} className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 transition-all duration-200 active:scale-[0.98] disabled:opacity-70">
                {pdfSharing ? (<><Loader2 size={20} className="animate-spin" /><span>Bentar...</span></>) : (<><Share2 size={20} /><span>Bagikan PDF</span></>)}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );

  return (
    <div className="px-4 pt-4 pb-8 space-y-4">

      {/* A. Kurs Info Banner */}
      {kursLoading ? (
        <div className="h-10 rounded-xl bg-gray-100 dark:bg-slate-800 animate-pulse" />
      ) : kursUSD ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center flex-shrink-0 shadow-md shadow-emerald-500/20">
            <span className="text-white text-base font-bold">$</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] text-gray-500 dark:text-slate-400 font-semibold uppercase tracking-wide">Kurs Hari Ini</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-gray-800 dark:text-white">{fmtRp(kursUSD)}</span>
              <span className="text-[9px] font-bold text-emerald-500 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded">USD</span>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[10px] text-gray-500 dark:text-slate-400 font-medium">Bank Mandiri</p>
            <p className="text-[10px] text-gray-400 dark:text-slate-500">{kursDate}</p>
          </div>
        </div>
      ) : (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30 rounded-xl px-3 py-2.5 flex items-center gap-2">
          <Info size={13} className="text-red-600 dark:text-red-400 flex-shrink-0" />
          <p className="text-[11px] text-red-600 dark:text-red-300">Kurs tidak tersedia, coba refresh halaman</p>
        </div>
      )}

      {/* B. Nama Calon Jamaah */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-4">
        <label className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2">
          <User size={12} /> Nama Calon Jamaah
        </label>
        <input
          type="text"
          value={namaJamaah}
          onChange={e => setNamaJamaah(e.target.value)}
          placeholder="Masukkan nama lengkap"
          className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-sm text-gray-800 dark:text-white placeholder-gray-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors"
        />
        <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-1.5">Akan tampil di dokumen PDF simulasi</p>
      </div>

      {/* C. Pilih Paket */}
      <div>
        <p className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2 px-1">Pilih Paket</p>
        <div className="grid grid-cols-2 gap-3">
          {PACKAGES.map(p => {
            const selected = selectedPkg === p.id;
            const isR = p.id === 'rahmah';
            return (
              <button
                key={p.id}
                onClick={() => setSelectedPkg(p.id)}
                className={`relative rounded-2xl text-left transition-all duration-200 active:scale-[0.97] overflow-hidden ${
                  selected
                    ? isR
                      ? 'shadow-xl shadow-emerald-500/20 ring-2 ring-emerald-500'
                      : 'shadow-xl shadow-blue-500/20 ring-2 ring-blue-500'
                    : 'shadow-sm ring-1 ring-gray-100 dark:ring-slate-700'
                }`}
                style={selected ? {
                  background: isR
                    ? 'linear-gradient(160deg, #064e3b, #065f46, #047857)'
                    : 'linear-gradient(160deg, #1e3a5f, #1e40af, #2563eb)'
                } : undefined}
              >
                {selected && (
                  <>
                    <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-white/[0.06]" />
                    <div className="absolute -bottom-4 -left-4 w-14 h-14 rounded-full bg-white/[0.04]" />
                  </>
                )}
                <div className={`relative px-3.5 pt-3.5 pb-3 ${!selected ? 'bg-white dark:bg-slate-800' : ''}`}>
                  <div className="flex items-center gap-0.5 mb-1.5">
                    {Array.from({ length: p.stars }).map((_, i) => (
                      <svg key={i} width="11" height="11" viewBox="0 0 10 10" fill="#f59e0b">
                        <path d="M5 0l1.12 3.44h3.63l-2.94 2.13 1.13 3.43L5 6.88 2.06 9l1.13-3.43L.25 3.44h3.63z"/>
                      </svg>
                    ))}
                  </div>
                  <p className={`text-sm font-bold ${selected ? 'text-white' : 'text-gray-800 dark:text-white'}`}>{p.name}</p>
                  <p className={`text-xl font-bold mt-1 ${selected ? 'text-white' : 'text-gray-800 dark:text-white'}`}>{fmtUSD(p.priceUSD)}</p>
                  <p className={`text-[9px] mt-0.5 ${selected ? 'text-white/70' : 'text-gray-500 dark:text-slate-400'}`}>per jamaah</p>
                  <div className="mb-1" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* D. Tahun & Jumlah */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3.5">
          <label className="flex items-center gap-1 text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2">
            <Calendar size={10} /> Tahun Berangkat
          </label>
          <select
            value={tahunBerangkat}
            onChange={e => setTahunBerangkat(Number(e.target.value))}
            className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-sm font-bold text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors appearance-none"
          >
            {Array.from({ length: 6 }, (_, i) => 2035 + i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3.5">
          <label className="flex items-center gap-1 text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2">
            <Users size={10} /> Jumlah
          </label>
          <div className="flex items-center justify-between">
            <button
              onClick={() => setJumlahJamaah(j => Math.max(1, j - 1))}
              disabled={jumlahJamaah <= 1}
              className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-gray-500 dark:text-slate-400 font-bold text-lg active:scale-90 transition-all disabled:opacity-30"
            >−</button>
            <div className="text-center">
              <span className="text-xl font-bold text-gray-800 dark:text-white">{jumlahJamaah}</span>
              <p className="text-[9px] text-gray-500 dark:text-slate-400">org</p>
            </div>
            <button
              onClick={() => setJumlahJamaah(j => Math.min(9, j + 1))}
              disabled={jumlahJamaah >= 9}
              className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-gray-500 dark:text-slate-400 font-bold text-lg active:scale-90 transition-all disabled:opacity-30"
            >+</button>
          </div>
        </div>
      </div>

      {/* E. Hasil Simulasi */}
      {pkg && calc && (
        <div className="space-y-4" style={{ animation: 'slideUp 350ms ease-out' }}>
          <style>{`@keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>

          {/* E1. Total Card */}
          <div
            className={`rounded-2xl overflow-hidden border ${isRahmah ? 'border-emerald-500/30 shadow-lg shadow-emerald-500/10' : 'border-blue-500/30 shadow-lg shadow-blue-500/10'}`}
            style={{ background: isRahmah ? 'linear-gradient(135deg, #064e3b, #065f46)' : 'linear-gradient(135deg, #1e3a5f, #1e40af)' }}
          >
            <div className="px-4 pt-4 pb-3">
              <p className="text-[10px] uppercase tracking-[0.15em] text-white/60 font-medium">
                Total Biaya · {pkg.name} {'★'.repeat(pkg.stars)}
              </p>
              <p className="text-3xl font-bold text-white mt-1">{fmtUSD(calc.totalUSD)}</p>
              <p className="text-[12px] text-white/70 mt-0.5">≈ {fmtRp(calc.totalIDR)}</p>
              {jumlahJamaah > 1 && (
                <p className="text-[10px] text-white/50 mt-0.5">{fmtUSD(pkg.priceUSD)} × {jumlahJamaah} jamaah</p>
              )}
            </div>
            <div className="px-4 py-3 bg-black/10">
              <div className="h-2 rounded-lg overflow-hidden flex mb-2">
                <div className="bg-emerald-400" style={{ width: `${(calc.dpUSD / calc.totalUSD) * 100}%` }} />
                <div className="bg-amber-400 flex-1" />
              </div>
              <div className="flex justify-between text-[10px]">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-white/60">DP</span>
                  <span className="text-white/80 font-bold">{fmtUSD(calc.dpUSD)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="text-white/60">Pelunasan</span>
                  <span className="text-white/80 font-bold">{fmtUSD(calc.sisaUSD)}</span>
                  <span className="text-white/60">· {calc.deadlineLabel}</span>
                </div>
              </div>
            </div>
          </div>

          {/* E2. Timeline Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-4">
            <p className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-4">Timeline</p>
            <div className="relative">
              <div className="absolute left-[15px] top-3 bottom-3 w-[2px] bg-gray-100 dark:bg-slate-700" />
              <div className="space-y-3">
                {[
                  { emoji: '📝', label: 'Daftar & Bayar DP', value: fmtUSD(calc.dpUSD), sub: 'Saat pendaftaran', color: 'emerald' as const },
                  { emoji: '⏳', label: 'Masa Tunggu', value: `±${calc.diffMonths} bulan`, sub: 'Persiapan dokumen & manasik', color: 'blue' as const },
                  { emoji: '💰', label: 'Pelunasan', value: fmtUSD(calc.sisaUSD), sub: `Paling lambat ${calc.deadlineLabel}`, color: 'amber' as const },
                  { emoji: '🕋', label: 'Berangkat Haji!', value: `Tahun ${tahunBerangkat}`, sub: 'Insya Allah', color: 'emerald' as const },
                ].map((step, i) => {
                  const colorMap = {
                    emerald: { dot: 'bg-emerald-500 shadow-emerald-500/30', text: 'text-emerald-600 dark:text-emerald-400' },
                    blue: { dot: 'bg-blue-500 shadow-blue-500/30', text: 'text-blue-600 dark:text-blue-400' },
                    amber: { dot: 'bg-amber-500 shadow-amber-500/30', text: 'text-amber-600 dark:text-amber-400' },
                  };
                  const c = colorMap[step.color];
                  return (
                    <div key={i} className="relative flex items-center gap-3">
                      <div className={`relative z-10 w-[30px] h-[30px] rounded-full ${c.dot} shadow-md flex items-center justify-center flex-shrink-0`}>
                        <span className="text-[13px]">{step.emoji}</span>
                      </div>
                      <div className="flex-1 flex items-center justify-between py-1 min-w-0">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-700 dark:text-white">{step.label}</p>
                          <p className="text-[10px] text-gray-500 dark:text-slate-400">{step.sub}</p>
                        </div>
                        <p className={`text-xs font-bold ${c.text} flex-shrink-0 ml-2`}>{step.value}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* E3. Disclaimer */}
          <div className="bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700/50 rounded-xl px-3 py-2.5 flex items-start gap-2">
            <Info size={12} className="text-gray-500 dark:text-slate-400 flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-gray-500 dark:text-slate-400 leading-relaxed">
              Harga dalam USD. Estimasi IDR berdasarkan kurs Bank Mandiri ({kursDate}) dan dapat berubah sewaktu-waktu.
            </p>
          </div>

          {/* E4. CTA Buttons */}
          <div className="space-y-2">
            <button
              onClick={handleOpenPdfModal}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white shadow-md active:scale-95 transition-all duration-200 ${
                isRahmah ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20' : 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/20'
              }`}
            >
              <FileText size={16} /> Lihat & Download PDF
            </button>
            <button
              onClick={handleShare}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold active:scale-95 transition-all duration-200 border ${
                isRahmah
                  ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/40'
                  : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/40'
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Bagikan via WhatsApp
            </button>
          </div>
        </div>
      )}

      {pdfModal}
    </div>
  );
}

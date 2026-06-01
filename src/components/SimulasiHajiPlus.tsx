import { useState, useEffect, useMemo, useRef } from 'react';
import { Info, User, Calendar, Users, Loader2, FileText, X, Share2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import logoWhite from '@/logo-alhijaz-white.png';
import PriceLadder from './PriceLadder';
import { computeHajiPlusEscalation, condenseLadder } from '@/lib/hajiPlusPricing';

// ── Constants ──
type RoomTypeId = 'double' | 'triple' | 'quad';

const ROOM_TYPES = [
  { id: 'double', label: 'Double' },
  { id: 'triple', label: 'Triple' },
  { id: 'quad', label: 'Quad' },
] satisfies Array<{ id: RoomTypeId; label: string }>;

const PACKAGES = [
  {
    id: 'rahmah',
    name: 'RAHMAH',
    stars: 5,
    pricesUSD: { double: 17400, triple: 16400, quad: 15700 },
    hotel: 'Lebih Nyaman dengan Hotel Bintang 5',
  },
  {
    id: 'uhud',
    name: 'UHUD',
    stars: 4,
    pricesUSD: { double: 14000, triple: 13000, quad: 12500 },
    hotel: 'Hotel Bintang 4 dengan Lokasi Strategis',
  },
];
const DP_USD = 4500;
const PELUNASAN_BULAN = 6;
const OFFER_CARD_WIDTH = 400;
const OFFER_CARD_HEIGHT = 646;
const ISLAMIC_PATTERN_BACKGROUND = `url("data:image/svg+xml,${encodeURIComponent(`
<svg width="56" height="56" viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg">
  <g fill="none" stroke="white" stroke-width="0.75" stroke-linecap="round" stroke-linejoin="round" opacity="0.5">
    <path d="M28 6L33 21L50 28L33 35L28 50L23 35L6 28L23 21Z"/>
    <path d="M28 13L31 23L43 28L31 33L28 43L25 33L13 28L25 23Z"/>
    <path d="M0 28C7 18 14 18 21 28S35 38 42 28S49 18 56 28"/>
    <path d="M28 0V56M0 28H56"/>
  </g>
  <g fill="white" opacity="0.16">
    <circle cx="28" cy="28" r="1.7"/>
    <circle cx="0" cy="0" r="1.1"/>
    <circle cx="56" cy="0" r="1.1"/>
    <circle cx="0" cy="56" r="1.1"/>
    <circle cx="56" cy="56" r="1.1"/>
  </g>
</svg>
`)}")`;

// ── Helpers ──
const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const fmtRp = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;

const normalizeAgentSlug = (slug?: string) => String(slug || '').trim().toLowerCase();
const isAgentPhotoFileName = (fileName: string) => /^[a-z0-9-]+\.(jpe?g|png|webp)$/i.test(fileName);

const getSameOriginAgentPhotoPath = (rawPhoto?: string) => {
  const photo = rawPhoto?.trim() || '';
  if (!photo) return '';

  if (photo.startsWith('/agents/')) return photo;
  if (photo.startsWith('agents/')) return `/${photo}`;

  try {
    const url = new URL(photo);
    const marker = '/agent-photos/';
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex < 0) return '';

    const storagePath = decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
    const fileName = storagePath.split('/').pop() || '';
    return isAgentPhotoFileName(fileName) ? `/agents/${fileName}` : '';
  } catch {
    return '';
  }
};

const resolveSelfHostedAgentPhoto = (agent?: { slug?: string; photo?: string }) => {
  const photo = getSameOriginAgentPhotoPath(agent?.photo);
  if (photo) return photo;

  const slug = normalizeAgentSlug(agent?.slug);
  if (slug) return `/agents/${slug}.jpg`;

  return '';
};

const waitForExportImage = async (img: HTMLImageElement) => {
  if (img.complete && img.naturalWidth > 0) return;

  if (typeof img.decode === 'function') {
    try {
      await img.decode();
      return;
    } catch {
      // Fall back to load/error listeners for cross-origin or cached images.
    }
  }

  await new Promise<void>(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      img.removeEventListener('load', finish);
      img.removeEventListener('error', finish);
      resolve();
    };
    const timeout = window.setTimeout(finish, 500);
    img.addEventListener('load', finish, { once: true });
    img.addEventListener('error', finish, { once: true });
  });
};

const prepareOfferCardForCapture = async (el: HTMLElement) => {
  try {
    await document.fonts?.ready;
  } catch {
    // Continue export even if the browser cannot report font readiness.
  }

  const images = Array.from(el.querySelectorAll('img'));
  await Promise.all(images.map(waitForExportImage));
};

interface SimulasiHajiPlusProps {
  agent?: {
    name: string;
    phone: string;
    website: string;
    slug?: string;
    photo?: string;
  };
}

export default function SimulasiHajiPlus({ agent }: SimulasiHajiPlusProps) {
  // ── State ──
  const [selectedPkg, setSelectedPkg] = useState<string | null>(null);
  const [selectedRoomType, setSelectedRoomType] = useState<RoomTypeId>('quad');
  const [tahunBerangkat, setTahunBerangkat] = useState(2036);
  const [jumlahJamaah, setJumlahJamaah] = useState(1);
  const [namaJamaah, setNamaJamaah] = useState('');
  const [kursUSD, setKursUSD] = useState<number | null>(null);
  const [kursDate, setKursDate] = useState('');
  const [kursLoading, setKursLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [sharing, setSharing] = useState(false);
  const [agentPhotoFailed, setAgentPhotoFailed] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

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

  // ── Derived ──
  const pkg = PACKAGES.find(p => p.id === selectedPkg) || null;
  const selectedRoom = ROOM_TYPES.find(r => r.id === selectedRoomType) || ROOM_TYPES[2];
  const selectedPriceUSD = pkg ? pkg.pricesUSD[selectedRoomType] : 0;

  const calc = useMemo(() => {
    if (!pkg || !kursUSD) return null;
    const currentYear = new Date().getFullYear();
    const esc = computeHajiPlusEscalation({
      basePriceUSD: selectedPriceUSD,
      jumlahJamaah,
      tahunBerangkat,
      currentYear,
      kursUSD,
      dpPerJamaahUSD: DP_USD,
    });
    const deadlineDate = new Date(tahunBerangkat, 0, 1);
    deadlineDate.setMonth(deadlineDate.getMonth() - PELUNASAN_BULAN);
    const deadlineLabel = deadlineDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    const diffMonths = Math.max(0, Math.round((new Date(tahunBerangkat, 0, 1).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)));
    return { ...esc, deadlineLabel, diffMonths, currentYear };
  }, [pkg, selectedPriceUSD, tahunBerangkat, jumlahJamaah, kursUSD]);

  const exportLadder = useMemo(() => (calc ? condenseLadder(calc.ladder, 5) : []), [calc]);

  // ── Accent colors ──
  const isRahmah = selectedPkg === 'rahmah';

  // ── Body scroll lock for modal ──
  useEffect(() => {
    if (previewOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [previewOpen]);

  // ── Generate preview (Buat Penawaran) ──
  const handleGeneratePreview = async () => {
    const el = cardRef.current;
    if (!el || exporting) return;
    setExporting(true);
    try {
      if (agentPhotoFailed) {
        setAgentPhotoFailed(false);
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      }
      const { domToPng } = await import('modern-screenshot');
      await prepareOfferCardForCapture(el);
      const dataUrl = await domToPng(el, { scale: 3, quality: 1 });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPreviewBlob(blob);
      setPreviewUrl(url);
      setPreviewOpen(true);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  // ── Close preview modal ──
  const handleClosePreview = () => {
    setPreviewOpen(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setPreviewBlob(null);
  };

  // ── Share from preview modal ──
  const handleSharePreview = async () => {
    if (!previewBlob || sharing) return;
    setSharing(true);
    try {
      const fileName = `Simulasi Haji Plus - ${namaJamaah || 'Alhijaz'}.png`;
      const file = new File([previewBlob], fileName, { type: 'image/png' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        // Fallback: download
        const url = URL.createObjectURL(previewBlob);
        const link = document.createElement('a');
        link.download = fileName;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    } finally {
      setSharing(false);
    }
  };

  // ── Agent display helpers ──
  const agentPhone = agent?.phone
    ? (agent.phone.startsWith('62') ? '0' + agent.phone.slice(2) : agent.phone)
    : '';
  const agentInitials = agent?.name
    ? agent.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()
    : 'AH';
  const agentPhotoSrc = useMemo(() => resolveSelfHostedAgentPhoto(agent), [agent]);

  useEffect(() => {
    setAgentPhotoFailed(false);
  }, [agentPhotoSrc]);

  return (
    <div className="px-4 pt-4 pb-8 space-y-4">

      {/* A. Kurs Info Banner */}
      {kursLoading ? (
        <div className="h-10 rounded-xl bg-gray-100 dark:bg-slate-800 animate-pulse" />
      ) : kursUSD ? (
        <div className="rounded-2xl overflow-hidden relative" style={{ background: 'linear-gradient(135deg, #064e3b, #0d9488)' }}>
          <div className="absolute top-[-20px] right-[-15px] w-[70px] h-[70px] rounded-full bg-white/[0.06]" />
          <div className="absolute bottom-[-10px] left-[-20px] w-[50px] h-[50px] rounded-full bg-white/[0.04]" />
          <div className="relative px-4 py-3 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center flex-shrink-0 border border-white/10">
              <span className="text-white text-lg font-bold">$</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-emerald-200/70 font-semibold uppercase tracking-wide">Kurs USD Hari Ini</p>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-xl font-bold text-white">{fmtRp(kursUSD)}</span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[10px] text-emerald-100/80 font-semibold">Bank Mandiri</p>
              <p className="text-[10px] text-emerald-200/50 mt-0.5">{kursDate}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30 rounded-xl px-3 py-2.5 flex items-center gap-2">
          <Info size={13} className="text-red-600 dark:text-red-400 flex-shrink-0" />
          <p className="text-[11px] text-red-600 dark:text-red-300">Kurs tidak tersedia, coba refresh halaman</p>
        </div>
      )}

      {/* B. Pilih Paket */}
      <div>
        <p className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2 px-1">Pilih Paket</p>
        <div className="grid grid-cols-2 gap-3">
          {PACKAGES.map(p => {
            const selected = selectedPkg === p.id;
            const isR = p.id === 'rahmah';
            const cardRoomType = selectedPkg ? selectedRoomType : 'quad';
            const cardRoom = ROOM_TYPES.find(r => r.id === cardRoomType) || ROOM_TYPES[2];
            const cardPriceUSD = p.pricesUSD[cardRoomType];
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
                  <p className={`text-xl font-bold mt-1 ${selected ? 'text-white' : 'text-gray-800 dark:text-white'}`}>{fmtUSD(cardPriceUSD)}</p>
                  <p className={`text-[9px] mt-0.5 ${selected ? 'text-white/70' : 'text-gray-500 dark:text-slate-400'}`}>per jamaah · {cardRoom.label}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* C. Tipe Kamar */}
      {pkg && (
        <div>
          <p className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2 px-1">Tipe Kamar</p>
          <div className="grid grid-cols-3 gap-2 p-1 bg-gray-100 dark:bg-slate-800 rounded-xl">
            {ROOM_TYPES.map(room => {
              const selected = selectedRoomType === room.id;
              return (
                <button
                  key={room.id}
                  onClick={() => setSelectedRoomType(room.id)}
                  className={`py-2 rounded-lg text-[11px] font-bold transition-all duration-200 active:scale-[0.97] ${
                    selected
                      ? isRahmah
                        ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                        : 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-gray-500 dark:text-slate-400'
                  }`}
                >
                  {room.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
            {Array.from({ length: 6 }, (_, i) => 2036 + i).map(y => (
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
                Estimasi Tahun {tahunBerangkat} · {pkg.name} {selectedRoom.label} {'★'.repeat(pkg.stars)}
              </p>
              <p className="text-3xl font-bold text-white mt-1">{fmtUSD(calc.escalatedTotalUSD)}</p>
              <p className="text-[12px] text-white/70 mt-0.5">≈ {fmtRp(calc.estTotalIDR)}</p>
              <p className="text-[10px] text-white/50 mt-0.5">
                {fmtUSD(calc.escalatedPriceUSD)} × {jumlahJamaah} jamaah · harga dasar {calc.currentYear}: {fmtUSD(calc.baseTotalUSD)}
              </p>
            </div>
            <div className="px-4 py-3 bg-black/10">
              <div className="h-2 rounded-lg overflow-hidden flex mb-2">
                <div className="bg-emerald-400" style={{ width: `${(calc.dpUSD / calc.escalatedTotalUSD) * 100}%` }} />
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

          {/* E2b. Proyeksi Harga */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Proyeksi Harga Paket / jamaah</p>
              <span className={`text-[10px] font-bold ${isRahmah ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400'}`}>naik ~2.5%/th</span>
            </div>
            <PriceLadder ladder={calc.ladder} accent={isRahmah ? 'emerald' : 'blue'} />
            <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-3">
              Estimasi harga asli di {tahunBerangkat}. Est. Rp memakai kurs +1.5%/th.
            </p>
          </div>

          {/* E3. Nama Calon Jamaah */}
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
            <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-1.5">Akan tampil di gambar penawaran</p>
          </div>

          {/* E4. Disclaimer */}
          <div className="bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700/50 rounded-xl px-3 py-2.5 flex items-start gap-2">
            <Info size={12} className="text-gray-500 dark:text-slate-400 flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-gray-500 dark:text-slate-400 leading-relaxed">
              Estimasi. Harga paket diproyeksikan naik ~2.5%/th & kurs ~1.5%/th sampai tahun berangkat; angka final ditetapkan Alhijaz. Kurs Bank Mandiri ({kursDate}).
            </p>
          </div>

          {/* E4. CTA Button */}
          <button
            onClick={handleGeneratePreview}
            disabled={exporting || !namaJamaah.trim()}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white shadow-md active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:active:scale-100 ${
              isRahmah ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20' : 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/20'
            }`}
          >
            {exporting ? (
              <><Loader2 size={16} className="animate-spin" /> Membuat penawaran...</>
            ) : (
              <><FileText size={16} /> Buat Penawaran</>
            )}
          </button>
        </div>
      )}

      {/* ── Offscreen Image Card (for export) ── */}
      {pkg && calc && kursUSD && (
        <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <div
            ref={cardRef}
            style={{
              width: OFFER_CARD_WIDTH,
              height: OFFER_CARD_HEIGHT,
              backgroundColor: '#ffffff',
              fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
              color: '#1f2937',
              lineHeight: 1.18,
              overflow: 'hidden',
              display: 'grid',
              gridTemplateRows: '56px 60px 96px 206px 150px 78px',
            }}
          >
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #450a0a, #7f1d1d, #991b1b)',
              padding: '10px 24px',
              position: 'relative',
              overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', inset: 0, opacity: 0.14,
                backgroundImage: ISLAMIC_PATTERN_BACKGROUND,
                backgroundSize: '56px 56px',
                backgroundPosition: 'center',
              }} />
              <div style={{
                position: 'absolute', top: 0, right: 0, width: 160, height: 160,
                background: 'radial-gradient(circle at 80% 20%, rgba(239,68,68,0.35), transparent 60%)',
              }} />
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <img src={logoWhite} style={{ height: 22, width: 'auto' }} alt="Alhijaz" />
                {agent && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div style={{ textAlign: 'right' as const, maxWidth: 150 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{agent.name}</div>
                      <div style={{ fontSize: 8.4, color: 'rgba(255,255,255,0.76)', marginTop: 1 }}>Konsultan Haji Plus</div>
                    </div>
                    <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
                      {agentPhotoSrc && !agentPhotoFailed ? (
                        <img src={agentPhotoSrc} crossOrigin="anonymous" onError={() => setAgentPhotoFailed(true)} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.25)', display: 'block' }} alt="" />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#ffffff', border: '2px solid rgba(255,255,255,0.18)' }}>
                          {agentInitials}
                        </div>
                      )}
                      <div style={{ position: 'absolute', top: -1, right: -1, width: 13, height: 13, borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #ffffff' }}>
                        <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M2 5.5L4 7.5L8 3" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Title + Nama */}
            <div style={{ padding: '12px 24px 8px', textAlign: 'center' as const }}>
              <div style={{ fontSize: 8.8, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0, color: '#6b7280' }}>Simulasi Biaya Haji Plus</div>
              <div style={{ fontSize: 23, fontWeight: 750, color: '#1f2937', marginTop: 4, lineHeight: '1.05', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{namaJamaah || 'Calon Jamaah'}</div>
            </div>

            {/* Paket Card */}
            <div style={{
              margin: '6px 24px 8px',
              borderRadius: 14,
              padding: '12px 16px',
              background: isRahmah ? 'linear-gradient(135deg, #064e3b, #047857)' : 'linear-gradient(135deg, #1e3a5f, #2563eb)',
              position: 'relative',
              overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: -15, right: -15, width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
              <div style={{ position: 'absolute', bottom: -20, left: -10, width: 45, height: 45, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '100%' }}>
                <div style={{ minWidth: 0, maxWidth: 178 }}>
                  <div style={{ fontSize: 10, color: '#fbbf24' }}>{'★'.repeat(pkg.stars)}</div>
                  <div style={{ fontSize: 17, fontWeight: 750, color: '#ffffff', marginTop: 3, lineHeight: '1.1', whiteSpace: 'nowrap' as const }}>Paket {pkg.name}</div>
                  <div style={{ fontSize: 9.2, color: 'rgba(255,255,255,0.82)', marginTop: 5 }}>Hotel Bintang {pkg.stars}</div>
                </div>
                <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                  <div style={{ display: 'inline-block', fontSize: 8.5, fontWeight: 700, color: '#ffffff', padding: '3px 7px', borderRadius: 999, background: 'rgba(255,255,255,0.18)', marginBottom: 6 }}>Tipe kamar {selectedRoom.label}</div>
                  <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.76)', marginBottom: 2 }}>Estimasi harga {tahunBerangkat} / jamaah</div>
                  <div style={{ fontSize: 24, fontWeight: 750, color: '#ffffff', lineHeight: '1' }}>{fmtUSD(calc.escalatedPriceUSD)}</div>
                  <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>harga dasar {calc.currentYear}: {fmtUSD(calc.basePriceUSD)}</div>
                </div>
              </div>
            </div>

            {/* Rincian Pembayaran — Invoice Card */}
            <div style={{
              margin: '0 24px 10px',
              borderRadius: 12,
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
              display: 'grid',
              gridTemplateRows: '34px 55px 55px 1fr',
            }}>
              <div style={{ padding: '0 16px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center' }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0, color: '#64748b' }}>Rincian Pembayaran</div>
              </div>

              <div style={{ padding: '0 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column' as const, justifyContent: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1f2937' }}>DP Pendaftaran</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1f2937' }}>{fmtUSD(calc.dpUSD)}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 2 }}>
                  <div style={{ fontSize: 9.5, color: '#64748b' }}>Dibayar sekarang (harga hari ini)</div>
                  <div style={{ fontSize: 9.5, color: '#64748b', fontWeight: 600 }}>≈ {fmtRp(calc.dpIDR)}</div>
                </div>
              </div>

              <div style={{ padding: '0 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column' as const, justifyContent: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1f2937' }}>Sisa Pelunasan</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1f2937' }}>{fmtUSD(calc.sisaUSD)}</div>
                </div>
                <div style={{ fontSize: 9, color: '#d97706', marginTop: 2 }}>Maks. {calc.deadlineLabel} · harga {tahunBerangkat}</div>
              </div>

              <div style={{ padding: '0 16px', background: isRahmah ? '#ecfdf5' : '#eff6ff', display: 'flex', flexDirection: 'column' as const, justifyContent: 'center' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', columnGap: 12, alignItems: 'baseline' }}>
                  <div style={{ fontSize: 12.8, fontWeight: 750, color: isRahmah ? '#064e3b' : '#1e3a5f', lineHeight: 1.05, whiteSpace: 'nowrap' as const }}>Total Estimasi {tahunBerangkat}</div>
                  <div style={{ fontSize: 18, fontWeight: 750, color: isRahmah ? '#064e3b' : '#1e3a5f', lineHeight: 1 }}>{fmtUSD(calc.escalatedTotalUSD)}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', columnGap: 12, alignItems: 'baseline', marginTop: 5 }}>
                  <div style={{ fontSize: 9.4, color: '#475569', whiteSpace: 'nowrap' as const }}>{jumlahJamaah > 1 ? `${fmtUSD(calc.escalatedPriceUSD)} × ${jumlahJamaah} jamaah` : `1 jamaah · ${selectedRoom.label}`}</div>
                  <div style={{ fontSize: 10.8, fontWeight: 750, color: '#334155', whiteSpace: 'nowrap' as const }}>≈ {fmtRp(calc.estTotalIDR)}</div>
                </div>
              </div>
            </div>

            {/* Proyeksi Harga Paket */}
            <div style={{ margin: '0 24px 10px', padding: '8px 14px', borderRadius: 11, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <div style={{ fontSize: 9, fontWeight: 750, color: '#64748b' }}>Proyeksi Harga Paket / jamaah</div>
                <div style={{ fontSize: 8.5, fontWeight: 700, color: '#059669' }}>naik ~2.5%/th</div>
              </div>
              {exportLadder.map((e, i) => {
                const width = 45 + (exportLadder.length > 1 ? (i / (exportLadder.length - 1)) * 55 : 55);
                const accent = isRahmah ? '#064e3b' : '#1e3a5f';
                return (
                  <div key={e.year} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 9.5, width: 26, color: e.isDeparture ? accent : '#64748b', fontWeight: e.isDeparture ? 800 : 400 }}>{e.year}</span>
                    <div style={{ flex: 1, height: 8, borderRadius: 4, background: '#e5e7eb', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${width}%`, borderRadius: 4, background: e.isDeparture ? (isRahmah ? '#059669' : '#2563eb') : '#cbd5e1' }} />
                    </div>
                    <span style={{ fontSize: 9.5, fontWeight: e.isDeparture ? 850 : 600, color: e.isDeparture ? accent : '#334155', minWidth: 52, textAlign: 'right' as const }}>{fmtUSD(e.priceUSD)}</span>
                  </div>
                );
              })}
              <div style={{ fontSize: 8.1, color: '#64748b', marginTop: 6, borderTop: '1px dashed #cbd5e1', paddingTop: 5, whiteSpace: 'nowrap' as const }}>
                Estimasi total {tahunBerangkat} ≈ {fmtRp(calc.estTotalIDR)} · kurs +1.5%/th (kini {fmtRp(kursUSD)}/USD).
              </div>
            </div>

            {/* Footer */}
            <div style={{
              background: 'linear-gradient(135deg, #450a0a, #7f1d1d, #991b1b)',
              padding: '0 24px',
              textAlign: 'center' as const,
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <div style={{
                position: 'absolute', inset: 0, opacity: 0.11,
                backgroundImage: ISLAMIC_PATTERN_BACKGROUND,
                backgroundSize: '56px 56px',
                backgroundPosition: 'center',
              }} />
              <div style={{
                position: 'absolute', bottom: 0, left: 0, width: 120, height: 120,
                background: 'radial-gradient(circle at 20% 80%, rgba(239,68,68,0.3), transparent 60%)',
              }} />
              <div style={{ position: 'relative', width: '100%' }}>
                {agent ? (
                  <>
                    <div style={{ fontSize: 8.8, fontWeight: 700, color: 'rgba(255,255,255,0.68)' }}>Amankan Porsi Haji Plus Sekarang</div>
                    <div style={{ fontSize: 15, fontWeight: 750, color: '#ffffff', marginTop: 3, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>Hubungi {agent.name}</div>
                    <div style={{ fontSize: 9.8, color: 'rgba(255,255,255,0.78)', marginTop: 4, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {agentPhone}{agent.website ? ` · ${agent.website}` : ''}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 8.8, fontWeight: 700, color: 'rgba(255,255,255,0.68)' }}>Amankan Porsi Haji Plus Sekarang</div>
                    <div style={{ fontSize: 9.8, color: 'rgba(255,255,255,0.78)', marginTop: 4 }}>alhijazindowisata.com</div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Preview Modal (portal, like BrochureModal) ── */}
      {createPortal(
        <AnimatePresence onExitComplete={() => { setPreviewUrl(null); setPreviewBlob(null); }}>
          {previewOpen && (
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
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">Preview Penawaran</h2>
                  <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">Simulasi Haji Plus · {pkg?.name} {selectedRoom.label}</span>
                </div>
                <button onClick={handleClosePreview} className="p-2 bg-gray-100 dark:bg-slate-800 rounded-full text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors shrink-0">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-auto bg-gray-100 dark:bg-slate-950 p-4">
                <div className="flex justify-center">
                  <div className="relative bg-white dark:bg-slate-800 p-2 rounded-xl shadow-lg max-w-md w-full">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Preview Simulasi Haji Plus"
                        className="w-full h-auto rounded-lg"
                      />
                    ) : (
                      <div className="py-20 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex-none sticky bottom-0 bg-white dark:bg-slate-900 border-t border-gray-200/60 dark:border-slate-700/60 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                <button
                  onClick={handleSharePreview}
                  disabled={sharing}
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 transition-all duration-200 active:scale-[0.98] disabled:opacity-70"
                >
                  {sharing ? (
                    <><Loader2 size={20} className="animate-spin" /><span>Memproses...</span></>
                  ) : (
                    <><Share2 size={20} /><span>Bagikan Penawaran</span></>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

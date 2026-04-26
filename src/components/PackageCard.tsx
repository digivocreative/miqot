'use client';

import { useState, useRef, useEffect, useMemo, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { PlaneTakeoff, PlaneLanding, Building2, Camera, Loader2, X, Share2, Sun, CloudSun, Thermometer, Sparkles, ClipboardCheck, Copy, RefreshCw, FileText, Maximize2, Download, Link as LinkIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { UmrohPackage, RoomPricing, HotelInfo } from '@/types';
import { BrochureModal } from './BrochureModal';

// Lazy-load heavy components (react-pdf ~500kB loaded on-demand)
const ItineraryModal = lazy(() => import('./ItineraryModal').then(m => ({ default: m.ItineraryModal })));
const AskAIModal = lazy(() => import('./AskAIModal'));
import type { AgentData } from '@/data/agents';
import { AGENTS_DATA } from '@/data/agents';
import AgentProfile from './AgentProfile';
import { SplitLayout, SpotlightLayout, TicketLayout, TiledLayout, MagazineLayout } from './CardVariants';
import logoAlhijaz from '@/logo-alhijaz.webp';
import { getDistance } from '@/data/hotelService';
import { getTemperature } from '@/data/temperatureData';
import { sendCapiEvent } from '@/lib/capi';
import { trackEvent, trackPublicEvent } from '@/utils/analytics';

// Cache for base64-encoded Inter font CSS (populated on first screenshot)
let cachedInterFontCSS: string | null = null;

interface PackageCardProps {
  package: UmrohPackage;
  /** Control expansion from parent */
  isExpanded?: boolean;
  /** Callback to toggle expansion */
  onToggle?: () => void;
  /** Callback when expand state changes (for backward compatibility or extra monitoring) */
  onExpandChange?: (expanded: boolean) => void;
  /** Agent data from URL slug (passed from parent to avoid per-card detection) */
  agent?: AgentData | null;
  /** Single package detail view (hides Caption & Hitung, uses 4-col grid) */
  isSingleView?: boolean;
  /** Callback to add/remove this package from comparison */
  onCompare?: (jadwalId: string) => void;
  /** Whether this package is currently selected for comparison */
  isComparing?: boolean;
}

const LANDING_AIRPORT_MAP: Record<string, string> = {
  JED: 'Jeddah',
  MED: 'Madinah',
  CKG: 'Jakarta',
  CGK: 'Jakarta', // Common typo handling
  SUB: 'Surabaya',
  KNO: 'Kualanamu',
  CAI: 'Cairo',
  IST: 'Istanbul',
  DXB: 'Dubai',
};

const getLandingAirportCode = (pkg: UmrohPackage): string => {
  const route = pkg.keberangkatan?.rute || '';
  const routeParts = route.split(' - ');
  const code = routeParts.length > 1 ? routeParts[1].trim().toUpperCase() : 'JED';
  return code || 'JED';
};

const getLandingCityName = (pkg: UmrohPackage): string => {
  const airportCode = getLandingAirportCode(pkg);
  return LANDING_AIRPORT_MAP[airportCode] || airportCode;
};

// Gradient presets for screenshot background
const GRADIENT_PRESETS: { name: string; css: string }[] = [
  {
    name: 'Sunset',
    css: 'linear-gradient(180deg, rgba(255,255,255,1) 12%, rgba(245,131,0,1) 40%, rgba(255,10,10,1) 71%, rgba(176,0,0,1) 100%)',
  },
  {
    name: 'Ocean',
    css: 'linear-gradient(180deg, rgba(255,255,255,1) 12%, rgba(56,189,248,1) 40%, rgba(14,116,195,1) 71%, rgba(7,61,122,1) 100%)',
  },
  {
    name: 'Emerald',
    css: 'linear-gradient(180deg, rgba(255,255,255,1) 12%, rgba(52,211,153,1) 40%, rgba(16,150,100,1) 71%, rgba(6,78,59,1) 100%)',
  },
  {
    name: 'Royal',
    css: 'linear-gradient(180deg, rgba(255,255,255,1) 12%, rgba(168,85,247,1) 40%, rgba(109,40,217,1) 71%, rgba(59,7,100,1) 100%)',
  },
  {
    name: 'Rose',
    css: 'linear-gradient(180deg, rgba(255,255,255,1) 12%, rgba(253,164,175,1) 40%, rgba(244,63,94,1) 71%, rgba(159,18,57,1) 100%)',
  },
  {
    name: 'Gold',
    css: 'linear-gradient(180deg, rgba(255,255,255,1) 12%, rgba(250,204,21,1) 40%, rgba(202,138,4,1) 71%, rgba(113,63,18,1) 100%)',
  },
];

function getCountryFlags(hotelInfo: HotelInfo | undefined): string[] {
  if (!hotelInfo) return ['/flags/saudi.png'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const h = hotelInfo as any;
  const flags: string[] = [];
  if (h.cairo_hotel) flags.push('/flags/mesir.png');
  if (h.istanbul_hotel || h.bursa_hotel || h.cappadocia_hotel || h.ankara_hotel) flags.push('/flags/turki.png');
  if (h.dubai_hotel) flags.push('/flags/uae.png');
  if (h.haikou_hotel) flags.push('/flags/china.png');
  if (flags.length === 0) flags.push('/flags/saudi.png');
  return flags;
}

/**
 * PackageCard Component - Expandable Card
 * Displays Umroh package information with expand/collapse functionality
 */
export function PackageCard({ 
  package: pkg, 
  isExpanded = false,
  onToggle,
  onExpandChange,
  agent: currentAgent = null,
  isSingleView = false,
  onCompare,
  isComparing = false,
}: PackageCardProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [isBrochureOpen, setIsBrochureOpen] = useState(false);
  const [isItineraryOpen, setIsItineraryOpen] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [selectedGradient, setSelectedGradient] = useState(0);
  const gradientRef = useRef(0);
  const [isAiCopyOpen, setIsAiCopyOpen] = useState(false);
  const [aiCopied, setAiCopied] = useState(false);
  const [aiCopyText, setAiCopyText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [askAIOpen, setAskAIOpen] = useState(false);
  const [brosurError, setBrosurError] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const brosurSectionRef = useRef<HTMLDivElement>(null);

  // CAPI: fire viewContent event on content interactions
  const agentSlug = useMemo(() => {
    if (!currentAgent) return '';
    return Object.entries(AGENTS_DATA).find(([, v]) => v === currentAgent)?.[0] || '';
  }, [currentAgent]);
  const fireViewContent = () => { if (agentSlug) sendCapiEvent(agentSlug, 'viewContent'); };

  // AI Copywriting generator with rate limiting (15 per 2 hours per device)
  const AI_RATE_KEY = 'ai_copy_timestamps';
  const AI_RATE_LIMIT = 15;
  const AI_RATE_WINDOW = 2 * 60 * 60 * 1000; // 2 hours in ms

  const generateAiCopy = async () => {
    // Rate limiting check (skip on localhost)
    const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const now = Date.now();
    let timestamps: number[] = [];
    try {
      timestamps = JSON.parse(localStorage.getItem(AI_RATE_KEY) || '[]');
    } catch { timestamps = []; }

    // Keep only timestamps within the 2-hour window
    timestamps = timestamps.filter((t) => now - t < AI_RATE_WINDOW);

    if (!isLocal && timestamps.length >= AI_RATE_LIMIT) {
      const oldestInWindow = Math.min(...timestamps);
      const resetTime = new Date(oldestInWindow + AI_RATE_WINDOW);
      const minutesLeft = Math.ceil((resetTime.getTime() - now) / 60000);
      setAiError(`Limit generate copywriting telah tercapai. Coba lagi dalam ${minutesLeft} menit.`);
      return;
    }

    setAiLoading(true);
    setAiError(null);

    // Local fallback template generator (uses cheapestTier for consistent data)
    const generateFallbackText = () => {
      const hotelData = pkg.hotel?.[cheapestTier] as any;
      const tierPricing = pkg.harga?.[cheapestTier] as any;
      const depDate = new Date(pkg.keberangkatan?.tgl).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

      const prices: string[] = [];
      if (tierPricing?.Quard) prices.push(`Quad: Rp ${Number(tierPricing.Quard).toLocaleString('id-ID')}`);
      if (tierPricing?.Triple) prices.push(`Triple: Rp ${Number(tierPricing.Triple).toLocaleString('id-ID')}`);
      if (tierPricing?.Double) prices.push(`Double: Rp ${Number(tierPricing.Double).toLocaleString('id-ID')}`);

      let text = `Assalamu'alaikum 🙏\n\nTelah dibuka pendaftaran *${pkg.nama}* bersama Alhijaz Indowisata.\n\n🗓 Berangkat: ${depDate}\n✈️ Maskapai: ${pkg.maskapai || '-'}`;
      if (hotelData?.mekkah_hotel) text += `\n🏨 Hotel Mekkah: ${hotelData.mekkah_hotel}`;
      if (hotelData?.madinah_hotel) text += `\n🏨 Hotel Madinah: ${hotelData.madinah_hotel}`;
      if (prices.length > 0) text += `\n💰 Harga: ${prices.join(' | ')}`;
      text += `\n\n*Sisa ${pkg.seatSisa} seat dari ${pkg.seatTotal}!* Segera amankan kursi Anda.`;
      if (currentAgent?.name) text += `\n\nInfo & pendaftaran:\n${currentAgent.name}`;
      if (currentAgent?.website) text += ` - ${currentAgent.website}`;
      text += `\n\nSemoga Allah memudahkan langkah kita menuju Baitullah. Aamiin 🤲`;
      return text;
    };

    try {
      // Use cheapestTier for consistent hotel/pricing data
      const hotelData = pkg.hotel?.[cheapestTier] as any;
      const tierPricing = pkg.harga?.[cheapestTier] as any;

      // Add timeout to prevent hanging fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = await fetch('/api/ai-copy', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageData: {
            nama: pkg.nama,
            maskapai: pkg.maskapai,
            keberangkatan: {
              tgl: pkg.keberangkatan?.tgl,
              kodePenerbangan: pkg.keberangkatan?.kodePenerbangan,
              rute: pkg.keberangkatan?.rute,
            },
            kepulangan: { tgl: pkg.kepulangan?.tgl },
            seatSisa: pkg.seatSisa,
            seatTotal: pkg.seatTotal,
            hotel: {
              mekkah_hotel: hotelData?.mekkah_hotel,
              mekkah_bintang: hotelData?.mekkah_bintang,
              madinah_hotel: hotelData?.madinah_hotel,
              madinah_bintang: hotelData?.madinah_bintang,
            },
            harga: tierPricing ? {
              Quard: tierPricing.Quard,
              Triple: tierPricing.Triple,
              Double: tierPricing.Double,
            } : null,
          },
          agentName: currentAgent?.name || '',
          agentWebsite: currentAgent?.website || '',
        }),
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.details || errData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setAiCopyText(data.text || 'Gagal generate teks.');

      // Record successful generation only
      timestamps.push(now);
      localStorage.setItem(AI_RATE_KEY, JSON.stringify(timestamps));
    } catch (err: any) {
      console.error('AI Copy error:', err);
      const isTimeout = err.name === 'AbortError';
      // Show error + provide fallback text (clearly labeled) — don't count toward rate limit
      setAiError(isTimeout ? 'Koneksi timeout. Silakan coba lagi.' : 'Gagal generate dari AI. Silakan coba lagi atau gunakan template di bawah.');
      setAiCopyText(generateFallbackText());
    } finally {
      setAiLoading(false);
    }
  };

  // Calculate availability percentage
  const availabilityPercentage = Math.round((pkg.seatSisa / pkg.seatTotal) * 100);
  const isLowStock = availabilityPercentage <= 25;
  const isCritical = availabilityPercentage <= 10;

  // Format date for display
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: '2-digit',
    });
  };

  // ============================================
  // Derived State
  // ============================================

  /**
   * Helper to find the cheapest tier and its minimum price
   */
  const { cheapestTier, absoluteMinPrice } = useMemo(() => {
    let minPrice = Infinity;
    let minTier = Object.keys(pkg.harga)[0];

    for (const [tier, tierPricing] of Object.entries(pkg.harga)) {
      const prices = [
        tierPricing.Quard, 
        tierPricing.Triple, 
        tierPricing.Double
      ];
      
      for (const priceStr of prices) {
        if (priceStr) {
          const val = parseInt(priceStr, 10);
          if (val > 0 && val < minPrice) {
            minPrice = val;
            minTier = tier;
          }
        }
      }
    }

    return { 
      cheapestTier: minTier, 
      absoluteMinPrice: minPrice === Infinity ? null : minPrice 
    };
  }, [pkg.harga]);

  // Use the pricing and hotel info from the cheapest tier
  const pricing = pkg.harga[cheapestTier] as RoomPricing;
  const hotelInfo = pkg.hotel[cheapestTier];

  /**
   * Extract extra hotels (Turkey, Cairo, etc.)
   */
  const extraHotels = useMemo(() => {
    if (!hotelInfo) return [];

    const extras: Array<{ city: string; name: string; star: string }> = [];
    
    // Mapping keys to readable city labels
    const potentialCities = [
      { key: 'istanbul', label: 'Istanbul' },
      { key: 'bursa', label: 'Bursa' },
      { key: 'ankara', label: 'Ankara' },
      { key: 'cappadocia', label: 'Cappadocia' },
      { key: 'cairo', label: 'Cairo' },
      { key: 'alexandria', label: 'Alexandria' },
      { key: 'dubai', label: 'Dubai' },
      { key: 'aqsha', label: 'Aqsha' },
      { key: 'amman', label: 'Amman' },
      { key: 'petra', label: 'Petra' },
    ];

    potentialCities.forEach(city => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const info = hotelInfo as any;
      const hotelName = info[`${city.key}_hotel`];
      const hotelStar = info[`${city.key}_bintang`] || '0';

      if (hotelName) {
        extras.push({
          city: city.label,
          name: hotelName,
          star: hotelStar
        });
      }
    });

    return extras;
  }, [hotelInfo]);



  /**
   * Format price to "X.Y Jt" for header
   */
  const formatHeaderPrice = (price: number | null): string => {
    if (!price) return '-';
    const millions = price / 1000000;
    return parseFloat(millions.toFixed(1)).toString();
  };

  // Format price for display in table
  const formatRupiah = (price: string | undefined): string => {
    if (!price) return '-';
    const num = parseInt(price, 10);
    return new Intl.NumberFormat('id-ID').format(num);
  };

  // Update content height for animation
  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [isExpanded, pkg]);

  // Handle card click
  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('a')) {
      return;
    }
    if (onToggle) {
      onToggle();
    }
    onExpandChange?.(!isExpanded);
  };

  // Helper to generate share message
  const getShareMessage = () => {
    // Format date with day name
    const formatFullDate = (dateStr: string): string => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    };

    // Build hotel list string
    const buildHotelList = (): string => {
      const hotels: string[] = [];
      
      // Madinah
      if (hotelInfo?.madinah_hotel) {
        const stars = parseInt(hotelInfo.madinah_bintang || '0');
        hotels.push(`\`\`\`HOTEL MADINAH\`\`\`\n*${hotelInfo.madinah_hotel}* [ *${'★'.repeat(stars)}* ]`);
      }
      
      // Mekkah
      if (hotelInfo?.mekkah_hotel) {
        const stars = parseInt(hotelInfo.mekkah_bintang || '0');
        hotels.push(`\`\`\`HOTEL MEKKAH\`\`\`\n*${hotelInfo.mekkah_hotel}* [ *${'★'.repeat(stars)}* ]`);
      }
      
      // Extra hotels (Turkey, Cairo, etc.)
      extraHotels.forEach(hotel => {
        const stars = parseInt(hotel.star || '0');
        hotels.push(`\`\`\`HOTEL ${hotel.city.toUpperCase()}\`\`\`\n*${hotel.name}* [ *${'★'.repeat(stars)}* ]`);
      });
      
      return hotels.join('\n\n');
    };

    // Build pricing string
    const buildPricing = (): string => {
      const lines: string[] = [];
      if (pricing?.Double) lines.push(`\`\`\`Double\`\`\`   →   \`\`\`Rp ${formatRupiah(pricing.Double)}\`\`\``);
      if (pricing?.Triple) lines.push(`\`\`\`Triple\`\`\`   →   \`\`\`Rp ${formatRupiah(pricing.Triple)}\`\`\``);
      if (pricing?.Quard) lines.push(`\`\`\`Quad\`\`\`     →   \`\`\`Rp ${formatRupiah(pricing.Quard)}\`\`\``);
      if (pricing?.Infant) lines.push(`\`\`\`Infant\`\`\`   →   \`\`\`Rp ${formatRupiah(pricing.Infant)}\`\`\``);
      return lines.join('\n');
    };

    return `*ALHIJAZ INDOWISATA*
_________________________
*${pkg.maskapai || '-'}*, *${pkg.nama}*

\`\`\`BERANGKAT\`\`\`
*${formatFullDate(pkg.keberangkatan?.tgl || '')}*, *${pkg.keberangkatan?.jam || '-'}*
*${pkg.keberangkatan?.kodePenerbangan || '-'}* — *${pkg.keberangkatan?.rute || '-'}*

\`\`\`PULANG\`\`\`
*${formatFullDate(pkg.kepulangan?.tgl || '')}*, *${pkg.kepulangan?.jam || '-'}*
*${pkg.kepulangan?.kodePenerbangan || '-'}* — *${pkg.kepulangan?.rute || '-'}*

\`\`\`MANASIK\`\`\`
*${pkg.manasikTanggal ? formatFullDate(pkg.manasikTanggal) : '-'}*

*[ DETAIL HOTEL ]*
_________________________
${buildHotelList()}

\`\`\`BIAYA PAKET\`\`\`
${buildPricing()}
_________________________
*GRATIS Biaya Perlengkapan, Handling & Asuransi*`;
  };

  // Handle WhatsApp Share with formatted message
  const handleWhatsAppShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const message = getShareMessage();
    const encodedMessage = encodeURIComponent(message);
    fireViewContent();
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
  };

  // Handle Screenshot & Share (Smart Styling Strategy)
  const brosurImageUrl = pkg.brosurUrl
    ? (pkg.brosurUrl.includes('.b-cdn.net') || pkg.brosurUrl.includes('bunnycdn'))
      ? pkg.brosurUrl
      : pkg.brosurUrl.replace(/^https?:\/\/(?:jadwal\.(?:miqot\.com|alhijaz\.co)|115\.124\.86\.220)/i, '')
    : '';

  const handleDownloadBrosur = async () => {
    try {
      const response = await fetch(brosurImageUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `Brosur - ${pkg.nama || 'Paket'}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Download brosur error:', err);
    }
  };

  const handleShareBrosur = async () => {
    try {
      const response = await fetch(brosurImageUrl);
      const blob = await response.blob();
      const file = new File([blob], `Brosur - ${pkg.nama || 'Paket'}.jpg`, { type: 'image/jpeg' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        handleDownloadBrosur();
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Share brosur error:', err);
      }
    }
  };

  const handleScreenshot = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!cardRef.current) return;
    setIsCapturing(true);
    fireViewContent();

    // Wait for React to re-render with default layout (isCapturing forces cardVariant = 'default')
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    try {
      // 1. CLONE & GHOST STRATEGY
      const original = cardRef.current;
      const clone = original.cloneNode(true) as HTMLElement;

      // Setup Ghost Element (Invisible but Rendered)
      Object.assign(clone.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '560px', // Lebar Fix ideal
        zIndex: '-9999',
        opacity: '1', // Wajib 1
        pointerEvents: 'none',
        backgroundColor: '#ffffff', // Force White Background
        margin: '0',
        transform: 'none' // Reset transformasi jika ada
      });
      
      // Hapus class dark mode dari clone langsung
      clone.classList.remove('dark');
      
      // Penanda khusus untuk safe selector
      clone.setAttribute('data-cloned', 'true');
      
      document.body.appendChild(clone);

      // 2. SANITASI GAMBAR (Promise.allSettled)
      const images = Array.from(clone.querySelectorAll('img'));
      
      const imagePromises = images.map(async (img) => {
        // Simpan dimensi asli agar layout tidak loncat
        const w = img.offsetWidth;
        const h = img.offsetHeight;
        if (w > 0) img.style.width = `${w}px`;
        if (h > 0) img.style.height = `${h}px`;

        const src = img.src;
        if (!src || src.startsWith('data:')) return;

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          
          const response = await fetch(src, { 
              signal: controller.signal, 
              mode: 'cors',
              cache: 'no-cache'
          });
          clearTimeout(timeoutId);
          
          if (!response.ok) throw new Error(`Status ${response.status}`);
          
          const blob = await response.blob();
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          
          img.src = base64;
          img.srcset = '';
          
        } catch (err) {
          console.warn("Gagal sanitize gambar (skip):", src);
          img.style.display = 'none'; 
        }
      });

      await Promise.allSettled(imagePromises);

      // 3. DOM MANIPULATION (langsung di ghost clone, sebelum render)

      // A. FORCE LIGHT MODE — strip ALL dark: Tailwind classes from every element
      clone.classList.remove('dark');
      const allElements = clone.querySelectorAll('*');
      allElements.forEach(el => {
        const classesToRemove = Array.from(el.classList).filter(c => c.startsWith('dark:'));
        if (classesToRemove.length > 0) {
          el.classList.remove(...classesToRemove);
        }
      });

      // B. HIDE SEAT SECTION (Metode Berlapis)
      const seatByClass = clone.querySelector('.seat-info-section');
      if (seatByClass) seatByClass.remove();

      // Cara 2: Text Search Fallback
      const allDivs = clone.querySelectorAll('div');
      allDivs.forEach(div => {
        if (div.getAttribute('data-cloned') === 'true') return;
        if (div.contains(clone)) return;
        const text = (div as HTMLElement).innerText || "";
        if (text.includes("SISA") && text.includes("DARI") && text.includes("%")) {
          (div as HTMLElement).style.display = 'none';
        }
      });

      // Remove elements marked for screenshot exclusion (juga dihandle oleh filter di bawah)
      clone.querySelectorAll('[data-screenshot-ignore]').forEach(el => el.remove());

      // C. SNAPSHOT STYLE INJECTION
      // Inject a <style> tag into the clone with snapshot-specific CSS overrides
      // This fixes overlapping text, spacing, and alignment WITHOUT touching the live UI

      // Font CSS: fetch Inter woff2 and embed as base64 data URI for consistent cross-device rendering
      if (!cachedInterFontCSS) {
        const fontUrls = [
          { weight: 400, url: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiA.woff2' },
          { weight: 600, url: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYAZ9hiA.woff2' },
          { weight: 700, url: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYAZ9hiA.woff2' },
        ];
        const fontFaces = await Promise.all(
          fontUrls.map(async ({ weight, url }) => {
            try {
              const resp = await fetch(url);
              const blob = await resp.blob();
              const dataUri = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
              return `@font-face { font-family: 'Inter'; font-style: normal; font-weight: ${weight}; src: url(${dataUri}) format('woff2'); }`;
            } catch {
              return '';
            }
          })
        );
        cachedInterFontCSS = fontFaces.filter(Boolean).join('\n');
      }
      const interFontCSS = cachedInterFontCSS;

      const snapshotStyle = document.createElement('style');
      snapshotStyle.textContent = `
        /* === GLOBAL SNAPSHOT OVERRIDES === */
        ${interFontCSS}
        [data-cloned="true"],
        [data-cloned="true"] * {
          font-family: 'Inter', Arial, Helvetica, sans-serif !important;
        }

        /* Slightly reduce font-size to prevent edge-case wrapping */
        [data-cloned="true"] p,
        [data-cloned="true"] span {
          font-size-adjust: inherit;
        }

        /* === FIX 1: TEXT OVERLAPPING === */
        /* Flight info: times, codes, routes — harus satu baris */
        /* Exclude star (text-amber-400) and distance (text-emerald-600) spans */
        [data-cloned="true"] .grid-cols-2 p,
        [data-cloned="true"] .grid-cols-2 span:not(.text-amber-400):not(.text-emerald-600) {
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          display: block !important;
          line-height: 1.4 !important;
        }

        /* Star + distance row: keep inline flex layout */
        [data-cloned="true"] .grid-cols-2 .text-amber-400,
        [data-cloned="true"] .grid-cols-2 .text-emerald-600 {
          display: inline !important;
          overflow: visible !important;
          white-space: nowrap !important;
        }

        /* Flight info container — jangan sampai flex items overlap */
        /* Exclude the star+distance flex container from overflow hidden */
        [data-cloned="true"] .grid-cols-2 > div {
          min-width: 0 !important;
          overflow: hidden !important;
        }
        [data-cloned="true"] .grid-cols-2 [data-stars-row] {
          overflow: visible !important;
          display: flex !important;
          flex-wrap: nowrap !important;
        }

        /* Flight info icons — tetap fix size */
        [data-cloned="true"] .grid-cols-2 .w-5 {
          flex-shrink: 0 !important;
          width: 20px !important;
          height: 20px !important;
        }

        /* Harga header — rata kanan tegas */
        [data-cloned="true"] .text-right {
          text-align: right !important;
          white-space: nowrap !important;
          flex-shrink: 0 !important;
        }

        /* Harga utama — nowrap agar "Rp X.X Jt" tidak pecah */
        [data-cloned="true"] .text-right p {
          white-space: nowrap !important;
          line-height: 1.3 !important;
        }

        /* Package title — biarkan wrap (line-clamp-2) */
        [data-cloned="true"] h3 {
          white-space: normal !important;
          overflow: visible !important;
          -webkit-line-clamp: unset !important;
          line-height: 1.35 !important;
        }

        /* === FIX 2: SPACING === */
        /* Grid containers — tambah gap */
        [data-cloned="true"] .grid {
          gap: 14px !important;
        }

        /* Section margins — beri napas */
        [data-cloned="true"] .mb-3 { margin-bottom: 14px !important; }
        [data-cloned="true"] .mb-2 { margin-bottom: 12px !important; }
        [data-cloned="true"] .mb-4 { margin-bottom: 18px !important; }
        [data-cloned="true"] .gap-3 { gap: 14px !important; }
        [data-cloned="true"] .gap-2 { gap: 10px !important; }

        /* === FIX 3: ALIGNMENT === */
        /* Flex row: title + price — aligned properly */
        [data-cloned="true"] .flex.justify-between {
          display: flex !important;
          align-items: flex-start !important;
        }

        /* Price column — shrink-proof */
        [data-cloned="true"] .flex.justify-between > .text-right {
          flex-shrink: 0 !important;
          min-width: 90px !important;
        }

        /* Hotel names - truncate if too long */
        [data-cloned="true"] .line-clamp-1 {
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          -webkit-line-clamp: unset !important;
          display: block !important;
        }

        /* Agent profile section — keep inline */
        [data-cloned="true"] h4,
        [data-cloned="true"] .truncate {
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }

        /* Pricing table inside expanded card */
        [data-cloned="true"] table td,
        [data-cloned="true"] table th {
          white-space: nowrap !important;
          padding: 6px 10px !important;
        }
        [data-cloned="true"] table .text-right {
          text-align: right !important;
        }
      `;
      clone.appendChild(snapshotStyle);

      // Targeted inline fixes for text color (force light mode colors)
      const textTags = clone.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, li, td, th');
      textTags.forEach((el) => {
        const element = el as HTMLElement;
        // Only fix color, do NOT touch white-space/overflow here (handled by <style>)
        element.style.setProperty('color', '#1f2937', 'important');
      });

      // Fix: ensure all flex containers maintain their flex direction
      const flexContainers = clone.querySelectorAll('.flex');
      flexContainers.forEach((el) => {
        const element = el as HTMLElement;
        const computed = window.getComputedStyle(element);
        // Preserve computed flex properties as inline styles for the screenshot
        element.style.display = 'flex';
        element.style.flexDirection = computed.flexDirection;
        element.style.alignItems = computed.alignItems;
        element.style.justifyContent = computed.justifyContent;
        if (computed.gap && computed.gap !== 'normal') {
          element.style.gap = computed.gap;
        }
      });

      // Fix: ensure grid containers maintain their layout
      const gridContainers = clone.querySelectorAll('.grid');
      gridContainers.forEach((el) => {
        const element = el as HTMLElement;
        const computed = window.getComputedStyle(element);
        element.style.display = 'grid';
        element.style.gridTemplateColumns = computed.gridTemplateColumns;
      });

      // D. STYLE PROMO BADGE (Pink background, rounded)
      const allSpans = clone.querySelectorAll('span');
      allSpans.forEach(span => {
        const el = span as HTMLElement;
        const text = el.textContent?.trim().toUpperCase() || '';
        if (text === 'PROMO') {
          el.classList.remove('bg-red-100', 'text-red-600', 'px-2', 'py-0.5', 'rounded', 'inline-block', 'mt-1');
          el.style.setProperty('background-color', '#FEE2E2', 'important');
          el.style.setProperty('color', '#DC2626', 'important');
          el.style.setProperty('padding', '2px 10px', 'important');
          el.style.setProperty('border-radius', '8px', 'important');
          el.style.setProperty('font-weight', '700', 'important');
          el.style.setProperty('font-size', '11px', 'important');
          el.style.setProperty('display', 'inline-block', 'important');
          el.style.setProperty('margin-top', '4px', 'important');
          el.style.setProperty('border', 'none', 'important');
          el.style.setProperty('box-shadow', 'none', 'important');
        }
      });

      // D1b. STYLE "MULAI" + PRICE BADGE (screenshot-only enhancement)
      const allPs = clone.querySelectorAll('p');
      allPs.forEach(p => {
        const el = p as HTMLElement;
        const text = el.textContent?.trim();
        if (text === 'MULAI') {
          // Make "MULAI" white + slightly bigger
          el.style.setProperty('font-size', '13px', 'important');
          el.style.setProperty('font-weight', '600', 'important');
          el.style.setProperty('letter-spacing', '0.05em', 'important');
          el.style.setProperty('color', '#ffffff', 'important');
          el.style.setProperty('text-shadow', '0 1px 3px rgba(0,0,0,0.3)', 'important');

          // Style the parent container with Alhijaz red gradient
          const wrapper = el.parentElement;
          if (wrapper) {
            wrapper.style.setProperty('background', 'linear-gradient(135deg, #C0392B, #96281B)', 'important');
            wrapper.style.setProperty('padding', '6px 8px', 'important');
            wrapper.style.setProperty('border-radius', '10px', 'important');
            wrapper.style.setProperty('box-shadow', 'none', 'important');

            // Bump price font size + make white + shadow
            const priceEl = wrapper.querySelector('p:last-child') as HTMLElement;
            if (priceEl && priceEl !== el) {
              priceEl.style.setProperty('font-size', '22px', 'important');
              priceEl.style.setProperty('color', '#ffffff', 'important');
              priceEl.style.setProperty('text-shadow', '0 1px 3px rgba(0,0,0,0.3)', 'important');

              // Style "Rp" prefix: smaller + top-aligned
              const rawHtml = priceEl.innerHTML;
              priceEl.innerHTML = rawHtml.replace(
                /^Rp\s/,
                '<span style="font-size:17px;vertical-align:top;line-height:1.4;color:#ffffff">Rp </span>'
              );

              // Change "Jt" to "JT", same font-size as price
              const jtSpan = priceEl.querySelector('span:last-child');
              if (jtSpan && (jtSpan.textContent?.trim() === 'Jt' || jtSpan.textContent?.trim() === 'JT')) {
                (jtSpan as HTMLElement).textContent = 'JT';
                (jtSpan as HTMLElement).style.setProperty('color', '#ffffff', 'important');
                (jtSpan as HTMLElement).style.setProperty('font-size', 'inherit', 'important');
              }
            }
          }
        }
      });

      // D1c. BUMP FONT SIZES in "Rincian Biaya Paket" section (+2px)
      const pricingH4 = Array.from(clone.querySelectorAll('h4')).find(
        h => h.textContent?.trim().includes('Rincian Biaya Paket')
      ) as HTMLElement | undefined;
      if (pricingH4) {
        // Title: text-xs (12px) → 14px
        pricingH4.style.setProperty('font-size', '14px', 'important');
        // All rows inside the pricing container
        const pricingContainer = pricingH4.nextElementSibling as HTMLElement;
        if (pricingContainer) {
          // NUCLEAR APPROACH: Completely rebuild each pricing row with hard-coded inline styles
          const rows = pricingContainer.querySelectorAll('.flex.justify-between');
          rows.forEach(row => {
            const rowEl = row as HTMLElement;
            const spans = rowEl.querySelectorAll('span');
            if (spans.length >= 2) {
              const label = spans[0].textContent?.trim() || '';
              const price = spans[1].textContent?.trim() || '';
              
              // Rebuild the row HTML with explicit inline styles, NO classes
              rowEl.innerHTML = `
                <span style="font-size: 16px; font-weight: 400; white-space: nowrap; color: #4b5563;">${label}</span>
                <span style="font-size: 16px; font-weight: 400; white-space: nowrap; color: #111827; text-align: right;">${price}</span>
              `;
            }
          });
        }
      }

      // D1d. BUMP FONT SIZES in flight info + hotel info + extra hotels grids (+2px)
      const infoGrids = clone.querySelectorAll('.grid.grid-cols-2');
      infoGrids.forEach(grid => {
        // Skip pricing table (it's handled separately above)
        const prevSibling = grid.previousElementSibling;
        if (prevSibling?.tagName === 'H4' && prevSibling.textContent?.includes('Rincian Biaya')) return;

        // Also bump the section title h4 if present (e.g. "Akomodasi Plus / Transit")
        if (prevSibling?.tagName === 'H4') {
          const h4 = prevSibling as HTMLElement;
          const computed = window.getComputedStyle(h4);
          const currentSize = parseFloat(computed.fontSize);
          if (currentSize > 0) {
            h4.style.setProperty('font-size', `${currentSize + 2}px`, 'important');
          }
        }

        grid.querySelectorAll('p, span').forEach(el => {
          const htmlEl = el as HTMLElement;
          const computed = window.getComputedStyle(htmlEl);
          const currentSize = parseFloat(computed.fontSize);
          if (currentSize > 0) {
            htmlEl.style.setProperty('font-size', `${currentSize + 2}px`, 'important');
          }
        });
      });

      // D1e. STYLE HOTEL NAMES (red-orange gradient) + STARS (bright gold)
      // Hotel names are the <p> with hotel name text (font-medium, line-clamp-1)
      clone.querySelectorAll('p').forEach(p => {
        const el = p as HTMLElement;
        if (el.classList.contains('line-clamp-1') && el.classList.contains('font-medium')) {
          el.style.setProperty('background', 'linear-gradient(90deg, rgba(122, 10, 10, 1) 0%, rgba(194, 12, 12, 1) 30%, rgba(122, 10, 10, 1) 100%)', 'important');
          el.style.setProperty('-webkit-background-clip', 'text', 'important');
          el.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
          el.style.setProperty('background-clip', 'text', 'important');
          el.style.setProperty('font-weight', '700', 'important');
        }
      });
      // Star icons (★) — bright gold (handled below in nuclear rebuild)

      // D1f. NUCLEAR FIX: Replace star+distance flex rows with single <p> text
      // snapdom clips flex items at computed width, so flex layout doesn't work.
      // Solution: rebuild as a single <p> with all text inline.
      clone.querySelectorAll('[data-stars-row]').forEach(row => {
        const el = row as HTMLElement;
        // Collect stars
        const starSpans = el.querySelectorAll('.text-amber-400');
        const starCount = starSpans.length;
        const stars = '★'.repeat(starCount);
        
        // Collect distance text
        let distText = '';
        el.querySelectorAll('span').forEach(span => {
          const s = span as HTMLElement;
          const txt = s.textContent?.trim() || '';
          if (txt.startsWith('±') || s.classList.contains('text-emerald-600')) {
            distText = txt;
          }
        });
        
        // Replace the div with a single <p>
        const p = document.createElement('p');
        p.style.cssText = 'margin:0; line-height:1.4; white-space:nowrap; overflow:visible;';
        
        // Stars part
        const starsSpan = document.createElement('span');
        starsSpan.textContent = stars;
        starsSpan.style.cssText = 'color:#E8A200; font-size:10px; letter-spacing:1px;';
        p.appendChild(starsSpan);
        
        // Distance part
        if (distText) {
          const distSpan = document.createElement('span');
          distSpan.textContent = `  ${distText}`;
          distSpan.style.cssText = 'color:#059669; font-size:11px; font-weight:400; margin-left:4px;';
          p.appendChild(distSpan);
        }
        
        // Replace the original div
        el.replaceWith(p);
      });

      // D2. FLIGHT INFO: Remove "/" separators and bold dates
      const flightInfoRows = clone.querySelectorAll('p');
      flightInfoRows.forEach(p => {
        const spans = p.querySelectorAll('span');
        spans.forEach(span => {
          const el = span as HTMLElement;
          const text = el.textContent?.trim();
          // Remove the "/" separator physically (snapdom ignores display:none)
          if (text === '/') {
            el.remove();
            return;
          }
          // Reformat date spans (format: "20 Jun 26", "28 Jun 26", etc.)
          if (text && /^\d{1,2}\s+\w{3}\s+\d{2,4}$/.test(text)) {
            el.style.setProperty('font-weight', '700', 'important');
            el.style.setProperty('color', '#111827', 'important');

            // Parse and Reformat to Full Indonesian
            const parts = text.split(/\s+/);
            if (parts.length === 3) {
              const [day, monthShort, yearShort] = parts;
              const monthsMap: Record<string, string> = {
                'Jan': 'Januari', 'Feb': 'Februari', 'Mar': 'Maret',
                'Apr': 'April', 'Mei': 'Mei', 'Jun': 'Juni',
                'Jul': 'Juli', 'Agu': 'Agustus', 'Sep': 'Sep',
                'Okt': 'Okt', 'Nov': 'Nov', 'Des': 'Des'
              };
              const monthIndexMap: Record<string, number> = {
                'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'Mei': 4, 'Jun': 5,
                'Jul': 6, 'Agu': 7, 'Sep': 8, 'Okt': 9, 'Nov': 10, 'Des': 11
              };
              const daysMap = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
              
              const monthFull = monthsMap[monthShort] || monthShort;
              const yearFull = yearShort.length === 2 ? `20${yearShort}` : yearShort;
              
              // Calculate Day of Week
              const d = new Date(parseInt(yearFull), monthIndexMap[monthShort] ?? 0, parseInt(day));
              const dayName = daysMap[d.getDay()];
              
              el.textContent = `${dayName}, ${day} ${monthFull} ${yearFull}`;
            }
          }
          // Force (+1) to stay inline with flight time
          if (text === '(+1)') {
            el.style.setProperty('display', 'inline', 'important');
            el.style.setProperty('white-space', 'nowrap', 'important');
            // Also force parent <p> to nowrap
            const parentP = el.closest('p');
            if (parentP) {
              (parentP as HTMLElement).style.setProperty('white-space', 'nowrap', 'important');
            }
          }
        });
      });

      // E. REMOVE AGENT PROFILE from clone body (moved to header)
      // Must physically remove — snapdom ignores display:none
      const agentProfileEl = clone.querySelector('[data-agent-profile]');
      if (agentProfileEl) {
        // Remove the wrapper div (px-0) too if it exists
        const wrapper = agentProfileEl.parentElement;
        if (wrapper && wrapper !== clone) {
          wrapper.remove();
        } else {
          agentProfileEl.remove();
        }
      }

      // F. FINAL CARD TOUCHES
      clone.style.height = 'auto';
      clone.style.padding = '0';
      clone.style.borderRadius = '12px';
      clone.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
      clone.style.overflow = 'hidden';

      // F1. Bump font sizes for screenshot readability (+2px for package name, +1px for others)
      const allTextEls = clone.querySelectorAll('h3, h4, span, p, div');
      allTextEls.forEach(el => {
        const htmlEl = el as HTMLElement;
        const computed = window.getComputedStyle(htmlEl);
        const currentSize = parseFloat(computed.fontSize);
        if (!currentSize || currentSize === 0) return;
        
        // Package name (h3) gets +2px, everything else +1px
        const bump = el.tagName === 'H3' ? 4 : 1;
        htmlEl.style.fontSize = `${currentSize + bump}px`;
      });

      // F2. Reduce bottom padding below pricing table
      const contentWrapper = clone.querySelector('.px-4.pb-4') as HTMLElement;
      if (contentWrapper) {
        contentWrapper.style.paddingBottom = '8px';
      }
      // Remove margin-bottom on pricing div (mb-4)
      const pricingSection = Array.from(clone.querySelectorAll('h4')).find(
        h => h.textContent?.includes('Rincian Biaya')
      )?.closest('.mb-4') as HTMLElement;
      if (pricingSection) {
        pricingSection.style.marginBottom = '0';
      }

      // F3. Build CTA section (will be inserted at bottom later)
      let ctaSection: HTMLDivElement | null = null;
      if (currentAgent && pricingSection) {
        const rawPhone = currentAgent.phone.replace(/\D/g, '');
        const formattedPhone = rawPhone.startsWith('62') ? `+62 ${rawPhone.slice(2)}` : currentAgent.phone;

        ctaSection = document.createElement('div');
        Object.assign(ctaSection.style, {
          marginTop: '12px',
          marginBottom: '5px',
          padding: '12px 16px',
          backgroundColor: '#F0FDF4',
          borderRadius: '8px',
          border: '1px solid #BBF7D0',
          textAlign: 'center' as const,
        });

        // Line 1: Konsultasi text
        const line1 = document.createElement('div');
        Object.assign(line1.style, {
          fontSize: '14px',
          color: '#111827',
          marginBottom: '5px',
          lineHeight: '1.4',
        });
        line1.innerHTML = `Konsultasi & pendaftaran bisa hubungi <strong>${currentAgent.name}</strong>`;

        // Line 2: WA icon + phone  —  link icon + website
        const line2 = document.createElement('div');
        Object.assign(line2.style, {
          fontSize: '14px',
          color: '#111827',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          flexWrap: 'wrap',
        });

        // WA icon SVG
        const waIconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;

        // Link icon SVG
        const linkIconSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>`;

        line2.innerHTML = `${waIconSvg} ${formattedPhone} <span style="color:#9CA3AF;margin:0 4px">•</span> ${linkIconSvg} ${currentAgent.website}`;

        ctaSection.appendChild(line1);
        ctaSection.appendChild(line2);

        // Will insert CTA after temperature section below
      }

      // F2. Remove temperature section from screenshot
      const tempCloned = clone.querySelector('[data-temp-section]');
      if (tempCloned) tempCloned.remove();

      // F3b. Insert CTA at the very bottom (after pricing)
      if (ctaSection && pricingSection) {
        pricingSection.insertAdjacentElement('afterend', ctaSection);
      }

      // G. BUILD OUTER WRAPPER with symmetric padding + header
      const wrapper = document.createElement('div');
      Object.assign(wrapper.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '600px',
        zIndex: '-9999',
        opacity: '1',
        pointerEvents: 'none',
        background: GRADIENT_PRESETS[gradientRef.current].css,
        padding: '20px',
        fontFamily: "'Inter', Arial, Helvetica, sans-serif",
        boxSizing: 'border-box',
      });
      wrapper.setAttribute('data-cloned', 'true');

      // FINAL SWEEP: Ensure ALL pricing-related text stays at normal weight
      // This catches any spans that might have been re-styled during processing
      clone.querySelectorAll('span').forEach(span => {
        const el = span as HTMLElement;
        const text = el.textContent?.trim() || '';
        // Target pricing amounts (contains "Rp") and labels (contains "Sekamar" or "Orang" or "Tahun")
        if (text.includes('Rp ') || text.includes('Sekamar') || text.includes('Orang') || text.includes('Tahun')) {
          // Strip ALL font-weight classes
          const classes = el.className.split(' ').filter(c => !c.startsWith('font-'));
          el.className = classes.join(' ');
          el.style.fontWeight = '400';
        }
      });



      // H. NEW HEADER: Logo (left) + Agent Profile (right)
      const header = document.createElement('div');
      Object.assign(header.style, {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
        paddingBottom: '20px',
        borderBottom: '1px solid #E5E7EB',
      });

      // Left: Logo
      const logoContainer = document.createElement('div');
      logoContainer.style.flexShrink = '0';
      const logoImg = document.createElement('img');
      logoImg.src = logoAlhijaz;
      Object.assign(logoImg.style, {
        height: '36px',
        width: 'auto',
        objectFit: 'contain',
      });
      logoContainer.appendChild(logoImg);

      // Right: Agent Profile
      const agentSection = document.createElement('div');
      Object.assign(agentSection.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexShrink: '0',
      });

      if (currentAgent) {
        // Text block (name, website, phone) — right-aligned
        const textBlock = document.createElement('div');
        Object.assign(textBlock.style, {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '2px',
        });

        const agentName = document.createElement('div');
        Object.assign(agentName.style, {
          fontWeight: '700',
          fontSize: '14px',
          color: '#111827',
          lineHeight: '1.3',
          whiteSpace: 'nowrap',
          textAlign: 'right',
        });
        agentName.textContent = currentAgent.name;

        const agentWeb = document.createElement('div');
        Object.assign(agentWeb.style, {
          fontSize: '13px',
          color: '#6B7280',
          lineHeight: '1.3',
          whiteSpace: 'nowrap',
          textAlign: 'right',
        });
        agentWeb.textContent = currentAgent.website;

        const rawPhone = currentAgent.phone.replace(/\D/g, '');
        const formattedPhone = rawPhone.startsWith('62')
          ? `+62 ${rawPhone.slice(2)}`
          : currentAgent.phone;

        const agentPhone = document.createElement('div');
        Object.assign(agentPhone.style, {
          fontSize: '12px',
          color: '#374151',
          fontWeight: '600',
          lineHeight: '1.3',
          whiteSpace: 'nowrap',
          textAlign: 'right',
        });
        agentPhone.textContent = formattedPhone;

        textBlock.appendChild(agentName);
        textBlock.appendChild(agentWeb);
        textBlock.appendChild(agentPhone);

        // Avatar container (relative for badge positioning)
        const avatarContainer = document.createElement('div');
        Object.assign(avatarContainer.style, {
          position: 'relative',
          width: '52px',
          height: '52px',
          flexShrink: '0',
        });

        const avatar = document.createElement('img');
        avatar.src = currentAgent.photo;
        Object.assign(avatar.style, {
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          objectFit: 'cover',
          border: '2px solid #E5E7EB',
        });

        // Verified badge on top-right of avatar
        const verifiedBadge = document.createElement('div');
        Object.assign(verifiedBadge.style, {
          position: 'absolute',
          top: '-2px',
          right: '-2px',
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          backgroundColor: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        });
        verifiedBadge.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="12" fill="#1DA1F2"/><path d="M9.5 12.5L11 14L15 10" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

        avatarContainer.appendChild(avatar);
        avatarContainer.appendChild(verifiedBadge);

        agentSection.appendChild(textBlock);
        agentSection.appendChild(avatarContainer);
      }

      header.appendChild(logoContainer);
      header.appendChild(agentSection);

      // Transfer clone from body to wrapper
      document.body.removeChild(clone);
      clone.style.position = 'relative';
      clone.style.zIndex = 'auto';
      clone.removeAttribute('data-cloned');

      wrapper.appendChild(header);
      wrapper.appendChild(clone);
      document.body.appendChild(wrapper);

      // 4. RENDER WITH SNAPDOM

      // 4a. Pastikan semua font (Inter, dll) sudah terload sempurna
      await document.fonts.ready;

      // 4b. Beri "napas" agar DOM stabil setelah manipulasi
      await new Promise(resolve => setTimeout(resolve, 300));

      // 4c. Render the wrapper (which contains header + clone)
      const { snapdom } = await import('@zumer/snapdom');
      const result = await snapdom(wrapper, {
        scale: 2,
        backgroundColor: '#ffffff',
        exclude: ['[data-screenshot-ignore]', '[data-agent-profile]'],
      });

      // Convert to dataUrl for preview overlay
      const canvas = await result.toCanvas();
      const imageDataUrl = canvas.toDataURL('image/png');

      // Cleanup
      document.body.removeChild(wrapper);

      // 5. SHOW FULL SCREEN PREVIEW
      setPreviewImage(imageDataUrl);

    } catch (error: any) {
      console.error(error);
      alert("Gagal memproses gambar: " + error.message);
      // Cleanup emergency
      const ghost = document.querySelector('[data-cloned="true"]');
      if (ghost) document.body.removeChild(ghost);
    } finally {
      setIsCapturing(false);
    }
  };

  // Share from the full-screen preview overlay
  const handleShareScreenshot = async () => {
    if (!previewImage) return;
    trackEvent('action', 'share_screenshot', { paket: pkg.nama });
    trackPublicEvent(agentSlug, 'wa_click_public', { source: 'screenshot_share', paket: pkg.nama });

    try {
      const blob = await (await fetch(previewImage)).blob();
      const fileName = `paket-${pkg.nama.replace(/\s+/g, '-').toLowerCase()}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });
      const shareData = {
        title: `Paket Umrah - ${pkg.nama}`,
        text: `Berikut detail Paket ${pkg.nama}`,
        files: [file],
      };

      if (navigator.canShare && navigator.canShare(shareData)) {
        try {
          await navigator.share(shareData);
        } catch (err: any) {
          if (err?.name !== 'AbortError') {
            console.warn('Share error, falling back to download:', err);
            const link = document.createElement('a');
            link.download = fileName;
            link.href = previewImage;
            link.click();
          }
        }
      } else {
        // Desktop / Browser Lama: Fallback ke Download
        const link = document.createElement('a');
        link.download = fileName;
        link.href = previewImage;
        link.click();
      }
    } catch (err) {
      console.log('Share error:', err);
    }
  };

  /**
   * Sub-component: Seat and Date Section
   * Extracted to be rendered in different positions based on expansion state
   */
  const SeatAndDateSection = ({ isFooter = false }: { isFooter?: boolean }) => {
    const takenSeats = pkg.seatTotal - pkg.seatSisa;
    const percentage = Math.min(100, Math.max(0, Math.round((takenSeats / pkg.seatTotal) * 100)));

    const getStatusStyle = (pct: number) => {
      // Full (100%)
      if (pct >= 100) {
        return {
          bar: 'bg-red-600 dark:bg-red-500',
          text: 'text-red-600 dark:text-red-400',
          stripe: ['#dc2626', '#b91c1c'],  // red-600, red-700
        };
      }
      // Hampir penuh (>= 80%)
      if (pct >= 80) {
        return {
          bar: 'bg-orange-500',
          text: 'text-orange-500 dark:text-orange-400',
          stripe: ['#f97316', '#ea580c'],  // orange-500, orange-600
        };
      }
      // Masih longgar (< 80%)
      return {
        bar: 'bg-emerald-500',
        text: 'text-emerald-600 dark:text-emerald-400',
        stripe: ['#10b981', '#0d9f6e'],  // emerald-500, emerald-600
      };
    };

    const statusStyle = getStatusStyle(percentage);

    return (
      <div className={`
        seat-info-section flex items-end gap-4 transition-all duration-300
        ${isFooter
          ? "mb-[10px] p-3 bg-gray-50 dark:bg-slate-900/50 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm"
          : cardVariant === 'split' ? "mt-0 pt-2 pb-1" : "mt-3 pt-3 border-t border-gray-100 dark:border-slate-700/50"
        }
      `}>
        {/* Left: Seat Info & Progress Bar */}
        <div className="flex-1">
          <div className="flex justify-between items-center mb-1.5">
            <p className="text-xs font-medium">
              <span className={statusStyle.text}>
                TERISI {takenSeats}
              </span>
              <span className="text-gray-400 dark:text-slate-400 font-semibold"> DARI {pkg.seatTotal}</span>
            </p>
            <p className={`text-xs font-semibold ${statusStyle.text}`}>
              {percentage}%
            </p>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden" style={{ height: '0.49rem' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${percentage}%`,
                background: `repeating-linear-gradient(45deg, ${statusStyle.stripe[0]}, ${statusStyle.stripe[0]} 6px, ${statusStyle.stripe[1]} 6px, ${statusStyle.stripe[1]} 12px)`,
                backgroundSize: '20px 20px',
                animation: 'stripe-move 1s linear infinite',
                transition: 'width 0.5s ease',
              }}
            />
          </div>
        </div>

      {/* Right: Departure Date */}
      <div className={`text-right pb-0.5 shrink-0 ${isFooter ? "-mb-2" : "-mb-2"}`}>
        <span className="block text-[10px] text-gray-600 dark:text-slate-400 uppercase tracking-wide">Berangkat</span>
        <span className="text-sm font-bold text-gray-800 dark:text-white leading-tight whitespace-nowrap">
          {new Date(pkg.keberangkatan.tgl).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          })}
        </span>
      </div>
    </div>
  );
};

  // ── Card variant ──
  // Force default layout during screenshot capture so brosur output tetap rapih
  const cardVariant = isCapturing ? 'default' : (currentAgent?.card_variant || 'default');
  const variantProps = { pkg, hotelInfo, absoluteMinPrice, formatHeaderPrice, isExpanded, SeatAndDateSection, formatDate };

  return (
    <>
    <div
      ref={cardRef}
      data-card-ref="true"
      data-jadwal-id={pkg.jadwalId}
      onClick={handleCardClick}
      className={`
        bg-white dark:bg-slate-800 rounded-xl relative overflow-hidden cursor-pointer
        transition-all duration-300 ease-out
        ${isExpanded
          ? 'shadow-lg ring-1 ring-emerald-100 dark:ring-emerald-900 pb-2'
          : 'shadow-sm border border-gray-100 dark:border-slate-700 hover:shadow-md pb-1'
        }
      `}
    >


      {/* Flag overlay — corner peek (hidden when expanded) */}
      {!isExpanded && (() => {
        const flags = getCountryFlags(hotelInfo);
        return (
          <div className="absolute -right-2.5 -bottom-2.5 z-0 pointer-events-none -rotate-[8deg]">
            {flags.length === 1 ? (
              <div className="relative w-[125px] h-[88px]">
                <img src={flags[0]} alt="" className="w-full h-full object-cover opacity-[0.12] rounded" />
                <div className="absolute inset-0 bg-gradient-to-l from-white dark:from-slate-800 to-transparent to-40%" />
              </div>
            ) : (
              <div className="flex gap-1">
                {flags.map((flag) => (
                  <div key={flag} className="relative w-[100px] h-[70px]">
                    <img src={flag} alt="" className="w-full h-full object-cover opacity-[0.12] rounded" />
                    <div className="absolute inset-0 bg-gradient-to-l from-white dark:from-slate-800 to-transparent to-40%" />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      <div className="relative z-10">

      {/* ============================================ */}
      {/* COLLAPSED VIEW (Always Visible) */}
      {/* ============================================ */}
      {cardVariant === 'split' ? <SplitLayout {...variantProps} />
        : cardVariant === 'spotlight' ? <SpotlightLayout {...variantProps} />
        : cardVariant === 'ticket' ? <TicketLayout {...variantProps} />
        : cardVariant === 'tiled' ? <TiledLayout {...variantProps} />
        : cardVariant === 'magazine' ? <MagazineLayout {...variantProps} />
        : <div className={isExpanded ? "pt-4 px-4 pb-0" : "p-4"}>
        {/* Header: Title & Price */}
        <div className="flex justify-between items-start gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <h3 className={`font-bold text-sm leading-tight line-clamp-2 ${
              pkg.seatSisa <= 0
                ? 'line-through text-red-700 dark:text-red-500 decoration-red-700 dark:decoration-red-500'
                : 'text-gray-900 dark:text-slate-100'
            }`}>
              {pkg.nama}
            </h3>
            {pkg.isPromo && (
              <span className="inline-block mt-1 px-2 py-0.5 bg-red-100 text-red-600 text-xs font-medium rounded">
                PROMO
              </span>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-gray-500 dark:text-slate-400">MULAI</p>
            <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
              Rp {formatHeaderPrice(absoluteMinPrice)} <span className="text-sm">Jt</span>
            </p>
          </div>
        </div>

        {/* Flight Information - 2 Column Grid */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          {/* Departure */}
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 flex items-center justify-center text-emerald-600 mt-0.5">
              <PlaneTakeoff size={16} />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-slate-400 flex items-center gap-1">
                <span className="font-medium text-gray-700 dark:text-slate-200">{(pkg.keberangkatan.kodePenerbangan || '').split('/')[0].trim()}</span>
                <span>/</span>
                <span>{formatDate(pkg.keberangkatan.tgl)}</span>
              </p>
              <p className="text-xs text-gray-600 dark:text-slate-300 whitespace-nowrap">{pkg.keberangkatan.jam.replace('.', ':')} WIB</p>
            </div>
          </div>

          {/* Return */}
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 flex items-center justify-center text-emerald-600 mt-0.5">
              <PlaneLanding size={16} />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-slate-400 flex items-center gap-1">
                <span className="font-medium text-gray-700 dark:text-slate-200">{(pkg.kepulangan.kodePenerbangan || '').split('/')[0].trim()}</span>
                <span>/</span>
                <span>{formatDate(pkg.kepulangan.tgl)}</span>
              </p>
              <p className="text-xs text-gray-600 dark:text-slate-300 whitespace-nowrap">{pkg.kepulangan.jam.replace('.', ':')} WIB</p>
            </div>
          </div>
        </div>

        {/* Hotel Information - 2 Column Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Makkah Hotel */}
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 flex items-center justify-center text-emerald-600 mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M19.006 3.705a.75.75 0 1 0-.512-1.41L6 6.838V3a.75.75 0 0 0-.75-.75h-1.5A.75.75 0 0 0 3 3v4.93l-1.006.365a.75.75 0 0 0 .512 1.41l16.5-6Z" />
                <path fillRule="evenodd" d="M3.019 11.115 18 5.667V9.09l4.006 1.456a.75.75 0 1 1-.512 1.41l-.494-.18v8.475h.75a.75.75 0 0 1 0 1.5H2.25a.75.75 0 0 1 0-1.5H3v-9.129l.019-.006ZM18 20.25v-9.565l1.5.545v9.02H18Zm-9-6a.75.75 0 0 0-.75.75v4.5c0 .414.336.75.75.75h3a.75.75 0 0 0 .75-.75V15a.75.75 0 0 0-.75-.75H9Z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Mekkah</p>
              <p 
                className="text-xs text-gray-700 dark:text-slate-300 font-medium line-clamp-1 text-ellipsis overflow-hidden break-all"
                title={hotelInfo?.mekkah_hotel || '-'}
              >
                {hotelInfo?.mekkah_hotel || '-'}
              </p>
              {hotelInfo?.mekkah_bintang && (
                  <div className="flex items-center gap-0.5" data-stars-row>
                    {Array.from({ length: parseInt(hotelInfo.mekkah_bintang) }).map((_, i) => (
                      <span key={i} className="text-[10px] text-amber-400">★</span>
                    ))}
                    {(() => {
                      const dist = hotelInfo.mekkah_jarak || getDistance(hotelInfo.mekkah_hotel || '');
                      return dist ? (
                        <span className="text-[11px] font-semibold ml-2 text-emerald-600">
                          {dist}
                        </span>
                      ) : null;
                    })()}
                  </div>
              )}
            </div>
          </div>

          {/* Madinah Hotel */}
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 flex items-center justify-center text-emerald-600 mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M19.006 3.705a.75.75 0 1 0-.512-1.41L6 6.838V3a.75.75 0 0 0-.75-.75h-1.5A.75.75 0 0 0 3 3v4.93l-1.006.365a.75.75 0 0 0 .512 1.41l16.5-6Z" />
                <path fillRule="evenodd" d="M3.019 11.115 18 5.667V9.09l4.006 1.456a.75.75 0 1 1-.512 1.41l-.494-.18v8.475h.75a.75.75 0 0 1 0 1.5H2.25a.75.75 0 0 1 0-1.5H3v-9.129l.019-.006ZM18 20.25v-9.565l1.5.545v9.02H18Zm-9-6a.75.75 0 0 0-.75.75v4.5c0 .414.336.75.75.75h3a.75.75 0 0 0 .75-.75V15a.75.75 0 0 0-.75-.75H9Z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Madinah</p>
              <p 
                className="text-xs text-gray-700 dark:text-slate-300 font-medium line-clamp-1 text-ellipsis overflow-hidden break-all"
                title={hotelInfo?.madinah_hotel || '-'}
              >
                {hotelInfo?.madinah_hotel || '-'}
              </p>
              {hotelInfo?.madinah_bintang && (
                  <div className="flex items-center gap-0.5" data-stars-row>
                    {Array.from({ length: parseInt(hotelInfo.madinah_bintang) }).map((_, i) => (
                      <span key={i} className="text-[10px] text-amber-400">★</span>
                    ))}
                    {(() => {
                      const dist = hotelInfo.madinah_jarak || getDistance(hotelInfo.madinah_hotel || '');
                      return dist ? (
                        <span className="text-[11px] font-semibold ml-2 text-emerald-600">
                          {dist}
                        </span>
                      ) : null;
                    })()}
                  </div>
              )}
            </div>
          </div>
        </div>

        {/* Availability Bar + Departure Date (Only when Collapsed) */}
        {!isExpanded && <SeatAndDateSection isFooter={false} />}
      </div>}

      {/* ============================================ */}
      {/* EXPANDED VIEW (Animated) — shared across all variants */}
      {/* ============================================ */}
      <div
        className="overflow-hidden transition-all duration-300 ease-out"
        style={{
          maxHeight: isExpanded ? (isSingleView ? 'none' : `${contentHeight}px`) : '0px',
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div ref={contentRef} className="px-4 pb-4">

          {/* Availability Bar + Departure Date (Expanded position: above Landing & Manasik) */}
          {isExpanded && <div className="mb-3"><SeatAndDateSection isFooter={false} /></div>}

          {/* ---- New Info Section: Landing & Manasik ---- */}
          <div className="flex items-center gap-3 mb-2 bg-gray-50 dark:bg-slate-900/50 p-3 rounded-lg">
            <div className="grid grid-cols-2 gap-3 flex-1 min-w-0">
            {/* Landing Info */}
            <div className="flex items-start gap-2">
              <div className="w-5 h-5 flex items-center justify-center text-emerald-600 mt-0.5">
                <PlaneLanding size={16} />
              </div>
              <div>
                <p className="text-[10px] text-gray-500 dark:text-slate-400 uppercase tracking-wide">Landing di</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {getLandingCityName(pkg)}
                </p>
              </div>
            </div>

            {/* Manasik Info */}
            <div className="flex items-start gap-2">
              <div className="w-5 h-5 flex items-center justify-center text-emerald-600 mt-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M11.25 4.533A9.707 9.707 0 0 0 6 3a9.735 9.735 0 0 0-3.25.555.75.75 0 0 0-.5.707v14.25a.75.75 0 0 0 1 .707A8.237 8.237 0 0 1 6 18.75c1.995 0 3.823.707 5.25 1.886V4.533ZM12.75 20.636A8.214 8.214 0 0 1 18 18.75c.966 0 1.89.166 2.75.47a.75.75 0 0 0 1-.708V4.262a.75.75 0 0 0-.5-.707A9.735 9.735 0 0 0 18 3a9.707 9.707 0 0 0-5.25 1.533v16.103Z" />
                </svg>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 dark:text-slate-400 uppercase tracking-wide">Manasik</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {pkg.manasikTanggal ? (
                    <>
                      {formatDate(pkg.manasikTanggal)}
                    </>
                  ) : (
                    'TBA'
                  )}
                </p>
              </div>
            </div>
            </div>
          </div>


          {/* Agent Profile (only visible when URL slug matches an agent) */}
          {currentAgent && (
            <div className="px-0">
              <AgentProfile agent={currentAgent} packageName={pkg.nama} departureDate={pkg.keberangkatan.tgl} isCapturing={isCapturing} />
            </div>
          )}

          {/* Extra Hotels (Plus/Transit) - Conditional Section */}
          {extraHotels.length > 0 && (
            <div className="mb-4 pt-3 border-t border-dashed border-gray-200 dark:border-slate-700">
              <h4 className="text-[10px] uppercase font-bold text-gray-400 mb-2 tracking-wider flex items-center gap-1">
                <Building2 size={12} />
                <span>Akomodasi Plus / Transit</span>
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {extraHotels.map((hotel, idx) => (
                  <div key={`${hotel.city}-${idx}`} className="flex items-start gap-2">
                    <div className="w-5 h-5 flex items-center justify-center text-emerald-600 mt-0.5 bg-emerald-50 rounded-full">
                      <Building2 size={12} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{hotel.city}</p>
                      <p 
                        className="text-xs text-gray-700 dark:text-slate-200 font-medium line-clamp-1 text-ellipsis overflow-hidden break-all"
                        title={hotel.name}
                      >
                        {hotel.name}
                      </p>
                      {parseInt(hotel.star) > 0 && (
                        <div className="flex items-center gap-0.5 mt-0.5" data-stars-row>
                          {Array.from({ length: parseInt(hotel.star) }).map((_, i) => (
                            <span key={i} className="text-[10px] text-amber-400">★</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---- Action Buttons Row 1 ---- */}
          <div data-screenshot-ignore className="grid grid-cols-4 gap-2 mt-0 mb-2">
            {pkg.itineraryUrl ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fireViewContent();
                  trackEvent('action', 'download_itinerary', { paket: pkg.nama });
                  setIsItineraryOpen(true);
                }}
                className="flex flex-col items-center justify-center py-3 px-2 rounded-xl border-2 transition-all border-gray-200 hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 dark:border-slate-700 dark:hover:border-blue-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-blue-500 dark:text-blue-400 mb-1">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                </svg>
                <span className="text-xs font-medium text-gray-600 dark:text-slate-200">Itinerary</span>
              </button>
            ) : (
              <div className="flex flex-col items-center justify-center py-3 px-2 rounded-xl border-2 transition-all border-gray-100 opacity-50 cursor-not-allowed dark:border-slate-800">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-500 mb-1">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                </svg>
                <span className="text-xs font-medium text-gray-600">Itinerary</span>
              </div>
            )}

            {isSingleView ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  document.body.classList.add('navigating');
                  const seg = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean)[0];
                  const base = seg ? `/${seg}/kalkulasi` : '/kalkulasi';
                  setTimeout(() => {
                    window.location.href = `${base}?paket=${encodeURIComponent(pkg.jadwalId)}&transition=1`;
                  }, 280);
                }}
                className="flex flex-col items-center justify-center py-3 px-2 rounded-xl border-2 transition-all border-gray-200 hover:border-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/30 dark:border-slate-700 dark:hover:border-teal-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-teal-600 dark:text-teal-400 mb-1">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V13.5Zm0 2.25h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V18Zm2.498-6.75h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V13.5Zm0 2.25h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V18Zm2.504-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5Zm0 2.25h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V18Zm2.498-6.75h.008v.008h-.008v-.008ZM15.75 13.5v.008h-.008V13.5h.008ZM6 6.75A.75.75 0 0 1 6.75 6h10.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75H6.75A.75.75 0 0 1 6 8.25v-1.5ZM6 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3H6Z" />
                </svg>
                <span className="text-xs font-medium text-gray-600 dark:text-slate-200">Hitung</span>
              </button>
            ) : pkg.brosurUrl && pkg.brosurUrl.length > 0 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fireViewContent();
                  trackEvent('action', 'download_brosur', { paket: pkg.nama });
                  setIsBrochureOpen(true);
                }}
                className="flex flex-col items-center justify-center py-3 px-2 rounded-xl border-2 transition-all border-gray-200 hover:border-orange-300 hover:bg-orange-50 dark:hover:bg-orange-900/30 dark:border-slate-700 dark:hover:border-orange-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-orange-500 dark:text-orange-400 mb-1">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                <span className="text-xs font-medium text-gray-600 dark:text-slate-200">Brosur</span>
              </button>
            ) : (
              <div className="flex flex-col items-center justify-center py-3 px-2 rounded-xl border-2 transition-all border-gray-100 opacity-50 cursor-not-allowed">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-500 mb-1">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                <span className="text-xs font-medium text-gray-600">Brosur</span>
              </div>
            )}

            {/* Screenshot & Save Button */}
            <button
              type="button"
              onClick={handleScreenshot}
              disabled={isCapturing}
              className="flex flex-col items-center justify-center py-3 px-2 rounded-xl border-2 transition-all border-gray-200 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 dark:border-slate-700 dark:hover:border-purple-500 disabled:opacity-60"
            >
              {isCapturing ? (
                <Loader2 size={20} className="text-purple-600 dark:text-purple-400 mb-1 animate-spin" />
              ) : (
                <Camera size={20} className="text-purple-600 dark:text-purple-400 mb-1" />
              )}
              <span className="text-xs font-medium text-gray-600 dark:text-slate-200">
                {isCapturing ? 'Proses...' : 'Simpan'}
              </span>
            </button>

            {/* Diskusi (Tanya AI) — same geometry as sibling buttons; ::before paints a 2px rotating emerald ring */}
            {!isSingleView && currentAgent && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setAskAIOpen(true);
                }}
                className="diskusi-ai-border flex flex-col items-center justify-center py-3 px-2 rounded-xl border-2 border-transparent transition-transform active:scale-95"
              >
                <Sparkles size={20} className="text-emerald-500 dark:text-emerald-400 mb-1 animate-icon-twinkle" />
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Diskusi</span>
              </button>
            )}

            {/* Bagikan (WhatsApp) — shown here (row 1) when no agent slug */}
            {(!currentAgent || isSingleView) && (
              <button
                type="button"
                onClick={handleWhatsAppShare}
                className="flex flex-col items-center justify-center py-3 px-2 rounded-xl border-2 transition-all border-gray-200 hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 dark:border-slate-700 dark:hover:border-green-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-green-600 mb-1">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                <span className="text-xs font-medium text-gray-600 dark:text-slate-200">Bagikan</span>
              </button>
            )}
          </div>

          {/* ---- Tanya AI Button (Single View Only) — full-width, label panjang ---- */}
          {isSingleView && currentAgent && (
            <button
              type="button"
              data-screenshot-ignore
              onClick={(e) => {
                e.stopPropagation();
                setAskAIOpen(true);
              }}
              className="diskusi-ai-border w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-transparent mb-2 transition-transform active:scale-[0.98]"
            >
              <Sparkles size={18} className="text-emerald-500 dark:text-emerald-400 animate-icon-twinkle" />
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Tanya AI Tentang Paket Ini</span>
            </button>
          )}

          {/* ---- Action Buttons Row 2 (agent-only) ---- */}
          {!isSingleView && currentAgent && (
            <div data-screenshot-ignore className={`grid ${currentAgent ? 'grid-cols-4' : 'grid-cols-2'} gap-2 mb-4`}>
              {/* Link (Copy / Share URL) — moved here from row 1 */}
              {currentAgent && (() => {
                const seg = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean)[0] || '';
                if (!seg) return null;
                const shareUrl = `${window.location.origin}/${seg}/${pkg.jadwalId}`;
                const shareText = `${shareUrl}\n\n*${pkg.nama}*`;
                return (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (navigator.share) {
                        navigator.share({ text: shareText }).catch(() => {});
                      } else {
                        navigator.clipboard.writeText(shareUrl).then(() => {
                          alert('Link berhasil disalin!');
                        });
                      }
                    }}
                    className="flex flex-col items-center justify-center py-3 px-2 rounded-xl border-2 transition-all border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 dark:border-slate-700 dark:hover:border-emerald-500"
                  >
                    <LinkIcon size={20} className="text-emerald-600 dark:text-emerald-400 mb-1" />
                    <span className="text-xs font-medium text-gray-600 dark:text-slate-200">Link</span>
                  </button>
                );
              })()}

              {/* Hitung (agent only) */}
              {currentAgent && <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  document.body.classList.add('navigating');
                  const seg = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean)[0];
                  const base = seg ? `/${seg}/kalkulasi` : '/kalkulasi';
                  setTimeout(() => {
                    window.location.href = `${base}?paket=${encodeURIComponent(pkg.jadwalId)}&transition=1`;
                  }, 280);
                }}
                className="flex flex-col items-center justify-center py-3 px-2 rounded-xl border-2 transition-all border-gray-200 hover:border-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/30 dark:border-slate-700 dark:hover:border-teal-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-teal-600 dark:text-teal-400 mb-1">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V13.5Zm0 2.25h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V18Zm2.498-6.75h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V13.5Zm0 2.25h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V18Zm2.504-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5Zm0 2.25h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V18Zm2.498-6.75h.008v.008h-.008v-.008ZM15.75 13.5v.008h-.008V13.5h.008ZM6 6.75A.75.75 0 0 1 6.75 6h10.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75H6.75A.75.75 0 0 1 6 8.25v-1.5ZM6 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3H6Z" />
                </svg>
                <span className="text-xs font-medium text-gray-600 dark:text-slate-200">Hitung</span>
              </button>}

              {/* Compare Button — only with agent slug */}
              {(() => {
                const seg = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean)[0];
                if (!seg) return null;
                return (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      document.body.classList.add('navigating');
                      setTimeout(() => {
                        window.location.href = `/${seg}/compare?paketA=${encodeURIComponent(pkg.jadwalId)}&transition=1`;
                      }, 280);
                    }}
                    className="flex flex-col items-center justify-center py-3 px-2 rounded-xl border-2 transition-all border-gray-200 hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/30 dark:border-slate-700 dark:hover:border-violet-500"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-violet-600 dark:text-violet-400 mb-1">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                    </svg>
                    <span className="text-xs font-medium text-gray-600 dark:text-slate-200">Compare</span>
                  </button>
                );
              })()}

              {/* WhatsApp Share Button */}
              <button
                type="button"
                onClick={handleWhatsAppShare}
                className="flex flex-col items-center justify-center py-3 px-2 rounded-xl border-2 transition-all border-gray-200 hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 dark:border-slate-700 dark:hover:border-green-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-green-600 mb-1">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                <span className="text-xs font-medium text-gray-600 dark:text-slate-200">Bagikan</span>
              </button>
            </div>
          )}


          {/* ---- Inline Brosur Preview (Single View Only) ---- */}
          {isSingleView && !brosurError && pkg.brosurUrl && (
            <div ref={brosurSectionRef} className="mb-4">
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
                {/* Header */}
                <div className="px-4 py-3 flex items-center gap-1.5">
                  <FileText size={14} className="text-gray-400 dark:text-slate-500" />
                  <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Brosur Paket</span>
                </div>

                {/* Image area */}
                <div
                  className="cursor-pointer relative"
                  onClick={() => { fireViewContent(); setIsBrochureOpen(true); }}
                >
                  <img
                    src={brosurImageUrl}
                    alt="Brosur paket"
                    className="w-full h-auto block"
                    loading="lazy"
                    onError={() => setBrosurError(true)}
                  />
                  {/* Badge */}
                  <div className="absolute bottom-3 right-3 bg-black/50 text-white text-[11px] font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 backdrop-blur-sm">
                    <Maximize2 size={12} />
                    Lihat penuh
                  </div>
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-gray-50 dark:border-slate-700/50 flex items-center justify-between">
                  <button type="button" onClick={handleDownloadBrosur} className="flex items-center gap-2">
                    <Download size={16} className="text-emerald-500" />
                    <span className="text-xs font-semibold text-emerald-500 dark:text-emerald-400">Download brosur</span>
                  </button>
                  <button type="button" onClick={handleShareBrosur} className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors">
                    <Share2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ---- Pricing Table (Compact) ---- */}
          <div className="mb-4">
            <h4 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Rincian Biaya Paket
            </h4>
            <div className="border-t border-gray-100 dark:border-slate-700">
              {pricing?.Quard && (
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-slate-700">
                  <span className="text-sm text-gray-600 dark:text-slate-300">Quad (Sekamar 4)</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white text-right">Rp {formatRupiah(pricing.Quard)}</span>
                </div>
              )}
              {pricing?.Triple && (
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-slate-700">
                  <span className="text-sm text-gray-600 dark:text-slate-300">Triple (Sekamar 3)</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white text-right">Rp {formatRupiah(pricing.Triple)}</span>
                </div>
              )}
              {pricing?.Double && (
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-slate-700">
                  <span className="text-sm text-gray-600 dark:text-slate-300">Double (Sekamar 2)</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white text-right">Rp {formatRupiah(pricing.Double)}</span>
                </div>
              )}
              {pricing?.Single && (
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-slate-700">
                  <span className="text-sm text-gray-600 dark:text-slate-300">Single (1 Orang)</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white text-right">Rp {formatRupiah(pricing.Single)}</span>
                </div>
              )}
              {pricing?.Infant && (
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-slate-700">
                  <span className="text-sm text-gray-600 dark:text-slate-300">Infant ({'<'}2 Tahun)</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white text-right">Rp {formatRupiah(pricing.Infant)}</span>
                </div>
              )}
            </div>
          </div>

          {/* ---- Temperature Estimate Section (Dynamic Cities) ---- */}
          {/* data-temp-section used by screenshot code to find this element */}
          {(() => {
            const depMonth = new Date(pkg.keberangkatan.tgl).getMonth() + 1;

            // Build the list of all cities in this package
            const cities: Array<{ key: string; label: string }> = [
              { key: 'mekkah', label: 'Mekkah' },
              { key: 'madinah', label: 'Madinah' },
              ...extraHotels.map(h => ({ key: h.city.toLowerCase(), label: h.city })),
            ];

            // Filter to cities that have temperature data
            const citiesWithTemp = cities
              .filter(c => getTemperature(c.key, depMonth) !== null)
              // Deduplicate by key
              .filter((c, i, arr) => arr.findIndex(x => x.key === c.key) === i);

            if (citiesWithTemp.length === 0) return null;

            // Color palette for differentiating city icons
            const iconStyles = [
              { hot: 'bg-orange-50 dark:bg-orange-950/30', hotIcon: 'text-orange-500', cool: 'bg-teal-50 dark:bg-teal-950/30', coolIcon: 'text-teal-500' },
              { hot: 'bg-amber-50 dark:bg-amber-950/30', hotIcon: 'text-amber-500', cool: 'bg-cyan-50 dark:bg-cyan-950/30', coolIcon: 'text-cyan-500' },
              { hot: 'bg-red-50 dark:bg-red-950/30', hotIcon: 'text-red-400', cool: 'bg-emerald-50 dark:bg-emerald-950/30', coolIcon: 'text-emerald-500' },
              { hot: 'bg-rose-50 dark:bg-rose-950/30', hotIcon: 'text-rose-400', cool: 'bg-sky-50 dark:bg-sky-950/30', coolIcon: 'text-sky-500' },
              { hot: 'bg-yellow-50 dark:bg-yellow-950/30', hotIcon: 'text-yellow-500', cool: 'bg-indigo-50 dark:bg-indigo-950/30', coolIcon: 'text-indigo-400' },
              { hot: 'bg-orange-50 dark:bg-orange-950/30', hotIcon: 'text-orange-400', cool: 'bg-violet-50 dark:bg-violet-950/30', coolIcon: 'text-violet-400' },
            ];

            return (
              <div data-temp-section className="mb-4 bg-white dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                <div className="flex items-center mb-4">
                  <h4 
                    className="text-[11px] font-semibold uppercase tracking-[0.05em] flex items-center gap-2"
                    style={{ color: 'rgb(116 128 145)' }}
                  >
                    <Thermometer size={14} className="opacity-60" />
                    Suhu Saat Keberangkatan
                  </h4>
                </div>
                
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {citiesWithTemp.map((city, idx) => {
                    const temp = getTemperature(city.key, depMonth)!;
                    const isHot = temp.high > 28;
                    const style = iconStyles[idx % iconStyles.length];

                    return (
                      <div key={city.key} className="flex items-center gap-2.5">
                        <div className={`p-2 rounded-xl shrink-0 ${isHot ? style.hot : style.cool}`}>
                          {isHot ? (
                            <Sun size={16} className={isHot ? style.hotIcon : style.coolIcon} />
                          ) : (
                            <CloudSun size={16} className={style.coolIcon} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="block text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-0.5 truncate">{city.label}</span>
                          <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100 tabular-nums leading-none whitespace-nowrap">
                            {temp.low}<span className="text-slate-400 dark:text-slate-500 font-normal mx-0.5">–</span>{temp.high}<span className="text-[10px] ml-0.5 font-bold text-slate-400 dark:text-slate-500">°C</span>
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}


        </div>
      </div>
      </div>
    </div>

      {/* Brochure Modal */}
      {pkg.brosurUrl && (
        <BrochureModal
          isOpen={isBrochureOpen}
          onClose={() => setIsBrochureOpen(false)}
          imageUrl={pkg.brosurUrl}
          title={pkg.nama}
        />
      )}

      {/* Itinerary Modal */}
      {pkg.itineraryUrl && (
        <Suspense fallback={null}>
          <ItineraryModal
            isOpen={isItineraryOpen}
            onClose={() => setIsItineraryOpen(false)}
            fileUrl={pkg.itineraryUrl}
            title={pkg.nama}
            paket={pkg}
            agentSlug={agentSlug || null}
            agentName={currentAgent?.name || null}
            agentPhone={currentAgent?.phone || null}
            agentPhoto={currentAgent?.photo || null}
          />
        </Suspense>
      )}

      {/* Tanya AI Modal (agent-mode only) */}
      {currentAgent && agentSlug && (
        <Suspense fallback={null}>
          <AskAIModal
            isOpen={askAIOpen}
            onClose={() => setAskAIOpen(false)}
            packageName={pkg.nama}
            jadwalId={pkg.jadwalId}
            yearCode="1448"
            agentSlug={agentSlug}
            agentName={currentAgent.name}
            agentPhone={currentAgent.phone}
            agentPhoto={currentAgent.photo}
          />
        </Suspense>
      )}


      {/* AI Copywriting Modal */}
      {createPortal(
        <AnimatePresence>
          {isAiCopyOpen && (
            <motion.div
              className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* Backdrop */}
              <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => setIsAiCopyOpen(false)}
              />

              {/* Modal Content */}
              <motion.div
                className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    <Sparkles size={18} className="text-indigo-500" />
                    <h2 className="text-base font-bold text-gray-900 dark:text-white">AI Copywriting Generator</h2>
                  </div>
                  <button
                    onClick={() => setIsAiCopyOpen(false)}
                    className="p-1.5 bg-gray-100 dark:bg-slate-700 rounded-full text-gray-500 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4">
                  {aiLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <Loader2 size={32} className="text-indigo-500 animate-spin" />
                      <p className="text-sm text-gray-500 dark:text-slate-400 font-medium">Sedang menulis copywriting...</p>
                    </div>
                  ) : aiError && !aiCopyText ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                      <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                        <X size={24} className="text-red-500" />
                      </div>
                      <p className="text-sm text-red-600 dark:text-red-400 font-medium">{aiError}</p>
                      <button
                        onClick={generateAiCopy}
                        className="text-sm text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                      >
                        Coba lagi
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Error banner with fallback text shown below */}
                      {aiError && (
                        <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl flex items-start gap-2">
                          <span className="text-amber-500 mt-0.5 flex-shrink-0">⚠️</span>
                          <div className="flex-1">
                            <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">{aiError}</p>
                            <button
                              onClick={generateAiCopy}
                              disabled={aiLoading}
                              className="mt-1 text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                            >
                              🔄 Coba Lagi dengan AI
                            </button>
                          </div>
                        </div>
                      )}
                      {aiError && (
                        <p className="text-[11px] text-gray-400 dark:text-slate-500 mb-2 italic">* Teks di bawah adalah template, bukan hasil AI</p>
                      )}
                      <div className="bg-gray-50 dark:bg-slate-900/60 border border-gray-100 dark:border-slate-700 rounded-xl p-4 text-sm text-gray-700 dark:text-slate-200 leading-relaxed whitespace-pre-line">
                        {aiCopyText}
                      </div>
                    </>
                  )}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-gray-200 dark:border-slate-700 flex gap-3">
                  {/* Buat Ulang Button */}
                  <button
                    onClick={generateAiCopy}
                    disabled={aiLoading}
                    className={`
                      flex-1 flex items-center justify-center gap-2 py-3.5 px-4
                      rounded-xl font-bold
                      border-2 border-emerald-600 dark:border-emerald-400
                      text-emerald-700 dark:text-emerald-300
                      hover:bg-emerald-50 dark:hover:bg-emerald-900/30
                      transition-all duration-200 active:scale-[0.98]
                      ${aiLoading ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                  >
                    <RefreshCw size={20} />
                    <span>Refresh</span>
                  </button>

                  {/* Salin Teks Button */}
                  <button
                    disabled={aiLoading || !aiCopyText}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(aiCopyText);
                      } catch {
                        const ta = document.createElement('textarea');
                        ta.value = aiCopyText;
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand('copy');
                        document.body.removeChild(ta);
                      }
                      setAiCopied(true);
                      setTimeout(() => setAiCopied(false), 2000);
                    }}
                    className={`
                      flex-1 flex items-center justify-center gap-2 py-3.5 px-4
                      rounded-xl font-bold text-white
                      transition-all duration-200 active:scale-[0.98]
                      ${aiLoading || !aiCopyText ? 'opacity-50 cursor-not-allowed' : ''}
                      ${aiCopied
                        ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30'
                        : 'bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20'
                      }
                    `}
                  >
                    {aiCopied ? (
                      <><ClipboardCheck size={20} /><span>Copied!</span></>
                    ) : (
                      <><Copy size={20} /><span>Copy</span></>
                    )}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Full Screen Screenshot Preview Overlay */}
      {createPortal(
        <AnimatePresence>
          {previewImage && (
            <motion.div
              className="fixed inset-0 z-[9999] bg-white dark:bg-slate-900 flex flex-col"
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            >

              {/* ─── STICKY HEADER ─── */}
              <div className="flex-none sticky top-0 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-gray-200/60 dark:border-slate-700/60 px-5 py-4 flex justify-between items-center shadow-sm">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate pr-4">
                  Simpan Brosur
                </h2>
                <button
                  onClick={() => setPreviewImage(null)}
                  className="p-2 bg-gray-100 dark:bg-slate-800 rounded-full text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors shrink-0"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* ─── SCROLLABLE CONTENT ─── */}
              <div className="flex-1 overflow-y-auto bg-gray-100 dark:bg-slate-950 p-4 flex flex-col items-center gap-3">

                {/* ─── GRADIENT COLOR PICKER (above screenshot) ─── */}
                <div className="max-w-md w-full">
                  <div className="flex items-center justify-center gap-3">
                    {GRADIENT_PRESETS.map((preset, index) => (
                      <button
                        key={preset.name}
                        disabled={isCapturing}
                        onClick={() => {
                          if (index === selectedGradient) return;
                          gradientRef.current = index;
                          setSelectedGradient(index);
                          // Re-generate screenshot in-place (don't clear previewImage)
                          handleScreenshot();
                        }}
                        className={`
                          relative w-9 h-9 rounded-full shrink-0
                          transition-all duration-200
                          ${selectedGradient === index 
                            ? 'ring-2 ring-offset-2 ring-emerald-500 dark:ring-offset-gray-100 dark:dark:ring-offset-slate-950 scale-110' 
                            : 'ring-1 ring-gray-300 dark:ring-slate-600 hover:scale-105 opacity-70 hover:opacity-100'
                          }
                          ${isCapturing ? 'pointer-events-none' : ''}
                        `}
                        style={{ background: preset.css }}
                        aria-label={preset.name}
                        title={preset.name}
                      />
                    ))}
                  </div>
                </div>

                {/* ─── SCREENSHOT PREVIEW ─── */}
                <div className="relative bg-white dark:bg-slate-800 p-2 rounded-xl shadow-lg max-w-md w-full">
                  <img
                    src={previewImage}
                    alt="Screenshot Paket"
                    className={`w-full h-auto rounded-lg object-contain transition-opacity duration-300 ${isCapturing ? 'opacity-30' : 'opacity-100'}`}
                  />
                  {/* Loading overlay while regenerating */}
                  {isCapturing && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                    </div>
                  )}
                </div>
              </div>

              {/* ─── FOOTER ─── */}
              <div className="flex-none sticky bottom-0 bg-white dark:bg-slate-900 border-t border-gray-200/60 dark:border-slate-700/60 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                <button
                  onClick={handleShareScreenshot}
                  className="
                    w-full flex items-center justify-center gap-2 py-3.5 px-4
                    rounded-xl font-bold text-white
                    bg-emerald-600 hover:bg-emerald-700
                    shadow-lg shadow-emerald-500/20
                    transition-all duration-200 active:scale-[0.98] disabled:opacity-70
                  "
                >
                  <Share2 size={20} />
                  <span>Bagikan Sekarang</span>
                </button>
              </div>

            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

    </>
  );
}

export default PackageCard;

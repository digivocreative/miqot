'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { PlaneTakeoff, PlaneLanding, Building2, Camera, Loader2, X, Share2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import { UmrohPackage, RoomPricing } from '@/types';
import { BrochureModal } from './BrochureModal';
import { ItineraryModal } from './ItineraryModal';

interface PackageCardProps {
  package: UmrohPackage;
  /** Agent information for the expanded view */
  agent?: {
    name: string;
    photo?: string;
    website?: string;
    phone: string;
  };
  /** Control expansion from parent */
  isExpanded?: boolean;
  /** Callback to toggle expansion */
  onToggle?: () => void;
  /** Callback when expand state changes (for backward compatibility or extra monitoring) */
  onExpandChange?: (expanded: boolean) => void;
}

// Default agent if not provided
const DEFAULT_AGENT = {
  name: 'Ahmad Sulaiman',
  photo: '',
  website: 'www.umroh.id',
  phone: '+62 812-3456-7890',
};


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



/**
 * PackageCard Component - Expandable Card
 * Displays Umroh package information with expand/collapse functionality
 */
export function PackageCard({ 
  package: pkg, 
  agent = DEFAULT_AGENT,
  isExpanded = false,
  onToggle,
  onExpandChange 
}: PackageCardProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [isBrochureOpen, setIsBrochureOpen] = useState(false);
  const [isItineraryOpen, setIsItineraryOpen] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

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

  /**
   * Helper to check if arrival time is next day
   * Returns true if arrival (end) is numerically smaller than departure (start)
   */
  const isNextDay = (start: string, end: string): boolean => {
    if (!start || !end) return false;
    const startTime = parseFloat(start.replace(':', '.'));
    const endTime = parseFloat(end.replace(':', '.'));
    return endTime < startTime;
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
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
  };

  // Handle Screenshot & Share (Smart Styling Strategy)
  const handleScreenshot = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!cardRef.current) return;
    setIsCapturing(true);

    try {
      // 1. CLONE & GHOST STRATEGY
      const original = cardRef.current;
      const clone = original.cloneNode(true) as HTMLElement;

      // Setup Ghost Element (Invisible but Rendered)
      Object.assign(clone.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '500px', // Lebar Fix ideal
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

      // 3. RENDER HTML2CANVAS (SMART STYLING)
      const canvas = await html2canvas(clone, {
        useCORS: true,
        scale: 2, 
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (doc) => {
           // Ambil clone kita dengan selector aman
           const clonedCard = doc.querySelector('[data-cloned="true"]') as HTMLElement;
           if (!clonedCard) return;

           // A. FORCE LIGHT MODE GLOBAL (Di dalam iframe html2canvas)
           doc.documentElement.classList.remove('dark');
           clonedCard.classList.remove('dark');
           
           // B. HIDE SEAT SECTION (Metode Berlapis)
           // Cara 1: Class Selector
           const seatByClass = clonedCard.querySelector('.seat-info-section');
           if (seatByClass) seatByClass.remove();

           // Cara 2: Text Search Fallback
           const allDivs = clonedCard.querySelectorAll('div');
           allDivs.forEach(div => {
              // Hindari menghapus container utama
              if (div.getAttribute('data-cloned') === 'true') return;
              if (div.contains(clonedCard)) return; // Jangan hapus parent

              const text = div.innerText || "";
              // Jika ketemu kata kunci spesifik progress bar
              if (text.includes("SISA") && text.includes("DARI") && text.includes("%")) {
                  div.style.display = 'none';
              }
           });

           // C. SMART TEXT WRAPPING (Hanya Text, Jangan Container)
           const textTags = clonedCard.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, li');
           
           textTags.forEach((el) => {
               const element = el as HTMLElement;
               
               // Reset aturan pemotongan teks
               element.style.whiteSpace = 'normal'; 
               element.style.overflow = 'visible';
               element.style.textOverflow = 'clip';
               element.style.webkitLineClamp = 'unset'; // Hapus line-clamp
               
               // JANGAN ubah display property! Biarkan flex item tetap flex item.
               
               // Fix warna text (force dark gray/black)
               // Set priority !important agar tidak tertimpa class tailwind
               element.style.setProperty('color', '#1f2937', 'important');
           });
           
           // D. FINAL TOUCHES
           clonedCard.style.height = 'auto';
           clonedCard.style.padding = '24px';
           clonedCard.style.borderRadius = '0';
           clonedCard.style.boxShadow = 'none';
        }
      });

      // Cleanup
      document.body.removeChild(clone);

      // 4. SHOW PREVIEW
      const imageDataType = canvas.toDataURL("image/png");
      setPreviewImage(imageDataType);

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

  // Function to actually share from the preview modal
  const sharePreview = async () => {
    if (!previewImage) return;
    
    try {
      // Convert Base64 DataURL back to Blob/File for sharing
      const blob = await (await fetch(previewImage)).blob();
      const file = new File([blob], `paket-${pkg.nama.replace(/\s+/g, '-').toLowerCase()}.png`, { type: 'image/png' });
      const message = getShareMessage();

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: pkg.nama,
          text: message
        });
      } else {
        // Fallback download
        const link = document.createElement('a');
        link.href = previewImage;
        link.download = `paket-${pkg.nama.replace(/\s+/g, '-').toLowerCase()}.png`;
        link.click();
      }
    } catch (err) {
      console.log("Share dibatalkan/error", err);
    }
  };

  /**
   * Sub-component: Seat and Date Section
   * Extracted to be rendered in different positions based on expansion state
   */
  const SeatAndDateSection = ({ isFooter = false }: { isFooter?: boolean }) => {
    const percentage = (pkg.seatSisa / pkg.seatTotal) * 100;

    const getStatusStyle = (pct: number) => {
      // Kondisi Habis (0%) atau Kritis (< 5%)
      if (pct < 5) {
        return {
          bar: 'bg-red-600 dark:bg-red-500', 
          text: 'text-red-600 dark:text-red-400' 
        };
      }
      // Kondisi Siaga (5% - 19%)
      if (pct < 20) {
        return {
          bar: 'bg-rose-500', 
          text: 'text-rose-600 dark:text-rose-400'
        };
      }
      // Kondisi Waspada (20% - 50%)
      if (pct <= 50) {
        return {
          bar: 'bg-orange-500', 
          text: 'text-orange-500 dark:text-orange-400'
        };
      }
      // Kondisi Aman (> 50%)
      return {
        bar: 'bg-emerald-500', 
        text: 'text-emerald-600 dark:text-emerald-400'
      };
    };

    const statusStyle = getStatusStyle(percentage);

    return (
      <div className={`
        seat-info-section flex items-end gap-4 transition-all duration-300
        ${isFooter
          ? "mb-[10px] p-3 bg-gray-50 dark:bg-slate-900/50 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm"
          : "mt-3 pt-3 border-t border-gray-100 dark:border-slate-700/50"
        }
      `}>
        {/* Left: Seat Info & Progress Bar */}
        <div className="flex-1">
          <div className="flex justify-between items-center mb-1.5">
            <p className="text-xs font-medium">
              <span className={statusStyle.text}>
                SISA {pkg.seatSisa}
              </span>
              <span className="text-gray-400 dark:text-slate-400 font-semibold"> DARI {pkg.seatTotal}</span>
            </p>
            <p className={`text-xs font-semibold ${statusStyle.text}`}>
              {Math.round(percentage)}%
            </p>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${statusStyle.bar}`}
              style={{ width: `${percentage}%` }}
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

  return (
    <>
    <div
      ref={cardRef}
      data-card-ref="true"
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


      <div className="relative z-10">

      {/* ============================================ */}
      {/* COLLAPSED VIEW (Always Visible) */}
      {/* ============================================ */}
      <div className={isExpanded ? "pt-4 px-4 pb-0" : "p-4"}>
        {/* Header: Title & Price */}
        <div className="flex justify-between items-start gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 dark:text-slate-100 text-sm leading-tight line-clamp-2">
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
                <span className="font-medium text-gray-700 dark:text-slate-200">{pkg.keberangkatan.kodePenerbangan}</span>
                <span>/</span>
                <span>{formatDate(pkg.keberangkatan.tgl)}</span>
              </p>
              <p className="text-xs text-gray-600 dark:text-slate-300">
                {pkg.keberangkatan.jam.replace('.', ':')} - {pkg.kepulangan.jam.replace('.', ':')}
                {isNextDay(pkg.keberangkatan.jam, pkg.kepulangan.jam) && (
                  <span className="ml-1 font-bold text-orange-600 text-[10px]">(+1)</span>
                )}
              </p>
            </div>
          </div>

          {/* Return */}
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 flex items-center justify-center text-emerald-600 mt-0.5">
              <PlaneLanding size={16} />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-slate-400 flex items-center gap-1">
                <span className="font-medium text-gray-700 dark:text-slate-200">{pkg.kepulangan.kodePenerbangan}</span>
                <span>/</span>
                <span>{formatDate(pkg.kepulangan.tgl)}</span>
              </p>
              <p className="text-xs text-gray-600 dark:text-slate-300">
                {pkg.kepulangan.jam.replace('.', ':')} - {pkg.keberangkatan.jam.replace('.', ':')}
                {isNextDay(pkg.kepulangan.jam, pkg.keberangkatan.jam) && (
                  <span className="ml-1 font-bold text-orange-600 text-[10px]">(+1)</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Hotel Information - 2 Column Grid */}
        <div className="grid grid-cols-2 gap-3 mb-2">
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
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: parseInt(hotelInfo.mekkah_bintang) }).map((_, i) => (
                      <span key={i} className="text-[8px] text-amber-400">★</span>
                    ))}
                  </div>
                  {hotelInfo.mekkah_jarak && (
                    <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                      ± {hotelInfo.mekkah_jarak}
                    </span>
                  )}
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
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: parseInt(hotelInfo.madinah_bintang) }).map((_, i) => (
                      <span key={i} className="text-[8px] text-amber-400">★</span>
                    ))}
                  </div>
                  {hotelInfo.madinah_jarak && (
                    <span className="text-[10px] text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                      ± {hotelInfo.madinah_jarak}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Availability Bar + Departure Date (Only when Collapsed) */}
        {!isExpanded && <SeatAndDateSection isFooter={false} />}
      </div>

      {/* ============================================ */}
      {/* EXPANDED VIEW (Animated) */}
      {/* ============================================ */}
      <div
        className="overflow-hidden transition-all duration-300 ease-out"
        style={{ 
          maxHeight: isExpanded ? `${contentHeight}px` : '0px',
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div ref={contentRef} className="px-4 pb-4">
          {/* Divider */}
          <div className="border-t border-dashed border-gray-200 dark:border-slate-700 my-2" />
          
          {/* ---- New Info Section: Landing & Manasik ---- */}
          <div className="grid grid-cols-2 gap-3 mb-2 bg-gray-50 dark:bg-slate-900/50 p-3 rounded-lg">
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
                        <div className="flex items-center gap-0.5 mt-0.5">
                          {Array.from({ length: parseInt(hotel.star) }).map((_, i) => (
                            <span key={i} className="text-[8px] text-amber-400">★</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---- Action Buttons (4 columns) ---- */}
          <div data-html2canvas-ignore className="grid grid-cols-4 gap-2 mt-0 mb-4">
            {pkg.itineraryUrl ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsItineraryOpen(true);
                }}
                className="flex flex-col items-center justify-center py-3 px-2 rounded-xl border-2 transition-all border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 dark:border-slate-700 dark:hover:border-emerald-500"
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

            {pkg.brosurUrl && pkg.brosurUrl.length > 0 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsBrochureOpen(true);
                }}
                className="flex flex-col items-center justify-center py-3 px-2 rounded-xl border-2 transition-all border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 dark:border-slate-700 dark:hover:border-emerald-500"
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

            {/* Screenshot & Share Button */}
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

          {/* ---- Pricing Table (Compact) ---- */}
           {/* ---- Pricing Table (Compact) ---- */}
          <div className="mb-4">
            <h4 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Rincian Biaya Paket
            </h4>
            <div className="border-t border-gray-100 dark:border-slate-700">
              {pricing?.Quard && (
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-slate-700">
                  <span className="text-sm text-gray-600 dark:text-slate-300">Quad (Sekamar 4)</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">Rp {formatRupiah(pricing.Quard)}</span>
                </div>
              )}
              {pricing?.Triple && (
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-slate-700">
                  <span className="text-sm text-gray-600 dark:text-slate-300">Triple (Sekamar 3)</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">Rp {formatRupiah(pricing.Triple)}</span>
                </div>
              )}
              {pricing?.Double && (
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-slate-700">
                  <span className="text-sm text-gray-600 dark:text-slate-300">Double (Sekamar 2)</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">Rp {formatRupiah(pricing.Double)}</span>
                </div>
              )}
              {pricing?.Single && (
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-slate-700">
                  <span className="text-sm text-gray-600 dark:text-slate-300">Single (1 Orang)</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">Rp {formatRupiah(pricing.Single)}</span>
                </div>
              )}
              {pricing?.Infant && (
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-slate-700">
                  <span className="text-sm text-gray-600 dark:text-slate-300">Infant ({'<'}2 Thn)</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">Rp {formatRupiah(pricing.Infant)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Availability Bar + Departure Date (Only when Expanded) */}
          {isExpanded && <SeatAndDateSection isFooter={true} />}
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
        <ItineraryModal
          isOpen={isItineraryOpen}
          onClose={() => setIsItineraryOpen(false)}
          fileUrl={pkg.itineraryUrl}
          title={pkg.nama}
        />
      )}

      {/* Screenshot Preview Modal (Fixed Overlay) */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-sm w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
              <h3 className="font-bold text-gray-900 dark:text-white">Preview Gambar</h3>
              <button 
                onClick={() => setPreviewImage(null)}
                className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            {/* Image Container */}
            <div className="flex-1 overflow-auto p-4 bg-gray-50 dark:bg-slate-900/50 flex items-center justify-center">
              <img 
                src={previewImage} 
                alt="Preview" 
                className="w-full h-auto object-contain shadow-lg rounded"
              />
            </div>

            {/* Footer / Actions */}
            <div className="p-4 bg-white dark:bg-slate-800 border-t border-gray-100 dark:border-slate-700 space-y-3">
              <p className="text-[11px] text-center text-gray-500 dark:text-slate-400">
                Klik "Bagikan" atau tap & hold gambar untuk menyimpan manual.
              </p>
              
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setPreviewImage(null)}
                  className="w-full py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={sharePreview}
                  className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-lg shadow-purple-200 dark:shadow-none flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <Share2 size={18} />
                  Bagikan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default PackageCard;

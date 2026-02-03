'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { PlaneTakeoff, PlaneLanding, Building2 } from 'lucide-react';
import { UmrohPackage, RoomPricing } from '@/types';

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



  return (
    <div
      onClick={handleCardClick}
      className={`
        bg-white rounded-xl overflow-hidden cursor-pointer
        transition-all duration-300 ease-out
        ${isExpanded 
          ? 'shadow-lg ring-1 ring-emerald-100 pb-2' 
          : 'shadow-sm border border-gray-100 hover:shadow-md pb-1'
        }
      `}
    >
      {/* ============================================ */}
      {/* COLLAPSED VIEW (Always Visible) */}
      {/* ============================================ */}
      <div className="p-4">
        {/* Header: Title & Price */}
        <div className="flex justify-between items-start gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 text-sm leading-tight line-clamp-2">
              {pkg.nama}
            </h3>
            {pkg.isPromo && (
              <span className="inline-block mt-1 px-2 py-0.5 bg-red-100 text-red-600 text-xs font-medium rounded">
                PROMO
              </span>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-gray-500">MULAI</p>
            <p className="text-lg font-bold text-orange-600">
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
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <span className="font-medium text-gray-700">{pkg.keberangkatan.kodePenerbangan}</span>
                <span>•</span>
                <span>{formatDate(pkg.keberangkatan.tgl)}</span>
              </p>
              <p className="text-xs text-gray-600">
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
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <span className="font-medium text-gray-700">{pkg.kepulangan.kodePenerbangan}</span>
                <span>•</span>
                <span>{formatDate(pkg.kepulangan.tgl)}</span>
              </p>
              <p className="text-xs text-gray-600">
                {pkg.kepulangan.jam.replace('.', ':')} - {pkg.keberangkatan.jam.replace('.', ':')}
                {isNextDay(pkg.kepulangan.jam, pkg.keberangkatan.jam) && (
                  <span className="ml-1 font-bold text-orange-600 text-[10px]">(+1)</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Hotel Information - 2 Column Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Makkah Hotel */}
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 flex items-center justify-center text-emerald-600 mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M19.006 3.705a.75.75 0 1 0-.512-1.41L6 6.838V3a.75.75 0 0 0-.75-.75h-1.5A.75.75 0 0 0 3 3v4.93l-1.006.365a.75.75 0 0 0 .512 1.41l16.5-6Z" />
                <path fillRule="evenodd" d="M3.019 11.115 18 5.667V9.09l4.006 1.456a.75.75 0 1 1-.512 1.41l-.494-.18v8.475h.75a.75.75 0 0 1 0 1.5H2.25a.75.75 0 0 1 0-1.5H3v-9.129l.019-.006ZM18 20.25v-9.565l1.5.545v9.02H18Zm-9-6a.75.75 0 0 0-.75.75v4.5c0 .414.336.75.75.75h3a.75.75 0 0 0 .75-.75V15a.75.75 0 0 0-.75-.75H9Z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Mekkah</p>
              <p className="text-xs text-gray-700 font-medium line-clamp-1">
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
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Madinah</p>
              <p className="text-xs text-gray-700 font-medium line-clamp-1">
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
                    <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                      ± {hotelInfo.madinah_jarak}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Availability Bar */}
        <div className="pt-3 border-t border-gray-100">
          <div className="flex justify-between items-center mb-1.5">
            <p className="text-xs font-medium">
              <span className={isCritical ? 'text-red-600' : isLowStock ? 'text-orange-600' : 'text-gray-700'}>
                SISA {pkg.seatSisa}
              </span>
              <span className="text-gray-400 font-semibold"> DARI {pkg.seatTotal} SEAT</span>
            </p>
            <p className={`text-xs font-semibold ${isCritical ? 'text-red-600' : isLowStock ? 'text-orange-600' : 'text-emerald-600'}`}>
              {availabilityPercentage}% TERSEDIA
            </p>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isCritical 
                  ? 'bg-gradient-to-r from-red-500 to-red-600' 
                  : isLowStock 
                    ? 'bg-gradient-to-r from-orange-400 to-orange-500'
                    : 'bg-gradient-to-r from-emerald-400 to-emerald-500'
              }`}
              style={{ width: `${availabilityPercentage}%` }}
            />
          </div>
        </div>
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
          <div className="border-t border-dashed border-gray-200 my-4" />
          
          {/* ---- New Info Section: Landing & Manasik ---- */}
          <div className="grid grid-cols-2 gap-3 mb-4 bg-gray-50 p-3 rounded-lg">
            {/* Landing Info */}
            <div className="flex items-start gap-2">
              <div className="w-5 h-5 flex items-center justify-center text-emerald-600 mt-0.5">
                <PlaneLanding size={16} />
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Landing di</p>
                <p className="text-sm font-semibold text-gray-900">
                  {(() => {
                    const routeParts = pkg.keberangkatan.rute.split(' - ');
                    const airportCode = routeParts.length > 1 ? routeParts[1].trim() : 'JED';
                    const airportMap: Record<string, string> = {
                      'JED': 'Jeddah',
                      'MED': 'Madinah',
                      'CKG': 'Jakarta',
                      'CGK': 'Jakarta', // Common typo handling
                      'SUB': 'Surabaya',
                      'KNO': 'Kualanamu',
                      'CAI': 'Cairo',
                      'IST': 'Istanbul',
                      'DXB': 'Dubai',
                    };
                    return airportMap[airportCode] || airportCode;
                  })()}
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
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Manasik</p>
                <p className="text-sm font-semibold text-gray-900">
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
            <div className="mb-4 pt-3 border-t border-gray-100">
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
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{hotel.city}</p>
                      <p className="text-xs text-gray-700 font-medium line-clamp-1">
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

          {/* ---- Action Buttons (Reordered) ---- */}
          <div className="grid grid-cols-2 gap-3 mt-0 mb-4">
            <a
              href={pkg.itineraryUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.stopPropagation();
                if (!pkg.itineraryUrl) e.preventDefault();
              }}
              className={`
                flex flex-col items-center justify-center py-3 px-4 rounded-xl border-2 transition-all
                ${pkg.itineraryUrl 
                  ? 'border-gray-200 hover:border-emerald-300 hover:bg-emerald-50' 
                  : 'border-gray-100 opacity-50 cursor-not-allowed'
                }
              `}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-gray-500 mb-1">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
              <span className="text-xs font-medium text-gray-600">Itinerary</span>
            </a>

            <a
              href={pkg.brosurUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.stopPropagation();
                if (!pkg.brosurUrl) e.preventDefault();
              }}
              className={`
                flex flex-col items-center justify-center py-3 px-4 rounded-xl border-2 transition-all
                ${pkg.brosurUrl 
                  ? 'border-gray-200 hover:border-emerald-300 hover:bg-emerald-50' 
                  : 'border-gray-100 opacity-50 cursor-not-allowed'
                }
              `}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-gray-500 mb-1">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              <span className="text-xs font-medium text-gray-600">Brosur</span>
            </a>
          </div>

          {/* ---- Pricing Table (Compact) ---- */}
          <div className="mb-6">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Rincian Biaya Paket
            </h4>
            <div className="border-t border-gray-100">
              {pricing?.Quard && (
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Quad (Sekamar 4)</span>
                  <span className="text-sm font-semibold text-gray-900">Rp {formatRupiah(pricing.Quard)}</span>
                </div>
              )}
              {pricing?.Triple && (
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Triple (Sekamar 3)</span>
                  <span className="text-sm font-semibold text-gray-900">Rp {formatRupiah(pricing.Triple)}</span>
                </div>
              )}
              {pricing?.Double && (
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Double (Sekamar 2)</span>
                  <span className="text-sm font-semibold text-gray-900">Rp {formatRupiah(pricing.Double)}</span>
                </div>
              )}
              {pricing?.Single && (
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Single (1 Orang)</span>
                  <span className="text-sm font-semibold text-gray-900">Rp {formatRupiah(pricing.Single)}</span>
                </div>
              )}
              {pricing?.Infant && (
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Infant ({'<'}2 Thn)</span>
                  <span className="text-sm font-semibold text-gray-900">Rp {formatRupiah(pricing.Infant)}</span>
                </div>
              )}
            </div>
          </div>



        </div>
      </div>
    </div>
  );
}

export default PackageCard;

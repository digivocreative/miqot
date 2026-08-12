import type { JourneyLabel, UmrohPackage } from '@/types';

export type JourneyStepTone = 'tour' | 'madinah' | 'umroh';

export interface JourneyStep {
  label: string;
  imageSrc: string;
  imageAlt: string;
  symbol: string;
  tone: JourneyStepTone;
}

interface TourConfig {
  label: Exclude<JourneyLabel, 'Madinah' | 'Umroh'>;
  codes: string[];
  cities: string[];
  pattern: RegExp;
  imageSrc: string;
  symbol: string;
  fallbackPlacement: 'pre' | 'post';
}

const SAUDI_AIRPORTS = new Set(['JED', 'MED']);

const LANDING_AIRPORT_MAP: Record<string, string> = {
  JED: 'Jeddah',
  MED: 'Madinah',
  CKG: 'Jakarta',
  CGK: 'Jakarta',
  SUB: 'Surabaya',
  KNO: 'Kualanamu',
  CAI: 'Cairo',
  ALY: 'Alexandria',
  IST: 'Istanbul',
  SAW: 'Istanbul',
  DXB: 'Dubai',
  AUH: 'Abu Dhabi',
  AMM: 'Amman',
  HAK: 'Haikou',
  PEK: 'Beijing',
  SHA: 'Shanghai',
  CAN: 'Guangzhou',
};

/**
 * Nama kota dari kode bandara, untuk pembaca yang tak hafal kode IATA. Kode yang
 * tak dikenal dikembalikan apa adanya — lebih baik menampilkan "XYZ" daripada
 * menghilangkan satu simpul dari rute.
 */
export const airportCityName = (code: string): string => {
  const key = String(code || '').trim().toUpperCase();
  return LANDING_AIRPORT_MAP[key] || key;
};

const TOUR_CONFIGS: TourConfig[] = [
  { label: 'Tur Dubai', codes: ['DXB', 'AUH'], cities: ['dubai', 'abu dhabi', 'abudhabi'], pattern: /\b(DUBAI|ABU\s*DHABI|ABUDHABI|DXB|AUH)\b/i, imageSrc: '/flags/uae.png', symbol: '🇦🇪', fallbackPlacement: 'pre' },
  { label: 'Tur Turki', codes: ['IST', 'SAW'], cities: ['istanbul', 'bursa', 'ankara', 'cappadocia'], pattern: /\b(TURKI|TURKEY|ISTANBUL|BURSA|ANKARA|CAPPADOCIA)\b/i, imageSrc: '/flags/turki.png', symbol: '🇹🇷', fallbackPlacement: 'post' },
  { label: 'Tur Mesir', codes: ['CAI', 'ALY'], cities: ['cairo', 'alexandria'], pattern: /\b(MESIR|EGYPT|CAIRO|ALEXANDRIA)\b/i, imageSrc: '/flags/mesir.png', symbol: '🇪🇬', fallbackPlacement: 'pre' },
  { label: 'Tur China', codes: ['HAK', 'PEK', 'SHA', 'CAN'], cities: ['haikou', 'beijing', 'shanghai', 'guangzhou'], pattern: /\b(CHINA|TIONGKOK|HAIKOU|BEIJING|SHANGHAI|GUANGZHOU)\b/i, imageSrc: '/flags/china.png', symbol: '🇨🇳', fallbackPlacement: 'pre' },
  { label: 'Tur Aqsha', codes: ['AMM', 'TLV'], cities: ['aqsha', 'amman', 'petra'], pattern: /\b(AQSHA|AL AQSA|AMMAN|PETRA|JORDAN|PALESTINE)\b/i, imageSrc: '/flags/palestine.svg', symbol: '🇵🇸', fallbackPlacement: 'pre' },
  { label: 'Tur Taif', codes: [], cities: ['taif', 'thaif'], pattern: /\b(TAIF|THAIF)\b/i, imageSrc: '/flags/saudi.png', symbol: '🇸🇦', fallbackPlacement: 'post' },
  { label: 'Ziarah Badar', codes: [], cities: ['badar', 'badr'], pattern: /\b(BADAR|BADR)\b/i, imageSrc: '/flags/saudi.png', symbol: '🇸🇦', fallbackPlacement: 'post' },
  { label: 'Tur Red Sea', codes: [], cities: ['red sea', 'redsea'], pattern: /\b(RED\s*SEA|REDSEA|LAUT\s+MERAH)\b/i, imageSrc: '/flags/saudi.png', symbol: '🇸🇦', fallbackPlacement: 'post' },
];

export const getRouteAirportCodes = (route?: string): string[] => {
  return (route || '').toUpperCase().match(/[A-Z]{3}/g) || [];
};

export const getRouteLegs = (route?: string): Array<{ from: string; to: string }> => {
  return (route || '')
    .split('/')
    .map(segment => {
      const [from, to] = segment.split(/\s*[-–—]\s*/).map(part => part.trim().toUpperCase());
      return from && to ? { from, to } : null;
    })
    .filter((leg): leg is { from: string; to: string } => Boolean(leg));
};

const getSaudiLabelsFromItinerary = (pkg: UmrohPackage): Array<'Madinah' | 'Umroh'> | null => {
  if (!Array.isArray(pkg.journeyOrder)) return null;
  const labels = pkg.journeyOrder.filter((label): label is 'Madinah' | 'Umroh' =>
    label === 'Madinah' || label === 'Umroh'
  );
  return labels.length >= 2 ? labels.slice(0, 2) : null;
};

/**
 * Bandara tempat jamaah mendarat di Saudi.
 *
 * Itinerary otoritatif yang menaruh Umroh lebih dulu memastikan landing JED —
 * field rute upstream bisa salah entri (JBU1600: "CGK-MED / JED-IST" padahal
 * PDF-nya mendarat King Abdulaziz). Kebalikannya TIDAK berlaku: Madinah dulu
 * tak memastikan MED (pola Jum'atain mendarat JED lalu lanjut darat), jadi di
 * luar kasus itu rute yang menentukan — kedatangan Saudi pertama yang bukan
 * sekadar transit (leg berikutnya berangkat dari bandara yang sama), agar leg
 * ekor tur (mis. JED-IST / IST-JED) tidak terbaca sebagai titik landing.
 */
export const getLandingAirportCode = (pkg: UmrohPackage): string => {
  if (pkg.journeyOrderSource === 'itinerary' && getSaudiLabelsFromItinerary(pkg)?.[0] === 'Umroh') {
    return 'JED';
  }

  const routeLegs = getRouteLegs(pkg.keberangkatan?.rute);
  for (let i = 0; i < routeLegs.length; i += 1) {
    if (!SAUDI_AIRPORTS.has(routeLegs[i].to)) continue;
    if (routeLegs[i + 1]?.from === routeLegs[i].to) continue;
    return routeLegs[i].to;
  }
  return (routeLegs.length ? routeLegs[routeLegs.length - 1].to : 'JED') || 'JED';
};

export const getLandingCityName = (pkg: UmrohPackage): string => {
  const airportCode = getLandingAirportCode(pkg);
  return LANDING_AIRPORT_MAP[airportCode] || airportCode;
};

const getSaudiLabelsFromRoute = (pkg: UmrohPackage): Array<'Madinah' | 'Umroh'> | null => {
  const departureLegs = getRouteLegs(pkg.keberangkatan?.rute);
  if (!departureLegs.length) return null;

  const finalDepartureArrival = departureLegs[departureLegs.length - 1].to;
  if (finalDepartureArrival === 'MED') return ['Madinah', 'Umroh'];

  if (finalDepartureArrival === 'JED') {
    const returnLegs = getRouteLegs(pkg.kepulangan?.rute);
    const firstReturnDeparture = returnLegs[0]?.from;
    if (firstReturnDeparture === 'MED') return ['Umroh', 'Madinah'];
    if (firstReturnDeparture === 'JED') return null;
    return ['Umroh', 'Madinah'];
  }

  for (let i = departureLegs.length - 1; i >= 0; i -= 1) {
    if (departureLegs[i].to === 'MED') return ['Madinah', 'Umroh'];
    if (departureLegs[i].to === 'JED') return null;
  }

  return null;
};

const makeStep = (label: string, imageSrc?: string): JourneyStep => {
  if (label === 'Madinah') {
    return { label, imageSrc: '/img-brosur/nabawi-dome.png', imageAlt: 'Dome Masjid Nabawi', symbol: '🕌', tone: 'madinah' };
  }

  if (label === 'Umroh') {
    return { label, imageSrc: '/img-brosur/kabah.png', imageAlt: 'Kaabah', symbol: '🕋', tone: 'umroh' };
  }

  return { label, imageSrc: imageSrc || '/flags/palestine.svg', imageAlt: `Bendera ${label.replace(/^Tur\s+/i, '')}`, symbol: '🌍', tone: 'tour' };
};

const makeJourneyStep = (label: JourneyLabel): JourneyStep => {
  const tour = TOUR_CONFIGS.find(config => config.label === label);
  if (!tour) return makeStep(label);
  return { ...makeStep(label, tour.imageSrc), symbol: tour.symbol };
};

const getAuthoritativeItinerarySteps = (pkg: UmrohPackage): JourneyStep[] | null => {
  if (pkg.journeyOrderSource !== 'itinerary' || !Array.isArray(pkg.journeyOrder)) return null;

  const hasMadinah = pkg.journeyOrder.includes('Madinah');
  const hasUmroh = pkg.journeyOrder.includes('Umroh');
  if (!hasMadinah || !hasUmroh) return null;

  return pkg.journeyOrder.map(makeJourneyStep);
};

/**
 * Simpul tempat jamaah mendarat di Saudi — indeks pertama yang bukan tur.
 *
 * `getLandingAirportCode` mencari kedatangan Saudi pertama yang bukan transit,
 * jadi tur pra-Saudi (mis. Dubai) mendahului rantai tanpa menjadi titik landing
 * yang ditampilkan. Mengembalikan -1 bila rantai kosong atau seluruhnya tur.
 */
export function getLandingStepIndex(steps: JourneyStep[]): number {
  return steps.findIndex(step => step.tone !== 'tour');
}

export function getPackageJourneySteps(pkg: UmrohPackage, extraCityNames: string[] = []): JourneyStep[] {
  const itinerarySteps = getAuthoritativeItinerarySteps(pkg);
  if (itinerarySteps) return itinerarySteps;

  const departureLegs = getRouteLegs(pkg.keberangkatan?.rute);
  const returnCodes = getRouteAirportCodes(pkg.kepulangan?.rute);
  const extraCitySet = new Set(extraCityNames.map(city => city.toLowerCase()));
  const packageName = (pkg.nama || '').toUpperCase();

  // Airport codes alone only prove that the flight passes through a city. For
  // example, Emirates packages commonly transit at DXB without a Dubai tour.
  // Activate a tour only when the package name or its hotel data explicitly
  // identifies the city; route legs below are still used to place a real tour
  // before or after the Saudi portion of the journey.
  const activeTours = TOUR_CONFIGS.filter(tour =>
    tour.cities.some(city => extraCitySet.has(city)) ||
    tour.pattern.test(packageName)
  );

  let saudiLandingLegIndex = -1;
  for (let i = departureLegs.length - 1; i >= 0; i -= 1) {
    if (SAUDI_AIRPORTS.has(departureLegs[i].to)) {
      saudiLandingLegIndex = i;
      break;
    }
  }

  const preSaudiCodes = new Set(
    saudiLandingLegIndex > 0 ? departureLegs.slice(0, saudiLandingLegIndex).map(leg => leg.to) : []
  );
  const returnTransitCodes = new Set(returnCodes.slice(1, -1));
  const preSaudiTours = activeTours.filter(tour => tour.codes.some(code => preSaudiCodes.has(code)));
  const postSaudiTours = activeTours.filter(tour =>
    !preSaudiTours.includes(tour) && tour.codes.some(code => returnTransitCodes.has(code))
  );
  const fallbackTours = activeTours.filter(tour =>
    !preSaudiTours.includes(tour) && !postSaudiTours.includes(tour)
  );

  const fallbackPreTours = fallbackTours.filter(tour => tour.fallbackPlacement === 'pre');
  const fallbackPostTours = fallbackTours.filter(tour => tour.fallbackPlacement === 'post');
  const itinerarySaudiLabels = getSaudiLabelsFromItinerary(pkg);
  const saudiLabels = itinerarySaudiLabels || getSaudiLabelsFromRoute(pkg);
  if (!saudiLabels) return [];
  const tourStep = (tour: TourConfig): JourneyStep => makeJourneyStep(tour.label);

  return [
    ...preSaudiTours.map(tourStep),
    ...fallbackPreTours.map(tourStep),
    ...saudiLabels.map(label => makeStep(label)),
    ...postSaudiTours.map(tourStep),
    ...fallbackPostTours.map(tourStep),
  ];
}

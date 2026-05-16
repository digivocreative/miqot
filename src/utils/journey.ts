import type { UmrohPackage } from '@/types';

export type JourneyStepTone = 'tour' | 'madinah' | 'umroh';

export interface JourneyStep {
  label: string;
  imageSrc: string;
  imageAlt: string;
  symbol: string;
  tone: JourneyStepTone;
}

interface TourConfig {
  label: string;
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
  AMM: 'Amman',
  HAK: 'Haikou',
  PEK: 'Beijing',
  SHA: 'Shanghai',
  CAN: 'Guangzhou',
};

const TOUR_CONFIGS: TourConfig[] = [
  { label: 'Tur Dubai', codes: ['DXB'], cities: ['dubai'], pattern: /\b(DUBAI|DXB)\b/i, imageSrc: '/flags/uae.png', symbol: '🇦🇪', fallbackPlacement: 'pre' },
  { label: 'Tur Turki', codes: ['IST', 'SAW'], cities: ['istanbul', 'bursa', 'ankara', 'cappadocia'], pattern: /\b(TURKI|TURKEY|ISTANBUL|BURSA|ANKARA|CAPPADOCIA)\b/i, imageSrc: '/flags/turki.png', symbol: '🇹🇷', fallbackPlacement: 'post' },
  { label: 'Tur Mesir', codes: ['CAI', 'ALY'], cities: ['cairo', 'alexandria'], pattern: /\b(MESIR|EGYPT|CAIRO|ALEXANDRIA)\b/i, imageSrc: '/flags/mesir.png', symbol: '🇪🇬', fallbackPlacement: 'pre' },
  { label: 'Tur China', codes: ['HAK', 'PEK', 'SHA', 'CAN'], cities: ['haikou', 'beijing', 'shanghai', 'guangzhou'], pattern: /\b(CHINA|TIONGKOK|HAIKOU|BEIJING|SHANGHAI|GUANGZHOU)\b/i, imageSrc: '/flags/china.png', symbol: '🇨🇳', fallbackPlacement: 'pre' },
  { label: 'Tur Aqsha', codes: ['AMM', 'TLV'], cities: ['aqsha', 'amman', 'petra'], pattern: /\b(AQSHA|AL AQSA|AMMAN|PETRA|JORDAN|PALESTINE)\b/i, imageSrc: '/flags/palestine.svg', symbol: '🇵🇸', fallbackPlacement: 'pre' },
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

export const getLandingAirportCode = (pkg: UmrohPackage): string => {
  const routeLegs = getRouteLegs(pkg.keberangkatan?.rute);
  const code = routeLegs.length ? routeLegs[routeLegs.length - 1].to : 'JED';
  return code || 'JED';
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

const getSaudiLabelsFromItinerary = (pkg: UmrohPackage): Array<'Madinah' | 'Umroh'> | null => {
  if (!Array.isArray(pkg.journeyOrder)) return null;
  const labels = pkg.journeyOrder.filter((label): label is 'Madinah' | 'Umroh' =>
    label === 'Madinah' || label === 'Umroh'
  );
  return labels.length >= 2 ? labels.slice(0, 2) : null;
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

export function getPackageJourneySteps(pkg: UmrohPackage, extraCityNames: string[] = []): JourneyStep[] {
  const departureLegs = getRouteLegs(pkg.keberangkatan?.rute);
  const returnCodes = getRouteAirportCodes(pkg.kepulangan?.rute);
  const allRouteCodes = new Set([
    ...getRouteAirportCodes(pkg.keberangkatan?.rute),
    ...returnCodes,
  ]);
  const extraCitySet = new Set(extraCityNames.map(city => city.toLowerCase()));
  const packageName = (pkg.nama || '').toUpperCase();

  const activeTours = TOUR_CONFIGS.filter(tour =>
    tour.cities.some(city => extraCitySet.has(city)) ||
    tour.codes.some(code => allRouteCodes.has(code)) ||
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
  const tourStep = (tour: TourConfig): JourneyStep => ({
    ...makeStep(tour.label, tour.imageSrc),
    symbol: tour.symbol,
  });

  return [
    ...preSaudiTours.map(tourStep),
    ...fallbackPreTours.map(tourStep),
    ...saudiLabels.map(label => makeStep(label)),
    ...postSaudiTours.map(tourStep),
    ...fallbackPostTours.map(tourStep),
  ];
}

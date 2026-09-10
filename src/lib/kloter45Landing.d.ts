export type Kloter45ChecklistId = 'wa' | 'nusuk';

export interface Kloter45Trip {
  kloterLabel: string;
  tripCode: string;
  packageName: string;
  packageVariant: string;
  departureDate: string;
  returnDate: string;
  travelDateRange: string;
  airline: string;
  tourLeader: string;
  totalJamaah: number;
}

export interface Kloter45ChecklistItem {
  id: Kloter45ChecklistId;
  label: string;
}

export interface Kloter45Contact {
  role: 'Tour Leader' | 'Muthowif';
  name: string;
  whatsappDisplay: string;
  whatsappUrl: string;
  photoUrl: string;
  photoObjectPosition: string;
  photoClassName: string;
}

export interface Kloter45Jamaah {
  no: number;
  idUmrah: string;
  name: string;
  gender: 'L' | 'P';
  age: number;
  phone: string;
  phoneMasked: string;
}

export interface Kloter45Group {
  idUmrah: string;
  displayName: string;
  members: Kloter45Jamaah[];
}

export const KLOTER45_SLUG: string;
export const KLOTER45_PUBLIC_PATH: string;
export const KLOTER45_TRIP: Kloter45Trip;
export const KLOTER45_CHECKLIST_ITEMS: Kloter45ChecklistItem[];
export const KLOTER45_CONTACTS: Kloter45Contact[];
export const KLOTER45_JAMAAH: Kloter45Jamaah[];
export function getKloter45Groups(jamaah?: Kloter45Jamaah[]): Kloter45Group[];

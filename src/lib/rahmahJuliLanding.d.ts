export type RahmahJuliChecklistId = 'wa' | 'nusuk' | 'raudhah';
export type RahmahJuliRoomFieldId = 'roomMekkah' | 'roomMadinah';

export interface RahmahJuliTrip {
  packageName: string;
  packageVariant: string;
  departureDate: string;
  travelDateRange: string;
  airline: string;
  tourLeader: string;
  muthowif: string;
  totalJamaah: number;
}

export interface RahmahJuliChecklistItem {
  id: RahmahJuliChecklistId;
  label: string;
}

export interface RahmahJuliRoomField {
  id: RahmahJuliRoomFieldId;
  label: string;
}

export interface RahmahJuliContact {
  role: 'Tour Leader' | 'Muthowif';
  name: string;
  whatsappDisplay: string;
  whatsappUrl: string;
  photoUrl: string;
  photoObjectPosition: string;
  photoClassName: string;
}

export interface RahmahJuliJamaah {
  no: number;
  idUmrah: string;
  name: string;
  gender: 'L' | 'P';
  age: number;
  phone: string;
  phoneMasked: string;
}

export interface RahmahJuliGroup {
  idUmrah: string;
  displayName: string;
  members: RahmahJuliJamaah[];
}

export const RAHMAH_JULI_SLUG: string;
export const RAHMAH_JULI_TRIP: RahmahJuliTrip;
export const RAHMAH_JULI_CHECKLIST_ITEMS: RahmahJuliChecklistItem[];
export const RAHMAH_JULI_ROOM_FIELDS: RahmahJuliRoomField[];
export const RAHMAH_JULI_CONTACTS: RahmahJuliContact[];
export const RAHMAH_JULI_JAMAAH: RahmahJuliJamaah[];
export function getRahmahJuliGroups(jamaah?: RahmahJuliJamaah[]): RahmahJuliGroup[];

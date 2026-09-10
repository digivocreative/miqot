export type KloterChecklistId = 'wa' | 'nusuk';
export type KloterSubPage = 'doa' | 'dzikir' | 'itinerary' | 'room-list';

export interface KloterTripInfo {
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

export interface KloterMeta {
  title: string;
  description: string;
  ogImageUrl: string;
}

export interface KloterChecklistItem {
  id: KloterChecklistId;
  label: string;
}

export interface KloterMenuItem {
  id: KloterSubPage;
  label: string;
  description: string;
}

export interface KloterContact {
  role: 'Tour Leader' | 'Muthowif';
  name: string;
  whatsappDisplay: string;
  whatsappUrl: string;
  photoUrl: string;
  photoObjectPosition: string;
  photoClassName: string;
}

export interface KloterJamaah {
  no: number;
  idUmrah: string;
  name: string;
  gender: 'L' | 'P';
  age: number;
  phone: string;
  phoneMasked: string;
}

export interface KloterGroup {
  idUmrah: string;
  displayName: string;
  members: KloterJamaah[];
}

export interface KloterRoomGuest {
  name: string;
  note?: string;
}
export interface KloterRoom {
  no: number;
  type: 'Double' | 'Twin' | 'Triple' | 'Quad';
  guests: KloterRoomGuest[];
}
export interface KloterRoomHotel {
  city: string;
  name: string;
  nights: number;
  checkIn: string;
  checkOut: string;
}
export interface KloterRoomList {
  id: string;
  label: string;
  title: string;
  updatedAt: string;
  pdfUrl: string;
  hotels: KloterRoomHotel[];
  rooms: KloterRoom[];
}

export interface KloterTrip {
  slug: string;
  publicPath: string;
  code: string;
  kloterLabel: string;
  trip: KloterTripInfo;
  meta: KloterMeta;
  contacts: KloterContact[];
  jamaah: KloterJamaah[];
  roomLists: KloterRoomList[];
}

export const KLOTER_TRIPS: KloterTrip[];
export const KLOTER_SLUGS: string[];
export function findKloterTripBySlug(segment: string | null | undefined): KloterTrip | null;
export const KLOTER_SUB_PAGES: KloterSubPage[];
export const KLOTER_MENU: KloterMenuItem[];
export function resolveKloterSubPage(segment: string | null | undefined): KloterSubPage | null;
export function getKloterSubPagePath(trip: KloterTrip, subPage: KloterSubPage | null): string;
export const KLOTER_CHECKLIST_ITEMS: KloterChecklistItem[];
export function isKloterChecked(
  prep: Record<number, Partial<Record<KloterChecklistId, boolean>>>,
  jamaahNo: number,
  itemId: KloterChecklistId
): boolean;
export function getKloterMemberPhone(prep: Record<number, { phone?: string }>, member: KloterJamaah): string;
export function getKloterGroups(trip: KloterTrip): KloterGroup[];
export function filterKloterGroups(
  groups: KloterGroup[],
  options?: {
    query?: string;
    prep?: Record<number, Partial<Record<KloterChecklistId, boolean>> & { phone?: string }>;
    filter?: 'all' | 'nusuk';
  }
): KloterGroup[];
export function findKloterRoomsByName(roomList: KloterRoomList, query: string): KloterRoom[];

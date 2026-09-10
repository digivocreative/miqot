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
export type Kloter45SubPage = 'doa' | 'dzikir' | 'room-list';
export interface Kloter45MenuItem {
  id: Kloter45SubPage;
  label: string;
  description: string;
}
export interface Kloter45RoomListFile {
  url: string | null;
  label: string;
  updatedAt: string | null;
}
export const KLOTER45_SUB_PAGES: Kloter45SubPage[];
export const KLOTER45_MENU: Kloter45MenuItem[];
export const KLOTER45_ROOM_LIST: Kloter45RoomListFile;
export function resolveKloter45SubPage(segment: string | null | undefined): Kloter45SubPage | null;
export function getKloter45SubPagePath(subPage: Kloter45SubPage | null): string;
export const KLOTER45_TRIP: Kloter45Trip;
export const KLOTER45_CHECKLIST_ITEMS: Kloter45ChecklistItem[];
export const KLOTER45_CONTACTS: Kloter45Contact[];
export const KLOTER45_JAMAAH: Kloter45Jamaah[];
export function getKloter45Groups(jamaah?: Kloter45Jamaah[]): Kloter45Group[];
export function isKloter45Checked(
  prep: Record<number, Partial<Record<Kloter45ChecklistId, boolean>>>,
  jamaahNo: number,
  itemId: Kloter45ChecklistId
): boolean;
export function getKloter45MemberPhone(
  prep: Record<number, { phone?: string }>,
  member: Kloter45Jamaah
): string;
export function filterKloter45Groups(
  groups: Kloter45Group[],
  options?: {
    query?: string;
    prep?: Record<number, Partial<Record<Kloter45ChecklistId, boolean>> & { phone?: string }>;
    filter?: 'all' | 'nusuk';
  }
): Kloter45Group[];

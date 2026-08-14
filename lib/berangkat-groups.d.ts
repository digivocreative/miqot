export interface DestinationFlag {
  code: string;
  label: string;
  src: string;
  fallback: string;
}

export interface BerangkatItem {
  nama: string;
  paket: string | null;
  jadwal_id?: string | null;
  tour_leader?: string | null;
  manasik_tgl?: string | null;
  manasik_jam?: string | null;
  berangkat_kode_penerbangan?: string | null;
  itinerary_ready?: boolean;
  jk: string | null;
  tgl_berangkat: string;
  hari_lagi: number;
  lunas: boolean;
  sisa: number;
  wa: string | null;
}

export interface BerangkatGroup {
  key: string;
  jadwal_id: string | null;
  itinerary_ready: boolean;
  paket: string;
  count: number;
  tour_leader: string | null;
  manasik_tgl: string | null;
  manasik_jam: string | null;
  tgl_berangkat: string;
  berangkat_kode_penerbangan: string | null;
  items: BerangkatItem[];
}

export function getDestinationFlags(paket: string | null | undefined): DestinationFlag[];
export function buildBerangkatGroups(items: BerangkatItem[]): BerangkatGroup[];
export function cleanTourLeader(value: string | null | undefined): string | null;
export function fmtTgl(d: string): string;
export function fmtTglLong(d: string | null | undefined): string;
export function fmtHariLagi(n: number | null): string;
export function realDateKey(value: string | null | undefined): string | null;

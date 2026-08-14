import type { BerangkatGroup, BerangkatItem } from './berangkat-groups.js';

export interface ManasikSession {
  key: string;
  manasik_tgl: string;
  manasik_jam: string | null;
  hari_lagi: number;
  count: number;
  tour_leaders: string[];
  shares_date: boolean;
  groups: BerangkatGroup[];
  items: BerangkatItem[];
}

export const MANASIK_MAX_LEAD_DAYS: number;
export const MANASIK_WINDOW_DAYS: number;
export function normalizeManasikJam(value: string | null | undefined): string | null;
export function wibTodayKey(now?: Date): string;
export function buildManasikSessions(groups: BerangkatGroup[], todayStr: string): ManasikSession[];

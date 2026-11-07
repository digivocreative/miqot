/**
 * Sorotan bergilir di kartu kalender Dashboard: gelembung yang singgah dari
 * tanggal ke tanggal saat kalender terlihat. Semua keputusannya murni di sini
 * (urutan tanggal, isi gelembung, mesin status, posisi, gerbang harian) supaya
 * bisa diuji tanpa DOM — lihat tests/calendar-spotlight.test.js.
 *
 * Spec: docs/superpowers/specs/2026-11-07-kalender-sorotan-bergilir-design.md
 */

import { realDateKey } from '../../lib/berangkat-groups.js';
import type { BerangkatGroup } from '../../lib/berangkat-groups.js';
import type { ManasikSession } from '../../lib/manasik-sessions.js';
import { hasDisplayableDetail } from './calendarEvents';
import type { CalendarEvent, CalendarEventType } from './calendarEvents';

export const SPOTLIGHT_DWELL_MS = 3000;
export const SPOTLIGHT_AUTO_STOPS = 6;
export const SPOTLIGHT_GATE_KEY = 'calendar-spotlight-v1';

// ── Jamaah milik agent per tanggal ──

export interface SpotlightMineEntry {
  count: number;
  jadwalIds: string[];
}

export interface SpotlightMine {
  berangkat: Map<string, SpotlightMineEntry>;
  manasik: Map<string, SpotlightMineEntry>;
}

type MineGroup = Pick<BerangkatGroup, 'jadwal_id' | 'tgl_berangkat' | 'count'>;
type MineSession = Pick<ManasikSession, 'manasik_tgl' | 'count'> & { groups: readonly Pick<BerangkatGroup, 'jadwal_id'>[] };

function addMine(map: Map<string, SpotlightMineEntry>, date: string | null, count: number, jadwalIds: (string | null)[]) {
  if (!date) return;
  const entry = map.get(date) || { count: 0, jadwalIds: [] };
  entry.count += count;
  for (const id of jadwalIds) if (id && !entry.jadwalIds.includes(id)) entry.jadwalIds.push(id);
  map.set(date, entry);
}

export function buildSpotlightMine(groups: readonly MineGroup[], sessions: readonly MineSession[]): SpotlightMine {
  const mine: SpotlightMine = { berangkat: new Map(), manasik: new Map() };
  for (const g of groups || []) addMine(mine.berangkat, realDateKey(g.tgl_berangkat), g.count || 0, [g.jadwal_id]);
  for (const s of sessions || []) addMine(mine.manasik, realDateKey(s.manasik_tgl), s.count || 0, (s.groups || []).map(g => g.jadwal_id));
  return mine;
}

// ── Urutan tanggal ──

/** Jenis event yang punya detail tampil per tanggal — sama dengan titik di grid. */
export function displayableTypesByDate(events: readonly CalendarEvent[]): Map<string, Set<CalendarEventType>> {
  const byDate = new Map<string, Set<CalendarEventType>>();
  for (const ev of events || []) {
    if (!ev.details.some(hasDisplayableDetail)) continue;
    const set = byDate.get(ev.date) || new Set<CalendarEventType>();
    set.add(ev.type);
    byDate.set(ev.date, set);
  }
  return byDate;
}

/**
 * Baris "jamaah Anda" hanya ditulis untuk jenis yang memang ada di tanggal itu,
 * jadi prioritas tanggal pun mengikuti aturan yang sama.
 */
export function hasMineOn(date: string, types: ReadonlySet<CalendarEventType> | undefined, mine: SpotlightMine): boolean {
  if (!types) return false;
  return (types.has('keberangkatan') && (mine.berangkat.get(date)?.count || 0) > 0)
    || (types.has('manasik') && (mine.manasik.get(date)?.count || 0) > 0);
}

export function buildSpotlightDates(a: {
  events: readonly CalendarEvent[];
  year: number;
  month: number;
  todayKey: string;
  mine: SpotlightMine;
}): string[] {
  const monthPrefix = `${a.year}-${String(a.month).padStart(2, '0')}-`;
  if (!a.todayKey.startsWith(monthPrefix)) return [];
  const byDate = displayableTypesByDate(a.events);
  const upcoming = [...byDate.keys()]
    .filter(d => d.startsWith(monthPrefix) && d >= a.todayKey)
    .sort();
  const today = upcoming.filter(d => d === a.todayKey);
  const rest = upcoming.filter(d => d !== a.todayKey);
  const mineDates = rest.filter(d => hasMineOn(d, byDate.get(d), a.mine));
  const others = rest.filter(d => !mineDates.includes(d));
  return [...today, ...mineDates, ...others];
}

// ── Gerbang harian ──

export interface SpotlightStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Cadangan saat localStorage menolak (Safari private, iframe pihak ketiga).
 * Tanpa ini putaran otomatis muncul lagi tiap kalender terlihat; dengan ini
 * sekali-sehari tetap berlaku selama halaman hidup.
 */
let memoryShownDay: string | null = null;

function resolveStorage(storage?: SpotlightStorage | null): SpotlightStorage | null {
  if (storage) return storage;
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function canAutoStartSpotlight(todayKey: string, storage?: SpotlightStorage | null): boolean {
  if (memoryShownDay === todayKey) return false;
  const s = resolveStorage(storage);
  if (!s) return true;
  try {
    return s.getItem(SPOTLIGHT_GATE_KEY) !== todayKey;
  } catch {
    return true;
  }
}

export function markSpotlightShown(todayKey: string, storage?: SpotlightStorage | null): void {
  memoryShownDay = todayKey;
  const s = resolveStorage(storage);
  if (!s) return;
  try {
    s.setItem(SPOTLIGHT_GATE_KEY, todayKey);
  } catch {
    // Cadangan memori di atas sudah mencatatnya.
  }
}

// ── Mesin status ──

export type SpotlightMode = 'auto' | 'manual' | 'hover';

export interface SpotlightState {
  mode: SpotlightMode;
  dates: string[];
  index: number;
  /** Jumlah tanggal yang sudah disinggahi dalam mode auto. */
  shown: number;
  trigger: 'auto' | 'replay' | 'hover';
}

export type SpotlightAction =
  | { type: 'start'; dates: string[]; trigger: 'auto' | 'replay'; reducedMotion: boolean }
  | { type: 'advance' }
  | { type: 'go'; delta: -1 | 1 }
  | { type: 'hover'; date: string }
  | { type: 'hoverEnd' }
  | { type: 'dismiss' };

export function spotlightReducer(state: SpotlightState | null, action: SpotlightAction): SpotlightState | null {
  switch (action.type) {
    case 'start':
      if (action.dates.length === 0) return null;
      return { mode: action.reducedMotion ? 'manual' : 'auto', dates: action.dates, index: 0, shown: 1, trigger: action.trigger };
    case 'advance':
      if (!state || state.mode !== 'auto') return state;
      if (state.shown >= SPOTLIGHT_AUTO_STOPS || state.index >= state.dates.length - 1) return null;
      return { ...state, index: state.index + 1, shown: state.shown + 1 };
    case 'go': {
      if (!state || state.mode === 'hover') return state;
      const index = state.index + action.delta;
      if (index < 0 || index >= state.dates.length) return state;
      return { ...state, mode: 'manual', index };
    }
    case 'hover':
      return { mode: 'hover', dates: [action.date], index: 0, shown: 0, trigger: 'hover' };
    case 'hoverEnd':
      return state?.mode === 'hover' ? null : state;
    case 'dismiss':
      return null;
    default:
      return state;
  }
}

// ── Posisi ──

export const SPOTLIGHT_MAX_WIDTH = 244;
const EDGE = 8;
const ARROW = 6;
const ARROW_INSET = 16;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/** Semua koordinat relatif ke pembungkus kartu kalender. */
export function computeBubblePosition(a: {
  cell: { top: number; bottom: number; left: number; right: number };
  wrapperWidth: number;
  wrapperHeight: number;
  viewportTop: number;
  viewportBottom: number;
  bubbleHeight: number;
}): { left: number; top: number; width: number; arrowLeft: number; placement: 'below' | 'above' } {
  const width = Math.min(SPOTLIGHT_MAX_WIDTH, a.wrapperWidth - EDGE * 2);
  const cx = (a.cell.left + a.cell.right) / 2;
  const left = clamp(cx - width / 2, EDGE, a.wrapperWidth - width - EDGE);
  const arrowLeft = clamp(cx - left, ARROW_INSET, width - ARROW_INSET);
  const spaceBelow = Math.min(a.wrapperHeight, a.viewportBottom) - a.cell.bottom;
  const spaceAbove = a.cell.top - Math.max(0, a.viewportTop);
  const below = spaceBelow >= a.bubbleHeight + 12 || spaceAbove < spaceBelow;
  return below
    ? { left, top: a.cell.bottom + ARROW, width, arrowLeft, placement: 'below' }
    : { left, top: a.cell.top + 2 - ARROW - a.bubbleHeight, width, arrowLeft, placement: 'above' };
}

/**
 * Sorotan di kartu kalender Dashboard: satu gelembung info yang muncul saat
 * kalender terlihat — di hari ini bila ada agenda, kalau tidak di tanggal
 * berjadwal terdekat berikutnya. Semua keputusannya murni di sini (tanggal,
 * isi gelembung, posisi, gerbang harian) supaya bisa diuji tanpa DOM — lihat
 * tests/calendar-spotlight.test.js.
 *
 * Spec: docs/superpowers/specs/2026-11-07-kalender-sorotan-bergilir-design.md
 */

import { realDateKey } from '../../lib/berangkat-groups.js';
import type { BerangkatGroup } from '../../lib/berangkat-groups.js';
import type { ManasikSession } from '../../lib/manasik-sessions.js';
import { extractCalendarParts } from '../../lib/flight-segments.js';
import { displayPax, hasDisplayableDetail, parsePaket, SHORT_MONTHS } from './calendarEvents';
import type { CalendarEvent, CalendarEventType, EventDetail } from './calendarEvents';
import { formatCalendarPrimaryPerson } from './calendarPeople';
import { formatTerminal } from './calendarTerminal';

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

// ── Tanggal yang disorot ──

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
 * Hari ini bila ada agenda; kalau tidak, tanggal berjadwal terdekat sesudahnya
 * di bulan yang sedang tampil. Null bila bulan tampil bukan bulan berjalan
 * (WIB) atau agendanya sudah habis — gelembung harus menunjuk titik yang
 * terlihat, jadi tidak melompat ke bulan berikutnya.
 */
export function pickSpotlightDate(a: {
  events: readonly CalendarEvent[];
  year: number;
  month: number;
  todayKey: string;
}): string | null {
  const monthPrefix = `${a.year}-${String(a.month).padStart(2, '0')}-`;
  if (!a.todayKey.startsWith(monthPrefix)) return null;
  const upcoming = [...displayableTypesByDate(a.events).keys()]
    .filter(d => d.startsWith(monthPrefix) && d >= a.todayKey)
    .sort();
  return upcoming[0] ?? null;
}

/**
 * IntersectionObserver bisa mengirim beberapa entri sekaligus saat main thread
 * sibuk (guliran cepat melewati beberapa ambang). Yang berlaku = yang terbaru.
 */
export function latestRatio(entries: readonly { intersectionRatio: number; time: number }[]): number {
  let latest: { intersectionRatio: number; time: number } | null = null;
  for (const e of entries) if (!latest || e.time >= latest.time) latest = e;
  return latest ? latest.intersectionRatio : 0;
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

// ── Isi gelembung ──

export type SpotlightIcon = 'takeoff' | 'landing' | 'clock' | 'tl' | 'staff' | 'manasik';

export interface SpotlightLine {
  /** null pada hari campuran: tiap jenis cukup ditandai titik warnanya. */
  icon: SpotlightIcon | null;
  text: string;
}

export interface SpotlightSection {
  type: CalendarEventType;
  title: string;
  lines: SpotlightLine[];
}

export interface SpotlightContent {
  date: string;
  day: number;
  dayLabel: string;
  badge: { text: string; tone: 'today' | CalendarEventType } | null;
  sections: SpotlightSection[];
  mine: { type: 'keberangkatan' | 'manasik'; text: string }[];
}

const TYPE_ORDER: CalendarEventType[] = ['keberangkatan', 'kepulangan', 'manasik'];
const DAY_NAMES = ['MIN', 'SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB'];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const joinParts = (parts: (string | null | undefined | false)[], sep = ' · ') => parts.filter(Boolean).join(sep);

function utcMs(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Jam sumber bisa "06:45" atau "6.45"; null bila tidak terbaca. */
function normJam(value: string | null): string | null {
  const m = String(value || '').match(/(\d{1,2})[:.](\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

function jamRange(details: EventDetail[]): string | null {
  const jams = [...new Set(details.map(d => normJam(d.jam)).filter((j): j is string => !!j))].sort();
  if (jams.length === 0) return null;
  return jams.length === 1 ? jams[0] : `${jams[0]}–${jams[jams.length - 1]}`;
}

const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)(\S)/g, (_, sp: string, c: string) => sp + c.toUpperCase());

/** Sumber: "SAUDIA ~ SV 827". */
function flightOf(d: EventDetail): { airline: string; code: string } {
  const { airline, codePart } = extractCalendarParts(d.pesawat);
  return { airline: airline ? titleCase(airline) : '', code: codePart.trim() };
}

function airlinesSummary(details: EventDetail[]): string {
  const flights = details.map(flightOf);
  const names = [...new Set(flights.map(f => f.airline || f.code).filter(Boolean))];
  const rest = names.length - 2;
  return names.slice(0, 2).join(' · ') + (rest > 0 ? ` +${rest}` : '');
}

/** TL kloter jamaah Anda didahulukan; sisanya dihitung "+n". */
function tourLeaderText(details: EventDetail[], mine: SpotlightMineEntry | undefined): string | null {
  const names: string[] = [];
  let preferred: string | null = null;
  for (const d of details) {
    const name = formatCalendarPrimaryPerson(d.tour_leader, 3);
    if (!name) continue;
    if (!names.includes(name)) names.push(name);
    if (!preferred && mine && d.jadwal_id && mine.jadwalIds.includes(d.jadwal_id)) preferred = name;
  }
  if (names.length === 0) return null;
  const others = names.length - 1;
  return `TL ${preferred || names[0]}${others > 0 ? ` +${others}` : ''}`;
}

function departuresText(details: EventDetail[]): string | null {
  const seen = new Map<number, { day: string; mon: string; year: string }>();
  for (const d of details) {
    const dep = parsePaket(d.paket).departure;
    if (!dep) continue;
    const [day, mon, year] = dep.split(' ');
    seen.set(Date.UTC(Number(year), SHORT_MONTHS.indexOf(mon), Number(day)), { day, mon, year });
  }
  const list = [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  if (list.length === 0) return null;
  const [a, b] = list;
  const head = !b ? `${a.day} ${a.mon}`
    : a.mon === b.mon && a.year === b.year ? `${a.day} & ${b.day} ${b.mon}`
      : `${a.day} ${a.mon} & ${b.day} ${b.mon}`;
  const rest = list.length - 2;
  return `Untuk keberangkatan ${head}${rest > 0 ? ` +${rest}` : ''}`;
}

function buildSection(type: CalendarEventType, details: EventDetail[], compact: boolean, mine: SpotlightMineEntry | undefined): SpotlightSection {
  const n = details.length;
  const icon = (i: SpotlightIcon) => (compact ? null : i);
  const lines: SpotlightLine[] = [];
  const push = (i: SpotlightIcon, text: string | null) => { if (text) lines.push({ icon: icon(i), text }); };
  const tl = tourLeaderText(details, mine);

  if (type === 'keberangkatan') {
    const pax = details.reduce((s, d) => s + displayPax(d), 0);
    const paxText = pax > 0 ? `${pax} pax` : null;
    if (!compact) {
      const f = flightOf(details[0]);
      push('takeoff', n === 1 ? joinParts([f.airline, f.code], ' ') : airlinesSummary(details));
      const range = jamRange(details);
      push('clock', joinParts([range && `Take off ${range}`, paxText]));
    } else {
      const flights = n <= 2
        ? details.map(d => { const f = flightOf(d); return joinParts([f.code || f.airline, normJam(d.jam)], ' '); })
        : [airlinesSummary(details)];
      push('takeoff', joinParts([...flights, paxText]));
    }
    push('tl', tl);
    return { type, title: `${n} kloter berangkat`, lines };
  }

  if (type === 'kepulangan') {
    const range = jamRange(details);
    if (n === 1) {
      const d = details[0];
      const f = flightOf(d);
      const terminal = formatTerminal(d.arrival_terminal)?.replace(/^Terminal\s*/, 'T') || null;
      push('landing', joinParts([compact ? f.code || f.airline : joinParts([f.airline, f.code], ' '), range && `tiba ${range}`, terminal]));
    } else {
      push('landing', joinParts([airlinesSummary(details), range && `tiba ${range}`]));
    }
    push('tl', tl);
    const staff = n === 1 && !compact ? formatCalendarPrimaryPerson(details[0].staff) : '';
    push('staff', staff ? `Dijemput staff ${staff}` : null);
    return { type, title: `${n} kloter pulang tiba`, lines };
  }

  const first = [...details.map(d => normJam(d.jam)).filter((j): j is string => !!j)].sort()[0];
  push('manasik', departuresText(details));
  push('tl', tl);
  return { type, title: first ? `Manasik ${first}` : 'Manasik', lines };
}

function kloterSuffix(details: EventDetail[], mine: SpotlightMineEntry): string {
  const numbers = [...new Set(details
    .filter(d => d.jadwal_id && d.group_number && mine.jadwalIds.includes(d.jadwal_id))
    .map(d => String(d.group_number)))];
  if (numbers.length === 1) return ` · Kloter ${numbers[0]}`;
  if (numbers.length === 2) return ` · Kloter ${numbers[0]} & ${numbers[1]}`;
  return '';
}

export function buildSpotlightContent(a: {
  date: string;
  events: readonly CalendarEvent[];
  todayKey: string;
  mine: SpotlightMine;
}): SpotlightContent | null {
  const byType = new Map<CalendarEventType, EventDetail[]>();
  for (const ev of a.events || []) {
    if (ev.date !== a.date) continue;
    const valid = ev.details.filter(hasDisplayableDetail);
    if (valid.length) byType.set(ev.type, [...(byType.get(ev.type) || []), ...valid]);
  }
  const types = TYPE_ORDER.filter(t => byType.has(t));
  if (types.length === 0) return null;

  const compact = types.length > 1;
  const mineB = a.mine.berangkat.get(a.date);
  const mineM = a.mine.manasik.get(a.date);
  const sections = types.map(t => buildSection(t, byType.get(t)!, compact, t === 'keberangkatan' ? mineB : t === 'manasik' ? mineM : undefined));

  const mine: SpotlightContent['mine'] = [];
  if (byType.has('keberangkatan') && mineB && mineB.count > 0) {
    mine.push({ type: 'keberangkatan', text: `${mineB.count} jamaah Anda berangkat${kloterSuffix(byType.get('keberangkatan')!, mineB)}` });
  }
  if (byType.has('manasik') && mineM && mineM.count > 0) {
    mine.push({ type: 'manasik', text: `${mineM.count} jamaah Anda ikut manasik` });
  }

  const diff = Math.round((utcMs(a.date) - utcMs(a.todayKey)) / MS_PER_DAY);
  const badge: SpotlightContent['badge'] = diff === 0 ? { text: 'HARI INI', tone: 'today' }
    : diff === 1 ? { text: 'BESOK', tone: types[0] }
      : diff > 1 ? { text: `H-${diff}`, tone: types[0] }
        : null;

  const [, m, d] = a.date.split('-').map(Number);
  const dow = new Date(utcMs(a.date)).getUTCDay();
  return {
    date: a.date,
    day: d,
    dayLabel: `${DAY_NAMES[dow]}, ${d} ${SHORT_MONTHS[m - 1].toUpperCase()}`,
    badge,
    sections,
    mine,
  };
}

/**
 * Deklarasi tipe untuk src/lib/pwa/pull-to-refresh.js — logika gestur
 * tarik-untuk-segarkan yang dipakai src/components/pwa/PullToRefresh.tsx.
 */

export type GestureVerdict = 'pending' | 'pull' | 'abandon';

export const PULL_START_SLOP: number;
export const PULL_TRIGGER: number;
export const PULL_MAX: number;
export const PULL_PARK: number;

/** Redaman hiperbolik: px jari → px yang digambar, dengan asimtot PULL_MAX. */
export function dampPull(raw: number): number;

/** 'pending' = tunggu frame berikutnya; 'abandon' = final, jangan dinilai ulang. */
export function classifyGesture(dx: number, dy: number): GestureVerdict;

/** Titik mulai di luar overlay `fixed`, scroller-Y bersarang, dan [data-ptr-ignore]. */
export function isPullEligibleStart(target: EventTarget | null): boolean;

export function isTypingTarget(element: Element | null): boolean;

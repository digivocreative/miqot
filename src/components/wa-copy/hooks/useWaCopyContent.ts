import { useEffect, useState } from 'react';
import { CAPTION_SEED, CAPTION_CATEGORIES } from '../lib/captions';
import { WA_COPY_FAQ_SEED, FAQ_CATEGORIES } from '../lib/faq';
import { TOUR_SEED, TOUR_PHASES } from '../lib/tourleader';
import type { AgentFaqEntry, CaptionEntry, CategoryMeta, TourStep } from '../lib/types';

const WA_COPY_LATENCY_MS = 350;

/**
 * Module-level in-memory store (NO localStorage). Lives for the browser session
 * and survives the dashboard's remount-on-navigation, so admin edits persist
 * while the agent moves between tabs/tools. Swap this whole hook for an API
 * client later — the component API stays identical.
 */
const store = {
  captions: CAPTION_SEED.map(c => ({ ...c })) as CaptionEntry[],
  faqs: WA_COPY_FAQ_SEED.map(f => ({ ...f })) as AgentFaqEntry[],
  tourSteps: TOUR_SEED.map(t => ({ ...t })) as TourStep[],
  captionCategories: CAPTION_CATEGORIES.map(c => ({ ...c })).sort((a, b) => a.order - b.order) as CategoryMeta[],
  faqCategories: FAQ_CATEGORIES.map(c => ({ ...c })).sort((a, b) => a.order - b.order) as CategoryMeta[],
  tourPhases: TOUR_PHASES.map(c => ({ ...c })).sort((a, b) => a.order - b.order) as CategoryMeta[],
};

let loadedOnce = false;
let idCounter = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(l => l());
}

function genId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-new-${idCounter}`;
}

function nextOrder<T extends { order: number }>(items: T[]): number {
  return items.reduce((max, it) => Math.max(max, it.order), 0) + 1;
}

function reorderWithinGroup<T extends { id: string; order: number }>(
  arr: T[],
  id: string,
  dir: 'up' | 'down',
  groupKey: (x: T) => string,
): void {
  const item = arr.find(x => x.id === id);
  if (!item) return;
  const group = arr.filter(x => groupKey(x) === groupKey(item)).sort((a, b) => a.order - b.order);
  const idx = group.findIndex(x => x.id === id);
  const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= group.length) return;
  const a = group[idx];
  const b = group[swapIdx];
  const tmp = a.order;
  a.order = b.order;
  b.order = tmp;
}

// ── Caption mutations ───────────────────────────────────────────────
function createCaption(input: Omit<CaptionEntry, 'id' | 'order'>): void {
  const sameCat = store.captions.filter(c => c.category === input.category);
  store.captions = [...store.captions, { ...input, id: genId('cap'), order: nextOrder(sameCat) }];
  emit();
}
function updateCaption(id: string, patch: Partial<Omit<CaptionEntry, 'id'>>): void {
  store.captions = store.captions.map(c => (c.id === id ? { ...c, ...patch } : c));
  emit();
}
function toggleCaption(id: string): void {
  store.captions = store.captions.map(c => (c.id === id ? { ...c, active: !c.active } : c));
  emit();
}
function reorderCaption(id: string, dir: 'up' | 'down'): void {
  reorderWithinGroup(store.captions, id, dir, c => c.category);
  store.captions = [...store.captions];
  emit();
}

// ── FAQ mutations ───────────────────────────────────────────────────
function createFaq(input: Omit<AgentFaqEntry, 'id' | 'order'>): void {
  const sameCat = store.faqs.filter(f => f.category === input.category);
  store.faqs = [...store.faqs, { ...input, id: genId('faq'), order: nextOrder(sameCat) }];
  emit();
}
function updateFaq(id: string, patch: Partial<Omit<AgentFaqEntry, 'id'>>): void {
  store.faqs = store.faqs.map(f => (f.id === id ? { ...f, ...patch } : f));
  emit();
}
function toggleFaq(id: string): void {
  store.faqs = store.faqs.map(f => (f.id === id ? { ...f, active: !f.active } : f));
  emit();
}
function reorderFaq(id: string, dir: 'up' | 'down'): void {
  reorderWithinGroup(store.faqs, id, dir, f => f.category);
  store.faqs = [...store.faqs];
  emit();
}

// ── Tour Leader mutations ───────────────────────────────────────────
function createTour(input: Omit<TourStep, 'id' | 'order'>): void {
  const samePhase = store.tourSteps.filter(t => t.phase === input.phase);
  store.tourSteps = [...store.tourSteps, { ...input, id: genId('tl'), order: nextOrder(samePhase) }];
  emit();
}
function updateTour(id: string, patch: Partial<Omit<TourStep, 'id'>>): void {
  store.tourSteps = store.tourSteps.map(t => (t.id === id ? { ...t, ...patch } : t));
  emit();
}
function toggleTour(id: string): void {
  store.tourSteps = store.tourSteps.map(t => (t.id === id ? { ...t, active: !t.active } : t));
  emit();
}
function reorderTour(id: string, dir: 'up' | 'down'): void {
  reorderWithinGroup(store.tourSteps, id, dir, t => t.phase);
  store.tourSteps = [...store.tourSteps];
  emit();
}

export interface UseWaCopyContent {
  captions: CaptionEntry[];
  faqs: AgentFaqEntry[];
  tourSteps: TourStep[];
  captionCategories: CategoryMeta[];
  faqCategories: CategoryMeta[];
  tourPhases: CategoryMeta[];
  loading: boolean;
  createCaption: typeof createCaption;
  updateCaption: typeof updateCaption;
  toggleCaption: typeof toggleCaption;
  reorderCaption: typeof reorderCaption;
  createFaq: typeof createFaq;
  updateFaq: typeof updateFaq;
  toggleFaq: typeof toggleFaq;
  reorderFaq: typeof reorderFaq;
  createTour: typeof createTour;
  updateTour: typeof updateTour;
  toggleTour: typeof toggleTour;
  reorderTour: typeof reorderTour;
}

/**
 * Single source of truth for WA Copy content. V1: in-memory mock with a real
 * loading state (mock latency on first mount only). Mutations are synchronous
 * and notify every mounted consumer so agent + admin views stay in sync.
 */
export function useWaCopyContent(): UseWaCopyContent {
  const [, force] = useState(0);
  const [loading, setLoading] = useState(!loadedOnce);

  useEffect(() => {
    const rerender = () => force(v => v + 1);
    listeners.add(rerender);
    return () => {
      listeners.delete(rerender);
    };
  }, []);

  useEffect(() => {
    if (loadedOnce) {
      setLoading(false);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      loadedOnce = true;
      if (alive) setLoading(false);
    }, WA_COPY_LATENCY_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  return {
    captions: store.captions,
    faqs: store.faqs,
    tourSteps: store.tourSteps,
    captionCategories: store.captionCategories,
    faqCategories: store.faqCategories,
    tourPhases: store.tourPhases,
    loading,
    createCaption,
    updateCaption,
    toggleCaption,
    reorderCaption,
    createFaq,
    updateFaq,
    toggleFaq,
    reorderFaq,
    createTour,
    updateTour,
    toggleTour,
    reorderTour,
  };
}

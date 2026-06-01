import type { FaqEntry } from '../../portal-jamaah/lib/faq';

// Re-export so WA Copy consumers can import the shared FAQ shape from one place.
export type { FaqEntry };

export interface MediaAttachment {
  url: string;           // Bunny CDN public URL
  kind: 'image' | 'file';
  mime: string;          // e.g. image/png, application/pdf
  name: string;          // original filename (display + download)
  size: number;          // bytes
}

export type WaTab = 'caption' | 'faq' | 'tourleader';

export type CaptionCategory = string;
export type FaqCategory = string;
export type TourPhase = string;

export interface CaptionEntry {
  id: string;
  category: CaptionCategory;
  packageAware: boolean;
  template: string;
  order: number;
  active: boolean;
  media?: MediaAttachment[];
}

/** FaqEntry = { id, question, answer } reused from portal-jamaah. */
export interface AgentFaqEntry extends FaqEntry {
  category: FaqCategory;
  order: number;
  active: boolean;
  media?: MediaAttachment[];
}

export interface TourStep {
  id: string;
  phase: TourPhase;
  title: string;
  body: string;
  order: number;
  active: boolean;
  media?: MediaAttachment[];
}

// ── Placeholder engine ──────────────────────────────────────────────
export type SegmentKind = 'plain' | 'agent' | 'package' | 'unfilled';

export interface Segment {
  text: string;
  kind: SegmentKind;
}

export type AgentToken = 'nama' | 'wa' | 'link';
export type PackageToken = 'paket' | 'harga' | 'tanggal' | 'maskapai' | 'hari';
export type PlaceholderToken = AgentToken | PackageToken;

export interface AgentContext {
  nama: string;
  wa: string;
  link: string;
}

export interface PackageContext {
  paket: string;
  harga: string;
  tanggal: string;
  maskapai: string;
  hari: string;
}

export interface PlaceholderContext {
  agent: AgentContext | null;
  pkg: PackageContext | null;
}

// ── Category / phase display metadata ───────────────────────────────
export interface CategoryMeta<T extends string = string> {
  value: T;
  label: string;
  iconName: string;
  tip: string;
  order: number;
}

export interface CategoryDraft {
  label: string;
  iconName: string;
  tip: string;
}

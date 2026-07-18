// Registry desain Brosur Jadwal. Klasik (BrochureScheduleTemplate) tetap
// default; desain lain bersifat OPSI yang dipilih agent via picker di
// BrochureSchedulePage (persist localStorage 'brosurDesignId'). Berlaku untuk
// preview + export gambar bulanan; katalog PDF selalu klasik (raster-safe).
// Zamrud Royal & Senja Haramain (gelap) dicabut 18 Jul 2026 — user prefer
// desain terang; id lama di localStorage jatuh kembali ke 'classic' via
// normalizeBrochureDesignId.
import type { ComponentType } from 'react';
import {
  BrochureScheduleTemplate,
  type BrochureAgent,
  type BrochureMonth,
} from '../BrochureScheduleTemplate';
import { BoardingPassTemplate } from './BoardingPassTemplate';
import { SerambiNabawiTemplate } from './SerambiNabawiTemplate';
import { TasbihHijauTemplate } from './TasbihHijauTemplate';

export type BrochureDesignId = 'classic' | 'boarding' | 'serambi' | 'tasbih';

// Prop yang dikirim halaman ke desain terpilih. `variant` (winter otomatis
// saat filter Musim Dingin) hanya berefek pada klasik; desain lain punya
// palet sendiri dan mengabaikannya.
export interface BrochureDesignProps {
  month: BrochureMonth;
  agent: BrochureAgent;
  showFullDate?: boolean;
  displayMode?: 'hari' | 'seat';
  variant?: 'default' | 'winter';
}

export interface BrochureDesignDef {
  id: BrochureDesignId;
  label: string;
  /** Gradien kecil untuk dot warna di chip picker. */
  swatch: string;
  Component: ComponentType<BrochureDesignProps>;
}

export const BROCHURE_DESIGNS: ReadonlyArray<BrochureDesignDef> = [
  {
    id: 'classic',
    label: 'Klasik',
    swatch: 'linear-gradient(135deg, #C8102E 0%, #870018 55%, #F8DFA1 100%)',
    Component: BrochureScheduleTemplate,
  },
  {
    id: 'boarding',
    label: 'Boarding Pass',
    swatch: 'linear-gradient(135deg, #C8102E 0%, #C8102E 42%, #F4F6F8 42%, #F4F6F8 72%, #1E3A8A 72%)',
    Component: BoardingPassTemplate,
  },
  {
    id: 'serambi',
    label: 'Serambi Nabawi',
    swatch: 'linear-gradient(135deg, #FFFFFF 0%, #F7F1E4 45%, #C9A24B 100%)',
    Component: SerambiNabawiTemplate,
  },
  {
    id: 'tasbih',
    label: 'Tasbih Hijau',
    swatch: 'linear-gradient(135deg, #FFFFFF 0%, #EAF6F0 40%, #0E8A5F 75%, #D9A83C 100%)',
    Component: TasbihHijauTemplate,
  },
];

export function normalizeBrochureDesignId(raw: string | null | undefined): BrochureDesignId {
  return (BROCHURE_DESIGNS.some(d => d.id === raw) ? raw : 'classic') as BrochureDesignId;
}

export function getBrochureDesign(id: BrochureDesignId): BrochureDesignDef {
  return BROCHURE_DESIGNS.find(d => d.id === id) ?? BROCHURE_DESIGNS[0];
}

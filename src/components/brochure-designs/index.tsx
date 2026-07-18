// Registry desain Brosur Jadwal. Klasik (BrochureScheduleTemplate) tetap
// default; tiga desain baru bersifat OPSI yang dipilih agent via picker di
// BrochureSchedulePage (persist localStorage 'brosurDesignId'). Berlaku untuk
// preview + export gambar bulanan; katalog PDF selalu klasik (raster-safe).
import type { ComponentType } from 'react';
import {
  BrochureScheduleTemplate,
  type BrochureAgent,
  type BrochureMonth,
} from '../BrochureScheduleTemplate';
import { ZamrudRoyalTemplate } from './ZamrudRoyalTemplate';
import { BoardingPassTemplate } from './BoardingPassTemplate';
import { SenjaHaramainTemplate } from './SenjaHaramainTemplate';

export type BrochureDesignId = 'classic' | 'zamrud' | 'boarding' | 'senja';

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
    id: 'zamrud',
    label: 'Zamrud Royal',
    swatch: 'linear-gradient(135deg, #07301F 0%, #0B4330 55%, #E8C36B 100%)',
    Component: ZamrudRoyalTemplate,
  },
  {
    id: 'boarding',
    label: 'Boarding Pass',
    swatch: 'linear-gradient(135deg, #C8102E 0%, #C8102E 42%, #F4F6F8 42%, #F4F6F8 72%, #1E3A8A 72%)',
    Component: BoardingPassTemplate,
  },
  {
    id: 'senja',
    label: 'Senja Haramain',
    swatch: 'linear-gradient(180deg, #2C1656 0%, #8E3059 48%, #F5A85C 100%)',
    Component: SenjaHaramainTemplate,
  },
];

export function normalizeBrochureDesignId(raw: string | null | undefined): BrochureDesignId {
  return (BROCHURE_DESIGNS.some(d => d.id === raw) ? raw : 'classic') as BrochureDesignId;
}

export function getBrochureDesign(id: BrochureDesignId): BrochureDesignDef {
  return BROCHURE_DESIGNS.find(d => d.id === id) ?? BROCHURE_DESIGNS[0];
}

// Registry desain Brosur Jadwal. Klasik (BrochureScheduleTemplate) tetap
// default; desain lain bersifat OPSI yang dipilih agent via picker di
// BrochureSchedulePage (persist localStorage 'brosurDesignId'). Berlaku untuk
// preview + export gambar bulanan; katalog PDF selalu klasik (raster-safe).
// Zamrud Royal & Senja Haramain (gelap) dicabut 18 Jul 2026 — user prefer
// desain terang. Serambi Nabawi & Tasbih Hijau dicabut 9 Okt 2026 (kurang
// diminati), diganti Kartu Jadwal, Kartu Ringkas, Kolom Harga, Kalender.
// Id lama di localStorage jatuh kembali ke 'classic' via
// normalizeBrochureDesignId.
import type { ComponentType } from 'react';
import {
  BrochureScheduleTemplate,
  type BrochureAgent,
  type BrochureMonth,
} from '../BrochureScheduleTemplate';
import { BoardingPassTemplate } from './BoardingPassTemplate';
import { KalenderTemplate } from './KalenderTemplate';
import { KartuJadwalTemplate, KartuRingkasTemplate } from './KartuJadwalTemplate';
import { KolomHargaTemplate } from './KolomHargaTemplate';

export type BrochureDesignId = 'classic' | 'boarding' | 'kartu' | 'kartu-ringkas' | 'kolom-harga' | 'kalender';

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
    id: 'kalender',
    label: 'Kalender',
    swatch: 'linear-gradient(180deg, #870018 0%, #C8102E 36%, #FFFFFF 36%, #F3EADF 100%)',
    Component: KalenderTemplate,
  },
  {
    id: 'boarding',
    label: 'Boarding Pass',
    swatch: 'linear-gradient(135deg, #C8102E 0%, #C8102E 42%, #F4F6F8 42%, #F4F6F8 72%, #1E3A8A 72%)',
    Component: BoardingPassTemplate,
  },
  {
    id: 'kartu',
    label: 'Kartu Jadwal',
    swatch: 'linear-gradient(135deg, #5A0010 0%, #C8102E 46%, #FFF8F0 46%, #FFF7E0 100%)',
    Component: KartuJadwalTemplate,
  },
  {
    id: 'kartu-ringkas',
    label: 'Kartu Ringkas',
    swatch: 'linear-gradient(180deg, #C8102E 0%, #C8102E 32%, #FFF8F0 32%, #FFFFFF 100%)',
    Component: KartuRingkasTemplate,
  },
  {
    id: 'kolom-harga',
    label: 'Kolom Harga',
    swatch: 'linear-gradient(90deg, #FFFFFF 0%, #FFF3E4 60%, #870018 60%, #C8102E 100%)',
    Component: KolomHargaTemplate,
  },
];

export function normalizeBrochureDesignId(raw: string | null | undefined): BrochureDesignId {
  return (BROCHURE_DESIGNS.some(d => d.id === raw) ? raw : 'classic') as BrochureDesignId;
}

export function getBrochureDesign(id: BrochureDesignId): BrochureDesignDef {
  return BROCHURE_DESIGNS.find(d => d.id === id) ?? BROCHURE_DESIGNS[0];
}

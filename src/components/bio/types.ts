export type BioTheme = 'emerald' | 'desert' | 'midnight' | 'rosegold' | 'sunset' | 'mono';

export type BioTileType = 'umroh' | 'umroh_landing' | 'haji' | 'wa' | 'featured' | 'link' | 'text' | 'photo' | 'testi';

export interface BioTile {
  id: string;
  type: BioTileType;
  visible: boolean;
  order: number;
  config: Record<string, unknown>;
  orphaned?: boolean;
}

export interface BioHeroConfig {
  tagline: string | null;
  badges: string[];
  socials: {
    instagram: string | null;
    tiktok: string | null;
    youtube: string | null;
  };
}

export interface BioSeoConfig {
  title: string | null;
  description: string | null;
  og_image_url: string | null;
}

export interface BioConfig {
  theme: BioTheme;
  enabled: boolean;
  hero: BioHeroConfig;
  seo: BioSeoConfig;
  tiles: BioTile[];
  _wa_link_preview: string | null;
}

export interface BioAgentPublic {
  slug: string;
  name: string;
  photo?: string;
  phone?: string;
}

export interface FeaturedPaketPreview {
  jadwal_id: string;
  year_code: string;
  name: string;
  berangkat_tgl: string;
  pulang_tgl: string;
  maskapai: string;
  seat_total: number | null;
  seat_sisa: number | null;
  image_url: string | null;
  anchor_price: number | null;
}

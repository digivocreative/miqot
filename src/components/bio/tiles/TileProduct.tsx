import { Package, Star, ChevronRight } from 'lucide-react';
import type { BioAgentPublic } from '../types';

interface Props {
  variant: 'umroh' | 'haji';
  agent: BioAgentPublic;
  cta?: string;
}

export default function TileProduct({ variant, agent, cta }: Props) {
  const isUmroh = variant === 'umroh';
  const href = `/${agent.slug}/${isUmroh ? 'umroh' : 'haji'}`;
  const title = cta?.trim() || (isUmroh ? 'Lihat Jadwal Umroh' : 'Haji Plus Alhijaz');
  const subtitle = isUmroh ? 'Jadwal Umroh 2026 · Semua paket tersedia' : 'Kuota Haji Plus Alhijaz Indowisata';
  const Icon = isUmroh ? Package : Star;

  return (
    <a href={href} className="bio-tile bio-tile--button">
      <div className="bio-tile-row">
        <div className="bio-tile-icon">
          <Icon size={20} strokeWidth={2.2} />
        </div>
        <div className="bio-tile-text">
          <p className="bio-tile-title">{title}</p>
          <p className="bio-tile-subtitle">{subtitle}</p>
        </div>
        <ChevronRight size={18} className="bio-tile-chevron" />
      </div>
    </a>
  );
}

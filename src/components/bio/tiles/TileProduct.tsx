import { Package, ChevronRight } from 'lucide-react';
import type { BioAgentPublic } from '../types';
import KaabaIcon from '../KaabaIcon';
import { getBioAgentPath } from '../bioUrls';

interface Props {
  variant: 'umroh' | 'umroh_landing' | 'haji';
  agent: BioAgentPublic;
  cta?: string;
}

const VARIANT_META = {
  // "Jadwal Umroh" opens the public paket browser, not the curated landing page.
  umroh: {
    path: '',
    icon: Package,
    title: 'Cek Paket Umroh',
    subtitle: 'Lihat Jadwal Umroh Terbaru',
  },
  // "Landing Page Umroh" opens the curated landing experience.
  umroh_landing: {
    path: 'umroh',
    icon: KaabaIcon,
    title: 'Umroh',
    subtitle: 'Lihat Penawaran Menarik',
  },
  haji: {
    path: 'haji',
    icon: KaabaIcon,
    title: 'Haji Plus',
    subtitle: 'Masa Tunggu Singkat',
  },
} as const;

export default function TileProduct({ variant, agent, cta }: Props) {
  const meta = VARIANT_META[variant];
  const Icon = meta.icon;
  const title = cta?.trim() || meta.title;
  const href = getBioAgentPath(agent.slug, meta.path);

  return (
    <a href={href} className="bio-tile bio-tile--button">
      <div className="bio-tile-row">
        <div className="bio-tile-icon">
          <Icon size={20} strokeWidth={2.2} />
        </div>
        <div className="bio-tile-text">
          <p className="bio-tile-title">{title}</p>
          <p className="bio-tile-subtitle">{meta.subtitle}</p>
        </div>
        <ChevronRight size={18} className="bio-tile-chevron" />
      </div>
    </a>
  );
}

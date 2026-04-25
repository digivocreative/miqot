import { MessageCircle, ChevronRight } from 'lucide-react';

interface Props {
  waLink: string | null;
  title?: string;
  subtitle?: string;
}

export default function TileWA({ waLink, title, subtitle }: Props) {
  if (!waLink) return null;
  return (
    <a
      href={waLink}
      target="_blank"
      rel="noopener noreferrer"
      className="bio-tile bio-tile--button bio-tile-wa"
    >
      <div className="bio-tile-row">
        <div className="bio-tile-icon">
          <MessageCircle size={20} strokeWidth={2.2} />
        </div>
        <div className="bio-tile-text">
          <p className="bio-tile-title">{title?.trim() || 'Chat via WhatsApp'}</p>
          <p className="bio-tile-subtitle">
            {subtitle?.trim() || 'Tanya paket, harga, atau jadwal langsung ke konsultan'}
          </p>
        </div>
        <ChevronRight size={18} className="bio-tile-chevron" />
      </div>
    </a>
  );
}

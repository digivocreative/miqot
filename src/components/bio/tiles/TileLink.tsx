import {
  Link2, Globe, Calendar, FileText, Video, Youtube, Instagram,
  BookOpen, Award, Gift, Sparkles, ChevronRight,
  type LucideIcon,
} from 'lucide-react';

const ALLOWED_ICONS: Record<string, LucideIcon> = {
  Link2, Globe, Calendar, FileText, Video, Youtube, Instagram,
  BookOpen, Award, Gift, Sparkles,
};

interface Props {
  title?: string;
  url?: string;
  icon?: string;
}

export default function TileLink({ title, url, icon }: Props) {
  if (!title || !url) return null;
  const IconCmp = (icon && ALLOWED_ICONS[icon]) || Link2;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="bio-tile bio-tile--button"
    >
      <div className="bio-tile-row">
        <div className="bio-tile-icon">
          <IconCmp size={20} strokeWidth={2.2} />
        </div>
        <div className="bio-tile-text">
          <p className="bio-tile-title">{title}</p>
        </div>
        <ChevronRight size={18} className="bio-tile-chevron" />
      </div>
    </a>
  );
}

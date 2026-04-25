import { Instagram, Youtube } from 'lucide-react';
import type { BioHeroConfig } from './types';

interface Props {
  socials: BioHeroConfig['socials'];
}

// lucide-react doesn't ship a TikTok icon, so inline a brand-compatible path.
function TikTokIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="currentColor">
      <path d="M16.6 3a5.4 5.4 0 0 0 4.1 2.3v2.9a8.3 8.3 0 0 1-4.1-1.1v6.4a6 6 0 1 1-6-6c.27 0 .54.02.8.06v3a3.05 3.05 0 1 0 2.2 2.94V3h3Z" />
    </svg>
  );
}

export default function BioSocialRow({ socials }: Props) {
  const ig = socials.instagram?.trim();
  const tt = socials.tiktok?.trim();
  const yt = socials.youtube?.trim();
  if (!ig && !tt && !yt) return null;

  return (
    <div className="bio-social-row">
      {ig && (
        <a
          className="bio-social-link"
          href={`https://instagram.com/${encodeURIComponent(ig)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Instagram ${ig}`}
        >
          <Instagram size={18} />
        </a>
      )}
      {tt && (
        <a
          className="bio-social-link"
          href={`https://tiktok.com/@${encodeURIComponent(tt)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`TikTok ${tt}`}
        >
          <TikTokIcon />
        </a>
      )}
      {yt && (
        <a
          className="bio-social-link"
          href={`https://youtube.com/@${encodeURIComponent(yt)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`YouTube ${yt}`}
        >
          <Youtube size={18} />
        </a>
      )}
    </div>
  );
}

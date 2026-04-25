import { useState } from 'react';
import { Check } from 'lucide-react';
import type { BioAgentPublic, BioHeroConfig } from './types';

interface Props {
  agent: BioAgentPublic;
  hero: BioHeroConfig;
}

function initialsFromName(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function BioHero({ agent, hero }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const defaultTagline = 'Konsultan Umroh & Haji Plus · Mitra Resmi Alhijaz';
  const tagline = hero.tagline || defaultTagline;
  const badges = Array.isArray(hero.badges) ? hero.badges.filter(Boolean) : [];
  const showPhoto = agent.photo && !imgFailed;

  return (
    <header className="bio-hero">
      <div className="bio-avatar">
        {showPhoto ? (
          <img
            src={agent.photo}
            alt={agent.name}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span>{initialsFromName(agent.name)}</span>
        )}
        <span className="bio-verified" title="Mitra resmi Alhijaz">
          <Check size={14} strokeWidth={3} />
        </span>
      </div>
      <h1 className="bio-hero-name">{agent.name.trim()}</h1>
      <p className="bio-hero-tagline">{tagline}</p>
      {badges.length > 0 && (
        <div className="bio-hero-badges">
          {badges.map((b, i) => (
            <span key={i} className="bio-hero-badge">{b}</span>
          ))}
        </div>
      )}
    </header>
  );
}

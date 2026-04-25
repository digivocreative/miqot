import { ChevronRight } from 'lucide-react';
import type { BioAgentPublic, BioHeroConfig } from '../bio/types';

interface Props {
  agent: BioAgentPublic;
  hero: BioHeroConfig;
  onTap: () => void;
}

const SOCIAL_LABELS: Record<keyof BioHeroConfig['socials'], string> = {
  instagram: 'IG',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

function activeSocials(s: BioHeroConfig['socials']): string[] {
  return (Object.keys(SOCIAL_LABELS) as (keyof BioHeroConfig['socials'])[])
    .filter(k => !!s[k])
    .map(k => SOCIAL_LABELS[k]);
}

export default function HeroCard({ agent, hero, onTap }: Props) {
  const socials = activeSocials(hero.socials);
  const taglinePreview = hero.tagline?.trim();

  // Build a multi-line summary so the user immediately sees what's customized
  const parts: string[] = [];
  parts.push(hero.badges.length > 0 ? `${hero.badges.length} badge` : 'belum ada badge');
  parts.push(socials.length > 0 ? socials.join(' + ') : 'belum ada sosial');

  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full text-left bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3 hover:bg-gray-50 dark:hover:bg-slate-700/60 transition-colors active:scale-[0.99]"
    >
      <div className="flex items-center gap-3">
        <img
          src={agent.photo}
          alt={agent.name}
          className="w-11 h-11 rounded-full object-cover border-2 border-emerald-200 dark:border-emerald-800 shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(agent.name)}&background=random&size=72`;
          }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-800 dark:text-white truncate">{agent.name}</p>
          <p
            className={`text-[11px] mt-0.5 truncate ${
              taglinePreview
                ? 'italic text-gray-700 dark:text-slate-300'
                : 'text-gray-400 dark:text-slate-500'
            }`}
          >
            {taglinePreview ? `"${taglinePreview}"` : 'Tagline default · tap untuk kustomisasi'}
          </p>
          <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-0.5 truncate">
            {parts.join(' · ')}
          </p>
        </div>
        <ChevronRight size={16} className="text-gray-400 dark:text-slate-500 shrink-0" />
      </div>
    </button>
  );
}

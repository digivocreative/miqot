import { useEffect, useMemo, useState } from 'react';
import { AGENTS_DATA, loadAgentsFromSupabase, type AgentData } from '@/data/agents';
import { trackPublicEvent } from '@/utils/analytics';
import type { BioAgentPublic, BioConfig, BioTile } from './types';
import BioHero from './BioHero';
import BioSocialRow from './BioSocialRow';
import TileText from './tiles/TileText';
import TileWA from './tiles/TileWA';
import TileFeatured from './tiles/TileFeatured';
import TileProduct from './tiles/TileProduct';
import TilePhoto from './tiles/TilePhoto';
import TileLink from './tiles/TileLink';
import TileTestimonial from './tiles/TileTestimonial';
import './themes.css';

interface Props {
  slug: string;
}

const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,500;1,9..144,600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap';

function useBioFonts() {
  useEffect(() => {
    const links: HTMLLinkElement[] = [];
    const add = (attrs: Partial<HTMLLinkElement> & { rel: string; href: string; crossOrigin?: string }) => {
      const el = document.createElement('link');
      el.rel = attrs.rel;
      el.href = attrs.href;
      if (attrs.crossOrigin) el.crossOrigin = attrs.crossOrigin;
      el.setAttribute('data-bio-font', '1');
      document.head.appendChild(el);
      links.push(el);
    };
    add({ rel: 'preconnect', href: 'https://fonts.googleapis.com' });
    add({ rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' });
    add({ rel: 'stylesheet', href: FONT_HREF });
    return () => { links.forEach(el => el.remove()); };
  }, []);
}

function Skeleton() {
  return (
    <div className="bio-shell" aria-busy="true">
      <div className="bio-hero">
        <div className="bio-skeleton-avatar" />
        <div className="bio-skeleton-line" style={{ width: '60%' }} />
        <div>
          <span className="bio-skeleton-pill" />
          <span className="bio-skeleton-pill" />
          <span className="bio-skeleton-pill" />
        </div>
      </div>
      <div className="bio-skeleton-tile" />
      <div className="bio-skeleton-tile" />
      <div className="bio-skeleton-tile" />
    </div>
  );
}

function NotFound() {
  return (
    <div className="bio-shell">
      <div className="bio-empty">
        <div className="bio-empty-title">Halaman tidak ditemukan</div>
        <p>Profil ini belum tersedia atau sedang tidak aktif.</p>
      </div>
    </div>
  );
}

function FailState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="bio-shell">
      <div className="bio-empty">
        <div className="bio-empty-title">Gagal memuat halaman</div>
        <p>Koneksi bermasalah. Coba lagi sebentar.</p>
        <button
          type="button"
          onClick={onRetry}
          className="bio-featured-button"
          style={{ marginTop: 14 }}
        >
          Coba Lagi
        </button>
      </div>
    </div>
  );
}

export default function BioPage({ slug }: Props) {
  useBioFonts();

  const [config, setConfig] = useState<BioConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [agent, setAgent] = useState<AgentData | null>(() => AGENTS_DATA[slug] || null);

  // Ensure agents cache is hydrated — needed if user landed directly on /bio before Supabase returns.
  useEffect(() => {
    if (!agent) {
      loadAgentsFromSupabase().then((all) => {
        setAgent(all[slug] || null);
      });
    }
  }, [slug, agent]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    fetch(`/api/bio/${encodeURIComponent(slug)}/config`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then(d => {
        if (!alive) return;
        if (d?.success && d.data) setConfig(d.data as BioConfig);
        else setFailed(true);
      })
      .catch(() => { if (alive) setFailed(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [slug, attempt]);

  // Pageview analytics (fire once per mount)
  useEffect(() => {
    if (config?.enabled) trackPublicEvent(slug, 'bio_view', { slug });
  }, [slug, config?.enabled]);

  const theme = config?.theme || 'emerald';

  const publicAgent: BioAgentPublic | null = useMemo(() => {
    if (!agent) return null;
    return {
      slug,
      name: agent.name,
      photo: agent.photo,
      phone: agent.phone,
    };
  }, [agent, slug]);

  let body: React.ReactNode;
  if (loading) {
    body = <Skeleton />;
  } else if (failed) {
    body = <FailState onRetry={() => setAttempt(a => a + 1)} />;
  } else if (!config || config.enabled === false || !publicAgent) {
    body = <NotFound />;
  } else {
    const tiles: BioTile[] = (config.tiles || [])
      .filter(t => t.visible && !t.orphaned)
      .slice()
      .sort((a, b) => a.order - b.order);

    body = (
      <div className="bio-shell">
        <BioHero agent={publicAgent} hero={config.hero} />
        <BioSocialRow socials={config.hero.socials} />
        {tiles.map(tile => {
          const c = tile.config || {};
          switch (tile.type) {
            case 'text':
              return <TileText key={tile.id} content={c.content as string} />;
            case 'wa':
              return (
                <TileWA
                  key={tile.id}
                  waLink={config._wa_link_preview}
                  title={c.title as string}
                  subtitle={c.subtitle as string}
                />
              );
            case 'featured':
              return (
                <TileFeatured
                  key={tile.id}
                  agent={publicAgent}
                  jadwal_id={c.jadwal_id as string}
                  badge={c.badge as string}
                  cta={c.cta as string}
                />
              );
            case 'umroh':
              return (
                <TileProduct
                  key={tile.id}
                  variant="umroh"
                  agent={publicAgent}
                  cta={c.cta as string}
                />
              );
            case 'haji':
              return (
                <TileProduct
                  key={tile.id}
                  variant="haji"
                  agent={publicAgent}
                  cta={c.cta as string}
                />
              );
            case 'photo':
              return (
                <TilePhoto
                  key={tile.id}
                  image_url={c.image_url as string}
                  caption={c.caption as string}
                />
              );
            case 'link':
              return (
                <TileLink
                  key={tile.id}
                  title={c.title as string}
                  url={c.url as string}
                  icon={c.icon as string}
                />
              );
            case 'testi':
              return (
                <TileTestimonial
                  key={tile.id}
                  quote={c.quote as string}
                  author_name={c.author_name as string}
                  author_meta={c.author_meta as string}
                />
              );
            default:
              return null;
          }
        })}
        <footer className="bio-footer">
          Dibuat dengan{' '}
          <a href="https://alhijaz.co" target="_blank" rel="noopener noreferrer">Miqot</a>
          <span className="bio-footer-sep">·</span>
          alhijaz.co/{slug}/bio
        </footer>
      </div>
    );
  }

  return (
    <div className="bio-root" data-bio-theme={theme}>
      {body}
    </div>
  );
}

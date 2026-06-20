import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeCheck,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import WhatsAppIcon from '@/components/common/WhatsAppIcon';
import logoWhite from '@/logo-alhijaz-white.png';
import {
  TOP_PARTNER_META_DESCRIPTION,
  TOP_PARTNER_META_TITLE,
  TOP_PARTNER_OG_IMAGE_PATH,
  shufflePartners,
  type TopPartner,
} from '../../lib/top-partner.js';

interface TopPartnerResponse {
  partners?: TopPartner[];
  data?: TopPartner[];
  syncedAt?: string | null;
}

const HERO_PATTERN =
  'url("data:image/svg+xml,%3Csvg width=\'96\' height=\'96\' viewBox=\'0 0 96 96\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' stroke=\'%23FDE68A\' stroke-width=\'1.25\' opacity=\'0.55\'%3E%3Cpath d=\'M48 10 55 36 82 48 55 60 48 86 41 60 14 48 41 36Z\'/%3E%3Cpath d=\'M18 82c0-17 13-30 30-30s30 13 30 30\'/%3E%3Cpath d=\'M0 82c0-27 21-48 48-48s48 21 48 48\' opacity=\'.45\'/%3E%3C/g%3E%3C/svg%3E")';
const INITIAL_VISIBLE_PARTNERS = 6;
const REVEAL_PARTNER_STEP = 2;

function setMeta(attribute: 'name' | 'property', key: string, content: string) {
  let el = document.querySelector(`meta[${attribute}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attribute, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string) {
  let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function setTopPartnerMeta() {
  const pageUrl = new URL('/top-partner', window.location.origin).toString();
  const imageUrl = new URL(TOP_PARTNER_OG_IMAGE_PATH, window.location.origin).toString();

  document.title = TOP_PARTNER_META_TITLE;
  setCanonical(pageUrl);
  setMeta('name', 'description', TOP_PARTNER_META_DESCRIPTION);
  setMeta('property', 'og:title', TOP_PARTNER_META_TITLE);
  setMeta('property', 'og:description', TOP_PARTNER_META_DESCRIPTION);
  setMeta('property', 'og:type', 'website');
  setMeta('property', 'og:url', pageUrl);
  setMeta('property', 'og:site_name', 'Alhijaz Indowisata');
  setMeta('property', 'og:image', imageUrl);
  setMeta('property', 'og:image:width', '1200');
  setMeta('property', 'og:image:height', '630');
  setMeta('property', 'og:image:type', 'image/png');
  setMeta('name', 'twitter:card', 'summary_large_image');
  setMeta('name', 'twitter:title', TOP_PARTNER_META_TITLE);
  setMeta('name', 'twitter:description', TOP_PARTNER_META_DESCRIPTION);
  setMeta('name', 'twitter:image', imageUrl);
}

function TopPartnerHero() {
  return (
    <section
      className="relative overflow-hidden rounded-b-[20px] px-5 pb-6 pt-5 text-white shadow-[0_18px_45px_rgba(69,10,10,0.28)]"
      style={{ background: 'linear-gradient(122deg, #150207 0%, #26050A 40%, #5B1018 72%, #8A1E22 100%)' }}
    >
      <div className="absolute inset-0 opacity-[0.13]" style={{ backgroundImage: HERO_PATTERN, backgroundSize: '92px 92px' }} />
      <div className="absolute inset-x-0 bottom-0 h-20 bg-[linear-gradient(180deg,rgba(253,186,116,0)_0%,rgba(251,113,133,0.24)_100%)]" />
      <div className="absolute -right-10 top-5 h-32 w-44 rotate-12 rounded-[40%] bg-amber-300/10 blur-3xl" />
      <div className="relative">
        <div className="flex items-center justify-between gap-4">
          <img src={logoWhite} alt="Alhijaz" className="h-auto w-[88px]" />
          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-[#22050A]/75 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-amber-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
            <Sparkles className="h-3 w-3" strokeWidth={2.4} />
            TOP 20
          </div>
        </div>

        <h1 className="mt-8 text-2xl font-bold leading-[1.1] tracking-normal">
          Partner Pilihan Alhijaz
        </h1>
        <p className="mt-2.5 text-[13px] font-medium leading-5 text-rose-100">
          Resmi. Responsif. Mudah dihubungi.
        </p>

        <div className="mt-5 flex items-center gap-4 text-[11px] font-bold text-white">
          <span className="inline-flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-amber-200" fill="currentColor" strokeWidth={2.4} />
            Fast Response
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-amber-200" strokeWidth={2.4} />
            Verified Partner
          </span>
        </div>
      </div>
    </section>
  );
}

function partnerInitials(name: string) {
  return name
    .split(/[ /\t]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'AH';
}

function PartnerPhoto({ partner }: { partner: TopPartner }) {
  const [failed, setFailed] = useState(false);
  const initials = partnerInitials(partner.name);

  if (!partner.photo || failed) {
    return (
      <div className="flex h-24 w-24 flex-none items-center justify-center rounded-[13px] border border-rose-100 bg-gradient-to-br from-rose-50 to-amber-50 text-lg font-bold text-rose-800">
        {initials}
      </div>
    );
  }

  return (
    <img
      src={partner.photo}
      alt={partner.name}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-24 w-24 flex-none rounded-[13px] border border-rose-100 object-cover"
    />
  );
}

function PartnerCard({ partner, index }: { partner: TopPartner; index: number }) {
  return (
    <article
      className="flex min-h-[112px] w-full gap-2.5 rounded-2xl border border-gray-100 bg-white p-2 shadow-[0_8px_22px_rgba(15,23,42,0.06)] animate-[topPartnerCardIn_520ms_cubic-bezier(0.22,1,0.36,1)_both] dark:border-slate-700 dark:bg-slate-800"
      style={{ animationDelay: `${(index % REVEAL_PARTNER_STEP) * 70}ms` }}
    >
      <PartnerPhoto partner={partner} />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
        <h2 className="line-clamp-2 text-sm font-bold leading-[1.18] tracking-normal text-gray-950 dark:text-white">
          {partner.name}
        </h2>

        {partner.waLink ? (
          <div className="flex items-center gap-2">
            <a
              href={partner.waLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700 shadow-[0_8px_18px_rgba(5,150,105,0.12)] transition-colors active:bg-emerald-100 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-300 dark:active:bg-emerald-900/30"
            >
              <WhatsAppIcon size={14} />
              Hubungi via WhatsApp
            </a>
            <span
              aria-label="Partner terverifikasi"
              title="Partner terverifikasi"
              className="inline-flex h-6 w-6 flex-none items-center justify-center"
            >
              <BadgeCheck className="h-5 w-5" fill="#1D9BF0" stroke="white" strokeWidth={2.5} />
            </span>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function PartnerSkeleton() {
  return (
    <div className="flex min-h-[112px] w-full gap-2.5 rounded-2xl border border-gray-100 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="h-24 w-24 flex-none animate-pulse rounded-[13px] bg-gray-100 dark:bg-slate-700" />
      <div className="flex flex-1 flex-col justify-center gap-2.5">
        <div className="h-4 w-32 animate-pulse rounded bg-gray-100 dark:bg-slate-700" />
        <div className="h-8 w-36 animate-pulse rounded-full bg-emerald-50 dark:bg-slate-700" />
      </div>
    </div>
  );
}

export default function TopPartnerPage() {
  const [partners, setPartners] = useState<TopPartner[]>([]);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_PARTNERS);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const revealSentinelRef = useRef<HTMLDivElement | null>(null);

  const loadPartners = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/top-partner', { cache: 'no-store' });
      if (!res.ok) throw new Error('Partner belum tersedia');
      const payload = (await res.json()) as TopPartnerResponse;
      const list = payload.partners || payload.data || [];
      if (!Array.isArray(list) || list.length === 0) throw new Error('Data partner kosong');
      setPartners(shufflePartners(list).slice(0, 20));
      setVisibleCount(INITIAL_VISIBLE_PARTNERS);
      setHasScrolled(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat partner');
      setPartners([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setTopPartnerMeta();
    void loadPartners();
  }, [loadPartners]);

  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > 24) setHasScrolled(true);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const node = revealSentinelRef.current;
    if (!node || loading || error || !hasScrolled || visibleCount >= partners.length) return undefined;

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setVisibleCount((current) => Math.min(current + REVEAL_PARTNER_STEP, partners.length));
    }, { rootMargin: '120px 0px 120px 0px' });

    observer.observe(node);
    return () => observer.disconnect();
  }, [error, hasScrolled, loading, partners.length, visibleCount]);

  const skeletons = useMemo(() => Array.from({ length: 8 }, (_, idx) => idx), []);
  const visiblePartners = useMemo(() => partners.slice(0, visibleCount), [partners, visibleCount]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 font-sans text-gray-950 dark:from-slate-900 dark:to-slate-950">
      <div className="mx-auto min-h-screen w-full max-w-lg">
        <TopPartnerHero />

        <div className="px-2.5 pb-7 pt-3">
          {loading ? (
            <div className="space-y-2.5">
              {skeletons.map((idx) => (
                <PartnerSkeleton key={idx} />
              ))}
            </div>
          ) : error ? (
            <section className="rounded-2xl border border-rose-100 bg-white p-5 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <p className="text-sm font-semibold text-gray-700 dark:text-slate-200">{error}</p>
              <button
                type="button"
                onClick={() => void loadPartners()}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700 active:opacity-80 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-300"
              >
                <RefreshCw className="h-4 w-4" />
                Coba lagi
              </button>
            </section>
          ) : (
            <div className="space-y-2.5">
              {visiblePartners.map((partner, index) => (
                <PartnerCard key={partner.id || `${partner.name}-${index}`} partner={partner} index={index} />
              ))}
              {visibleCount < partners.length ? (
                <div ref={revealSentinelRef} className="h-6 w-full" aria-hidden="true" />
              ) : null}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

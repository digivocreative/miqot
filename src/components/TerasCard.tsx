import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AtSign, ChevronRight, Coffee, MessagesSquare } from 'lucide-react';
import { handleAgentPhotoError } from '../lib/agent-photo';
import { MentionText } from './MentionText';
import { timeAgo } from '../lib/communityNotifications';
import {
  normalizeTeaserData,
  type TeaserAvatar as TeaserAvatarData,
  type TerasTeaserData,
} from '../lib/terasTeaser';
import { getAuthHeaders } from './LoginPage';

const TICKER_INTERVAL_MS = 4500;

type TerasCardState =
  | { status: 'loading' }
  | { status: 'data'; data: TerasTeaserData }
  | { status: 'error' };

function initials(name: string | null): string {
  return String(name || 'Agent')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0))
    .join('')
    .toUpperCase() || 'A';
}

function TeaserAvatar({
  avatar,
  size,
  className = '',
}: {
  avatar: TeaserAvatarData;
  size: 'recent' | 'latest';
  className?: string;
}) {
  const [fallback, setFallback] = useState(!avatar.photo);

  useEffect(() => {
    setFallback(!avatar.photo);
  }, [avatar.photo]);

  const sizeClass = size === 'recent'
    ? 'h-[18px] w-[18px] text-[7px]'
    : 'h-5 w-5 text-[8px]';
  const imageSize = size === 'recent' ? 36 : 40;

  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal-100 font-extrabold text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 ${sizeClass} ${className}`}
    >
      {avatar.photo && !fallback ? (
        <img
          src={avatar.photo}
          alt={avatar.name || 'Agent'}
          className="h-full w-full object-cover"
          onError={event => handleAgentPhotoError(
            event.currentTarget,
            avatar.name,
            imageSize,
            () => setFallback(true),
          )}
        />
      ) : (
        <span aria-hidden="true">{initials(avatar.name)}</span>
      )}
    </span>
  );
}

export default function TerasCard({ onOpen }: { onOpen: () => void }) {
  const [state, setState] = useState<TerasCardState>({ status: 'loading' });
  const [frame, setFrame] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [tabHidden, setTabHidden] = useState(
    () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
  );
  // Dibaca sekali per mount saja — preferensi OS praktis tak berubah mid-sesi,
  // dan rotasi yang tiba-tiba hidup/mati malah mengagetkan.
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  useEffect(() => {
    const controller = new AbortController();

    const loadTeaser = async () => {
      try {
        const response = await fetch('/api/community/teaser', {
          headers: getAuthHeaders(),
          signal: controller.signal,
        });
        const rawBody = await response.text();
        let payload: unknown;
        try {
          payload = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          throw new Error('Respons Jendela Teras tidak valid');
        }
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
          throw new Error('Respons Jendela Teras tidak valid');
        }
        const envelope = payload as { success?: boolean; data?: unknown; error?: string };
        if (!response.ok || envelope.success === false || typeof envelope.error === 'string') {
          throw new Error(envelope.error || 'Gagal memuat Jendela Teras');
        }
        const data = normalizeTeaserData(envelope.data);
        if (!controller.signal.aborted) setState({ status: 'data', data });
      } catch {
        if (controller.signal.aborted) return;
        setState({ status: 'error' });
      }
    };

    void loadTeaser();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const onVisibility = () => setTabHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const data = state.status === 'data' ? state.data : null;
  const posts = data?.posts ?? [];
  const unreadCount = data?.unread_count || 0;
  const rotating = posts.length > 1 && !reducedMotion;
  const activeIndex = posts.length > 0 ? frame % posts.length : 0;
  const activePost = posts[activeIndex] ?? null;

  useEffect(() => {
    if (!rotating || hovering || tabHidden) return;
    const id = window.setInterval(() => setFrame(prev => prev + 1), TICKER_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [rotating, hovering, tabHidden]);

  const mentionBySlug = useMemo(
    () => new Map((activePost?.mentions || []).map(member => [member.slug.toLowerCase(), member])),
    [activePost],
  );
  const hasMention = mentionBySlug.size > 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      aria-label="Teras"
      aria-busy={state.status === 'loading'}
      className="group min-h-[88px] w-full rounded-2xl border border-teal-200/70 bg-gradient-to-br from-teal-50 via-white to-cyan-100/70 p-3 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:border-teal-800/40 dark:from-teal-950/40 dark:via-slate-800 dark:to-slate-800 dark:focus-visible:ring-offset-slate-950"
    >
      {state.status === 'loading' ? (
        <div className="animate-pulse" aria-label="Memuat Jendela Teras" aria-busy="true">
          <div className="flex h-9 items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-teal-200/70 dark:bg-teal-900/50" />
            <div className="h-3.5 w-20 rounded bg-gray-200 dark:bg-slate-700" />
            <div className="ml-auto h-[18px] w-16 rounded-full bg-gray-200 dark:bg-slate-700" />
          </div>
          <div className="mt-2 h-[26px] rounded bg-gray-200/80 dark:bg-slate-700/80" />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-cyan-600 text-white shadow-lg shadow-teal-500/30 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-3 dark:from-teal-500 dark:to-cyan-700 dark:shadow-teal-900/40">
              <MessagesSquare size={17} className="animate-icon-breathe" />
            </span>
            <span className="text-sm font-extrabold text-gray-900 dark:text-white">Teras</span>
            {unreadCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-extrabold text-white shadow-md shadow-red-500/30">
                {!reducedMotion && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/90" aria-hidden="true" />}
                {unreadCount > 9 ? '9+' : unreadCount} baru
              </span>
            )}
            <span className="flex-1" />
            {!!data?.recent_avatars.length && (
              <span className="flex flex-none items-center" aria-label="Agent terbaru">
                {data.recent_avatars.slice(0, 3).map((avatar, index) => (
                  <TeaserAvatar
                    key={`${avatar.name || 'agent'}-${index}`}
                    avatar={avatar}
                    size="recent"
                    className={`${index > 0 ? '-ml-1.5' : ''} border-2 border-white dark:border-slate-800`}
                  />
                ))}
              </span>
            )}
            <ChevronRight size={16} className="shrink-0 text-gray-400 dark:text-slate-500" />
          </div>

          {activePost ? (
            // aria-live off: pergantian frame tiap 4,5 dtk jangan membanjiri
            // screen reader; isi lengkap tetap terbaca di halaman Teras.
            <div className="relative mt-2 h-[26px] overflow-hidden" aria-live="off">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activeIndex}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="absolute inset-0 flex min-w-0 items-center gap-2"
                >
                  <TeaserAvatar avatar={activePost.author} size="latest" />
                  {/* Preview yang memuat @mention dibedakan: penanda @ + latar
                      emerald tipis, karena pill mention-nya bisa terpotong ellipsis. */}
                  {hasMention && (
                    <AtSign
                      size={13}
                      className="shrink-0 text-emerald-600 dark:text-emerald-400"
                      aria-label="Ada sebutan"
                    />
                  )}
                  <p
                    className={`min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] ${
                      hasMention
                        ? 'rounded-md bg-emerald-50/80 px-1.5 py-0.5 text-emerald-900/80 dark:bg-emerald-500/10 dark:text-emerald-100/80'
                        : 'text-gray-500 dark:text-slate-400'
                    }`}
                  >
                    <b className={`font-bold ${hasMention ? 'text-emerald-950 dark:text-white' : 'text-gray-900 dark:text-white'}`}>
                      {activePost.author.name || 'Agent'}
                    </b>
                    &nbsp;
                    <MentionText body={activePost.body_snippet} memberBySlug={mentionBySlug} />
                  </p>
                  {activePost.thumb && (
                    <img
                      src={activePost.thumb}
                      alt=""
                      loading="lazy"
                      className="h-[26px] w-[26px] flex-none rounded-md border border-white/70 object-cover dark:border-slate-700"
                      onError={event => { event.currentTarget.style.display = 'none'; }}
                    />
                  )}
                  <span className="flex-none text-[11px] font-semibold text-gray-400 dark:text-slate-500">
                    {timeAgo(activePost.created_at)}
                  </span>
                </motion.div>
              </AnimatePresence>
            </div>
          ) : (
            <div className="mt-2 flex min-w-0 items-center gap-2">
              <Coffee size={17} className="shrink-0 text-teal-600 dark:text-teal-400" />
              <p className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-gray-500 dark:text-slate-400">
                Teras masih sepi hari ini. <b className="font-bold text-teal-600 dark:text-teal-400">Jadilah yang pertama berbagi.</b>
              </p>
            </div>
          )}
        </>
      )}
    </button>
  );
}

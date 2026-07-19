import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertCircle,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flag,
  AtSign,
  Heart,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  MessageCircle,
  MoreHorizontal,
  Play,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { handleAgentPhotoError } from '../lib/agent-photo';
import { terasShareUrl, isTerasShortCode } from '../../lib/teras-share.js';
import PlyrVideo from './PlyrVideo';
import { getAuthHeaders } from './LoginPage';
import { MentionText } from './MentionText';
import { MentionAutocomplete } from './MentionAutocomplete';
import { MentionHighlightLayer } from './MentionHighlightLayer';
import {
  extractMentionSlugs,
  detectMentionQuery,
  applyMentionSelection,
  rankMentionCandidates,
  type MentionMember,
} from '../lib/communityMentions';

type ReactionType = 'suka' | 'selamat' | 'aamiin';
type CommunityMediaType = 'image' | 'video';

interface TerasAgent {
  slug: string;
  name: string;
  photo?: string | null;
  role?: string;
}

interface CommunityAuthor {
  name: string | null;
  slug: string | null;
  photo: string | null;
}

interface ReactionCounts {
  suka: number;
  selamat: number;
  aamiin: number;
}

interface CommunityPost {
  id: string;
  body: string;
  photo_url: string | null;
  media?: CommunityMedia[];
  is_system: boolean;
  created_at: string;
  author: CommunityAuthor;
  reactions: ReactionCounts;
  my_reaction: ReactionType | null;
  reaction_sample_name: string | null;
  comment_count: number;
  quote_count?: number;
  quoted_post?: QuotedPostPreview | null;
  link_preview?: LinkPreview | null;
  is_own: boolean;
}

interface CommunityMedia {
  type: CommunityMediaType;
  url: string;
}

interface QuotedPostPreview {
  available: boolean;
  id?: string;
  body?: string;
  media?: CommunityMedia[];
  created_at?: string;
  is_system?: boolean;
  author?: CommunityAuthor;
}

interface LinkPreview {
  url: string;
  canonical_url?: string;
  title?: string;
  description?: string;
  image?: string;
  site_name?: string;
}

interface CommunityComment {
  id: string;
  body: string;
  media?: CommunityMedia[];
  created_at: string;
  author: CommunityAuthor;
  is_own: boolean;
}

interface CommentPanelState {
  open: boolean;
  loaded: boolean;
  loading: boolean;
  sending: boolean;
  comments: CommunityComment[];
  input: string;
  media: ComposerMedia[];
  error: string | null;
}

interface ComposerMedia {
  id: string;
  uploadId: string;
  type: CommunityMediaType;
  previewUrl: string;
  uploadBlob: Blob;
  status: 'processing' | 'ready' | 'uploading' | 'error';
  url?: string;
  error?: string;
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
  next_cursor?: string | null;
  url?: string;
}

interface ToastState {
  message: string;
  tone: 'success' | 'error';
}

interface MediaViewerState {
  media: CommunityMedia[];
  index: number;
  authorName: string;
  direction: number;
  startTime?: number;
  autoPlay?: boolean;
  muted?: boolean;
}

interface MediaResume {
  time: number;
  playing: boolean;
  muted: boolean;
}

interface CommunityFeedHead {
  latest_id: string;
  latest_created_at: string;
}

interface MentionInboxItem {
  id: string;
  post_id: string;
  comment_id: string | null;
  author: CommunityAuthor;
  snippet: string;
  created_at: string;
  seen_at: string | null;
}

const REQUEST_TIMEOUT_MS = 20_000;
const MEDIA_UPLOAD_TIMEOUT_MS = 120_000;
const FEED_HEAD_POLL_INTERVAL_MS = 20_000;
const MENTION_HEAD_POLL_INTERVAL_MS = 30_000;
const MAX_COMMUNITY_MEDIA = 10;
const COMPOSER_PROMPTS = [
  'Apa yang baru hari ini?',
  'Bagikan momen bersama jamaah…',
  'Ada kabar baik dari keberangkatan?',
  'Cerita seru dari Tanah Suci?',
  'Punya tips untuk sesama agent?',
];
const COMPOSER_PLACEHOLDER = 'Apa yang ingin dibagikan?';
const MAX_COMMUNITY_BODY_CHARS = 500;
const MAX_COMMUNITY_COMMENT_CHARS = 300;
// Small buffer over the limit so pasted text isn't silently truncated —
// the counter turns red and submit stays disabled until it's trimmed.
const COMPOSER_BODY_HARD_CAP = 520;
const COMMENT_BODY_HARD_CAP = 320;
const MAX_COMMUNITY_SOURCE_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_COMMUNITY_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_COMMUNITY_VIDEO_BYTES = 20 * 1024 * 1024;
const SUPPORTED_VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
const MEDIA_VIEWER_SLIDE_VARIANTS = {
  enter: (direction: number) => ({
    x: direction === 0 ? 0 : `${direction * 100}%`,
    opacity: direction === 0 ? 1 : 0.3,
    scale: direction === 0 ? 1 : 0.96,
  }),
  center: { x: 0, opacity: 1, scale: 1 },
  exit: (direction: number) => ({
    x: direction === 0 ? 0 : `${direction * -100}%`,
    opacity: 0.3,
    scale: 0.96,
  }),
};
function getInitials(name: string): string {
  return String(name || 'Agent')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase() || 'A';
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

// Salinan ringan dari `firstUrlInText` (lib/community-link-preview.js) — modul
// `lib/` itu server-side dan tidak ada preseden impor lintas-folder ke FE, jadi
// util deteksi URL pertama di body composer diduplikasi di sini secara sengaja.
const FE_URL_RE = /\bhttps?:\/\/[^\s<>"')]+/i;
function firstUrlInBody(text: string): string | null {
  const match = text.match(FE_URL_RE);
  if (!match) return null;
  return match[0].replace(/[.,;:!?)\]}'"]+$/, '') || null;
}

async function requestJson<T>(
  url: string,
  init: RequestInit,
  fallbackMessage: string,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<ApiEnvelope<T>> {
  const controller = new AbortController();
  const upstreamSignal = init.signal;
  let timedOut = false;
  const abortFromUpstream = () => controller.abort();

  if (upstreamSignal?.aborted) abortFromUpstream();
  else upstreamSignal?.addEventListener('abort', abortFromUpstream, { once: true });

  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const rawBody = await response.text();
    let payload: ApiEnvelope<T> = {};
    const parsed: unknown = rawBody ? JSON.parse(rawBody) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid response');
    }
    payload = parsed as ApiEnvelope<T>;

    if (!response.ok || payload.success === false || typeof payload.error === 'string') {
      throw new Error(payload.error || fallbackMessage);
    }

    return payload;
  } catch (requestError) {
    if (timedOut) throw new Error(fallbackMessage);
    if (requestError instanceof SyntaxError || (requestError instanceof Error && requestError.message === 'invalid response')) {
      throw new Error(fallbackMessage);
    }
    throw requestError;
  } finally {
    window.clearTimeout(timeoutId);
    upstreamSignal?.removeEventListener('abort', abortFromUpstream);
  }
}

function timeAgo(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const elapsed = Math.max(0, Date.now() - date.getTime());
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (elapsed < minute) return 'Baru saja';
  if (elapsed < hour) return `${Math.floor(elapsed / minute)} menit`;
  if (elapsed < day) return `${Math.floor(elapsed / hour)} jam`;
  if (elapsed <= 7 * day) return `${Math.floor(elapsed / day)} hari`;

  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date).replace(/\./g, '');
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Media tidak dapat dibaca'));
    };
    reader.onerror = () => reject(new Error('Media tidak dapat dibaca'));
    reader.readAsDataURL(file);
  });
}

function resizeCommunityPhoto(source: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        reject(new Error('Foto tidak valid'));
        return;
      }

      const width = Math.min(1600, image.naturalWidth);
      const height = Math.max(1, Math.round(image.naturalHeight * (width / image.naturalWidth)));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Foto tidak dapat diproses'));
        return;
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      try {
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch {
        reject(new Error('Foto tidak dapat diproses'));
      }
    };
    image.onerror = () => reject(new Error('Foto tidak valid'));
    image.src = source;
  });
}

function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] || '';
  return Math.ceil((base64.length * 3) / 4);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [metadata, base64 = ''] = dataUrl.split(',');
  const mime = metadata.match(/^data:([^;]+);base64$/)?.[1];
  if (!mime || !base64) throw new Error('Foto tidak dapat diproses');
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

function normalizePostMedia(post: CommunityPost): CommunityMedia[] {
  const media = Array.isArray(post.media)
    ? post.media.filter(item => (
      !!item
      && (item.type === 'image' || item.type === 'video')
      && typeof item.url === 'string'
      && item.url.length > 0
    )).slice(0, MAX_COMMUNITY_MEDIA)
    : [];
  if (media.length > 0) return media;
  return post.photo_url ? [{ type: 'image', url: post.photo_url }] : [];
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index], index);
    }
  });
  const settledWorkers = await Promise.allSettled(workers);
  const failedWorker = settledWorkers.find(result => result.status === 'rejected');
  if (failedWorker?.status === 'rejected') throw failedWorker.reason;
  return results;
}

function emptyCommentPanel(open = true): CommentPanelState {
  return {
    open,
    loaded: false,
    loading: false,
    sending: false,
    comments: [],
    input: '',
    media: [],
    error: null,
  };
}

function AgentAvatar({
  name,
  photo,
  size = 'post',
}: {
  name: string;
  photo?: string | null;
  size?: 'post' | 'comment';
}) {
  const [fallback, setFallback] = useState(!photo);

  useEffect(() => {
    setFallback(!photo);
  }, [photo]);

  const sizeClass = size === 'comment' ? 'h-7 w-7 text-[9px]' : 'h-10 w-10 text-xs';
  const imageSize = size === 'comment' ? 28 : 40;

  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100 font-bold text-emerald-700 ring-1 ring-black/[0.06] dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-white/10 ${sizeClass}`}>
      {photo && !fallback ? (
        <img
          src={photo}
          alt={name}
          className="h-full w-full object-cover"
          onError={event => handleAgentPhotoError(
            event.currentTarget,
            name,
            imageSize,
            () => setFallback(true),
          )}
        />
      ) : (
        <span aria-hidden="true">{getInitials(name)}</span>
      )}
    </div>
  );
}

function PostSkeleton({ withMedia = false }: { withMedia?: boolean }) {
  return (
    <div data-teras-skeleton-post className="relative animate-pulse border-b border-gray-100 bg-white px-4 py-3 motion-reduce:animate-none dark:border-slate-800 dark:bg-slate-900">
      <div className="absolute right-2 top-0 h-11 w-11 rounded-full bg-gray-100 dark:bg-slate-800" />
      <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-3">
        <div className="h-10 w-10 shrink-0 rounded-full bg-gray-200 dark:bg-slate-700" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 pr-10">
            <div className="h-3 w-28 rounded bg-gray-200 dark:bg-slate-700" />
            <div className="h-2.5 w-12 rounded bg-gray-100 dark:bg-slate-700/70" />
          </div>
          <div className="mt-2 space-y-2">
            <div className="h-3.5 w-full rounded bg-gray-100 dark:bg-slate-700/70" />
            <div className="h-3.5 w-5/6 rounded bg-gray-100 dark:bg-slate-700/70" />
            <div className="h-3.5 w-2/3 rounded bg-gray-100 dark:bg-slate-700/70" />
          </div>
          {withMedia && (
            <div data-teras-skeleton-media className="mt-2 aspect-[4/3] max-h-[24rem] rounded-xl bg-gray-100 dark:bg-slate-800" />
          )}
          <div className="mt-1 flex gap-1 py-0.5">
            <div className="h-11 w-11 rounded-full bg-gray-100 dark:bg-slate-800" />
            <div className="h-11 w-11 rounded-full bg-gray-100 dark:bg-slate-800" />
          </div>
        </div>
      </div>
    </div>
  );
}

type PostMediaFit = 'natural' | 'height' | 'cover';

function LinkPreviewCard({ preview }: { preview: LinkPreview }) {
  const [imageBroken, setImageBroken] = useState(false);
  const href = preview.canonical_url || preview.url;
  let domain = preview.site_name;
  if (!domain) {
    try {
      domain = new URL(preview.url).hostname.replace(/^www\./, '');
    } catch {
      domain = preview.url;
    }
  }
  const showImage = !!preview.image && !imageBroken;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={event => event.stopPropagation()}
      className="mt-2 block min-w-0 overflow-hidden rounded-2xl border border-gray-200/80 bg-white transition-colors hover:bg-gray-50 dark:border-slate-700/60 dark:bg-slate-900/60 dark:hover:bg-slate-900"
    >
      {showImage && (
        <img
          src={preview.image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="aspect-[1.91/1] w-full object-cover"
          onError={() => setImageBroken(true)}
        />
      )}
      <div className="px-3.5 py-3">
        <div className="truncate text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-slate-500">
          {domain}
        </div>
        {preview.title && (
          <div className="mt-0.5 line-clamp-2 text-[14px] font-bold leading-[1.4] text-gray-900 dark:text-white">
            {preview.title}
          </div>
        )}
        {preview.description && (
          <div className="mt-0.5 line-clamp-2 text-[13px] leading-[1.4] text-gray-500 dark:text-slate-400">
            {preview.description}
          </div>
        )}
      </div>
    </a>
  );
}

function QuotedPostCard({
  quoted,
  interactive = false,
  onOpenPost,
  onOpenMedia,
}: {
  quoted: QuotedPostPreview;
  interactive?: boolean;
  onOpenPost?: () => void;
  onOpenMedia?: (index: number, trigger: HTMLElement) => void;
}) {
  if (!quoted.available || !quoted.id) {
    return (
      <div className="mt-2 rounded-2xl border border-gray-200/80 bg-gray-50 px-3.5 py-3 text-[13px] font-medium text-gray-400 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-500">
        Kiriman sudah dihapus
      </div>
    );
  }

  const authorName = quoted.author?.name || (quoted.is_system ? 'Miqot' : 'Agent');
  const media = quoted.media || [];

  return (
    <div
      role={interactive ? 'link' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `Buka kiriman ${authorName} yang dikutip` : undefined}
      onClick={interactive ? event => {
        event.stopPropagation();
        onOpenPost?.();
      } : undefined}
      onKeyDown={interactive ? event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          onOpenPost?.();
        }
      } : undefined}
      className={`mt-2 min-w-0 rounded-2xl border border-gray-200/80 px-3.5 py-3 dark:border-slate-700/60 ${
        interactive
          ? 'cursor-pointer transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:hover:bg-slate-900'
          : ''
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        {quoted.is_system ? (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-white">
            <Sparkles size={12} />
          </div>
        ) : (
          <AgentAvatar name={authorName} photo={quoted.author?.photo} size="comment" />
        )}
        <p className="min-w-0 truncate text-[13px] font-bold text-gray-900 dark:text-white">{authorName}</p>
        {quoted.created_at && (
          <time dateTime={quoted.created_at} className="shrink-0 text-[11px] font-medium text-gray-500 dark:text-slate-400">
            {timeAgo(quoted.created_at)}
          </time>
        )}
      </div>

      {quoted.body && (
        <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap break-words text-[14px] leading-[1.5] text-gray-800 dark:text-slate-200">
          {quoted.body}
        </p>
      )}

      {media.length > 0 && (
        <div className="mt-2 flex snap-x gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {media.map((item, index) => (
            <button
              key={`${item.type}:${item.url}`}
              type="button"
              disabled={!interactive}
              onClick={event => {
                event.stopPropagation();
                onOpenMedia?.(index, event.currentTarget);
              }}
              aria-label={`Lihat ${item.type === 'video' ? 'video' : 'foto'} ${index + 1} kiriman ${authorName}`}
              className="relative h-32 shrink-0 snap-start overflow-hidden rounded-xl border border-gray-100 bg-gray-100 dark:border-slate-700 dark:bg-slate-950"
            >
              {item.type === 'video' ? (
                <>
                  <video
                    src={item.url}
                    preload="metadata"
                    muted
                    playsInline
                    aria-hidden="true"
                    className="h-full w-auto min-w-[6rem] max-w-[60vw] bg-black object-contain"
                  />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white">
                      <Play size={14} fill="currentColor" />
                    </span>
                  </span>
                </>
              ) : (
                <img
                  src={item.url}
                  alt={`Foto ${index + 1} kiriman ${authorName}`}
                  loading="lazy"
                  className="h-full w-auto min-w-[6rem] max-w-[60vw] object-cover"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PostImage({
  src,
  alt,
  fit,
}: {
  src: string;
  alt: string;
  fit: PostMediaFit;
}) {
  const [loaded, setLoaded] = useState(false);
  // 'natural': ikuti rasio asli gambar (dibatasi tinggi maksimum feed);
  // 'height': tinggi mengikuti rail carousel, lebar menyesuaikan rasio;
  // 'cover': isi penuh sel grid (layout 2 media).
  const fitClass = fit === 'natural'
    ? 'block max-h-[22rem] w-auto max-w-full object-contain'
    : fit === 'height'
      ? 'block h-full w-auto max-w-full object-contain'
      : 'h-full w-full object-cover';
  return (
    <>
      {!loaded && (
        <span
          aria-hidden="true"
          className="absolute inset-0 animate-pulse bg-gray-200 motion-reduce:animate-none dark:bg-slate-800"
        />
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className={`${fitClass} transition duration-300 group-active:scale-[0.985] motion-reduce:transition-none ${
          loaded ? 'opacity-100' : `opacity-0 ${fit === 'natural' ? 'min-h-[16rem] min-w-[12rem]' : ''}`
        }`}
      />
    </>
  );
}

function PostMediaRail({
  media,
  authorName,
  onOpen,
}: {
  media: CommunityMedia[];
  authorName: string;
  onOpen: (index: number, trigger: HTMLElement, resume?: MediaResume) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const reduceMotion = useReducedMotion();
  const mediaSignature = media.map(item => `${item.type}:${item.url}`).join('|');

  useEffect(() => {
    setActiveIndex(0);
    if (railRef.current) railRef.current.scrollLeft = 0;
  }, [mediaSignature]);

  const scrollToIndex = (index: number) => {
    const boundedIndex = Math.max(0, Math.min(media.length - 1, index));
    const rail = railRef.current;
    const item = rail?.querySelectorAll<HTMLElement>('[data-media-slide]').item(boundedIndex);
    if (rail && item) {
      const targetLeft = rail.scrollLeft
        + item.getBoundingClientRect().left
        - rail.getBoundingClientRect().left;
      rail.scrollTo({ left: targetLeft, behavior: reduceMotion ? 'auto' : 'smooth' });
    }
    setActiveIndex(boundedIndex);
  };

  const updateActiveIndex = () => {
    const rail = railRef.current;
    if (!rail) return;
    const railLeft = rail.getBoundingClientRect().left;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    rail.querySelectorAll<HTMLElement>('[data-media-slide]').forEach((child, index) => {
      const distance = Math.abs(child.getBoundingClientRect().left - railLeft);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    setActiveIndex(closestIndex);
  };

  const renderMedia = (item: CommunityMedia, index: number, mode: 'single' | 'pair' | 'carousel') => {
    const positionLabel = media.length === 1 ? '' : ` ${index + 1} dari ${media.length}`;
    if (item.type === 'video') {
      return (
        <div className={`relative ${mode === 'single' ? 'w-fit max-w-full' : mode === 'carousel' ? 'h-full w-fit min-w-[14rem] max-w-full' : 'h-full w-full'}`}>
          <PlyrVideo
            src={item.url}
            ariaLabel={`Video ${index + 1} dari ${media.length} kiriman ${authorName}`}
            mode={mode === 'single' ? 'fit' : mode === 'carousel' ? 'strip' : 'fill'}
            minWidth={mode === 'carousel' ? '14rem' : undefined}
          />
          <button
            type="button"
            onClick={event => {
              // Carry the feed video's position into the viewer, and pause the
              // feed instance so it doesn't keep playing (double audio) behind it.
              const video = event.currentTarget.parentElement?.querySelector('video');
              const resume: MediaResume | undefined = video
                ? { time: video.currentTime, playing: !video.paused, muted: video.muted }
                : undefined;
              video?.pause();
              onOpen(index, event.currentTarget, resume);
            }}
            aria-label={`Buka video${positionLabel} kiriman ${authorName} layar penuh`}
            aria-haspopup="dialog"
            title="Buka layar penuh"
            className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white shadow-md backdrop-blur-sm transition-all hover:bg-black/75 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Maximize2 size={18} />
          </button>
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={event => onOpen(index, event.currentTarget)}
        aria-label={`Buka foto${positionLabel} kiriman ${authorName} layar penuh`}
        aria-haspopup="dialog"
        className={`group relative block overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/70 ${
          mode === 'single' ? 'w-fit max-w-full' : mode === 'carousel' ? 'h-full w-fit max-w-full' : 'h-full w-full'
        }`}
      >
        <PostImage
          src={item.url}
          alt={media.length === 1
            ? `Foto kiriman ${authorName}`
            : `Foto ${index + 1} dari ${media.length} kiriman ${authorName}`}
          fit={mode === 'single' ? 'natural' : mode === 'carousel' ? 'height' : 'cover'}
        />
      </button>
    );
  };

  if (media.length === 1) {
    return (
      <div data-media-layout="single" className="mt-2 w-fit max-w-full overflow-hidden rounded-xl border border-gray-100 bg-gray-100 dark:border-slate-700 dark:bg-slate-950">
        {renderMedia(media[0], 0, 'single')}
      </div>
    );
  }

  if (media.length === 2) {
    return (
      <div data-media-layout="pair" className="mt-2 grid grid-cols-2 gap-1" role="group" aria-label={`2 media kiriman ${authorName} ditampilkan berdampingan`}>
        {media.map((item, index) => (
          <div
            key={`${item.type}-${item.url}-${index}`}
            className="aspect-[4/5] max-h-[24rem] overflow-hidden rounded-xl border border-gray-100 bg-gray-100 dark:border-slate-700 dark:bg-slate-950"
          >
            {renderMedia(item, index, 'pair')}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div data-media-layout="carousel" className="relative mt-2" aria-label={`Media kiriman ${authorName}, ${media.length} item`}>
      <div
        ref={railRef}
        role="region"
        tabIndex={0}
        aria-roledescription="carousel"
        aria-label={`${media.length} media. Geser ke samping untuk melihat semuanya.`}
        onScroll={updateActiveIndex}
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            scrollToIndex(activeIndex - 1);
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            scrollToIndex(activeIndex + 1);
          }
        }}
        className="flex h-[21rem] snap-x snap-mandatory gap-1 overflow-x-auto overscroll-x-contain scroll-smooth rounded-xl outline-none motion-reduce:scroll-auto [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-emerald-500/60 [&::-webkit-scrollbar]:hidden"
      >
        {media.map((item, index) => (
          <div
            key={`${item.type}-${item.url}-${index}`}
            data-media-slide
            className="h-full min-w-[9rem] max-w-[88%] shrink-0 snap-start overflow-hidden rounded-xl border border-gray-100 bg-gray-100 dark:border-slate-700 dark:bg-slate-950"
          >
            {renderMedia(item, index, 'carousel')}
          </div>
        ))}
        <div aria-hidden="true" className="w-8 shrink-0" />
      </div>

      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label={`Media ${activeIndex + 1} dari ${media.length}`}
        className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/65 px-2 py-1 text-[10px] font-bold tabular-nums text-white backdrop-blur-sm"
      >
        {activeIndex + 1}/{media.length}
      </span>
      <>
          <button
            type="button"
            onClick={() => scrollToIndex(activeIndex - 1)}
            disabled={activeIndex === 0}
            aria-label="Media sebelumnya"
            className="absolute left-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white shadow-md backdrop-blur-sm transition-all hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:pointer-events-none disabled:opacity-0 sm:flex"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => scrollToIndex(activeIndex + 1)}
            disabled={activeIndex === media.length - 1}
            aria-label="Media berikutnya"
            className="absolute right-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white shadow-md backdrop-blur-sm transition-all hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:pointer-events-none disabled:opacity-0 sm:flex"
          >
            <ChevronRight size={18} />
          </button>
      </>
    </div>
  );
}

function CommentSkeleton() {
  return (
    <div className="py-1.5" aria-label="Memuat komentar" aria-busy="true">
      {[0, 1].map(item => (
        <div key={item} className="mt-2 grid animate-pulse grid-cols-[40px_minmax(0,1fr)] gap-x-3 motion-reduce:animate-none">
          <div className="flex flex-col items-center">
            <div className="h-7 w-7 rounded-full bg-gray-200 dark:bg-slate-700" />
            <div aria-hidden="true" className="mt-1.5 -mb-2 w-px flex-1 bg-gray-200 dark:bg-slate-700" />
          </div>
          <div className="min-w-0 space-y-2 py-1">
            <div className="h-2.5 w-24 rounded-full bg-gray-200 dark:bg-slate-700" />
            <div className="h-2.5 w-4/5 rounded-full bg-gray-100 dark:bg-slate-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TypingPrompt({ prompts }: { prompts: string[] }) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(() => (reduceMotion ? prompts[0] || '' : ''));

  useEffect(() => {
    if (prompts.length === 0) return;

    if (reduceMotion) {
      let promptIndex = 0;
      setDisplay(prompts[0]);
      const interval = window.setInterval(() => {
        promptIndex = (promptIndex + 1) % prompts.length;
        setDisplay(prompts[promptIndex]);
      }, 4000);
      return () => window.clearInterval(interval);
    }

    let timer = 0;
    const step = (promptIndex: number, visibleCount: number, direction: 1 | -1) => {
      const characters = Array.from(prompts[promptIndex]);
      setDisplay(characters.slice(0, visibleCount).join(''));
      if (direction === 1 && visibleCount >= characters.length) {
        timer = window.setTimeout(() => step(promptIndex, visibleCount - 1, -1), 2600);
      } else if (direction === -1 && visibleCount <= 0) {
        timer = window.setTimeout(() => step((promptIndex + 1) % prompts.length, 1, 1), 450);
      } else {
        timer = window.setTimeout(
          () => step(promptIndex, visibleCount + direction, direction),
          direction === 1 ? 52 : 24,
        );
      }
    };
    step(0, 1, 1);
    return () => window.clearTimeout(timer);
  }, [prompts, reduceMotion]);

  return (
    <span aria-hidden="true" className="flex min-w-0 items-baseline">
      <span className="truncate">{display}</span>
      <span className="ml-px inline-block h-[1em] w-px shrink-0 translate-y-[0.14em] animate-pulse bg-gray-400 dark:bg-slate-500 motion-reduce:hidden" />
    </span>
  );
}

export default function TerasPage({
  agent,
  postId,
  onNavigate,
}: {
  agent: TerasAgent;
  postId: string | null;
  onNavigate: (path: string, opts?: { replace?: boolean; state?: Record<string, unknown> }) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerBody, setComposerBody] = useState('');
  const [composerMedia, setComposerMedia] = useState<ComposerMedia[]>([]);
  const [composerBusy, setComposerBusy] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerQuote, setComposerQuote] = useState<QuotedPostPreview | null>(null);
  const [composerLinkPreview, setComposerLinkPreview] = useState<LinkPreview | null>(null);
  const [composerLinkLoading, setComposerLinkLoading] = useState(false);
  const [composerDismissedUrl, setComposerDismissedUrl] = useState<string | null>(null);
  const linkPreviewControllerRef = useRef<AbortController | null>(null);

  const [mentionMembers, setMentionMembers] = useState<MentionMember[]>([]);
  // One popover at a time. context = 'composer' or a postId (comment bar).
  const [mentionState, setMentionState] = useState<
    { context: string; query: string; start: number; index: number } | null
  >(null);
  const memberBySlug = useMemo(
    () => new Map(mentionMembers.map(member => [member.slug.toLowerCase(), member])),
    [mentionMembers],
  );
  const memberSlugs = useMemo(() => mentionMembers.map(member => member.slug), [mentionMembers]);

  const [commentPanels, setCommentPanels] = useState<Record<string, CommentPanelState>>({});
  const [reactionBusy, setReactionBusy] = useState<Set<string>>(new Set());
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [menuOpenPostId, setMenuOpenPostId] = useState<string | null>(null);
  const [confirmDeletePostId, setConfirmDeletePostId] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [reportingPostId, setReportingPostId] = useState<string | null>(null);
  const [menuOpensUp, setMenuOpensUp] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [mediaViewer, setMediaViewer] = useState<MediaViewerState | null>(null);
  const [mediaViewerVisible, setMediaViewerVisible] = useState(false);
  const detailPostId = postId;
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailFetchTick, setDetailFetchTick] = useState(0);
  const [likePopId, setLikePopId] = useState<string | null>(null);
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const [mentionUnread, setMentionUnread] = useState(0);
  const [mentionInboxOpen, setMentionInboxOpen] = useState(false);
  const [mentionInbox, setMentionInbox] = useState<MentionInboxItem[]>([]);
  const [mentionInboxLoading, setMentionInboxLoading] = useState(false);

  const pageRootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commentFileInputRef = useRef<HTMLInputElement>(null);
  const commentMediaTargetRef = useRef<string | null>(null);
  const composerFormRef = useRef<HTMLFormElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const composerStatusRef = useRef<HTMLDivElement>(null);
  const composerTriggerRef = useRef<HTMLElement | null>(null);
  const composerControllerRef = useRef<AbortController | null>(null);
  const composerRequestIdRef = useRef<string | null>(null);
  const closeComposerRef = useRef<() => void>(() => {});
  const composerPageStateRef = useRef<{
    previousOverflow: string;
    trigger: HTMLElement | null;
    pageRoot: HTMLDivElement | null;
    previousPageAriaHidden: string | null;
    appRoot: HTMLElement | null;
    previousAppAriaHidden: string | null;
    previousAppInert: boolean;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const focusMenuOnOpenRef = useRef(false);
  const feedControllerRef = useRef<AbortController | null>(null);
  const commentControllersRef = useRef<Map<string, AbortController>>(new Map());
  const commentRequestIdsRef = useRef<Map<string, string>>(new Map());
  const reactionPendingRef = useRef<Set<string>>(new Set());
  const commentSendingRef = useRef<Set<string>>(new Set());
  const toastTimerRef = useRef<number | null>(null);
  const composerMediaRef = useRef<ComposerMedia[]>([]);
  const mediaViewerDialogRef = useRef<HTMLDivElement>(null);
  const mediaViewerTriggerRef = useRef<HTMLElement | null>(null);
  const postsRef = useRef<CommunityPost[]>([]);
  const pendingCreatedPostsRef = useRef<Map<string, CommunityPost>>(new Map());
  const feedLoadedRef = useRef(false);
  const commentPanelsRef = useRef<Record<string, CommentPanelState>>({});
  const detailOnlyIdsRef = useRef<Set<string>>(new Set());
  const previousDetailIdRef = useRef<string | null>(postId);
  const feedScrollYRef = useRef(0);
  const restoreComposerPageState = useCallback((restoreFocus = true) => {
    const state = composerPageStateRef.current;
    if (!state) return;
    composerPageStateRef.current = null;
    document.body.style.overflow = state.previousOverflow;
    if (state.previousPageAriaHidden === null) state.pageRoot?.removeAttribute('aria-hidden');
    else state.pageRoot?.setAttribute('aria-hidden', state.previousPageAriaHidden);
    if (state.previousAppAriaHidden === null) state.appRoot?.removeAttribute('aria-hidden');
    else state.appRoot?.setAttribute('aria-hidden', state.previousAppAriaHidden);
    if (state.appRoot) state.appRoot.inert = state.previousAppInert;
    if (composerTriggerRef.current === state.trigger) composerTriggerRef.current = null;
    if (restoreFocus && state.trigger?.isConnected) {
      window.requestAnimationFrame(() => state.trigger?.focus());
    }
  }, []);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  useEffect(() => {
    composerMediaRef.current = composerMedia;
  }, [composerMedia]);

  useEffect(() => {
    commentPanelsRef.current = commentPanels;
  }, [commentPanels]);

  // Pulihkan posisi scroll feed saat keluar dari tampilan detail
  // (baik via tombol breadcrumb header maupun back/forward browser).
  useEffect(() => {
    const previous = previousDetailIdRef.current;
    previousDetailIdRef.current = detailPostId;
    if (previous !== null && detailPostId === null) {
      // Panel komentar yang dibuka otomatis di detail jangan ikut terbuka di feed.
      setCommentPanels(current => current[previous]?.open
        ? { ...current, [previous]: { ...current[previous], open: false } }
        : current);
      const savedScrollY = feedScrollYRef.current;
      window.requestAnimationFrame(() => window.scrollTo(0, savedScrollY));
    }
  }, [detailPostId]);

  const showToast = useCallback((message: string, tone: ToastState['tone']) => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast({ message, tone });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, tone === 'error' ? 5000 : 2500);
  }, []);

  // Bagikan: link pendek "/teras/<code>" (lihat lib/teras-share). Di HP →
  // share sheet native (pilih WhatsApp → grup); di desktop → salin ke clipboard.
  const sharePost = useCallback(async (post: CommunityPost) => {
    const url = terasShareUrl(post.id, window.location.origin);

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ url });
        return; // sheet native = umpan balik yang cukup, tak perlu toast
      } catch (shareError) {
        // Batal oleh user (AbortError) → diam. Error lain → jatuh ke salin link.
        if ((shareError as Error)?.name === 'AbortError') return;
      }
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const helper = document.createElement('textarea');
        helper.value = url;
        helper.setAttribute('readonly', '');
        helper.style.position = 'fixed';
        helper.style.opacity = '0';
        document.body.appendChild(helper);
        helper.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(helper);
        if (!ok) throw new Error('execCommand copy failed');
      }
      showToast('Link disalin', 'success');
    } catch {
      showToast('Gagal menyalin link', 'error');
    }
  }, [showToast]);

  const openMediaViewer = useCallback((
    media: CommunityMedia[],
    index: number,
    authorName: string,
    trigger: HTMLElement,
    resume?: MediaResume,
  ) => {
    mediaViewerTriggerRef.current = trigger;
    setMediaViewer({
      media: media.slice(),
      index: Math.max(0, Math.min(media.length - 1, index)),
      authorName,
      direction: 0,
      startTime: resume?.time ?? 0,
      autoPlay: resume?.playing ?? false,
      muted: resume?.muted ?? false,
    });
    setMediaViewerVisible(true);
  }, []);

  const closeMediaViewer = useCallback(() => {
    setMediaViewerVisible(false);
  }, []);

  const navigateMediaViewer = useCallback((direction: number) => {
    setMediaViewer(current => {
      if (!current) return current;
      const nextIndex = Math.max(0, Math.min(current.media.length - 1, current.index + direction));
      if (nextIndex === current.index) return current;
      // Sliding to another item starts it fresh — resume only applies to the
      // item the viewer opened on.
      return { ...current, index: nextIndex, direction, startTime: 0, autoPlay: false };
    });
  }, []);

  const mediaViewerOpen = mediaViewer !== null;

  useLayoutEffect(() => {
    if (!mediaViewerOpen) return;
    const previousOverflow = document.body.style.overflow;
    const pageRoot = pageRootRef.current;
    const previousAriaHidden = pageRoot?.getAttribute('aria-hidden') ?? null;
    const appRoot = document.getElementById('root');
    const previousAppAriaHidden = appRoot?.getAttribute('aria-hidden') ?? null;
    const previousAppInert = appRoot?.inert ?? false;
    const trigger = mediaViewerTriggerRef.current;
    document.body.style.overflow = 'hidden';
    pageRoot?.setAttribute('aria-hidden', 'true');
    appRoot?.setAttribute('aria-hidden', 'true');
    if (appRoot) appRoot.inert = true;

    const focusFrame = window.requestAnimationFrame(() => {
      mediaViewerDialogRef.current?.querySelector<HTMLButtonElement>('[data-media-viewer-close]')?.focus();
    });

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMediaViewer();
        return;
      }
      if (event.target instanceof HTMLVideoElement) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        navigateMediaViewer(-1);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        navigateMediaViewer(1);
        return;
      }
      if (event.key !== 'Tab' || !mediaViewerDialogRef.current) return;

      const focusable = Array.from(mediaViewerDialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])',
      )).filter(element => element.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousAriaHidden === null) pageRoot?.removeAttribute('aria-hidden');
      else pageRoot?.setAttribute('aria-hidden', previousAriaHidden);
      if (previousAppAriaHidden === null) appRoot?.removeAttribute('aria-hidden');
      else appRoot?.setAttribute('aria-hidden', previousAppAriaHidden);
      if (appRoot) appRoot.inert = previousAppInert;
      window.requestAnimationFrame(() => {
        if (trigger?.isConnected) trigger.focus();
        if (mediaViewerTriggerRef.current === trigger) mediaViewerTriggerRef.current = null;
      });
    };
  }, [closeMediaViewer, mediaViewerOpen, navigateMediaViewer]);

  const fetchFeed = useCallback(async (
    before: string | null,
    append: boolean,
    signal?: AbortSignal,
  ) => {
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError(null);
    }

    try {
      const params = new URLSearchParams();
      if (before) params.set('before', before);
      const query = params.toString();
      const payload = await requestJson<CommunityPost[]>(
        `/api/community/feed${query ? `?${query}` : ''}`,
        { headers: getAuthHeaders(), signal },
        'Gagal memuat kiriman Teras',
      );
      if (!Array.isArray(payload.data)) throw new Error('Data feed tidak valid');

      const serverPosts = payload.data || [];
      const serverIds = new Set(serverPosts.map(post => post.id));
      serverIds.forEach(id => pendingCreatedPostsRef.current.delete(id));
      const pendingPosts = Array.from(pendingCreatedPostsRef.current.values())
        .filter(post => !serverIds.has(post.id))
        .sort((left, right) => {
          const timeDifference = new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
          return timeDifference || right.id.localeCompare(left.id);
        });

      setPosts(current => {
        const detailOnlyIds = detailOnlyIdsRef.current;
        if (!append) {
          const detailOnlyPosts = current.filter(post => detailOnlyIds.has(post.id) && !serverIds.has(post.id));
          serverIds.forEach(id => detailOnlyIds.delete(id));
          return [...pendingPosts, ...serverPosts, ...detailOnlyPosts];
        }
        // Kiriman yang tadinya hanya dimuat untuk halaman detail dipromosikan
        // ke posisi aslinya begitu muncul di halaman feed dari server.
        const withoutPromoted = current.filter(post => !(detailOnlyIds.has(post.id) && serverIds.has(post.id)));
        serverIds.forEach(id => detailOnlyIds.delete(id));
        const knownIds = new Set(withoutPromoted.map(post => post.id));
        return [...withoutPromoted, ...serverPosts.filter(post => !knownIds.has(post.id))];
      });
      setNextCursor(typeof payload.next_cursor === 'string' ? payload.next_cursor : null);
      if (!append) feedLoadedRef.current = true;
    } catch (fetchError) {
      if (fetchError instanceof Error && fetchError.name === 'AbortError') return;
      const message = errorMessage(fetchError, 'Gagal memuat kiriman Teras');
      if (append) showToast(message, 'error');
      else if (postsRef.current.length > 0 || pendingCreatedPostsRef.current.size > 0) showToast(message, 'error');
      else setError(message);
    } finally {
      if (!signal?.aborted) {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    }
  }, [showToast]);

  const refreshFeed = useCallback(() => {
    feedControllerRef.current?.abort();
    const controller = new AbortController();
    feedControllerRef.current = controller;
    setLoadingMore(false);
    setHasNewPosts(false);
    setPosts(current => current.filter(post => pendingCreatedPostsRef.current.has(post.id)));
    setNextCursor(null);
    setCommentPanels({});
    void fetchFeed(null, false, controller.signal);
  }, [fetchFeed]);

  useEffect(() => {
    refreshFeed();
    return () => feedControllerRef.current?.abort();
  }, [refreshFeed]);

  useEffect(() => {
    void fetch('/api/community/read', {
      method: 'POST',
      headers: getAuthHeaders(),
    }).catch(() => {});
  }, []);

  // Polling ringan ke head feed supaya agent yang standby tahu ada kiriman baru
  // tanpa reload. Error sengaja senyap: load-shed 503 / jaringan putus bukan
  // hal yang perlu diberitahukan lewat toast setiap 20 detik.
  const checkForNewPosts = useCallback(async () => {
    if (document.visibilityState !== 'visible') return;
    if (!feedLoadedRef.current) return;
    try {
      const payload = await requestJson<CommunityFeedHead | null>(
        '/api/community/feed/head',
        { headers: getAuthHeaders() },
        'Gagal memeriksa kiriman terbaru',
      );
      const head = payload.data;
      if (!head?.latest_id) return;
      const known = postsRef.current.some(post => post.id === head.latest_id)
        || pendingCreatedPostsRef.current.has(head.latest_id);
      if (!known) setHasNewPosts(true);
    } catch {
      // Senyap (lihat komentar di atas).
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => { void checkForNewPosts(); }, FEED_HEAD_POLL_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void checkForNewPosts();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [checkForNewPosts]);

  // Unread @mention badge — same light-polling contract as the feed head.
  const checkMentionUnread = useCallback(async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      const payload = await requestJson<{ unread_count: number }>(
        '/api/community/mentions/head',
        { headers: getAuthHeaders() },
        'Gagal memeriksa sebutan',
      );
      const count = payload.data?.unread_count;
      if (typeof count === 'number') setMentionUnread(count);
    } catch {
      // Senyap — sama seperti polling feed head.
    }
  }, []);

  useEffect(() => {
    void checkMentionUnread();
    const interval = window.setInterval(() => { void checkMentionUnread(); }, MENTION_HEAD_POLL_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void checkMentionUnread();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [checkMentionUnread]);

  const openMentionInbox = useCallback(async () => {
    setMentionInboxOpen(true);
    setMentionInboxLoading(true);
    try {
      const payload = await requestJson<MentionInboxItem[]>(
        '/api/community/mentions',
        { headers: getAuthHeaders() },
        'Gagal memuat sebutan',
      );
      setMentionInbox(Array.isArray(payload.data) ? payload.data : []);
    } catch {
      setMentionInbox([]);
    } finally {
      setMentionInboxLoading(false);
    }
    // Opening the inbox clears the badge; server marks all as seen.
    setMentionUnread(0);
    void fetch('/api/community/mentions/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: '{}',
    }).catch(() => {});
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    composerControllerRef.current?.abort();
    restoreComposerPageState(false);
    composerMediaRef.current.forEach(item => {
      if (item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
    });
    commentControllersRef.current.forEach(controller => controller.abort());
    commentControllersRef.current.clear();
  }, [restoreComposerPageState]);

  const openPostMenu = useCallback((postId: string, focusFirst: boolean) => {
    focusMenuOnOpenRef.current = focusFirst;
    setConfirmDeletePostId(null);
    const triggerRect = menuButtonRefs.current.get(postId)?.getBoundingClientRect();
    if (triggerRect) {
      const spaceBelow = window.innerHeight - triggerRect.bottom;
      setMenuOpensUp(spaceBelow < 128 && triggerRect.top > spaceBelow);
    } else {
      setMenuOpensUp(false);
    }
    setMenuOpenPostId(postId);
  }, []);

  const closePostMenu = useCallback((postId?: string, restoreFocus = false) => {
    setMenuOpenPostId(null);
    setConfirmDeletePostId(null);
    setMenuOpensUp(false);
    focusMenuOnOpenRef.current = false;
    if (restoreFocus && postId) {
      window.requestAnimationFrame(() => menuButtonRefs.current.get(postId)?.focus());
    }
  }, []);

  useLayoutEffect(() => {
    if (!menuOpenPostId) return;
    const updatePlacement = () => {
      const triggerRect = menuButtonRefs.current.get(menuOpenPostId)?.getBoundingClientRect();
      if (!triggerRect) return;
      const spaceBelow = window.innerHeight - triggerRect.bottom;
      setMenuOpensUp(spaceBelow < 128 && triggerRect.top > spaceBelow);
    };
    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    return () => {
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
  }, [menuOpenPostId]);

  const handlePostMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>, postId: string) => {
    if (event.key === 'Tab' || event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closePostMenu(postId, true);
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;

    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') || []);
    if (buttons.length === 0) return;
    event.preventDefault();
    const activeIndex = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
  };

  useEffect(() => {
    if (!menuOpenPostId || !focusMenuOnOpenRef.current || confirmDeletePostId) return;
    const animationFrame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
      focusMenuOnOpenRef.current = false;
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [confirmDeletePostId, menuOpenPostId]);

  useEffect(() => {
    if (!confirmDeletePostId) return;
    const animationFrame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('[data-delete-cancel]')?.focus();
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [confirmDeletePostId]);

  useEffect(() => {
    if (!menuOpenPostId) return;

    const handleOutsidePointer = (event: globalThis.PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        closePostMenu();
      }
    };
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      closePostMenu(menuOpenPostId, true);
    };

    document.addEventListener('pointerdown', handleOutsidePointer);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [closePostMenu, menuOpenPostId]);

  const resetComposer = useCallback(() => {
    composerMediaRef.current.forEach(item => {
      if (item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
    });
    composerMediaRef.current = [];
    setComposerOpen(false);
    setComposerBody('');
    setComposerMedia([]);
    setComposerError(null);
    setComposerQuote(null);
    setComposerLinkPreview(null);
    setComposerLinkLoading(false);
    setComposerDismissedUrl(null);
    linkPreviewControllerRef.current?.abort();
    composerRequestIdRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const closeComposer = useCallback(() => {
    if (composerBusy) return;
    if ((composerBody.trim() || composerMedia.length > 0) && !window.confirm('Buang draft kiriman ini?')) return;
    resetComposer();
  }, [composerBody, composerBusy, composerMedia.length, resetComposer]);
  closeComposerRef.current = closeComposer;

  useLayoutEffect(() => {
    if (!composerOpen) return;
    const trigger = composerTriggerRef.current;
    const appRoot = document.getElementById('root');
    const pageRoot = pageRootRef.current;
    composerPageStateRef.current = {
      previousOverflow: document.body.style.overflow,
      trigger,
      pageRoot,
      previousPageAriaHidden: pageRoot?.getAttribute('aria-hidden') ?? null,
      appRoot,
      previousAppAriaHidden: appRoot?.getAttribute('aria-hidden') ?? null,
      previousAppInert: appRoot?.inert ?? false,
    };

    document.body.style.overflow = 'hidden';
    pageRoot?.setAttribute('aria-hidden', 'true');
    appRoot?.setAttribute('aria-hidden', 'true');
    if (appRoot) appRoot.inert = true;
    composerFormRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();

    const handleComposerKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeComposerRef.current();
        return;
      }
      if (event.key !== 'Tab' || !composerFormRef.current) return;

      const focusable = Array.from(composerFormRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter(element => element.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleComposerKeyDown);
    return () => {
      document.removeEventListener('keydown', handleComposerKeyDown);
      // Lepas kunci halaman (inert/aria-hidden/overflow) langsung saat composer
      // ditutup — pakai cleanup effect yang dijamin React, JANGAN bergantung pada
      // AnimatePresence#onExitComplete yang bisa gagal terpanggil dan membuat
      // #root inert nyangkut → seluruh app tak bisa diklik. Sama seperti media
      // viewer di atas. onExitComplete kini hanya jaring pengaman (idempoten).
      restoreComposerPageState(true);
    };
  }, [composerOpen, restoreComposerPageState]);

  useLayoutEffect(() => {
    if (!composerOpen) return;
    const textarea = composerTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [composerBody, composerOpen]);

  useEffect(() => {
    if (!composerOpen) return;
    const focusFrame = window.requestAnimationFrame(() => {
      if (composerBusy) {
        composerStatusRef.current?.focus();
      } else if (document.activeElement === composerStatusRef.current) {
        composerFormRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
      }
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [composerBusy, composerOpen]);

  // Deteksi URL pertama di body composer & ambil pratinjaunya (debounce ~600ms).
  // composerLinkLoading sengaja TIDAK ada di deps: ia hanya berubah di dalam efek
  // ini, jadi memasukkannya akan memicu re-run tanpa alasan baru. composerLinkPreview
  // ADA di deps supaya efek bereaksi setelah fetch selesai, tapi itu tidak berputar
  // tanpa henti: begitu preview tersimpan, run berikutnya langsung match di cabang
  // dedupe (composerLinkPreview.url === url) dan berhenti tanpa setState lagi.
  useEffect(() => {
    if (!composerOpen) return;
    // Prioritas: bila ada media atau quote, jangan tampilkan preview.
    if (composerMedia.length > 0 || composerQuote) {
      setComposerLinkPreview(null);
      setComposerLinkLoading(false);
      return;
    }
    const url = firstUrlInBody(composerBody);
    if (!url || url === composerDismissedUrl) {
      setComposerLinkPreview(null);
      setComposerLinkLoading(false);
      return;
    }
    if (composerLinkPreview && composerLinkPreview.url === url) return; // sudah diambil
    let cancelled = false;
    setComposerLinkLoading(true);
    const timer = window.setTimeout(async () => {
      linkPreviewControllerRef.current?.abort();
      const controller = new AbortController();
      linkPreviewControllerRef.current = controller;
      try {
        const result = await requestJson<LinkPreview | null>(
          `/api/community/link-preview?url=${encodeURIComponent(url)}`,
          { headers: { ...getAuthHeaders() }, signal: controller.signal },
          'Gagal memuat pratinjau tautan',
        );
        if (cancelled) return;
        setComposerLinkPreview(result.data ?? null);
      } catch (previewError) {
        if (previewError instanceof Error && previewError.name === 'AbortError') return;
        if (!cancelled) setComposerLinkPreview(null);
      } finally {
        if (!cancelled) setComposerLinkLoading(false);
      }
    }, 600);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [composerBody, composerOpen, composerMedia.length, composerQuote, composerDismissedUrl, composerLinkPreview]);

  const openComposer = (openPhotoPicker = false) => {
    composerTriggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setComposerOpen(true);
    setComposerError(null);
    if (openPhotoPicker) fileInputRef.current?.click();
  };

  const openQuoteComposer = (post: CommunityPost) => {
    composerRequestIdRef.current = null;
    setComposerQuote({
      available: true,
      id: post.id,
      body: post.body,
      media: normalizePostMedia(post),
      created_at: post.created_at,
      is_system: post.is_system,
      author: post.author,
    });
    openComposer(false);
  };

  const removeComposerMedia = (mediaId: string) => {
    composerRequestIdRef.current = null;
    const removed = composerMediaRef.current.find(item => item.id === mediaId);
    if (removed?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(removed.previewUrl);
    setComposerMedia(current => {
      const next = current.filter(item => item.id !== mediaId);
      composerMediaRef.current = next;
      return next;
    });
    setComposerError(current => removed?.status === 'error' ? null : current);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleMediaSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    if (selectedFiles.length === 0) return;

    const availableSlots = Math.max(0, MAX_COMMUNITY_MEDIA - composerMediaRef.current.length);
    if (availableSlots === 0) {
      setComposerError(`Maksimal ${MAX_COMMUNITY_MEDIA} foto atau video per kiriman`);
      return;
    }

    composerRequestIdRef.current = null;
    const validationErrors: string[] = [];
    const additions: ComposerMedia[] = [];

    for (const file of selectedFiles.slice(0, availableSlots)) {
      const mime = file.type.toLowerCase();
      const isImage = mime.startsWith('image/');
      const isVideo = SUPPORTED_VIDEO_TYPES.has(mime);
      if (!isImage && !isVideo) {
        validationErrors.push(`${file.name}: format tidak didukung`);
        continue;
      }
      if (isImage && file.size > MAX_COMMUNITY_SOURCE_IMAGE_BYTES) {
        validationErrors.push(`${file.name}: foto maksimal 3MB`);
        continue;
      }
      if (isVideo && file.size > MAX_COMMUNITY_VIDEO_BYTES) {
        validationErrors.push(`${file.name}: video maksimal 20MB`);
        continue;
      }

      additions.push({
        id: window.crypto.randomUUID(),
        uploadId: window.crypto.randomUUID(),
        type: isImage ? 'image' : 'video',
        previewUrl: URL.createObjectURL(file),
        uploadBlob: file,
        status: isImage ? 'processing' : 'ready',
      });
    }

    if (selectedFiles.length > availableSlots) {
      validationErrors.push(`Hanya ${MAX_COMMUNITY_MEDIA} media pertama yang dapat dipilih`);
    }
    if (additions.length === 0) {
      setComposerError(validationErrors[0] || 'Media tidak dapat diproses');
      return;
    }

    setComposerMedia(current => {
      const next = [...current, ...additions];
      composerMediaRef.current = next;
      return next;
    });
    setComposerError(validationErrors.length > 0 ? validationErrors.join('. ') : null);

    await mapWithConcurrency(additions.filter(item => item.type === 'image'), 1, async item => {
      const sourceFile = item.uploadBlob as File;
      try {
        const source = await readFileAsDataUrl(sourceFile);
        const resized = await resizeCommunityPhoto(source);
        if (dataUrlBytes(resized) > MAX_COMMUNITY_IMAGE_BYTES) {
          throw new Error('Ukuran foto setelah diproses masih lebih dari 3MB');
        }
        const uploadBlob = dataUrlToBlob(resized);
        if (!composerMediaRef.current.some(currentItem => currentItem.id === item.id)) return;
        setComposerMedia(current => {
          const next = current.map(currentItem => currentItem.id === item.id
            ? { ...currentItem, uploadBlob, status: 'ready' as const, error: undefined }
            : currentItem);
          composerMediaRef.current = next;
          return next;
        });
      } catch (photoError) {
        const message = errorMessage(photoError, 'Foto tidak dapat diproses');
        if (!composerMediaRef.current.some(currentItem => currentItem.id === item.id)) return;
        setComposerMedia(current => {
          const next = current.map(currentItem => currentItem.id === item.id
            ? { ...currentItem, status: 'error' as const, error: message }
            : currentItem);
          composerMediaRef.current = next;
          return next;
        });
        setComposerError(message);
      }
    });
  };

  const setCommentPanelMedia = (postId: string, updater: (items: ComposerMedia[]) => ComposerMedia[]) => {
    setCommentPanels(current => {
      const panel = current[postId] || emptyCommentPanel();
      return { ...current, [postId]: { ...panel, media: updater(panel.media) } };
    });
  };

  const setCommentPanelError = (postId: string, message: string | null) => {
    setCommentPanels(current => ({
      ...current,
      [postId]: { ...(current[postId] || emptyCommentPanel()), error: message },
    }));
  };

  const openCommentMediaPicker = (postId: string) => {
    commentMediaTargetRef.current = postId;
    commentFileInputRef.current?.click();
  };

  const removeCommentMedia = (postId: string, mediaId: string) => {
    const removed = commentPanelsRef.current[postId]?.media.find(item => item.id === mediaId);
    if (removed?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(removed.previewUrl);
    setCommentPanelMedia(postId, items => items.filter(item => item.id !== mediaId));
    if (commentFileInputRef.current) commentFileInputRef.current.value = '';
  };

  const handleCommentMediaSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const postId = commentMediaTargetRef.current;
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    if (!postId || selectedFiles.length === 0) return;

    const panel = commentPanelsRef.current[postId] || emptyCommentPanel();
    const availableSlots = Math.max(0, MAX_COMMUNITY_MEDIA - panel.media.length);
    if (availableSlots === 0) {
      setCommentPanelError(postId, `Maksimal ${MAX_COMMUNITY_MEDIA} foto atau video per komentar`);
      return;
    }

    const validationErrors: string[] = [];
    const additions: ComposerMedia[] = [];
    for (const file of selectedFiles.slice(0, availableSlots)) {
      const mime = file.type.toLowerCase();
      const isImage = mime.startsWith('image/');
      const isVideo = SUPPORTED_VIDEO_TYPES.has(mime);
      if (!isImage && !isVideo) {
        validationErrors.push(`${file.name}: format tidak didukung`);
        continue;
      }
      if (isImage && file.size > MAX_COMMUNITY_SOURCE_IMAGE_BYTES) {
        validationErrors.push(`${file.name}: foto maksimal 3MB`);
        continue;
      }
      if (isVideo && file.size > MAX_COMMUNITY_VIDEO_BYTES) {
        validationErrors.push(`${file.name}: video maksimal 20MB`);
        continue;
      }
      additions.push({
        id: window.crypto.randomUUID(),
        uploadId: window.crypto.randomUUID(),
        type: isImage ? 'image' : 'video',
        previewUrl: URL.createObjectURL(file),
        uploadBlob: file,
        status: isImage ? 'processing' : 'ready',
      });
    }

    if (selectedFiles.length > availableSlots) {
      validationErrors.push(`Hanya ${MAX_COMMUNITY_MEDIA} media pertama yang dapat dipilih`);
    }
    if (additions.length === 0) {
      setCommentPanelError(postId, validationErrors[0] || 'Media tidak dapat diproses');
      return;
    }

    commentRequestIdsRef.current.delete(postId);
    setCommentPanelMedia(postId, items => [...items, ...additions]);
    setCommentPanelError(postId, validationErrors.length > 0 ? validationErrors.join('. ') : null);

    await mapWithConcurrency(additions.filter(item => item.type === 'image'), 1, async item => {
      const sourceFile = item.uploadBlob as File;
      const updateItem = (patch: Partial<ComposerMedia>) => {
        setCommentPanelMedia(postId, items => items.map(current => current.id === item.id
          ? { ...current, ...patch }
          : current));
      };
      try {
        const source = await readFileAsDataUrl(sourceFile);
        const resized = await resizeCommunityPhoto(source);
        if (dataUrlBytes(resized) > MAX_COMMUNITY_IMAGE_BYTES) {
          throw new Error('Ukuran foto setelah diproses masih lebih dari 3MB');
        }
        updateItem({ uploadBlob: dataUrlToBlob(resized), status: 'ready', error: undefined });
      } catch (photoError) {
        const message = errorMessage(photoError, 'Foto tidak dapat diproses');
        updateItem({ status: 'error', error: message });
        setCommentPanelError(postId, message);
      }
    });
  };

  const handleCreatePost = async (event: FormEvent) => {
    event.preventDefault();
    const body = composerBody.trim();
    const bodyLength = Array.from(body).length;
    if (bodyLength < 1 || bodyLength > MAX_COMMUNITY_BODY_CHARS || composerBusy) return;
    const mediaSnapshot = composerMediaRef.current;
    const unavailableMedia = mediaSnapshot.find(item => item.status !== 'ready');
    if (unavailableMedia) {
      setComposerError(unavailableMedia.error || 'Tunggu media selesai diproses');
      return;
    }

    const requestId = composerRequestIdRef.current || window.crypto.randomUUID();
    composerRequestIdRef.current = requestId;
    const controller = new AbortController();
    composerControllerRef.current?.abort();
    composerControllerRef.current = controller;
    setComposerBusy(true);
    setComposerError(null);
    try {
      const uploadedMedia = await mapWithConcurrency(mediaSnapshot, 2, async item => {
        if (item.url) return { type: item.type, url: item.url } satisfies CommunityMedia;

        setComposerMedia(current => current.map(currentItem => currentItem.id === item.id
          ? { ...currentItem, status: 'uploading' as const }
          : currentItem));
        const upload = await requestJson<never>(
          '/api/community/media',
          {
            method: 'POST',
            headers: {
              'Content-Type': item.uploadBlob.type,
              'X-Upload-ID': item.uploadId,
              ...getAuthHeaders(),
            },
            body: item.uploadBlob,
            signal: controller.signal,
          },
          `Gagal mengunggah ${item.type === 'video' ? 'video' : 'foto'}`,
          MEDIA_UPLOAD_TIMEOUT_MS,
        );
        if (typeof upload.url !== 'string' || !upload.url) throw new Error('URL media tidak tersedia');
        setComposerMedia(current => {
          const next = current.map(currentItem => currentItem.id === item.id
            ? { ...currentItem, status: 'ready' as const, url: upload.url, error: undefined }
            : currentItem);
          composerMediaRef.current = next;
          return next;
        });
        return { type: item.type, url: upload.url } satisfies CommunityMedia;
      });

      const legacyPhotoUrl = uploadedMedia.find(item => item.type === 'image')?.url;
      const postMentions = extractMentionSlugs(body, memberSlugs);

      const created = await requestJson<CommunityPost>(
        '/api/community/posts',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            body,
            client_id: requestId,
            ...(uploadedMedia.length > 0 ? { media: uploadedMedia } : {}),
            ...(legacyPhotoUrl ? { photo_url: legacyPhotoUrl } : {}),
            ...(composerQuote?.id ? { quoted_post_id: composerQuote.id } : {}),
            ...(composerLinkPreview && uploadedMedia.length === 0 && !composerQuote
              ? { link_preview: composerLinkPreview }
              : {}),
            ...(postMentions.length ? { mentions: postMentions } : {}),
          }),
          signal: controller.signal,
        },
        'Gagal membuat kiriman',
      );
      if (!created.data) throw new Error('Kiriman baru tidak tersedia');

      const createdPost = created.data;
      pendingCreatedPostsRef.current.set(createdPost.id, createdPost);
      const quotedId = composerQuote?.id;
      setPosts(current => [createdPost, ...current.filter(post => post.id !== createdPost.id)]
        .map(post => post.id === quotedId
          ? { ...post, quote_count: (post.quote_count || 0) + 1 }
          : post));
      setError(null);
      setLoading(false);
      resetComposer();
      showToast('Kiriman terbagikan di Teras', 'success');
    } catch (createError) {
      if (createError instanceof Error && createError.name === 'AbortError') return;
      const message = errorMessage(createError, 'Gagal membuat kiriman');
      setComposerMedia(current => {
        const next = current.map(item => item.status === 'uploading'
          ? { ...item, status: 'ready' as const, error: message }
          : item);
        composerMediaRef.current = next;
        return next;
      });
      setComposerError(message);
      showToast(message, 'error');
    } finally {
      if (composerControllerRef.current === controller) {
        composerControllerRef.current = null;
        setComposerBusy(false);
      }
    }
  };

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    feedControllerRef.current?.abort();
    const controller = new AbortController();
    feedControllerRef.current = controller;
    await fetchFeed(nextCursor, true, controller.signal);
  };

  const updateReaction = async (postId: string, nextReaction: 'suka' | null) => {
    if (reactionPendingRef.current.has(postId)) return;
    const snapshot = postsRef.current.find(post => post.id === postId);
    if (!snapshot) return;
    const previousReaction = snapshot.my_reaction;

    reactionPendingRef.current.add(postId);
    setReactionBusy(current => new Set(current).add(postId));
    setPosts(current => current.map(post => {
      if (post.id !== postId) return post;
      const reactions = { ...post.reactions };
      if (previousReaction) reactions[previousReaction] = Math.max(0, reactions[previousReaction] - 1);
      if (nextReaction) reactions[nextReaction] += 1;
      return { ...post, my_reaction: nextReaction, reactions };
    }));

    try {
      await requestJson<never>(
        `/api/community/posts/${encodeURIComponent(postId)}/reaction`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ reaction: nextReaction }),
        },
        'Gagal memperbarui reaksi',
      );
    } catch (reactionError) {
      setPosts(current => current.map(post => post.id === postId ? {
        ...post,
        my_reaction: snapshot.my_reaction,
        reactions: snapshot.reactions,
      } : post));
      showToast(errorMessage(reactionError, 'Gagal memperbarui reaksi'), 'error');
    } finally {
      reactionPendingRef.current.delete(postId);
      setReactionBusy(current => {
        const next = new Set(current);
        next.delete(postId);
        return next;
      });
    }
  };

  const handleLikeClick = (post: CommunityPost) => {
    const nextReaction: 'suka' | null = post.my_reaction ? null : 'suka';
    setLikePopId(current => nextReaction ? post.id : (current === post.id ? null : current));
    void updateReaction(post.id, nextReaction);
  };

  const loadComments = async (postId: string) => {
    commentControllersRef.current.get(postId)?.abort();
    const controller = new AbortController();
    commentControllersRef.current.set(postId, controller);
    setCommentPanels(current => ({
      ...current,
      [postId]: {
        ...(current[postId] || emptyCommentPanel()),
        open: true,
        loading: true,
        error: null,
      },
    }));

    try {
      const payload = await requestJson<CommunityComment[]>(
        `/api/community/posts/${encodeURIComponent(postId)}/comments`,
        { headers: getAuthHeaders(), signal: controller.signal },
        'Gagal memuat komentar',
      );
      if (!Array.isArray(payload.data)) throw new Error('Data komentar tidak valid');
      setCommentPanels(current => ({
        ...current,
        [postId]: {
          ...(current[postId] || emptyCommentPanel()),
          open: current[postId]?.open ?? true,
          loaded: true,
          loading: false,
          comments: payload.data || [],
          error: null,
        },
      }));
    } catch (commentError) {
      if (commentError instanceof Error && commentError.name === 'AbortError') return;
      setCommentPanels(current => ({
        ...current,
        [postId]: {
          ...(current[postId] || emptyCommentPanel()),
          loading: false,
          error: errorMessage(commentError, 'Gagal memuat komentar'),
        },
      }));
    } finally {
      if (commentControllersRef.current.get(postId) === controller) {
        commentControllersRef.current.delete(postId);
      }
    }
  };

  const toggleComments = (postId: string) => {
    const panel = commentPanels[postId];
    if (panel?.open) {
      setCommentPanels(current => ({
        ...current,
        [postId]: { ...current[postId], open: false },
      }));
      return;
    }

    setCommentPanels(current => ({
      ...current,
      [postId]: { ...(current[postId] || emptyCommentPanel()), open: true },
    }));
    if (!panel?.loaded && !panel?.loading) void loadComments(postId);
  };

  const ensureCommentsOpen = useCallback((postId: string) => {
    const panel = commentPanelsRef.current[postId];
    setCommentPanels(current => ({
      ...current,
      [postId]: { ...(current[postId] || emptyCommentPanel()), open: true },
    }));
    if (!panel?.loaded && !panel?.loading) void loadComments(postId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openPostDetail = (targetPostId: string) => {
    if (detailPostId === targetPostId) return;
    feedScrollYRef.current = window.scrollY;
    setDetailError(null);
    onNavigate(`/dashboard/teras/post/${encodeURIComponent(targetPostId)}`, {
      state: { terasFromFeed: true },
    });
    window.scrollTo(0, 0);
  };

  const closePostDetail = useCallback(() => {
    // Masuk dari feed → kembali via history agar entri tidak menumpuk;
    // deep-link tanpa riwayat feed cukup mengganti URL di tempat.
    if (window.history.state?.terasFromFeed) window.history.back();
    else onNavigate('/dashboard/teras', { replace: true });
  }, [onNavigate]);

  useEffect(() => {
    // Skip while detailPostId is still a share code — the deep-link loader will
    // canonicalize the URL to the full id, then this runs against the real id.
    if (!detailPostId || isTerasShortCode(detailPostId)) return;
    ensureCommentsOpen(detailPostId);
  }, [detailPostId, ensureCommentsOpen]);

  // Deep-link/reload: kiriman belum ada di feed yang termuat, ambil satuan.
  useEffect(() => {
    if (!detailPostId || loading) return;
    if (postsRef.current.some(post => post.id === detailPostId)) return;

    let cancelled = false;
    const controller = new AbortController();
    setDetailLoading(true);
    setDetailError(null);
    void (async () => {
      try {
        const payload = await requestJson<CommunityPost>(
          `/api/community/posts/${encodeURIComponent(detailPostId)}`,
          { headers: getAuthHeaders(), signal: controller.signal },
          'Gagal memuat kiriman',
        );
        if (!payload.data) throw new Error('Kiriman tidak ditemukan');
        if (cancelled) return;
        const fetchedPost = payload.data;
        detailOnlyIdsRef.current.add(fetchedPost.id);
        setPosts(current => current.some(post => post.id === fetchedPost.id)
          ? current
          : [...current, fetchedPost]);
        // Cold "/teras/<code>" link: detailPostId is an 8-char share code, but
        // everything downstream keys off the full post id. Canonicalize the URL
        // so the detail view (and comments) resolve against the real id.
        if (fetchedPost.id !== detailPostId) {
          onNavigate(`/dashboard/teras/post/${encodeURIComponent(fetchedPost.id)}`, { replace: true });
        }
      } catch (detailFetchError) {
        if (cancelled || (detailFetchError instanceof Error && detailFetchError.name === 'AbortError')) return;
        setDetailError(errorMessage(detailFetchError, 'Gagal memuat kiriman'));
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [detailPostId, loading, posts, detailFetchTick, onNavigate]);

  const updateCommentInput = (postId: string, input: string) => {
    commentRequestIdsRef.current.delete(postId);
    setCommentPanels(current => ({
      ...current,
      [postId]: { ...(current[postId] || emptyCommentPanel()), input, open: true },
    }));
  };

  const sendComment = async (postId: string) => {
    const panel = commentPanels[postId];
    const body = panel?.input.trim() || '';
    const bodyLength = Array.from(body).length;
    if (!panel || commentSendingRef.current.has(postId) || bodyLength < 1 || bodyLength > MAX_COMMUNITY_COMMENT_CHARS) return;
    const mediaSnapshot = panel.media;
    const unavailableMedia = mediaSnapshot.find(item => item.status !== 'ready');
    if (unavailableMedia) {
      setCommentPanelError(postId, unavailableMedia.error || 'Tunggu media selesai diproses');
      return;
    }

    const requestId = commentRequestIdsRef.current.get(postId) || window.crypto.randomUUID();
    commentRequestIdsRef.current.set(postId, requestId);
    commentSendingRef.current.add(postId);
    setCommentPanels(current => ({
      ...current,
      [postId]: { ...current[postId], sending: true, error: null },
    }));
    try {
      const uploadedMedia = await mapWithConcurrency(mediaSnapshot, 2, async item => {
        if (item.url) return { type: item.type, url: item.url } satisfies CommunityMedia;

        setCommentPanelMedia(postId, items => items.map(currentItem => currentItem.id === item.id
          ? { ...currentItem, status: 'uploading' as const }
          : currentItem));
        const upload = await requestJson<never>(
          '/api/community/media',
          {
            method: 'POST',
            headers: {
              'Content-Type': item.uploadBlob.type,
              'X-Upload-ID': item.uploadId,
              ...getAuthHeaders(),
            },
            body: item.uploadBlob,
          },
          `Gagal mengunggah ${item.type === 'video' ? 'video' : 'foto'}`,
          MEDIA_UPLOAD_TIMEOUT_MS,
        );
        if (typeof upload.url !== 'string' || !upload.url) throw new Error('URL media tidak tersedia');
        setCommentPanelMedia(postId, items => items.map(currentItem => currentItem.id === item.id
          ? { ...currentItem, status: 'ready' as const, url: upload.url, error: undefined }
          : currentItem));
        return { type: item.type, url: upload.url } satisfies CommunityMedia;
      });

      const commentMentions = extractMentionSlugs(body, memberSlugs);
      const created = await requestJson<CommunityComment>(
        `/api/community/posts/${encodeURIComponent(postId)}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            body,
            client_id: requestId,
            ...(uploadedMedia.length > 0 ? { media: uploadedMedia } : {}),
            ...(commentMentions.length ? { mentions: commentMentions } : {}),
          }),
        },
        'Gagal menambahkan komentar',
      );
      if (!created.data) throw new Error('Komentar baru tidak tersedia');

      mediaSnapshot.forEach(item => {
        if (item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
      });
      setCommentPanels(current => {
        const currentPanel = current[postId] || emptyCommentPanel();
        return {
          ...current,
          [postId]: {
            ...currentPanel,
            sending: false,
            loaded: true,
            input: '',
            media: [],
            comments: [...currentPanel.comments.filter(comment => comment.id !== created.data?.id), created.data as CommunityComment],
          },
        };
      });
      setPosts(current => current.map(post => post.id === postId
        ? { ...post, comment_count: post.comment_count + 1 }
        : post));
      const commentInputEl = document.getElementById(`teras-comment-input-${postId}`);
      if (commentInputEl instanceof HTMLTextAreaElement) {
        commentInputEl.style.height = '';
        commentInputEl.style.overflowY = 'hidden';
      }
      commentRequestIdsRef.current.delete(postId);
    } catch (commentError) {
      const message = errorMessage(commentError, 'Gagal menambahkan komentar');
      setCommentPanels(current => ({
        ...current,
        [postId]: {
          ...current[postId],
          sending: false,
          error: message,
          media: (current[postId]?.media || []).map(item => item.status === 'uploading'
            ? { ...item, status: 'ready' as const, error: message }
            : item),
        },
      }));
      showToast(message, 'error');
    } finally {
      commentSendingRef.current.delete(postId);
    }
  };

  const handleCommentKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>, postId: string) => {
    if (handleMentionKeyDown(event, postId)) return; // mention popover owns the key
    // Shift+Enter = baris baru; Enter saja = kirim.
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void sendComment(postId);
  };

  const autoGrowCommentInput = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
    element.style.overflowY = element.scrollHeight > 120 ? 'auto' : 'hidden';
  };

  // --- @mention autocomplete ---------------------------------------------
  const mentionCandidates = useMemo(
    () => mentionMembers.filter(m => m.slug.toLowerCase() !== agent.slug.toLowerCase()),
    [mentionMembers, agent.slug],
  );

  const mentionParticipantSlugs = useCallback((context: string): string[] => {
    if (context === 'composer') return [];
    const slugs: string[] = [];
    const post = postsRef.current.find(item => item.id === context);
    if (post?.author?.slug) slugs.push(post.author.slug);
    commentPanelsRef.current[context]?.comments.forEach(comment => {
      if (comment.author?.slug) slugs.push(comment.author.slug);
    });
    return slugs;
  }, []);

  const mentionItems = useMemo(() => {
    if (!mentionState) return [];
    return rankMentionCandidates(
      mentionCandidates,
      mentionState.query,
      mentionParticipantSlugs(mentionState.context),
    ).slice(0, 8);
  }, [mentionState, mentionCandidates, mentionParticipantSlugs]);

  const getMentionTextarea = (context: string): HTMLTextAreaElement | null =>
    context === 'composer'
      ? composerTextareaRef.current
      : (document.getElementById(`teras-comment-input-${context}`) as HTMLTextAreaElement | null);

  const detectMention = useCallback((context: string, element: HTMLTextAreaElement) => {
    const found = detectMentionQuery(element.value, element.selectionStart ?? element.value.length);
    if (found && mentionMembers.length > 0) {
      setMentionState({ context, query: found.query, start: found.start, index: 0 });
    } else {
      setMentionState(prev => (prev && prev.context === context ? null : prev));
    }
  }, [mentionMembers.length]);

  const applyMention = useCallback((member: MentionMember) => {
    setMentionState(state => {
      if (!state) return null;
      const element = getMentionTextarea(state.context);
      const currentValue = element ? element.value : '';
      const caret = element?.selectionStart ?? currentValue.length;
      const { text, caret: nextCaret } = applyMentionSelection(currentValue, state.start, caret, member.slug);
      if (state.context === 'composer') {
        composerRequestIdRef.current = null;
        setComposerBody(text);
      } else {
        updateCommentInput(state.context, text);
      }
      requestAnimationFrame(() => {
        const node = getMentionTextarea(state.context);
        if (!node) return;
        node.focus();
        node.setSelectionRange(nextCaret, nextCaret);
        if (state.context === 'composer') {
          node.style.height = 'auto';
          node.style.height = `${node.scrollHeight}px`;
        } else {
          autoGrowCommentInput(node);
        }
      });
      return null;
    });
  }, [updateCommentInput]);

  const handleMentionKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
    context: string,
  ): boolean => {
    if (!mentionState || mentionState.context !== context || mentionItems.length === 0) return false;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setMentionState(s => (s ? { ...s, index: (s.index + 1) % mentionItems.length } : s));
      return true;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setMentionState(s => (s ? { ...s, index: (s.index - 1 + mentionItems.length) % mentionItems.length } : s));
      return true;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      applyMention(mentionItems[mentionState.index] || mentionItems[0]);
      return true;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setMentionState(null);
      return true;
    }
    return false;
  };

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const payload = await requestJson<MentionMember[]>(
          '/api/community/members',
          { headers: getAuthHeaders(), signal: controller.signal },
          'Gagal memuat anggota',
        );
        if (Array.isArray(payload.data)) setMentionMembers(payload.data);
      } catch {
        /* silent — mentions simply render as plain text without the roster */
      }
    })();
    return () => controller.abort();
  }, []);

  const deleteComment = async (postId: string, commentId: string) => {
    if (deletingCommentId || !window.confirm('Hapus komentar ini?')) return;
    setDeletingCommentId(commentId);
    try {
      await requestJson<never>(
        `/api/community/comments/${encodeURIComponent(commentId)}`,
        { method: 'DELETE', headers: getAuthHeaders() },
        'Gagal menghapus komentar',
      );
      setCommentPanels(current => ({
        ...current,
        ...(current[postId] ? {
          [postId]: {
            ...current[postId],
            comments: current[postId].comments.filter(comment => comment.id !== commentId),
          },
        } : {}),
      }));
      setPosts(current => current.map(post => post.id === postId
        ? { ...post, comment_count: Math.max(0, post.comment_count - 1) }
        : post));
    } catch (deleteError) {
      showToast(errorMessage(deleteError, 'Gagal menghapus komentar'), 'error');
    } finally {
      setDeletingCommentId(null);
    }
  };

  const deletePost = async (postId: string) => {
    if (deletingPostId) return;
    setDeletingPostId(postId);
    try {
      await requestJson<never>(
        `/api/community/posts/${encodeURIComponent(postId)}`,
        { method: 'DELETE', headers: getAuthHeaders() },
        'Gagal menghapus kiriman',
      );
      setPosts(current => current.filter(post => post.id !== postId));
      pendingCreatedPostsRef.current.delete(postId);
      setCommentPanels(current => {
        const next = { ...current };
        delete next[postId];
        return next;
      });
      setMenuOpenPostId(null);
      setConfirmDeletePostId(null);
      if (detailPostId === postId) closePostDetail();
      showToast('Kiriman dihapus dari Teras', 'success');
    } catch (deleteError) {
      showToast(errorMessage(deleteError, 'Gagal menghapus kiriman'), 'error');
    } finally {
      setDeletingPostId(null);
    }
  };

  const reportPost = async (postId: string) => {
    if (reportingPostId) return;
    setReportingPostId(postId);
    try {
      await requestJson<never>(
        `/api/community/posts/${encodeURIComponent(postId)}/report`,
        { method: 'POST', headers: getAuthHeaders() },
        'Gagal mengirim laporan',
      );
      closePostMenu(postId, true);
      showToast('Laporan terkirim ke admin', 'success');
    } catch (reportError) {
      showToast(errorMessage(reportError, 'Gagal mengirim laporan'), 'error');
    } finally {
      setReportingPostId(null);
    }
  };

  const composerBodyLength = Array.from(composerBody.trim()).length;
  const composerCanSubmit = composerBodyLength >= 1
    && composerBodyLength <= MAX_COMMUNITY_BODY_CHARS
    && !composerBusy
    && composerMedia.every(item => item.status === 'ready');

  const composerSheet = typeof document === 'undefined' ? null : createPortal(
    <AnimatePresence onExitComplete={() => restoreComposerPageState(true)}>
      {composerOpen && (
        <motion.form
          ref={composerFormRef}
          key="teras-composer"
          onSubmit={handleCreatePost}
          role="dialog"
          aria-modal="true"
          aria-busy={composerBusy}
          aria-labelledby="teras-composer-title"
          tabIndex={-1}
          className="fixed inset-0 z-50 flex h-[100dvh] min-h-[100dvh] flex-col bg-white dark:bg-gradient-to-b dark:from-slate-900 dark:to-slate-950"
          initial={{ opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 28 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            ref={composerStatusRef}
            role="status"
            aria-live="polite"
            tabIndex={composerBusy ? 0 : -1}
            className="sr-only"
          >
            {composerBusy ? 'Sedang mengirim kiriman. Mohon tunggu.' : ''}
          </div>
          <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 backdrop-blur-md dark:border-slate-700/50 dark:bg-slate-900/95">
            <div className="mx-auto grid w-full max-w-2xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <button
                type="button"
                onClick={closeComposer}
                disabled={composerBusy}
                className="min-h-11 min-w-11 justify-self-start px-1 text-[13px] font-semibold text-gray-600 transition-colors disabled:opacity-45 dark:text-slate-300"
              >
                Batal
              </button>
              <h2 id="teras-composer-title" className="text-center text-sm font-bold text-gray-900 dark:text-white">{composerQuote ? 'Quote Kiriman' : 'Buat Kiriman'}</h2>
              <button
                type="submit"
                disabled={!composerCanSubmit}
                aria-label="Kirim kiriman"
                className="flex min-h-9 min-w-[72px] items-center justify-center gap-1.5 justify-self-end rounded-full bg-emerald-500 px-4 py-1.5 text-[12px] font-extrabold text-white shadow-md shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-45 dark:bg-emerald-500 dark:shadow-emerald-950/40"
              >
                {composerBusy ? <Loader2 size={15} className="animate-spin" /> : (
                  <>
                    <Send size={14} strokeWidth={2.2} />
                    Post
                  </>
                )}
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-x-hidden overflow-y-auto">
            <div className="mx-auto w-full max-w-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
              <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-3">
                <div className="flex flex-col items-center">
                  <AgentAvatar name={agent.name} photo={agent.photo} />
                  <div aria-hidden="true" className="mt-2 min-h-12 w-px flex-1 bg-gray-200 dark:bg-slate-700" />
                </div>

                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-[13px] font-bold text-gray-900 dark:text-white">{agent.name}</p>
                    {composerMedia.length > 0 && (
                      <span className="shrink-0 text-[10px] font-semibold tabular-nums text-gray-500 dark:text-slate-400">
                        {composerMedia.length}/{MAX_COMMUNITY_MEDIA}
                      </span>
                    )}
                  </div>

                  <div className="relative mt-1.5">
                    <MentionHighlightLayer
                      text={composerBody}
                      memberBySlug={memberBySlug}
                      className="p-0 text-[17px] leading-relaxed"
                    />
                    <textarea
                      ref={composerTextareaRef}
                      autoFocus
                      aria-label="Isi kiriman"
                      value={composerBody}
                      onChange={event => {
                        composerRequestIdRef.current = null;
                        setComposerBody(event.target.value);
                        detectMention('composer', event.target);
                      }}
                      onKeyDown={event => { handleMentionKeyDown(event, 'composer'); }}
                      disabled={composerBusy}
                      maxLength={COMPOSER_BODY_HARD_CAP}
                      placeholder={COMPOSER_PLACEHOLDER}
                      className="relative min-h-[88px] w-full resize-none overflow-hidden bg-transparent p-0 text-[17px] leading-relaxed text-gray-900 outline-none placeholder:text-gray-500 disabled:opacity-60 dark:text-white dark:placeholder:text-slate-400"
                    />
                    {mentionState?.context === 'composer' && (
                      <MentionAutocomplete
                        items={mentionItems}
                        activeIndex={mentionState.index}
                        onSelect={applyMention}
                        onHoverIndex={index => setMentionState(s => (s ? { ...s, index } : s))}
                        placement="bottom"
                      />
                    )}
                  </div>

                  {composerBodyLength > MAX_COMMUNITY_BODY_CHARS && (
                    <p className="mb-2 text-[10px] font-medium text-red-500 dark:text-red-400">Isi kiriman maksimal {MAX_COMMUNITY_BODY_CHARS} karakter</p>
                  )}

                  <div className="flex min-h-11 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={composerBusy || composerMedia.length >= MAX_COMMUNITY_MEDIA}
                      title="Tambah foto atau video (JPG/PNG/WEBP, MP4/MOV/WEBM)"
                      className="-ml-2 flex min-h-9 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 active:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:opacity-35 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 dark:active:bg-slate-800"
                    >
                      <ImageIcon size={18} strokeWidth={1.8} />
                      Foto/Video
                    </button>
                    <span className="flex-1" />
                    <span
                      aria-live="polite"
                      className={`text-[10px] font-semibold tabular-nums ${
                        composerBodyLength > MAX_COMMUNITY_BODY_CHARS
                          ? 'text-red-500 dark:text-red-400'
                          : 'text-gray-500 dark:text-slate-400'
                      }`}
                    >
                      {composerBodyLength}/{MAX_COMMUNITY_BODY_CHARS}
                    </span>
                  </div>

                  <p className="mb-2 text-[10px] leading-relaxed text-gray-400 dark:text-slate-500">
                    Maks. {MAX_COMMUNITY_MEDIA} media · Foto 3MB · Video 20MB
                  </p>

                  {composerMedia.length > 0 && (
                    <div
                      role="group"
                      data-composer-media-layout={composerMedia.length === 1 ? 'single' : 'strip'}
                      className={composerMedia.length === 1
                        ? 'mb-2'
                        : 'mb-2 flex snap-x gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'}
                      aria-label={`${composerMedia.length} media kiriman dipilih`}
                    >
                      {composerMedia.map((item, index) => (
                        <div
                          key={item.id}
                          className={`relative overflow-hidden rounded-xl border border-gray-100 bg-gray-100 dark:border-slate-700 dark:bg-slate-950 ${
                            composerMedia.length === 1
                              ? (item.type === 'video' ? 'w-fit max-w-full' : 'max-h-[22rem] w-full')
                              : 'h-64 w-auto shrink-0 snap-start'
                          }`}
                        >
                          {item.type === 'video' ? (
                            <PlyrVideo
                              src={item.previewUrl}
                              ariaLabel={`Pratinjau video ${index + 1}`}
                              mode={composerMedia.length === 1 ? 'fit' : 'strip'}
                            />
                          ) : (
                            <img
                              src={item.previewUrl}
                              alt={composerMedia.length === 1 ? 'Pratinjau foto kiriman' : `Pratinjau foto ${index + 1}`}
                              className={composerMedia.length === 1
                                ? 'block max-h-[22rem] w-full object-contain'
                                : 'block h-full w-auto max-w-[80vw] object-contain'}
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => removeComposerMedia(item.id)}
                            disabled={composerBusy}
                            aria-label={`Hapus ${item.type === 'video' ? 'video' : 'foto'} ${index + 1}`}
                            title="Hapus media"
                            className="absolute right-1 top-1 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white shadow-sm backdrop-blur-sm transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
                          >
                            <X size={15} />
                          </button>
                          {(item.status === 'processing' || item.status === 'uploading') && (
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                              <div className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-2 text-[11px] font-semibold backdrop-blur-sm">
                                <Loader2 size={14} className="animate-spin" />
                                {item.status === 'uploading' ? 'Mengunggah media' : 'Memproses foto'}
                              </div>
                            </div>
                          )}
                          {item.status === 'error' && (
                            <div className="pointer-events-none absolute inset-x-2 bottom-2 min-w-0 rounded-xl bg-red-600/90 px-3 py-2 text-[10px] font-semibold text-white shadow-sm [overflow-wrap:anywhere]">
                              {item.error || 'Media tidak dapat diproses'}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {composerQuote && <QuotedPostCard quoted={composerQuote} />}

                  {composerLinkLoading && !composerLinkPreview && (
                    <div className="mt-2 h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-slate-800" />
                  )}
                  {composerLinkPreview && composerMedia.length === 0 && !composerQuote && (
                    <div className="relative">
                      <LinkPreviewCard preview={composerLinkPreview} />
                      <button
                        type="button"
                        aria-label="Buang pratinjau tautan"
                        onClick={() => {
                          setComposerDismissedUrl(composerLinkPreview.url);
                          setComposerLinkPreview(null);
                        }}
                        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  {composerError && (
                    <div role="alert" aria-live="assertive" className="mb-3 min-w-0 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-600 [overflow-wrap:anywhere] dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
                      {composerError}
                    </div>
                  )}

                </div>
              </div>
            </div>
          </div>

        </motion.form>
      )}
    </AnimatePresence>,
    document.body,
  );

  const mediaViewerSheet = typeof document === 'undefined' ? null : createPortal(
    <AnimatePresence
      onExitComplete={() => {
        if (!mediaViewerVisible) setMediaViewer(null);
      }}
    >
      {mediaViewer && mediaViewerVisible && (
        <motion.div
          ref={mediaViewerDialogRef}
          key="teras-media-viewer"
          role="dialog"
          aria-modal="true"
          aria-label={`Media kiriman ${mediaViewer.authorName}`}
          tabIndex={-1}
          className="fixed inset-0 z-[90] flex h-[100dvh] w-screen flex-col overflow-hidden bg-black/95 text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.22 }}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
            <span aria-live="polite" className="rounded-full bg-black/45 px-3 py-1.5 text-xs font-bold tabular-nums backdrop-blur-sm">
              {mediaViewer.index + 1}/{mediaViewer.media.length}
            </span>
            <button
              type="button"
              data-media-viewer-close
              onClick={closeMediaViewer}
              aria-label="Tutup media"
              title="Tutup"
              className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-black/60 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <X size={21} />
            </button>
          </div>

          <div
            className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-3 pb-16 pt-16"
            onClick={event => {
              if (event.target === event.currentTarget) closeMediaViewer();
            }}
          >
            <AnimatePresence mode="popLayout" custom={mediaViewer.direction} initial={false}>
              <motion.div
                key={`${mediaViewer.index}-${mediaViewer.media[mediaViewer.index]?.url}`}
                className="flex h-full w-full items-center justify-center"
                onClick={event => {
                  const target = event.target;
                  if (target instanceof Element && target.closest('img, video')) return;
                  closeMediaViewer();
                }}
                custom={mediaViewer.direction}
                variants={MEDIA_VIEWER_SLIDE_VARIANTS}
                initial={reduceMotion ? false : 'enter'}
                animate="center"
                exit="exit"
                transition={reduceMotion ? { duration: 0 } : {
                  x: { type: 'spring', stiffness: 320, damping: 33 },
                  opacity: { duration: 0.16 },
                  scale: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
                }}
              >
                {mediaViewer.media[mediaViewer.index]?.type === 'video' ? (
                  <PlyrVideo
                    src={mediaViewer.media[mediaViewer.index].url}
                    ariaLabel={`Video ${mediaViewer.index + 1} layar penuh dari kiriman ${mediaViewer.authorName}`}
                    mode="viewer"
                    className="overflow-hidden rounded-xl shadow-2xl"
                    startTime={mediaViewer.startTime}
                    autoPlay={mediaViewer.autoPlay}
                    startMuted={mediaViewer.muted}
                  />
                ) : (
                  <motion.img
                    src={mediaViewer.media[mediaViewer.index]?.url}
                    alt={`Foto ${mediaViewer.index + 1} layar penuh dari kiriman ${mediaViewer.authorName}`}
                    draggable={false}
                    drag={mediaViewer.media.length > 1 ? 'x' : false}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.16}
                    onDragEnd={(_event, info) => {
                      if (Math.abs(info.offset.x) < 60) return;
                      navigateMediaViewer(info.offset.x < 0 ? 1 : -1);
                    }}
                    className="max-h-full max-w-full select-none rounded-xl object-contain shadow-2xl [touch-action:pan-y_pinch-zoom]"
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {mediaViewer.media.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => navigateMediaViewer(-1)}
                disabled={mediaViewer.index === 0}
                aria-label="Media layar penuh sebelumnya"
                className="absolute left-2 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-black/60 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:pointer-events-none disabled:opacity-0"
              >
                <ChevronLeft size={22} />
              </button>
              <button
                type="button"
                onClick={() => navigateMediaViewer(1)}
                disabled={mediaViewer.index === mediaViewer.media.length - 1}
                aria-label="Media layar penuh berikutnya"
                className="absolute right-2 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-black/60 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:pointer-events-none disabled:opacity-0"
              >
                <ChevronRight size={22} />
              </button>
            </>
          )}

          <p className="pointer-events-none absolute inset-x-16 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 truncate text-center text-xs font-medium text-white/75">
            Kiriman {mediaViewer.authorName}
          </p>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );

  const isDetailView = detailPostId !== null;
  const detailPost = detailPostId ? posts.find(post => post.id === detailPostId) || null : null;
  const feedPosts = posts.filter(post => !detailOnlyIdsRef.current.has(post.id));
  const visiblePosts = isDetailView ? (detailPost ? [detailPost] : []) : feedPosts;

  const handlePostAreaClick = (event: MouseEvent<HTMLElement>, postId: string) => {
    const target = event.target;
    if (target instanceof Element && target.closest('button, a, video, input, textarea, [role="menu"], [data-media-layout]')) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    openPostDetail(postId);
  };

  const focusCommentInput = (postId: string) => {
    document.getElementById(`teras-comment-input-${postId}`)?.focus();
  };

  const handleShowNewPosts = () => {
    setHasNewPosts(false);
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    refreshFeed();
  };

  return (
    <>
      <div ref={pageRootRef} data-teras-root className="w-full overflow-x-hidden bg-white pb-8 dark:bg-slate-900">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/mp4,video/quicktime,video/webm"
        multiple
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleMediaSelection}
      />
      <input
        ref={commentFileInputRef}
        type="file"
        accept="image/*,video/mp4,video/quicktime,video/webm"
        multiple
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleCommentMediaSelection}
      />

      {!isDetailView && (
      <section className="border-b border-gray-100 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <AgentAvatar name={agent.name} photo={agent.photo} />
          <div className="flex min-h-11 min-w-0 flex-1 items-center rounded-full border border-gray-200 bg-white pr-1 transition-colors dark:border-slate-700 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => openComposer(false)}
              className="min-h-11 min-w-0 flex-1 rounded-l-full px-3.5 py-2.5 text-left text-[13px] text-gray-500 transition-colors active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:text-slate-400 dark:active:bg-slate-950"
            >
              <span className="sr-only">Buat kiriman baru</span>
              <TypingPrompt prompts={COMPOSER_PROMPTS} />
            </button>
            <button
              type="button"
              onClick={() => openComposer(true)}
              aria-label="Tambahkan foto atau video"
              title="Tambahkan foto atau video"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 transition-all hover:text-emerald-600 active:scale-95 active:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:text-slate-400 dark:hover:text-emerald-400 dark:active:text-emerald-400"
            >
              <ImageIcon size={18} strokeWidth={1.8} />
            </button>
          </div>
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => { if (mentionInboxOpen) setMentionInboxOpen(false); else void openMentionInbox(); }}
              aria-label="Sebutan untukmu"
              aria-expanded={mentionInboxOpen}
              title="Sebutan untukmu"
              className="relative flex h-11 w-11 items-center justify-center rounded-full text-gray-500 transition-colors hover:text-emerald-600 active:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:text-slate-400 dark:hover:text-emerald-400"
            >
              <AtSign size={20} strokeWidth={1.9} />
              {mentionUnread > 0 && (
                <span className="absolute right-0.5 top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold leading-none text-white">
                  {mentionUnread > 9 ? '9+' : mentionUnread}
                </span>
              )}
            </button>
            {mentionInboxOpen && (
              <>
                <button
                  type="button"
                  aria-hidden="true"
                  tabIndex={-1}
                  onClick={() => setMentionInboxOpen(false)}
                  className="fixed inset-0 z-40 cursor-default"
                />
                <div
                  role="dialog"
                  aria-label="Sebutan untukmu"
                  className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5 dark:border-slate-800">
                    <p className="text-[13px] font-bold text-gray-900 dark:text-white">Sebutan untukmu</p>
                    <button
                      type="button"
                      onClick={() => setMentionInboxOpen(false)}
                      aria-label="Tutup"
                      className="text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-slate-200"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto overscroll-contain">
                    {mentionInboxLoading ? (
                      <p className="px-4 py-6 text-center text-[12px] text-gray-400 dark:text-slate-500">Memuat…</p>
                    ) : mentionInbox.length === 0 ? (
                      <p className="px-4 py-6 text-center text-[12px] text-gray-400 dark:text-slate-500">Belum ada yang menyebutmu.</p>
                    ) : (
                      mentionInbox.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => { setMentionInboxOpen(false); openPostDetail(item.post_id); }}
                          className={`flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/60 ${item.seen_at ? '' : 'bg-emerald-50/60 dark:bg-emerald-900/15'}`}
                        >
                          <AgentAvatar name={item.author.name || 'Agent'} photo={item.author.photo} size="comment" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[12.5px] leading-snug text-gray-700 dark:text-slate-200">
                              <span className="font-bold text-gray-900 dark:text-white">{item.author.name || 'Seseorang'}</span>
                              {item.comment_id ? ' membalas menyebutmu' : ' menyebutmu'}
                            </span>
                            <span className="mt-0.5 block truncate text-[11.5px] text-gray-500 dark:text-slate-400">{item.snippet}</span>
                            <span className="mt-0.5 block text-[10.5px] text-gray-400 dark:text-slate-500">{timeAgo(item.created_at)}</span>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
      )}

      <AnimatePresence>
        {!isDetailView && hasNewPosts && (
          <div className="pointer-events-none fixed inset-x-0 top-[max(4.75rem,calc(env(safe-area-inset-top)+4.25rem))] z-40 flex justify-center">
            <motion.button
              type="button"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
              transition={{ duration: 0.18 }}
              onClick={handleShowNewPosts}
              className="pointer-events-auto flex min-h-9 items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-[12px] font-bold text-white shadow-lg shadow-emerald-600/30 transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:bg-emerald-500 dark:shadow-emerald-950/40"
            >
              <ArrowUp size={14} strokeWidth={2.5} />
              Ada kiriman baru
            </motion.button>
          </div>
        )}
      </AnimatePresence>

      {isDetailView && !detailPost && (
        detailError ? (
          <div role="alert" aria-live="assertive" className="mx-4 mt-4 min-w-0 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-600 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
            <div className="flex min-w-0 items-start gap-2">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <p className="min-w-0 flex-1 [overflow-wrap:anywhere]">{detailError}</p>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setDetailFetchTick(tick => tick + 1)}
                className="min-h-11 rounded-xl bg-red-500 px-4 text-xs font-bold text-white shadow-md shadow-red-500/20 transition-all active:scale-95 dark:bg-red-500 dark:shadow-red-950/40"
              >
                Coba Lagi
              </button>
              <button
                type="button"
                onClick={closePostDetail}
                className="min-h-11 rounded-xl bg-gray-100 px-4 text-xs font-bold text-gray-600 transition-all active:scale-95 dark:bg-slate-800 dark:text-slate-300"
              >
                Kembali ke Teras
              </button>
            </div>
          </div>
        ) : (
          <div aria-label="Memuat kiriman" aria-busy="true">
            <PostSkeleton withMedia />
          </div>
        )
      )}

      {!isDetailView && (loading ? (
        <div aria-label="Memuat kiriman" aria-busy="true">
          <PostSkeleton withMedia />
          <PostSkeleton />
          <PostSkeleton />
        </div>
      ) : error ? (
        <div role="alert" aria-live="assertive" className="mx-4 mt-4 min-w-0 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-600 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
          <div className="flex min-w-0 items-start gap-2">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <p className="min-w-0 flex-1 [overflow-wrap:anywhere]">{error}</p>
          </div>
          <button
            type="button"
            onClick={refreshFeed}
            className="mt-3 min-h-11 rounded-xl bg-red-500 px-4 text-xs font-bold text-white shadow-md shadow-red-500/20 transition-all active:scale-95 dark:bg-red-500 dark:shadow-red-950/40"
          >
            Coba Lagi
          </button>
        </div>
      ) : feedPosts.length === 0 ? (
        <div className="border-b border-gray-100 bg-white px-5 py-12 text-center dark:border-slate-800 dark:bg-slate-900">
          <Users size={36} className="mx-auto mb-3 text-gray-300 dark:text-slate-600" />
          <p className="text-sm font-semibold text-gray-600 dark:text-slate-300">Belum ada kiriman di Teras.</p>
          <p className="mt-1 text-[12px] text-gray-500 dark:text-slate-400">Jadilah yang pertama berbagi.</p>
        </div>
      ) : null)}

      {(isDetailView ? detailPost !== null : !loading && !error && feedPosts.length > 0) && (
        <div>
          {visiblePosts.map(post => {
            const commentPanel = commentPanels[post.id];
            const commentsOpen = isDetailView ? true : !!commentPanel?.open;
            const commentInputLength = Array.from(commentPanel?.input.trim() || '').length;
            const canDeletePost = post.is_own || agent.role === 'admin';
            const totalReactions = post.reactions.suka + post.reactions.selamat + post.reactions.aamiin;
            const reactionIsBusy = reactionBusy.has(post.id);
            const likePopped = likePopId === post.id && !!post.my_reaction && !reduceMotion;
            const postMedia = normalizePostMedia(post);
            const authorName = post.author.name || (post.is_system ? 'Miqot' : 'Agent');

            return (
              <article
                key={post.id}
                data-post-id={post.id}
                role={isDetailView ? undefined : 'link'}
                tabIndex={isDetailView ? undefined : 0}
                aria-label={isDetailView ? undefined : `Buka kiriman ${authorName}`}
                onClick={isDetailView ? undefined : event => handlePostAreaClick(event, post.id)}
                onKeyDown={isDetailView ? undefined : event => {
                  if (event.key !== 'Enter' || event.target !== event.currentTarget) return;
                  event.preventDefault();
                  openPostDetail(post.id);
                }}
                className={`relative border-b bg-white px-4 pb-2.5 pt-3.5 dark:bg-slate-900 ${
                  post.is_system
                    ? 'border-emerald-500/25 dark:border-emerald-500/25'
                    : 'border-gray-100 dark:border-slate-800'
                } ${isDetailView ? '' : 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/50'}`}
              >
                {post.is_system && (
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-emerald-500/[0.07] to-transparent" />
                )}

                {!post.is_system && (
                  <div
                    ref={menuOpenPostId === post.id ? menuRef : undefined}
                    className="absolute right-2 top-0 z-20 shrink-0"
                  >
                    <button
                      ref={element => {
                        if (element) menuButtonRefs.current.set(post.id, element);
                        else menuButtonRefs.current.delete(post.id);
                      }}
                      type="button"
                      onClick={() => {
                        if (menuOpenPostId === post.id) closePostMenu();
                        else openPostMenu(post.id, false);
                      }}
                      onKeyDown={event => {
                        if (!['Enter', ' ', 'ArrowDown'].includes(event.key)) return;
                        event.preventDefault();
                        if (menuOpenPostId === post.id) closePostMenu(post.id, true);
                        else openPostMenu(post.id, true);
                      }}
                      aria-label="Buka menu kiriman"
                      title="Menu kiriman"
                      aria-haspopup="menu"
                      aria-expanded={menuOpenPostId === post.id}
                      aria-controls={`teras-post-menu-${post.id}`}
                      className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 active:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-700 dark:active:bg-slate-700"
                    >
                      <MoreHorizontal size={17} />
                    </button>

                    <AnimatePresence initial={false}>
                      {menuOpenPostId === post.id && (
                        <motion.div
                          key="post-menu"
                          id={`teras-post-menu-${post.id}`}
                          role="menu"
                          aria-label="Menu kiriman"
                          onKeyDown={event => handlePostMenuKeyDown(event, post.id)}
                          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: menuOpensUp ? 8 : -8 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: menuOpensUp ? 5 : -5 }}
                          transition={reduceMotion ? { duration: 0 } : {
                            type: 'spring', stiffness: 560, damping: 32,
                            opacity: { duration: 0.14 },
                          }}
                          className={`absolute right-0 z-20 w-44 overflow-hidden rounded-2xl bg-white shadow-[0_12px_40px_rgba(0,0,0,0.16)] ring-1 ring-black/5 dark:bg-slate-800 dark:shadow-[0_12px_40px_rgba(0,0,0,0.5)] dark:ring-white/10 ${
                            menuOpensUp ? 'bottom-12 origin-bottom-right' : 'top-12 origin-top-right'
                          }`}
                        >
                          {confirmDeletePostId === post.id ? (
                            <div>
                              <div className="px-4 pb-3 pt-4 text-center">
                                <p className="text-[13.5px] font-bold text-gray-900 dark:text-white">Hapus post?</p>
                                <p className="mt-1 text-[11.5px] leading-snug text-gray-500 dark:text-slate-400">Akan dihapus dari Teras</p>
                              </div>
                              <div className="divide-y divide-gray-100 border-t border-gray-100 dark:divide-slate-700 dark:border-slate-700">
                                <button
                                  type="button"
                                  disabled={deletingPostId === post.id}
                                  onClick={() => void deletePost(post.id)}
                                  aria-label="Konfirmasi hapus kiriman"
                                  className="flex min-h-12 w-full items-center justify-center px-4 text-[13.5px] font-bold text-red-600 transition-colors hover:bg-red-50 active:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20 dark:active:bg-red-900/20"
                                >
                                  {deletingPostId === post.id ? <Loader2 size={15} className="animate-spin" /> : 'Hapus'}
                                </button>
                                <button
                                  type="button"
                                  disabled={deletingPostId === post.id}
                                  data-delete-cancel
                                  onClick={() => closePostMenu(post.id, true)}
                                  className="flex min-h-12 w-full items-center justify-center px-4 text-[13.5px] font-semibold text-gray-700 transition-colors hover:bg-gray-100 active:bg-gray-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:active:bg-slate-700/60"
                                >
                                  Batal
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="divide-y divide-gray-100 dark:divide-slate-700">
                              {!post.is_own && (
                                <button
                                  type="button"
                                  role="menuitem"
                                  disabled={reportingPostId === post.id}
                                  onClick={() => void reportPost(post.id)}
                                  className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-[13.5px] font-semibold text-gray-800 transition-colors hover:bg-gray-100 active:bg-gray-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-700/60 dark:active:bg-slate-700/60"
                                >
                                  Laporkan
                                  {reportingPostId === post.id ? <Loader2 size={16} className="animate-spin" /> : <Flag size={16} />}
                                </button>
                              )}
                              {canDeletePost && (
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => setConfirmDeletePostId(post.id)}
                                  className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-[13.5px] font-semibold text-red-600 transition-colors hover:bg-red-50 active:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 dark:active:bg-red-900/20"
                                >
                                  Hapus
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-3">
                  <div className="flex flex-col items-center">
                    {post.is_system ? (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-sm shadow-emerald-500/20">
                        <Sparkles size={16} />
                      </div>
                    ) : (
                      <AgentAvatar name={authorName} photo={post.author.photo} />
                    )}
                    <AnimatePresence initial={false}>
                      {commentsOpen && (
                        <motion.div
                          key="post-rail"
                          data-thread-rail="post"
                          aria-hidden="true"
                          className="mt-1.5 -mb-2 w-px flex-1 bg-gray-200 dark:bg-slate-700"
                          initial={reduceMotion ? false : { opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={reduceMotion ? { duration: 0 } : { duration: 0.25 }}
                        />
                      )}
                    </AnimatePresence>
                  </div>

                  <div data-post-content className="min-w-0">
                    <div className={`flex min-w-0 items-center gap-1.5 ${post.is_system ? '' : 'pr-10'}`}>
                      <p className="min-w-0 truncate text-[14px] font-bold text-gray-900 dark:text-white">{authorName}</p>
                      {post.is_system && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                          <Sparkles size={9} />
                          Sorotan
                        </span>
                      )}
                      <span className="flex-1" />
                      <time dateTime={post.created_at} className="shrink-0 text-[12px] font-medium text-gray-500 dark:text-slate-400">
                        {timeAgo(post.created_at)}
                      </time>
                    </div>

                    <p
                      data-post-body
                      className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-[1.5] text-gray-800 dark:text-slate-200"
                    >
                      {!post.is_system && <span aria-hidden="true" className="float-right h-6 w-11" />}
                      <MentionText body={post.body} memberBySlug={memberBySlug} />
                    </p>

                    {postMedia.length > 0 && (
                      <div>
                        <PostMediaRail
                          media={postMedia}
                          authorName={authorName}
                          onOpen={(index, trigger, resume) => openMediaViewer(postMedia, index, authorName, trigger, resume)}
                        />
                      </div>
                    )}

                    {post.quoted_post && (
                      <QuotedPostCard
                        quoted={post.quoted_post}
                        interactive
                        onOpenPost={() => {
                          const quotedId = post.quoted_post?.id;
                          if (quotedId) openPostDetail(quotedId);
                        }}
                        onOpenMedia={(index, trigger) => {
                          const quoted = post.quoted_post;
                          if (!quoted?.media?.length) return;
                          const quotedAuthor = quoted.author?.name || (quoted.is_system ? 'Miqot' : 'Agent');
                          openMediaViewer(quoted.media, index, quotedAuthor, trigger);
                        }}
                      />
                    )}

                    {post.link_preview && postMedia.length === 0 && !post.quoted_post && (
                      <LinkPreviewCard preview={post.link_preview} />
                    )}

                    <div className="relative -ml-2 mt-1 flex items-center gap-1">
                      <motion.button
                        type="button"
                        aria-disabled={reactionIsBusy}
                        aria-label="Suka"
                        title="Suka"
                        aria-pressed={!!post.my_reaction}
                        onClick={() => {
                          if (!reactionIsBusy) handleLikeClick(post);
                        }}
                        whileTap={reduceMotion ? undefined : { scale: 0.86 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 26 }}
                        className={`flex min-h-11 select-none touch-manipulation items-center gap-1.5 rounded-full px-2 text-[12.5px] font-semibold transition-colors hover:text-rose-500 active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50 dark:hover:text-rose-400 dark:active:bg-slate-900 ${
                          post.my_reaction
                            ? 'text-rose-500 dark:text-rose-400'
                            : 'text-gray-500 dark:text-slate-400'
                        }`}
                      >
                        <span className="relative flex items-center justify-center">
                          {likePopped && (
                            <motion.span
                              aria-hidden="true"
                              className="absolute -inset-1 rounded-full bg-rose-500/30"
                              initial={{ scale: 0.3, opacity: 0.8 }}
                              animate={{ scale: 1.9, opacity: 0 }}
                              transition={{ duration: 0.5, ease: 'easeOut' }}
                            />
                          )}
                          <motion.span
                            key={likePopped ? 'liked-pop' : 'idle'}
                            className="flex"
                            initial={likePopped ? { scale: 0 } : false}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 560, damping: 14 }}
                          >
                            <Heart size={19} fill={post.my_reaction ? 'currentColor' : 'none'} />
                          </motion.span>
                        </span>
                        <AnimatePresence mode="popLayout" initial={false}>
                          {totalReactions > 0 && (
                            <motion.span
                              key={totalReactions}
                              className="tabular-nums"
                              initial={reduceMotion ? false : { y: 9, opacity: 0 }}
                              animate={{ y: 0, opacity: 1 }}
                              exit={reduceMotion ? { opacity: 0 } : { y: -9, opacity: 0 }}
                              transition={{ duration: 0.16, ease: 'easeOut' }}
                            >
                              {totalReactions}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </motion.button>

                      <motion.button
                        type="button"
                        onClick={() => {
                          if (isDetailView) focusCommentInput(post.id);
                          else toggleComments(post.id);
                        }}
                        aria-expanded={commentsOpen}
                        aria-controls={`teras-comments-${post.id}`}
                        aria-label="Komentari"
                        title="Komentari"
                        whileTap={reduceMotion ? undefined : { scale: 0.9 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 26 }}
                        className={`flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[12.5px] font-semibold transition-colors hover:text-emerald-600 active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:hover:text-emerald-400 dark:active:bg-slate-900 ${
                          commentsOpen
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-gray-500 dark:text-slate-400'
                        }`}
                      >
                        <MessageCircle size={19} />
                        <AnimatePresence mode="popLayout" initial={false}>
                          {post.comment_count > 0 && (
                            <motion.span
                              key={post.comment_count}
                              className="tabular-nums"
                              initial={reduceMotion ? false : { y: 9, opacity: 0 }}
                              animate={{ y: 0, opacity: 1 }}
                              exit={reduceMotion ? { opacity: 0 } : { y: -9, opacity: 0 }}
                              transition={{ duration: 0.16, ease: 'easeOut' }}
                            >
                              {post.comment_count}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </motion.button>

                      <motion.button
                        type="button"
                        onClick={() => openQuoteComposer(post)}
                        aria-label="Quote"
                        title="Quote"
                        whileTap={reduceMotion ? undefined : { scale: 0.9 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 26 }}
                        className="flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[12.5px] font-semibold text-gray-500 transition-colors hover:text-emerald-600 active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:text-slate-400 dark:hover:text-emerald-400 dark:active:bg-slate-900"
                      >
                        <RefreshCw size={19} />
                        <AnimatePresence mode="popLayout" initial={false}>
                          {(post.quote_count || 0) > 0 && (
                            <motion.span
                              key={post.quote_count}
                              className="tabular-nums"
                              initial={reduceMotion ? false : { y: 9, opacity: 0 }}
                              animate={{ y: 0, opacity: 1 }}
                              exit={reduceMotion ? { opacity: 0 } : { y: -9, opacity: 0 }}
                              transition={{ duration: 0.16, ease: 'easeOut' }}
                            >
                              {post.quote_count}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </motion.button>

                      <motion.button
                        type="button"
                        onClick={() => { void sharePost(post); }}
                        aria-label="Bagikan"
                        title="Bagikan ke grup WhatsApp"
                        whileTap={reduceMotion ? undefined : { scale: 0.9 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 26 }}
                        className="flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[12.5px] font-semibold text-gray-500 transition-colors hover:text-emerald-600 active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:text-slate-400 dark:hover:text-emerald-400 dark:active:bg-slate-900"
                      >
                        <Share2 size={18} />
                      </motion.button>
                    </div>
                  </div>
                </div>

                <AnimatePresence initial={false}>
                {commentsOpen && commentPanel && (
                  <motion.div
                    key="comments"
                    id={`teras-comments-${post.id}`}
                    aria-busy={commentPanel.sending}
                    className="min-w-0 overflow-hidden"
                    initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                    transition={reduceMotion ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {commentPanel.loading ? (
                      <CommentSkeleton />
                    ) : commentPanel.error && !commentPanel.loaded ? (
                      <div role="alert" className="ml-[52px] mt-2 min-w-0 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-600 [overflow-wrap:anywhere] dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
                        <p className="min-w-0 [overflow-wrap:anywhere]">{commentPanel.error}</p>
                        <button
                          type="button"
                          onClick={() => void loadComments(post.id)}
                          className="mt-2 min-h-11 rounded-lg bg-red-500 px-3 font-bold text-white dark:bg-red-500"
                        >
                          Coba Lagi
                        </button>
                      </div>
                    ) : (
                      <>
                        {commentPanel.comments.length === 0 ? (
                          <div className="mt-2 grid grid-cols-[40px_minmax(0,1fr)] gap-x-3">
                            <div aria-hidden="true" className="flex flex-col items-center">
                              <div data-thread-rail="empty" className="-my-2 w-px flex-1 bg-gray-200 dark:bg-slate-700" />
                            </div>
                            <p className="min-w-0 py-1 text-[11px] text-gray-500 dark:text-slate-400">Belum ada komentar — jadilah yang pertama membalas.</p>
                          </div>
                        ) : commentPanel.comments.map(comment => {
                          const canDeleteComment = comment.is_own || agent.role === 'admin';
                          return (
                            <div key={comment.id} data-comment-row className="mt-2 grid grid-cols-[40px_minmax(0,1fr)] gap-x-3">
                              <div className="flex flex-col items-center">
                                <AgentAvatar name={comment.author.name || 'Agent'} photo={comment.author.photo} size="comment" />
                                <div data-thread-rail="comment" aria-hidden="true" className="mt-1.5 -mb-2 w-px flex-1 bg-gray-200 dark:bg-slate-700" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <p className="min-w-0 truncate text-[13px] font-bold text-gray-800 dark:text-slate-200">{comment.author.name || 'Agent'}</p>
                                  <span className="flex-1" />
                                  <time dateTime={comment.created_at} className="shrink-0 text-[11px] font-medium text-gray-500 dark:text-slate-400">
                                    {timeAgo(comment.created_at)}
                                  </time>
                                  {canDeleteComment && (
                                    <button
                                      type="button"
                                      disabled={deletingCommentId === comment.id}
                                      onClick={() => void deleteComment(post.id, comment.id)}
                                      aria-label="Hapus komentar"
                                      title="Hapus komentar"
                                      className="-my-3 -mr-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center text-gray-500 transition-colors hover:text-red-500 active:text-red-500 disabled:opacity-50 dark:text-slate-400 dark:hover:text-red-400 dark:active:text-red-400"
                                    >
                                      {deletingCommentId === comment.id
                                        ? <Loader2 size={13} className="animate-spin" />
                                        : <Trash2 size={13} />}
                                    </button>
                                  )}
                                </div>
                                <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-gray-700 [overflow-wrap:anywhere] dark:text-slate-300"><MentionText body={comment.body} memberBySlug={memberBySlug} /></p>
                                {(comment.media?.length ?? 0) > 0 && (
                                  <div className="mt-1.5 flex snap-x gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                    {(comment.media || []).map((item, index) => (
                                      <button
                                        key={`${comment.id}-media-${index}`}
                                        type="button"
                                        onClick={event => openMediaViewer(comment.media || [], index, comment.author.name || 'Agent', event.currentTarget)}
                                        aria-label={`Lihat ${item.type === 'video' ? 'video' : 'foto'} ${index + 1} dari komentar ${comment.author.name || 'Agent'}`}
                                        className="relative shrink-0 snap-start overflow-hidden rounded-lg border border-gray-100 bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:border-slate-700 dark:bg-slate-950"
                                      >
                                        {item.type === 'video' ? (
                                          <>
                                            <video
                                              src={item.url}
                                              playsInline
                                              muted
                                              preload="metadata"
                                              className="h-36 w-auto min-w-[5rem] max-w-[70vw] bg-black object-contain"
                                            />
                                            <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
                                                <Play size={16} className="ml-0.5" fill="currentColor" />
                                              </span>
                                            </span>
                                          </>
                                        ) : (
                                          <img
                                            src={item.url}
                                            alt={`Foto ${index + 1} komentar ${comment.author.name || 'Agent'}`}
                                            loading="lazy"
                                            className="block h-36 w-auto max-w-[70vw] object-contain"
                                          />
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {commentPanel.error && (
                          <p role="alert" className="ml-[52px] mt-2 min-w-0 text-[10px] font-medium text-red-500 [overflow-wrap:anywhere] dark:text-red-400">{commentPanel.error}</p>
                        )}

                        <p role="status" aria-live="polite" className="sr-only">
                          {commentPanel.sending ? 'Sedang mengirim komentar.' : ''}
                        </p>

                        <div data-thread-input className="mt-2 grid grid-cols-[40px_minmax(0,1fr)] gap-x-3">
                          <div className="relative flex justify-center pt-2">
                            <div data-thread-rail="input" aria-hidden="true" className="absolute left-1/2 top-0 h-5 w-px -translate-x-1/2 bg-gray-200 dark:bg-slate-700" />
                            <div className="relative z-10">
                              <AgentAvatar name={agent.name} photo={agent.photo} size="comment" />
                            </div>
                          </div>
                          <div className="min-w-0">
                          <div className="flex min-w-0 items-end gap-1.5 pb-1">
                            <div className="relative min-w-0 flex-1 rounded-3xl border border-gray-200 bg-gray-50 transition-colors focus-within:border-emerald-400/70 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-500/15 dark:border-slate-700 dark:bg-slate-800/60 dark:focus-within:border-emerald-500/50 dark:focus-within:bg-slate-900">
                            {mentionState?.context === post.id && (
                              <MentionAutocomplete
                                items={mentionItems}
                                activeIndex={mentionState.index}
                                onSelect={applyMention}
                                onHoverIndex={index => setMentionState(s => (s ? { ...s, index } : s))}
                                placement="top"
                              />
                            )}
                            <div className="flex min-h-11 min-w-0 items-end px-3.5">
                              <div className="relative min-w-0 flex-1 self-center">
                              <MentionHighlightLayer
                                text={commentPanel.input}
                                memberBySlug={memberBySlug}
                                className="py-[11px] text-[13.5px] leading-snug"
                              />
                              <textarea
                                id={`teras-comment-input-${post.id}`}
                                rows={1}
                                value={commentPanel.input}
                                readOnly={commentPanel.sending}
                                aria-disabled={commentPanel.sending}
                                onChange={event => {
                                  updateCommentInput(post.id, event.target.value);
                                  autoGrowCommentInput(event.target);
                                  detectMention(post.id, event.target);
                                }}
                                onKeyDown={event => handleCommentKeyDown(event, post.id)}
                                onScroll={event => {
                                  const layer = event.currentTarget.previousElementSibling as HTMLElement | null;
                                  if (layer) layer.scrollTop = event.currentTarget.scrollTop;
                                }}
                                aria-label="Tulis komentar"
                                placeholder={`Balas ke ${authorName}…`}
                                maxLength={COMMENT_BODY_HARD_CAP}
                                className="relative block w-full resize-none overflow-hidden bg-transparent py-[11px] text-[13.5px] leading-snug text-gray-800 outline-none placeholder:text-gray-500 read-only:opacity-60 dark:text-white dark:placeholder:text-slate-400"
                              />
                              </div>
                              <button
                                type="button"
                                onClick={() => openCommentMediaPicker(post.id)}
                                disabled={commentPanel.sending || commentPanel.media.length >= MAX_COMMUNITY_MEDIA}
                                aria-label="Tambah foto atau video ke komentar"
                                title="Tambah foto atau video"
                                className="flex h-11 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:text-emerald-600 active:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:opacity-35 dark:text-slate-400 dark:hover:text-emerald-400 dark:active:text-emerald-400"
                              >
                                <ImageIcon size={18} strokeWidth={1.8} />
                              </button>
                              <span
                                aria-live="polite"
                                className={`flex h-11 shrink-0 items-center pl-2 text-[10px] font-semibold tabular-nums ${
                                  commentInputLength > MAX_COMMUNITY_COMMENT_CHARS
                                    ? 'text-red-500 dark:text-red-400'
                                    : 'text-gray-400 dark:text-slate-500'
                                }`}
                              >
                                {commentInputLength}/{MAX_COMMUNITY_COMMENT_CHARS}
                              </span>
                              </div>
                              {commentPanel.media.length > 0 && (
                              <div
                                role="group"
                                aria-label={`${commentPanel.media.length} media komentar dipilih`}
                                className="flex snap-x gap-1.5 overflow-x-auto overscroll-x-contain px-3 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                              >
                                {commentPanel.media.map((item, index) => (
                                  <div
                                    key={item.id}
                                    className="relative h-24 shrink-0 snap-start overflow-hidden rounded-lg border border-gray-100 bg-gray-100 dark:border-slate-700 dark:bg-slate-950"
                                  >
                                    {item.type === 'video' ? (
                                      <video
                                        src={item.previewUrl}
                                        playsInline
                                        muted
                                        preload="metadata"
                                        aria-label={`Pratinjau video komentar ${index + 1}`}
                                        className="h-full w-auto min-w-[5rem] max-w-[60vw] bg-black object-contain"
                                      />
                                    ) : (
                                      <img
                                        src={item.previewUrl}
                                        alt={`Pratinjau foto komentar ${index + 1}`}
                                        className="block h-full w-auto max-w-[60vw] object-contain"
                                      />
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => removeCommentMedia(post.id, item.id)}
                                      disabled={commentPanel.sending}
                                      aria-label={`Hapus ${item.type === 'video' ? 'video' : 'foto'} komentar ${index + 1}`}
                                      title="Hapus media"
                                      className="absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
                                    >
                                      <X size={12} />
                                    </button>
                                    {(item.status === 'processing' || item.status === 'uploading') && (
                                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                                        <Loader2 size={14} className="animate-spin" />
                                      </div>
                                    )}
                                    {item.status === 'error' && (
                                      <div className="pointer-events-none absolute inset-x-1 bottom-1 rounded bg-red-600/90 px-1.5 py-0.5 text-center text-[9px] font-semibold text-white">
                                        Gagal
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                              )}
                            </div>
                            <AnimatePresence initial={false}>
                              {(commentInputLength > 0 || commentPanel.media.length > 0) && (
                                <motion.button
                                  key="send"
                                  type="button"
                                  disabled={commentPanel.sending
                                    || commentInputLength < 1
                                    || commentInputLength > MAX_COMMUNITY_COMMENT_CHARS
                                    || commentPanel.media.some(item => item.status !== 'ready')}
                                  onClick={() => void sendComment(post.id)}
                                  aria-label="Kirim komentar"
                                  title="Kirim komentar"
                                  initial={reduceMotion ? false : { scale: 0.5, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  exit={reduceMotion ? { opacity: 0 } : { scale: 0.5, opacity: 0 }}
                                  whileTap={reduceMotion ? undefined : { scale: 0.88 }}
                                  transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                                  className="flex min-h-11 min-w-11 shrink-0 items-center justify-center disabled:opacity-50"
                                >
                                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md shadow-emerald-500/30 transition-colors hover:bg-emerald-600 dark:shadow-emerald-950/40">
                                    {commentPanel.sending
                                      ? <Loader2 size={15} className="animate-spin" />
                                      : <ArrowUp size={16} strokeWidth={2.6} />}
                                  </span>
                                </motion.button>
                              )}
                            </AnimatePresence>
                          </div>
                          </div>
                        </div>
                      </>
                    )}
                  </motion.div>
                )}
                </AnimatePresence>
              </article>
            );
          })}

          {!isDetailView && nextCursor && (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void handleLoadMore()}
              className="mx-4 mt-4 flex min-h-11 items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-[12px] font-bold text-gray-500 transition-colors active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:active:bg-slate-800"
            >
              {loadingMore && <Loader2 size={15} className="animate-spin" />}
              Muat Lebih Banyak
            </button>
          )}
        </div>
      )}

      </div>

      {composerSheet}
      {mediaViewerSheet}

      <AnimatePresence>
        {toast && (
          <motion.div
            role={toast.tone === 'error' ? 'alert' : 'status'}
            aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
            className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 z-[70] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-start gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[12px] font-semibold text-gray-700 shadow-lg dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
          >
            {toast.tone === 'success'
              ? <CheckCircle2 size={15} className="shrink-0 text-emerald-500 dark:text-emerald-400" />
              : <AlertCircle size={15} className="shrink-0 text-red-500 dark:text-red-400" />}
            <span className="min-w-0 [overflow-wrap:anywhere]">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

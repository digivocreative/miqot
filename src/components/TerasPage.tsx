import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flag,
  Heart,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  MessageCircle,
  MoreHorizontal,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { handleAgentPhotoError } from '../lib/agent-photo';
import { getAuthHeaders } from './LoginPage';

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
  is_own: boolean;
}

interface CommunityMedia {
  type: CommunityMediaType;
  url: string;
}

interface CommunityComment {
  id: string;
  body: string;
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
}

const REQUEST_TIMEOUT_MS = 20_000;
const MEDIA_UPLOAD_TIMEOUT_MS = 120_000;
const MAX_COMMUNITY_MEDIA = 4;
const COMPOSER_PROMPT = 'Apa yang baru, Bu?';
const MAX_COMMUNITY_SOURCE_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_COMMUNITY_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_COMMUNITY_VIDEO_BYTES = 24 * 1024 * 1024;
const SUPPORTED_VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
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
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100 font-bold text-emerald-700 ring-2 ring-pink-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-pink-500/70 ${sizeClass}`}>
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

function PostMediaRail({
  media,
  authorName,
  onOpen,
}: {
  media: CommunityMedia[];
  authorName: string;
  onOpen: (index: number, trigger: HTMLElement) => void;
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

  const renderMedia = (item: CommunityMedia, index: number, preserveIntrinsicRatio = false) => {
    const positionLabel = media.length === 1 ? '' : ` ${index + 1} dari ${media.length}`;
    if (item.type === 'video') {
      return (
        <div className={`relative w-full ${preserveIntrinsicRatio ? '' : 'h-full'}`}>
          <video
            src={item.url}
            controls
            playsInline
            preload="metadata"
            aria-label={`Video ${index + 1} dari ${media.length} kiriman ${authorName}`}
            className={`${preserveIntrinsicRatio ? 'block max-h-[22rem]' : 'h-full'} w-full bg-black object-contain`}
          />
          <button
            type="button"
            onClick={event => onOpen(index, event.currentTarget)}
            aria-label={`Buka video${positionLabel} kiriman ${authorName} layar penuh`}
            aria-haspopup="dialog"
            title="Buka layar penuh"
            className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white shadow-md backdrop-blur-sm transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
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
        className={`group block w-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/70 ${preserveIntrinsicRatio ? '' : 'h-full'}`}
      >
        <img
          src={item.url}
          alt={media.length === 1
            ? `Foto kiriman ${authorName}`
            : `Foto ${index + 1} dari ${media.length} kiriman ${authorName}`}
          loading="lazy"
          className={`${preserveIntrinsicRatio ? 'block max-h-[22rem] object-contain' : 'h-full object-cover'} w-full bg-gray-100 transition-transform duration-300 group-active:scale-[0.985] motion-reduce:transition-none dark:bg-slate-950`}
        />
      </button>
    );
  };

  if (media.length === 1) {
    return (
      <div data-media-layout="single" className="mt-2 max-h-[22rem] overflow-hidden rounded-xl border border-gray-100 bg-gray-100 dark:border-slate-700 dark:bg-slate-950">
        {renderMedia(media[0], 0, true)}
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
            {renderMedia(item, index)}
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
        className="flex snap-x snap-mandatory gap-1 overflow-x-auto overscroll-x-contain scroll-smooth rounded-xl outline-none motion-reduce:scroll-auto [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-emerald-500/60 [&::-webkit-scrollbar]:hidden"
      >
        {media.map((item, index) => (
          <div
            key={`${item.type}-${item.url}-${index}`}
            data-media-slide
            className="aspect-[4/3] max-h-[24rem] shrink-0 basis-[86%] snap-start overflow-hidden rounded-xl border border-gray-100 bg-gray-100 [scroll-snap-stop:always] dark:border-slate-700 dark:bg-slate-950"
          >
            {renderMedia(item, index)}
          </div>
        ))}
        <div aria-hidden="true" className="w-[14%] shrink-0" />
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

export default function TerasPage({ agent }: { agent: TerasAgent }) {
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

  const pageRootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerFormRef = useRef<HTMLFormElement>(null);
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

  const showToast = useCallback((message: string, tone: ToastState['tone']) => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast({ message, tone });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, tone === 'error' ? 5000 : 2500);
  }, []);

  const openMediaViewer = useCallback((
    media: CommunityMedia[],
    index: number,
    authorName: string,
    trigger: HTMLElement,
  ) => {
    mediaViewerTriggerRef.current = trigger;
    setMediaViewer({
      media: media.slice(),
      index: Math.max(0, Math.min(media.length - 1, index)),
      authorName,
      direction: 0,
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
      return { ...current, index: nextIndex, direction };
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
        if (!append) return [...pendingPosts, ...serverPosts];
        const knownIds = new Set(current.map(post => post.id));
        return [...current, ...serverPosts.filter(post => !knownIds.has(post.id))];
      });
      setNextCursor(typeof payload.next_cursor === 'string' ? payload.next_cursor : null);
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
    };
  }, [composerOpen]);

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

  const openComposer = (openPhotoPicker = false) => {
    composerTriggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setComposerOpen(true);
    setComposerError(null);
    if (openPhotoPicker) fileInputRef.current?.click();
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
        validationErrors.push(`${file.name}: foto awal maksimal 16MB`);
        continue;
      }
      if (isVideo && file.size > MAX_COMMUNITY_VIDEO_BYTES) {
        validationErrors.push(`${file.name}: video maksimal 24MB`);
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
          throw new Error('Ukuran foto setelah diproses masih lebih dari 6MB');
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

  const handleCreatePost = async (event: FormEvent) => {
    event.preventDefault();
    const body = composerBody.trim();
    const bodyLength = Array.from(body).length;
    if (bodyLength < 1 || bodyLength > 2000 || composerBusy) return;
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
          }),
          signal: controller.signal,
        },
        'Gagal membuat kiriman',
      );
      if (!created.data) throw new Error('Kiriman baru tidak tersedia');

      const createdPost = created.data;
      pendingCreatedPostsRef.current.set(createdPost.id, createdPost);
      setPosts(current => [createdPost, ...current.filter(post => post.id !== createdPost.id)]);
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
    if (!panel || commentSendingRef.current.has(postId) || bodyLength < 1 || bodyLength > 1000) return;

    const requestId = commentRequestIdsRef.current.get(postId) || window.crypto.randomUUID();
    commentRequestIdsRef.current.set(postId, requestId);
    commentSendingRef.current.add(postId);
    setCommentPanels(current => ({
      ...current,
      [postId]: { ...current[postId], sending: true, error: null },
    }));
    try {
      const created = await requestJson<CommunityComment>(
        `/api/community/posts/${encodeURIComponent(postId)}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ body, client_id: requestId }),
        },
        'Gagal menambahkan komentar',
      );
      if (!created.data) throw new Error('Komentar baru tidak tersedia');

      setCommentPanels(current => {
        const currentPanel = current[postId] || emptyCommentPanel();
        return {
          ...current,
          [postId]: {
            ...currentPanel,
            sending: false,
            loaded: true,
            input: '',
            comments: [...currentPanel.comments.filter(comment => comment.id !== created.data?.id), created.data as CommunityComment],
          },
        };
      });
      setPosts(current => current.map(post => post.id === postId
        ? { ...post, comment_count: post.comment_count + 1 }
        : post));
      commentRequestIdsRef.current.delete(postId);
    } catch (commentError) {
      const message = errorMessage(commentError, 'Gagal menambahkan komentar');
      setCommentPanels(current => ({
        ...current,
        [postId]: { ...current[postId], sending: false, error: message },
      }));
      showToast(message, 'error');
    } finally {
      commentSendingRef.current.delete(postId);
    }
  };

  const handleCommentKeyDown = (event: KeyboardEvent<HTMLInputElement>, postId: string) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void sendComment(postId);
  };

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
    && composerBodyLength <= 2000
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
          className="fixed inset-0 z-50 flex h-[100dvh] min-h-[100dvh] flex-col bg-gradient-to-b from-gray-50 to-gray-100 dark:from-slate-900 dark:to-slate-950"
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
              <h2 id="teras-composer-title" className="text-center text-sm font-bold text-gray-900 dark:text-white">Buat Kiriman</h2>
              <span aria-hidden="true" />
            </div>
          </header>

          <div className="flex-1 overflow-x-hidden overflow-y-auto">
            <div className="mx-auto w-full max-w-2xl px-4 pb-4 pt-4">
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

                  <textarea
                    autoFocus
                    aria-label="Isi kiriman"
                    value={composerBody}
                    onChange={event => {
                      composerRequestIdRef.current = null;
                      setComposerBody(event.target.value);
                    }}
                    disabled={composerBusy}
                    maxLength={2100}
                    placeholder={COMPOSER_PROMPT}
                    className="mt-1.5 min-h-[88px] w-full resize-none bg-transparent text-[17px] leading-relaxed text-gray-900 outline-none placeholder:text-gray-500 disabled:opacity-60 dark:text-white dark:placeholder:text-slate-400"
                  />

                  {composerBodyLength > 2000 && (
                    <p className="mb-2 text-[10px] font-medium text-red-500 dark:text-red-400">Isi kiriman maksimal 2000 karakter</p>
                  )}

                  <div className="flex min-h-11 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={composerBusy || composerMedia.length >= MAX_COMMUNITY_MEDIA}
                      aria-label="Tambahkan foto atau video"
                      title="Tambahkan foto atau video"
                      className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 transition-colors active:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:opacity-35 dark:text-slate-400 dark:active:bg-slate-800"
                    >
                      <ImageIcon size={22} />
                    </button>
                    <span className="flex-1" />
                    <span
                      aria-live="polite"
                      className={`text-[10px] font-semibold tabular-nums ${
                        composerBodyLength > 2000
                          ? 'text-red-500 dark:text-red-400'
                          : 'text-gray-500 dark:text-slate-400'
                      }`}
                    >
                      {composerBodyLength}/2000
                    </span>
                  </div>

                  {composerMedia.length > 0 && (
                    <div
                      role="group"
                      data-composer-media-layout={composerMedia.length === 1 ? 'single' : composerMedia.length === 2 ? 'pair' : 'carousel'}
                      className={composerMedia.length === 2
                        ? 'mb-2 grid grid-cols-2 gap-1'
                        : 'mb-2 flex snap-x snap-mandatory gap-1 overflow-x-auto overscroll-x-contain rounded-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'}
                      aria-label={`${composerMedia.length} media kiriman dipilih`}
                    >
                      {composerMedia.map((item, index) => (
                        <div
                          key={item.id}
                          className={`relative overflow-hidden rounded-xl border border-gray-100 bg-gray-100 dark:border-slate-700 dark:bg-slate-950 ${
                            composerMedia.length === 1
                              ? 'max-h-[22rem] w-full shrink-0 snap-start'
                              : composerMedia.length === 2
                                ? 'aspect-[3/4] min-w-0'
                                : 'aspect-[4/3] max-h-[22rem] shrink-0 basis-[86%] snap-start [scroll-snap-stop:always]'
                          }`}
                        >
                          {item.type === 'video' ? (
                            <video
                              src={item.previewUrl}
                              controls
                              playsInline
                              preload="metadata"
                              aria-label={`Pratinjau video ${index + 1}`}
                              className={`${composerMedia.length === 1 ? 'block max-h-[22rem]' : 'h-full'} w-full bg-black object-contain`}
                            />
                          ) : (
                            <img
                              src={item.previewUrl}
                              alt={composerMedia.length === 1 ? 'Pratinjau foto kiriman' : `Pratinjau foto ${index + 1}`}
                              className={`${composerMedia.length === 1 ? 'block max-h-[22rem] object-contain' : 'h-full object-cover'} w-full`}
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
                      {composerMedia.length > 2 && <div aria-hidden="true" className="w-[14%] shrink-0" />}
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

          <div className="shrink-0 border-t border-gray-100 bg-white/95 dark:border-slate-700/50 dark:bg-slate-900/95">
            <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
              <span className="flex-1 text-[11px] font-medium text-gray-500 dark:text-slate-400">
                Tampil untuk semua agent Alhijaz
              </span>
              <button
                type="submit"
                disabled={!composerCanSubmit}
                aria-label="Kirim kiriman"
                className="flex min-h-11 min-w-[72px] items-center justify-center rounded-full bg-emerald-500 px-4 py-2 text-[12px] font-extrabold text-white shadow-md shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-45 dark:bg-emerald-500 dark:shadow-emerald-950/40"
              >
                {composerBusy ? <Loader2 size={15} className="animate-spin" /> : 'KIRIM'}
              </button>
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
              className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <X size={21} />
            </button>
          </div>

          <div
            className="flex min-h-0 flex-1 items-center justify-center px-3 pb-16 pt-16"
            onClick={event => {
              if (event.target === event.currentTarget) closeMediaViewer();
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${mediaViewer.index}-${mediaViewer.media[mediaViewer.index]?.url}`}
                className="flex h-full w-full items-center justify-center"
                onClick={event => {
                  const target = event.target;
                  if (target instanceof Element && target.closest('img, video')) return;
                  closeMediaViewer();
                }}
                initial={reduceMotion ? false : {
                  opacity: 0,
                  x: mediaViewer.direction * 42,
                  scale: 0.975,
                }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : {
                  opacity: 0,
                  x: mediaViewer.direction * -42,
                  scale: 0.985,
                }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                {mediaViewer.media[mediaViewer.index]?.type === 'video' ? (
                  <video
                    src={mediaViewer.media[mediaViewer.index].url}
                    controls
                    playsInline
                    preload="metadata"
                    aria-label={`Video ${mediaViewer.index + 1} layar penuh dari kiriman ${mediaViewer.authorName}`}
                    className="max-h-full max-w-full rounded-xl bg-black object-contain shadow-2xl"
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
                className="absolute left-2 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:pointer-events-none disabled:opacity-0"
              >
                <ChevronLeft size={22} />
              </button>
              <button
                type="button"
                onClick={() => navigateMediaViewer(1)}
                disabled={mediaViewer.index === mediaViewer.media.length - 1}
                aria-label="Media layar penuh berikutnya"
                className="absolute right-2 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:pointer-events-none disabled:opacity-0"
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

      <section className="border-b border-gray-100 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <AgentAvatar name={agent.name} photo={agent.photo} />
          <button
            type="button"
            onClick={() => openComposer(false)}
            className="min-h-11 flex-1 rounded-full border border-gray-200 bg-white px-3.5 py-2.5 text-left text-[13px] text-gray-500 transition-colors active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:active:bg-slate-950"
          >
            {COMPOSER_PROMPT}
          </button>
          <button
            type="button"
            onClick={() => openComposer(true)}
            aria-label="Tambahkan foto atau video"
            title="Tambahkan foto atau video"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 transition-all active:scale-95 active:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:text-slate-400 dark:active:bg-slate-800"
          >
            <ImageIcon size={18} />
          </button>
        </div>
      </section>

      {loading ? (
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
      ) : posts.length === 0 ? (
        <div className="border-b border-gray-100 bg-white px-5 py-12 text-center dark:border-slate-800 dark:bg-slate-900">
          <Users size={36} className="mx-auto mb-3 text-gray-300 dark:text-slate-600" />
          <p className="text-sm font-semibold text-gray-600 dark:text-slate-300">Belum ada kiriman di Teras.</p>
          <p className="mt-1 text-[12px] text-gray-500 dark:text-slate-400">Jadilah yang pertama berbagi.</p>
        </div>
      ) : (
        <div>
          {posts.map(post => {
            const commentPanel = commentPanels[post.id];
            const commentsOpen = !!commentPanel?.open;
            const commentInputLength = Array.from(commentPanel?.input.trim() || '').length;
            const canDeletePost = post.is_own || agent.role === 'admin';
            const totalReactions = post.reactions.suka + post.reactions.selamat + post.reactions.aamiin;
            const reactionIsBusy = reactionBusy.has(post.id);
            const postMedia = normalizePostMedia(post);
            const authorName = post.author.name || (post.is_system ? 'Miqot' : 'Agent');

            return (
              <article
                key={post.id}
                data-post-id={post.id}
                className={`relative border-b bg-white px-4 pb-2.5 pt-3.5 dark:bg-slate-900 ${
                  post.is_system
                    ? 'border-emerald-500/25 dark:border-emerald-500/25'
                    : 'border-gray-100 dark:border-slate-800'
                }`}
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
                      className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 transition-colors active:bg-gray-100 dark:text-slate-400 dark:active:bg-slate-700"
                    >
                      <MoreHorizontal size={17} />
                    </button>

                    {menuOpenPostId === post.id && (
                      <div
                        id={`teras-post-menu-${post.id}`}
                        role="menu"
                        aria-label="Menu kiriman"
                        onKeyDown={event => handlePostMenuKeyDown(event, post.id)}
                        className={`absolute right-0 z-20 w-44 overflow-hidden rounded-xl border border-gray-100 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-800 ${menuOpensUp ? 'bottom-12' : 'top-12'}`}
                      >
                        {confirmDeletePostId === post.id ? (
                          <div className="p-2">
                            <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">Hapus kiriman ini?</p>
                            <div className="mt-2 flex gap-1.5">
                              <button
                                type="button"
                                disabled={deletingPostId === post.id}
                                data-delete-cancel
                                onClick={() => {
                                  focusMenuOnOpenRef.current = true;
                                  setConfirmDeletePostId(null);
                                }}
                                className="min-h-11 flex-1 rounded-lg bg-gray-100 px-2 text-[11px] font-semibold text-gray-600 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-300"
                              >
                                Batal
                              </button>
                              <button
                                type="button"
                                disabled={deletingPostId === post.id}
                                onClick={() => void deletePost(post.id)}
                                aria-label="Konfirmasi hapus kiriman"
                                className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-red-500 px-2 text-[11px] font-bold text-white disabled:opacity-50 dark:bg-red-500"
                              >
                                {deletingPostId === post.id ? <Loader2 size={13} className="animate-spin" /> : 'Hapus'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {!post.is_own && (
                              <button
                                type="button"
                                role="menuitem"
                                disabled={reportingPostId === post.id}
                                onClick={() => void reportPost(post.id)}
                                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs font-semibold text-gray-600 transition-colors active:bg-gray-50 disabled:opacity-50 dark:text-slate-300 dark:active:bg-slate-700"
                              >
                                {reportingPostId === post.id ? <Loader2 size={14} className="animate-spin" /> : <Flag size={14} />}
                                Laporkan
                              </button>
                            )}
                            {canDeletePost && (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => setConfirmDeletePostId(post.id)}
                                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs font-semibold text-red-600 transition-colors active:bg-red-50 dark:text-red-400 dark:active:bg-red-900/20"
                              >
                                <Trash2 size={14} />
                                Hapus
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
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
                    {commentsOpen && (
                      <div data-thread-rail="post" aria-hidden="true" className="mt-1.5 -mb-2 w-px flex-1 bg-gray-200 dark:bg-slate-700" />
                    )}
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
                      className="mt-1.5 whitespace-pre-wrap break-words text-base leading-[1.5] text-gray-800 dark:text-slate-200"
                    >
                      {!post.is_system && <span aria-hidden="true" className="float-right h-6 w-11" />}
                      {post.body}
                    </p>

                    {postMedia.length > 0 && (
                      <div>
                        <PostMediaRail
                          media={postMedia}
                          authorName={authorName}
                          onOpen={(index, trigger) => openMediaViewer(postMedia, index, authorName, trigger)}
                        />
                      </div>
                    )}

                    <div className="relative mt-1 flex items-center gap-1">
                      <button
                        type="button"
                        aria-disabled={reactionIsBusy}
                        aria-label="Suka"
                        title="Suka"
                        aria-pressed={!!post.my_reaction}
                        onClick={() => {
                          if (!reactionIsBusy) handleLikeClick(post);
                        }}
                        className={`flex min-h-11 select-none touch-manipulation items-center gap-1.5 rounded-full px-2 text-[12.5px] font-semibold transition-colors active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50 dark:active:bg-slate-900 ${reactionIsBusy ? 'opacity-60' : ''} ${
                          post.my_reaction
                            ? 'text-rose-500 dark:text-rose-400'
                            : 'text-gray-500 dark:text-slate-400'
                        }`}
                      >
                        {reactionIsBusy
                          ? <Loader2 size={19} className="animate-spin" />
                          : <Heart size={19} fill={post.my_reaction ? 'currentColor' : 'none'} />}
                        {totalReactions > 0 && <span className="tabular-nums">{totalReactions}</span>}
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleComments(post.id)}
                        aria-expanded={commentsOpen}
                        aria-controls={`teras-comments-${post.id}`}
                        aria-label="Komentari"
                        title="Komentari"
                        className={`flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[12.5px] font-semibold transition-colors active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:active:bg-slate-900 ${
                          commentsOpen
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-gray-500 dark:text-slate-400'
                        }`}
                      >
                        <MessageCircle size={19} />
                        {post.comment_count > 0 && <span className="tabular-nums">{post.comment_count}</span>}
                      </button>
                    </div>

                    {!commentsOpen && post.comment_count > 0 && (
                      <div data-reply-summary-row className="flex min-h-11 items-center">
                        <button
                          type="button"
                          onClick={() => toggleComments(post.id)}
                          aria-expanded="false"
                          aria-controls={`teras-comments-${post.id}`}
                          className="flex min-h-11 items-center text-[12.5px] font-medium text-gray-500 transition-colors active:text-gray-700 dark:text-slate-400 dark:active:text-slate-200"
                        >
                          {post.comment_count} balasan
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {commentsOpen && commentPanel && (
                  <div
                    id={`teras-comments-${post.id}`}
                    aria-busy={commentPanel.sending}
                    className="min-w-0"
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
                            <p className="min-w-0 py-1 text-[11px] text-gray-500 dark:text-slate-400">Belum ada komentar.</p>
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
                                      className="-my-3 -mr-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center text-gray-500 transition-colors active:text-red-500 disabled:opacity-50 dark:text-slate-400 dark:active:text-red-400"
                                    >
                                      {deletingCommentId === comment.id
                                        ? <Loader2 size={13} className="animate-spin" />
                                        : <Trash2 size={13} />}
                                    </button>
                                  )}
                                </div>
                                <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-gray-700 [overflow-wrap:anywhere] dark:text-slate-300">{comment.body}</p>
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
                          <div className="flex min-w-0 items-center gap-2 border-b border-gray-200 pb-2 dark:border-slate-700">
                            <input
                              type="text"
                              value={commentPanel.input}
                              readOnly={commentPanel.sending}
                              aria-disabled={commentPanel.sending}
                              onChange={event => updateCommentInput(post.id, event.target.value)}
                              onKeyDown={event => handleCommentKeyDown(event, post.id)}
                              aria-label="Tulis komentar"
                              placeholder={`Balas ke ${authorName}…`}
                              maxLength={1000}
                              className="min-h-11 min-w-0 flex-1 bg-transparent py-2 text-[13.5px] text-gray-800 outline-none placeholder:text-gray-500 read-only:opacity-60 dark:text-white dark:placeholder:text-slate-400"
                            />
                            <button
                              type="button"
                              disabled={commentPanel.sending || commentInputLength < 1 || commentInputLength > 1000}
                              onClick={() => void sendComment(post.id)}
                              aria-label="Kirim komentar"
                              title="Kirim komentar"
                              className="flex min-h-11 shrink-0 items-center justify-center px-2 text-[12.5px] font-extrabold text-emerald-600 transition-colors disabled:opacity-40 dark:text-emerald-400"
                            >
                              {commentPanel.sending ? <Loader2 size={14} className="animate-spin" /> : 'Kirim'}
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </article>
            );
          })}

          {nextCursor && (
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

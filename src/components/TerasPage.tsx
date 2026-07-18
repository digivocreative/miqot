import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  Flag,
  Globe,
  HandHeart,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  PartyPopper,
  Send,
  Sparkles,
  ThumbsUp,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { handleAgentPhotoError } from '../lib/agent-photo';
import { getAuthHeaders } from './LoginPage';

type ReactionType = 'suka' | 'selamat' | 'aamiin';

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
  is_system: boolean;
  created_at: string;
  author: CommunityAuthor;
  reactions: ReactionCounts;
  my_reaction: ReactionType | null;
  reaction_sample_name: string | null;
  comment_count: number;
  is_own: boolean;
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

interface ComposerPhoto {
  dataUrl: string;
  status: 'processing' | 'ready' | 'uploading' | 'error';
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

interface ReactionStyle {
  label: string;
  icon: LucideIcon;
  solidClass: string;
  textClass: string;
}

const REACTION_TYPES: ReactionType[] = ['suka', 'selamat', 'aamiin'];
const REQUEST_TIMEOUT_MS = 20_000;
const PHOTO_UPLOAD_TIMEOUT_MS = 120_000;
const REACTION_STYLES: Record<ReactionType, ReactionStyle> = {
  suka: {
    label: 'Suka',
    icon: ThumbsUp,
    solidClass: 'bg-emerald-500',
    textClass: 'text-emerald-600 dark:text-emerald-400',
  },
  selamat: {
    label: 'Selamat',
    icon: PartyPopper,
    solidClass: 'bg-amber-500',
    textClass: 'text-amber-600 dark:text-amber-400',
  },
  aamiin: {
    label: 'Aamiin',
    icon: HandHeart,
    solidClass: 'bg-teal-500',
    textClass: 'text-teal-600 dark:text-teal-400',
  },
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
      else reject(new Error('Foto tidak dapat dibaca'));
    };
    reader.onerror = () => reject(new Error('Foto tidak dapat dibaca'));
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

function PostSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center gap-3 px-3.5 pt-3">
        <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-slate-700" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-28 rounded bg-gray-200 dark:bg-slate-700" />
          <div className="h-2.5 w-20 rounded bg-gray-100 dark:bg-slate-700/70" />
        </div>
      </div>
      <div className="space-y-2 px-3.5 py-4">
        <div className="h-3 w-full rounded bg-gray-100 dark:bg-slate-700/70" />
        <div className="h-3 w-5/6 rounded bg-gray-100 dark:bg-slate-700/70" />
        <div className="h-3 w-2/3 rounded bg-gray-100 dark:bg-slate-700/70" />
      </div>
      <div className="mx-3.5 flex border-t border-gray-50 py-2.5 dark:border-slate-700/50">
        <div className="mx-auto h-4 w-16 rounded bg-gray-100 dark:bg-slate-900" />
        <div className="mx-auto h-4 w-20 rounded bg-gray-100 dark:bg-slate-900" />
      </div>
    </div>
  );
}

function CommentSkeleton() {
  return (
    <div className="space-y-2.5 py-2" aria-label="Memuat komentar" aria-busy="true">
      {[0, 1].map(item => (
        <div key={item} className="flex animate-pulse items-start gap-2">
          <div className="h-7 w-7 rounded-full bg-gray-200 dark:bg-slate-700" />
          <div className="h-12 flex-1 rounded-2xl bg-gray-100 dark:bg-slate-900" />
        </div>
      ))}
    </div>
  );
}

function socialProofLabel(post: CommunityPost): string {
  const total = REACTION_TYPES.reduce((sum, reaction) => sum + post.reactions[reaction], 0);
  if (total <= 0) return '';
  if (post.my_reaction) {
    return total === 1 ? 'Anda' : `Anda dan ${total - 1} lainnya`;
  }
  if (post.reaction_sample_name) {
    return total === 1
      ? post.reaction_sample_name
      : `${post.reaction_sample_name} dan ${total - 1} lainnya`;
  }
  return String(total);
}

export default function TerasPage({ agent }: { agent: TerasAgent }) {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerBody, setComposerBody] = useState('');
  const [composerPhoto, setComposerPhoto] = useState<ComposerPhoto | null>(null);
  const [composerBusy, setComposerBusy] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);

  const [commentPanels, setCommentPanels] = useState<Record<string, CommentPanelState>>({});
  const [reactionBusy, setReactionBusy] = useState<Set<string>>(new Set());
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [menuOpenPostId, setMenuOpenPostId] = useState<string | null>(null);
  const [confirmDeletePostId, setConfirmDeletePostId] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [reportingPostId, setReportingPostId] = useState<string | null>(null);
  const [pickerOpenPostId, setPickerOpenPostId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const pageRootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerFormRef = useRef<HTMLFormElement>(null);
  const composerTriggerRef = useRef<HTMLElement | null>(null);
  const composerControllerRef = useRef<AbortController | null>(null);
  const composerRequestIdRef = useRef<string | null>(null);
  const closeComposerRef = useRef<() => void>(() => {});
  const composerExitTimerRef = useRef<number | null>(null);
  const pageAriaHiddenBeforeComposerRef = useRef<string | null | undefined>(undefined);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const focusMenuOnOpenRef = useRef(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const likeButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const focusPickerOnOpenRef = useRef(false);
  const feedControllerRef = useRef<AbortController | null>(null);
  const commentControllersRef = useRef<Map<string, AbortController>>(new Map());
  const commentRequestIdsRef = useRef<Map<string, string>>(new Map());
  const reactionPendingRef = useRef<Set<string>>(new Set());
  const commentSendingRef = useRef<Set<string>>(new Set());
  const toastTimerRef = useRef<number | null>(null);
  const photoJobRef = useRef(0);
  const postsRef = useRef<CommunityPost[]>([]);
  const pendingCreatedPostsRef = useRef<Map<string, CommunityPost>>(new Map());
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  const showToast = useCallback((message: string, tone: ToastState['tone']) => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast({ message, tone });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2500);
  }, []);

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
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
    if (composerExitTimerRef.current !== null) window.clearTimeout(composerExitTimerRef.current);
    composerControllerRef.current?.abort();
    photoJobRef.current += 1;
    commentControllersRef.current.forEach(controller => controller.abort());
    commentControllersRef.current.clear();
  }, []);

  const openReactionPicker = useCallback((postId: string, focusFirst: boolean) => {
    focusPickerOnOpenRef.current = focusFirst;
    setMenuOpenPostId(null);
    setPickerOpenPostId(postId);
  }, []);

  const closeReactionPicker = useCallback((postId?: string, restoreFocus = false) => {
    setPickerOpenPostId(null);
    focusPickerOnOpenRef.current = false;
    longPressFiredRef.current = false;
    if (restoreFocus && postId) {
      window.requestAnimationFrame(() => likeButtonRefs.current.get(postId)?.focus());
    }
  }, []);

  useEffect(() => {
    if (!pickerOpenPostId || !focusPickerOnOpenRef.current) return;
    const animationFrame = window.requestAnimationFrame(() => {
      pickerRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]')?.focus();
      focusPickerOnOpenRef.current = false;
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [pickerOpenPostId]);

  const openPostMenu = useCallback((postId: string, focusFirst: boolean) => {
    focusMenuOnOpenRef.current = focusFirst;
    setPickerOpenPostId(null);
    setConfirmDeletePostId(null);
    setMenuOpenPostId(postId);
  }, []);

  const closePostMenu = useCallback((postId?: string, restoreFocus = false) => {
    setMenuOpenPostId(null);
    setConfirmDeletePostId(null);
    focusMenuOnOpenRef.current = false;
    if (restoreFocus && postId) {
      window.requestAnimationFrame(() => menuButtonRefs.current.get(postId)?.focus());
    }
  }, []);

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
    if (!menuOpenPostId && !pickerOpenPostId) return;

    const handleOutsidePointer = (event: globalThis.PointerEvent) => {
      const target = event.target as Node;
      if (menuOpenPostId && menuRef.current && !menuRef.current.contains(target)) {
        closePostMenu();
      }
      if (pickerOpenPostId && pickerRef.current && !pickerRef.current.contains(target)) {
        closeReactionPicker();
      }
    };
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (menuOpenPostId) closePostMenu(menuOpenPostId, true);
      if (pickerOpenPostId) closeReactionPicker(pickerOpenPostId, true);
    };

    document.addEventListener('pointerdown', handleOutsidePointer);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [closePostMenu, closeReactionPicker, menuOpenPostId, pickerOpenPostId]);

  const resetComposer = useCallback(() => {
    photoJobRef.current += 1;
    setComposerOpen(false);
    setComposerBody('');
    setComposerPhoto(null);
    setComposerError(null);
    composerRequestIdRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const closeComposer = useCallback(() => {
    if (composerBusy) return;
    if ((composerBody.trim() || composerPhoto) && !window.confirm('Buang draft kiriman ini?')) return;
    resetComposer();
  }, [composerBody, composerBusy, composerPhoto, resetComposer]);
  closeComposerRef.current = closeComposer;

  useLayoutEffect(() => {
    if (!composerOpen) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = composerTriggerRef.current;
    if (composerExitTimerRef.current !== null) {
      window.clearTimeout(composerExitTimerRef.current);
      composerExitTimerRef.current = null;
    }
    if (pageAriaHiddenBeforeComposerRef.current === undefined) {
      pageAriaHiddenBeforeComposerRef.current = pageRootRef.current?.getAttribute('aria-hidden') ?? null;
    }

    composerFormRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    document.body.style.overflow = 'hidden';
    pageRootRef.current?.setAttribute('aria-hidden', 'true');

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
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleComposerKeyDown);
      composerExitTimerRef.current = window.setTimeout(() => {
        const previousAriaHidden = pageAriaHiddenBeforeComposerRef.current;
        if (previousAriaHidden === null) pageRootRef.current?.removeAttribute('aria-hidden');
        else if (previousAriaHidden !== undefined) pageRootRef.current?.setAttribute('aria-hidden', previousAriaHidden);
        pageAriaHiddenBeforeComposerRef.current = undefined;
        composerExitTimerRef.current = null;
        if (trigger?.isConnected) trigger.focus();
      }, 300);
    };
  }, [composerOpen]);

  const openComposer = (openPhotoPicker = false) => {
    composerTriggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setComposerOpen(true);
    setComposerError(null);
    if (openPhotoPicker) fileInputRef.current?.click();
  };

  const removeComposerPhoto = () => {
    photoJobRef.current += 1;
    composerRequestIdRef.current = null;
    setComposerPhoto(null);
    setComposerError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePhotoSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const job = photoJobRef.current + 1;
    photoJobRef.current = job;
    composerRequestIdRef.current = null;
    setComposerError(null);
    setComposerPhoto({ dataUrl: '', status: 'processing' });

    let preview = '';
    try {
      preview = await readFileAsDataUrl(file);
      if (photoJobRef.current !== job) return;
      setComposerPhoto({ dataUrl: preview, status: 'processing' });

      const resized = await resizeCommunityPhoto(preview);
      if (photoJobRef.current !== job) return;
      if (dataUrlBytes(resized) > 6 * 1024 * 1024) {
        throw new Error('Ukuran foto masih lebih dari 6MB');
      }
      setComposerPhoto({ dataUrl: resized, status: 'ready' });
    } catch (photoError) {
      if (photoJobRef.current !== job) return;
      const message = errorMessage(photoError, 'Foto tidak dapat diproses');
      setComposerPhoto(preview ? { dataUrl: preview, status: 'error', error: message } : null);
      setComposerError(message);
    }
  };

  const handleCreatePost = async (event: FormEvent) => {
    event.preventDefault();
    const body = composerBody.trim();
    const bodyLength = Array.from(body).length;
    if (bodyLength < 1 || bodyLength > 2000 || composerBusy) return;
    if (composerPhoto && composerPhoto.status !== 'ready') {
      setComposerError(composerPhoto.error || 'Tunggu foto selesai diproses');
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
      let photoUrl: string | undefined;
      if (composerPhoto) {
        setComposerPhoto(current => current ? { ...current, status: 'uploading' } : current);
        const upload = await requestJson<never>(
          '/api/community/photo',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ image_data: composerPhoto.dataUrl, upload_id: requestId }),
            signal: controller.signal,
          },
          'Gagal mengunggah foto',
          PHOTO_UPLOAD_TIMEOUT_MS,
        );
        if (typeof upload.url !== 'string' || !upload.url) throw new Error('URL foto tidak tersedia');
        photoUrl = upload.url;
      }

      const created = await requestJson<CommunityPost>(
        '/api/community/posts',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            body,
            client_id: requestId,
            ...(photoUrl ? { photo_url: photoUrl } : {}),
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
      setComposerPhoto(current => current ? { ...current, status: 'ready', error: message } : current);
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

  const updateReaction = async (postId: string, nextReaction: ReactionType | null) => {
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

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const startLongPress = (postId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || reactionPendingRef.current.has(postId)) return;
    clearLongPressTimer();
    longPressFiredRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      longPressFiredRef.current = true;
      openReactionPicker(postId, false);
    }, 420);
  };

  const handleLikeClick = (post: CommunityPost) => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    closeReactionPicker();
    const nextReaction: ReactionType | null = post.my_reaction ? null : 'suka';
    void updateReaction(post.id, nextReaction);
  };

  const handleLikeKeyDown = (event: KeyboardEvent<HTMLButtonElement>, postId: string) => {
    if (reactionPendingRef.current.has(postId)) {
      event.preventDefault();
      return;
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    openReactionPicker(postId, true);
  };

  const handlePickerKeyDown = (event: KeyboardEvent<HTMLDivElement>, postId: string) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      closeReactionPicker(postId, true);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeReactionPicker(postId, true);
      return;
    }

    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(
      pickerRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') || [],
    );
    if (buttons.length === 0) return;

    event.preventDefault();
    const activeIndex = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : (activeIndex + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
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
    && (!composerPhoto || composerPhoto.status === 'ready');

  const composerSheet = typeof document === 'undefined' ? null : createPortal(
    <AnimatePresence>
      {composerOpen && (
        <motion.form
          ref={composerFormRef}
          key="teras-composer"
          onSubmit={handleCreatePost}
          role="dialog"
          aria-modal="true"
          aria-labelledby="teras-composer-title"
          tabIndex={-1}
          className="fixed inset-0 z-50 flex h-[100dvh] min-h-[100dvh] flex-col bg-gradient-to-b from-gray-50 to-gray-100 dark:from-slate-900 dark:to-slate-950"
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '100%' }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 backdrop-blur-md dark:border-slate-700/50 dark:bg-slate-900/95">
            <div className="mx-auto grid w-full max-w-lg grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={closeComposer}
                disabled={composerBusy}
                aria-label="Tutup buat kiriman"
                title="Tutup"
                className="flex h-9 w-9 items-center justify-center justify-self-start rounded-xl bg-gray-100 text-gray-600 transition-all active:scale-95 disabled:opacity-45 dark:bg-slate-800 dark:text-slate-300"
              >
                <X size={18} />
              </button>
              <h2 id="teras-composer-title" className="text-center text-sm font-bold text-gray-900 dark:text-white">Buat Kiriman</h2>
              <button
                type="submit"
                disabled={!composerCanSubmit}
                aria-label="Kirim kiriman"
                className="flex min-h-9 min-w-[72px] items-center justify-center justify-self-end rounded-full bg-emerald-500 px-4 py-2 text-[12px] font-extrabold text-white shadow-md shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-45 dark:bg-emerald-500 dark:shadow-emerald-950/40"
              >
                {composerBusy ? <Loader2 size={15} className="animate-spin" /> : 'KIRIM'}
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pt-4">
              <div className="flex items-center gap-3">
                <AgentAvatar name={agent.name} photo={agent.photo} />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold text-gray-900 dark:text-white">{agent.name}</p>
                  <p className="mt-0.5 text-[10px] text-gray-400 dark:text-slate-500">Tampil untuk semua agent Alhijaz</p>
                </div>
              </div>

              <textarea
                autoFocus
                value={composerBody}
                onChange={event => {
                  composerRequestIdRef.current = null;
                  setComposerBody(event.target.value);
                }}
                disabled={composerBusy}
                maxLength={2100}
                placeholder="Apa yang ingin Anda bagikan?"
                className="mt-4 min-h-[140px] w-full resize-none bg-transparent text-[17px] leading-relaxed text-gray-900 outline-none placeholder:text-gray-400 disabled:opacity-60 dark:text-white dark:placeholder:text-slate-500"
              />

              {composerBodyLength > 2000 && (
                <p className="mb-2 text-[10px] font-medium text-red-500 dark:text-red-400">Isi kiriman maksimal 2000 karakter</p>
              )}

              {composerPhoto && (
                <div className="relative mb-4 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  {composerPhoto.dataUrl ? (
                    <img src={composerPhoto.dataUrl} alt="Pratinjau foto kiriman" className="max-h-[420px] w-full object-contain" />
                  ) : (
                    <div className="flex h-48 items-center justify-center bg-gray-100 dark:bg-slate-900">
                      <Loader2 size={22} className="animate-spin text-violet-500 dark:text-violet-400" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={removeComposerPhoto}
                    disabled={composerBusy}
                    aria-label="Hapus foto"
                    title="Hapus foto"
                    className="absolute right-2 top-2 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-black/55 text-white transition-all active:scale-95 disabled:opacity-50"
                  >
                    <X size={15} />
                  </button>
                  {(composerPhoto.status === 'processing' || composerPhoto.status === 'uploading') && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/35 text-white">
                      <div className="flex items-center gap-2 rounded-full bg-black/55 px-3 py-2 text-[11px] font-semibold">
                        <Loader2 size={14} className="animate-spin" />
                        {composerPhoto.status === 'uploading' ? 'Mengunggah foto' : 'Memproses foto'}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {composerError && (
                <div role="alert" aria-live="assertive" className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-600 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
                  {composerError}
                </div>
              )}

              <div className="mt-auto pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={composerBusy}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-3.5 text-[12px] font-bold text-gray-700 shadow-sm transition-colors active:bg-gray-50 disabled:opacity-45 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:active:bg-slate-700"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400">
                    <ImageIcon size={17} />
                  </span>
                  Foto / Video
                </button>
              </div>
            </div>
          </div>
        </motion.form>
      )}
    </AnimatePresence>,
    document.body,
  );

  return (
    <>
      <div ref={pageRootRef} className="space-y-3 px-4 pb-8 pt-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handlePhotoSelection}
      />

      <section className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-2.5">
          <AgentAvatar name={agent.name} photo={agent.photo} />
          <button
            type="button"
            onClick={() => openComposer(false)}
            className="min-h-10 flex-1 rounded-full border border-gray-200 bg-gray-100 px-3.5 py-2.5 text-left text-[13px] text-gray-400 transition-colors active:bg-gray-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500 dark:active:bg-slate-950"
          >
            Apa yang ingin Anda bagikan, Bu?
          </button>
          <button
            type="button"
            onClick={() => openComposer(true)}
            aria-label="Bagikan foto"
            title="Bagikan foto"
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 transition-all active:scale-95 dark:bg-violet-900/20 dark:text-violet-400"
          >
            <ImageIcon size={18} />
          </button>
        </div>
      </section>

      {loading ? (
        <div className="space-y-3" aria-label="Memuat kiriman" aria-busy="true">
          <PostSkeleton />
          <PostSkeleton />
          <PostSkeleton />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-600 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
          <div className="flex items-start gap-2">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <p className="flex-1">{error}</p>
          </div>
          <button
            type="button"
            onClick={refreshFeed}
            className="mt-3 min-h-9 rounded-xl bg-red-500 px-4 text-xs font-bold text-white shadow-md shadow-red-500/20 transition-all active:scale-95 dark:bg-red-500 dark:shadow-red-950/40"
          >
            Coba Lagi
          </button>
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white px-5 py-9 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <Users size={36} className="mx-auto mb-3 text-gray-300 dark:text-slate-600" />
          <p className="text-sm font-semibold text-gray-600 dark:text-slate-300">Belum ada kiriman di Teras.</p>
          <p className="mt-1 text-[12px] text-gray-400 dark:text-slate-500">Jadilah yang pertama berbagi.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map(post => {
            const commentPanel = commentPanels[post.id];
            const commentsOpen = !!commentPanel?.open;
            const commentInputLength = Array.from(commentPanel?.input.trim() || '').length;
            const canDeletePost = post.is_own || agent.role === 'admin';
            const totalReactions = REACTION_TYPES.reduce((sum, reaction) => sum + post.reactions[reaction], 0);
            const reactionSummary = REACTION_TYPES
              .filter(reaction => post.reactions[reaction] > 0)
              .sort((left, right) => post.reactions[right] - post.reactions[left])
              .slice(0, 3);
            const activeReactionStyle = post.my_reaction ? REACTION_STYLES[post.my_reaction] : null;
            const ActiveReactionIcon = activeReactionStyle?.icon || ThumbsUp;
            const reactionIsBusy = reactionBusy.has(post.id);
            const shortText = !post.photo_url && Array.from(post.body).length <= 90;
            const authorName = post.author.name || (post.is_system ? 'Miqot' : 'Agent');

            return (
              <article
                key={post.id}
                className={`relative overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-slate-800 ${
                  post.is_system
                    ? 'border-emerald-500/30 dark:border-emerald-500/30'
                    : 'border-gray-100 dark:border-slate-700'
                }`}
              >
                {post.is_system && (
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-emerald-500/[0.07] to-transparent" />
                )}

                <div className="relative flex items-start gap-3 px-3.5 pt-3">
                  {post.is_system ? (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-sm shadow-emerald-500/20">
                      <Sparkles size={16} />
                    </div>
                  ) : (
                    <AgentAvatar name={authorName} photo={post.author.photo} />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-[13px] font-bold text-gray-900 dark:text-white">
                        {authorName}
                        {post.is_own && (
                          <span className="ml-1 text-[12px] font-medium text-gray-400 dark:text-slate-500">(Anda)</span>
                        )}
                      </p>
                      {post.is_system && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                          <Sparkles size={9} />
                          Sorotan
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-gray-400 dark:text-slate-500">
                      <span>{timeAgo(post.created_at)}</span>
                      <span aria-hidden="true">·</span>
                      <Globe size={10} />
                    </p>
                  </div>

                  {!post.is_system && (
                    <div
                      ref={menuOpenPostId === post.id ? menuRef : undefined}
                      className="relative shrink-0"
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
                        className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-gray-400 transition-colors active:bg-gray-100 dark:text-slate-500 dark:active:bg-slate-700"
                      >
                        <MoreHorizontal size={17} />
                      </button>

                      {menuOpenPostId === post.id && (
                        <div id={`teras-post-menu-${post.id}`} role="menu" aria-label="Menu kiriman" className="absolute right-0 top-8 z-20 w-44 overflow-hidden rounded-xl border border-gray-100 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-800">
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
                                  className="min-h-9 flex-1 rounded-lg bg-gray-100 px-2 text-[11px] font-semibold text-gray-600 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-300"
                                >
                                  Batal
                                </button>
                                <button
                                  type="button"
                                  disabled={deletingPostId === post.id}
                                  onClick={() => void deletePost(post.id)}
                                  aria-label="Konfirmasi hapus kiriman"
                                  className="flex min-h-9 flex-1 items-center justify-center rounded-lg bg-red-500 px-2 text-[11px] font-bold text-white disabled:opacity-50 dark:bg-red-500"
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
                                  className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs font-semibold text-gray-600 transition-colors active:bg-gray-50 disabled:opacity-50 dark:text-slate-300 dark:active:bg-slate-700"
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
                                  className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs font-semibold text-red-600 transition-colors active:bg-red-50 dark:text-red-400 dark:active:bg-red-900/20"
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
                </div>

                <p className={`relative whitespace-pre-wrap break-words px-3.5 pt-2 text-gray-700 dark:text-slate-300 ${
                  shortText
                    ? 'text-[17px] font-medium leading-snug text-gray-900 dark:text-white'
                    : 'text-[13px] leading-relaxed'
                }`}>
                  {post.body}
                </p>

                {post.photo_url && (
                  <img
                    src={post.photo_url}
                    alt={`Foto kiriman ${authorName}`}
                    loading="lazy"
                    className="mt-2.5 max-h-72 w-full bg-gray-100 object-cover dark:bg-slate-900"
                  />
                )}

                {(totalReactions > 0 || post.comment_count > 0) && (
                  <div className="relative flex items-center justify-between gap-3 px-3.5 py-2">
                    <div className="flex min-w-0 items-center">
                      {reactionSummary.length > 0 && (
                        <div className="mr-2 flex shrink-0 pl-1.5">
                          {reactionSummary.map(reaction => {
                            const style = REACTION_STYLES[reaction];
                            const Icon = style.icon;
                            return (
                              <span
                                key={reaction}
                                className={`-ml-1.5 flex h-[19px] w-[19px] items-center justify-center rounded-full border-2 border-white text-white dark:border-slate-800 ${style.solidClass}`}
                                title={`${style.label}: ${post.reactions[reaction]}`}
                              >
                                <Icon size={10} />
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {totalReactions > 0 && (
                        <span className="truncate text-[11px] font-medium text-gray-500 dark:text-slate-400">{socialProofLabel(post)}</span>
                      )}
                    </div>
                    {post.comment_count > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleComments(post.id)}
                        className="flex min-h-9 shrink-0 items-center rounded-lg px-2 text-[11px] font-medium text-gray-500 transition-colors active:bg-gray-50 dark:text-slate-400 dark:active:bg-slate-900"
                      >
                        {post.comment_count} komentar
                      </button>
                    )}
                  </div>
                )}

                <div className="relative mx-3.5 flex border-t border-gray-50 dark:border-slate-700/50">
                  <div
                    className="relative flex-1"
                  >
                    <button
                      ref={element => {
                        if (element) likeButtonRefs.current.set(post.id, element);
                        else likeButtonRefs.current.delete(post.id);
                      }}
                      type="button"
                      aria-disabled={reactionIsBusy}
                      aria-pressed={!!post.my_reaction}
                      aria-haspopup="menu"
                      aria-expanded={pickerOpenPostId === post.id}
                      aria-controls={`teras-reaction-picker-${post.id}`}
                      onPointerDown={event => startLongPress(post.id, event)}
                      onPointerUp={clearLongPressTimer}
                      onPointerLeave={clearLongPressTimer}
                      onPointerCancel={clearLongPressTimer}
                      onClick={() => {
                        if (!reactionIsBusy) handleLikeClick(post);
                      }}
                      onKeyDown={event => handleLikeKeyDown(event, post.id)}
                      onContextMenu={event => event.preventDefault()}
                      className={`flex min-h-10 w-full select-none touch-manipulation items-center justify-center gap-1.5 rounded-lg py-2.5 text-[12.5px] font-bold transition-colors active:bg-gray-50 dark:active:bg-slate-900 ${reactionIsBusy ? 'opacity-60' : ''} ${
                        activeReactionStyle
                          ? activeReactionStyle.textClass
                          : 'text-gray-500 dark:text-slate-400'
                      }`}
                    >
                      {reactionIsBusy
                        ? <Loader2 size={16} className="animate-spin" />
                        : <ActiveReactionIcon size={16} />}
                      {activeReactionStyle?.label || 'Suka'}
                    </button>

                    <AnimatePresence>
                      {pickerOpenPostId === post.id && (
                        <motion.div
                          ref={pickerRef}
                          id={`teras-reaction-picker-${post.id}`}
                          role="menu"
                          aria-label="Pilih reaksi"
                          onKeyDown={event => handlePickerKeyDown(event, post.id)}
                          className="absolute bottom-full left-0 z-30 mb-2 flex gap-1.5 rounded-full border border-gray-100 bg-white px-2 py-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-800"
                          initial={{ opacity: 0, scale: 0.82, y: 8 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: 5 }}
                          transition={{ duration: 0.18 }}
                          style={{ transformOrigin: 'bottom left' }}
                        >
                          {REACTION_TYPES.map(reaction => {
                            const style = REACTION_STYLES[reaction];
                            const Icon = style.icon;
                            const active = post.my_reaction === reaction;
                            return (
                              <button
                                key={reaction}
                                type="button"
                                onClick={() => {
                                  closeReactionPicker(post.id, true);
                                  void updateReaction(post.id, active ? null : reaction);
                                }}
                                role="menuitemradio"
                                aria-checked={active}
                                aria-label={active ? `Hapus reaksi ${style.label}` : `Pilih reaksi ${style.label}`}
                                title={style.label}
                                className={`flex h-[42px] w-[42px] items-center justify-center rounded-full text-white shadow-sm transition-transform active:scale-90 ${style.solidClass} ${active ? 'ring-2 ring-gray-900 ring-offset-2 dark:ring-white dark:ring-offset-slate-800' : ''}`}
                              >
                                <Icon size={19} />
                              </button>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleComments(post.id)}
                    aria-expanded={commentsOpen}
                    className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-[12.5px] font-bold transition-colors active:bg-gray-50 dark:active:bg-slate-900 ${
                      commentsOpen
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-gray-500 dark:text-slate-400'
                    }`}
                  >
                    <MessageCircle size={16} />
                    Komentari
                  </button>
                </div>

                {commentsOpen && commentPanel && (
                  <div className="px-3.5 pb-3.5">
                    {commentPanel.loading ? (
                      <CommentSkeleton />
                    ) : commentPanel.error && !commentPanel.loaded ? (
                      <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-600 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
                        <p>{commentPanel.error}</p>
                        <button
                          type="button"
                          onClick={() => void loadComments(post.id)}
                          className="mt-2 min-h-9 rounded-lg bg-red-500 px-3 font-bold text-white dark:bg-red-500"
                        >
                          Coba Lagi
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2.5 pt-2">
                          {commentPanel.comments.length === 0 ? (
                            <p className="py-2 text-center text-[11px] text-gray-400 dark:text-slate-500">Belum ada komentar.</p>
                          ) : commentPanel.comments.map(comment => {
                            const canDeleteComment = comment.is_own || agent.role === 'admin';
                            return (
                              <div key={comment.id} className="flex items-start gap-2">
                                <AgentAvatar name={comment.author.name || 'Agent'} photo={comment.author.photo} size="comment" />
                                <div className="min-w-0 flex-1">
                                  <div className="inline-block max-w-full rounded-2xl border border-gray-100 bg-gray-100 px-3 py-1.5 dark:border-slate-700/50 dark:bg-slate-900">
                                    <div className="flex items-start gap-1">
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-[11px] font-bold text-gray-800 dark:text-slate-200">{comment.author.name || 'Agent'}</p>
                                        <p className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-gray-700 dark:text-slate-300">{comment.body}</p>
                                      </div>
                                      {canDeleteComment && (
                                        <button
                                          type="button"
                                          disabled={deletingCommentId === comment.id}
                                          onClick={() => void deleteComment(post.id, comment.id)}
                                          aria-label="Hapus komentar"
                                          title="Hapus komentar"
                                          className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors active:bg-white active:text-red-500 disabled:opacity-50 dark:text-slate-500 dark:active:bg-slate-800 dark:active:text-red-400"
                                        >
                                          {deletingCommentId === comment.id
                                            ? <Loader2 size={12} className="animate-spin" />
                                            : <Trash2 size={12} />}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <p className="ml-3 mt-0.5 text-[9px] font-semibold text-gray-400 dark:text-slate-500">{timeAgo(comment.created_at)}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {commentPanel.error && (
                          <p className="mt-2 text-[10px] font-medium text-red-500 dark:text-red-400">{commentPanel.error}</p>
                        )}

                        <div className="mt-3 flex items-center gap-2">
                          <AgentAvatar name={agent.name} photo={agent.photo} size="comment" />
                          <input
                            type="text"
                            value={commentPanel.input}
                            disabled={commentPanel.sending}
                            onChange={event => updateCommentInput(post.id, event.target.value)}
                            onKeyDown={event => handleCommentKeyDown(event, post.id)}
                            aria-label="Tulis komentar"
                            placeholder="Tulis komentar..."
                            maxLength={1000}
                            className="min-h-9 min-w-0 flex-1 rounded-full border border-gray-200 bg-white px-3 py-2 text-[12px] text-gray-800 outline-none placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-emerald-500"
                          />
                          <button
                            type="button"
                            disabled={commentPanel.sending || commentInputLength < 1 || commentInputLength > 1000}
                            onClick={() => void sendComment(post.id)}
                            aria-label="Kirim komentar"
                            title="Kirim komentar"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-45 dark:bg-emerald-500 dark:shadow-emerald-950/40"
                          >
                            {commentPanel.sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                          </button>
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
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-[12px] font-bold text-gray-500 shadow-sm transition-colors active:bg-gray-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:active:bg-slate-900"
            >
              {loadingMore && <Loader2 size={15} className="animate-spin" />}
              Muat Lebih Banyak
            </button>
          )}
        </div>
      )}

      </div>

      {composerSheet}

      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            aria-live="polite"
            className="fixed bottom-6 left-1/2 z-[70] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[12px] font-semibold text-gray-700 shadow-lg dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            {toast.tone === 'success'
              ? <CheckCircle2 size={15} className="shrink-0 text-emerald-500 dark:text-emerald-400" />
              : <AlertCircle size={15} className="shrink-0 text-red-500 dark:text-red-400" />}
            <span className="truncate">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

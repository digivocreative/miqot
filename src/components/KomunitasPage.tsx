import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Flag,
  HandHeart,
  Heart,
  Image as ImageIcon,
  Lightbulb,
  Loader2,
  MessageCircle,
  MessageCircleQuestion,
  MoreHorizontal,
  PartyPopper,
  Plane,
  Send,
  Sparkles,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { handleAgentPhotoError } from '../lib/agent-photo';
import SegmentedControl, { type SegmentedOption } from './common/SegmentedControl';
import { getAuthHeaders } from './LoginPage';

type CommunityFilter = 'semua' | 'sorotan' | 'tips' | 'tanya';
type CommunityPostType = 'closing' | 'tips' | 'tanya' | 'foto' | 'sorotan';
type ComposerPostType = Exclude<CommunityPostType, 'sorotan'>;
type ReactionType = 'suka' | 'selamat' | 'aamiin';

interface CommunityAgent {
  slug: string;
  name: string;
  photo?: string | null;
  role?: string;
}

interface CommunityAuthor {
  name: string;
  slug: string;
  photo: string | null;
}

interface ReactionCounts {
  suka: number;
  selamat: number;
  aamiin: number;
}

interface CommunityPost {
  id: string;
  type: CommunityPostType;
  body: string;
  photo_url: string | null;
  is_system: boolean;
  created_at: string;
  author: CommunityAuthor;
  reactions: ReactionCounts;
  my_reactions: ReactionType[];
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
  prepared: boolean;
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

interface KomunitasPageProps {
  agent: CommunityAgent;
}

const FILTER_OPTIONS: SegmentedOption<CommunityFilter>[] = [
  { value: 'semua', label: 'Semua' },
  { value: 'sorotan', label: 'Sorotan' },
  { value: 'tips', label: 'Tips' },
  { value: 'tanya', label: 'Tanya' },
];

const COMPOSER_TYPES: Array<{
  value: ComposerPostType;
  label: string;
  icon: LucideIcon;
  activeClass: string;
}> = [
  {
    value: 'closing',
    label: 'Kabar Closing',
    icon: PartyPopper,
    activeClass: 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20',
  },
  {
    value: 'tips',
    label: 'Tips',
    icon: Lightbulb,
    activeClass: 'bg-amber-500 text-white shadow-md shadow-amber-500/20',
  },
  {
    value: 'tanya',
    label: 'Tanya Rekan',
    icon: MessageCircleQuestion,
    activeClass: 'bg-blue-500 text-white shadow-md shadow-blue-500/20',
  },
  {
    value: 'foto',
    label: 'Keberangkatan',
    icon: Plane,
    activeClass: 'bg-violet-500 text-white shadow-md shadow-violet-500/20',
  },
];

const POST_TYPE_STYLES: Record<CommunityPostType, {
  label: string;
  icon: LucideIcon;
  className: string;
}> = {
  closing: {
    label: 'Kabar Closing',
    icon: PartyPopper,
    className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
  },
  tips: {
    label: 'Tips',
    icon: Lightbulb,
    className: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
  },
  tanya: {
    label: 'Tanya Rekan',
    icon: MessageCircleQuestion,
    className: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
  },
  foto: {
    label: 'Keberangkatan',
    icon: Plane,
    className: 'bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400',
  },
  sorotan: {
    label: 'Sorotan',
    icon: Sparkles,
    className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
  },
};

const REACTION_STYLES: Record<ReactionType, {
  label: string;
  icon: LucideIcon;
  activeClass: string;
}> = {
  suka: {
    label: 'Suka',
    icon: Heart,
    activeClass: 'border-transparent bg-rose-50 text-rose-500 dark:bg-rose-900/20 dark:text-rose-400',
  },
  selamat: {
    label: 'Selamat',
    icon: PartyPopper,
    activeClass: 'border-transparent bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
  },
  aamiin: {
    label: 'Aamiin',
    icon: HandHeart,
    activeClass: 'border-transparent bg-teal-50 text-teal-600 dark:bg-teal-900/20 dark:text-teal-400',
  },
};

const REACTION_TYPES: ReactionType[] = ['suka', 'selamat', 'aamiin'];

const INPUT_CLASS = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500';

function getInitials(name: string): string {
  const words = String(name || 'Agent').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map(word => word.charAt(0)).join('').toUpperCase() || 'A';
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function requestJson<T>(
  url: string,
  init: RequestInit,
  fallbackMessage: string,
): Promise<ApiEnvelope<T>> {
  const response = await fetch(url, init);
  const rawBody = await response.text();
  let payload: ApiEnvelope<T> = {};

  try {
    const parsed: unknown = rawBody ? JSON.parse(rawBody) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid response');
    }
    payload = parsed as ApiEnvelope<T>;
  } catch {
    throw new Error(fallbackMessage);
  }

  if (!response.ok || payload.success === false || typeof payload.error === 'string') {
    throw new Error(payload.error || fallbackMessage);
  }

  return payload;
}

function timeAgo(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const elapsed = Math.max(0, Date.now() - date.getTime());
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (elapsed < minute) return 'Baru saja';
  if (elapsed < hour) return `${Math.floor(elapsed / minute)} menit lalu`;
  if (elapsed < day) return `${Math.floor(elapsed / hour)} jam lalu`;
  if (elapsed <= 7 * day) return `${Math.floor(elapsed / day)} hari lalu`;

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

      // JPEG tidak mendukung transparansi; latar putih mencegah area transparan menjadi hitam.
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

function AgentAvatar({
  name,
  photo,
  size = 'post',
  ring = false,
}: {
  name: string;
  photo?: string | null;
  size?: 'post' | 'comment';
  ring?: boolean;
}) {
  const [fallback, setFallback] = useState(!photo);

  useEffect(() => {
    setFallback(!photo);
  }, [photo]);

  const sizeClass = size === 'comment' ? 'h-7 w-7 text-[9px]' : 'h-10 w-10 text-xs';
  const imageSize = size === 'comment' ? 28 : 40;

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100 font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 ${sizeClass} ${ring ? 'ring-2 ring-pink-300 dark:ring-pink-500/70' : ''}`}
    >
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
      <div className="flex items-center gap-3 p-4">
        <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-slate-700" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-28 rounded bg-gray-200 dark:bg-slate-700" />
          <div className="h-2.5 w-40 rounded bg-gray-100 dark:bg-slate-700/70" />
        </div>
      </div>
      <div className="space-y-2 px-4 pb-4">
        <div className="h-3 w-full rounded bg-gray-100 dark:bg-slate-700/70" />
        <div className="h-3 w-5/6 rounded bg-gray-100 dark:bg-slate-700/70" />
        <div className="h-3 w-2/3 rounded bg-gray-100 dark:bg-slate-700/70" />
      </div>
      <div className="flex gap-2 border-t border-gray-50 px-3 py-3 dark:border-slate-700/50">
        <div className="h-7 w-16 rounded-full bg-gray-100 dark:bg-slate-900" />
        <div className="h-7 w-20 rounded-full bg-gray-100 dark:bg-slate-900" />
        <div className="h-7 w-16 rounded-full bg-gray-100 dark:bg-slate-900" />
      </div>
    </div>
  );
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

export default function KomunitasPage({ agent }: KomunitasPageProps) {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [feedAttempt, setFeedAttempt] = useState(0);
  const [filter, setFilter] = useState<CommunityFilter>('semua');

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerType, setComposerType] = useState<ComposerPostType>('closing');
  const [composerBody, setComposerBody] = useState('');
  const [composerPhoto, setComposerPhoto] = useState<ComposerPhoto | null>(null);
  const [composerBusy, setComposerBusy] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);

  const [openComments, setOpenComments] = useState<Record<string, CommentPanelState>>({});
  const [reactionBusy, setReactionBusy] = useState<Record<string, boolean>>({});
  const [commentBusy, setCommentBusy] = useState<Record<string, boolean>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [menuOpenPostId, setMenuOpenPostId] = useState<string | null>(null);
  const [confirmDeletePostId, setConfirmDeletePostId] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [reportingPostId, setReportingPostId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<number | null>(null);
  const photoJobRef = useRef(0);
  const feedControllerRef = useRef<AbortController | null>(null);
  const commentControllersRef = useRef<Map<string, AbortController>>(new Map());
  const activeFilterRef = useRef<CommunityFilter>('semua');
  const feedGenerationRef = useRef(0);
  const pendingCreatedPostsRef = useRef<Map<string, CommunityPost>>(new Map());
  const reactionSequenceRef = useRef(0);
  const reactionMutationsRef = useRef<Map<string, { token: number; generation: number }>>(new Map());
  const commentSequenceRef = useRef(0);
  const commentSubmissionsRef = useRef<Map<string, { token: number; generation: number }>>(new Map());
  const appliedCommentIdsRef = useRef<Set<string>>(new Set());
  const commentCountFloorsRef = useRef<Map<string, number>>(new Map());
  const postsRef = useRef<CommunityPost[]>([]);

  postsRef.current = posts;

  const showToast = useCallback((message: string, tone: ToastState['tone']) => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast({ message, tone });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2500);
  }, []);

  const changeFilter = useCallback((nextFilter: CommunityFilter) => {
    if (activeFilterRef.current === nextFilter) return;
    activeFilterRef.current = nextFilter;
    feedGenerationRef.current += 1;
    setFilter(nextFilter);
  }, []);

  const refreshFeed = useCallback(() => {
    feedGenerationRef.current += 1;
    setFeedAttempt(value => value + 1);
  }, []);

  useEffect(() => () => {
    feedGenerationRef.current += 1;
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    feedControllerRef.current?.abort();
    commentControllersRef.current.forEach(controller => controller.abort());
    commentControllersRef.current.clear();
    photoJobRef.current += 1;
  }, []);

  const fetchFeed = useCallback(async (
    selectedFilter: CommunityFilter,
    before: string | null,
    append: boolean,
    generation: number,
    signal?: AbortSignal,
  ) => {
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setLoadingMore(false);
      setFeedError(null);
    }

    try {
      const params = new URLSearchParams();
      if (selectedFilter !== 'semua') params.set('type', selectedFilter);
      if (before) params.set('before', before);
      const query = params.toString();
      const payload = await requestJson<CommunityPost[]>(
        `/api/community/feed${query ? `?${query}` : ''}`,
        { headers: getAuthHeaders(), signal },
        'Gagal memuat feed komunitas',
      );
      if (!Array.isArray(payload.data)) throw new Error('Data feed tidak valid');
      if (
        feedGenerationRef.current !== generation
        || activeFilterRef.current !== selectedFilter
      ) return;

      const reconcileCommentCount = (post: CommunityPost): CommunityPost => {
        const floor = commentCountFloorsRef.current.get(post.id);
        if (floor === undefined) return post;
        if (post.comment_count >= floor) {
          commentCountFloorsRef.current.delete(post.id);
          return post;
        }
        return { ...post, comment_count: floor };
      };
      const serverPosts = (payload.data || []).map(reconcileCommentCount);
      const serverIds = new Set(serverPosts.map(post => post.id));
      serverIds.forEach(id => pendingCreatedPostsRef.current.delete(id));
      const pendingPosts = Array.from(pendingCreatedPostsRef.current.values())
        .filter(post => selectedFilter === 'semua' || post.type === selectedFilter)
        .filter(post => !serverIds.has(post.id))
        .map(reconcileCommentCount);

      setPosts(current => {
        if (!append) return [...pendingPosts, ...serverPosts];
        const known = new Set(current.map(post => post.id));
        return [...current, ...serverPosts.filter(post => !known.has(post.id))];
      });
      setNextCursor(typeof payload.next_cursor === 'string' ? payload.next_cursor : null);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      if (
        feedGenerationRef.current !== generation
        || activeFilterRef.current !== selectedFilter
      ) return;
      const message = errorMessage(error, 'Gagal memuat feed komunitas');
      if (append) showToast(message, 'error');
      else setFeedError(message);
    } finally {
      if (
        !signal?.aborted
        && feedGenerationRef.current === generation
        && activeFilterRef.current === selectedFilter
      ) {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    }
  }, [showToast]);

  useEffect(() => {
    feedControllerRef.current?.abort();
    const controller = new AbortController();
    feedControllerRef.current = controller;
    setPosts([]);
    setNextCursor(null);
    commentControllersRef.current.forEach(commentController => commentController.abort());
    commentControllersRef.current.clear();
    setOpenComments({});
    setMenuOpenPostId(null);
    setConfirmDeletePostId(null);
    setActionErrors({});
    const generation = feedGenerationRef.current;
    void fetchFeed(filter, null, false, generation, controller.signal);

    return () => controller.abort();
  }, [feedAttempt, fetchFeed, filter]);

  useEffect(() => {
    if (!menuOpenPostId) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpenPostId(null);
        setConfirmDeletePostId(null);
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpenPostId(null);
        setConfirmDeletePostId(null);
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpenPostId]);

  const resetComposer = useCallback(() => {
    photoJobRef.current += 1;
    setComposerOpen(false);
    setComposerType('closing');
    setComposerBody('');
    setComposerPhoto(null);
    setComposerError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const removeComposerPhoto = () => {
    photoJobRef.current += 1;
    setComposerPhoto(null);
    setComposerError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePhotoSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setComposerError('Pilih foto JPEG, PNG, atau WebP');
      return;
    }

    const job = photoJobRef.current + 1;
    photoJobRef.current = job;
    setComposerError(null);
    // Block submit immediately while FileReader is still reading a replacement.
    setComposerPhoto({ dataUrl: '', status: 'processing', prepared: false });

    let preview = '';
    try {
      preview = await readFileAsDataUrl(file);
      if (photoJobRef.current !== job) return;
      setComposerPhoto({ dataUrl: preview, status: 'processing', prepared: false });

      const resized = await resizeCommunityPhoto(preview);
      if (photoJobRef.current !== job) return;
      if (dataUrlBytes(resized) > 6 * 1024 * 1024) {
        throw new Error('Ukuran foto masih lebih dari 6MB');
      }
      setComposerPhoto({ dataUrl: resized, status: 'ready', prepared: true });
    } catch (error) {
      if (photoJobRef.current !== job) return;
      const message = errorMessage(error, 'Foto tidak dapat diproses');
      setComposerPhoto(preview
        ? { dataUrl: preview, status: 'error', prepared: false, error: message }
        : null);
      setComposerError(message);
    }
  };

  const handleCreatePost = async (event: FormEvent) => {
    event.preventDefault();
    const body = composerBody.trim();
    const bodyLength = Array.from(body).length;
    if (bodyLength < 1 || bodyLength > 2000 || composerBusy) return;
    if (composerPhoto && (!composerPhoto.prepared || composerPhoto.status === 'processing')) {
      setComposerError(composerPhoto.error || 'Tunggu foto selesai diproses');
      return;
    }

    const startingFilter = activeFilterRef.current;
    const startingGeneration = feedGenerationRef.current;
    setComposerBusy(true);
    setComposerError(null);
    try {
      let photoUrl: string | undefined;
      if (composerPhoto) {
        setComposerPhoto(current => current ? { ...current, status: 'uploading', error: undefined } : current);
        const upload = await requestJson<never>(
          '/api/community/photo',
          {
            method: 'POST',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_data: composerPhoto.dataUrl }),
          },
          'Gagal mengunggah foto komunitas',
        );
        if (typeof upload.url !== 'string' || !upload.url) {
          throw new Error('URL foto tidak tersedia');
        }
        photoUrl = upload.url;
      }

      const created = await requestJson<CommunityPost>(
        '/api/community/posts',
        {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: composerType,
            body,
            ...(photoUrl ? { photo_url: photoUrl } : {}),
          }),
        },
        'Gagal membuat postingan',
      );
      if (!created.data) throw new Error('Postingan baru tidak tersedia');

      const createdPost = created.data;
      pendingCreatedPostsRef.current.set(createdPost.id, createdPost);
      const currentFilter = activeFilterRef.current;
      if (currentFilter === 'semua' || currentFilter === createdPost.type) {
        setPosts(current => [createdPost, ...current.filter(post => post.id !== createdPost.id)]);
      } else if (
        currentFilter === startingFilter
        && feedGenerationRef.current === startingGeneration
      ) {
        setPosts(current => [createdPost, ...current.filter(post => post.id !== createdPost.id)]);
        changeFilter('semua');
      }
      resetComposer();
      showToast('Kiriman berhasil dibagikan', 'success');
    } catch (error) {
      const message = errorMessage(error, 'Gagal membuat postingan');
      setComposerPhoto(current => current?.prepared
        ? { ...current, status: 'error', error: message }
        : current);
      setComposerError(message);
      showToast(message, 'error');
    } finally {
      setComposerBusy(false);
    }
  };

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    feedControllerRef.current?.abort();
    const controller = new AbortController();
    feedControllerRef.current = controller;
    await fetchFeed(
      activeFilterRef.current,
      nextCursor,
      true,
      feedGenerationRef.current,
      controller.signal,
    );
  };

  const handleReaction = async (post: CommunityPost, reaction: ReactionType) => {
    const busyKey = `${post.id}:${reaction}`;
    if (reactionBusy[busyKey]) return;

    const wasActive = post.my_reactions.includes(reaction);
    const nextActive = !wasActive;
    const token = reactionSequenceRef.current + 1;
    const generation = feedGenerationRef.current;
    reactionSequenceRef.current = token;
    reactionMutationsRef.current.set(busyKey, { token, generation });
    setReactionBusy(current => ({ ...current, [busyKey]: true }));
    setActionErrors(current => {
      const next = { ...current };
      delete next[post.id];
      return next;
    });
    setPosts(current => current.map(item => item.id !== post.id ? item : {
      ...item,
      my_reactions: nextActive
        ? [...item.my_reactions, reaction]
        : item.my_reactions.filter(value => value !== reaction),
      reactions: {
        ...item.reactions,
        [reaction]: Math.max(0, item.reactions[reaction] + (nextActive ? 1 : -1)),
      },
    }));

    try {
      await requestJson<never>(
        `/api/community/posts/${encodeURIComponent(post.id)}/reaction`,
        {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ reaction, active: nextActive }),
        },
        'Gagal memperbarui reaksi',
      );
      const currentMutation = reactionMutationsRef.current.get(busyKey);
      if (
        currentMutation?.token === token
        && feedGenerationRef.current !== generation
      ) {
        refreshFeed();
      }
    } catch (error) {
      const currentMutation = reactionMutationsRef.current.get(busyKey);
      if (
        currentMutation?.token === token
        && currentMutation.generation === generation
        && feedGenerationRef.current === generation
      ) {
        setPosts(current => current.map(item => {
          if (item.id !== post.id || item.my_reactions.includes(reaction) !== nextActive) return item;
          return {
            ...item,
            my_reactions: wasActive
              ? Array.from(new Set([...item.my_reactions, reaction]))
              : item.my_reactions.filter(value => value !== reaction),
            reactions: { ...item.reactions, [reaction]: post.reactions[reaction] },
          };
        }));
        const message = errorMessage(error, 'Gagal memperbarui reaksi');
        setActionErrors(current => ({ ...current, [post.id]: message }));
      }
    } finally {
      if (reactionMutationsRef.current.get(busyKey)?.token === token) {
        reactionMutationsRef.current.delete(busyKey);
        setReactionBusy(current => {
          const next = { ...current };
          delete next[busyKey];
          return next;
        });
      }
    }
  };

  const loadComments = async (postId: string) => {
    const generation = feedGenerationRef.current;
    commentControllersRef.current.get(postId)?.abort();
    const controller = new AbortController();
    commentControllersRef.current.set(postId, controller);
    setOpenComments(current => ({
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
      if (generation !== feedGenerationRef.current) return;
      setOpenComments(current => {
        if (!current[postId]) return current;
        const serverComments = payload.data || [];
        const serverIds = new Set(serverComments.map(comment => comment.id));
        const comments = [
          ...serverComments,
          ...current[postId].comments.filter(comment => !serverIds.has(comment.id)),
        ].sort((left, right) => (
          new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
        ));
        return {
          ...current,
          [postId]: {
            ...current[postId],
            loaded: true,
            loading: false,
            comments,
            error: null,
          },
        };
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      if (generation !== feedGenerationRef.current) return;
      setOpenComments(current => ({
        ...current,
        [postId]: {
          ...(current[postId] || emptyCommentPanel()),
          loaded: false,
          loading: false,
          error: errorMessage(error, 'Gagal memuat komentar'),
        },
      }));
    } finally {
      if (commentControllersRef.current.get(postId) === controller) {
        commentControllersRef.current.delete(postId);
      }
    }
  };

  const toggleComments = (postId: string) => {
    const current = openComments[postId];
    if (current?.open) {
      setOpenComments(all => ({ ...all, [postId]: { ...all[postId], open: false } }));
      return;
    }

    setOpenComments(all => ({
      ...all,
      [postId]: { ...(all[postId] || emptyCommentPanel()), open: true },
    }));
    if (!current?.loaded && !current?.loading) void loadComments(postId);
  };

  const updateCommentInput = (postId: string, input: string) => {
    setOpenComments(current => ({
      ...current,
      [postId]: { ...(current[postId] || emptyCommentPanel()), input, error: null },
    }));
  };

  const sendComment = async (postId: string) => {
    const panel = openComments[postId];
    const body = panel?.input.trim() || '';
    const bodyLength = Array.from(body).length;
    if (
      !panel
      || panel.sending
      || commentSubmissionsRef.current.has(postId)
      || bodyLength < 1
      || bodyLength > 1000
    ) return;

    const token = commentSequenceRef.current + 1;
    const generation = feedGenerationRef.current;
    const startingCount = postsRef.current.find(post => post.id === postId)?.comment_count ?? 0;
    commentSequenceRef.current = token;
    commentSubmissionsRef.current.set(postId, { token, generation });
    setCommentBusy(current => ({ ...current, [postId]: true }));
    setOpenComments(current => ({
      ...current,
      [postId]: { ...current[postId], sending: true, error: null },
    }));
    try {
      const created = await requestJson<CommunityComment>(
        `/api/community/posts/${encodeURIComponent(postId)}/comments`,
        {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        },
        'Gagal menambahkan komentar',
      );
      if (!created.data) throw new Error('Komentar baru tidak tersedia');

      const createdComment = created.data;
      const currentSubmission = commentSubmissionsRef.current.get(postId);
      if (currentSubmission?.token !== token) return;

      setOpenComments(current => {
        if (!current[postId]) return current;
        const alreadyPresent = current[postId].comments.some(comment => comment.id === createdComment.id);
        const sameGeneration = feedGenerationRef.current === generation;
        return {
          ...current,
          [postId]: {
            ...current[postId],
            ...(sameGeneration ? { sending: false, loaded: true, input: '' } : {}),
            comments: alreadyPresent
              ? current[postId].comments
              : [...current[postId].comments, createdComment],
          },
        };
      });

      if (!appliedCommentIdsRef.current.has(createdComment.id)) {
        appliedCommentIdsRef.current.add(createdComment.id);
        const countFloor = startingCount + 1;
        commentCountFloorsRef.current.set(
          postId,
          Math.max(commentCountFloorsRef.current.get(postId) || 0, countFloor),
        );
        setPosts(current => current.map(post => post.id === postId
          ? { ...post, comment_count: Math.max(post.comment_count, countFloor) }
          : post));
      }
    } catch (error) {
      const currentSubmission = commentSubmissionsRef.current.get(postId);
      if (
        currentSubmission?.token === token
        && currentSubmission.generation === generation
        && feedGenerationRef.current === generation
      ) {
        const message = errorMessage(error, 'Gagal menambahkan komentar');
        setOpenComments(current => ({
          ...current,
          ...(current[postId]
            ? { [postId]: { ...current[postId], sending: false, error: message } }
            : {}),
        }));
        showToast(message, 'error');
      }
    } finally {
      if (commentSubmissionsRef.current.get(postId)?.token === token) {
        commentSubmissionsRef.current.delete(postId);
        setCommentBusy(current => {
          const next = { ...current };
          delete next[postId];
          return next;
        });
      }
    }
  };

  const handleCommentKeyDown = (event: KeyboardEvent<HTMLInputElement>, postId: string) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    void sendComment(postId);
  };

  const deletePost = async (postId: string) => {
    if (deletingPostId) return;
    setDeletingPostId(postId);
    try {
      await requestJson<never>(
        `/api/community/posts/${encodeURIComponent(postId)}`,
        { method: 'DELETE', headers: getAuthHeaders() },
        'Gagal menghapus postingan',
      );
      pendingCreatedPostsRef.current.delete(postId);
      commentCountFloorsRef.current.delete(postId);
      setPosts(current => current.filter(post => post.id !== postId));
      setMenuOpenPostId(null);
      setConfirmDeletePostId(null);
      showToast('Kiriman berhasil dihapus', 'success');
    } catch (error) {
      showToast(errorMessage(error, 'Gagal menghapus postingan'), 'error');
    } finally {
      setDeletingPostId(null);
    }
  };

  const reportPost = async (postId: string) => {
    if (reportingPostId) return;
    setReportingPostId(postId);
    setMenuOpenPostId(null);
    setConfirmDeletePostId(null);
    try {
      await requestJson<never>(
        `/api/community/posts/${encodeURIComponent(postId)}/report`,
        { method: 'POST', headers: getAuthHeaders() },
        'Gagal mengirim laporan',
      );
      showToast('Laporan terkirim ke admin', 'success');
    } catch (error) {
      showToast(errorMessage(error, 'Gagal mengirim laporan'), 'error');
    } finally {
      setReportingPostId(null);
    }
  };

  const composerBodyLength = Array.from(composerBody.trim()).length;
  const composerPhotoReady = !composerPhoto || (
    composerPhoto.prepared
    && composerPhoto.status !== 'processing'
    && composerPhoto.status !== 'uploading'
  );
  const composerCanSubmit = composerBodyLength >= 1
    && composerBodyLength <= 2000
    && composerPhotoReady
    && !composerBusy;

  return (
    <div className="space-y-3 px-4 pb-8 pt-4">
      <section className="rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        {!composerOpen ? (
          <div className="flex items-center gap-3 p-3">
            <AgentAvatar name={agent.name} photo={agent.photo} />
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="min-h-[42px] min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-left text-sm text-gray-400 transition-colors hover:border-emerald-300 active:scale-[0.99] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500 dark:hover:border-emerald-700"
            >
              Bagikan kabar, tips, atau pertanyaan…
            </button>
          </div>
        ) : (
          <form onSubmit={handleCreatePost} className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-slate-300">
                Kiriman Baru
              </p>
              <button
                type="button"
                aria-label="Tutup penulisan kiriman"
                title="Tutup"
                disabled={composerBusy}
                onClick={resetComposer}
                className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                <X size={15} />
              </button>
            </div>

            <div className="mb-3 flex flex-wrap gap-1.5">
              {COMPOSER_TYPES.map(option => {
                const active = composerType === option.value;
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={composerBusy}
                    onClick={() => setComposerType(option.value)}
                    className={`flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 ${
                      active
                        ? option.activeClass
                        : 'border border-gray-200 bg-gray-50 text-gray-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                    }`}
                  >
                    <Icon size={13} strokeWidth={2.3} />
                    {option.label}
                  </button>
                );
              })}
            </div>

            <textarea
              value={composerBody}
              onChange={event => {
                setComposerBody(event.target.value);
                if (composerError && !composerPhoto?.error) setComposerError(null);
              }}
              disabled={composerBusy}
              placeholder="Tulis cerita Anda di sini…"
              className={`${INPUT_CLASS} min-h-[88px] resize-y`}
            />

            {composerBodyLength > 2000 && (
              <p className="mt-2 text-xs font-medium text-red-500 dark:text-red-400">
                Isi kiriman maksimal 2000 karakter
              </p>
            )}

            {composerError && (
              <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-red-500 dark:text-red-400">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                {composerError}
              </p>
            )}

            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handlePhotoSelection}
                />
                <button
                  type="button"
                  disabled={composerBusy || composerPhoto?.status === 'processing'}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-9 items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 text-[11px] font-bold text-gray-500 transition-all hover:border-emerald-300 hover:text-emerald-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-emerald-700 dark:hover:text-emerald-400"
                >
                  <ImageIcon size={14} />
                  Foto
                </button>

                {composerPhoto && (
                  <>
                    <div className="relative h-9 w-11 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-slate-700 dark:bg-slate-900">
                      {composerPhoto.dataUrl ? (
                        <img src={composerPhoto.dataUrl} alt="Pratinjau foto" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-gray-400 dark:text-slate-500">
                          <ImageIcon size={14} />
                        </div>
                      )}
                      {(composerPhoto.status === 'processing' || composerPhoto.status === 'uploading') && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                          <Loader2 size={14} className="animate-spin text-white" />
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label="Hapus foto"
                      title="Hapus foto"
                      disabled={composerBusy}
                      onClick={removeComposerPhoto}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                    >
                      <X size={15} />
                    </button>
                  </>
                )}
              </div>

              <button
                type="submit"
                disabled={!composerCanSubmit}
                className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 text-xs font-bold text-white shadow-md shadow-emerald-500/20 transition-all duration-200 hover:bg-emerald-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {composerBusy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                Bagikan
              </button>
            </div>
          </form>
        )}
      </section>

      <SegmentedControl
        options={FILTER_OPTIONS}
        value={filter}
        onChange={changeFilter}
        accent="emerald"
      />

      {loading ? (
        <div className="space-y-3" aria-label="Memuat kiriman" aria-busy="true">
          <PostSkeleton />
          <PostSkeleton />
          <PostSkeleton />
        </div>
      ) : feedError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-600 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
          <div className="flex items-start gap-2">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <p className="flex-1">{feedError}</p>
          </div>
          <button
            type="button"
            onClick={refreshFeed}
            className="mt-3 min-h-9 rounded-xl bg-red-500 px-4 text-xs font-bold text-white shadow-md shadow-red-500/20 transition-all hover:bg-red-600 active:scale-95 dark:bg-red-500 dark:hover:bg-red-600"
          >
            Coba Lagi
          </button>
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white px-5 py-9 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <Users size={36} className="mx-auto mb-3 text-gray-300 dark:text-slate-600" />
          <p className="text-sm font-semibold text-gray-600 dark:text-slate-300">
            Belum ada kiriman di kategori ini.
          </p>
          <p className="mt-1 text-[12px] text-gray-400 dark:text-slate-500">
            Jadilah yang pertama berbagi.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map(post => {
            const isSystem = post.type === 'sorotan';
            const typeStyle = POST_TYPE_STYLES[post.type];
            const TypeIcon = typeStyle.icon;
            const commentPanel = openComments[post.id];
            const commentIsBusy = !!commentBusy[post.id] || !!commentPanel?.sending;
            const commentInputLength = Array.from(commentPanel?.input.trim() || '').length;
            const commentsOpen = !!commentPanel?.open;
            const canDelete = post.is_own || agent.role === 'admin';

            return (
              <article
                key={post.id}
                className={`relative rounded-2xl border bg-white shadow-sm dark:bg-slate-800 ${
                  isSystem
                    ? 'border-emerald-500/30 dark:border-emerald-500/30'
                    : 'border-gray-100 dark:border-slate-700'
                }`}
              >
                {isSystem && (
                  <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-emerald-500/[0.07] to-transparent" />
                )}

                <div className="relative">
                  <div className="flex items-start gap-3 p-4 pb-3">
                    {isSystem ? (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-500/20">
                        <Sparkles size={18} />
                      </div>
                    ) : (
                      <AgentAvatar name={post.author.name} photo={post.author.photo} ring />
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-gray-800 dark:text-white">
                        {isSystem ? 'Miqot' : post.author.name}
                        {post.is_own && !isSystem && (
                          <span className="ml-1 font-medium text-gray-400 dark:text-slate-500">(Anda)</span>
                        )}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${typeStyle.className}`}>
                          <TypeIcon size={10} strokeWidth={2.4} />
                          {typeStyle.label}
                        </span>
                        <span className="text-[10px] text-gray-400 dark:text-slate-500">
                          {timeAgo(post.created_at)}
                        </span>
                      </div>
                    </div>

                    {!isSystem && (
                      <div
                        ref={menuOpenPostId === post.id ? menuRef : undefined}
                        className="relative shrink-0"
                      >
                        <button
                          type="button"
                          aria-label="Buka menu kiriman"
                          aria-haspopup="menu"
                          aria-expanded={menuOpenPostId === post.id}
                          onClick={() => {
                            setMenuOpenPostId(current => current === post.id ? null : post.id);
                            setConfirmDeletePostId(null);
                          }}
                          className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 active:scale-95 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                        >
                          <MoreHorizontal size={17} />
                        </button>

                        {menuOpenPostId === post.id && (
                          <div
                            role="menu"
                            className="absolute right-0 top-8 z-20 w-44 overflow-hidden rounded-xl border border-gray-100 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-800"
                          >
                            {confirmDeletePostId === post.id ? (
                              <div className="p-2">
                                <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">
                                  Hapus kiriman ini?
                                </p>
                                <div className="mt-2 flex gap-1.5">
                                  <button
                                    type="button"
                                    disabled={deletingPostId === post.id}
                                    onClick={() => setConfirmDeletePostId(null)}
                                    className="min-h-9 flex-1 rounded-lg bg-gray-100 px-2 text-[11px] font-semibold text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                                  >
                                    Batal
                                  </button>
                                  <button
                                    type="button"
                                    disabled={deletingPostId === post.id}
                                    onClick={() => void deletePost(post.id)}
                                    className="flex min-h-9 flex-1 items-center justify-center rounded-lg bg-red-500 px-2 text-[11px] font-bold text-white transition-colors hover:bg-red-600 disabled:opacity-50 dark:bg-red-500 dark:hover:bg-red-600"
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
                                    className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-700"
                                  >
                                    <Flag size={14} />
                                    Laporkan
                                  </button>
                                )}
                                {canDelete && (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => setConfirmDeletePostId(post.id)}
                                    className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
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

                  <p className="whitespace-pre-wrap px-4 pb-3 text-[13px] leading-relaxed text-gray-700 dark:text-slate-300">
                    {post.body}
                  </p>

                  {post.photo_url && (
                    <div className="px-4 pb-3">
                      <img
                        src={post.photo_url}
                        alt={`Foto kiriman ${isSystem ? 'Miqot' : post.author.name}`}
                        loading="lazy"
                        className="max-h-72 w-full rounded-xl bg-gray-100 object-cover dark:bg-slate-900"
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-1 border-t border-gray-50 px-3 py-2.5 dark:border-slate-700/50">
                    {REACTION_TYPES.map(reaction => {
                      const style = REACTION_STYLES[reaction];
                      const Icon = style.icon;
                      const active = post.my_reactions.includes(reaction);
                      const busy = !!reactionBusy[`${post.id}:${reaction}`];
                      return (
                        <button
                          key={reaction}
                          type="button"
                          aria-pressed={active}
                          disabled={busy}
                          onClick={() => void handleReaction(post, reaction)}
                          className={`flex min-h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition active:scale-95 disabled:cursor-wait disabled:opacity-70 ${
                            active
                              ? style.activeClass
                              : 'border-gray-200 bg-gray-50 text-gray-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                          }`}
                        >
                          <Icon size={14} fill={reaction === 'suka' && active ? 'currentColor' : 'none'} />
                          <span>{style.label}</span>
                          {post.reactions[reaction] > 0 && <span>{post.reactions[reaction]}</span>}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      aria-expanded={commentsOpen}
                      aria-label={`${post.comment_count} komentar`}
                      onClick={() => toggleComments(post.id)}
                      className={`ml-auto flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition active:scale-95 ${
                        commentsOpen
                          ? 'border-transparent bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                          : 'border-gray-200 bg-gray-50 text-gray-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                      }`}
                    >
                      <MessageCircle size={14} />
                      {post.comment_count}
                    </button>
                  </div>

                  {actionErrors[post.id] && (
                    <p className="px-4 pb-2 text-[10px] font-medium text-red-500 dark:text-red-400">
                      {actionErrors[post.id]}
                    </p>
                  )}

                  {commentsOpen && commentPanel && (
                    <div className="border-t border-gray-50 px-3 pb-3 pt-3 dark:border-slate-700/50">
                      {commentPanel.loading ? (
                        <div className="flex justify-center py-4">
                          <Loader2 size={18} className="animate-spin text-emerald-500" />
                        </div>
                      ) : commentPanel.error && !commentPanel.loaded ? (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-[11px] font-medium text-red-600 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
                          <p>{commentPanel.error}</p>
                          <button
                            type="button"
                            onClick={() => void loadComments(post.id)}
                            className="mt-2 min-h-9 rounded-lg bg-red-500 px-3 font-bold text-white transition-colors hover:bg-red-600 active:scale-95 dark:bg-red-500 dark:hover:bg-red-600"
                          >
                            Coba Lagi
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-2">
                            {commentPanel.comments.length === 0 ? (
                              <p className="py-2 text-center text-[11px] text-gray-400 dark:text-slate-500">
                                Belum ada komentar.
                              </p>
                            ) : commentPanel.comments.map(comment => (
                              <div key={comment.id} className="flex items-start gap-2">
                                <AgentAvatar
                                  name={comment.author.name}
                                  photo={comment.author.photo}
                                  size="comment"
                                />
                                <div className="min-w-0 flex-1 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                                  <div className="flex items-baseline justify-between gap-2">
                                    <p className="truncate text-[11px] font-bold text-gray-700 dark:text-slate-200">
                                      {comment.author.name}
                                      {comment.is_own && (
                                        <span className="ml-1 font-medium text-gray-400 dark:text-slate-500">(Anda)</span>
                                      )}
                                    </p>
                                    <span className="shrink-0 text-[9px] text-gray-400 dark:text-slate-500">
                                      {timeAgo(comment.created_at)}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-gray-600 dark:text-slate-300">
                                    {comment.body}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>

                          {commentPanel.error && (
                            <p className="mt-2 text-[10px] font-medium text-red-500 dark:text-red-400">
                              {commentPanel.error}
                            </p>
                          )}

                          <div className="mt-3 flex items-center gap-2">
                            <input
                              type="text"
                              value={commentPanel.input}
                              disabled={commentIsBusy}
                              aria-label="Tulis komentar"
                              placeholder="Tulis komentar…"
                              onChange={event => updateCommentInput(post.id, event.target.value)}
                              onKeyDown={event => handleCommentKeyDown(event, post.id)}
                              className={`${INPUT_CLASS} min-w-0 py-2 text-[12px]`}
                            />
                            <button
                              type="button"
                              aria-label="Kirim komentar"
                              title="Kirim komentar"
                              disabled={commentInputLength < 1 || commentInputLength > 1000 || commentIsBusy}
                              onClick={() => void sendComment(post.id)}
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-md shadow-emerald-500/20 transition-all hover:bg-emerald-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {commentIsBusy
                                ? <Loader2 size={15} className="animate-spin" />
                                : <Send size={15} />}
                            </button>
                          </div>
                          {commentInputLength > 1000 && (
                            <p className="mt-1 text-[10px] font-medium text-red-500 dark:text-red-400">
                              Isi komentar maksimal 1000 karakter
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}

          {nextCursor && (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void handleLoadMore()}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-xs font-bold text-gray-600 shadow-sm transition-all hover:border-emerald-300 hover:text-emerald-600 active:scale-[0.99] disabled:cursor-wait disabled:opacity-70 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-emerald-700 dark:hover:text-emerald-400"
            >
              {loadingMore && <Loader2 size={15} className="animate-spin" />}
              Muat Lebih Banyak
            </button>
          )}
        </div>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold text-white shadow-lg ${
            toast.tone === 'success'
              ? 'bg-emerald-600 shadow-emerald-900/20 dark:bg-emerald-500 dark:shadow-black/30'
              : 'bg-red-600 shadow-red-900/20 dark:bg-red-500 dark:shadow-black/30'
          }`}
        >
          {toast.tone === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          <span className="truncate">{toast.message}</span>
        </div>
      )}
    </div>
  );
}

import type { MentionMember } from './communityMentions';

export interface TeaserAvatar {
  name: string | null;
  photo: string | null;
}

export interface TeaserPost {
  author: TeaserAvatar;
  body_snippet: string;
  mentions: MentionMember[];
  created_at: string;
  thumb: string | null;
}

export interface TerasTeaserData {
  posts: TeaserPost[];
  today_count: number;
  recent_avatars: TeaserAvatar[];
  unread_count: number;
}

export const TERAS_TEASER_MAX_POSTS = 3;

function normalizeAvatar(value: unknown): TeaserAvatar {
  const source = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as {
    name?: unknown; photo?: unknown;
  };
  return {
    name: typeof source.name === 'string' ? source.name : null,
    photo: typeof source.photo === 'string' ? source.photo : null,
  };
}

function normalizePost(value: unknown): TeaserPost | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as {
    author?: unknown; body_snippet?: unknown; mentions?: unknown; created_at?: unknown; thumb?: unknown;
  };
  return {
    author: normalizeAvatar(source.author),
    body_snippet: typeof source.body_snippet === 'string' ? source.body_snippet : '',
    mentions: Array.isArray(source.mentions)
      ? (source.mentions as Array<{ slug?: unknown; name?: unknown }>)
        .filter(mention => typeof mention?.slug === 'string' && typeof mention?.name === 'string')
        .map(mention => ({ slug: mention.slug as string, name: mention.name as string, photo: null }))
      : [],
    created_at: typeof source.created_at === 'string' ? source.created_at : '',
    thumb: typeof source.thumb === 'string' && source.thumb ? source.thumb : null,
  };
}

/**
 * Normalisasi payload /api/community/teaser. Server baru mengirim
 * `latest_posts` (maks 3); server lama hanya `latest` — dua-duanya diterima
 * supaya urutan deploy FE/server bebas.
 */
export function normalizeTeaserData(value: unknown): TerasTeaserData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Data Jendela Teras tidak valid');
  }
  const source = value as {
    latest?: unknown; latest_posts?: unknown; today_count?: unknown;
    recent_avatars?: unknown; unread_count?: unknown;
  };
  const fromList = Array.isArray(source.latest_posts)
    ? source.latest_posts.map(normalizePost).filter((post): post is TeaserPost => post !== null)
    : [];
  const posts = (fromList.length > 0
    ? fromList
    : [normalizePost(source.latest)].filter((post): post is TeaserPost => post !== null)
  ).slice(0, TERAS_TEASER_MAX_POSTS);
  const recentAvatars = Array.isArray(source.recent_avatars)
    ? source.recent_avatars.slice(0, 3).map(normalizeAvatar)
    : [];
  return {
    posts,
    today_count: Math.max(0, Number(source.today_count) || 0),
    recent_avatars: recentAvatars,
    unread_count: Math.max(0, Number(source.unread_count) || 0),
  };
}

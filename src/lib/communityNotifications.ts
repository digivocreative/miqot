export type TerasNotificationType = 'mention' | 'comment' | 'reaction';

export interface TerasNotificationActor {
  name: string | null;
  photo?: string | null;
}

export interface TerasNotification {
  id: string;
  type: TerasNotificationType;
  post_id: string;
  comment_id: string | null;
  actor: TerasNotificationActor | null;
  actor_count: number;
  snippet: string;
  created_at: string;
  unread: boolean;
}

/**
 * The sentence shown next to the avatar. The actor name is included here (not
 * bolded separately) so the panel stays one text node per item — the bell is a
 * glanceable list, not a rich feed.
 */
export function formatNotificationText(item: TerasNotification): string {
  const actor = item.actor?.name?.trim() || 'Seseorang';
  if (item.type === 'mention') {
    return item.comment_id ? `${actor} membalas menyebutmu` : `${actor} menyebutmu`;
  }
  if (item.type === 'comment') {
    return `${actor} berkomentar di postinganmu`;
  }
  const others = Math.max(0, item.actor_count - 1);
  return others > 0
    ? `${actor} & ${others} lainnya menyukai postinganmu`
    : `${actor} menyukai postinganmu`;
}

/** Relative Indonesian timestamp; moved here from TerasPage so the bell can share it. */
export function timeAgo(iso: string): string {
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

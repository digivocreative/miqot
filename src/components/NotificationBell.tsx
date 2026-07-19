import { AtSign, Bell, Heart, MessageCircle, X } from 'lucide-react';
import { useEffect } from 'react';

import { handleAgentPhotoError } from '../lib/agent-photo';
import { formatNotificationText, timeAgo, type TerasNotification } from '../lib/communityNotifications';

const TYPE_ICON: Record<string, typeof Bell> = {
  mention: AtSign,
  comment: MessageCircle,
  reaction: Heart,
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('') || '?';
}

// Mirrors the three dark-mode toggle button contexts in DashboardLayout.tsx exactly,
// so the bell always matches its neighboring toggle:
//  - compact: sub-page header when compacted (Teras tab)      → h-8 w-8 rounded-lg, icon 14
//  - header:  sub-page header, non-compact (default)          → h-11 w-11 rounded-xl, icon 16
//  - home:    home/card-grid header                           → w-9 h-9 rounded-xl, icon 16
const SIZE_CLASSES: Record<'compact' | 'header' | 'home', { button: string; icon: number }> = {
  compact: { button: 'h-8 w-8 rounded-lg', icon: 14 },
  header: { button: 'h-11 w-11 rounded-xl', icon: 16 },
  home: { button: 'w-9 h-9 rounded-xl', icon: 16 },
};

function ActorAvatar({ name, photo }: { name: string; photo?: string | null }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-[9px] font-bold text-emerald-700 ring-1 ring-black/[0.06] dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-white/10">
      {photo ? (
        <img
          src={photo}
          alt=""
          className="h-full w-full object-cover"
          onError={event => handleAgentPhotoError(event.currentTarget, name, 28)}
        />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
    </span>
  );
}

export default function NotificationBell({
  size = 'header',
  unread,
  open,
  items,
  loading,
  error,
  onOpen,
  onClose,
  onOpenPost,
}: {
  /** Matches the neighboring dark-mode toggle's context. Defaults to 'header'
   * (the standalone sub-page header size) since that's the most common placement. */
  size?: 'compact' | 'header' | 'home';
  unread: number;
  open: boolean;
  items: TerasNotification[];
  loading: boolean;
  error: string | null;
  onOpen: () => void;
  onClose: () => void;
  onOpenPost: (postId: string) => void;
}) {
  const { button: sizeButtonClass, icon: iconSize } = SIZE_CLASSES[size];
  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => (open ? onClose() : onOpen())}
        aria-label="Notifikasi"
        aria-expanded={open}
        title="Notifikasi"
        className={`relative flex shrink-0 items-center justify-center bg-gray-100/80 text-gray-500 transition-colors hover:bg-gray-200 active:scale-95 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700 ${sizeButtonClass}`}
      >
        <Bell size={iconSize} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold leading-none text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={onClose}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="dialog"
            aria-label="Notifikasi"
            className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-gray-200 bg-white text-left shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5 dark:border-slate-800">
              <p className="text-[13px] font-bold text-gray-900 dark:text-white">Notifikasi</p>
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup"
                className="text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto overscroll-contain">
              {loading ? (
                <p className="px-4 py-6 text-center text-[12px] text-gray-400 dark:text-slate-500">Memuat…</p>
              ) : error ? (
                <p className="px-4 py-6 text-center text-[12px] text-gray-400 dark:text-slate-500">{error}</p>
              ) : items.length === 0 ? (
                <p className="px-4 py-6 text-center text-[12px] text-gray-400 dark:text-slate-500">Belum ada notifikasi.</p>
              ) : (
                items.map(item => {
                  const TypeIcon = TYPE_ICON[item.type] || Bell;
                  const actorName = item.actor?.name?.trim() || 'Seseorang';
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { onClose(); onOpenPost(item.post_id); }}
                      className={`flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/60 ${item.unread ? 'bg-emerald-50/60 dark:bg-emerald-900/15' : ''}`}
                    >
                      <span className="relative">
                        <ActorAvatar name={actorName} photo={item.actor?.photo} />
                        <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-emerald-600 ring-1 ring-gray-200 dark:bg-slate-900 dark:text-emerald-400 dark:ring-slate-700">
                          <TypeIcon size={9} strokeWidth={2.4} />
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] leading-snug text-gray-700 dark:text-slate-200">
                          {formatNotificationText(item)}
                        </span>
                        <span className="mt-0.5 block truncate text-[11.5px] text-gray-500 dark:text-slate-400">{item.snippet}</span>
                        <span className="mt-0.5 block text-[10.5px] text-gray-400 dark:text-slate-500">{timeAgo(item.created_at)}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

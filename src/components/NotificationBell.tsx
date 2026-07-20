import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AtSign, Bell, Heart, Megaphone, MessageCircle, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const PANEL_MAX_WIDTH = 320; // 20rem
const PANEL_MARGIN = 8;

/**
 * Where the floating panel sits. Anchoring to the bell alone is not enough: in the
 * home header the bell is ~96px from the screen edge (theme + logout sit to its
 * right), so a right-aligned panel of full width runs off the left edge on narrow
 * screens. The right offset is therefore clamped so both edges stay on screen.
 */
function measurePanelAnchor(button: HTMLElement | null) {
  if (!button || typeof window === 'undefined') return null;
  const rect = button.getBoundingClientRect();
  const width = Math.min(PANEL_MAX_WIDTH, window.innerWidth - PANEL_MARGIN * 2);
  const rightFromBell = window.innerWidth - rect.right;
  const right = Math.min(Math.max(PANEL_MARGIN, rightFromBell), window.innerWidth - width - PANEL_MARGIN);
  return { top: rect.bottom + PANEL_MARGIN, right, width };
}

import { handleAgentPhotoError } from '../lib/agent-photo';
import { formatNotificationText, timeAgo, type TerasNotification } from '../lib/communityNotifications';

const TYPE_ICON: Record<string, typeof Bell> = {
  mention: AtSign,
  comment: MessageCircle,
  reaction: Heart,
  broadcast: Megaphone,
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
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; right: number; width: number } | null>(null);
  // Portal target is resolved after mount so the component stays render-safe
  // wherever `document` isn't available yet.
  const [panelHost, setPanelHost] = useState<HTMLElement | null>(null);
  useEffect(() => setPanelHost(document.body), []);

  const remeasure = useCallback(() => setAnchor(measurePanelAnchor(buttonRef.current)), []);

  // Swallowing the dismissing press's click is what a full-screen overlay used to
  // do for free: without it, tapping outside closes the panel AND opens whatever
  // sat under the finger. It deliberately lives outside the open-scoped effect —
  // closing flips `open` to false immediately, and that effect's cleanup would
  // otherwise disarm the trap before the click it was armed for ever arrives.
  const armClickSwallow = useCallback(() => {
    const swallowClick = (click: MouseEvent) => {
      click.preventDefault();
      click.stopPropagation();
    };
    document.addEventListener('click', swallowClick, { capture: true, once: true });
    // A press that never becomes a click (a drag, a scroll) would leave the trap
    // armed and eat some unrelated click later, so it also expires on its own.
    window.setTimeout(() => document.removeEventListener('click', swallowClick, { capture: true }), 350);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    remeasure();
    // The header is sticky, so the bell can travel while the panel is open.
    window.addEventListener('resize', remeasure);
    window.addEventListener('scroll', remeasure, true);
    return () => {
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('scroll', remeasure, true);
    };
  }, [open, remeasure]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    // Closing on outside click uses a document listener rather than a full-screen
    // overlay element: the bell lives inside a `backdrop-blur` header, and
    // backdrop-filter makes that header the containing block for `position: fixed`
    // children — an overlay would shrink to the header strip and never catch
    // clicks in the page body. Same pattern as the post menus in TerasPage.
    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      // Clicks on the bell itself are the button's own toggle, not "outside" —
      // and the panel is portaled to <body>, so it needs its own containment check.
      if (target && (rootRef.current?.contains(target) || panelRef.current?.contains(target))) return;
      onClose();
      armClickSwallow();
    };
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('pointerdown', handleOutsidePointer);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('pointerdown', handleOutsidePointer);
    };
  }, [open, onClose, armClickSwallow]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
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

      {panelHost && createPortal(
        <AnimatePresence>
          {open && anchor && (
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-label="Notifikasi"
              // Portal ke <body>: header memakai backdrop-blur, yang menjadikannya
              // containing block bagi anak `fixed` sekaligus stacking context — di
              // dalamnya panel ikut terpotong dan bisa tertimbun pil "kiriman baru".
              // Tumbuh dari sudut tombol, bukan dari tengah, agar terbaca keluar dari bel.
              style={{
                position: 'fixed',
                top: anchor.top,
                right: anchor.right,
                width: anchor.width,
                transformOrigin: 'top right',
              }}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -8 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -8 }}
              transition={{ duration: reduceMotion ? 0.12 : 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="z-[60] overflow-hidden rounded-2xl border border-gray-200 bg-white text-left shadow-xl dark:border-slate-700 dark:bg-slate-900"
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
            </motion.div>
          )}
        </AnimatePresence>,
        panelHost,
      )}
    </div>
  );
}

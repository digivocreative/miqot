import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { SmilePlus } from 'lucide-react';
import { COMMUNITY_REACTIONS, REACTION_EMOJI, REACTION_LABEL } from '../../../lib/community-reactions.js';
import type { ReactionType } from '../../../lib/community-reactions.js';

interface ReactionPickerProps {
  myReaction: ReactionType | null;
  onPick: (reaction: ReactionType | null) => void;
  disabled?: boolean;
  size?: 'post' | 'comment';
}

export function ReactionPicker({ myReaction, onPick, disabled, size = 'comment' }: ReactionPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onDocDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const iconPx = size === 'post' ? 19 : 15;
  const active = myReaction != null;

  const handlePick = (key: ReactionType) => {
    onPick(key === myReaction ? null : key);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="Pilih reaksi"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.94 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            style={{ transformOrigin: 'bottom left' }}
            className="absolute bottom-full left-0 z-30 mb-2 flex gap-0.5 rounded-full border border-gray-200 bg-white px-2 py-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-800"
          >
            {COMMUNITY_REACTIONS.map(({ key, emoji, label }) => (
              <button
                key={key}
                type="button"
                role="menuitem"
                aria-label={label}
                title={label}
                onClick={() => handlePick(key as ReactionType)}
                className={`flex min-h-11 min-w-11 items-center justify-center rounded-full text-2xl leading-none transition-transform hover:-translate-y-1 hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
                  key === myReaction ? 'bg-emerald-500/15' : ''
                }`}
              >
                <span aria-hidden="true">{emoji}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={active ? `Reaksi kamu: ${REACTION_LABEL[myReaction]}` : 'Beri reaksi'}
        title={active ? REACTION_LABEL[myReaction] : 'Beri reaksi'}
        onClick={() => setOpen(value => !value)}
        whileTap={reduceMotion ? undefined : { scale: 0.86 }}
        transition={{ type: 'spring', stiffness: 520, damping: 26 }}
        className={`flex min-h-11 select-none touch-manipulation items-center gap-1.5 rounded-full px-2 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
          size === 'post' ? 'text-[12.5px]' : 'text-[11px]'
        } ${active ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400'}`}
      >
        {active ? (
          <span aria-hidden="true" className="leading-none" style={{ fontSize: iconPx }}>{REACTION_EMOJI[myReaction]}</span>
        ) : (
          <SmilePlus size={iconPx} />
        )}
      </motion.button>
    </div>
  );
}

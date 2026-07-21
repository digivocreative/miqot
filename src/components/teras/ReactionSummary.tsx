import { topReactionEmojis, sumReactions } from '../../../lib/community-reactions.js';
import type { ReactionCounts } from '../../../lib/community-reactions.js';

interface ReactionSummaryProps {
  counts: ReactionCounts;
  onOpenList: () => void;
  size?: 'post' | 'comment';
}

export function ReactionSummary({ counts, onOpenList, size = 'comment' }: ReactionSummaryProps) {
  const total = sumReactions(counts);
  if (total === 0) return null;
  const emojis = topReactionEmojis(counts, 3);
  const emojiPx = size === 'post' ? 15 : 13;

  return (
    <button
      type="button"
      onClick={onOpenList}
      aria-label={`${total} reaksi — lihat siapa saja`}
      className={`flex min-h-11 items-center gap-1 rounded-full px-2 font-semibold text-gray-600 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:text-slate-300 dark:hover:bg-slate-800 ${
        size === 'post' ? 'text-[12.5px]' : 'text-[11px]'
      }`}
    >
      <span aria-hidden="true" className="flex">
        {emojis.map((emoji, index) => (
          <span key={index} className="leading-none" style={{ marginLeft: index === 0 ? 0 : -4, fontSize: emojiPx }}>{emoji}</span>
        ))}
      </span>
      <span className="tabular-nums">{total}</span>
    </button>
  );
}

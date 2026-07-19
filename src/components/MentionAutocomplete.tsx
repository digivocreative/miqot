import type { MentionMember } from '../lib/communityMentions';

function Avatar({ member }: { member: MentionMember }) {
  if (member.photo) {
    return (
      <img
        src={member.photo}
        alt=""
        className="h-7 w-7 shrink-0 rounded-full object-cover"
        loading="lazy"
      />
    );
  }
  const initial = (member.name || member.slug || '?').trim().charAt(0).toUpperCase();
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
      {initial}
    </span>
  );
}

/**
 * Presentational @mention picker. Anchors to its relatively-positioned parent;
 * the owner decides placement (above the comment bar, below the composer). All
 * query/keyboard state lives in the owner — this only renders and reports clicks.
 */
export function MentionAutocomplete({
  items,
  activeIndex,
  onSelect,
  onHoverIndex,
  placement = 'bottom',
}: {
  items: MentionMember[];
  activeIndex: number;
  onSelect: (member: MentionMember) => void;
  onHoverIndex: (index: number) => void;
  placement?: 'top' | 'bottom';
}) {
  if (!items.length) return null;
  const position = placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1';
  return (
    <div
      role="listbox"
      aria-label="Sebut anggota"
      className={`absolute left-0 z-30 max-h-56 w-[min(20rem,100%)] overflow-y-auto overscroll-contain rounded-2xl border border-gray-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900 ${position}`}
    >
      {items.map((member, index) => {
        const active = index === activeIndex;
        return (
          <button
            key={member.slug}
            type="button"
            role="option"
            aria-selected={active}
            // onMouseDown (not onClick) so the textarea doesn't blur first.
            onMouseDown={event => {
              event.preventDefault();
              onSelect(member);
            }}
            onMouseEnter={() => onHoverIndex(index)}
            className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
              active ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'hover:bg-gray-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <Avatar member={member} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold text-gray-900 dark:text-white">
                {member.name}
              </span>
              <span className="block truncate text-[11.5px] text-gray-500 dark:text-slate-400">
                @{member.slug}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

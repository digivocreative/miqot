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

/** Room the picker wants: max-h-56 (224px) plus its 4px offset from the field. */
export const MENTION_PICKER_SPACE = 228;

/**
 * Pick the side the picker opens to, measured against the nearest clipping
 * boxes rather than the window: the comment bar lives inside the dashboard
 * scroller, so "there is room above" is only true within that scroller.
 * Opening into a clipped area is what cuts the list in half.
 */
export function resolveMentionPlacement(element: HTMLElement): 'top' | 'bottom' {
  const anchor = element.getBoundingClientRect();
  let clipTop = 0;
  let clipBottom = window.innerHeight;
  let node = element.parentElement;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
      const rect = node.getBoundingClientRect();
      clipTop = Math.max(clipTop, rect.top);
      clipBottom = Math.min(clipBottom, rect.bottom);
    }
    node = node.parentElement;
  }
  const above = anchor.top - clipTop;
  const below = clipBottom - anchor.bottom;
  if (above >= MENTION_PICKER_SPACE) return 'top';
  return below > above ? 'bottom' : 'top';
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
  everyone,
}: {
  items: MentionMember[];
  activeIndex: number;
  onSelect: (member: MentionMember) => void;
  onHoverIndex: (index: number) => void;
  placement?: 'top' | 'bottom';
  /**
   * Item broadcast `@semua`. Hanya diisi komposer kiriman — kolom komentar
   * membiarkannya undefined karena di sana `@semua` tidak melakukan apa pun.
   */
  everyone?: { label: string; disabled: boolean; onSelect: () => void } | null;
}) {
  if (!items.length && !everyone) return null;
  const position = placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1';
  // Ruang indeks tunggal: item @semua (bila ada) selalu di posisi 0, anggota
  // bergeser satu. Cermin dari offset yang dipakai handleMentionKeyDown di
  // TerasPage.tsx supaya sorotan keyboard dan mouse selalu sepakat.
  const memberOffset = everyone ? 1 : 0;
  return (
    <div
      role="listbox"
      aria-label="Sebut anggota"
      className={`absolute left-0 z-30 max-h-56 w-[min(20rem,100%)] overflow-y-auto overscroll-contain rounded-2xl border border-gray-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900 ${position}`}
    >
      {everyone && (() => {
        const everyoneActive = activeIndex === 0;
        return (
          <button
            type="button"
            role="option"
            aria-selected={everyoneActive}
            aria-disabled={everyone.disabled}
            onMouseDown={event => {
              event.preventDefault();
              if (!everyone.disabled) everyone.onSelect();
            }}
            onMouseEnter={() => onHoverIndex(0)}
            className={`flex w-full items-center gap-2.5 border-b border-gray-100 px-3 py-1.5 text-left transition-colors dark:border-slate-700 ${
              everyone.disabled
                ? 'opacity-50'
                : everyoneActive
                  ? 'bg-emerald-50 dark:bg-emerald-900/30'
                  : 'hover:bg-gray-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
              @
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold text-gray-900 dark:text-white">
                @semua
              </span>
              <span className="block truncate text-[11.5px] text-gray-500 dark:text-slate-400">
                beri tahu semua agent · {everyone.label}
              </span>
            </span>
          </button>
        );
      })()}
      {items.map((member, index) => {
        const active = index + memberOffset === activeIndex;
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
            onMouseEnter={() => onHoverIndex(index + memberOffset)}
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

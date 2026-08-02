import { forwardRef } from 'react';
import { toRawMentionSegments, type MentionMember } from '../lib/communityMentions';

/**
 * A `<textarea>` cannot color its own text, so to make a `@mention` look distinct
 * while typing we paint a mirror layer behind it: same font, padding and wrapping,
 * transparent text, with a tinted chip behind each mention token. The real
 * textarea (opaque text, native caret) sits on top and stays fully interactive.
 *
 * The caller supplies `className` with the SAME typography + padding as the
 * textarea so the two line up glyph-for-glyph, and places both inside a
 * `relative` container. Returns null when there's nothing to highlight.
 */
export const MentionHighlightLayer = forwardRef<
  HTMLDivElement,
  { text: string; memberBySlug: Map<string, MentionMember>; className: string }
>(function MentionHighlightLayer({ text, memberBySlug, className }, ref) {
  const segments = toRawMentionSegments(text, memberBySlug);
  if (!segments.some(segment => segment.isMention)) return null;
  return (
    <div
      ref={ref}
      aria-hidden="true"
      // `mention-mirror` menautkan lapisan ini ke aturan anti-zoom iOS di
      // src/index.css: di perangkat sentuh textarea dipaksa 16px, dan cermin
      // yang tetap di ukuran aslinya akan meleset glif demi glif.
      className={`mention-mirror pointer-events-none absolute inset-0 select-none overflow-hidden whitespace-pre-wrap break-words text-transparent ${className}`}
    >
      {segments.map((segment, index) =>
        segment.isMention ? (
          <span
            key={index}
            className="rounded-[3px] bg-emerald-500/20 [box-decoration-break:clone] dark:bg-emerald-400/25"
          >
            {segment.value}
          </span>
        ) : (
          <span key={index}>{segment.value}</span>
        ),
      )}
      {/* A trailing newline has no glyph; keep the layer's height in sync. */}
      {text.endsWith('\n') ? ' ' : null}
    </div>
  );
});

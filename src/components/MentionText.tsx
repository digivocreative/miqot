import { toMentionSegments, type MentionMember, type MentionSegment } from '../lib/communityMentions';
import { linkifySegments } from '../../lib/teras-linkify.js';
import { isModifiedClick, terasProfilePath } from '../lib/terasRoutes';

/**
 * Render a post/comment body with `@slug` tokens shown as pills of the member's
 * current display name. Falls back to the raw string when there are no mentions,
 * so callers can drop it in wherever `{body}` was rendered.
 *
 * `linkify` (opt-in, default off) additionally turns `http(s)://` URLs into
 * clickable links. Links are split out FIRST and mentions are only looked for
 * inside the resulting text segments — the mention regex allows `@` right
 * after `/`, so a URL like `https://x.com/@bagas` would otherwise be
 * misrendered as an `@bagas` mention pill if mentions ran first.
 *
 * With `onOpenProfile`, each mention pill becomes a link to the member's Teras
 * profile; without it the pill stays inert (the pre-profile behaviour), which
 * keeps every other caller of `MentionText` unaffected.
 */
function renderMentionPill(
  segment: { type: 'mention'; slug: string; name: string },
  key: number,
  onOpenProfile?: (slug: string) => void,
) {
  const className = 'font-semibold text-emerald-600 dark:text-emerald-400';
  // `@semua` bukan agent — tidak ada profil untuk dibuka.
  if (!onOpenProfile || segment.slug === 'semua') {
    return (
      <span key={key} className={className}>
        @{segment.name}
      </span>
    );
  }
  return (
    <a
      key={key}
      href={terasProfilePath(segment.slug)}
      className={`${className} hover:underline`}
      onClick={event => {
        // A click inside a post card also opens the post detail; don't let both fire.
        if (isModifiedClick(event)) return;
        event.preventDefault();
        event.stopPropagation();
        onOpenProfile(segment.slug);
      }}
    >
      @{segment.name}
    </a>
  );
}

/**
 * Shared by both the plain (`!linkify`) path and the per-text-segment pass
 * inside the `linkify` path, so the mention-pill-vs-plain-text branching
 * (and its `renderMentionPill` call) lives in exactly one place.
 */
function renderMentionSegments(segments: MentionSegment[], onOpenProfile?: (slug: string) => void) {
  return segments.map((segment, index) =>
    segment.type === 'mention' ? (
      renderMentionPill(segment, index, onOpenProfile)
    ) : (
      <span key={index}>{segment.value}</span>
    ),
  );
}

export function MentionText({
  body,
  memberBySlug,
  linkify = false,
  onOpenProfile,
}: {
  body: string;
  memberBySlug: Map<string, MentionMember>;
  linkify?: boolean;
  onOpenProfile?: (slug: string) => void;
}) {
  if (!linkify) {
    const segments = toMentionSegments(body, memberBySlug);
    if (!segments.some(segment => segment.type === 'mention')) return <>{body}</>;
    return <>{renderMentionSegments(segments, onOpenProfile)}</>;
  }

  const linkSegments = linkifySegments(body);
  return (
    <>
      {linkSegments.map((linkSegment, linkIndex) => {
        if (linkSegment.type === 'link') {
          return (
            <a
              key={linkIndex}
              href={linkSegment.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              onClick={event => event.stopPropagation()}
              className="font-medium text-emerald-600 hover:underline dark:text-emerald-400 [overflow-wrap:anywhere]"
            >
              {linkSegment.value}
            </a>
          );
        }
        const mentionSegments = toMentionSegments(linkSegment.value, memberBySlug);
        return (
          <span key={linkIndex}>
            {mentionSegments.length === 0
              ? linkSegment.value
              : renderMentionSegments(mentionSegments, onOpenProfile)}
          </span>
        );
      })}
    </>
  );
}

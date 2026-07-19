import { toMentionSegments, type MentionMember } from '../lib/communityMentions';
import { linkifySegments } from '../../lib/teras-linkify.js';

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
 */
export function MentionText({
  body,
  memberBySlug,
  linkify = false,
}: {
  body: string;
  memberBySlug: Map<string, MentionMember>;
  linkify?: boolean;
}) {
  if (!linkify) {
    const segments = toMentionSegments(body, memberBySlug);
    if (!segments.some(segment => segment.type === 'mention')) return <>{body}</>;
    return (
      <>
        {segments.map((segment, index) =>
          segment.type === 'mention' ? (
            <span
              key={index}
              className="font-semibold text-emerald-600 dark:text-emerald-400"
            >
              @{segment.name}
            </span>
          ) : (
            <span key={index}>{segment.value}</span>
          ),
        )}
      </>
    );
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
              : mentionSegments.map((segment, index) =>
                  segment.type === 'mention' ? (
                    <span
                      key={index}
                      className="font-semibold text-emerald-600 dark:text-emerald-400"
                    >
                      @{segment.name}
                    </span>
                  ) : (
                    <span key={index}>{segment.value}</span>
                  ),
                )}
          </span>
        );
      })}
    </>
  );
}

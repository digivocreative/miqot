import { toMentionSegments, type MentionMember } from '../lib/communityMentions';

/**
 * Render a post/comment body with `@slug` tokens shown as pills of the member's
 * current display name. Falls back to the raw string when there are no mentions,
 * so callers can drop it in wherever `{body}` was rendered.
 */
export function MentionText({
  body,
  memberBySlug,
}: {
  body: string;
  memberBySlug: Map<string, MentionMember>;
}) {
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

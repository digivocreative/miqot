import type { MentionMember } from '../lib/communityMentions';

/**
 * Identity card at the top of /teras/<slug>. Kept separate from TerasPage so
 * the profile chrome stays readable next to the feed logic.
 */
export function TerasProfileHeader({
  member,
  postCountLabel,
}: {
  member: MentionMember;
  postCountLabel: string | null;
}) {
  const initials = (member.name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0] || '')
    .join('')
    .toUpperCase();

  return (
    <section className="mb-3 flex items-center gap-4 border-b border-gray-100 bg-white px-4 py-5 dark:border-slate-800 dark:bg-slate-900">
      {member.photo ? (
        <img
          src={member.photo}
          alt={member.name}
          className="h-20 w-20 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xl font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          {initials}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-bold text-gray-900 dark:text-white">{member.name}</h1>
        <p className="truncate text-sm text-gray-500 dark:text-slate-400">@{member.slug}</p>
        {postCountLabel ? (
          <p className="mt-0.5 text-[13px] text-gray-400 dark:text-slate-500">{postCountLabel}</p>
        ) : null}
        {member.phone ? (
          <a
            href={`https://wa.me/${member.phone.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3.5 py-1.5 text-[13px] font-semibold text-white transition hover:bg-emerald-600"
          >
            WhatsApp
          </a>
        ) : null}
      </div>
    </section>
  );
}

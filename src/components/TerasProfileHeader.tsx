import { useEffect, useState } from 'react';

import { getAgentInitials, handleAgentPhotoError } from '../lib/agent-photo';
import type { MentionMember } from '../lib/communityMentions';
import { normalizeWaNumber } from '../utils/phone';

/**
 * Identity card at the top of /teras/<slug>. Kept separate from TerasPage so
 * the profile chrome stays readable next to the feed logic.
 *
 * `member` is null while the roster (`/api/community/members`) has not resolved
 * the slug — either because the request is still in flight, failed silently, or
 * the slug is not in the roster. The header still renders in that case, from
 * `slug` alone, so the page never looks like an agent with no identity.
 */
export function TerasProfileHeader({
  member,
  slug,
}: {
  member: MentionMember | null;
  slug: string;
}) {
  const name = member?.name || slug;
  const photo = member?.photo || null;
  // Nomor mentah di DB tidak dinormalisasi (hanya /api/auth/register yang
  // melakukannya), jadi "0812-3456-7890" harus lewat helper kanonik yang sama
  // dengan seluruh call site wa.me lainnya — sekadar membuang non-digit
  // menghasilkan tautan mati wa.me/081234567890.
  const waNumber = normalizeWaNumber(member?.phone);

  const [photoFailed, setPhotoFailed] = useState(!photo);
  useEffect(() => {
    setPhotoFailed(!photo);
  }, [photo]);

  return (
    <section
      data-teras-profile-header
      className="mb-3 flex items-center gap-4 border-b border-gray-100 bg-white px-4 py-5 dark:border-slate-800 dark:bg-slate-900"
    >
      {photo && !photoFailed ? (
        <img
          src={photo}
          alt={name}
          className="h-20 w-20 shrink-0 rounded-full object-cover"
          onError={event => handleAgentPhotoError(
            event.currentTarget,
            name,
            80,
            () => setPhotoFailed(true),
          )}
        />
      ) : (
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xl font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          <span aria-hidden="true">{getAgentInitials(name)}</span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-bold text-gray-900 dark:text-white">{name}</h1>
        <p className="truncate text-sm text-gray-500 dark:text-slate-400">@{slug}</p>
        {waNumber ? (
          <a
            href={`https://wa.me/${waNumber}`}
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

/**
 * Placeholder identitas selama roster `/api/community/members` masih jalan.
 * Bentuknya mengikuti PostSkeleton di TerasPage: blok abu animate-pulse yang
 * dimatikan saat prefers-reduced-motion.
 */
export function TerasProfileHeaderSkeleton() {
  return (
    <section
      data-teras-profile-header-skeleton
      aria-label="Memuat profil"
      aria-busy="true"
      className="mb-3 flex animate-pulse items-center gap-4 border-b border-gray-100 bg-white px-4 py-5 motion-reduce:animate-none dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="h-20 w-20 shrink-0 rounded-full bg-gray-100 dark:bg-slate-800" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-40 max-w-full rounded bg-gray-100 dark:bg-slate-800" />
        <div className="h-3 w-24 max-w-full rounded bg-gray-100 dark:bg-slate-800" />
        <div className="h-7 w-28 rounded-full bg-gray-100 dark:bg-slate-800" />
      </div>
    </section>
  );
}

import { useEffect, useState } from 'react';

import WhatsAppIcon from './bio/WhatsAppIcon';
import { getAgentInitials, handleAgentPhotoError } from '../lib/agent-photo';
import type { MentionMember } from '../lib/communityMentions';
import { normalizeWaNumber } from '../utils/phone';

/**
 * Khatam — the eight-point star formed by two crossed squares, the motif that
 * runs through mosque tilework. Drawn as a repeating stroke lattice so the
 * cover carries the community's own vernacular instead of a generic texture.
 */
function KhatamLattice() {
  return (
    <svg
      className="absolute inset-0 h-full w-full text-emerald-800/25 dark:text-emerald-300/20"
      aria-hidden="true"
    >
      <defs>
        <pattern id="teras-khatam" width="22" height="22" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="currentColor" strokeWidth="0.8">
            <rect x="5.5" y="5.5" width="11" height="11" />
            <rect x="5.5" y="5.5" width="11" height="11" transform="rotate(45 11 11)" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#teras-khatam)" />
    </svg>
  );
}

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

  const showPhoto = photo && !photoFailed;

  return (
    <section
      data-teras-profile-header
      className="mb-3 border-b border-gray-100 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Sampul = foto agent itu sendiri (diburamkan, jadi tiap profil punya
          warna khasnya sendiri tanpa aset tambahan) di bawah kisi khatam. */}
      <div className="relative h-16 overflow-hidden" aria-hidden="true">
        {showPhoto ? (
          <img
            src={photo}
            alt=""
            className="absolute inset-0 h-full w-full scale-125 object-cover opacity-60 blur-2xl dark:opacity-40"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-200 to-emerald-50 dark:from-emerald-900/50 dark:to-slate-900" />
        )}
        <KhatamLattice />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white dark:to-slate-900" />
      </div>

      {/* `relative` wajib: sampul di atas juga positioned, dan tanpa ini ia
          melukis di atas separuh avatar yang menjorok ke dalam sampul. */}
      <div className="relative px-4 pb-4">
        <div className="-mt-8 flex items-end justify-between gap-3">
          {showPhoto ? (
            <img
              src={photo}
              alt={name}
              className="h-16 w-16 shrink-0 rounded-full object-cover ring-4 ring-white dark:ring-slate-900"
              onError={event => handleAgentPhotoError(
                event.currentTarget,
                name,
                80,
                () => setPhotoFailed(true),
              )}
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-lg font-bold text-emerald-700 ring-4 ring-white dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-slate-900">
              <span aria-hidden="true">{getAgentInitials(name)}</span>
            </div>
          )}
          {waNumber ? (
            <a
              href={`https://wa.me/${waNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-1 inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
            >
              <WhatsAppIcon size={15} />
              Chat WhatsApp
            </a>
          ) : null}
        </div>
        <h1 className="mt-3 truncate text-xl font-bold tracking-tight text-gray-900 dark:text-white">{name}</h1>
        <p className="truncate text-sm text-gray-500 dark:text-slate-400">
          <span className="text-emerald-600 dark:text-emerald-400">@</span>{slug}
        </p>
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
      className="mb-3 animate-pulse border-b border-gray-100 bg-white motion-reduce:animate-none dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="h-16 bg-gray-100 dark:bg-slate-800" />
      <div className="relative px-4 pb-4">
        <div className="-mt-8 flex items-end justify-between gap-3">
          <div className="h-16 w-16 shrink-0 rounded-full bg-gray-200 ring-4 ring-white dark:bg-slate-700 dark:ring-slate-900" />
          <div className="mb-1 h-9 w-36 rounded-full bg-gray-100 dark:bg-slate-800" />
        </div>
        <div className="mt-3 h-5 w-40 max-w-full rounded bg-gray-100 dark:bg-slate-800" />
        <div className="mt-1.5 h-3.5 w-24 max-w-full rounded bg-gray-100 dark:bg-slate-800" />
      </div>
    </section>
  );
}

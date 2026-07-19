import { useEffect, useState } from 'react';

import WhatsAppIcon from './bio/WhatsAppIcon';
import { getAgentInitials, handleAgentPhotoError } from '../lib/agent-photo';
import type { MentionMember } from '../lib/communityMentions';
import { normalizeWaNumber } from '../utils/phone';

/**
 * Khatam — the eight-point star formed by two crossed squares, the motif that
 * runs through mosque tilework. The lattice carries its own gradient mask
 * (strong at the far right, dissolving toward the text) so it reads as a wash
 * over the background instead of a wallpaper strip with a hard edge.
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
        <linearGradient id="teras-khatam-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0.1" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <mask id="teras-khatam-mask">
          <rect width="100%" height="100%" fill="url(#teras-khatam-fade)" />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="url(#teras-khatam)" mask="url(#teras-khatam-mask)" />
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
      className="relative mb-3 overflow-hidden border-b border-gray-100 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Satu lembar latar di belakang seluruh baris — bukan pita sampul
          terpisah. Urutan lapis: foto agent diburamkan (warna khas per
          profil), kisi khatam yang memudar ke arah teks, lalu gradasi yang
          melebur keduanya ke permukaan kartu. */}
      <div className="absolute inset-0" aria-hidden="true">
        {showPhoto ? (
          <img
            src={photo}
            alt=""
            className="absolute inset-0 h-full w-full scale-150 object-cover opacity-50 blur-3xl dark:opacity-35"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-200/70 to-emerald-50 dark:from-emerald-900/40 dark:to-slate-900" />
        )}
        <KhatamLattice />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/35 to-white dark:from-transparent dark:via-slate-900/45 dark:to-slate-900" />
      </div>

      <div className="relative flex items-center gap-3 px-4 py-4">
        {showPhoto ? (
          <img
            src={photo}
            alt={name}
            className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-white/90 dark:ring-slate-900/90"
            onError={event => handleAgentPhotoError(
              event.currentTarget,
              name,
              80,
              () => setPhotoFailed(true),
            )}
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-base font-bold text-emerald-700 ring-2 ring-white/90 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-slate-900/90">
            <span aria-hidden="true">{getAgentInitials(name)}</span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold tracking-tight text-gray-900 dark:text-white">{name}</h1>
          <p className="truncate text-sm text-gray-500 dark:text-slate-400">
            <span className="text-emerald-600 dark:text-emerald-400">@</span>{slug}
          </p>
        </div>
        {waNumber ? (
          <a
            href={`https://wa.me/${waNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            // Teks tampil sengaja pendek; ikon WhatsApp aria-hidden, jadi nama
            // aksesibel harus menyebut salurannya (pola sama dengan call site
            // wa.me lain: StatistikPage, RahmahJuliLandingPage).
            aria-label={`Chat WhatsApp ${name}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
          >
            <WhatsAppIcon size={15} />
            Chat
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
      className="mb-3 animate-pulse border-b border-gray-100 bg-white motion-reduce:animate-none dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center gap-3 px-4 py-4">
        <div className="h-14 w-14 shrink-0 rounded-full bg-gray-200 dark:bg-slate-700" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-36 max-w-full rounded bg-gray-100 dark:bg-slate-800" />
          <div className="h-3 w-20 max-w-full rounded bg-gray-100 dark:bg-slate-800" />
        </div>
        <div className="h-9 w-32 shrink-0 rounded-full bg-gray-100 dark:bg-slate-800" />
      </div>
    </section>
  );
}

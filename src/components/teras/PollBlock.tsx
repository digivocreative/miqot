import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';

export interface CommunityPollOption {
  text: string;
  votes: number;
}

/** Polling ala Threads — payload dari server (lib/community-poll.js). */
export interface CommunityPoll {
  options: CommunityPollOption[];
  total_votes: number;
  my_vote: number | null;
  ends_at: string;
  /** Dinilai server saat serve; klien tetap cek ends_at supaya tidak basi. */
  closed: boolean;
}

/** "Berakhir dalam X" untuk polling terbuka; null bila sudah lewat/ends_at rusak. */
export function formatPollTimeLeft(endsAt: string): string | null {
  const remaining = Date.parse(endsAt) - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  const minutes = Math.ceil(remaining / 60_000);
  if (minutes < 60) return `Berakhir dalam ${minutes} mnt`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Berakhir dalam ${hours} jam`;
  return `Berakhir dalam ${Math.round(hours / 24)} hari`;
}

/**
 * Polling ala Threads di kartu kiriman. Sebelum memilih: baris opsi ber-border
 * polos. Setelah memilih ATAU polling berakhir: bar hasil (track lembut + fill
 * beranimasi) dengan persentase; pilihan sendiri diberi warna emerald + badge
 * centang, opsi terdepan ditebalkan. Selama masih terbuka, menyentuh opsi lain
 * MENGGANTI suara (tidak bisa dicabut) — baris tetap tombol; setelah berakhir
 * baris jadi statis.
 */
export default function PollBlock({
  poll,
  onVote,
}: {
  poll: CommunityPoll;
  onVote: (optionIndex: number) => void;
}) {
  const reduceMotion = useReducedMotion();
  // `closed` server bisa basi di klien yang lama terbuka — nilai waktu lokal
  // ikut menentukan supaya polling kedaluwarsa tidak tampak masih menerima suara.
  const closed = poll.closed || Date.parse(poll.ends_at) - Date.now() <= 0;
  const showResults = closed || poll.my_vote !== null;
  const timeLeft = closed ? null : formatPollTimeLeft(poll.ends_at);
  const leaderVotes = Math.max(0, ...poll.options.map(option => option.votes));

  return (
    <div data-poll className="mt-2 min-w-0">
      <div className="flex flex-col gap-1.5">
        {poll.options.map((option, index) => {
          const percent = poll.total_votes > 0
            ? Math.round((option.votes / poll.total_votes) * 100)
            : 0;
          const isMine = poll.my_vote === index;
          // "Terdepan" hanya bermakna saat sudah ada suara; saat seri semua
          // baris ber-suara-tertinggi ikut tebal (tidak memilih pemenang palsu).
          const isLeader = showResults && poll.total_votes > 0 && option.votes === leaderVotes;

          if (!showResults) {
            // Belum memilih & masih terbuka: baris ajakan — border kapsul,
            // teks emerald sebagai sinyal bisa disentuh.
            return (
              <button
                key={index}
                type="button"
                data-poll-option
                aria-pressed={false}
                onClick={() => onVote(index)}
                className="flex min-h-11 w-full items-center rounded-xl border border-emerald-500/45 px-3.5 text-left text-[13.5px] font-bold text-emerald-700 transition-colors hover:border-emerald-500 hover:bg-emerald-50/70 active:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:border-emerald-400/40 dark:text-emerald-300 dark:hover:border-emerald-400/70 dark:hover:bg-emerald-500/10 dark:active:bg-emerald-500/15"
              >
                <span className="min-w-0 truncate">{option.text}</span>
              </button>
            );
          }

          const rowContent = (
            <>
              <motion.span
                aria-hidden="true"
                data-poll-bar
                className={`absolute inset-y-0 left-0 rounded-xl ${
                  isMine
                    ? 'bg-gradient-to-r from-emerald-400/45 to-emerald-400/25 dark:from-emerald-500/40 dark:to-emerald-500/20'
                    : 'bg-gray-200/80 dark:bg-slate-700/60'
                }`}
                initial={reduceMotion ? false : { width: 0 }}
                animate={{ width: `${percent}%` }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              />
              <span className="relative flex min-w-0 flex-1 items-center gap-1.5 py-2.5 pl-3.5 text-left">
                <span className={`min-w-0 truncate text-[13.5px] ${isLeader ? 'font-bold' : 'font-medium'} text-gray-800 dark:text-slate-100`}>
                  {option.text}
                </span>
                {isMine && (
                  <span className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white dark:bg-emerald-400 dark:text-slate-900">
                    <Check size={10} strokeWidth={3.5} />
                  </span>
                )}
              </span>
              <span
                className={`relative shrink-0 py-2.5 pl-2 pr-3.5 text-[13px] tabular-nums ${
                  isLeader
                    ? 'font-bold text-gray-900 dark:text-white'
                    : 'font-semibold text-gray-500 dark:text-slate-400'
                }`}
              >
                {percent}%
              </span>
            </>
          );
          const rowClass = 'relative flex min-h-11 w-full items-center overflow-hidden rounded-xl bg-gray-100/55 dark:bg-slate-800/45';

          // Berakhir: baris statis (bukan tombol) supaya tidak ada kontrol
          // yang terlihat aktif tapi diam saat disentuh.
          if (closed) {
            return (
              <div key={index} data-poll-option className={rowClass}>
                {rowContent}
              </div>
            );
          }
          // Sudah memilih tapi masih terbuka: baris hasil tetap tombol —
          // menyentuh opsi lain memindahkan suara.
          return (
            <button
              key={index}
              type="button"
              data-poll-option
              aria-pressed={isMine}
              onClick={() => onVote(index)}
              className={`${rowClass} transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
                isMine ? '' : 'hover:shadow-[inset_0_0_0_1px_rgba(16,185,129,0.35)]'
              }`}
            >
              {rowContent}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] font-medium text-gray-500 dark:text-slate-400">
        {poll.total_votes} suara · {closed ? 'Polling berakhir' : timeLeft}
      </p>
    </div>
  );
}

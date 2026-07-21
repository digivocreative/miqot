import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Heart, Loader2, MessageCircle, RefreshCw, Trash2 } from 'lucide-react';
import type { CommunityComment, ReactionType } from '../TerasPage';
import { AgentAvatar } from './AgentAvatar';
import { canDeleteCommunityEntry } from '../../lib/communityAccess';
import { isModifiedClick, terasProfilePath } from '../../lib/terasRoutes';

interface CommentThreadProps {
  comments: CommunityComment[];
  /** Reaksi saya per id komentar. */
  myReactions: Record<string, ReactionType | null>;
  /** Jumlah reaksi per id komentar. */
  reactionCounts: Record<string, number>;
  onReact: (commentId: string, reaction: ReactionType | null) => void;
  onQuote: (commentId: string) => void;
  onDelete: (commentId: string) => void;
  onOpenThread: (commentId: string) => void;
  renderBody: (comment: CommunityComment) => ReactNode;
  renderMedia: (comment: CommunityComment) => ReactNode;
  formatTime: (iso: string) => string;
  /** Agent yang sedang login — dipakai canDeleteCommunityEntry untuk memutuskan tombol hapus. */
  agent: { role?: string | null } | null;
  /** Id komentar yang sedang diproses hapus, untuk spinner tombol. */
  deletingCommentId: string | null;
  /** Buka profil penulis komentar (klik avatar/nama). */
  onOpenProfile: (slug: string) => void;
  /**
   * Mode profil publik (?agent=slug) sedang aktif. Komposer tidak bisa
   * dibuka dari sana (lihat guard `if (profileSlug) return` di
   * openQuoteComposerForComment, TerasPage.tsx), jadi tombol Kutip
   * disembunyikan di sini supaya tidak ada kontrol yang terlihat aktif
   * tapi diam kalau diklik.
   */
  profileSlug?: string | null;
}

interface CommentRowActions {
  myReaction: ReactionType | null;
  reactionCount: number;
  replyCount: number;
  onReact: (reaction: ReactionType | null) => void;
  onQuote: () => void;
}

/**
 * Render presentasional murni untuk daftar komentar sebuah kiriman. Tidak
 * memegang state fetch maupun memanggil API — semua data & aksi masuk lewat
 * props dari TerasPage.
 */
export default function CommentThread({
  comments,
  myReactions,
  reactionCounts,
  onReact,
  onQuote,
  onDelete,
  onOpenThread,
  renderBody,
  renderMedia,
  formatTime,
  agent,
  deletingCommentId,
  onOpenProfile,
  profileSlug,
}: CommentThreadProps) {
  const reduceMotion = useReducedMotion();
  const hideQuote = !!profileSlug;

  return (
    <>
      {comments.map(comment => {
        const previewReplies = comment.preview_replies ?? [];
        const replyCount = comment.reply_count ?? 0;
        // Jatah cuplikan balasan bersifat global lintas induk di server, jadi
        // reply_count > 0 dengan preview_replies kosong itu MUNGKIN terjadi.
        // Tautan "Lihat N balasan lainnya" dihitung dari selisih keduanya,
        // bukan dari panjang preview_replies saja.
        const remaining = replyCount - previewReplies.length;

        return (
          <CommentRow
            key={comment.id}
            comment={comment}
            agent={agent}
            deletingCommentId={deletingCommentId}
            onDelete={onDelete}
            onOpenProfile={onOpenProfile}
            renderBody={renderBody}
            renderMedia={renderMedia}
            formatTime={formatTime}
            reduceMotion={!!reduceMotion}
            // Klik baris membuka halaman thread — HANYA komentar tingkat
            // teratas (lihat komentar di atas CommentRow soal cuplikan
            // tingkat dua yang sengaja dikecualikan).
            onOpenThreadRow={() => onOpenThread(comment.id)}
            isTopLevel
            showRail={previewReplies.length > 0}
            hideQuote={hideQuote}
            actions={{
              myReaction: myReactions[comment.id] ?? null,
              reactionCount: reactionCounts[comment.id] ?? 0,
              replyCount,
              onReact: reaction => onReact(comment.id, reaction),
              onQuote: () => onQuote(comment.id),
            }}
          >
            {previewReplies.map(reply => (
              <CommentRow
                key={reply.id}
                comment={reply}
                agent={agent}
                deletingCommentId={deletingCommentId}
                onDelete={onDelete}
                onOpenProfile={onOpenProfile}
                renderBody={renderBody}
                renderMedia={renderMedia}
                formatTime={formatTime}
                reduceMotion={!!reduceMotion}
                isTopLevel={false}
                showRail={false}
                // Sengaja TIDAK diberi onOpenThreadRow: cuplikan balasan
                // tingkat dua tidak dapat perilaku klik-untuk-buka-thread
                // (indentasi berhenti di situ, lihat spec keputusan produk #3).
              />
            ))}
            {remaining > 0 && (
              <button
                type="button"
                onClick={() => onOpenThread(comment.id)}
                className="mt-1 min-h-11 px-0.5 text-left text-[12px] font-semibold text-gray-500 transition-colors hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:text-slate-400 dark:hover:text-emerald-400"
              >
                Lihat {remaining} balasan lainnya
              </button>
            )}
          </CommentRow>
        );
      })}
    </>
  );
}

function CommentRow({
  comment,
  agent,
  deletingCommentId,
  onDelete,
  onOpenProfile,
  renderBody,
  renderMedia,
  formatTime,
  reduceMotion,
  actions,
  onOpenThreadRow,
  isTopLevel,
  showRail,
  hideQuote,
  children,
}: {
  comment: CommunityComment;
  agent: { role?: string | null } | null;
  deletingCommentId: string | null;
  onDelete: (commentId: string) => void;
  onOpenProfile: (slug: string) => void;
  renderBody: (comment: CommunityComment) => ReactNode;
  renderMedia: (comment: CommunityComment) => ReactNode;
  formatTime: (iso: string) => string;
  reduceMotion: boolean;
  /** Hanya diisi untuk komentar tingkat teratas — cuplikan balasan tidak punya baris aksi sendiri. */
  actions?: CommentRowActions;
  /**
   * Buka halaman thread komentar ini lewat klik di mana pun pada baris
   * (kecuali tombol/tautan/media). Hanya diisi untuk komentar tingkat
   * teratas — lihat pemanggilan CommentRow di CommentThread di atas.
   */
  onOpenThreadRow?: () => void;
  /** True untuk komentar tingkat teratas: dapat pemisah hairline; balasan nested tidak. */
  isTopLevel: boolean;
  /** Render rail grup vertikal di kolom avatar — hanya bila komentar punya balasan nested tampil. */
  showRail: boolean;
  /** Sembunyikan tombol Kutip (mode profil publik — komposer tidak bisa dibuka dari sana). */
  hideQuote?: boolean;
  /** Cuplikan balasan + tautan "lihat lainnya", dirender di bawah baris aksi (indentasi satu tingkat lewat nesting grid). */
  children?: ReactNode;
}) {
  const canDeleteComment = canDeleteCommunityEntry(agent, comment);
  const commentAuthorName = comment.author.name || 'Agent';
  const commentAuthorSlug = comment.author.slug;

  // Meniru pola likePopId di TerasPage.tsx (handleLikeClick): burst + pop
  // hanya saat reaksi BERUBAH jadi suka, bukan saat melepasnya. Lokal di
  // baris ini (bukan diangkat ke TerasPage) karena murni state animasi UI,
  // bukan data.
  const [justLiked, setJustLiked] = useState(false);
  const handleReactClick = () => {
    if (!actions) return;
    const nextReaction: ReactionType | null = actions.myReaction ? null : 'suka';
    setJustLiked(!!nextReaction);
    actions.onReact(nextReaction);
  };
  const likePopped = justLiked && !!actions?.myReaction && !reduceMotion;

  // Pola yang sama dengan handlePostAreaClick di TerasPage.tsx: kecualikan
  // klik pada tombol/tautan/media/menu, dan biarkan seleksi teks lewat tanpa
  // membuka thread. Tidak membuat mekanisme baru -- disalin persis, hanya
  // targetnya baris komentar bukan baris kiriman.
  const handleRowClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!onOpenThreadRow) return;
    const target = event.target;
    if (target instanceof Element && target.closest('button, a, video, input, textarea, [role="menu"], [data-media-layout]')) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    onOpenThreadRow();
  };
  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onOpenThreadRow) return;
    if (event.key !== 'Enter' || event.target !== event.currentTarget) return;
    event.preventDefault();
    onOpenThreadRow();
  };

  return (
    <div
      data-comment-row
      role={onOpenThreadRow ? 'link' : undefined}
      tabIndex={onOpenThreadRow ? 0 : undefined}
      aria-label={onOpenThreadRow ? `Buka balasan ${commentAuthorName}` : undefined}
      onClick={onOpenThreadRow ? handleRowClick : undefined}
      onKeyDown={onOpenThreadRow ? handleRowKeyDown : undefined}
      className={`grid grid-cols-[40px_minmax(0,1fr)] gap-x-3 ${
        // -mx-4 px-4: garis pemisah komentar teratas full-bleed (mepet tepi
        // kartu), isi tetap ber-padding. Balasan nested tak pakai pemisah.
        isTopLevel ? '-mx-4 border-t border-gray-100 px-4 pt-3 dark:border-slate-800' : 'mt-2'
      } ${
        onOpenThreadRow ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/50' : ''
      }`}
    >
      <div className="flex flex-col items-center">
        {commentAuthorSlug ? (
          <a
            href={terasProfilePath(commentAuthorSlug)}
            onClick={event => {
              if (isModifiedClick(event)) return;
              event.preventDefault();
              event.stopPropagation();
              onOpenProfile(commentAuthorSlug);
            }}
            aria-label={`Lihat profil ${commentAuthorName}`}
          >
            <AgentAvatar name={commentAuthorName} photo={comment.author.photo} size="post" />
          </a>
        ) : (
          <AgentAvatar name={commentAuthorName} photo={comment.author.photo} size="post" />
        )}
        {showRail && (
          <div data-thread-rail="comment" aria-hidden="true" className="mt-1.5 w-px flex-1 bg-gray-200 dark:bg-slate-700" />
        )}
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          {commentAuthorSlug ? (
            <a
              href={terasProfilePath(commentAuthorSlug)}
              onClick={event => {
                if (isModifiedClick(event)) return;
                event.preventDefault();
                event.stopPropagation();
                onOpenProfile(commentAuthorSlug);
              }}
              className="min-w-0 truncate text-[14px] font-bold text-gray-800 hover:underline dark:text-slate-200"
            >
              {commentAuthorName}
            </a>
          ) : (
            <p className="min-w-0 truncate text-[14px] font-bold text-gray-800 dark:text-slate-200">{commentAuthorName}</p>
          )}
          <span className="flex-1" />
          <time dateTime={comment.created_at} className="shrink-0 text-[12px] font-medium text-gray-500 dark:text-slate-400">
            {formatTime(comment.created_at)}
          </time>
          {canDeleteComment && (
            <button
              type="button"
              disabled={deletingCommentId === comment.id}
              onClick={() => onDelete(comment.id)}
              aria-label="Hapus komentar"
              title="Hapus komentar"
              className="-my-3 -mr-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center text-gray-500 transition-colors hover:text-red-500 active:text-red-500 disabled:opacity-50 dark:text-slate-400 dark:hover:text-red-400 dark:active:text-red-400"
            >
              {deletingCommentId === comment.id
                ? <Loader2 size={13} className="animate-spin" />
                : <Trash2 size={13} />}
            </button>
          )}
        </div>

        {renderBody(comment)}
        {renderMedia(comment)}

        {actions && (
          <div className="relative -ml-2 mt-1 flex items-center gap-1">
            <motion.button
              type="button"
              aria-pressed={!!actions.myReaction}
              aria-label="Suka komentar"
              title="Suka"
              onClick={handleReactClick}
              whileTap={reduceMotion ? undefined : { scale: 0.86 }}
              transition={{ type: 'spring', stiffness: 520, damping: 26 }}
              className={`flex min-h-11 select-none touch-manipulation items-center gap-1.5 rounded-full px-2 text-[12.5px] font-semibold transition-colors hover:text-rose-500 active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50 dark:hover:text-rose-400 dark:active:bg-slate-900 ${
                actions.myReaction ? 'text-rose-500 dark:text-rose-400' : 'text-gray-500 dark:text-slate-400'
              }`}
            >
              <span className="relative flex items-center justify-center">
                {likePopped && (
                  <motion.span
                    aria-hidden="true"
                    className="absolute -inset-1 rounded-full bg-rose-500/30"
                    initial={{ scale: 0.3, opacity: 0.8 }}
                    animate={{ scale: 1.9, opacity: 0 }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                )}
                <motion.span
                  key={likePopped ? 'liked-pop' : 'idle'}
                  className="flex"
                  initial={likePopped ? { scale: 0 } : false}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 560, damping: 14 }}
                >
                  <Heart size={19} fill={actions.myReaction ? 'currentColor' : 'none'} />
                </motion.span>
              </span>
              <AnimatePresence mode="popLayout" initial={false}>
                {actions.reactionCount > 0 && (
                  <motion.span
                    key={actions.reactionCount}
                    className="tabular-nums"
                    initial={reduceMotion ? false : { y: 9, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={reduceMotion ? { opacity: 0 } : { y: -9, opacity: 0 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                  >
                    {actions.reactionCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>

            {/* Ikon balas membuka HALAMAN komentar ini (ala Threads) — balasan
                ditulis dari sana, bukan lewat kolom balas inline. */}
            <motion.button
              type="button"
              aria-label="Buka balasan"
              title="Balas"
              onClick={() => onOpenThreadRow?.()}
              whileTap={reduceMotion ? undefined : { scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 520, damping: 26 }}
              className="flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[12.5px] font-semibold text-gray-500 transition-colors hover:text-emerald-600 active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:text-slate-400 dark:hover:text-emerald-400 dark:active:bg-slate-900"
            >
              <MessageCircle size={19} />
              {actions.replyCount > 0 && <span className="tabular-nums">{actions.replyCount}</span>}
            </motion.button>

            {!hideQuote && (
              <motion.button
                type="button"
                aria-label="Kutip komentar"
                title="Kutip"
                onClick={actions.onQuote}
                whileTap={reduceMotion ? undefined : { scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 520, damping: 26 }}
                className="flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[12.5px] font-semibold text-gray-500 transition-colors hover:text-emerald-600 active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:text-slate-400 dark:hover:text-emerald-400 dark:active:bg-slate-900"
              >
                <RefreshCw size={19} />
              </motion.button>
            )}
          </div>
        )}

        {children}
      </div>
    </div>
  );
}

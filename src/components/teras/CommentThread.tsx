import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Heart, Loader2, MessageCircle, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import type { CommunityComment, ReactionType, ReplyExpansionStatus } from '../TerasPage';
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
  /** Buka sheet balasan (ala Threads) untuk komentar ini — tanpa pindah halaman. */
  onReply: (commentId: string) => void;
  onDelete: (commentId: string) => void;
  /**
   * Simpan edit body komentar. `null` = sukses (state komentar sudah
   * dipatch pemanggil lewat patchEntryBody di TerasPage); string = pesan
   * galat untuk ditampilkan inline di editor baris ini.
   */
  onEditSave: (commentId: string, body: string) => Promise<string | null>;
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
  /**
   * Feed: sambung post -> komposer -> komentar sebagai satu utas lewat rail
   * vertikal di kolom avatar, dan buang pemisah hairline full-bleed antar
   * komentar tingkat-teratas (dulu terbaca sebagai "post baru"). Detail view
   * membiarkannya false: pemisah hairline dipertahankan seperti sebelumnya.
   */
  railConnected?: boolean;
  /**
   * Status expand balasan inline per id komentar top-level. Tak-hadir = tertutup
   * (cuplikan 2-terbaru + tautan "Lihat N balasan lainnya"). Saat 'expanded',
   * `preview_replies` komentar sudah berisi SEMUA balasan dan tautannya berubah
   * jadi "Sembunyikan balasan". Lihat toggleReplyExpansion di TerasPage.
   */
  replyExpansions?: Record<string, ReplyExpansionStatus>;
  /** Buka/tutup expand balasan inline sebuah komentar top-level. */
  onToggleReplies?: (commentId: string) => void;
}

// Sinkron dengan MAX_COMMUNITY_COMMENT_CHARS di TerasPage.tsx (batas komentar).
const MAX_COMMENT_EDIT_CHARS = 300;

interface CommentRowActions {
  myReaction: ReactionType | null;
  reactionCount: number;
  replyCount: number;
  onReact: (reaction: ReactionType | null) => void;
  onQuote: () => void;
  onReply: () => void;
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
  onReply,
  onDelete,
  onEditSave,
  onOpenThread,
  renderBody,
  renderMedia,
  formatTime,
  agent,
  deletingCommentId,
  onOpenProfile,
  profileSlug,
  railConnected = false,
  replyExpansions,
  onToggleReplies,
}: CommentThreadProps) {
  const reduceMotion = useReducedMotion();
  const hideQuote = !!profileSlug;

  return (
    <>
      {comments.map((comment, commentIndex) => {
        const previewReplies = comment.preview_replies ?? [];
        const replyCount = comment.reply_count ?? 0;
        // railConnected (feed): rail menyambung terus ke grup komentar
        // berikutnya, jadi baris terakhir sebuah grup tetap dapat rail selama
        // masih ada grup sesudahnya.
        const hasNextGroup = railConnected && commentIndex < comments.length - 1;
        // Expand balasan inline (menggantikan navigasi lama ke halaman utas).
        // Saat 'expanded', previewReplies sudah memuat SEMUA balasan.
        const canToggleReplies = !!onToggleReplies;
        const expansion = replyExpansions?.[comment.id];
        const expanded = expansion === 'expanded';
        // Ala Threads: saat TERTUTUP tak ada cuplikan balasan inline — hanya satu
        // tombol "Lihat N balasan" (N = TOTAL). Balasan baru dirender ketika utas
        // dibuka (expanded). renderedReplies menggantikan previewReplies di semua
        // titik render supaya rail vertikal ikut menyambung HANYA ke baris yang
        // benar-benar tampil (tanpa ini rail bisa menjulur ke balasan tak-terlihat
        // kalau server masih mengirim cuplikan). Fallback tanpa toggle: tampilkan
        // apa adanya supaya balasan tak tersembunyi tanpa jalan keluar.
        const renderedReplies = expanded || !canToggleReplies ? previewReplies : [];
        const showRepliesToggle = canToggleReplies
          ? expanded || expansion === 'loading' || expansion === 'error' || replyCount > 0
          : replyCount > 0;

        return (
          <div key={comment.id}>
            <CommentRow
              comment={comment}
              agent={agent}
              deletingCommentId={deletingCommentId}
              onDelete={onDelete}
              onEditSave={onEditSave}
              onOpenProfile={onOpenProfile}
              renderBody={renderBody}
              renderMedia={renderMedia}
              formatTime={formatTime}
              reduceMotion={!!reduceMotion}
              // Klik baris membuka halaman thread — HANYA komentar tingkat teratas.
              onOpenThreadRow={() => onOpenThread(comment.id)}
              isTopLevel
              railConnected={railConnected}
              railBelow={renderedReplies.length > 0 || hasNextGroup}
              hideQuote={hideQuote}
              actions={{
                myReaction: myReactions[comment.id] ?? null,
                reactionCount: reactionCounts[comment.id] ?? 0,
                replyCount,
                onReact: reaction => onReact(comment.id, reaction),
                onQuote: () => onQuote(comment.id),
                onReply: () => onReply(comment.id),
              }}
            />
            {/* Balasan bertingkat ala Threads: baris SEJAJAR (avatar 40px di
                kolom yang sama dengan induk), disambung rail vertikal di kolom
                avatar (railBelow menyambung ke baris berikutnya dalam thread).
                data-thread-rail="comment" hanya muncul saat ADA balasan —
                komentar datar tetap tanpa rail. Balasan juga dapat baris aksi
                (reaksi/balas/kutip) & klik-buka-thread, sama seperti induk.
                renderedReplies kosong saat utas tertutup (ala Threads). */}
            {renderedReplies.map((reply, index) => (
              <CommentRow
                key={reply.id}
                comment={reply}
                agent={agent}
                deletingCommentId={deletingCommentId}
                onDelete={onDelete}
                onEditSave={onEditSave}
                onOpenProfile={onOpenProfile}
                renderBody={renderBody}
                renderMedia={renderMedia}
                formatTime={formatTime}
                reduceMotion={!!reduceMotion}
                isTopLevel={false}
                railConnected={railConnected}
                railBelow={index < renderedReplies.length - 1 || hasNextGroup}
                onOpenThreadRow={() => onOpenThread(reply.id)}
                hideQuote={hideQuote}
                actions={{
                  myReaction: myReactions[reply.id] ?? null,
                  reactionCount: reactionCounts[reply.id] ?? 0,
                  replyCount: reply.reply_count ?? 0,
                  onReact: reaction => onReact(reply.id, reaction),
                  onQuote: () => onQuote(reply.id),
                  onReply: () => onReply(reply.id),
                }}
              />
            ))}
            {showRepliesToggle && (
              <button
                type="button"
                disabled={expansion === 'loading'}
                onClick={() => (canToggleReplies ? onToggleReplies?.(comment.id) : onOpenThread(comment.id))}
                aria-expanded={canToggleReplies ? expanded : undefined}
                className="ml-[52px] mt-1 flex min-h-11 items-center gap-1.5 text-left text-[12px] font-semibold text-gray-500 transition-colors hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:opacity-60 dark:text-slate-400 dark:hover:text-emerald-400"
              >
                {expansion === 'loading' && <Loader2 size={13} className="animate-spin" />}
                {expansion === 'loading'
                  ? 'Memuat balasan…'
                  : expansion === 'error'
                    ? 'Gagal memuat balasan — coba lagi'
                    : expanded
                      ? 'Sembunyikan balasan'
                      : `Lihat ${replyCount} balasan`}
              </button>
            )}
          </div>
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
  onEditSave,
  onOpenProfile,
  renderBody,
  renderMedia,
  formatTime,
  reduceMotion,
  actions,
  onOpenThreadRow,
  isTopLevel,
  railConnected,
  railBelow,
  hideQuote,
}: {
  comment: CommunityComment;
  agent: { role?: string | null } | null;
  deletingCommentId: string | null;
  onDelete: (commentId: string) => void;
  onEditSave: (commentId: string, body: string) => Promise<string | null>;
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
  /** True untuk komentar tingkat teratas (pemisah hairline). Balasan nested tanpa pemisah, disambung rail. */
  isTopLevel: boolean;
  /** Feed: buang pemisah hairline full-bleed komentar tingkat-teratas, ganti jadi jarak biasa (disambung rail). */
  railConnected?: boolean;
  /** Render rail vertikal di kolom avatar yang menyambung ke baris berikutnya dalam thread (induk→balasan, balasan→balasan). */
  railBelow: boolean;
  /** Sembunyikan tombol Kutip (mode profil publik — komposer tidak bisa dibuka dari sana). */
  hideQuote?: boolean;
}) {
  const canDeleteComment = canDeleteCommunityEntry(agent, comment);
  const commentAuthorName = comment.author.name || 'Agent';
  const commentAuthorSlug = comment.author.slug;

  // Edit komentar: state lokal per baris (bukan diangkat ke TerasPage) —
  // lihat catatan deviasi di task-4-brief.md. Sengaja terpisah dari
  // editingEntry (edit KIRIMAN, satu-aktif) supaya CommentThread tetap
  // presentasional murni tanpa prop-drilling state edit dari TerasPage.
  const [editState, setEditState] = useState<{ text: string; saving: boolean; error: string | null } | null>(null);
  const editLength = editState ? Array.from(editState.text.trim()).length : 0;

  const submitEdit = async () => {
    if (!editState || editState.saving) return;
    setEditState(current => (current ? { ...current, saving: true, error: null } : current));
    const message = await onEditSave(comment.id, editState.text);
    if (message === null) {
      setEditState(null);
    } else {
      setEditState(current => (current ? { ...current, saving: false, error: message } : current));
    }
  };

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
    // Kartu post di feed juga role="link" (handlePostAreaClick) — tanpa ini
    // klik baris komentar ikut menggelembung ke sana dan navigasi kedua
    // (halaman POST) menimpa navigasi ke halaman komentar ini.
    event.stopPropagation();
    onOpenThreadRow();
  };
  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onOpenThreadRow) return;
    if (event.key !== 'Enter' || event.target !== event.currentTarget) return;
    event.preventDefault();
    event.stopPropagation();
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
        // Top-level: pemisah hairline full-bleed antar komentar. Balasan nested:
        // hanya jarak atas — avatar 40px sejajar dgn induk, disambung rail di
        // kolom avatar (railBelow), bukan pemisah.
        // railConnected (feed): buang hairline full-bleed (dulu "terasa post
        // baru") — cukup jarak atas, karena rail vertikal sudah menyambungkan.
        isTopLevel
          ? (railConnected ? 'pt-2' : '-mx-4 border-t border-gray-100 px-4 pt-3 dark:border-slate-800')
          : 'mt-2'
      } ${
        onOpenThreadRow ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/50' : ''
      }`}
    >
      <div className="flex flex-col items-center">
        {/* Avatar diangkat (relative z-10) supaya SELALU menutup rail yang
            merembes dari baris di atasnya. Kolom komposer bersifat
            position:relative sehingga rail-nya tercat di lapisan lebih tinggi
            dari kolom komentar yang tak-berposisi — tanpa lifting ini garis
            vertikal tampak "masuk ke dalam" foto profil. Setara pola avatar
            komposer (relative z-10) di TerasPage. */}
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
            className="relative z-10"
          >
            <AgentAvatar name={commentAuthorName} photo={comment.author.photo} size="post" />
          </a>
        ) : (
          <div className="relative z-10">
            <AgentAvatar name={commentAuthorName} photo={comment.author.photo} size="post" />
          </div>
        )}
        {railBelow && (
          <div data-thread-rail="comment" aria-hidden="true" className="mt-1.5 -mb-2 w-px flex-1 bg-gray-200 dark:bg-slate-700" />
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
          {comment.edited_at && (
            <span className="shrink-0 text-[11px] font-medium text-gray-400 dark:text-slate-500">· diedit</span>
          )}
          {comment.is_own && !editState && (
            <button
              type="button"
              onClick={() => setEditState({ text: comment.body, saving: false, error: null })}
              aria-label="Edit komentar"
              title="Edit komentar"
              className="-my-3 flex min-h-11 min-w-11 shrink-0 items-center justify-center text-gray-500 transition-colors hover:text-emerald-600 active:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 dark:active:text-emerald-400"
            >
              <Pencil size={13} />
            </button>
          )}
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

        {editState ? (
          <div className="mt-1">
            <textarea
              value={editState.text}
              autoFocus
              rows={1}
              readOnly={editState.saving}
              ref={node => {
                if (node) {
                  node.style.height = '';
                  node.style.height = `${node.scrollHeight}px`;
                }
              }}
              onChange={event => {
                const { value } = event.target;
                event.target.style.height = '';
                event.target.style.height = `${event.target.scrollHeight}px`;
                setEditState(current => (current ? { ...current, text: value } : current));
              }}
              onKeyDown={event => { if (event.key === 'Escape') setEditState(null); }}
              className="w-full resize-none overflow-hidden rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13.5px] text-gray-900 outline-none focus:border-emerald-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <div className="mt-1.5 flex items-center justify-between gap-3">
              <span className={`text-[11px] font-medium ${editLength > MAX_COMMENT_EDIT_CHARS ? 'text-red-500' : 'text-gray-400 dark:text-slate-500'}`}>
                {editLength}/{MAX_COMMENT_EDIT_CHARS}
              </span>
              <div className="flex items-center gap-2">
                {editState.error && (
                  <span role="alert" className="text-[11px] font-medium text-red-500">{editState.error}</span>
                )}
                <button type="button" onClick={() => setEditState(null)} disabled={editState.saving}
                  className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800">
                  Batal
                </button>
                <button type="button" onClick={() => void submitEdit()}
                  disabled={editState.saving || editLength < 1 || editLength > MAX_COMMENT_EDIT_CHARS}
                  className="rounded-full bg-emerald-600 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                  Simpan
                </button>
              </div>
            </div>
          </div>
        ) : (
          renderBody(comment)
        )}
        {renderMedia(comment)}

        {actions && (
          <div className="relative -ml-2 mt-0.5 mb-1 flex items-center gap-1">
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

            {/* Ikon balas membuka SHEET komposer balasan (ala Threads) tanpa
                pindah halaman — membaca utuh tetap lewat klik baris komentar
                (onOpenThreadRow) yang membuka halaman komentar ini. */}
            <motion.button
              type="button"
              aria-label="Balas komentar"
              title="Balas"
              onClick={actions.onReply}
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
      </div>
    </div>
  );
}

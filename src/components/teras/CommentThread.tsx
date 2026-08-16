import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useIsPresent, useReducedMotion, type Variants } from 'framer-motion';
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
  /** Hapus BENERAN — dipanggil dari tombol konfirmasi, bukan dari ikon tempat sampah. */
  onDelete: (commentId: string) => void;
  /**
   * Klik ikon tempat sampah: MINTA konfirmasi, belum menghapus. Konfirmasinya
   * dirender inline di baris ini (dua tombol), bukan lewat window.confirm —
   * dialog native bisa ditekan diam-diam oleh browser (checkbox "jangan
   * tampilkan dialog lagi") atau webview yang tak menanganinya, dan saat itu
   * terjadi tombol hapus jadi mati total tanpa pesan apa pun. Kiriman sudah
   * lama memakai konfirmasi in-app (confirmDeletePostId); ini menyamakannya.
   */
  onRequestDelete: (commentId: string) => void;
  /** Batalkan permintaan konfirmasi hapus. */
  onCancelDelete: () => void;
  /** Id komentar yang sedang menunggu konfirmasi hapus (null = tak ada). */
  confirmDeleteCommentId: string | null;
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

/**
 * Animasi "komentar baru mendarat". Dipakai lewat <AnimatePresence initial={false}>
 * — itu kuncinya: daftar yang SUDAH ada saat panel pertama dibuka tidak ikut
 * meletup satu per satu (panel sendiri sudah punya animasi buka), sementara baris
 * yang menyusul kemudian — komentar yang baru dikirim (menyelip di paling atas),
 * komentar orang lain yang masuk saat panel dimuat ulang, atau balasan yang baru
 * di-expand — masuk lewat varian ini. Tak ada state "baru" yang perlu dititipkan
 * dari TerasPage: kehadiran key baru di AnimatePresence sudah jadi sinyalnya.
 *
 * Tiga lapis yang berjalan bersamaan:
 *   wrapper -> membuka tinggi 0->auto sambil turun sedikit (mendorong baris di
 *              bawahnya, jadi daftar tidak "menyentak")
 *   baris   -> kilau emerald (aksen Teras) yang memudar pelan, penanda mana yang
 *              baru masuk
 *   avatar  -> pantulan kecil (spring), titik fokus barisnya
 * Dua lapis terakhir TIDAK punya initial/animate sendiri: framer mewariskannya
 * dari wrapper lewat NAMA varian yang sama, jadi CommentRow tak perlu tahu apa
 * pun soal state animasi dan baris lama tak pernah ikut menyala.
 */
const COMMENT_ENTER_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const commentRevealVariants: Variants = {
  hidden: { opacity: 0, height: 0, y: -10 },
  visible: {
    opacity: 1,
    height: 'auto',
    y: 0,
    transition: { duration: 0.42, ease: COMMENT_ENTER_EASE, opacity: { duration: 0.28 } },
  },
  exit: { opacity: 0, height: 0, transition: { duration: 0.22, ease: 'easeIn' } },
};

const commentGlowVariants: Variants = {
  hidden: { backgroundColor: 'rgba(16,185,129,0.16)' },
  visible: {
    backgroundColor: 'rgba(16,185,129,0)',
    // Sengaja lebih lambat dari reveal-nya (0,42s): baris sudah selesai membuka,
    // kilau masih memudar — mata sempat menangkap "yang ini yang baru". Tapi
    // JANGAN dipanjangkan sembarangan: onAnimationComplete di CommentEnter baru
    // menyala setelah animasi anak-anaknya ikut selesai (teruji), jadi durasi di
    // sini = lama `overflow-hidden` menempel di wrapper.
    transition: { duration: 0.9, ease: 'easeOut', delay: 0.2 },
  },
  exit: { backgroundColor: 'rgba(16,185,129,0)' },
};

// Avatar mendarat dengan pantulan kecil — titik fokus baris, jadi di sinilah
// gerak yang "hidup" paling terbaca tanpa mengganggu keterbacaan teks.
const commentAvatarVariants: Variants = {
  hidden: { scale: 0.55 },
  visible: { scale: 1, transition: { type: 'spring', stiffness: 540, damping: 22, delay: 0.08 } },
  exit: { scale: 1 },
};

/**
 * Wrapper satu baris yang masuk. Dipisah jadi komponen karena butuh satu state
 * kecil: `overflow-hidden` WAJIB ada selama tinggi beranimasi (isi baris tumpah
 * kalau tidak), dan WAJIB lepas sesudahnya — rail vertikal (`-mb-2`) dan burst
 * reaksi (scale 1.9) sengaja melewati kotak baris, jadi hidden yang tertinggal
 * memotongnya.
 *
 * Pelepasannya lewat onAnimationComplete + className, BUKAN `transitionEnd`
 * milik framer: diuji di tests/teras-page.browser.test.js, nilai transitionEnd
 * diam-diam TIDAK diterapkan kalau targetnya datang dari varian bernama —
 * tinggi/opacity/y beres, tapi overflow menetap hidden selamanya. Lewat className
 * juga bebas rebutan dengan style inline yang ditulis framer (overflow tak pernah
 * jadi nilai animasi, jadi framer tak menyentuhnya).
 */
function CommentEnter({ animate, fresh, children }: { animate: boolean; fresh: boolean; children: ReactNode }) {
  // Kesegaran DIKUNCI saat mount. Sesudah id-nya tercatat di render berikutnya
  // `fresh` berbalik jadi false, dan tanpa penguncian ini baris yang MASIH
  // beranimasi akan kehilangan klipingnya di tengah jalan.
  const [entering] = useState(fresh);
  const [revealed, setRevealed] = useState(false);
  // false selama baris sedang keluar (dihapus) — tinggi menyusut lagi, jadi
  // kliping perlu dipasang kembali.
  const present = useIsPresent();
  if (!animate) return <div>{children}</div>;
  return (
    <motion.div
      variants={commentRevealVariants}
      // Baris yang sudah ada saat panel dibuka: render langsung di keadaan akhir,
      // TANPA kliping. Ini pasangan eksplisit dari <AnimatePresence initial={false}>
      // — baris begitu tak pernah menganimasi, jadi onAnimationComplete-nya tak
      // pernah menyala; kalau klipingnya ikut dipasang ia menempel SELAMANYA dan
      // memotong pemisah full-bleed (-mx-4), rail (-mb-2), serta burst reaksi.
      initial={entering ? 'hidden' : false}
      animate="visible"
      exit="exit"
      onAnimationComplete={() => setRevealed(true)}
      className={(entering && !revealed) || !present ? 'overflow-hidden' : undefined}
    >
      {children}
    </motion.div>
  );
}

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
  onRequestDelete,
  onCancelDelete,
  confirmDeleteCommentId,
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
  // null = belum pernah render (semua baris dianggap lama, sama seperti
  // initial={false} milik AnimatePresence).
  const seenIdsRef = useRef<Set<string> | null>(null);
  // reduceMotion = tanpa animasi sama sekali, bukan versi cepat: baris langsung
  // ada di tempatnya.
  const animateEntry = !reduceMotion;

  // Balasan mana yang benar-benar DIRENDER untuk sebuah komentar. Satu definisi
  // dipakai dua kali (daftar id di bawah + JSX) supaya keduanya tak bisa
  // menyimpang; kalau menyimpang, baris balasan yang di-expand akan dianggap
  // "lama" dan masuk tanpa animasi.
  const renderedRepliesOf = (comment: CommunityComment) => (
    (replyExpansions?.[comment.id] === 'expanded' || !onToggleReplies)
      ? (comment.preview_replies ?? [])
      : []
  );
  // Baris mana yang BARU muncul sejak render sebelumnya. Ini pasangan eksplisit
  // dari <AnimatePresence initial={false}>: AnimatePresence sudah menahan
  // animasi baris lama, tapi kliping overflow butuh jawaban yang sama, dan
  // hanya AnimatePresence yang tahu — baris lama tak pernah menganimasi
  // sehingga onAnimationComplete-nya tak pernah menyala.
  const seenIds = seenIdsRef.current;
  const renderedIds = comments.flatMap(comment => [comment.id, ...renderedRepliesOf(comment).map(reply => reply.id)]);
  const isFresh = (id: string) => seenIds !== null && !seenIds.has(id);
  useEffect(() => {
    seenIdsRef.current = new Set(renderedIds);
  });

  return (
    <AnimatePresence initial={false}>
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
        const renderedReplies = renderedRepliesOf(comment);
        const showRepliesToggle = canToggleReplies
          ? expanded || expansion === 'loading' || expansion === 'error' || replyCount > 0
          : replyCount > 0;

        return (
          <CommentEnter key={comment.id} animate={animateEntry} fresh={isFresh(comment.id)}>
            <CommentRow
              comment={comment}
              agent={agent}
              deletingCommentId={deletingCommentId}
              onDelete={onDelete}
              onRequestDelete={onRequestDelete}
              onCancelDelete={onCancelDelete}
              confirmDeleteCommentId={confirmDeleteCommentId}
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
              // showRepliesToggle ikut: baris "Lihat/Sembunyikan balasan" adalah
              // bagian utas ini — tanpa rail ke sana tombolnya tampak menggantung
              // lepas (paling kentara di detail view yang tak punya hasNextGroup).
              railBelow={renderedReplies.length > 0 || hasNextGroup || showRepliesToggle}
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
            <AnimatePresence initial={false}>
            {renderedReplies.map((reply, index) => (
              <CommentEnter key={reply.id} animate={animateEntry} fresh={isFresh(reply.id)}>
              <CommentRow
                comment={reply}
                agent={agent}
                deletingCommentId={deletingCommentId}
                onDelete={onDelete}
                onRequestDelete={onRequestDelete}
                onCancelDelete={onCancelDelete}
                confirmDeleteCommentId={confirmDeleteCommentId}
                onEditSave={onEditSave}
                onOpenProfile={onOpenProfile}
                renderBody={renderBody}
                renderMedia={renderMedia}
                formatTime={formatTime}
                reduceMotion={!!reduceMotion}
                isTopLevel={false}
                railConnected={railConnected}
                // showRepliesToggle: balasan terakhir tetap menyambung ke baris
                // "Sembunyikan balasan" di bawahnya (lihat komentar di induk).
                railBelow={index < renderedReplies.length - 1 || hasNextGroup || showRepliesToggle}
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
              </CommentEnter>
            ))}
            </AnimatePresence>
            {showRepliesToggle && (
              // Grid kolom-avatar yang sama dengan baris komentar: di feed
              // (railConnected) rail penyambung ke grup berikutnya harus LEWAT
              // baris tombol ini juga — dulu baris ini cuma ml-[52px] tanpa
              // kolom avatar, jadi garis vertikal tampak terputus setinggi
              // tombol sebelum menyambung lagi di komentar berikutnya.
              <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-3">
                {/* WAJIB flex-col: di flex arah row, flex-1 menumbuhkan LEBAR —
                    "garis" w-px berubah jadi balok selebar kolom 40px. */}
                <div className="flex flex-col items-center">
                  {railConnected && hasNextGroup ? (
                    <div data-thread-rail="comment" aria-hidden="true" className="-mb-2 w-px flex-1 bg-gray-200 dark:bg-slate-700" />
                  ) : (
                    // Stub penutup utas: meneruskan rail dari baris di atasnya
                    // dan berakhir tepat di samping teks tombol (h-6 ≈ garis
                    // tengah tombol min-h-11 + mt-1) — bukan menembus ke bawah,
                    // karena tidak ada grup berikutnya untuk disambung.
                    <div data-thread-rail="comment" aria-hidden="true" className="h-6 w-px bg-gray-200 dark:bg-slate-700" />
                  )}
                </div>
                <button
                  type="button"
                  disabled={expansion === 'loading'}
                  onClick={() => (canToggleReplies ? onToggleReplies?.(comment.id) : onOpenThread(comment.id))}
                  aria-expanded={canToggleReplies ? expanded : undefined}
                  className="mt-1 flex min-h-11 items-center gap-1.5 text-left text-[12px] font-semibold text-gray-500 transition-colors hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:opacity-60 dark:text-slate-400 dark:hover:text-emerald-400"
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
              </div>
            )}
          </CommentEnter>
        );
      })}
    </AnimatePresence>
  );
}

function CommentRow({
  comment,
  agent,
  deletingCommentId,
  onDelete,
  onRequestDelete,
  onCancelDelete,
  confirmDeleteCommentId,
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
  onRequestDelete: (commentId: string) => void;
  onCancelDelete: () => void;
  confirmDeleteCommentId: string | null;
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
  const confirmingDelete = confirmDeleteCommentId === comment.id;
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
    <motion.div
      data-comment-row
      // Kilau "baru masuk". TIDAK punya initial/animate sendiri: nama variannya
      // sama dengan wrapper di CommentThread, jadi framer mewariskannya dari
      // sana — baris yang sudah lama tampil tak pernah menyala karena wrappernya
      // pun tak pernah menganimasi ulang. reduceMotion = tanpa varian sama sekali.
      variants={reduceMotion ? undefined : commentGlowVariants}
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
        // Jarak balasan sengaja PADDING, bukan margin: wrapper animasi masuk
        // memakai overflow:hidden sementara (bikin BFC), dan margin-top anak
        // berhenti melipat keluar di dalamnya — jarak 8px akan meloncat masuk
        // lalu keluar lagi begitu overflow dilepas. Padding tak punya masalah itu,
        // sekaligus membuat kilau "baru masuk" ikut menutupi jaraknya.
        isTopLevel
          ? (railConnected ? 'pt-2' : '-mx-4 border-t border-gray-100 px-4 pt-3 dark:border-slate-800')
          : 'pt-2'
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
        {/* Varian pantulan avatar diwarisi dari wrapper yang sama seperti kilau
            baris — tanpa initial/animate sendiri, jadi hanya baris yang benar-benar
            baru masuk yang memantul. */}
        {commentAuthorSlug ? (
          <motion.a
            href={terasProfilePath(commentAuthorSlug)}
            variants={reduceMotion ? undefined : commentAvatarVariants}
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
          </motion.a>
        ) : (
          <motion.div variants={reduceMotion ? undefined : commentAvatarVariants} className="relative z-10">
            <AgentAvatar name={commentAuthorName} photo={comment.author.photo} size="post" />
          </motion.div>
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
          {comment.is_own && !editState && !confirmingDelete && (
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
          {canDeleteComment && (confirmingDelete ? (
            // Konfirmasi in-app, meniru pola kiriman (confirmDeletePostId):
            // window.confirm() bisa dimatikan diam-diam oleh browser/webview,
            // dan waktu itu terjadi tombol hapus mati total tanpa jejak.
            // Pensil disembunyikan saat konfirmasi supaya dua tombol ini muat
            // di baris yang sama tanpa menekan nama penulis.
            <span className="-my-3 -mr-2 flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                disabled={deletingCommentId === comment.id}
                onClick={() => onDelete(comment.id)}
                aria-label="Konfirmasi hapus komentar"
                className="flex min-h-11 items-center rounded-full px-2 text-[12.5px] font-bold text-red-600 transition-colors hover:bg-red-50 active:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20 dark:active:bg-red-900/20"
              >
                {deletingCommentId === comment.id ? <Loader2 size={13} className="animate-spin" /> : 'Hapus'}
              </button>
              <button
                type="button"
                disabled={deletingCommentId === comment.id}
                onClick={onCancelDelete}
                aria-label="Batal hapus komentar"
                className="flex min-h-11 items-center rounded-full px-2 text-[12.5px] font-semibold text-gray-500 transition-colors hover:bg-gray-100 active:bg-gray-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-700/60 dark:active:bg-slate-700/60"
              >
                Batal
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onRequestDelete(comment.id)}
              aria-label="Hapus komentar"
              title="Hapus komentar"
              className="-my-3 -mr-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center text-gray-500 transition-colors hover:text-red-500 active:text-red-500 dark:text-slate-400 dark:hover:text-red-400 dark:active:text-red-400"
            >
              <Trash2 size={13} />
            </button>
          ))}
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
              className="flex min-h-11 min-w-11 items-center gap-1.5 rounded-full px-2 text-[12.5px] font-semibold text-gray-500 transition-colors hover:text-emerald-600 active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:text-slate-400 dark:hover:text-emerald-400 dark:active:bg-slate-900"
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
                className="flex min-h-11 min-w-11 items-center gap-1.5 rounded-full px-2 text-[12.5px] font-semibold text-gray-500 transition-colors hover:text-emerald-600 active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:text-slate-400 dark:hover:text-emerald-400 dark:active:bg-slate-900"
              >
                <RefreshCw size={19} />
              </motion.button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

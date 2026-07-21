# Desain: Reaksi Emoji ala WhatsApp untuk Teras

**Tanggal:** 2026-07-21
**Status:** Disetujui untuk perencanaan
**Cakupan:** Komentar & kiriman (post) di Teras community

## Latar & Motivasi

Saat ini komentar maupun kiriman Teras hanya punya **satu tombol Heart** yang menulis reaksi `'suka'` dan menampilkan satu angka total. Backend sebenarnya sudah generik: tabel `community_post_reactions` menyimpan **satu reaksi per agen per target** dengan kolom `reaction` ber-CHECK `('suka','selamat','aamiin')`, dan menghitung count per-jenis. Nilai `selamat`/`aamiin` ada di skema tapi **tidak pernah dipakai UI** (dijumlah jadi satu angka).

Tujuan: ganti tombol Heart tunggal dengan **picker emoji ala WhatsApp** — ikon smile-plus yang, saat diklik, memunculkan bilah 7 emoji pilihan. Berlaku di komentar **dan** kiriman.

## Keputusan Desain (hasil brainstorming)

1. **Cakupan:** komentar & kiriman, keduanya beralih dari Heart tunggal ke picker emoji.
2. **Set emoji (7, terurut):**

   | Kunci (enum) | Emoji | Label UI | Status |
   |---|---|---|---|
   | `suka` | 👍 | Suka | dipertahankan (semua reaksi lama = ini) |
   | `cinta` | ❤️ | Cinta | **baru** |
   | `aamiin` | 🤲 | Aamiin | dipertahankan |
   | `selamat` | 🎉 | Barakallah | dipertahankan (kunci lama, dilabeli ulang) |
   | `senang` | 😊 | Senang | **baru** |
   | `masyaallah` | 😮 | Masyaallah | **baru** |
   | `semangat` | 🔥 | Semangat | **baru** |

3. **Trigger:** ikon lucide `SmilePlus` (bukan Heart). Picker muncul **saat klik/tap** (bukan hover). Klik di luar atau `Esc` menutup. Setelah memilih, ikon trigger berganti jadi emoji terpilih + label. Klik emoji yang sama → lepas reaksi (kirim `null`).
4. **Tampilan hitungan:** gugus emoji distinct yang terpakai (maks ~3, urut jumlah terbanyak) + angka total, dalam satu pil (gaya WhatsApp).
5. **Klik gugus:** buka panel daftar **siapa bereaksi apa** — avatar + nama agen dikelompokkan per emoji, dengan tab "Semua / per-emoji".

## Invarian yang Dipertahankan

- **Satu reaksi per agen per target** (PK `(post_id, agent_id)`). Tidak berubah.
- **Kunci lama tetap valid.** Enum hanya bertambah, tak pernah menghapus nilai. Tak perlu migrasi baris data.
- **Komentar = kiriman** (baris di tabel `community_posts`), jadi satu jalur backend melayani keduanya.

## Arsitektur

### 1. Sumber tunggal konfigurasi reaksi

**Frontend — `src/lib/terasReactions.ts` (baru):**
```ts
export const TERAS_REACTIONS = [
  { key: 'suka',       emoji: '👍', label: 'Suka' },
  { key: 'cinta',      emoji: '❤️', label: 'Cinta' },
  { key: 'aamiin',     emoji: '🤲', label: 'Aamiin' },
  { key: 'selamat',    emoji: '🎉', label: 'Barakallah' },
  { key: 'senang',     emoji: '😊', label: 'Senang' },
  { key: 'masyaallah', emoji: '😮', label: 'Masyaallah' },
  { key: 'semangat',   emoji: '🔥', label: 'Semangat' },
] as const;

export type ReactionType = typeof TERAS_REACTIONS[number]['key'];
export type ReactionCounts = Record<ReactionType, number>;
export const REACTION_EMOJI: Record<ReactionType, string> = /* diturunkan */;
export const REACTION_LABEL: Record<ReactionType, string> = /* diturunkan */;
export function emptyReactionCounts(): ReactionCounts { /* semua 0 */ }
```

- `ReactionType` dan `ReactionCounts` di `TerasPage.tsx` **dipindah** ke sini (saat ini `ReactionType = 'suka' | 'selamat' | 'aamiin'` dan `ReactionCounts` punya key hardcoded). `TerasPage.tsx` dan `CommentThread.tsx` mengimpor dari modul baru. Ini menjaga altitude: satu tempat mendefinisikan set reaksi.

**Server — `server.js`:**
- `COMMUNITY_REACTION_TYPES` diperluas jadi 7 kunci (urutan sama, untuk konsistensi).
- Tambah helper `emptyReactionCounts()` yang membangun objek `{ <key>: 0, … }` dari `COMMUNITY_REACTION_TYPES`.
- **Ganti semua literal `{ suka: 0, selamat: 0, aamiin: 0 }`** (lihat daftar situs di bawah) dengan `emptyReactionCounts()`. Jika tidak, 4 kunci baru tak akan terinisialisasi → count-nya hilang saat agregasi.

Situs literal yang harus diganti (per pembacaan saat ini, verifikasi ulang saat implementasi):
- `server.js:4413` (feed reactionCounts Map)
- `server.js:5881` (detail)
- `server.js:6408` (fallback kosong)
- `server.js:6664` (komentar)
- serta inisialisasi serupa di jalur thread/detail bila ada.
- `src/components/TerasPage.tsx` — semua fallback `?? { suka: 0, selamat: 0, aamiin: 0 }` (mis. baris 495, 3319, 3330) dan penjumlahan `reactions.suka + reactions.selamat + reactions.aamiin` (baris 497, 4247) diganti agar menjumlah **seluruh** kunci (mis. `sumReactions(counts)` atau `Object.values(counts).reduce(...)`).

### 2. Migrasi DB (manual, dijalankan user di Supabase SQL Editor)

**`migrations/20260727000000_community_reaction_emoji.sql` (baru, dokumentasi):**
```sql
ALTER TABLE community_post_reactions
  DROP CONSTRAINT community_post_reactions_reaction_check,
  ADD CONSTRAINT community_post_reactions_reaction_check
    CHECK (reaction IN ('suka','selamat','aamiin','cinta','senang','masyaallah','semangat'));
```

- Sesuai konvensi proyek, **tak ada** exec_sql/psql/URL DB — user menempel SQL ini di Supabase SQL Editor.
- Constraint inline auto-bernama `community_post_reactions_reaction_check` (verifikasi nama sebenarnya di dashboard sebelum drop; kalau berbeda, sesuaikan).
- **Baris lama aman** (nilai lama = subset dari set baru).

### 3. Komponen UI baru

**`src/components/teras/ReactionPicker.tsx` (baru, presentasional):**
- Props: `myReaction: ReactionType | null`, `onPick: (r: ReactionType | null) => void`, opsional `disabled`.
- Render trigger `SmilePlus` (atau emoji terpilih bila `myReaction` ada) + bilah popover 7 emoji dari `TERAS_REACTIONS`.
- State buka/tutup **lokal**. Buka saat klik trigger; tutup saat: klik salah satu emoji, klik di luar (listener document), `Esc`.
- Klik emoji: bila sama dengan `myReaction` → `onPick(null)` (lepas); selain itu `onPick(key)`.
- A11y: trigger `aria-haspopup`/`aria-expanded`; tiap emoji tombol dengan `aria-label={label}`; target sentuh ≥ 44px (pola `min-h-11`); fokus ring seperti komponen Teras lain; animasi hormati `useReducedMotion`.

**`src/components/teras/ReactionSummary.tsx` (baru, presentasional):**
- Props: `counts: ReactionCounts`, `onOpenList: () => void`.
- Hitung total = jumlah semua kunci; kumpulkan emoji distinct dengan count > 0, urut desc, ambil maks 3 untuk ditumpuk.
- Bila total 0 → render kosong (tak ada pil).
- Pil dapat diklik → `onOpenList()`; `role="button"`, keyboard-operable.

**`src/components/teras/ReactionListSheet.tsx` (baru, fetch):**
- Props: `postId: string`, `onClose`, `onOpenProfile(slug)`.
- Saat mount, `GET /api/community/posts/:id/reactions`; tampilkan state loading/empty/error.
- Kelompokkan hasil per emoji; tab "Semua" + satu tab per emoji yang punya reaksi (dengan angka). Tiap baris: `AgentAvatar` + nama (link `terasProfilePath`) + emoji-nya.
- Tampilan: bottom-sheet/modal ringan konsisten dengan pola overlay Teras yang ada; fokus-trap sederhana + `Esc` menutup.

### 4. Endpoint baru

**`GET /api/community/posts/:id/reactions` (server.js):**
- Middleware: `authMiddleware`, lalu `getAgentById` + `requireCommunityAccess` (pola sama dengan endpoint community lain).
- Validasi `isCommunityUuid(req.params.id)`; pastikan target ada & aktif (`loadActiveCommunityPost`).
- Query `community_post_reactions` join `agents(name, slug, photo)` untuk `post_id = :id`, urut `created_at` (atau nama), plafon mis. **200** baris; sertakan flag `truncated` bila terpotong dan `log()` bila perlu (pola "no silent caps" seperti endpoint komentar).
- Respons: `{ reactions: [{ agent: { name, slug, photo }, reaction, created_at }], truncated: bool }`.
- Abaikan baris yang `reaction`-nya di luar `COMMUNITY_REACTION_TYPES` (tahan-banting terhadap data lama tak dikenal).

### 5. Penyambungan (wiring)

**Komentar — `CommentThread.tsx`:**
- Ganti blok tombol Heart (`~294–345`) dengan `<ReactionPicker>` + `<ReactionSummary>`.
- `CommentRowActions.onReact` sudah bertipe `(reaction: ReactionType | null) => void` — teruskan `key` dari picker apa adanya (hapus `handleReactClick` yang meng-hardcode `'suka'`).
- Prop `reactionCounts: Record<string, number>` (satu angka) diganti jadi `ReactionCounts` utuh per komentar agar `ReactionSummary` bisa merender gugus. Sesuaikan `buildCommentReactionMaps`/props terkait di `TerasPage.tsx`.

**Kiriman — `TerasPage.tsx` (~4247+):**
- Ganti tombol Heart kiriman dengan `ReactionPicker` + `ReactionSummary`.
- `sendReactionUpdate(id, reaction)` sudah generik → tak berubah.
- Update optimistik reaksi kiriman & komentar (`handleCommentReact` dan padanan kiriman) sudah menaikkan/menurunkan count per-jenis; cukup ganti fallback literal ke `emptyReactionCounts()` dan penjumlahan total ke seluruh kunci.

Animasi "pop/burst" yang ada boleh dipertahankan sebagai umpan-balik saat memilih emoji (opsional, hormati reduced-motion).

### 6. Notifikasi

- Plumbing notifikasi (lonceng + Telegram) query `community_post_reactions` tanpa peduli jenis → emoji baru **otomatis** ikut memicu notifikasi tanpa perubahan.
- **Opsional (polish, boleh dilewati):** sisipkan emoji ke teks digest, mis. "… bereaksi 🤲 pada kiriman kamu". Bila dikerjakan, ambil `reaction` di query notifikasi (`server.js:~5293`) dan petakan ke emoji. Label menu setelan notifikasi ("Reaksi — Suka di kiriman kamu") boleh digeneralisasi belakangan.

## Urutan Rilis (penting)

1. **Jalankan migrasi DB** (perluas CHECK) di Supabase — *sebelum* deploy kode.
2. Deploy kode (server + FE). Frontend baru baru boleh mengirim nilai emoji baru setelah constraint menerimanya; kalau urutan terbalik, POST reaksi emoji baru akan gagal 400/DB-reject.

## Rencana Verifikasi

Selaras preferensi: implementasi selesai, tes end-to-end dijalankan user. Verifikasi cepat/deterministik oleh Claude:
- `node --check server.js`.
- `tsc` (typecheck) + `vite build` untuk FE.
- Unit test yang relevan bila ada (mis. `tests/community-access.test.js`).
- Curl manual endpoint `/reactions` dikumpulkan jadi checklist untuk user (bukan dijalankan sebagai suite lambat).

Checklist manual untuk user:
- Migrasi DB diterapkan (paste SQL, konfirmasi tak error).
- Klik smile-plus di komentar & kiriman → bilah 7 emoji muncul; pilih → tersimpan (refresh tetap ada).
- Klik emoji sama → lepas.
- Gugus + total tampil benar dengan campuran beberapa emoji.
- Klik gugus → panel daftar siapa bereaksi apa, dikelompokkan per emoji.
- Notifikasi reaksi tetap terkirim.

## Di Luar Cakupan (YAGNI)

- Emoji kustom / lebih dari set 7.
- Lebih dari satu reaksi per orang per target.
- Animasi konfeti / efek berat.
- Generalisasi label menu setelan notifikasi (bisa menyusul).
- Migrasi historis data reaksi (tak diperlukan — enum hanya bertambah).

## Berkas yang Disentuh (ringkas)

**Baru:**
- `src/lib/terasReactions.ts`
- `src/components/teras/ReactionPicker.tsx`
- `src/components/teras/ReactionSummary.tsx`
- `src/components/teras/ReactionListSheet.tsx`
- `migrations/20260727000000_community_reaction_emoji.sql` (dokumentasi; dijalankan manual)

**Diubah:**
- `server.js` — `COMMUNITY_REACTION_TYPES`, `emptyReactionCounts()`, ganti literal count, endpoint `GET …/reactions` baru.
- `src/components/TerasPage.tsx` — impor tipe/konfig dari `terasReactions.ts`, wiring picker+summary+sheet di kiriman, perbaiki fallback & penjumlahan count.
- `src/components/teras/CommentThread.tsx` — ganti Heart dengan picker+summary, props count utuh.

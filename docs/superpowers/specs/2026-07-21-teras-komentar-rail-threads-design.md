# Teras: Rail Komentar ala Threads

Tanggal: 2026-07-21
Status: Disetujui untuk implementasi

## Masalah

Di tampilan detail kiriman Teras ("Kiriman"), semua komentar tingkat-teratas
tersambung satu garis vertikal panjang (rail) dari post → komentar → komentar,
seolah semuanya satu rantai. Padahal secara data itu komentar datar (flat) ke
kiriman yang sama, bukan balasan-berbalas.

Threads menampilkan hal ini berbeda: komentar tingkat-teratas berdiri sendiri
sebagai section terpisah **tanpa** garis penyambung. Garis vertikal hanya
muncul untuk (a) menyambung segmen-segmen utas milik penulis yang sama, dan
(b) mengelompokkan balasan bertingkat (reply-to-reply) di bawah komentar
induknya.

## Tujuan

Samakan perilaku rail komentar Teras dengan Threads, sambil mempertahankan
rail utas penulis dan rail grup balasan bertingkat.

Non-tujuan:
- Tidak mengubah model data / backend / kolom `is_reply`.
- Tidak mengubah rail antar-segmen utas (`data-thread-rail="thread"`).
- Tidak mengubah perilaku klik-untuk-buka-thread, reaksi, balas, kutip, hapus.

## Perilaku target

| Elemen | Sebelum | Sesudah |
|---|---|---|
| Segmen utas penulis (`rail="thread"`) | garis menyambung | **tetap** (tidak diubah) |
| Post → komentar (`rail="post"`) | garis menyambung | **dihilangkan** |
| Komentar → komentar antar-teratas (`rail="comment"`) | garis menyambung | **dihilangkan**, diganti hairline pemisah |
| Balasan bertingkat / nested (`preview_replies`) | garis grup di kiri | **tetap** (garis grup) |
| Empty state (`rail="empty"`) | ada rail | **dihilangkan**, jadi section ber-hairline |
| Stub input komposer (`rail="input"`) | ada rail | **dihilangkan**, komposer jadi section ber-hairline |
| Antar komentar teratas | dempet (`mt-2`) + rail | **hairline tipis** full-width, satu section per komentar |

Aturan garis vertikal setelah perubahan:
- **Ada** hanya untuk: (1) segmen utas penulis yang masih berlanjut ke bawah
  (`chainRailBelow`), dan (2) komentar teratas yang punya balasan nested tampil
  (garis grup di kiri balasan).
- **Tidak ada** untuk: post → komentar, komentar teratas tanpa balasan,
  balasan leaf (tingkat dua), empty state, dan stub input.

Pemisah antar section (post, tiap komentar teratas, komposer) memakai garis
hairline horizontal full-width, warna `border-gray-100 dark:border-slate-800`
(sama dengan border kartu kiriman). Garis grup nested tetap
`bg-gray-200 dark:bg-slate-700`.

## Perubahan berdasarkan file

### `src/components/TerasPage.tsx`

1. **Rail avatar post** (~baris 4429-4444). Kondisi render berubah dari
   `(commentsOpen || chainRailBelow)` menjadi **hanya `chainRailBelow`**.
   Dengan begitu rail avatar hanya muncul di segmen utas yang berlanjut ke
   bawah (`data-thread-rail="thread"`, `-mb-6`). Varian `"post"` dan pemakaian
   `commentsOpen` sebagai pemicu rail dihapus. `AnimatePresence` di sekitarnya
   dipertahankan; isinya sekarang hanya cabang thread.

2. **Empty state** (~baris 4727-4733). Hapus `<div data-thread-rail="empty" …>`
   beserta kolom avatar rail-nya. Ganti jadi teks "Belum ada komentar …"
   dalam satu section ber-`border-t border-gray-100 dark:border-slate-800`
   + padding atas, tanpa grid rail.

3. **Baris input komposer** (~baris 4803-4809). Hapus
   `<div data-thread-rail="input" …>`. Beri hairline pemisah
   (`border-t border-gray-100 dark:border-slate-800` + padding atas) pada
   baris `data-thread-input` supaya komposer berdiri sebagai section sendiri.
   Avatar komposer & layout grid dipertahankan (tanpa rail).

### `src/components/teras/CommentThread.tsx`

4. **Pemisah hairline antar komentar teratas.** Setiap komentar teratas
   dirender dengan `border-t border-gray-100 dark:border-slate-800 pt-3`
   (menggantikan `mt-2`), **termasuk yang pertama** — border pertama berfungsi
   sebagai pemisah post ↔ komentar. Balasan nested (child) **tidak** memakai
   border ini (tetap `mt-2`, dikelompokkan di bawah induknya).

5. **Rail grup nested.** `<div data-thread-rail="comment" …>` di kolom avatar
   dirender **hanya** bila komentar itu punya balasan nested yang tampil
   (`preview_replies.length > 0`). Untuk komentar teratas tanpa balasan dan
   untuk balasan leaf → tidak ada rail. Kelas `-mb-2` dibuang agar garis grup
   berhenti rapi di ujung balasan terakhir, tidak menembus ke section berikut.

6. **Prop pengendali.** `CommentRow` menerima dua penanda baru (nama final
   bebas, mis. `isTopLevel: boolean` dan `showRail: boolean`):
   - `isTopLevel` → menentukan pemakaian hairline `border-t … pt-3` vs `mt-2`.
   - `showRail` → menentukan render rail avatar.
   Di `CommentThread`, komentar teratas dipanggil dengan
   `isTopLevel={true}` dan `showRail={previewReplies.length > 0}`; balasan
   nested dengan `isTopLevel={false}` dan `showRail={false}`.

   Catatan: prop `actions`/`onOpenThreadRow` sudah membedakan teratas vs nested,
   namun penanda eksplisit lebih jelas dan tidak menumpangkan makna.

## Pembaruan test

- `tests/teras-page.browser.test.js`
  - Uji rail-alignment (~baris 1544-1564): ditulis ulang. Ekspektasi baru —
    tidak ada `rail="post"` maupun `rail="input"` saat panel komentar terbuka;
    komentar teratas dipisah hairline (border-atas), bukan disambung rail;
    rail `"comment"` hanya muncul bila ada balasan nested. Asersi
    `marginTop === '8px'` untuk `[data-comment-row]` dan `[data-thread-input]`
    disesuaikan ke gaya pemisah baru.
  - Uji empty-rail (~baris 1622-1650): ditulis ulang / diganti. Premis lama
    (rail `"empty"` + rail `"input"` sejajar) dihapus; ganti dengan asersi
    bahwa empty state tidak punya rail dan tampil sebagai section ber-hairline.
  - Uji `rail="thread"` utas (~baris 2694-2696): **tidak berubah** — masih 2
    rail thread di antara segmen utas.
- `tests/community-access.test.js` (~baris 341-343): hapus asersi
  `data-thread-rail="post"` dan `data-thread-rail="input"`; pertahankan
  `data-thread-rail="comment"`. Opsional: tambah asersi keberadaan kelas
  pemisah hairline pada komentar teratas.

## Verifikasi

- `npx tsc --noEmit` dan `npm run build` (cepat, deterministik) dijalankan oleh
  implementer.
- Test browser Teras diperbarui ke ekspektasi baru; suite e2e penuh dijalankan
  oleh user (browser-flaky, lambat) — lihat [[feedback_user_runs_e2e_tests]].
- Checklist visual manual untuk user:
  1. Detail kiriman flat (mis. Ferra): tidak ada garis vertikal post→komentar
     maupun antar-komentar; tiap komentar dipisah hairline tipis.
  2. Komentar yang punya balasan nested: garis grup vertikal muncul di kiri
     balasan, berhenti rapi di balasan terakhir.
  3. Utas penulis (multi-segmen): garis penyambung antar-segmen tetap ada.
  4. Empty state & komposer: tampil sebagai section ber-hairline, tanpa stub
     garis.
  5. Mode terang & gelap: warna hairline & garis grup sesuai.

## Risiko & catatan

- Perubahan murni presentasional; tidak menyentuh data/endpoint.
- Titik sinkron yang mudah terlewat: 3 test di atas — bila tidak diperbarui,
  merah. `community-access.test.js` adalah asersi sumber (cepat, `node`),
  wajib hijau sebelum selesai.
- Rail utas (`chainRailBelow`) sengaja dipertahankan; jangan sampai ikut
  terhapus saat menyederhanakan kondisi rail avatar post.

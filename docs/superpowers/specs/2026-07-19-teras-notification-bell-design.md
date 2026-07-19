# Bell notifikasi Teras di header dashboard

Status: disetujui (2026-07-19)

## Masalah

Indikator `@sebutan` sekarang berupa tombol `AtSign` di baris composer Teras
(`src/components/TerasPage.tsx`). Dua akibatnya:

1. Agent hanya melihat badge kalau sedang membuka tab Teras — dan bahkan di
   dalam Teras, tombolnya hilang saat membuka halaman detail post
   (`!isDetailView`).
2. Tempatnya tidak intuitif: pemberitahuan terlihat seperti bagian dari kotak
   tulis, bukan pusat notifikasi.

## Ringkasan solusi

Ganti tombol `@` itu dengan **bell notifikasi di header dashboard**, tetangga
kiri toggle light/dark, tampil di seluruh halaman dashboard. Isinya diperluas
dari sekadar sebutan menjadi tiga jenis event, digabung dalam satu panel.

Sumber data diturunkan dari tabel yang sudah ada — tidak ada tabel baru dan
tidak ada DDL.

## Lingkup

### Jenis notifikasi

| Jenis | Pemicu | Sumber |
|---|---|---|
| `mention` | Seseorang menulis `@slug`-ku di post atau komentar | `community_mentions` |
| `comment` | Agent lain berkomentar di post milikku | `community_post_comments` ⨝ `community_posts` |
| `reaction` | Agent lain bereaksi (suka/selamat/aamiin) di post milikku | `community_post_reactions` ⨝ `community_posts` |

Tidak termasuk (sengaja): balasan di thread yang sekadar aku ikuti, post baru
dari agent lain, pengumuman admin.

### Di luar lingkup

- Ping Telegram untuk komentar & reaksi. Telegram tetap hanya untuk `mention`,
  seperti sekarang. Menambahkannya berarti mengubah write-path — justru hal yang
  dihindari arsitektur ini — dan berisiko berisik. Keputusan terpisah.
- Tandai-sudah-dibaca per item (lihat "Status baca").
- Perubahan pada jalur *menulis* mention: autocomplete, pill, `recordCommunityMentions`.

## UX

### Letak

Bell (`lucide-react` `Bell`) berada persis di kiri toggle light/dark, di **dua**
header `DashboardLayout`:

- Header sub-halaman (`src/components/DashboardLayout.tsx` ~:752) — mengikuti
  `compactHeader`: `h-8 w-8 rounded-lg` saat compact, `h-11 w-11 rounded-xl`
  selain itu; ukuran ikon `14` / `16`.
- Header home/card-grid (~:1047) — `w-9 h-9 rounded-xl`, ikon `16`.

Gaya tombol menyalin toggle tema di sebelahnya, supaya keduanya terbaca sebagai
satu pasangan kontrol.

Bell hanya dirender jika `terasEnabled` (`isCommunityEnabledForAgent(agentData.slug)`,
sudah ada di DashboardLayout ~:573).

Tombol `@` di baris composer Teras (`TerasPage.tsx` ~:3002–3072) **dihapus**,
bukan diduplikasi.

### Badge

Titik angka di pojok kanan-atas bell, hijau (`bg-emerald-500`), teks putih
`text-[10px] font-bold`. Menampilkan `9+` bila lebih dari 9. Tidak dirender saat
jumlah nol.

### Panel

Dropdown yang di-anchor ke bell (`absolute right-0 top-full`), lebar
`min(20rem, calc(100vw-2rem))`, `role="dialog"`, judul **"Notifikasi"**, tombol
tutup `X`, dan overlay klik-di-luar — meniru struktur popover mention yang
sekarang, termasuk perilaku Escape.

Isi: satu daftar campur, urut `created_at` menurun, maksimum 30 item.

| Jenis | Teks | Cuplikan |
|---|---|---|
| `mention` | "**Rina** menyebutmu" / "**Rina** membalas menyebutmu" | isi post/komentar, 140 char |
| `comment` | "**Rina** berkomentar di postinganmu" | isi komentar, 140 char |
| `reaction` | "**Rina** menyukai postinganmu" / "**Rina** & 2 lainnya menyukai postinganmu" | isi post, 140 char |

Setiap item: avatar aktor (aktor terbaru untuk reaksi tergabung), ikon kecil
penanda jenis, dan waktu relatif (`timeAgo`). Klik → navigasi ke
`/dashboard/teras/post/<post_id>` lewat `onNavigate` yang sudah dipakai
DashboardLayout.

Keadaan kosong: "Belum ada notifikasi." Keadaan memuat: "Memuat…".

### Status baca

Watermark tunggal per agent, bukan per item:

- Membuka panel memicu `POST …/seen`, yang menyetel watermark ke waktu sekarang.
  Badge langsung nol (optimistis di klien).
- Item yang lebih baru dari watermark **sebelum** panel dibuka tetap bertanda
  latar hijau tipis selama panel itu terbuka, lalu normal saat dibuka lagi.
- Konsekuensi yang diterima: tidak ada "tandai satu sudah dibaca".

## Arsitektur

### Prinsip

Notifikasi **diturunkan** dari tabel yang sudah ada, bukan di-fan-out ke tabel
baru saat event terjadi. Alasannya:

- Nol DDL. Kendala nyata proyek ini: DDL hanya bisa dijalankan dengan menempel
  SQL manual di Supabase SQL Editor.
- Nol perubahan write-path, jadi tidak ada kelas bug "notifikasi menyimpang dari
  kenyataan". Reaksi yang di-toggle on/off/on otomatis konsisten; pada model
  fan-out ia butuh logika dedupe + hapus baris.
- Riwayat lengkap sejak hari pertama, tanpa backfill.

Ongkosnya: tiga query per poll dan agregasi reaksi dihitung tiap request. Untuk
komunitas berukuran puluhan agent ini tidak terasa. Bila volume naik, model
fan-out bisa menggantikannya tanpa menyentuh UI, karena bentuk respons endpoint
tidak berubah.

### Endpoint

Tiga endpoint baru menggantikan trio `/api/community/mentions*`. Semuanya
`authMiddleware` + `requireCommunityAccess`, dan yang membaca juga
`dbLoadShedGuard` — sama seperti endpoint mention yang digantikan.

```
GET  /api/community/notifications/head  → { success, data: { unread_count } }
GET  /api/community/notifications       → { success, data: { items, seen_at } }
POST /api/community/notifications/seen  → { success }
```

- **head** — menghitung event dengan `created_at > watermark` dari tiga sumber,
  dijumlahkan, di-cap 99. Reaksi dihitung setelah digrup per post, agar satu post
  dengan lima reaksi baru bernilai satu.
- **list** — mengambil 30 terbaru tiap sumber, menyerahkannya ke helper murni,
  mengembalikan hasil gabungan 30 teratas beserta `seen_at` saat itu.
- **seen** — menulis `teras_notif_seen_at` (ISO string) ke
  `agents.notification_prefs`, kolom jsonb yang sudah dipakai untuk preferensi
  Telegram. Read-modify-write pada satu baris agent.

Bentuk item:

```jsonc
{
  "id": "mention:<uuid>" | "comment:<uuid>" | "reaction:<post_id>",
  "type": "mention" | "comment" | "reaction",
  "post_id": "<uuid>",
  "actor": { "name": "...", "photo": "..." },   // aktor terbaru
  "actor_count": 1,                              // >1 hanya untuk reaction
  "snippet": "...",
  "created_at": "2026-07-19T...",
  "unread": true
}
```

### Query

Komentar dan reaksi memakai inner-join PostgREST supaya filter kepemilikan
dikerjakan Postgres, bukan Node:

```js
supabase.from('community_post_comments')
  .select('id, post_id, body, created_at, agent_id, \
    author:agents!...(name, photo), \
    post:community_posts!inner(agent_id, deleted_at)')
  .eq('post.agent_id', agent.id)
  .neq('agent_id', agent.id)        // komentarku sendiri bukan notifikasi
  .is('deleted_at', null)
  .order('created_at', { ascending: false })
  .limit(30)
```

Bentuk yang sama untuk reaksi (tanpa `deleted_at` pada barisnya sendiri — tabel
reaksi tidak punya soft-delete; toggle = hapus baris). Mention memakai query yang
sudah ada di endpoint `/api/community/mentions`, tanpa perubahan.

Baris yang post-nya `deleted_at` tidak null dibuang. Ketiga query berjalan
paralel lewat `Promise.all`.

### Modul murni `lib/community-notifications.js`

Mengikuti pola `lib/community-mentions.js` — semua aturan penggabungan hidup di
sini, bisa dites tanpa DB:

- `groupReactionRows(rows)` — grup per `post_id`; `created_at` = yang terbaru,
  `actor` = aktor terbaru, `actor_count` = jumlah aktor unik.
- `mergeNotifications({ mentions, comments, reactions }, seenAt, limit = 30)` —
  normalisasi ketiga sumber ke bentuk item di atas, tandai `unread` terhadap
  `seenAt`, urut menurun, potong ke `limit`.
- `countUnread(...)` — jumlah item `unread` setelah reaksi digrup, di-cap 99.

Tes: `tests/community-notifications.test.js` (node:test), mencakup grouping
reaksi, urutan campur, batas `limit`, watermark null (semua unread), dan cap 99.

### Frontend

- `src/hooks/useTerasNotifications.ts` — polling head 30 detik, hanya saat
  `document.visibilityState === 'visible'`, plus refresh sekali saat tab kembali
  terlihat. Memuat daftar ketika panel dibuka; mengirim `seen` dan menolkan badge
  secara optimistis. Dipanggil **sekali** di DashboardLayout dan digate
  `terasEnabled`, sehingga dua header tidak menghasilkan dua polling.
- `src/components/NotificationBell.tsx` — tombol, badge, dan panel. Presentational
  di atas state hook; menerima `compact` untuk varian header sub-halaman dan
  `onOpenPost(postId)` untuk navigasi.
- `src/lib/communityNotifications.ts` — tipe item bersama dan formatter teks sisi
  klien ("Rina & 2 lainnya menyukai postinganmu").
- `src/components/TerasPage.tsx` — hapus `mentionUnread`, `mentionInbox`,
  `mentionInboxOpen`, `mentionInboxLoading`, efek polling head, `openMentionInbox`,
  dan blok JSX tombol `@` + popover. Jalur menulis mention tidak disentuh.

### Yang dihapus di server

`/api/community/mentions/head`, `/api/community/mentions`, dan
`/api/community/mentions/seen` dihapus — konsumennya hilang bersama popover lama.

Tabel `community_mentions`, `recordCommunityMentions`, dan nudge Telegram-nya
**tetap**; tabel itu kini murni sumber baca untuk union. Kolom `seen_at`-nya
berhenti dipakai dan dibiarkan apa adanya di DB (tanpa DDL).

### Penanganan galat

- Toleransi `isCommunityMentionSchemaMissing` dipertahankan: bila tabel mention
  tidak ada di suatu environment, sumber mention dianggap kosong dan bell tetap
  jalan dengan komentar + reaksi — bukan 500.
- Kegagalan poll head diabaikan diam-diam (seperti perilaku sekarang); badge
  mempertahankan nilai terakhir.
- Kegagalan memuat daftar menampilkan pesan galat di dalam panel, bukan menutupnya.
- Kegagalan `seen` tidak mengembalikan badge ke nilai lama — poll berikutnya yang
  mengoreksi.

## Verifikasi

- `node --test tests/community-notifications.test.js` — logika murni.
- `node --test tests/community-mentions.test.js` — memastikan jalur menulis
  mention tidak tersenggol.
- `npx tsc --noEmit` dan `npx vite build` — FE (eslint v10 belum dikonfigurasi di
  repo ini).
- Uji manual dengan dev-JWT: badge muncul di tab non-Teras, panel membuka,
  navigasi ke detail post benar, badge nol setelah dibuka.

DB lokal menunjuk ke produksi. Uji manual dibatasi pada operasi baca; membuat
komentar atau reaksi percobaan perlu konfirmasi pemilik proyek terlebih dahulu.

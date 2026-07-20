# Pengaturan Notifikasi Teras

Tanggal: 2026-07-20

## Masalah

Teras memancarkan empat jenis peristiwa — sebutan (`@nama`), balasan/komentar pada
kiriman saya, reaksi pada kiriman saya, dan pengumuman `@semua`. Semuanya masuk ke
lonceng tanpa bisa dimatikan; badge tidak pernah sepi, dan agen tidak punya cara
menyaring yang mana yang layak mengganggu.

Di sisi Telegram keadaannya terbalik: hanya sebutan yang dikirim keluar
(`server.js:4104`, gerbang `community_mentions`). Balasan pada kiriman sendiri —
peristiwa yang paling menuntut jawaban — tidak sampai ke ponsel sama sekali.

## Yang dibangun

Matriks 4×2: empat jenis peristiwa × dua kanal (lonceng, Telegram), dibuka lewat
ikon gerigi di header, di antara lonceng dan toggle terang/gelap.

```
                        🔔      Telegram
Sebutan (@nama)        [ON]      [ON]
Balasan & komentar     [ON]      [off]
Reaksi                 [ON]      [off]
Pengumuman @semua      [ON]      [off]
```

Kolom lonceng menyaring apa yang masuk daftar dan hitungan badge. Kolom Telegram
menentukan peristiwa mana yang di-push keluar — tiga di antaranya jalur baru.

## Keputusan dan alasannya

### Default = perilaku hari ini

Lonceng semua menyala; Telegram hanya sebutan. Rilis tidak mengubah apa pun bagi
agen yang tidak menyentuh pengaturan. Menyalakan push Telegram baru secara default
berarti mengirim gelombang pesan yang tidak pernah disetujui siapa pun.

Konsekuensi yang diterima: fitur ini nyaris tak terpakai bila rilisnya tidak
disertai pengumuman ke para agen.

### "Mati" berarti hilang total dari lonceng

Sumber yang dimatikan tidak dihitung badge **dan** tidak muncul di daftar. Ini
yang diharapkan orang saat mematikan sesuatu, dan memungkinkan penyaringan di
level query alih-alih setelah data diambil.

Konsekuensi yang diterima: peristiwa selama saklar mati tidak bisa ditengok ulang
dari lonceng. Reaksi dan komentar tetap terlihat pada kirimannya sendiri.

### Instan vs terkumpul

| Peristiwa | Telegram | Alasan |
|---|---|---|
| Sebutan | instan | Orang menunggu jawaban. Jalur ini sudah ada dan tidak diubah. |
| `@semua` | instan | Satu peristiwa tunggal — tidak ada yang perlu digabung. Menundanya membatalkan alasan `@semua` dipakai. |
| Komentar | terkumpul 10 menit, per kiriman | Bisa datang bertubi pada satu kiriman. |
| Reaksi | terkumpul 10 menit, per kiriman | Idem, dan paling berisik. |

Lonceng sudah memecahkan penggabungan reaksi lewat `groupReactionRows`
(`lib/community-notifications.js`). Telegram memakai jalan yang sama alih-alih
menemukan aturan kedua yang bisa menyimpang.

Jendela 10 menit adalah tebakan tanpa data pendukung. Ia hidup sebagai satu
konstanta bernama supaya bisa diubah tanpa menyentuh logika.

### Tanpa saklar induk

Delapan saklar sudah cukup. Saklar induk "matikan semua Teras" menambah keadaan
yang harus disepakati dengan delapan saklar di bawahnya, dan mematikan seluruh
kolom lonceng sudah menghasilkan efek yang sama.

## Arsitektur

### Penyimpanan — tanpa DDL

Semua kunci menumpang `agents.notification_prefs` (jsonb) yang sudah ada. Tidak
ada tabel baru dan tidak ada SQL yang harus ditempel manual di Supabase.

```
teras_bell_mention / _comment / _reaction / _broadcast   default true
community_mentions   (Telegram — sebutan, kunci lama)    default true
teras_tg_comment / _reaction / _broadcast                default false
teras_tg_sent_at     watermark pengiriman terkumpul
teras_notif_seen_at  watermark badge (sudah ada)
```

Kunci Telegram untuk sebutan **tetap bernama `community_mentions`**, bukan
`teras_tg_mention`. Kunci itu sudah dibaca di `server.js:4104` dan agen sudah
pernah mengubahnya; mengganti nama demi keseragaman akan diam-diam mereset pilihan
mereka. Ketidakseragaman ini disengaja dan diberi komentar penjelas di tempatnya.

### Unit

| Unit | Tanggung jawab | Bergantung pada |
|---|---|---|
| `lib/teras-notification-prefs.js` | default, `normalize`, `filterValidKeys` | — (murni) |
| `lib/teras-telegram-digest.js` | baris mentah → daftar pesan per pemilik kiriman | helper murni `community-notifications.js` |
| `GET/PUT /api/community/notification-prefs` | baca/tulis 8 kunci + `telegram_connected` | dua lib di atas, Supabase |
| sapuan cron per menit | ambil → kelompokkan → kirim → majukan watermark | `teras-telegram-digest.js`, Telegram |
| `src/components/TerasNotificationSettings.tsx` | tombol gerigi + panel matriks | endpoint prefs |

`/api/telegram/prefs` yang lama tidak berubah. Kedua endpoint berbagi kunci
`community_mentions`, jadi halaman Telegram dan panel Teras selalu menampilkan
nilai yang sama.

### Kolom lonceng

Preferensi diteruskan ke `loadTerasNotificationSources`; sumber yang dimatikan
tidak di-query sama sekali.

Syarat mutlak: jalur `/head` (badge) dan `/notifications` (daftar) memakai gating
yang identik. Bila menyimpang, badge dan isi panel akan bertentangan.

### Sapuan terkumpul

Berjalan tiap menit, dijaga `shouldRunBackgroundJobs()` dan `isDbDegraded()`,
dengan satu penanda "sedang berjalan" agar sapuan tidak tumpang tindih.

1. Cutoff = `sekarang − 10 menit`.
2. Dua query **global** (bukan per agen): komentar dan reaksi dengan
   `created_at ≤ cutoff`, dibatasi lantai `sekarang − 24 jam`, membawa
   `post.agent_id` sebagai pemilik.
3. Kelompokkan di JS: pemilik → kiriman. Buang baris yang lebih tua dari
   `teras_tg_sent_at` milik pemilik tersebut.
4. Buang komentar yang sudah terkirim sebagai sebutan, memakai ulang
   `dedupeCommentsAgainstMentions`.
5. Kirim satu pesan per kiriman per jenis.
6. Majukan `teras_tg_sent_at` pemilik ke cutoff.

Dua query per menit untuk seluruh sistem, bukan per agen — inilah sebabnya tidak
dibutuhkan tabel antrian. Watermark ada di baris agen, jadi restart dan deploy
tidak menduplikasi maupun menghilangkan pesan; timer di memori akan bocor pada
keduanya.

Saat agen menyalakan sebuah saklar Telegram, `teras_tg_sent_at` di-set ke
*sekarang* supaya ia tidak dibanjiri riwayat sehari ke belakang.

### `@semua` instan

Fan-out ke semua agen ber-`telegram_chat_id` dengan `teras_tg_broadcast` menyala,
kecuali penulisnya sendiri. Pengiriman ditempatkan **setelah seluruh pemeriksaan
`throw` selesai**: notifikasi yang dipancarkan sebelum jalur gagal akan terkirim
berulang saat ada percobaan ulang.

### Kegagalan

`try/catch` per agen. Satu `chat_id` yang memblokir bot tidak boleh membatalkan
pengiriman ke agen lain — kegagalan inilah yang dulu membekukan retensi analytics.

## UI

Komponen `TerasNotificationSettings` memasang tombol gerigi di dua header
(`DashboardLayout.tsx:795` dan `:1107`), di antara lonceng dan toggle tema, ikut
gerbang `terasEnabled`, dengan tiga varian ukuran yang sama seperti
`NotificationBell` (`compact` / `header` / `home`).

Permukaannya adalah **bottom sheet selebar layar**, bukan panel mengambang seperti
lonceng. Alasannya terukur: panel mengambang 330 px menyisakan 140 px untuk label
di layar 360 px — "Pengumuman @semua" melipat dan keterangannya menyesakkan. Sheet
selebar layar memberi 174 px, cukup satu baris untuk judul dan keterangan, dan
lebih mudah dijangkau satu tangan.

Konsekuensinya `measurePanelAnchor` milik lonceng tidak dipakai di sini — sheet
tidak perlu penjangkaran ke tombolnya. Tidak ada helper bersama yang perlu
diangkat.

Perilaku:

- Kolom Telegram nonaktif dan redup bila agen belum menyambungkan Telegram, dengan
  tautan ke halaman penyambungan. Bukan saklar menyala yang diam-diam tak berefek.
- Penyimpanan optimistis per saklar; gagal → saklar kembali ke posisi semula plus
  toast. Tidak ada tombol "Simpan".
- Satu baris penjelas: komentar dan reaksi dikirim terkumpul tiap 10 menit.

Rancangan visualnya ada di `~/Downloads/teras.pen`, empat layar: bottom sheet
terang (390 px), uji lebar sempit (360 px), varian gelap, dan keadaan Telegram
belum tersambung.

## Pengujian

Mengikuti pola repo: helper murni diuji di `tests/`, kontrak UI di berkas browser
test.

`tests/teras-notification-prefs.test.js`
- default cocok dengan perilaku hari ini;
- agen tanpa kunci apa pun mendapat perilaku hari ini;
- `community_mentions: false` yang tersimpan tetap dihormati;
- kunci asing pada badan PUT ditolak.

`tests/teras-telegram-digest.test.js`
- 15 reaksi pada satu kiriman → 1 pesan;
- reaksi pada dua kiriman → 2 pesan;
- komentar yang juga sebutan → tidak ada pesan (sudah dikirim instan);
- baris lebih tua dari watermark → diabaikan;
- kiriman terhapus → tidak ada pesan;
- reaksi dari diri sendiri → tidak ada pesan.

`tests/community-notifications.test.js` (perluasan)
- sumber yang dimatikan hilang dari daftar dan dari hitungan badge, memakai
  preferensi yang sama.

Kontrak UI
- gerigi hanya muncul bila `terasEnabled`;
- kolom Telegram nonaktif saat Telegram belum tersambung;
- saklar kembali ke posisi semula saat PUT gagal.

**Verifikasi manual yang wajib:** pesan Telegram sungguhan sampai dengan format
yang benar, untuk sebutan, `@semua`, komentar terkumpul, dan reaksi terkumpul.
Tidak ada unit test yang membuktikan ini, jadi pekerjaan tidak boleh diklaim
selesai berdasarkan test suite saja.

## Di luar lingkup

Jam tenang; bisukan per kiriman atau per utas; notifikasi push browser; notifikasi
email; saklar induk "matikan semua Teras". Semuanya masuk akal sebagai lanjutan,
tidak satu pun dibutuhkan untuk menjawab keluhan yang ada sekarang.

## Risiko

1. Jendela 10 menit adalah tebakan; perlu ditinjau setelah pemakaian nyata.
2. `@semua` instan × banyak agen = ledakan pesan serempak. Kuota harian `@semua`
   yang sudah ada meredamnya, tapi tetap perlu diawasi setelah rilis.
3. Kolom Telegram default mati membuat fitur ini tak terpakai tanpa pengumuman.

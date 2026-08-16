# Direktori Hotel v2 — Desain

**Tanggal:** 2026-08-16
**Status:** Mockup Pencil selesai & disesuaikan design system; menunggu review user. Belum ada rencana implementasi.

> Dirancang ulang dari nol atas permintaan user. **Tidak mengacu** spec lama 2026-07-24
> (arsip `arsip/direktori-hotel-2026-07-24`); konsep kolaboratif, seed otomatis, link IG/YT,
> dan share WA dari versi lama tidak dibawa.

## Ringkasan

Direktori hotel untuk agent di dashboard: info hotel, jarak ke masjid, dan foto/video.
Semua data dikelola satu admin (agent **nikita**). Agent lain murni melihat. Navigasi
wajib melewati pemilihan kategori kota dulu: **Mekkah, Madinah, Turki, Dubai**.

## Keputusan produk (hasil brainstorm 2026-08-16)

| Aspek | Keputusan |
|---|---|
| Audiens | Agent dashboard; murni melihat (tanpa kontribusi) |
| Admin | Nikita, dinaikkan jadi **admin penuh** (role `admin` yang sudah ada; bukan flag khusus hotel — pilihan user, sadar konsekuensi nikita ikut membuka menu admin lain) |
| Data per hotel | **Lengkap**: nama, bintang, kategori, jarak ke masjid, area/distrik, alamat lengkap, link Google Maps, deskripsi, fasilitas, catatan internal agent, foto & video |
| Jarak | Hanya Mekkah (→ Masjidil Haram) & Madinah (→ Masjid Nabawi); label otomatis dari kategori. Turki/Dubai tanpa jarak — tampil area/distrik |
| Media | Upload langsung file foto & video dari galeri (pipeline CDN Bunny). Batas di mockup: foto 3MB, video 20MB — final ditentukan saat implementasi |
| Pintu masuk | Kartu "Direktori Hotel" di halaman **Tools** (bukan menu utama) |
| Kategori | **4 tetap**; tambah kota baru = update aplikasi (bukan dikelola admin) |
| Bentuk admin | **Panel Kelola terpisah** (bukan tombol inline di halaman agent) |

## Alur

- **Agent:** Tools → Direktori Hotel → **Pilih Kategori (wajib)** → Daftar Hotel per kategori (dengan pencarian) → Detail Hotel.
- **Admin (nikita):** tombol "Kelola" di header direktori (hanya tampil untuk role admin) → **Panel Kelola Hotel** → Form Tambah/Edit atau Dialog Hapus.

## Layar (7 frame — mockup di `~/Downloads/direktori-hotel.pen`)

1. **Tools** — kartu "Direktori Hotel" (tile teal, badge BARU) di antara tools lain.
2. **Pilih Kategori** — 4 kartu foto kota + jumlah hotel; footer "Data hotel dikurasi admin. Ada koreksi? Hubungi Nikita."; tombol "Kelola" di header khusus admin.
3. **Daftar Hotel** — header "Hotel Mekkah · 12 hotel · jarak ke Masjidil Haram", kolom cari "Cari...", kartu: cover, nama, bintang, pill jarak (emerald) / area, hitungan "8 foto · 2 video". Hotel tanpa foto tetap tampil dengan badge amber "Belum ada foto".
4. **Detail Hotel (versi agent)** — galeri swipe + strip thumbnail (video ikut, ikon play), chip kategori (teal), nama + bintang, banner jarak emerald ("±250 m dari Masjidil Haram · ±4 menit jalan kaki"), deskripsi, chips fasilitas, alamat + tombol "Buka di Google Maps", kotak amber **"Catatan Agent (internal)"** ber-ikon gembok, seksi video (player inline + durasi). Tanpa tombol edit.
5. **Panel Kelola Hotel (admin)** — filter pill per kategori ("Semua" aktif emerald), "+ Tambah" emerald, baris hotel: thumbnail, nama, kategori, status "✓ Lengkap" / "Belum ada foto", aksi ikon edit (36px, abu) & hapus (36px, merah soft).
6. **Form Tambah/Edit** — 4 seksi: INFO DASAR (nama*, kategori* via SegmentedControl 4 opsi, bintang), LOKASI (jarak ke masjid — *hanya muncul untuk Mekkah/Madinah*, area/distrik, alamat, link Google Maps), KONTEN (deskripsi, fasilitas chips + tambah, catatan agent + helper "hanya terlihat sesama agent"), FOTO & VIDEO (area upload + batas ukuran, thumbnail dengan badge Cover teal & tombol hapus per item). Footer sticky: "Simpan Hotel" emerald + "Batal".
7. **Dialog Hapus** — ikon trash merah, "Hapus {nama}?", peringatan kaskade ("Semua data, foto, dan video hotel ini akan terhapus permanen"), tombol Batal / Hapus (red-600).

## Kepatuhan Design System (`docs/DESIGN-SYSTEM.md`)

- Judul halaman 14px bold; header sticky putih + border-b gray-100; padding horizontal 16 (`px-4`); shell `max-w-lg`.
- **CTA primer & filter pill aktif = emerald-500** (+ shadow emerald): "+ Tambah", "Simpan Hotel", pill "Semua".
- **Aksen fitur Hotel = teal** (tile Tools, chip kategori, tombol Kelola, badge Cover). Amber dipakai **hanya** untuk warning ("Belum ada foto", kotak Catatan Agent) agar tidak bentrok dengan aksen Jamaah/semantik warning. Danger = red-600. Jarak = emerald soft.
- Kategori di form memakai pola **SegmentedControl** (track gray-100, segmen aktif putih + teks emerald).
- Label form uppercase ~12px + `*` merah untuk field wajib; input `rounded-xl` border gray-200; kartu `rounded-2xl` border gray-100 + shadow-sm; ikon lucide; tombol ikon 36px `rounded-xl`.
- Mockup light-mode saja; implementasi wajib menyertakan pasangan `dark:` sesuai DS.

## Perilaku penting

- Kategori wajib dipilih sebelum daftar hotel (tidak ada daftar gabungan lintas kota untuk agent).
- Hotel tanpa foto tetap tampil di daftar (undangan melengkapi, bukan disembunyikan).
- Field jarak di form muncul/hilang mengikuti kategori; label ("dari Masjidil Haram" / "dari Masjid Nabawi") otomatis, nikita cukup isi angka/teks jarak.
- Hapus hotel menghapus seluruh foto/video-nya (kaskade) dan wajib melewati dialog konfirmasi.
- Catatan Agent bersifat internal antar-agent, ditandai jelas (gembok + "internal") supaya tidak diteruskan ke jamaah.

## Di luar lingkup v2

Integrasi ke kartu/detail paket, tombol share WA, seed otomatis dari data paket, link
IG/YouTube, tampilan Portal Jamaah/publik, dan kelola kategori dinamis — tidak dibahas
di brainstorm ini; jangan diasumsikan.

## Langkah berikutnya

1. Review user atas spec + mockup ini.
2. Setelah disetujui: buat rencana implementasi (skill writing-plans) — skema data, endpoint, dan komponen FE dirancang di tahap itu.

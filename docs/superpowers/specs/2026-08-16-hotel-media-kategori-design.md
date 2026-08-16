# Kategori Media Hotel — Desain

Tanggal: 2026-08-16
Konteks: page feedback di `/dashboard/hotels/edit/:slug/media` — "setiap hotel
memiliki 3 kategori default: Lobby, Kamar, Restoran. User bisa assign kategori,
dan bisa juga tambah/edit/hapus kategori."

Lanjutan [Direktori Hotel v2](2026-08-16-direktori-hotel-v2-design.md).

## Keputusan user (brainstorm)

1. **Cakupan**: kategori dipakai sampai galeri sisi agent, bukan cuma rapi-rapi
   di panel admin — agent bisa menyaring foto per kategori.
2. **Bentuk data**: kategori = label yang menempel di tiap media, BUKAN daftar
   tersendiri. Lobby/Kamar/Restoran ditawarkan sebagai preset siap-klik (pola
   `FACILITY_PRESETS` yang sudah dipakai di form yang sama).
3. **Galeri agent**: chip kategori hidup DI DALAM tab Foto. Tab Foto|Video tetap;
   video tidak berkategori (0–2 per hotel, tak perlu disaring).
4. **Panel Kelola**: grid media dikelompokkan jadi blok per kategori.
5. **Dibuang atas permintaan user**: aksi "Ganti nama" dan "Kosongkan" di judul
   blok. Kategori hilang dengan sendirinya saat foto terakhirnya dipindah —
   itulah bentuk "hapus kategori" di sini.

## Data

Tiap item media jadi `{ type, url, category? }`:

- `category` opsional, string, dipangkas spasi, maksimal 30 karakter (cermin
  `LIMITS.facility`). Kosong = kunci `category` TIDAK ditulis, bukan `""`.
- **Tanpa migrasi DB.** `hotel_media_is_valid` (migrasi 20260816000000) hanya
  mewajibkan `type` dan `url` ada dan sah; kunci tambahan lolos apa adanya.
  Penegakan sesungguhnya di `normalizeHotelMediaInput` (server menolak payload
  cacat). Ini disengaja: dua migrasi hotel lain masih menunggu dijalankan
  manual, jadi fitur ini tidak ikut terblokir.
- Daftar kategori **diturunkan** dari label yang terpakai. Tidak ada kolom
  daftar terpisah, jadi tidak ada state "kategori kosong yang tersimpan".

Tidak ada batas jumlah kategori: media sudah dibatasi 30 per hotel, dan menolak
Simpan gara-gara "kategori kebanyakan" lebih merugikan daripada baris chip yang
sedikit panjang.

## Helper (lib/hotel-directory.js)

- `HOTEL_MEDIA_CATEGORY_PRESETS = ['Lobby', 'Kamar', 'Restoran']` — diekspor,
  dipakai server dan FE (FE mengimpor lewat `../../lib/`, preseden
  itinerary-tempat / teras-linkify).
- `normalizeHotelMediaInput` menerima `category`; non-string atau >30 karakter
  = payload ditolak (fail-closed, sama seperti field media lain).
- `hotelMediaCategories(media)` → daftar kategori terpakai, terurut:
  preset dulu sesuai urutan preset, lalu kategori bikinan sendiri sesuai urutan
  kemunculan. Dedup **case-insensitive**; ejaan preset menang atas ejaan yang
  diketik user ("lobby" tampil sebagai "Lobby"), selain preset memakai ejaan
  kemunculan pertama.

## Panel Kelola — tab Media

Tombol unggah tetap di atas. Di bawahnya blok per kategori:

- **Lobby, Kamar, Restoran selalu tampil walau kosong** — itu guna "default":
  kelihatan mana yang belum diisi. (Beda dari galeri agent, yang hanya
  menampilkan kategori berisi.)
- Lalu blok kategori bikinan sendiri, lalu **Tanpa kategori** yang muncul hanya
  bila ada isinya.
- Unggahan baru selalu mendarat di Tanpa kategori.
- Ketuk thumbnail → bottom sheet "Pindahkan ke": chip semua kategori + Tanpa
  kategori + kolom ketik nama baru. Sheet mengikuti pola `HotelFilterSheet.tsx`
  (portal, backdrop, kunci scroll body, Escape, handle bar).
- Kontrol thumbnail yang sudah ada (X hapus, badge/tombol Cover) tidak berubah.

Cover tetap = item pertama di array `media`, tidak terpengaruh pengelompokan —
pengelompokan murni tampilan, urutan array tidak diacak.

## Galeri agent (HotelPage)

Di dalam tab Foto, satu baris chip: `Semua · Lobby · Kamar · …`

- Hanya kategori yang **punya foto** yang muncul.
- Baris chip hilang total bila belum ada satu pun foto berkategori — aturan yang
  sama dengan chip saringan di daftar hotel ("chip hanya bila bermakna").
- Foto tanpa kategori hanya terlihat di "Semua".
- Memilih chip memindahkan penampil utama ke foto pertama kategori itu, meniru
  perilaku yang sudah ada saat berpindah tab Foto/Video.
- Skin pill ikut spesifikasi "Advanced Filter Panel" DESIGN-SYSTEM.md: aktif
  `bg-emerald-500 text-white shadow-md shadow-emerald-500/20`, non-aktif
  `bg-gray-50 dark:bg-slate-900 text-gray-500 border border-gray-200`.

## Tes

`tests/hotel-directory.test.js` (`node --test tests/*.test.js`):

- `normalizeHotelMediaInput`: category dipangkas; string kosong → kunci hilang;
  >30 karakter ditolak; non-string ditolak; item tanpa category tetap sah.
- `hotelMediaCategories`: urutan preset-dulu; dedup case-insensitive; ejaan
  preset menang; media tanpa kategori tidak melahirkan entri kosong.

Sisanya diverifikasi lewat `npm run build` + checklist manual (user yang
menjalankan e2e).

## Risiko koordinasi

`HotelPage.tsx` dan `HotelKelolaPage.tsx` sedang digarap sesi Claude lain
(galeri ala tiket.com, tab Foto|Video, FAQ). Perubahan di sini bersifat
menambah, dan di-commit dengan disiplin yang sama seperti sore ini: rakit patch
hunk sendiri di atas HEAD lalu `git update-index`, jangan `git add` berkas utuh.

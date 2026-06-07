# Optimasi Tipografi & Spacing Mobile — Landing Page /umroh

**Tanggal:** 2026-06-07
**File target:** `public/umroh.html` (ekspor statis Elementor, page id 1291)

## Masalah

Di viewport mobile banyak font tampak kebesaran karena mengikuti aturan desktop.
Akar masalah (hasil audit CSS + render Playwright @390px):

1. Halaman **sudah punya** blok `@media(max-width:767px)` bawaan Elementor di CSS
   minified (baris 51), tapi **tidak lengkap**: 145 dari 190 selector `font-size`
   tidak punya override mobile — terutama band 17–22px (judul kartu why-us,
   baris detail paket, divider, 2 tombol CTA).
2. Nilai mobile yang ada pun tidak konsisten: judul section utama campur
   24/26/28/30/32px.

## Keputusan desain

**Mekanisme:** satu blok `<style id="alhijaz-mobile-typography">` baru di akhir
`<head>`, berisi `@media (max-width: 767px)`. Selector meniru pola Elementor
(`.elementor-1291 .elementor-element.elementor-element-XXX …`) sehingga menang
lewat urutan kaskade — tanpa `!important`, tanpa menyentuh CSS minified lama.
Aturan dikelompokkan per nilai (bukan per elemen) supaya ringkas.

Alternatif yang ditolak: (a) fluid `clamp()` di CSS minified — diff tak
terbaca, desktop ikut berubah; (b) hybrid clamp+fixed — dua mental model.

**Skala tipografi mobile:**

| Kelompok | Sekarang | Jadi |
|---|---|---|
| Hero h1 | 30px | 30px (tetap) |
| Judul section utama (4c21a8ce, 16260372, 61fac271, 83b623f) | 28–32px | 26px |
| Sub-hero "Travel Umroh Akreditasi A" (58a04b4c) | 23px | 20px |
| Caption "Situs Resmi…" (1fd42544) | 20px | 16px |
| Quote review "BAGUS SEKALI" (3e2402e1) | 26px | 20px |
| "Mau Promo Spesial…" (e801ae2) | 25px | 22px |
| Judul kartu why-us (9 elemen, 22px) | 22px | 19px |
| Tombol "Konsultasi Pendaftaran Umroh" (2 elemen) | 22px | 18px |
| Tanggal paket h3 (6 elemen) | 20px | 18px |
| Baris detail paket p + ikon (±48 elemen) | 20px | 17px |
| Divider Legalitas/Rekening (3 elemen) | 20px | 18px |
| Teks ≤18px (body, bank, profil) | 16–18px | tetap (audiens 40+, jangan kekecilan) |
| Ikon statistik 41px (icon-box) | 41px | tetap (anchor visual, proporsional) |

**Spacing:** padding section mobile sebagian besar sudah ada; setelah font
mengecil, rapikan hanya yang terlihat timpang di re-render (kandidat: margin
negatif -30px yang dituning untuk font besar).

## Verifikasi

1. Playwright @390px: audit font terkomputasi + cek overflow horizontal,
   screenshot per-section before/after.
2. Desktop @1280px harus identik piksel (CSS lama tak disentuh) — pixel diff.
3. Review visual adversarial multi-agen atas pasangan screenshot per-section.

## Catatan

- Ada WIP lain yang belum di-commit di file yang sama (fix tombol "Lihat Semua
  Keunggulan" jQuery→vanilla, gambar perlengkapan CDN) — tidak disentuh.
- Breakpoint 767px mengikuti konvensi Elementor (blok mobile bawaan juga 767px).

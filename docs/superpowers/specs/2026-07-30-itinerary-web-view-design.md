# Itinerary Tampilan Web — Design

**Tanggal:** 2026-07-30
**Status:** menunggu review

## Konteks

Itinerary saat ini hanya bisa dilihat sebagai preview PDF mentah di
[`ItineraryModal.tsx`](../../../src/components/ItineraryModal.tsx) — dokumen yang digenerate
admin Alhijaz, di-zoom pakai pinch, tanpa struktur yang bisa dibaca cepat.

Sementara itu data terstrukturnya **sudah ada dan sudah jalan**:
`GET /api/itinerary/:jadwalId` ([server.js:2508](../../../server.js)) mengembalikan
`{ days: [{ dayNumber, title, location, activities: [{ time, text }] }] }` dari cache
Supabase tabel `itineraries`, atau mem-parse PDF on-demand via GPT-4o-mini kalau cache miss.

Ada juga [`WebItineraryView.tsx`](../../../src/components/WebItineraryView.tsx) yang merender
data itu sebagai timeline HTML — **tapi tidak dipakai komponen mana pun (dead code)**, dan
punya beberapa cacat yang jadi alasan utama pekerjaan ini.

## Tujuan

Tampilan web itinerary yang **enak dibaca cepat** oleh agent saat sedang chat dengan jamaah,
dan **layak di-screenshot** untuk langsung dikirim tanpa malu.

## Non-tujuan

- Mengubah pipeline ekstraksi PDF → JSON. Isi teksnya sudah dirapikan OpenAI dan diterima apa adanya.
- Menghapus preview PDF. PDF tetap sumber kebenaran dan tetap jadi tab default.
- Dark mode untuk tampilan web ini (lihat keputusan D2).
- Mengubah Portal Jamaah.

## Cacat yang diperbaiki

Delapan hal berikut ditemukan saat audit `WebItineraryView.tsx` dan saat membangun mockup:

| # | Cacat | Perbaikan |
|---|---|---|
| 1 | 4 warna hari berputar (emerald→blue→violet→amber), tak bermakna; paket 12 hari = 3 siklus rainbow | Warna = **kota**, bukan urutan hari |
| 2 | 8 ukuran font ad-hoc (`8, 9, 10, 11, 15px, xs, sm, base`) | Skala 6 langkah tetap (lihat Tipografi) |
| 3 | Gutter jam `min-w-36px` mencampur `"08:00"` dengan `"Pagi"`/`"Subuh"` | JetBrains Mono lebar-tetap; label non-numerik ditangani eksplisit |
| 4 | **Bug**: `isDark` dibaca sekali saat render ([:158](../../../src/components/WebItineraryView.tsx)) + hex hardcoded → toggle dark mode tak mengubah kartu highlight | Hilang total: tampilan light-only, warna dari token Tailwind |
| 5 | Semua aktivitas teks abu polos, tak terbedakan | Ikon per jenis aktivitas |
| 6 | `location` per hari diambil API tapi tak pernah dirender | Dirender di header hari |
| 7 | Tanpa navigasi hari; 12 hari = scroll panjang tanpa orientasi | Header hari full-bleed sticky + strip ringkasan perjalanan di atas |
| 8 | `classifyItem()` tak menandai `"Tiba di gate Cafe Zukavia gate 5 Terminal 2F…"` sebagai titik kumpul — tak ada kata "kumpul" di teksnya | Aturan posisional, bukan kata kunci (lihat Klasifikasi) |

Cacat #8 terjadi pada paket nyata (JBU1587), bukan hipotetis.

## Keputusan desain

- **D1 — Arah visual: Rail Waktu.** Satu garis vertikal menerus per hari, header hari sebagai
  pembatas full-bleed, ikon per jenis aktivitas. Dipilih dari 3 arah yang dimockup
  (Kartu Hari akordeon / Rail Waktu / Editorial). Konsekuensi yang diterima: paling panjang
  (~3.600px untuk 12 hari vs ~2.600px varian kartu), dan screenshot bisa terpotong
  di tengah aktivitas.
- **D2 — Light-only.** Metafora dokumen: itinerary adalah lembar dokumen, jadi tetap putih
  walaupun app agent sedang dark mode — sama seperti preview PDF sekarang. Menghapus seluruh
  kelas bug #4, dan screenshot selalu identik. Konsekuensi: ada kilat putih saat dibuka di
  mode gelap.
- **D3 — PDF tetap tab default.** Tab web adalah tab kedua. Perilaku pengguna lama tak berubah.
- **D4 — Rail pakai `border-left`, bukan titik berposisi absolut.** Titik bulat yang menempel
  persis di garis rail butuh `position: absolute` — itulah asal hack `-left-[27px]` + hex
  hardcoded yang jadi sumber bug #4. Ikon jenis aktivitas ditempatkan **di dalam** konten,
  bukan di atas garis. Visualnya setara, satu kelas bug hilang.
- **D5 — Tona Alhijaz, burgundy tidak dipakai ganda.** Madinah memakai hijau Kubah Nabawi
  (Qubbah al-Khadra) supaya burgundy tetap murni untuk brand & aksi. Tanpa ini, mata tak bisa
  membedakan "ini Madinah" dari "ini tombol".

## Palet

Token baru, light-only. Semua nilai kontras dihitung terhadap putih.

| Token | Hex | Kontras | Pemakaian |
|---|---|---|---|
| `ink` | `#1E1512` | 17.93:1 | teks utama |
| `ink/70` | `#5A4F49` | 7.93:1 | teks sekunder, isi aktivitas |
| `ink/45` | `#7D6E64` | **4.90:1** | teks tersier: meta hari, nama hotel, "via Dubai" |
| `line` | `#E9E1DD` | — | hairline, border kartu |
| `canvas` | `#FAF7F5` | — | latar strip & chip |
| Madinah | `#1F5F4B` | 7.51:1 | penanda kota — hijau Kubah Nabawi |
| Mekkah | `#8A6D12` | 4.91:1 | penanda kota — gold-700 |
| Transit (Dubai/Jeddah) | `#6B5A50` | 6.56:1 | penanda kota |
| Indonesia | `#4A3F39` | 10.19:1 | penanda kota |
| burgundy | `#8A0F0A` → `#C0261C` | 9.75:1 / 5.94:1 | brand & tombol aksi (gradient 135°) |
| gold | `#D4AF37` | **2.10:1** | **hanya dekoratif** |

Dua batasan yang wajib dipatuhi:

1. Nilai `ink/45` sengaja `#7D6E64`, bukan `#8E8078`. Yang terakhir hanya **3.81:1** — gagal
   WCAG AA untuk teks normal, padahal dipakai untuk subtitle, meta hari, dan nama hotel.
2. Gold `#D4AF37` hanya **2.10:1**. Boleh untuk garis 2px dekoratif; **tidak boleh** untuk teks
   atau ikon yang jadi satu-satunya pembawa informasi. Mekkah memakai gold-700 yang lolos AA.

Catatan: kolom kontras diukur terhadap putih, **kecuali** baris burgundy yang mengukur teks
putih di atas burgundy — kedua ujung gradient (9.75:1 dan 5.94:1) lolos AA, jadi label putih
aman di sepanjang gradient.

Garis rail memakai warna kota pada alpha `0x38` (~22%).

## Tipografi

Skala tetap, menggantikan 8 ukuran ad-hoc:

| Peran | Font | Ukuran | Weight |
|---|---|---|---|
| Judul halaman (share) | Calistoga | 25 | — |
| Judul hari | Inter | 13 | 600 |
| Isi aktivitas | Inter | 12.5 | 400 (500 kalau highlight) |
| Meta / tersier | Inter | 10.5 | 400 |
| Kicker uppercase | Inter | 9–9.5 | 700, letterSpacing 0.4–1.4 |
| **Jam, kode bandara, kode penerbangan, durasi** | **JetBrains Mono** | 9.5–16 | 500–700 |

JetBrains Mono untuk angka menyelesaikan cacat #3 sekaligus konsisten dengan konvensi
design system Portal Jamaah (mono untuk label/uang/tanggal).

## Klasifikasi aktivitas

Menggantikan `classifyItem()` yang murni kata kunci.

- **`kumpul`** — aktivitas **pertama pada hari pertama** (aturan posisional), ATAU teks memuat
  `berkumpul`/`kumpul`. Aturan posisional yang menyelesaikan cacat #8.
- **`takeoff`** — `berangkat menuju`, `take off`, `pesawat…menuju`, `melanjutkan dengan`
- **`landing`** — `tiba di bandara`, `mendarat`, `tiba di` + kota
- **`transit`** — teks memuat `transit`
- **`regular`** — sisanya

Ikon per jenis (lucide): `users`, `megaphone`, `badge-check`, `plane-takeoff`, `plane-landing`,
`bed-double`, `utensils`, `camera`, `landmark`, `house`. Ikon **bukan** satu-satunya pembawa
makna — jam dan teks selalu ada.

## Permukaan 1 — Tab web di modal

Di `ItineraryModal`, tab segmented: `Dokumen asli` (default) | `Tampilan web`.

Urutan isi:

1. Strip ringkasan perjalanan — bar malam proporsional per kota + legenda + baris rute
   (`CGK → DXB → JED · pulang JED → DXB → CGK`)
2. Header hari (full-bleed, sticky) + rail aktivitas — berulang per hari
3. Kartu penerbangan — berangkat & pulang: kode, jam, rute, maskapai
4. Kartu hotel — per kota + jumlah malam, sesuai tier paket
5. Footer agent — foto, nama, tombol WhatsApp
6. Footer sticky — tombol `Link` (copy) + `Bagikan itinerary`

### Celah integrasi yang harus ditutup

`ItineraryModal` saat ini hanya mendestrukturkan 4 dari 9 prop-nya; `paket`, `agentSlug`,
`agentName`, `agentPhone`, `agentPhoto` sudah ada di interface tapi diabaikan.

Lebih penting: **`jadwalId` tidak selalu tersedia di call site.**

| Call site | Kirim `paket`? | Aksi |
|---|---|---|
| [`PackageCard.tsx:2477`](../../../src/components/PackageCard.tsx) | ya | — |
| [`AskAIModal.tsx:1066`](../../../src/components/AskAIModal.tsx) | **tidak** | tambahkan `jadwal_id` ke objek attachment yang dikembalikan [server.js:1868](../../../server.js), lalu teruskan |
| [`UpcomingSchedule.tsx:574`](../../../src/components/UpcomingSchedule.tsx) | **tidak** | teruskan `jadwal_id` dari `detail` |

Tanpa `jadwalId`, tab web tidak bisa fetch. Perilaku fallback: **tab web tidak dirender sama
sekali** kalau `jadwalId` tak ada — jangan tampilkan tab yang pasti gagal.

## Permukaan 2 — Halaman share publik

Rute: **`/:slug/:packageId/itinerary`** — mis. `alhijaz.co/bagas/JBU1587/itinerary`.

Memperpanjang pola deep-link `/:slug/:packageId` yang sudah ada, sehingga Cloudflare Pages
Function [`functions/[slug]/[packageId].ts`](../../../functions/[slug]/[packageId].ts) yang
sudah menyuntik OG meta untuk preview WhatsApp bisa **diperluas**, bukan dibuat baru.

Perbedaan dari tab modal:

- Tanpa chrome modal. Diganti hero burgundy gradient: wordmark `ALHIJAZ INDOWISATA`
  (gold), judul paket Calistoga, kicker `ITINERARY PERJALANAN`, 3 chip (tanggal, maskapai, malam)
- Kartu agent lebih besar + kalimat sapaan, karena jamaah yang membaca
- Tombol sekunder `Lihat dokumen PDF asli`
- CTA sticky: `Tanya <nama agent> via WhatsApp`
- Disclaimer: "Jadwal dapat berubah menyesuaikan kondisi di lapangan."

Yang perlu ditambahkan:

- Segmen rute ketiga di [`App.tsx:37`](../../../src/App.tsx) — `pathSegments[2] === 'itinerary'`.
  Perhatikan `KNOWN_ROUTES` di function `[packageId].ts` (`kalkulasi`, `compare`, `umroh`,
  `haji`, `capi`) — daftar itu memilah segmen-kedua yang bukan package ID, jadi tak bertabrakan;
  tapi verifikasi urutan pemilahan sebelum menambah.
- OG meta: judul = nama paket, deskripsi = `12 hari · 9 malam · Emirates`, penyebutan agent.

## State

- **Loading** — skeleton rail (dot + 2 baris) ×3, bukan spinner kosong. Parse on-demand bisa
  memakan waktu (panggilan OpenAI 60s timeout), jadi sertakan teks progres.
- **Error** — pesan + tombol "Buka dokumen PDF". Jangan pernah membuat pengguna kandas: PDF
  selalu tersedia sebagai jalan keluar.
- **Kosong** (`days: []`) — perlakukan sebagai error; jatuh ke PDF.
- **Halaman share dengan itinerary belum tersedia** — 404 lembut yang mengarahkan ke halaman paket.

## Analytics

Registrasi di `server.js` (`FEATURE_LABELS` :17585, `ACTION_LABELS` :17611,
`VALID_PUBLIC_EVENTS` :17569). Event tak berlabel akan muncul sebagai slug mentah; event publik
yang tak di-whitelist **di-drop 400 secara senyap**.

| Event | Fungsi | Kapan |
|---|---|---|
| `view_itinerary_web` | `trackEvent` | tab web dibuka di app agent |
| `copy_itinerary_link` | `trackEvent` | tombol Link ditekan |
| `open_itinerary_share` | `trackPublicEvent` | halaman share dimuat |
| `wa_click_itinerary` | `trackPublicEvent` | CTA WhatsApp di halaman share |

Halaman share bersifat publik-by-slug, jadi **wajib** `trackPublicEvent`, bukan `trackEvent`
(yang butuh auth agent).

## File

| File | Aksi |
|---|---|
| `src/components/WebItineraryView.tsx` | tulis ulang — struktur rail, token baru, buang `isDark` |
| `src/components/ItineraryModal.tsx` | tambah state tab + fetch; pakai prop yang sekarang diabaikan |
| `src/components/itinerary/` (baru) | pecah: `JourneyStrip`, `DayRail`, `FlightCard`, `HotelCard`, `AgentFooter` |
| `src/components/AskAIModal.tsx` | teruskan `jadwalId` |
| `src/components/UpcomingSchedule.tsx` | teruskan `jadwalId` |
| `src/App.tsx` | rute `/:slug/:packageId/itinerary` |
| `functions/[slug]/[packageId].ts` | perluas untuk segmen `/itinerary` |
| `server.js` | daftarkan 4 event analytics; tambah `jadwal_id` ke attachment |
| `tailwind.config.js` | token itinerary (light-only) |

`WebItineraryView.tsx` yang 373 baris dipecah karena akan tumbuh dengan 4 blok tambahan.
Tiap sub-komponen menerima data yang sudah bersih dan tak tahu asal-usulnya.

## Mockup

Pencil, `pencil-new.pen`:

| Frame | Isi |
|---|---|
| `A — Kartu Hari` | arah alternatif (tak dipilih) |
| `B — Rail Waktu` | arah terpilih, palet hijau awal |
| `C — Editorial` | arah alternatif (tak dipilih) |
| `B-Alhijaz — Tab Modal` | **final** — permukaan 1 |
| `B-Alhijaz — Halaman Share` | **final** — permukaan 2 |

Semua memakai data asli JBU1587 (*PAKET HEMAT PLUS DUBAI+TAIF 12HR*, Emirates, 12 hari) supaya
panjang teks dan jumlah aktivitasnya nyata. Frame `B-Alhijaz` memotong Hari 4–11
(ditandai di kanvas) — bukan keputusan desain, hanya ringkasan mockup.

## Dua bagian paling rawan

Keduanya sudah diputuskan, tapi ini bagian dengan keyakinan paling rendah — tinjau lebih teliti.

**Jumlah malam per kota** (Dubai 1 / Madinah 3 / Mekkah 5). Di mockup ini dihitung manual.
Implementasinya: **hitung dari field `location` tiap hari**, bukan dari pola check-in/check-out
di teks aktivitas. Alasannya `location` adalah field terstruktur, sedangkan mencocokkan
`"Check out hotel menuju Bir Ali"` adalah pencocokan kata kunci — persis kelas kerapuhan yang
melahirkan cacat #8. Satu hari dihitung sebagai malam di kota terakhir yang disebut
`location`-nya; hari dengan `location` multi-kota (`"Medinah – Mekkah"`) masuk ke kota terakhir.

Kalau perhitungan ini menghasilkan total malam yang tak masuk akal (mis. > durasi paket, atau
sebuah kota nol malam padahal muncul di rute), **strip ringkasan disembunyikan** dan timeline
tetap tampil. Lebih baik hilang daripada salah.

**Tier hotel.** JBU1587 hanya punya tier `HEMAT`. Untuk paket multi-tier (Rahmah/Uhud):
tampilkan **semua tier**, karena agent memang perlu membandingkan saat sedang chat — chip di
header kartu berubah jadi tab tier. Halaman share publik menampilkan **satu tier saja** yang
dipilih agent lewat parameter, karena jamaah sudah punya tier tertentu dan menampilkan semuanya
justru membingungkan. Parameter mana yang dipakai belum ditentukan — putuskan saat implementasi
rute.

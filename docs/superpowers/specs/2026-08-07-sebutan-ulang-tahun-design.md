# Sebutan yang bisa dipilih di fitur Ulang Tahun

Tanggal: 2026-08-07
Berkas utama: `src/components/BirthdayDetailSheet.tsx` (bottom sheet di `/dashboard`)

## Masalah

Sebutan untuk jamaah yang berulang tahun **diturunkan otomatis dari jenis
kelamin** dan tidak bisa diubah agen. Padahal relasi agen–jamaah beragam:
jamaah muda lebih pas disapa "Kak"/"Mas"/"Mba", jamaah perempuan yang sudah
akrab lebih pas "Bunda".

Saat ini sebutan itu hidup di dua tempat dengan dua bentuk yang berbeda:

| Tempat | Sumber | Bentuk |
| ------ | ------ | ------ |
| Header sheet (`BirthdayDetailSheet.tsx:227`) | `jamaah.salutation` | `Bapak` / `Ibu` |
| Kartu ucapan Classic (`BirthdayCardTemplates.tsx:208`) | `jamaah.salutation` | `Bapak` / `Ibu` |
| Kartu ucapan Islamic (`BirthdayCardTemplates.tsx:383`) | `jamaah.salutation` | `Bapak` / `Ibu` |
| Pesan WhatsApp (`BirthdayDetailSheet.tsx:33`) | `jamaah.jk` langsung | `Pak` / `Bu` |

`salutation` sendiri dibentuk di server, `lib/birthdays.js:73`:
`r.jk === 'P' ? 'Ibu' : 'Bapak'`.

## Keputusan

1. **Satu dropdown mengubah semuanya** — pesan WA, kedua kartu ucapan, dan
   header sheet. Kalau agen memilih "Kak", kartunya juga tertulis "Kak Fulan".
2. **Delapan pilihan**: Bapak, Pak, Ibu, Bu, Bunda, Kak, Mas, Mba.
3. **Default `Bapak`/`Ibu`** (dari `salutation` bawaan server). Konsekuensi yang
   diterima: pesan WA bawaan berubah dari "Pak Fulan" menjadi "Bapak Fulan"
   (2 kemunculan per pesan). Kartu ucapan **tidak berubah sama sekali** dari
   kondisi sekarang.
4. **Ganti sebutan selalu menulis ulang pesan** dari template — editan manual
   tertimpa. Dimitigasi dengan menempatkan dropdown di atas kotak pesan, supaya
   alur alaminya "pilih sebutan dulu, baru edit".
5. **Tidak disimpan.** Tutup lalu buka lagi, kembali ke default dari jenis
   kelamin.

## Rancangan

### Sumber kebenaran daftar sebutan

Berkas baru `src/utils/sebutan.ts` — satu tugas, dua ekspor:

```ts
export type Sebutan = 'Bapak' | 'Pak' | 'Ibu' | 'Bu' | 'Bunda' | 'Kak' | 'Mas' | 'Mba';

export const SEBUTAN_OPTIONS: ReadonlyArray<{ value: Sebutan; label: Sebutan }>;
// urut: Bapak, Pak, Ibu, Bu, Bunda, Kak, Mas, Mba
```

Berkas terpisah, bukan konstanta di dalam `BirthdayWidget.tsx`, karena
`BirthdayDetailSheet` (lazy, `DashboardLayout.tsx:125`) butuh **nilainya**, bukan
cuma tipenya — mengimpor nilai dari `BirthdayWidget` akan menyeret komponen
widget itu ke dalam chunk sheet.

`Birthday.salutation` di `BirthdayWidget.tsx:13` diperlebar dari
`'Ibu' | 'Bapak'` menjadi `Sebutan`. Nilai lama adalah himpunan bagian dari tipe
baru, jadi tidak ada pemanggil yang rusak.

**Sisi server tidak diubah.** `lib/birthdays.js` tetap mengirim `Bapak`/`Ibu`,
dan itulah yang menjadi nilai awal dropdown. Tidak ada migrasi DB, tidak ada
endpoint baru, tidak ada perubahan pada digest Telegram
(`telegram-notifier.js:3091` tetap memakai `salutation` bawaan server).

### UI

Dropdown memakai `FilterDropdown` (`src/components/FilterDropdown.tsx`) —
pengganti kanonik `<select>` native di dashboard ini, sesuai
`docs/DESIGN-SYSTEM.md`. Bukan komponen baru.

Penempatan: blok tersendiri **di atas** kotak pesan, di dalam
`<div className="px-4 pb-4 space-y-3">`, sebelum blok "Pesan WhatsApp · bisa
diedit". Label kecil `SEBUTAN` mengikuti gaya label uppercase yang sudah dipakai
di sheet (`text-[10px] font-bold uppercase tracking-wide`).

Prop yang wajib dan alasannya:

| Prop | Nilai | Alasan |
| ---- | ----- | ------ |
| `portal` | `true` | Sheet-nya `overflow-y-auto`; tanpa portal panel terpotong |
| `portalZClass` | `z-[10000]` | Sheet ber-`z-50`; default `z-50` bisa tertimbun |
| `showAllOptions` | `true` | Ambang pencarian `FilterDropdown` adalah ≥8 opsi; daftar kita **tepat** 8, jadi tanpa ini kolom pencarian muncul untuk daftar sependek ini |
| `variant` | `'compact'` | Sepadan dengan kerapatan kontrol lain di sheet |
| `inputSkin` | `true` | Menyamai permukaan field form, bukan skin pil filter abu-abu |
| `ariaLabel` | `'Sebutan jamaah'` | Wajib |

### Perilaku

Satu state baru di `BirthdayDetailSheet`:

```ts
const [sebutan, setSebutan] = useState<Sebutan>(jamaah.salutation);
```

Penulisan ulang pesan terjadi **di dalam handler `onChange`, bukan di
`useEffect`** — konvensi yang sudah dipakai saat reset tier di fitur Compare.
Effect akan ikut menembak pada mount dan menimpa state yang baru diinisialisasi.

```ts
const handleSebutanChange = (next: string) => {
  setSebutan(next as Sebutan);
  setMessage(getDefaultMessage(jamaah, agentName, next as Sebutan));
};
```

`FilterDropdown.onChange` bertanda tangan `(v: string) => void`, jadi penyempitan
ke `Sebutan` dilakukan di handler ini — satu-satunya tempat cast itu boleh ada.

`getDefaultMessage` mendapat parameter ketiga `sebutan: Sebutan` yang
menggantikan baris `const sapaan = jamaah.jk === 'P' ? 'Bu' : 'Pak'`
(`BirthdayDetailSheet.tsx:33`). Variabel `sapaan` dipakai 2× per pesan (sapaan
pembuka dan kalimat doa); keduanya ikut berubah. Inisialisasi state `message`
juga meneruskan `jamaah.salutation` sebagai nilai awal.

Untuk kartu dan header, sebutan disuntikkan lewat objek turunan:

```ts
const jamaahDisplay = useMemo(() => ({ ...jamaah, salutation: sebutan }), [jamaah, sebutan]);
```

`jamaahDisplay` menggantikan `jamaah` di empat titik JSX: header sheet (`:227`),
dua `BirthdayCard` tersembunyi (`:355`, `:358`), dan `ThumbBox` di dalam
pemetaan template (`:313`, satu titik yang dirender dua kali). Prop `jamaah`
lain — `dayLabel(jamaah.day_offset)`, `jamaah.age`, `jamaah.wa`, nama berkas
unduhan — tetap memakai `jamaah` asli.

**Template kartu tidak disentuh sama sekali.** Keduanya sudah membaca
`jamaah.salutation`, dan `singleLineFontSize` sudah mengecilkan font mengikuti
panjang teks, jadi "Bunda"/"Bapak"/"Kak" semuanya muat.

### Analitik

Properti `sebutan` ditambahkan ke event `birthday_send` yang sudah ada
(`BirthdayDetailSheet.tsx:177`). Nama event tidak berubah, jadi tidak perlu
pendaftaran ulang di `FEATURE_LABELS`/`ACTION_LABELS` di `server.js`.

## Verifikasi

- `npm run build` — gerbang utama sisi front-end
- `npx tsc --noEmit` — proyek ini punya ±6 error bawaan yang tidak berhubungan;
  yang dinilai adalah tidak adanya error **baru** di berkas yang disentuh
- `node --test tests/birthdays.test.js` — harus tetap hijau; sisi server tidak
  berubah, jadi ini murni pengaman regresi
- Pengecekan visual (panel dropdown tidak terpotong di dalam sheet, kartu ikut
  berubah, pesan tertulis ulang) dikumpulkan sebagai checklist manual untuk
  ditelusuri pengguna, bukan dijalankan otomatis

## Di luar cakupan

- Menyimpan sebutan per jamaah di database (butuh migrasi; sebutan bersifat
  per-orang sehingga mengingatnya di localStorage justru salah untuk jamaah
  berikutnya)
- Mengubah sebutan di digest Telegram harian
- Menambah sebutan lain di luar delapan yang disepakati

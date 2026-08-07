# Gelar Haji/Hajah di fitur Ulang Tahun

Tanggal: 2026-08-07
Berkas utama: `src/components/BirthdayDetailSheet.tsx`, `src/utils/sebutan.ts`
Lanjutan dari: `2026-08-07-sebutan-ulang-tahun-design.md`

## Masalah

Dropdown sebutan yang baru rilis hanya mengurus panggilan (Bapak/Ibu/Bunda/…).
Gelar haji — "H." dan "Hj." — tidak bisa dipasang sama sekali, padahal itu
bagian yang paling terasa hormatnya dalam sapaan Indonesia: "Bapak H. Fulan",
"Ibu Hj. Fatimah".

Tidak ada kolom status haji di tabel `jamaah`
(`id_umroh, nama, jk, wa, paket, tgl_lahir, bayar, sisa, tgl_berangkat`), jadi
gelar tidak bisa diturunkan dari data — harus dipilih agen.

### Temuan data (5.397 baris `jamaah`, diambil 2026-08-07)

Empat nama (0,1%) sudah membawa gelar di dalam kolom `nama`:

| `nama` mentah | Akibat hari ini |
| ------------- | --------------- |
| `H. KHAERUL, IR  . .` | `getFirstName` mengambil token pertama → pesan berbunyi **"Bapak H."** |
| `HJ. SITTI MARWAH HAMID, IR . .` | → **"Ibu HJ."** |
| `H.M.IQBAL ALAMSYAH` | → **"Bapak H.m.iqbal"** |
| `HJ TITIN` | → **"Ibu Hj"** |

Jadi bug sapaan untuk keempat orang ini sudah ada sebelum fitur gelar, dan
menambahkan dropdown gelar tanpa penanganan akan memperburuknya menjadi
"Bapak H. H. Khaerul".

## Keputusan

1. **Dropdown kedua di samping dropdown sebutan**, berisi tiga pilihan:
   `—` (tanpa gelar), `H.`, `Hj.`. Dipilih eksplisit oleh agen, tidak
   diturunkan dari `jk` — supaya kombinasi apa pun mungkin ("Bunda Hj.",
   "Kak H.") dan agen bisa mengoreksi data `jk` yang salah.
2. **Gelar yang sudah menempel di nama dideteksi dan dipindahkan** ke dropdown:
   nilai awal dropdown = gelar hasil deteksi, dan nama dirender tanpa gelar itu.
   Hasilnya "Ibu Hj. Sitti", bukan "Ibu HJ." maupun "Ibu Hj. Hj. Sitti".
3. Gelar berlaku ke tempat yang sama dengan sebutan: pesan WA, kedua kartu
   ucapan, dan header sheet.
4. Seperti sebutan, pilihan gelar **tidak disimpan** dan **menulis ulang pesan**
   saat diubah.

## Rancangan

### Modul

`src/utils/sebutan.ts` tumbuh mengurus gelar juga. Sebutan, gelar, dan
pemisahan gelar-dari-nama selalu berubah bersamaan, jadi satu rumah — berkas
tetap di bawah ~70 baris dan tidak berubah tanggung jawabnya (ia tetap "cara
menyapa jamaah", bukan campuran domain).

```ts
export const GELAR_LIST = ['', 'H.', 'Hj.'] as const;
export type Gelar = typeof GELAR_LIST[number];
export const GELAR_OPTIONS: ReadonlyArray<{ value: Gelar; label: string }>;
// [{ value: '', label: '—' }, { value: 'H.', label: 'H.' }, { value: 'Hj.', label: 'Hj.' }]

export function isGelar(value: string): value is Gelar;
export function formatSapaan(sebutan: Sebutan, gelar: Gelar): string;
export function splitGelarFromNama(nama: string): { gelar: Gelar; nama: string };
```

`formatSapaan('Bapak', 'H.')` → `'Bapak H.'`; `formatSapaan('Bapak', '')` →
`'Bapak'`.

### Aturan deteksi gelar

`splitGelarFromNama` mencocokkan awalan `H`, `HJ`, `HJH`, `HAJI`, atau `HAJAH`
(bebas huruf besar/kecil) yang **wajib diikuti titik atau spasi**, lalu
menormalkan hasilnya: `HJ`/`HJH`/`HAJAH` → `Hj.`, `H`/`HAJI` → `H.`.

Syarat titik-atau-spasi itu penjaga utamanya. Tanpa itu, `HASAN BASRI` akan
dipotong jadi "ASAN BASRI" — kesalahan yang jauh lebih merusak daripada
masalah yang sedang dipecahkan. Nama tanpa awalan gelar dikembalikan apa
adanya, dan fungsi ini tidak pernah membuang lebih dari satu awalan.

### Alur data

Dua state di `BirthdayDetailSheet`:

```ts
const [sebutan, setSebutan] = useState<Sebutan>(jamaah.salutation);
const [gelar, setGelar] = useState<Gelar>(() => splitGelarFromNama(jamaah.nama).gelar);
```

Keduanya punya handler yang menulis ulang pesan — **di handler, bukan
`useEffect`**, alasan yang sama seperti sebutan.

Yang mengalir ke bawah adalah hasil rakitan, bukan sebutan mentah:

```ts
const namaBersih = splitGelarFromNama(jamaah.nama).nama;
const jamaahDisplay = { ...jamaah, salutation: formatSapaan(sebutan, gelar), nama: namaBersih };
```

Nama selalu dibersihkan, tak peduli isi dropdown gelar. Jadi kalau agen sengaja
memilih `—` untuk jamaah yang namanya berawalan "H.", gelar itu memang hilang
dari ucapan — itu pilihan sadar agen, bukan kebocoran. Yang dicegah adalah
gelar muncul dua kali.

Kartu dan header tidak perlu tahu soal gelar — keduanya sudah merender
`salutation` diikuti `nama`. Pesan WA menerima string sapaan itu apa adanya,
jadi parameter ketiga `getBirthdayMessage` berubah tipe dari `Sebutan` menjadi
`string` (namanya jadi `sapaan`); di dalamnya nama dibersihkan lewat
`splitGelarFromNama` supaya `getFirstName` tidak lagi mengembalikan "H.".

### Konsekuensi tipe

`'Bapak H.'` bukan anggota `Sebutan`. Ditangani dengan memisahkan tipe data
dari tipe tampilan:

- `Birthday.salutation` **tetap** `Sebutan` — itu memang yang dikirim
  `lib/birthdays.js:73`.
- `CardProps.jamaah` (`BirthdayCardTemplates.tsx:10`) dilebarkan ke
  `Omit<Birthday, 'salutation'> & { salutation: string }`. Satu baris; semua
  konsumen (`Classic`, `Islamic`, `BirthdayCard`, `BirthdayCardThumb`) mewarisi
  lewat `CardProps`, isi templatenya tidak disentuh.

### Tata letak

Baris sebutan yang sekarang (label kiri, dropdown kanan) menjadi dua kolom
berlabel — dropdown berisi `—`/`H.`/`Hj.` tanpa label terlalu misterius:

```
SEBUTAN                      GELAR
[ Bapak              ▾ ]    [ H.  ▾ ]
  flex-1                      w-24
```

Kedua dropdown memakai prop yang sama seperti dropdown sebutan sekarang:
`portal`, `portalZClass="z-[10000]"`, `variant="compact"`, `inputSkin`,
`showAllOptions`. Untuk dropdown gelar `showAllOptions` bukan soal ambang
pencarian (tiga opsi jauh di bawah ambang 8) melainkan supaya daftar sependek
itu tidak pernah kena batas tinggi `max-h-60`.

## Verifikasi

Tambahan tes di `tests/birthday-message.test.js`:

- `splitGelarFromNama` untuk keempat bentuk nyata di data
- penjaga false-positive: `HASAN BASRI` dan `HENDRA` tidak boleh terpotong
- `formatSapaan` dengan dan tanpa gelar
- satu tes pesan utuh: `"Ibu Hj. Titin"` muncul dua kali, tanpa gelar dobel

Gerbang lain sama seperti sebelumnya: `npm run build`, `npx tsc --noEmit`
(tanpa error baru), `node --test tests/birthday-message.test.js
tests/birthdays.test.js`.

## Di luar cakupan

- Menyimpan status haji di database
- Gelar akademik (Ir., Dr., S.Pd.) — data `H. KHAERUL, IR . .` menunjukkan
  gelar akademik ikut nempel di belakang nama, tapi merapikannya perkara lain
- Mengubah nama di digest Telegram atau di mana pun di luar sheet ulang tahun

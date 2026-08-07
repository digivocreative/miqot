# Dropdown Sebutan di Fitur Ulang Tahun — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agen bisa memilih sebutan jamaah (Bapak/Pak/Ibu/Bu/Bunda/Kak/Mas/Mba) dari sebuah dropdown di sheet Ulang Tahun; pilihan itu mengubah pesan WhatsApp, kedua kartu ucapan, dan header sheet sekaligus.

**Architecture:** Logika murni ditarik keluar dari komponen React ke dua modul kecil di `src/utils/` — `sebutan.ts` (daftar + tipe + type guard) dan `birthdayMessage.ts` (pembuat teks pesan). Keduanya bebas React sehingga bisa diuji sungguhan lewat harness esbuild yang sudah dipakai tes lain di repo ini. `BirthdayDetailSheet` lalu menyimpan satu state `sebutan`, menulis ulang pesan di handler `onChange`, dan menyuntikkan sebutan ke kartu lewat objek turunan `jamaahDisplay`. Sisi server tidak disentuh.

**Tech Stack:** React 18 + TypeScript, Tailwind, Vite, `node:test` + esbuild `transformSync` untuk uji modul TS.

## Global Constraints

- Delapan sebutan, urutan tetap: `Bapak, Pak, Ibu, Bu, Bunda, Kak, Mas, Mba`.
- Default saat sheet dibuka = `jamaah.salutation` dari server (`Bapak`/`Ibu`). Kartu ucapan tidak boleh berubah tampilannya dari kondisi sekarang.
- Sisi server tidak diubah: `lib/birthdays.js` dan `telegram-notifier.js` tetap apa adanya. Tidak ada migrasi DB, tidak ada endpoint baru, tidak ada localStorage.
- Ganti sebutan **selalu** menulis ulang pesan dari template (editan manual tertimpa), dan itu dilakukan **di handler `onChange`, bukan di `useEffect`**.
- Dropdown wajib memakai `FilterDropdown` (`src/components/FilterDropdown.tsx`) — pengganti kanonik `<select>` native di dashboard ini per `docs/DESIGN-SYSTEM.md`. Dilarang bikin komponen dropdown baru.
- Semua teks antarmuka berbahasa Indonesia.
- Nama event analitik tidak boleh berubah (menambah properti ke event yang sudah ada tidak butuh pendaftaran di `server.js`).

## Catatan penyimpangan dari spec

Spec menaruh daftar sebutan di `src/utils/sebutan.ts` dan diam soal `getDefaultMessage`. Rencana ini **juga memindahkan** `getDefaultMessage` + `getFirstName` keluar dari `BirthdayDetailSheet.tsx` ke `src/utils/birthdayMessage.ts`. Alasannya teknis, bukan selera: `BirthdayDetailSheet.tsx` mengimpor React, framer-motion, lucide-react, dan snapdom, sehingga tidak bisa diimpor dari `node:test`. Tanpa pemindahan ini, satu-satunya tes yang mungkin adalah tes cocok-teks-sumber — jenis tes yang di repo ini sudah terbukti basi diam-diam. Efek sampingnya sehat: komponen 415 baris itu berkurang.

## File Structure

| Berkas | Status | Tanggung jawab |
| ------ | ------ | -------------- |
| `src/utils/sebutan.ts` | Baru | Daftar sebutan, tipe `Sebutan`, type guard `isSebutan`. Tidak tahu apa-apa soal ulang tahun. |
| `src/utils/birthdayMessage.ts` | Baru | Merakit teks pesan WhatsApp ucapan ulang tahun. Murni, tanpa React. |
| `tests/birthday-message.test.js` | Baru | Uji perilaku kedua modul di atas. |
| `src/components/BirthdayWidget.tsx` | Ubah (1 baris + 1 impor) | Pelebaran tipe `Birthday.salutation`. |
| `src/components/BirthdayDetailSheet.tsx` | Ubah | State sebutan, dropdown, penyaluran ke kartu/header, analitik. Berkurang ~23 baris logika murni. |

---

### Task 1: Modul sebutan + pembuat pesan yang bisa diuji

**Files:**
- Create: `src/utils/sebutan.ts`
- Create: `src/utils/birthdayMessage.ts`
- Create: `tests/birthday-message.test.js`
- Modify: `src/components/BirthdayDetailSheet.tsx:24-46` (hapus `getFirstName` + `getDefaultMessage`, ganti dengan impor)

**Interfaces:**
- Consumes: tidak ada (tugas pertama).
- Produces:
  - `type Sebutan = 'Bapak' | 'Pak' | 'Ibu' | 'Bu' | 'Bunda' | 'Kak' | 'Mas' | 'Mba'`
  - `const SEBUTAN_LIST: readonly Sebutan[]`
  - `const SEBUTAN_OPTIONS: ReadonlyArray<{ value: Sebutan; label: Sebutan }>`
  - `function isSebutan(value: string): value is Sebutan`
  - `function getBirthdayMessage(jamaah: BirthdayMessageInput, agentName: string, sebutan: Sebutan): string`
  - `interface BirthdayMessageInput { nama: string; age: number; day_offset: number }`

- [ ] **Step 1: Tulis tesnya dulu**

Buat `tests/birthday-message.test.js`. Fungsi `importTsModule` disalin dari pola yang sudah ada di `tests/flight-route.test.js` — esbuild mentransform TS lalu diimpor sebagai data URL, jadi tidak perlu build step.

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { transformSync } from 'esbuild';

async function importTsModule(path) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'esm', sourcemap: false });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

test('daftar sebutan berisi delapan pilihan dengan urutan tetap', async () => {
  const { SEBUTAN_LIST, SEBUTAN_OPTIONS } = await importTsModule('src/utils/sebutan.ts');
  assert.deepEqual(
    [...SEBUTAN_LIST],
    ['Bapak', 'Pak', 'Ibu', 'Bu', 'Bunda', 'Kak', 'Mas', 'Mba'],
  );
  assert.equal(SEBUTAN_OPTIONS.length, 8);
  assert.deepEqual(SEBUTAN_OPTIONS[0], { value: 'Bapak', label: 'Bapak' });
  assert.deepEqual(SEBUTAN_OPTIONS.at(-1), { value: 'Mba', label: 'Mba' });
});

test('salutation bawaan server tetap sebutan yang sah', async () => {
  // lib/birthdays.js:73 mengirim 'Ibu'/'Bapak' dan itulah nilai awal dropdown.
  const { isSebutan } = await importTsModule('src/utils/sebutan.ts');
  assert.equal(isSebutan('Bapak'), true);
  assert.equal(isSebutan('Ibu'), true);
  assert.equal(isSebutan('Tuan'), false);
  assert.equal(isSebutan(''), false);
});

test('sebutan terpilih dipakai di sapaan pembuka dan kalimat doa', async () => {
  const { getBirthdayMessage } = await importTsModule('src/utils/birthdayMessage.ts');
  const msg = getBirthdayMessage(
    { nama: 'FULAN BIN FULAN', age: 40, day_offset: 0 },
    'Bagas Pramudita',
    'Bunda',
  );
  assert.equal(msg.match(/Bunda Fulan/g).length, 2);
  assert.match(msg, /\*Barakallahu fii umrik, Bunda Fulan!\*/);
  assert.match(msg, /usia ke-40 ini/);
  assert.ok(!/\b(Pak|Bapak|Ibu|Bu)\b/.test(msg), 'sebutan lama tidak boleh tersisa');
});

test('pesan H-n memakai sebutan yang sama dan hitungan hari yang benar', async () => {
  const { getBirthdayMessage } = await importTsModule('src/utils/birthdayMessage.ts');
  const msg = getBirthdayMessage(
    { nama: 'siti aminah', age: 35, day_offset: 2 },
    'Bagas',
    'Kak',
  );
  assert.match(msg, /\*Kak Siti\*, _2 hari lagi_ ulang tahun ya\./);
  assert.equal(msg.match(/Kak Siti/g).length, 2);
  assert.match(msg, /usia ke-35 nanti/);
});

test('H-1 memakai kata "besok", bukan "1 hari lagi"', async () => {
  const { getBirthdayMessage } = await importTsModule('src/utils/birthdayMessage.ts');
  const msg = getBirthdayMessage({ nama: 'Budi', age: 50, day_offset: 1 }, 'Bagas', 'Pak');
  assert.match(msg, /_besok_ ulang tahun ya\./);
  assert.ok(!msg.includes('1 hari lagi'));
});

test('nama agen kosong jatuh ke kata "Saya", tanda tangan tetap dirender', async () => {
  const { getBirthdayMessage } = await importTsModule('src/utils/birthdayMessage.ts');
  const msg = getBirthdayMessage({ nama: 'Budi', age: 50, day_offset: 0 }, '', 'Mas');
  assert.match(msg, /Saya ikut mendoakan/);
  assert.match(msg, /_Alhijaz Indowisata_$/);
});
```

- [ ] **Step 2: Jalankan tes, pastikan MERAH**

```bash
node --test tests/birthday-message.test.js
```

Expected: gagal — `ENOENT` karena `src/utils/sebutan.ts` dan `src/utils/birthdayMessage.ts` belum ada.

- [ ] **Step 3: Buat `src/utils/sebutan.ts`**

```ts
// Sebutan (honorific) yang bisa dipilih agen untuk menyapa jamaah di fitur
// Ulang Tahun. Berkas terpisah dan bukan konstanta di BirthdayWidget.tsx:
// BirthdayDetailSheet di-lazy-load (DashboardLayout.tsx:125), jadi mengimpor
// NILAI ini dari BirthdayWidget akan menyeret komponen widget itu ke dalam
// chunk sheet.

export const SEBUTAN_LIST = [
  'Bapak',
  'Pak',
  'Ibu',
  'Bu',
  'Bunda',
  'Kak',
  'Mas',
  'Mba',
] as const;

export type Sebutan = typeof SEBUTAN_LIST[number];

export const SEBUTAN_OPTIONS: ReadonlyArray<{ value: Sebutan; label: Sebutan }> =
  SEBUTAN_LIST.map(s => ({ value: s, label: s }));

export function isSebutan(value: string): value is Sebutan {
  return (SEBUTAN_LIST as readonly string[]).includes(value);
}
```

- [ ] **Step 4: Buat `src/utils/birthdayMessage.ts`**

Isi fungsi dipindahkan apa adanya dari `BirthdayDetailSheet.tsx:24-46`; satu-satunya perubahan perilaku adalah `sapaan` yang tadinya diturunkan dari `jamaah.jk` kini datang sebagai parameter.

```ts
import type { Sebutan } from './sebutan';

/** Cukup bidang yang dipakai perakit pesan — sengaja tidak mengimpor tipe
 *  `Birthday` dari komponen supaya modul ini bebas dari React. */
export interface BirthdayMessageInput {
  nama: string;
  age: number;
  day_offset: number;
}

export function getFirstName(nama: string): string {
  const first = (nama || '').trim().split(/\s+/)[0] || '';
  if (!first) return '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function getBirthdayMessage(
  jamaah: BirthdayMessageInput,
  agentName: string,
  sebutan: Sebutan,
): string {
  const jamaahFirst = getFirstName(jamaah.nama);
  const agentFirst = getFirstName(agentName) || 'Saya';

  const upcomingWord = jamaah.day_offset === 1
    ? 'besok'
    : `${jamaah.day_offset} hari lagi`;

  const doa = `Allah panjangkan umur ${sebutan} ${jamaahFirst} dengan keberkahan, dilimpahkan kesehatan, dilapangkan rezekinya, dan dimudahkan langkah menuju Baitullah`;

  const body = jamaah.day_offset === 0
    ? `*Barakallahu fii umrik, ${sebutan} ${jamaahFirst}!*\n\nDi hari yang penuh berkah ini, ${agentFirst} ikut mendoakan — semoga di usia ke-${jamaah.age} ini, ${doa}.\n\n_Aamiin Yaa Rabbal 'Alamiin_`
    : `*${sebutan} ${jamaahFirst}*, _${upcomingWord}_ ulang tahun ya.\n\nSebelum harinya, ${agentFirst} ingin doakan dulu — semoga di usia ke-${jamaah.age} nanti, ${doa}.\n\n_Aamiin Yaa Rabbal 'Alamiin_`;

  return `Assalamu'alaikum\n\n${body}\n\n— *${agentName}*\n_Alhijaz Indowisata_`;
}
```

- [ ] **Step 5: Jalankan tes, pastikan HIJAU**

```bash
node --test tests/birthday-message.test.js
```

Expected: 6 tes lulus.

- [ ] **Step 6: Buang salinan lama dari komponen**

Di `src/components/BirthdayDetailSheet.tsx`, hapus seluruh fungsi `getFirstName` (baris 24-28) dan `getDefaultMessage` (baris 30-46), lalu tambahkan impor di bawah impor `normalizeWaNumber`:

```ts
import { getBirthdayMessage } from '../utils/birthdayMessage';
```

Ganti inisialisasi state pesan (baris 92) supaya memakai fungsi baru — untuk sekarang sebutan awal diambil langsung dari `jamaah.salutation`:

```ts
const [message, setMessage] = useState(() => getBirthdayMessage(jamaah, agentName, jamaah.salutation));
```

- [ ] **Step 7: Pastikan tidak ada sisa referensi**

```bash
grep -n "getDefaultMessage\|getFirstName" src/components/BirthdayDetailSheet.tsx
```

Expected: tidak ada keluaran sama sekali.

- [ ] **Step 8: Build harus hijau**

```bash
npm run build
```

Expected: sukses. Sampai titik ini perilaku aplikasi belum berubah sedikit pun — pesan masih memakai `Bapak`/`Ibu` bawaan server (perhatikan: ini sudah menggeser nada pesan dari `Pak`/`Bu` ke `Bapak`/`Ibu`, persis keputusan di spec).

- [ ] **Step 9: Commit**

```bash
git add src/utils/sebutan.ts src/utils/birthdayMessage.ts tests/birthday-message.test.js src/components/BirthdayDetailSheet.tsx
git commit -m "refactor(ulang-tahun): pisahkan daftar sebutan & perakit pesan ke modul teruji"
```

---

### Task 2: Dropdown sebutan dan penyalurannya ke pesan, kartu, dan header

**Files:**
- Modify: `src/components/BirthdayWidget.tsx:9-22` (tipe `Birthday.salutation`)
- Modify: `src/components/BirthdayDetailSheet.tsx` (state, handler, dropdown, `jamaahDisplay`, analitik)

**Interfaces:**
- Consumes: `SEBUTAN_OPTIONS`, `isSebutan`, `type Sebutan`, `getBirthdayMessage` dari Task 1; `FilterDropdown` (default export) dari `src/components/FilterDropdown.tsx`.
- Produces: tidak ada yang dipakai tugas lain (tugas terakhir).

- [ ] **Step 1: Lebarkan tipe `salutation`**

Di `src/components/BirthdayWidget.tsx`, tambahkan impor tipe di bawah `import { getAuthHeaders } from './LoginPage';`:

```ts
import type { Sebutan } from '../utils/sebutan';
```

lalu ubah baris 13 dari `salutation: 'Ibu' | 'Bapak';` menjadi:

```ts
  salutation: Sebutan;
```

Nilai lama (`'Ibu'`, `'Bapak'`) adalah himpunan bagian dari tipe baru, jadi tidak ada pemanggil yang rusak.

- [ ] **Step 2: Tambahkan impor dan state di sheet**

Di `src/components/BirthdayDetailSheet.tsx`, tambahkan dua impor:

```ts
import FilterDropdown from './FilterDropdown';
import { SEBUTAN_OPTIONS, isSebutan, type Sebutan } from '../utils/sebutan';
```

Di dalam komponen, tambahkan state sebutan **di atas** state `message` dan pakai untuk inisialisasi keduanya:

```ts
  const [sebutan, setSebutan] = useState<Sebutan>(jamaah.salutation);
  const [message, setMessage] = useState(() => getBirthdayMessage(jamaah, agentName, jamaah.salutation));
```

> Inisialisasi `message` sengaja memakai `jamaah.salutation`, bukan `sebutan` — pada render pertama keduanya sama, dan membaca state lain di dalam inisialisator `useState` bikin urutan deklarasi jadi rapuh.

- [ ] **Step 3: Tambahkan handler perubahan sebutan**

Letakkan tepat di bawah `showToast`. **Di handler, bukan di `useEffect`** — effect ikut menembak saat mount dan akan menimpa state yang baru saja diinisialisasi (jebakan yang sudah pernah kena di fitur Compare).

```ts
  const handleSebutanChange = (next: string) => {
    if (!isSebutan(next)) return;
    setSebutan(next);
    setMessage(getBirthdayMessage(jamaah, agentName, next));
  };
```

`FilterDropdown.onChange` bertanda tangan `(v: string) => void`, jadi penyempitan tipe terjadi di sini — satu-satunya tempat yang boleh melakukannya.

- [ ] **Step 4: Buat objek turunan untuk render**

Tambahkan tepat di bawah `normalizedWa` (baris ~130):

```ts
  const jamaahDisplay = useMemo(() => ({ ...jamaah, salutation: sebutan }), [jamaah, sebutan]);
```

- [ ] **Step 5: Pasang dropdown di atas kotak pesan**

Di dalam `<div className="px-4 pb-4 space-y-3">`, sisipkan blok ini **sebelum** `<div>` yang memuat label "Pesan WhatsApp · bisa diedit". Susunannya meniru baris "Sertakan kartu ucapan" yang sudah ada (label kiri, kontrol kanan).

```tsx
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">
              Sebutan
            </div>
            <FilterDropdown
              value={sebutan}
              onChange={handleSebutanChange}
              options={SEBUTAN_OPTIONS}
              ariaLabel="Sebutan jamaah"
              variant="compact"
              widthClass="w-36"
              inputSkin
              portal
              portalZClass="z-[10000]"
              showAllOptions
            />
          </div>
```

Tiap prop ada alasannya, jangan dibuang:
- `portal` — sheet-nya `overflow-y-auto`; tanpa ini panel terpotong di tepi sheet.
- `portalZClass="z-[10000]"` — sheet ber-`z-50`; default `z-50` bisa membuat panel tertimbun.
- `showAllOptions` — ambang kolom pencarian `FilterDropdown` adalah `options.length >= 8`, dan daftar kita **tepat** 8; tanpa prop ini muncul kotak "Cari..." untuk daftar sependek itu.
- `inputSkin` — permukaan putih/slate menyamai field form, bukan pil filter abu-abu.
- `widthClass="w-36"` — trigger-nya `w-full` terhadap root; tanpa batas ini dropdown melar selebar sheet.

- [ ] **Step 6: Salurkan sebutan ke header dan kartu**

Empat titik JSX, semuanya `jamaah` → `jamaahDisplay`:

1. Header sheet — `{jamaah.salutation} {jamaah.nama}` menjadi:

```tsx
              {jamaahDisplay.salutation} {jamaahDisplay.nama}
```

2. `<ThumbBox jamaah={jamaah} ... />` di dalam pemetaan template menjadi `jamaah={jamaahDisplay}` (satu titik, dirender dua kali).

3 & 4. Kedua `<BirthdayCard ... jamaah={jamaah} ... />` tersembunyi menjadi `jamaah={jamaahDisplay}`.

Yang **tidak** boleh ikut diganti: `dayLabel(jamaah.day_offset)`, `{jamaah.age} tahun`, `jamaah.wa`, `useMemo` untuk `initials` dan `normalizedWa`, `cardFileName(jamaah, ...)`, serta `trackEvent(... { day_offset: jamaah.day_offset })`. Semuanya tetap memakai `jamaah` asli.

Template kartu (`BirthdayCardTemplates.tsx`) **tidak disentuh sama sekali** — keduanya sudah membaca `jamaah.salutation`, dan `singleLineFontSize` sudah mengecilkan font mengikuti panjang teks.

- [ ] **Step 7: Tambahkan sebutan ke analitik**

Pada `trackEvent('action', 'birthday_send', {...})` di `handleSend`, tambahkan satu properti:

```ts
      trackEvent('action', 'birthday_send', {
        template: selectedTemplate,
        has_kartu: includeKartu,
        day_offset: jamaah.day_offset,
        sebutan,
      });
```

Nama event tidak berubah, jadi tidak perlu menyentuh `FEATURE_LABELS`/`ACTION_LABELS` di `server.js`.

- [ ] **Step 8: Verifikasi otomatis**

```bash
npm run build
```

Expected: sukses.

```bash
node --test tests/birthday-message.test.js tests/birthdays.test.js
```

Expected: semua lulus — `tests/birthdays.test.js` adalah pengaman regresi bahwa sisi server tidak ikut berubah.

```bash
npx tsc --noEmit
```

Expected: proyek ini punya ±6 error bawaan yang tidak berhubungan. Yang dinilai: tidak ada error **baru** yang menyebut `sebutan.ts`, `birthdayMessage.ts`, `BirthdayWidget.tsx`, atau `BirthdayDetailSheet.tsx`. Bandingkan dengan keluaran `npx tsc --noEmit` pada `git stash` bila ragu.

- [ ] **Step 9: Commit**

```bash
git add src/components/BirthdayWidget.tsx src/components/BirthdayDetailSheet.tsx
git commit -m "feat(ulang-tahun): dropdown sebutan untuk pesan, kartu, dan header"
```

---

## Checklist verifikasi manual (untuk pengguna)

Otomatisasi berhenti di build + unit test; sisanya visual dan butuh mata. Buka `/dashboard`, klik kartu ulang tahun, pilih satu jamaah:

1. Dropdown "Sebutan" tampil di atas kotak pesan, nilainya `Bapak` (jamaah laki-laki) atau `Ibu` (perempuan).
2. Panel dropdown terbuka **penuh di atas sheet**, tidak terpotong tepi sheet dan tidak tertimbun — ini yang diamankan `portal` + `portalZClass`.
3. Tidak ada kotak "Cari..." di dalam panel.
4. Kedelapan pilihan tampil berurutan: Bapak, Pak, Ibu, Bu, Bunda, Kak, Mas, Mba.
5. Pilih "Bunda" → teks pesan langsung berubah, kata "Bunda" muncul dua kali.
6. Header sheet ikut berubah jadi "Bunda <nama>".
7. Kedua thumbnail kartu (Classic & Islamic) ikut menulis "Bunda <nama>".
8. Edit manual pesan, lalu ganti sebutan → pesan tertulis ulang dan editan hilang. **Ini disengaja**, bukan bug.
9. Tekan Download dengan kartu aktif → gambar JPG yang terunduh memuat sebutan terpilih.
10. Tutup sheet, buka lagi jamaah yang sama → sebutan kembali ke default. **Ini juga disengaja.**
11. Cek mode gelap: trigger dropdown memakai permukaan slate gelap, bukan putih.

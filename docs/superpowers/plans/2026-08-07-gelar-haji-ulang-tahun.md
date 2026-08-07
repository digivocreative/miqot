# Gelar Haji/Hajah di Fitur Ulang Tahun — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambah dropdown gelar (`—` / `H.` / `Hj.`) di samping dropdown sebutan, dengan gelar yang sudah menempel di kolom `nama` dideteksi otomatis dan dipindahkan ke dropdown itu.

**Architecture:** `src/utils/sebutan.ts` tumbuh mengurus gelar: daftar, `formatSapaan`, dan `splitGelarFromNama` — semuanya fungsi murni yang diuji lewat harness esbuild yang sudah ada. `BirthdayDetailSheet` merakit satu string sapaan (`"Bapak H."`) dan satu nama bersih, lalu menyalurkannya lewat `jamaahDisplay` yang sudah ada. Kartu tidak pernah tahu soal gelar.

**Tech Stack:** React 18 + TypeScript, Tailwind, Vite, `node:test` + esbuild `transformSync`.

## Global Constraints

- Tiga pilihan gelar dengan urutan tetap: `''` (label `—`), `'H.'`, `'Hj.'`.
- Deteksi gelar dari nama **wajib** menuntut titik atau spasi sesudah awalan. `HASAN BASRI` dan `HENDRA` tidak boleh terpotong — ini kesalahan yang lebih merusak daripada masalah yang dipecahkan.
- Nilai awal dropdown gelar = hasil deteksi dari `jamaah.nama`. Nama selalu dirender bersih, apa pun isi dropdown.
- Ganti gelar **maupun** sebutan sama-sama menulis ulang pesan penuh, **di handler `onChange`, bukan `useEffect`**.
- `Birthday.salutation` tetap bertipe `Sebutan` (itu yang dikirim server). Yang dilebarkan ke `string` hanya `CardProps.jamaah`.
- Isi template kartu (`Classic`, `Islamic`) tidak boleh disentuh.
- Kedua dropdown wajib `FilterDropdown` dengan `portal` + `portalZClass="z-[10000]"` + `showAllOptions`.
- Sisi server tidak diubah. Tidak ada migrasi DB, tidak ada localStorage.

## File Structure

| Berkas | Status | Tanggung jawab |
| ------ | ------ | -------------- |
| `src/utils/sebutan.ts` | Ubah (tambah) | Daftar gelar, `Gelar`, `isGelar`, `formatSapaan`, `splitGelarFromNama` |
| `src/utils/birthdayMessage.ts` | Ubah | Parameter ketiga jadi `sapaan: string`; nama dibersihkan sebelum diambil nama depannya |
| `tests/birthday-message.test.js` | Ubah (tambah) | Uji gelar, deteksi, dan penjaga false-positive |
| `src/components/BirthdayCardTemplates.tsx` | Ubah (1 baris) | `CardProps.jamaah` dilebarkan untuk `salutation: string` |
| `src/components/BirthdayDetailSheet.tsx` | Ubah | State gelar, handler, dropdown kedua, tata letak dua kolom |

---

### Task 1: Gelar sebagai fungsi murni

**Files:**
- Modify: `src/utils/sebutan.ts` (tambah di bawah blok sebutan yang sudah ada)
- Modify: `src/utils/birthdayMessage.ts` (parameter ketiga + pembersihan nama)
- Modify: `tests/birthday-message.test.js` (tambah tes; sesuaikan tes lama yang meneruskan `Sebutan`)

**Interfaces:**
- Consumes: `Sebutan`, `SEBUTAN_LIST` yang sudah ada di `src/utils/sebutan.ts`.
- Produces:
  - `const GELAR_LIST: readonly ['', 'H.', 'Hj.']`
  - `type Gelar = '' | 'H.' | 'Hj.'`
  - `const GELAR_OPTIONS: ReadonlyArray<{ value: Gelar; label: string }>`
  - `function isGelar(value: string): value is Gelar`
  - `function formatSapaan(sebutan: Sebutan, gelar: Gelar): string`
  - `function splitGelarFromNama(nama: string): { gelar: Gelar; nama: string }`
  - `function getBirthdayMessage(jamaah: BirthdayMessageInput, agentName: string, sapaan: string): string` — parameter ketiga **berubah tipe** dari `Sebutan` ke `string`

- [ ] **Step 1: Tambahkan tes baru**

Tambahkan di akhir `tests/birthday-message.test.js` (fungsi `importTsModule` sudah ada di berkas itu, jangan didefinisikan ulang):

```js
test('daftar gelar berisi tiga pilihan, kosong berlabel em-dash', async () => {
  const { GELAR_LIST, GELAR_OPTIONS, isGelar } = await importTsModule('src/utils/sebutan.ts');
  assert.deepEqual([...GELAR_LIST], ['', 'H.', 'Hj.']);
  assert.deepEqual(GELAR_OPTIONS[0], { value: '', label: '—' });
  assert.deepEqual(GELAR_OPTIONS[1], { value: 'H.', label: 'H.' });
  assert.deepEqual(GELAR_OPTIONS[2], { value: 'Hj.', label: 'Hj.' });
  assert.equal(isGelar('Hj.'), true);
  assert.equal(isGelar(''), true);
  assert.equal(isGelar('Dr.'), false);
});

test('formatSapaan menyisipkan gelar hanya bila ada', async () => {
  const { formatSapaan } = await importTsModule('src/utils/sebutan.ts');
  assert.equal(formatSapaan('Bapak', 'H.'), 'Bapak H.');
  assert.equal(formatSapaan('Bunda', 'Hj.'), 'Bunda Hj.');
  assert.equal(formatSapaan('Bapak', ''), 'Bapak');
});

test('gelar yang menempel di nama dipisahkan dan dinormalkan', async () => {
  const { splitGelarFromNama } = await importTsModule('src/utils/sebutan.ts');
  // Keempat bentuk ini nyata ada di tabel jamaah (probe 2026-08-07, 5.397 baris).
  assert.deepEqual(splitGelarFromNama('H. KHAERUL, IR  . .'), { gelar: 'H.', nama: 'KHAERUL, IR  . .' });
  assert.deepEqual(splitGelarFromNama('HJ. SITTI MARWAH HAMID, IR . .'), { gelar: 'Hj.', nama: 'SITTI MARWAH HAMID, IR . .' });
  assert.deepEqual(splitGelarFromNama('H.M.IQBAL ALAMSYAH'), { gelar: 'H.', nama: 'M.IQBAL ALAMSYAH' });
  assert.deepEqual(splitGelarFromNama('HJ TITIN'), { gelar: 'Hj.', nama: 'TITIN' });
  assert.deepEqual(splitGelarFromNama('Haji Sulaeman'), { gelar: 'H.', nama: 'Sulaeman' });
  assert.deepEqual(splitGelarFromNama('HAJAH ROHIMAH'), { gelar: 'Hj.', nama: 'ROHIMAH' });
});

test('nama biasa yang kebetulan berawalan H tidak boleh terpotong', async () => {
  const { splitGelarFromNama } = await importTsModule('src/utils/sebutan.ts');
  for (const nama of ['HASAN BASRI', 'HENDRA', 'Hj', 'HAJIJAH SARI', 'FULAN BIN FULAN', '']) {
    assert.deepEqual(splitGelarFromNama(nama), { gelar: '', nama }, `tidak boleh dipotong: ${nama}`);
  }
});

test('hanya satu awalan gelar yang dibuang', async () => {
  const { splitGelarFromNama } = await importTsModule('src/utils/sebutan.ts');
  assert.deepEqual(splitGelarFromNama('H. H. KHAERUL'), { gelar: 'H.', nama: 'H. KHAERUL' });
});

test('pesan untuk jamaah bergelar tidak lagi berbunyi "Bapak H."', async () => {
  const { getBirthdayMessage } = await importTsModule('src/utils/birthdayMessage.ts');
  const msg = getBirthdayMessage({ nama: 'HJ TITIN', age: 60, day_offset: 0 }, 'Bagas', 'Ibu Hj.');
  assert.equal(msg.match(/Ibu Hj\. Titin/g).length, 2);
  assert.ok(!/Hj\.\s*Hj\./.test(msg), 'gelar tidak boleh dobel');
});
```

Ubah juga tes lama yang meneruskan sebutan mentah — parameter ketiga sekarang string sapaan utuh. Yang perlu disesuaikan hanya namanya secara konseptual; nilai-nilai `'Bunda'`, `'Kak'`, `'Pak'`, `'Mas'` tetap valid sebagai string sapaan, jadi **tidak ada tes lama yang perlu diubah isinya**.

- [ ] **Step 2: Jalankan tes, pastikan MERAH**

```bash
node --test tests/birthday-message.test.js
```

Expected: 6 tes lama tetap lulus, 6 tes baru gagal (`GELAR_LIST`/`formatSapaan`/`splitGelarFromNama` undefined; tes pesan gagal karena nama masih mentah).

- [ ] **Step 3: Tambahkan gelar ke `src/utils/sebutan.ts`**

Tambahkan di bawah `isSebutan` yang sudah ada:

```ts
export const GELAR_LIST = ['', 'H.', 'Hj.'] as const;

export type Gelar = typeof GELAR_LIST[number];

export const GELAR_OPTIONS: ReadonlyArray<{ value: Gelar; label: string }> = [
  { value: '', label: '—' },
  { value: 'H.', label: 'H.' },
  { value: 'Hj.', label: 'Hj.' },
];

export function isGelar(value: string): value is Gelar {
  return (GELAR_LIST as readonly string[]).includes(value);
}

export function formatSapaan(sebutan: Sebutan, gelar: Gelar): string {
  return gelar ? `${sebutan} ${gelar}` : sebutan;
}

// Awalan WAJIB diikuti titik atau spasi. Tanpa syarat itu "HASAN" ikut
// terpotong jadi "ASAN" — kesalahan yang jauh lebih merusak daripada gelar
// yang tidak terdeteksi. Hanya satu awalan yang dibuang.
const GELAR_PREFIX = /^\s*(HJH|HAJAH|HAJI|HJ|H)[.\s]\s*/i;

export function splitGelarFromNama(nama: string): { gelar: Gelar; nama: string } {
  const match = (nama || '').match(GELAR_PREFIX);
  if (!match) return { gelar: '', nama };
  const kata = match[1].toUpperCase();
  const gelar: Gelar = kata === 'HJ' || kata === 'HJH' || kata === 'HAJAH' ? 'Hj.' : 'H.';
  return { gelar, nama: nama.slice(match[0].length) };
}
```

Urutan alternasi regex penting: `HJH|HAJAH|HAJI|HJ|H` — yang panjang lebih dulu, supaya `HAJI` tidak keburu tertangkap sebagai `H` diikuti `AJI` (yang justru tidak akan cocok karena `A` bukan titik/spasi, tapi `HJH` vs `HJ` benar-benar butuh urutan ini).

- [ ] **Step 4: Ubah `src/utils/birthdayMessage.ts`**

Ganti impor tipe dan tanda tangan fungsi. Parameter ketiga sekarang string sapaan utuh (`"Bapak H."`), dan nama dibersihkan dari gelar sebelum diambil nama depannya.

```ts
import { splitGelarFromNama } from './sebutan';
```

(hapus baris `import type { Sebutan } from './sebutan';` — sudah tidak dipakai)

```ts
export function getBirthdayMessage(
  jamaah: BirthdayMessageInput,
  agentName: string,
  sapaan: string,
): string {
  const jamaahFirst = getFirstName(splitGelarFromNama(jamaah.nama).nama);
  const agentFirst = getFirstName(agentName) || 'Saya';
```

Sisa badan fungsi tetap, tapi setiap `${sebutan}` diganti `${sapaan}` — ada
tiga kemunculan: satu di `doa`, dua di `body`.

- [ ] **Step 5: Jalankan tes, pastikan HIJAU**

```bash
node --test tests/birthday-message.test.js
```

Expected: 12 tes lulus.

- [ ] **Step 6: Build harus hijau**

```bash
npm run build
```

Expected: sukses. `BirthdayDetailSheet.tsx` masih meneruskan `jamaah.salutation` (bertipe `Sebutan`) sebagai argumen ketiga — itu tetap sah karena `Sebutan` adalah `string`.

- [ ] **Step 7: Commit**

```bash
git add src/utils/sebutan.ts src/utils/birthdayMessage.ts tests/birthday-message.test.js
git commit -m "feat(ulang-tahun): fungsi murni gelar H./Hj. dan pemisahannya dari nama"
```

---

### Task 2: Dropdown gelar di sheet

**Files:**
- Modify: `src/components/BirthdayCardTemplates.tsx:10` (tipe `CardProps.jamaah`)
- Modify: `src/components/BirthdayDetailSheet.tsx` (state, handler, tata letak dua kolom, `jamaahDisplay`, analitik)

**Interfaces:**
- Consumes: `GELAR_OPTIONS`, `isGelar`, `formatSapaan`, `splitGelarFromNama`, `type Gelar` dari Task 1.
- Produces: tidak ada (tugas terakhir).

- [ ] **Step 1: Lebarkan tipe prop kartu**

Di `src/components/BirthdayCardTemplates.tsx`, ubah baris 10 dari `jamaah: Birthday;` menjadi:

```ts
  /** `salutation` di sini adalah teks sapaan siap-render ("Bapak H."), bukan
   *  nilai `Sebutan` mentah dari API. */
  jamaah: Omit<Birthday, 'salutation'> & { salutation: string };
```

`Classic`, `Islamic`, `BirthdayCard`, dan `BirthdayCardThumb` semuanya mewarisi lewat `CardProps` — tidak ada yang lain untuk diubah.

- [ ] **Step 2: Tambahkan impor dan state gelar**

Di `src/components/BirthdayDetailSheet.tsx`, lebarkan impor `sebutan`:

```ts
import {
  SEBUTAN_OPTIONS,
  GELAR_OPTIONS,
  isSebutan,
  isGelar,
  formatSapaan,
  splitGelarFromNama,
  type Sebutan,
  type Gelar,
} from '../utils/sebutan';
```

Tambahkan state gelar tepat di bawah state `sebutan`, dan ubah inisialisasi `message` supaya memakai sapaan rakitan:

```ts
  const [sebutan, setSebutan] = useState<Sebutan>(jamaah.salutation);
  const [gelar, setGelar] = useState<Gelar>(() => splitGelarFromNama(jamaah.nama).gelar);
  const [message, setMessage] = useState(() => getBirthdayMessage(
    jamaah,
    agentName,
    formatSapaan(jamaah.salutation, splitGelarFromNama(jamaah.nama).gelar),
  ));
```

- [ ] **Step 3: Ganti handler sebutan dan tambahkan handler gelar**

Ganti `handleSebutanChange` yang ada dengan pasangan berikut. Keduanya menulis ulang pesan lewat sapaan rakitan; komentar soal handler-bukan-effect tetap dipertahankan.

```ts
  // Ditulis ulang di handler, BUKAN di useEffect: effect ikut menembak saat
  // mount dan akan menimpa state pesan yang baru saja diinisialisasi.
  const handleSebutanChange = (next: string) => {
    if (!isSebutan(next)) return;
    setSebutan(next);
    setMessage(getBirthdayMessage(jamaah, agentName, formatSapaan(next, gelar)));
  };

  const handleGelarChange = (next: string) => {
    if (!isGelar(next)) return;
    setGelar(next);
    setMessage(getBirthdayMessage(jamaah, agentName, formatSapaan(sebutan, next)));
  };
```

- [ ] **Step 4: Rakit `jamaahDisplay` dari sapaan dan nama bersih**

Ganti baris `jamaahDisplay` yang ada dengan:

```ts
  const jamaahDisplay = useMemo(() => ({
    ...jamaah,
    salutation: formatSapaan(sebutan, gelar),
    nama: splitGelarFromNama(jamaah.nama).nama,
  }), [jamaah, sebutan, gelar]);
```

- [ ] **Step 5: Ubah baris kontrol jadi dua kolom berlabel**

Ganti seluruh blok `<div className="flex items-center justify-between gap-3">` yang memuat label "Sebutan" dan `FilterDropdown`-nya dengan:

```tsx
          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-2">
                Sebutan
              </div>
              <FilterDropdown
                value={sebutan}
                onChange={handleSebutanChange}
                options={SEBUTAN_OPTIONS}
                ariaLabel="Sebutan jamaah"
                variant="compact"
                inputSkin
                portal
                portalZClass="z-[10000]"
                showAllOptions
              />
            </div>
            <div className="w-24 flex-shrink-0">
              <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-2">
                Gelar
              </div>
              <FilterDropdown
                value={gelar}
                onChange={handleGelarChange}
                options={GELAR_OPTIONS}
                ariaLabel="Gelar haji jamaah"
                variant="compact"
                inputSkin
                portal
                portalZClass="z-[10000]"
                showAllOptions
              />
            </div>
          </div>
```

Perhatikan `widthClass` sudah **tidak** dipakai lagi di keduanya — lebar diatur oleh pembungkusnya (`flex-1` dan `w-24`), dan trigger `FilterDropdown` memang `w-full` terhadap root-nya.

- [ ] **Step 6: Tambahkan gelar ke analitik**

Pada `trackEvent('action', 'birthday_send', {...})`, tambahkan satu properti di bawah `sebutan`:

```ts
        sebutan,
        gelar,
```

- [ ] **Step 7: Verifikasi otomatis**

```bash
npm run build
```

Expected: sukses.

```bash
node --test tests/birthday-message.test.js tests/birthdays.test.js
```

Expected: 13 tes lulus (12 + 1 dari `birthdays.test.js`).

```bash
npx tsc --noEmit 2>&1 | grep -E "sebutan\.ts|birthdayMessage\.ts|BirthdayWidget\.tsx|BirthdayDetailSheet\.tsx|BirthdayCardTemplates\.tsx"
```

Expected: tidak ada keluaran. (Proyek punya ±6 error bawaan di berkas lain — `RahmahJuliLandingPage.tsx`, `WebItineraryView.tsx`, `rahmahJuliPrepDb.ts` — dan itu bukan urusan tugas ini.)

- [ ] **Step 8: Commit**

```bash
git add src/components/BirthdayCardTemplates.tsx src/components/BirthdayDetailSheet.tsx
git commit -m "feat(ulang-tahun): dropdown gelar Haji/Hajah di samping sebutan"
```

---

## Checklist verifikasi manual (untuk pengguna)

1. Baris kontrol menampilkan dua dropdown berlabel: **SEBUTAN** (lebar) dan **GELAR** (sempit).
2. Kedua panel terbuka penuh di atas sheet, tidak terpotong dan tidak tertimbun.
3. Jamaah biasa: dropdown Gelar mulai dari `—`, nama tidak berubah.
4. Pilih `H.` → pesan, header, dan kedua thumbnail kartu jadi "Bapak H. <nama>".
5. Jamaah bergelar (cari **KHAERUL**, **SITTI MARWAH**, **IQBAL ALAMSYAH**, atau **TITIN** — hanya empat orang ini di seluruh basis data, dan hanya muncul di sheet saat ulang tahunnya dalam 3 hari): dropdown Gelar **sudah terisi** `H.`/`Hj.`, dan namanya tampil tanpa gelar dobel.
6. Ganti gelar → pesan tertulis ulang, sama seperti mengganti sebutan.
7. Mode gelap: kedua trigger memakai permukaan slate gelap.

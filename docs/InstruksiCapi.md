# Prompt: Fitur Meta Conversion API (CAPI) untuk Agent

## Konteks Project

Project ini adalah website jadwal keberangkatan Umrah yang memiliki halaman per agent di route `domain/[slug-agent]`. Setiap agent sudah didefinisikan di file `agents.ts`. Sekarang saya ingin menambahkan fitur agar setiap agent bisa mengkonfigurasi Meta Conversion API (CAPI) mereka sendiri melalui halaman settings yang bisa diakses di `domain/[slug-agent]/capi`.

## Fitur yang Dibutuhkan

### 1. Halaman Login (`/[slug-agent]/capi`)

- Ketika halaman `/[slug-agent]/capi` dibuka, tampilkan form login sederhana yang meminta password.
- Password bersifat statis per agent dan disimpan langsung di file `agents.ts` sebagai property baru, misalnya `capiPassword`.
- Buatkan password untuk SEMUA agent yang ada di `agents.ts`. Format password: kombinasi nama hewan + kata sifat + angka 2 digit, huruf kecil semua, contoh: `sapi4nteng`, `kucing8erani`, `rubah5etia`, `elang7agah`, dsb. Setiap agent harus punya password yang unik.
- Setelah login berhasil, simpan session di localStorage agar tidak perlu login ulang selama sesi browser masih aktif.
- Jika slug agent tidak valid, tampilkan halaman 404.

### 2. Halaman Settings CAPI (setelah login berhasil)

Setelah login, tampilkan halaman settings dengan layout yang clean dan rapi, terdiri dari beberapa section:

#### Section 1: Meta Credentials

- **Pixel ID** — input text, wajib diisi
- **Access Token** — input text dengan toggle show/hide (default hidden/masked), wajib diisi
- **Test Event Code** — input text, opsional (untuk testing di Meta Events Manager)

#### Section 2: Event Mapping

Tampilkan daftar event yang bisa di-track, masing-masing dengan:
- Toggle on/off untuk enable/disable event tersebut
- Dropdown untuk memilih event name yang akan dikirim ke Meta

Daftar event:

| # | Heading / Label | Deskripsi | Default Event | Default State |
|---|---|---|---|---|
| 1 | User Cek Jadwal | Ketika user membuka halaman utama jadwal agent | `PageView` | ON |
| 2 | User Search | Ketika user menggunakan fitur search/filter paket | `Search` | ON |
| 3 | User Interaksi Konten | Ketika user download brosur, itinerary, simpan, hitung, compare, atau bagikan | `ViewContent` | ON |
| 4 | User Klik WhatsApp/CTA | Ketika user klik tombol WhatsApp atau CTA hubungi agent | `Contact` | ON |

Pilihan event di setiap dropdown (standar Meta):
- `PageView`
- `Search`
- `ViewContent`
- `Contact`
- `Lead`
- `CompleteRegistration`
- `AddToCart`
- `AddToWishlist`
- `InitiateCheckout`
- `Purchase`
- `Subscribe`
- `CustomEvent` (jika dipilih, tampilkan input text tambahan untuk custom event name)

#### Section 3: Mode & Status

- **Toggle Test Mode / Live Mode** — Jika Test Mode aktif, semua event dikirim dengan `test_event_code` yang diisi di Section 1. Jika Test Event Code kosong tapi Test Mode aktif, tampilkan warning.
- **Status koneksi** — Setelah save, lakukan validasi sederhana ke Meta Graph API untuk mengecek apakah Pixel ID dan Access Token valid. Tampilkan status:
  - ✅ "Connected — Pixel aktif" jika valid
  - ❌ "Error — Pixel ID atau Access Token tidak valid" jika gagal
  - ⚠️ "Belum dikonfigurasi" jika credentials belum diisi

#### Tombol Simpan

- Tombol "Simpan Konfigurasi" di bagian bawah
- Setelah klik simpan, validasi input (Pixel ID & Access Token wajib), lalu simpan konfigurasi
- Tampilkan toast/notifikasi sukses atau error

### 3. Penyimpanan Konfigurasi

- Simpan konfigurasi CAPI setiap agent di file JSON di server, misalnya di folder `data/capi/[slug-agent].json`
- Struktur data JSON:

```json
{
  "pixelId": "123456789",
  "accessToken": "EAABxxxxxxx",
  "testEventCode": "TEST12345",
  "testMode": false,
  "events": {
    "pageView": {
      "enabled": true,
      "eventName": "PageView"
    },
    "search": {
      "enabled": true,
      "eventName": "Search"
    },
    "viewContent": {
      "enabled": true,
      "eventName": "ViewContent"
    },
    "contact": {
      "enabled": true,
      "eventName": "Contact"
    }
  },
  "updatedAt": "2026-03-01T10:00:00Z"
}
```

- Access Token harus dienkripsi saat disimpan di server (gunakan encryption sederhana, misalnya AES dengan secret key dari environment variable `CAPI_ENCRYPTION_KEY`)
- Saat ditampilkan di frontend setelah tersimpan, Access Token harus di-mask (tampilkan hanya 6 karakter pertama + `****`)

### 4. API Endpoint untuk Kirim Event ke Meta

Buat API endpoint yang akan dipanggil dari frontend untuk mengirim event ke Meta Conversion API:

**Endpoint:** `POST /api/capi/[slug-agent]/event`

**Request body:**
```json
{
  "eventName": "PageView",
  "eventId": "unique-event-id-untuk-deduplication",
  "sourceUrl": "https://domain.com/slug-agent",
  "userAgent": "Mozilla/5.0...",
  "fbc": "fb.1.xxxxx",
  "fbp": "fb.1.xxxxx",
  "timestamp": 1709280000
}
```

**Logic:**
1. Baca konfigurasi CAPI agent dari file JSON
2. Cek apakah event tersebut enabled untuk agent ini
3. Jika enabled, kirim event ke Meta Graph API: `POST https://graph.facebook.com/v21.0/{pixel_id}/events`
4. Kirim dengan payload sesuai format Meta CAPI:
   - `event_name` — dari konfigurasi
   - `event_time` — timestamp
   - `event_id` — untuk deduplication dengan browser pixel
   - `event_source_url` — URL halaman
   - `user_data` — minimal `client_user_agent`, `fbc`, `fbp`
   - `action_source` — "website"
5. Jika test mode aktif, sertakan `test_event_code` di request
6. Return response sukses/gagal

### 5. Integrasi di Frontend (Trigger Event)

Di halaman agent (`/[slug-agent]`), tambahkan logic untuk trigger event CAPI pada momen yang tepat:

1. **PageView** — Trigger saat halaman jadwal pertama kali di-load (gunakan `useEffect` dengan dependency kosong)
2. **Search** — Trigger saat user melakukan search/filter
3. **ViewContent** — Trigger saat user klik download brosur, itinerary, simpan, hitung, compare, atau bagikan
4. **Contact** — Trigger saat user klik tombol WhatsApp atau CTA

Untuk setiap trigger:
- Generate `event_id` yang unik (gunakan `crypto.randomUUID()` atau format `{eventName}-{timestamp}-{random}`)
- Ambil `fbc` dan `fbp` dari cookie browser (jika ada)
- Kirim ke API endpoint `/api/capi/[slug-agent]/event` secara async (jangan blocking UI)
- Jangan tampilkan error ke user jika gagal (silent fail), cukup log di console

### 6. Buat Helper/Utility

Buat file utility misalnya `lib/capi.ts` yang berisi:
- Function `sendCapiEvent(slug, eventKey, sourceUrl)` — helper untuk trigger event dari komponen manapun
- Function `getMetaCookies()` — ambil `fbc` dan `fbp` dari cookies
- Function `generateEventId(eventName)` — generate unique event ID

## Catatan Teknis

- Gunakan teknologi yang sudah ada di project (Next.js / React)
- Untuk API route, gunakan Next.js API routes atau Route Handlers
- Pastikan API endpoint memiliki rate limiting sederhana (misalnya max 10 request per detik per agent) untuk mencegah abuse
- Semua request ke Meta Graph API dilakukan dari server-side (JANGAN dari client/browser) agar Access Token tidak terekspos
- Gunakan `fetch` untuk request ke Meta Graph API dari server

## UI/UX Guidelines

- Halaman login: minimalis, centered, dengan branding sederhana
- Halaman settings: gunakan card-based layout dengan section yang jelas
- Gunakan warna hijau untuk status aktif/connected, merah untuk error, kuning untuk warning
- Responsive — harus bisa diakses dari mobile karena agent mungkin setup dari HP
- Tampilkan tooltip/help text kecil di setiap field untuk membantu agent yang tidak familiar dengan Meta CAPI
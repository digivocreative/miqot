# Fitur Meta Conversion API (CAPI) untuk Agent

## Konteks Project

Project ini adalah website jadwal keberangkatan Umrah yang memiliki halaman per agent di route `domain/[slug-agent]`. Setiap agent sudah didefinisikan di Supabase (tabel `agents`). Fitur ini memungkinkan setiap agent mengkonfigurasi Meta Conversion API (CAPI) mereka sendiri.

**Status: ✅ Sudah diimplementasi sepenuhnya.**

## Akses CAPI Config

CAPI config bisa diakses dari 2 tempat:
1. **Standalone page**: `domain/[slug-agent]/capi` — login dengan password agent sendiri
2. **Dashboard**: Menu "Meta CAPI" di dashboard setelah login (menggunakan session JWT yang sudah ada)

---

## Fitur yang Sudah Diimplementasi

### 1. Autentikasi

- **Standalone page** (`/[slug-agent]/capi`): Form login meminta password agent, diverifikasi via `POST /api/capi/:slug/login` (bcrypt compare). Session disimpan di `localStorage`/`sessionStorage` dengan key `capi_session_{slug}`.
- **Dashboard** (`hideHeader=true`): **Auto-bypass login** — tidak perlu password karena sudah terautentikasi via JWT session dashboard. Langsung tampil halaman settings.
- Jika slug agent tidak valid, tampilkan halaman 404.
- **Session cleanup**: Saat agent logout dari dashboard, semua `capi_session_*` keys di-clear oleh `clearSession()` untuk mencegah data leak antar agent.

### 2. Halaman Settings CAPI

Layout card-based dengan 3 section utama:

#### Section 1: Meta Credentials

- **Pixel ID** — input text, wajib diisi
- **Access Token** — input text dengan toggle show/hide (default hidden/masked), wajib diisi
- **Test Event Code** — input text, opsional (untuk testing di Meta Events Manager)

#### Section 2: Event Mapping

Daftar event yang bisa di-track, masing-masing dengan toggle on/off dan dropdown event name:

| # | Heading / Label | Deskripsi | Default Event | Default State |
|---|---|---|---|---|
| 1 | User Cek Jadwal | Ketika user membuka halaman utama jadwal agent | `PageView` | ON |
| 2 | User Search | Ketika user menggunakan fitur search/filter paket | `Search` | ON |
| 3 | User Interaksi Konten | Ketika user download brosur, itinerary, simpan, hitung, compare, atau bagikan | `ViewContent` | ON |
| 4 | User Klik WhatsApp/CTA | Ketika user klik tombol WhatsApp atau CTA hubungi agent | `Contact` | ON |

Pilihan event di setiap dropdown (standar Meta):
- `PageView`, `Search`, `ViewContent`, `Contact`, `Lead`, `CompleteRegistration`
- `AddToCart`, `AddToWishlist`, `InitiateCheckout`, `Purchase`, `Subscribe`
- `CustomEvent` (jika dipilih, tampilkan input text tambahan untuk custom event name)

#### Section 3: Mode & Status

- **Toggle Test Mode / Live Mode** — Jika Test Mode aktif, semua event dikirim dengan `test_event_code`. Warning jika Test Event Code kosong tapi Test Mode aktif.
- **Status koneksi** — Setelah save, validasi ke Meta Graph API:
  - ✅ "Connected — Pixel aktif" jika valid
  - ❌ "Error — Pixel ID atau Access Token tidak valid" jika gagal
  - ⚠️ "Belum dikonfigurasi" jika credentials belum diisi

#### Tombol Simpan

- "Simpan Konfigurasi" di bagian bawah
- Validasi input (Pixel ID & Access Token wajib)
- Toast/notifikasi sukses atau error

### 3. Penyimpanan Konfigurasi

- Disimpan di **Supabase** (tabel `capi_configs`).
- Tabel kolom: `slug` (PK), `pixel_id`, `access_token`, `test_event_code`, `test_mode`, `events` (JSONB), `updated_at`.
- Struktur data events:

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

- **Enkripsi**: Access Token di-encrypt dengan AES-256-GCM (`CAPI_ENCRYPTION_KEY` env var) sebelum disimpan
- **Display**: Setelah tersimpan, Access Token di-mask (6 karakter pertama + `****`)

### 4. API Endpoints

Semua endpoint sudah diimplementasi di `server.js`:

| Method | Path | Deskripsi |
|--------|------|-----------|
| POST | `/api/capi/:slug/login` | Verify password (bcrypt) |
| GET | `/api/capi/:slug/config` | Get config (token decrypted) |
| POST | `/api/capi/:slug/config` | Save config (token encrypted) |
| DELETE | `/api/capi/:slug/config` | Reset config |
| POST | `/api/capi/:slug/event` | Send event ke Meta (rate limited: 10 req/s per agent) |
| POST | `/api/capi/:slug/validate` | Validate pixel + token via Meta Graph API |

**Event endpoint logic:**
1. Baca konfigurasi CAPI agent dari Supabase
2. Decrypt access token (AES-256-GCM)
3. Kirim event ke `POST https://graph.facebook.com/v21.0/{pixel_id}/events`
4. Payload: `event_name`, `event_time`, `event_source_url`, `user_data`, `custom_data`, `action_source`
5. Jika test mode aktif, sertakan `test_event_code`
6. Return response sukses/gagal

### 5. Integrasi Frontend (Event Triggers)

Diimplementasi di `App.tsx` dan `src/lib/capi.ts`:

1. **PageView** — `useEffect` saat pertama kali load (fire-once guard)
2. **Search** — Debounced 1 detik setelah user ketik di search box
3. **ViewContent** — Saat user klik download brosur, itinerary, simpan, hitung, compare, atau bagikan
4. **Contact** — Saat user klik tombol WhatsApp atau CTA

Setiap trigger:
- **Silent fail**: Error tidak ditampilkan ke user, hanya log di console
- Cookie `fbc`/`fbp` diambil jika tersedia
- Request dikirim ke server secara async (non-blocking UI)

### 6. Helper/Utility

**File:** `src/lib/capi.ts`

```typescript
// Helper function — panggil dari komponen manapun
sendCapiEvent(slug: string, eventKey: string, sourceUrl?: string): Promise<void>

// Internal helpers
getMetaCookies(): { fbc, fbp }
generateEventId(eventName: string): string
```

---

## Catatan Teknis

- Semua request ke Meta Graph API dilakukan dari **server-side** — Access Token tidak pernah terekspos ke browser
- Rate limiting: max 10 request per detik per agent slug
- CAPI endpoints **tidak menggunakan auth JWT** — hanya dilindungi oleh slug (known limitation, lihat Technical Debt di project-summary.md)
- Enkripsi menggunakan fungsi yang sama (`capiEncrypt`/`capiDecrypt`) yang juga dipakai untuk encrypt jamaah password

## UI/UX

- Halaman login: minimalis, centered, branding sederhana
- Halaman settings: card-based layout dengan section yang jelas
- Warna hijau (connected), merah (error), kuning (warning)
- Responsive — bisa diakses dari mobile
- Tooltip/help text di setiap field
- **Dark mode**: ✅ Fully supported
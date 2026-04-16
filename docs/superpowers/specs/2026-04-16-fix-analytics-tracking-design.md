# Fix Analytics Tracking + Diagnostic Logging

**Date:** 2026-04-16
**Status:** Draft

## Context

Semua modul tracking di halaman Dashboard Analytics tidak menampilkan data meskipun sudah ada agent reguler yang aktif menggunakan aplikasi. Root cause: fungsi `trackEvent()` di frontend hanya membaca session dari `localStorage`, padahal agent yang login tanpa centang "Ingat Saya" menyimpan session di `sessionStorage`. Ditambah dengan silent failure pattern di seluruh tracking pipeline, masalah ini tidak terdeteksi sama sekali.

## Bugs Identified

### Bug 1 (Critical): `trackEvent()` hanya baca `localStorage`

**File:** `src/utils/analytics.ts:3`

```typescript
// Current (broken)
const token = localStorage.getItem('auth_session');
if (!token) return; // ← silently fails untuk sessionStorage users
```

**Sementara `getStoredSession()`** di `src/components/LoginPage.tsx:20` sudah benar:
```typescript
const raw = localStorage.getItem('auth_session') || sessionStorage.getItem('auth_session');
```

**Impact:** Agent yang login tanpa "Ingat Saya" → semua `trackEvent()` calls silently return → tidak ada data tracking sama sekali.

### Bug 2: Silent failure pattern

- Frontend `trackEvent()` — fire-and-forget tanpa error logging
- Frontend `trackPublicEvent()` — sama, silent fail
- Backend `logAnalyticsEvent()` — catch error tapi hanya `console.error`
- Backend POST `/api/analytics/event` — selalu return `{ success: true }` bahkan jika Supabase insert gagal

## Changes

### 1. `src/utils/analytics.ts` — Fix session reading + diagnostic logs

- Import `getStoredSession` dari `LoginPage.tsx`
- Ganti manual `localStorage.getItem` + JSON.parse dengan `getStoredSession()`
- Tambah `console.warn` saat:
  - Session tidak ditemukan
  - Fetch ke API gagal (response not ok atau network error)
- Tetap fire-and-forget (non-blocking)

### 2. `server.js` — Diagnostic logging di `logAnalyticsEvent`

- Ubah `logAnalyticsEvent` agar return `{ ok: true }` atau `{ ok: false, error }` (saat ini tidak return apa-apa)
- Log Supabase error data lengkap (`err.message` + `err.details` jika ada)
- Di endpoint POST `/api/analytics/event`: await `logAnalyticsEvent`, gunakan return value untuk menentukan response — `{ success: true }` atau `{ success: false, error }`. Tetap return 200 status code (client tidak perlu retry tracking events)

## Files Modified

| File | Change |
|------|--------|
| `src/utils/analytics.ts` | Fix session reading, add diagnostic warnings |
| `server.js` (line ~56-67) | Improve error logging di `logAnalyticsEvent` |
| `server.js` (line ~5577-5589) | Return actual result dari insert di POST endpoint |

## Files NOT Modified

- `src/components/AnalyticsPage.tsx` — no bug, hanya render data
- `src/components/LoginPage.tsx` — already correct
- Public event tracking (`trackPublicEvent`) — tidak bergantung pada session

## Verification

1. Login sebagai agent reguler **tanpa** centang "Ingat Saya"
2. Buka beberapa fitur (Jamaah, Statistik, Voice Over, dll)
3. Cek browser console — harus ada log `[Analytics]` tracking events berhasil, bukan warning "no session"
4. Login sebagai admin → buka Analytics → data dari agent reguler tadi harus muncul di Overview, Per Agent, dan Fitur tabs
5. Cek server log — pastikan tidak ada Supabase insert error
6. Test juga dengan "Ingat Saya" tercentang — pastikan tracking tetap bekerja (regresi)

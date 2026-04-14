# Bypass Internal Login untuk Agent Bagas

## Context

Fitur jamaah umroh dan haji memerlukan login ke sistem internal legacy (`http://115.124.86.220/aiw/staff/`) sebelum data bisa di-sync dan ditampilkan. Untuk agent "bagas", ini perlu di-bypass secara permanen agar halaman jamaah langsung menampilkan data tanpa prompt login internal. Data jamaah sudah di-seed ke Supabase via `seed-demo.js`.

## Approach

Bypass di **backend (server.js)** — 3 endpoint dimodifikasi untuk slug `bagas`. Frontend tidak perlu diubah sama sekali.

## Changes

### 1. `/api/laporan/status` (server.js:1757)

**Sebelum**: Cek `agent.jamaah_username` dan `isSessionActive()` → kalau false, frontend tampilkan login form.

**Sesudah**: Untuk `bagas`, langsung return `hasCredentials: true, isConnected: true` + ambil `lastSync` dari Supabase seperti biasa. Frontend akan langsung masuk ke view `'data'`.

### 2. `/api/laporan/sync` (server.js:1895)

**Sebelum**: Cek credentials → login ke legacy system → scrape data → upsert ke Supabase.

**Sesudah**: Untuk `bagas`, skip legacy login. Langsung return success dengan jumlah jamaah yang sudah ada di Supabase. Ini membuat tombol "Sync Ulang" tetap berfungsi tanpa error.

### 3. `/api/haji/sync` (server.js:4555)

**Sebelum**: Cek credentials → login ke legacy system → fetch haji list → upsert ke Supabase.

**Sesudah**: Untuk `bagas`, skip legacy login. Return success dengan jumlah data haji yang sudah ada di Supabase.

## Implementation Detail

Setiap bypass menggunakan pattern yang sama — early return di awal handler:

```javascript
// Bypass internal login for bagas
if (req.user.slug === 'bagas') {
  // ... return success with data from Supabase
}
```

## Files to Modify

- **MODIFY** `server.js` — 3 endpoints: `/api/laporan/status`, `/api/laporan/sync`, `/api/haji/sync`

## Verification

1. Login sebagai bagas di `/dashboard`
2. Buka tab Jamaah Umroh → harus langsung tampil data (tanpa login form)
3. Buka tab Jamaah Haji → harus langsung tampil data
4. Klik "Sync Ulang" → harus return success tanpa error

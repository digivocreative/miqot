# CAPI Purchase Event Sync — Jamaah Umroh & Haji

## Context

Saat ini Meta CAPI sudah terimplementasi dengan 4 event frontend (PageView, Search, ViewContent, Contact) dan 1 event server-side (Purchase saat bayar naik). Namun logic Purchase yang ada terlalu sederhana — hanya mengirim event setiap kali nilai `bayar` bertambah, tanpa membedakan fase DP vs Lunas.

**Yang dibutuhkan:** Kirim Purchase event yang lebih terstruktur:
- Saat jamaah DP (pembayaran pertama) → value = jumlah DP
- Saat jamaah Lunas (pelunasan) → value = total harga paket
- Berlaku untuk Umroh dan Haji
- Hanya untuk agent yang sudah configure Meta Pixel + Access Token yang valid

## Requirements

### Umroh
| Trigger | Condition | Value (IDR) |
|---------|-----------|-------------|
| DP | `bayar > 0` && belum pernah kirim | `bayar` |
| Lunas | `sisa <= 0` && sudah kirim DP | `bayar` (saat lunas, bayar = total harga karena sisa = 0) |

### Haji
| Trigger | Condition | Value (IDR) |
|---------|-----------|-------------|
| DP | `status_bayar = 'CICILAN'` && belum pernah kirim | 60.000.000 (hardcoded) |
| Lunas | `status_bayar = 'LUNAS'` && sudah kirim DP | 60.000.000 (hardcoded) |

> Haji tidak memiliki kolom bayar/sisa numerik, sehingga value di-hardcode.

### Deduplication
- Setiap jamaah **maksimal 2x** menerima Purchase event (1x DP, 1x Lunas)
- Tracking via kolom `capi_purchase_status` di database
- Guard: hanya agent dengan `capi_configs` yang punya `pixel_id` dan `access_token` valid

## Architecture

### Database Changes

**Tabel `jamaah` (Umroh) — ALTER TABLE:**
```sql
ALTER TABLE jamaah ADD COLUMN IF NOT EXISTS capi_purchase_status TEXT;
```

**Tabel `jamaah_haji` — ALTER TABLE:**
```sql
ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS capi_purchase_status TEXT;
```

**Nilai `capi_purchase_status`:**
- `null` — belum pernah kirim Purchase
- `'dp'` — sudah kirim Purchase saat DP
- `'lunas'` — sudah kirim Purchase saat Lunas

**Backfill (migrasi existing data):**
- Jamaah Umroh dengan `capi_last_bayar > 0` dan `sisa > 0` → set `'dp'`
- Jamaah Umroh dengan `capi_last_bayar > 0` dan `sisa <= 0` → set `'lunas'`
- Ini mencegah double-fire untuk jamaah yang sudah pernah di-fire Purchase sebelumnya

### Core Function

Satu dedicated function menggantikan logic existing yang tersebar:

**`processCapiPurchases(agentId, slug, type, upsertedIdentifiers)`**

Lokasi: `server.js`, di dekat fungsi `fireCapiPurchase` yang existing.

**Flow:**
1. `readCapiConfig(agentId)` → early return jika null/tidak ada pixel+token
2. Query jamaah/jamaah_haji yang baru di-upsert beserta `capi_purchase_status`
3. Classify:
   - **Umroh DP:** `bayar > 0 && sisa > 0 && capi_purchase_status IS NULL` → value = bayar
   - **Umroh Lunas (via DP):** `sisa <= 0 && capi_purchase_status = 'dp'` → value = bayar
   - **Umroh Lunas (langsung):** `bayar > 0 && sisa <= 0 && capi_purchase_status IS NULL` → value = bayar, set status langsung ke 'lunas'
   - **Haji DP:** `status_bayar = 'CICILAN' && capi_purchase_status IS NULL` → value = 60.000.000
   - **Haji Lunas (via DP):** `status_bayar = 'LUNAS' && capi_purchase_status = 'dp'` → value = 60.000.000
   - **Haji Lunas (langsung):** `status_bayar = 'LUNAS' && capi_purchase_status IS NULL` → value = 60.000.000, set status langsung ke 'lunas'
4. Fire Purchase event ke Meta API untuk setiap qualifying jamaah
5. Batch update `capi_purchase_status` di database

### CAPI Payload

```json
{
  "data": [{
    "event_name": "Purchase",
    "event_time": <unix_timestamp>,
    "event_source_url": "https://alhijaz.co/<slug>",
    "action_source": "system_generated",
    "user_data": {
      "client_user_agent": "Miqot Server Sync"
    },
    "custom_data": {
      "currency": "IDR",
      "value": <value>,
      "content_name": "<nama_paket>",
      "content_ids": ["<id_umroh atau id_haji>"],
      "content_type": "product"
    }
  }],
  "test_event_code": "<optional, jika test_mode aktif>"
}
```

### Integration Points

**Replace existing logic (Umroh sync):**
- `server.js:2517-2546` — Phase 2 manual sync CAPI block → replace dengan `processCapiPurchases(agentId, slug, 'umroh', upsertedIds)`
- `server.js:7432-7451` — Background sync CAPI block → replace dengan `processCapiPurchases(agentId, slug, 'umroh', ids)`

**Add new logic (Haji sync):**
- `server.js:4955-4960` — Setelah first batch upsert → add `processCapiPurchases(agentId, slug, 'haji', firstRowIds)`
- `server.js:5010-5023` — Setelah background batch upsert → add `processCapiPurchases(agentId, slug, 'haji', bgRowIds)`

### Files to Modify

| File | Change |
|------|--------|
| `server.js` | Refactor `fireCapiPurchase` → new `processCapiPurchases`, update 4 call sites |
| `scripts/migrate-capi-purchase-status.js` | New migration script for both tables + backfill |

## Verification

1. **Migration:** Jalankan migration script, verifikasi kolom `capi_purchase_status` ada di kedua tabel
2. **Backfill:** Cek jamaah dengan `capi_last_bayar > 0` sudah ter-backfill statusnya
3. **Umroh DP:** Sync agent yang ada jamaah baru DP, verifikasi Purchase event terkirim dan `capi_purchase_status = 'dp'`
4. **Umroh Lunas:** Sync agent yang ada jamaah Lunas (sebelumnya DP), verifikasi Purchase event terkirim dan status jadi `'lunas'`
5. **Haji:** Sync haji, verifikasi Purchase terkirim untuk jamaah CICILAN dan LUNAS
6. **Dedup:** Sync ulang, verifikasi tidak ada Purchase event duplikat
7. **No CAPI config:** Sync agent tanpa CAPI config, verifikasi tidak ada error dan tidak ada event terkirim
8. **Test mode:** Aktifkan test mode di CAPI config, verifikasi event masuk ke Meta Test Events

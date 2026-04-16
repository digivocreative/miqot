# CAPI Event Log — Dashboard Visibility

## Context

Saat ini semua CAPI event (Purchase, PageView, Search, ViewContent, Contact) hanya di-log ke server console. Agent tidak punya cara untuk melihat apakah event berhasil terkirim ke Meta tanpa akses ke server logs atau Meta Events Manager. Fitur ini menambahkan event log yang visible di halaman CAPI dashboard, sehingga agent bisa memverifikasi event-event yang terkirim.

## Requirements

- Log **semua** CAPI event: Purchase (DP/Lunas), PageView, Search, ViewContent, Contact
- Setiap log entry menampilkan: **Timestamp**, **Event Name**, **Status** (success/error), **Value** (untuk Purchase)
- Retention: **30 hari**, auto-cleanup
- UI: **Tab baru "Event Log"** di SettingsPage (Profil | Telegram | CAPI | Event Log)
- Hanya agent dengan CAPI config valid yang punya log

## Architecture

### Database

**Tabel baru: `capi_event_logs`**

```sql
CREATE TABLE capi_event_logs (
  id BIGSERIAL PRIMARY KEY,
  agent_id UUID NOT NULL,
  event_name TEXT NOT NULL,        -- 'Purchase', 'PageView', 'Search', 'ViewContent', 'Contact'
  status TEXT NOT NULL,            -- 'success' atau 'error'
  value BIGINT,                    -- Value IDR (Purchase only), null untuk event lain
  error_message TEXT,              -- Error detail dari Meta API (jika gagal)
  source TEXT NOT NULL DEFAULT 'browser', -- 'sync' (Purchase dari sync), 'browser' (frontend events)
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_capi_event_logs_agent ON capi_event_logs(agent_id, created_at DESC);
```

### Backend Changes

**1. Log helper function (server.js)**

```
logCapiEvent(agentId, eventName, status, { value, errorMessage, source })
```

Insert ke `capi_event_logs`. Fire-and-forget (jangan block event flow).

**2. Integration points — tambah `logCapiEvent` call di:**

- `fireCapiPurchaseEvent()` (server.js ~line 1835): setelah Meta API response
  - Success: `logCapiEvent(agentId, 'Purchase', 'success', { value, source: 'sync' })`
  - Error: `logCapiEvent(agentId, 'Purchase', 'error', { value, errorMessage, source: 'sync' })`
  - Note: `fireCapiPurchaseEvent` saat ini tidak punya `agentId` sebagai parameter — perlu ditambahkan

- `POST /api/capi/:slug/event` endpoint (server.js ~line 2082): setelah kirim event ke Meta
  - Success: `logCapiEvent(agent.id, eventName, 'success', { source: 'browser' })`
  - Error: `logCapiEvent(agent.id, eventName, 'error', { errorMessage, source: 'browser' })`

**3. New API endpoint:**

`GET /api/capi/:slug/logs?page=1&limit=20&event=Purchase`

- Auth: slug-based (sama seperti endpoint CAPI lainnya — perlu session dari login CAPI atau dashboard JWT)
- Response:
  ```json
  {
    "logs": [
      {
        "id": 1,
        "event_name": "Purchase",
        "status": "success",
        "value": 5000000,
        "source": "sync",
        "created_at": "2026-04-16T10:30:00Z"
      }
    ],
    "total": 150,
    "page": 1,
    "totalPages": 8
  }
  ```

**4. Cleanup:** Dalam endpoint GET logs, trigger async cleanup:
```sql
DELETE FROM capi_event_logs WHERE agent_id = $1 AND created_at < now() - interval '30 days'
```

### Frontend Changes

**1. SettingsPage.tsx — Tambah tab "Event Log"**

File: `src/components/SettingsPage.tsx`

- Extend `SettingsTab` type: `'profil' | 'telegram' | 'capi' | 'event-log'`
- Tambah entry di `TAB_CONFIG`: `{ id: 'event-log', label: 'Event Log', icon: Activity }`
- Update `popstate` handler include `'event-log'`
- Render `<CapiEventLog agentSlug={agent.slug} />` saat tab aktif

**2. Komponen baru: CapiEventLog.tsx**

File: `src/components/CapiEventLog.tsx`

**Tampilan:**
- Tabel dengan kolom: Waktu | Event | Status | Value
- Badge warna untuk status:
  - Hijau/emerald untuk `success`
  - Merah/red untuk `error`
- Badge warna untuk event type:
  - Emerald: Purchase
  - Blue: Contact
  - Gray: PageView, Search, ViewContent
- Value ditampilkan sebagai `Rp X.XXX.XXX` (hanya untuk Purchase, kosong untuk lain)
- Timestamp: relative format ("2 menit lalu", "1 jam lalu") dengan tooltip absolute
- Pagination: tombol Prev/Next di bawah
- Empty state: pesan informatif
- Auto-refresh tiap 30 detik saat tab aktif (useInterval)
- Dark mode support (ikuti pattern existing)
- Filter dropdown opsional per event type

### Files to Modify

| File | Change |
|------|--------|
| `server.js` | `logCapiEvent()` helper, update `fireCapiPurchaseEvent` + event endpoint, new GET logs endpoint, cleanup |
| `src/components/SettingsPage.tsx` | Tambah tab "Event Log" |
| `src/components/CapiEventLog.tsx` | Komponen baru — tabel log |
| `scripts/migrate-capi-event-logs.js` | Migration script tabel baru |

## Verification

1. **Migration:** Jalankan migration, verifikasi tabel `capi_event_logs` ada
2. **Purchase log:** Trigger sync jamaah, cek log masuk di tabel dan muncul di UI
3. **Frontend event log:** Buka halaman agent public, trigger PageView/Search/Contact, cek log muncul
4. **Error log:** Test dengan invalid access token, verifikasi error ter-log dengan pesan
5. **Pagination:** Pastikan pagination berfungsi saat data > 20 entries
6. **Retention:** Verifikasi cleanup query berjalan untuk data > 30 hari
7. **Dark mode:** Cek tampilan tabel di dark mode
8. **Tab navigation:** Verifikasi tab Event Log bisa diakses dari URL /dashboard/settings/event-log dan browser back/forward

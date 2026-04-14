# Demo Dummy Data for Agent Bagas

## Context

Demo aplikasi Alhijaz kepada semua agent dijadwalkan **15 April 2026**. Dashboard agent "bagas" perlu terisi data realistis di semua fitur agar demo berjalan mulus. Saat ini data hanya terisi jika agent melakukan sync manual ke sistem internal — untuk demo, kita butuh dummy data yang sudah siap di Supabase.

## Scope

Buat **2 script** di `/scripts/`:
1. `seed-demo.ts` — insert dummy data ke Supabase untuk agent `bagas`
2. `cleanup-demo.ts` — hapus semua dummy data berdasarkan marker

**Marker identifikasi**: Semua dummy data di-tag dengan `_DEMO_` prefix pada field ID atau notes agar mudah di-cleanup.

## Data yang Akan Di-seed

### 1. Jamaah Umroh (`jamaah` table) — 30 records

**Distribusi:**
- 10 jamaah **LUNAS** (sisa = 0)
- 10 jamaah **CICILAN** (bayar > 0, sisa > 0)
- 10 jamaah **BELUM BAYAR** (bayar = 0)

**Field values:**
- `agent_slug`: `'bagas'`
- `id_umroh`: `'_DEMO_UM001'` s/d `'_DEMO_UM030'`
- `nama`: Nama-nama Indonesia realistis (campuran L/P)
- `jk`: `'L'` atau `'P'`
- `wa`: Format `628xxxxxxxxxx`
- `tgl_lahir`: Random antara 1960-2000
- `paket`: Tersebar di 4-5 paket real (ambil dari jadwal API, e.g. "REGULER 9HR", "PLUS CAIRO 12HR", "PLUS TURKEY 12HR", "PROMO 9HR")
- `bayar`: Sesuai status (LUNAS: full amount, CICILAN: partial, BELUM: 0)
- `sisa`: Sesuai status
- `tgl_berangkat`: Tersebar antara Mei-Juli 2026
- `tgl_daftar`: 1-3 bulan sebelum berangkat
- `hijriah_year`: `'1448'`
- `perlengkapan`: Random boolean flags `{koper, baju_ihrom, mukena, sajadah, tas_jinjing}`
- `dokumen`: Random boolean flags `{paspor, visa, foto, surat_mahrom}`
- `no_paspor`: Random passport-style numbers
- `paspor_expired`: 2027-2030
- `raw_data`: `{ staf: 'Demo Staff' }`
- `notes`: null
- `synced_at`: NOW()

**Upsert conflict**: `agent_slug, id_umroh, nama`

### 2. Jamaah Haji (`jamaah_haji` table) — 15 records

**Distribusi:**
- 5 **LUNAS**
- 5 **CICILAN**
- 5 **BELUM BAYAR**

**Field values:**
- `agent_slug`: `'bagas'`
- `id_haji`: `'_DEMO_HJ001'` s/d `'_DEMO_HJ015'`
- `id_jamaah`: `'_DEMO_JH001'` s/d `'_DEMO_JH015'`
- `nama`: Nama Indonesia realistis (berbeda dari jamaah umroh)
- `jk`: `'L'` / `'P'`
- `alamat`: Alamat Jakarta/Bekasi/Tangerang
- `telp`: Format `628xxxxxxxxxx`
- `thn_hijriyah`: `'1448'`
- `thn_masehi`: `'2026'`
- `perwakilan`: `'JAKARTA'`
- `marketing`: `'Bagas'`
- `paket`: `'HAJI PLUS'` / `'HAJI FURODA'`
- `staff`: `'Demo Staff'`
- `jenis`: `'PLUS'` / `'FURODA'`
- `status_bayar`: `'LUNAS'` / `'CICILAN'` / `'BELUM BAYAR'`
- `status_berangkat`: `'BELUM'` / `'PROSES'`
- `bpih_url`: null
- `surat_pernyataan_url`: null
- `synced_at`: NOW()

**Upsert conflict**: `agent_slug, id_haji, id_jamaah`

### 3. Calendar Events (`calendar_events` table) — ~12 records

Events tersebar di April-Juni 2026:
- 4x **keberangkatan** (departure events)
- 4x **kepulangan** (return events)
- 4x **manasik** (briefing events)

**Field values:**
- `id`: `'_DEMO_{date}_{type}_{group}'`
- `event_date`: Tanggal realistis (keberangkatan: Mei-Jun, kepulangan: +9-12 hari, manasik: 1-2 minggu sebelum berangkat)
- `event_type`: `'keberangkatan'` / `'kepulangan'` / `'manasik'`
- `group_number`: `'A'`, `'B'`, `'C'`, `'D'`
- `pesawat`: `'GA 980'`, `'SV 821'`, `'EK 357'`, `'GA 982'`
- `jam`: `'10.30'`, `'22.15'`, `'14.00'`, dll
- `paket`: Nama paket yang matching dengan jamaah
- `pax`: 30-45 per group
- `staff`: Nama staff
- `tour_leader`: Nama tour leader
- `jam_kumpul`: 2-3 jam sebelum jam terbang
- `titik_kumpul`: `'Terminal 3 Bandara Soekarno-Hatta'`
- `raw_data`: `{}`
- `synced_at`: NOW()

**Upsert conflict**: `id`

### 4. Analytics Events (`analytics_events` table) — ~100 records

Data analytics 30 hari terakhir untuk agent `bagas`:

**Event types & distribusi:**
- `login` (event_type: `'auth'`): ~20 events (hampir setiap hari)
- `page_view` (event_type: `'ui'`): ~30 events (dashboard, jamaah, kalkulasi, compare)
- `wa_click` (event_type: `'action'`): ~15 events
- `kalkulasi_open` (event_type: `'feature'`): ~10 events
- `jamaah_sync` (event_type: `'sync'`): ~8 events
- `pdf_generate` (event_type: `'feature'`): ~7 events
- `compare_view` (event_type: `'feature'`): ~5 events
- `ai_copy_generate` (event_type: `'feature'`): ~5 events

**Field values:**
- `agent_slug`: `'bagas'`
- `event_type`: Sesuai kategori di atas
- `event_name`: Sesuai event
- `metadata`: `{ source: '_DEMO_', page: '...', package_id: '...' }` — metadata selalu mengandung `source: '_DEMO_'` untuk cleanup
- `created_at`: Tersebar di 30 hari terakhir, dengan pola realistis (lebih banyak di hari kerja)

### 5. Calendar Insights (`calendar_insights` table) — 1 record

**Field values:**
- `id`: `'latest'`
- `data`:
  ```json
  {
    "today": "Hari ini ada 1 grup keberangkatan (Group A, 35 pax) via Garuda GA 980 pukul 10.30 WIB dari Terminal 3 Soekarno-Hatta. Pastikan semua jamaah sudah kumpul pukul 07.30.",
    "weekly": "Minggu ini: 1 keberangkatan (Senin), 1 kepulangan (Kamis), 2 manasik (Sabtu). Total 78 jamaah terlibat.",
    "cuaca": "Mekkah: 33-42°C (cerah). Madinah: 28-38°C (cerah berawan). Bawa payung dan air minum cukup.",
    "generatedAt": "<timestamp>"
  }
  ```
- `generated_at`: NOW()

## Script Implementation

### `scripts/seed-demo.ts`

```
- Import: @supabase/supabase-js
- Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (service role key untuk bypass RLS)
- Fungsi per-tabel: seedJamaah(), seedJamaahHaji(), seedCalendarEvents(), seedAnalyticsEvents(), seedCalendarInsights()
- Main: jalankan semua seed functions, log hasil per tabel
- Error handling: log error tapi lanjut ke tabel berikutnya
```

### `scripts/cleanup-demo.ts`

```
- Delete from jamaah WHERE agent_slug = 'bagas' AND id_umroh LIKE '_DEMO_%'
- Delete from jamaah_haji WHERE agent_slug = 'bagas' AND id_haji LIKE '_DEMO_%'
- Delete from calendar_events WHERE id LIKE '_DEMO_%'
- Delete from analytics_events WHERE metadata->>'source' = '_DEMO_'
- NOTE: calendar_insights 'latest' akan di-overwrite oleh sistem saat sync berikutnya, tidak perlu di-cleanup
```

### Menjalankan Script

```bash
# Seed
npx tsx scripts/seed-demo.ts

# Cleanup setelah demo
npx tsx scripts/cleanup-demo.ts
```

## Verification

Setelah seed:
1. Buka `/dashboard` sebagai agent bagas — cek insight card dan calendar
2. Buka `/dashboard/jamaah/umroh` — cek 30 jamaah muncul dengan filter status berfungsi
3. Buka `/dashboard/jamaah/haji` — cek 15 jamaah haji muncul
4. Buka `/dashboard/statistik` — cek ringkasan dan chart terisi
5. Buka `/dashboard/analytics` — cek grafik login dan feature usage terisi
6. Test cleanup script, pastikan semua data hilang

## Files to Create/Modify

- **CREATE** `scripts/seed-demo.ts` — main seed script
- **CREATE** `scripts/cleanup-demo.ts` — cleanup script
- **No existing files modified** — ini murni additive

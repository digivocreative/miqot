# Analytics & CAPI Event Logs — Retention & Aggregation Design

**Date:** 2026-04-18
**Tables affected:** `analytics_events`, `capi_event_logs`, new `analytics_events_daily`

## Problem

Dua tabel observability di Supabase tumbuh tidak terkendali:

- **`analytics_events`** — log event user (login, page_view, action, public events) dengan JSONB `metadata`. Tidak punya retention sama sekali → tumbuh linear selamanya. Dibaca oleh `GET /api/analytics/summary` (admin) yang menarik semua row per bulan lalu menghitung di memori.
- **`capi_event_logs`** — log event Meta CAPI per agent. Sudah ada auto-cleanup 30 hari tapi **lazy** (hanya jalan saat endpoint `/api/capi/:slug/logs` di-hit). Volume didorong oleh fire-and-forget Purchase event per jamaah pada tiap sync.

Supabase row count sudah terlihat masif. Perlu strategi pengurangan data yang tidak mengorbankan dashboard yang ada.

## Goals

1. Kurangi row count masif di kedua tabel dengan retention yang tegas dan deterministik.
2. Pertahankan functionality `/api/analytics/summary` untuk rentang waktu apa pun (termasuk bulan-bulan lama).
3. Tetap bisa drill-down row-level detail untuk troubleshooting recent (14 hari terakhir).

## Non-goals

- **Tidak mengubah sisi ingest.** Sampling `page_view`, throttling event publik, ringkasan sukses CAPI — semua di-defer. Keputusan ini final (pilihan E user di brainstorming).
- Tidak menambah endpoint API baru.
- Tidak mengubah schema kolom tabel existing.
- Tidak menambah RLS policy baru (mengikuti konvensi tabel lain di proyek).

## High-Level Decisions

| Decision | Value |
|---|---|
| Raw retention `analytics_events` | 14 hari |
| Raw retention `capi_event_logs` | 14 hari (turun dari 30) |
| Agregat `analytics_events` | Ya, harian per agent × event_type × event_name |
| Agregat `capi_event_logs` | **Tidak** — tidak ada dashboard yang baca summary CAPI |
| Cleanup mechanism | Cron Node via pattern `setTimeout` recursive (konsisten dengan `scheduleKursCron`) |
| Jadwal cron | 02:00 WIB (19:00 UTC hari sebelumnya) — 1 jam setelah kurs cron |
| Metadata agregat | Hanya `count`. Tidak ada sampel metadata JSONB di agregat |
| Drill-down metadata | Hanya tersedia di raw (≤ 14 hari) |

## Architecture

### New Table: `analytics_events_daily`

```sql
CREATE TABLE analytics_events_daily (
  date        DATE NOT NULL,
  agent_id    UUID NOT NULL,
  event_type  TEXT NOT NULL,
  event_name  TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (date, agent_id, event_type, event_name)
);
CREATE INDEX idx_analytics_daily_date  ON analytics_events_daily(date DESC);
CREATE INDEX idx_analytics_daily_agent ON analytics_events_daily(agent_id, date DESC);
```

**Null agent_id handling:** `logAnalyticsEvent(agent?.id || null, 'login', 'login_failed')` di [server.js:824](../../../server.js#L824) satu-satunya sumber null. Di agregasi, null → sentinel UUID `'00000000-0000-0000-0000-000000000000'`. Motivasi: menghindari `NULLS NOT DISTINCT` yang mempersulit upsert `onConflict`.

**Skema tanpa `sum_value`:** `analytics_events` tidak punya kolom value (hanya `metadata` JSONB). CAPI punya `value` tapi tidak di-agregat. Jadi kolom `count` saja cukup.

### Supporting Index on `analytics_events`

Tabel `analytics_events` kemungkinan belum punya index di `created_at` (tidak ditemukan definisi migration di repo). Cleanup `DELETE WHERE created_at < cutoff` dan range query di `fetchEventsForRange` akan melakukan sequential scan di tabel besar. Tambah sebelum rollout:

```sql
CREATE INDEX IF NOT EXISTS idx_analytics_events_created
  ON analytics_events(created_at DESC);
```

Verify dulu di Supabase SQL Editor (`\d analytics_events` atau `SELECT indexname FROM pg_indexes WHERE tablename = 'analytics_events'`) — jika sudah ada, skip.

### Modified Read-Path: `/api/analytics/summary`

Endpoint di [server.js:6444](../../../server.js#L6444). Logika baru:

```
cutoff = now - 14 hari
Untuk request month [start .. end]:
  raw_range = [max(start, cutoff) .. end]       → query analytics_events
  agg_range = [start .. min(end, cutoff-1day)]  → query analytics_events_daily
  Merge hasil kedua sumber di application layer.
```

**Helper baru** `fetchEventsForRange(startISO, endISO)` di dekat `logAnalyticsEvent`:

```js
async function fetchEventsForRange(startISO, endISO) {
  const rawCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const rawStart = new Date(Math.max(new Date(startISO), rawCutoff)).toISOString();

  const { data: rawEvents } = await supabase
    .from('analytics_events')
    .select('agent_id, event_type, event_name, metadata, created_at')
    .gte('created_at', rawStart)
    .lte('created_at', endISO);

  const aggEnd = new Date(Math.min(new Date(endISO), rawCutoff)).toISOString().slice(0, 10);
  const { data: aggEvents } = new Date(startISO) < rawCutoff
    ? await supabase
        .from('analytics_events_daily')
        .select('date, agent_id, event_type, event_name, count')
        .gte('date', startISO.slice(0, 10))
        .lte('date', aggEnd)
    : { data: [] };

  return { rawEvents: rawEvents || [], aggEvents: aggEvents || [] };
}
```

**Perubahan di endpoint summary:**

| Metrik | Sumber baru |
|---|---|
| `totalLogins` / `totalPageViews` / `totalWAClicks` | Jumlah `count` dari agg (matching event_name) + hitung row dari rawEvents (matching event_name) |
| `activeAgents` (7 hari) | Selalu dari `rawEvents` — 7d ≤ 14d retention, agg tidak diperlukan |
| Per-agent breakdowns | Jumlahkan per `agent_id` dari kedua sumber |
| Per-event timeline harian | Agg langsung per-`date`, raw di-group-by(`created_at::date`) |

**Catatan:** drill-down `metadata` di luar 14 hari tidak mungkin — konsekuensi pilihan agregat murni count.

### Daily Cron Job

Tambah `scheduleAnalyticsMaintenanceCron()` di [server.js](../../../server.js) mengikuti pattern [`scheduleKursCron`](../../../server.js#L221). Jadwal **02:00 WIB** (bukan 01:00 agar tidak overlap dengan kurs cron).

```js
async function runAnalyticsMaintenance() {
  const now = new Date();
  const yesterdayStart = new Date(now);
  yesterdayStart.setUTCHours(0, 0, 0, 0);
  yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);
  const yesterdayEnd = new Date(yesterdayStart);
  yesterdayEnd.setUTCDate(yesterdayEnd.getUTCDate() + 1);
  const cutoff14d = new Date(now - 14 * 24 * 60 * 60 * 1000);

  try {
    await aggregateAnalyticsDay(yesterdayStart.toISOString(), yesterdayEnd.toISOString());
  } catch (err) {
    console.error('[Analytics] Aggregation failed, skipping cleanup:', err.message);
    return;
  }

  const { error: e1 } = await supabase.from('analytics_events').delete().lt('created_at', cutoff14d.toISOString());
  if (e1) console.error('[Analytics] Raw cleanup error:', e1.message);
  const { error: e2 } = await supabase.from('capi_event_logs').delete().lt('created_at', cutoff14d.toISOString());
  if (e2) console.error('[CAPI] Raw cleanup error:', e2.message);
}
```

**Aggregation function** (idempotent, upsert on PK):

```js
const ANON_AGENT = '00000000-0000-0000-0000-000000000000';
const BATCH = 1000;

async function aggregateAnalyticsDay(startISO, endISO) {
  const dateKey = startISO.slice(0, 10);
  const counts = new Map();

  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('analytics_events')
      .select('agent_id, event_type, event_name')
      .gte('created_at', startISO)
      .lt('created_at', endISO)
      .range(offset, offset + BATCH - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      const aid = row.agent_id || ANON_AGENT;
      const key = `${aid}|${row.event_type}|${row.event_name}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    if (data.length < BATCH) break;
    offset += BATCH;
  }

  if (counts.size === 0) return;

  const rows = [...counts.entries()].map(([key, count]) => {
    const [agent_id, event_type, event_name] = key.split('|');
    return { date: dateKey, agent_id, event_type, event_name, count, updated_at: new Date().toISOString() };
  });

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase
      .from('analytics_events_daily')
      .upsert(chunk, { onConflict: 'date,agent_id,event_type,event_name' });
    if (error) console.error('[Analytics] Aggregate upsert error:', error.message);
  }
}
```

**Safety properties:**

- Idempotent: rerun overwrites row dengan `count` yang sama (PK match).
- Agregasi gagal → cleanup skip, sehingga tidak pernah ada "data hilang tanpa agregat".
- Tidak pakai `computeSafeDeletions` (dari pola `lib/sync-cleanup.js`) — karena ini bukan sync partial-failure scenario. `created_at` adalah immutable insert timestamp, aman untuk `DELETE WHERE created_at < cutoff` langsung.

### Removed: Lazy Cleanup in CAPI Logs Endpoint

Di [server.js:2647-2657](../../../server.js#L2647-L2657) terdapat blok lazy cleanup on `/api/capi/:slug/logs` hit, plus `capiLogCleanupLast` Map. Setelah cron berjalan, blok ini **dihapus sepenuhnya** — cleanup sudah deterministik harian, tidak perlu piggyback ke endpoint read.

## Migration & Rollout

### Step 0 — Create table

Buat `scripts/migrate-analytics-daily.js` mengikuti pola [`scripts/migrate-capi-event-logs.js`](../../../scripts/migrate-capi-event-logs.js) (log SQL untuk copy-paste ke Supabase SQL Editor jika `exec_sql` RPC tidak tersedia).

### Step 1 — Backfill historical data

Buat `scripts/backfill-analytics-daily.js`:

1. Query `MIN(created_at)` dari `analytics_events` → `firstDate`.
2. Loop per-hari dari `firstDate` sampai `today - 14 days`.
3. Untuk tiap hari, panggil `aggregateAnalyticsDay(startISO, endISO)` (re-use fungsi yang sama dari server.js — extract ke module `lib/analytics-maintenance.js` agar bisa di-import oleh script).
4. Log progress per hari.

**Satu-shot manual**, bukan otomatis di server startup — menghindari trigger ulang tiap reboot.

### Step 2 — Code deploy (urutan wajib)

1. **Migration** dijalankan (`node scripts/migrate-analytics-daily.js` → paste SQL jika perlu). Table ada tapi belum dipakai.
2. **Application code** deploy dengan tiga perubahan:
   - Tambah `scheduleAnalyticsMaintenanceCron()` + call di startup (dekat [server.js:255](../../../server.js#L255) yang memanggil `scheduleKursCron()`).
   - Extract `aggregateAnalyticsDay` + `runAnalyticsMaintenance` ke `lib/analytics-maintenance.js` (agar script backfill bisa import).
   - Refactor `/api/analytics/summary` untuk split raw vs agg.
   - Hapus blok lazy cleanup + `capiLogCleanupLast` Map di CAPI logs endpoint.
3. **Backfill** (`node scripts/backfill-analytics-daily.js`) di server production.
4. **Monitor** cron pertama di 02:00 WIB hari berikutnya. Verifikasi log `[Analytics] Aggregated N events, deleted M raw rows`.

**Urutan berarti:** kalau code deploy tanpa backfill, endpoint summary untuk bulan-bulan lama akan tampak kosong sampai backfill dijalankan. Dokumentasikan di PR description.

### Step 3 — Validation

- `GET /api/analytics/summary?month=4&year=2026` sebelum & sesudah backfill → angka `totalLogins`, `totalPageViews`, `totalWAClicks` match (toleransi 0 karena count integer).
- Spot-check: `SELECT date, SUM(count) FROM analytics_events_daily GROUP BY date ORDER BY date` → growth rate masuk akal, tidak ada gap tanggal.
- Row count `analytics_events` turun ke ~14 hari terakhir setelah cron hari pertama.
- Row count `capi_event_logs` turun dari ~30 hari ke ~14 hari.

## Testing Strategy

- **Aggregation idempotency:** unit test `aggregateAnalyticsDay` dengan 2x run pada data fixture → baris `analytics_events_daily` tidak berubah setelah run kedua.
- **Read-path merge:** test `fetchEventsForRange` dengan rentang yang straddle `cutoff` (start sebelum cutoff, end setelah) → hasil raw + agg tidak overlap tanggal, tidak ada gap.
- **Boundary:** test di hari ke-14 (tepat cutoff) — pastikan tidak double-count (raw masih ada untuk hari itu, agg belum dibuat).
- **Cleanup safety:** integration test yang insert data 15 hari lalu, jalankan `runAnalyticsMaintenance`, verifikasi row tersebut hilang dari raw, tapi `count` tetap ada di agg.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Cron gagal berhari-hari (server down/bug) | Idempotent + "aggregasi mencakup D-1 saja" → data D-2, D-3 ... tetap di raw sampai cron sukses lagi. Selama server up dalam 14 hari, tidak ada data hilang. Kalau server down >14 hari, data paling lama akan ke-cleanup tanpa ke-agregat — dokumentasi ops. |
| Summary endpoint performance degradasi | Raw query range menyempit (14 hari max), jadi secara umum LEBIH cepat. Agg query cover bulan-bulan lama dengan ~N agent × ~10 event_name × 30 hari rows → ratusan rows, trivial. |
| Backfill script terlalu lama di production | Script sekali jalan, boleh diam. Ukur pre-run dulu dengan `SELECT MIN(created_at), COUNT(*) FROM analytics_events` untuk estimasi. |
| Server restart tepat di 02:00 WIB miss cron | `setTimeout` pattern reschedule otomatis. Miss 1x tidak fatal karena D-1 tetap ada di raw sampai hari berikutnya. |

## Files Touched (preview)

- **New:** `docs/superpowers/specs/2026-04-18-analytics-retention-design.md` (this file)
- **New:** `lib/analytics-maintenance.js` — extract aggregation + maintenance logic
- **New:** `scripts/migrate-analytics-daily.js` — SQL migration helper
- **New:** `scripts/backfill-analytics-daily.js` — one-shot backfill
- **Modified:** `server.js`
  - Tambah `scheduleAnalyticsMaintenanceCron()` + call
  - Refactor `/api/analytics/summary`
  - Hapus lazy cleanup + `capiLogCleanupLast` Map di CAPI logs endpoint
- **Modified:** `docs/project-summary.md` — update daftar tabel + tambah `analytics_events_daily`

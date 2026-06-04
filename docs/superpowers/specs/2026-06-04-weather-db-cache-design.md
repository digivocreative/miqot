# Weather → DB-backed cache (server-only fetch)

**Date:** 2026-06-04
**Status:** Approved

## Problem

`/api/weather/cities` lazy-fetches Open-Meteo on request with an in-memory cache only. Every backend restart loses the cache, so the next dashboard load re-fetches all 6 cities — including on local dev, which should never call Open-Meteo at all. During Open-Meteo outages this also spams 6+ warning lines per attempt.

## Goals

- Local backend never calls Open-Meteo.
- Production server fetches every 3 hours (not on request, not on restart-while-fresh).
- Weather data persisted in Supabase (`sb.alhijaz.co`, shared by local and server), so any environment serves it straight from DB.
- No frontend changes required (`CuacaWidget.tsx` keeps working as-is).

## Non-goals

- `FlightSharePage.tsx` fetches Open-Meteo directly from the browser per arrival city — out of scope.
- No widget redesign (still shows "current" readings, refreshed every 3h).

## Design

Mirrors the existing **kurs** pattern (`kurs_cache` table + startup-load + gated cron).

### 1. DB schema

New migration `migrations/20260604000000_weather_cache.sql`:

```sql
CREATE TABLE IF NOT EXISTS weather_cache (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE weather_cache ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';
```

Single row `id='cities'`; `data` = array of 6 city objects, exact shape of today's `fetchCityWeather()` output. RLS enabled with no policies → service-role backend only (same as `kurs_cache`).

### 2. Server flow (gated by `shouldRunBackgroundJobs()`)

- **Startup:** load `weather_cache` row into memory. If the row is missing OR `synced_at` older than 3h → fetch once. Restart while fresh → no fetch.
- **Cron:** `cron.schedule('0 */3 * * *', ..., { timezone: 'Asia/Jakarta' })` → `fetchAllCitiesWeather()` → upsert DB + update memory.
- `fetchAllCitiesWeather()` = current route-handler logic extracted: sequential fetch with 300ms delay, one retry pass, merge failed cities with previous data. If ALL cities fail → do not overwrite DB or memory; log ONE summary line; next cron retries (≤3h later).

### 3. Endpoint (all environments)

`GET /api/weather/cities` becomes read-only:

- Serve from memory if the last DB read is <10 min old; otherwise re-read DB (picks up the server's refresh, since local and server share the DB).
- Never calls Open-Meteo from the request path.
- Response: `{ success, data, cached, syncedAt }` — `syncedAt` added for debugging; FE doesn't need it.
- DB row missing entirely (pre-first-deploy only): `503 { error: 'Data cuaca belum tersedia' }`.

Local startup does nothing (no fetch, no cron) because `ENABLE_BACKGROUND_JOBS=false` in local `.env`.

### 4. Code moves

- Remove from route handler: lazy fetch, dual TTL (`WEATHER_CACHE_TTL_FULL`/`_PARTIAL`), in-request retry.
- New `lib/weather-cache.js` (pure, testable): `isWeatherRefreshDue(syncedAt, now, intervalMs)` and `mergeWeatherResults(fresh, previous, cityKeys)`.
- `fetchCityWeather`, `wmoMap`, `WEATHER_CITIES`, `DAYS_ID` stay in `server.js`.

### 5. Error handling

| Scenario | Behavior |
|---|---|
| Open-Meteo 502 during cron | Failed cities keep previous data; all failed → DB untouched, 1 summary log line, retry next cron |
| DB write fails | Log error; memory still updated (server keeps serving fresh data) |
| DB read fails on request | Serve last in-memory data if any; else 500 |

### 6. Testing

- Unit tests for `lib/weather-cache.js` in `tests/weather-cache.test.js` (existing `tests/` convention): freshness boundaries, merge with partial failures, all-failed case.
- Manual verify: start local backend → no `[Weather]` fetch logs; `GET /api/weather/cities` returns DB data with `syncedAt`.

## Rollout

1. Apply migration to `sb.alhijaz.co`.
2. Deploy server — first boot finds empty `weather_cache` → fetches once, persists.
3. Local picks up data on next request, zero fetches.

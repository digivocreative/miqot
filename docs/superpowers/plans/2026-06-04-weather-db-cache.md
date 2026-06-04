# DB-Backed Weather Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Weather data fetched only by the production server every 3 hours, persisted in Supabase `weather_cache`, served read-only to all environments — local never calls Open-Meteo.

**Architecture:** Mirrors the existing kurs pattern in `server.js`: a `weather_cache` table (single row `id='cities'`), startup load-from-DB + fetch-only-if-stale, `node-cron` refresh gated by `shouldRunBackgroundJobs()`, and a read-only `/api/weather/cities` endpoint. Pure freshness/merge logic lives in `lib/weather-cache.js` with `node:test` unit tests.

**Tech Stack:** Node ESM (`server.js`), `@supabase/supabase-js` (service role), `node-cron`, `node:test` + `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-06-04-weather-db-cache-design.md`

**Deviation from spec (flagged during planning):** adds a dev-only `POST /api/dev/trigger-weather-refresh` route (mirrors the existing `/api/dev/trigger-birthday-digest` pattern, `NODE_ENV !== 'production'` only). It lets us verify the full fetch→persist pipeline locally and seed the DB before the server deploy. Local still never fetches automatically.

---

### Task 1: Pure helpers `lib/weather-cache.js` (TDD)

**Files:**
- Create: `lib/weather-cache.js`
- Test: `tests/weather-cache.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/weather-cache.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWeatherRefreshDue, mergeWeatherResults } from '../lib/weather-cache.js';

const H = 60 * 60 * 1000;
const KEYS = ['makkah', 'madinah', 'istanbul'];
const city = (key, temp) => ({ key, temp });

test('isWeatherRefreshDue: null/undefined syncedAt is due', () => {
  assert.equal(isWeatherRefreshDue(null, 1000, 3 * H), true);
  assert.equal(isWeatherRefreshDue(undefined, 1000, 3 * H), true);
});

test('isWeatherRefreshDue: invalid date string is due', () => {
  assert.equal(isWeatherRefreshDue('bukan-tanggal', Date.UTC(2026, 5, 4), 3 * H), true);
});

test('isWeatherRefreshDue: fresh data is not due', () => {
  const synced = Date.UTC(2026, 5, 4, 9, 0, 0);
  const justBefore = synced + 3 * H - 1;
  assert.equal(isWeatherRefreshDue(new Date(synced).toISOString(), justBefore, 3 * H), false);
});

test('isWeatherRefreshDue: exactly intervalMs old is due', () => {
  const synced = Date.UTC(2026, 5, 4, 9, 0, 0);
  assert.equal(isWeatherRefreshDue(new Date(synced).toISOString(), synced + 3 * H, 3 * H), true);
});

test('mergeWeatherResults: all fresh, canonical order preserved', () => {
  const fresh = [city('istanbul', 20), city('makkah', 40), city('madinah', 38)];
  const merged = mergeWeatherResults(fresh, null, KEYS);
  assert.deepEqual(merged.map((c) => c.key), ['makkah', 'madinah', 'istanbul']);
});

test('mergeWeatherResults: failed city filled from previous', () => {
  const fresh = [city('makkah', 41), city('istanbul', 22)];
  const previous = [city('makkah', 40), city('madinah', 38), city('istanbul', 20)];
  const merged = mergeWeatherResults(fresh, previous, KEYS);
  assert.deepEqual(merged, [city('makkah', 41), city('madinah', 38), city('istanbul', 22)]);
});

test('mergeWeatherResults: city missing everywhere is omitted', () => {
  const merged = mergeWeatherResults([city('makkah', 40)], null, KEYS);
  assert.deepEqual(merged, [city('makkah', 40)]);
});

test('mergeWeatherResults: first run without previous returns fresh only', () => {
  const merged = mergeWeatherResults([city('madinah', 38)], undefined, KEYS);
  assert.deepEqual(merged, [city('madinah', 38)]);
});

test('mergeWeatherResults: key not in cityKeys is dropped', () => {
  const fresh = [city('makkah', 40), city('kota-dihapus', 99)];
  const merged = mergeWeatherResults(fresh, null, KEYS);
  assert.deepEqual(merged, [city('makkah', 40)]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/weather-cache.test.js`
Expected: FAIL — `Cannot find module '.../lib/weather-cache.js'`

- [ ] **Step 3: Write the implementation**

Create `lib/weather-cache.js`:

```js
// Weather cache helpers — pure & unit-tested.
//
// Cuaca 6 kota di-fetch HANYA oleh server production (shouldRunBackgroundJobs)
// tiap 3 jam via cron, lalu dipersist ke tabel `weather_cache` (1 baris,
// id='cities'). Endpoint /api/weather/cities murni baca dari DB/memory —
// local dev tidak pernah memanggil Open-Meteo otomatis. Lihat
// docs/superpowers/specs/2026-06-04-weather-db-cache-design.md.

export function isWeatherRefreshDue(syncedAt, now, intervalMs) {
  if (!syncedAt) return true;
  const t = new Date(syncedAt).getTime();
  if (Number.isNaN(t)) return true;
  return now - t >= intervalMs;
}

// fresh = hasil fetch run ini; previous = array kota dari cache sebelumnya;
// cityKeys = urutan kanonik WEATHER_CITIES. Kota yang gagal di-fetch diisi
// dari previous; kota tanpa data sama sekali di-skip.
export function mergeWeatherResults(fresh, previous, cityKeys) {
  const freshByKey = new Map((fresh || []).map((c) => [c.key, c]));
  const prevByKey = new Map((previous || []).map((c) => [c.key, c]));
  const merged = [];
  for (const key of cityKeys) {
    const entry = freshByKey.get(key) || prevByKey.get(key);
    if (entry) merged.push(entry);
  }
  return merged;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/weather-cache.test.js`
Expected: PASS — 9 tests, 0 failures

- [ ] **Step 5: Commit**

Verify branch first (it can move mid-session): `git branch --show-current` → expect `main`.

```bash
git add lib/weather-cache.js tests/weather-cache.test.js
git commit --only lib/weather-cache.js tests/weather-cache.test.js -m "feat(weather): pure freshness + merge helpers for DB-backed cache"
```

---

### Task 2: Migration `weather_cache`

**Files:**
- Create: `migrations/20260604000000_weather_cache.sql`

- [ ] **Step 1: Create the migration file**

```sql
CREATE TABLE IF NOT EXISTS weather_cache (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE weather_cache ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
```

(RLS on with no policies = service-role backend only, same as `kurs_cache`.)

- [ ] **Step 2: Apply the migration to `sb.alhijaz.co`** *(manual gate — ask the user)*

Local and production share this DB, so one application covers both. Apply via the user's usual flow (self-hosted Supabase Studio SQL editor / psql). The executor cannot do this step alone — hand the SQL to the user and wait for confirmation.

- [ ] **Step 3: Verify the table exists via PostgREST**

```bash
node -e "import('dotenv/config').then(async()=>{const{createClient}=await import('@supabase/supabase-js');const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);const{data,error}=await sb.from('weather_cache').select('id,synced_at');console.log(JSON.stringify({data,error}));})"
```

Expected: `{"data":[],"error":null}` (empty table, no error). If `error` mentions a missing table, the migration didn't apply or PostgREST hasn't reloaded its schema cache — re-run `NOTIFY pgrst, 'reload schema';`.

- [ ] **Step 4: Commit**

```bash
git add migrations/20260604000000_weather_cache.sql
git commit --only migrations/20260604000000_weather_cache.sql -m "feat(weather): weather_cache table for DB-backed weather data"
```

---

### Task 3: Rewire `server.js` weather section

**Files:**
- Modify: `server.js` — import block (~line 63–75) and the weather section (`// ─── WEATHER ENDPOINT ───`, ~line 12296–12443)

Everything weather-related is contained in that section (verified: `weatherCache*` has no references elsewhere). `cron` (line 81), `shouldRunBackgroundJobs` (line 74), and `supabase` (line 98) are already imported/defined.

- [ ] **Step 1: Add the lib import**

Next to the other `./lib/` imports near the top of `server.js` (around line 75, after the `sync-schedule.js` import), add:

```js
import { isWeatherRefreshDue, mergeWeatherResults } from './lib/weather-cache.js';
```

- [ ] **Step 2: Replace the weather cache state + route handler**

**Keep unchanged:** `WEATHER_CITIES`, `wmoMap`, `DAYS_ID`, `fetchCityWeather`.

**Delete** these lines (currently `server.js:12306-12310`):

```js
let weatherCache = null;
let weatherCacheTime = 0;
let weatherCacheTTL = 60 * 60 * 1000;
const WEATHER_CACHE_TTL_FULL = 60 * 60 * 1000;     // 1 jam untuk data lengkap
const WEATHER_CACHE_TTL_PARTIAL = 10 * 60 * 1000;   // 10 menit untuk data tidak lengkap
```

**Replace with:**

```js
// DB-backed cache (pola kurs): server production fetch tiap 3 jam via cron →
// tabel weather_cache; endpoint murni baca. Local (ENABLE_BACKGROUND_JOBS=false)
// tidak pernah memanggil Open-Meteo otomatis.
const WEATHER_REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 jam
const WEATHER_DB_READ_TTL_MS = 10 * 60 * 1000; // re-read DB max tiap 10 menit
let weatherMemory = null; // { cities: [...], syncedAt: string }
let weatherDbReadAt = 0;
```

**Delete** the entire current route handler `app.get('/api/weather/cities', ...)` (currently `server.js:12373-12443`, from `app.get` through its closing `});`).

**Replace with** (directly after `fetchCityWeather`'s closing brace):

```js
async function loadWeatherFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('weather_cache')
      .select('data, synced_at')
      .eq('id', 'cities')
      .single();
    if (error || !data) return false;
    weatherMemory = { cities: data.data, syncedAt: data.synced_at };
    return true;
  } catch (err) {
    console.error('[Weather] Supabase load error:', err.message);
    return false;
  }
}

// Fetch semua kota sequential (delay 300ms anti rate-limit, 1 pass retry),
// merge kota gagal dengan data sebelumnya, persist ke DB + memory.
// Semua kota gagal → DB & memory tidak disentuh (coba lagi di cron berikutnya).
async function fetchAllCitiesWeather() {
  const results = [];
  let failed = [];
  for (const city of WEATHER_CITIES) {
    try {
      results.push(await fetchCityWeather(city));
    } catch {
      failed.push(city);
    }
    if (city !== WEATHER_CITIES[WEATHER_CITIES.length - 1]) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  if (failed.length > 0 && failed.length < WEATHER_CITIES.length) {
    await new Promise((r) => setTimeout(r, 2000));
    const stillFailed = [];
    for (const city of failed) {
      try {
        results.push(await fetchCityWeather(city));
      } catch {
        stillFailed.push(city);
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    failed = stillFailed;
  }

  if (results.length === 0) {
    console.warn('[Weather] Semua kota gagal di-fetch (Open-Meteo down?) — DB & memory tidak diubah, retry di cron berikutnya');
    return false;
  }
  if (failed.length > 0) {
    console.warn(`[Weather] ${failed.length} kota gagal, pakai data lama: ${failed.map((c) => c.key).join(', ')}`);
  }

  const cities = mergeWeatherResults(results, weatherMemory?.cities, WEATHER_CITIES.map((c) => c.key));
  const syncedAt = new Date().toISOString();
  weatherMemory = { cities, syncedAt };

  try {
    const { error } = await supabase.from('weather_cache').upsert(
      { id: 'cities', data: cities, synced_at: syncedAt },
      { onConflict: 'id' }
    );
    if (error) throw new Error(error.message);
    console.log(`[Weather] ${cities.length} kota dipersist ke Supabase (${failed.length} dari cache lama)`);
  } catch (err) {
    console.error('[Weather] Supabase persist error:', err.message);
  }
  return true;
}

if (shouldRunBackgroundJobs()) {
  (async () => {
    await loadWeatherFromSupabase();
    if (isWeatherRefreshDue(weatherMemory?.syncedAt, Date.now(), WEATHER_REFRESH_INTERVAL_MS)) {
      console.log('[Weather] Cache kosong/basi saat startup, fetch sekali...');
      await fetchAllCitiesWeather();
    } else {
      console.log(`[Weather] Cache masih segar (synced ${weatherMemory.syncedAt}), skip fetch startup`);
    }
  })();
  cron.schedule('0 */3 * * *', async () => {
    try {
      await fetchAllCitiesWeather();
    } catch (err) {
      console.error('[Weather] Cron fetch error:', err.message);
    }
  }, { timezone: 'Asia/Jakarta' });
}

// Dev-only: trigger weather refresh manually (skipped in production).
// Dipakai untuk verifikasi pipeline fetch→persist & seeding DB dari local.
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/dev/trigger-weather-refresh', authMiddleware, async (req, res) => {
    try {
      const ok = await fetchAllCitiesWeather();
      res.json({ success: ok, syncedAt: weatherMemory?.syncedAt ?? null, cities: weatherMemory?.cities?.length ?? 0 });
    } catch (err) {
      console.error('[Weather/dev-trigger] error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });
}

app.get('/api/weather/cities', authMiddleware, async (req, res) => {
  try {
    const now = Date.now();
    if (!weatherMemory || now - weatherDbReadAt >= WEATHER_DB_READ_TTL_MS) {
      await loadWeatherFromSupabase();
      weatherDbReadAt = now;
    }
    if (!weatherMemory) {
      return res.status(503).json({ error: 'Data cuaca belum tersedia' });
    }
    res.json({ success: true, data: weatherMemory.cities, cached: true, syncedAt: weatherMemory.syncedAt });
  } catch (err) {
    console.error('[Weather] read error:', err.message);
    if (weatherMemory) {
      return res.json({ success: true, data: weatherMemory.cities, cached: true, stale: true, syncedAt: weatherMemory.syncedAt });
    }
    res.status(500).json({ error: 'Gagal mengambil data cuaca' });
  }
});
```

- [ ] **Step 3: Syntax check**

Run: `node --check server.js`
Expected: no output (exit 0)

- [ ] **Step 4: Re-run unit tests**

Run: `node --test tests/weather-cache.test.js`
Expected: PASS — 9 tests, 0 failures

- [ ] **Step 5: Commit**

Verify branch first: `git branch --show-current` → expect `main`.

```bash
git add server.js
git commit --only server.js -m "feat(weather): read-only endpoint + 3h server cron, DB-backed (no fetch on local/restart)"
```

---

### Task 4: End-to-end verification (local)

**Files:** none (manual verification)

Note: requires Task 2's migration applied. The auth token lives in `localStorage`/`sessionStorage` under `auth_session` (JSON with `.token`).

- [ ] **Step 1: Start local backend and confirm zero weather activity**

Run: `node server.js` (local `.env` has `ENABLE_BACKGROUND_JOBS=false`)
Expected: startup logs contain `[BackgroundJobs] Disabled` and **no** `[Weather]` lines.

- [ ] **Step 2: Confirm endpoint serves 503 before seeding (and still no fetch)**

Open the local dashboard (`npm run dev`, login as any agent). CuacaWidget shows its error state ("Gagal memuat data cuaca") because the endpoint returns 503 `Data cuaca belum tersedia`. Server logs: still no `[Weather]` fetch lines — proves the request path never fetches.

- [ ] **Step 3: Seed via dev trigger**

In the dashboard's browser console:

```js
const s = JSON.parse(localStorage.getItem('auth_session') || sessionStorage.getItem('auth_session'));
fetch('/api/dev/trigger-weather-refresh', { method: 'POST', headers: { Authorization: `Bearer ${s.token}` } }).then(r => r.json()).then(console.log);
```

Expected: `{ success: true, syncedAt: "...", cities: 6 }`; server logs `[Weather] 6 kota dipersist ke Supabase (0 dari cache lama)`.
(If Open-Meteo is still returning 502s, expect `success: false` and one summary log line — retry the trigger later; Steps 1–2 remain valid.)

- [ ] **Step 4: Confirm widget serves from DB and restart does not re-fetch**

Reload dashboard → weather widget renders 6 cities. Restart `node server.js` → still no `[Weather]` logs; reload dashboard → widget still renders (data straight from DB).

- [ ] **Step 5: Confirm DB row**

```bash
node -e "import('dotenv/config').then(async()=>{const{createClient}=await import('@supabase/supabase-js');const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);const{data,error}=await sb.from('weather_cache').select('id,synced_at');console.log(JSON.stringify({data,error}));})"
```

Expected: one row `id='cities'` with a recent `synced_at`.

---

### Task 5: Deploy & production verification

**Files:** none (operational)

- [ ] **Step 1: Push and deploy** *(manual gate — coordinate with the user; deploy uses their usual flow)*

```bash
git push origin main
```

- [ ] **Step 2: Verify production behavior**

On the server after deploy, logs should show either `[Weather] Cache masih segar (...) skip fetch startup` (if local seeding ran <3h before) or one startup fetch, then refreshes only at cron times (00:00, 03:00, ... WIB). The old per-request `[Weather] <city> failed` spam is gone — outages now log at most 1 summary line per 3h run.

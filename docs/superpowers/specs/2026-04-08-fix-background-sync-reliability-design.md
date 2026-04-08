# Fix Background Sync Reliability

## Context

Background auto-sync untuk jamaah data (setiap 1 jam via `setInterval`) sering gagal secara silent, menyebabkan timestamp "Sync: 16j lalu" di UI. Manual sync selalu berhasil. Masalahnya bukan di network/server, tapi bug error handling di `syncOneAgent` yang menyebabkan `isSyncing` stuck `true` — sehingga semua sync berikutnya di-skip.

## Root Cause

3 bug di `server.js`:

1. **No `finally` block** di `syncOneAgent` (line 5778+) — jika Phase 1 atau Phase 2 throw, `isSyncing` tidak di-reset. Manual sync (line 1918) punya `finally` dan selalu berhasil.
2. **Phase 1 catch tidak reset state** (line 5927) — error hanya di-log, `isSyncing` tetap `true`, eksekusi lanjut ke Phase 2 yang bisa juga gagal.
3. **Tidak ada stuck-sync detection** — jika sync hang, sync berikutnya (1 jam kemudian) di-skip selamanya tanpa warning.

## Changes

### 1. Add `finally` block to `syncOneAgent`

**File:** `server.js`, function `syncOneAgent` (line 5778+)

Wrap existing try/catch with a `finally` that guarantees state reset:

```javascript
async function syncOneAgent(agent) {
  const slug = agent.slug;
  const state = syncingAgents.get(slug);
  if (state?.isSyncing) {
    console.log(`[SYNC] Skipping ${slug} — already syncing`);
    return;
  }

  syncingAgents.set(slug, {
    isSyncing: true, background: true, totalSynced: 0,
    lastSync: null, startedAt: Date.now(),  // NEW: track start time
    username: agent.jamaah_username          // NEW: needed for stuck-timeout disconnect
  });

  try {
    // ... existing Phase 1, Phase 2, Haji sync code (unchanged) ...
    syncingAgents.set(slug, { isSyncing: false, totalSynced: finalCount, lastSync: syncTime });
  } catch (err) {
    console.error(`[SYNC] ${slug} error:`, err.message);
  } finally {
    // ALWAYS reset isSyncing — prevents stuck lock
    const currentState = syncingAgents.get(slug);
    if (currentState?.isSyncing) {
      syncingAgents.set(slug, {
        isSyncing: false,
        totalSynced: currentState.totalSynced || 0,
        lastSync: currentState.lastSync || null
      });
    }
    try { laporanDisconnect(agent.jamaah_username); } catch {}
  }
}
```

### 2. Add stuck-sync timeout to `syncAllAgents`

**File:** `server.js`, function `syncAllAgents` (line 6184+)

At the start of each cycle, force-reset any sync that's been running >15 minutes:

```javascript
async function syncAllAgents() {
  console.log('[SYNC] Starting sync cycle...');
  const startTime = Date.now();

  // Force-reset stuck syncs (>15 min)
  const STUCK_TIMEOUT = 15 * 60 * 1000;
  for (const [slug, state] of syncingAgents) {
    if (state.isSyncing && state.startedAt &&
        (Date.now() - state.startedAt > STUCK_TIMEOUT)) {
      console.warn(`[SYNC] Force-resetting stuck sync: ${slug} (${Math.round((Date.now() - state.startedAt) / 60000)}m)`);
      syncingAgents.set(slug, { isSyncing: false, totalSynced: 0, lastSync: null });
      try { if (state.username) laporanDisconnect(state.username); } catch {}
    }
  }

  // ... rest unchanged ...
}
```

### 3. Better logging in `syncAllAgents`

**File:** `server.js`, function `syncAllAgents` (line 6184+)

Track and log skipped syncs:

```javascript
let ok = 0, fail = 0, skipped = 0;
for (const agent of agents) {
  try {
    const prevState = syncingAgents.get(agent.slug);
    if (prevState?.isSyncing) skipped++;
    await syncOneAgent(agent);
    if (!syncingAgents.get(agent.slug)?.isSyncing) ok++;
  } catch (err) {
    console.error(`[SYNC] ${agent.slug} uncaught:`, err.message);
    fail++;
  }
  if (ok + fail + skipped < agents.length) await new Promise(r => setTimeout(r, 2000));
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`[SYNC] Cycle complete: ${ok} OK, ${fail} failed, ${skipped} skipped in ${elapsed}s`);
```

## Files Modified

- `server.js` — `syncOneAgent` (line 5778+) and `syncAllAgents` (line 6184+)

## Verification

1. Deploy to VPS
2. Monitor logs: `grep '[SYNC]' logs` for 2-3 hours
3. Every cycle should show `0 failed, 0 skipped`
4. UI timestamp should always be <1 jam ("Xm lalu")
5. Test edge case: kill a long-running sync mid-Phase-2, verify next cycle recovers

# Fix Sync Ulang Endless Loading

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix "Sync Ulang" button getting stuck in endless loading state across Jamaah (Umroh), Haji, and Statistik pages.

**Architecture:** Add resilient polling with error counting, max duration timeout, and fetch timeouts on frontend. Wrap backend background sync in try-finally to guarantee state cleanup.

**Tech Stack:** React (frontend), Express/Node (backend)

---

## Root Causes

1. **Frontend polling ignores errors** — `catch {}` blocks never call `setSyncing(false)`, so if fetch fails the UI stays stuck
2. **No max polling duration** — polling runs forever if backend state gets stuck
3. **Backend umroh sync has no try-finally** — if background upsert throws, `syncingAgents` stays `isSyncing: true` forever (haji endpoint already has proper try-catch)

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/JamaahPage.tsx` | Modify lines 249-268 | Fix polling resilience (Umroh) |
| `src/components/HajiPage.tsx` | Modify lines 405-426 | Fix polling resilience (Haji) |
| `src/components/StatistikPage.tsx` | Modify lines 468-496 | Fix polling resilience (Statistik) |
| `server.js` | Modify lines 1668-1699 | Wrap background sync in try-finally |

---

### Task 1: Fix backend — wrap umroh background sync in try-finally

The haji endpoint (line 3869) already wraps background work in `(async () => { try { ... } catch { cleanup } })()`. The umroh endpoint does NOT — the code after `res.json()` (line 1663) runs inline with no error protection.

**Files:**
- Modify: `server.js:1668-1699`

- [ ] **Step 1: Wrap background sync portion in try-finally**

Replace lines 1668-1699 in `server.js`. The key change: wrap the remaining upsert work after `res.json()` in an async IIFE with try-finally, so `syncingAgents` always gets cleaned up.

Current code (line 1668-1699):
```javascript
      // Upsert rest of first year async
      if (rest.length > 0) {
        const restRows = buildRows(rest, slug, now);
        const BATCH = 50;
        for (let i = 0; i < restRows.length; i += BATCH) {
          const batch = restRows.slice(i, i + BATCH);
          const { error } = await supabase.from('jamaah').upsert(batch, { onConflict: 'agent_slug,id_umroh,nama' });
          if (error) console.error(`[Sync] ${slug} batch error:`, error.message);
          syncingAgents.set(slug, { isSyncing: true, totalSynced: (syncingAgents.get(slug)?.totalSynced || 0) + batch.length, lastSync: now });
        }
      }
    } else {
      // Subsequent years: upsert all in batches (response already sent)
      const rows = buildRows(items, slug, now);
      const BATCH = 50;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { error } = await supabase.from('jamaah').upsert(batch, { onConflict: 'agent_slug,id_umroh,nama' });
        if (error) console.error(`[Sync] ${slug} year ${year} batch error:`, error.message);
        syncingAgents.set(slug, { isSyncing: true, totalSynced: (syncingAgents.get(slug)?.totalSynced || 0) + batch.length, lastSync: now });
      }
    }
  }

  // If we never sent response (all years empty)
  if (!firstBatchSent) {
    syncingAgents.set(slug, { isSyncing: false, totalSynced: 0, lastSync: now });
    return res.json({ success: true, data: { initialCount: 0, syncing: false } });
  }

  console.log(`[Sync] ${slug}: completed ${totalItems} items across ${yearsToSync.length} years`);
  syncingAgents.set(slug, { isSyncing: false, totalSynced: totalItems, lastSync: now });
```

Replace with (wrap remaining work after `res.json()` in async IIFE with try-finally):
```javascript
      // Continue remaining sync in background (response already sent)
      (async () => {
        try {
          // Upsert rest of first year
          if (rest.length > 0) {
            const restRows = buildRows(rest, slug, now);
            const BATCH = 50;
            for (let i = 0; i < restRows.length; i += BATCH) {
              const batch = restRows.slice(i, i + BATCH);
              const { error } = await supabase.from('jamaah').upsert(batch, { onConflict: 'agent_slug,id_umroh,nama' });
              if (error) console.error(`[Sync] ${slug} batch error:`, error.message);
              syncingAgents.set(slug, { isSyncing: true, totalSynced: (syncingAgents.get(slug)?.totalSynced || 0) + batch.length, lastSync: now });
            }
          }

          // Continue with remaining years
          for (let yi = yearsToSync.indexOf(year) + 1; yi < yearsToSync.length; yi++) {
            const nextYear = yearsToSync[yi];
            const range = HIJRIAH_YEARS[nextYear];
            if (!range) continue;

            const kantor = agent.jamaah_kantor || '2';
            let fetchResult = await fetchLaporan(agent.jamaah_username, {
              kantor, agentId: agent.jamaah_username,
              tglAwal: range.tglAwal, tglAkhir: range.tglAkhir,
            });

            if (!fetchResult.success) {
              laporanDisconnect(agent.jamaah_username);
              const reLogin = await laporanLogin(agent.jamaah_username, decrypted, kantor);
              if (reLogin.success) {
                fetchResult = await fetchLaporan(agent.jamaah_username, {
                  kantor, agentId: agent.jamaah_username,
                  tglAwal: range.tglAwal, tglAkhir: range.tglAkhir,
                });
              }
              if (!fetchResult.success) continue;
            }

            const { items: nextItems } = parseLaporanHtml(fetchResult.html);
            if (nextItems.length === 0) continue;
            totalItems += nextItems.length;

            const rows = buildRows(nextItems, slug, now);
            const BATCH = 50;
            for (let i = 0; i < rows.length; i += BATCH) {
              const batch = rows.slice(i, i + BATCH);
              const { error } = await supabase.from('jamaah').upsert(batch, { onConflict: 'agent_slug,id_umroh,nama' });
              if (error) console.error(`[Sync] ${slug} year ${nextYear} batch error:`, error.message);
              syncingAgents.set(slug, { isSyncing: true, totalSynced: (syncingAgents.get(slug)?.totalSynced || 0) + batch.length, lastSync: now });
            }
          }

          console.log(`[Sync] ${slug}: completed ${totalItems} items`);
        } catch (err) {
          console.error(`[Sync] ${slug} background error:`, err);
        } finally {
          syncingAgents.set(slug, { isSyncing: false, totalSynced: totalItems, lastSync: now });
        }
      })();

      break; // Exit the year loop — background IIFE handles remaining years
    } else {
      // This branch is no longer reachable since we break after first batch,
      // but kept as safety net for the edge case where firstBatchSent is true
      // but we somehow re-enter the loop (shouldn't happen with break above)
      const rows = buildRows(items, slug, now);
      const BATCH = 50;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { error } = await supabase.from('jamaah').upsert(batch, { onConflict: 'agent_slug,id_umroh,nama' });
        if (error) console.error(`[Sync] ${slug} year ${year} batch error:`, error.message);
        syncingAgents.set(slug, { isSyncing: true, totalSynced: (syncingAgents.get(slug)?.totalSynced || 0) + batch.length, lastSync: now });
      }
    }
  }

  // If we never sent response (all years empty)
  if (!firstBatchSent) {
    syncingAgents.set(slug, { isSyncing: false, totalSynced: 0, lastSync: now });
    return res.json({ success: true, data: { initialCount: 0, syncing: false } });
  }

  // Note: if firstBatchSent, the IIFE above handles final cleanup
```

- [ ] **Step 2: Commit**

```bash
git add server.js
git commit -m "fix: wrap umroh background sync in try-finally to prevent stuck state"
```

---

### Task 2: Fix frontend polling in JamaahPage.tsx

Add error counting (bail after 5 consecutive failures), max polling duration (5 minutes), and fetch timeout.

**Files:**
- Modify: `src/components/JamaahPage.tsx:249-268`

- [ ] **Step 1: Add a polling start timestamp ref**

Add after existing `pollRef` declaration (find `const pollRef = useRef`):

```tsx
const pollStartRef = useRef<number>(0);
```

- [ ] **Step 2: Replace the `startPolling` function**

Replace lines 249-268 (the entire `startPolling` function) with:

```tsx
  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    let errorCount = 0;
    pollStartRef.current = Date.now();

    pollRef.current = setInterval(async () => {
      // Max polling duration: 5 minutes
      if (Date.now() - pollStartRef.current > 5 * 60 * 1000) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setBackgroundSyncing(false);
        setSyncing(false);
        fetchJamaah(page);
        return;
      }

      try {
        const res = await fetch('/api/laporan/sync-status', {
          headers: { ...getAuthHeaders() },
          signal: AbortSignal.timeout(10000),
        });
        const result = await res.json();
        errorCount = 0; // Reset on success
        if (result.success) {
          if (result.data.totalSynced) setSyncedCount(result.data.totalSynced);
          if (!result.data.isSyncing) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setBackgroundSyncing(false);
            setSyncing(false);
            fetchJamaah(page);
          }
        }
      } catch {
        errorCount++;
        if (errorCount >= 5) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setBackgroundSyncing(false);
          setSyncing(false);
          fetchJamaah(page);
        }
      }
    }, 3000);
  };
```

- [ ] **Step 3: Commit**

```bash
git add src/components/JamaahPage.tsx
git commit -m "fix: add error counting and max duration to Umroh sync polling"
```

---

### Task 3: Fix frontend polling in HajiPage.tsx

Same pattern as Task 2 — identical fix.

**Files:**
- Modify: `src/components/HajiPage.tsx:405-426`

- [ ] **Step 1: Add a polling start timestamp ref**

Add after existing `pollRef` declaration (find `const pollRef = useRef`):

```tsx
const pollStartRef = useRef<number>(0);
```

- [ ] **Step 2: Replace the `startPolling` function**

Replace lines 405-426 (the entire `startPolling` function) with:

```tsx
  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    let errorCount = 0;
    pollStartRef.current = Date.now();

    pollRef.current = setInterval(async () => {
      // Max polling duration: 5 minutes
      if (Date.now() - pollStartRef.current > 5 * 60 * 1000) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setBackgroundSyncing(false);
        setSyncing(false);
        await fetchStats();
        fetchJamaah(page);
        return;
      }

      try {
        const res = await fetch('/api/laporan/sync-status', {
          headers: { ...getAuthHeaders() },
          signal: AbortSignal.timeout(10000),
        });
        const result = await res.json();
        errorCount = 0;
        if (result.success) {
          if (result.data.totalSynced) setSyncedCount(result.data.totalSynced);
          if (!result.data.isSyncing) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setBackgroundSyncing(false);
            setSyncing(false);
            await fetchStats();
            fetchJamaah(page);
          }
        }
      } catch {
        errorCount++;
        if (errorCount >= 5) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setBackgroundSyncing(false);
          setSyncing(false);
          fetchJamaah(page);
        }
      }
    }, 3000);
  };
```

- [ ] **Step 3: Commit**

```bash
git add src/components/HajiPage.tsx
git commit -m "fix: add error counting and max duration to Haji sync polling"
```

---

### Task 4: Fix frontend polling in StatistikPage.tsx

Same pattern but simpler — StatistikPage doesn't have `backgroundSyncing` or `syncedCount`.

**Files:**
- Modify: `src/components/StatistikPage.tsx:468-496`

- [ ] **Step 1: Replace the `handleSync` function**

Replace lines 468-496 (the entire `handleSync` function) with:

```tsx
  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/laporan/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ hijriahYear: null }),
      });
      const result = await res.json();
      if (!result.success) { setSyncing(false); return; }
      if (result.data?.syncing) {
        if (pollRef.current) clearInterval(pollRef.current);
        let errorCount = 0;
        const pollStart = Date.now();

        pollRef.current = setInterval(async () => {
          // Max polling duration: 5 minutes
          if (Date.now() - pollStart > 5 * 60 * 1000) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setSyncing(false);
            fetchStats(selectedYear);
            return;
          }

          try {
            const sr = await fetch('/api/laporan/sync-status', {
              headers: { ...getAuthHeaders() },
              signal: AbortSignal.timeout(10000),
            });
            const st = await sr.json();
            errorCount = 0;
            if (st.success && !st.data.isSyncing) {
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;
              setSyncing(false);
              fetchStats(selectedYear);
            }
          } catch {
            errorCount++;
            if (errorCount >= 5) {
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;
              setSyncing(false);
              fetchStats(selectedYear);
            }
          }
        }, 3000);
      } else {
        setSyncing(false);
        fetchStats(selectedYear);
      }
    } catch { setSyncing(false); }
  };
```

- [ ] **Step 2: Commit**

```bash
git add src/components/StatistikPage.tsx
git commit -m "fix: add error counting and max duration to Statistik sync polling"
```

---

## Verification

1. **Test normal sync flow:** Klik "Sync Ulang" di Jamaah Umroh → pastikan sync selesai normal, loading hilang
2. **Test network error:** Matikan network saat polling berjalan → setelah ~15 detik (5 failures x 3 sec), loading harus berhenti otomatis
3. **Test backend stuck:** Jika backend hang > 5 menit, polling harus berhenti otomatis
4. **Test Haji sync:** Sama seperti #1 di tab Haji
5. **Test Statistik sync:** Sama di halaman Statistik
6. **Test backend recovery:** Restart server saat sync → `syncingAgents` state harus clean, frontend polling harus bail setelah errors

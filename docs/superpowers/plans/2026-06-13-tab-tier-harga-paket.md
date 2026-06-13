# Tab Tier Harga pada Kartu Paket — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan tab pemilih tier di bawah judul "RINCIAN BIAYA PAKET" pada expanded `PackageCard`; memilih tier menyetir tabel harga DAN blok hotel Mekkah/Madinah di atas (sinkron), header "MULAI" tetap termurah.

**Architecture:** Satu state `selectedTier` di `PackageCard`. Turunan `activeTier = selectedTier ?? cheapestTier` (dengan guard) menjadi satu sumber kebenaran yang sudah dipakai oleh `pricing`, `hotelInfo`, `extraHotels`, `journeySteps`, share, dan caption. Header "MULAI" tetap memakai `cheapestTier`/`absoluteMinPrice`. Tab hanya tampil bila `tiers.length > 1`.

**Tech Stack:** React + TypeScript + Tailwind (file tunggal: `src/components/PackageCard.tsx`).

**Catatan verifikasi:** Repo ini tidak punya harness unit-test komponen; verifikasi proyek = `npx tsc --noEmit` + `npm run build` + cek manual (eslint v10 belum dikonfigurasi → lewati). Maka tiap task diverifikasi via `tsc` (cepat) dan build/manual di akhir.

**Catatan git:** Commit dilakukan oleh ORCHESTRATOR (bukan subagent) untuk menghindari branch-switch saat subagent berjalan. Subagent hanya mengedit + menjalankan `tsc`.

---

### Task 1: State `selectedTier` + turunan `activeTier`

**Files:**
- Modify: `src/components/PackageCard.tsx` (sekitar baris 147 dan 221–223)

- [ ] **Step 1: Tambah state `selectedTier`**

Setelah baris `const [linkToastVisible, setLinkToastVisible] = useState(false);` (≈ baris 147), tambahkan:

```tsx
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
```

- [ ] **Step 2: Ganti derivasi `pricing`/`hotelInfo` ke `activeTier`**

Ganti blok berikut (≈ baris 221–223):

```tsx
  // Use the pricing and hotel info from the cheapest tier
  const pricing = pkg.harga[cheapestTier] as RoomPricing;
  const hotelInfo = pkg.hotel[cheapestTier];
```

menjadi:

```tsx
  // Available pricing tiers (e.g. HEMAT, UHUD, RAHMAH)
  const tiers = useMemo(() => Object.keys(pkg.harga), [pkg.harga]);

  // Active tier drives BOTH the hotel block (above) and the pricing table.
  // Falls back to the cheapest tier when nothing is selected or the selection
  // is stale (e.g. the memoized card was reused for a different package).
  const activeTier = (selectedTier && pkg.harga[selectedTier]) ? selectedTier : cheapestTier;

  // Use the pricing and hotel info from the active tier
  const pricing = pkg.harga[activeTier] as RoomPricing;
  const hotelInfo = pkg.hotel[activeTier];
```

(`useMemo` sudah di-import di baris 3 — tidak perlu import baru. `cheapestTier`/`absoluteMinPrice` tetap dipertahankan apa adanya untuk header "MULAI".)

- [ ] **Step 3: Verifikasi tipe**

Run: `npx tsc --noEmit`
Expected: tidak ada error baru terkait `PackageCard.tsx` (`tiers`, `activeTier`, `selectedTier` dikenali).

---

### Task 2: Caption builders ikut `activeTier`

**Files:**
- Modify: `src/components/PackageCard.tsx` (≈ baris 226–229 dan 261–262)

- [ ] **Step 1: Perbarui komentar builder**

Ganti komentar (≈ baris 226–227):

```tsx
  // ── Caption AI (modal logic lives in CaptionAIModal) ──
  // Both builders use cheapestTier for consistent hotel/pricing data
```

menjadi:

```tsx
  // ── Caption AI (modal logic lives in CaptionAIModal) ──
  // Both builders use the active tier so caption/share match what's on screen
```

- [ ] **Step 2: Ganti referensi `cheapestTier` di kedua builder**

Dua baris identik berikut muncul DUA kali (di `buildAiCopyPayload` ≈ 228–229 dan `buildAiCopyFallback` ≈ 261–262):

```tsx
    const hotelData = pkg.hotel?.[cheapestTier] as any;
    const tierPricing = pkg.harga?.[cheapestTier] as any;
```

Ganti KEDUA kemunculan (gunakan replace-all pada blok dua baris itu) menjadi:

```tsx
    const hotelData = pkg.hotel?.[activeTier] as any;
    const tierPricing = pkg.harga?.[activeTier] as any;
```

- [ ] **Step 3: Verifikasi tipe**

Run: `npx tsc --noEmit`
Expected: tidak ada error baru.

---

### Task 3: UI tab tier di bawah judul "Rincian Biaya Paket"

**Files:**
- Modify: `src/components/PackageCard.tsx` (≈ baris 2133–2137)

- [ ] **Step 1: Sisipkan segmented control**

Di section pricing, di antara `<h4>…Rincian Biaya Paket</h4>` dan `<div className="border-t …">`, sisipkan blok ini sehingga menjadi:

```tsx
          <div className="mb-4">
            <h4 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Rincian Biaya Paket
            </h4>
            {tiers.length > 1 && (
              <div
                data-screenshot-ignore
                role="tablist"
                aria-label="Pilih tipe paket"
                className="flex gap-1.5 mb-3 p-1 rounded-lg bg-gray-100 dark:bg-slate-800/70"
              >
                {tiers.map((tier) => {
                  const isActive = tier === activeTier;
                  return (
                    <button
                      key={tier}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTier(tier);
                      }}
                      className={`flex-1 min-w-0 truncate rounded-md py-1.5 px-2 text-xs font-semibold transition-colors ${
                        isActive
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      {tier}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="border-t border-gray-100 dark:border-slate-700">
```

(Sisa tabel harga di bawahnya tidak berubah; ia membaca `pricing` yang kini = `activeTier`. `flex-1 min-w-0 truncate` menjaga ≥4 tier tetap rapi. `data-screenshot-ignore` membuat tab dihapus otomatis dari screenshot. Klik tombol `<button>` tidak akan men-toggle kartu karena `handleCardClick` sudah mengabaikan target di dalam `button`; `stopPropagation` sebagai pengaman.)

- [ ] **Step 2: Verifikasi tipe**

Run: `npx tsc --noEmit`
Expected: tidak ada error.

- [ ] **Step 3: Verifikasi build**

Run: `npm run build`
Expected: build sukses tanpa error.

---

### Task 4: Label tier pada screenshot

**Files:**
- Modify: `src/components/PackageCard.tsx` (≈ baris 905–908, blok "D1c" di `handleScreenshot`)

- [ ] **Step 1: Tambahkan label tier ke judul saat snapshot**

Di dalam `if (pricingH4) {` setelah baris:

```tsx
        // Title: text-xs (12px) → 14px
        pricingH4.style.setProperty('font-size', '14px', 'important');
```

tambahkan:

```tsx
        // Annotate active tier in the screenshot (the interactive tab is
        // stripped via data-screenshot-ignore, so label the tier here).
        if (tiers.length > 1) {
          pricingH4.textContent = `Rincian Biaya Paket · ${activeTier}`;
        }
```

(Teks tetap mengandung substring "Rincian Biaya Paket", sehingga pencarian `.includes('Rincian Biaya')` lain di kode snapshot tetap cocok. `tiers`/`activeTier` berada dalam scope komponen.)

- [ ] **Step 2: Verifikasi tipe + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sukses tanpa error.

---

### Task 5: Verifikasi akhir + commit (ORCHESTRATOR)

**Files:** —

- [ ] **Step 1: Verifikasi penuh**

Run: `npx tsc --noEmit && npm run build`
Expected: keduanya sukses.

- [ ] **Step 2: Cek manual (jalankan `npm run dev`, buka kartu paket multi-tier)**
  - Paket >1 tier: tab muncul di bawah "Rincian Biaya Paket"; ganti tab → tabel harga + blok hotel Mekkah/Madinah (nama, ★, jarak) berubah; header "MULAI" tetap.
  - Paket 1 tier: tidak ada tab; identik dengan sebelumnya.
  - Default = tier termurah saat pertama expand.
  - Klik tab TIDAK meng-collapse kartu.
  - Tombol "Simpan" (screenshot): gambar menangkap tier terpilih, tab tidak tergambar, judul jadi "Rincian Biaya Paket · {TIER}".

- [ ] **Step 3: Commit (orchestrator, di branch `main`)**

```bash
git add src/components/PackageCard.tsx docs/superpowers/specs/2026-06-13-tab-tier-harga-paket-design.md docs/superpowers/plans/2026-06-13-tab-tier-harga-paket.md
git commit -m "feat(card): tab pemilih tier di Rincian Biaya (sinkron hotel+harga)"
```

---

## Self-Review

**Spec coverage:**
- Tab di bawah judul Rincian Biaya → Task 3. ✓
- Pilih tab → harga + hotel atas berubah (sinkron via `activeTier`) → Task 1. ✓
- Header "MULAI" tetap termurah → `cheapestTier`/`absoluteMinPrice` dipertahankan (Task 1). ✓
- Tab hanya bila >1 tier; 1 tier = tampilan lama → Task 3 (`tiers.length > 1`). ✓
- Default = termurah → `activeTier` fallback (Task 1). ✓
- extraHotels/journeySteps/share ikut tier → otomatis via `hotelInfo`/`pricing` (Task 1); caption builder → Task 2. ✓
- Screenshot menangkap tier terpilih + sembunyikan tab + label tier → Task 3 (`data-screenshot-ignore`) + Task 4. ✓
- Edge: ≥4 tier rapi (`flex-1 min-w-0 truncate`, Task 3); pkg re-render (guard `activeTier`, Task 1); tier tanpa hotel (`hotelInfo` optional chaining, tak diubah). ✓

**Placeholder scan:** Tidak ada TBD/TODO; semua step berisi kode konkret. ✓

**Type consistency:** `selectedTier` (state), `tiers` (string[]), `activeTier` (string) dipakai konsisten di Task 1/3/4; `setSelectedTier` dipakai di Task 3. ✓

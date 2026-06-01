# Haji Plus Price Escalation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Project the RAHMAH/UHUD package price ~2.5%/yr to the chosen departure year so a calon jamaah sees the real departure-year price they will pay, shown as a year-by-year ladder on both the on-screen result and the exported penawaran PNG.

**Architecture:** Add a pure, executable-tested math helper (`src/lib/hajiPlusPricing.js` + `.d.ts`) that computes the escalated price, DP/sisa split, both-effects IDR estimate, and the per-year ladder. The existing `SimulasiHajiPlus.tsx` `calc` delegates to it. A small `PriceLadder.tsx` renders the on-screen ladder (Tailwind); the export card renders a condensed ladder inline (to match its existing inline-styled block). Per the confirmed spec, the **invoice reflects the departure-year price** and the ladder justifies it.

**Tech Stack:** React 18 + TypeScript, Vite, Tailwind, `modern-screenshot` for PNG export, `node:test` for tests.

**Spec:** `docs/superpowers/specs/2026-06-01-haji-plus-price-escalation-design.md`

---

## File Structure

- **Create** `src/lib/hajiPlusPricing.js` — pure escalation math + ladder. No React/DOM/network.
- **Create** `src/lib/hajiPlusPricing.d.ts` — types so the `.tsx` consumers are fully typed (build does not typecheck, but editors and `tsc` do).
- **Create** `tests/haji-plus-pricing.test.js` — executable unit tests importing the helper.
- **Create** `src/components/PriceLadder.tsx` — on-screen (Tailwind) ladder.
- **Modify** `src/components/SimulasiHajiPlus.tsx` — delegate `calc` to the helper; show escalated totals + on-screen ladder; rework the export card (escalated invoice, ladder panel, taller grid).
- **Modify** `tests/haji-plus-simulation.test.js` — update assertions the change invalidates; add new ones.

**Test command:** `node --test tests/<file>.test.js` (single file) or `node --test tests/` (all). There is no `npm test` script.

---

## Task 1: Pure pricing helper — constants, escalation, ladder

**Files:**
- Create: `src/lib/hajiPlusPricing.js`
- Create: `src/lib/hajiPlusPricing.d.ts`
- Test: `tests/haji-plus-pricing.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/haji-plus-pricing.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRICE_ESCALATION_RATE,
  KURS_INFLATION_RATE,
  computeHajiPlusEscalation,
} from '../src/lib/hajiPlusPricing.js';

const baseInput = {
  basePriceUSD: 15700,
  jumlahJamaah: 1,
  tahunBerangkat: 2036,
  currentYear: 2026,
  kursUSD: 15500,
  dpPerJamaahUSD: 4500,
};

test('rates are the agreed constants', () => {
  assert.equal(PRICE_ESCALATION_RATE, 0.025);
  assert.equal(KURS_INFLATION_RATE, 0.015);
});

test('escalates the package price ~2.5%/yr to the departure year', () => {
  const r = computeHajiPlusEscalation(baseInput);
  assert.equal(r.years, 10);
  assert.ok(Math.abs(r.escalatedPriceUSD - 20097.33) < 1, `got ${r.escalatedPriceUSD}`);
  assert.equal(r.escalatedTotalUSD, r.escalatedPriceUSD * 1);
  assert.equal(r.baseTotalUSD, 15700);
});

test('floors years at 1 for a current/past departure year', () => {
  const r = computeHajiPlusEscalation({ ...baseInput, tahunBerangkat: 2026 });
  assert.equal(r.years, 1);
});

test('DP is fixed and sisa is the escalated remainder', () => {
  const r = computeHajiPlusEscalation({ ...baseInput, jumlahJamaah: 2 });
  assert.equal(r.dpUSD, 9000);
  assert.equal(r.sisaUSD, r.escalatedTotalUSD - 9000);
});

test('IDR applies both kurs inflation and escalation; DP stays at today kurs', () => {
  const r = computeHajiPlusEscalation(baseInput);
  const expectedKurs = 15500 * Math.pow(1.015, 10);
  assert.ok(Math.abs(r.inflatedKurs - expectedKurs) < 1e-6);
  assert.ok(Math.abs(r.estTotalIDR - r.escalatedTotalUSD * expectedKurs) < 1e-3);
  assert.equal(r.dpIDR, 4500 * 15500);
});

test('ladder spans now to departure, strictly increasing, last flagged', () => {
  const r = computeHajiPlusEscalation(baseInput);
  assert.equal(r.ladder.length, 11);
  assert.deepEqual(r.ladder[0], { year: 2026, priceUSD: 15700, isDeparture: false });
  const last = r.ladder[r.ladder.length - 1];
  assert.equal(last.year, 2036);
  assert.equal(last.isDeparture, true);
  assert.ok(Math.abs(last.priceUSD - r.escalatedPriceUSD) < 1e-6);
  for (let i = 1; i < r.ladder.length; i++) {
    assert.ok(r.ladder[i].priceUSD > r.ladder[i - 1].priceUSD);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/haji-plus-pricing.test.js`
Expected: FAIL — cannot find module `../src/lib/hajiPlusPricing.js`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/hajiPlusPricing.js`:

```js
// Pure pricing math for the Haji Plus simulation.
// No React / DOM / network — unit-tested in tests/haji-plus-pricing.test.js.

export const PRICE_ESCALATION_RATE = 0.025; // package price growth per year
export const KURS_INFLATION_RATE = 0.015;   // USD->IDR kurs growth per year

/**
 * @typedef {Object} LadderEntry
 * @property {number} year
 * @property {number} priceUSD      Per-jamaah package price in that year.
 * @property {boolean} isDeparture  True for the departure-year row.
 */

/**
 * @param {{ basePriceUSD:number, jumlahJamaah:number, tahunBerangkat:number,
 *           currentYear:number, kursUSD:number, dpPerJamaahUSD:number }} input
 */
export function computeHajiPlusEscalation(input) {
  const { basePriceUSD, jumlahJamaah, tahunBerangkat, currentYear, kursUSD, dpPerJamaahUSD } = input;
  const years = Math.max(1, tahunBerangkat - currentYear);

  const escalatedPriceUSD = basePriceUSD * Math.pow(1 + PRICE_ESCALATION_RATE, years);
  const baseTotalUSD = basePriceUSD * jumlahJamaah;
  const escalatedTotalUSD = escalatedPriceUSD * jumlahJamaah;
  const dpUSD = dpPerJamaahUSD * jumlahJamaah;
  const sisaUSD = escalatedTotalUSD - dpUSD;
  const inflatedKurs = kursUSD * Math.pow(1 + KURS_INFLATION_RATE, years);
  const estTotalIDR = escalatedTotalUSD * inflatedKurs;
  const dpIDR = dpUSD * kursUSD;       // paid now -> today's kurs
  const sisaIDR = sisaUSD * inflatedKurs; // paid at departure -> inflated kurs

  const ladder = [];
  for (let i = 0; i <= years; i++) {
    ladder.push({
      year: currentYear + i,
      priceUSD: basePriceUSD * Math.pow(1 + PRICE_ESCALATION_RATE, i),
      isDeparture: i === years,
    });
  }

  return {
    years, basePriceUSD, escalatedPriceUSD, baseTotalUSD, escalatedTotalUSD,
    dpUSD, sisaUSD, inflatedKurs, estTotalIDR, dpIDR, sisaIDR, ladder,
  };
}
```

Create `src/lib/hajiPlusPricing.d.ts`:

```ts
export const PRICE_ESCALATION_RATE: number;
export const KURS_INFLATION_RATE: number;

export interface LadderEntry {
  year: number;
  priceUSD: number;
  isDeparture: boolean;
}

export interface EscalationInput {
  basePriceUSD: number;
  jumlahJamaah: number;
  tahunBerangkat: number;
  currentYear: number;
  kursUSD: number;
  dpPerJamaahUSD: number;
}

export interface EscalationResult {
  years: number;
  basePriceUSD: number;
  escalatedPriceUSD: number;
  baseTotalUSD: number;
  escalatedTotalUSD: number;
  dpUSD: number;
  sisaUSD: number;
  inflatedKurs: number;
  estTotalIDR: number;
  dpIDR: number;
  sisaIDR: number;
  ladder: LadderEntry[];
}

export function computeHajiPlusEscalation(input: EscalationInput): EscalationResult;
export function condenseLadder(ladder: LadderEntry[], maxRows?: number): LadderEntry[];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/haji-plus-pricing.test.js`
Expected: PASS (6 tests). `condenseLadder` is declared in the `.d.ts` but implemented in Task 2 — that's fine, the `.d.ts` is not executed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hajiPlusPricing.js src/lib/hajiPlusPricing.d.ts tests/haji-plus-pricing.test.js
git commit -m "feat(haji-plus): pure escalation pricing helper + ladder"
```

---

## Task 2: `condenseLadder` for the space-constrained card

**Files:**
- Modify: `src/lib/hajiPlusPricing.js`
- Test: `tests/haji-plus-pricing.test.js`

- [ ] **Step 1: Add the failing tests**

Append to `tests/haji-plus-pricing.test.js`:

```js
import { condenseLadder } from '../src/lib/hajiPlusPricing.js';

test('condenseLadder keeps at most 5 rows incl. first and last with departure flag', () => {
  const r = computeHajiPlusEscalation(baseInput); // 11 rows (2026..2036)
  const rows = condenseLadder(r.ladder, 5);
  assert.ok(rows.length <= 5);
  assert.equal(rows[0].year, 2026);
  assert.equal(rows[rows.length - 1].year, 2036);
  assert.equal(rows[rows.length - 1].isDeparture, true);
});

test('condenseLadder returns every row when already within the cap', () => {
  const r = computeHajiPlusEscalation({ ...baseInput, tahunBerangkat: 2029 }); // 4 rows
  assert.equal(condenseLadder(r.ladder, 5).length, 4);
});
```

> Note: move the `import { condenseLadder } ...` line up next to the other import at the top of the file rather than mid-file; shown here inline only for clarity.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/haji-plus-pricing.test.js`
Expected: FAIL — `condenseLadder` is not a function / not exported.

- [ ] **Step 3: Implement `condenseLadder`**

Append to `src/lib/hajiPlusPricing.js`:

```js
/**
 * Reduce a ladder to at most `maxRows` evenly-spaced entries, always keeping the
 * first (today) and last (departure) rows.
 * @param {LadderEntry[]} ladder
 * @param {number} [maxRows=5]
 * @returns {LadderEntry[]}
 */
export function condenseLadder(ladder, maxRows = 5) {
  if (ladder.length <= maxRows) return ladder.slice();
  const last = ladder.length - 1;
  const indices = [];
  for (let i = 0; i < maxRows; i++) indices.push(Math.round((i * last) / (maxRows - 1)));
  return [...new Set(indices)].map(i => ladder[i]);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/haji-plus-pricing.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/hajiPlusPricing.js tests/haji-plus-pricing.test.js
git commit -m "feat(haji-plus): condenseLadder for the export card"
```

---

## Task 3: On-screen `PriceLadder` component

**Files:**
- Create: `src/components/PriceLadder.tsx`
- Test: `tests/haji-plus-simulation.test.js` (add one static test)

- [ ] **Step 1: Add the failing static test**

Append to `tests/haji-plus-simulation.test.js`:

```js
test('PriceLadder renders ladder rows with normalized bars and departure emphasis', () => {
  const source = read('src/components/PriceLadder.tsx');
  assert.match(source, /ladder\.map/);
  assert.match(source, /isDeparture/);
  assert.match(source, /45\s*\+/);          // bar-width floor
  assert.match(source, /\*\s*55/);          // bar-width span
  assert.match(source, /fmtUSD\(e\.priceUSD\)/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/haji-plus-simulation.test.js`
Expected: FAIL — cannot read `src/components/PriceLadder.tsx` (file missing).

- [ ] **Step 3: Create the component**

Create `src/components/PriceLadder.tsx`:

```tsx
import type { LadderEntry } from '@/lib/hajiPlusPricing';

const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

interface PriceLadderProps {
  ladder: LadderEntry[];
  accent: 'emerald' | 'blue';
}

export default function PriceLadder({ ladder, accent }: PriceLadderProps) {
  const rows = ladder.length;
  const barColor = accent === 'emerald' ? 'bg-emerald-500' : 'bg-blue-500';
  const departureText = accent === 'emerald'
    ? 'text-emerald-700 dark:text-emerald-400'
    : 'text-blue-700 dark:text-blue-400';

  return (
    <div className="space-y-1.5">
      {ladder.map((e, i) => {
        const width = 45 + (rows > 1 ? (i / (rows - 1)) * 55 : 55);
        return (
          <div key={e.year} className="flex items-center gap-2">
            <span className={`text-[10px] w-8 ${e.isDeparture ? `font-bold ${departureText}` : 'text-gray-500 dark:text-slate-400'}`}>
              {e.year}
            </span>
            <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
              <div
                className={`h-full rounded-full ${e.isDeparture ? barColor : 'bg-gray-300 dark:bg-slate-600'}`}
                style={{ width: `${width}%` }}
              />
            </div>
            <span className={`text-[11px] tabular-nums ${e.isDeparture ? `font-bold ${departureText}` : 'text-gray-700 dark:text-white'}`}>
              {fmtUSD(e.priceUSD)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/haji-plus-simulation.test.js`
Expected: PASS for the new `PriceLadder` test. (Other tests in this file still pass — none touched yet.)

- [ ] **Step 5: Commit**

```bash
git add src/components/PriceLadder.tsx tests/haji-plus-simulation.test.js
git commit -m "feat(haji-plus): on-screen PriceLadder component"
```

---

## Task 4: Wire helper into `calc` and the on-screen result

**Files:**
- Modify: `src/components/SimulasiHajiPlus.tsx` (imports, `fmtUSD`, `calc` useMemo at 192-208, derived `exportLadder`, E1 card 456-489, disclaimer 543-549, new Proyeksi card)
- Modify: `tests/haji-plus-simulation.test.js`

- [ ] **Step 1: Update existing tests + add on-screen test (write failing)**

In `tests/haji-plus-simulation.test.js`, in the test `'SimulasiHajiPlus keeps Quad as default and calculates from selected room price'`, replace the two `totalUSD` lines:

```js
// REMOVE:
assert.match(source, /const\s+totalUSD\s*=\s*selectedPriceUSD\s*\*\s*jumlahJamaah/);
assert.doesNotMatch(source, /const\s+totalUSD\s*=\s*pkg\.priceUSD\s*\*\s*jumlahJamaah/);
// REPLACE WITH:
assert.match(source, /computeHajiPlusEscalation\(\{[\s\S]*basePriceUSD:\s*selectedPriceUSD/);
assert.match(source, /calc\.escalatedTotalUSD/);
assert.doesNotMatch(source, /Math\.pow\(1\.015,/); // inline kurs math moved into the helper
```

Append a new test:

```js
test('SimulasiHajiPlus on-screen result shows escalated total, base reference, and a ladder', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');
  assert.match(source, /import\s+PriceLadder\s+from\s+'\.\/PriceLadder'/);
  assert.match(source, /import\s+\{\s*computeHajiPlusEscalation,\s*condenseLadder[\s\S]*from\s+'@\/lib\/hajiPlusPricing'/);
  assert.match(source, /const fmtUSD = .*Math\.round/);
  assert.match(source, /fmtUSD\(calc\.escalatedTotalUSD\)/);
  assert.match(source, /harga dasar/);
  assert.match(source, /<PriceLadder[\s\S]*ladder=\{calc\.ladder\}/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/haji-plus-simulation.test.js`
Expected: FAIL on the updated/new assertions.

- [ ] **Step 3: Implement the component changes**

3a. Imports — after the existing imports near the top, add:

```tsx
import PriceLadder from './PriceLadder';
import { computeHajiPlusEscalation, condenseLadder } from '@/lib/hajiPlusPricing';
```

3b. `fmtUSD` — round so escalated (fractional) prices read cleanly. Replace line 55:

```tsx
// FROM:
const fmtUSD = (n: number) => `$${n.toLocaleString('en-US')}`;
// TO:
const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
```

3c. `calc` — replace the whole `useMemo` (192-208) with a delegation:

```tsx
const calc = useMemo(() => {
  if (!pkg || !kursUSD) return null;
  const currentYear = new Date().getFullYear();
  const esc = computeHajiPlusEscalation({
    basePriceUSD: selectedPriceUSD,
    jumlahJamaah,
    tahunBerangkat,
    currentYear,
    kursUSD,
    dpPerJamaahUSD: DP_USD,
  });
  const deadlineDate = new Date(tahunBerangkat, 0, 1);
  deadlineDate.setMonth(deadlineDate.getMonth() - PELUNASAN_BULAN);
  const deadlineLabel = deadlineDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const diffMonths = Math.max(0, Math.round((new Date(tahunBerangkat, 0, 1).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)));
  return { ...esc, deadlineLabel, diffMonths };
}, [pkg, selectedPriceUSD, tahunBerangkat, jumlahJamaah, kursUSD]);
```

3d. Add a derived condensed ladder for the export card, right after the `calc` useMemo:

```tsx
const exportLadder = useMemo(() => (calc ? condenseLadder(calc.ladder, 5) : []), [calc]);
```

3e. E1 Total Card — update the header block (the `<div className="px-4 pt-4 pb-3">` at 460-469):

```tsx
<div className="px-4 pt-4 pb-3">
  <p className="text-[10px] uppercase tracking-[0.15em] text-white/60 font-medium">
    Estimasi Tahun {tahunBerangkat} · {pkg.name} {selectedRoom.label} {'★'.repeat(pkg.stars)}
  </p>
  <p className="text-3xl font-bold text-white mt-1">{fmtUSD(calc.escalatedTotalUSD)}</p>
  <p className="text-[12px] text-white/70 mt-0.5">≈ {fmtRp(calc.estTotalIDR)}</p>
  <p className="text-[10px] text-white/50 mt-0.5">
    {fmtUSD(calc.escalatedPriceUSD)} × {jumlahJamaah} jamaah · harga dasar {new Date().getFullYear()}: {fmtUSD(calc.baseTotalUSD)}
  </p>
</div>
```

3f. E1 split bar — the DP proportion (line 472) must use the escalated total:

```tsx
// FROM: style={{ width: `${(calc.dpUSD / calc.totalUSD) * 100}%` }}
// TO:
<div className="bg-emerald-400" style={{ width: `${(calc.dpUSD / calc.escalatedTotalUSD) * 100}%` }} />
```

(The DP/Pelunasan amounts at 479/484 already read `calc.dpUSD`/`calc.sisaUSD`, which still exist — no change.)

3g. Timeline (E2) — values at 498-501 read `calc.dpUSD`, `calc.diffMonths`, `calc.sisaUSD`, `tahunBerangkat`, all still present. **No change needed.**

3h. New Proyeksi Harga card — insert immediately after the Timeline card (after the closing `</div>` of E2 at line 526, before E3 Nama at 528):

```tsx
{/* E2b. Proyeksi Harga */}
<div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-4">
  <div className="flex items-center justify-between mb-3">
    <p className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Proyeksi Harga Paket / jamaah</p>
    <span className={`text-[10px] font-bold ${isRahmah ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400'}`}>naik ~2.5%/th</span>
  </div>
  <PriceLadder ladder={calc.ladder} accent={isRahmah ? 'emerald' : 'blue'} />
  <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-3">
    Estimasi harga asli di {tahunBerangkat}. Est. Rp memakai kurs +1.5%/th.
  </p>
</div>
```

3i. Disclaimer (E4, 543-549) — update the copy:

```tsx
<p className="text-[10px] text-gray-500 dark:text-slate-400 leading-relaxed">
  Estimasi. Harga paket diproyeksikan naik ~2.5%/th & kurs ~1.5%/th sampai tahun berangkat; angka final ditetapkan Alhijaz. Kurs Bank Mandiri ({kursDate}).
</p>
```

- [ ] **Step 4: Run tests + build**

Run: `node --test tests/haji-plus-simulation.test.js`
Expected: PASS (updated + new on-screen tests). The export-card tests in this file are still on the OLD card and **will be addressed in Task 5** — if any fail now because `calc.totalUSD`/`calc.totalIDR` references remain in the export JSX, that is expected; proceed to Task 5 which updates the export block and its tests together. To keep tasks green independently, run the build to confirm no syntax/type breakage:

Run: `npm run build`
Expected: build succeeds.

> If `calc.totalUSD` / `calc.totalIDR` still appear in the export JSX (lines ~696/700), the build still succeeds (TS is not typechecked by Vite) but those values are now `undefined` at runtime. Task 5 replaces them. Do not ship between Task 4 and Task 5.

- [ ] **Step 5: Commit**

```bash
git add src/components/SimulasiHajiPlus.tsx tests/haji-plus-simulation.test.js
git commit -m "feat(haji-plus): escalated totals + price ladder in on-screen result"
```

---

## Task 5: Rework the export card (PNG)

**Files:**
- Modify: `src/components/SimulasiHajiPlus.tsx` (card grid 571-583, paket card 633-656, invoice 658-703, estimasi panel 705-723)
- Modify: `tests/haji-plus-simulation.test.js`

- [ ] **Step 1: Update the export-card tests (write failing)**

In `tests/haji-plus-simulation.test.js`:

In `'SimulasiHajiPlus export uses stronger consultation copy and safer projection wording'`, replace line 103:

```js
// FROM: assert.match(source, /Simulasi kurs 1\.5%\/tahun/);
// TO:
assert.match(source, /kurs \+1\.5%\/th/);
```

In `'SimulasiHajiPlus exports the offer card at a fixed 4:6 ratio'`, replace the height + grid lines:

```js
// FROM:
assert.match(source, /const\s+OFFER_CARD_HEIGHT\s*=\s*600/);
assert.match(source, /gridTemplateRows:\s*'56px 60px 96px 206px 104px 78px'/);
// TO:
assert.match(source, /const\s+OFFER_CARD_HEIGHT\s*=\s*646/);
assert.match(source, /gridTemplateRows:\s*'56px 60px 96px 206px 150px 78px'/);
```

Replace the body of `'SimulasiHajiPlus condenses export schedule and projection into one compact panel'` with:

```js
test('SimulasiHajiPlus export shows the price-projection ladder panel', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');
  assert.match(source, /Proyeksi Harga Paket/);
  assert.match(source, /exportLadder\.map/);
  assert.match(source, /Estimasi total \{tahunBerangkat\}/);
  assert.match(source, /fmtRp\(calc\.estTotalIDR\)/);
  assert.doesNotMatch(source, /Ringkasan Jadwal & Estimasi/);
});
```

In `'SimulasiHajiPlus displays room type in the exported offer labels'`, the per-jamaah breakdown now uses the escalated price — replace line 66:

```js
// FROM: assert.match(source, /\{fmtUSD\(selectedPriceUSD\)\}\s*×\s*\{jumlahJamaah\}\s*jamaah/);
// TO:
assert.match(source, /\{fmtUSD\(calc\.escalatedPriceUSD\)\}\s*×\s*\{jumlahJamaah\}\s*jamaah/);
```

In `'SimulasiHajiPlus export keeps compact text readable and prevents total-row overlap'`, the total label changed from "Total Biaya" to "Total Estimasi {tahunBerangkat}" — replace lines 139-140:

```js
// FROM:
assert.match(source, /gridTemplateColumns:\s*'1fr auto'[\s\S]*Total Biaya/);
assert.match(source, /Total Biaya[\s\S]*whiteSpace:\s*'nowrap'/);
// TO:
assert.match(source, /gridTemplateColumns:\s*'1fr auto'[\s\S]*Total Estimasi/);
assert.match(source, /Total Estimasi[\s\S]*whiteSpace:\s*'nowrap'/);
```

Add a new test for the escalated invoice:

```js
test('SimulasiHajiPlus export invoice uses the departure-year price', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');
  assert.match(source, /Estimasi harga \{tahunBerangkat\}/);          // paket card label
  assert.match(source, /fmtUSD\(calc\.escalatedPriceUSD\)/);          // paket card price
  assert.match(source, /fmtUSD\(calc\.escalatedTotalUSD\)/);          // invoice total
  assert.match(source, /harga dasar/);                                // base reference
  assert.doesNotMatch(source, /fmtUSD\(calc\.totalUSD\)/);            // old field gone
  assert.doesNotMatch(source, /fmtRp\(calc\.totalIDR\)/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/haji-plus-simulation.test.js`
Expected: FAIL on the new export assertions.

- [ ] **Step 3: Implement the export-card changes**

3a. Constants — update height (line 35):

```tsx
const OFFER_CARD_HEIGHT = 646;
```

3b. Card grid rows (line 582):

```tsx
gridTemplateRows: '56px 60px 96px 206px 150px 78px',
```

3c. Paket card right column (lines 650-654) — show escalated price + base reference:

```tsx
<div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
  <div style={{ display: 'inline-block', fontSize: 8.5, fontWeight: 700, color: '#ffffff', padding: '3px 7px', borderRadius: 999, background: 'rgba(255,255,255,0.18)', marginBottom: 6 }}>Tipe kamar {selectedRoom.label}</div>
  <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.76)', marginBottom: 2 }}>Estimasi harga {tahunBerangkat} / jamaah</div>
  <div style={{ fontSize: 24, fontWeight: 750, color: '#ffffff', lineHeight: '1' }}>{fmtUSD(calc.escalatedPriceUSD)}</div>
  <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>harga dasar {new Date().getFullYear()}: {fmtUSD(calc.basePriceUSD)}</div>
</div>
```

3d. Invoice — DP sub-label (line 677), Sisa (remove IDR line 689), Total (695-700). Apply these edits:

DP descriptor (line 677):
```tsx
// FROM: <div style={{ fontSize: 9.5, color: '#64748b' }}>Dibayar saat pendaftaran</div>
<div style={{ fontSize: 9.5, color: '#64748b' }}>Dibayar sekarang (harga hari ini)</div>
```

Sisa Pelunasan row (682-691) — drop the `≈ fmtRp(calc.sisaIDR)` element, keep USD + deadline:
```tsx
<div style={{ padding: '0 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column' as const, justifyContent: 'center' }}>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
    <div style={{ fontSize: 12, fontWeight: 600, color: '#1f2937' }}>Sisa Pelunasan</div>
    <div style={{ fontSize: 15, fontWeight: 700, color: '#1f2937' }}>{fmtUSD(calc.sisaUSD)}</div>
  </div>
  <div style={{ fontSize: 9, color: '#d97706', marginTop: 2 }}>Maks. {calc.deadlineLabel} · harga {tahunBerangkat}</div>
</div>
```

Total row (693-702):
```tsx
<div style={{ padding: '0 16px', background: isRahmah ? '#ecfdf5' : '#eff6ff', display: 'flex', flexDirection: 'column' as const, justifyContent: 'center' }}>
  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', columnGap: 12, alignItems: 'baseline' }}>
    <div style={{ fontSize: 12.8, fontWeight: 750, color: isRahmah ? '#064e3b' : '#1e3a5f', lineHeight: 1.05, whiteSpace: 'nowrap' as const }}>Total Estimasi {tahunBerangkat}</div>
    <div style={{ fontSize: 18, fontWeight: 750, color: isRahmah ? '#064e3b' : '#1e3a5f', lineHeight: 1 }}>{fmtUSD(calc.escalatedTotalUSD)}</div>
  </div>
  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', columnGap: 12, alignItems: 'baseline', marginTop: 5 }}>
    <div style={{ fontSize: 9.4, color: '#475569', whiteSpace: 'nowrap' as const }}>{jumlahJamaah > 1 ? `${fmtUSD(calc.escalatedPriceUSD)} × ${jumlahJamaah} jamaah` : `1 jamaah · ${selectedRoom.label}`}</div>
    <div style={{ fontSize: 10.8, fontWeight: 750, color: '#334155', whiteSpace: 'nowrap' as const }}>≈ {fmtRp(calc.estTotalIDR)}</div>
  </div>
</div>
```

3e. Replace the entire "Ringkasan Jadwal & Estimasi" panel (lines 705-723) with the ladder panel:

```tsx
{/* Proyeksi Harga Paket */}
<div style={{ margin: '0 24px 10px', padding: '8px 14px', borderRadius: 11, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
    <div style={{ fontSize: 9, fontWeight: 750, color: '#64748b' }}>Proyeksi Harga Paket / jamaah</div>
    <div style={{ fontSize: 8.5, fontWeight: 700, color: '#059669' }}>naik ~2.5%/th</div>
  </div>
  {exportLadder.map((e, i) => {
    const width = 45 + (exportLadder.length > 1 ? (i / (exportLadder.length - 1)) * 55 : 55);
    const accent = isRahmah ? '#064e3b' : '#1e3a5f';
    return (
      <div key={e.year} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <span style={{ fontSize: 9.5, width: 26, color: e.isDeparture ? accent : '#64748b', fontWeight: e.isDeparture ? 800 : 400 }}>{e.year}</span>
        <div style={{ flex: 1, height: 8, borderRadius: 4, background: '#e5e7eb', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${width}%`, borderRadius: 4, background: e.isDeparture ? (isRahmah ? '#059669' : '#2563eb') : '#cbd5e1' }} />
        </div>
        <span style={{ fontSize: 9.5, fontWeight: e.isDeparture ? 850 : 600, color: e.isDeparture ? accent : '#334155', minWidth: 52, textAlign: 'right' as const }}>{fmtUSD(e.priceUSD)}</span>
      </div>
    );
  })}
  <div style={{ fontSize: 8.1, color: '#64748b', marginTop: 6, borderTop: '1px dashed #cbd5e1', paddingTop: 5, whiteSpace: 'nowrap' as const }}>
    Estimasi total {tahunBerangkat} ≈ {fmtRp(calc.estTotalIDR)} · kurs +1.5%/th (kini {fmtRp(kursUSD)}/USD).
  </div>
</div>
```

- [ ] **Step 4: Run tests + build**

Run: `node --test tests/haji-plus-simulation.test.js`
Expected: PASS (all, including updated export tests).

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/SimulasiHajiPlus.tsx tests/haji-plus-simulation.test.js
git commit -m "feat(haji-plus): export card shows departure-year price + projection ladder"
```

---

## Task 6: Full verification + visual tuning

**Files:**
- Possibly modify: `src/components/SimulasiHajiPlus.tsx` (grid row heights only, if the PNG clips) + matching test assertions.

- [ ] **Step 1: Run the full test suite**

Run: `node --test tests/`
Expected: PASS for all 38+ files (no regressions in unrelated tests).

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 3: Visual check of the exported PNG**

Use the project run/verify flow to open `/dashboard/ai-tools/haji-plus/simulasi`, pick RAHMAH · Quad · 2036, enter a name, click **Buat Penawaran**, and inspect the preview image. Confirm:
- the 5-row ladder fits inside its panel with no clipping or overlap into the footer;
- paket card shows the escalated `Estimasi harga 2036` price with the `harga dasar 2026` reference;
- invoice DP/Sisa/Total are the escalated figures; Total ≈ Rp matches the ladder note;
- on-screen result shows the full year-by-year ladder.

If the ladder clips, adjust **only** the ladder grid row (the `150px` entry) and `OFFER_CARD_HEIGHT` so they stay equal to the row sum, and update the two assertions in `tests/haji-plus-simulation.test.js` to the new values. Re-run Steps 1-2.

- [ ] **Step 4: Commit any tuning**

```bash
git add src/components/SimulasiHajiPlus.tsx tests/haji-plus-simulation.test.js
git commit -m "fix(haji-plus): tune export card height for ladder fit"
```

(Skip this commit if no tuning was needed.)

---

## Self-Review notes (already reconciled)

- **Spec coverage:** escalation model (Task 1), ladder + condensation (Tasks 1-2), on-screen escalated total + ladder + disclaimer (Tasks 3-4), export escalated invoice + ladder + taller card (Task 5), IDR/kurs rule — DP at today's kurs, Total at inflated kurs, Sisa USD-only (Tasks 1, 4, 5), honesty/disclaimer (Task 4), verification (Task 6).
- **Type consistency:** `computeHajiPlusEscalation` / `condenseLadder` / `EscalationResult` / `LadderEntry` names match across `.js`, `.d.ts`, tests, and both render surfaces. `calc` exposes `escalatedTotalUSD`, `escalatedPriceUSD`, `baseTotalUSD`, `estTotalIDR`, `dpUSD`, `sisaUSD`, `dpIDR`, `ladder`, `deadlineLabel`, `diffMonths` — every consumer reads only these.
- **Broken-test handling:** every existing assertion invalidated by the change (kurs-note copy, `OFFER_CARD_HEIGHT`, `gridTemplateRows`, the estimasi panel, the inline `totalUSD` math) is explicitly updated in Task 4/5 Step 1.
- **No placeholders:** every code step contains complete code.
```

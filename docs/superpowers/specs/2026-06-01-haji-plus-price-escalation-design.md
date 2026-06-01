# Haji Plus Price Escalation Simulation Design

## Goal

In `/dashboard/ai-tools/haji-plus/simulasi`, project the RAHMAH/UHUD package price upward ~2.5% per year until the chosen departure year, so a calon jamaah sees the *real* price they will pay in that departure year — not just today's base price. The projection appears both in the on-screen result and the exported penawaran PNG.

## Background — current behavior

`SimulasiHajiPlus.tsx` prices packages in USD (per room type) and converts to IDR at the live Bank Mandiri kurs. It already projects a future cost, but only by inflating the **exchange rate** 1.5%/year while holding the USD package price flat:

```ts
const inflatedKurs = kursUSD * Math.pow(1.015, diffYears);
const estTotalIDR = totalUSD * inflatedKurs;
```

The headline Total today is **today's** price (`totalUSD = selectedPriceUSD * jumlahJamaah`). DP is a fixed `DP_USD = 4500` per jamaah; pelunasan is `total − DP`; the deadline is `PELUNASAN_BULAN = 6` months before departure.

## Decisions (confirmed)

1. **Keep both escalations.** Package price rises ~2.5%/yr **and** kurs rises 1.5%/yr; they compound for the IDR estimate.
2. **Fixed rate.** 2.5% is a named constant, not an agent-adjustable control.
3. **Pay the departure-year price.** The jamaah pays their departure-year (escalated) price. The invoice DP/pelunasan/total reflect the escalated number — today's base is shown only as a reference and as the top of the ladder.
4. **Year-by-year ladder.** The projection is shown as a climbing ladder (full on-screen; condensed to ≤5 milestone rows on the card).
5. **No "savings" hook.** Because cost is set by departure year regardless of enrollment date, the ladder is purely informational ("gambaran harga asli"), not a lock-now savings claim.

## Calculation model

New named constants (replace the magic `1.015`, add the escalation rate):

```ts
export const PRICE_ESCALATION_RATE = 0.025; // package price, per year
export const KURS_INFLATION_RATE  = 0.015; // USD→IDR kurs, per year
```

With `currentYear = new Date().getFullYear()` and `n = Math.max(1, tahunBerangkat − currentYear)`:

| Quantity | Formula |
|---|---|
| `escalatedPriceUSD` (per jamaah, departure year) | `basePriceUSD × (1 + 0.025)ⁿ` |
| `escalatedTotalUSD` (headline Total) | `escalatedPriceUSD × jumlahJamaah` |
| `dpUSD` (fixed, paid now) | `4500 × jumlahJamaah` |
| `sisaUSD` | `escalatedTotalUSD − dpUSD` |
| `inflatedKurs` | `kursUSD × (1 + 0.015)ⁿ` |
| `estTotalIDR` (headline IDR estimate) | `escalatedTotalUSD × inflatedKurs` |
| `dpIDR` (paid now → today's kurs) | `dpUSD × kursUSD` |

The base price (`basePriceUSD`) remains `pkg.pricesUSD[selectedRoomType]` — today's sticker price.

## Ladder data

The helper builds a **per-jamaah** package-price trajectory, one entry per year from `currentYear` to `tahunBerangkat`:

```ts
priceUSD(y) = basePriceUSD × (1 + 0.025)^(y − currentYear)
```

Each entry is `{ year, priceUSD, isDeparture }`. The first entry is the base price at `currentYear`; the last is `escalatedPriceUSD` at `tahunBerangkat`, flagged `isDeparture`. The series is monotonically increasing.

**Card condensation.** `condenseLadder(ladder, maxRows = 5)`: if `ladder.length ≤ maxRows`, return all; else select evenly-spaced indices `round(i·(L−1)/(maxRows−1))` for `i in 0..maxRows−1`, deduped — always including the first (now) and last (departure) rows. The on-screen result uses the full ladder; the export card uses the condensed one.

## Component design

Extract the math into a pure, unit-tested helper so the compounding logic is testable in isolation (the component is already ~830 lines):

- **`lib/haji-plus-pricing.ts`** — exports the two rate constants, `computeHajiPlusEscalation(input): EscalationResult`, and `condenseLadder(ladder, maxRows)`. No React, no DOM, no network. Input: `{ basePriceUSD, jumlahJamaah, tahunBerangkat, currentYear, kursUSD, dpPerJamaahUSD }`. Output: the table above plus `ladder` and `basePriceUSD`.
- **`PriceLadder`** — a small presentational component (rows of `year · bar · priceUSD`, departure row emphasized) rendered with Tailwind in the on-screen result and with inline styles in the export card (the card cannot rely on Tailwind, matching the existing export pattern). It accepts a ladder array and a `variant: 'screen' | 'export'`. Bar widths are normalized across the series — linear from ~45% at the first year to 100% at the departure year — so the climb reads clearly rather than compressing near the top (raw price-proportional widths would look flat).

`SimulasiHajiPlus.tsx` keeps ownership of state. Its `calc` `useMemo` delegates to `computeHajiPlusEscalation` instead of computing inline.

## Data flow

`selectedPriceUSD` (today's base) feeds `computeHajiPlusEscalation`. All downstream consumers switch from today's `totalUSD` to the escalated values:

- on-screen Total Biaya card → `escalatedTotalUSD` + `≈ estTotalIDR`
- timeline pelunasan value → `sisaUSD`; DP value → `dpUSD`
- export paket card price → `escalatedPriceUSD` (with base reference)
- export invoice DP / Sisa / Total → `dpUSD` / `sisaUSD` / `escalatedTotalUSD`
- both ladders → the (full / condensed) `ladder`

## On-screen UI

- **Paket selection cards:** unchanged — keep showing today's base price (the catalog). The escalation only appears after a package is selected.
- **Total Biaya card (E1):** headline becomes `escalatedTotalUSD`; subline `≈ estTotalIDR`; a label "Estimasi tahun {tahunBerangkat}" and a small "harga dasar {currentYear}: {fmtUSD(basePriceUSD × jumlah)}" reference. The DP/pelunasan split bar uses escalated `dpUSD`/`sisaUSD`.
- **New Proyeksi Harga card:** the full year-by-year `PriceLadder` (variant `screen`), titled "Proyeksi Harga Paket / jamaah", with a caption "Naik ~2.5%/th hingga {tahunBerangkat}".
- **Timeline (E2):** pelunasan amount → `fmtUSD(sisaUSD)`; other steps unchanged.
- **Disclaimer (E4):** updated to state that figures are an estimate using ~2.5%/yr package escalation and 1.5%/yr kurs, and that actual prices are set by Alhijaz.

## Offer card (PNG)

- Grow `OFFER_CARD_HEIGHT` from 600 to ~650px and adjust `gridTemplateRows` so the projection block (~130px) replaces the current 104px "Ringkasan Jadwal & Estimasi" row without clipping. Exact heights tuned during implementation against the rendered PNG.
- **Paket card:** price → `escalatedPriceUSD`, label "Estimasi harga {tahunBerangkat} / jamaah", with a small "harga dasar {currentYear}: {fmtUSD(basePriceUSD)}".
- **Invoice:** header "· estimasi tahun berangkat"; rows DP `fmtUSD(dpUSD)` (`≈ fmtRp(dpIDR)`, "Dibayar sekarang (harga hari ini)"), Sisa Pelunasan `fmtUSD(sisaUSD)` (USD only), Total `fmtUSD(escalatedTotalUSD)` + `≈ fmtRp(estTotalIDR)`.
- **Projection block:** condensed `PriceLadder` (variant `export`) + note: *"Harga paket naik ~2.5%/th hingga tahun berangkat. Est. Rp pakai kurs +1.5%/th (kini {fmtRp(kursUSD)}/USD)."*

## IDR / kurs handling

USD is the source of truth. IDR figures are explicitly approximate:

- **DP** → today's kurs (`dpIDR`), because it is paid now.
- **Total** → inflated departure-year kurs (`estTotalIDR`), because it is paid at departure.
- **Sisa Pelunasan** → shown in USD only on the card to avoid a third, mixed-basis IDR figure.

All escalated figures are labeled "estimasi".

## Error handling

No new network or persistence paths. The helper is pure and total for valid numeric input; `n` is floored at 1 so a current/past departure year still yields a one-year projection. If `kursUSD` is missing the result stays hidden exactly as today (the existing `if (!pkg || !kursUSD) return null` guard remains). Room type and package remain constrained by existing TypeScript unions.

## Testing

Following the repo convention (focused Node test + production build), plus unit tests for the new pure helper:

**`lib/haji-plus-pricing` unit tests:**
- escalation compounding: `basePriceUSD 15700, n 10, rate 2.5%` → `escalatedPriceUSD ≈ 20097` (within rounding).
- `n` floors at 1 when `tahunBerangkat ≤ currentYear`.
- `sisaUSD === escalatedTotalUSD − dpUSD`; `dpUSD === 4500 × jumlah`.
- `estTotalIDR === escalatedTotalUSD × kursUSD × 1.015ⁿ` (both rates applied).
- `dpIDR === dpUSD × kursUSD` (today's kurs, no inflation).
- ladder length `=== n + 1`; first entry `{ year: currentYear, priceUSD: basePriceUSD }`; last `{ isDeparture: true }` at `escalatedPriceUSD`; strictly increasing.
- `condenseLadder`: returns ≤ 5 rows, always includes first and last, preserves the `isDeparture` flag.

**Static test reading `SimulasiHajiPlus.tsx`:** asserts `PRICE_ESCALATION_RATE`/`KURS_INFLATION_RATE` are used (no remaining inline `1.015`), the result/invoice consume `escalatedTotalUSD`, and the ladder is rendered in both surfaces.

Run the focused tests and the production build before completion.

## Out of scope

- Per-package or per-room escalation rates; any UI control to change the rate.
- Persisting or storing generated offers.
- Changing the kurs source or the haji-reguler / umroh simulators.

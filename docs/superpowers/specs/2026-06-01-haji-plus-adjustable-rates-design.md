# Haji Plus Adjustable Escalation Rates Design

## Goal

Let the agent choose the package price-escalation rate and the kurs-inflation rate per simulation via two dropdowns, instead of the fixed 2.5% / 1.5% constants. Defaults equal today's values, so output is unchanged until the agent adjusts them. The chosen rates reflect in every on-screen and exported-PNG label so the assumption is transparent to the jamaah.

This reverses the earlier "fixed 2.5% constant" decision from `2026-06-01-haji-plus-price-escalation-design.md`.

## Decisions

- **Kenaikan Harga** options: 1%, 1.5%, 2%, 2.5%, 3% — default **2.5%**.
- **Kenaikan Kurs** options: 0.5%, 1%, 1.5%, 2%, 2.5% — default **1.5%**.
- Two `<select>`s in a dedicated **"Asumsi Kenaikan"** 2-column row directly after the Tahun & Jumlah row, styled like the existing Tahun Berangkat select.
- Independent; no validation. Rates appear on the exported PNG (transparent assumption).

## Calc — `src/lib/hajiPlusPricing.js`

`computeHajiPlusEscalation(input)` gains optional `priceRate` and `kursRate`. Internally:

```js
const pRate = input.priceRate ?? PRICE_ESCALATION_RATE;
const kRate = input.kursRate ?? KURS_INFLATION_RATE;
```

so omitting them preserves current behavior (and existing tests). `pRate` drives `escalatedPriceUSD` and the `ladder`; `kRate` drives `inflatedKurs`. The constants remain exported as the documented defaults. `.d.ts`: add `priceRate?: number; kursRate?: number` to `EscalationInput`.

## Component — `src/components/SimulasiHajiPlus.tsx`

- Import `PRICE_ESCALATION_RATE`, `KURS_INFLATION_RATE`. New state `priceRate` / `kursRate` initialized to them.
- Module consts `PRICE_RATE_OPTIONS = [0.01, 0.015, 0.02, 0.025, 0.03]`, `KURS_RATE_OPTIONS = [0.005, 0.01, 0.015, 0.02, 0.025]`.
- `calc` passes `priceRate` / `kursRate` to the helper; both added to the memo deps.
- Helper `pctLabel(r)` → `` `${+(r * 100).toFixed(1)}%` `` (`0.025→"2.5%"`, `0.03→"3%"`, `0.005→"0.5%"`).
- New 2-col row after Tahun & Jumlah: two selects (Kenaikan Harga / Kenaikan Kurs); option text `` `${pctLabel(r)} / th` ``.
- Replace every hardcoded `2.5%` / `1.5%` with `pctLabel(priceRate)` / `pctLabel(kursRate)` in: the on-screen "estimasi ~X%/th" badge, the disclaimer, the on-screen ladder note, the export badge, and the export ladder note.

## Tests

- **`tests/haji-plus-pricing.test.js`**: a test that explicit `priceRate` / `kursRate` are honored (`escalatedPriceUSD === base × (1+priceRate)^n`; `inflatedKurs === kurs × (1+kursRate)^n`; ladder uses `priceRate`); and that omitting them falls back to the constants. Existing tests (no rates passed) stay green.
- **`tests/haji-plus-simulation.test.js`**: assert `PRICE_RATE_OPTIONS` / `KURS_RATE_OPTIONS` exist, the two selects are bound to `priceRate` / `kursRate` state, and the badges/notes use `pctLabel(...)` not literal `2.5%`/`1.5%`. Update the existing `kurs +1.5%/th` assertion to the dynamic `kurs +{pctLabel(kursRate)}/th` form.

## Out of scope

Per-package or per-room rates; persisting the agent's choice; changing the option lists.

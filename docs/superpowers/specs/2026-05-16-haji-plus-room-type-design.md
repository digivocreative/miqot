# Haji Plus Room Type Pricing Design

## Goal

Update `/dashboard/ai-tools/haji-plus/simulasi` so agents can choose a room type for Haji Plus simulations. Current prices remain the Quad prices by default.

## Requirements

- Keep the package choice as RAHMAH or UHUD.
- Default every selected package to Quad.
- Let agents switch room type after choosing a package.
- Supported room types are Double, Triple, and Quad.
- Prices:
  - UHUD Double: USD 14,000
  - UHUD Triple: USD 13,000
  - UHUD Quad: USD 12,500
  - RAHMAH Double: USD 17,400
  - RAHMAH Triple: USD 16,400
  - RAHMAH Quad: USD 15,700
- Calculations, visible totals, timeline values, and exported PNG must use the selected room price.
- Exported offer should show the selected room type, for example `Paket RAHMAH Triple`.

## Recommended Approach

Keep the existing package cards and add a room-type segmented control that appears after a package is selected.

This preserves the existing flow and makes the new decision explicit. It avoids turning the package picker into six separate cards, while still keeping the room type visible before the agent generates an offer.

## Component Design

`SimulasiHajiPlus.tsx` will continue to own the simulation state. The package data will change from a single `priceUSD` per package to a `pricesUSD` map keyed by room type.

New state:

```ts
type RoomType = 'double' | 'triple' | 'quad';
const [selectedRoomType, setSelectedRoomType] = useState<RoomType>('quad');
```

The selected package card will display the active room price. Before a package is chosen, package cards still show Quad prices so the initial screen matches the current behavior.

## Data Flow

The derived `pkg` value remains based on `selectedPkg`. A new derived `selectedPriceUSD` is computed from `pkg.pricesUSD[selectedRoomType]`.

All downstream calculations use `selectedPriceUSD`:

- total USD and IDR
- DP/sisa pelunasan balance
- per-jamaah label when `jumlahJamaah > 1`
- exported package card price
- exported total row description

## UI

After package selection and before the year/jamaah controls, show a compact `Tipe Kamar` segmented control with:

- Double
- Triple
- Quad

Quad is selected by default. The control follows existing compact dashboard styling and uses the selected package accent color.

## Error Handling

No new network or persistence errors are introduced. If a package cannot be found, the simulation remains hidden as it does now. The room type is constrained by local TypeScript union values, so price lookup should always be defined for supported packages.

## Testing

Add a focused Node test that reads `SimulasiHajiPlus.tsx` and verifies:

- both packages define Double, Triple, and Quad prices
- Quad prices remain USD 15,700 for RAHMAH and USD 12,500 for UHUD
- default room type is Quad
- calculation uses the selected room price instead of a package-level `priceUSD`
- export labels include the room type

Run the focused test and the production build before completion.

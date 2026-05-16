# Haji Plus Room Type Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Double, Triple, and Quad room-type pricing to the Haji Plus simulation calculator while keeping Quad as the default.

**Architecture:** Keep the existing single-component flow in `SimulasiHajiPlus.tsx`. Package data will store a price map per room type, and all derived totals/export labels will read from the selected room type. A focused structural Node test guards the pricing table and critical code paths.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, Node `node:test`, existing `modern-screenshot` export flow.

---

## File Structure

- Modify `src/components/SimulasiHajiPlus.tsx`
  - Add room-type constants and state.
  - Replace package-level `priceUSD` with `pricesUSD`.
  - Add the `Tipe Kamar` segmented control after package selection.
  - Route all visible and exported calculations through the selected room price.
- Create `tests/haji-plus-simulation.test.js`
  - Structural regression checks for room prices, default room type, selected-price calculation, and export labels.
- Modify `docs/project-summary.md`
  - Update the Simulasi Haji Plus feature summary to mention room-type pricing.
- Modify `docs/DESIGN-SYSTEM.md`
  - Update the Simulasi Haji Plus component notes to list room prices.

---

### Task 1: Add Failing Structural Test

**Files:**
- Create: `tests/haji-plus-simulation.test.js`
- Test target: `src/components/SimulasiHajiPlus.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/haji-plus-simulation.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootPath = new URL('..', import.meta.url).pathname;

function read(path) {
  return readFileSync(join(rootPath, path), 'utf8');
}

test('SimulasiHajiPlus defines room-type pricing for RAHMAH and UHUD', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');

  assert.match(source, /type\s+RoomTypeId\s*=\s*'double'\s*\|\s*'triple'\s*\|\s*'quad'/);
  assert.match(source, /const\s+ROOM_TYPES\s*=/);
  for (const id of ['double', 'triple', 'quad']) {
    assert.match(source, new RegExp(`id:\\s*'${id}'`));
  }

  assert.match(source, /id:\s*'rahmah'[\s\S]*pricesUSD:\s*\{[\s\S]*double:\s*17400[\s\S]*triple:\s*16400[\s\S]*quad:\s*15700[\s\S]*\}/);
  assert.match(source, /id:\s*'uhud'[\s\S]*pricesUSD:\s*\{[\s\S]*double:\s*14000[\s\S]*triple:\s*13000[\s\S]*quad:\s*12500[\s\S]*\}/);
});

test('SimulasiHajiPlus keeps Quad as default and calculates from selected room price', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');

  assert.match(source, /useState<RoomTypeId>\('quad'\)/);
  assert.match(source, /selectedPriceUSD\s*=\s*pkg\s*\?\s*pkg\.pricesUSD\[selectedRoomType\]\s*:\s*0/);
  assert.match(source, /const\s+totalUSD\s*=\s*selectedPriceUSD\s*\*\s*jumlahJamaah/);
  assert.doesNotMatch(source, /const\s+totalUSD\s*=\s*pkg\.priceUSD\s*\*\s*jumlahJamaah/);
});

test('SimulasiHajiPlus displays room type in the exported offer labels', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');

  assert.match(source, /Paket\s+\{pkg\.name\}\s+\{selectedRoom\.label\}/);
  assert.match(source, /Simulasi Haji Plus\s+·\s+\{pkg\?\.name\}\s+\{selectedRoom\.label\}/);
  assert.match(source, /\{fmtUSD\(selectedPriceUSD\)\}\s*×\s*\{jumlahJamaah\}\s*jamaah/);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
node --test tests/haji-plus-simulation.test.js
```

Expected: FAIL because `RoomTypeId`, `ROOM_TYPES`, `pricesUSD`, and `selectedPriceUSD` do not exist yet.

---

### Task 2: Implement Room-Type Pricing in the Calculator

**Files:**
- Modify: `src/components/SimulasiHajiPlus.tsx`
- Test: `tests/haji-plus-simulation.test.js`

- [ ] **Step 1: Add room types and package price maps**

Replace the current `PACKAGES` constant with:

```ts
type RoomTypeId = 'double' | 'triple' | 'quad';

const ROOM_TYPES: Array<{ id: RoomTypeId; label: string }> = [
  { id: 'double', label: 'Double' },
  { id: 'triple', label: 'Triple' },
  { id: 'quad', label: 'Quad' },
];

const PACKAGES = [
  {
    id: 'rahmah',
    name: 'RAHMAH',
    stars: 5,
    pricesUSD: { double: 17400, triple: 16400, quad: 15700 },
    hotel: 'Lebih Nyaman dengan Hotel Bintang 5',
  },
  {
    id: 'uhud',
    name: 'UHUD',
    stars: 4,
    pricesUSD: { double: 14000, triple: 13000, quad: 12500 },
    hotel: 'Hotel Bintang 4 dengan Lokasi Strategis',
  },
];
```

- [ ] **Step 2: Add selected room state and derived price**

Near the existing state and derived values, add:

```ts
const [selectedRoomType, setSelectedRoomType] = useState<RoomTypeId>('quad');
```

Then derive:

```ts
const selectedRoom = ROOM_TYPES.find(r => r.id === selectedRoomType) || ROOM_TYPES[2];
const selectedPriceUSD = pkg ? pkg.pricesUSD[selectedRoomType] : 0;
```

- [ ] **Step 3: Update calculation logic**

Inside `calc`, replace package-level price usage with:

```ts
const totalUSD = selectedPriceUSD * jumlahJamaah;
```

Update the `useMemo` dependency array to include `selectedPriceUSD`.

- [ ] **Step 4: Update package cards**

Inside `PACKAGES.map`, compute and render the card price:

```ts
const cardRoomType = selectedPkg ? selectedRoomType : 'quad';
const cardRoom = ROOM_TYPES.find(r => r.id === cardRoomType) || ROOM_TYPES[2];
const cardPriceUSD = p.pricesUSD[cardRoomType];
```

Render:

```tsx
<p className={`text-xl font-bold mt-1 ${selected ? 'text-white' : 'text-gray-800 dark:text-white'}`}>{fmtUSD(cardPriceUSD)}</p>
<p className={`text-[9px] mt-0.5 ${selected ? 'text-white/70' : 'text-gray-500 dark:text-slate-400'}`}>per jamaah · {cardRoom.label}</p>
```

- [ ] **Step 5: Add room-type segmented control**

After the package picker and before the `Tahun & Jumlah` grid, add:

```tsx
{pkg && (
  <div>
    <p className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2 px-1">Tipe Kamar</p>
    <div className="grid grid-cols-3 gap-2 p-1 bg-gray-100 dark:bg-slate-800 rounded-xl">
      {ROOM_TYPES.map(room => {
        const selected = selectedRoomType === room.id;
        return (
          <button
            key={room.id}
            onClick={() => setSelectedRoomType(room.id)}
            className={`py-2 rounded-lg text-[11px] font-bold transition-all duration-200 active:scale-[0.97] ${
              selected
                ? isRahmah
                  ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-500 dark:text-slate-400'
            }`}
          >
            {room.label}
          </button>
        );
      })}
    </div>
  </div>
)}
```

- [ ] **Step 6: Update visible result labels**

Replace visible references to `pkg.priceUSD` with `selectedPriceUSD`, and include `selectedRoom.label` in package labels:

```tsx
Total Biaya · {pkg.name} {selectedRoom.label} {'★'.repeat(pkg.stars)}
{fmtUSD(selectedPriceUSD)} × {jumlahJamaah} jamaah
```

- [ ] **Step 7: Update export card labels and prices**

Replace export references to `pkg.priceUSD` with `selectedPriceUSD`, and render:

```tsx
Paket {pkg.name} {selectedRoom.label}
{fmtUSD(selectedPriceUSD)}
{jumlahJamaah > 1 ? `${fmtUSD(selectedPriceUSD)} × ${jumlahJamaah} jamaah` : `1 jamaah · ${selectedRoom.label}`}
```

Update the preview modal subtitle:

```tsx
Simulasi Haji Plus · {pkg?.name} {selectedRoom.label}
```

- [ ] **Step 8: Run focused test to verify it passes**

Run:

```bash
node --test tests/haji-plus-simulation.test.js
```

Expected: PASS.

---

### Task 3: Update Documentation

**Files:**
- Modify: `docs/project-summary.md`
- Modify: `docs/DESIGN-SYSTEM.md`

- [ ] **Step 1: Update project summary text**

Replace the existing Simulasi Haji Plus bullet with text that mentions room pricing:

```md
- **Simulasi Haji Plus** (`/dashboard/ai-tools/haji-plus/simulasi`): Kalkulator harga Haji Plus — pilih paket RAHMAH/UHUD, pilih tipe kamar Double/Triple/Quad (default Quad), DP $4,500/orang, pelunasan 6 bulan sebelum berangkat, proyeksi inflasi 1.5%/tahun, export PNG + share via native share.
```

- [ ] **Step 2: Update design-system component note**

Replace the current package-selection sentence with:

```md
Two packages with room-type pricing. Quad is the default:

- RAHMAH: Double $17,400, Triple $16,400, Quad $15,700
- UHUD: Double $14,000, Triple $13,000, Quad $12,500
```

- [ ] **Step 3: Run focused test after docs update**

Run:

```bash
node --test tests/haji-plus-simulation.test.js
```

Expected: PASS.

---

### Task 4: Final Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run focused regression test**

Run:

```bash
node --test tests/haji-plus-simulation.test.js
```

Expected: PASS.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: Vite and function bundle build complete with exit code 0.

- [ ] **Step 3: Review git diff**

Run:

```bash
git diff -- src/components/SimulasiHajiPlus.tsx tests/haji-plus-simulation.test.js docs/project-summary.md docs/DESIGN-SYSTEM.md
```

Expected: diff only contains room-type pricing, related UI labels, tests, and docs.

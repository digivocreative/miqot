# Rahmah Juli Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public `/rahmah-1-juli-2026` landing page for jamaah self-checks before departure.

**Architecture:** Add a small static data/helper module for the Rahmah departure and a focused React page component that renders grouped jamaah cards. Route the single slug from `src/main.tsx` before the package-id fallback so it never resolves as an unknown package.

**Tech Stack:** React, Vite, TypeScript, Tailwind CSS, Node `node:test`.

---

### Task 1: Static Data And Grouping Helpers

**Files:**
- Create: `src/lib/rahmahJuliLanding.js`
- Create: `src/lib/rahmahJuliLanding.d.ts`
- Test: `tests/rahmah-juli-landing.test.js`

- [x] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RAHMAH_JULI_SLUG,
  RAHMAH_JULI_JAMAAH,
  getRahmahJuliGroups,
} from '../src/lib/rahmahJuliLanding.js';

test('Rahmah July data uses the agreed slug and has 43 jamaah', () => {
  assert.equal(RAHMAH_JULI_SLUG, 'rahmah-1-juli-2026');
  assert.equal(RAHMAH_JULI_JAMAAH.length, 43);
});

test('Rahmah July groups jamaah by ID Umrah and sorts each family by age descending', () => {
  const groups = getRahmahJuliGroups();
  assert.equal(groups[0].idUmrah, 'AIW0028456');
  assert.deepEqual(groups[0].members.map((member) => member.age), [46, 46, 17, 12]);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/rahmah-juli-landing.test.js`

- [x] **Step 3: Write minimal implementation**

Create the data array, export `RAHMAH_JULI_SLUG`, `RAHMAH_JULI_JAMAAH`, `getRahmahJuliGroups`, and type declarations for TypeScript imports.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/rahmah-juli-landing.test.js`

### Task 2: Landing Page Component

**Files:**
- Create: `src/components/RahmahJuliLandingPage.tsx`
- Modify: `tests/rahmah-juli-landing.test.js`

- [x] **Step 1: Write the failing test**

Assert that the component file exists and contains grouped card/checklist labels: `DAFTAR JAMAAH`, `getRahmahJuliGroups`, `Nomor WA`, `Nusuk`, and `Raudhah`.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/rahmah-juli-landing.test.js`

- [x] **Step 3: Write minimal implementation**

Render the design-system-aligned mobile page with grouped cards, local checklist state, masked numbers, search/filter support, and WhatsApp correction CTA.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/rahmah-juli-landing.test.js`

### Task 3: Route `/rahmah-1-juli-2026`

**Files:**
- Modify: `src/main.tsx`
- Modify: `tests/rahmah-juli-landing.test.js`

- [x] **Step 1: Write the failing test**

Assert that `src/main.tsx` lazy-loads `RahmahJuliLandingPage`, defines `isRahmahJuliLanding`, includes `rahmah-1-juli-2026` in known first segments, and returns the page before `App`.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/rahmah-juli-landing.test.js`

- [x] **Step 3: Write minimal implementation**

Add the lazy import, route flag, known segment entry, and page branch.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/rahmah-juli-landing.test.js`

### Task 4: Verification

**Files:**
- Verify all touched files.

- [x] **Step 1: Run focused tests**

Run: `node --test tests/rahmah-juli-landing.test.js`

- [x] **Step 2: Run build**

Run: `npm run build:spa`

- [x] **Step 3: Browser smoke test**

Run the dev server and verify `/rahmah-1-juli-2026` renders in browser without visual breakage.

# WA Copy Media Upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins attach one image or document (PDF/Word/Excel) to any WA Copy content item (FAQ, caption, tour-leader step); store the file on Bunny CDN and show it — with a download button — in the consumer WA Copy tabs.

**Architecture:** A reusable `MediaUploadField` (edit) and `MediaView` (read-only) drive all three editors and their consumer cards. A new admin-only `POST /api/admin/wa-copy/media` route reuses the existing `bunnyUpload()` helper. The authoritative file validator lives in a new root `lib/wa-copy-media.js` (unit-tested, imported by `server.js`); the frontend keeps a small TS mirror guarded by a parity test. Media URLs are stored as `media?: MediaAttachment[]` on the existing in-memory content entries.

**Tech Stack:** React 18 + TypeScript + Vite (frontend), Express in `server.js` (backend), Bunny CDN (storage), `node:test` + `node:assert/strict` (tests, run via `node --test`).

---

## Before you start — read this

1. **Concurrent edits warning.** At plan-writing time the working tree had *uncommitted, not-mine* changes to `WaCopyAdminPage.tsx`, `FaqAccordionItem.tsx`, `ContentList.tsx`, and wa-copy test files. **Before editing any existing file, open it fresh and anchor your edits on the quoted code shown here, not on line numbers** — line numbers may have drifted.
2. **No `test` script exists.** Run tests with `node --test tests/<file>.test.js`.
3. **FE verification gate:** `npx tsc --noEmit` and `npm run build` must pass (eslint is unconfigured in this repo).
4. **Commit trailer:** end every commit message with
   `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
   (shown via heredoc in each Commit step).
5. **Branch:** work on `main` (the user's working branch). Run `git branch --show-current` before each commit to confirm you're still on it.

## File structure

| File | Create/Modify | Responsibility |
| --- | --- | --- |
| `lib/wa-copy-media.js` | Create | Authoritative, pure validation + mime/ext/path helpers. Imported by `server.js`. Unit-tested. |
| `server.js` | Modify | Add `POST /api/admin/wa-copy/media` route (admin-only) that validates + uploads to Bunny. |
| `src/components/wa-copy/lib/types.ts` | Modify | `MediaAttachment` interface + `media?` on the three entry types. |
| `src/components/wa-copy/lib/media.ts` | Create | FE mirror of constants + `fileToBase64`, `validateMediaFile`, `formatBytes`, `kindFromMime`, `ACCEPT_ATTR`, endpoint URL. |
| `src/components/wa-copy/admin/MediaView.tsx` | Create | Read-only media render (image thumbnail / file chip) + optional download. |
| `src/components/wa-copy/admin/MediaUploadField.tsx` | Create | Editable upload field (pick → validate → upload → preview/replace/remove). |
| `src/components/wa-copy/admin/FaqEditor.tsx` | Modify | Add media field + `draft.media`. |
| `src/components/wa-copy/admin/CaptionEditor.tsx` | Modify | Add media field + `draft.media`. |
| `src/components/wa-copy/admin/TourLeaderEditor.tsx` | Modify | Add media field + `draft.media`. |
| `src/components/wa-copy/tabs/faq/FaqAccordionItem.tsx` | Modify | Render `MediaView` in expanded answer. |
| `src/components/wa-copy/tabs/caption/CaptionCard.tsx` | Modify | Render `MediaView`. |
| `src/components/wa-copy/tabs/tourleader/TourStepCard.tsx` | Modify | Render `MediaView`. |
| `tests/wa-copy-media.test.js` | Create | Behavioral tests for `lib/wa-copy-media.js`. |
| `tests/wa-copy-media-wiring.test.js` | Create | Source-assertion tests (server route, FE parity, types, components, editors, displays). |

`WaCopyAdminPage.tsx` needs **no change**: it already spreads each draft into `create*/update*`, so `media` flows through once the entry types include it.

---

## Task 1: Authoritative media validator (`lib/wa-copy-media.js`)

**Files:**
- Create: `lib/wa-copy-media.js`
- Test: `tests/wa-copy-media.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/wa-copy-media.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  kindFromMime,
  extFromMime,
  validateMedia,
  safeBaseName,
  MAX_IMAGE_BYTES,
  MAX_DOC_BYTES,
} from '../lib/wa-copy-media.js';

test('kindFromMime maps images vs docs', () => {
  assert.equal(kindFromMime('image/png'), 'image');
  assert.equal(kindFromMime('image/webp'), 'image');
  assert.equal(kindFromMime('application/pdf'), 'file');
  assert.equal(kindFromMime('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 'file');
});

test('extFromMime returns the expected extension', () => {
  assert.equal(extFromMime('image/jpeg'), 'jpg');
  assert.equal(extFromMime('image/png'), 'png');
  assert.equal(extFromMime('application/pdf'), 'pdf');
  assert.equal(extFromMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'docx');
  assert.equal(extFromMime('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 'xlsx');
});

test('validateMedia accepts allowed types within size caps', () => {
  assert.equal(validateMedia({ mime: 'image/png', size: 1000 }), null);
  assert.equal(validateMedia({ mime: 'application/pdf', size: MAX_DOC_BYTES }), null);
  assert.equal(validateMedia({ mime: 'image/jpeg', size: MAX_IMAGE_BYTES }), null);
});

test('validateMedia rejects disallowed mime', () => {
  assert.match(validateMedia({ mime: 'image/gif', size: 1000 }), /Format tidak didukung/);
  assert.match(validateMedia({ mime: 'text/html', size: 1000 }), /Format tidak didukung/);
});

test('validateMedia rejects oversize by kind', () => {
  assert.match(validateMedia({ mime: 'image/png', size: MAX_IMAGE_BYTES + 1 }), /maksimal 6MB/);
  assert.match(validateMedia({ mime: 'application/pdf', size: MAX_DOC_BYTES + 1 }), /maksimal 10MB/);
});

test('validateMedia rejects empty/unreadable size', () => {
  assert.match(validateMedia({ mime: 'image/png', size: 0 }), /kosong/);
});

test('safeBaseName slugifies and drops the extension', () => {
  assert.equal(safeBaseName('My File (1).PDF'), 'my-file-1');
  assert.equal(safeBaseName('paspor jamaah.docx'), 'paspor-jamaah');
  assert.equal(safeBaseName(''), 'media');
  assert.equal(safeBaseName('...'), 'media');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/wa-copy-media.test.js`
Expected: FAIL — `Cannot find module '../lib/wa-copy-media.js'`.

- [ ] **Step 3: Write the implementation**

Create `lib/wa-copy-media.js`:

```js
// Authoritative WA Copy media validation + path helpers. Pure functions, no I/O.
// Imported by server.js for the /api/admin/wa-copy/media route. The frontend keeps
// a mirror in src/components/wa-copy/lib/media.ts, kept in sync by a parity test.

export const IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp'];
export const DOC_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // .xlsx
];
export const ALLOWED_MIME = [...IMAGE_MIME, ...DOC_MIME];

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // 6 MB
export const MAX_DOC_BYTES = 10 * 1024 * 1024;  // 10 MB

const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

export function kindFromMime(mime) {
  return IMAGE_MIME.includes(mime) ? 'image' : 'file';
}

export function extFromMime(mime) {
  return EXT_BY_MIME[mime] || 'bin';
}

// Returns an Indonesian error string, or null when valid. `size` is the decoded byte length.
export function validateMedia({ mime, size }) {
  if (!ALLOWED_MIME.includes(mime)) {
    return 'Format tidak didukung. Gunakan gambar (JPG/PNG/WebP) atau dokumen (PDF/Word/Excel).';
  }
  if (!Number.isFinite(size) || size <= 0) {
    return 'Berkas kosong atau tidak terbaca.';
  }
  const cap = kindFromMime(mime) === 'image' ? MAX_IMAGE_BYTES : MAX_DOC_BYTES;
  if (size > cap) {
    return `Ukuran maksimal ${Math.round(cap / (1024 * 1024))}MB.`;
  }
  return null;
}

// Slugify a filename base (extension dropped) into a safe Bunny path segment.
export function safeBaseName(name) {
  const base = String(name || '').replace(/\.[^.]+$/, '');
  const slug = base
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'media';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/wa-copy-media.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # confirm: main
git add lib/wa-copy-media.js tests/wa-copy-media.test.js
git commit -m "$(cat <<'EOF'
feat(wa-copy): authoritative media validator lib + tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Upload endpoint (`POST /api/admin/wa-copy/media`)

**Files:**
- Modify: `server.js` (add import near other `./lib/*.js` imports; add route after the Bunny helpers block)
- Test: `tests/wa-copy-media-wiring.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/wa-copy-media-wiring.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (rel) => readFileSync(join(root, rel), 'utf8');

test('server registers admin-only wa-copy media route that uploads to Bunny', () => {
  const src = read('server.js');
  assert.match(src, /from '\.\/lib\/wa-copy-media\.js'/, 'server.js must import the media lib');
  const routeIdx = src.indexOf("'/api/admin/wa-copy/media'");
  assert.ok(routeIdx >= 0, 'route path missing');
  // The route registration line includes both auth + admin guards.
  const line = src.slice(routeIdx, routeIdx + 200);
  assert.match(line, /authMiddleware/, 'route must use authMiddleware');
  assert.match(line, /adminOnly/, 'route must use adminOnly');
  // Handler calls the validator, bunnyUpload, and the bunny-enabled guard.
  const handler = src.slice(routeIdx, routeIdx + 1400);
  assert.match(handler, /getBunnyEnabled\(\)/);
  assert.match(handler, /validateMedia\(/);
  assert.match(handler, /bunnyUpload\(/);
  assert.match(handler, /\$\{BUNNY_CDN_HOSTNAME\}/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/wa-copy-media-wiring.test.js`
Expected: FAIL — "route path missing".

- [ ] **Step 3a: Add the import to `server.js`**

Find the existing local-lib import (search for `./lib/awapi-sync-outcome.js`, or any `from './lib/`). Add directly beneath it:

```js
import {
  validateMedia,
  kindFromMime,
  extFromMime,
  safeBaseName,
} from './lib/wa-copy-media.js';
```

- [ ] **Step 3b: Add the route to `server.js`**

Find the Bunny helpers block (search for `async function bunnyDelete(`). After the `downloadFile` helper that follows it (search for `async function downloadFile(` and place this **after** that function's closing brace, before `async function syncFilesToBunny(`), insert:

```js
// ── WA Copy: admin media upload → Bunny CDN ─────────────────────────
app.post('/api/admin/wa-copy/media', authMiddleware, adminOnly, express.json({ limit: '16mb' }), async (req, res) => {
  // 16mb body limit: a 10MB doc inflates to ~13.7MB once base64-encoded.
  try {
    if (!getBunnyEnabled()) {
      return res.status(503).json({ error: 'Penyimpanan media belum dikonfigurasi' });
    }
    const { mime, name, data } = req.body || {};
    if (typeof data !== 'string' || !data) {
      return res.status(400).json({ error: 'Data berkas kosong' });
    }
    const base64 = data.startsWith('data:') ? data.slice(data.indexOf(',') + 1) : data;
    const buffer = Buffer.from(base64, 'base64');
    const validationError = validateMedia({ mime, size: buffer.length });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }
    const path = `wa-copy/${Date.now()}-${safeBaseName(name)}.${extFromMime(mime)}`;
    await bunnyUpload(path, buffer, mime);
    return res.json({
      success: true,
      url: `https://${BUNNY_CDN_HOSTNAME}/${path}`,
      kind: kindFromMime(mime),
      mime,
      name: typeof name === 'string' && name ? name : path.split('/').pop(),
      size: buffer.length,
    });
  } catch (err) {
    console.error('[wa-copy] media upload error:', err);
    return res.status(500).json({ error: 'Gagal mengunggah media' });
  }
});
```

> Note: this mirrors the per-route `express.json({ limit })` pattern already used by `/api/bio/:slug/og-image`. `bunnyUpload`, `getBunnyEnabled`, and `BUNNY_CDN_HOSTNAME` are module-scoped above this point; `app`, `authMiddleware`, `adminOnly`, and `express` are defined far earlier. Ensure the route is registered before `app.listen(`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/wa-copy-media-wiring.test.js`
Expected: PASS.

- [ ] **Step 5: Sanity-check the server still boots**

Run: `node --check server.js`
Expected: no output (syntax OK).

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add server.js tests/wa-copy-media-wiring.test.js
git commit -m "$(cat <<'EOF'
feat(wa-copy): admin media upload endpoint to Bunny CDN

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Data model (`MediaAttachment` + `media?` fields)

**Files:**
- Modify: `src/components/wa-copy/lib/types.ts`
- Test: `tests/wa-copy-media-wiring.test.js` (append)

- [ ] **Step 1: Write the failing test** — append to `tests/wa-copy-media-wiring.test.js`:

```js
test('types.ts defines MediaAttachment and adds media[] to the three entries', () => {
  const src = read('src/components/wa-copy/lib/types.ts');
  assert.match(src, /export interface MediaAttachment\s*{/);
  for (const field of ['url:', 'kind:', 'mime:', 'name:', 'size:']) {
    assert.ok(src.includes(field), `MediaAttachment missing ${field}`);
  }
  assert.match(src, /kind:\s*'image'\s*\|\s*'file'/);
  // media? present on all three entry interfaces.
  const count = (src.match(/media\?:\s*MediaAttachment\[\]/g) || []).length;
  assert.ok(count >= 3, `expected media?: MediaAttachment[] on 3 interfaces, found ${count}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/wa-copy-media-wiring.test.js`
Expected: FAIL — "export interface MediaAttachment" not found.

- [ ] **Step 3: Edit `src/components/wa-copy/lib/types.ts`**

Add this interface (place it after the `export type { FaqEntry };` re-export near the top):

```ts
export interface MediaAttachment {
  url: string;           // Bunny CDN public URL
  kind: 'image' | 'file';
  mime: string;          // e.g. image/png, application/pdf
  name: string;          // original filename (display + download)
  size: number;          // bytes
}
```

Then add `media?: MediaAttachment[];` as the last field of each of `CaptionEntry`, `AgentFaqEntry`, and `TourStep`. For example, `AgentFaqEntry` becomes:

```ts
export interface AgentFaqEntry extends FaqEntry {
  category: FaqCategory;
  order: number;
  active: boolean;
  media?: MediaAttachment[];
}
```

Do the same for `CaptionEntry` (after `active: boolean;`) and `TourStep` (after `active: boolean;`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/wa-copy-media-wiring.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/components/wa-copy/lib/types.ts tests/wa-copy-media-wiring.test.js
git commit -m "$(cat <<'EOF'
feat(wa-copy): MediaAttachment type + media field on content entries

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Frontend media helpers (`lib/media.ts`) + parity test

**Files:**
- Create: `src/components/wa-copy/lib/media.ts`
- Test: `tests/wa-copy-media-wiring.test.js` (append)

- [ ] **Step 1: Write the failing test** — append to `tests/wa-copy-media-wiring.test.js`:

```js
test('FE media.ts mirrors the authoritative allowlist + caps (no drift)', () => {
  const lib = read('lib/wa-copy-media.js');
  const fe = read('src/components/wa-copy/lib/media.ts');
  const mimes = [
    'image/png', 'image/jpeg', 'image/webp',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];
  for (const m of mimes) {
    assert.ok(lib.includes(m), `lib missing ${m}`);
    assert.ok(fe.includes(m), `FE media.ts missing ${m}`);
  }
  for (const cap of ['6 * 1024 * 1024', '10 * 1024 * 1024']) {
    assert.ok(fe.includes(cap), `FE media.ts missing cap ${cap}`);
  }
  assert.match(fe, /MEDIA_UPLOAD_URL\s*=\s*'\/api\/admin\/wa-copy\/media'/);
  assert.match(fe, /export function fileToBase64/);
  assert.match(fe, /export function validateMediaFile/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/wa-copy-media-wiring.test.js`
Expected: FAIL — FE media.ts not found / missing markers.

- [ ] **Step 3: Create `src/components/wa-copy/lib/media.ts`**

```ts
import type { MediaAttachment } from './types';

export const MEDIA_UPLOAD_URL = '/api/admin/wa-copy/media';

// Keep in sync with lib/wa-copy-media.js (guarded by tests/wa-copy-media-wiring.test.js).
export const IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp'];
export const DOC_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
export const ALLOWED_MIME = [...IMAGE_MIME, ...DOC_MIME];
export const ACCEPT_ATTR = [...ALLOWED_MIME, '.docx', '.xlsx'].join(',');

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
export const MAX_DOC_BYTES = 10 * 1024 * 1024;

export function kindFromMime(mime: string): MediaAttachment['kind'] {
  return IMAGE_MIME.includes(mime) ? 'image' : 'file';
}

export function validateMediaFile(file: File): string | null {
  if (!ALLOWED_MIME.includes(file.type)) {
    return 'Format tidak didukung. Gunakan gambar (JPG/PNG/WebP) atau dokumen (PDF/Word/Excel).';
  }
  const cap = kindFromMime(file.type) === 'image' ? MAX_IMAGE_BYTES : MAX_DOC_BYTES;
  if (file.size > cap) {
    return `Ukuran maksimal ${Math.round(cap / (1024 * 1024))}MB.`;
  }
  return null;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/wa-copy-media-wiring.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/components/wa-copy/lib/media.ts tests/wa-copy-media-wiring.test.js
git commit -m "$(cat <<'EOF'
feat(wa-copy): frontend media helpers + allowlist parity test

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `MediaView` (read-only render + download)

**Files:**
- Create: `src/components/wa-copy/admin/MediaView.tsx`
- Test: `tests/wa-copy-media-wiring.test.js` (append)

- [ ] **Step 1: Write the failing test** — append to `tests/wa-copy-media-wiring.test.js`:

```js
test('MediaView renders image vs file and an optional download link', () => {
  const src = read('src/components/wa-copy/admin/MediaView.tsx');
  assert.match(src, /media\.kind === 'image'/);
  assert.match(src, /<img/);
  assert.match(src, /download=\{media\.name\}/);
  assert.match(src, /formatBytes\(media\.size\)/);
  assert.match(src, /download\s*=\s*true/);   // prop defaults to true
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/wa-copy-media-wiring.test.js`
Expected: FAIL — MediaView.tsx not found.

- [ ] **Step 3: Create `src/components/wa-copy/admin/MediaView.tsx`**

```tsx
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import type { MediaAttachment } from '../lib/types';
import { formatBytes } from '../lib/media';

interface MediaViewProps {
  media: MediaAttachment;
  download?: boolean;
}

function FileIcon({ mime }: { mime: string }) {
  if (mime.includes('spreadsheet')) {
    return <FileSpreadsheet size={18} className="text-emerald-600 dark:text-emerald-400" />;
  }
  return <FileText size={18} className="text-blue-600 dark:text-blue-400" />;
}

export default function MediaView({ media, download = true }: MediaViewProps) {
  const isImage = media.kind === 'image';
  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40 overflow-hidden">
      {isImage ? (
        <a href={media.url} target="_blank" rel="noreferrer" className="block">
          <img
            src={media.url}
            alt={media.name}
            className="w-full max-h-60 object-contain bg-white dark:bg-slate-900"
          />
        </a>
      ) : (
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <FileIcon mime={media.mime} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-gray-800 dark:text-slate-100">
              {media.name}
            </span>
            <span className="block text-[11px] text-gray-400 dark:text-slate-500">
              {formatBytes(media.size)}
            </span>
          </span>
        </div>
      )}
      {download && (
        <a
          href={media.url}
          download={media.name}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-1.5 border-t border-gray-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
        >
          <Download size={13} />
          Unduh
        </a>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/wa-copy-media-wiring.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/components/wa-copy/admin/MediaView.tsx tests/wa-copy-media-wiring.test.js
git commit -m "$(cat <<'EOF'
feat(wa-copy): MediaView read-only render component

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `MediaUploadField` (editable upload field)

**Files:**
- Create: `src/components/wa-copy/admin/MediaUploadField.tsx`
- Test: `tests/wa-copy-media-wiring.test.js` (append)

- [ ] **Step 1: Write the failing test** — append to `tests/wa-copy-media-wiring.test.js`:

```js
test('MediaUploadField validates, uploads with auth headers, and reports back', () => {
  const src = read('src/components/wa-copy/admin/MediaUploadField.tsx');
  assert.match(src, /from '\.\.\/\.\.\/LoginPage'/);          // getAuthHeaders import
  assert.match(src, /validateMediaFile\(/);
  assert.match(src, /fileToBase64\(/);
  assert.match(src, /fetch\(MEDIA_UPLOAD_URL/);
  assert.match(src, /getAuthHeaders\(\)/);
  assert.match(src, /onChange\(\{/);                          // returns a MediaAttachment
  assert.match(src, /accept=\{ACCEPT_ATTR\}/);
  assert.match(src, /import MediaView from '\.\/MediaView'/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/wa-copy-media-wiring.test.js`
Expected: FAIL — MediaUploadField.tsx not found.

- [ ] **Step 3: Create `src/components/wa-copy/admin/MediaUploadField.tsx`**

```tsx
import { useRef, useState } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { getAuthHeaders } from '../../LoginPage';
import type { MediaAttachment } from '../lib/types';
import { ACCEPT_ATTR, MEDIA_UPLOAD_URL, fileToBase64, validateMediaFile } from '../lib/media';
import MediaView from './MediaView';

interface MediaUploadFieldProps {
  value: MediaAttachment | null;
  onChange: (media: MediaAttachment | null) => void;
}

export default function MediaUploadField({ value, onChange }: MediaUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    const validationError = validateMediaFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const data = await fileToBase64(file);
      const res = await fetch(MEDIA_UPLOAD_URL, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ mime: file.type, name: file.name, data }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j?.error || 'Upload gagal');
      onChange({ url: j.url, kind: j.kind, mime: j.mime, name: j.name, size: j.size });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload gagal');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.currentTarget.value = '';
        }}
      />
      {value ? (
        <div className="space-y-2">
          <MediaView media={value} download={false} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="flex-1 py-2 rounded-xl text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60 active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploading ? 'Mengunggah…' : 'Ganti'}
            </button>
            <button
              type="button"
              onClick={() => { setError(null); onChange(null); }}
              className="px-3 py-2 rounded-xl text-sm font-semibold bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 active:scale-95 transition-all"
              aria-label="Hapus media"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full py-8 rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 active:scale-[0.98] transition-all flex flex-col items-center gap-2 disabled:opacity-60"
        >
          {uploading ? <Loader2 size={22} className="animate-spin text-emerald-500" /> : <Upload size={22} />}
          <span className="text-sm font-semibold">{uploading ? 'Mengunggah…' : 'Pilih Media'}</span>
          <span className="text-[11px] text-gray-400 dark:text-slate-500">Gambar (JPG/PNG/WebP) atau dokumen (PDF/Word/Excel)</span>
        </button>
      )}
      {error && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/wa-copy-media-wiring.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/components/wa-copy/admin/MediaUploadField.tsx tests/wa-copy-media-wiring.test.js
git commit -m "$(cat <<'EOF'
feat(wa-copy): MediaUploadField editable upload component

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Wire the media field into all three editors

**Files:**
- Modify: `src/components/wa-copy/admin/FaqEditor.tsx`
- Modify: `src/components/wa-copy/admin/CaptionEditor.tsx`
- Modify: `src/components/wa-copy/admin/TourLeaderEditor.tsx`
- Test: `tests/wa-copy-media-wiring.test.js` (append)

- [ ] **Step 1: Write the failing test** — append to `tests/wa-copy-media-wiring.test.js`:

```js
test('all three editors render MediaUploadField and include media in the draft', () => {
  const files = [
    'src/components/wa-copy/admin/FaqEditor.tsx',
    'src/components/wa-copy/admin/CaptionEditor.tsx',
    'src/components/wa-copy/admin/TourLeaderEditor.tsx',
  ];
  for (const f of files) {
    const src = read(f);
    assert.match(src, /import MediaUploadField from '\.\/MediaUploadField'/, `${f} missing import`);
    assert.match(src, /<MediaUploadField value=\{media\} onChange=\{setMedia\} \/>/, `${f} missing field`);
    assert.match(src, /initial\?\.media\?\.\[0\] \?\? null/, `${f} missing media state init`);
    assert.match(src, /media: media \? \[media\] : \[\]/, `${f} missing media in draft`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/wa-copy-media-wiring.test.js`
Expected: FAIL — FaqEditor missing import.

- [ ] **Step 3a: Edit `FaqEditor.tsx`**

1. Extend the types import to include `MediaAttachment`:
   ```ts
   import type { AgentFaqEntry, FaqCategory, MediaAttachment } from '../lib/types';
   ```
2. Add the component import beneath `import Toggle from './Toggle';`:
   ```ts
   import MediaUploadField from './MediaUploadField';
   ```
3. Add `media` to `FaqDraft`:
   ```ts
   export interface FaqDraft {
     category: FaqCategory;
     question: string;
     answer: string;
     active: boolean;
     media?: MediaAttachment[];
   }
   ```
4. Add state after the `active` state line:
   ```ts
   const [media, setMedia] = useState<MediaAttachment | null>(initial?.media?.[0] ?? null);
   ```
5. Include media in `handleSave`'s `onSave` call:
   ```ts
   onSave({ category, question: question.trim(), answer: answer.trim(), active, media: media ? [media] : [] });
   ```
6. Insert the field **immediately before** the Aktif toggle block (the `<div className="flex items-center justify-between … Aktif …">`):
   ```tsx
   <div>
     <label className={LABEL_CLASS}>Media (Opsional)</label>
     <MediaUploadField value={media} onChange={setMedia} />
   </div>
   ```

- [ ] **Step 3b: Edit `CaptionEditor.tsx`** — same six edits, adapted:

1. `import type { CaptionCategory, CaptionEntry, MediaAttachment } from '../lib/types';`
2. Add `import MediaUploadField from './MediaUploadField';` (beneath `import Toggle from './Toggle';`).
3. `CaptionDraft` gains `media?: MediaAttachment[];`.
4. State: `const [media, setMedia] = useState<MediaAttachment | null>(initial?.media?.[0] ?? null);`
5. `handleSave`: `onSave({ category, packageAware, template: template.trim(), active, media: media ? [media] : [] });`
6. Insert the same `<div>…<MediaUploadField value={media} onChange={setMedia} /></div>` block immediately before the Aktif toggle block.

- [ ] **Step 3c: Edit `TourLeaderEditor.tsx`** — same:

1. `import type { TourPhase, TourStep, MediaAttachment } from '../lib/types';`
2. Add `import MediaUploadField from './MediaUploadField';` (beneath `import Toggle from './Toggle';`).
3. `TourDraft` gains `media?: MediaAttachment[];`.
4. State: `const [media, setMedia] = useState<MediaAttachment | null>(initial?.media?.[0] ?? null);`
5. `handleSave`: `onSave({ phase, title: title.trim(), body: body.trim(), active, media: media ? [media] : [] });`
6. Insert the same `<div>…<MediaUploadField value={media} onChange={setMedia} /></div>` block immediately before the Aktif toggle block.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/wa-copy-media-wiring.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/components/wa-copy/admin/FaqEditor.tsx src/components/wa-copy/admin/CaptionEditor.tsx src/components/wa-copy/admin/TourLeaderEditor.tsx tests/wa-copy-media-wiring.test.js
git commit -m "$(cat <<'EOF'
feat(wa-copy): media upload field in FAQ/Caption/TourLeader editors

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Render media in the three consumer cards

**Files:**
- Modify: `src/components/wa-copy/tabs/faq/FaqAccordionItem.tsx`
- Modify: `src/components/wa-copy/tabs/caption/CaptionCard.tsx`
- Modify: `src/components/wa-copy/tabs/tourleader/TourStepCard.tsx`
- Test: `tests/wa-copy-media-wiring.test.js` (append)

- [ ] **Step 1: Write the failing test** — append to `tests/wa-copy-media-wiring.test.js`:

```js
test('all three consumer cards render MediaView from entry.media', () => {
  const files = [
    'src/components/wa-copy/tabs/faq/FaqAccordionItem.tsx',
    'src/components/wa-copy/tabs/caption/CaptionCard.tsx',
    'src/components/wa-copy/tabs/tourleader/TourStepCard.tsx',
  ];
  for (const f of files) {
    const src = read(f);
    assert.match(src, /import MediaView from '\.\.\/\.\.\/admin\/MediaView'/, `${f} missing import`);
    assert.match(src, /entry\.media\?\.\[0\]/, `${f} missing media guard`);
    assert.match(src, /<MediaView media=\{entry\.media\[0\]\} \/>/, `${f} missing MediaView`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/wa-copy-media-wiring.test.js`
Expected: FAIL — FaqAccordionItem missing import.

- [ ] **Step 3a: Edit `FaqAccordionItem.tsx`**

1. Add import beneath the existing type import (`import type { AgentFaqEntry } from '../../lib/types';`):
   ```ts
   import MediaView from '../../admin/MediaView';
   ```
2. The expanded body contains the answer block followed by the action buttons. Find the answer block:
   ```tsx
   <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900/40">
     <p className="text-[13px] leading-relaxed text-gray-600 dark:text-slate-300 whitespace-pre-wrap">{entry.answer}</p>
   </div>
   ```
   Insert **directly after** that closing `</div>` and **before** `<div className="mt-3 flex gap-2">`:
   ```tsx
   {entry.media?.[0] && (
     <div className="mt-3">
       <MediaView media={entry.media[0]} />
     </div>
   )}
   ```

- [ ] **Step 3b: Edit `CaptionCard.tsx`**

1. Add import beneath `import PreviewText from './PreviewText';`:
   ```ts
   import MediaView from '../../admin/MediaView';
   ```
2. Find the preview block:
   ```tsx
   <div className="p-4">
     <PreviewText template={entry.template} ctx={ctx} />
   </div>
   ```
   Insert **directly after** it and **before** `<div className="flex border-t …">`:
   ```tsx
   {entry.media?.[0] && (
     <div className="px-4 pb-4 -mt-1">
       <MediaView media={entry.media[0]} />
     </div>
   )}
   ```

- [ ] **Step 3c: Edit `TourStepCard.tsx`**

1. Add import beneath `import type { TourStep } from '../../lib/types';`:
   ```ts
   import MediaView from '../../admin/MediaView';
   ```
2. Find the Salin button (`{copied ? 'Tersalin' : 'Salin Langkah'}` then `</button>`). Insert **directly after** that `</button>`, still inside the `<div className="min-w-0 flex-1">` wrapper:
   ```tsx
   {entry.media?.[0] && (
     <div className="mt-3">
       <MediaView media={entry.media[0]} />
     </div>
   )}
   ```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/wa-copy-media-wiring.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/components/wa-copy/tabs/faq/FaqAccordionItem.tsx src/components/wa-copy/tabs/caption/CaptionCard.tsx src/components/wa-copy/tabs/tourleader/TourStepCard.tsx tests/wa-copy-media-wiring.test.js
git commit -m "$(cat <<'EOF'
feat(wa-copy): show attached media in FAQ/Caption/TourLeader cards

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Full verification (types, build, tests, manual smoke)

**Files:** none (verification only)

- [ ] **Step 1: Run the full media test suite**

Run: `node --test tests/wa-copy-media.test.js tests/wa-copy-media-wiring.test.js`
Expected: all PASS, 0 fail.

- [ ] **Step 2: Run the existing wa-copy tests (no regressions)**

Run: `node --test tests/wa-copy-admin-tabs.test.js tests/wa-copy-admin-back.test.js`
Expected: PASS (these read the same files you touched — confirm nothing broke).

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: Vite build succeeds, no type/import errors.

- [ ] **Step 5: Manual backend smoke (requires the server running + an admin token)**

Start the server (`npm start`) in one terminal. In another, with `$TOKEN` set to an admin JWT (copy from `localStorage` session in the browser, or your login flow):

```bash
# 1x1 PNG, base64 (no data: prefix)
PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
curl -s -X POST http://localhost:3000/api/admin/wa-copy/media \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"mime\":\"image/png\",\"name\":\"smoke.png\",\"data\":\"$PNG\"}"
```
Expected: `{"success":true,"url":"https://alhijaz.b-cdn.net/wa-copy/…","kind":"image",…}`. Open the URL — the image loads.

Negative checks:
- Omit the `Authorization` header → `401`.
- Use a **non-admin** token → `403`.
- Send `"mime":"image/gif"` → `400` with the "Format tidak didukung" message.

- [ ] **Step 6: Manual UI smoke**

In the app as an admin, go to `/dashboard/konten`. For each tab (FAQ, Caption, Tour Leader):
1. Add/edit an item, use **Pilih Media** to upload an image, then save.
2. Re-open the editor → the preview shows with **Ganti**/**Hapus**.
3. Switch to the agent-facing WA Copy view of that type → the media renders with an **Unduh** button that downloads/opens the file.
4. Repeat once with a **PDF** to confirm the file-chip rendering.
5. Toggle dark mode and confirm both the editor field and the card render correctly.

- [ ] **Step 7: Final commit (only if Steps 1–4 surfaced fixes)**

```bash
git branch --show-current
git add -A
git commit -m "$(cat <<'EOF'
chore(wa-copy): media upload verification fixes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review notes (for the implementer)

- **Spec coverage:** every spec section maps to a task — validator (T1), endpoint (T2), data model (T3), FE helpers (T4), `MediaView` (T5), `MediaUploadField` (T6), editor wiring (T7), consumer display (T8), verification incl. tsc/build/curl (T9).
- **Type consistency:** `MediaAttachment` fields `{url, kind, mime, name, size}` are used identically in `types.ts`, the endpoint response, `MediaUploadField.onChange`, and `MediaView`. `kind` is always `'image' | 'file'`. The endpoint's `{kind,mime,name,size,url}` response exactly matches what `MediaUploadField` reads.
- **Known limitations (carried from the spec):** content association still resets on reload (in-memory mock); orphaned Bunny files are not GC'd in V1; one attachment per item (array model allows multiple later).

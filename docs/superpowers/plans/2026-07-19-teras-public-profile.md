# Teras Public Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Klik pill mention / nama / avatar di Teras membuka `/teras/<slug>` — halaman profil ber-gate berisi identitas agent dan daftar kirimannya.

**Architecture:** Rute `/teras/<slug>` dibedakan dari link share `/teras/<8-hex>` lewat satu fungsi murni (`parseTerasPath`). Halaman dirender oleh `DashboardRouter` → `DashboardLayout` → `TerasPage` dengan prop `profileSlug`, jadi gate sesi, header, tema, dan navigasi client-side dipakai ulang. Data memakai endpoint yang sudah ada: `GET /api/community/feed?agent=<slug>` (satu query param baru) dan `GET /api/community/members` (tambah field `phone`).

**Tech Stack:** Express (server.js, ESM), React 18 + TypeScript + Vite, Tailwind, Supabase JS, `node:test` + `node:assert/strict`, Playwright untuk uji browser.

## Global Constraints

- Spec acuan: `docs/superpowers/specs/2026-07-19-teras-public-profile-design.md`. Baca sebelum mulai.
- **Tidak ada migrasi DDL** dan **tidak ada endpoint baru** di seluruh plan ini.
- Link share lama `/teras/<8-hex>` **tidak boleh rusak** — sudah beredar di WhatsApp.
- Semua teks yang dilihat user berbahasa Indonesia, mengikuti gaya yang sudah ada ("Gagal memuat kiriman Teras", "Agent tidak ditemukan di Teras", "Belum ada kiriman").
- Bahasa komentar kode: Inggris (ikut pola file sekitarnya). Komentar hanya untuk hal yang tidak terbaca dari kode.
- Kerja di branch `main` (pola repo ini). Jalankan `git branch --show-current` sebelum tiap commit; kalau bukan `main`, berhenti dan lapor.
- **Jangan `git add -A`.** Working tree punya WIP milik user (link-preview, mentions, PlyrVideo, videoPoster). Stage hanya file yang disebut task.
- `TerasPage.tsx` (3.763 baris) **tidak dipecah** dalam plan ini.
- Verifikasi akhir tiap task: `node --test tests/<file>` untuk uji task itu; verifikasi penuh di Task 7.

---

### Task 1: Modul rute Teras (murni)

**Files:**
- Create: `src/lib/terasRoutes.ts`
- Test: `tests/teras-routes.test.js`

**Interfaces:**
- Consumes: `isTerasShortCode` dari `lib/teras-share.js` (sudah ada, `/^[0-9a-f]{8}$/`).
- Produces:
  - `parseTerasPath(pathname: string): { kind: 'share'; code: string } | { kind: 'profile'; slug: string } | null`
  - `terasProfilePath(slug: string): string`

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/teras-routes.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTerasPath, terasProfilePath } from '../src/lib/terasRoutes.ts';

test('kode share 8-hex tetap dikenali sebagai share', () => {
  assert.deepEqual(parseTerasPath('/teras/9fc969b0'), { kind: 'share', code: '9fc969b0' });
  assert.deepEqual(parseTerasPath('/teras/9FC969B0'), { kind: 'share', code: '9fc969b0' });
});

test('slug agent biasa dikenali sebagai profil', () => {
  assert.deepEqual(parseTerasPath('/teras/nila'), { kind: 'profile', slug: 'nila' });
  assert.deepEqual(parseTerasPath('/teras/Nila/'), { kind: 'profile', slug: 'nila' });
  assert.deepEqual(parseTerasPath('/teras/agent-satu'), { kind: 'profile', slug: 'agent-satu' });
});

test('8 karakter yang bukan hex adalah profil, bukan share', () => {
  assert.deepEqual(parseTerasPath('/teras/nikitaaz'), { kind: 'profile', slug: 'nikitaaz' });
});

test('path yang bukan cabang teras mengembalikan null', () => {
  assert.equal(parseTerasPath('/'), null);
  assert.equal(parseTerasPath('/teras'), null);
  assert.equal(parseTerasPath('/teras/'), null);
  assert.equal(parseTerasPath('/dashboard/teras'), null);
  assert.equal(parseTerasPath('/teras/nila/extra'), null);
  assert.equal(parseTerasPath(''), null);
});

test('slug di-decode dan karakter ilegal ditolak', () => {
  assert.deepEqual(parseTerasPath('/teras/agent%2Dsatu'), { kind: 'profile', slug: 'agent-satu' });
  assert.equal(parseTerasPath('/teras/nila?x=1'), null);
  assert.equal(parseTerasPath('/teras/NILA_X'), null);
});

test('terasProfilePath membangun path profil', () => {
  assert.equal(terasProfilePath('nila'), '/teras/nila');
  assert.equal(terasProfilePath('Nila'), '/teras/nila');
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `node --test tests/teras-routes.test.js`
Expected: FAIL — `Cannot find module '../src/lib/terasRoutes.ts'`.

Catatan: `node --test` di repo ini bisa memuat `.ts` bila Node ≥ 22.6 dengan type-stripping. Jalankan `node --version` dulu. Kalau gagal karena TypeScript (bukan karena modul tidak ada), tulis modulnya sebagai `src/lib/terasRoutes.ts` **tanpa anotasi tipe di runtime-critical path tidak cukup** — sebagai gantinya jalankan uji dengan `node --experimental-strip-types --test tests/teras-routes.test.js` dan pakai perintah itu konsisten di semua step berikutnya, lalu catat perintahnya di header file uji sebagai komentar baris pertama.

- [ ] **Step 3: Implementasi**

Buat `src/lib/terasRoutes.ts`:

```ts
import { isTerasShortCode } from '../../lib/teras-share.js';

export type TerasRoute =
  | { kind: 'share'; code: string }
  | { kind: 'profile'; slug: string };

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Split the `/teras/*` branch into its two meanings. The share link
 * (`/teras/<8-hex>`, see lib/teras-share.js) predates the profile page and is
 * already circulating in WhatsApp, so it wins whenever the segment has that
 * exact shape.
 */
export function parseTerasPath(pathname: string): TerasRoute | null {
  const segments = String(pathname || '')
    .split('/')
    .filter(Boolean);
  if (segments.length !== 2 || segments[0] !== 'teras') return null;

  let raw: string;
  try {
    raw = decodeURIComponent(segments[1]).trim().toLowerCase();
  } catch {
    return null;
  }
  if (!raw) return null;
  if (isTerasShortCode(raw)) return { kind: 'share', code: raw };
  if (!SLUG_REGEX.test(raw)) return null;
  return { kind: 'profile', slug: raw };
}

/** Path of an agent's Teras profile, e.g. "/teras/nila". */
export function terasProfilePath(slug: string): string {
  return `/teras/${String(slug || '').trim().toLowerCase()}`;
}
```

- [ ] **Step 4: Jalankan uji, pastikan lulus**

Run: `node --test tests/teras-routes.test.js`
Expected: PASS, 6 test.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # harus "main"
git add src/lib/terasRoutes.ts tests/teras-routes.test.js
git commit -m "feat(teras): modul rute profil /teras/<slug>"
```

---

### Task 2: Slug terpesan — `teras` dan slug berbentuk 8-hex

**Files:**
- Create: `lib/agent-slug.js`
- Create: `lib/agent-slug.d.ts`
- Modify: `server.js:192` (`RESERVED_SPA_SLUGS`), `server.js:2615` + `server.js:2638` (registrasi), `server.js:3161` + `server.js:3162` (ubah username)
- Test: `tests/agent-slug.test.js`

**Interfaces:**
- Consumes: `isTerasShortCode` dari `lib/teras-share.js`.
- Produces: `isReservedAgentSlug(slug: string): boolean` — dipakai kedua call-site validasi slug di `server.js`.

Alasan: aturan slug saat ini disalin dua kali di `server.js` sebagai array literal. Menambah aturan ketiga (8-hex) ke dua tempat berbeda adalah cara membuat keduanya menyimpang. Satu modul murni + dua pemanggilan.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/agent-slug.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isReservedAgentSlug } from '../lib/agent-slug.js';

const rootPath = new URL('..', import.meta.url).pathname;
const read = path => readFileSync(join(rootPath, path), 'utf8');

test('slug rute inti tetap terpesan', () => {
  for (const slug of ['admin', 'login', 'register', 'dashboard', 'api', 'compare', 'reset-password', 'f']) {
    assert.equal(isReservedAgentSlug(slug), true, `${slug} harus terpesan`);
  }
});

test('teras terpesan supaya tidak menabrak cabang /teras/*', () => {
  assert.equal(isReservedAgentSlug('teras'), true);
  assert.equal(isReservedAgentSlug('TERAS'), true);
});

test('slug berbentuk 8-hex terpesan supaya tidak tertukar dengan kode share', () => {
  assert.equal(isReservedAgentSlug('abcdefab'), true);
  assert.equal(isReservedAgentSlug('9fc969b0'), true);
  assert.equal(isReservedAgentSlug('deadbeef'), true);
});

test('slug agent normal tidak terpesan', () => {
  for (const slug of ['nila', 'nikita', 'agent-satu', 'abcdefa', 'abcdefabc', 'nikitaaz']) {
    assert.equal(isReservedAgentSlug(slug), false, `${slug} harus boleh`);
  }
});

test('server memakai isReservedAgentSlug di kedua jalur validasi slug', () => {
  const server = read('server.js');
  assert.match(server, /import \{ isReservedAgentSlug \} from '\.\/lib\/agent-slug\.js';/);
  const uses = server.match(/isReservedAgentSlug\(/g) || [];
  assert.ok(uses.length >= 2, `harus dipakai di registrasi dan ubah-username, ditemukan ${uses.length}`);
  assert.doesNotMatch(server, /const RESERVED_SLUGS = \[/);
});

test('teras masuk RESERVED_SPA_SLUGS supaya server tidak inject OG agent', () => {
  const server = read('server.js');
  assert.match(server, /const RESERVED_SPA_SLUGS = new Set\(\[[^\]]*'teras'/);
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `node --test tests/agent-slug.test.js`
Expected: FAIL — `Cannot find module '../lib/agent-slug.js'`.

- [ ] **Step 3: Implementasi modul**

Buat `lib/agent-slug.js`:

```js
/**
 * Slugs an agent may not claim.
 *
 * Beyond the app's own top-level routes, two Teras rules apply:
 * `teras` owns a whole path branch (/teras/<slug> profiles, /teras/<code>
 * share links), and any 8-char hex slug would be indistinguishable from a
 * Teras share code (see lib/teras-share.js) and so unreachable as a profile.
 */
import { isTerasShortCode } from './teras-share.js';

const RESERVED_EXACT = new Set([
  'admin',
  'login',
  'register',
  'dashboard',
  'api',
  'compare',
  'reset-password',
  'f',
  'teras',
]);

export function isReservedAgentSlug(slug) {
  const value = String(slug || '').trim().toLowerCase();
  if (!value) return true;
  if (RESERVED_EXACT.has(value)) return true;
  return isTerasShortCode(value);
}
```

Buat `lib/agent-slug.d.ts`:

```ts
export declare function isReservedAgentSlug(slug: string): boolean;
```

- [ ] **Step 4: Pasang di server.js**

1. Tambahkan import di blok import atas (dekat `import { ... } from './email-alias.js';` di `server.js:26`):

```js
import { isReservedAgentSlug } from './lib/agent-slug.js';
```

2. `server.js:192` — tambahkan `'teras'` ke set:

```js
const RESERVED_SPA_SLUGS = new Set(['', 'login', 'register', 'dashboard', 'admin', 'compare', 'reset-password', 'f', 'top-partner', 'rahmah-1-juli-2026', 'teras']);
```

3. `server.js:2615` — hapus baris `const RESERVED_SLUGS = [...]` (deklarasi modul-level sebelum `app.post('/api/auth/register')`).

4. `server.js:2638` — ganti kondisi jadi:

```js
  if (isReservedAgentSlug(cleanedSlug) || RESERVED_EMAIL_LOCAL_PARTS.includes(cleanedSlug)) {
```

5. `server.js:3161` — hapus baris `const RESERVED_SLUGS = [...]` di dalam handler ubah-username.

6. `server.js:3162` — ganti kondisi jadi:

```js
    if (isReservedAgentSlug(cleanSlug) || RESERVED_EMAIL_LOCAL_PARTS.includes(cleanSlug)) {
```

- [ ] **Step 5: Jalankan uji, pastikan lulus**

Run: `node --test tests/agent-slug.test.js`
Expected: PASS, 6 test.

- [ ] **Step 6: Cek slug 8-hex yang terlanjur ada**

Run: `grep -rn "isReservedAgentSlug" server.js` untuk memastikan hanya 2 pemanggilan + 1 import.

Lalu laporkan ke user (JANGAN ubah data): aturan baru hanya berlaku untuk slug **baru**; agent yang sudah punya slug 8-hex (kalau ada) profilnya tidak akan bisa dibuka. Tulis kalimat ini di ringkasan task; user yang memutuskan.

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # harus "main"
git add lib/agent-slug.js lib/agent-slug.d.ts tests/agent-slug.test.js server.js
git commit -m "feat(teras): pesan slug 'teras' dan slug berbentuk kode share"
```

---

### Task 3: Server — filter `?agent=` di feed dan `phone` di members

**Files:**
- Modify: `server.js:4002` (`loadCommunityMembers` select), `server.js:4558`–`4570` (`/api/community/members` payload), `server.js:4682`+ (`/api/community/feed`)
- Test: `tests/community-profile-feed.test.js`

**Interfaces:**
- Consumes: `loadCommunityMembers()`, `requireCommunityAccess`, `buildPostsQuery` (lokal di handler feed).
- Produces:
  - `GET /api/community/feed?agent=<slug>` → hanya post milik agent itu; slug bukan anggota Teras → `404 { error: 'Agent tidak ditemukan di Teras' }`.
  - `GET /api/community/members` → `[{slug, name, photo, phone}]`.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/community-profile-feed.test.js` (pola source-assertion seperti `tests/bio-custom-domain-routing.test.js`, karena handler ini inline di `server.js` dan tidak bisa di-import):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootPath = new URL('..', import.meta.url).pathname;
const read = path => readFileSync(join(rootPath, path), 'utf8');

function feedHandler(server) {
  const start = server.indexOf("app.get('/api/community/feed'");
  assert.ok(start > 0, 'handler feed harus ada');
  const end = server.indexOf("app.get('/api/community/posts/:id'", start);
  assert.ok(end > start, 'batas akhir handler feed harus ketemu');
  return server.slice(start, end);
}

test('feed menerima query agent dan memfilter per agent_id', () => {
  const handler = feedHandler(read('server.js'));
  assert.match(handler, /req\.query\.agent/);
  assert.match(handler, /loadCommunityMembers\(\)/);
  assert.match(handler, /\.eq\('agent_id', profileMember\.id\)/);
});

test('slug bukan anggota Teras dijawab 404 dengan pesan Indonesia', () => {
  const handler = feedHandler(read('server.js'));
  assert.match(handler, /res\.status\(404\)\.json\(\{ error: 'Agent tidak ditemukan di Teras' \}\)/);
});

test('feed tanpa query agent tetap memakai jalur lama (tanpa filter)', () => {
  const handler = feedHandler(read('server.js'));
  // Filter hanya dipasang ketika profileMember ada.
  assert.match(handler, /if \(profileMember\) \{\s*query = query\.eq\('agent_id', profileMember\.id\);/);
});

test('members mengembalikan phone untuk tombol WhatsApp', () => {
  const server = read('server.js');
  assert.match(server, /\.select\('id, slug, name, photo, phone, telegram_chat_id, notification_prefs'\)/);
  const start = server.indexOf("app.get('/api/community/members'");
  const handler = server.slice(start, start + 1200);
  assert.match(handler, /phone: m\.phone \|\| null/);
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `node --test tests/community-profile-feed.test.js`
Expected: FAIL pada keempat test (belum ada `req.query.agent`, belum ada `phone`).

- [ ] **Step 3: Tambah `phone` ke members**

`server.js:4002` — tambahkan kolom:

```js
    .select('id, slug, name, photo, phone, telegram_chat_id, notification_prefs')
```

`server.js` handler `/api/community/members` — ubah map payload:

```js
      .map(m => ({ slug: m.slug, name: m.name, photo: m.photo || null, phone: m.phone || null }));
```

- [ ] **Step 4: Tambah filter `?agent=` ke feed**

Di handler `app.get('/api/community/feed', ...)`, tepat setelah blok validasi cursor `before` dan sebelum `const buildPostsQuery = ...`, sisipkan:

```js
    // Mode profil: /teras/<slug> memakai feed yang sama, difilter satu agent.
    const profileSlug = typeof req.query.agent === 'string'
      ? req.query.agent.trim().toLowerCase()
      : '';
    let profileMember = null;
    if (profileSlug) {
      const members = await loadCommunityMembers();
      profileMember = members.find(m => String(m.slug || '').toLowerCase() === profileSlug) || null;
      if (!profileMember) {
        return res.status(404).json({ error: 'Agent tidak ditemukan di Teras' });
      }
    }
```

Lalu di dalam `buildPostsQuery`, setelah `.is('deleted_at', null)` dan sebelum blok kursor `before`, tambahkan:

```js
      if (profileMember) {
        query = query.eq('agent_id', profileMember.id);
      }
```

(`query` sudah `let`, jadi penugasan ulang aman. Jangan sentuh urutan `.order` maupun `.limit(20)`.)

- [ ] **Step 5: Jalankan uji, pastikan lulus**

Run: `node --test tests/community-profile-feed.test.js`
Expected: PASS, 4 test.

- [ ] **Step 6: Sanity-check sintaks server**

Run: `node --check server.js`
Expected: tidak ada output (exit 0).

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # harus "main"
git add server.js tests/community-profile-feed.test.js
git commit -m "feat(teras): filter feed per agent dan phone di daftar anggota"
```

---

### Task 4: Routing klien — `/teras/<slug>` masuk ke DashboardRouter

**Files:**
- Modify: `src/main.tsx:200-201` (deteksi `isTerasShare`), `src/main.tsx:267-272` (`LoginRouter` allowlist), `src/main.tsx:418-431` (cabang render)
- Modify: `src/components/DashboardLayout.tsx:147-155` (parsing path), `DashboardLayout.tsx:363`+ (state), `DashboardLayout.tsx:511` (title), `DashboardLayout.tsx:604-612` (tombol back), `DashboardLayout.tsx:841-851` (render `TerasPage`)
- Test: `tests/teras-profile-routing.test.js`

**Interfaces:**
- Consumes: `parseTerasPath`, `terasProfilePath` (Task 1).
- Produces: `TerasPage` menerima prop baru `profileSlug: string | null` (dipakai Task 5). Nilai berasal dari URL, sudah lowercase.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/teras-profile-routing.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootPath = new URL('..', import.meta.url).pathname;
const read = path => readFileSync(join(rootPath, path), 'utf8');

test('main.tsx memilah cabang /teras lewat parseTerasPath', () => {
  const main = read('src/main.tsx');
  assert.match(main, /import \{ parseTerasPath \} from '\.\/lib\/terasRoutes'/);
  assert.match(main, /parseTerasPath\(window\.location\.pathname\)/);
  // Share link lama tetap redirect ke post detail.
  assert.match(main, /\/dashboard\/teras\/post\/\$\{encodeURIComponent\(terasShareCode\)\}/);
  // Profil dirender oleh DashboardRouter, bukan halaman terpisah.
  assert.match(main, /if \(isDashboard \|\| isTerasProfile\) return <DashboardRouter \/>/);
});

test('LoginRouter menerima tujuan profil Teras, bukan string sembarang', () => {
  const main = read('src/main.tsx');
  assert.match(main, /parseTerasPath\(stored\)\?\.kind === 'profile'/);
  assert.match(main, /stored\.startsWith\('\/dashboard\/teras\/post\/'\)/);
});

test('DashboardLayout memetakan /teras/<slug> ke tab teras dengan profileSlug', () => {
  const layout = read('src/components/DashboardLayout.tsx');
  assert.match(layout, /function getTerasProfileSlugFromPath\(\): string \| null/);
  assert.match(layout, /profileSlug=\{terasProfileSlug\}/);
  // Tab aktif untuk /teras/<slug> adalah 'teras'.
  assert.match(layout, /if \(parseTerasPath\(window\.location\.pathname\)\?\.kind === 'profile'\) return 'teras';/);
});

test('tombol back dari profil kembali ke feed Teras', () => {
  const layout = read('src/components/DashboardLayout.tsx');
  assert.match(layout, /navigatePath\('\/dashboard\/teras'/);
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `node --test tests/teras-profile-routing.test.js`
Expected: FAIL, 4 test.

- [ ] **Step 3: Ubah `src/main.tsx`**

1. Tambah import di dekat import routing lain (di atas blok `const segments = ...`, `src/main.tsx:193`):

```ts
import { parseTerasPath } from './lib/terasRoutes'
```

2. Ganti dua baris deteksi share (`src/main.tsx:200-201`) menjadi:

```ts
// "/teras/<code>" = link share post (lama); "/teras/<slug>" = profil agent.
const terasRoute = parseTerasPath(window.location.pathname)
const isTerasShare = terasRoute?.kind === 'share'
const terasShareCode = terasRoute?.kind === 'share' ? terasRoute.code : null
const isTerasProfile = terasRoute?.kind === 'profile'
```

3. Di `LoginRouter` (`src/main.tsx:267-272`), ganti penentuan `next`:

```ts
    let next = '/dashboard'
    try {
      const stored = sessionStorage.getItem('teras_share_next')
      sessionStorage.removeItem('teras_share_next')
      if (stored && (stored.startsWith('/dashboard/teras/post/') || parseTerasPath(stored)?.kind === 'profile')) {
        next = stored
      }
    } catch { /* ignore */ }
```

4. Di `DashboardRouter`, sebelum `window.location.href = '/login'` saat `!session`, simpan tujuan supaya profil tidak buntu:

```ts
  if (!session) {
    try {
      if (parseTerasPath(window.location.pathname)?.kind === 'profile') {
        sessionStorage.setItem('teras_share_next', window.location.pathname)
      }
    } catch { /* ignore */ }
    window.location.href = '/login'
    return null
  }
```

5. Di blok `const page = (() => { ... })()` (`src/main.tsx:418`+), ganti baris `if (isDashboard) return <DashboardRouter />` menjadi:

```ts
      if (isDashboard || isTerasProfile) return <DashboardRouter />
```

Cabang `isTerasShare` yang sudah ada tetap di atasnya, tak berubah.

- [ ] **Step 4: Ubah `src/components/DashboardLayout.tsx`**

1. Import di blok import atas:

```ts
import { parseTerasPath } from '../lib/terasRoutes';
```

2. Di `getTabFromPath()` (fungsi yang berakhir `return 'home'` di sekitar `DashboardLayout.tsx:144`), tambahkan sebelum `return 'home'`:

```ts
  if (parseTerasPath(window.location.pathname)?.kind === 'profile') return 'teras';
```

3. Tambah fungsi baru tepat di bawah `getTerasPostIdFromPath()`:

```ts
function getTerasProfileSlugFromPath(): string | null {
  const route = parseTerasPath(window.location.pathname);
  return route?.kind === 'profile' ? route.slug : null;
}
```

4. Di badan komponen, di dekat `const terasPostId = ...` (`DashboardLayout.tsx:596`), tambahkan:

```ts
    const terasProfileSlug = activeTab === 'teras' ? getTerasProfileSlugFromPath() : null;
```

5. Tombol back (`DashboardLayout.tsx:604-612`): perlakukan profil sama seperti post detail — label "Kembali ke Teras", dan aksinya:

```ts
                if (terasPostId || terasProfileSlug) {
                  if (window.history.state?.terasFromFeed) window.history.back();
                  else navigatePath('/dashboard/teras', { replace: true });
```

(Ganti kondisi `if (terasPostId)` yang ada menjadi `if (terasPostId || terasProfileSlug)` di kedua tempat: baris ~604-612 dan ~687. Label `aria-label`/`title` juga pakai kondisi gabungan itu.)

6. `document.title` (`DashboardLayout.tsx:511`): tambahkan `|| terasProfileSlug` pada kondisi yang sudah ada sehingga judul mode profil bukan judul feed. Gunakan `'Teras'` sebagai judul (nama agent diisi oleh `TerasPage` di Task 5 lewat `document.title` setelah profil termuat — jangan duplikasi fetch di sini).

7. Render `TerasPage` (`DashboardLayout.tsx:841-851`): tambahkan prop:

```tsx
              postId={terasPostId}
              profileSlug={terasProfileSlug}
              onNavigate={navigatePath}
```

- [ ] **Step 5: Tambah prop di TerasPage (sekadar diterima, belum dipakai)**

`src/components/TerasPage.tsx:886-894` — tambahkan prop ke signature:

```tsx
export default function TerasPage({
  agent,
  postId,
  profileSlug,
  onNavigate,
}: {
  agent: TerasAgent;
  postId: string | null;
  profileSlug?: string | null;
  onNavigate: (path: string, opts?: { replace?: boolean; state?: Record<string, unknown> }) => void;
}) {
```

Belum ada perubahan perilaku di task ini — Task 5 yang memakainya. Supaya lint tidak mengeluh soal variabel tak terpakai, biarkan Task 5 menyusul segera; kalau `tsc` mengeluh di step berikut, tandai dengan pemakaian nyata dari Task 5 (jangan tambah `void profileSlug` sebagai penambal).

- [ ] **Step 6: Jalankan uji + typecheck**

Run: `node --test tests/teras-profile-routing.test.js`
Expected: PASS, 4 test.

Run: `npx tsc --noEmit`
Expected: tidak ada error baru dibanding baseline. (Jalankan `npx tsc --noEmit` di commit sebelum perubahan bila perlu membandingkan.)

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # harus "main"
git add src/main.tsx src/components/DashboardLayout.tsx src/components/TerasPage.tsx tests/teras-profile-routing.test.js
git commit -m "feat(teras): rute /teras/<slug> masuk ke shell dashboard"
```

---

### Task 5: Mode profil di TerasPage — header + feed terfilter

**Files:**
- Create: `src/components/TerasProfileHeader.tsx`
- Modify: `src/components/TerasPage.tsx` (fetch feed, composer, pil kiriman baru, render header, state profil)
- Test: `tests/teras-profile-page.test.js`

**Interfaces:**
- Consumes: prop `profileSlug` (Task 4), `GET /api/community/feed?agent=<slug>` dan `phone` di `/members` (Task 3), `MentionMember` dari `src/lib/communityMentions`.
- Produces: komponen `TerasProfileHeader({ member, postCountLabel })` — dipakai hanya oleh `TerasPage`.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/teras-profile-page.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootPath = new URL('..', import.meta.url).pathname;
const read = path => readFileSync(join(rootPath, path), 'utf8');

test('header profil menampilkan nama, slug, dan WhatsApp hanya bila ada nomor', () => {
  const header = read('src/components/TerasProfileHeader.tsx');
  assert.match(header, /@\{member\.slug\}/);
  assert.match(header, /member\.phone \?/);
  assert.match(header, /https:\/\/wa\.me\//);
});

test('feed mode profil memakai query agent', () => {
  const page = read('src/components/TerasPage.tsx');
  assert.match(page, /params\.set\('agent', profileSlug\)/);
});

test('composer dan pil kiriman baru disembunyikan di mode profil', () => {
  const page = read('src/components/TerasPage.tsx');
  assert.match(page, /!profileSlug && /);
  assert.match(page, /hasNewPosts && !profileSlug/);
});

test('mode profil punya pesan kosong dan agent tidak ditemukan', () => {
  const page = read('src/components/TerasPage.tsx');
  assert.match(page, /Belum ada kiriman/);
  assert.match(page, /Agent tidak ditemukan di Teras/);
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `node --test tests/teras-profile-page.test.js`
Expected: FAIL, 4 test.

- [ ] **Step 3: Tambah `phone` ke tipe `MentionMember`**

`src/lib/communityMentions.ts:7-11` — daftar anggota kini membawa nomor WhatsApp (Task 3):

```ts
export interface MentionMember {
  slug: string;
  name: string;
  photo: string | null;
  phone?: string | null;
}
```

Field opsional, jadi tidak ada pemanggil yang rusak.

- [ ] **Step 4: Buat `src/components/TerasProfileHeader.tsx`**

```tsx
import type { MentionMember } from '../lib/communityMentions';

/**
 * Identity card at the top of /teras/<slug>. Kept separate from TerasPage so
 * the profile chrome stays readable next to the feed logic.
 */
export function TerasProfileHeader({
  member,
  postCountLabel,
}: {
  member: MentionMember;
  postCountLabel: string | null;
}) {
  const initials = (member.name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0] || '')
    .join('')
    .toUpperCase();

  return (
    <section className="mb-3 flex items-center gap-4 border-b border-gray-100 bg-white px-4 py-5 dark:border-slate-800 dark:bg-slate-900">
      {member.photo ? (
        <img
          src={member.photo}
          alt={member.name}
          className="h-20 w-20 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xl font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          {initials}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-bold text-gray-900 dark:text-white">{member.name}</h1>
        <p className="truncate text-sm text-gray-500 dark:text-slate-400">@{member.slug}</p>
        {postCountLabel ? (
          <p className="mt-0.5 text-[13px] text-gray-400 dark:text-slate-500">{postCountLabel}</p>
        ) : null}
        {member.phone ? (
          <a
            href={`https://wa.me/${member.phone.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3.5 py-1.5 text-[13px] font-semibold text-white transition hover:bg-emerald-600"
          >
            WhatsApp
          </a>
        ) : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Pasang mode profil di `TerasPage.tsx`**

1. Import di blok import atas:

```tsx
import { TerasProfileHeader } from './TerasProfileHeader';
```

2. `fetchFeed` (`TerasPage.tsx:1206`+) — tambahkan query param setelah `if (before) params.set('before', before);`:

```tsx
      if (profileSlug) params.set('agent', profileSlug);
```

Lalu tambahkan `profileSlug` ke dependency array `useCallback` di akhir `fetchFeed` (`}, [showToast]` → `}, [profileSlug, showToast]`). Karena `refreshFeed` bergantung pada `fetchFeed` dan `useEffect` bergantung pada `refreshFeed`, pindah antar-profil otomatis memuat ulang.

3. State anggota profil — di dekat `const [mentionMembers, setMentionMembers] = useState<MentionMember[]>([])` (`TerasPage.tsx:909`), daftar anggota sudah diambil untuk autocomplete. Pakai daftar itu; jangan fetch kedua kali:

```tsx
  const profileMember = profileSlug
    ? mentionMembers.find(member => member.slug === profileSlug) || null
    : null;
```

4. Render, di dalam `<main>`/kontainer daftar post, sebelum daftar:

```tsx
      {profileSlug && profileMember ? (
        <TerasProfileHeader member={profileMember} postCountLabel={null} />
      ) : null}
```

5. Composer trigger + composer sheet: bungkus render-nya dengan `!profileSlug && (...)`.

6. Pil "kiriman baru": ubah kondisinya dari `hasNewPosts` menjadi `hasNewPosts && !profileSlug`. Polling `checkForNewPosts` juga di-skip: tambahkan `if (profileSlug) return;` di awal fungsi itu.

7. Keadaan kosong dan tidak ditemukan, di tempat daftar kosong dirender:

```tsx
      {profileSlug && !loading && !error && posts.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-gray-500 dark:text-slate-400">Belum ada kiriman</p>
      ) : null}
```

Server menjawab 404 dengan pesan `'Agent tidak ditemukan di Teras'`; `requestJson` sudah melempar pesan error dari server, jadi pesan itu muncul lewat jalur `setError` yang ada. Pastikan di mode profil error ditampilkan sebagai layar penuh (jalur `setError`), bukan toast — yaitu kondisi `postsRef.current.length > 0` tidak terpenuhi saat profil pertama dimuat, jadi perilaku bawaan sudah benar; jangan tambah cabang baru.

8. Judul dokumen: di `useEffect` yang sudah ada atau tambahkan yang baru:

```tsx
  useEffect(() => {
    if (profileSlug && profileMember) document.title = `${profileMember.name} — Teras`;
  }, [profileMember, profileSlug]);
```

- [ ] **Step 6: Jalankan uji + typecheck**

Run: `node --test tests/teras-profile-page.test.js`
Expected: PASS, 4 test.

Run: `npx tsc --noEmit`
Expected: tidak ada error.

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # harus "main"
git add src/components/TerasProfileHeader.tsx src/components/TerasPage.tsx src/lib/communityMentions.ts tests/teras-profile-page.test.js
git commit -m "feat(teras): mode profil di TerasPage"
```

---

### Task 6: Tautan — pill mention, penulis post, penulis komentar

**Files:**
- Modify: `src/components/MentionText.tsx` (pill jadi tautan)
- Modify: `src/components/TerasPage.tsx:3241` (avatar+nama penulis post), `:3479-3484` (penulis komentar), `:3279` & `:3504` (pemanggilan `MentionText`)
- Test: `tests/teras-profile-links.test.js`

**Interfaces:**
- Consumes: `terasProfilePath` (Task 1), prop `onNavigate` yang sudah ada di `TerasPage`.
- Produces: `MentionText` menerima prop opsional `onOpenProfile?: (slug: string) => void`. Tanpa prop itu, pill tetap `<span>` seperti sekarang (tidak ada pemanggil lain yang rusak).

- [ ] **Step 1: Tulis uji yang gagal**

Buat `tests/teras-profile-links.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootPath = new URL('..', import.meta.url).pathname;
const read = path => readFileSync(join(rootPath, path), 'utf8');

test('pill mention jadi tautan ke profil saat onOpenProfile diberikan', () => {
  const mention = read('src/components/MentionText.tsx');
  assert.match(mention, /onOpenProfile\?: \(slug: string\) => void/);
  assert.match(mention, /terasProfilePath\(segment\.slug\)/);
  assert.match(mention, /event\.preventDefault\(\)/);
  assert.match(mention, /event\.stopPropagation\(\)/);
});

test('TerasPage meneruskan onOpenProfile ke setiap MentionText', () => {
  const page = read('src/components/TerasPage.tsx');
  const uses = page.match(/<MentionText\b/g) || [];
  const wired = page.match(/onOpenProfile=\{openProfile\}/g) || [];
  assert.equal(wired.length, uses.length, 'semua MentionText harus diberi onOpenProfile');
});

test('nama dan avatar penulis post/komentar menautkan ke profil', () => {
  const page = read('src/components/TerasPage.tsx');
  assert.match(page, /const openProfile = useCallback\(/);
  assert.match(page, /terasProfilePath\(/);
  // Post sistem tidak jadi tautan.
  assert.match(page, /post\.is_system/);
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `node --test tests/teras-profile-links.test.js`
Expected: FAIL, 3 test.

- [ ] **Step 3: Ubah `src/components/MentionText.tsx`**

```tsx
import { toMentionSegments, type MentionMember } from '../lib/communityMentions';
import { terasProfilePath } from '../lib/terasRoutes';

/**
 * Render a post/comment body with `@slug` tokens shown as pills of the member's
 * current display name. Falls back to the raw string when there are no mentions,
 * so callers can drop it in wherever `{body}` was rendered.
 *
 * With `onOpenProfile`, each pill becomes a link to the member's Teras profile;
 * without it the pill stays inert (the pre-profile behaviour).
 */
export function MentionText({
  body,
  memberBySlug,
  onOpenProfile,
}: {
  body: string;
  memberBySlug: Map<string, MentionMember>;
  onOpenProfile?: (slug: string) => void;
}) {
  const segments = toMentionSegments(body, memberBySlug);
  if (!segments.some(segment => segment.type === 'mention')) return <>{body}</>;
  return (
    <>
      {segments.map((segment, index) => {
        if (segment.type !== 'mention') return <span key={index}>{segment.value}</span>;
        const className = 'font-semibold text-emerald-600 dark:text-emerald-400';
        if (!onOpenProfile) {
          return (
            <span key={index} className={className}>
              @{segment.name}
            </span>
          );
        }
        return (
          <a
            key={index}
            href={terasProfilePath(segment.slug)}
            className={`${className} hover:underline`}
            onClick={event => {
              // Klik di dalam kartu post juga membuka detail post; jangan dua-duanya.
              event.preventDefault();
              event.stopPropagation();
              onOpenProfile(segment.slug);
            }}
          >
            @{segment.name}
          </a>
        );
      })}
    </>
  );
}
```

- [ ] **Step 4: Pasang tautan di `TerasPage.tsx`**

1. Import:

```tsx
import { terasProfilePath } from '../lib/terasRoutes';
```

2. Handler navigasi, di dekat callback lain di badan komponen:

```tsx
  const openProfile = useCallback((slug: string) => {
    if (!slug) return;
    onNavigate(terasProfilePath(slug), { state: { terasFromFeed: true } });
  }, [onNavigate]);
```

3. Kedua pemanggilan `<MentionText ... />` (`TerasPage.tsx:3279` dan `:3504`) diberi `onOpenProfile={openProfile}`.

4. Penulis post (`TerasPage.tsx:3241` area) — bungkus avatar + nama dengan tautan, kecuali post sistem atau slug kosong:

```tsx
                    {post.is_system || !post.author.slug ? (
                      <AgentAvatar name={authorName} photo={post.author.photo} />
                    ) : (
                      <a
                        href={terasProfilePath(post.author.slug)}
                        onClick={event => {
                          event.preventDefault();
                          event.stopPropagation();
                          openProfile(post.author.slug);
                        }}
                        aria-label={`Lihat profil ${authorName}`}
                      >
                        <AgentAvatar name={authorName} photo={post.author.photo} />
                      </a>
                    )}
```

Terapkan pembungkus yang sama pada elemen nama penulis post (teks `authorName` di header kartu).

5. Penulis komentar (`TerasPage.tsx:3479` dan `:3484`) — pola identik dengan `comment.author.slug` dan `comment.author.name || 'Agent'`; komentar tidak punya `is_system`, jadi syaratnya cukup `!comment.author.slug`.

- [ ] **Step 5: Jalankan uji + typecheck + build**

Run: `node --test tests/teras-profile-links.test.js`
Expected: PASS, 3 test.

Run: `npx tsc --noEmit`
Expected: tidak ada error.

Run: `npx vite build`
Expected: build sukses.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # harus "main"
git add src/components/MentionText.tsx src/components/TerasPage.tsx tests/teras-profile-links.test.js
git commit -m "feat(teras): pill mention dan penulis menautkan ke profil"
```

---

### Task 7: Uji browser end-to-end + verifikasi penuh

**Files:**
- Create: `tests/teras-profile.browser.test.js`
- Test: seluruh suite

**Interfaces:**
- Consumes: semua task sebelumnya.
- Produces: bukti bahwa klik pill mention mendarat di profil dengan header dan tanpa composer.

- [ ] **Step 1: Baca pola uji browser yang ada**

Run: `sed -n 1,140p tests/teras-page.browser.test.js`

Uji browser di repo ini menyalakan Vite dev server, meng-stub `fetch` API di dalam halaman, lalu memakai Playwright. Uji baru **harus** mengikuti pola stub yang sama (termasuk `makeAgent`, stub `/api/community/feed`, `/api/community/members`) — jangan menyentuh database.

- [ ] **Step 2: Tulis uji browser**

Buat `tests/teras-profile.browser.test.js` dengan kerangka yang sama seperti `tests/teras-page.browser.test.js` (import, `before`/`after`, `viteServer`, `browser`, `appOrigin`), dan tiga kasus:

1. Buka `/dashboard/teras` dengan satu post yang body-nya `'halo @nila'` dan `/api/community/members` berisi `{slug:'nila', name:'Nila Test', photo:null, phone:'628123456789'}`. Klik pill `@Nila Test`. Assert: `window.location.pathname === '/teras/nila'`.
2. Setelah mendarat, assert header profil: teks `Nila Test` dan `@nila` terlihat, tautan `a[href^="https://wa.me/"]` ada.
3. Assert composer **tidak** ada: `page.getByRole('button', { name: 'Buat kiriman baru' })` tidak terlihat, dan stub feed terakhir dipanggil dengan query `agent=nila` (catat URL yang di-fetch di dalam stub, lalu baca lewat `page.evaluate`).

Stub `/api/community/feed`: bila URL mengandung `agent=nila`, kembalikan hanya post milik Nila; selain itu feed umum.

- [ ] **Step 3: Jalankan uji browser**

Run: `node --test tests/teras-profile.browser.test.js`
Expected: PASS, 3 test. (Kalau Playwright belum punya browser: `npx playwright install chromium`.)

- [ ] **Step 4: Verifikasi penuh**

Run: `node --test tests/` (atau perintah suite yang dipakai repo — cek `package.json` scripts lebih dulu dengan `sed -n '/"scripts"/,/}/p' package.json`)
Expected: tidak ada kegagalan **baru** dibanding baseline. Catat baseline dulu dengan `git stash` bila perlu — jangan mengklaim hijau tanpa membandingkan.

Run: `npx tsc --noEmit`
Expected: bersih.

Run: `npx vite build`
Expected: sukses.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # harus "main"
git add tests/teras-profile.browser.test.js
git commit -m "test(teras): uji browser klik mention ke profil"
```

- [ ] **Step 6: Ringkasan untuk user**

Laporkan apa adanya: hasil `node --test` (lulus/gagal, angka), `tsc`, `vite build`, dan temuan slug 8-hex dari Task 2 Step 6. Jangan menyatakan selesai tanpa keluaran perintah.

---

## Catatan yang mudah terlewat

- `parseTerasPath` adalah satu-satunya tempat yang boleh tahu bentuk URL `/teras/*`. Kalau muncul `pathname.startsWith('/teras/')` di file lain, itu bug.
- Pil "kiriman baru" dan polling `/feed/head` mengacu ke feed **global** — di mode profil keduanya harus mati, bukan sekadar disembunyikan.
- Jangan menambah fetch `/members` kedua; daftar itu sudah diambil untuk autocomplete mention.
- Klik tautan di dalam kartu post harus `stopPropagation` — kartu punya handler buka-detail sendiri.

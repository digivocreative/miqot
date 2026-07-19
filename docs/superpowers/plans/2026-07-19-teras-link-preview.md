# Teras Link Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Saat agent menempel URL di composer Teras, tampilkan kartu link preview (judul/gambar/deskripsi/domain) ala Threads, disimpan sebagai snapshot bersama kiriman.

**Architecture:** Server mengambil OG tags lewat endpoint proxy anti-SSRF. Composer memanggilnya saat mendeteksi URL pertama, menampilkan kartu, lalu mengirim snapshot ke POST. Snapshot disimpan di kolom JSONB `community_posts.link_preview` dan dirender sebagai `<LinkPreviewCard>` di feed — mengikuti pola `media`/`quoted_post` yang sudah ada, termasuk graceful degradation bila kolom belum ada.

**Tech Stack:** Node/Express (`server.js`), Supabase (Postgres), React + TypeScript (`src/components/TerasPage.tsx`), modul JS murni + tes `node:test` (`lib/`, `tests/`).

## Global Constraints

- Modul logika murni ditaruh di `lib/community-link-preview.js` + tipe di `lib/community-link-preview.d.ts` (gaya `lib/community-mentions.js`). Tanpa dependensi baru — parsing OG pakai regex, bukan library.
- DDL (migrasi) TIDAK dijalankan otomatis: sediakan file `.sql`, user paste manual di Supabase SQL Editor. Kode harus graceful bila kolom `link_preview` belum ada (pola `isCommunityQuoteSchemaMissing` / `includeQuote`).
- Batas body kiriman tetap 1–500 karakter (`MAX_COMMUNITY_BODY_CHARS` di FE, dicek `Array.from(body).length` di server).
- Aturan prioritas: kiriman dengan media (foto/video) ATAU quote → `link_preview` di-drop (paksa null), di sisi tulis maupun baca.
- Server tidak percaya client: `link_preview` dari client selalu di-`sanitizeLinkPreview` + `isAllowedPreviewUrl` ulang, dan `url`-nya wajib muncul di body teks.
- Gambar preview di-hotlink langsung (`referrerpolicy="no-referrer"`, `loading="lazy"`), hanya menerima `image` berskema `https`. Tanpa re-upload ke Bunny.
- Endpoint proxy: hanya `http`/`https`, timeout ~5 dtk, body maks ~512KB, maks 3 redirect (tiap redirect divalidasi ulang), hanya `Content-Type: text/html`.
- Tes FE: `npx tsc --noEmit` + `npm run build` (vite). Tes node: `node --test tests/community-link-preview.test.js`.
- Working branch = `main` (user bekerja di main). Verifikasi `git branch --show-current` sebelum tiap commit. CATATAN: repo mungkin sedang dalam kondisi merge-conflict milik user — bila `git commit` gagal karena unmerged files, JANGAN sentuh konflik user; laporkan dan tunggu.

## File Structure

- `lib/community-link-preview.js` (CREATE) — helper murni: `firstUrlInText`, `isBlockedAddress`, `isAllowedPreviewUrl`, `parseOpenGraph`, `sanitizeLinkPreview`. Satu tanggung jawab: logika deteksi/parse/sanitasi tanpa jaringan.
- `lib/community-link-preview.d.ts` (CREATE) — tipe untuk modul di atas.
- `tests/community-link-preview.test.js` (CREATE) — unit test murni untuk modul.
- `migrations/20260724000000_community_link_preview.sql` (CREATE) — `ALTER TABLE community_posts ADD COLUMN link_preview jsonb;`.
- `server.js` (MODIFY) — endpoint proxy, helper schema-missing + payload, integrasi POST & feed/detail.
- `src/components/TerasPage.tsx` (MODIFY) — tipe `LinkPreview`, `<LinkPreviewCard>`, state + logika composer.

---

### Task 1: Modul murni `lib/community-link-preview.js` + tes

**Files:**
- Create: `lib/community-link-preview.js`
- Create: `lib/community-link-preview.d.ts`
- Test: `tests/community-link-preview.test.js`

**Interfaces:**
- Consumes: —
- Produces:
  - `firstUrlInText(text: string): string | null`
  - `isBlockedAddress(ip: string): boolean` — true bila IP privat/loopback/link-local (v4 & v6).
  - `isAllowedPreviewUrl(url: string): boolean` — true bila skema http/https, host bukan `localhost`, bukan hostname tanpa titik, dan bila host berupa IP literal maka bukan `isBlockedAddress`.
  - `parseOpenGraph(html: string, baseUrl: string): { url: string, canonical_url?: string, title?: string, description?: string, image?: string, site_name?: string } | null`
  - `sanitizeLinkPreview(obj: unknown): {...same shape...} | null`

- [ ] **Step 1: Tulis tes yang gagal**

`tests/community-link-preview.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  firstUrlInText,
  isBlockedAddress,
  isAllowedPreviewUrl,
  parseOpenGraph,
  sanitizeLinkPreview,
} from '../lib/community-link-preview.js';

test('firstUrlInText picks the first http(s) URL', () => {
  assert.equal(
    firstUrlInText('lihat https://www.detik.com/a/b lalu http://x.id'),
    'https://www.detik.com/a/b',
  );
  assert.equal(firstUrlInText('tidak ada tautan di sini'), null);
  assert.equal(firstUrlInText('email a@b.com bukan url'), null);
});

test('isBlockedAddress flags private/loopback/link-local', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.1.1', '::1', 'fc00::1', '0.0.0.0']) {
    assert.equal(isBlockedAddress(ip), true, `${ip} harus diblokir`);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '203.0.113.10', '2606:4700:4700::1111']) {
    assert.equal(isBlockedAddress(ip), false, `${ip} harus diizinkan`);
  }
});

test('isAllowedPreviewUrl rejects non-http, localhost, bare host, private IP literal', () => {
  assert.equal(isAllowedPreviewUrl('https://www.detik.com/a'), true);
  assert.equal(isAllowedPreviewUrl('http://example.co.id'), true);
  assert.equal(isAllowedPreviewUrl('ftp://example.com'), false);
  assert.equal(isAllowedPreviewUrl('file:///etc/passwd'), false);
  assert.equal(isAllowedPreviewUrl('http://localhost/x'), false);
  assert.equal(isAllowedPreviewUrl('http://intranet/x'), false); // no dot
  assert.equal(isAllowedPreviewUrl('http://127.0.0.1/x'), false);
  assert.equal(isAllowedPreviewUrl('http://192.168.0.5/x'), false);
  assert.equal(isAllowedPreviewUrl('not a url'), false);
});

test('parseOpenGraph reads og tags and resolves relative image', () => {
  const html = `<html><head>
    <meta property="og:title" content="Judul Berita">
    <meta property="og:description" content="Ringkasan berita.">
    <meta property="og:image" content="/img/thumb.jpg">
    <meta property="og:site_name" content="detikcom">
    <meta property="og:url" content="https://www.detik.com/canonical">
  </head></html>`;
  assert.deepEqual(parseOpenGraph(html, 'https://www.detik.com/a/b'), {
    url: 'https://www.detik.com/a/b',
    canonical_url: 'https://www.detik.com/canonical',
    title: 'Judul Berita',
    description: 'Ringkasan berita.',
    image: 'https://www.detik.com/img/thumb.jpg',
    site_name: 'detikcom',
  });
});

test('parseOpenGraph falls back to twitter then <title>', () => {
  const twitter = `<meta name="twitter:title" content="TW Title">
    <meta name="twitter:image" content="https://x.id/i.png">`;
  const p1 = parseOpenGraph(twitter, 'https://x.id/');
  assert.equal(p1.title, 'TW Title');
  assert.equal(p1.image, 'https://x.id/i.png');

  const titleOnly = `<html><head><title>Cuma Title</title></head></html>`;
  const p2 = parseOpenGraph(titleOnly, 'https://x.id/');
  assert.equal(p2.title, 'Cuma Title');
});

test('parseOpenGraph returns null when nothing useful', () => {
  assert.equal(parseOpenGraph('<html><body>halo</body></html>', 'https://x.id/'), null);
});

test('sanitizeLinkPreview trims, caps length, drops non-https image, requires url+something', () => {
  const cleaned = sanitizeLinkPreview({
    url: 'https://x.id/a',
    title: 'T'.repeat(500),
    description: 'D'.repeat(500),
    image: 'https://x.id/i.png',
    site_name: 'S'.repeat(300),
    junk: 'buang',
  });
  assert.equal(cleaned.url, 'https://x.id/a');
  assert.equal(cleaned.title.length, 200);
  assert.equal(cleaned.description.length, 300);
  assert.equal(cleaned.site_name.length, 100);
  assert.equal('junk' in cleaned, false);

  assert.equal(sanitizeLinkPreview({ url: 'https://x.id', image: 'http://x.id/i.png' }), null,
    'image http (non-https) dibuang; tanpa title/image lain → null');
  assert.equal(sanitizeLinkPreview({ title: 'T' }), null, 'tanpa url → null');
  assert.equal(sanitizeLinkPreview(null), null);
});
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `node --test tests/community-link-preview.test.js`
Expected: FAIL — `Cannot find module '../lib/community-link-preview.js'`.

- [ ] **Step 3: Implementasi modul**

`lib/community-link-preview.js`:

```javascript
/**
 * Pure helpers for Teras (community) link previews.
 *
 * Semua logika di sini bebas jaringan supaya bisa diuji langsung:
 *   - deteksi URL pertama di body,
 *   - filter anti-SSRF (host/IP),
 *   - parse Open Graph / Twitter / <title> dari HTML,
 *   - sanitasi snapshot sebelum disimpan / dirender.
 * Resolusi DNS + fetch sesungguhnya dilakukan pemanggil (server.js).
 */

const URL_RE = /\bhttps?:\/\/[^\s<>"')]+/i;
const TITLE_MAX = 200;
const DESC_MAX = 300;
const SITE_MAX = 100;
const URL_MAX = 2048;

function firstUrlInText(text) {
  if (typeof text !== 'string') return null;
  const match = text.match(URL_RE);
  if (!match) return null;
  // Buang tanda baca penutup yang ikut ter-capture.
  return match[0].replace(/[.,;:!?)\]}'"]+$/, '') || null;
}

function ipv4Parts(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some(n => n > 255)) return null;
  return parts;
}

function isBlockedAddress(ip) {
  const raw = String(ip || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  const v4 = ipv4Parts(raw);
  if (v4) {
    const [a, b] = v4;
    if (a === 0) return true;                       // 0.0.0.0/8
    if (a === 10) return true;                      // 10/8
    if (a === 127) return true;                     // loopback
    if (a === 169 && b === 254) return true;        // link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true;        // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
    if (a >= 224) return true;                       // multicast/reserved
    return false;
  }
  // IPv6
  if (raw === '::1' || raw === '::') return true;   // loopback / unspecified
  if (raw.startsWith('fe80')) return true;          // link-local
  if (raw.startsWith('fc') || raw.startsWith('fd')) return true; // unique-local fc00::/7
  if (raw.startsWith('::ffff:')) {                  // IPv4-mapped
    const mapped = raw.slice('::ffff:'.length);
    return ipv4Parts(mapped) ? isBlockedAddress(mapped) : true;
  }
  return false;
}

function isAllowedPreviewUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  // IP literal? blokir bila non-routable.
  if (ipv4Parts(host) || host.includes(':')) {
    if (isBlockedAddress(host)) return false;
    return true;
  }
  // Hostname harus punya titik (tolak bare intranet names).
  if (!host.includes('.')) return false;
  return true;
}

function decodeEntities(value) {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .trim();
}

function collectMetaTags(html) {
  const tags = new Map();
  const metaRe = /<meta\b[^>]*>/gi;
  const attrRe = /([a-z:-]+)\s*=\s*("([^"]*)"|'([^']*)')/gi;
  let meta;
  while ((meta = metaRe.exec(html))) {
    const attrs = {};
    let attr;
    attrRe.lastIndex = 0;
    while ((attr = attrRe.exec(meta[0]))) {
      attrs[attr[1].toLowerCase()] = attr[3] !== undefined ? attr[3] : attr[4];
    }
    const key = (attrs.property || attrs.name || '').toLowerCase();
    const content = attrs.content;
    if (key && content !== undefined && !tags.has(key)) {
      tags.set(key, decodeEntities(content));
    }
  }
  return tags;
}

function resolveUrl(value, baseUrl) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function parseOpenGraph(html, baseUrl) {
  if (typeof html !== 'string' || !html) return null;
  const tags = collectMetaTags(html);
  const pick = (...keys) => {
    for (const key of keys) {
      const value = tags.get(key);
      if (value) return value;
    }
    return undefined;
  };

  let title = pick('og:title', 'twitter:title');
  if (!title) {
    const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    if (m) title = decodeEntities(m[1].replace(/\s+/g, ' '));
  }
  const description = pick('og:description', 'twitter:description', 'description');
  const rawImage = pick('og:image', 'og:image:url', 'twitter:image', 'twitter:image:src');
  const image = rawImage ? resolveUrl(rawImage, baseUrl) : undefined;
  const siteName = pick('og:site_name', 'application-name');
  const canonical = pick('og:url');
  const canonicalUrl = canonical ? resolveUrl(canonical, baseUrl) : undefined;

  if (!title && !image) return null;

  const result = { url: baseUrl };
  if (canonicalUrl && canonicalUrl !== baseUrl) result.canonical_url = canonicalUrl;
  if (title) result.title = title;
  if (description) result.description = description;
  if (image) result.image = image;
  if (siteName) result.site_name = siteName;
  return result;
}

function clampString(value, max) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function sanitizeLinkPreview(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const url = clampString(obj.url, URL_MAX);
  if (!url || !isAllowedPreviewUrl(url)) return null;

  const result = { url };
  const canonical = clampString(obj.canonical_url, URL_MAX);
  if (canonical && isAllowedPreviewUrl(canonical)) result.canonical_url = canonical;
  const title = clampString(obj.title, TITLE_MAX);
  if (title) result.title = title;
  const description = clampString(obj.description, DESC_MAX);
  if (description) result.description = description;
  const siteName = clampString(obj.site_name, SITE_MAX);
  if (siteName) result.site_name = siteName;

  const image = clampString(obj.image, URL_MAX);
  if (image) {
    try {
      if (new URL(image).protocol === 'https:') result.image = image;
    } catch { /* abaikan image tak valid */ }
  }

  // Butuh minimal url + (title atau image) untuk jadi kartu berguna.
  if (!result.title && !result.image) return null;
  return result;
}

export {
  firstUrlInText,
  isBlockedAddress,
  isAllowedPreviewUrl,
  parseOpenGraph,
  sanitizeLinkPreview,
};
```

`lib/community-link-preview.d.ts`:

```typescript
export interface LinkPreviewSnapshot {
  url: string;
  canonical_url?: string;
  title?: string;
  description?: string;
  image?: string;
  site_name?: string;
}
export function firstUrlInText(text: string | null | undefined): string | null;
export function isBlockedAddress(ip: string): boolean;
export function isAllowedPreviewUrl(url: string): boolean;
export function parseOpenGraph(html: string, baseUrl: string): LinkPreviewSnapshot | null;
export function sanitizeLinkPreview(obj: unknown): LinkPreviewSnapshot | null;
```

- [ ] **Step 4: Jalankan tes, pastikan lulus**

Run: `node --test tests/community-link-preview.test.js`
Expected: PASS (semua test).

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # harus: main
git add lib/community-link-preview.js lib/community-link-preview.d.ts tests/community-link-preview.test.js
git commit -m "feat(teras): modul murni parse & sanitasi link preview"
```

---

### Task 2: Endpoint proxy `GET /api/community/link-preview`

**Files:**
- Modify: `server.js` (impor modul Task 1; tambah endpoint di dekat endpoint community lain, mis. setelah `app.get('/api/community/members', ...)` ~4515)

**Interfaces:**
- Consumes: `isAllowedPreviewUrl`, `parseOpenGraph`, `sanitizeLinkPreview` (Task 1); `authMiddleware`, `getAgentById`, `requireCommunityAccess`, `dbLoadShedGuard` (server.js).
- Produces: `GET /api/community/link-preview?url=…` → `{ data: LinkPreviewSnapshot | null }`.

- [ ] **Step 1: Tambahkan impor modul**

Di blok impor `server.js` (dekat impor `lib/community-mentions` bila ada, atau impor lib lainnya), tambah:

```javascript
import {
  firstUrlInText,
  isBlockedAddress,
  isAllowedPreviewUrl,
  parseOpenGraph,
  sanitizeLinkPreview,
} from './lib/community-link-preview.js';
import dns from 'node:dns';
```

(Bila `server.js` memakai `require`, sesuaikan: `const { ... } = require('./lib/community-link-preview.js');` dan `const dns = require('node:dns');`. Cek gaya impor di puncak file lebih dulu.)

- [ ] **Step 2: Tambahkan helper fetch aman + endpoint**

Sisipkan helper (dekat helper community lain, mis. sebelum endpoint feed ~4618):

```javascript
const LINK_PREVIEW_TIMEOUT_MS = 5000;
const LINK_PREVIEW_MAX_BYTES = 512 * 1024;
const LINK_PREVIEW_MAX_REDIRECTS = 3;

async function assertHostAllowed(urlString) {
  if (!isAllowedPreviewUrl(urlString)) return false;
  const host = new URL(urlString).hostname;
  // Bila host IP literal, isAllowedPreviewUrl sudah menyaring; resolve hostname.
  try {
    const records = await dns.promises.lookup(host, { all: true });
    if (!records.length) return false;
    return records.every(rec => !isBlockedAddress(rec.address));
  } catch {
    return false;
  }
}

async function fetchLinkPreviewHtml(startUrl) {
  let currentUrl = startUrl;
  for (let hop = 0; hop <= LINK_PREVIEW_MAX_REDIRECTS; hop += 1) {
    if (!(await assertHostAllowed(currentUrl))) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LINK_PREVIEW_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'AlhijazTerasBot/1.0 (+link-preview)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
    } catch {
      clearTimeout(timer);
      return null;
    }
    if (res.status >= 300 && res.status < 400) {
      clearTimeout(timer);
      const location = res.headers.get('location');
      if (!location) return null;
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !/text\/html/i.test(contentType)) {
      clearTimeout(timer);
      return null;
    }
    // Baca maksimal LINK_PREVIEW_MAX_BYTES.
    const reader = res.body?.getReader();
    if (!reader) { clearTimeout(timer); return null; }
    const chunks = [];
    let received = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        chunks.push(value);
        if (received >= LINK_PREVIEW_MAX_BYTES) { await reader.cancel(); break; }
      }
    } catch {
      clearTimeout(timer);
      return null;
    }
    clearTimeout(timer);
    const buffer = Buffer.concat(chunks.map(c => Buffer.from(c)));
    return { html: buffer.toString('utf8'), finalUrl: currentUrl };
  }
  return null; // terlalu banyak redirect
}

app.get('/api/community/link-preview', dbLoadShedGuard, authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentById(req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!requireCommunityAccess(agent, res)) return;

    const rawUrl = typeof req.query?.url === 'string' ? req.query.url.trim() : '';
    if (!rawUrl || !isAllowedPreviewUrl(rawUrl)) {
      return res.status(400).json({ error: 'URL tidak valid' });
    }

    const fetched = await fetchLinkPreviewHtml(rawUrl);
    if (!fetched) return res.json({ data: null });

    const parsed = parseOpenGraph(fetched.html, fetched.finalUrl);
    // url yang disimpan = URL yang diminta user (bukan hasil redirect internal).
    const snapshot = parsed ? sanitizeLinkPreview({ ...parsed, url: rawUrl }) : null;
    return res.json({ data: snapshot });
  } catch (err) {
    console.error('[community] link-preview error:', err);
    return res.json({ data: null });
  }
});
```

- [ ] **Step 3: Verifikasi server memuat tanpa error sintaks**

Run: `node --check server.js`
Expected: tidak ada output (exit 0).

- [ ] **Step 4: Smoke test manual (butuh jaringan)**

Jalankan server lokal (`npm run dev` atau perintah start proyek), lalu dengan JWT dev (lihat memory Teras community untuk resep verifikasi JWT dev):

```bash
curl -s -H "Authorization: Bearer <DEV_JWT>" \
  "http://localhost:<PORT>/api/community/link-preview?url=https://www.detik.com" | head
```

Expected: JSON `{ "data": { "url": "...", "title": "...", ... } }`. Uji juga URL diblokir:

```bash
curl -s -H "Authorization: Bearer <DEV_JWT>" \
  "http://localhost:<PORT>/api/community/link-preview?url=http://127.0.0.1" 
```

Expected: `{ "error": "URL tidak valid" }` (400).

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # harus: main
git add server.js
git commit -m "feat(teras): endpoint proxy link-preview anti-SSRF"
```

---

### Task 3: Migrasi + helper server (schema-missing & payload)

**Files:**
- Create: `migrations/20260724000000_community_link_preview.sql`
- Modify: `server.js` (tambah `isCommunityLinkPreviewSchemaMissing`, `communityLinkPreviewPayload` dekat `isCommunityQuoteSchemaMissing` ~4113 dan `communityQuotedPostPayload` ~4121)

**Interfaces:**
- Consumes: `sanitizeLinkPreview` (Task 1); `normalizeStoredCommunityMedia` (server.js).
- Produces:
  - `isCommunityLinkPreviewSchemaMissing(error): boolean`
  - `communityLinkPreviewPayload(row): LinkPreviewSnapshot | null` — null bila row punya media/quote atau `link_preview` kosong/invalid.

- [ ] **Step 1: Buat file migrasi**

`migrations/20260724000000_community_link_preview.sql`:

```sql
-- Teras link preview snapshot (judul/gambar/deskripsi/domain) untuk kiriman.
-- Terapkan manual di Supabase SQL Editor (proyek ini tidak punya exec_sql/psql).
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS link_preview jsonb;
```

- [ ] **Step 2: Tambahkan helper di server.js**

Setelah fungsi `isCommunityQuoteSchemaMissing` (~4119), tambah:

```javascript
function isCommunityLinkPreviewSchemaMissing(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || error?.details || '');
  if (!['42703', 'PGRST204'].includes(code)) return false;
  return /link_preview/i.test(message)
    && /does not exist|could not find|schema cache/i.test(message);
}
```

Setelah `communityQuotedPostPayload` (~4132), tambah:

```javascript
function communityLinkPreviewPayload(row) {
  if (!row) return null;
  // Aturan prioritas: media atau quote menang atas link preview.
  const hasMedia = normalizeStoredCommunityMedia(row.media, row.photo_url).length > 0;
  if (hasMedia || row.quoted_post_id) return null;
  return sanitizeLinkPreview(row.link_preview);
}
```

- [ ] **Step 3: Verifikasi sintaks**

Run: `node --check server.js`
Expected: exit 0.

- [ ] **Step 4: Terapkan migrasi (aksi user)**

Minta user paste isi `migrations/20260724000000_community_link_preview.sql` ke Supabase SQL Editor dan jalankan. Ini prasyarat agar snapshot tersimpan; sampai diterapkan, kode tetap berjalan (graceful) namun preview tidak tersimpan.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # harus: main
git add migrations/20260724000000_community_link_preview.sql server.js
git commit -m "feat(teras): migrasi + helper payload link preview"
```

---

### Task 4: POST `/api/community/posts` menerima & menyimpan `link_preview`

**Files:**
- Modify: `server.js` (handler `app.post('/api/community/posts', ...)` ~4920–5089)

**Interfaces:**
- Consumes: `sanitizeLinkPreview` (Task 1), `isCommunityLinkPreviewSchemaMissing`, `communityLinkPreviewPayload` (Task 3).
- Produces: kolom `link_preview` tersimpan; field `link_preview` di payload respons POST.

- [ ] **Step 1: Sanitasi input link_preview (setelah blok media, sebelum `basePostPayload` ~4986)**

```javascript
    // Link preview: hanya bila TIDAK ada media & TIDAK ada quote (prioritas).
    let linkPreview = null;
    if (media.length === 0 && !quotedPostId && req.body?.link_preview != null) {
      const candidate = sanitizeLinkPreview(req.body.link_preview);
      // URL preview wajib benar-benar muncul di body teks.
      if (candidate && body.includes(candidate.url)) {
        linkPreview = candidate;
      }
    }
```

- [ ] **Step 2: Sertakan di `basePostPayload` (~4986)**

Ubah objek `basePostPayload` menjadi menambahkan:

```javascript
    const basePostPayload = {
      ...(clientId ? { id: clientId } : {}),
      agent_id: agent.id,
      body,
      photo_url: photoUrl,
      is_system: false,
      ...(quotedPostId ? { quoted_post_id: quotedPostId } : {}),
      ...(linkPreview ? { link_preview: linkPreview } : {}),
    };
```

- [ ] **Step 3: Tangani kolom belum ada di loop insert (di dalam `for` ~4998, dekat cek `isCommunityMediaSchemaMissing` ~5012)**

Tambahkan cabang setelah cek quote-schema (~5019):

```javascript
      if (linkPreview && isCommunityLinkPreviewSchemaMissing(insertError)) {
        return res.status(503).json({ error: 'Migrasi link preview Teras belum diterapkan' });
      }
```

- [ ] **Step 4: Sertakan di respons `data` (~5071)**

Pada objek `data`, tambahkan field:

```javascript
      quoted_post: quotedPostId ? communityQuotedPostPayload(quotedPostRow) : null,
      link_preview: linkPreview,
      is_own: true,
```

- [ ] **Step 5: Verifikasi sintaks**

Run: `node --check server.js`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # harus: main
git add server.js
git commit -m "feat(teras): simpan link preview saat buat kiriman"
```

---

### Task 5: Sertakan `link_preview` di feed & detail

**Files:**
- Modify: `server.js` (feed `app.get('/api/community/feed', ...)` ~4632–4790 dan detail post handler ~4800–4915)

**Interfaces:**
- Consumes: `isCommunityLinkPreviewSchemaMissing`, `communityLinkPreviewPayload` (Task 3).
- Produces: field `link_preview` pada tiap post di respons feed & detail.

- [ ] **Step 1: Feed — flag + select + retry**

Di handler feed, dekat deklarasi `let includeMedia = true; let includeQuote = true;` (~4664), tambah `let includeLinkPreview = true;`. Di blok deteksi schema-missing yang menyetel `includeMedia=false`/`includeQuote=false` (~4671-4675), tambah cabang paralel:

```javascript
        if (isCommunityLinkPreviewSchemaMissing(error)) { includeLinkPreview = false; retry = true; }
```

(Ikuti persis pola retry yang sudah ada di sana; bila strukturnya berupa satu fungsi query yang dibangun ulang, tambahkan `includeLinkPreview` ke daftar kolom select seperti `includeQuote ? 'quoted_post_id, ' : ''` → tambah `${includeLinkPreview ? 'link_preview, ' : ''}`.)

Perbarui string select feed (~4648) menjadi menyertakan kolom:

```javascript
        .select(`id, body, photo_url, ${includeMedia ? 'media, ' : ''}${includeQuote ? 'quoted_post_id, ' : ''}${includeLinkPreview ? 'link_preview, ' : ''}is_system, created_at, agent_id, agent:agents!community_posts_agent_id_fkey(name, slug, photo)`)
```

- [ ] **Step 2: Feed — sertakan di payload tiap post (~4776, dekat `quoted_post:`)**

```javascript
        quoted_post: includeQuote && post.quoted_post_id
          ? communityQuotedPostPayload(quotedById.get(post.quoted_post_id))
          : null,
        link_preview: includeLinkPreview ? communityLinkPreviewPayload(post) : null,
```

- [ ] **Step 3: Detail — flag + select + payload**

Ulangi pola yang sama di handler detail (select ~4817, deklarasi flag ~4821-4822): tambah `includeLinkPreview`, tambahkan `link_preview` ke select, dan pada objek respons detail (~4910 dekat `quoted_post:`) tambah:

```javascript
        quoted_post: post.quoted_post_id ? quotedPost : null,
        link_preview: includeLinkPreview ? communityLinkPreviewPayload(post) : null,
```

- [ ] **Step 4: Verifikasi sintaks**

Run: `node --check server.js`
Expected: exit 0.

- [ ] **Step 5: Smoke test manual (butuh server + migrasi diterapkan)**

Buat 1 kiriman berisi URL saja lewat UI/curl, lalu:

```bash
curl -s -H "Authorization: Bearer <DEV_JWT>" "http://localhost:<PORT>/api/community/feed" | head -c 800
```

Expected: post terbaru memuat `"link_preview": { "url": ..., "title": ... }`.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # harus: main
git add server.js
git commit -m "feat(teras): sertakan link preview di feed & detail"
```

---

### Task 6: Frontend — tipe + `<LinkPreviewCard>` + render di feed/detail

**Files:**
- Modify: `src/components/TerasPage.tsx` (tipe dekat `QuotedPostPreview` ~99-108; komponen kartu dekat `QuotedPostCard`; render di daftar post)

**Interfaces:**
- Consumes: field `post.link_preview` dari API (Task 4/5).
- Produces: tipe `LinkPreview`, komponen `LinkPreviewCard`, render kartu di item post.

- [ ] **Step 1: Tambah tipe**

Setelah interface `QuotedPostPreview` (~108), tambah:

```typescript
interface LinkPreview {
  url: string;
  canonical_url?: string;
  title?: string;
  description?: string;
  image?: string;
  site_name?: string;
}
```

Pada interface `CommunityPost` (~74), tambah field:

```typescript
  quoted_post?: QuotedPostPreview | null;
  link_preview?: LinkPreview | null;
```

- [ ] **Step 2: Tambah komponen `LinkPreviewCard`**

Dekat `QuotedPostCard` (cari `function QuotedPostCard`), tambah komponen baru:

```tsx
function LinkPreviewCard({ preview }: { preview: LinkPreview }) {
  const [imageBroken, setImageBroken] = useState(false);
  const href = preview.canonical_url || preview.url;
  let domain = preview.site_name;
  if (!domain) {
    try { domain = new URL(preview.url).hostname.replace(/^www\./, ''); } catch { domain = preview.url; }
  }
  const showImage = !!preview.image && !imageBroken;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="mt-2 block overflow-hidden rounded-xl border border-gray-200 bg-white transition hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
      onClick={event => event.stopPropagation()}
    >
      {showImage && (
        <img
          src={preview.image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="aspect-[1.91/1] w-full object-cover"
          onError={() => setImageBroken(true)}
        />
      )}
      <div className="px-3 py-2">
        <div className="text-xs uppercase tracking-wide text-gray-400 dark:text-slate-500">{domain}</div>
        {preview.title && (
          <div className="mt-0.5 line-clamp-2 text-sm font-semibold text-gray-900 dark:text-slate-100">{preview.title}</div>
        )}
        {preview.description && (
          <div className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-slate-400">{preview.description}</div>
        )}
      </div>
    </a>
  );
}
```

(Jika `line-clamp-*` tidak tersedia di setup Tailwind proyek, gunakan util clamp yang sudah dipakai di file ini — cari pola `line-clamp` atau `-webkit-line-clamp` di `TerasPage.tsx`/`index.css` dan samakan.)

- [ ] **Step 3: Render kartu di item post**

Di komponen yang merender satu post (cari tempat `QuotedPostCard` / `PostMediaRail` dirender di dalam item feed), tambahkan setelah body teks dan sebelum/berdampingan media — dengan aturan prioritas:

```tsx
{post.link_preview
  && (!post.media || post.media.length === 0)
  && !post.quoted_post && (
  <LinkPreviewCard preview={post.link_preview} />
)}
```

- [ ] **Step 4: Verifikasi tipe & build**

Run: `npx tsc --noEmit`
Expected: tidak ada error terkait `LinkPreview`/`LinkPreviewCard`.

Run: `npm run build`
Expected: build sukses.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # harus: main
git add src/components/TerasPage.tsx
git commit -m "feat(teras): render kartu link preview di feed & detail"
```

---

### Task 7: Frontend — deteksi URL & fetch preview di composer

**Files:**
- Modify: `src/components/TerasPage.tsx` (state composer ~900-905; efek deteksi URL; render kartu di composer; body submit ~1840)

**Interfaces:**
- Consumes: `firstUrlInText` — tambahkan salinan util ringan di FE ATAU impor dari `lib/community-link-preview.js` bila konfigurasi build mengizinkan impor `.js` dari `lib/` (cek apakah `communityMentions.ts` mengimpor dari `lib/` — bila tidak, buat helper lokal). Endpoint `GET /api/community/link-preview`. `requestJson`, `getAuthHeaders` (TerasPage).
- Produces: state `composerLinkPreview` dikirim di body POST sebagai `link_preview`.

- [ ] **Step 1: Tambah util deteksi URL FE**

Cek dulu apakah `src/lib/communityMentions.ts` mengimpor dari `lib/*.js`. Bila TIDAK ada preseden impor lintas-folder, tambahkan util lokal di dekat atas `TerasPage.tsx` (dekat konstanta lain):

```typescript
const FE_URL_RE = /\bhttps?:\/\/[^\s<>"')]+/i;
function firstUrlInBody(text: string): string | null {
  const match = text.match(FE_URL_RE);
  if (!match) return null;
  return match[0].replace(/[.,;:!?)\]}'"]+$/, '') || null;
}
```

- [ ] **Step 2: Tambah state composer (dekat ~902)**

```typescript
  const [composerLinkPreview, setComposerLinkPreview] = useState<LinkPreview | null>(null);
  const [composerLinkLoading, setComposerLinkLoading] = useState(false);
  const [composerDismissedUrl, setComposerDismissedUrl] = useState<string | null>(null);
  const linkPreviewControllerRef = useRef<AbortController | null>(null);
```

- [ ] **Step 3: Efek deteksi + fetch (debounce)**

Tambahkan `useEffect` yang bereaksi pada `composerBody`, `composerOpen`, `composerMedia.length`, `composerQuote`, `composerDismissedUrl`:

```typescript
  useEffect(() => {
    if (!composerOpen) return;
    // Prioritas: bila ada media atau quote, jangan tampilkan preview.
    if (composerMedia.length > 0 || composerQuote) {
      setComposerLinkPreview(null);
      setComposerLinkLoading(false);
      return;
    }
    const url = firstUrlInBody(composerBody);
    if (!url || url === composerDismissedUrl) {
      setComposerLinkPreview(null);
      setComposerLinkLoading(false);
      return;
    }
    if (composerLinkPreview && composerLinkPreview.url === url) return; // sudah diambil
    let cancelled = false;
    setComposerLinkLoading(true);
    const timer = setTimeout(async () => {
      linkPreviewControllerRef.current?.abort();
      const controller = new AbortController();
      linkPreviewControllerRef.current = controller;
      try {
        const result = await requestJson<LinkPreview | null>(
          `/api/community/link-preview?url=${encodeURIComponent(url)}`,
          { headers: { ...getAuthHeaders() }, signal: controller.signal },
          'Gagal memuat pratinjau tautan',
        );
        if (cancelled) return;
        setComposerLinkPreview(result.data ?? null);
      } catch (previewError) {
        if (previewError instanceof Error && previewError.name === 'AbortError') return;
        if (!cancelled) setComposerLinkPreview(null);
      } finally {
        if (!cancelled) setComposerLinkLoading(false);
      }
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [composerBody, composerOpen, composerMedia.length, composerQuote, composerDismissedUrl, composerLinkPreview]);
```

(Sesuaikan signature `requestJson` dengan yang dipakai di file ini — lihat pemanggilan lain seperti `requestJson<CommunityPost[]>(...)` untuk urutan argumen & bentuk balikan `{ data }`.)

- [ ] **Step 4: Render kartu preview di composer**

Di JSX composer, setelah area media/preview dan sebelum footer tombol, tambah:

```tsx
{composerLinkLoading && !composerLinkPreview && (
  <div className="mt-2 h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-slate-800" />
)}
{composerLinkPreview && composerMedia.length === 0 && !composerQuote && (
  <div className="relative">
    <LinkPreviewCard preview={composerLinkPreview} />
    <button
      type="button"
      aria-label="Buang pratinjau tautan"
      onClick={() => {
        setComposerDismissedUrl(composerLinkPreview.url);
        setComposerLinkPreview(null);
      }}
      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
    >
      ✕
    </button>
  </div>
)}
```

- [ ] **Step 5: Kirim link_preview saat submit (~1843)**

Di objek `JSON.stringify({...})` pada POST, tambah — hanya bila tak ada media & tak ada quote:

```javascript
            ...(uploadedMedia.length > 0 ? { media: uploadedMedia } : {}),
            ...(legacyPhotoUrl ? { photo_url: legacyPhotoUrl } : {}),
            ...(composerQuote?.id ? { quoted_post_id: composerQuote.id } : {}),
            ...(composerLinkPreview && uploadedMedia.length === 0 && !composerQuote
              ? { link_preview: composerLinkPreview }
              : {}),
            ...(postMentions.length ? { mentions: postMentions } : {}),
```

- [ ] **Step 6: Bersihkan state di `resetComposer` (~1457)**

Di `resetComposer`, tambahkan reset:

```typescript
    setComposerLinkPreview(null);
    setComposerLinkLoading(false);
    setComposerDismissedUrl(null);
    linkPreviewControllerRef.current?.abort();
```

- [ ] **Step 7: Verifikasi tipe & build**

Run: `npx tsc --noEmit`
Expected: bersih.

Run: `npm run build`
Expected: sukses.

- [ ] **Step 8: Verifikasi manual end-to-end**

Jalankan app, buka composer Teras, paste `https://www.detik.com/...`. Expected: setelah ~0.6 dtk kartu preview muncul di bawah teks; tombol ✕ membuangnya; menekan Post menyimpan kiriman dan kartu tampil di feed. Uji juga: paste link lalu tambah foto → kartu preview hilang (prioritas media).

- [ ] **Step 9: Commit**

```bash
git branch --show-current   # harus: main
git add src/components/TerasPage.tsx
git commit -m "feat(teras): pratinjau tautan di composer ala Threads"
```

---

## Catatan integrasi & risiko

- **Merge-conflict user aktif:** commit bisa gagal karena unmerged files milik user (`.env.example`, `deploy.sh`, `PortalBackBar.tsx`, `portal-jamaah-redesign.test.js`). Jangan resolusi konflik user; laporkan & tunggu, atau (bila user setuju) commit ditunda sampai konflik bersih.
- **Migrasi wajib manual (Task 3 Step 4)** sebelum snapshot benar-benar tersimpan. Sampai itu, endpoint & UI tetap berfungsi (preview muncul di composer) tetapi tidak persist — server mengembalikan 503 hanya bila post menyertakan `link_preview` sebelum migrasi.
- **SSRF:** validasi dilakukan dua kali — sebelum fetch (`isAllowedPreviewUrl`) dan setelah resolusi DNS (`isBlockedAddress` per record), termasuk tiap redirect. Jangan hilangkan salah satunya.
- **Karakter 500:** URL tetap dihitung; tidak ada perubahan batas.

## Self-Review (sudah dijalankan)

- **Spec coverage:** snapshot-at-post (Task 3/4), endpoint proxy anti-SSRF (Task 2), modul murni + tes (Task 1), teks URL tetap ada (tidak ada penghapusan body — Task 7), link pertama (`firstUrlInBody`/`firstUrlInText`), hotlink gambar + fallback (Task 6 `onError`), prioritas media/quote (Task 4 tulis, Task 5 baca via `communityLinkPreviewPayload`, Task 6/7 guard render), migrasi manual (Task 3). Semua tercakup.
- **Placeholder scan:** tidak ada TBD/TODO; tiap langkah kode menyertakan kode nyata.
- **Type consistency:** bentuk snapshot `{ url, canonical_url?, title?, description?, image?, site_name? }` konsisten di `lib/*.d.ts`, `communityLinkPreviewPayload`, tipe FE `LinkPreview`, dan payload POST/feed/detail. Nama fungsi `sanitizeLinkPreview`/`isAllowedPreviewUrl`/`isBlockedAddress`/`parseOpenGraph`/`firstUrlInText` konsisten antar-task.

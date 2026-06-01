# WA Copy — Media Upload for Content Editor (Konten)

**Date:** 2026-06-01
**Status:** Approved design, pending implementation plan
**Area:** `src/components/wa-copy/` (admin "Konten" editor + consumer tabs) + `server.js`

## Summary

Admins managing WA Copy content at `/dashboard/konten` can attach **one media file**
(image or document) to any content item — an FAQ answer, a caption, or a tour-leader
step. The file uploads to **Bunny CDN** and its public URL is stored on the content
item. In the consumer (agent-facing) WA Copy views, the media is **shown** inline and is
**saveable/downloadable**, so the agent can grab it and forward it on WhatsApp alongside
the copied text.

## Goals

- A reusable media field in all three admin editors (FAQ, Caption, Tour Leader).
- Accept **images** (JPG/PNG/WebP) and **common documents** (PDF, Word `.docx`, Excel `.xlsx`).
- Store the actual file on **Bunny CDN** (persists permanently) via a new admin-only endpoint.
- Show the media in the consumer tabs with a **download/save** affordance.
- Reuse the repo's existing Bunny helpers and upload UI conventions; add **no new env vars**.

## Non-goals (explicitly out of scope)

- **Persisting the WA Copy content itself.** Content lives in the existing in-memory mock
  hook (`useWaCopyContent`) and resets on reload — that is the current, intentional state.
  This feature does not change that.
- **Multiple attachments per item.** V1 is one attachment. The data model uses an array
  field so enabling multiple later is a UI-only change (no data migration).
- **Orphan-file garbage collection** on Bunny. See Known Limitations.
- **Image cropping / aspect-ratio enforcement.** Files upload as-is.

## Key consequence to keep in mind

The **file** persists on Bunny CDN, but the **association** (which FAQ → which file) lives
in the in-memory content mock and resets on reload — exactly like text edits do today.
Media is therefore *no less persistent than the existing text content*. When the content
hook is later swapped for a real API (the existing "API-swap seam"), the stored Bunny URLs
carry over unchanged.

## Decisions (from brainstorming)

| Question | Decision |
| --- | --- |
| How is media used? | Shown in the content card + saveable/forwardable on WhatsApp. |
| File types | Images (JPG/PNG/WebP) + docs (PDF, `.docx`, `.xlsx`). |
| Storage | Bunny CDN (real upload; infra already exists). |
| Scope | All three editors: FAQ, Caption, Tour Leader. |
| Attachments per item | One (modeled as an array for future "multiple"). |

## Existing infrastructure reused

- **Bunny CDN** is already wired in `server.js`: `getBunnyEnabled()`, `bunnyUpload(path, buffer, contentType)`,
  `bunnyDelete(path)` (`server.js` ~13516–13563). Env vars already set:
  `BUNNY_STORAGE_API_KEY`, `BUNNY_STORAGE_ZONE` (`alhijaz-files`),
  `BUNNY_STORAGE_HOSTNAME` (`sg.storage.bunnycdn.com`), `BUNNY_CDN_HOSTNAME` (`alhijaz.b-cdn.net`).
  Public URL = `https://${BUNNY_CDN_HOSTNAME}/${path}`.
- **Auth/role** middleware: `authMiddleware` + `adminOnly` (`server.js` ~731–773).
  Frontend `getAuthHeaders()` from `src/components/LoginPage.tsx`.
- **Upload UI convention**: `src/components/bio-editor/sheets/PhotoUploadField.tsx`
  (file input → client validation → `fileToBase64` → POST JSON `{mime, data}` → `{success, url}`).
  We mirror its look (emerald, dashed dropzone, `Upload`/`X`/`Loader2` icons) but generalize to docs.

## Architecture

```
Admin editor (FaqEditor / CaptionEditor / TourLeaderEditor)
  └─ MediaUploadField (edit)  ──POST base64──▶  /api/admin/wa-copy/media  ──bunnyUpload()──▶  Bunny CDN
        │  on success → onChange(MediaAttachment)                                              │
        ▼                                                                                       ▼
  draft.media[]  ──onSave──▶  useWaCopyContent.create*/update*  (in-memory store)        public CDN URL
                                                  │
Consumer tab (FaqAccordionItem / CaptionCard / TourStepCard)
  └─ MediaView (read-only)  ── renders thumbnail/chip + "Unduh" (download/open Bunny URL)
```

## Components & changes

### 1. Data model — `src/components/wa-copy/lib/types.ts`

```ts
export interface MediaAttachment {
  url: string;                  // Bunny CDN public URL
  kind: 'image' | 'file';
  mime: string;                 // e.g. image/png, application/pdf
  name: string;                 // original filename (display + download)
  size: number;                 // bytes (for display)
}
```

Add `media?: MediaAttachment[]` to `AgentFaqEntry`, `CaptionEntry`, and `TourStep`. Optional
→ no seed-data changes required. The UI reads/writes only `media[0]` in V1.

### 2. Shared helpers — `src/components/wa-copy/lib/media.ts` (new)

- `MEDIA_UPLOAD_URL = '/api/admin/wa-copy/media'`
- `ALLOWED_IMAGE_MIME = ['image/png','image/jpeg','image/webp']`
- `ALLOWED_DOC_MIME = ['application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  // .docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']`        // .xlsx
- `MAX_IMAGE_BYTES = 6 * 1024 * 1024`, `MAX_DOC_BYTES = 10 * 1024 * 1024`
- `ACCEPT_ATTR` for the file input (mimes + `.docx,.xlsx` extensions for OS pickers)
- `kindFromMime(mime): 'image' | 'file'`
- `fileToBase64(file): Promise<string>` (strips the `data:...;base64,` prefix, as in `PhotoUploadField`)
- `formatBytes(n): string`
- `validateMediaFile(file): string | null` (returns an Indonesian error message or `null`)

### 3. Backend — `server.js`

New route, mirroring `POST /api/bio/:slug/og-image` but targeting Bunny and admin-gated:

```
POST /api/admin/wa-copy/media   [authMiddleware, adminOnly, express.json({limit:'16mb'})]
  // 16mb body limit: a 10MB doc inflates to ~13.7MB as base64 + JSON overhead
  body: { mime: string, name: string, data: string(base64) }
  - if (!getBunnyEnabled()) → 503 { error: 'Penyimpanan media belum dikonfigurasi' }
  - validate mime ∈ allowlist (images + docs) → 400 on mismatch
  - decode base64 → buffer; enforce size (image ≤ 6MB, doc ≤ 10MB) → 400
  - ext from mime; safeName from name (slugify, keep ext); path = `wa-copy/${Date.now()}-${safeName}`
  - await bunnyUpload(path, buffer, mime)
  - 200 { success: true, url: `https://${BUNNY_CDN_HOSTNAME}/${path}`,
           kind: kindFromMime(mime), mime, name, size: buffer.length }
  - try/catch → 500 { error: 'Gagal mengunggah media' }
```

No new env vars. Reuses existing `bunnyUpload()` and `getBunnyEnabled()`.

### 4. `MediaUploadField` (edit) — `src/components/wa-copy/admin/MediaUploadField.tsx` (new)

Props: `{ value: MediaAttachment | null; onChange: (m: MediaAttachment | null) => void }`.
- Hidden `<input type="file" accept={ACCEPT_ATTR}>`.
- On pick: `validateMediaFile` → `fileToBase64` → POST `{mime, name, data}` with `getAuthHeaders()` →
  on `{success,url,...}` call `onChange({url, kind, mime, name, size})`.
- States: empty (dashed "Pilih Media" dropzone + hint listing allowed types/sizes),
  uploading (spinner), filled. Filled shows a preview via `MediaView` (`download={false}`) plus
  **Ganti** and **Hapus** buttons. Inline error text on validation/upload failure.

### 5. `MediaView` (read-only) — `src/components/wa-copy/admin/MediaView.tsx` (new)

Props: `{ media: MediaAttachment; download?: boolean }` (`download` defaults to `true`).
- `kind==='image'` → thumbnail `<img src={media.url}>` in a rounded frame; tap opens full image
  (`<a href target="_blank" rel="noreferrer">`).
- `kind==='file'` → file chip: icon (PDF/Word/Excel via lucide `FileText`/`FileSpreadsheet`),
  `media.name`, `formatBytes(media.size)`.
- When `download`, render an **"Unduh"** action: `<a href={media.url} download={media.name} target="_blank" rel="noreferrer">`.
  (Cross-origin `download` may open rather than force-save; acceptable — the agent saves from there.)
- Reused in the editor preview (with `download={false}`) and in all three consumer cards.

### 6. Editor wiring — `FaqEditor.tsx`, `CaptionEditor.tsx`, `TourLeaderEditor.tsx`

- Add `const [media, setMedia] = useState<MediaAttachment | null>(initial?.media?.[0] ?? null)`.
- Render a `MediaUploadField` labeled **"Media (Opsional)"** directly above the **Aktif** toggle.
- Extend each `*Draft` with `media?: MediaAttachment[]`; in `handleSave`, include
  `media: media ? [media] : []`.
- `WaCopyAdminPage.tsx` already spreads the draft into `create*/update*`, so `media` flows
  through with **no change** there (the entry types now include `media`).

### 7. Consumer display — render `MediaView` where each type is shown

- **FAQ:** `src/components/wa-copy/tabs/faq/FaqAccordionItem.tsx` — render `entry.media?.[0]`
  inside the expanded answer block (below the answer text, above the Salin/Kirim buttons).
- **Caption:** `src/components/wa-copy/tabs/caption/CaptionCard.tsx` — render `entry.media?.[0]`.
- **Tour Leader:** `src/components/wa-copy/tabs/tourleader/TourStepCard.tsx` — render `entry.media?.[0]`.

Each renders `<MediaView media={...} />` only when present.

## Error handling

- **Client:** reject disallowed mime / oversize before upload with an inline Indonesian message;
  show upload failures from the server response; keep prior value on failure.
- **Server:** 503 when Bunny unconfigured; 400 for bad mime / oversize / empty data;
  500 on Bunny upload error (Indonesian `error` strings, matching existing endpoints).

## Testing & verification

- **Type/build:** `npx tsc --noEmit` and `npm run build` (Vite) — the repo's standard FE gate
  (eslint v10 is unconfigured per project notes).
- **Backend smoke:** `curl -X POST /api/admin/wa-copy/media` with an admin Bearer token and a tiny
  base64 PNG → expect `{success:true,url:…}`; verify the URL is reachable on `alhijaz.b-cdn.net`.
  Negative: non-admin token → 403; disallowed mime → 400; oversize → 400.
- **Manual:** in each editor, upload an image and a PDF, save, then confirm it shows and downloads
  in the matching consumer tab (FAQ accordion / Caption card / Tour step card), in light and dark mode.

## Files touched

| File | Change |
| --- | --- |
| `src/components/wa-copy/lib/types.ts` | `MediaAttachment` + `media?` on the 3 entry types |
| `src/components/wa-copy/lib/media.ts` | **new** — allowlists, caps, helpers, endpoint URL |
| `src/components/wa-copy/admin/MediaUploadField.tsx` | **new** — editable upload field |
| `src/components/wa-copy/admin/MediaView.tsx` | **new** — read-only preview + download |
| `src/components/wa-copy/admin/FaqEditor.tsx` | add field + draft.media |
| `src/components/wa-copy/admin/CaptionEditor.tsx` | add field + draft.media |
| `src/components/wa-copy/admin/TourLeaderEditor.tsx` | add field + draft.media |
| `src/components/wa-copy/tabs/faq/FaqAccordionItem.tsx` | render MediaView |
| `src/components/wa-copy/tabs/caption/CaptionCard.tsx` | render MediaView |
| `src/components/wa-copy/tabs/tourleader/TourStepCard.tsx` | render MediaView |
| `server.js` | new `POST /api/admin/wa-copy/media` route |

## Known limitations / future work

- **Content not persisted:** admin edits (incl. the media association) reset on reload until the
  content hook is wired to a real backend. Bunny files themselves persist.
- **Orphaned files:** uploads that are never durably referenced (e.g. upload then reload, or
  replace/remove) remain on Bunny. No GC in V1. A future delete-on-remove (via existing
  `bunnyDelete()`) or a sweep job can clean these up.
- **Multiple attachments:** array model already supports it; future work is the editor UI
  (add/remove/reorder several) and rendering a small gallery.
- **PWA caching:** optionally add a Workbox runtime rule for `alhijaz.b-cdn.net` so media is
  available offline (the existing rule only covers Supabase `agent-photos`). Not required for V1.

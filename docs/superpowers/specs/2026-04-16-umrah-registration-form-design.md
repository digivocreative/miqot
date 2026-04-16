# Umrah Jamaah Registration Form

## Context

Admin staff currently registers new jamaah through the legacy PHP system at `aiw/staff/pages/main.php?route=umrah&act=tdaftar`. This requires switching to a separate system with different credentials. The goal is to bring this registration form into the Alhijaz React dashboard so admins can register jamaah directly, with data being posted to the legacy PHP system via the Express backend as a proxy.

## Approach

**Express Proxy + HTML Scraping**: The React frontend renders a registration form. Dropdown options are fetched by scraping the legacy form page. On submission, the Express backend forwards the form data as a POST to the legacy PHP system using the stored PHPSESSID.

## Architecture

```
React Form (/dashboard/jamaah/daftar, admin only)
    ↓ POST /api/umrah/register (JSON + file)
Express Backend (server.js)
    ↓ 1. Validate session (PHPSESSID aktif)
    ↓ 2. Convert to multipart/form-data matching legacy field names
    ↓ 3. POST to legacy PHP system
Legacy PHP (aiw/staff)
    ↓ Response HTML (success/error)
Express Backend
    ↓ Parse response, return JSON
React Frontend
    ↓ Success → redirect to /dashboard/jamaah + trigger sync
```

## Components

### 1. Scraper Function — `fetchUmrahFormOptions(username)`

**File:** `laporan-api.js` (new export)

- GET `${BASE}/pages/main.php?route=umrah&act=tdaftar` with stored PHPSESSID
- Parse HTML with Cheerio to extract all `<select>` elements and their `<option>` values
- Also extract the `<form action="...">` URL and hidden input fields
- Return structured JSON:

```js
{
  formAction: string,           // form action URL from <form> tag
  hiddenFields: Record<string, string>,  // hidden inputs
  options: {
    jenisDaftar: [{ value: string, label: string }],
    tglBerangkat: [{ value: string, label: string }],
    kelamin: [{ value: string, label: string }],
    statusNikah: [{ value: string, label: string }],
    pekerjaan: [{ value: string, label: string }],
    pendamping: [{ value: string, label: string }],
    pengalamanUmrah: [{ value: string, label: string }],
    remarks: [{ value: string, label: string }],
    paketUmroh: [{ value: string, label: string }],
    marketing: [{ value: string, label: string }],
    koordinator: [{ value: string, label: string }],
  }
}
```

### 2. Submission Function — `submitUmrahRegistration(username, formData)`

**File:** `laporan-api.js` (new export)

- Build multipart `FormData` with field names matching the legacy HTML form
- Include file KTP if provided
- Include hidden fields from the form scrape
- POST to the form action URL with PHPSESSID cookie
- Parse response HTML to detect success or error
- Return `{ success: boolean, message: string }`

### 3. Express Endpoints

**File:** `server.js` (new endpoints)

#### `GET /api/umrah/form-options`
- Protected: `authMiddleware` + `adminOnly`
- Requires active legacy session (PHPSESSID)
- Calls `fetchUmrahFormOptions(username)`
- Returns dropdown options as JSON

#### `POST /api/umrah/register`
- Protected: `authMiddleware` + `adminOnly`
- Accepts: `multipart/form-data` (using existing multer or similar middleware for file upload)
- Validates all 20 required fields server-side
- Calls `submitUmrahRegistration(username, formData)`
- Returns `{ success, message }`

### 4. React Component — `UmrahRegisterPage.tsx`

**File:** `src/components/UmrahRegisterPage.tsx` (new file)

**On mount:**
- Fetch `GET /api/umrah/form-options` to populate all dropdowns
- Show loading skeleton while options load
- If no active legacy session, show message to connect first

**Form sections (grouped):**

| Section | Fields |
|---------|--------|
| Info Pendaftaran | Tgl Daftar (auto today), Jenis Daftar* (dropdown), Tgl Berangkat* (dropdown) |
| Data Jamaah | Nama Lengkap* (first/middle/last), Kelamin* (dropdown), No KTP*, No Telp/HP*, Status Nikah* (dropdown), Pekerjaan* (dropdown), Pendamping* (dropdown), Pengalaman Umrah* (dropdown), Remarks* (dropdown), Mahram*, Kondisi Jamaah* (textarea) |
| Alamat | Alamat* (textarea, sesuai KTP) |
| Paket & Marketing | Paket Umroh* (dropdown), Marketing* (dropdown), Koordinator* (dropdown) |
| Info Pendaftar | Nama Pendaftar*, No Telp/HP Pendaftar*, Keterangan* (textarea) |
| Dokumen | File KTP (file upload, optional) |

**Validation:**
- Client-side: all required fields filled before submit enabled
- Field-level validation on blur (e.g., KTP 16 digits, phone number format)

**Submit flow:**
1. Show loading spinner on submit button
2. POST to `/api/umrah/register`
3. On success: show toast/notification, redirect to `/dashboard/jamaah`, trigger sync
4. On error: show error message, keep form data intact

### 5. Routing Integration

**File:** `src/components/DashboardLayout.tsx`

- Add sub-tab detection for `/dashboard/jamaah/daftar`
- Render `UmrahRegisterPage` when sub-path is `daftar`

**File:** `src/components/JamaahPage.tsx`

- Add "Daftar Jamaah" button (admin only) that navigates to `/dashboard/jamaah/daftar`

## Required Fields (20 total)

1. JENIS DAFTAR — dropdown
2. TGL BERANGKAT — dropdown (jadwal + paket info)
3. NAMA LENGKAP JAMAAH — 3 text inputs (first, middle, last)
4. KELAMIN — dropdown
5. NO. KTP — text
6. NO. TLP/HP JAMAAH — text
7. STATUS NIKAH — dropdown
8. PEKERJAAN — dropdown
9. PENDAMPING (keberangkatan) — dropdown
10. PENGALAMAN UMRAH — dropdown
11. REMARKS — dropdown
12. MAHRAM — text
13. KONDISI JAMAAH — textarea
14. ALAMAT (Sesuai KTP) — textarea
15. PAKET UMROH — dropdown
16. MARKETING — dropdown
17. KOORDINATOR — dropdown
18. NAMA PENDAFTAR — text
19. NO. TLP/HP PENDAFTAR — text
20. KETERANGAN (Lain-lain) — textarea

## UI/UX Notes

- Follow existing dashboard styling (TailwindCSS, consistent with JamaahPage/RegisterPage patterns)
- Form uses controlled React components with `useState`
- Grouped sections with clear headings
- Back button to return to jamaah list
- Responsive design (works on mobile)

## Key Files to Modify

| File | Change |
|------|--------|
| `laporan-api.js` | Add `fetchUmrahFormOptions()` and `submitUmrahRegistration()` |
| `server.js` | Add `GET /api/umrah/form-options` and `POST /api/umrah/register` endpoints |
| `src/components/UmrahRegisterPage.tsx` | New file — registration form component |
| `src/components/DashboardLayout.tsx` | Add routing for `/dashboard/jamaah/daftar` |
| `src/components/JamaahPage.tsx` | Add "Daftar Jamaah" button for admin |

## Verification

1. **Form options loading**: Login to legacy system via dashboard, navigate to `/dashboard/jamaah/daftar`, verify all dropdowns are populated with data from legacy system
2. **Form submission**: Fill all required fields, submit, verify data appears in legacy PHP system
3. **File upload**: Submit with KTP file attached, verify file is received by legacy system
4. **Error handling**: Test with expired session, missing required fields, legacy system errors
5. **Access control**: Verify non-admin users cannot see the "Daftar Jamaah" button or access the form
6. **Redirect flow**: After successful submission, verify redirect to `/dashboard/jamaah` and sync trigger

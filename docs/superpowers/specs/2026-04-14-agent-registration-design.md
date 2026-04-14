# Agent Self-Registration System

## Context

Saat ini agent baru hanya bisa ditambahkan oleh admin melalui dashboard (`POST /api/admin/agents`). Untuk mempermudah onboarding agent baru, dibutuhkan sistem self-registration di mana calon agent mendaftar sendiri lalu menunggu approval admin sebelum bisa mengakses dashboard.

## Requirements

- Agent mengisi form registrasi publik (slug, nama, WhatsApp, email, password)
- Setelah register, agent berstatus `pending` dan belum bisa login
- Admin melihat daftar pending agents di dashboard dan bisa approve/reject
- Admin mendapat notifikasi Telegram saat ada pendaftaran baru
- Setelah di-approve, agent langsung bisa login tanpa verifikasi tambahan

---

## 1. Database Changes

### Migration: `scripts/migrate-agent-status.js`

Tambah kolom di tabel `agents`:

```sql
ALTER TABLE agents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'
  CHECK (status IN ('pending', 'active', 'rejected'));

ALTER TABLE agents ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS agents_email_unique
  ON agents (email) WHERE email IS NOT NULL AND email != '';
```

- `DEFAULT 'active'` memastikan semua agent existing tetap aktif
- Partial unique index pada email mencegah duplikasi tanpa mempengaruhi agent yang belum punya email

### Affected table: `agents`

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `status` | TEXT | `'active'` | `'pending'`, `'active'`, `'rejected'` |
| `registered_at` | TIMESTAMPTZ | null | Waktu registrasi |

---

## 2. Backend API

### 2.1 New: `POST /api/auth/register` (Public)

**Location:** `server.js`, setelah login handler (~line 676)

**Request body:**
```json
{
  "slug": "nikita",
  "name": "Nikita Travel",
  "phone": "6281234567890",
  "email": "nikita@email.com",
  "password": "min6chars"
}
```

**Logic:**
1. Validasi semua field (required, format)
2. Normalize: slug lowercase, email trim+lowercase, cleanPhone
3. Validasi slug: `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/`, 2-30 karakter
4. Block reserved slugs: `['admin', 'login', 'register', 'dashboard', 'api', 'compare', 'reset-password', 'f']`
5. Check duplikat slug (409 jika sudah ada)
6. Check duplikat email (409 jika sudah ada)
7. Hash password: `bcrypt.hash(password, 12)`
8. Insert ke `agents` dengan `status: 'pending'`, `role: 'agent'`, `registered_at: now()`
9. Invalidate `agentCache`
10. Kirim Telegram notifikasi ke admin
11. Return `{ success: true, message: 'Pendaftaran berhasil. Tunggu persetujuan admin.' }`

**Rate limiting:** In-memory Map, max 3 registrasi per IP per jam.

**Response codes:**
- 200: Berhasil
- 400: Validasi gagal
- 409: Slug/email sudah dipakai
- 429: Rate limit exceeded

### 2.2 New: `PUT /api/admin/agents/:slug/approve` (Admin)

**Location:** `server.js`, setelah DELETE agent endpoint (~line 1503)

```javascript
// Update status dari 'pending' ke 'active'
supabase.from('agents').update({ status: 'active' }).eq('slug', slug).eq('status', 'pending')
```

### 2.3 New: `PUT /api/admin/agents/:slug/reject` (Admin)

```javascript
// Update status dari 'pending' ke 'rejected'
supabase.from('agents').update({ status: 'rejected' }).eq('slug', slug).eq('status', 'pending')
```

### 2.4 Modified: `POST /api/auth/login` (line 632-676)

Setelah password valid, sebelum generate JWT, tambah pengecekan:

```javascript
if (agent.status && agent.status !== 'active') {
  if (agent.status === 'pending') {
    return res.status(403).json({ error: 'Akun Anda belum disetujui admin. Silakan tunggu.' });
  }
  if (agent.status === 'rejected') {
    return res.status(403).json({ error: 'Pendaftaran Anda ditolak. Hubungi admin untuk informasi.' });
  }
}
```

`agent.status && agent.status !== 'active'` — supaya agent existing (status null) tetap bisa login.

### 2.5 Modified: `GET /api/admin/agents` (line 1434-1442)

Tambah `status, registered_at` di `.select(...)`.

### 2.6 Modified: Public agent list (`src/data/agents.ts`)

Filter query: `.or('status.eq.active,status.is.null')` — hanya tampilkan agent aktif di halaman publik.

---

## 3. Frontend

### 3.1 New: `src/components/RegisterPage.tsx`

Halaman registrasi di `/register`. Styling mengikuti `LoginPage.tsx` (Outfit font, emerald theme, dark mode support).

**Form fields:**
1. Nama Lengkap (required)
2. Slug / Username (auto-generate dari nama, editable, validasi real-time)
3. WhatsApp (required, format 628xxx)
4. Email (required)
5. Password (required, min 6 karakter)
6. Konfirmasi Password (client-side match check)

**States:** idle → loading → success screen ("Pendaftaran berhasil! Tunggu persetujuan admin." + tombol "Kembali ke Login")

### 3.2 Modified: `src/main.tsx`

- Tambah `'register'` ke `knownFirstSegments`
- Deteksi path `/register` dan render `<RegisterPage />`

### 3.3 Modified: `src/components/LoginPage.tsx`

- Tambah link "Belum punya akun? Daftar di sini" ke `/register`
- Handle error 403 dari login: tampilkan pesan spesifik (pending vs rejected)

### 3.4 Modified: `src/components/AgentManagementPage.tsx`

- Tambah tab filter: **Semua** | **Pending** | **Active** | **Rejected**
- Tampilkan badge status di list agent (kuning=PENDING, merah=DITOLAK)
- Tombol **Approve** / **Reject** untuk agent pending (tampil di list atau di modal)
- Pending count badge di tab "Pending"

---

## 4. Telegram Notification

Saat registrasi berhasil, kirim ke admin chat via `sendTelegramMessageDirect()`:

```html
<b>Pendaftaran Agent Baru</b>

Nama: <b>{name}</b>
Username: <code>{slug}</code>
WhatsApp: {phone}
Email: {email}

<i>Buka dashboard untuk approve/reject.</i>
```

Menggunakan function existing di `server.js:3669` dan `TELEGRAM_CHAT_ID` dari env.

---

## 5. Security

| Concern | Mitigation |
|---------|-----------|
| Spam registrasi | Rate limiter: 3 per IP per jam |
| Slug hijacking | Block reserved slugs, unique PK constraint |
| Duplicate email | Partial unique index di database |
| Password brute force | bcrypt salt 12, min 6 karakter |
| Bot registrasi | Rate limiter + Telegram visibility. Tambah CAPTCHA nanti jika perlu |
| Input sanitization | Trim semua string, lowercase slug, cleanPhone untuk nomor HP |

---

## 6. Critical Files

| File | Changes |
|------|---------|
| `server.js` | Register endpoint, login check, approve/reject, admin list |
| `src/components/RegisterPage.tsx` | New file — registration form |
| `src/components/LoginPage.tsx` | Link ke register, handle 403 errors |
| `src/components/AgentManagementPage.tsx` | Status filter, badges, approve/reject UI |
| `src/main.tsx` | Route /register |
| `src/data/agents.ts` | Filter public agent list |
| `scripts/migrate-agent-status.js` | New file — database migration |

---

## 7. Verification

1. **Register flow:** Buka `/register`, isi form, submit → dapat pesan sukses
2. **Coba login:** Gunakan akun baru → dapat error 403 "belum disetujui"
3. **Telegram:** Cek admin chat mendapat notifikasi
4. **Admin approve:** Buka dashboard admin → tab Pending → klik Approve
5. **Login lagi:** Akun baru sekarang bisa login
6. **Public list:** Agent pending TIDAK muncul di halaman publik
7. **Reject flow:** Register agent lain → admin reject → coba login → dapat error "ditolak"
8. **Rate limit:** Register 4x dari IP sama → ke-4 kena 429
9. **Duplikat:** Register dengan slug/email yang sudah ada → dapat error 409
10. **Existing agents:** Semua agent lama tetap bisa login normal (status null = active)

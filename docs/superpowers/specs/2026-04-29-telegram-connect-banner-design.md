# Telegram Connect Banner — Dashboard Home

**Date:** 2026-04-29
**Status:** Approved (pending implementation)

## Goal

Tampilkan banner peringatan yang menonjol di Dashboard Home ketika agent yang sedang login belum menghubungkan akun Telegram-nya. Tujuannya: meningkatkan adopsi notifikasi Telegram supaya agent tidak melewatkan event keberangkatan/kepulangan jamaah.

## Scope

- **In scope:** Komponen banner baru di Home tab Dashboard, terhubung ke endpoint status Telegram yang sudah ada.
- **Out of scope:** Perubahan flow connect Telegram itu sendiri (sudah ada di Settings → Telegram), perubahan endpoint backend, perubahan halaman selain Home.

## Component & Location

Komponen baru: `src/components/TelegramConnectBanner.tsx` (file standalone).

Di-render di `src/components/DashboardLayout.tsx` di area Home, **tepat di atas** `<CalendarInsight />` (saat ini sekitar line 750). Hanya muncul di tab Home — tidak di tab lain.

Urutan vertikal akhir di Home:

1. `TelegramConnectBanner` (baru) — hanya jika belum terhubung
2. `CalendarInsight` (existing)
3. Grid menu

Saat user sudah connect, banner hilang dan `CalendarInsight` kembali ke posisi paling atas seperti sebelumnya.

## Data & State

**Source of truth:** endpoint yang sudah ada `GET /api/telegram/status` → `{ connected: boolean, chatId: string | null, hasCredentials: boolean }`.

**Render logic:**

| State | Render |
|---|---|
| Loading awal | `null` (jangan flash banner) |
| Fetch error / non-success | `null` (silent failure) |
| `connected === true` | `null` |
| `connected === false` (apapun nilai `hasCredentials`) | banner tampil |

Field `hasCredentials` tidak mengubah tampilan banner — tombol CTA selalu mengarah ke `/dashboard/settings/telegram`, biar halaman Settings yang handle nuansa "belum login bot" vs "sudah login tapi belum link chat" (logic itu sudah ada di `DashboardProfile.tsx`).

**Lifecycle:**

- Fetch saat komponen mount (yang berarti hanya saat user di tab Home).
- Re-fetch saat `document.visibilityState === 'visible'` — pola sama dengan `DashboardProfile.tsx:86`. Tujuannya: kalau user baru saja connect di tab lain, balik ke Dashboard banner langsung hilang.
- Tidak ada interval polling.
- Tidak ada dismissal — persistent sampai connected.

## Visual Treatment

Brand Telegram + sentuhan atensi tinggi.

**Container:**

- Background: gradient dari `#229ED9` ke `#1A7FB5` (Telegram blue → darker)
- Border: `border border-white/10`
- Shadow: `shadow-lg shadow-cyan-500/20` (sedikit lebih kuat di dark mode untuk kontras)
- Radius: `rounded-xl`
- Padding: `p-4`

**Layout (desktop / ≥sm):** horizontal flex
`[ikon] [judul + subteks (flex-1)] [tombol CTA]`

**Layout (mobile / <sm):** ikon+teks di baris atas, tombol full-width di baris bawah.

**Ikon:**

- Lingkaran putih `bg-white` 40×40
- Icon `Send` (lucide-react) dengan warna Telegram-blue di dalam lingkaran
- Subtle pulse: ring `animate-ping` putih dengan opacity rendah di luar lingkaran (jangan terlalu mencolok — accent saja)

**Teks (putih):**

- Judul: `Telegram belum terhubung` — `text-sm font-bold`
- Subteks: `Aktifkan untuk terima notifikasi keberangkatan jamaah` — `text-xs text-white/80`

**Tombol CTA:**

- Background `bg-white`, teks Telegram-blue, `font-semibold`, `rounded-lg`, padding compact
- Label: `Hubungkan`
- Hover: opacity-90 atau bg slightly tinted
- onClick: navigate ke `/dashboard/settings/telegram` mengikuti pola navigasi existing di `DashboardLayout` (`navigateTab('settings')` + push state ke sub-route telegram)

**Dark mode:** warna gradient sama (warna brand tidak di-invert), shadow sedikit lebih kuat.

## Error Handling

- Fetch gagal / network error / non-2xx → render `null`. Tidak ada toast, tidak ada placeholder error.
- Auth belum ready (401) → silent fail, akan re-fetch saat visibility kembali.
- Click CTA saat fetch sedang berjalan → tetap navigate, tidak diblokir.

## Testing

- Smoke check manual: state `connected=false` → banner tampil; state `connected=true` → null; state error → null.
- Unit test komponen kalau project memiliki test infra untuk komponen serupa; kalau tidak, skip dan dokumentasikan di plan.

## Files Touched

- **New:** `src/components/TelegramConnectBanner.tsx`
- **Modified:** `src/components/DashboardLayout.tsx` — import + render banner di atas `CalendarInsight` di Home view

## Non-Goals

- Tidak menambah dismissal / "remind me later".
- Tidak mengubah `CalendarInsight`.
- Tidak duplicate logic Settings/Telegram di banner.
- Tidak menambah indikator badge pada tile menu Settings (bisa jadi follow-up terpisah).

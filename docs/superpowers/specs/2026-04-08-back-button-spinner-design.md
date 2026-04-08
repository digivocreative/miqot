# Back Button Spinner Animation

## Context

Saat user menekan tombol Back yang melakukan navigasi halaman, tidak ada feedback visual bahwa navigasi sedang diproses. Ini membuat UX terasa tidak responsif, terutama pada koneksi lambat. Perlu ditambahkan spinner animation pada setiap tombol Back navigasi agar user tahu bahwa aksi mereka sudah diterima.

## Scope

Hanya tombol Back yang melakukan **navigasi halaman** (bukan state reset lokal):

| File | Tombol | Navigasi Method |
|------|--------|-----------------|
| `src/App.tsx` | Header "Kembali" (SVG arrow) | `window.location.href` langsung |
| `src/components/KalkulasiPage.tsx` | Header ArrowLeft | `window.location.href` + 280ms delay |
| `src/components/ComparePage.tsx` | Header ArrowLeft | `window.location.href` + 280ms delay |
| `src/components/DashboardLayout.tsx` | Header ChevronLeft | `navigateTab()` / `pushState` |
| `src/components/ResetPasswordPage.tsx` | 3x "Kembali ke Login" | `window.location.href` langsung |

**Excluded:** LoginPage (state reset), AgentManagementPage (dialog dismiss) — transisi instan, spinner tidak diperlukan.

## Approach: Inline State per Component

Tidak membuat komponen baru. Setiap file mendapat pola yang sama:

### Pattern

```tsx
const [isGoingBack, setIsGoingBack] = useState(false);

// Di onClick handler:
onClick={() => {
  setIsGoingBack(true);
  // ... existing navigation logic unchanged
}}

// Di JSX icon:
{isGoingBack ? (
  <Loader2 size={18} className="animate-spin" />
) : (
  <ArrowLeft size={18} />  // atau ChevronLeft / SVG yang ada
)}

// Disable tombol saat spinning:
disabled={isGoingBack}
```

### Rationale

- Pola `Loader2 + animate-spin` sudah dipakai di 30+ file dalam project ini
- Setiap tombol Back punya behavior navigasi berbeda (delay, pushState, langsung), abstraksi shared component akan over-engineered
- Perubahan minimal dan terisolasi per file

## Verification

1. Klik setiap tombol Back di semua 5 halaman
2. Pastikan spinner muncul menggantikan icon arrow
3. Pastikan tombol disabled saat spinner aktif (tidak bisa double-click)
4. Pastikan navigasi tetap berjalan normal
5. `npm run build` harus sukses tanpa error

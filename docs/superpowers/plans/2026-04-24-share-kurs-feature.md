# Share Kurs Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan tombol "Bagikan" di widget Kurs Hari Ini yang buka modal full-screen dengan 4 template gambar 1080×1080 (Minimalist, Islamic, Bold, Premium) berisi info kurs USD/SAR + data agent (foto, nama, WA, website) + logo Alhijaz, plus aksi Download / Bagikan (native) / Salin Caption.

**Architecture:** Modal full-screen lazy-loaded di `DashboardLayout`. 4 template sebagai pure component renderer di file terpisah, render pada ukuran fix 1080×1080 lalu preview pakai `transform: scale()`. Export via `snapdom` (sudah dipakai di `BusinessCardPage`) dengan scale 2x → 2160×2160 PNG. Native share via `navigator.share` dengan fallback disembunyikan kalau tidak tersedia.

**Tech Stack:** React 18 + TypeScript, Vite, Tailwind, `@zumer/snapdom` (sudah terinstall), `lucide-react`.

**Reference spec:** [docs/superpowers/specs/2026-04-24-share-kurs-feature-design.md](../specs/2026-04-24-share-kurs-feature-design.md)

**Testing approach:** Codebase ini tidak punya unit test framework untuk komponen React (hanya `node:test` untuk util `lib/`). Ikuti konvensi existing: verifikasi manual via `npm run dev` di browser setelah setiap task. Playwright tersedia kalau mau, tapi overkill untuk UI ini — plan pakai manual QA.

---

## File Structure

**New files:**
- `src/components/KursShareTemplates.tsx` — 4 template renderer (pure components, render 1080×1080 fixed)
- `src/components/ShareKursModal.tsx` — Container modal: state picker, 3 tombol aksi, snapdom export

**Modified:**
- `index.html` — tambah Google Font `DM Serif Display` + `Amiri`
- `src/components/DashboardLayout.tsx`:
  - Tambah import `Share2` dari `lucide-react`
  - Lazy import `ShareKursModal`
  - Tambah state `showShareKurs`
  - Tambah tombol icon-only di header widget kurs (antara subtitle dan "Hitung Kurs")
  - Render `<ShareKursModal />` di akhir JSX dashboard

**Tidak diubah:**
- `server.js` `/api/kurs` — data sudah sesuai
- `agentData` shape — sudah punya `slug, name, phone, email, photo, website`

---

## Task 1: Add Google Font loading

**Files:**
- Modify: `index.html:63` (tambah 1 line link setelah Inter font link)

- [ ] **Step 1: Baca index.html bagian head**

Run: `sed -n '55,70p' index.html`
Expected: lihat existing `<link>` untuk Inter font.

- [ ] **Step 2: Tambah font link**

Edit `index.html`, setelah baris Inter `<link>` (sekitar L63), tambahkan:

```html
    <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Amiri:wght@400;700&display=swap" rel="stylesheet">
```

- [ ] **Step 3: Verifikasi via dev server**

Run: `npm run dev` (kalau belum jalan)
Buka DevTools → Network → filter "font" → reload → confirm `DMSerifDisplay` + `Amiri` font files terload.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(kurs-share): load DM Serif Display + Amiri fonts for share templates"
```

---

## Task 2: Create KursShareTemplates.tsx — Minimalist template only

Build incrementally: implement T1 Minimalist dulu, verifikasi lewat preview, lalu tambah template lain di Task 5.

**Files:**
- Create: `src/components/KursShareTemplates.tsx`

- [ ] **Step 1: Create file dengan types + helpers + T1 Minimalist**

Create `src/components/KursShareTemplates.tsx`:

```tsx
import type React from 'react';

export interface KursTemplateProps {
  kurs: { usd: number; sar: number; updatedAt: string };
  agent: { name: string; phone: string; photo: string; slug: string };
}

export type KursTemplateId = 'minimalist' | 'islamic' | 'bold' | 'premium';

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

export function formatKurs(rate: number): string {
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rate);
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return '62' + digits.slice(1);
  return digits;
}

function avatarFallback(name: string): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=192`;
}

// Canvas wrapper — semua template pakai ini agar ukuran 1080×1080 konsisten
function CanvasFrame({ background, children }: { background: string; children: React.ReactNode }) {
  return (
    <div style={{
      width: 1080,
      height: 1080,
      background,
      position: 'relative',
      overflow: 'hidden',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// T1 — Minimalist
// ═══════════════════════════════════════════════════════════════

function Minimalist({ kurs, agent }: KursTemplateProps) {
  const photo = agent.photo || avatarFallback(agent.name);
  const wa = normalizePhone(agent.phone);
  const web = `${agent.slug || 'agent'}.alhijaz.co`;

  return (
    <CanvasFrame background="#FFFFFF">
      {/* Header */}
      <div style={{ padding: '64px 64px 0 64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <img src="/logo-alhijaz-besar.svg" style={{ height: 56 }} alt="Alhijaz" />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#059669', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            Kurs Bank Mandiri
          </div>
          <div style={{ fontSize: 16, color: '#6B7280', marginTop: 6 }}>{kurs.updatedAt}</div>
        </div>
      </div>

      {/* Body — 2 rate cards */}
      <div style={{ padding: '48px 64px', display: 'flex', gap: 24, marginTop: 64 }}>
        <RateCardLight flag="🇺🇸" label="USD" rate={kurs.usd} />
        <RateCardLight flag="🇸🇦" label="SAR" rate={kurs.sar} />
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, borderTop: '2px solid #10B981', padding: '40px 64px', display: 'flex', alignItems: 'center', gap: 24, background: '#FFFFFF' }}>
        <img src={photo} style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '3px solid #ECFDF5' }} alt="" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>{agent.name}</div>
          <div style={{ fontSize: 18, color: '#4B5563', marginTop: 6 }}>wa.me/{wa}</div>
          <div style={{ fontSize: 18, color: '#059669', marginTop: 2 }}>{web}</div>
        </div>
      </div>
    </CanvasFrame>
  );
}

function RateCardLight({ flag, label, rate }: { flag: string; label: string; rate: number }) {
  return (
    <div style={{ flex: 1, background: '#F9FAFB', borderRadius: 24, padding: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <span style={{ fontSize: 64, lineHeight: 1 }}>{flag}</span>
        <span style={{ fontSize: 26, fontWeight: 600, color: '#6B7280', letterSpacing: '0.1em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 88, fontWeight: 800, color: '#111827', fontFamily: '"SF Mono", Menlo, monospace', lineHeight: 1, letterSpacing: '-0.02em' }}>
        {formatKurs(rate)}
      </div>
      <div style={{ fontSize: 20, color: '#9CA3AF', marginTop: 12 }}>Rupiah</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Registry (stub — diisi penuh di Task 5)
// ═══════════════════════════════════════════════════════════════

export const KURS_TEMPLATES: Array<{
  id: KursTemplateId;
  name: string;
  Renderer: React.FC<KursTemplateProps>;
}> = [
  { id: 'minimalist', name: 'Minimalist', Renderer: Minimalist },
];
```

- [ ] **Step 2: Verifikasi compile**

Run: `npm run build` (atau biarkan vite dev HMR menangkap error)
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/KursShareTemplates.tsx
git commit -m "feat(kurs-share): scaffold KursShareTemplates with Minimalist template"
```

---

## Task 3: Create ShareKursModal.tsx dengan Download action

**Files:**
- Create: `src/components/ShareKursModal.tsx`

- [ ] **Step 1: Create file**

Create `src/components/ShareKursModal.tsx`:

```tsx
import { useState, useRef, useEffect, useMemo } from 'react';
import { X, Download, Share2, Copy } from 'lucide-react';
import {
  KURS_TEMPLATES,
  formatKurs,
  normalizePhone,
  type KursTemplateId,
  type KursTemplateProps,
} from './KursShareTemplates';
import { trackEvent } from '../utils/analytics';

export interface ShareKursModalProps {
  open: boolean;
  onClose: () => void;
  kurs: { usd: number; sar: number; updatedAt: string };
  agent: { name: string; phone: string; photo: string; slug: string };
}

const PREVIEW_WIDTH = 360;
const CANVAS_SIZE = 1080;
const PREVIEW_SCALE = PREVIEW_WIDTH / CANVAS_SIZE;
const THUMB_WIDTH = 72;
const THUMB_SCALE = THUMB_WIDTH / CANVAS_SIZE;

export default function ShareKursModal({ open, onClose, kurs, agent }: ShareKursModalProps) {
  const [selectedId, setSelectedId] = useState<KursTemplateId>('minimalist');
  const [isExporting, setIsExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    if (open) trackEvent('feature', 'open_share_kurs');
  }, [open]);

  const templateProps: KursTemplateProps = useMemo(() => ({ kurs, agent }), [kurs, agent]);
  const current = KURS_TEMPLATES.find(t => t.id === selectedId) || KURS_TEMPLATES[0];
  const Renderer = current.Renderer;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const waitForFonts = async () => {
    try { await (document as any).fonts?.ready; } catch {}
  };

  const yyyymmdd = () => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  };

  const handleDownload = async () => {
    if (!exportRef.current || isExporting) return;
    setIsExporting(true);
    try {
      await waitForFonts();
      const { snapdom } = await import('@zumer/snapdom');
      const result = await snapdom(exportRef.current, { scale: 2 });
      await result.download({ type: 'png', filename: `kurs-${selectedId}-${yyyymmdd()}` });
      trackEvent('action', 'download_share_kurs', { template: selectedId });
    } catch (e) {
      console.error('[ShareKurs] Download gagal:', e);
      showToast('Gagal generate gambar, coba lagi');
    } finally {
      setIsExporting(false);
    }
  };

  // Placeholder — diisi di Task 6
  const handleShare = async () => {};
  const handleCopyCaption = async () => {};

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-slate-800 active:scale-95 transition">
            <X size={20} className="text-gray-700 dark:text-slate-300" />
          </button>
          <div className="text-sm font-bold text-gray-800 dark:text-white">Bagikan Kurs</div>
          <div className="w-9" />
        </div>

        {/* Preview */}
        <div className="px-5 pt-5 pb-4 flex justify-center">
          <div style={{ width: PREVIEW_WIDTH, height: PREVIEW_WIDTH, position: 'relative', borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
            {/* Scaler wrapper — apply transform only for visuals */}
            <div style={{ transform: `scale(${PREVIEW_SCALE})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
              {/* exportRef on unscaled 1080×1080 element so snapdom captures full size */}
              <div ref={exportRef}>
                <Renderer {...templateProps} />
              </div>
            </div>
          </div>
        </div>

        {/* Thumbnail picker */}
        <div className="px-5 pb-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2">Pilih Desain</div>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
            {KURS_TEMPLATES.map(t => {
              const T = t.Renderer;
              const active = t.id === selectedId;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`flex-shrink-0 rounded-xl overflow-hidden transition-all active:scale-95 ${active ? 'ring-2 ring-emerald-500' : 'ring-1 ring-gray-200 dark:ring-slate-700'}`}
                  style={{ width: THUMB_WIDTH, height: THUMB_WIDTH, position: 'relative' }}
                  aria-label={t.name}
                >
                  <div style={{ transform: `scale(${THUMB_SCALE})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
                    <T {...templateProps} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-6 space-y-2">
          <div className={`grid ${canShare ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
            <button
              onClick={handleDownload}
              disabled={isExporting}
              className="flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-bold shadow-md shadow-emerald-500/20 active:scale-95 transition"
            >
              <Download size={16} strokeWidth={2.5} />
              {isExporting ? 'Menyimpan...' : 'Download'}
            </button>
            {canShare && (
              <button
                onClick={handleShare}
                disabled={isExporting}
                className="flex items-center justify-center gap-2 py-3 rounded-xl border border-emerald-500 text-emerald-600 dark:text-emerald-400 text-sm font-bold hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-50 active:scale-95 transition"
              >
                <Share2 size={16} strokeWidth={2.5} />
                Bagikan
              </button>
            )}
          </div>
          <button
            onClick={handleCopyCaption}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-slate-800 active:scale-95 transition"
          >
            <Copy size={16} strokeWidth={2.5} />
            Salin Caption
          </button>
        </div>

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-xl">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verifikasi compile**

Run: `npx tsc --noEmit` (atau jalankan dev server, biarkan TS checker catch error)
Expected: no TypeScript errors. Catatan: `handleShare` dan `handleCopyCaption` sengaja kosong dulu — akan diisi di Task 6.

- [ ] **Step 3: Commit**

```bash
git add src/components/ShareKursModal.tsx
git commit -m "feat(kurs-share): create ShareKursModal with preview + download action"
```

---

## Task 4: Wire "Bagikan" button ke DashboardLayout

**Files:**
- Modify: `src/components/DashboardLayout.tsx`

- [ ] **Step 1: Tambah import Share2 + lazy ShareKursModal**

Di [src/components/DashboardLayout.tsx:1-8](../../../src/components/DashboardLayout.tsx#L1-L8), tambahkan `Share2` ke daftar import dari `lucide-react`:

```tsx
import {
  Calculator, ArrowLeftRight, Settings,
  LogOut, Shield, Users, Moon, Sun, ChevronLeft,
  BarChart3, Loader2, Sparkles,
  CalendarRange, ExternalLink, TrendingUp, Mic, CreditCard,
  DollarSign, ChevronRight, Globe, Share2,
} from 'lucide-react';
```

Lalu di bagian import `react`, tambahkan `lazy, Suspense`:

```tsx
import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
```

Setelah import lain (sekitar line 30 setelah `import { trackEvent } from '../utils/analytics';`), tambahkan:

```tsx
const ShareKursModal = lazy(() => import('./ShareKursModal'));
```

- [ ] **Step 2: Tambah state showShareKurs**

Di sekitar line 270 (dekat state `kursData`), tambahkan:

```tsx
const [showShareKurs, setShowShareKurs] = useState(false);
```

- [ ] **Step 3: Tambah tombol Share di header widget kurs**

Edit [src/components/DashboardLayout.tsx:776-788](../../../src/components/DashboardLayout.tsx#L776-L788). Ganti blok single button "Hitung Kurs" jadi dua button berdampingan. Cari blok:

```tsx
                <button
                  onClick={() => {
                    window.history.pushState({}, '', '/dashboard/ai-tools/kurs');
                    document.title = 'Kurs Hari Ini';
                    setActiveTab('home');
                    setTimeout(() => setActiveTab('ai-tools'), 0);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors active:scale-95"
                >
                  Hitung Kurs
                  <ChevronRight size={10} strokeWidth={2.5} />
                </button>
```

Ganti dengan:

```tsx
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setShowShareKurs(true)}
                    aria-label="Bagikan kurs"
                    className="w-7 h-7 rounded-lg border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors active:scale-95"
                  >
                    <Share2 size={12} strokeWidth={2.5} />
                  </button>
                  <button
                    onClick={() => {
                      window.history.pushState({}, '', '/dashboard/ai-tools/kurs');
                      document.title = 'Kurs Hari Ini';
                      setActiveTab('home');
                      setTimeout(() => setActiveTab('ai-tools'), 0);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors active:scale-95"
                  >
                    Hitung Kurs
                    <ChevronRight size={10} strokeWidth={2.5} />
                  </button>
                </div>
```

- [ ] **Step 4: Render modal di akhir dashboard JSX**

Cari penutup `</div>` dari root dashboard container. Lebih aman: cari blok `{showStatAlert && (` sekitar line 828, dan tambahkan blok modal **sebelum** blok itu:

```tsx
        {/* ── Share Kurs Modal ── */}
        {kursData && (
          <Suspense fallback={null}>
            <ShareKursModal
              open={showShareKurs}
              onClose={() => setShowShareKurs(false)}
              kurs={{ usd: kursData.usd!, sar: kursData.sar ?? 0, updatedAt: kursData.updatedAt }}
              agent={{
                name: agentData.name,
                phone: agentData.phone,
                photo: agentData.photo,
                slug: agentData.slug,
              }}
            />
          </Suspense>
        )}
```

Note: `kursData.usd` dipastikan non-null via guard `kursData &&` plus existing logic di line 280 yang hanya set state kalau `usdRate !== null`. `kursData.sar ?? 0` handle kasus SAR null (template akan tetap render angka 0 — edge case langka karena Bank Mandiri selalu punya SAR).

- [ ] **Step 5: Verifikasi di browser**

Run: `npm run dev` (kalau belum)
Buka `http://localhost:5173/dashboard`, login sebagai agent biasa (non-admin), scroll ke widget Kurs Hari Ini.
Expected:
- Icon Share2 kecil muncul di kiri tombol "Hitung Kurs"
- Click icon Share2 → modal slide up dari bawah
- Preview Minimalist muncul dengan data kurs + agent yang benar (foto, nama, WA, website)
- Tombol Download berfungsi → PNG tersave, buka di viewer → confirm layout 2160×2160 benar
- Close via X → modal hilang

- [ ] **Step 6: Commit**

```bash
git add src/components/DashboardLayout.tsx
git commit -m "feat(kurs-share): wire Bagikan button + modal into dashboard widget"
```

---

## Task 5: Tambah 3 template sisanya (Islamic, Bold, Premium)

**Files:**
- Modify: `src/components/KursShareTemplates.tsx`

- [ ] **Step 1: Tambah T2 Islamic**

Di `src/components/KursShareTemplates.tsx`, tambahkan setelah fungsi `RateCardLight` dan sebelum `KURS_TEMPLATES`:

```tsx
// ═══════════════════════════════════════════════════════════════
// T2 — Islamic
// ═══════════════════════════════════════════════════════════════

// Arabic geometric pattern sebagai data URL
const ISLAMIC_PATTERN = `url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23ffffff' stroke-width='1' opacity='0.15'%3E%3Cpath d='M40 0L80 40L40 80L0 40Z'/%3E%3Cpath d='M40 12L68 40L40 68L12 40Z'/%3E%3Cpath d='M40 24L56 40L40 56L24 40Z'/%3E%3C/g%3E%3C/svg%3E")`;

function Islamic({ kurs, agent }: KursTemplateProps) {
  const photo = agent.photo || avatarFallback(agent.name);
  const wa = normalizePhone(agent.phone);
  const web = `${agent.slug || 'agent'}.alhijaz.co`;

  return (
    <CanvasFrame background="linear-gradient(135deg, #047857 0%, #022C22 100%)">
      {/* Pattern overlay */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: ISLAMIC_PATTERN, backgroundRepeat: 'repeat', opacity: 0.5 }} />

      {/* Logo pill top-right */}
      <div style={{ position: 'absolute', top: 48, right: 48, background: '#FFFFFF', borderRadius: 14, padding: '10px 18px', display: 'flex', alignItems: 'center' }}>
        <img src="/logo-alhijaz-besar.svg" style={{ height: 36 }} alt="Alhijaz" />
      </div>

      {/* Header */}
      <div style={{ padding: '96px 64px 0 64px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{ fontFamily: '"Amiri", serif', fontSize: 40, color: '#A7F3D0', lineHeight: 1.2 }}>
          بسم الله الرحمن الرحيم
        </div>
        <div style={{ fontSize: 22, color: '#FFFFFF', letterSpacing: '0.3em', fontWeight: 700, marginTop: 36, textTransform: 'uppercase' }}>
          Kurs Bank Mandiri
        </div>
        <div style={{ fontSize: 16, color: '#A7F3D0', marginTop: 8 }}>{kurs.updatedAt}</div>
      </div>

      {/* Rate cards */}
      <div style={{ padding: '56px 64px', display: 'flex', gap: 24, marginTop: 12, position: 'relative', zIndex: 1 }}>
        <RateCardGlass flag="🇺🇸" label="USD" rate={kurs.usd} />
        <RateCardGlass flag="🇸🇦" label="SAR" rate={kurs.sar} />
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '40px 64px', display: 'flex', alignItems: 'center', gap: 24, zIndex: 1 }}>
        <img src={photo} style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '3px solid #6EE7B7' }} alt="" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.2 }}>{agent.name}</div>
          <div style={{ fontSize: 18, color: '#A7F3D0', marginTop: 6 }}>wa.me/{wa}</div>
          <div style={{ fontSize: 18, color: '#6EE7B7', marginTop: 2 }}>{web}</div>
        </div>
      </div>
    </CanvasFrame>
  );
}

function RateCardGlass({ flag, label, rate }: { flag: string; label: string; rate: number }) {
  return (
    <div style={{ flex: 1, background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', borderRadius: 24, padding: 40, backdropFilter: 'blur(4px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <span style={{ fontSize: 64, lineHeight: 1 }}>{flag}</span>
        <span style={{ fontSize: 26, fontWeight: 600, color: '#A7F3D0', letterSpacing: '0.1em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 88, fontWeight: 800, color: '#FFFFFF', fontFamily: '"SF Mono", Menlo, monospace', lineHeight: 1, letterSpacing: '-0.02em' }}>
        {formatKurs(rate)}
      </div>
      <div style={{ fontSize: 20, color: '#6EE7B7', marginTop: 12 }}>Rupiah</div>
    </div>
  );
}
```

- [ ] **Step 2: Tambah T3 Bold**

Setelah `RateCardGlass`:

```tsx
// ═══════════════════════════════════════════════════════════════
// T3 — Bold
// ═══════════════════════════════════════════════════════════════

function Bold({ kurs, agent }: KursTemplateProps) {
  const photo = agent.photo || avatarFallback(agent.name);
  const wa = normalizePhone(agent.phone);
  const web = `${agent.slug || 'agent'}.alhijaz.co`;

  return (
    <CanvasFrame background="#0F172A">
      {/* Header */}
      <div style={{ padding: '64px 64px 0 64px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 20, color: '#34D399', letterSpacing: '0.3em', fontWeight: 700, textTransform: 'uppercase' }}>
            Kurs Bank Mandiri
          </div>
          <div style={{ fontSize: 14, color: '#64748B', marginTop: 8, letterSpacing: '0.1em' }}>{kurs.updatedAt}</div>
        </div>
        <div style={{ background: '#FFFFFF', borderRadius: 12, padding: '8px 16px', display: 'flex', alignItems: 'center' }}>
          <img src="/logo-alhijaz-besar.svg" style={{ height: 32 }} alt="Alhijaz" />
        </div>
      </div>

      {/* Stacked rates */}
      <div style={{ padding: '48px 64px 0 64px' }}>
        <BoldRate label="USD" rate={kurs.usd} />
        <div style={{ height: 1, background: '#1E293B', margin: '32px 0' }} />
        <BoldRate label="SAR" rate={kurs.sar} />
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, borderTop: '1px solid #10B981', padding: '36px 64px', display: 'flex', alignItems: 'center', gap: 24 }}>
        <img src={photo} style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid #10B981' }} alt="" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.2 }}>{agent.name}</div>
          <div style={{ fontSize: 16, color: '#94A3B8', marginTop: 4 }}>wa.me/{wa} · {web}</div>
        </div>
      </div>
    </CanvasFrame>
  );
}

function BoldRate({ label, rate }: { label: string; rate: number }) {
  return (
    <div>
      <div style={{ fontSize: 20, color: '#94A3B8', letterSpacing: '0.2em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 128, fontWeight: 800, color: '#FFFFFF', fontFamily: '"SF Mono", Menlo, monospace', lineHeight: 1, letterSpacing: '-0.03em', marginTop: 8 }}>
        {formatKurs(rate)}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Tambah T4 Premium**

Setelah `BoldRate`:

```tsx
// ═══════════════════════════════════════════════════════════════
// T4 — Premium
// ═══════════════════════════════════════════════════════════════

const GOLD = '#C9A961';

function Premium({ kurs, agent }: KursTemplateProps) {
  const photo = agent.photo || avatarFallback(agent.name);
  const wa = normalizePhone(agent.phone);
  const web = `${agent.slug || 'agent'}.alhijaz.co`;

  return (
    <CanvasFrame background="#FDF8F0">
      {/* Gold frame */}
      <div style={{ position: 'absolute', top: 32, left: 32, right: 32, bottom: 32, border: `3px solid ${GOLD}`, borderRadius: 4, pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ padding: '80px 80px 0 80px', textAlign: 'center' }}>
        <img src="/logo-alhijaz-besar.svg" style={{ height: 64, margin: '0 auto' }} alt="Alhijaz" />
        <div style={{ fontFamily: '"DM Serif Display", serif', fontSize: 30, color: GOLD, letterSpacing: '0.15em', marginTop: 32, textTransform: 'uppercase' }}>
          Kurs Bank Mandiri
        </div>
        <div style={{ height: 1, background: GOLD, maxWidth: 200, margin: '20px auto' }} />
        <div style={{ fontFamily: '"DM Serif Display", serif', fontSize: 20, color: '#475569', fontStyle: 'italic' }}>{kurs.updatedAt}</div>
      </div>

      {/* Rate row */}
      <div style={{ padding: '64px 80px', display: 'flex', alignItems: 'stretch', marginTop: 24 }}>
        <PremiumRate label="USD" rate={kurs.usd} />
        <div style={{ width: 1, background: GOLD, margin: '0 32px' }} />
        <PremiumRate label="SAR" rate={kurs.sar} />
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: 60, left: 80, right: 80, display: 'flex', alignItems: 'center', gap: 24 }}>
        <img src={photo} style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `3px solid ${GOLD}`, boxShadow: `0 0 0 2px #FDF8F0, 0 0 0 4px ${GOLD}` }} alt="" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: '"DM Serif Display", serif', fontSize: 26, color: '#0F172A', lineHeight: 1.2 }}>{agent.name}</div>
          <div style={{ fontSize: 16, color: '#64748B', marginTop: 4 }}>wa.me/{wa}</div>
          <div style={{ fontSize: 16, color: GOLD, marginTop: 2 }}>{web}</div>
        </div>
      </div>
    </CanvasFrame>
  );
}

function PremiumRate({ label, rate }: { label: string; rate: number }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontFamily: '"DM Serif Display", serif', fontStyle: 'italic', fontSize: 26, color: GOLD, letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontFamily: '"DM Serif Display", serif', fontSize: 104, color: '#0F172A', lineHeight: 1, marginTop: 16, letterSpacing: '-0.02em' }}>
        {formatKurs(rate)}
      </div>
      <div style={{ fontSize: 16, color: '#94A3B8', marginTop: 8, letterSpacing: '0.1em' }}>RUPIAH</div>
    </div>
  );
}
```

- [ ] **Step 4: Update registry**

Ganti `KURS_TEMPLATES` yang hanya punya satu entry (dari Task 2) dengan:

```tsx
export const KURS_TEMPLATES: Array<{
  id: KursTemplateId;
  name: string;
  Renderer: React.FC<KursTemplateProps>;
}> = [
  { id: 'minimalist', name: 'Minimalist', Renderer: Minimalist },
  { id: 'islamic', name: 'Islamic', Renderer: Islamic },
  { id: 'bold', name: 'Bold', Renderer: Bold },
  { id: 'premium', name: 'Premium', Renderer: Premium },
];
```

- [ ] **Step 5: Verifikasi di browser**

Run: dev server sudah jalan
Reload dashboard, buka modal.
Expected:
- 4 thumbnail muncul di picker
- Tap T2 → preview berubah gradient emerald dengan kaligrafi Arabic (pastikan font Amiri terload, tidak fallback ke blocky system font)
- Tap T3 → preview navy dengan angka raksasa
- Tap T4 → preview cream dengan gold frame, angka serif
- Download tiap template → confirm PNG render benar (foto tidak missing, font intact, warna sesuai)

- [ ] **Step 6: Commit**

```bash
git add src/components/KursShareTemplates.tsx
git commit -m "feat(kurs-share): add Islamic, Bold, Premium templates"
```

---

## Task 6: Wire Share (native) + Copy Caption actions

**Files:**
- Modify: `src/components/ShareKursModal.tsx`

- [ ] **Step 1: Isi handleShare**

Ganti `const handleShare = async () => {};` dengan:

```tsx
  const handleShare = async () => {
    if (!exportRef.current || isExporting) return;
    setIsExporting(true);
    try {
      await waitForFonts();
      const { snapdom } = await import('@zumer/snapdom');
      const result = await snapdom(exportRef.current, { scale: 2 });
      const blob = await result.toBlob({ type: 'png' });
      const file = new File([blob], `kurs-${selectedId}-${yyyymmdd()}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        trackEvent('action', 'share_kurs', { template: selectedId });
      } else {
        // Fallback — trigger download
        await result.download({ type: 'png', filename: `kurs-${selectedId}-${yyyymmdd()}` });
        showToast('Share tidak didukung, gambar diunduh');
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error('[ShareKurs] Share gagal:', e);
        showToast('Share gagal, coba lagi');
      }
    } finally {
      setIsExporting(false);
    }
  };
```

- [ ] **Step 2: Isi handleCopyCaption**

Ganti `const handleCopyCaption = async () => {};` dengan:

```tsx
  const handleCopyCaption = async () => {
    const wa = normalizePhone(agent.phone);
    const web = `${agent.slug || 'agent'}.alhijaz.co`;
    const caption = [
      `📊 Update Kurs Bank Mandiri — ${kurs.updatedAt}`,
      '',
      `💵 USD: Rp ${formatKurs(kurs.usd)}`,
      `🇸🇦 SAR: Rp ${formatKurs(kurs.sar)}`,
      '',
      'Info paket Umroh & Haji:',
      agent.name,
      `wa.me/${wa}`,
      web,
    ].join('\n');

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(caption);
      } else {
        // Legacy fallback
        const ta = document.createElement('textarea');
        ta.value = caption;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      showToast('Caption tersalin');
      trackEvent('action', 'copy_kurs_caption');
    } catch (e) {
      console.error('[ShareKurs] Copy gagal:', e);
      showToast('Gagal menyalin caption');
    }
  };
```

- [ ] **Step 3: Verifikasi di browser (desktop + mobile)**

Desktop (Chrome):
- `navigator.share` biasanya **tidak** ada di Chrome desktop tanpa flag → tombol "Bagikan" harus tersembunyi, grid tombol jadi 1 kolom Download full-width
- Click Salin Caption → toast "Caption tersalin" → paste di notes/WhatsApp Web → confirm format

Mobile (iOS Safari / Android Chrome — test via ngrok atau deploy preview):
- `navigator.share` ada → tombol Bagikan muncul → tap → native share sheet buka → pilih WhatsApp → confirm gambar terkirim

- [ ] **Step 4: Commit**

```bash
git add src/components/ShareKursModal.tsx
git commit -m "feat(kurs-share): wire native share + copy caption actions"
```

---

## Task 7: Polish — loading state, font readiness, empty-SAR guard

**Files:**
- Modify: `src/components/ShareKursModal.tsx`, `src/components/DashboardLayout.tsx`

- [ ] **Step 1: Preload fonts saat modal buka**

Problem: `document.fonts.ready` menunggu font **yang sudah diminta** selesai load. Kalau user baru pertama kali buka modal dan font T2/T4 belum pernah dipakai, browser mungkin baru mulai fetch saat template mount. Solusi: dalam `ShareKursModal` tambahkan efek yang request font via CSS `font-family` di hidden element ketika modal open.

Di `ShareKursModal.tsx`, setelah `useEffect` yang ada untuk track event, tambahkan:

```tsx
  useEffect(() => {
    if (!open) return;
    // Prime font loading untuk semua template
    const fonts = ['DM Serif Display', 'Amiri'];
    fonts.forEach(f => {
      try { (document as any).fonts?.load?.(`16px "${f}"`); } catch {}
    });
  }, [open]);
```

- [ ] **Step 2: Guard kurs.sar null di DashboardLayout**

Edit di DashboardLayout tempat render `<ShareKursModal />`. Kalau `kursData.sar` null, modal tetap boleh buka tapi template akan tampilkan angka 0 yang misleading. Lebih bersih: hide tombol Share kalau SAR tidak ada.

Cari blok tombol Share yang ditambah di Task 4, ganti dengan versi conditional:

```tsx
                <div className="flex items-center gap-1.5">
                  {kursData.sar != null && (
                    <button
                      onClick={() => setShowShareKurs(true)}
                      aria-label="Bagikan kurs"
                      className="w-7 h-7 rounded-lg border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors active:scale-95"
                    >
                      <Share2 size={12} strokeWidth={2.5} />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      window.history.pushState({}, '', '/dashboard/ai-tools/kurs');
                      document.title = 'Kurs Hari Ini';
                      setActiveTab('home');
                      setTimeout(() => setActiveTab('ai-tools'), 0);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors active:scale-95"
                  >
                    Hitung Kurs
                    <ChevronRight size={10} strokeWidth={2.5} />
                  </button>
                </div>
```

Juga update modal props untuk pakai nullable-safe pass:

```tsx
              kurs={{ usd: kursData.usd!, sar: kursData.sar!, updatedAt: kursData.updatedAt }}
```

(SAR sudah dijamin non-null karena tombol hidden kalau null.)

- [ ] **Step 3: Close modal on ESC key (desktop UX)**

Di `ShareKursModal`, setelah `useEffect` prime font, tambahkan:

```tsx
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
```

- [ ] **Step 4: Prevent body scroll saat modal open**

Di `ShareKursModal`, tambahkan effect:

```tsx
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);
```

- [ ] **Step 5: Verifikasi**

Buka modal:
- ESC menutup modal ✓
- Body tidak bisa scroll di belakang modal ✓
- First open: tidak ada flash dari fallback font ke DM Serif/Amiri (font sudah preloaded) ✓

- [ ] **Step 6: Commit**

```bash
git add src/components/ShareKursModal.tsx src/components/DashboardLayout.tsx
git commit -m "feat(kurs-share): polish — font preload, ESC close, body lock, SAR guard"
```

---

## Task 8: Final QA checklist & lint

**Files:**
- None (verification only)

- [ ] **Step 1: Jalankan lint**

Run: `npm run lint`
Expected: no new errors/warnings di file yang dibuat/diubah.

Kalau ada error: fix, commit sebagai `chore(kurs-share): fix lint`.

- [ ] **Step 2: Build production**

Run: `npm run build`
Expected: build sukses. Verifikasi bundle size output — `ShareKursModal` harus di chunk terpisah (lazy-loaded), bukan di chunk utama dashboard.

- [ ] **Step 3: Manual QA — Golden path**

Di dev build (`npm run preview`):

1. Login sebagai agent non-admin dengan `phone`, `photo`, `slug` terisi
2. Dashboard → widget Kurs render dengan USD + SAR
3. Tap icon Share → modal slide up
4. Preview T1 Minimalist terlihat — foto agent bulat, nama + WA + website + logo Alhijaz
5. Pilih T2 → Arabic text tampil dengan font Amiri (bukan system sans)
6. Pilih T3 → layout vertikal, angka raksasa
7. Pilih T4 → gold frame + DM Serif Display untuk angka
8. Download T4 → PNG file tersimpan → buka → 2160×2160, layout identik dengan preview
9. Copy Caption → paste di WhatsApp Web → format benar, emoji utuh, WA link terformat `wa.me/62xxx`
10. (Mobile only) Bagikan → native share sheet → kirim ke kontak → receiver lihat gambar

- [ ] **Step 4: Manual QA — Edge cases**

1. Agent tanpa photo (`agent.photo === ''`) → fallback `ui-avatars.com` tampil di preview & export
2. Agent tanpa phone → `wa.me/` menampilkan string kosong (acceptable, tidak crash)
3. Desktop Chrome → tombol Bagikan hidden, Download full-width
4. Network offline saat export → snapdom tetap jalan (DOM-based, tidak butuh network) — confirm
5. Dark mode dashboard → modal chrome (border, background) dark-aware, preview template sendiri tidak berubah

- [ ] **Step 5: Commit final (kalau ada tweak)**

Kalau tidak ada perubahan: skip.

- [ ] **Step 6: Update docs/project-summary.md (opsional tapi recommended)**

Tambahkan 1 baris di bagian fitur dashboard menyebutkan "Share Kurs" / "Bagikan Kurs" dengan 4 template.

Kalau dilakukan:

```bash
git add docs/project-summary.md
git commit -m "docs: add Share Kurs feature to project summary"
```

---

## Self-Review Checklist (diisi oleh implementer setelah selesai)

- [ ] Semua 4 template render benar di preview dan export (2160×2160)
- [ ] Font DM Serif Display + Amiri terload dan terpakai (tidak fallback)
- [ ] Native share berfungsi di mobile, hidden di desktop
- [ ] Copy caption format benar, berhasil paste
- [ ] Tracking events terkirim (`open_share_kurs`, `download_share_kurs`, `share_kurs`, `copy_kurs_caption`) — cek `/api/analytics/event` di Network tab
- [ ] `npm run lint` bersih
- [ ] `npm run build` sukses, `ShareKursModal` di lazy chunk
- [ ] Widget dashboard tidak regresi (layout, dark mode, existing "Hitung Kurs" button)

---

## Rollback plan

Feature additive. Kalau butuh rollback:

```bash
git revert <commit-range-kurs-share>
```

Atau hide tombol saja (1-line change di DashboardLayout) tanpa revert full — modal tetap ada di bundle tapi tidak ter-trigger.

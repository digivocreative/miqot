# Share Kurs Feature — Design Spec

**Date:** 2026-04-24
**Status:** Draft (awaiting user review)
**Related widget:** Kurs Hari Ini ([DashboardLayout.tsx:760-817](../../../src/components/DashboardLayout.tsx#L760-L817))

## Goal

Beri agent cara cepat untuk share info kurs USD & SAR harian ke klien via WhatsApp/IG dalam bentuk gambar bermerek (ada foto agent, kontak, website, logo Alhijaz), plus caption teks siap paste.

## User scope decisions (locked in)

| Keputusan | Pilihan |
|---|---|
| Mata uang di gambar | USD + SAR saja (match widget) |
| Dimensi gambar | Square 1:1 (1080×1080, export 2x → 2160×2160) |
| Jumlah template | 4 (Minimalist, Islamic, Bold, Premium) |
| Aksi di popup | Download + Bagikan (native share) + Salin Caption |
| Struktur UI | Full-screen modal overlay (bukan route) |

## Arsitektur

### File baru

```
src/components/
├── ShareKursModal.tsx        # Container: state, picker, 3 tombol aksi, snapdom export
└── KursShareTemplates.tsx    # 4 template renderer (pure components)
```

### File diubah

- `src/components/DashboardLayout.tsx` — tambah state `showShareKurs`, tombol "Bagikan" icon-only di header widget kurs, render `<ShareKursModal />` conditional.

### Tidak diubah

- `server.js` `/api/kurs` — data sudah tersedia
- Agent data shape — `agentData` sudah punya `name, phone, photo, slug`

## Data flow

```
DashboardLayout
  ├─ kursData (existing) ──┐
  ├─ agentData (existing) ─┤
  └─ showShareKurs (new) ──┴─→ ShareKursModal
                                 ├─ selectedTemplate (local state)
                                 ├─ <KursShareTemplate id={selectedTemplate} kurs={...} agent={...} />
                                 ├─ handleDownload  → snapdom → PNG save
                                 ├─ handleShare     → snapdom → navigator.share
                                 └─ handleCopyCaption → navigator.clipboard.writeText
```

## Component interfaces

### `ShareKursModal`

```ts
interface ShareKursModalProps {
  open: boolean;
  onClose: () => void;
  kurs: { usd: number; sar: number; updatedAt: string };
  agent: { name: string; phone: string; photo: string; slug: string };
}
```

Lazy-load strategy: `ShareKursModal` di-import via `React.lazy` di DashboardLayout; `snapdom` di-import via dynamic `import()` di handler (bukan top-level) — match BusinessCardPage pattern.

### `KursShareTemplates`

Expose 4 named exports + map:

```ts
export interface KursTemplateProps {
  kurs: { usd: number; sar: number; updatedAt: string };
  agent: { name: string; phone: string; photo: string; slug: string };
}

export const KURS_TEMPLATES: Array<{
  id: 'minimalist' | 'islamic' | 'bold' | 'premium';
  name: string;
  Renderer: React.FC<KursTemplateProps>;
}>;
```

Setiap renderer render pada ukuran fix 1080×1080 (inline style `width: 1080, height: 1080`). Scaling untuk preview/thumbnail dilakukan di parent via `transform: scale()`.

## Template visual spec

Semua template wajib menampilkan:
1. Logo Alhijaz. Aset tersedia: `/logo-alhijaz-besar.svg` (default hitam) + `/logo-alhijaz.webp`. Untuk background gelap (T2/T3), render logo di dalam pill/badge putih rounded-xl (solusi paling robust — hindari CSS `filter: invert` yang tidak konsisten di snapdom export).
2. Label "KURS BANK MANDIRI"
3. Tanggal (dari `kurs.updatedAt`, format sudah "Jumat, 24 April 2026")
4. Rate USD (Rp formatted)
5. Rate SAR (Rp formatted)
6. Agent photo (foto bulat, fallback ui-avatars.com seperti pattern existing)
7. Agent name
8. Agent WA (format: `wa.me/{phone}` atau `+{phone}`)
9. Agent website (`{slug}.alhijaz.co`)

Catatan ukuran: semua ukuran font di bawah dalam **px** (bukan pt), karena template render di canvas 1080×1080 dengan CSS pixel sizing.

### T1 — Minimalist
- **Background:** Putih `#FFFFFF`
- **Header (padding 64px):** Logo Alhijaz kiri atas (tinggi 56px), label "KURS BANK MANDIRI" uppercase tracking-widest text-emerald-600 18px, tanggal gray-500 16px
- **Body:** 2 card horizontal (USD kiri, SAR kanan), background `#F9FAFB` rounded-2xl, padding 40px, flag emoji 80px + label "USD"/"SAR" 24px gray-500 + angka 96px bold gray-900 (font-mono untuk angka rapi)
- **Footer (padding 48px, border-top 2px emerald-500):** Foto bulat 96px kiri + kolom kanan (nama 24px bold, WA 18px gray-600, website 18px emerald-600)
- **Logo:** SVG hitam langsung

### T2 — Islamic
- **Background:** Gradient `linear-gradient(135deg, #047857, #022C22)`, overlay SVG Arabic geometric pattern (inline SVG data URL, opacity 0.08, repeating)
- **Header:** Kaligrafi "بسم الله الرحمن الرحيم" (font `Amiri` atau system Arabic) atas tengah text-emerald-200 32px, "KURS HARI INI" text-white 20px uppercase tracking-widest, tanggal text-emerald-200 16px
- **Body:** 2 card glassmorphism `bg-white/10` `backdrop-blur-sm` `border border-white/20` rounded-2xl, padding 40px, angka text-white 96px bold
- **Footer:** Transparent, foto border-2 border-emerald-300 96px, nama + kontak text-white
- **Logo:** Dalam pill putih rounded-xl padding 12px, tinggi pill 56px, kanan atas

### T3 — Bold
- **Background:** Navy `#0F172A`
- **Header:** Logo Alhijaz (dalam pill putih rounded-xl, tinggi pill 48px) kanan atas kecil, "KURS BANK MANDIRI" uppercase 20px tracking-widest text-emerald-400, tanggal text-slate-500 14px
- **Body:** Stacked vertical, setiap rate punya blok besar: label "USD"/"SAR" 20px slate-400, angka raksasa 128px bold text-white font-mono leading-none, separator horizontal slate-700
- **Footer:** Border-top 1px emerald-500, foto 88px + nama 22px bold white + kontak 16px slate-400
- **Aksen:** Optional dot pattern SVG opacity 0.04 di background

### T4 — Premium
- **Background:** Cream `#FDF8F0`
- **Frame:** Border inset 4px gold `#C9A961` dengan margin 32px dari edge (seperti ticket/sertifikat)
- **Header:** Logo Alhijaz center atas (tinggi 64px), "KURS BANK MANDIRI" serif display (DM Serif Display) gold 24px tracking-wide, divider horizontal gold 1px, tanggal italic slate-700 16px
- **Body:** 2 card tanpa background, hanya divider gold vertikal di tengah. Angka serif 112px text-slate-900, label "USD"/"SAR" serif italic 24px gold
- **Footer:** Foto lingkaran 96px dengan ring-2 ring-gold, nama serif 24px slate-900, kontak sans-serif 16px slate-600
- **Ornament:** Corner ornament SVG gold tipis di 4 sudut dalam frame (optional, skip kalau cost waktu besar)

## UI layout modal

Mobile-first, full viewport (`fixed inset-0 z-50`). Dark overlay `bg-black/60 backdrop-blur`. Card modal putih/dark-slate rounded-t-3xl slides up dari bawah (animation 200ms).

```
┌───────────────────────────────┐
│ ✕   Bagikan Kurs              │  56px header, border-b
├───────────────────────────────┤
│                               │
│    ┌───────────────────┐      │
│    │                   │      │
│    │   Preview 1:1     │      │  max-width 360px, rendered via
│    │   selected tpl    │      │  transform: scale(360/1080)
│    │                   │      │
│    └───────────────────┘      │
│                               │
│   Pilih Desain                │  text-xs uppercase
│   ┌──┐┌──┐┌──┐┌──┐            │  horizontal scroll
│   │T1││T2││T3││T4│            │  thumbnail 72×72, border-2
│   └──┘└──┘└──┘└──┘            │  active = border-emerald-500
│                               │
│   ┌──────────┐┌──────────┐    │
│   │ Download ││ Bagikan  │    │  2 kolom 50/50, primary emerald
│   └──────────┘└──────────┘    │
│   ┌──────────────────────┐    │
│   │  📋 Salin Caption    │    │  secondary full-width
│   └──────────────────────┘    │
└───────────────────────────────┘
```

## Widget header button placement

Current header di [DashboardLayout.tsx:764-788](../../../src/components/DashboardLayout.tsx#L764-L788):

```
[Icon] Kurs Hari Ini              [Hitung Kurs >]
       Bank Mandiri • {date}
```

New:

```
[Icon] Kurs Hari Ini          [🔗] [Hitung Kurs >]
       Bank Mandiri • {date}
```

Share button:
- Icon `Share2` dari lucide-react
- Ukuran button: `w-7 h-7` (28px) match icon header
- Style: `rounded-lg border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 active:scale-95`
- Gap terhadap "Hitung Kurs": `gap-1.5`
- Click: `setShowShareKurs(true)`

## Caption template

```
📊 Update Kurs Bank Mandiri — {kurs.updatedAt}

💵 USD: Rp {formatKurs(usd)}
🇸🇦 SAR: Rp {formatKurs(sar)}

Info paket Umroh & Haji:
{agent.name}
wa.me/{normalizePhone(agent.phone)}
{agent.slug}.alhijaz.co
```

`normalizePhone`: hilangkan `+`, spasi, dash; kalau mulai dengan `0` ganti `62`.

## Export technical

```ts
const { snapdom } = await import('@zumer/snapdom');
const result = await snapdom(templateRef.current, { scale: 2 });

// Download
await result.download({
  type: 'png',
  filename: `kurs-${templateId}-${yyyymmdd}.png`,
});

// Share
const blob = await result.toBlob({ type: 'png' });
const file = new File([blob], `kurs-${templateId}.png`, { type: 'image/png' });
if (navigator.share && navigator.canShare?.({ files: [file] })) {
  await navigator.share({ files: [file] });
}
```

`scale: 2` menghasilkan 2160×2160 PNG (high-res untuk IG feed tanpa compression artifact).

`navigator.share` fallback: kalau tidak tersedia, tombol Bagikan disembunyikan (bukan disabled — cleaner), tombol Download jadi full-width.

## Tracking events

Tambahkan di handler (reuse `trackEvent` existing):

| Event | Trigger |
|---|---|
| `trackEvent('feature', 'open_share_kurs')` | Modal dibuka |
| `trackEvent('action', 'download_share_kurs', { template })` | Download sukses |
| `trackEvent('action', 'share_kurs', { template })` | Native share sukses |
| `trackEvent('action', 'copy_kurs_caption')` | Copy caption sukses |

## Error handling

| Error | Behavior |
|---|---|
| `snapdom` throw | Toast inline di modal: "Gagal generate gambar, coba lagi" + console.error |
| `navigator.share` AbortError | Silent (user cancel, expected) |
| `navigator.share` lain | Toast: "Share gagal, gambar sudah disimpan" — fallback auto-download |
| Clipboard `writeText` reject | Fallback: select text dari hidden textarea + `document.execCommand('copy')` |
| Agent photo gagal load | `onError` → `ui-avatars.com` URL (pattern existing di DashboardLayout.tsx:710) |

## Testing plan

Manual test di dev server:
1. Widget render dengan kursData → tombol Bagikan icon-only muncul
2. Click Bagikan → modal slide up, preview T1 muncul, nama+WA+website+logo agent tampil benar
3. Tap thumbnail T2/T3/T4 → preview update, border aktif pindah
4. Download T1 → file PNG 2160×2160 tersimpan, buka verifikasi layout
5. Share di iOS Safari → native share sheet muncul dengan file gambar
6. Copy Caption → paste di notes, verifikasi format + angka + WA formatted
7. Close modal via X → state reset, widget kembali normal
8. Dark mode: modal + preview tetap readable (template sendiri tidak berubah karena export ke gambar)
9. Agent tanpa foto → fallback ui-avatars.com di preview dan export
10. Test di Chrome desktop → `navigator.share` absent → tombol Bagikan hidden, Download full-width

## Non-goals (YAGNI)

- Edit template/custom warna/custom logo
- Save preferred template per agent
- Multi-size export (stories 9:16)
- QR code di template
- Cache generated PNG di browser
- Template baru via admin panel

## Font loading requirement

Project saat ini hanya load Inter. Template butuh tambahan:
- **DM Serif Display** — untuk T4 Premium (headings, angka) dan T2 Islamic (kaligrafi fallback kalau tidak ada sistem Arabic)
- **Amiri** — untuk T2 Islamic kaligrafi "بسم الله" (Google Font, support Arabic)

Tambahkan ke [index.html](../../../index.html) line 63 di bawah Inter:
```html
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Amiri:wght@400;700&display=swap" rel="stylesheet">
```

Sebelum `snapdom()` dipanggil, tunggu `document.fonts.ready` untuk jamin font sudah loaded.

## Open risk

1. **Font loading di snapdom** — sudah dimitigasi via `document.fonts.ready` di atas. Kalau masih gagal (CORS dari Google Fonts misal), fallback ke system-ui fonts.
2. **Agent `slug` kosong** — fallback ke `"agent"` match BusinessCardPage, tapi website jadi `"agent.alhijaz.co"` — acceptable karena edge case jarang.
3. **Phone format inconsistency** — ada yang simpan `+62`, `0812`, `62812`. `normalizePhone` harus handle semua 3 kasus.

## Migration / rollout

Feature flag tidak perlu — additive feature, tidak mengubah behavior existing.

Deploy: merge to main → auto-deploy (existing flow).

# Simulasi Haji Plus — PDF Preview Modal

## Context

Tab Simulasi di Haji Plus sudah memiliki inline HTML preview dan download PDF sederhana. User ingin pengalaman yang sama persis seperti fitur Kalkulasi: full-screen modal slide-up dengan preview PDF asli (react-pdf) dan native share.

## Scope

**File yang diubah:** `src/components/SimulasiHajiPlus.tsx`

**File yang TIDAK diubah:** `SimulasiHajiPlusDocument.tsx`, `HajiPlusPage.tsx`, `server.js`

## Design

### Flow

```
User klik "Lihat & Download PDF"
  -> Full-screen modal slide-up (createPortal + framer-motion)
  -> PDF di-generate via @react-pdf/renderer -> blob
  -> Loading: spinner + "Membuat PDF..."
  -> Preview: react-pdf PdfDoc + PdfPage (responsive width)
  -> Footer: Back (kiri) + "Bagikan PDF" (kanan)
  -> Bagikan: Web Share API -> fallback direct download
  -> Close: tombol back atau swipe
```

### State Changes

Hapus:
- `showPDF` state
- Inline HTML preview section (Section F)

Tambah:
- `pdfModalOpen: boolean` — toggle modal
- `pdfPreviewUrl: string | null` — object URL dari blob
- `pdfLoading: boolean` — loading saat generate
- `pdfSharing: boolean` — loading saat share
- `pdfNumPages: number | null` — jumlah halaman
- `pdfBlobRef: Ref<Blob>` — blob reference untuk share/download

### Modal Component (inline, bukan file terpisah)

Pattern diambil dari `KalkulasiPage.tsx` ResultModal (line 505-714):

```
createPortal(
  <AnimatePresence>
    {pdfModalOpen && (
      <motion.div
        className="fixed inset-0 z-[9999] bg-white dark:bg-slate-900 flex flex-col"
        initial={{ opacity: 0, y: '100%' }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      >
        // Header: "Simulasi Haji Plus" + close button
        // Body: PDF preview (scrollable, bg-gray-100)
        // Footer: back + share button
      </motion.div>
    )}
  </AnimatePresence>,
  document.body
)
```

### Header
- Sticky, `bg-white dark:bg-slate-900 border-b`
- Kiri: back button `w-9 h-9 rounded-xl` dengan ChevronLeft icon
- Tengah: "Simulasi Haji Plus" `text-sm font-bold`

### Body (PDF Preview)
- `flex-1 overflow-y-auto bg-gray-100 dark:bg-slate-950 px-4 py-6`
- Loading: centered spinner + "Membuat PDF..." text
- Success: `<PdfDoc file={pdfPreviewUrl}>` + `<PdfPage>` per halaman
- Error: "Gagal membuat PDF" message
- PDF width responsive via ResizeObserver pada container

### Footer
- Sticky, `bg-white dark:bg-slate-900 border-t px-4 py-3`
- Kiri: tombol back icon
- Kanan: tombol "Bagikan PDF" (emerald/blue sesuai paket, full CTA style)
- Share loading state: spinner + "Mengirim..."

### PDF Generation (on modal open)

```typescript
const handleOpenPdfModal = async () => {
  setPdfModalOpen(true);
  setPdfLoading(true);
  try {
    const blob = await pdf(<SimulasiHajiPlusDocument ... />).toBlob();
    pdfBlobRef.current = blob;
    setPdfPreviewUrl(URL.createObjectURL(blob));
  } catch { /* error state */ }
  finally { setPdfLoading(false); }
};
```

### Share Handler (same pattern as KalkulasiPage line 481-501)

```typescript
const handleSharePdf = async () => {
  if (!pdfBlobRef.current) return;
  setPdfSharing(true);
  const fileName = `Simulasi_Haji_Plus_${namaJamaah || 'Alhijaz'}.pdf`;
  const file = new File([pdfBlobRef.current], fileName, { type: 'application/pdf' });
  const shareData = { title: 'Simulasi Haji Plus', text: 'Simulasi biaya haji plus', files: [file] };
  
  if (navigator.canShare?.(shareData)) {
    try { await navigator.share(shareData); }
    catch (err) { if (err.name !== 'AbortError') directDownload(fileName); }
  } else {
    directDownload(fileName);
  }
  setPdfSharing(false);
};
```

### Cleanup
- `URL.revokeObjectURL(pdfPreviewUrl)` saat modal close
- Body scroll lock: `document.body.style.overflow = 'hidden'` saat modal buka

### CTA Button Changes

Sebelum (Section E4):
- "Lihat & Download PDF" → toggle inline preview
- "Bagikan via WhatsApp" → buka wa.me

Sesudah:
- "Lihat & Download PDF" → buka modal (`handleOpenPdfModal`)
- "Bagikan via WhatsApp" → tetap sama, tidak berubah

## Dependencies

- `react-pdf` (sudah installed: `^10.3.0`)
- `framer-motion` (sudah installed)
- `@react-pdf/renderer` (sudah installed: `^4.3.2`)

## Verification

1. Klik "Lihat & Download PDF" → modal slide-up muncul
2. Loading spinner tampil → PDF preview muncul
3. PDF bisa di-scroll jika multi-page
4. "Bagikan PDF" → native share sheet di mobile, download di desktop
5. Back button → modal close dengan animasi slide-down
6. Dark mode berfungsi di modal
